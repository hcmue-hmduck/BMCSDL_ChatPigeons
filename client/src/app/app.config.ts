import { APP_INITIALIZER, ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';

import { routes } from './app.routes';
import { provideClientHydration, withEventReplay } from '@angular/platform-browser';
import { authInterceptor } from './interceptors/authInterceptor';
import { AuthService } from './services/authService';

export const appConfig: ApplicationConfig = {
    providers: [
        provideBrowserGlobalErrorListeners(),
        provideRouter(routes, withComponentInputBinding()),
        provideClientHydration(withEventReplay()),
        provideHttpClient(withFetch(), withInterceptors([authInterceptor])),
        {
            provide: APP_INITIALIZER,
            useFactory: (authService: AuthService) => () => authService.restoreSession(),
            deps: [AuthService],
            multi: true
        }
    ],
};
