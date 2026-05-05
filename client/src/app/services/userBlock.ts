import { Injectable } from "@angular/core";
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

@Injectable({
    providedIn: 'root',
})
export class UserBlock {
    private apiUrl = `${environment.apiUrl}/home/userblocks`;

    constructor(private http: HttpClient) {}

    getBlockedUserByUserId(blockerId: string): Observable<any> {
        return this.http.get(`${this.apiUrl}/${blockerId}`);
    }

    deleteBlockedUser(id: string): Observable<any> {
        return this.http.delete(`${this.apiUrl}/${id}`);
    }

    createBlockedUser(blockerId: string, blockedId: string, reason: string): Observable<any> {
        return this.http.post(`${this.apiUrl}`, { blockerId, blockedId, reason });
    }
}