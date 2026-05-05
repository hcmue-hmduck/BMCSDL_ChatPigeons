import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

@Injectable({
    providedIn: 'root',
})
export class Friend {
    private apiUrl = `${environment.apiUrl}/home/friends`;
    constructor(private http: HttpClient) { }

    getFriendByUserId(userId: string): Observable<any> {
        return this.http.get(`${this.apiUrl}/${userId}`);
    }

    createFriend(userId: string, friendId: string, is_favorite: boolean, note: string): Observable<any> {
        return this.http.post(`${this.apiUrl}/${userId}`, { friend_id: friendId, is_favorite, notes: note });
    }

    deleteFriend(userId: string, friendId: string): Observable<any> {
        return this.http.delete(`${this.apiUrl}/${userId}`, { body: { friend_id: friendId } });
    }
}