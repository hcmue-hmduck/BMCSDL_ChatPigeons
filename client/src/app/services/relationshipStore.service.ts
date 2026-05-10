import { Injectable, signal, inject } from '@angular/core';
import { forkJoin } from 'rxjs';
import { Friend } from './friend';
import { FriendRequest } from './friendrequest';
import { User } from './user';
import { SearchService } from './searchService';
import { UserBlock } from './userBlock';
import { SocketService } from './socket';
import { ActiveConversationService } from './activeConversation.service';

@Injectable({
    providedIn: 'root'
})
export class RelationshipStoreService {
    private friendService = inject(Friend);
    private userService = inject(User);
    private searchService = inject(SearchService);
    private friendRequestService = inject(FriendRequest);
    private userBlockService = inject(UserBlock);
    private socketService = inject(SocketService);
    private convStore = inject(ActiveConversationService);

    // --- State ---
    friends = signal<any[]>([]);
    blockedUser = signal<any[]>([]);
    friendRequests = signal<any[]>([]);
    sentRequests = signal<any[]>([]);
    suggestions = signal<any[]>([]);
    isDataLoaded = signal(false);
    
    loading = signal(false);
    isSearching = signal(false);
    error = signal<string | null>(null);

    // --- Helper Sets (for fast lookup) ---
    friendIds = new Set<string>();
    friendRequestsIds = new Set<string>();
    sendingRequestsIds = new Set<string>();
    allFriendIds = new Set<string>();

    constructor() {
        this.setupSocketListeners();
    }

    loadAllData(currentUserId: string) {
        if (!currentUserId) return;
        
        // Caching: Không load lại nếu đã có dữ liệu
        if (this.isDataLoaded()) {
            console.log('[RelationshipStore] Data already loaded, skipping API call.');
            return;
        }

        this.loading.set(true);
        this.isSearching.set(true);

        forkJoin({
            friends: this.friendService.getFriendByUserId(currentUserId),
            requests: this.friendRequestService.getFriendRequestsByUserId(currentUserId),
            sentRequests: this.friendRequestService.getSentFriendRequestsByUserId(currentUserId),
            blocks: this.userBlockService.getBlockedUserByUserId(currentUserId),
            users: this.userService.getAllUsers(),
        }).subscribe({
            next: (res: any) => {
                const allFriendsArr = res.friends?.metadata?.friends || [];
                const receivedRequestsArr = res.requests?.metadata || [];
                const sentRequestsArr = res.sentRequests?.metadata?.sentFriendRequests || [];
                const blocksArr = res.blocks?.metadata?.userBlocks || [];
                const allUsersArr = res.users?.metadata || [];

                // Reset Helper Sets
                this.allFriendIds = new Set<string>(allFriendsArr.map((f: any) => f.friend_id));
                const blockedIdsSet = new Set<string>(blocksArr.map((b: any) => b.blocked_id));
                
                // Bao gồm tất cả bạn bè kể cả đã chặn
                this.friendIds = new Set<string>(allFriendsArr.map((f: any) => f.friend_id));
                this.friendRequestsIds = new Set<string>(receivedRequestsArr.map((r: any) => r.sender_id));
                this.sendingRequestsIds = new Set<string>(sentRequestsArr.map((r: any) => r.receiver_id));

                const userProfileMap = new Map<string, any>(allUsersArr.map((u: any) => [u.id, u]));

                // 1. Suggestions & Blocks
                const suggestionsList: any[] = [];
                const blockedList: any[] = [];
                
                allUsersArr.forEach((u: any) => {
                    if (u.id === currentUserId) return;

                    if (blockedIdsSet.has(u.id)) {
                        const blockData = blocksArr.find((b: any) => b.blocked_id === u.id);
                        blockedList.push({ ...u, friend_id: u.id, block_id: blockData?.id, reason: blockData?.reason });
                    } else {
                        const isFriend = this.friendIds.has(u.id);
                        const isRequestSent = this.sendingRequestsIds.has(u.id);
                        const isRequestReceived = this.friendRequestsIds.has(u.id);
                        if (!isFriend && !isRequestSent && !isRequestReceived) {
                            suggestionsList.push({ ...u, friend_id: u.id });
                        }
                    }
                });

                // 2. Enriched Friends
                const enrichedFriends = allFriendsArr.map((f: any) => {
                    const profile = userProfileMap.get(f.friend_id);
                    // Đồng bộ trạng thái thực tế từ presence store nếu có, nếu không dùng từ profile
                    const realTimePresence = this.convStore.userPresence().get(String(f.friend_id));
                    const currentStatus = realTimePresence ? realTimePresence.status : (profile?.status || 'offline');
                    
                    return {
                        ...f,
                        full_name: profile?.full_name || 'Người dùng Pigeons',
                        avatar_url: profile?.avatar_url || 'assets/AvatarDefault.jpg',
                        status: currentStatus
                    };
                });

                // 3. Enriched Received Requests
                const enrichedRequests = receivedRequestsArr.map((req: any) => {
                    const profile = userProfileMap.get(req.sender_id);
                    const realTimePresence = this.convStore.userPresence().get(String(req.sender_id));
                    const currentStatus = realTimePresence ? realTimePresence.status : (profile?.status || 'offline');
                    
                    return { 
                        ...req, 
                        sender_name: profile?.full_name, 
                        sender_avatar: profile?.avatar_url,
                        status: currentStatus 
                    };
                });

                // Update signals
                this.friends.set(enrichedFriends);
                this.friendRequests.set(enrichedRequests);
                this.sentRequests.set(sentRequestsArr.map((r: any) => {
                    const profile = userProfileMap.get(r.receiver_id);
                    const realTimePresence = this.convStore.userPresence().get(String(r.receiver_id));
                    return {
                        ...r,
                        receiver_name: profile?.full_name,
                        receiver_avatar: profile?.avatar_url,
                        status: realTimePresence ? realTimePresence.status : (profile?.status || 'offline')
                    };
                }));
                this.blockedUser.set(blockedList);
                this.suggestions.set(suggestionsList.map((u: any) => {
                    const realTimePresence = this.convStore.userPresence().get(String(u.id));
                    return { ...u, status: realTimePresence ? realTimePresence.status : u.status };
                }));

                this.loading.set(false);
                this.isSearching.set(false);
                this.isDataLoaded.set(true);
            },
            error: (err) => {
                console.error('[RelationshipStore] Error:', err);
                this.error.set('Lỗi tải dữ liệu quan hệ.');
                this.loading.set(false);
                this.isSearching.set(false);
            }
        });
    }

    private setupSocketListeners() {
        this.socketService.on('updateFriend', (data: any) => {
            if (!data) return;
            const currentUserId = this.convStore.currentUserInfo()?.id;
            
            // Nếu mình là người xóa, thì id cần xóa là target_id. Ngược lại là remover_id.
            const idToRemove = (String(data.remover_id) === String(currentUserId)) ? data.target_id : data.remover_id;
            
            const friendToRemove = this.friends().find(f => String(f.friend_id || f.id) === String(idToRemove));
            
            this.friends.update(list => list.filter(f => String(f.friend_id || f.id) !== String(idToRemove)));
            this.friendIds.delete(idToRemove);
            
            // Trả về danh sách gợi ý
            if (friendToRemove) {
                const suggestion = {
                    id: idToRemove,
                    friend_id: idToRemove,
                    full_name: friendToRemove.full_name,
                    avatar_url: friendToRemove.avatar_url,
                    status: friendToRemove.status,
                    is_bot: friendToRemove.is_bot
                };
                this.suggestions.update(list => {
                    if (!list.some(u => String(u.id) === String(idToRemove))) {
                        return [...list, suggestion];
                    }
                    return list;
                });
            }
        });

        this.socketService.on('sendFriendRequest', (data: any) => {
            if (!data) return;
            const currentUserId = this.convStore.currentUserInfo()?.id;
            
            if (String(data.receiver_id) === String(currentUserId)) {
                this.friendRequests.update(prev => {
                    if (!prev.some(r => String(r.id) === String(data.id))) {
                        return [...prev, data];
                    }
                    return prev;
                });
                this.friendRequestsIds.add(data.sender_id);
                // Xóa khỏi danh sách gợi ý của người nhận
                this.suggestions.update(list => list.filter(u => String(u.id) !== String(data.sender_id)));
            } else if (String(data.sender_id) === String(currentUserId)) {
                // Đồng bộ cho các tab khác của người gửi
                this.sentRequests.update(prev => {
                    if (!prev.some(r => String(r.id) === String(data.id))) {
                        return [...prev, data];
                    }
                    return prev;
                });
                this.sendingRequestsIds.add(data.receiver_id);
                // Xóa khỏi danh sách gợi ý của người gửi ở tab khác
                this.suggestions.update(list => list.filter(u => String(u.id) !== String(data.receiver_id)));
            }
        });

        this.socketService.on('rejectFriendRequest', (data: any) => {
            if (!data) return;
            const currentUserId = this.convStore.currentUserInfo()?.id;
            
            // Nếu mình là người gửi lời mời (và bị từ chối)
            if (String(data.sender_id) === String(currentUserId)) {
                // Xóa khỏi danh sách đã gửi
                this.sentRequests.update(list => list.filter(r => r.id !== data.id));
                this.sendingRequestsIds.delete(data.receiver_id);
                
                // Trả về danh sách gợi ý
                const suggestion = {
                    id: data.receiver_id,
                    friend_id: data.receiver_id,
                    full_name: data.receiver_name,
                    avatar_url: data.receiver_avatar,
                    status: 'online'
                };
                this.suggestions.update(list => {
                    if (!list.some(u => String(u.id) === String(data.receiver_id))) {
                        return [...list, suggestion];
                    }
                    return list;
                });
            }
        });

        this.socketService.on('cancelSentRequest', (data: any) => {
            this.friendRequests.update(list => list.filter(r => r.id !== data));
            this.sentRequests.update(list => list.filter(r => r.id !== data));
        });

        this.socketService.on('acceptFriendRequest', (data: any) => {
            if (!data) return;
            const currentUserId = this.convStore.currentUserInfo()?.id;
            
            // Nếu mình là người gửi lời mời (và đối phương vừa chấp nhận)
            if (String(data.sender_id) === String(currentUserId)) {
                const newFriend = {
                    friend_id: data.receiver_id,
                    full_name: data.receiver_name,
                    avatar_url: data.receiver_avatar,
                    status: 'online'
                };
                
                this.friends.update(prev => {
                    if (!prev.some(f => String(f.friend_id) === String(data.receiver_id))) {
                        return [...prev, newFriend];
                    }
                    return prev;
                });
                this.friendIds.add(data.receiver_id);
                
                // Xóa khỏi danh sách đã gửi
                this.sentRequests.update(list => list.filter(r => r.id !== data.request_id));
                this.sendingRequestsIds.delete(data.receiver_id);
            }
        });

        this.socketService.on('blockUser', (data: any) => {
             if (!data) return;
             const blockedId = data.blocked_id;
             // Không xóa khỏi friends nữa
             // Thêm vào blockedUser nếu chưa có (để đồng bộ nhiều tab)
             this.blockedUser.update(list => {
                 if (!list.some(b => String(b.friend_id || b.id) === String(blockedId))) {
                     return [...list, { friend_id: blockedId, block_id: data.id, reason: data.reason }];
                 }
                 return list;
             });
        });

        this.socketService.on('unblockUser', (data: any) => {
            if (!data) return;
            this.blockedUser.update(list => list.filter(b => String(b.friend_id || b.id) !== String(data.blocked_id)));
        });
    }

    // --- Actions ---
    sendFriendRequest(currentUserId: string, targetUserId: string) {
        // Lấy thông tin profile từ suggestions trước khi xóa
        const targetUserProfile = this.suggestions().find(u => String(u.id) === String(targetUserId));

        return this.friendRequestService.createFriendRequest(currentUserId, targetUserId, '').subscribe({
            next: (res: any) => {
                const request = res.metadata;
                
                if (request) {
                    // Làm giàu dữ liệu với tên và avatar
                    const enrichedRequest = {
                        ...request,
                        receiver_name: targetUserProfile?.full_name,
                        receiver_avatar: targetUserProfile?.avatar_url,
                        sender_name: this.convStore.currentUserInfo()?.full_name,
                        sender_avatar: this.convStore.currentUserInfo()?.avatar_url
                    };

                    this.sentRequests.update(list => [...list, enrichedRequest]);
                    this.sendingRequestsIds.add(targetUserId);
                    
                    // Xóa khỏi danh sách gợi ý của người gửi ngay lập tức
                    this.suggestions.update(list => list.filter(u => String(u.id) !== String(targetUserId)));
                    
                    this.socketService.emit('sendFriendRequest', enrichedRequest);
                }
            }
        });
    }

    acceptFriendRequest(currentUserId: string, request: any) {
        const requestId = request.id;
        const sender_id = request.sender_id;

        return forkJoin([
            this.friendRequestService.updateFriendRequest(requestId, 'accepted', 'Accepted by receiver'),
            this.friendService.createFriend(currentUserId, sender_id, false, '')
        ]).subscribe({
            next: ([updateRes, createRes]: [any, any]) => {
                const fullFriendData = {
                    ...request,
                    full_name: request.sender_name,
                    avatar_url: request.sender_avatar,
                    friend_id: sender_id,
                    request_id: requestId,
                };

                this.friends.update(list => [...list, fullFriendData]);
                this.friendIds.add(sender_id);
                this.friendRequests.update(list => list.filter(r => r.id !== requestId));

                // Gửi đầy đủ thông tin để cả 2 bên cập nhật được
                this.socketService.emit('acceptFriendRequest', { 
                    request_id: requestId,
                    sender_id: sender_id,
                    receiver_id: currentUserId,
                    receiver_name: this.convStore.currentUserInfo()?.full_name,
                    receiver_avatar: this.convStore.currentUserInfo()?.avatar_url
                });
            }
        });
    }

    cancelFriendRequest(requestId: string) {
        return this.friendRequestService.updateFriendRequest(requestId, 'rejected', 'Canceled by sender').subscribe({
            next: () => {
                this.sentRequests.update(list => list.filter(r => r.id !== requestId));
                this.sendingRequestsIds.delete(this.sentRequests().find(r => r.id === requestId)?.receiver_id || '');
                this.socketService.emit('cancelSentRequest', requestId);
            }
        });
    }

    rejectFriendRequest(request: any) {
        const requestId = request.id;
        return this.friendRequestService.updateFriendRequest(requestId, 'rejected', 'Rejected by receiver').subscribe({
            next: () => {
                this.friendRequests.update(list => list.filter(r => r.id !== requestId));
                this.friendRequestsIds.delete(request.sender_id);
                
                // Trả về danh sách gợi ý cho người từ chối (người nhận)
                const suggestion = {
                    id: request.sender_id,
                    friend_id: request.sender_id,
                    full_name: request.sender_name,
                    avatar_url: request.sender_avatar,
                    status: request.status || 'online'
                };
                this.suggestions.update(list => {
                    if (!list.some(u => String(u.id) === String(request.sender_id))) {
                        return [...list, suggestion];
                    }
                    return list;
                });

                // Đính kèm thông tin của mình (người từ chối) để người gửi cập nhật gợi ý
                this.socketService.emit('rejectFriendRequest', {
                    ...request,
                    receiver_name: this.convStore.currentUserInfo()?.full_name,
                    receiver_avatar: this.convStore.currentUserInfo()?.avatar_url
                });
            }
        });
    }

    deleteFriend(currentUserId: string, friendId: string) {
        return this.friendService.deleteFriend(currentUserId, friendId).subscribe({
            next: () => {
                const friendToRemove = this.friends().find(f => String(f.friend_id || f.id) === String(friendId));
                
                this.friends.update(list => list.filter(f => String(f.friend_id || f.id) !== String(friendId)));
                this.friendIds.delete(friendId);
                
                // Trả về danh sách gợi ý
                if (friendToRemove) {
                    const suggestion = {
                        id: friendId,
                        friend_id: friendId,
                        full_name: friendToRemove.full_name,
                        avatar_url: friendToRemove.avatar_url,
                        status: friendToRemove.status,
                        is_bot: friendToRemove.is_bot
                    };
                    this.suggestions.update(list => {
                        if (!list.some(u => String(u.id) === String(friendId))) {
                            return [...list, suggestion];
                        }
                        return list;
                    });
                }

                this.socketService.emit('updateFriend', {
                    remover_id: currentUserId,
                    target_id: friendId
                });
            }
        });
    }

    blockUser(currentUserId: string, friend: any, reason: string) {
        const friendId = friend.friend_id || friend.id;
        return this.userBlockService.createBlockedUser(currentUserId, friendId, reason).subscribe({
            next: (res: any) => {
                const blockedUser = { ...friend, friend_id: friendId, block_id: res.metadata.newUserBlock.id, reason };
                this.blockedUser.update(list => [...list, blockedUser]);
                this.socketService.emit('blockUser', { blocker_id: currentUserId, blocked_id: friendId, id: res.metadata.newUserBlock.id });
            }
        });
    }

    unblockUser(currentUserId: string, blockId: string, blockedUserId: string) {
        return this.userBlockService.deleteBlockedUser(blockId).subscribe({
            next: () => {
                this.blockedUser.update(list => list.filter(b => b.block_id !== blockId));
                this.socketService.emit('unblockUser', { blocker_id: currentUserId, blocked_id: blockedUserId });
            }
        });
    }

    updateUserStatus(userId: string, status: string) {
        const uid = String(userId);
        this.friends.update(list => list.map(f => (String(f.friend_id) === uid) ? { ...f, status } : f));
        this.suggestions.update(list => list.map(u => (String(u.id) === uid) ? { ...u, status } : u));
        this.friendRequests.update(list => list.map(r => (String(r.sender_id) === uid) ? { ...r, status } : r));
        this.sentRequests.update(list => list.map(r => (String(r.receiver_id) === uid) ? { ...r, status } : r));
    }

    updateUserProfile(data: any) {
        const uid = String(data.id);
        this.friends.update(list => list.map(f => (String(f.friend_id) === uid) ? { ...f, full_name: data.full_name, avatar_url: data.avatar_url } : f));
        this.suggestions.update(list => list.map(u => (String(u.id) === uid) ? { ...u, full_name: data.full_name, avatar_url: data.avatar_url } : u));
    }

    searchUsers(keyword: string) {
        return this.searchService.searchUsers(keyword);
    }
}
