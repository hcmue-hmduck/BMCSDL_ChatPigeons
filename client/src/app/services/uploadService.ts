import { Injectable } from '@angular/core';
import { HttpClient, HttpEvent } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

@Injectable({
    providedIn: 'root',
})
export class UploadService {
    private apiUrl = `${environment.apiUrl}/upload`;

    constructor(private http: HttpClient) { }

    uploadFile(convID: string, formData: FormData): Observable<any> {
        return this.http.post(`${this.apiUrl}/${convID}`, formData);
    }

    uploadFileFeeds(feedID: string, formData: FormData): Observable<any> {
        return this.http.post(`${this.apiUrl}/feeds/${feedID}`, formData);
    }

    uploadFileFeedsWithProgress(feedID: string, formData: FormData): Observable<HttpEvent<any>> {
        return this.http.post<any>(`${this.apiUrl}/feeds/${feedID}`, formData, {
            observe: 'events',
            reportProgress: true,
        });
    }
}
