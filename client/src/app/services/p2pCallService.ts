import { inject, Injectable } from '@angular/core';
import { DIRECT_CALL } from '../models/callData';
import { AuthService } from './authService';
import { CallStateService } from './callStateService';
import { SocketService } from './socket';
import { CallService } from './callService';

@Injectable({
    providedIn: 'root',
})
export class P2PCallService {
    private socketService = inject(SocketService);
    private callState = inject(CallStateService);
    private authService = inject(AuthService);
    private callService = inject(CallService);

    private peerConnection: RTCPeerConnection | null = null;
    private dataChannel: RTCDataChannel | null = null;
    private remoteIceCandidates: RTCIceCandidate[] = [];
    private localIceCandidates: RTCIceCandidate[] = [];
    private canSendLocalIceCandidates = false;

    private friendId = '';
    private friendName = '';
    private friendAvatarUrl = '';

    private updateRemoteMediaState(kind: 'audio' | 'video', enabled: boolean) {
        this.callState.remoteParticipants.update((participants) => {
            return participants.map((p) => {
                if (kind === 'audio') return { ...p, hasAudio: enabled };
                return { ...p, hasVideo: enabled };
            });
        });
    }

    constructor() {
        // Client 2 nhận offer từ Client 1
        this.socketService.on('directCall:offerAwaiting', (data) => {
            const userId = this.authService.getUserId();
            if (userId === data.inviterId) return;

            console.log('Receive offer...');
            console.log(`data.callId`, data.callId);

            this.callState.callStatus.set('ringing');
            this.callState.callId = data.callId;

            this.callState.callSessionData.set({
                conversationId: data.conversationId,
                conversationType: DIRECT_CALL,
                callId: data.callId,
                inviterName: data.inviterName,
                inviterAvatarUrl: data.inviterAvatarUrl,
                inviterId: data.inviterId,
                offer: data.offer,
                initializeVideo: data.initializeVideo,
            });
        });

        // Client 1 nhận answer từ Client 2
        this.socketService.on('directCall:answerResponse', async (data) => {
            this.callState.clearCallTimeout();
            this.setFriendInfo(data.answererId, data.answererName, data.answererAvatarUrl);
            await this.handleAnswer(data);
        });

        // Nhận ICE candidate từ client kia
        this.socketService.on('directCall:newIceCandidate', (iceCandidate) => {
            this.addIceCandidate(iceCandidate);
        });
    }

    setFriendInfo(id: string, name: string, avatar: string) {
        this.friendId = id;
        this.friendName = name;
        this.friendAvatarUrl = avatar;
    }

    async call() {
        try {
            await this.getUserMedia();
            await this.createRTCPeerConnection({ isOfferer: true });

            const offer = await this.peerConnection?.createOffer();
            await this.peerConnection?.setLocalDescription(offer);

            const { full_name, avatar_url, id } = this.authService.getUserInfor();
            this.socketService.emit('directCall:newOffer', {
                offer,
                conversationId: this.callState.conversationId,
                callId: this.callState.callId,
                inviterName: full_name,
                inviterAvatarUrl: avatar_url,
                inviterId: id,
                initializeVideo: this.callState.isCameraOn(),
            });

            console.log('P2P offer sent');
        } catch (error) {
            console.log(error);
            this.callState.callStatus.set('failed');
            this.callState.syncCallStateToParent();
        }
    }

    end() {
        const callStatus = this.callState.callStatus();
        const callId = this.callState.callId;

        if (callStatus === 'ringing') {
            this.callService.updateStatus(callId, 'cancelled', {
                conversationId: this.callState.conversationId,
            });
        }
        else if (callStatus === 'connected') {
            this.callService.updateStatus(callId, 'completed', {
                conversationId: this.callState.conversationId,
            });
            // phát tín hiệu gác máy
            this.socketService.emit('call:hangUp', this.callState.conversationId);
        }

        this.cleanUp();
        this.callState.callStatus.set('ended');
        this.callState.syncCallStateToParent();
        this.callState.cleanUp({ resetCallStatus: false });
    }

    // handleNoAnswer() {
    //     const callId = this.callState.callId;
    //     this.callService.updateStatus(callId, 'missed')

    //     this.cleanUp();
    //     this.callState.callStatus.set('missed');
    //     this.callState.syncCallStateToParent();
    //     this.callState.cleanUp({ resetCallStatus: false });
    // }

    cleanUp() {
        this.peerConnection?.close();
        this.peerConnection = null;
        this.remoteIceCandidates = [];
        this.localIceCandidates = [];
        this.canSendLocalIceCandidates = false;
        this.friendName = '';
        this.friendAvatarUrl = '';
    }

    async getUserMedia() {
        try {
            const initializeVideo = this.callState.isCameraOn();
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: true,
                video: initializeVideo,
            });
            this.callState.localStream.set(stream);
        } catch (error) {
            console.log('GUM error');
            throw error;
        }
    }

    async createRTCPeerConnection({ isOfferer }: { isOfferer: boolean }) {
        try {
            const iceServers = [
                {
                    urls: [
                        'stun:stun.l.google.com:19302',
                        'stun:stun1.l.google.com:19302',
                        'stun:stun2.l.google.com:19302',
                    ],
                },
                {
                    urls: [
                        'turn:free.expressturn.com:3478?transport=udp',
                        'turn:free.expressturn.com:3478?transport=tcp',
                    ],
                    username: '000000002085840964',
                    credential: 'sKjvQuFxUdRfoMmPTuZdYnJMtsU=',
                },
                {
                    urls: [
                        'turn:global.relay.metered.ca:80',
                        'turn:global.relay.metered.ca:80?transport=tcp',
                        'turn:global.relay.metered.ca:443',
                        'turns:global.relay.metered.ca:443?transport=tcp',
                    ],
                    username: '5dfbd13aff31fb43c684a6f8',
                    credential: 'Be36dmr4lOTvBgvx',
                },
            ];
            this.peerConnection = new RTCPeerConnection({
                iceTransportPolicy: 'all',
                iceServers,
            });

            // Debug ICE/DTLS states to track connectivity issues
            this.peerConnection.addEventListener('iceconnectionstatechange', () => {
                console.log('ICE connection state:', this.peerConnection?.iceConnectionState);
                window.setTimeout(() => {
                    this.logUsedIceServer();
                }, 1000);
            });

            this.peerConnection.addEventListener('icegatheringstatechange', () => {
                console.log('ICE gathering state:', this.peerConnection?.iceGatheringState);
            });

            this.peerConnection.addEventListener('connectionstatechange', () => {
                const state = this.peerConnection?.connectionState;
                console.log('Peer connection state:', state);

                if (state === 'connected') {
                    this.callState.callStatus.set('connected');
                    this.callState.syncCallStateToParent();
                } else if (state === 'failed' || state === 'disconnected') {
                    this.callState.callStatus.set('ended');
                    this.callState.syncCallStateToParent();
                }
            });

            this.peerConnection.addEventListener('icecandidateerror', (event) => {
                console.log('ICE candidate error:', event);
            });

            // Khi nhận được icecandidate mới từ STUN server
            this.peerConnection.addEventListener('icecandidate', (event) => {
                if (event.candidate !== null) {
                    // Gửi candidate sau khi setLocalDescription
                    if (this.canSendLocalIceCandidates) {
                        this.sendIceCandidate(event.candidate);
                    } else this.localIceCandidates.push(event.candidate);
                }
            });

            // Khi nhận được track từ client khác
            this.peerConnection.addEventListener('track', (event) => {
                let stream = event.streams[0];

                if (!stream) {
                    stream = new MediaStream();
                    stream.addTrack(event.track);
                }

                console.log('Nhận track....');
                stream
                    .getAudioTracks()
                    .some((track) => console.log(`stream.getAudioTracks().some`, track.enabled));
                stream
                    .getVideoTracks()
                    .some((track) => console.log(`stream.getVideoTracks().some`, track.enabled));

                if (event.track.kind === 'audio') {
                    event.track.onmute = () => this.updateRemoteMediaState('audio', false);
                    event.track.onunmute = () => this.updateRemoteMediaState('audio', true);
                    event.track.onended = () => this.updateRemoteMediaState('audio', false);
                } else if (event.track.kind === 'video') {
                    event.track.onmute = () => this.updateRemoteMediaState('video', false);
                    event.track.onunmute = () => this.updateRemoteMediaState('video', true);
                    event.track.onended = () => this.updateRemoteMediaState('video', false);
                }

                const currentParticipants = this.callState.remoteParticipants();
                const p2pUser = currentParticipants[0];

                if (!p2pUser) {
                    const audioStream = this.callState.extractAudioStream(stream);
                    const videoStream = this.callState.extractVideoStream(stream);

                    this.callState.remoteParticipants.set([
                        {
                            participantId: this.friendId,
                            participantName: this.friendName,
                            participantAvatarUrl: this.friendAvatarUrl,
                            audioStream,
                            videoStream,
                            hasAudio: audioStream.getTracks().some((track) => !track.muted),
                            hasVideo: videoStream.getTracks().some((track) => !track.muted),
                        },
                    ]);
                } else {
                    let existStream: MediaStream | null = null;

                    if (event.track.kind === 'audio') existStream = p2pUser.audioStream;
                    else if (event.track.kind === 'video') existStream = p2pUser.videoStream;

                    if (
                        existStream &&
                        !existStream.getTracks().find((track) => track.id === event.track.id)
                    )
                        existStream.addTrack(event.track);
                    this.callState.remoteParticipants.set([...currentParticipants]);
                }

                console.log('Track received...');
            });

            if (isOfferer) {
                this.addLocalTrackAsTransceivers();
                this.dataChannel = this.peerConnection.createDataChannel('chat', {
                    ordered: true,
                    maxRetransmits: 3,
                });
                this.setupDataChannel();
            } else {
                this.peerConnection.ondatachannel = (event) => {
                    this.dataChannel = event.channel;
                    this.setupDataChannel();
                };
            }
        } catch (error) {
            throw error;
        }
    }

    addLocalTrackAsTransceivers() {
        const stream = this.callState.localStream();
        if (!stream || !this.peerConnection) return;

        const audioTrack = stream.getAudioTracks()[0];
        if (audioTrack) {
            this.peerConnection.addTransceiver(audioTrack, {
                direction: 'sendrecv',
                streams: [stream],
            });
        }

        const videoTrack = stream.getVideoTracks()[0];
        if (videoTrack) {
            this.peerConnection.addTransceiver(videoTrack, {
                direction: 'sendrecv',
                streams: [stream],
            });
        } else {
            const tranceiver = this.peerConnection.addTransceiver('video', {
                direction: 'sendrecv',
                streams: [stream],
            });
            if (tranceiver.sender.track) tranceiver.sender.track.enabled = false;
            tranceiver.sender.replaceTrack(null);
        }
    }

    // gán sau khi người nhận set remote
    // không tạo tranceiver mới, cập nhật lại 1 luồng của tranceiver nhận từ người gọi
    attachLocalTrackToRemoteTransceivers() {
        const stream = this.callState.localStream();
        if (!stream || !this.peerConnection) return;

        this.peerConnection.getTransceivers().forEach((transceiver) => {
            const kind = transceiver.receiver.track.kind;

            if (kind === 'audio') {
                const audioTrack = stream.getAudioTracks()[0];
                transceiver.sender.replaceTrack(audioTrack);
                transceiver.direction = 'sendrecv';
            } else if (kind === 'video') {
                const videoTrack = stream.getVideoTracks()[0];
                transceiver.sender.replaceTrack(videoTrack);
                transceiver.direction = 'sendrecv';
            }
        });
    }

    async answerOffer(
        offer: RTCSessionDescriptionInit,
        inviterName: string,
        inviterId: string,
        inviterAvatarUrl: string,
    ) {
        try {
            this.setFriendInfo(inviterId, inviterName, inviterAvatarUrl);

            await this.getUserMedia();
            await this.createRTCPeerConnection({ isOfferer: false });

            await this.peerConnection?.setRemoteDescription(offer);
            if (this.remoteIceCandidates.length > 0) this.addRemoteIceCandidates();

            this.attachLocalTrackToRemoteTransceivers();

            const answer = await this.peerConnection?.createAnswer();
            await this.peerConnection?.setLocalDescription(answer);

            this.canSendLocalIceCandidates = true;
            this.sendLocalIceCandidates();

            const { full_name, avatar_url, id } = this.authService.getUserInfor();
            this.socketService.emit('directCall:newAnswer', {
                answer,
                conversationId: this.callState.conversationId,
                answererId: id,
                answererName: full_name,
                answererAvatarUrl: avatar_url,
            });
            console.log('P2P answer sent');
        } catch (error) {
            console.error(error);
            this.callState.callStatus.set('failed');
        }
    }

    async handleAnswer(data: any) {
        try {
            await this.peerConnection?.setRemoteDescription(data.answer);
            if (this.remoteIceCandidates.length > 0) this.addRemoteIceCandidates();

            this.canSendLocalIceCandidates = true;
            this.sendLocalIceCandidates();
        } catch (error) {
            console.error(error);
            throw error;
        }
    }

    addIceCandidate(iceCandidate: RTCIceCandidate) {
        try {
            if (this.peerConnection && this.peerConnection?.remoteDescription) {
                this.peerConnection?.addIceCandidate(iceCandidate);
            } else {
                // lưu lại để khi có peerConnection đã set remote sẽ dùng đến
                this.remoteIceCandidates.push(iceCandidate);
            }
        } catch (error) {
            console.error(error);
            throw error;
        }
    }

    sendIceCandidate(iceCandidate: RTCIceCandidate) {
        this.socketService.emit('directCall:newIceCandidate', {
            iceCandidate: iceCandidate,
            conversationId: this.callState.conversationId,
        });
    }

    sendLocalIceCandidates() {
        try {
            if (this.canSendLocalIceCandidates) {
                this.localIceCandidates.forEach((iceCandidate) => {
                    this.sendIceCandidate(iceCandidate);
                });
                this.localIceCandidates = [];
            }
        } catch (error) {
            throw error;
        }
    }

    async addRemoteIceCandidates() {
        try {
            this.remoteIceCandidates.forEach((iceCandidate) => {
                this.peerConnection?.addIceCandidate(iceCandidate);
            });
            this.remoteIceCandidates = [];
        } catch (error) {
            throw error;
        }
    }

    async logUsedIceServer() {
        const stats = await this.peerConnection?.getStats();

        stats?.forEach((report) => {
            if (report.type === 'transport' || report.type === 'candidate-pair') {
                if (report.state === 'succeeded' || report.selected) {
                    const localCandidate = stats.get(report.localCandidateId);
                    const remoteCandidate = stats.get(report.remoteCandidateId);

                    if (localCandidate && remoteCandidate) {
                        console.log(
                            '%c --- CONNECTION INFO ---',
                            'color: yellow; font-weight: bold;',
                        );
                        console.log(`Connection type: ${localCandidate.candidateType}`);
                        console.log(`Protocol: ${localCandidate.protocol}`);

                        if (localCandidate.candidateType === 'relay') {
                            console.log(
                                `%c USING TURN SERVER: ${localCandidate.url}`,
                                'color: #ff9900; font-weight: bold;',
                            );
                            console.log(
                                `Relay address: ${localCandidate.address}:${localCandidate.port}`,
                            );
                        } else {
                            console.log('%c USING P2P (NO TURN QUOTA)', 'color: #00ff00;');
                        }
                    }
                }
            }
        });
    }

    async toggleCamera() {
        const enable = !this.callState.isCameraOn();

        if (enable) this.enableCamera();
        else this.disableCamera();
        this.callState.isCameraOn.set(enable);

        this.sendMediaState();
    }

    async enableCamera() {
        try {
            const transceiver = this.peerConnection?.getTransceivers().find((transceiver) => {
                return transceiver.receiver.track?.kind === 'video';
            });

            if (!transceiver) return;

            const stream = await navigator.mediaDevices.getUserMedia({ video: true });
            const videoTrack = stream.getVideoTracks()[0];
            await transceiver.sender.replaceTrack(videoTrack);
            transceiver.direction = 'sendrecv';

            this.callState.addVideoTrackToLocalStream(videoTrack);
        } catch (error) {
            console.error(error);
        }
    }

    disableCamera() {
        try {
            const transceiver = this.peerConnection?.getTransceivers().find((transceiver) => {
                return transceiver.receiver.track?.kind === 'video';
            });

            if (!transceiver) return;

            const track = transceiver.sender.track;
            if (!track) return;

            track.enabled = false;
            track.stop();
            transceiver.sender.replaceTrack(null);

            this.callState.removeVideoTrackFromLocalStream();
        } catch (error) {
            console.error(error);
        }
    }

    async toggleMicrophone() {
        const enable = !this.callState.isMicOn();

        const transceiver = this.peerConnection?.getTransceivers().find((trans) => {
            return trans.receiver.track?.kind === 'audio';
        });
        if (!transceiver) return;

        const audioTrack = transceiver.sender.track;
        if (!audioTrack) return;

        if (enable) audioTrack.enabled = true;
        else audioTrack.enabled = false;

        this.callState.isMicOn.set(enable);

        this.sendMediaState();
    }

    setupDataChannel() {
        if (!this.dataChannel) return;

        this.dataChannel.onopen = () => {
            this.sendMediaState();
        };

        this.dataChannel.onmessage = (event) => {
            const data = JSON.parse(event.data);

            if (data.type === 'mediaState') this.handleMediaState(data);
        };

        this.dataChannel.onerror = (error) => {
            console.error('📡 Data channel error:', error);
        };
    }

    sendMediaState() {
        if (!this.dataChannel || this.dataChannel.readyState !== 'open') return;

        const state = {
            type: 'mediaState',
            hasAudio: this.callState.isMicOn(),
            hasVideo: this.callState.isCameraOn(),
        };

        this.dataChannel.send(JSON.stringify(state));
    }

    handleMediaState(data: any) {
        this.callState.remoteParticipants.update((participants) => {
            return participants.map((p) => {
                return {
                    ...p,
                    hasAudio: data.hasAudio,
                    hasVideo: data.hasVideo,
                };
            });
        });
    }
}
