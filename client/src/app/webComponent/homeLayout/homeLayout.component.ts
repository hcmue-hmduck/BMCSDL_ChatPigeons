import { CommonModule } from '@angular/common';
import { Component, inject, OnInit, signal } from '@angular/core';
import {
    AbstractControl,
    FormBuilder,
    FormGroup,
    FormsModule,
    ReactiveFormsModule,
    ValidationErrors,
    Validators,
    ɵInternalFormsSharedModule,
} from '@angular/forms';
import { Router } from '@angular/router';
import { environment } from '../../../environments/environment';
import { LoginPayload, SignupPayload } from '../../models/authData';
import { AuthService } from '../../services/authService';
import { ForgotPasswordModalComponent } from '../forgotPasswordModal/forgotPasswordModal.component';

@Component({
    selector: 'home-layout',
    standalone: true,
    imports: [CommonModule, FormsModule, ɵInternalFormsSharedModule, ReactiveFormsModule, ForgotPasswordModalComponent],
    templateUrl: './homeLayout.component.html',
    styleUrls: ['./homeLayout.component.css'],
})
export class HomeLayoutComponent implements OnInit {
    private authService = inject(AuthService);
    private router = inject(Router);
    protected readonly title = signal('Home');
    protected isLogin = signal(true);
    private fb = inject(FormBuilder).nonNullable;
    protected loginSubmitted = false;
    protected signupSubmitted = false;
    protected loginErrorMessage = signal('');
    protected signupErrorMessage = signal('');
    protected showVerifyModal = signal(false);
    protected showForgotModal = signal(false);
    protected verifyEmail = signal('');
    protected verifyName = signal('');
    protected verifyCode = signal<string[]>(['', '', '', '', '', '']);
    protected verifyErrorMessage = signal('');
    protected isResendingOtp = signal(false);
    protected isAuthenticating = signal(false);
    protected countdown = signal(0);
    protected showLoginPassword = signal(false);
    protected showSignupPassword = signal(false);
    protected showSignupConfirmPassword = signal(false);
    private countdownIntervalId?: ReturnType<typeof setInterval>;
    private signupUserId = '';
    protected apiUrl = `${environment.apiUrl}/access`;

    formSignup = this.fb.group(
        {
            full_name: ['', [Validators.required]],
            email: ['', [Validators.required, Validators.email]],
            password: [
                '',
                [
                    Validators.required,
                    Validators.minLength(6),
                    Validators.pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).+$/),
                ],
            ],
            confirm_password: ['', [Validators.required, Validators.minLength(6)]],
        },
        { validators: [this.passwordsMatchValidator] },
    );

    formLogin = this.fb.group({
        email: ['', [Validators.required, Validators.email]],
        password: ['', [Validators.required]],
        remember: [false],
    });

    private passwordsMatchValidator(group: AbstractControl): ValidationErrors | null {
        const password = group.get('password')?.value;
        const confirmPassword = group.get('confirm_password')?.value;
        if (!password || !confirmPassword) {
            return null;
        }

        return password === confirmPassword ? null : { passwordMismatch: true };
    }

    ngOnInit() { }

    ngOnDestroy() {
        this.clearCountdown();
    }

    goToLogin({ isScroll = true } = {}) {
        this.isLogin.set(true);
        this.loginSubmitted = false;
        this.loginErrorMessage.set('');
        this.formLogin.reset();
        if (isScroll) this.scrollToAuth();
    }

    goToSignup({ isScroll = true } = {}) {
        this.isLogin.set(false);
        this.signupSubmitted = false;
        this.signupErrorMessage.set('');
        this.formSignup.reset();
        this.closeVerifyModal();
        if (isScroll) this.scrollToAuth();
    }

    private scrollToAuth() {
        const element = document.getElementById('auth-section');
        if (element) {
            element.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    }

    handleLogin(event: Event) {
        event.preventDefault();
        this.loginSubmitted = true;
        this.loginErrorMessage.set('');
        if (this.formLogin.invalid) {
            this.formLogin.markAllAsTouched();
            return;
        }

        const payload = this.formLogin.value;
        this.authService.login(payload as LoginPayload).subscribe({
            next: (res) => {
                const { id } = res?.metadata;
                if (!id) {
                    this.router.navigate(['/']);
                } else {
                    this.router.navigate(['/conversations']);
                }
            },
            error: (error) => {
                console.error(error.error);
                if (error.statusText === 'Unauthorized')
                    this.loginErrorMessage.set('Tài khoản hoặc mật khẩu không chính xác');
                else this.loginErrorMessage.set('Đăng nhập thất bại');
            },
        });
    }

    handleSignup(event: Event) {
        event.preventDefault();
        this.signupSubmitted = true;
        this.signupErrorMessage.set('');
        if (this.formSignup.invalid) {
            this.formSignup.markAllAsTouched();
            return;
        }

        const payload = this.formSignup.value;
        const currentCountdown = this.countdown();

        // Nếu countdown còn > 0, chỉ mở modal không gửi OTP
        if (currentCountdown > 0) {
            this.verifyEmail.set(payload.email!);
            this.verifyName.set(payload.full_name!);
            this.openVerifyModal();
            return;
        }

        // Countdown = 0, gửi OTP mới
        this.isAuthenticating.set(true);
        this.authService.requestSignupOTP(
            payload.email!
        ).subscribe({
            next: () => {
                this.isAuthenticating.set(false);
                this.verifyEmail.set(payload.email!);
                this.verifyName.set(payload.full_name!);
                this.openVerifyModal();
                this.startCountdown(59);
            },
            error: (error) => {
                this.isAuthenticating.set(false);
                console.error(error.error);
                if (error.status === 409) {
                    this.signupErrorMessage.set('Email đăng ký đã tồn tại');
                } else {
                    this.signupErrorMessage.set('Không thể gửi mã xác thực, vui lòng thử lại');
                }
            }
        });
    }

    protected openVerifyModal() {
        this.showVerifyModal.set(true);
        this.verifyErrorMessage.set('');
        this.verifyCode.set(['', '', '', '', '', '']);

        // Focus vào ô nhập OTP đầu tiên sau khi modal mở
        setTimeout(() => {
            const firstInput = document.getElementById('verify-digit-0') as HTMLInputElement | null;
            firstInput?.focus();
        }, 100);
    }

    protected closeVerifyModal() {
        this.showVerifyModal.set(false);
        this.verifyErrorMessage.set('');
        this.verifyCode.set(['', '', '', '', '', '']);
    }

    protected handleModalBackdropClick(event: MouseEvent) {
        const target = event.target as HTMLElement;
        if (target.classList.contains('verify-modal-overlay')) {
            this.closeVerifyModal();
        }
    }

    protected onCodeInput(index: number, event: Event) {
        const input = event.target as HTMLInputElement;
        const raw = input.value.replace(/\D/g, '');
        const digit = raw.slice(-1);
        const current = [...this.verifyCode()];
        current[index] = digit;
        this.verifyCode.set(current);
        input.value = digit;

        if (digit && index < 5) {
            const next = document.getElementById(`verify-digit-${index + 1}`) as
                | HTMLInputElement
                | null;
            next?.focus();
            next?.select();
        }

        // Tự động xác thực khi nhập đủ 6 số
        if (current.every(d => d !== '')) {
            this.authenticateCode();
        }
    }

    protected onCodeKeydown(index: number, event: KeyboardEvent) {
        const input = event.target as HTMLInputElement;
        if (event.key === 'Backspace' && !input.value && index > 0) {
            const prev = document.getElementById(`verify-digit-${index - 1}`) as
                | HTMLInputElement
                | null;
            prev?.focus();
            prev?.select();
        }
    }

    protected sendOtp() {
        const email = this.verifyEmail();
        if (!email || this.isResendingOtp() || this.countdown() > 0) {
            return;
        }

        this.isResendingOtp.set(true);
        this.verifyErrorMessage.set('');
        this.authService.requestSignupOTP(email).subscribe({
            next: () => {
                this.startCountdown(59);
                this.isResendingOtp.set(false);
            },
            error: (error) => {
                console.error(error.error);
                this.verifyErrorMessage.set('Không thể gửi mã xác thực, vui lòng thử lại');
                this.isResendingOtp.set(false);
            },
        });
    }

    protected authenticateCode() {
        if (this.isAuthenticating()) {
            return;
        }

        const otp = this.verifyCode().join('');
        if (otp.length < 6) {
            this.verifyErrorMessage.set('Vui lòng nhập đủ 6 chữ số');
            return;
        }

        const email = this.verifyEmail();
        const signupPayload = this.formSignup.value;

        this.isAuthenticating.set(true);
        this.verifyErrorMessage.set('');

        // Step 1: Verify OTP
        this.authService.verifySignupOTP({ email, otp }).subscribe({
            next: (res) => {
                // Step 2: OTP valid -> Call Signup
                this.authService.signup(signupPayload as SignupPayload).subscribe({
                    next: (signupRes) => {
                        const { id } = signupRes?.metadata;
                        this.isAuthenticating.set(false);
                        this.closeVerifyModal();
                        this.router.navigate(['/conversations']);
                    },
                    error: (signupError) => {
                        this.isAuthenticating.set(false);
                        console.error(signupError.error);
                        this.verifyErrorMessage.set('Đăng ký thất bại, vui lòng thử lại sau');
                    }
                });
            },
            error: (verifyError) => {
                this.isAuthenticating.set(false);
                console.error(verifyError.error);
                this.verifyErrorMessage.set('Mã xác thực không chính xác hoặc đã hết hạn');
                // Optional: Clear code on error
                this.verifyCode.set(['', '', '', '', '', '']);
                const firstInput = document.getElementById('verify-digit-0') as HTMLInputElement | null;
                firstInput?.focus();
            }
        });
    }

    protected getCountdownDisplay(): string {
        const value = this.countdown();
        const mins = Math.floor(value / 60)
            .toString()
            .padStart(2, '0');
        const secs = (value % 60).toString().padStart(2, '0');
        return `${mins}:${secs}`;
    }

    private startCountdown(seconds: number) {
        this.clearCountdown();
        this.countdown.set(seconds);
        this.countdownIntervalId = setInterval(() => {
            const current = this.countdown();
            if (current <= 0) {
                this.clearCountdown();
                return;
            }
            this.countdown.set(current - 1);
        }, 1000);
    }

    private clearCountdown() {
        if (this.countdownIntervalId) {
            clearInterval(this.countdownIntervalId);
            this.countdownIntervalId = undefined;
        }
    }

    protected shouldShowError(form: FormGroup, controlName: string, submitted: boolean): boolean {
        const control = form.get(controlName);
        if (!control) {
            return false;
        }

        const passwordMismatch =
            controlName === 'confirm_password' &&
            form.hasError('passwordMismatch') &&
            (control.touched || control.dirty || submitted);

        return (
            (control.invalid && (control.touched || control.dirty || submitted)) || passwordMismatch
        );
    }

    protected getErrorMessage(form: FormGroup, controlName: string): string {
        const control = form.get(controlName);
        if (!control) {
            return '';
        }

        if (control.hasError('required')) {
            return 'Trường này là bắt buộc';
        }
        if (control.hasError('email')) {
            return 'Email không đúng định dạng';
        }
        if (control.hasError('minlength')) {
            const minLength = control.getError('minlength')?.requiredLength;
            return `Cần ít nhất ${minLength} ký tự`;
        }
        if (control.hasError('pattern')) {
            return 'Mật khẩu phải có chữ hoa, chữ thường, số và ký tự đặc biệt';
        }
        if (controlName === 'confirm_password' && form.hasError('passwordMismatch')) {
            return 'Mật khẩu xác nhận không khớp';
        }

        return 'Giá trị không hợp lệ';
    }
}
