export interface CallSessionData {
    conversationId: string;
    conversationType: string;
    callId: string;
    inviterName: string;
    inviterAvatarUrl: string;
    inviterId: string;
    initializeVideo: boolean;
    offer?: RTCSessionDescriptionInit; // Cho direct call
    groupName?: string; // Cho group call
}

export const DIRECT_CALL = 'direct';
export const GROUP_CALL = 'group';
export const AUDIO_CALL = 'audio';
export const VIDEO_CALL = 'video';
export type CallStatus =
    | 'idle'
    | 'ringing'
    | 'connected'
    | 'ended'
    | 'declined'
    | 'missed'
    | 'failed';

export interface SendCallPayload {
    type: string;
    conversationType: string;
    conversationId: string;
    userId: string;
    callId: string;
    initializeVideo: boolean;
    avatarWrap?: AvatarWrap | null;
}

export interface AvatarWrap {
    avatarUrl: string | null;
    isGroup: boolean;
    members?: any[];
}