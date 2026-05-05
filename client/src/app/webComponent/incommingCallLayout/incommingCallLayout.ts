import { isPlatformBrowser } from '@angular/common';
import { Component, effect, inject, PLATFORM_ID, signal } from '@angular/core';
import { CallSessionData, DIRECT_CALL, GROUP_CALL } from '../../models/callData';
import { AuthService } from '../../services/authService';
import { CallService } from '../../services/callService';
import { CallStateService } from '../../services/callStateService';
import { SocketService } from '../../services/socket';
import { WebRtcService } from '../../services/webRTCService';
import { lastValueFrom } from 'rxjs';
import { error } from 'console';

@Component({
    selector: 'app-incomming-call-layout',
    imports: [],
    templateUrl: './incommingCallLayout.html',
    styleUrl: './incommingCallLayout.css',
})
export class IncommingCallLayout {
    webRTCService = inject(WebRtcService);
    callService = inject(CallService);
    callState = inject(CallStateService);
    socketService = inject(SocketService);
    authService = inject(AuthService);
    callSessionData = signal<CallSessionData | null>(null);
    userId = '';
    ringtone: HTMLAudioElement | undefined;

    private vibrateIntervalId: number | null = null;
    private platformId = inject(PLATFORM_ID);

    readonly directCallType = DIRECT_CALL;
    readonly groupCallType = GROUP_CALL;
    readonly avatarUrlDefault = 'assets/AvatarDefault.jpg';

    constructor() {
        if (isPlatformBrowser(this.platformId)) {
            this.ringtone = new Audio('assets/sounds/ringtone.mp3');
            this.ringtone.loop = true;
        }

        // hiện cuộc gọi tới
        effect(() => {
            const callSessionData = this.callState.callSessionData();
            const callStatus = this.callState.callStatus();
            this.userId = this.authService.getUserId();

            if (
                callSessionData &&
                callStatus === 'ringing' &&
                callSessionData.inviterId !== this.userId
            ) {
                this.callSessionData.set(callSessionData);
                this.playRingTone();
                this.startVibrating();
            } else {
                this.callSessionData.set(null);
                this.stopRingtone();
                this.stopVibrating();
            }
        });
    }

    playRingTone() {
        // if (this.ringtone) {
        //     this.ringtone.play().catch((error) => {
        //         console.warn(error);
        //     });
        // }
    }

    stopRingtone() {
        if (this.ringtone) {
            this.ringtone.pause();
            this.ringtone.currentTime = 0; // Quay lại đầu file
        }
    }

    startVibrating() {
        // navigator.vibrate([1000, 1000]);
        // if (navigator.vibrate) {
        //     this.vibrateIntervalId = window.setInterval(() => {
        //         navigator.vibrate([1000, 2000]);
        //     }, 3000);
        // }
    }

    stopVibrating() {
        // if (this.vibrateIntervalId) {
        //     window.clearInterval(Number(this.vibrateIntervalId));
        //         this.vibrateIntervalId = null;
        // } else navigator.vibrate(0);
    }

    handleAccept() {
        if (!this.callSessionData) return;
        const { conversationType, conversationId } = this.callSessionData()!;
        if (!conversationType || !conversationId) return;

        this.stopRingtone();
        this.stopVibrating();

        console.log('handleAccept:::', conversationType);

        this.callService
            .joinCall(this.callSessionData()?.callId!)
            .subscribe({ error: (error) => console.error(error) });

        if (conversationType === this.groupCallType) {
            this.callService
                .createLogJoinGroupCall(conversationId) // Tạo message system tham gia cuộc gọi
                .subscribe({
                    next: (res) => {
                        const { full_name, avatar_url } = this.authService.getUserInfor();
                        const callMessage = {
                            ...res.metadata,
                            sender_name: full_name,
                            sender_avatar: avatar_url,
                        };
                        // Thông báo cho messageLayout cập nhật UI
                        this.callService.announceNewLogJoinGroupCall({
                            content: callMessage,
                            conversationId: callMessage.conversation_id,
                        });
                    },
                    error: (error) => console.error(error),
                });
        }

        this.openCallWindow();
    }

    handleDecline() {
        if (this.callSessionData) {
            const { conversationId, conversationType, callId } = this.callSessionData()!;

            // set status call = decliend nếu là cuộc gọi 2 người
            if (conversationType === this.directCallType) {
                this.callService.updateStatus(callId, 'declined', {
                    conversationId,
                });
            }

            this.webRTCService.declineIncomingCall(conversationId, conversationType);
            this.stopRingtone();
            this.stopVibrating();
        }
    }

    closeOverlay() {
        this.callState.callSessionData.set(null);
    }

    openCallWindow() {
        const listener = (event: MessageEvent) => {
            if (event.origin !== window.location.origin) return;
            if (event.data.type === 'getCallData') {
                const {
                    callId,
                    conversationId,
                    conversationType,
                    offer,
                    initializeVideo,
                    inviterName,
                    inviterAvatarUrl,
                    inviterId,
                } = this.callSessionData()!;

                const payload = {
                    type: 'sendCallData',
                    callId,
                    conversationType,
                    conversationId,
                    userId: this.userId,
                    initializeVideo,
                    inviterName,
                    inviterAvatarUrl,
                    inviterId,
                    ...(offer && { offer }),
                };

                (event.source as Window)?.postMessage(payload, window.location.origin);

                window.removeEventListener('message', listener);
                this.callState.callSessionData.set(null);
            }
        };

        window.addEventListener('message', listener);

        const width = 1200,
            height = 700,
            left = window.screen.width / 2 - width / 2,
            top = window.screen.height / 2 - height / 2,
            features = `width=${width},height=${height},top=${top},left=${left},menubar=no,toolbar=no,location=no,status=no,resizable=yes`;

        window.open(
            `/call-display?mode=accept`, // url
            'CallWindow', // window name
            features,
        );
    }
}
