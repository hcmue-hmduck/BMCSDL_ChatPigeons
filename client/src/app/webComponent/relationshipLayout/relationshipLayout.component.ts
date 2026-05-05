import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, computed, effect, HostListener, inject, OnChanges, OnDestroy, OnInit, signal, SimpleChanges, ViewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { debounceTime, distinctUntilChanged, Subject, takeUntil } from 'rxjs';
import Swal from 'sweetalert2';
import { ActiveConversationService } from '../../services/activeConversation.service';
import { FriendsTab, NavigationService } from '../../services/navigation';
import { RelationshipStoreService } from '../../services/relationshipStore.service';
import { FileUtils } from '../../utils/FileUtils/fileUltils';
import { UserInforModel } from '../userinforModel/userinforModel.component';

@Component({
    selector: 'relationship-layout',
    standalone: true,
    imports: [CommonModule, FormsModule, UserInforModel],
    templateUrl: './relationshipLayout.component.html',
    styleUrls: ['./relationshipLayout.component.css'],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class RelationshipLayoutComponent implements OnChanges, OnInit, OnDestroy {
    protected readonly title = signal('Relationship');
    // @Input() currentUserId: string = ''; // Loại bỏ Input không ổn định trong routed component
    userId = computed(() => this.convStore.currentUserInfo()?.id || '');

    currentTab: FriendsTab = 'friends_suggestions';
    currentSort = signal<'asc' | 'desc'>('asc');

    relStore = inject(RelationshipStoreService);
    convStore = inject(ActiveConversationService);
    currentUser = computed(() => this.convStore.currentUserInfo());

    // Tự động tính toán lại danh sách hiển thị khi friends hoặc currentSort thay đổi
    groupedFriends = computed(() => {
        const rawFriends = this.relStore.friends();
        const sortOrder = this.currentSort();
        const grouped = this.groupFriendsByAlphabet(rawFriends);

        // Sắp xếp các nhóm
        grouped.sort((a, b) => {
            return sortOrder === 'asc'
                ? a.letter.localeCompare(b.letter, 'vi-VN')
                : b.letter.localeCompare(a.letter, 'vi-VN');
        });

        // Sắp xếp bạn bè trong từng nhóm
        grouped.forEach(group => {
            group.friends.sort((a, b) => {
                const nameA = a.full_name || '';
                const nameB = b.full_name || '';
                return sortOrder === 'asc'
                    ? nameA.localeCompare(nameB, 'vi-VN')
                    : nameB.localeCompare(nameA, 'vi-VN');
            });
        });

        return grouped;
    });

    loading = false;
    error = '';
    showMoreMenuId: string | null = null;
    searchKeyword: string = '';
    searchResults = signal<any[]>([]);
    isSearching = signal(false);
    private searchSubject = new Subject<string>();
    private destroy$ = new Subject<void>();

    // Tự động chuyển đổi thông minh và cập nhật trạng thái Online/Offline thời gian thực
    displayedSuggestions = computed(() => {
        const kw = this.searchKeyword.trim();
        const results = this.searchResults();
        const suggestions = this.relStore.suggestions();
        const presence = this.convStore.userPresence(); // Theo dõi trạng thái presence toàn cục

        let baseList = [];
        // 1. Xác định danh sách gốc (Gợi ý hoặc Tìm kiếm)
        // Nếu có từ khóa (kể cả đang tìm hay đã tìm xong), CHỈ hiện kết quả tìm kiếm
        if (kw) {
            baseList = results;
        } else {
            // Chỉ hiện suggestions khi ô tìm kiếm trống
            baseList = suggestions;
        }

        // 2. Luôn cập nhật trạng thái mới nhất từ presence store cho tất cả người dùng trong danh sách
        return baseList.map(u => {
            const userId = String(u.id || u.friend_id);
            const realTimeStatus = presence.get(userId)?.status;
            if (realTimeStatus && realTimeStatus !== u.status) {
                return { ...u, status: realTimeStatus };
            }
            return u;
        });
    });

    private updateProfileListener!: (data: any) => void;
    private onUpdateFriendSocket?: (data: any) => void;
    private onSendFriendRequestSocket?: (data: any) => void;
    private onCancelSentRequestSocket?: (data: any) => void;
    private onRejectFriendRequestSocket?: (data: any) => void;
    private onAcceptFriendRequestSocket?: (data: any) => void;
    private onBlockUserSocket?: (data: any) => void;
    private onUnblockUserSocket?: (data: any) => void;
    private onOnlineUsersListSocket?: (userIds: string[]) => void;
    private onUserStatusChangedSocket?: (data: { userId: string, status: string }) => void;

    @HostListener('document:click', ['$event'])
    onDocumentClick(event: MouseEvent) {
        const target = event.target as HTMLElement;
        if (!target.closest('.friend-more-btn') && !target.closest('.friend-dropdown')) {
            this.showMoreMenuId = null;
        }
    }

    @ViewChild('userProfileModal') userProfileModal!: UserInforModel;

    constructor(
        private navService: NavigationService,
        private cdr: ChangeDetectorRef,
        public fileUtils: FileUtils
    ) {
        // Sử dụng effect để theo dõi khi nào thông tin user khả dụng thì mới load data
        effect(() => {
            const user = this.convStore.currentUserInfo();
            if (user?.id) {
                this.relStore.loadAllData(user.id);
            }
        });
    }

    ngOnInit() {
        this.setupSocketListeners();
        this.currentTab = this.navService.activeFriendsTab();

        // Thiết lập auto-search với debounce
        this.searchSubject.pipe(
            debounceTime(300),
            distinctUntilChanged(),
            takeUntil(this.destroy$)
        ).subscribe((kw) => {
            this.onSearch(kw);
        });
    }

    ngOnDestroy() {
        this.destroy$.next();
        this.destroy$.complete();
        this.searchSubject.complete();
        if (this.updateProfileListener) {
            this.convStore['socketService'].off('updateProfile', this.updateProfileListener);
        }
        if (this.onUserStatusChangedSocket) this.convStore['socketService'].off('userStatusChanged', this.onUserStatusChangedSocket);
    }

    ngOnChanges(changes: SimpleChanges) {
        // Data loading is now handled by effect in constructor
    }

    setTab(tab: FriendsTab) {
        this.currentTab = tab;
        this.navService.setFriendsTab(tab);
    }

    toggleMoreMenu(friendId: string, event: Event) {
        event.stopPropagation();
        this.showMoreMenuId = this.showMoreMenuId === friendId ? null : friendId;
    }

    closeMoreMenu() {
        setTimeout(() => {
            this.showMoreMenuId = null;
        }, 150);
    }

    private setupSocketListeners() {
        this.updateProfileListener = (data: any) => {
            this.relStore.updateUserProfile(data);
        };
        this.convStore['socketService'].on('updateProfile', this.updateProfileListener);

        this.onUserStatusChangedSocket = (data: { userId: string, status: string }) => {
            this.relStore.updateUserStatus(data.userId, data.status);
        };
        this.convStore['socketService'].on('userStatusChanged', this.onUserStatusChangedSocket);
    }

    sendFriendRequest(targetUserId: string) {
        const id = this.userId();
        if (!id) return;
        this.relStore.sendFriendRequest(id, targetUserId);
    }

    onSearchInput() {
        this.searchSubject.next(this.searchKeyword);
    }

    onSearch(keyword: string = this.searchKeyword) {
        const kw = keyword.trim();
        if (!kw) {
            this.searchResults.set([]);
            return;
        }

        this.relStore.isSearching.set(true);
        console.log('[RelationshipLayout] Searching for:', kw);

        this.relStore.searchUsers(kw).subscribe({
            next: (res: any) => {
                const users = (res.metadata?.users || []).filter((u: any) => u.id !== this.userId());
                console.log('[RelationshipLayout] Search results:', users.length);
                this.searchResults.set(users);
                this.relStore.isSearching.set(false);
            },
            error: (err: any) => {
                console.error('[RelationshipLayout] Search error:', err);
                this.relStore.isSearching.set(false);
            }
        });
    }

    acceptFriendRequest(request: any) {
        const id = this.userId();
        if (!id) return;
        this.relStore.acceptFriendRequest(id, request);
        Swal.fire('Thành công', 'Đã chấp nhận lời mời kết bạn', 'success');
    }

    processFriendRequest(requestId: string, sender_id: string, action: 'accepted' | 'rejected', note: string = '') {
        const request = this.relStore.friendRequests().find(r => r.id === requestId);
        if (!request) return;

        if (action === 'accepted') {
            this.acceptFriendRequest(request);
        } else {
            this.relStore.rejectFriendRequest(request);
            Swal.fire('Đã từ chối', '', 'success');
        }
    }

    unblockUser(block_id: string, full_name: string) {
        Swal.fire({
            title: `Bỏ chặn "${full_name}"?`,
            text: 'Bạn có chắc chắn muốn bỏ chặn người này không?',
            icon: 'warning',
            showCancelButton: true,
            confirmButtonText: 'Bỏ chặn',
            cancelButtonText: 'Hủy'
        }).then((result) => {
            if (result.isConfirmed) {
                const blockedUser = this.relStore.blockedUser().find(u => u.block_id === block_id);
                const blockedUserId = blockedUser?.friend_id || blockedUser?.id;
                const id = this.userId();
                if (blockedUserId && id) {
                    this.relStore.unblockUser(id, block_id, blockedUserId);
                    Swal.fire('Thành công', 'Đã bỏ chặn người dùng.', 'success');
                }
            }
        });
    }

    groupFriendsByAlphabet(friends: any[]): { letter: string, friends: any[] }[] {
        if (!friends || friends.length === 0) return [];

        const groups: { [key: string]: any[] } = {};

        friends.forEach(friend => {
            let firstLetter = '#';
            if (friend.full_name && friend.full_name.trim().length > 0) {
                const char = friend.full_name.trim().charAt(0).toUpperCase();
                firstLetter = char.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/Đ/g, 'D');
                if (!/[A-Z]/.test(firstLetter)) {
                    firstLetter = '#';
                }
            }

            if (!groups[firstLetter]) {
                groups[firstLetter] = [];
            }
            groups[firstLetter].push(friend);
        });

        return Object.keys(groups)
            .sort()
            .map(letter => ({
                letter: letter,
                friends: groups[letter]
            }));
    }

    onSortChange(event: any) {
        const option = event.target.value;
        this.currentSort.set(option);
    }

    viewProfile(friend_id: string) {
        this.userProfileModal.open(friend_id);
    }

    blockUser(friend: any) {
        const full_name = friend.full_name;
        Swal.fire({
            title: `Chặn "${full_name}"?`,
            text: 'Bạn có chắc muốn chặn?',
            icon: 'warning',
            input: 'textarea',
            inputPlaceholder: 'Lý do (không bắt buộc)',
            showCancelButton: true,
            confirmButtonText: 'Chặn',
            cancelButtonText: 'Hủy'
        }).then((result) => {
            if (result.isConfirmed) {
                const id = this.userId();
                if (id) {
                    this.relStore.blockUser(id, friend, result.value || '');
                    Swal.fire('Đã chặn', '', 'success');
                }
            }
        });
    }

    cancelSentRequest(requestId: string) {
        Swal.fire({
            title: 'Hủy lời mời?',
            text: 'Bạn có chắc chắn muốn hủy lời mời kết bạn này?',
            icon: 'warning',
            showCancelButton: true,
            confirmButtonText: 'Có, hủy ngay',
            cancelButtonText: 'Không',
            confirmButtonColor: '#ef4444',
        }).then((result) => {
            if (result.isConfirmed) {
                this.relStore.cancelFriendRequest(requestId);
            }
        });
    }

    deleteFriend(friend: any) {
        const friend_id = friend.friend_id || friend.id;
        const full_name = friend.full_name;

        Swal.fire({
            title: `Xóa "${full_name}"?`,
            text: 'Bạn có chắc muốn xóa bạn bè?',
            icon: 'warning',
            showCancelButton: true,
            confirmButtonText: 'Xóa',
            cancelButtonText: 'Hủy'
        }).then((result) => {
            if (result.isConfirmed) {
                const id = this.userId();
                if (id) {
                    this.relStore.deleteFriend(id, friend_id);
                    Swal.fire('Đã xóa', '', 'success');
                }
            }
        });
    }

    isFriend(userId: string): boolean {
        return this.relStore.friendIds.has(userId);
    }

    isFriendRequest(userId: string): boolean {
        return this.relStore.friendRequestsIds.has(userId);
    }

    isRequestSent(userId: string): boolean {
        return this.relStore.sendingRequestsIds.has(userId);
    }

    getReceivedRequest(userId: string): any {
        return this.relStore.friendRequests().find(r => r.sender_id === userId);
    }

    sendMessage(user: any) {
        const targetId = user.friend_id || user.id;
        if (!targetId) return;
        this.navService.openDirectConversation({
            id: targetId,
            full_name: user.full_name,
            avatar_url: user.avatar_url,
            last_online_at: user.last_online_at,
        });
    }
}