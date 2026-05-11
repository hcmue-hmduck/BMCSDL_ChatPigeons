import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/authService';

export const adminGuard: CanActivateFn = () => {
    const authService = inject(AuthService);
    const router = inject(Router);

    const { role } = authService.getUserInfor();
    if (role === 'admin') {
        return true;
    }

    console.warn('[AdminGuard] Forbidden access blocked. Redirecting to conversations...');
    return router.createUrlTree(['/conversations']);
};
