import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, tap } from 'rxjs';
import { environment } from '../../environments/environment';

@Injectable({
    providedIn: 'root',
})
export class Participant {
    private apiUrl = `${environment.apiUrl}/home/participants`;
    constructor(private http: HttpClient) { }

    getLastReadMessageByConversationAndUser(conversationId: string, userId: string): Observable<any> {
        return this.http.get(`${this.apiUrl}/last-read/${conversationId}/${userId}`);
    }

    putParticipant(participant: any): Observable<any> {
        return this.http.put(`${this.apiUrl}/${participant.id}`, participant);
    }

    postParticipant(participantData: any): Observable<any> {
        return this.http.post(`${this.apiUrl}/${participantData.conversation_id}`, participantData);
    }
}
