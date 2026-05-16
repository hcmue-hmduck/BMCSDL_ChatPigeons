import { Injectable, signal, inject, computed, effect, OnDestroy } from '@angular/core';
import { Conversation } from './conversation';
import { UserBlock } from './userBlock';
import { SocketService } from './socket';
import { AuthService } from './authService';
import { E2EEMessageService } from './e2ee/e2eeMessageService';
import { KeyManagementService } from './e2ee/keyManagementService';

export interface UserPresence {
    status: string;
    last_online_at: string | Date;
}

@Injectable({
    providedIn: 'root',
})
export class ActiveConversationService implements OnDestroy {
    private conversationService = inject(Conversation);
    private userBlockService = inject(UserBlock);
    private socketService = inject(SocketService);
    private authService = inject(AuthService);
    private e2eeMessageService = inject(E2EEMessageService);
    private keyManagementService = inject(KeyManagementService);

    // --- Core State (Signals) ---
    conversations = signal<any>({});
    onlineUsers = signal<Set<string>>(new Set());
    userPresence = signal<Map<string, UserPresence>>(new Map());
    userBlock = signal<any[]>([]);
    friendRequestCount = signal(0);
    isDataLoaded = signal(false);
    activeConversationId = signal<string | null>(null);
    showConversationInfor = signal(false);

    toggleConversationInfor(force?: boolean) {
        if (force !== undefined) {
            this.showConversationInfor.set(force);
        } else {
            this.showConversationInfor.update((v) => !v);
        }
    }

    timeTick = signal(0);
    private globalInterval: any;

    // --- Reaction Cache (Global) ---
    globalReactions = signal<Map<string, any[]>>(new Map());
    globalReactionCounts = signal<Map<string, Record<string, number>>>(new Map());

    // Socket Event Callbacks
    private onUpdateProfileSocket?: (data: any) => void;
    private onUpdateConversationSocket?: (data: any) => void;
    private onUpdateConversationInfoSocket?: (data: any) => void;
    private onNewConversationSocket?: (data: any) => void;
    private onUserStatusChangedSocket?: (data: any) => void;
    private onOnlineUsersListSocket?: (userIds: string[]) => void;
    private onFriendRequestSocket?: (data: any) => void;
    private onAcceptFriendRequestSocketGlobal?: (data: any) => void;
    private onReactionMessageSocket?: (data: any) => void;
    private onAddMemberSocket?: (data: any) => void;

    joinedConversations = computed(
        () => this.conversations()?.homeConversationData?.joinedConversations || [],
    );

    currentUserInfo = computed(() => this.conversations()?.homeConversationData?.userInfo);

    currentUserAvatar = computed(
        () => this.currentUserInfo()?.avatar_url || 'assets/AvatarDefault.jpg',
    );

    totalUnreadCount = computed(() => {
        const joined = this.joinedConversations();
        return joined.reduce((acc: number, conv: any) => acc + (Number(conv.unread_count) || 0), 0);
    });


    private async decryptSidebarLastMessages(joined: any[]) {
        return await Promise.all(
            joined.map(async (conv: any) => {
                if (
                    conv.lastMessage &&
                    conv.lastMessage.is_e2ee &&
                    conv.lastMessage.content &&
                    !conv.lastMessage.is_deleted &&
                    !conv.lastMessage.is_decrypted
                ) {
                    try {
                        const e2eePayload = {
                            ciphertext: conv.lastMessage.content,
                            iv: conv.lastMessage.iv,
                            keyVersion: conv.lastMessage.key_version,
                        };
                        const decrypted = await this.e2eeMessageService.decryptMessage(
                            conv.conversation_id,
                            e2eePayload,
                        );
                        return {
                            ...conv,
                            lastMessage: {
                                ...conv.lastMessage,
                                content: decrypted.content,
                                is_decrypted: true,
                            },
                        };
                    } catch (e) {
                        try {
                            await this.keyManagementService.syncLatestConversationKey(
                                conv.conversation_id,
                            );
                            const e2eePayload = {
                                ciphertext: conv.lastMessage.content,
                                iv: conv.lastMessage.iv,
                                keyVersion: conv.lastMessage.key_version,
                            };
                            const decrypted = await this.e2eeMessageService.decryptMessage(
                                conv.conversation_id,
                                e2eePayload,
                            );
                            return {
                                ...conv,
                                lastMessage: {
                                    ...conv.lastMessage,
                                    content: decrypted.content,
                                    is_decrypted: true,
                                },
                            };
                        } catch (retryError) {
                            console.error('Sidebar initial decryption failed', retryError);
                            return {
                                ...conv,
                                lastMessage: {
                                    ...conv.lastMessage,
                                    content: '[Tin nhắn mã hóa]',
                                    is_decryption_error: true,
                                },
                            };
                        }
                    }
                }
                return conv;
            }),
        );
    }

    constructor() {
        // Self-initialization: load data when user logs in or refreshes
        effect(() => {
            const userId = this.authService.getUserId();
            if (userId) {
                console.log(
                    '[ActiveConversationService] User detected, initializing global state...',
                );
                this.loadInitialData(userId);
            }
        });

        // Start global time tick every 30 seconds
        this.globalInterval = setInterval(() => {
            this.timeTick.update((v) => v + 1);
        }, 30000);
    }

    ngOnDestroy() {
        if (this.globalInterval) {
            clearInterval(this.globalInterval);
        }
        this.removeSocketListeners();
    }

    setActiveConversationId(id: string | null) {
        this.activeConversationId.set(id);
        // Reset unread count locally when entering a conversation
        if (id) {
            this.resetUnreadCount(id);
        }
    }

    private resetUnreadCount(conversationId: string) {
        this.conversations.update((cur) => {
            if (!cur?.homeConversationData?.joinedConversations) return cur;
            const updated = cur.homeConversationData.joinedConversations.map((c: any) =>
                String(c.conversation_id) === String(conversationId)
                    ? { ...c, unread_count: 0 }
                    : c,
            );
            return {
                ...cur,
                homeConversationData: { ...cur.homeConversationData, joinedConversations: updated },
            };
        });
    }

    // --- Actions ---

    loadInitialData(userId: string) {
        if (!userId) return;

        // Tránh load lại nếu đã có dữ liệu (Optimization)
        if (this.isDataLoaded()) {
            console.log('[ActiveConversationService] Data already loaded, skipping API call.');
            // Vẫn emit userOnline để báo hiệu presence khi load lại app (refresh)
            this.socketService.emit('userOnline', userId);
            return;
        }

        console.log('[ActiveConversationService] Loading initial data for:', userId);

        // Load Conversations
        this.conversationService.getConversations(userId).subscribe({
            next: async (response) => {
                const metadata = response.metadata || {};
                let joined = metadata.homeConversationData?.joinedConversations || [];

                // --- GIẢI MÃ TIN NHẮN CUỐI CÙNG TRÊN SIDEBAR ---
                joined = await this.decryptSidebarLastMessages(joined);

                // Sort
                const sorted = [...joined].sort((a: any, b: any) => {
                    if (a.is_pinned && !b.is_pinned) return -1;
                    if (!a.is_pinned && b.is_pinned) return 1;
                    const timeA = new Date(
                        a.lastMessage?.created_at || a.updated_at || 0,
                    ).getTime();
                    const timeB = new Date(
                        b.lastMessage?.created_at || b.updated_at || 0,
                    ).getTime();
                    return timeB - timeA;
                });

                // --- NEW: Initialize presence map from DB data ---
                const initialPresence = new Map<string, UserPresence>();
                joined.forEach((conv: any) => {
                    conv.participants?.forEach((p: any) => {
                        if (String(p.user_id) !== String(userId)) {
                            initialPresence.set(String(p.user_id), {
                                status: p.status || 'offline',
                                last_online_at: p.last_online_at,
                            });
                        }
                    });
                });
                this.userPresence.set(initialPresence);

                this.conversations.set({
                    ...metadata,
                    homeConversationData: {
                        ...metadata.homeConversationData,
                        joinedConversations: sorted,
                    },
                });

                this.isDataLoaded.set(true);

                // --- Emit userOnline immediately ---
                this.socketService.emit('userOnline', userId);

                // Join socket rooms
                sorted.forEach((conv: any) =>
                    this.socketService.emit('joinConversation', conv.conversation_id),
                );

                this.setupSocketListeners();
            },
        });

        this.userBlockService.getBlockedUserByUserId(userId).subscribe({
            next: (response) => {
                this.userBlock.set(response.metadata?.userBlocks || []);
            },
        });

        // --- NEW: Reconnection support ---
        this.socketService.on('connect', () => {
            const currentUid = this.authService.getUserId();
            if (currentUid) {
                console.log(
                    '[ActiveConversationService] Socket reconnected, re-emitting userOnline',
                );
                this.socketService.emit('userOnline', currentUid);
            }
        });
    }

    setupSocketListeners() {
        // Clean up previous listeners if any
        this.removeSocketListeners();

        this.onUpdateProfileSocket = (data: any) => {
            this.conversations.update((cur) => {
                if (!cur?.homeConversationData?.joinedConversations) return cur;

                // Update userInfo if it is the current user
                let updatedUserInfo = cur.homeConversationData.userInfo;
                if (updatedUserInfo && updatedUserInfo.id === data.id) {
                    updatedUserInfo = { ...updatedUserInfo, ...data };
                }

                const currentUserId = this.authService.getUserId();

                const updated = cur.homeConversationData.joinedConversations.map((conv: any) => {
                    let newTitle = conv.title;
                    let newAvatarUrl = conv.avatar_url;

                    // Nếu là chat đơn, và người đổi thông tin KHÔNG phải là mình (tức là đối tác)
                    if (conv.type === 'direct' && String(data.id) !== String(currentUserId)) {
                        const hasOtherUser = conv.participants?.some(
                            (p: any) => String(p.user_id) === String(data.id),
                        );
                        if (hasOtherUser) {
                            newTitle = data.full_name || conv.title;
                            newAvatarUrl =
                                data.avatar_url || conv.avatar_url || 'assets/AvatarDefault.jpg';
                        }
                    }

                    // Cập nhật participants cho TẤT CẢ loại nhóm chat thay vì chỉ nhóm 'direct'
                    let newParticipants = conv.participants;
                    if (conv.participants) {
                        newParticipants = conv.participants.map((p: any) =>
                            String(p.user_id) === String(data.id) ? { ...p, ...data } : p,
                        );
                    }

                    return {
                        ...conv,
                        participants: newParticipants,
                        title: newTitle,
                        avatar_url: newAvatarUrl,
                    };
                });
                return {
                    ...cur,
                    homeConversationData: {
                        ...cur.homeConversationData,
                        userInfo: updatedUserInfo,
                        joinedConversations: updated,
                    },
                };
            });
        };
        this.socketService.on('updateProfile', this.onUpdateProfileSocket);

        // 2. updateConversation
        this.onUpdateConversationSocket = async (data: any) => {
            await this.updateConversationList(data);
        };
        this.socketService.on('updateConversation', this.onUpdateConversationSocket);

        // 2.5 updateConversationInfo
        this.onUpdateConversationInfoSocket = (data: any) => {
            this.conversations.update(cur => {
                if (!cur?.homeConversationData?.joinedConversations) return cur;
                const convList = [...cur.homeConversationData.joinedConversations];
                const index = convList.findIndex((c: any) => String(c.conversation_id) === String(data.conversation_id));
                if (index !== -1) {
                    const conv = { ...convList[index] };
                    if (data.title !== undefined) {
                        conv.title = data.title;
                    }
                    if (data.avatar_url !== undefined) {
                        conv.avatar_url = data.avatar_url;
                    }
                    if (data.allow_member_chat !== undefined) {
                        conv.allow_member_chat = data.allow_member_chat;
                    }
                    convList[index] = conv;
                    return {
                        ...cur,
                        homeConversationData: { ...cur.homeConversationData, joinedConversations: convList }
                    };
                }
                return cur;
            });
        };
        this.socketService.on('updateConversationInfo', this.onUpdateConversationInfoSocket);

        // updateParticipant
        this.socketService.on('updateParticipant', (data: any) => {
            if (data.nick_name !== undefined) {
                this.updateParticipantNickname(data.conversation_id, data.user_id, data.nick_name);
            }
        });

        // blockUser & unblockUser
        this.socketService.on('blockUser', (data: any) => {
            this.userBlock.update(list => [...list, data]);
        });

        this.socketService.on('unblockUser', (data: any) => {
            this.userBlock.update(list => list.filter(b =>
                !(String(b.blocked_id) === String(data.blocked_id) && String(b.blocker_id) === String(data.blocker_id))
            ));
        });
        this.onNewConversationSocket = (data: any) => {
            const userId = this.authService.getUserId();
            if (!userId) return;
            this.conversationService.getConversations(userId).subscribe({
                next: async (response) => {
                    const metadata = response.metadata || {};
                    let joined = metadata.homeConversationData?.joinedConversations || [];
                    this.socketService.emit('joinConversation', data.conversation_id);
                    joined = await this.decryptSidebarLastMessages(joined);
                    const sorted = [...joined].sort((a: any, b: any) => {
                        if (a.is_pinned && !b.is_pinned) return -1;
                        if (!a.is_pinned && b.is_pinned) return 1;
                        const timeA = new Date(
                            a.lastMessage?.created_at || a.updated_at || 0,
                        ).getTime();
                        const timeB = new Date(
                            b.lastMessage?.created_at || b.updated_at || 0,
                        ).getTime();
                        return timeB - timeA;
                    });
                    this.conversations.set({
                        ...metadata,
                        homeConversationData: {
                            ...metadata.homeConversationData,
                            joinedConversations: sorted,
                        },
                    });
                },
            });
        };
        this.socketService.on('newConversation', this.onNewConversationSocket);

        // 4. onlineUsersList (Sync both logic and UI presence)
        this.onOnlineUsersListSocket = (userIds: string[]) => {
            console.log('[ActiveConversationService] onlineUsersList received:', userIds);
            const onlineSet = new Set(userIds);
            this.onlineUsers.set(onlineSet);

            // Update userPresence map
            this.userPresence.update((map) => {
                const newMap = new Map(map);
                userIds.forEach((uid) => {
                    const existing = newMap.get(String(uid));
                    newMap.set(String(uid), {
                        status: 'online',
                        last_online_at: existing?.last_online_at || new Date(),
                    });
                });
                return newMap;
            });
        };
        this.socketService.on('onlineUsersList', this.onOnlineUsersListSocket);

        // 5. userStatusChanged (Sync both logic and UI presence)
        this.onUserStatusChangedSocket = (data: {
            userId: string;
            status: string;
            last_online_at?: string | Date;
        }) => {
            const uid = String(data.userId);
            this.onlineUsers.update((set) => {
                const newSet = new Set(set);
                if (data.status === 'online') newSet.add(uid);
                else newSet.delete(uid);
                return newSet;
            });

            this.userPresence.update((map) => {
                const newMap = new Map(map);
                newMap.set(uid, {
                    status: data.status,
                    last_online_at:
                        data.last_online_at ||
                        (data.status === 'offline'
                            ? new Date()
                            : newMap.get(uid)?.last_online_at || new Date()),
                });
                return newMap;
            });
        };
        this.socketService.on('userStatusChanged', this.onUserStatusChangedSocket);

        // 6. friendRequest (Global notification)
        this.onFriendRequestSocket = (data: any) => {
            const currentUserId = this.authService.getUserId();
            if (data && data.receiver_id === currentUserId) {
                this.friendRequestCount.update((c) => c + 1);
            }
        };
        this.socketService.on('sendFriendRequest', this.onFriendRequestSocket);

        // 7. reactionMessage
        this.onReactionMessageSocket = (data: any) => {
            console.log('[ActiveConversationService] reactionMessage received:', data);
            this.syncReactions(data.message_id, data.reactions, data.counts);
        };
        this.socketService.on('reactionMessage', this.onReactionMessageSocket);

        // Handle leaving or being kicked from a group in real-time
        this.socketService.on('leaveGroup', (data: any) => {
            const now = new Date().toISOString();
            this.updateConversationParticipantStatus(data.conversation_id, data.user_id, now);
        });

        this.socketService.on('kickMember', (data: any) => {
            const now = new Date().toISOString();
            this.updateConversationParticipantStatus(data.conversation_id, data.kicked_user_id, now);
        });

        // 8. addMember
        this.onAddMemberSocket = (data: any) => {
            console.log('[ActiveConversationService] addMember received:', data);
            const currentUserId = this.authService.getUserId();

            // Nếu mình là người được thêm vào
            if (data.added_user_ids && data.added_user_ids.includes(currentUserId)) {
                // Tham gia vào room socket
                this.socketService.emit('joinConversation', data.conversation_id);

                // Tải lại danh sách hội thoại để thấy nhóm mới
                this.conversationService.getConversations(currentUserId).subscribe({
                    next: async (response) => {
                        const metadata = response.metadata || {};
                        let joined = metadata.homeConversationData?.joinedConversations || [];
                        joined = await this.decryptSidebarLastMessages(joined);

                        this.conversations.set({
                            ...metadata,
                            homeConversationData: {
                                ...metadata.homeConversationData,
                                joinedConversations: joined,
                            },
                        });
                    }
                });
            } else {
                // Nếu mình đã ở trong nhóm, chỉ cập nhật danh sách participants nếu cần
                if (data.newParticipants) {
                    this.updateConversationParticipants(data.conversation_id, data.newParticipants);
                }
            }

            // PHÁT LẠI CÁC TIN NHẮN HỆ THỐNG CỤC BỘ CHO TẤT CẢ MỌI NGƯỜI (Admin, Người cũ, Người mới)
            // Việc này an toàn vì MessagesLayoutComponent đã có logic chống trùng tin nhắn (duplicate check)
            if (data.systemMessages && Array.isArray(data.systemMessages)) {
                data.systemMessages.forEach((msg: any) => {
                    if (String(msg.conversation_id) === String(data.conversation_id)) {
                        // 1. Để hiện trong khung chat (nếu đang mở)
                        this.socketService.emitLocal('newMessage', msg);
                        // 2. Để cập nhật dòng tin nhắn cuối trên sidebar
                        this.socketService.emitLocal('updateConversation', msg);
                    }
                });
            }
        };
        this.socketService.on('addMember', this.onAddMemberSocket);
    }

    updateConversationParticipantStatus(conversationId: string, userId: string, leftAt: string | null) {
        this.conversations.update((cur) => {
            if (!cur?.homeConversationData?.joinedConversations) return cur;
            const updated = cur.homeConversationData.joinedConversations.map((conv: any) => {
                if (String(conv.conversation_id) === String(conversationId)) {
                    const updatedParticipants = conv.participants.map((p: any) => {
                        if (String(p.user_id) === String(userId)) {
                            return { ...p, left_at: leftAt };
                        }
                        return p;
                    });
                    return { ...conv, participants: updatedParticipants };
                }
                return conv;
            });
            return {
                ...cur,
                homeConversationData: { ...cur.homeConversationData, joinedConversations: updated },
            };
        });
    }

    updateParticipantNickname(conversationId: string, userId: string, nickName: string) {
        this.conversations.update((cur) => {
            if (!cur?.homeConversationData?.joinedConversations) return cur;
            const updated = cur.homeConversationData.joinedConversations.map((conv: any) => {
                if (String(conv.conversation_id) === String(conversationId)) {
                    const updatedParticipants = conv.participants.map((p: any) => {
                        if (String(p.user_id) === String(userId)) {
                            return { ...p, nick_name: nickName };
                        }
                        return p;
                    });
                    return { ...conv, participants: updatedParticipants };
                }
                return conv;
            });
            return {
                ...cur,
                homeConversationData: { ...cur.homeConversationData, joinedConversations: updated },
            };
        });
    }

    updateConversationParticipants(conversationId: string, newParticipants: any[]) {
        this.conversations.update((cur) => {
            if (!cur?.homeConversationData?.joinedConversations) return cur;
            const updated = cur.homeConversationData.joinedConversations.map((conv: any) => {
                if (String(conv.conversation_id) === String(conversationId)) {
                    // Tránh duplicate nếu socket đã báo trước đó
                    const participants = conv.participants || [];
                    const existingIds = new Set(participants.map((p: any) => String(p.user_id)));
                    const filteredNew = newParticipants.filter(p => !existingIds.has(String(p.user_id)));

                    return {
                        ...conv,
                        participants: [...participants, ...filteredNew]
                    };
                }
                return conv;
            });
            return {
                ...cur,
                homeConversationData: { ...cur.homeConversationData, joinedConversations: updated },
            };
        });
    }

    syncReactions(msgId: string, reactions: any[], counts: any) {
        const key = String(msgId);
        this.globalReactions.update((map) => {
            const newMap = new Map(map);
            newMap.set(key, reactions);
            return newMap;
        });
        this.globalReactionCounts.update((map) => {
            const newMap = new Map(map);
            newMap.set(key, counts || {});
            return newMap;
        });
    }

    private removeSocketListeners() {
        if (this.onUpdateProfileSocket) this.socketService.off('updateProfile', this.onUpdateProfileSocket);
        if (this.onUpdateConversationSocket) this.socketService.off('updateConversation', this.onUpdateConversationSocket);
        if (this.onUpdateConversationInfoSocket) this.socketService.off('updateConversationInfo', this.onUpdateConversationInfoSocket);
        if (this.onNewConversationSocket) this.socketService.off('newConversation', this.onNewConversationSocket);
        if (this.onOnlineUsersListSocket) this.socketService.off('onlineUsersList', this.onOnlineUsersListSocket);
        if (this.onUserStatusChangedSocket) this.socketService.off('userStatusChanged', this.onUserStatusChangedSocket);
        if (this.onFriendRequestSocket) this.socketService.off('sendFriendRequest', this.onFriendRequestSocket);
        if (this.onReactionMessageSocket) this.socketService.off('reactionMessage', this.onReactionMessageSocket);
        this.socketService.off('leaveGroup');
        this.socketService.off('kickMember');
        this.socketService.off('updateParticipant');
        if (this.onAddMemberSocket) this.socketService.off('addMember', this.onAddMemberSocket);
    }

    async updateConversationList(data: any) {
        let displayContent = data.content;

        // --- GIẢI MÃ TIN NHẮN MỚI CHO SIDEBAR ---
        if (data.is_e2ee && data.content && !data.is_deleted && !data.is_decrypted) {
            try {
                const e2eePayload = {
                    ciphertext: data.content,
                    iv: data.iv,
                    keyVersion: data.key_version,
                };
                const decrypted = await this.e2eeMessageService.decryptMessage(
                    data.conversation_id,
                    e2eePayload,
                );
                displayContent = decrypted.content;
            } catch (e) {
                try {
                    await this.keyManagementService.syncLatestConversationKey(
                        data.conversation_id,
                    );
                    const e2eePayload = {
                        ciphertext: data.content,
                        iv: data.iv,
                        keyVersion: data.key_version,
                    };
                    const decrypted = await this.e2eeMessageService.decryptMessage(
                        data.conversation_id,
                        e2eePayload,
                    );
                    displayContent = decrypted.content;
                } catch (retryError) {
                    console.error('Sidebar real-time decryption failed', retryError);
                    displayContent = '[Tin nhắn mã hóa]';
                }
            }
        }

        this.conversations.update((cur) => {
            if (!cur?.homeConversationData?.joinedConversations) return cur;

            const convList = [...cur.homeConversationData.joinedConversations];
            const index = convList.findIndex(
                (c: any) => String(c.conversation_id) === String(data.conversation_id),
            );
            const currentUserId = this.authService.getUserId();

            if (index !== -1) {
                const conv = { ...convList[index] };
                const me = conv.participants?.find(
                    (p: any) => String(p.user_id) === String(currentUserId),
                );

                // Nếu đã rời nhóm, giữ nguyên preview hiện tại ở sidebar
                // (dừng tại message system cuối cùng đã nhận được trước/sát thời điểm rời nhóm).
                if (me?.left_at) {
                    return cur;
                }

                // --- Increment Unread Count (The missing logic!) ---
                // Only increment if:
                // 1. Message is NOT FROM current user
                // 2. Conversation is NOT CURRENTLY OPEN
                const isFromOther = String(data.sender_id) !== String(currentUserId);
                const isNotOpen =
                    String(data.conversation_id) !== String(this.activeConversationId());

                if (isFromOther && isNotOpen) {
                    conv.unread_count = (Number(conv.unread_count) || 0) + 1;
                }

                if (data.title !== undefined) {
                    conv.title = data.title;
                }
                if (data.avatar_url !== undefined) {
                    conv.avatar_url = data.avatar_url;
                }

                conv.lastMessage = {
                    ...(conv.lastMessage || {}),
                    sender_id: data.sender_id,
                    content: displayContent,
                    created_at: data.created_at,
                    updated_at: data.updated_at,
                    message_type: data.message_type,
                    id: data.id || data.message_id || conv.lastMessage?.id,
                    is_e2ee: data.is_e2ee,
                    iv: data.iv,
                    key_version: data.key_version,
                };

                const isMuted = me?.is_muted || false;

                if (!isMuted) {
                    // Move to top (within pinned/unpinned groups)
                    convList.splice(index, 1);
                    if (conv.is_pinned) {
                        convList.unshift(conv);
                    } else {
                        const firstUnpinnedIndex = convList.findIndex((c: any) => !c.is_pinned);
                        if (firstUnpinnedIndex === -1) convList.push(conv);
                        else convList.splice(firstUnpinnedIndex, 0, conv);
                    }
                } else {
                    // Nếu bị mute, giữ nguyên vị trí, chỉ cập nhật nội dung
                    convList[index] = conv;
                }

                return {
                    ...cur,
                    homeConversationData: {
                        ...cur.homeConversationData,
                        joinedConversations: convList,
                    },
                };
            }
            return cur;
        });
    }

    updateParticipantRoleInSignal(conversationId: string, userId: string, role: string) {
        this.conversations.update(cur => {
            if (!cur?.homeConversationData?.joinedConversations) return cur;
            const updated = cur.homeConversationData.joinedConversations.map((conv: any) => {
                if (String(conv.conversation_id) === String(conversationId)) {
                    const updatedParticipants = conv.participants?.map((p: any) => {
                        if (String(p.user_id) === String(userId)) {
                            return { ...p, owner: role, role: role };
                        }
                        return p;
                    });
                    return { ...conv, participants: updatedParticipants };
                }
                return conv;
            });
            return {
                ...cur,
                homeConversationData: { ...cur.homeConversationData, joinedConversations: updated }
            };
        });
    }

    // --- Helper Getters ---
    getConversationById(id: string) {
        return this.joinedConversations().find(
            (c: any) => String(c.conversation_id) === String(id),
        );
    }

    upgradeConversation(
        oldId: string,
        newId: string,
        realParticipants?: any[],
        lastMessageData?: any,
    ) {
        this.conversations.update((current) => {
            const joined = current.homeConversationData?.joinedConversations || [];
            const index = joined.findIndex((c: any) => String(c.conversation_id) === String(oldId));

            if (index !== -1) {
                const updatedJoined = [...joined];
                const upgradedConv = {
                    ...updatedJoined[index],
                    conversation_id: newId,
                    participants: realParticipants || updatedJoined[index].participants,
                    lastMessage: lastMessageData
                        ? {
                            sender_id: lastMessageData.sender_id,
                            content: lastMessageData.content,
                            created_at: lastMessageData.created_at,
                            message_type: lastMessageData.message_type,
                            id: lastMessageData.id,
                        }
                        : updatedJoined[index].lastMessage,
                };

                // Xóa cũ, thêm mới vào vị trí ưu tiên (đầu danh sách hoặc sau pinned)
                updatedJoined.splice(index, 1);

                if (upgradedConv.is_pinned) {
                    updatedJoined.unshift(upgradedConv);
                } else {
                    const firstUnpinnedIndex = updatedJoined.findIndex((c: any) => !c.is_pinned);
                    if (firstUnpinnedIndex === -1) updatedJoined.push(upgradedConv);
                    else updatedJoined.splice(firstUnpinnedIndex, 0, upgradedConv);
                }

                return {
                    ...current,
                    homeConversationData: {
                        ...current.homeConversationData,
                        joinedConversations: updatedJoined,
                    },
                };
            }
            return current;
        });
    }
}
