import {
    HttpContextToken,
    HttpErrorResponse,
    HttpEvent,
    HttpHandlerFn,
    HttpInterceptorFn,
    HttpRequest,
} from '@angular/common/http';
import { inject } from '@angular/core';
import { BehaviorSubject, Observable, catchError, filter, switchMap, take, throwError } from 'rxjs';
import { environment } from '../../environments/environment';
import { AuthService } from '../services/authService';
import { Router } from '@angular/router';

let isRefreshing = false;
const refreshTokenSubject = new BehaviorSubject<boolean | null>(null);
const RETRIED_AFTER_REFRESH  = new HttpContextToken<boolean>(() => false);

const isAuthEndpoint = (url: string) => {
    // return(
    //     url.startsWith(`${environment.apiUrl}/access/login`) ||
    //     url.startsWith(`${environment.apiUrl}/access/signup`) ||
    //     url.startsWith(`${environment.apiUrl}/access/refresh-token`)
    // );
    // Sử dụng Regex để kiểm tra URL có chứa các path nhạy cảm không, 
    // tránh lỗi so khớp do protocol (http/https) hoặc port.
    return /\/access\/(login|signup|refresh-token|otp)/.test(url);
};

/**
Tự gắn cookie auth cho mọi API backend.
Nếu access token hết hạn (401), tự gọi refresh token.
Nếu refresh thành công, gửi lại request cũ.
Nếu refresh thất bại, đưa người dùng về trang đăng nhập.
Tránh gọi refresh nhiều lần cùng lúc khi nhiều request cùng bị 401.
 */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
    // Only attach credentials for backend API calls.
    if (!req.url.startsWith(environment.apiUrl)) {
        return next(req);
    }

    const authService = inject(AuthService);
    const router = inject(Router);
    const authReq = req.clone({ withCredentials: true });

    return next(authReq).pipe(
        catchError((error: HttpErrorResponse) => {
            const shouldHandle401 =
                error.status === 401 &&
                !isAuthEndpoint(authReq.url) &&
                !authReq.context.get(RETRIED_AFTER_REFRESH );

            if (shouldHandle401) {
                return handle401Error(authReq, next, authService, router);
            }

            return throwError(() => error);
        }),
    );
};

function handle401Error(
    req: HttpRequest<unknown>,
    next: HttpHandlerFn,
    authService: AuthService,
    router: Router,
): Observable<HttpEvent<unknown>> {
    if (!isRefreshing) {
        isRefreshing = true;
        refreshTokenSubject.next(null);

        return authService.refreshToken().pipe(
            switchMap(() => {
                isRefreshing = false;
                refreshTokenSubject.next(true);
                
                const retriedRequest = req.clone({
                    withCredentials: true,
                    context: req.context.set(RETRIED_AFTER_REFRESH , true),
                });
                return next(retriedRequest);
            }),
            catchError((error: HttpErrorResponse) => {
                isRefreshing = false;
                refreshTokenSubject.next(false);
                // Redirect to login/landing page on refresh failure
                router.navigate(['/']);
                return throwError(() => error);
            }),
        );
    } else {
        return refreshTokenSubject.pipe(
            filter((result) => result !== null),
            take(1),
            switchMap((result) => {
                if (!result) {
                    router.navigate(['/']);
                    return throwError(() => new Error('refresh token failed'));
                }

                const retriedRequest = req.clone({
                    withCredentials: true,
                    context: req.context.set(RETRIED_AFTER_REFRESH , true),
                });

                return next(retriedRequest);
            }),
        );
    }
}
