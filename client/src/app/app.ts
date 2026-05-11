import { CommonModule, isPlatformBrowser } from '@angular/common';
import { Component, inject, OnInit, PLATFORM_ID, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { AuthService } from './services/authService';
import { CallBroadcastService } from './services/callBroadcastService';
import { CallService } from './services/callService';
import { IncommingCallLayout } from './webComponent/incommingCallLayout/incommingCallLayout';
import { CryptoUtilityService } from './services/e2ee/cryptoUtilityService';
import { LocalDatabaseService } from './services/e2ee/localDatabaseService';
import { KeyManagementService } from './services/e2ee/keyManagementService';
import { E2EEMessageService } from './services/e2ee/e2eeMessageService';

@Component({
    selector: 'app-root',
    standalone: true,
    imports: [RouterOutlet, CommonModule, IncommingCallLayout],
    templateUrl: './app.html',
    styleUrl: './app.css',
})
export class App implements OnInit {
    protected readonly title = signal('client');
    callBroadcastService = inject(CallBroadcastService);
    callService = inject(CallService);
    authService = inject(AuthService);
    platformId = inject(PLATFORM_ID);

    // test service
    cryptoService = inject(CryptoUtilityService);
    localDBService = inject(LocalDatabaseService);
    keyMService = inject(KeyManagementService);
    e2eeMessageService = inject(E2EEMessageService);

    ngOnInit() {
        if (isPlatformBrowser(this.platformId)) {
            const windowAny = window as any;
            windowAny.OneSignalDeferred = windowAny.OneSignalDeferred || [];
            windowAny.OneSignalDeferred.push(async (OneSignal: any) => {
                try {
                    await OneSignal.init({
                        appId: '9a1b4e85-7b6d-4393-abcc-5b657c28f385',
                        allowLocalhostAsSecureOrigin: true,
                        serviceWorkerPath: 'OneSignalSDKWorker.js',
                    });

                    // Link current user to OneSignal when logged in
                    const currentUser = this.authService.getUserInfor();
                    if (currentUser && currentUser.id) {
                        // v16 API: login() is the recommended way to set external user id
                        if (OneSignal.login && typeof OneSignal.login === 'function') {
                            try {
                                await OneSignal.login(String(currentUser.id));
                            } catch (e) {
                                console.warn('[OneSignal] login failed', e);
                            }
                        } else if (OneSignal.setExternalUserId && typeof OneSignal.setExternalUserId === 'function') {
                            try {
                                await OneSignal.setExternalUserId(String(currentUser.id));
                            } catch (e) {
                                console.warn('[OneSignal] setExternalUserId failed', e);
                            }
                        } else if (OneSignal.User && typeof OneSignal.User.login === 'function') {
                            // fallback to older API if available
                            try {
                                await OneSignal.User.login(currentUser.id);
                            } catch (e) {
                                console.warn('[OneSignal] legacy login failed', e);
                            }
                        } else {
                            console.warn('[OneSignal] no API available to link user');
                        }
                    }
                } catch (error) {
                    console.error('[OneSignal] init failed', error);
                }
            });
        }
        this.callBroadcastService.listenEvents((event) => {
            console.log(`callBroadcastService.listenEvents:::`, event);

            if (event.type === 'call_close') {
                const { call_id } = event.data;
                if (!call_id) console.error('params invalid');

                this.callService.updateStatus(call_id, 'ended');
            }
        });
    }
}
