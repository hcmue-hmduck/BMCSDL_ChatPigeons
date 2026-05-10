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
