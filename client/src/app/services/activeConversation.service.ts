import { Injectable, signal, inject, computed, effect, OnDestroy } from '@angular/core';
import { Conversation } from './conversation';
import { UserBlock } from './userBlock';
import { SocketService } from './socket';
import { AuthService } from './authService';

export interface UserPresence {
    status: string;
    last_online_at: string | Date;
}

@Injectable({
    providedIn: 'root'
})
export class ActiveConversationService implements OnDestroy {
    private conversationService = inject(Conversation);
    private userBlockService = inject(UserBlock);
    private socketService = inject(SocketService);
    private authService = inject(AuthService);

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
            this.showConversationInfor.update(v => !v);
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
    private onNewConversationSocket?: (data: any) => void;
    private onUserStatusChangedSocket?: (data: any) => void;
    private onOnlineUsersListSocket?: (userIds: string[]) => void;
    private onFriendRequestSocket?: (data: any) => void;
    private onAcceptFriendRequestSocketGlobal?: (data: any) => void;
    private onReactionMessageSocket?: (data: any) => void;

    joinedConversations = computed(() => 
        this.conversations()?.homeConversationData?.joinedConversations || []
    );

    currentUserInfo = computed(() => 
        this.conversations()?.homeConversationData?.userInfo
    );

    currentUserAvatar = computed(() => 
        this.currentUserInfo()?.avatar_url || 'assets/AvatarDefault.jpg'
    );
    
    totalUnreadCount = computed(() => {
        const joined = this.joinedConversations();
        return joined.reduce((acc: number, conv: any) => acc + (Number(conv.unread_count) || 0), 0);
    });

    constructor() {
        // Self-initialization: load data when user logs in or refreshes
        effect(() => {
            const userId = this.authService.getUserId();
            if (userId) {
                console.log('[ActiveConversationService] User detected, initializing global state...');
                this.loadInitialData(userId);
            }
        });

        // Start global time tick every 30 seconds
        this.globalInterval = setInterval(() => {
            this.timeTick.update(v => v + 1);
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
        this.conversations.update(cur => {
            if (!cur?.homeConversationData?.joinedConversations) return cur;
            const updated = cur.homeConversationData.joinedConversations.map((c: any) => 
                String(c.conversation_id) === String(conversationId) 
                    ? { ...c, unread_count: 0 } 
                    : c
            );
            return {
                ...cur,
                homeConversationData: { ...cur.homeConversationData, joinedConversations: updated }
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
            next: (response) => {
                const metadata = response.metadata || {};
                const joined = metadata.homeConversationData?.joinedConversations || [];
                
                // Sort
                const sorted = [...joined].sort((a: any, b: any) => {
                    if (a.is_pinned && !b.is_pinned) return -1;
                    if (!a.is_pinned && b.is_pinned) return 1;
                    const timeA = new Date(a.lastMessage?.created_at || a.updated_at || 0).getTime();
                    const timeB = new Date(b.lastMessage?.created_at || b.updated_at || 0).getTime();
                    return timeB - timeA;
                });

                // --- NEW: Initialize presence map from DB data ---
                const initialPresence = new Map<string, UserPresence>();
                joined.forEach((conv: any) => {
                    conv.participants?.forEach((p: any) => {
                        if (String(p.user_id) !== String(userId)) {
                            initialPresence.set(String(p.user_id), {
                                status: p.status || 'offline',
                                last_online_at: p.last_online_at
                            });
                        }
                    });
                });
                this.userPresence.set(initialPresence);

                this.conversations.set({
                    ...metadata,
                    homeConversationData: { 
                        ...metadata.homeConversationData, 
                        joinedConversations: sorted 
                    }
                });
                
                this.isDataLoaded.set(true);

                // --- Emit userOnline immediately ---
                this.socketService.emit('userOnline', userId);

                // Join socket rooms
                sorted.forEach((conv: any) =>
                    this.socketService.emit('joinConversation', conv.conversation_id)
                );

                this.setupSocketListeners();
            }
        });

        this.userBlockService.getBlockedUserByUserId(userId).subscribe({
            next: (response) => {
                this.userBlock.set(response.metadata?.userBlocks || []);
            }
        });



        // --- NEW: Reconnection support ---
        this.socketService.on('connect', () => {
            const currentUid = this.authService.getUserId();
            if (currentUid) {
                console.log('[ActiveConversationService] Socket reconnected, re-emitting userOnline');
                this.socketService.emit('userOnline', currentUid);
            }
        });
    }

    setupSocketListeners() {
        // Clean up previous listeners if any
        this.removeSocketListeners();

        this.onUpdateProfileSocket = (data: any) => {
            this.conversations.update(cur => {
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
                        const hasOtherUser = conv.participants?.some((p: any) => String(p.user_id) === String(data.id));
                        if (hasOtherUser) {
                            newTitle = data.full_name || conv.title;
                            newAvatarUrl = data.avatar_url || conv.avatar_url || 'assets/AvatarDefault.jpg';
                        }
                    }

                    // Cập nhật participants cho TẤT CẢ loại nhóm chat thay vì chỉ nhóm 'direct'
                    let newParticipants = conv.participants;
                    if (conv.participants) {
                        newParticipants = conv.participants.map((p: any) => 
                            String(p.user_id) === String(data.id) ? { ...p, ...data } : p
                        );
                    }
                    
                    return { ...conv, participants: newParticipants, title: newTitle, avatar_url: newAvatarUrl };
                });
                return {
                    ...cur,
                    homeConversationData: { 
                        ...cur.homeConversationData, 
                        userInfo: updatedUserInfo,
                        joinedConversations: updated 
                    }
                };
            });
        };
        this.socketService.on('updateProfile', this.onUpdateProfileSocket);

        // 2. updateConversation
        this.onUpdateConversationSocket = (data: any) => {
            this.updateConversationList(data);
        };
        this.socketService.on('updateConversation', this.onUpdateConversationSocket);

        // 3. newConversation
        this.onNewConversationSocket = (data: any) => {
            const userId = this.authService.getUserId();
            if (!userId) return;
            this.conversationService.getConversations(userId).subscribe({
                next: (response) => {
                    const metadata = response.metadata || {};
                    const joined = metadata.homeConversationData?.joinedConversations || [];
                    this.socketService.emit('joinConversation', data.conversation_id);
                    const sorted = [...joined].sort((a: any, b: any) => {
                        if (a.is_pinned && !b.is_pinned) return -1;
                        if (!a.is_pinned && b.is_pinned) return 1;
                        const timeA = new Date(a.lastMessage?.created_at || a.updated_at || 0).getTime();
                        const timeB = new Date(b.lastMessage?.created_at || b.updated_at || 0).getTime();
                        return timeB - timeA;
                    });
                    this.conversations.set({
                        ...metadata,
                        homeConversationData: { ...metadata.homeConversationData, joinedConversations: sorted }
                    });
                }
            });
        };
        this.socketService.on('newConversation', this.onNewConversationSocket);

        // 4. onlineUsersList (Sync both logic and UI presence)
        this.onOnlineUsersListSocket = (userIds: string[]) => {
            console.log('[ActiveConversationService] onlineUsersList received:', userIds);
            const onlineSet = new Set(userIds);
            this.onlineUsers.set(onlineSet);

            // Update userPresence map
            this.userPresence.update(map => {
                const newMap = new Map(map);
                userIds.forEach(uid => {
                    const existing = newMap.get(String(uid));
                    newMap.set(String(uid), {
                        status: 'online',
                        last_online_at: existing?.last_online_at || new Date()
                    });
                });
                return newMap;
            });
        };
        this.socketService.on('onlineUsersList', this.onOnlineUsersListSocket);

        // 5. userStatusChanged (Sync both logic and UI presence)
        this.onUserStatusChangedSocket = (data: { userId: string, status: string, last_online_at?: string | Date }) => {
            const uid = String(data.userId);
            this.onlineUsers.update(set => {
                const newSet = new Set(set);
                if (data.status === 'online') newSet.add(uid);
                else newSet.delete(uid);
                return newSet;
            });

            this.userPresence.update(map => {
                const newMap = new Map(map);
                newMap.set(uid, {
                    status: data.status,
                    last_online_at: data.last_online_at || (data.status === 'offline' ? new Date() : (newMap.get(uid)?.last_online_at || new Date()))
                });
                return newMap;
            });
        };
        this.socketService.on('userStatusChanged', this.onUserStatusChangedSocket);

        // 6. friendRequest (Global notification)
        this.onFriendRequestSocket = (data: any) => {
            const currentUserId = this.authService.getUserId();
            if (data.receiver_id === currentUserId) {
                this.friendRequestCount.update(c => c + 1);
            }
        };
        this.socketService.on('sendFriendRequest', this.onFriendRequestSocket);

        // 7. reactionMessage
        this.onReactionMessageSocket = (data: any) => {
            console.log('[ActiveConversationService] reactionMessage received:', data);
            this.syncReactions(data.message_id, data.reactions, data.counts);
        };
        this.socketService.on('reactionMessage', this.onReactionMessageSocket);
    }

    syncReactions(msgId: string, reactions: any[], counts: any) {
        const key = String(msgId);
        this.globalReactions.update(map => {
            const newMap = new Map(map);
            newMap.set(key, reactions);
            return newMap;
        });
        this.globalReactionCounts.update(map => {
            const newMap = new Map(map);
            newMap.set(key, counts || {});
            return newMap;
        });
    }

    private removeSocketListeners() {
        if (this.onUpdateProfileSocket) this.socketService.off('updateProfile', this.onUpdateProfileSocket);
        if (this.onUpdateConversationSocket) this.socketService.off('updateConversation', this.onUpdateConversationSocket);
        if (this.onNewConversationSocket) this.socketService.off('newConversation', this.onNewConversationSocket);
        if (this.onOnlineUsersListSocket) this.socketService.off('onlineUsersList', this.onOnlineUsersListSocket);
        if (this.onUserStatusChangedSocket) this.socketService.off('userStatusChanged', this.onUserStatusChangedSocket);
        if (this.onFriendRequestSocket) this.socketService.off('sendFriendRequest', this.onFriendRequestSocket);
        if (this.onReactionMessageSocket) this.socketService.off('reactionMessage', this.onReactionMessageSocket);
    }

    updateConversationList(data: any) {
        this.conversations.update(cur => {
            if (!cur?.homeConversationData?.joinedConversations) return cur;
            
            const convList = [...cur.homeConversationData.joinedConversations];
            const index = convList.findIndex((c: any) => String(c.conversation_id) === String(data.conversation_id));
            const currentUserId = this.authService.getUserId();

            if (index !== -1) {
                const conv = { ...convList[index] };
                
                // --- Increment Unread Count (The missing logic!) ---
                // Only increment if:
                // 1. Message is NOT FROM current user
                // 2. Conversation is NOT CURRENTLY OPEN
                const isFromOther = String(data.sender_id) !== String(currentUserId);
                const isNotOpen = String(data.conversation_id) !== String(this.activeConversationId());
                
                if (isFromOther && isNotOpen) {
                    conv.unread_count = (Number(conv.unread_count) || 0) + 1;
                }

                conv.lastMessage = {
                    ...(conv.lastMessage || {}),
                    sender_id: data.sender_id,
                    content: data.content,
                    created_at: data.created_at,
                    updated_at: data.updated_at,
                    message_type: data.message_type,
                    id: data.id || data.message_id || conv.lastMessage?.id
                };

                // Move to top (within pinned/unpinned groups)
                convList.splice(index, 1);
                if (conv.is_pinned) {
                    convList.unshift(conv);
                } else {
                    const firstUnpinnedIndex = convList.findIndex((c: any) => !c.is_pinned);
                    if (firstUnpinnedIndex === -1) convList.push(conv);
                    else convList.splice(firstUnpinnedIndex, 0, conv);
                }

                return {
                    ...cur,
                    homeConversationData: { ...cur.homeConversationData, joinedConversations: convList }
                };
            }
            return cur;
        });
    }

    // --- Helper Getters ---
    getConversationById(id: string) {
        return this.joinedConversations().find((c: any) => String(c.conversation_id) === String(id));
    }

    upgradeConversation(oldId: string, newId: string, realParticipants?: any[], lastMessageData?: any) {
        this.conversations.update(current => {
            const joined = current.homeConversationData?.joinedConversations || [];
            const index = joined.findIndex((c: any) => String(c.conversation_id) === String(oldId));
            
            if (index !== -1) {
                const updatedJoined = [...joined];
                const upgradedConv = {
                    ...updatedJoined[index],
                    conversation_id: newId,
                    participants: realParticipants || updatedJoined[index].participants,
                    lastMessage: lastMessageData ? {
                        sender_id: lastMessageData.sender_id,
                        content: lastMessageData.content,
                        created_at: lastMessageData.created_at,
                        message_type: lastMessageData.message_type,
                        id: lastMessageData.id
                    } : updatedJoined[index].lastMessage
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
                        joinedConversations: updatedJoined
                    }
                };
            }
            return current;
        });
    }
}
