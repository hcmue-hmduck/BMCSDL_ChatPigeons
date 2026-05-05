import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

@Injectable({
    providedIn: 'root',
})
export class FriendRequest {
    private apiUrl = `${environment.apiUrl}/home/friendrequests`;

    constructor(private http: HttpClient) { }

    getFriendRequestsByUserId(receiverId: string): Observable<any> {
        return this.http.get(`${this.apiUrl}/${receiverId}`);
    }

    getSentFriendRequestsByUserId(senderId: string): Observable<any> {
        return this.http.get(`${this.apiUrl}/sent/${senderId}`);
    }

    updateFriendRequest(id: string, status: string, note: string): Observable<any> {
        return this.http.put(`${this.apiUrl}/${id}`, { status, note });
    }

    createFriendRequest(senderId: string, receiverId: string, note: string): Observable<any> {
        return this.http.post(`${this.apiUrl}`, { senderId, receiverId, note });
    }
}