import { inject, Injectable, signal } from '@angular/core';
import { User } from './user';
import { of, Observable, firstValueFrom } from 'rxjs';
import { environment } from '../../environments/environment';
import { HttpClient } from '@angular/common/http';
import { LoginPayload, SignupPayload } from '../models/authData';
import { tap, catchError, map } from 'rxjs/operators';

interface UserInfor {
    id: string;
    full_name: string;
    avatar_url: string;
    email: string;
    role: string;
    bio: string;
    phone_number: string;
    birthday: string;
    gender: string;
    is_email_verified: boolean;
    is_phone_verified: boolean;
    last_online_at: string;
    created_at: string;
    updated_at: string;
    hasPassword: boolean;
}

interface SendOtpPayload {
    email: string;
    name: string;
}

@Injectable({
    providedIn: 'root',
})
export class AuthService {
    private user = signal<UserInfor>({
        id: '',
        full_name: '',
        avatar_url: '',
        email: '',
        role: '',
        bio: '',
        phone_number: '',
        birthday: '',
        gender: '',
        is_email_verified: false,
        is_phone_verified: false,
        last_online_at: '',
        created_at: '',
        updated_at: '',
        hasPassword: false,
    });
    private apiUrl = `${environment.apiUrl}/access`;
    private rootApiUrl = `${environment.apiUrl}`;

    userService = inject(User);
    httpClient = inject(HttpClient);

    async setUserInfo(userId: string) {
        try {
            const { metadata } = await firstValueFrom(this.userService.getUserById(userId));
            const { id, full_name, avatar_url, role, email, bio, phone_number, birthday, gender, is_email_verified, is_phone_verified, last_online_at, created_at, updated_at, hasPassword } = metadata.userInfor;
            this.user.set({
                id,
                full_name: full_name,
                avatar_url: avatar_url,
                role,
                email,
                bio,
                phone_number,
                birthday,
                gender,
                is_email_verified,
                is_phone_verified,
                last_online_at,
                created_at,
                updated_at,
                hasPassword
            });
            console.log('Đã setUserInfor: ', { id, full_name, avatar_url, role, email });
        } catch (error) {
            console.log('Lỗi setUserInfor:::');
            throw error;
        }
    }

    getUserId() {
        return this.user().id;
    }

    getUserInfor() {
        return this.user();
    }

    updateLocalUser(data: Partial<UserInfor>) {
        this.user.update(current => ({
            ...current,
            ...data
        }));
    }

    login(payload: LoginPayload): Observable<any> {
        return this.httpClient.post(`${this.apiUrl}/login`, payload).pipe(
            tap((res: any) => {
                console.log('res', res);
                const userId = res.metadata?.id;
                if (userId) {
                    this.user.set({
                        id: res.metadata.id,
                        full_name: res.metadata.full_name,
                        avatar_url: res.metadata.avatar_url,
                        role: res.metadata.role,
                        email: res.metadata.email,
                        bio: res.metadata.bio,
                        phone_number: res.metadata.phone_number,
                        birthday: res.metadata.birthday,
                        gender: res.metadata.gender,
                        is_email_verified: res.metadata.is_email_verified,
                        is_phone_verified: res.metadata.is_phone_verified,
                        last_online_at: res.metadata.last_online_at,
                        created_at: res.metadata.created_at,
                        updated_at: res.metadata.updated_at,
                        hasPassword: res.metadata.hasPassword
                    });
                }
            })
        );
    }

    signup(payload: SignupPayload): Observable<any> {
        return this.httpClient.post(`${this.apiUrl}/signup`, payload);
    }

    requestSignupOTP(email: string): Observable<any> {
        console.log(`requestOTP:`, email);
        return this.httpClient.post(`${this.apiUrl}/otp/request-signup`, { email });
    }

    verifySignupOTP(payload: { email: string; otp: string }): Observable<any> {
        return this.httpClient.post(`${this.apiUrl}/otp/verify-signup`, payload);
    }

    requestForgotPasswordOTP(email: string): Observable<any> {
        console.log(`requestOTP:`, email);
        return this.httpClient.post(`${this.apiUrl}/otp/request-forgot-password`, { email });
    }

    verifyForgotPasswordOTP(payload: { email: string; otp: string }): Observable<any> {
        return this.httpClient.post(`${this.apiUrl}/otp/verify-forgot-password`, payload);
    }

    logout(): Observable<any> {
        return this.httpClient.post(`${this.apiUrl}/logout`, {}).pipe(
            tap(() => this.clearLocalUser())
        );
    }

    // Xóa trạng thái local khi đăng xuất (dùng khi server lỗi)
    clearLocalUser() {
        this.user.set({ id: '', full_name: '', avatar_url: '', email: '', role: '', bio: '', phone_number: '', birthday: '', gender: '', is_email_verified: false, is_phone_verified: false, last_online_at: '', created_at: '', updated_at: '', hasPassword: false });
    }

    refreshToken(): Observable<any> {
        return this.httpClient.post(`${this.apiUrl}/refresh-token`, {}).pipe(
            tap((res: any) => {
                const user = res.metadata?.user;
                if (user && user.id) {
                    this.user.set({
                        id: user.id,
                        full_name: user.full_name,
                        avatar_url: user.avatar_url,
                        role: user.role,
                        email: user.email,
                        bio: user.bio,
                        phone_number: user.phone_number,
                        birthday: user.birthday,
                        gender: user.gender,
                        is_email_verified: user.is_email_verified,
                        is_phone_verified: user.is_phone_verified,
                        last_online_at: user.last_online_at,
                        created_at: user.created_at,
                        updated_at: user.updated_at,
                        hasPassword: user.hasPassword
                    });
                    console.log('Refresh success - User set:', user.id);
                }
            }),
            catchError((err) => {
                this.clearLocalUser();
                throw err;
            })
        );
    }


    getMe(): Observable<any> {
        return this.httpClient.get(`${this.rootApiUrl}/home/userinfor/me`).pipe(
            tap((res: any) => {
                // Server trả về metadata.userInfor (không phải metadata.user)
                // Xem: usersController.js → getMe() → metadata: { userInfor: user }
                const user = res.metadata?.userInfor;
                if (user && user.id) {
                    this.user.set({
                        id: user.id,
                        full_name: user.full_name,
                        avatar_url: user.avatar_url,
                        role: user.role,
                        email: user.email,
                        bio: user.bio,
                        phone_number: user.phone_number,
                        birthday: user.birthday,
                        gender: user.gender,
                        is_email_verified: user.is_email_verified,
                        is_phone_verified: user.is_phone_verified,
                        last_online_at: user.last_online_at,
                        created_at: user.created_at,
                        updated_at: user.updated_at,
                        hasPassword: user.hasPassword
                    });
                    console.log('GetMe success - User set:', this.user());
                }

            }),
            catchError((err) => {
                this.clearLocalUser();
                throw err;
            })
        );
    }

    /**
     * Kiểm tra phiên đăng nhập hiện tại trong bộ nhớ.
     * Hàm này đồng bộ, không gọi API để tránh vòng lặp điều hướng.
     */
    checkSession(): boolean {
        return !!this.getUserId();
    }

    /**
     * Khôi phục session từ server. Trả về Promise để APP_INITIALIZER có thể đợi.
     */
    async restoreSession(): Promise<void> {
        try {
            await firstValueFrom(this.getMe());
        } catch (err) {
            console.warn('Chưa đăng nhập');
        }
    }


    googleLogin(): Observable<any> {
        return this.httpClient.get(`${this.apiUrl}/google`);
    }

    setPassword(password: string) {
        return this.httpClient.patch(`${this.rootApiUrl}/home/userinfor/me/password-setup`, { password }).pipe(
            tap(() => {
                // Cập nhật state local ngay khi API trả về thành công
                this.updateLocalUser({ hasPassword: true });
            })
        );
    }

    changePassword(oldPassword: string, newPassword: string) {
        return this.httpClient.patch(`${this.rootApiUrl}/home/userinfor/me/password-change`,
            { oldPassword, newPassword })
    }

    resetPassword(password: string, email: string): Observable<any> {
        return this.httpClient.post(`${this.apiUrl}/reset-password`, {password, email});
    }
}
