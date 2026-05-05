import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, tap } from 'rxjs';
import { environment } from '../../environments/environment';

@Injectable({
    providedIn: 'root',
})
export class PinMessages {
    private apiUrl = `${environment.apiUrl}/home/pinmessage`;
    constructor(private http: HttpClient) { }

    pinMessage(message_id: string, conversation_id: string, pinned_by: string, note: string, order_index: number): Observable<any> {
        return this.http.post(`${this.apiUrl}`, { message_id, conversation_id, pinned_by, note, order_index });
    }

    unpinMessage(pinMessageId: string): Observable<any> {
        return this.http.delete(`${this.apiUrl}/${pinMessageId}`);
    }
}
