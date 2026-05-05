import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/authService';

export const guestGuard: CanActivateFn = (route, state) => {
    const authService = inject(AuthService);
    const router = inject(Router);

    if (authService.checkSession()) {
        // Nếu đã đăng nhập -> không cho vào trang chủ, đá sang trang trong
        return router.createUrlTree(['/conversations']);
    }

    return true;
};
