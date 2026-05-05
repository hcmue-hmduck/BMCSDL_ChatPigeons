import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';


@Injectable({
  providedIn: 'root',
})
export class SearchService {
  private apiUrl = `${environment.apiUrl}/home/search/users`;

  constructor(private http: HttpClient) { }

  // Tìm kiếm users
  searchUsers(keyword: string): Observable<any> {
    const encodedKeyword = encodeURIComponent(keyword);
    return this.http.get(`${this.apiUrl}?keyword=${encodedKeyword}`);
  }
}
