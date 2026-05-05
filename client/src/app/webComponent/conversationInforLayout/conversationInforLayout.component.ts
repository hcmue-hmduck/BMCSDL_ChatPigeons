import { Component, signal, Output, EventEmitter, Input, OnInit, OnDestroy, inject, ChangeDetectorRef, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { GroupAvatarLayoutComponent } from '../groupAvatarLayout/groupAvatarLayout.component';
import { MediaService } from '../../services/media';
import { Friend } from '../../services/friend';
import { Participant } from '../../services/participant';
import { FormsModule } from '@angular/forms';
import { SocketService } from '../../services/socket';
import { FileUtils } from '../../utils/FileUtils/fileUltils';
import { ImgVidUtils } from '../../utils/img_vidUtils/img_vidUtils';
import { forkJoin, lastValueFrom } from 'rxjs';
import { Messages } from '../../services/messages';
import { ActiveConversationService } from '../../services/activeConversation.service';

@Component({
    selector: 'app-conversation-info-layout',
    standalone: true,
    imports: [CommonModule, GroupAvatarLayoutComponent, FormsModule],
    templateUrl: './conversationInforLayout.component.html',
    styleUrls: ['./conversationInforLayout.component.css']
})
export class ConversationInfoLayoutComponent implements OnInit, OnDestroy, OnChanges {
    @Output() closePanel = new EventEmitter<void>();

    @Input() userInfor: any;
    @Input() conversationInfor: any;
    @Input() currentUserId = '';
    @Input() userPresence: Map<string, { status: string; last_online_at: string | Date }> = new Map();
    @Input() conversationAvatar: string | null = null;

    imgData = signal<any[]>([]);
    vidData = signal<any[]>([]);
    fileData = signal<any[]>([]);
    linkData = signal<any[]>([]);

    mediaViewer!: ImgVidUtils;

    // Add Member modal state
    isAddMemberModalOpen = false;
    isLoadingFriends = false;
    friends: any[] = [];
    selectedFriendIds = new Set<string>();
    addMemberSearchQuery = '';
    isAddingMembers = false;
    addMemberError = '';

    mediaService = inject(MediaService);
    friendService = inject(Friend);
    participantService = inject(Participant);
    socketService = inject(SocketService);
    messagesService = inject(Messages);
    fileUtils = inject(FileUtils);
    activeConversationService = inject(ActiveConversationService);
    private cdr = inject(ChangeDetectorRef);
    private onUpdateConversationInfoSocket?: (data: any) => void;

    constructor() {
        this.mediaViewer = new ImgVidUtils(this.fileUtils);
    }

    ngOnInit(): void {
        this.loadMediaData();
        this.socketEmitListener();
        if (this.currentUserId) {
            this.loadFriends();
        }
    }

    ngOnChanges(changes: SimpleChanges): void {
        if (changes['conversationInfor'] && !changes['conversationInfor'].isFirstChange()) {
            this.loadMediaData();
            // Reset UI states for the new conversation
            this.mediaShowAll.set({
                image: false,
                video: false,
                file: false,
                link: false
            });
        }

        if (changes['currentUserId'] && !changes['currentUserId'].isFirstChange()) {
            this.loadFriends();
        }
    }

    socketEmitListener() {
        if (this.onUpdateConversationInfoSocket) {
            this.socketService.off('updateConversationInfo', this.onUpdateConversationInfoSocket);
        }

        this.onUpdateConversationInfoSocket = (data: any) => {
            const currentActiveId = this.activeConversationService.activeConversationId() || 
                                    this.conversationInfor?.conversation_id;
                                    
            // So sánh linh hoạt hơn: Kiểm tra ID thật hoặc ID đang active trên store
            if ((data.conversation_id === this.conversationInfor?.conversation_id || 
                 data.conversation_id === currentActiveId) && data.upload_file) {
                const newFiles = Array.isArray(data.upload_file) ? data.upload_file : [data.upload_file];
                newFiles.forEach((file: any) => {
                    const mType = file.message_type || file.resource_type;
                    if (mType === 'image') {
                        this.imgData.update(prev => [file, ...prev]);
                    } else if (mType === 'video') {
                        this.vidData.update(prev => [file, ...prev]);
                    } else if (mType === 'raw' || mType === 'file' || mType === 'audio') {
                        this.fileData.update(prev => [file, ...prev]);
                    }
                });
            }
        };

        this.socketService.on('updateConversationInfo', this.onUpdateConversationInfoSocket);
    }

    ngOnDestroy(): void {
        if (this.onUpdateConversationInfoSocket) {
            this.socketService.off('updateConversationInfo', this.onUpdateConversationInfoSocket);
            this.onUpdateConversationInfoSocket = undefined;
        }
    }

    loadMediaData() {
        const convID = this.conversationInfor?.conversation_id;
        if (!convID) return;

        this.mediaService.getMedia(convID).subscribe((res: any) => {
            const data = res?.metadata?.mediaMesssage;
            if (data) {
                const images = data.image || [];
                const videos = data.video || [];
                const files = data.file || [];
                const links = data.link || [];

                this.imgData.set(images);
                this.vidData.set(videos);
                this.fileData.set(files);
                this.linkData.set(links);

                // Auto open sections with data
                this.sections.update(prev => ({
                    ...prev,
                    image: images.length > 0,
                    video: videos.length > 0,
                    file: files.length > 0,
                    link: links.length > 0,
                    members: this.isGroupConversation
                }));
            }
        });
    }

    get participants(): any[] {
        return this.conversationInfor?.participants || [];
    }

    get isGroupConversation(): boolean {
        return this.conversationInfor?.type === 'group';
    }

    get otherParticipant(): any | null {
        if (this.isGroupConversation) return null;
        return this.conversationInfor?.participants.find((p: any) => p.user_id !== this.currentUserId)
    }

    get profileName(): string {
        return this.conversationInfor?.title || this.otherParticipant?.full_name || 'Cuộc trò chuyện';
    }

    get profileAvatar(): string {
        if (this.isGroupConversation) {
            return this.conversationAvatar || this.conversationInfor?.avatar_url || 'assets/AvatarDefault.jpg';
        }
        return this.otherParticipant?.avatar_url || 'assets/AvatarDefault.jpg';
    }

    sections = signal({
        chatInfo: false,
        customization: false,
        members: false,
        image: false,
        video: false,
        file: false,
        link: false,
        privacy: false
    });

    mediaShowAll = signal({
        image: false,
        video: false,
        file: false,
        link: false
    });

    toggleSection(sectionName: keyof ReturnType<typeof this.sections>) {
        const current = this.sections();
        this.sections.set({
            ...current,
            [sectionName]: !current[sectionName]
        });
    }

    toggleMediaShowAll(type: keyof ReturnType<typeof this.mediaShowAll>) {
        const current = this.mediaShowAll();
        this.mediaShowAll.set({
            ...current,
            [type]: !current[type]
        });
    }

    get isImageViewerOpen(): boolean {
        return this.mediaViewer.isOpen && this.mediaViewer.type === 'image';
    }

    get isVideoViewerOpen(): boolean {
        return this.mediaViewer.isOpen && this.mediaViewer.type === 'video';
    }

    get currentViewerIndex(): number {
        return this.mediaViewer.currentIndex;
    }

    get currentVideoIndex(): number {
        return this.mediaViewer.currentIndex;
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

    get isViewerDragging(): boolean {
        return this.mediaViewer.isDragging;
    }

    get viewerPanX(): number {
        return this.mediaViewer.panX;
    }

    get viewerPanY(): number {
        return this.mediaViewer.panY;
    }

    openGallery(index: number) {
        const urls = this.imgData().map(item => item.file_url).filter(Boolean);
        this.mediaViewer.openImageGallery(urls, index);
    }

    closeImageViewer() {
        this.mediaViewer.closeViewer();
    }

    get viewerImageUrl(): string {
        return this.mediaViewer.mediaUrl;
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

    openVideoGallery(index: number) {
        const urls = this.vidData().map(item => item.file_url).filter(Boolean);
        this.mediaViewer.openVideoGallery(urls, index);
    }

    closeVideoViewer() {
        this.mediaViewer.closeViewer();
    }

    get viewerVideoUrl(): string {
        return this.mediaViewer.mediaUrl;
    }

    nextVideo(event?: Event) {
        this.mediaViewer.next(event);
    }

    prevVideo(event?: Event) {
        this.mediaViewer.prev(event);
    }

    openLink(link: string) {
        if (link) {
            window.open(link, '_blank');
        }
    }

    downloadFile(file: any, event?: MouseEvent) {
        this.fileUtils.downloadFile(file, event);
    }

    handleAddMember() {
        this.openAddMemberModal();
    }

    loadFriends() {
        if (!this.currentUserId) return;
        this.isLoadingFriends = true;
        this.friendService.getFriendByUserId(this.currentUserId).subscribe({
            next: (res: any) => {
                const rawFriends = res?.metadata?.friends || [];
                this.friends = rawFriends.map((f: any) => ({
                    ...f,
                    full_name: f.friend?.full_name || f.full_name || 'Người dùng',
                    avatar_url: f.friend?.avatar_url || f.avatar_url || 'assets/AvatarDefault.jpg',
                    email: f.friend?.email || f.email || '',
                    status: f.friend?.status || f.status || 'offline',
                }));
                this.isLoadingFriends = false;
            },
            error: (err) => {
                this.isLoadingFriends = false;
            }
        });
    }

    openAddMemberModal() {
        if (!this.currentUserId) return;
        this.addMemberError = '';
        this.selectedFriendIds.clear();
        this.addMemberSearchQuery = '';
        this.isAddMemberModalOpen = true;
    }

    closeAddMemberModal() {
        this.isAddMemberModalOpen = false;
        this.selectedFriendIds.clear();
        this.addMemberSearchQuery = '';
        this.addMemberError = '';
    }

    toggleFriendSelection(friendId: string, checked: boolean) {
        if (checked) {
            this.selectedFriendIds.add(friendId);
        } else {
            this.selectedFriendIds.delete(friendId);
        }
    }

    get filteredFriends() {
        const currentParticipantIds = new Set(this.participants.map((p: any) => p.user_id));
        const nonMembers = this.friends.filter(f => !currentParticipantIds.has(f.friend_id));
        if (!this.addMemberSearchQuery.trim()) return nonMembers;
        const query = this.addMemberSearchQuery.toLowerCase();
        return nonMembers.filter(f =>
            f.full_name?.toLowerCase().includes(query) ||
            f.email?.toLowerCase().includes(query)
        );
    }

    submitAddMembers() {
        if (this.selectedFriendIds.size === 0 || this.isAddingMembers) return;

        const convID = this.conversationInfor?.conversation_id;
        if (!convID) return;

        this.isAddingMembers = true;
        this.addMemberError = '';
        const selectedIds = Array.from(this.selectedFriendIds);

        const addRequests = selectedIds.reduce((acc: any, userId) => {
            acc[userId] = this.participantService.postParticipant({
                conversation_id: convID,
                user_id: userId,
                role: 'member'
            });
            return acc;
        }, {});

        forkJoin(addRequests).subscribe({
            next: async () => {
                this.isAddingMembers = false;
                const allParticipantIds = [
                    ...this.participants.map((p: any) => p.user_id),
                    ...selectedIds
                ];

                try {
                    const systemMessageRequests = selectedIds.map(addedUserId =>
                        lastValueFrom(this.messagesService.postMessage(
                            convID,
                            addedUserId,
                            '<i class="bi bi-person-plus"></i> đã được thêm vào nhóm',
                            undefined,
                            'system'
                        ))
                    );

                    const savedMessages = await Promise.all(systemMessageRequests);

                    this.socketService.emit('addMember', {
                        conversation_id: convID,
                        added_user_ids: selectedIds,
                        added_by: this.currentUserId,
                        all_participant_ids: allParticipantIds,
                    });

                    savedMessages.forEach(response => {
                        const savedMsg = response.metadata?.newMessage;
                        if (savedMsg) {
                            const person = this.friends.find((f: any) => String(f.friend_id) === String(savedMsg.sender_id));
                            if (person) {
                                savedMsg.sender_name = person.full_name;
                                savedMsg.sender_avatar = person.avatar_url;
                            }
                            this.socketService.emit('sendMessage', savedMsg);
                        }
                    });

                    this.socketService.emit('notifyNewConversation', {
                        receiverIds: selectedIds,
                        conversationId: convID,
                    });
                } catch (err) { }

                this.closeAddMemberModal();
            },
            error: (err) => {
                this.addMemberError = 'Gặp lỗi khi thêm thành viên. Vui lòng thử lại.';
                this.isAddingMembers = false;
            }
        });
    }
}
