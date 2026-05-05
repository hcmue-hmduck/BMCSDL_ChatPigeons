import { Component, computed, HostListener, inject, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { AvatarWrap, GROUP_CALL } from '../../models/callData';
import { AuthService } from '../../services/authService';
import { CallBroadcastService } from '../../services/callBroadcastService';
import { CallStateService } from '../../services/callStateService';
import { SocketService } from '../../services/socket';
import { WebRtcService } from '../../services/webRTCService';
import { GroupAvatarLayoutComponent } from '../groupAvatarLayout/groupAvatarLayout.component';

@Component({
    selector: 'app-call-layout',
    standalone: true,
    imports: [GroupAvatarLayoutComponent],
    templateUrl: './callLayout.html',
    styleUrl: './callLayout.css',
})
export class CallLayoutComponent implements OnInit {
    webRTCService = inject(WebRtcService);
    socketService = inject(SocketService);
    authService = inject(AuthService);
    activatedRoute = inject(ActivatedRoute);
    callState = inject(CallStateService);
    callBroadcastService = inject(CallBroadcastService);
    avatarWrap: AvatarWrap | null = null;

    readonly avatarUrlDefault = 'assets/AvatarDefault.jpg';

    userAvatarUrl = computed<string>(() => {
        return this.authService.getUserInfor()?.avatar_url || this.avatarUrlDefault;
    });

    waitingAvatarUrl = computed<string>(() => {
        return this.avatarWrap?.avatarUrl || this.avatarUrlDefault;
    });

    waitingIsGroup = computed<boolean>(() => {
        return !!this.avatarWrap?.isGroup;
    });

    waitingMembers = computed<any[]>(() => {
        return this.avatarWrap?.members || [];
    });

    remoteCount = computed<number>(() => {
        return this.callState.remoteParticipants().length;
    });

    totalCount = computed<number>(() => {
        return this.remoteCount() + (this.callStreamExists() ? 1 : 0);
    });

    callStreamExists = computed(() => {
        return !!this.callState.localStream();
    });

    isWaiting = computed(() => {
        // Đang chờ nếu trạng thái là ringing và chưa có người tham gia khác (remoteCount == 0)
        return this.callState.callStatus() === 'ringing' && this.remoteCount() === 0;
    });

    isTwoPeople = computed(() => {
        return this.totalCount() === 2;
    });

    isGroupCall = computed(() => {
        return this.totalCount() > 2;
    });

    isGroupConversation = computed(() => {
        return this.callState.conversationType === GROUP_CALL;
    });

    // callState.cleanUp() reset conversationType, so keep group context from initial avatar payload.
    isGroupContext = computed(() => {
        return this.isGroupConversation() || this.waitingIsGroup();
    });

    isDeclined = computed(() => {
        return this.callState.callStatus() === 'declined';
    });

    isCallEnded = computed(() => {
        return this.callState.callStatus() === 'ended';
    });

    isNoAnswer = computed(() => {
        return this.callState.callStatus() === 'missed';
    });

    ngOnInit(): void {
        const navigation = performance.getEntriesByType(
            'navigation',
        )[0] as PerformanceNavigationTiming; // Type Assertion
        if (navigation && navigation.type === 'reload') {
            // Nếu reload trang thì không Gọi
            return;
        }

        const listener = async (event: MessageEvent) => {
            if (event.origin !== window.location.origin) return;
            if (event.data.type !== 'sendCallData') return;

            const {
                conversationType,
                conversationId,
                userId,
                initializeVideo,
                inviterName,
                inviterId,
                inviterAvatarUrl,
                callId,
                avatarWrap,
            } = event.data;

            this.avatarWrap = avatarWrap || null;

            await this.authService.setUserInfo(userId);
            this.socketService.emit('joinConversation', conversationId);

            const mode = this.activatedRoute.snapshot.queryParamMap.get('mode');
            if (mode === 'accept') {
                const { offer } = event.data;
                this.webRTCService.acceptIncomingCall(
                    conversationId,
                    conversationType,
                    callId,
                    offer,
                    initializeVideo,
                    inviterName,
                    inviterId,
                    inviterAvatarUrl,
                );
            } else
                this.webRTCService.startCall(
                    conversationId,
                    conversationType,
                    callId,
                    initializeVideo,
                );

            window.removeEventListener('message', listener);
        };

        window.addEventListener('message', listener);

        window.opener.postMessage({ type: 'getCallData' }, window.location.origin);
    }

    endCall() {
        this.webRTCService.endCall();
    }

    toggleCamera() {
        this.webRTCService.toggleCamera();
    }

    toggleMicrophone() {
        this.webRTCService.toggleMicrophone();
    }

    closeCallWindow() {
        this.endCall();
        window.close();
    }

    // Ngăn người dùng lỡ tay đóng tab/trình duyệt
    @HostListener('window:beforeunload', ['$event'])
    unloadNotification($event: any) {
        // $event.preventDefault();
        // $event.returnValue = true;
    }

    @HostListener('window:pagehide', ['$event'])
    onPageHide(event: PageTransitionEvent) {
        // pagehide đáng tin cậy hơn unload và ít bị kích hoạt sai như visibilitychange

        const groupCallMembersCount = this.webRTCService.getGroupCallMembersCount();
        if (!(groupCallMembersCount && groupCallMembersCount > 1)) {
            this.callBroadcastService.emitEvent('call_close', {
                call_id: this.callState.callId,
            });
        }

        this.webRTCService.endCall();
    }
}
