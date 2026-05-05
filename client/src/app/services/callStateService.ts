import { inject, Injectable, signal } from '@angular/core';
import { CallSessionData, CallStatus, DIRECT_CALL } from '../models/callData';
import { SocketService } from './socket';
import { AuthService } from './authService';

export interface RemoteParticipant {
    participantId: string;
    participantName: string;
    participantAvatarUrl: string;
    audioStream: MediaStream;
    videoStream: MediaStream;
    hasAudio: boolean;
    hasVideo: boolean;
}

@Injectable({
    providedIn: 'root',
})
export class CallStateService {
    callSessionData = signal<CallSessionData | null>(null); // chỉ người nhận mới có
    localStream = signal<MediaStream | null>(null);
    remoteParticipants = signal<RemoteParticipant[]>([]);
    isCameraOn = signal<boolean>(true);
    isMicOn = signal<boolean>(true);
    isCaller = signal<boolean>(false);
    callStatus = signal<CallStatus>('idle');

    conversationId = '';
    conversationType = '';
    callId = '';
    CALL_TIMEOUT_MS = 30000;
    callTimeoutId: number | null = null;

    socketService = inject(SocketService);
    authService = inject(AuthService);

    cleanUp({ resetCallStatus }: { resetCallStatus: boolean }) {
        this.clearCallTimeout();

        this.localStream()
            ?.getTracks()
            .forEach((track) => track.stop());

        this.remoteParticipants().forEach(({ audioStream, videoStream }) => {
            audioStream.getTracks().forEach((track) => track.stop());
            videoStream.getTracks().forEach((track) => track.stop());
        });

        this.callSessionData.set(null);
        this.localStream.set(null);
        this.remoteParticipants.set([]);
        this.isCameraOn.set(true);
        this.isMicOn.set(true);
        this.isCaller.set(false);
        this.conversationId = '';
        this.conversationType = '';
        this.callId = '';

        if (resetCallStatus) this.callStatus.set('idle');

        console.log('CallStateService cleaned up');
    }

    addVideoTrackToLocalStream(videoTrack: MediaStreamTrack) {
        const localStream = this.localStream();
        localStream?.addTrack(videoTrack);
        this.localStream.set(localStream);
    }

    removeVideoTrackFromLocalStream() {
        const localStream = this.localStream();
        const videoTrack = localStream?.getVideoTracks();
        videoTrack?.forEach((track) => localStream?.removeTrack(track));
        this.localStream.set(localStream);
    }

    extractAudioStream(stream: MediaStream) {
        const audioStream = new MediaStream();
        const audioTrack = stream.getAudioTracks();

        if (audioTrack) audioTrack.forEach((track) => audioStream.addTrack(track));
        return audioStream;
    }

    extractVideoStream(stream: MediaStream) {
        const videoStream = new MediaStream();
        const videoTrack = stream.getVideoTracks();

        if (videoTrack) videoTrack.forEach((track) => videoStream.addTrack(track));
        return videoStream;
    }

    syncCallStateToParent() {
        this.socketService.emit('call:syncCallState', {
            conversationId: this.conversationId,
            userId: this.authService.getUserId(),
            callStatus: this.callStatus,
            isCaller: this.isCaller,
        });
    }

    clearCallTimeout() {
        if (this.callTimeoutId) {
            clearTimeout(this.callTimeoutId);
            this.callTimeoutId = null;
        }
    }

    // callback: (tham số) => kiểu trả về
    startCallTimeout(onTimeout: () => void) {
        this.clearCallTimeout();
        this.callTimeoutId = window.setTimeout(() => {
            onTimeout();
            this.callTimeoutId = null;
        }, this.CALL_TIMEOUT_MS);
    }
}
