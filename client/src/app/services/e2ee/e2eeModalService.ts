import { inject, Injectable, signal, computed } from '@angular/core';
import { KeyManagementService } from './keyManagementService';

export type E2eeModalMode = 'setup' | 'recovery' | 'change' | null;

@Injectable({
    providedIn: 'root'
})
export class E2eeModalService {
    keyService = inject(KeyManagementService);
    isVisible = signal(false);
    mode = signal<E2eeModalMode>(null);
    isE2eeReady = computed(() => this.keyService.hasIdentityKey());

    open(mode: E2eeModalMode = 'setup') {
        this.mode.set(mode);
        this.isVisible.set(true);
    }

    close() {
        this.isVisible.set(false);
        this.mode.set(null)
    }
}
