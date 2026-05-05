import { inject, Injectable } from '@angular/core';
import { DIRECT_CALL, GROUP_CALL } from '../models/callData';
import { AuthService } from './authService';
import { CallStateService } from './callStateService';
import { LivekitCallService } from './livekitCallService';
import { P2PCallService } from './p2pCallService';
import { SocketService } from './socket';
import { CallService } from './callService';

@Injectable({
    providedIn: 'root',
})
export class WebRtcService {
    private callState = inject(CallStateService);
    private p2p = inject(P2PCallService);
    private livekit = inject(LivekitCallService);
    private socketService = inject(SocketService);
    private authService = inject(AuthService);
    private callService = inject(CallService);



    constructor() {
        // Đồng bộ callStatus và isCaller từ instance con về instance cha
        this.socketService.on('call:statusUpdated', (data) => {
            if (this.callState.conversationId === data.conversationId) {
                this.callState.callStatus.set(data.callStatus);
                if (data.isCaller !== undefined) {
                    this.callState.isCaller.set(data.isCaller);
                }
            }
        });

        // cleanup tab cha
        this.socketService.on('call:cleanUp', (userId) => {
            if (this.authService.getUserId() === userId) {
                this.cleanUp();
            }
        });

        // Nhận tín hiệu gác máy
        this.socketService.on('call:hangUp', () => {
            if (this.callState.conversationId !== '') {
                this.callState.callStatus.set('ended');
            }
        });

        // Bị từ chối
        this.socketService.on('call:declined', () => {
            this.callState.callStatus.set('declined');
        });

        // Bị lỡ cuộc gọi đến
        this.socketService.on('call:missed', () => {
            if (this.callState.callSessionData()) {
                this.callState.callStatus.set('missed');
                console.log('nhận call:missed::', this.callState.callStatus());
            }
        });

        // đồng bộ call state status giữa tab cha và con
        this.socketService.on('call:syncCallState', (data) => {
            if (this.authService.getUserId() === data.userId) {
                this.callState.callStatus.set(data.callStatus);
                this.callState.isCaller.set(data.isCaller);
            }
        });
    }

    startCall(
        conversationId: string,
        conversationType: string,
        callId: string,
        initializeVideo: boolean,
    ) {
        this.cleanUp();
        this.callState.conversationId = conversationId;
        this.callState.conversationType = conversationType;
        this.callState.callId = callId;
        this.callState.isCameraOn.set(initializeVideo);

        this.callState.callStatus.set('ringing');
        this.callState.isCaller.set(true);
        this.callState.syncCallStateToParent();

        if (conversationType === DIRECT_CALL) {
            this.p2p.call();
        } else if (conversationType === GROUP_CALL) {
            this.livekit.call();
        } else {
            console.log('Error: conversation type invalid');
            return;
        }

        this.callState.startCallTimeout(() => this.handleNoAnswer());
    }

    acceptIncomingCall(
        conversationId: string,
        conversationType: string,
        callId: string,
        offer: RTCSessionDescriptionInit | null,
        initializeVideo: boolean,
        // for P2P
        inviterName: string,
        inviterId: string,
        inviterAvatarUrl: string,
    ) {
        console.log('Accept incomming call');
        this.cleanUp();
        this.callState.conversationId = conversationId;
        this.callState.conversationType = conversationType;
        this.callState.callId = callId;
        this.callState.isCameraOn.set(initializeVideo);

        if (conversationType === DIRECT_CALL) {
            this.p2p.answerOffer(offer!, inviterName, inviterId, inviterAvatarUrl);
        } else if (conversationType === GROUP_CALL) this.livekit.joinRoom({ isInviter: false });
    }

    declineIncomingCall(conversationId: string, conversationType: string) {
        if (conversationType === DIRECT_CALL) {
            this.socketService.emit('call:declined', conversationId);
        }
        this.cleanUp();
    }

    endCall() {
        const callStatus = this.callState.callStatus();

        // với cuộc gọi nhóm, gửi tín hiệu để cập nhật db và đóng modal khi cuộc gọi vừa kết thúc
        // gửi tín hiệu cuộc gọi nhỡ nếu chưa ai bắt máy
        if (callStatus === 'ringing')
            this.socketService.emit('call:missed', this.callState.conversationId);

        // cleanup tab cha
        this.socketService.emit('call:cleanUp', {
            conversationId: this.callState.conversationId,
            userId: this.authService.getUserId(),
        });

        if (this.callState.conversationType === DIRECT_CALL) this.p2p.end();
        else this.livekit.end();
    }

    handleNoAnswer() {
        this.socketService.emit('call:missed', this.callState.conversationId);

        const callId = this.callState.callId;
        this.callService.updateStatus(callId, 'missed', {
            conversationId: this.callState.conversationId,
        });

        // cleanup tab cha
        this.socketService.emit('call:cleanUp', {
            conversationId: this.callState.conversationId,
            userId: this.authService.getUserId(),
        });

        this.callState.callStatus.set('missed');
        this.callState.syncCallStateToParent();

        this.cleanUp({resetCallStatus: false});
    }

    toggleCamera() {
        if (this.callState.conversationType === GROUP_CALL) {
            return this.livekit.toggleCamera();
        } else {
            return this.p2p.toggleCamera();
        }
    }

    toggleMicrophone() {
        if (this.callState.conversationType === GROUP_CALL) {
            return this.livekit.toggleMicrophone();
        } else {
            return this.p2p.toggleMicrophone();
        }
    }

    cleanUp({ resetCallStatus = true } = {}) {
        this.p2p.cleanUp();
        this.livekit.cleanUp();
        this.callState.cleanUp({ resetCallStatus });
    }

    getGroupCallMembersCount() {
        if(this.callState.conversationType !== GROUP_CALL) return undefined;
        const remoteParticipantCount = this.livekit.getRemoteParticipantsCount();
        if(!remoteParticipantCount) return undefined;
        return remoteParticipantCount + 1;
    }
}
