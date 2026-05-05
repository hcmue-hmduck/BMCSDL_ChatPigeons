import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

@Injectable({
    providedIn: 'root',
})
export class Conversation {
    private apiUrl = `${environment.apiUrl}/home/conversation`;
    constructor(private http: HttpClient) { }

    // Lấy tất cả conversations của users này
    getConversations(userId: string): Observable<any> {
        return this.http.get(`${this.apiUrl}/${userId}`);
    }

    getConversationById(conversationId: string): Observable<any> {
        return this.http.get(`${this.apiUrl}/${conversationId}`);
    }

    getConversationNameById(conversationId: string): Observable<any> {
        return this.http.get(`${this.apiUrl}/name/${conversationId}`);
    }

    createConversation(participants_id: string, conversation_type: string, name: string, avatar_url: string, created_by: string, last_message_id: string, last_message_at: string): Observable<any> {
        return this.http.post(`${this.apiUrl}`, { participants_id, conversation_type, name, avatar_url, created_by, last_message_id, last_message_at });
    }

    postConversation(targetUserId: string, currentUserId: string): Observable<any> {
        return this.http.post(`${this.apiUrl}`, { 
            participants_id: targetUserId,
            created_by: currentUserId,
            conversation_type: 'direct'
        });
    }

    putConversation(conversationId: string, data: any): Observable<any> {
        return this.http.put(`${this.apiUrl}/${conversationId}`, data);
    }

    deleteConversation(conversationId: string): Observable<any> {
        return this.http.delete(`${this.apiUrl}/${conversationId}`);
    }
}
