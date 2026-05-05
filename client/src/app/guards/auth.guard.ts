import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { map, tap } from 'rxjs/operators';
import { AuthService } from '../services/authService';

export const authGuard: CanActivateFn = () => {
    const authService = inject(AuthService);
    const router = inject(Router);

    if (authService.checkSession()) {
        return true;
    }

    console.warn('[AuthGuard] Unauthorized access blocked. Redirecting to home...');
    return router.createUrlTree(['/']);
};
