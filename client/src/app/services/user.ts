import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';


@Injectable({
  providedIn: 'root',
})
export class User {
  private apiUrl = `${environment.apiUrl}/admin/users`;
  private apiUrlHome = `${environment.apiUrl}/home/userinfor`;

  constructor(private http: HttpClient) { }

  // Lấy tất cả users
  getAllUsers(): Observable<any> {
    return this.http.get(this.apiUrl);
  }

  // Lấy user theo ID
  getUserById(userID: string): Observable<any> {
    return this.http.get(`${this.apiUrlHome}/${userID}`);
  }

  // Tạo user mới
  createUser(userData: any): Observable<any> {
    return this.http.post(this.apiUrl, userData);
  }

  // Cập nhật user
  updateUser(id: string, userData: any): Observable<any> {
    return this.http.put(`${this.apiUrlHome}/${id}`, userData);
  }

  // Tìm kiếm users
  searchUsers(keyword: string): Observable<any> {
    return this.http.get(`${environment.apiUrl}/home/users/search`, { params: { keyword } });
  }

  // Xóa user
  deleteUser(id: string): Observable<any> {
    return this.http.delete(`${this.apiUrl}/${id}`);
  }

  
}
