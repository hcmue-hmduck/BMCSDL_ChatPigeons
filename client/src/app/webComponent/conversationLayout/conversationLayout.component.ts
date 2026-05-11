import { CommonModule } from '@angular/common';
import {
    Component,
    Input,
    OnInit,
    OnDestroy,
    signal,
    computed,
    inject,
    effect,
    ChangeDetectionStrategy,
    ChangeDetectorRef,
    NgZone,
    ViewChild,
    ElementRef,
    HostListener
} from '@angular/core';
import { ActiveConversationService } from '../../services/activeConversation.service';
import { RouterOutlet, Router, ActivatedRoute, NavigationEnd } from '@angular/router';
import { Subject, of, forkJoin } from 'rxjs';
import { debounceTime, distinctUntilChanged, switchMap, filter, takeUntil } from 'rxjs/operators';
import { NavigationService, DirectConversationTarget } from '../../services/navigation';
import { Conversation } from '../../services/conversation';
import { Participant } from '../../services/participant';
import { UserBlock } from '../../services/userBlock';
import { SearchService } from '../../services/searchService';
import { LinkPreviewUtils } from '../../utils/LinkUtils/linkPreviewUtils';
import { AuthService } from '../../services/authService';
import { SocketService } from '../../services/socket';
import { DateTimeUtils } from '../../utils/DateTimeUtils/datetimeUtils';
import { FileUtils } from '../../utils/FileUtils/fileUltils';
import { ConversationInfoLayoutComponent } from '../conversationInforLayout/conversationInforLayout.component';
import { GroupAvatarLayoutComponent } from '../groupAvatarLayout/groupAvatarLayout.component';
import { FormsModule } from '@angular/forms';
import { Friend } from '../../services/friend';

@Component({
    selector: 'conversation-layout',
    standalone: true,
    imports: [CommonModule, RouterOutlet, ConversationInfoLayoutComponent, GroupAvatarLayoutComponent, FormsModule],
    templateUrl: './conversationLayout.component.html',
    styleUrls: ['./conversationLayout.component.css'],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ConversationLayoutComponent implements OnInit, OnDestroy {
    convStore = inject(ActiveConversationService);
    navService = inject(NavigationService);
    cdr = inject(ChangeDetectorRef);
    conversationService = inject(Conversation);
    participantService = inject(Participant);
    userBlockService = inject(UserBlock);
    searchService = inject(SearchService);
    linkPreviewUtils = inject(LinkPreviewUtils);
    authService = inject(AuthService);
    router = inject(Router);
    route = inject(ActivatedRoute);
    private ngZone = inject(NgZone);
    dateTimeUtils = inject(DateTimeUtils);
    private timeUpdateInterval: any;


    @ViewChild('searchInput') searchInput!: ElementRef;

    set convID(val: string) {
        this._convID.set(val);
    }
    get convID() {
        return this._convID();
    }
    private _convID = signal<string>('');
    
    // Shortcuts to convStore signals
    conversations = this.convStore.conversations;
    onlineUsers = this.convStore.onlineUsers;
    UserPresence = this.convStore.userPresence;
    
    currentUserId = computed(() => this.authService.getUserId());

    toggleConversationInfor() {
        this.convStore.toggleConversationInfor();
    }

    userBlock = signal<any[]>([]);

    // Conversation selection state (synchronized with store)
    selectedConversationId = computed(() => this.convStore.activeConversationId() || '');
    selectedConversationType = '';
    getMessageInfor: any = {};
    isFirstConversationReady = signal(false);

    // Search state
    searchTerm = signal('');
    searchResults = signal<any[]>([]);
    isSearching = signal(false);
    isSearchView = signal(false);
    private searchSubject = new Subject<string>();

    // Create Group State
    friendService = inject(Friend);
    isCreateGroupModalOpen = signal(false);
    isLoadingFriends = signal(false);
    friends = signal<any[]>([]);
    selectedFriendIds = signal<Set<string>>(new Set());
    createGroupSearchQuery = signal('');
    createGroupError = signal('');
    isCreatingGroup = signal(false);

    private onUpdateParticipantSocket?: (data: any) => void;
    private onAddMemberSocket?: (data: any) => void;

    private readUpdateInFlightByConversation = new Map<string, boolean>();
    private pendingReadMessageIdByConversation = new Map<string, string>();
    private activeMessagesLayout?: {
        applySummaryTrigger: (unreadCount: number, lastReadMessageId: string) => void;
    };
    private pendingSummaryTrigger?: {
        conversationId: string;
        unreadCount: number;
        lastReadMessageId: string;
    };
    activeConvMenuId: string | null = null;
    private destroy$ = new Subject<void>();

    constructor(
        private socketService: SocketService,
        public fileUtils: FileUtils
    ) {
        // Tự động đồng bộ ID hội thoại từ URL (Cần thiết cho Nested Routes và Refresh)
        const parseUrlId = () => {
            const match = this.router.url.match(/\/conversations\/([^/?#]+)/);
            return match ? match[1] : '';
        };

        // Khởi tạo giá trị ban đầu ngay khi component được tạo
        const initialId = parseUrlId();
        this._convID.set(initialId);
        if (initialId) {
            this.convStore.setActiveConversationId(initialId);
        }

        // Theo dõi sự thay đổi URL để cập nhật signal
        this.router.events.pipe(
            filter(e => e instanceof NavigationEnd),
            takeUntil(this.destroy$)
        ).subscribe(() => {
            const id = parseUrlId();
            this._convID.set(id);
            
            // Đồng bộ selection với route mới
            this.syncSelectionWithRoute();
        });

        effect(() => {
            const pendingId = this.navService.pendingConversationId();
            if (!pendingId) return;
            this.selectOrReloadConversation(pendingId);
        });

        effect(() => {
            const pendingUser = this.navService.pendingDirectConversationUser();
            if (!pendingUser?.id) return;
            this.openDirectConversationWithUser(pendingUser);
            this.navService.pendingDirectConversationUser.set(null);
        });


        // Optimization: Đã xóa loadConversations effect ở đây vì ActiveConversationService 
        // là một Singleton đã tự động handle việc load data dựa trên userId.
        // Việc component gọi lại sẽ gây ra duplicate API calls khi refresh/login.

        // Effect mới: Tự động chọn hội thoại từ URL khi dữ liệu đã tải xong (Sửa lỗi khi Refresh)
        effect(() => {
            // Chỉ chạy khi dữ liệu đã tải xong hoàn toàn từ Store
            if (!this.convStore.isDataLoaded()) return;

            const routeId = this._convID();
            const currentSelectedId = this.selectedConversationId();
            
            // Nếu có ID từ URL và chưa chọn đúng hội thoại ở sidebar, đồng bộ selection
            if (routeId && routeId !== currentSelectedId) {
                // console.log('Syncing selection after full data load:', routeId);
                this.syncSelectionWithRoute();
            }
        });

        // Effect mới: Tự động khôi phục hội thoại cuối cùng khi quay lại từ tab khác (New-feeds -> Chat)
        effect(() => {
            const routeId = this._convID();
            const lastId = this.convStore.activeConversationId();
            
            // Nếu truy cập vào /conversations (không ID) mà trước đó đã có hội thoại active
            if (!routeId && lastId && this.router.url === '/conversations') {
                // Chỉ xử lý tiếp nếu Store đã tải xong để có thể kiểm tra tồn tại của ID
                if (!this.convStore.isDataLoaded()) return;

                // Kiểm tra xem ID này có thực sự tồn tại trong danh sách (hoặc là ID ảo hợp lệ)
                const exists = this.convStore.getConversationById(lastId) || lastId.startsWith('conv_');
                if (exists) {
                    console.log('Restoring last active conversation:', lastId);
                    this.router.navigate(['/conversations', lastId], { replaceUrl: true });
                } else {
                    console.warn('[RESTORE] Skipping restore of invalid lastId:', lastId);
                    this.convStore.setActiveConversationId('');
                }
            }
        });
    }

    ngOnInit() {
        // Logic tìm kiếm
        this.searchSubject.pipe(
            debounceTime(300),
            distinctUntilChanged(),
            switchMap(term => {
                if (!term.trim()) {
                    this.isSearching.set(false);
                    return of({ metadata: { users: [] } });
                }
                this.isSearching.set(true);
                return this.searchService.searchUsers(term);
            }),
            takeUntil(this.destroy$)
        ).subscribe({
            next: (response: any) => {
                this.searchResults.set(response.metadata?.users || []);
                this.isSearching.set(false);
                this.cdr.markForCheck();
            },
            error: (err: any) => {
                console.error('Search error:', err);
                this.isSearching.set(false);
                this.cdr.markForCheck();
            }
        });

        // Đảm bảo tick luôn cập nhật đúng mỗi phút
    }


    ngOnDestroy() {
        this.destroy$.next();
        this.destroy$.complete();
        if (this.onUpdateParticipantSocket) this.socketService.off('updateParticipant', this.onUpdateParticipantSocket);
        if (this.onAddMemberSocket) this.socketService.off('addMember', this.onAddMemberSocket);
    }

    // ── Load Data ─────────────────────────────────────────
    // Đã loại bỏ loadConversations() redundant. Dùng loadInitialData của store trực tiếp.

    // Socket listeners moved to ActiveConversationService

    handleConversationCreated(newId: string, realParticipants?: any[]) {
        const oldId = this.selectedConversationId();
        this.convStore.setActiveConversationId(newId);

        // JOIN ROOM MỚI NGAY LẬP TỨC
        this.socketService.emit('joinConversation', newId);

        // Cập nhật trực tiếp trong mảng hội thoại để tránh reload toàn bộ danh sách
        const joined = this.conversations()?.homeConversationData?.joinedConversations;
        if (joined) {
            const index = joined.findIndex((c: any) => c.conversation_id === oldId);
            if (index !== -1) {
                // Thay thế ID ảo bằng ID thật
                joined[index].conversation_id = newId;

                
                // NẾU CÓ THÔNG TIN PARTICIPANTS THỰC, CẬP NHẬT LUÔN
                if (realParticipants) {
                    joined[index].participants = realParticipants;
                }

                // Cập nhật lại tham chiếu để Angular detect changes (vì OnPush)
                this.conversations.set({
                    ...this.conversations(),
                    homeConversationData: {
                        ...this.conversations().homeConversationData,
                        joinedConversations: [...joined],
                    },
                });

                // Cập nhật getMessageInfor ngay lập tức để tránh lỗi participant ID ảo
                const updatedConv = joined[index];
                if (this.selectedConversationId() === updatedConv.conversation_id) {
                    this.handleConversationID(updatedConv);
                }
            }
        }
        this.cdr.markForCheck();
    }

    // ── Conversation Selection ──────────────────────────────
    handleConversationID(conv: any) {
        // this.socketService.off('newMessage');
        const unreadCountOnClick = Number(conv?.unread_count || 0);
        const localLastReadMessageId = this.getLastReadMessageIdFromConversation(conv);
        this.pendingSummaryTrigger = {
            conversationId: String(conv?.conversation_id || ''),
            unreadCount: unreadCountOnClick,
            lastReadMessageId: localLastReadMessageId,
        };
        this.dispatchSummaryTrigger();

        this.convStore.setActiveConversationId(conv.conversation_id);
        this.selectedConversationType = conv.type;
        const selectedConv = this.conversations()?.homeConversationData?.joinedConversations?.find(
            (c: any) => c.conversation_id === this.selectedConversationId(),
        );
        const otherParticipant = selectedConv?.type === 'direct' ? this.getOtherParticipant(selectedConv) : null;
        this.getMessageInfor = {
            title: selectedConv?.title,
            participants: selectedConv?.participants,
            user_info: this.conversations()?.homeConversationData?.userInfo,
            type: selectedConv?.type,
            avatar_url: selectedConv?.avatar_url,
            other_participant: otherParticipant,
        };
        if (!this.isFirstConversationReady()) {
            this.isFirstConversationReady.set(true);
        }
        // this.navService.setView('messages'); // Loại bỏ để tránh xung đột điều hướng gây lỗi nháy và phải click 2 lần

        // Cập nhật URL khi chọn hội thoại
        if (this.convID !== conv.conversation_id) {
            this.router.navigate(['/conversations', conv.conversation_id], { replaceUrl: true });
        }

        // Logic "Đã đọc": reset count locally và notify server
        if (conv.unread_count > 0 || (conv.lastMessage && conv.last_read_message_id !== conv.lastMessage.id)) {
            const currentParticipant = conv.participants.find((p: any) => p.user_id === this.currentUserId());

            if (currentParticipant && conv.lastMessage?.id) {
                // 1. Reset cục bộ để UI mất badge ngay lập tức
                conv.unread_count = 0;
                conv.last_read_message_id = conv.lastMessage.id;
                conv.participants = conv.participants?.map((p: any) =>
                    p.user_id === this.currentUserId()
                        ? { ...p, last_read_message_id: conv.lastMessage.id }
                        : p
                );

                // 2. Gọi API để lưu vào Database
                this.queueParticipantReadUpdate(conv.conversation_id, currentParticipant.id, conv.lastMessage.id);
            }
        }
    }

    private getLastReadMessageIdFromConversation(conv: any): string {
        const currentParticipant = conv?.participants?.find((p: any) => p.user_id === this.currentUserId());
        const participantLastReadMessageId = currentParticipant?.last_read_message_id
            ? String(currentParticipant.last_read_message_id)
            : '';
        const conversationLastReadMessageId = conv?.last_read_message_id
            ? String(conv.last_read_message_id)
            : '';

        return participantLastReadMessageId || conversationLastReadMessageId;
    }

    onMessagesLayoutActivate(component: any) {
        if (component && typeof component.applySummaryTrigger === 'function') {
            this.activeMessagesLayout = component;
            this.dispatchSummaryTrigger();
        }
    }

    private dispatchSummaryTrigger() {
        if (!this.pendingSummaryTrigger || !this.activeMessagesLayout) return;
        if (
            this.pendingSummaryTrigger.conversationId &&
            this.pendingSummaryTrigger.conversationId !== String(this.selectedConversationId())
        ) {
            return;
        }
        this.activeMessagesLayout.applySummaryTrigger(
            this.pendingSummaryTrigger.unreadCount,
            this.pendingSummaryTrigger.lastReadMessageId,
        );
    }

    private queueParticipantReadUpdate(conversationId: string, participantId: string, lastReadMessageId: string) {
        if (!participantId || participantId.startsWith('par_')) {
            console.warn('[SYNC] Skipping read update for virtual participant:', participantId);
            return;
        }

        if (!conversationId || !lastReadMessageId) return;

        this.pendingReadMessageIdByConversation.set(conversationId, lastReadMessageId);
        if (this.readUpdateInFlightByConversation.get(conversationId)) return;

        const flush = () => {
            const latestMessageId = this.pendingReadMessageIdByConversation.get(conversationId);
            if (!latestMessageId) return;

            this.readUpdateInFlightByConversation.set(conversationId, true);
            this.participantService.putParticipant({
                id: participantId,
                last_read_message_id: latestMessageId
            }).subscribe({
                next: () => {
                    this.socketService.emit('updateParticipant', {
                        conversation_id: conversationId,
                        user_id: this.currentUserId(),
                        last_read_message_id: latestMessageId,
                        participant_id: participantId
                    });

                    const newestPending = this.pendingReadMessageIdByConversation.get(conversationId);
                    if (newestPending === latestMessageId) {
                        this.pendingReadMessageIdByConversation.delete(conversationId);
                        this.readUpdateInFlightByConversation.set(conversationId, false);
                        return;
                    }

                    this.readUpdateInFlightByConversation.set(conversationId, false);
                    flush();
                },
                error: (err) => {
                    this.readUpdateInFlightByConversation.set(conversationId, false);
                    console.error('Error marking as read:', err);
                }
            });
        };

        flush();
    }


    createConversation() {
        this.navService.openFriendsSuggestions();
    }

    openCreateGroupModal() {
        if (!this.currentUserId()) return;
        this.createGroupError.set('');
        this.selectedFriendIds().clear();
        this.createGroupSearchQuery.set('');
        this.isCreateGroupModalOpen.set(true);
        this.loadFriendsForGroup();
    }

    closeCreateGroupModal() {
        this.isCreateGroupModalOpen.set(false);
        this.selectedFriendIds().clear();
        this.createGroupSearchQuery.set('');
        this.createGroupError.set('');
    }

    loadFriendsForGroup() {
        const uid = this.currentUserId();
        if (!uid) return;
        this.isLoadingFriends.set(true);
        this.friendService.getFriendByUserId(uid).subscribe({
            next: (res: any) => {
                const rawFriends = res?.metadata?.friends || [];
                this.friends.set(rawFriends.map((f: any) => ({
                    ...f,
                    full_name: f.friend?.full_name || f.full_name || 'Người dùng',
                    avatar_url: f.friend?.avatar_url || f.avatar_url || 'assets/AvatarDefault.jpg',
                    email: f.friend?.email || f.email || '',
                    friend_id: f.friend_id || f.id
                })));
                this.isLoadingFriends.set(false);
                this.cdr.detectChanges();
            },
            error: (err) => {
                this.isLoadingFriends.set(false);
                this.createGroupError.set('Không thể tải danh sách bạn bè.');
                this.cdr.detectChanges();
            }
        });
    }

    toggleFriendSelectionForGroup(friendId: string, checked: boolean) {
        const selected = this.selectedFriendIds();
        if (checked) {
            selected.add(friendId);
        } else {
            selected.delete(friendId);
        }
        this.selectedFriendIds.set(new Set(selected));
    }

    get filteredFriendsForGroup() {
        const friendsList = this.friends();
        const query = this.createGroupSearchQuery().toLowerCase().trim();
        if (!query) return friendsList;
        return friendsList.filter(f =>
            f.full_name?.toLowerCase().includes(query) ||
            f.email?.toLowerCase().includes(query)
        );
    }

    submitCreateGroup() {
        const selectedIds = Array.from(this.selectedFriendIds());
        if (selectedIds.length < 2) {
            this.createGroupError.set('Bạn phải chọn ít nhất 2 người.');
            return;
        }

        this.isCreatingGroup.set(true);
        this.createGroupError.set('');

        const selectedFriends = this.friends().filter(f => selectedIds.includes(f.friend_id));
        const names = selectedFriends.map(f => f.full_name);
        const groupName = names.join(', ');

        this.conversationService.createGroup(selectedIds, groupName).subscribe({
            next: (res: any) => {
                this.isCreatingGroup.set(false);
                const newConv = res.metadata?.newConversation;
                if (newConv && newConv.conv) {
                    this.socketService.emit('notifyNewConversation', {
                        receiverIds: [...selectedIds, this.currentUserId()],
                        conversationId: newConv.conv.id,
                        conversation_id: newConv.conv.id, // Thêm cho đúng với ActiveConversationService
                    });
                    
                    this.socketService.emit('joinConversation', newConv.conv.id);
                    
                    this.router.navigate(['/conversations', newConv.conv.id]);
                }
                this.closeCreateGroupModal();
            },
            error: (err) => {
                this.isCreatingGroup.set(false);
                this.createGroupError.set('Gặp lỗi khi tạo nhóm. Vui lòng thử lại.');
            }
        });
    }

    private resetToWelcome() {
        this.selectedConversationType = '';
        this.getMessageInfor = {};
        this.convStore.toggleConversationInfor(false);
        // Xóa ID hoạt động cuối cùng để tránh vòng lặp khôi phục tự động
        this.convStore.setActiveConversationId('');
        if (!this.isFirstConversationReady()) {
            this.isFirstConversationReady.set(true);
        }
        // Quay về route mặc định
        if (this.convID) {
            this.router.navigate(['/conversations']);
        }
    }

    private syncSelectionWithRoute() {
        if (!this.convID) {
            // Chỉ thực hiện reset hoàn toàn UI nếu Store cũng đã rỗng (do click Logo)
            // Nếu Store vẫn còn ID, ta để effect Auto-restore xử lý việc redirect.
            if (!this.convStore.activeConversationId()) {
                this.resetToWelcome();
            }
            return;
        }

        // Nếu ID trong URL khác với ID đang active trong Store, cập nhật lại
        if (String(this.convStore.activeConversationId()) !== String(this.convID)) {
            const found = this.convStore.getConversationById(this.convID);
            if (found) {
                this.handleConversationID(found);
            } else if (this.convID.startsWith('conv_')) {
                // Xử lý trường hợp ID ảo
                this.convStore.setActiveConversationId(this.convID);
            }
        }
    }

    private selectOrReloadConversation(conversationId: string) {
        const found = this.convStore.getConversationById(conversationId);
        if (found) {
            this.handleConversationID(found);
            this.navService.pendingConversationId.set(null);
        } else {
            this.conversationService.getConversations(this.currentUserId()).subscribe({
                next: (response: any) => {
                    const metadata = response.metadata || {};
                    this.convStore.conversations.set(metadata);
                    const newJoined = metadata.homeConversationData?.joinedConversations || [];
                    newJoined.forEach((conv: any) =>
                        this.socketService.emit('joinConversation', conv.conversation_id)
                    );
                    const target = newJoined.find((c: any) => String(c.conversation_id) === String(conversationId));
                    if (target) {
                        this.handleConversationID(target);
                    }
                    this.navService.pendingConversationId.set(null);
                },
                error: () => {
                    this.navService.pendingConversationId.set(null);
                }
            });
        }
    }

    hasConversations(): boolean {
        return (this.conversations()?.homeConversationData?.joinedConversations?.length || 0) > 0;
    }

    // ── Helpers ────────────────────────────────────────────
    getOtherParticipant(conv: any): any {
        if (conv.participants?.length !== 2) return null;
        return conv.participants.find((p: any) => String(p.user_id) !== String(this.currentUserId()));
    }

    isUserOnline(userId: string): boolean {
        // return this.onlineUsers().has(userId);
        return this.UserPresence().get(userId)?.status === 'online';
    }


    hasOnlineUser(conv: any): boolean {
        if (!conv.participants) return false;
        return conv.participants.some((p: any) => String(p.user_id) !== String(this.currentUserId()) && this.isUserOnline(p.user_id));
    }

    getLastMessageSenderName(conv: any): string {
        const { lastMessage, participants } = conv ?? {};
        if (!lastMessage) return '';
        const isSystem = lastMessage.message_type === 'system';
        
        // Nếu là tin nhắn hệ thống và đã có tag @[user_id] trong nội dung thì không cần hiện tên người gửi nữa
        if (isSystem && (lastMessage.content || '').includes('@[')) {
            return '';
        }

        const isCurrentUser = lastMessage.sender_id === this.currentUserId();
        const isDirectChat = participants.length < 3;
        if (isDirectChat && !isCurrentUser) {
            if (!isSystem) return '';
            const sender = participants.find((p: any) => p.user_id === lastMessage.sender_id);
            return sender?.nick_name || sender?.full_name || 'Ai đó';
        }
        if (isCurrentUser) return isSystem ? 'Bạn' : 'Bạn:';
        const sender = participants.find((p: any) => p.user_id === lastMessage.sender_id);
        const name = sender?.nick_name || sender?.full_name || 'Ai đó';
        return isSystem ? name : `${name}:`;
    }

    getConversationTitle(conv: any): string {
        if (!conv) return '';
        if (conv.type === 'direct') {
            const other = this.getOtherParticipant(conv);
            return other?.nick_name || other?.full_name || conv.title;
        }
        return conv.title;
    }

    formatMessageText(content: string | null | undefined, participants?: any[], isHtml: boolean = false): string {
        if (!content) return '';

        // Thay thế @[currentUserId] bằng "Bạn"
        const currentUserId = this.currentUserId();
        const replacedContent = content.replace(new RegExp(`@\\[${currentUserId}\\]`, 'g'), 'Bạn');

        // Nếu content chứa HTML (bot message, system message...) → strip tags, collapse whitespace
        if (isHtml || /<[a-z][\s\S]*>/i.test(replacedContent)) {
            const stripped = replacedContent
                .replace(/<[^>]+>/g, ' ')   // bỏ tất cả HTML tags
                .replace(/\s+/g, ' ')        // collapse whitespace/newlines thành 1 khoảng trắng
                .trim();
            return this.linkPreviewUtils.formatMessageText(stripped, participants || []);
        }

        // Plain text: collapse newlines thành space cho sidebar preview
        const singleLineContent = replacedContent.replace(/\n/g, ' ');
        return this.linkPreviewUtils.formatMessageText(singleLineContent, participants || []);
    }

    relativeTime(dateInput: string | Date): string {
        this.convStore.timeTick();
        return this.dateTimeUtils.relativeTime(dateInput);
    }

    // ── Search Actions ─────────────────────────────────────
    onSearch(event: any) {
        const term = event.target.value;
        this.searchTerm.set(term);
        this.searchSubject.next(term);
    }

    enterSearch() {
        this.isSearchView.set(true);
        setTimeout(() => {
            if (this.searchInput) {
                this.searchInput.nativeElement.focus();
            }
        }, 50);
    }

    exitSearch() {
        this.isSearchView.set(false);
        this.searchTerm.set('');
        this.searchResults.set([]);
        this.cdr.markForCheck();
    }

    selectSearchResult(item: any) {
        // Clear search
        this.exitSearch();

        if (item.is_group) {
            this.router.navigate(['/conversations', item.id]);
        } else {
            this.openDirectConversationWithUser(item);
        }
    }

    private openDirectConversationWithUser(user: DirectConversationTarget) {
        if (!user?.id) return;

        // Find existing direct conversation with this user
        const joined = this.convStore.joinedConversations();
        const existingConv = joined.find((c: any) =>
            c.type === 'direct' && c.participants.some((p: any) => String(p.user_id) === String(user.id))
        );

        if (existingConv) {
            this.handleConversationID(existingConv);
            this.router.navigate(['/conversations', existingConv.conversation_id]);
        } else {
            const randomId1 = Math.random().toString(36).substring(2, 10);
            const randomId2 = Math.random().toString(36).substring(2, 10);
            const userInfo = this.convStore.conversations()?.homeConversationData?.userInfo;

            const newConv = {
                conversation_id: 'conv_' + randomId1,
                type: 'direct',
                title: user.full_name,
                avatar_url: user.avatar_url,
                participants: [
                    {
                        id: 'par_' + randomId1,
                        user_id: this.currentUserId(),
                        full_name: userInfo?.full_name,
                        avatar_url: userInfo?.avatar_url,
                        last_online_at: userInfo?.last_online_at,
                    },
                    {
                        id: 'par_' + randomId2,
                        user_id: user.id,
                        full_name: user.full_name,
                        avatar_url: user.avatar_url,
                        last_online_at: user.last_online_at,
                    },
                ],
                last_message: null,
                unread_count: 0,
                updated_at: new Date().toISOString(),
            };

            this.convStore.conversations.update(cur => {
                const joined = cur?.homeConversationData?.joinedConversations || [];
                return {
                    ...cur,
                    homeConversationData: {
                        ...cur?.homeConversationData,
                        joinedConversations: [newConv, ...joined]
                    }
                };
            });
            this.handleConversationID(newConv);
            this.router.navigate(['/conversations', newConv.conversation_id]);
        }
    }

    toggleConvMenu(event: MouseEvent, convId: string) {
        event.stopPropagation();
        if (this.activeConvMenuId === convId) {
            this.activeConvMenuId = null;
        } else {
            this.activeConvMenuId = convId;
        }
    }

    pinConversation(event: MouseEvent, conv: any) {
        event.stopPropagation();
        const newPinnedStatus = !conv.is_pinned;
        console.log(newPinnedStatus ? 'Pinning' : 'Unpinning', 'conversation:', conv.conversation_id);

        const currentParticipant = conv.participants?.find((p: any) => p.user_id === this.currentUserId());
        if (!currentParticipant?.id) {
            console.error('Participant ID not found for current user');
            return;
        }

        this.activeConvMenuId = null;
        this.participantService.putParticipant({ id: currentParticipant.id, is_pinned: newPinnedStatus }).subscribe({
            next: () => {
                conv.is_pinned = newPinnedStatus;
                console.log('Conversation status updated successfully');
                this.sortConversations();
            },
            error: () => {
                console.log('Failed to update conversation status');
            }
        });
    }

    isMuted(conv: any): boolean {
        const me = conv?.participants?.find((p: any) => String(p.user_id) === String(this.currentUserId()));
        // console.log('[isMuted] conv:', conv?.conversation_id, 'me:', me?.user_id, 'is_muted:', me?.is_muted);
        return me?.is_muted === true || me?.is_muted === 1 || me?.is_muted === '1';
    }

    muteConversation(event: MouseEvent, conv: any) {
        event.stopPropagation();
        const currentParticipant = conv.participants?.find((p: any) => String(p.user_id) === String(this.currentUserId()));
        if (!currentParticipant?.id) {
            console.error('Participant ID not found for current user');
            return;
        }
        const newMutedStatus = !currentParticipant.is_muted;
        this.activeConvMenuId = null;
        
        this.participantService.putParticipant({ id: currentParticipant.id, is_muted: newMutedStatus }).subscribe({
            next: () => {
                this.convStore.conversations.update(cur => {
                    if (!cur?.homeConversationData?.joinedConversations) return cur;
                    const updated = cur.homeConversationData.joinedConversations.map((c: any) => {
                        if (String(c.conversation_id) === String(conv.conversation_id)) {
                            const updatedParticipants = c.participants?.map((p: any) => {
                                if (String(p.user_id) === String(this.currentUserId())) {
                                    return { ...p, is_muted: newMutedStatus };
                                }
                                return p;
                            });
                            return { ...c, participants: updatedParticipants };
                        }
                        return c;
                    });
                    return {
                        ...cur,
                        homeConversationData: { ...cur.homeConversationData, joinedConversations: updated }
                    };
                });
                console.log('Conversation mute status updated successfully');
            },
            error: (err) => {
                console.error('Failed to update mute status:', err);
            }
        });
    }

    @HostListener('document:click', ['$event'])
    onDocumentClick(event: MouseEvent) {
        // Only process clicks when a menu is actually open (avoids running on every app click)
        if (this.activeConvMenuId === null) return;
        const target = event.target as HTMLElement;
        const isClickInside = target.closest('.conv-actions-inline');
        if (!isClickInside) {
            this.activeConvMenuId = null;
        }
    }

    private sortConversations() {
        this.convStore.conversations.update(cur => {
            const joined = cur?.homeConversationData?.joinedConversations;
            if (!joined) return cur;

            const sorted = [...joined].sort((a: any, b: any) => {
                if (a.is_pinned && !b.is_pinned) return -1;
                if (!a.is_pinned && b.is_pinned) return 1;

                const timeA = new Date(a.lastMessage?.created_at || a.updated_at || 0).getTime();
                const timeB = new Date(b.lastMessage?.created_at || b.updated_at || 0).getTime();
                return timeB - timeA;
            });

            return {
                ...cur,
                homeConversationData: {
                    ...cur.homeConversationData,
                    joinedConversations: sorted
                }
            };
        });
    }
}
