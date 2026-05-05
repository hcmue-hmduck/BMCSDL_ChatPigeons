import { HttpClient } from '@angular/common/http';
import { inject, Injectable, signal } from '@angular/core';
import { Observable, throwError } from 'rxjs';
import { environment } from '../../environments/environment';
import { AuthService } from './authService';
import { SocketService } from './socket';

interface LogJoinGroupCall {
    content: string;
    conversationId: string;
}

@Injectable({
    providedIn: 'root',
})
export class CallService {
    private apiUrl = `${environment.apiUrl}/home/call`;
    private httpClient = inject(HttpClient);
    private authService = inject(AuthService);
    private socketService = inject(SocketService);
    private CALL_TYPE = ['group', 'direct'];

    logJoinGroupCall = signal<LogJoinGroupCall | null>(null);

    startCall(
        conversation_id: string,
        call_type: string,
        media_type: 'video' | 'audio',
    ): Observable<any> {
        if (!this.CALL_TYPE.includes(call_type))
            return throwError(() => new Error('Cannot start call'));

        const caller_id = this.authService.getUserId();
        if (!caller_id) return throwError(() => new Error('Cannot start call (caller_id empty)'));
        return this.httpClient.post(`${this.apiUrl}/${conversation_id}`, {
            caller_id,
            call_type,
            media_type,
        });
    }

    createLogJoinGroupCall(conversation_id: string): Observable<any> {
        const user_id = this.authService.getUserId();
        if (!user_id) return throwError(() => new Error('Cannot create log'));
        return this.httpClient.post(`${this.apiUrl}/logs-group-call/${conversation_id}`, {
            user_id,
        });
    }

    announceNewLogJoinGroupCall(newLog: LogJoinGroupCall) {
        this.logJoinGroupCall.set(newLog);
    }

    joinCall(call_id: string): Observable<any> {
        if (!call_id) return throwError(() => new Error('call id is not found'));
        return this.httpClient.patch(`${this.apiUrl}/ongoing/${call_id}`, {});
    }

    updateStatus(
        call_id: string,
        status: 'cancelled' | 'completed' | 'declined' | 'missed' | 'ended',
        options?: {
            conversationId?: string;
            messageId?: string;
        },
    ): void {
        if (!call_id) return;

        try {
            fetch(`${this.apiUrl}/${status}/${call_id}`, {
                method: 'PATCH',
                keepalive: true, // không hủy request nếu trình duyệt bị đóng
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({}),
            });

            if (options?.conversationId) {
                this.socketService.emit('updateMessage', {
                    conversation_id: options.conversationId,
                    message_id: options.messageId,
                    message_type: 'call',
                    call_id,
                    status,
                    call: {
                        id: call_id,
                        status,
                    },
                });
            }
        } catch (error) {
            console.error(`updateStatus:::`, error);
        }
    }
}
