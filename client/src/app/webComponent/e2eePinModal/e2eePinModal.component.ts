import { Component, inject, OnInit, signal, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { KeyManagementService } from '../../services/e2ee/keyManagementService';
import { E2eeApiService } from '../../services/e2ee/e2eeApiService';
import { LocalDatabaseService } from '../../services/e2ee/localDatabaseService';
import { AuthService } from '../../services/authService';
import { E2eeModalService } from '../../services/e2ee/e2eeModalService';
import { firstValueFrom } from 'rxjs';
import Swal from 'sweetalert2';

@Component({
    selector: 'app-e2ee-pin-modal',
    standalone: true,
    imports: [CommonModule, FormsModule],
    templateUrl: './e2eePinModal.component.html',
    styleUrls: ['./e2eePinModal.component.css'],
})
export class E2eePinModalComponent implements OnInit {
    keyService = inject(KeyManagementService);
    apiService = inject(E2eeApiService);
    localDB = inject(LocalDatabaseService);
    authService = inject(AuthService);
    modalService = inject(E2eeModalService);
    @Output() close = new EventEmitter<void>();

    isVisible = this.modalService.isVisible;
    mode = this.modalService.mode;
    pin = signal('');
    confirmPin = signal('');
    oldPin = signal('');
    error = signal('');
    loading = signal(false);

    async ngOnInit() {
        await this.checkE2eeState();
    }

    async checkE2eeState() {
        try {
            const user = this.authService.getUserInfor();
            if (!user) return;

            const ownKey = await this.localDB.getOwnKey(user.id);
            if (ownKey) {
                // Đã có khóa local, không cần nhập PIN
                this.isVisible.set(false);
                return;
            }

            // Gọi API kiểm tra xem người dùng này đã tạo E2EE Vault trên server chưa
            const statusRes = await firstValueFrom(this.apiService.checkStatus());
            const hasSetup = statusRes?.metadata?.hasSetup;

            if (hasSetup) {
                this.modalService.mode.set('recovery');
            } else {
                this.modalService.mode.set('setup');
            }
            this.modalService.isVisible.set(true);
        } catch (err) {
            console.error('Lỗi khi kiểm tra trạng thái E2EE:', err);
        }
    }

    // Dùng khi người dùng chủ động muốn đổi mã PIN (gọi từ menu/settings)
    openChangePin() {
        this.mode.set('change');
        this.pin.set('');
        this.confirmPin.set('');
        this.oldPin.set('');
        this.error.set('');
        this.isVisible.set(true);
    }

    async handleSubmit() {
        this.error.set('');

        if (this.mode() === 'change') {
            if (this.oldPin().length < 6) {
                this.error.set('Vui lòng nhập đầy đủ 6 chữ số mã PIN cũ');
                return;
            }
        }

        if (this.mode() === 'setup' || this.mode() === 'change') {
            if (this.pin().length < 6) {
                this.error.set('Vui lòng nhập đầy đủ 6 chữ số mã PIN mới');
                return;
            }
            if (this.pin() !== this.confirmPin()) {
                this.error.set('Mã PIN xác nhận không khớp');
                return;
            }
        } else if (this.mode() === 'recovery') {
            if (this.pin().length < 6) {
                this.error.set('Vui lòng nhập đầy đủ 6 chữ số mã PIN');
                return;
            }
        }

        this.loading.set(true);
        try {
            if (this.mode() === 'setup') {
                await this.keyService.setupNewDevice(this.pin());
                this.closeModal();
            } else if (this.mode() === 'recovery') {
                await this.keyService.recoveryDevice(this.pin());
                this.closeModal();
                
                // Wait for the key to be stored in IndexedDB before reloading
                const user = this.authService.getUserInfor();
                if (user) {
                    let retries = 0;
                    const maxRetries = 10;
                    while (retries < maxRetries) {
                        const ownKey = await this.localDB.getOwnKey(user.id);
                        if (ownKey) {
                            // Key is stored, safe to reload
                            if (typeof window !== 'undefined') window.location.reload();
                            return;
                        }
                        retries++;
                        // Wait 100ms before checking again
                        await new Promise(resolve => setTimeout(resolve, 100));
                    }
                }
                // Fallback: reload anyway after waiting
                if (typeof window !== 'undefined') window.location.reload();
            } else if (this.mode() === 'change') {
                const isVerify = await this.keyService.verifyPin(this.oldPin());
                if (!isVerify) {
                    throw new Error('Mã PIN cũ không chính xác');
                }
                await this.keyService.changePin(this.pin());
                Swal.fire({
                    icon: 'success',
                    title: 'Thành công!',
                    text: 'Thay đổi mã PIN thành công.',
                    timer: 2000,
                    showConfirmButton: false
                });
                this.closeModal();
            }
        } catch (err: any) {
            this.error.set(err.message || 'Có lỗi xảy ra, vui lòng thử lại');
        } finally {
            this.loading.set(false);
            this.pin.set('');
            this.confirmPin.set('');
            this.oldPin.set('');
        }
    }

    closeModal() {
        this.modalService.close();
        this.pin.set('');
        this.confirmPin.set('');
        this.oldPin.set('');
        this.error.set('');
        this.close.emit();
    }

    handleLogout() {
        this.authService.logout().subscribe({
            next: () => {
                this.closeModal();
                if (typeof window !== 'undefined') window.location.reload();
            },
            error: (err) => {
                console.error('Lỗi khi đăng xuất:', err);
                this.closeModal();
                if (typeof window !== 'undefined') window.location.reload();
            }
        });
    }

    validateNumeric(event: any, field: 'pin' | 'confirmPin' | 'oldPin') {
        const val = event.target.value.replace(/[^0-9]/g, '');
        if (field === 'pin') this.pin.set(val);
        else if (field === 'confirmPin') this.confirmPin.set(val);
        else if (field === 'oldPin') this.oldPin.set(val);
        event.target.value = val;
    }
}
