import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { environment } from '../../environments/environment';
import { SocketService } from './socket';

@Injectable({
    providedIn: 'root',
})
export class LivekitService {
    socketService = inject(SocketService);
    http = inject(HttpClient);
    private apiUrl = `${environment.apiUrl}/livekit`;

    getAccessToken(
        conversationId: string,
        userId: string,
        userName: string,
        userAvatarUrl: string,
    ) {
        return this.http.get<any>(
            `${this.apiUrl}/access-token?conversationId=${conversationId}&userId=${userId}&userName=${userName}&userAvatarUrl=${userAvatarUrl}`,
        );
    }
}
