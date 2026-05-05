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
                this.friendIds = new Set<string>(allFriendsArr.map((f: any) => f.friend_id));
                this.friendRequestsIds = new Set<string>(receivedRequestsArr.map((r: any) => r.sender_id));
                this.sendingRequestsIds = new Set<string>(sentRequestsArr.map((r: any) => r.receiver_id));
                const blockedIdsSet = new Set<string>(blocksArr.map((b: any) => b.blocked_id));

                const userProfileMap = new Map<string, any>(allUsersArr.map((u: any) => [u.id, u]));

                // 1. Suggestions & Blocks
                const suggestionsList: any[] = [];
                const blockedList: any[] = [];
                
                allUsersArr.forEach((u: any) => {
                    if (u.id === currentUserId) return;

                    if (blockedIdsSet.has(u.id)) {
                        const blockData = blocksArr.find((b: any) => b.blocked_id === u.id);
                        blockedList.push({ ...u, block_id: blockData?.id, reason: blockData?.reason });
                    } else {
                        const isFriend = this.friendIds.has(u.id);
                        const isRequestSent = this.sendingRequestsIds.has(u.id);
                        const isRequestReceived = this.friendRequestsIds.has(u.id);
                        if (!isFriend && !isRequestSent && !isRequestReceived) {
                            suggestionsList.push(u);
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
            const removerId = data.remover_id;
            this.friends.update(list => list.filter(f => (f.friend_id || f.id) !== removerId));
        });

        this.socketService.on('sendFriendRequest', (data: any) => {
            if (data.receiver_id === this.convStore.currentUserInfo()?.id) {
                this.friendRequests.update(prev => [...prev, data]);
                this.friendRequestsIds.add(data.sender_id);
            }
        });

        this.socketService.on('cancelSentRequest', (data: any) => {
            this.friendRequests.update(list => list.filter(r => r.id !== data));
            this.sentRequests.update(list => list.filter(r => r.id !== data));
        });

        this.socketService.on('acceptFriendRequest', (data: any) => {
            const currentUserId = this.convStore.currentUserInfo()?.id;
            if (data.friend && (data.friend.user_id === currentUserId || data.friend.friend_id === currentUserId)) {
                this.friends.update(prev => [...prev, data.friend]);
                const newFid = data.friend.user_id === currentUserId ? data.friend.friend_id : data.friend.user_id;
                this.friendIds.add(newFid);
            }
        });

        this.socketService.on('blockUser', (data: any) => {
             const blockedId = data.blocked_id;
             this.friends.update(list => list.filter(f => (f.friend_id || f.id) !== blockedId));
             this.friendIds.delete(blockedId);
        });

        this.socketService.on('unblockUser', (data: any) => {
            this.blockedUser.update(list => list.filter(b => (b.blocked_id || b.id) !== data.blocked_id));
        });
    }

    // --- Actions ---
    sendFriendRequest(currentUserId: string, targetUserId: string) {
        return this.friendRequestService.createFriendRequest(currentUserId, targetUserId, '').subscribe({
            next: (res: any) => {
                const request = res.metadata.newFriendRequest;
                this.sentRequests.update(list => [...list, request]);
                this.sendingRequestsIds.add(targetUserId);
                this.socketService.emit('sendFriendRequest', request);
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

                this.socketService.emit('acceptFriendRequest', { friend: fullFriendData });
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
                this.socketService.emit('rejectFriendRequest', request);
            }
        });
    }

    deleteFriend(currentUserId: string, friendId: string) {
        return this.friendService.deleteFriend(currentUserId, friendId).subscribe({
            next: () => {
                this.friends.update(list => list.filter(f => (f.friend_id || f.id) !== friendId));
                this.friendIds.delete(friendId);
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
                const blockedUser = { ...friend, block_id: res.metadata.newUserBlock.id, reason };
                this.friends.update(list => list.filter(f => (f.friend_id || f.id) !== friendId));
                this.blockedUser.update(list => [...list, blockedUser]);
                this.friendIds.delete(friendId);
                this.socketService.emit('blockUser', { blocker_id: currentUserId, blocked_id: friendId });
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
