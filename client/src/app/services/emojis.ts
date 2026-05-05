import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
 

@Injectable({
  providedIn: 'root',
})
export class Emojis {
  private apiUrl = `${environment.apiUrl}/home/emojis`;

  constructor(private http: HttpClient) { }

  // Lấy user theo ID
  getEmojis(): Observable<any> {
    return this.http.get(this.apiUrl);
  }
}
