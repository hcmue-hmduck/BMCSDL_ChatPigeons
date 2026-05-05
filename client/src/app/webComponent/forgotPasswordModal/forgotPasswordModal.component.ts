import { Component, output, signal, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { AuthService } from '../../services/authService';
import { matchFieldsValidator } from '../../utils/validators';
import Swal from 'sweetalert2';

@Component({
    selector: 'forgot-password-modal',
    standalone: true,
    imports: [CommonModule, ReactiveFormsModule],
    templateUrl: './forgotPasswordModal.component.html',
    styleUrls: ['./forgotPasswordModal.component.css']
})
export class ForgotPasswordModalComponent {
    private fb = inject(FormBuilder);
    private authService = inject(AuthService);

    close = output<void>();

    step = signal<number>(1);
    isSendingOtp = signal(false);
    isVerifying = signal(false);
    isResetting = signal(false);
    errorMessage = signal('');
    countdown = signal(0);

    showPass = signal(false);
    showConfirmPass = signal(false);

    // OTP State
    otpCode = signal<string[]>(['', '', '', '', '', '']);
    isOtpComplete = computed(() => this.otpCode().every(digit => digit !== ''));

    forgotForm = this.fb.group({
        email: ['', [Validators.required, Validators.email]]
    });

    resetForm = this.fb.group({
        password: ['', [Validators.required,
        Validators.minLength(6),
        Validators.pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).+$/),]],
        confirm_password: ['', [Validators.required]]
    }, { validators: matchFieldsValidator('password', 'confirm_password') });

    onClose() {
        this.close.emit();
    }

    handleBackdropClick(event: MouseEvent) {
        this.onClose();
    }

    // --- LOGIC BƯỚC 1: EMAIL & OTP ---

    requestOtp() {
        if (this.forgotForm.invalid) return;

        this.isSendingOtp.set(true);
        this.errorMessage.set('');

        const email = this.forgotForm.value.email!;

        this.authService.requestForgotPasswordOTP(email).subscribe({
            next: () => {
                this.isSendingOtp.set(false);
                this.startCountdown();
            },
            error: (err) => {
                this.isSendingOtp.set(false);
                this.errorMessage.set(err.error?.message || 'Không thể gửi mã OTP. Vui lòng thử lại.');
            }
        });
    }

    startCountdown() {
        this.countdown.set(60);
        const interval = setInterval(() => {
            this.countdown.update(c => c - 1);
            if (this.countdown() <= 0) clearInterval(interval);
        }, 1000);
    }

    onOtpInput(index: number, event: any) {
        const value = event.target.value;
        if (!/^\d*$/.test(value)) {
            event.target.value = '';
            return;
        }

        const currentOtp = [...this.otpCode()];
        currentOtp[index] = value.slice(-1);
        this.otpCode.set(currentOtp);

        if (value && index < 5) {
            const nextInput = document.getElementById(`otp-${index + 1}`) as HTMLInputElement;
            nextInput?.focus();
        }
    }

    onOtpKeydown(index: number, event: KeyboardEvent) {
        if (event.key === 'Backspace' && !this.otpCode()[index] && index > 0) {
            const prevInput = document.getElementById(`otp-${index - 1}`) as HTMLInputElement;
            prevInput?.focus();
        }
    }

    verifyOtp() {
        if (!this.isOtpComplete()) return;

        this.isVerifying.set(true);
        this.errorMessage.set('');

        const email = this.forgotForm.value.email!;
        const otp = this.otpCode().join('');

        this.authService.verifyForgotPasswordOTP({ email, otp }).subscribe({
            next: () => {
                this.isVerifying.set(false);
                this.step.set(2);
            },
            error: (err) => {
                this.isVerifying.set(false);
                this.errorMessage.set(err.error?.message || 'Mã xác thực không hợp lệ.');
            }
        });
    }

    // --- LOGIC BƯỚC 2: RESET PASSWORD ---

    resetPassword() {
        if (this.resetForm.invalid) return;

        this.isResetting.set(true);
        this.errorMessage.set('');

        const newPassword = this.resetForm.value.password!;
        const email = this.forgotForm.value.email!;

        this.authService.resetPassword(newPassword, email).subscribe({
            next: () => {
                this.isResetting.set(false);
                Swal.fire({
                    icon: 'success',
                    title: 'Thành công!',
                    text: 'Mật khẩu của bạn đã được cập nhật mới.',
                }).then(() => {
                    this.onClose();
                });
            },
            error: (err) => {
                this.isResetting.set(false);
                this.errorMessage.set(err.error?.message || 'Không thể đặt lại mật khẩu.');
            }
        });
    }
}
