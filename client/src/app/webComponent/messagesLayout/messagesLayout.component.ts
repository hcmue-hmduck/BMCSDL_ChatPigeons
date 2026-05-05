import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { CommonModule } from '@angular/common';
import {
    AfterViewChecked,
    AfterViewInit,
    Component,
    ElementRef,
    HostBinding,
    HostListener,
    Input,
    OnDestroy,
    OnInit,
    ViewChild,
    effect,
    inject,
    signal,
    untracked,
    computed,
    ChangeDetectorRef,
    Output,
    EventEmitter,
    ChangeDetectionStrategy,
    NgZone,
    CUSTOM_ELEMENTS_SCHEMA
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { PickerModule } from '@ctrl/ngx-emoji-mart';
import { finalize, forkJoin, Observable, from, concatMap, tap, firstValueFrom } from 'rxjs';
import { GROUP_CALL, SendCallPayload } from '../../models/callData';
import { AuthService } from '../../services/authService';
import { CallService } from '../../services/callService';
import { Conversation } from '../../services/conversation';
import { Messages } from '../../services/messages';
import { PinMessages } from '../../services/pin_message';
import { SocketService } from '../../services/socket';
import Swal from 'sweetalert2';
import { UploadService } from '../../services/uploadService';
import { Participant } from '../../services/participant';
import { FileUtils } from '../../utils/FileUtils/fileUltils';
import { ImgVidUtils } from '../../utils/img_vidUtils/img_vidUtils';
import { LinkPreviewUtils } from '../../utils/LinkUtils/linkPreviewUtils';
import { DateTimeUtils } from '../../utils/DateTimeUtils/datetimeUtils';
import { GroupAvatarLayoutComponent } from '../groupAvatarLayout/groupAvatarLayout.component';
import { MessageReactions } from '../../services/messagereactions';
import { ActiveConversationService } from '../../services/activeConversation.service';
import { MessageStoreService } from '../../services/messageStore.service';
import { Router } from '@angular/router';

export interface UserPresence {
    status: string;
    last_online_at: string | Date;
}

export interface StagedFile {
    file: File;
    previewUrl: string;
    isImage: boolean;
    isVideo: boolean;
    name: string;
    size: number;
}

@Component({
    selector: 'messages-layout',
    standalone: true,
    imports: [
        CommonModule,
        FormsModule,
        PickerModule,
        GroupAvatarLayoutComponent,
    ],
    templateUrl: './messagesLayout.component.html',
    styleUrls: ['./messagesLayout.component.css'],
    changeDetection: ChangeDetectionStrategy.OnPush,
    schemas: [CUSTOM_ELEMENTS_SCHEMA]
})
export class MessagesLayoutComponent
    implements OnInit, AfterViewInit, AfterViewChecked, OnDestroy {

    @HostBinding('class.viewer-open')
    get viewerOpenClass(): boolean {
        return this.mediaViewer?.isOpen ?? false;
    }

    callService = inject(CallService);
    authService = inject(AuthService);
    linkPreviewUtils = inject(LinkPreviewUtils);
    dateTimeUtils = inject(DateTimeUtils);
    private cdr = inject(ChangeDetectorRef);
    private sanitizer = inject(DomSanitizer);
    private ngZone = inject(NgZone);
    private router = inject(Router);
    private timeUpdateInterval: any;

    getMessagesData = signal<any>({
        homeMessagesData: {
            messages: [],
            conversation_type: '',
            pinnedMessages: [],
        },
    });

    loading = false;
    error = '';
    newMessage: string = '';
    messageStatus = signal('Đã gửi');

    convStore = inject(ActiveConversationService);
    messageStore = inject(MessageStoreService);

    @Input() set convID(val: string) {
        if (val && val !== this.conversationId()) {
            // Proactive Guard: If list is loaded, check if ID is actually valid or virtual
            if (this.convStore.isDataLoaded()) {
                const isValid = this.convStore.getConversationById(val);
                const isVirtual = val.startsWith('conv_');
                if (!isValid && !isVirtual) {
                    console.warn('[GUARD] Instant redirect for bad ID:', val);
                    this.convStore.setActiveConversationId('');
                    this.router.navigate(['/conversations']);
                    return;
                }
            }

            this.resetComponentState();
            this.conversationId.set(val);
            this.loadMessages(val);
            this.setupSocketListener(val);
        }
    }

    private resetComponentState() {
        this.loading = true;
        this.activeScrollRequestId++; // Cancel any ongoing scrollToMessage attempts
        
        // Clear data to prevent ghosting
        this.getMessagesData.set({
            homeMessagesData: {
                messages: [],
                conversation_type: '',
                pinnedMessages: [],
            },
        });
        this.pinnedMessages.set([]);
        this.typingUsers.set([]);
        
        // Emits stopTyping for the old conversation if we left while typing
        if (this.isTyping) {
            this.isTyping = false;
            this.socketService.emit('stopTyping', {
                conversation_id: this.conversationId(),
                user_id: this.currentUserId()
            });
        }
        // Reset flags
        this.isLoaded = false;
        this.error = '';
        this.newMessage = '';
        
        // Clear active timeouts
        if (this.highlightTimeout) clearTimeout(this.highlightTimeout);
        if (this.scrollTimeout) clearTimeout(this.scrollTimeout);
        if (this.typingTimeout) clearTimeout(this.typingTimeout);
        
        // Reset scroll position indicator
        this.autoScroll = true;
        this.isNearBottom = true;
        this.pendingScroll = true; // Ensure next cycle cleans up any remaining offsets

        // Cố định scroll về đáy ngay lập tức để tránh jitter của đoạn chat cũ
        if (this.messagesContent) {
            this.messagesContent.nativeElement.scrollTop = 0;
        }
    }
    conversationId = signal<string>('');

    // Computed signals based on convStore and conversationId
    currentUserId = computed(() => this.authService.getUserId());
    onlineUsers = computed(() => this.convStore.onlineUsers());
    UserPresence = computed(() => this.convStore.userPresence());
    userBlock = computed(() => this.convStore.userBlock());
    
    currentConversation = computed(() => this.convStore.getConversationById(this.conversationId()));
    
    conversationType = computed(() => this.currentConversation()?.type || '');
    
    

    getMessageInfor = computed(() => {
        const conv = this.currentConversation();
        if (!conv) return {};
        return {
            title: conv.title,
            participants: conv.participants,
            user_info: this.convStore.conversations()?.homeConversationData?.userInfo,
            type: conv.type,
            avatar_url: conv.avatar_url,
            other_participant: conv.type === 'direct' ? conv.participants.find((p: any) => String(p.user_id) !== String(this.currentUserId())) : null
        };
    });

    @Output() toggleDetails = new EventEmitter<void>();
    @Output() conversationCreated = new EventEmitter<string>();

    @ViewChild('messagesContent') messagesContent!: ElementRef<HTMLDivElement>;
    @ViewChild('messageInput', { static: false }) messageInput!: ElementRef<HTMLTextAreaElement>;
    @ViewChild('fileInput') fileInput!: ElementRef<HTMLInputElement>;

    autoScroll = true;
    isNearBottom = true;
    showScrollToBottom = false;

    // Check if a user is online
    isUserOnline(userId: string): boolean {
        return this.convStore.userPresence().get(userId)?.status === 'online';
    }

    getUserLastOnlineAt(participant: any): string | Date {
        const presence = this.convStore.userPresence().get(participant?.user_id);
        if (presence && presence.last_online_at) {
            return presence.last_online_at;
        }
        return participant?.last_online_at;
    }

    relativeTime(dateInput: string | Date): string {
        // Access timeTick signal to establish a reactive dependency
        // This ensures the template re-renders whenever the global tick changes
        this.convStore.timeTick();
        return this.dateTimeUtils.relativeTime(dateInput);
    }

    formatMessageText(content: string | null | undefined): string | SafeHtml {
        if (!content) return '';
        const participants = this.getMessageInfor()?.participants || [];

        return this.linkPreviewUtils.formatMessageText(content, participants);
    }

    getStoredLinkPreview(message: any): any | null {
        if (!message || message.message_type !== 'text') return null;
        if (!message.file_url || !message.thumbnail_url) return null;

        let hostname = '';
        try {
            hostname = new URL(message.file_url).hostname;
        } catch {
            hostname = '';
        }

        return {
            url: message.file_url,
            title: message.file_name || message.file_url,
            description: message.link_description || '',
            image: message.thumbnail_url || null,
            siteName: hostname,
            hostname,
        };
    }

    formatPinnedMessagePreview(pm: any): string {
        if (!pm) return '';
        const type = pm.message_type || 'text';
        let iconHtml = '';
        let text = pm.content || '';

        if (type === 'image') {
            iconHtml = '<i class="bi bi-image me-1"></i>';
            text = 'Hình ảnh';
        } else if (type === 'video') {
            iconHtml = '<i class="bi bi-camera-video me-1"></i>';
            text = 'Video';
        } else if (type === 'file') {
            const iconClass = this.fileUtils.getAttachmentIconClass({ message_type: 'file', file_name: pm.file_name });
            iconHtml = `<i class="bi ${iconClass} me-1"></i> `;
            text = pm.file_name || 'Tệp đính kèm';
        } else if (type === 'call') {
            iconHtml = '<i class="bi bi-telephone me-1"></i>';
            text = 'Cuộc gọi';
        }

        return `${iconHtml}${text}`;
    }

    // Plain-text preview dùng cho system message (không chứa HTML tag)
    private pinnedMessagePreviewText(pm: any): string {
        if (!pm) return '';
        const type = pm.message_type || 'text';
        if (type === 'image') return '<i class="bi bi-image me-1"></i>Hình ảnh';
        if (type === 'video') return '<i class="bi bi-camera-video me-1"></i>Video';
        if (type === 'file') return `<i class="bi bi-paperclip me-1"></i>${pm.file_name || 'Tệp đính kèm'}`;
        if (type === 'call') return '<i class="bi bi-telephone me-1"></i>Cuộc gọi';
        return pm.content || '';
    }

    getPinnedMessage(msgId: string): any | null {
        return this.pinnedMessages().find(pm => pm.message_id === msgId) || null;
    }

    closedPreviewUrls = new Set<string>();

    clearLinkPreview() {
        const preview = this.activeComposerLinkPreview();
        const url = preview?.url || this.linkPreviewUtils.extractFirstUrl(this.newMessage);
        
        if (url) {
            this.closedPreviewUrls.add(url);
        }
        
        // Immediately clear the state
        this.activeComposerLinkPreview.set(null);
        this.cdr.markForCheck();
    }


    isLoaded = false;
    hasNewMessage = false; // Track new messages when scrolled up

    // Pagination state
    hasMore = true; // Còn tin nhắn cũ hơn để load
    isLoadingMore = false; // Đang load thêm tin nhắn
    currentOffset = 0; // Vị trí hiện tại (số messages đã load)

    // Link Preview state
    activeComposerLinkPreview = signal<any | null>(null);
    lastMessageId = ''; // ID của tin nhắn cuối cùng đã load

    private scrollTimeout: any;
    private activeScrollRequestId = 0;
    private lastConversationId: string = ''; // Track conversation changes
    private pendingScroll = false; // Flag to scroll in ngAfterViewChecked
    private needsFocus = true; // Flag to auto-focus input

    // Cache để tránh tính toán lặp lại

    // Menu state
    showMenuId: string | number | null = null;
    reactionPickerMessageId: string | number | null = null;
    reactionPickerDropUpId: string | number | null = null;
    showReactionModal = signal(false);
    reactionDetails = signal<any[]>([]);
    readonly quickReactionEmojis: string[] = ['👍', '❤️', '🥰', '😂', '😮', '😢', '😡'];
    readonly reactionLottieUrls: Record<string, string> = {
        '👍': 'https://fonts.gstatic.com/s/e/notoemoji/latest/1f44d/lottie.json',
        '❤️': 'https://fonts.gstatic.com/s/e/notoemoji/latest/2764_fe0f/lottie.json',
        '🥰': 'https://fonts.gstatic.com/s/e/notoemoji/latest/1f917/lottie.json',
        '😂': 'https://fonts.gstatic.com/s/e/notoemoji/latest/1f602/lottie.json',
        '😮': 'https://fonts.gstatic.com/s/e/notoemoji/latest/1f62e/lottie.json',
        '😢': 'https://fonts.gstatic.com/s/e/notoemoji/latest/1f622/lottie.json',
        '😡': 'https://fonts.gstatic.com/s/e/notoemoji/latest/1f621/lottie.json'
    };
    private isSyncingReaction = signal(false);

    // Typing state
    typingUsers = signal<any[]>([]);
    private isTyping = false;
    private typingTimeout: any;

    // Mention state
    showMentionList = signal(false);
    mentionSearchTerm = signal('');
    mentionSelectedIndex = signal(0);
    private mentionLastIndex = -1;
    private savedSelectionRange: Range | null = null;

    mentionParticipants = computed(() => {
        const term = this.mentionSearchTerm().toLowerCase();
        const participants = this.getMessageInfor()?.participants || [];
        if (!term) return participants.filter((p: any) => p.user_id !== this.currentUserId());
        return participants.filter((p: any) =>
            p.user_id !== this.currentUserId() &&
            (p.full_name?.toLowerCase().includes(term) || p.email?.toLowerCase().includes(term))
        );
    });

    // Highlight state for reply navigation
    highlightedMessageId: string | null = null;
    private highlightTimeout: any;

    mediaViewer!: ImgVidUtils;

    isChat = true;

    // Forward modal state
    showForwardModal = false;
    forwardingMessage: any = null;
    forwardConversations: any[] = [];
    selectedForwardConversationIds = new Set<string>();
    forwardLoading = false;
    forwardError = '';
    forwardSearch = '';

    // Pinned messages
    pinnedMessages = signal<any[]>([]);
    preUploadFiles = signal<StagedFile[]>([]);
    showPinnedDropdown = false;
    openPinnedMenuId: string | null = null;


    private onTypingSocket?: (data: any) => void;
    private onStopTypingSocket?: (data: any) => void;
    private onNewMessageSocket?: (data: any) => void;
    private onUpdateMessageSocket?: (data: any) => void;
    private onUpdateConversationSocket?: (data: any) => void;
    private onPinMessageSocket?: (data: any) => void;
    private onUnpinMessageSocket?: (data: any) => void;
    private onUpdateProfileSocket?: (data: any) => void;
    private onDeleteMessageSocket?: (data: any) => void;

    
    private pinnedMenuTimeout: any;

    onPinnedMenuMouseLeave() {
        this.pinnedMenuTimeout = setTimeout(() => {
            this.openPinnedMenuId = null;
            this.cdr.detectChanges(); // Use manual detection to ensure UI updates after timeout
        }, 100); // reduced delay for better feel
    }

    onPinnedMenuMouseEnter() {
        if (this.pinnedMenuTimeout) {
            clearTimeout(this.pinnedMenuTimeout);
            this.pinnedMenuTimeout = null;
        }
    }

    togglePinnedDropdown(event: Event) {
        event.stopPropagation();
        this.showPinnedDropdown = !this.showPinnedDropdown;
    }

    togglePinnedMenu(event: Event, id: string) {
        event.stopPropagation();
        this.openPinnedMenuId = this.openPinnedMenuId === id ? null : id;
    }

    unpinMessage(pm: any) {
        this.pinMessageService.unpinMessage(pm.id).subscribe({
            next: (response) => {
                this.pinnedMessages.update(prev => prev.filter(p => p.id !== pm.id));

                this.socketService.emit('unpinMessage', pm);

                const messageContent = `đã bỏ ghim tin nhắn: ${this.pinnedMessagePreviewText(pm)}`;
                this.postAndBroadcastMessage(messageContent, 'system');
            },
            error: (error: any) => {
                console.error('Error unpinning message:', error);
            }
        });
    }

    // Helper method to check if should show date separator
    shouldShowDateSeparator(currentMsg: any, prevMsg: any): boolean {
        return this.dateTimeUtils.shouldShowDateSeparator(currentMsg.created_at, prevMsg?.created_at);
    }

    get isImageViewerOpen(): boolean {
        return this.mediaViewer.isOpen && this.mediaViewer.type === 'image';
    }

    get currentViewerIndex(): number {
        return this.mediaViewer.currentIndex;
    }

    get viewerTotal(): number {
        return this.mediaViewer.items.length;
    }

    get viewerImageUrl(): string {
        return this.mediaViewer.mediaUrl;
    }

    get viewerZoom(): number {
        return this.mediaViewer.zoom;
    }

    get viewerZoomMin(): number {
        return this.mediaViewer.zoomMin;
    }

    get viewerZoomMax(): number {
        return this.mediaViewer.zoomMax;
    }

    get viewerPanX(): number {
        return this.mediaViewer.panX;
    }

    get viewerPanY(): number {
        return this.mediaViewer.panY;
    }

    get isViewerDragging(): boolean {
        return this.mediaViewer.isDragging;
    }

    private getImageViewerUrls(): string[] {
        const messages = this.getMessagesData().homeMessagesData?.messages || [];
        return messages
            .filter((msg: any) => msg.message_type === 'image' && !!msg.file_url)
            .map((msg: any) => msg.file_url);
    }

    openImageViewer(url: string) {
        const urls = this.getImageViewerUrls();
        if (urls.length === 0) return;
        const foundIndex = urls.findIndex(item => item === url);
        this.mediaViewer.openImageGallery(urls, foundIndex >= 0 ? foundIndex : 0);
    }

    closeImageViewer() {
        this.mediaViewer.closeViewer();
    }

    nextImage(event?: Event) {
        this.mediaViewer.next(event);
    }

    prevImage(event?: Event) {
        this.mediaViewer.prev(event);
    }

    zoomInViewer(event?: Event) {
        this.mediaViewer.zoomIn(event);
    }

    zoomOutViewer(event?: Event) {
        this.mediaViewer.zoomOut(event);
    }

    resetViewerZoom(event?: Event) {
        this.mediaViewer.resetTransform(event);
    }

    onViewerPointerDown(event: PointerEvent) {
        this.mediaViewer.onPointerDown(event);
    }

    onViewerPointerMove(event: PointerEvent) {
        this.mediaViewer.onPointerMove(event);
    }

    onViewerPointerUp(event?: PointerEvent) {
        this.mediaViewer.onPointerUp(event);
    }

    // --- Media rendering helpers ---
    // Get date string from message timestamp
    getMessageDate(dateStr: string): string {
        return this.dateTimeUtils.getMessageDate(dateStr);
    }

    // Format date label (Today, Yesterday, or specific date)
    formatDateLabel(dateStr: string): string {
        return this.dateTimeUtils.formatDateLabel(dateStr);
    }

    // Format time as HH:mm
    formatTime(dateStr: string): string {
        return this.dateTimeUtils.formatTime(dateStr);
    }

    constructor(
        private messagesService: Messages,
        private conversationService: Conversation,
        private participantService: Participant,
        private uploadService: UploadService,
        private messageReactionsService: MessageReactions,
        private pinMessageService: PinMessages,

        public fileUtils: FileUtils,
        private socketService: SocketService,
    ) {
        this.mediaViewer = new ImgVidUtils(this.fileUtils);
        this.initEffect();
    }

    initEffect() {
        // Tạo log join group call
        effect(() => {
            if (this.callService.logJoinGroupCall()) {
                const { content, conversationId } = this.callService.logJoinGroupCall()!;
                if (content && conversationId) {
                    this.updateUIWithNewMessage(content, conversationId);
                    this.broadcastMessage(content)
                }

                untracked(() => {
                    this.callService.logJoinGroupCall.set(null);
                })
            }
        })

        // Effect mới: Tự động đồng bộ Dữ liệu vào Cache (Service)
        effect(() => {
            const data = this.getMessagesData();
            const pinned = this.pinnedMessages();
            const convId = this.conversationId();
            const isLoaded = this.isLoaded;

            if (convId && isLoaded) {
                this.messageStore.setConversationState(convId, {
                    getMessagesData: data,
                    pinnedMessages: pinned,
                    messageReactions: this.convStore.globalReactions(),
                    lastMessageId: this.lastMessageId,
                    isLoaded: true
                });
            }
        });
    }

    // TrackBy function để tối ưu rendering
    trackByMessageId(index: number, message: any): any {
        // _trackId ổn định qua temp→real transition, Angular sẽ reuse DOM element thay vì destroy/recreate
        return message._trackId ?? message.id;
    }

    trackByConversationId(index: number, conv: any): any {
        return conv?.conversation_id ?? index;
    }

    // Handle file attachment
    handleFileAttachment() {
        this.fileInput.nativeElement.click();
    }

    private addFilesToStaging(files: File[]) {
        if (!files || files.length === 0) return;

        const newStagedFiles: StagedFile[] = files.map(file => ({
            file,
            previewUrl: (file.type.startsWith('image/') || file.type.startsWith('video/'))
                ? URL.createObjectURL(file)
                : '',
            isImage: file.type.startsWith('image/'),
            isVideo: file.type.startsWith('video/'),
            name: file.name,
            size: file.size,
        }));

        this.preUploadFiles.update(prev => [...prev, ...newStagedFiles]);
    }

    onFileSelected(event: Event) {
        const input = event.target as HTMLInputElement;
        if (!input.files || input.files.length === 0) return;

        const files = Array.from(input.files);
        this.addFilesToStaging(files);

        // Reset input value to allow selecting same file again
        input.value = '';
    }

    handleInputPaste(event: ClipboardEvent) {
        const clipboard = event.clipboardData;
        if (!clipboard) return;

        // 1. Handle Images
        const pastedImageFiles: File[] = [];
        const items = Array.from(clipboard.items);
        for (const item of items) {
            if (item.kind === 'file' && item.type.startsWith('image/')) {
                const file = item.getAsFile();
                if (file) pastedImageFiles.push(file);
            }
        }

        if (pastedImageFiles.length > 0) {
            this.addFilesToStaging(pastedImageFiles);
        }

        // 2. Handle Text (Normalizing to Plain Text to avoid HTML/Link-to-title issues)
        const pastedText = clipboard.getData('text/plain');
        if (pastedText) {
            event.preventDefault();
            // Insert as plain text at current cursor position
            document.execCommand('insertText', false, pastedText);
            
            // Sync state immediately
            this.onInput(event);
        } else if (pastedImageFiles.length > 0) {
            // If only images and no text, prevent default to avoid odd browser behavior
            event.preventDefault();
        }
    }

    removePreUploadFile(index: number) {
        this.preUploadFiles.update(files => {
            const fileToRemove = files[index];
            if (fileToRemove.previewUrl) {
                URL.revokeObjectURL(fileToRemove.previewUrl);
            }
            return files.filter((_, i) => i !== index);
        });
    }

    clearPreUploadFiles() {
        this.preUploadFiles().forEach(f => {
            if (f.previewUrl) URL.revokeObjectURL(f.previewUrl);
        });
        this.preUploadFiles.set([]);
    }


    // Handle voice recording
    handleVoiceRecording() {
        // TODO: Implement voice recording
        console.log('Voice recording clicked');
    }

    private detachMessageSocketListeners() {
        if (this.onNewMessageSocket) this.socketService.off('newMessage', this.onNewMessageSocket);
        if (this.onUpdateMessageSocket) this.socketService.off('updateMessage', this.onUpdateMessageSocket);
        if (this.onUpdateConversationSocket) this.socketService.off('updateConversation', this.onUpdateConversationSocket);
        if (this.onPinMessageSocket) this.socketService.off('pinMessage', this.onPinMessageSocket);
        if (this.onUnpinMessageSocket) this.socketService.off('unpinMessage', this.onUnpinMessageSocket);
        if (this.onUpdateProfileSocket) this.socketService.off('updateProfile', this.onUpdateProfileSocket);
        if (this.onDeleteMessageSocket) this.socketService.off('deleteMessage', this.onDeleteMessageSocket);
        if (this.onTypingSocket) this.socketService.off('typing', this.onTypingSocket);
        if (this.onStopTypingSocket) this.socketService.off('stopTyping', this.onStopTypingSocket);

        this.onNewMessageSocket = undefined;
        this.onUpdateMessageSocket = undefined;
        this.onUpdateConversationSocket = undefined;
        this.onPinMessageSocket = undefined;
        this.onUnpinMessageSocket = undefined;
        this.onUpdateProfileSocket = undefined;
        this.onDeleteMessageSocket = undefined;
        this.onTypingSocket = undefined;
        this.onStopTypingSocket = undefined;
    }

    setupSocketListener(conversationId: string) {
        // Cleanup listeners cũ của component này trước khi setup mới, không ảnh hưởng component khác
        this.detachMessageSocketListeners();

        this.socketService.emit('joinConversation', conversationId);

        // Setup listener cho tin nhắn mới
        this.onNewMessageSocket = (data: any) => {
            if (data.conversation_id === conversationId && data.sender_id !== this.currentUserId()) {
                this.lastMessageId = data.id;
                // Kiểm tra xem tin nhắn đã tồn tại chưa (tránh duplicate)
                const currentMessages = this.getMessagesData().homeMessagesData?.messages || [];
                const messageExists = currentMessages.some((msg: any) => msg.id === data.id);

                if (!messageExists) {
                    // Ensure parent_message_info includes parent_message_id for socket messages too
                    const messageToAdd = {
                        ...data,
                        parent_message_info: data.parent_message_info
                            ? {
                                ...data.parent_message_info,
                                parent_message_id: data.parent_message_id,
                            }
                            : null,
                    };

                    this.getMessagesData.update((old) => ({
                        ...old,
                        homeMessagesData: {
                            ...old.homeMessagesData,
                            messages: [...currentMessages, messageToAdd],
                        },
                    }));

                    // Tự động scroll xuống nếu đang ở gần cuối
                    if (this.isUserNearBottom()) {
                        this.pendingScroll = true;
                        this.persistReadState(data.id);
                    } else {
                        // Hiển thị badge "new" nếu user đang scroll ở trên
                        this.hasNewMessage = true;
                    }
                }
            }
        };
        this.socketService.on('newMessage', this.onNewMessageSocket);

        // Setup listener cho cập nhật tin nhắn
        this.onUpdateMessageSocket = (data: any) => {
            if (data.conversation_id === conversationId) {
                const isCallStatusUpdate = data?.message_type === 'call' || data?.call || data?.call_id;
                const targetMessageId = data.id || data.message_id;
                const targetCallId = data.call?.id || data.call_id;

                this.getMessagesData.update((old) => ({
                    ...old,
                    homeMessagesData: {
                        ...old.homeMessagesData,
                        messages: old.homeMessagesData.messages.map((msg: any) => {
                            if (isCallStatusUpdate) {
                                if (msg.message_type !== 'call') return msg;

                                const sameMessage =
                                    targetMessageId !== undefined &&
                                    targetMessageId !== null &&
                                    String(msg.id) === String(targetMessageId);
                                const sameCall =
                                    targetCallId !== undefined &&
                                    targetCallId !== null &&
                                    (String(msg.call?.id) === String(targetCallId) ||
                                        String(msg.call_id) === String(targetCallId));

                                if (!sameMessage && !sameCall) return msg;

                                return {
                                    ...msg,
                                    ...data,
                                    id: msg.id,
                                    call: {
                                        ...(msg.call || {}),
                                        ...(data.call || {}),
                                        ...(data.status ? { status: data.status } : {}),
                                    },
                                };
                            }

                            if (msg.id === data.id) {
                                return {
                                    ...msg,
                                    content: data.content,
                                    updated_at: new Date().toISOString(),
                                    is_edited: true
                                };
                            } else if (msg.parent_message_id === data.id) {
                                return {
                                    ...msg,
                                    parent_message_info: {
                                        ...msg.parent_message_info,
                                        parent_message_content: data.content,
                                    },
                                };
                            } else {
                                return msg;
                            }
                        }),
                    },
                }));

                // Update nội dung tin nhắn đã ghim nếu tin nhắn đó đang được ghim
                this.pinnedMessages.update(prev =>
                    prev.map(p => p.message_id === data.id
                        ? { ...p, content: data.content }
                        : p
                    )
                );
            }
        };
        this.socketService.on('updateMessage', this.onUpdateMessageSocket);

        // Đồng bộ thay đổi trạng thái call vào message list (pending/ongoing/completed/missed...)
        this.onUpdateConversationSocket = (data: any) => {
            if (data?.conversation_id !== conversationId) return;
            if (!(data?.message_type === 'call' || data?.call || data?.call_id)) return;

            const targetMessageId = data.id || data.message_id || data.last_message_id;
            const targetCallId = data.call?.id || data.call_id;

            this.getMessagesData.update((old) => ({
                ...old,
                homeMessagesData: {
                    ...old.homeMessagesData,
                    messages: old.homeMessagesData.messages.map((msg: any) => {
                        if (msg.message_type !== 'call') return msg;

                        const sameMessage =
                            targetMessageId !== undefined &&
                            targetMessageId !== null &&
                            String(msg.id) === String(targetMessageId);
                        const sameCall =
                            targetCallId !== undefined &&
                            targetCallId !== null &&
                            (String(msg.call?.id) === String(targetCallId) ||
                                String(msg.call_id) === String(targetCallId));

                        if (!sameMessage && !sameCall) return msg;

                        return {
                            ...msg,
                            ...data,
                            call: {
                                ...(msg.call || {}),
                                ...(data.call || {}),
                                ...(data.status ? { status: data.status } : {}),
                            },
                        };
                    }),
                },
            }));
        };
        this.socketService.on('updateConversation', this.onUpdateConversationSocket);

        // Setup listener cho pin tin nhắn
        this.onPinMessageSocket = (data: any) => {
            if (data.conversation_id === conversationId) {
                this.pinnedMessages.update(prev => [...prev, data]);
            }
        };
        this.socketService.on('pinMessage', this.onPinMessageSocket);

        this.onUnpinMessageSocket = (data: any) => {
            if (data.conversation_id === conversationId) {
                this.pinnedMessages.update(prev => prev.filter(p => p.id !== data.id));
            }
        };
        this.socketService.on('unpinMessage', this.onUnpinMessageSocket);

        this.onUpdateProfileSocket = (data: any) => {

            this.getMessagesData.update((old) => {
                // Nếu chưa có data thì return luôn
                if (!old.homeMessagesData || !old.homeMessagesData.messages) return old;

                return {
                    ...old,
                    homeMessagesData: {
                        ...old.homeMessagesData,
                        messages: old.homeMessagesData.messages.map((m: any) => {
                            if (m.sender_id === data.id) {
                                return {
                                    ...m,
                                    sender_name: data.full_name,
                                    sender_avatar: data.avatar_url
                                };
                            } else if (m.parent_message_info?.parent_message_sender_id === data.id) {
                                return {
                                    ...m,
                                    parent_message_info: {
                                        ...m.parent_message_info,
                                        parent_message_name: data.full_name,
                                        parent_message_avatar: data.avatar_url
                                    }
                                };
                            }
                            return m;
                        }),
                    },
                };
            });

            this.pinnedMessages.update((old) => {
                return old.map((m: any) => {
                    if (m.sender_id === data.id) {
                        return {
                            ...m,
                            sender_name: data.full_name
                        };
                    }

                    if (m.parent_message_info?.parent_message_sender_id === data.id) {
                        return {
                            ...m,
                            parent_message_info: {
                                ...m.parent_message_info,
                                parent_message_name: data.full_name
                            }
                        };
                    }
                    return m;
                });
            });
        };
        this.socketService.on('updateProfile', this.onUpdateProfileSocket);

        this.onTypingSocket = (data: any) => {
            if (data.conversation_id === conversationId && data.user_id !== this.currentUserId()) {
                this.typingUsers.update(users => {
                    if (!users.find(u => u.user_id === data.user_id)) {
                        return [...users, data];
                    }
                    return users;
                });
                this.cdr.markForCheck();
            }
        };
        this.socketService.on('typing', this.onTypingSocket);

        this.onStopTypingSocket = (data: any) => {
            if (data.conversation_id === conversationId) {
                this.typingUsers.update(users => users.filter(u => u.user_id !== data.user_id));
                this.cdr.markForCheck();
            }
        };
        this.socketService.on('stopTyping', this.onStopTypingSocket);

        // Setup listener cho xóa tin nhắn
        this.onDeleteMessageSocket = (data: any) => {
            if (data.conversation_id === conversationId) {
                this.getMessagesData.update((old) => ({
                    ...old,
                    homeMessagesData: {
                        ...old.homeMessagesData,
                        messages: old.homeMessagesData.messages.map((m: any) => {
                            // Mark the deleted message itself
                            if (m.id === data.id) {
                                return { ...m, is_deleted: true };
                            }
                            // Update messages that have this deleted message as parent
                            if (
                                m.parent_message_info &&
                                m.parent_message_info.parent_message_id === data.id
                            ) {
                                return {
                                    ...m,
                                    parent_message_info: {
                                        ...m.parent_message_info,
                                        parent_message_is_deleted: true,
                                    },
                                };
                            }
                            return m;
                        }),
                    },
                }));
            }
        };
        this.socketService.on('deleteMessage', this.onDeleteMessageSocket);
    }

    ngOnInit() {
        console.log('Online User', this.onlineUsers);
    }


    ngAfterViewInit() {
        // Scroll xuống dưới cùng sau khi view được khởi tạo
    }

    ngAfterViewChecked() {
        // Short-circuit: không làm gì nếu không có flag nào cần xử lý
        if (!this.pendingScroll && !this.needsFocus) return;

        if (this.pendingScroll && this.messagesContent?.nativeElement) {
            this.messagesContent.nativeElement.scrollTop = 0;
            this.pendingScroll = false;
        }

        if (this.needsFocus && this.messageInput?.nativeElement) {
            this.messageInput.nativeElement.focus();
            this.needsFocus = false;
        }
    }

    ngOnDestroy() {
        if (this.scrollTimeout) {
            clearTimeout(this.scrollTimeout);
        }
        if (this.typingTimeout) {
            clearTimeout(this.typingTimeout);
        }
        if (this.pinnedMenuTimeout) {
            clearTimeout(this.pinnedMenuTimeout);
        }
        // Cleanup listeners của component này, không chạm listener ở component khác
        this.detachMessageSocketListeners();

        if (this.highlightTimeout) {
            clearTimeout(this.highlightTimeout);
        }
    }

    loadMessages(conversationId: string) {
        if (!conversationId) return;

        const isVirtual = conversationId.startsWith('conv_');

        // 1. Kiểm tra Cache trước
        const cache = this.messageStore.getConversationState(conversationId);
        if (cache.isLoaded) {
            this.getMessagesData.set(cache.getMessagesData);
            this.pinnedMessages.set(cache.pinnedMessages);
            this.lastMessageId = cache.lastMessageId;
            this.loading = false;
            this.isLoaded = true;
            this.pendingScroll = true;

            const cachedMessages = cache.getMessagesData?.homeMessagesData?.messages || [];
            const cachedLatestMessage = [...cachedMessages].reverse().find((msg: any) => msg?.id);
            if (cachedLatestMessage) {
                queueMicrotask(() => this.persistReadState(cachedLatestMessage.id));
            }
        } else {
            this.isLoaded = false;
            this.loading = true;
        }

        this.reactionPickerMessageId = null;

        // --- NEW: Skip API call for virtual conversations ---
        if (isVirtual) {
            console.log('[LOAD] Virtual conversation detected, skipping API fetch:', conversationId);
            this.getMessagesData.set({
                homeMessagesData: {
                    messages: [],
                    conversation_type: 'direct',
                    pinnedMessages: [],
                },
            });
            this.loading = false;
            this.isLoaded = true;
            this.pendingScroll = true;
            return;
        }

        this.messagesService.getMessages(conversationId).subscribe({
            next: (response) => {
                const data = response.metadata || {};
                this.lastMessageId = data.homeMessagesData?.last_message_id || '';
                
                const messages = data.homeMessagesData?.messages || [];
                const pinned = data.homeMessagesData?.pinnedMessages || [];
                
                this.getMessagesData.set(data);
                this.pinnedMessages.set(pinned);
                this.loading = false;
                this.isLoaded = true;

                const latestLoadedMessage = [...messages].reverse().find((msg: any) => msg?.id);
                if (latestLoadedMessage) {
                    queueMicrotask(() => this.persistReadState(latestLoadedMessage.id));
                }

                // 2. Check if the conversation actually exists on the server
                if (data.is_not_found) {
                    console.warn('[REDIRECT] Invalid conversation ID detected, clearing state and navigating away:', conversationId);
                    this.convStore.setActiveConversationId('');
                    this.router.navigate(['/conversations']);
                    return;
                }

                // 2. Cập nhật Cache sau khi load thành công
                this.messageStore.setConversationState(conversationId, {
                    getMessagesData: data,
                    pinnedMessages: pinned,
                    messageReactions: this.convStore.globalReactions(),
                    lastMessageId: this.lastMessageId,
                    isLoaded: true
                });

                // ... setup reactions etc ...
                for (const msg of messages) {
                    if (msg.reactions && msg.reactions.length > 0) {
                        this.convStore.syncReactions(msg.id, msg.reactions, msg.countReactionMap);
                    }
                }

                this.currentOffset = messages.length;
                this.hasMore = data.homeMessagesData?.hasMore ?? true;

                const isConversationChange = this.lastConversationId !== conversationId;
                if (isConversationChange) {
                    this.lastConversationId = conversationId;
                    this.pendingScroll = true;
                }
            },
            error: (error: any) => {
                console.error('Error loading messages:', error);
                this.error = error.message;
                this.loading = false;
                this.isLoaded = true;
                // Redirect only if NOT virtual (real ID failed)
                this.convStore.setActiveConversationId('');
                this.router.navigate(['/conversations']);
            },
        });
    }

    // Load thêm tin nhắn cũ hơn khi scroll lên đầu
    loadMoreMessages() {
        if (this.isLoadingMore || !this.hasMore) return;

        this.isLoadingMore = true;

        this.messagesService.getMessages(this.conversationId(), 50, this.currentOffset).subscribe({
            next: (response) => {
                const olderMessages = response.metadata?.homeMessagesData?.messages || [];
                if (olderMessages.length === 0) {
                    this.hasMore = false;
                    this.isLoadingMore = false;
                    return;
                }

                // Prepend older messages vào đầu danh sách
                this.getMessagesData.update((old) => ({
                    ...old,
                    homeMessagesData: {
                        ...old.homeMessagesData,
                        messages: [...olderMessages, ...old.homeMessagesData.messages],
                    },
                }));

                // Đồng bộ reaction map cho batch vừa load thêm để UI hiển thị chính xác.
                for (const msg of olderMessages) {
                    if (msg.reactions && msg.reactions.length > 0) {
                        this.convStore.syncReactions(msg.id, msg.reactions, msg.countReactionMap || {});
                    }
                }

                this.currentOffset += olderMessages.length;
                this.hasMore = response.metadata?.homeMessagesData?.hasMore ?? false;
                this.isLoadingMore = false;
            },
            error: (error: any) => {
                console.error('Error loading more messages:', error);
                this.isLoadingMore = false;
            },
        });
    }

    getLastMessageSenderName(sender_id: string, sender_name: string): string {
        if (sender_id === this.currentUserId()) return 'Bạn ';
        return sender_name ? sender_name : 'Ai đó';
    }

    private broadcastMessage(message: any) {
        this.socketService.emit('sendMessage', message);
        this.socketService.emit('updateConversation', message);
    }

    /**
     * Helper: Post message, update UI, và broadcast qua socket.
     * Dùng chung cho cả tin nhắn thường và system message (pin/unpin).
     */
    private postAndBroadcastMessage(
        content: string,
        messageType: string,
        replyTo?: string,
        messageTransform?: (msg: any) => any,
        file_metadata?: any,
        replyToMessageObj?: any,
        existingTempId?: string,
        isNewConversationUpgrade: boolean = false
    ) {
        this.postMessage$(
            content,
            messageType,
            replyTo,
            messageTransform,
            file_metadata,
            replyToMessageObj,
            existingTempId,
            isNewConversationUpgrade
        ).subscribe();
    }

    private postMessage$(
        content: string,
        messageType: string,
        replyTo?: string,
        messageTransform?: (msg: any) => any,
        file_metadata?: any,
        replyToMessageObj?: any,
        existingTempId?: string,
        isNewConversationUpgrade: boolean = false
    ): Observable<any> {
        const tempId = 'temp-' + Date.now();
        const messageData = {
            id: tempId,
            _trackId: tempId,
            sender_id: this.currentUserId(),
            call_id: null,
            content: content,
            conversation_id: this.conversationId(),
            created_at: new Date().toISOString(),
            deleted_for_all: false,
            duration: file_metadata?.duration ? Math.round(file_metadata?.duration) : null,
            file_name: file_metadata?.file_name ?? null,
            file_size: file_metadata?.file_size ?? null,
            file_url: file_metadata?.file_url ?? null,
            message_type: messageType,
            parent_message_id: replyToMessageObj?.id || null,
            parent_message_info: replyToMessageObj ? {
                parent_message_id: replyToMessageObj.id || null,
                parent_message_content: replyToMessageObj.content || null,
                parent_message_name: replyToMessageObj.sender_name || null,
                parent_message_is_deleted: replyToMessageObj.is_deleted || null,
                parent_message_sender_id: replyToMessageObj.sender_id || null,
                parent_message_type: replyToMessageObj.message_type || null,
                parent_message_thumbnail_url: replyToMessageObj.thumbnail_url || null,
            } : null,
        };

        const messageToAdd = messageTransform
            ? messageTransform(messageData)
            : { ...messageData };

        const currentUser = this.getMessageInfor()?.participants.find((p: any) => p.user_id === this.currentUserId()) || {};
        const authUser = this.authService.getUserInfor() || {};
        const newMessage = {
            ...messageToAdd,
            sender_name: authUser.full_name || currentUser.full_name,
            sender_avatar: authUser.avatar_url || currentUser.avatar_url || 'assets/AvatarDefault.jpg',
        };

        this.messageStatus.set('Đang gửi');

        const effectiveTempId = existingTempId ?? tempId;
        if (!existingTempId) {
            this.updateUIWithNewMessage(newMessage, this.conversationId());
        }

        return this.messagesService
            .postMessage(this.conversationId(), this.currentUserId(), content, replyTo, messageType, file_metadata)
            .pipe(
                tap({
                    next: (response) => {
                        this.loading = false;
                        const savedMessage = response.metadata?.newMessage;
                        const realId = savedMessage?.id; // MESSAGE ID
                        const realConvId = savedMessage?.conversation_id; // CONVERSATION ID

                        this.lastMessageId = realId;
                        this.messageStatus.set('Đã gửi');



                        const realMessage = {
                            ...savedMessage,
                            sender_name: authUser.full_name || currentUser.full_name,
                            sender_avatar: authUser.avatar_url || currentUser.avatar_url || 'assets/AvatarDefault.jpg',
                        };

                        // --- NEW: Nâng cấp hội thoại ảo lên thật cho chính người gửi ---
                        const oldId = this.conversationId();
                        if (oldId && oldId.startsWith('conv_')) {
                            console.log('[UPGRADE] Upgrading virtual conversation to real:', oldId, '->', realConvId);
                            const realParticipants = response.metadata?.newMessage?.conversation_info?.participants || 
                                                     this.getMessageInfor()?.participants;
                            
                            // 1. Đồng bộ dữ liệu hiện tại (có tin nhắn vừa gửi) vào Store trước khi migrate
                            this.messageStore.setConversationState(oldId, {
                                getMessagesData: this.getMessagesData(),
                                pinnedMessages: this.pinnedMessages(),
                                messageReactions: this.convStore.globalReactions(),
                                lastMessageId: realId,
                                isLoaded: true
                            });

                            // 2. Migrate cache sang ID mới
                            this.messageStore.migrateCache(oldId, realConvId);

                            // 3. Nâng cấp Sidebar (Store)
                            this.convStore.upgradeConversation(oldId, realConvId, realParticipants, realMessage);
                            
                            // 4. Cập nhật Active ID và URL (Navigation)
                            // Quan trọng: Gọi setActiveConversationId TRƯỚC navigate để effect loadMessages thấy cache mới ngay
                            this.convStore.setActiveConversationId(realConvId);
                            this.router.navigate(['/conversations', realConvId], { replaceUrl: true });
                            
                            // 5. Ép người gửi Join vào Room Socket THẬT ngay lập tức
                            this.socketService.emit('joinConversation', realConvId);
                        } else {
                            // Nếu là hội thoại thực rồi thì mới cần gọi API update last_message_id
                            this.conversationService.putConversation(this.conversationId(), {
                                last_message_id: realId
                            }).subscribe();
                        }

                        // Cập nhật ID thật cho tất cả các thông báo socket tiếp theo
                        const finalConvId = realConvId || this.conversationId();

                        this.broadcastMessage({ ...realMessage, conversation_id: finalConvId });

                        // Cập nhật media sidebar (nếu là media message)
                        if (realMessage.message_type !== 'text') {
                            this.socketService.emit('updateConversationInfo', {
                                conversation_id: finalConvId,
                                upload_file: realMessage 
                            });
                        }

                        // Chỉ notify khi conversation chưa có trong danh sách local (thường là cuộc trò chuyện mới tạo)
                        const isKnownConversation = (this.convStore.joinedConversations() || [])
                            .some((conv: any) => String(conv.conversation_id) === String(finalConvId));

                        
                        if (!isKnownConversation || isNewConversationUpgrade) {
                            const receiverIds = (this.getMessageInfor()?.participants || [])
                                .map((p: any) => p.user_id)
                                .filter((id: any) => String(id) !== String(this.currentUserId()));

                            
                            if (receiverIds.length > 0) {
                                // QUAN TRỌNG: Gửi ID THẬT cho người nhận để họ join đúng room
                                this.socketService.emit('notifyNewConversation', {
                                    receiverIds,
                                    conversation_id: finalConvId, // Đổi thành snake_case để match với receiver
                                    senderId: this.currentUserId(),
                                    participants: this.getMessageInfor()?.participants
                                });
                            }
                        }

                        // Replace temp message bằng real message
                        this.getMessagesData.update((old) => ({
                            ...old,
                            homeMessagesData: {
                                ...old.homeMessagesData,
                                messages: old.homeMessagesData.messages.map((m: any) =>
                                    m.id === effectiveTempId
                                        ? { ...newMessage, id: realId, _trackId: effectiveTempId, _uploading: false, ...savedMessage }
                                        : m
                                ),
                            },
                        }));
                        
                        // Luôn đồng bộ vào Update Cache cho conversation hiện tại
                        // Dù là ID ảo hay thật, local state vừa được thay đổi thì Cache phải được đồng bộ vào đúng ID cuối cùng.
                        this.messageStore.updateState(finalConvId, {
                            getMessagesData: this.getMessagesData(),
                            lastMessageId: realId
                        });

                        const participantId = this.getMessageInfor()?.participants.find((p: any) => p.user_id === this.currentUserId())?.id;

                        
                        if (participantId && !participantId.startsWith('par_')) {
                            this.participantService.putParticipant({
                                id: participantId,
                                last_read_message_id: realId
                            }).subscribe({
                                next: () => {
                                    this.socketService.emit('updateParticipant', {
                                        conversation_id: this.conversationId(),
                                        user_id: this.currentUserId(),
                                        last_read_message_id: realId
                                    });
                                },
                                error: (err: any) => console.error('Error updating participant:', err),
                            });
                        }
                    },
                    error: (error: any) => {
                        this.loading = false;
                        console.error('Error posting message:', error);
                        this.messageStatus.set('Lỗi');
                    }
                })
            );
    }

    updateUIWithNewMessage(newMessage: any, conversationId?: string) {
        // cập nhật lastMessage
        if (!conversationId) conversationId = this.conversationId();


        // không cập nhật nội dung trò chuyện nếu đang ở conversation khác
        if (this.conversationId() === conversationId) {
            this.getMessagesData.update((old) => {
                const homeMessagesData = old?.homeMessagesData || {
                    messages: [],
                    pinnedMessages: [],
                    conversation_type: '',
                };
                const newState = {
                    ...old,
                    homeMessagesData: {
                        ...homeMessagesData,
                        messages: [...(homeMessagesData.messages || []), newMessage],
                    },
                };

                // Đồng bộ luôn vào Store cache để tránh mất dữ liệu khi chuyển hướng
                this.messageStore.updateState(conversationId, { getMessagesData: newState });
                
                return newState;
            });
        }
    }

    isInputEmpty(): boolean {
        const el = this.messageInput?.nativeElement;
        if (!el) return true;
        const text = el.textContent || '';
        return text.trim().length === 0 && el.querySelectorAll('.mention-pill').length === 0;
    }

    private getMarkupContent(element: HTMLElement): string {
        let markup = '';
        const nodes = element.childNodes;

        for (let i = 0; i < nodes.length; i++) {
            const node = nodes[i];
            if (node.nodeType === Node.TEXT_NODE) {
                markup += node.textContent;
            } else if (node.nodeType === Node.ELEMENT_NODE) {
                const el = node as HTMLElement;
                if (el.classList.contains('mention-pill')) {
                    const userId = el.getAttribute('data-id');
                    markup += `@[${userId}]`;
                } else if (el.tagName === 'BR') {
                    markup += '\n';
                } else {
                    markup += this.getMarkupContent(el);
                }
            }
        }
        return markup;
    }

    handleKeyDown(event: KeyboardEvent) {
        if (this.handleMentionKeyDown(event)) {
            return;
        }

        // Chỉ gửi tin nhắn khi Enter (không có Shift)
        if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            this.handleSendBtn();
        } else {
            this.onTyping();
        }
    }

    onInput(event: Event) {
        const host = this.messageInput?.nativeElement;
        if (host) {
            // Synchronize internal state with the contenteditable content
            this.newMessage = this.getMarkupContent(host).trim();
        }

        this.onTyping();
        this.checkMentionState();

        // ── Restored Link Preview Logic ──
        if (!this.newMessage) {
            this.activeComposerLinkPreview.set(null);
            return;
        }

        const url = this.linkPreviewUtils.extractFirstUrl(this.newMessage);
        if (!url) {
            this.activeComposerLinkPreview.set(null);
            return;
        }

        // Check if this URL was recently closed (X)
        const isClosed = Array.from(this.closedPreviewUrls).some(u => u.includes(url) || url.includes(u));
        if (isClosed) {
            this.activeComposerLinkPreview.set(null);
            return;
        }

        // Trigger immediate fetch
        // Returns loading state if not cached, facilitating logic for skeleton effect
        const preview = this.linkPreviewUtils.getLinkPreview(this.newMessage, (res) => {
            this.activeComposerLinkPreview.set(res);
            this.cdr.markForCheck();
        });

        this.activeComposerLinkPreview.set(preview);
    }

    async handleSendBtn() {
        this.stopTyping();
        const el = this.messageInput.nativeElement;
        const markupContent = this.getMarkupContent(el).trim();

        const stagedFiles = this.preUploadFiles().map(f => f.file);
        const replyTo = this.replyToMessage ? this.replyToMessage.id : undefined;
        const replyToMessageObj = this.replyToMessage;

        if (!markupContent && stagedFiles.length === 0) return;


        let optimisticTextTempId: string | undefined;
        let isNewConversationUpgrade = false;
        const isVirtualConversation = this.conversationId().startsWith('conv_');

        // Optimistic UI: luôn hiển thị text ngay khi bấm gửi, trước cả bước tạo conversation thật.
        if (isVirtualConversation && markupContent) {
            const currentUser = this.getMessageInfor()?.participants.find((p: any) => p.user_id === this.currentUserId()) || {};
            optimisticTextTempId = 'temp-' + Date.now();
            this.messageStatus.set('Đang gửi');
            this.updateUIWithNewMessage({
                id: optimisticTextTempId,
                _trackId: optimisticTextTempId,
                sender_id: this.currentUserId(),
                sender_name: currentUser.full_name,
                sender_avatar: currentUser.avatar_url,
                content: markupContent,
                conversation_id: this.conversationId(),
                created_at: new Date().toISOString(),
                deleted_for_all: false,
                message_type: 'text',
                parent_message_id: replyToMessageObj?.id || null,
                parent_message_info: replyToMessageObj ? {
                    parent_message_id: replyToMessageObj.id || null,
                    parent_message_content: replyToMessageObj.content || null,
                    parent_message_name: replyToMessageObj.sender_name || null,
                    parent_message_is_deleted: replyToMessageObj.is_deleted || null,
                    parent_message_sender_id: replyToMessageObj.sender_id || null,
                    parent_message_type: replyToMessageObj.message_type || null,
                    parent_message_thumbnail_url: replyToMessageObj.thumbnail_url || null,
                } : null,
            }, this.conversationId());

        // Nếu đang ở conversation ảo thì tạo conversation thật NGAY trước khi xử lý lệnh/bot
        if (this.conversationId().startsWith('conv_')) {
            isNewConversationUpgrade = true;
            const oldId = this.conversationId();
            try {
                const response = await firstValueFrom(
                    this.conversationService.postConversation(
                        this.getMessageInfor()?.other_participant?.user_id,
                        this.getMessageInfor()?.user_info?.id
                    )
                );
                const newConvData = response.metadata?.newConversation;
                if (newConvData) {
                    const newId = newConvData.conv?.id;
                    this.conversationId.set(newId);

                    // Các participants thật từ server (đã được enrich full_name/avatar_url)
                    const realParticipants = [newConvData.you, ...newConvData.participants];

                    // JOIN SOCKET ROOM MỚI VÀ THÔNG BÁO CHO CHA
                    this.setupSocketListener(newId);
                    this.convStore.upgradeConversation(oldId, newId, realParticipants);

                    // Cập nhật URL để đồng bộ với state mới
                    this.router.navigate(['/conversations', newId], { replaceUrl: true });
                }
            } catch (err) {
                console.error('Error creating conversation before send:', err);
            }
        }
        }


        // Chờ lấy link preview mới nhất
        const linkPreview = await this.linkPreviewUtils.getLinkPreviewAsync(markupContent);

        if (stagedFiles.length > 0) {
            this.loading = false; // Progress được hiện qua _uploading trên từng temp message

            // Giữ thứ tự hiển thị bên sender: text (nếu có) luôn lên trước media.
            if (markupContent) {
                this.postAndBroadcastMessage(
                    markupContent,
                    'text',
                    replyTo,
                    undefined,
                    undefined,
                    replyToMessageObj,
                    optimisticTextTempId,
                    isNewConversationUpgrade
                );
            }

            // Khi đã có text, không để media file đầu tiên phát notify nâng cấp conversation nữa.
            this.uploadFileAttachment(stagedFiles, isNewConversationUpgrade, !!markupContent);
            this.clearPreUploadFiles();
        } else {
            this.loading = false;
            const linkMetadata = linkPreview ? {
                file_url: linkPreview.url,
                thumbnail_url: linkPreview.image,
                file_name: linkPreview.title,
                link_description: linkPreview.description,
                has_link: true
            } : undefined;

            this.postAndBroadcastMessage(
                markupContent,
                'text',
                replyTo,
                undefined,
                linkMetadata,
                replyToMessageObj,
                optimisticTextTempId,
                isNewConversationUpgrade
            );

            // Clear typing indicator immediately after sending
            this.stopTyping();
        }

        // Clear input và state
        el.innerHTML = '';
        this.newMessage = '';
        this.activeComposerLinkPreview.set(null); // Clear preview immediately on send
        this.cancelReply();
        this.cdr.markForCheck();
    }





    uploadFileAttachment(
        files: File[],
        isNewConversationUpgrade: boolean = false,
        hasTextMessage: boolean = false
    ) {
        // Validation: Filter out files that exceed Cloudinary limits
        const validFiles: File[] = [];
        for (const file of files) {
            const validation = this.fileUtils.validateFileSize(file);
            if (!validation.valid) {
                Swal.fire({
                    icon: 'warning',
                    title: 'Tệp quá lớn',
                    text: validation.message,
                    confirmButtonColor: 'var(--accent)',
                    background: '#06131f',
                    color: '#fff'
                });
                continue;
            }
            validFiles.push(file);
        }

        if (validFiles.length === 0) return;
        const finalFiles = validFiles;

        const formData = new FormData();
        const currentUser = this.getMessageInfor()?.participants.find((p: any) => p.user_id === this.currentUserId()) || {};
        const authUser = this.authService.getUserInfor() || {};

        // Bước 1: Tạo temp message ngay lập tức cho mỗi file
        const tempEntries: { tempId: string; file: File }[] = [];
        finalFiles.forEach(file => {
            const filename = file.name.normalize('NFC');
            const blob = new Blob([file], { type: file.type });
            formData.append('files', blob, filename);

            const tempId = 'temp-' + Date.now() + '-' + Math.random().toString(36).slice(2);
            let messageType = 'file';
            if (file.type.startsWith('image/')) messageType = 'image';
            else if (file.type.startsWith('video/')) messageType = 'video';
            else if (file.type.startsWith('audio/')) messageType = 'audio';

            const tempMsg = {
                id: tempId,
                _trackId: tempId,
                _uploading: true,  // hiện progress bar
                sender_id: this.currentUserId(),
                sender_name: authUser.full_name || currentUser.full_name,
                sender_avatar: authUser.avatar_url || currentUser.avatar_url || 'assets/AvatarDefault.jpg',
                content: file.name,
                conversation_id: this.conversationId(),
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
                message_type: messageType,
                file_name: file.name,
                file_size: file.size,
                file_url: URL.createObjectURL(file), // preview cục bộ
                thumbnail_url: null,
                duration: null,
                deleted_for_all: false,
                is_deleted: false,
                is_edited: false,
                parent_message_id: null,
                parent_message_info: null,
            };

            tempEntries.push({ tempId, file });
            this.messageStatus.set('');
            this.updateUIWithNewMessage(tempMsg, this.conversationId());
        });

        // Bước 2: Upload lên Cloudinary
        this.uploadService.uploadFile(this.conversationId(), formData).subscribe({
            next: (response) => {
                const uploadedFiles = response.metadata.files;

                // Sử dụng from + concatMap để xử lý lưu từng file một theo đúng thứ tự
                from(uploadedFiles).pipe(
                    concatMap((file: any, index: number) => {
                        const { tempId } = tempEntries[index] || {};

                        let messageType = 'file';
                        let content = '<i class="bi bi-file-earmark-arrow-down"></i> Tệp đính kèm';
                        if (file.resource_type === 'image') {
                            messageType = 'image';
                            content = '<i class="bi bi-image"></i> Hình ảnh'
                        }
                        else if (file.resource_type === 'video') {
                            messageType = 'video';
                            content = '<i class="bi bi-camera-video"></i> Video'
                        }
                        else if (file.resource_type === 'audio') {
                            messageType = 'audio';
                            content = '<i class="bi bi-mic"></i> Tin nhắn thoại'
                        }

                        const fileMetadata = {
                            file_url: file.url,
                            file_name: file.file_name,
                            file_size: file.file_size,
                            thumbnail_url: file.thumbnail_url,
                            duration: Math.round(file.duration || 0)
                        };

                        // Cập nhật trạng thái tải lên cho temp message (done upload, starting DB save)
                        this.getMessagesData.update((old: any) => ({
                            ...old,
                            homeMessagesData: {
                                ...old.homeMessagesData,
                                messages: old.homeMessagesData.messages.map((m: any) =>
                                    m.id === tempId ? { ...m, _uploading: false } : m
                                ),
                            },
                        }));

                        // Trả về Observable để concatMap chờ đợi xử lý xong mới qua file tiếp theo
                        return this.postMessage$(
                            content,
                            messageType,
                            undefined,
                            undefined,
                            fileMetadata,
                            undefined,
                            tempId,
                            // Chỉ trigger upgrade notify cho file đầu tiên TRONG TRƯỜNG HỢP không có tin nhắn văn bản đi kèm
                            // (nếu đã có tin nhắn văn bản, notify đã được gửi ở postAndBroadcastMessage)
                            index === 0 && !hasTextMessage ? isNewConversationUpgrade : false
                        );
                    }),
                    finalize(() => {
                        this.loading = false;
                        this.messageStatus.set('');
                    })
                ).subscribe({
                    error: (err: any) => {
                        console.error('Lỗi khi lưu chuỗi tin nhắn:', err);
                        this.messageStatus.set('Lỗi khi gửi');
                    }
                });
            },
            error: (error: any) => {
                console.error('Error uploading files:', error);
                this.error = 'Không thể tải lên tệp tin. Vui lòng thử lại.';
                // Đánh dấu lỗi cho các temp message thay vì xóa
                tempEntries.forEach(({ tempId }) => {
                    this.getMessagesData.update((old) => ({
                        ...old,
                        homeMessagesData: {
                            ...old.homeMessagesData,
                            messages: old.homeMessagesData.messages.map((m: any) =>
                                m.id === tempId ? { ...m, _uploading: false, _error: true } : m
                            ),
                        },
                    }));
                });
                this.messageStatus.set('Lỗi');
                this.loading = false;
            }
        });
    }

    menuDropUpId: string | number | null = null;
    menuFlipHorizontalId: string | number | null = null;

    // Menu methods
    toggleMenu(messageId: string | number, event: MouseEvent) {
        event.stopPropagation();
        if (this.showMenuId === messageId) {
            this.showMenuId = null;
            this.menuDropUpId = null;
        } else {
            this.showMenuId = messageId;
            // Default direction: render upward.
            this.menuDropUpId = messageId;

            const target = event.currentTarget as HTMLElement | null;
            const chatArea = target?.closest('.chat-area') as HTMLElement | null;
            const areaRect = chatArea?.getBoundingClientRect();
            const targetRect = target?.getBoundingClientRect();

            if (!chatArea || !areaRect || !targetRect) {
                return;
            }

            const headerEl = chatArea.querySelector('.chat-header') as HTMLElement | null;
            const pinnedEl = chatArea.querySelector('.pinned-bar-wrap') as HTMLElement | null;

            let topBlockedUntil = areaRect.top;
            if (headerEl) {
                topBlockedUntil = Math.max(topBlockedUntil, headerEl.getBoundingClientRect().bottom);
            }

            if (pinnedEl && pinnedEl.offsetHeight > 0) {
                topBlockedUntil = Math.max(topBlockedUntil, pinnedEl.getBoundingClientRect().bottom);
            }

            const gap = 8;
            const menuHeightEstimate = 190;
            const spaceBelow = areaRect.bottom - targetRect.bottom - gap;
            const spaceAbove = targetRect.top - topBlockedUntil - gap;

            const shouldDropDown = spaceAbove < menuHeightEstimate && spaceBelow > spaceAbove;
            this.menuDropUpId = shouldDropDown ? null : messageId;

            // Horizontal flip logic
            const menuWidthEstimate = 160;
            const isMeRow = target?.closest('.me-row') !== null;

            if (isMeRow) {
                // Me row: Default grows LEFT (needs space on left)
                const spaceOnLeft = targetRect.left - areaRect.left - gap * 2;
                if (spaceOnLeft < menuWidthEstimate && (areaRect.right - targetRect.left) > spaceOnLeft) {
                    this.menuFlipHorizontalId = messageId;
                } else {
                    this.menuFlipHorizontalId = null;
                }
            } else {
                // Other row: Default grows RIGHT (needs space on right)
                const spaceOnRight = areaRect.right - targetRect.right - gap * 2;
                if (spaceOnRight < menuWidthEstimate && (targetRect.right - areaRect.left) > spaceOnRight) {
                    this.menuFlipHorizontalId = messageId;
                } else {
                    this.menuFlipHorizontalId = null;
                }
            }
        }
    }

    isMenuFlipHorizontal(messageId: string | number): boolean {
        return this.showMenuId === messageId && this.menuFlipHorizontalId === messageId;
    }

    isMenuDropUp(messageId: string | number): boolean {
        return this.showMenuId === messageId && this.menuDropUpId === messageId;
    }

    closeMenu() {
        this.showMenuId = null;
        this.menuDropUpId = null;
        this.menuFlipHorizontalId = null;
    }

    private messageKey(messageId: string | number): string {
        return String(messageId);
    }

    getMessageReactions(message: any): any {
        if (!message?.id) return { emoji_char: '', count: 0 };
        const key = this.messageKey(message.id);
        const globalCounts = this.convStore.globalReactionCounts().get(key);
        const counts = (globalCounts || message.countReactionMap || {}) as Record<string, number>;

        let allEmoji = '';
        let allCount = 0;

        for (const [emoji, count] of Object.entries(counts)) {
            allEmoji += emoji;
            allCount += count;
        }

        return {
            emoji_char: allEmoji,
            count: allCount
        };
    }

    toggleReactionPicker(messageId: string | number, event: Event) {
        event.stopPropagation();
        this.showMenuId = null;
        if (this.reactionPickerMessageId === messageId) {
            this.reactionPickerMessageId = null;
            this.reactionPickerDropUpId = null;
            return;
        }

        this.reactionPickerMessageId = messageId;
        // Default direction: render upward.
        this.reactionPickerDropUpId = messageId;

        const target = event.currentTarget as HTMLElement | null;
        const chatArea = target?.closest('.chat-area') as HTMLElement | null;
        const areaRect = chatArea?.getBoundingClientRect();
        const targetRect = target?.getBoundingClientRect();

        if (!chatArea || !areaRect || !targetRect) {
            return;
        }

        const headerEl = chatArea.querySelector('.chat-header') as HTMLElement | null;
        const pinnedEl = chatArea.querySelector('.pinned-bar-wrap') as HTMLElement | null;

        let topBlockedUntil = areaRect.top;
        if (headerEl) {
            topBlockedUntil = Math.max(topBlockedUntil, headerEl.getBoundingClientRect().bottom);
        }

        if (pinnedEl && pinnedEl.offsetHeight > 0) {
            topBlockedUntil = Math.max(topBlockedUntil, pinnedEl.getBoundingClientRect().bottom);
        }

        const gap = 8;
        const pickerHeightEstimate = 42;
        const spaceAbove = targetRect.top - topBlockedUntil - gap;

        const shouldDropDown = spaceAbove < pickerHeightEstimate;
        this.reactionPickerDropUpId = shouldDropDown ? null : messageId;
    }

    isReactionPickerDropUp(messageId: string | number): boolean {
        return this.reactionPickerMessageId === messageId && this.reactionPickerDropUpId === messageId;
    }

    openReactionModal(message: any, event: Event) {
        event.stopPropagation();
        if (!message?.id) return;
        const key = this.messageKey(message.id);
        const details = (this.convStore.globalReactions().get(key) || message.reactions || []).map((r: any) => ({ ...r }));
        const participants = this.convStore.joinedConversations().find((conv: any) => conv.conversation_id === this.conversationId())?.participants || [];
        details.forEach((reaction: any) => {
            const user = participants.find((p: any) => p.user_id === reaction.user_id);
            reaction.user = user;
        });
        this.reactionDetails.set(details);
        this.showReactionModal.set(true);
        this.cdr.markForCheck();
    }

    closeReactionModal() {
        this.showReactionModal.set(false);
        this.reactionDetails.set([]);
        this.cdr.markForCheck();
    }

    toggleReaction(message: any, emoji: string, event?: Event) {
        event?.stopPropagation();
        if (!message?.id || !emoji || this.isSyncingReaction()) return;

        this.isSyncingReaction.set(true);
        const messageId = this.messageKey(message.id);
        const userId = this.currentUserId();

        // 1. Seed reactions from global cache; fallback to message payload when cache is not ready.
        const baseReactions: any[] = this.convStore.globalReactions().get(messageId) || message.reactions || [];
        const rawReactions: any[] = baseReactions.map((r: any) => ({ ...r }));

        const baseCounts = this.convStore.globalReactionCounts().get(messageId) || message.countReactionMap || {};
        const counts = { ...baseCounts } as Record<string, number>;

        const existingIdx = rawReactions.findIndex((r: any) => r.user_id === userId);

        const isRemoving = existingIdx >= 0;
        const reactIndex = rawReactions[existingIdx];

        if (!isRemoving) {
            rawReactions.push({ emoji_char: emoji, user_id: userId, message_id: messageId });
            counts[emoji] = (counts[emoji] || 0) + 1;
        }
        else {
            rawReactions.splice(existingIdx, 1);
            counts[reactIndex.emoji_char] = Math.max(0, (counts[reactIndex.emoji_char] || 0) - 1);
            if (counts[reactIndex.emoji_char] === 0) delete counts[reactIndex.emoji_char];

            if (reactIndex.emoji_char !== emoji) {
                rawReactions.push({ emoji_char: emoji, user_id: userId, message_id: messageId });
                counts[emoji] = (counts[emoji] || 0) + 1;
            }
        }

        // 3. Update Global State
        this.convStore.globalReactions.update(map => {
            const newMap = new Map(map);
            newMap.set(messageId, rawReactions);
            return newMap;
        });

        this.convStore.globalReactionCounts.update(map => {
            const newMap = new Map(map);
            newMap.set(messageId, counts);
            return newMap;
        });

        this.reactionPickerMessageId = null;
        this.reactionPickerDropUpId = null;
        this.cdr.markForCheck();

        // 4. Persistence call
        if (!isRemoving) {
            this.messageReactionsService.addMessageReaction(this.conversationId(), messageId, userId, emoji)
                .pipe(finalize(() => this.isSyncingReaction.set(false)))
                .subscribe({
                    next: (res: any) => {
                        console.log('Toggle synced:', res);
                        this.convStore.globalReactions.update(map => {
                            const reactions = map.get(messageId);
                            if (reactions) {
                                const updateID = reactions.find((r: any) => r.user_id === userId && r.emoji_char === emoji && !r.id);
                                if (updateID) {
                                    updateID.id = res.metadata.newReaction.id;
                                }
                            }
                            return map;
                        });
                    },
                    error: (err: any) => console.error('Sync error:', err)
                });
        }
        else {
            if (reactIndex?.id) {
                this.messageReactionsService.removeMessageReaction(reactIndex.id)
                    .pipe(finalize(() => {
                        if (reactIndex.emoji_char === emoji) {
                            this.isSyncingReaction.set(false);
                        }
                    }))
                    .subscribe({
                        next: (res: any) => console.log('Toggle synced:', res),
                        error: (err: any) => console.error('Sync error:', err)
                    });
            } else {
                this.isSyncingReaction.set(false);
            }

            if (reactIndex.emoji_char !== emoji) {
                this.messageReactionsService.addMessageReaction(this.conversationId(), messageId, userId, emoji)
                    .pipe(finalize(() => this.isSyncingReaction.set(false)))
                    .subscribe({
                        next: (res: any) => {
                            console.log('Toggle synced:', res);
                            this.convStore.globalReactions.update(map => {
                                const reactions = map.get(messageId);
                                if (reactions) {
                                    const updateID = reactions.find((r: any) => r.user_id === userId && r.emoji_char === emoji && !r.id);
                                    if (updateID) {
                                        updateID.id = res.metadata.newReaction.id;
                                    }
                                }
                                return map;
                            });
                        },
                        error: (err: any) => console.error('Sync error:', err)
                    });
            }
        }

        this.socketService.emit('reactionMessage', {
            reactions: rawReactions,
            counts: counts,
            conversation_id: this.conversationId(),
            message_id: messageId
        });
    }



    /**
     * TELEGRAM APPROACH: Edit nội dung tin nhắn bot cuối cùng tại chỗ.
     * Gọi PUT /messages/:id với nội dung mới → emit socket 'updateMessage' →
     * tất cả client cập nhật smooth mà không có hiệu ứng flash/xóa/gửi mới.
     */
    @HostListener('document:click', ['$event'])
    onDocumentClick(event: MouseEvent) {
        const target = event.target as HTMLElement;


        if (
            !target.closest('.message-actions') &&
            !target.closest('.emoji-picker-wrap') &&
            !target.closest('.messenger-input-icon')
        ) {
            this.closeMenu();
        }

        if (
            !target.closest('.reaction-picker') &&
            !target.closest('.reaction-btn')
        ) {
            this.reactionPickerMessageId = null;
            this.reactionPickerDropUpId = null;
        }

        // Đóng emoji picker chỉ khi click thực sự bên ngoài picker và nút toggle
        if (
            !target.closest('.emoji-picker-wrap') &&
            !target.closest('.emoji-btn')
        ) {
            this.showEmojiPicker = false;
        }

        // Close pinned dropdown when clicking outside
        if (this.showPinnedDropdown && !target.closest('.pinned-bar-wrap')) {
            this.showPinnedDropdown = false;
        }

        // Close pinned context menu when clicking outside
        if (this.openPinnedMenuId && !target.closest('.pinned-menu-wrap')) {
            this.openPinnedMenuId = null;
        }
    }

    // Kiểm tra xem tin nhắn hiện tại có phải là cuối chuỗi cùng sender hoặc là cuối ngày không
    isLastOfSenderOrDay(i: number, messages: any[]): boolean {
        if (i === messages.length - 1) return true;
        const curr = messages[i];
        const next = messages[i + 1];
        // Nếu khác sender hoặc là system
        if (next.sender_id !== curr.sender_id || next.message_type === 'system') return true;
        // Nếu khác ngày
        if (this.getMessageDate(curr.created_at) !== this.getMessageDate(next.created_at))
            return true;
        return false;
    }

    deleteMessage(msg: any) {
        // có bug
        this.messagesService.deleteMessage(msg.id).subscribe({
            next: (response) => {

                this.getMessagesData.update((old) => ({
                    ...old,
                    homeMessagesData: {
                        ...old.homeMessagesData,
                        messages: old.homeMessagesData.messages.map((m: any) => {
                            // Mark the deleted message itself
                            if (m.id === msg.id) {
                                return { ...m, is_deleted: true };
                            }
                            // Update messages that have this deleted message as parent
                            if (
                                m.parent_message_info &&
                                m.parent_message_info.parent_message_id === msg.id
                            ) {
                                return {
                                    ...m,
                                    parent_message_info: {
                                        ...m.parent_message_info,
                                        parent_message_is_deleted: true,
                                    },
                                };
                            }
                            return m;
                        }),
                    },
                }));

                const currentUser =
                    this.getMessageInfor()?.participants.find(
                        (p: any) => p.user_id === this.currentUserId()
                    ) || {};
                const newMessage = {
                    ...response.metadata.deleteResult,
                    sender_name: currentUser.full_name,
                    sender_avatar: currentUser.avatar_url,
                };
                this.socketService.emit('deleteMessage', newMessage);
                console.log('newMessage: ', newMessage);
                console.log('this.lastMessageId', this.lastMessageId);
                if (newMessage.id === this.lastMessageId) {
                    console.log('Last message deleted');
                    this.socketService.emit('updateConversation', newMessage);
                }
            },
            error: (error: any) => {
                console.error('Error deleting message:', error);
                this.error = error.message;
            },
        });

        this.closeMenu();
    }

    forwardMessage(msg: any) {
        this.forwardingMessage = msg;
        this.showForwardModal = true;
        this.forwardLoading = false;
        this.forwardError = '';
        this.forwardSearch = '';
        this.selectedForwardConversationIds.clear();

        const joined = this.convStore.joinedConversations() || [];
        this.forwardConversations = joined.filter(
            (conv: any) => conv.conversation_id !== this.conversationId(),
        );

        if (this.forwardConversations.length === 0) {
            this.forwardError = 'Không có cuộc hội thoại nào để chuyển tiếp.';
        }

        this.closeMenu();
    }

    closeForwardModal() {
        this.showForwardModal = false;
        this.forwardingMessage = null;
        this.forwardSearch = '';
        this.forwardError = '';
        this.forwardLoading = false;
        this.selectedForwardConversationIds.clear();
    }

    toggleForwardConversation(conversationId: string, checked: boolean) {
        if (checked) {
            this.selectedForwardConversationIds.add(conversationId);
        } else {
            this.selectedForwardConversationIds.delete(conversationId);
        }
    }

    isForwardConversationSelected(conversationId: string): boolean {
        return this.selectedForwardConversationIds.has(conversationId);
    }

    getForwardConversationsFiltered(): any[] {
        const keyword = (this.forwardSearch || '').trim().toLowerCase();
        if (!keyword) return this.forwardConversations;

        return this.forwardConversations.filter((conv: any) => {
            const title = this.getForwardConversationTitle(conv).toLowerCase();
            return title.includes(keyword);
        });
    }

    getForwardConversationTitle(conv: any): string {
        if (!conv) return 'Conversation';
        if (conv.title && String(conv.title).trim()) return conv.title;
        if (conv.other_participant?.full_name) return conv.other_participant.full_name;
        return conv.type === 'group' ? 'Nhóm chat' : 'Cuộc hội thoại';
    }

    getForwardConversationSubtitle(conv: any): string {
        if (!conv) return '';
        if (conv.type === 'group') {
            const count = conv.participants_count || conv.participants?.length || 0;
            return `${count} thành viên`;
        }
        return 'Trò chuyện trực tiếp';
    }

    isForwardConversationDirect(conv: any): boolean {
        return conv?.type === 'direct';
    }

    hasForwardGroupAvatar(conv: any): boolean {
        return !!(conv?.avatar_url && String(conv.avatar_url).trim());
    }

    getForwardDirectAvatar(conv: any): string {
        if (conv?.other_participant?.avatar_url) {
            return conv.other_participant.avatar_url;
        }

        const participants = conv?.participants || [];
        const receiver = participants.find(
            (p: any) => String(p?.user_id) !== String(this.currentUserId()),
        );

        return (
            receiver?.avatar_url
        );
    }

    getForwardConversationAvatar(conv: any): string {
        return (
            conv?.avatar_url ||
            conv?.other_participant?.avatar_url
        );
    }

    private resolveForwardPayload(msg: any): {
        content: string;
        messageType: string;
        fileMetadata?: any;
    } {
        const messageType = msg?.message_type || 'text';
        const content = msg?.content || '';

        if (['image', 'video', 'audio', 'file'].includes(messageType)) {
            return {
                content,
                messageType,
                fileMetadata: {
                    file_url: msg?.file_url || null,
                    file_name: msg?.file_name || null,
                    file_size: msg?.file_size || null,
                    thumbnail_url: msg?.thumbnail_url || null,
                    duration: msg?.duration || null,
                },
            };
        }

        return { content, messageType: 'text' };
    }

    sendForwardMessages() {
        if (!this.forwardingMessage) return;

        const targetConversationIds = Array.from(this.selectedForwardConversationIds);
        if (targetConversationIds.length === 0) {
            this.forwardError = 'Vui lòng chọn ít nhất 1 cuộc hội thoại.';
            return;
        }

        const { content, messageType, fileMetadata } = this.resolveForwardPayload(this.forwardingMessage);
        const parentUserInfo = this.getMessageInfor()?.user_info || {};

        this.forwardLoading = false;
        this.forwardError = '';

        const requests = targetConversationIds.map((targetConversationId) =>
            this.messagesService.postMessage(
                targetConversationId,
                this.currentUserId(),
                content,
                undefined,
                messageType,
                fileMetadata,
            ),
        );

        forkJoin(requests).subscribe({
            next: (responses: any) => {
                // this.forwardLoading = false;
                this.closeForwardModal();
                responses.forEach((res: any) => {
                    const savedMessage = res?.metadata?.newMessage;
                    if (savedMessage) {
                        const messageWithSender = {
                            ...savedMessage,
                            sender_name: savedMessage.sender_name || parentUserInfo.full_name || 'Bạn',
                                    sender_avatar: savedMessage.sender_avatar || parentUserInfo.avatar_url || 'assets/AvatarDefault.jpg',
                        };

                        this.broadcastMessage(messageWithSender);
                    }
                });
            },
            error: (error: any) => {
                console.error('Error forwarding message:', error);
                this.forwardError = 'Chuyển tiếp thất bại. Vui lòng thử lại.';
                this.forwardLoading = false;
            },
        });
    }

    pinMessage(msg: any) {
        this.pinMessageService.pinMessage(msg.id, this.conversationId(), this.currentUserId(), msg.content, 1).subscribe({
            next: (response) => {
                const currentUser = this.getMessageInfor()?.participants.find((p: any) => p.user_id === this.currentUserId()) || {};
                const newPinMessage = {
                    ...response.metadata.newPinMessage,
                    pinned_by_name: currentUser.full_name,
                    sender_name: msg.sender_name,
                    sender_id: msg.sender_id,
                    sender_avatar: msg.sender_avatar,
                    // Gắn thêm metadata của message gốc để hiển thị icon
                    content: msg.content,
                    message_type: msg.message_type,
                    file_name: msg.file_name,
                };

                // Cập nhật local state ngay lập tức
                this.pinnedMessages.update(prev => [...prev, newPinMessage]);

                // Broadcast cho người khác trong conversation
                this.socketService.emit('pinMessage', newPinMessage);

                const messageContent = `đã ghim tin nhắn: ${this.pinnedMessagePreviewText(newPinMessage)}`;
                const message_type = 'system';

                this.postAndBroadcastMessage(messageContent, message_type);
            },
            error: (error: any) => {
                console.error('Lỗi khi ghim tin nhắn:', error);
            }
        });
        this.closeMenu();
    }

    // Modal sửa tin nhắn
    editingMessage: string = '';
    editingContent: string = '';

    openEditModal(msg: any) {
        this.editingMessage = msg.id;
        this.editingContent = msg.content;
        this.closeMenu();
    }

    closeEditModal() {
        this.editingMessage = '';
        this.editingContent = '';
    }

    saveEditModal() {
        if (this.editingMessage && this.editingContent.trim() !== '') {
            // Lưu vào local variable để tránh bị clear
            const messageId = this.editingMessage;
            const messageContent = this.editingContent;

            this.messagesService.putMessage(messageId, messageContent).subscribe({
                next: (response) => {
                    this.getMessagesData.update((old) => ({
                        ...old,
                        homeMessagesData: {
                            ...old.homeMessagesData,
                            messages: old.homeMessagesData.messages.map((msg: any) => {
                                if (msg.id === messageId) {
                                    return {
                                        ...msg,
                                        content: messageContent,
                                        updated_at: new Date().toISOString(),
                                        is_edited: true
                                    };
                                } else if (msg.parent_message_id === messageId) {
                                    return {
                                        ...msg,
                                        parent_message_info: {
                                            ...msg.parent_message_info,
                                            parent_message_content: messageContent,
                                        },
                                    };
                                } else {
                                    return msg;
                                }
                            }),
                        },
                    }));

                    const currentUser =
                        this.getMessageInfor()?.participants.find(
                            (p: any) => p.user_id === this.currentUserId()
                        ) || {};
                    const updatedMsg = this.getMessagesData().homeMessagesData.messages.find(
                        (m: any) => m.parent_message_id === messageId,
                    );
                    const newMessage = {
                        ...response.metadata.updatedMessage,
                        sender_name: currentUser.full_name,
                        sender_avatar: currentUser.avatar_url,
                        parent_message_info:
                            updatedMsg?.parent_message_info ||
                            response.metadata.updatedMessage.parent_message_info,
                    };
                    this.socketService.emit('updateMessage', newMessage);

                    if (messageId === this.lastMessageId) {
                        this.socketService.emit('updateConversation', newMessage);
                    }

                    this.closeEditModal();
                },
                error: (error: any) => {
                    console.error('Error editing message:', error);
                    this.error = error.message;
                    this.closeEditModal();
                },
            });
        } else {
            this.closeEditModal();
        }
    }

    // Scroll methods
    scrollToBottom(smooth: boolean = true) {
        if (this.messagesContent && this.messagesContent.nativeElement) {
            try {
                const element = this.messagesContent.nativeElement;
                if (smooth) {
                    element.scrollTo({
                        top: element.scrollHeight,
                        behavior: 'smooth',
                    });
                } else {
                    element.scrollTop = element.scrollHeight;
                }
            } catch (e) {
                const element = this.messagesContent.nativeElement;
                element.scrollTop = element.scrollHeight;
            }
        }
    }

    isUserNearBottom(): boolean {
        if (!this.messagesContent || !this.messagesContent.nativeElement) return true;

        const element = this.messagesContent.nativeElement;
        const threshold = 10;

        // Với column-reverse: scrollTop = 0 là dưới cùng, scrollTop âm là scroll lên
        // Nếu scrollTop < -150 (scroll lên xa) thì KHÔNG ở gần dưới
        const nearBottom = element.scrollTop >= -threshold;
        return nearBottom;
    }

    onMessagesScroll() {
        this.isNearBottom = this.isUserNearBottom();
        this.showScrollToBottom = !this.isNearBottom;

        if (!this.isNearBottom) {
            this.autoScroll = false;
        }

        if (this.isNearBottom) {
            this.autoScroll = true;
            this.hasNewMessage = false; // Clear new message flag khi scroll xuống cuối

            const latestIncomingMessage = [...(this.getMessagesData().homeMessagesData?.messages || [])]
                .reverse()
                .find((msg: any) => String(msg.sender_id) !== String(this.currentUserId()) && msg.id);

            if (latestIncomingMessage?.id) {
                this.persistReadState(latestIncomingMessage.id);
            }
        }

        // Detect scroll to top (với column-reverse, scrollTop rất âm là đang ở trên cùng)
        if (this.messagesContent?.nativeElement) {
            const element = this.messagesContent.nativeElement;
            const scrollThreshold = element.scrollHeight + element.scrollTop - element.clientHeight;

            // Nếu scroll gần đến top (còn 100px nữa là đến top)
            if (scrollThreshold < 100 && this.hasMore && !this.isLoadingMore) {
                this.loadMoreMessages();
            }
        }
    }

    scrollToBottomClicked() {
        this.autoScroll = true;
        this.isNearBottom = true;
        this.showScrollToBottom = false;
        this.hasNewMessage = false; // Clear new message flag
        // Với column-reverse, scroll về 0 là xuống cuối
        if (this.messagesContent?.nativeElement) {
            this.messagesContent.nativeElement.scrollTo({
                top: 0,
                behavior: 'smooth',
            });
        }

        const latestIncomingMessage = [...(this.getMessagesData().homeMessagesData?.messages || [])]
            .reverse()
            .find((msg: any) => String(msg.sender_id) !== String(this.currentUserId()) && msg.id);

        if (latestIncomingMessage?.id) {
            this.persistReadState(latestIncomingMessage.id);
        }
    }

    private persistReadState(lastReadMessageId: string) {
        const conversationId = this.conversationId();
        const currentParticipant = this.getMessageInfor()?.participants?.find((p: any) => p.user_id === this.currentUserId());

        if (!conversationId || !lastReadMessageId || !currentParticipant?.id || String(currentParticipant.id).startsWith('par_')) {
            return;
        }

        this.participantService.putParticipant({
            id: currentParticipant.id,
            last_read_message_id: lastReadMessageId,
        }).subscribe({
            next: () => {
                this.socketService.emit('updateParticipant', {
                    conversation_id: conversationId,
                    user_id: this.currentUserId(),
                    last_read_message_id: lastReadMessageId,
                    participant_id: currentParticipant.id,
                });
            },
            error: (err: any) => {
                console.error('Error persisting read state:', err);
            },
        });
    }

    // Emoji picker state
    showEmojiPicker = false;

    // Toggle emoji picker
    onEmojiButtonMouseDown(event: MouseEvent) {
        event.preventDefault();
        this.rememberEditorSelection();
    }

    toggleEmojiPicker() {
        this.rememberEditorSelection();
        this.showEmojiPicker = !this.showEmojiPicker;
    }

    addEmoji(event: any) {
        const emoji = event?.emoji?.native || '';
        if (!emoji) return;

        this.insertEmojiIntoEditor(emoji);
        this.onTyping();
        this.showEmojiPicker = false; // Đóng picker sau khi chọn emoji
        // Focus lại vào input sau khi chọn emoji
        setTimeout(() => {
            if (this.messageInput?.nativeElement) {
                this.messageInput.nativeElement.focus();
            }
        }, 100);
    }

    private rememberEditorSelection() {
        const host = this.messageInput?.nativeElement;
        const sel = window.getSelection();
        if (!host || !sel || sel.rangeCount === 0) return;

        const range = sel.getRangeAt(0);
        if (host.contains(range.startContainer) && host.contains(range.endContainer)) {
            this.savedSelectionRange = range.cloneRange();
        }
    }

    private insertEmojiIntoEditor(emoji: string) {
        const host = this.messageInput?.nativeElement;
        if (!host) return;

        host.focus();

        const sel = window.getSelection();
        const range = this.savedSelectionRange?.cloneRange()
            || (sel && sel.rangeCount > 0 && host.contains(sel.anchorNode) ? sel.getRangeAt(0).cloneRange() : null);

        if (!range) {
            host.appendChild(document.createTextNode(emoji));
        } else {
            range.deleteContents();
            const emojiNode = document.createTextNode(emoji);
            range.insertNode(emojiNode);
            range.setStartAfter(emojiNode);
            range.collapse(true);

            if (sel) {
                sel.removeAllRanges();
                sel.addRange(range);
            }

            this.savedSelectionRange = range.cloneRange();
        }

        this.newMessage = this.getMarkupContent(host).trim();
        host.dispatchEvent(new Event('input', { bubbles: true }));
    }

    // Reply state
    replyToMessage: any = null;

    // Khi click nút reply
    replyMessage(msgId: string) {
        this.messageInput?.nativeElement?.focus();
        const messages = this.getMessagesData().homeMessagesData?.messages || [];
        this.replyToMessage = messages.find((m: any) => m.id === msgId);
    }

    // Đóng khung reply
    cancelReply() {
        this.replyToMessage = null;
    }

    // Scroll to specific message and highlight it.
    // If the message is not yet in the DOM, keeps calling loadMoreMessages() until found.
    scrollToMessage(messageId: string) {
        if (!messageId) return;
        
        const requestId = this.activeScrollRequestId;
        // Add a small delay for DOM stability, especially if triggered from a menu that is closing
        setTimeout(() => {
            this._doScrollToMessage(messageId, 0, requestId);
        }, 10);
    }

    private _doScrollToMessage(messageId: string, attempt: number, requestId: number) {
        // Break recursion if we have switched conversations
        if (requestId !== this.activeScrollRequestId) return;
        
        const MAX_ATTEMPTS = 30;

        const el = document.getElementById(`message-${messageId}`);
        if (el) {
            // Found in DOM — scroll and highlight
            if (this.highlightTimeout) clearTimeout(this.highlightTimeout);

            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            this.highlightedMessageId = messageId;
            this.cdr.markForCheck();

            this.highlightTimeout = setTimeout(() => {
                this.highlightedMessageId = null;
                this.cdr.markForCheck();
            }, 2000);
            return;
        }

        // Not in DOM — check if it exists in local data but just not rendered yet
        const currentMessages = this.getMessagesData().homeMessagesData?.messages || [];
        const existsInLocalData = currentMessages.some((m: any) => m.id === messageId);

        if (existsInLocalData) {
            // Message is in store but not yet in DOM, wait for a frame and try again without loading
            if (attempt < 5) { // Limit local retries
                setTimeout(() => this._doScrollToMessage(messageId, attempt + 1, requestId), 60);
                return;
            }
        }

        // Not in local data — Load older messages
        if (!this.hasMore || attempt >= MAX_ATTEMPTS) {
            console.warn('scrollToMessage: tin nhắn không tìm thấy, id =', messageId);
            return;
        }

        // Proactive scroll towards the top (older messages area) while fetching
        if (this.messagesContent?.nativeElement) {
            this.messagesContent.nativeElement.scrollTo({
                top: this.messagesContent.nativeElement.scrollHeight,
                behavior: 'smooth'
            });
        }

        this.isLoadingMore = true;
        // High throughput batch size for ultra-fast deep search
        this.messagesService.getMessages(this.conversationId(), 100, this.currentOffset).subscribe({
            next: (response) => {
                const olderMessages = response.metadata?.homeMessagesData?.messages || [];
                if (olderMessages.length === 0) {
                    this.hasMore = false;
                    this.isLoadingMore = false;
                    // Exit recursion if we reach the end of history without finding the message
                    return;
                }

                // Prepend older messages
                this.getMessagesData.update((old) => ({
                    ...old,
                    homeMessagesData: {
                        ...old.homeMessagesData,
                        messages: [...olderMessages, ...old.homeMessagesData.messages],
                    },
                }));

                this.currentOffset += olderMessages.length;
                this.hasMore = response.metadata?.homeMessagesData?.hasMore ?? false;
                this.isLoadingMore = false;

                // Instant chaining if still not in local data, otherwise wait slightly for render
                const foundInNewBatch = olderMessages.some((m: any) => m.id === messageId);
                const delay = foundInNewBatch ? 60 : 0;
                
                setTimeout(() => this._doScrollToMessage(messageId, attempt + 1, requestId), delay);
            },
            error: () => {
                this.isLoadingMore = false;
            },
        });
    }

    isBlocked(): boolean {
        const infor = this.getMessageInfor();
        if (!infor?.participants || infor.participants.length > 2) return false;
        const parti = infor.participants.find((p: any) => p.user_id !== this.currentUserId());
        if (!parti) return false;
        return this.userBlock()?.some((block: any) => block.blocked_id === parti.user_id) ?? false;
    }

    async openCallWindow({
        initializeVideo,
        callId,
        mode = 'start',
        inviterName,
        inviterAvatarUrl,
        inviterId,
    }: {
        initializeVideo: boolean,
        callId: string,
        mode?: 'start' | 'accept',
        inviterName?: string,
        inviterAvatarUrl?: string,
        inviterId?: string,
    }) {
        const listener = (event: MessageEvent) => {
            if (event.origin !== window.location.origin) return;

            if (event.data.type === 'getCallData') {

                const payload: any = {
                    type: 'sendCallData',
                    conversationType: this.conversationType(),
                    conversationId: this.conversationId(),
                    userId: this.currentUserId(),
                    callId,
                    initializeVideo,
                    inviterName,
                    inviterAvatarUrl,
                    inviterId,
                };

                if (this.conversationType() === GROUP_CALL) {
                    payload.avatarWrap = {
                        isGroup: true,
                        avatarUrl: this.getMessageInfor().avatar_url
                            && this.getMessageInfor().avatar_url.trim()
                            ? this.getMessageInfor().avatar_url : null,
                        members: this.getMessageInfor().participants ?? [],
                    }
                } else {
                    payload.avatarWrap = {
                        isGroup: false,
                        avatarUrl: this.getMessageInfor()?.other_participant?.avatar_url
                    }
                }

                (event.source as Window)?.postMessage(payload, window.location.origin);

                window.removeEventListener('message', listener);
            }
        };

        window.addEventListener('message', listener);

        const width = 1200,
            height = 700,
            left = window.screen.width / 2 - width / 2,
            top = window.screen.height / 2 - height / 2,
            features = `width=${width},height=${height},top=${top},left=${left},menubar=no,toolbar=no,location=no,status=no,resizable=yes`;

        window.open(
            mode === 'accept' ? `/call-display?mode=accept` : `/call-display`, // url
            'CallWindow', // target
            features,
        );
    }

    handleInfo() {
        this.convStore.toggleConversationInfor();
        this.toggleDetails.emit();
    }

    handleVoiceCall() {
        this.handleCall('audio');
    }

    handleVideoCall() {
        this.handleCall('video');
    }

    getLatestJoinableGroupCallMessage(): any | null {
        if (this.conversationType() !== GROUP_CALL) return null;

        const messages = this.getMessagesData().homeMessagesData?.messages || [];
        for (let i = messages.length - 1; i >= 0; i--) {
            const msg = messages[i];
            const call = msg?.call;
            if (!call || msg?.message_type !== 'call') continue;
            if (call.call_type !== GROUP_CALL) continue;

            const status = call.status;
            return status === 'pending' || status === 'ongoing' ? msg : null;
        }

        return null;
    }

    hasJoinableGroupCall(): boolean {
        return !!this.getLatestJoinableGroupCallMessage();
    }

    joinOngoingGroupCall() {
        const callMessage = this.getLatestJoinableGroupCallMessage();
        const callId = callMessage?.call?.id || callMessage?.call_id;
        if (!callId) return;

        const initializeVideo = callMessage?.call?.media_type === 'video';

        this.callService.joinCall(callId).subscribe({
            next: () => {
                this.callService.createLogJoinGroupCall(this.conversationId()).subscribe({
                    next: (res: any) => {
                        const { full_name, avatar_url } = this.authService.getUserInfor();
                        const callLogMessage = {
                            ...res.metadata,
                            sender_name: full_name,
                            sender_avatar: avatar_url,
                        };

                        this.updateUIWithNewMessage(callLogMessage);
                        this.broadcastMessage(callLogMessage);
                    },
                    error: (error: any) => console.error(error),
                });

                this.openCallWindow({
                    initializeVideo,
                    callId,
                    mode: 'accept',
                    inviterName: callMessage?.sender_name,
                    inviterAvatarUrl: callMessage?.sender_avatar,
                    inviterId: callMessage?.sender_id,
                });
            },
            error: () => {
                // Nếu API từ chối do call đã ongoing thì vẫn cho phép user mở cửa sổ và join room.
                this.openCallWindow({
                    initializeVideo,
                    callId,
                    mode: 'accept',
                    inviterName: callMessage?.sender_name,
                    inviterAvatarUrl: callMessage?.sender_avatar,
                    inviterId: callMessage?.sender_id,
                });
            },
        });
    }

    handleCall(media_type: 'video' | 'audio') {
        if (this.hasJoinableGroupCall()) {
            this.joinOngoingGroupCall();
            return;
        }

        this.callService.startCall(this.conversationId(), this.conversationType(), media_type).subscribe({
            next: async (res) => {
                const { full_name, avatar_url } = this.authService.getUserInfor();

                const message = {
                    ...res.metadata,
                    sender_name: full_name,
                    sender_avatar: avatar_url,
                }

                const callId = message.call.id;
                if (!message || !callId) {
                    console.log('Call is not found');
                    return;
                }

                this.updateUIWithNewMessage(message);
                this.broadcastMessage(message);

                if (message.call.call_type && message.call.call_type === GROUP_CALL) {
                    this.callService.createLogJoinGroupCall(this.conversationId()).subscribe({
                        next: (res: any) => {
                            const systemMessage = {
                                ...res.metadata,
                                sender_name: name,
                                sender_avatar: avatar_url,
                            };

                            this.updateUIWithNewMessage(systemMessage);
                            this.broadcastMessage(systemMessage);
                        },
                        error: (error: any) => console.error(error)
                    })
                }

                const initializeVideo = media_type === 'video' ? true : false;
                this.openCallWindow({ initializeVideo, callId });
            },
            error: (error: any) => console.log(error)
        })
    }

    getCallIcon(callInfo: any): string {
        if (!callInfo) return 'bi bi-telephone-fill call-icon audio';

        const { media_type, status } = callInfo;

        // Icon cuộc gọi không ai bắt máy
        if (status === 'missed' || status === 'cancelled' || status === 'declined') {
            return media_type === 'video'
                ? 'bi bi-camera-video-off-fill call-icon video-missed'
                : 'bi bi-telephone-x-fill call-icon audio-missed';
        }

        // Icon cho cuộc gọi video
        if (media_type === 'video')
            return 'bi bi-camera-video-fill call-icon video';

        // Icon cho cuộc gọi audio
        return 'bi bi-telephone-fill call-icon audio';
    }

    getCallMainContent(callInfo: any): string {
        if (!callInfo) return 'Cuộc gọi';

        const { call_type, media_type, status, caller_id } = callInfo;
        let callMainContent = '';

        if (call_type === 'group') {
            // Cuộc gọi nhóm
            callMainContent = media_type === 'audio'
                ? 'Cuộc gọi thoại nhóm'
                : 'Cuộc gọi video nhóm';
        } else {
            // Cuộc gọi 2 người
            if (status === 'completed') {
                callMainContent = media_type === 'audio'
                    ? 'Cuộc gọi thoại'
                    : 'Cuộc gọi video';
            } else if (status === 'missed' || status === 'cancelled') {
                callMainContent = 'Cuộc gọi nhỡ';
            } else if (status === 'declined') {
                callMainContent = caller_id === this.authService.getUserId()
                    ? 'Đã bị từ chối'
                    : 'Đã từ chối';
            } else {
                callMainContent = media_type === 'audio'
                    ? 'Cuộc gọi thoại'
                    : 'Cuộc gọi video';
            }
        }

        return callMainContent;
    }

    getCallDescription(callInfo: any): string {
        if (!callInfo) return '';

        if (callInfo.status === 'pending' || callInfo.status === 'ongoing') {
            return 'Cuộc gọi đang diễn ra';
        }

        // Nếu có thời lượng cuộc gọi
        if (callInfo.duration_seconds && callInfo.duration_seconds > 0) {
            return this.formatCallDuration(callInfo.duration_seconds);
        }

        return 'Cuộc gọi đã kết thúc';
    }

    // Format call duration (seconds to mm:ss or HH:mm:ss)
    formatCallDuration(durationSeconds: number): string {
        if (!durationSeconds || durationSeconds <= 0) return '00:00';

        const hours = Math.floor(durationSeconds / 3600);
        const minutes = Math.floor((durationSeconds % 3600) / 60);
        const seconds = durationSeconds % 60;

        if (hours > 0) {
            return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
        }

        return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }


    private lastTypingEmitTime = 0;

    onTyping() {
        const now = Date.now();
        // Emit typing event if we just started typing OR if 1.5 seconds have passed since last emit (Heartbeat)
        if (!this.isTyping || now - this.lastTypingEmitTime > 1500) {
            this.isTyping = true;
            this.lastTypingEmitTime = now;
            this.socketService.emit('typing', {
                conversation_id: this.conversationId(),
                user_id: this.currentUserId(),
                full_name: this.authService.getUserInfor()?.full_name
            });
        }

        if (this.typingTimeout) clearTimeout(this.typingTimeout);

        this.typingTimeout = setTimeout(() => {
            this.stopTyping();
        }, 1500);
    }

    stopTyping() {
        if (this.isTyping) {
            this.isTyping = false;
            this.socketService.emit('stopTyping', {
                conversation_id: this.conversationId(),
                user_id: this.currentUserId()
            });
            if (this.typingTimeout) clearTimeout(this.typingTimeout);
        }
    }

    // --- Mention Methods ---

    private checkMentionState() {
        const selection = window.getSelection();
        if (!selection || selection.rangeCount === 0) return;

        const range = selection.getRangeAt(0);
        const container = range.startContainer;

        if (container.nodeType !== Node.TEXT_NODE) {
            this.closeMentionList();
            return;
        }

        const textBeforeCursor = container.textContent?.substring(0, range.startOffset) || '';
        const lastAtIndex = textBeforeCursor.lastIndexOf('@');

        if (lastAtIndex !== -1) {
            if (lastAtIndex === 0 || textBeforeCursor.charAt(lastAtIndex - 1) === ' ' || textBeforeCursor.charAt(lastAtIndex - 1) === '\n') {
                const term = textBeforeCursor.substring(lastAtIndex + 1);
                if (!term.includes(' ')) {
                    this.mentionLastIndex = lastAtIndex;
                    this.mentionSearchTerm.set(term);
                    this.showMentionList.set(true);
                    this.mentionSelectedIndex.set(0);
                    this.saveSelection();
                    return;
                }
            }
        }

        this.closeMentionList();
    }

    private saveSelection() {
        const sel = window.getSelection();
        if (sel && sel.rangeCount > 0) {
            this.savedSelectionRange = sel.getRangeAt(0);
        }
    }

    private restoreSelection() {
        if (!this.savedSelectionRange) return;
        const sel = window.getSelection();
        if (sel) {
            try {
                sel.removeAllRanges();
                sel.addRange(this.savedSelectionRange);
            } catch (e) {
                console.error('Failed to restore selection:', e);
            }
        }
    }

    private closeMentionList() {
        this.showMentionList.set(false);
        this.mentionSearchTerm.set('');
        this.mentionSelectedIndex.set(0);
    }

    selectMention(participant: any) {
        if (!participant) return;
        this.restoreSelection();
        const sel = window.getSelection();
        if (!sel || sel.rangeCount === 0) return;

        const range = sel.getRangeAt(0);
        const textNode = range.startContainer;

        // Remove the "@term" text
        const textContent = textNode.textContent || '';
        const beforeAt = textContent.substring(0, this.mentionLastIndex);
        const afterCursor = textContent.substring(range.startOffset);

        textNode.textContent = beforeAt;

        // Create the pill
        const pill = document.createElement('span');
        pill.className = 'mention-pill';
        pill.setAttribute('data-id', participant.user_id);
        pill.textContent = `@${participant.full_name}`;
        pill.contentEditable = 'false';

        // Insert pill and trailing space
        range.setStartAfter(textNode);
        range.insertNode(pill);

        const spaceNode = document.createTextNode('\u00A0'); // Non-breaking space
        range.setStartAfter(pill);
        range.insertNode(spaceNode);

        // Move cursor after the space
        range.setStartAfter(spaceNode);
        range.collapse(true);
        sel.removeAllRanges();
        sel.addRange(range);

        // If there was text after the cursor, restore it
        if (afterCursor) {
            const trailingTextNode = document.createTextNode(afterCursor);
            range.insertNode(trailingTextNode);
            range.setStartBefore(trailingTextNode);
            range.collapse(true);
            sel.removeAllRanges();
            sel.addRange(range);
        }

        this.closeMentionList();
        this.cdr.markForCheck();
    }

    private handleMentionKeyDown(event: KeyboardEvent): boolean {
        if (!this.showMentionList()) return false;

        const participants = this.mentionParticipants();
        if (participants.length === 0) return false;

        switch (event.key) {
            case 'ArrowDown':
                if (event) event.preventDefault();
                const currentIdxDown = this.mentionSelectedIndex?.() ?? 0;
                this.mentionSelectedIndex?.set((currentIdxDown + 1) % participants.length);
                return true;
            case 'ArrowUp':
                if (event) event.preventDefault();
                const currentIdxUp = this.mentionSelectedIndex?.() ?? 0;
                this.mentionSelectedIndex?.set((currentIdxUp - 1 + participants.length) % participants.length);
                return true;
            case 'Enter':
            case 'Tab':
                if (event) event.preventDefault();
                const selIdx = this.mentionSelectedIndex?.() ?? 0;
                this.selectMention(participants[selIdx]);
                return true;
            case 'Escape':
                if (event) event.preventDefault();
                this.closeMentionList();
                return true;
        }
        return false;
    }

}
