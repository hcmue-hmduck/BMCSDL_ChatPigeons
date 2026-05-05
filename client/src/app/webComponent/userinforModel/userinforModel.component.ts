import {
    Component,
    Input,
    Output,
    EventEmitter,
    OnInit,
    OnDestroy,
    inject,
    signal,
    ElementRef,
    ViewChild,
    ChangeDetectionStrategy,
    ChangeDetectorRef,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormsModule, NonNullableFormBuilder, Validators, ReactiveFormsModule, AbstractControl, ValidationErrors } from '@angular/forms';
import { AuthService } from '../../services/authService';
import { User } from '../../services/user';
import { SocketService } from '../../services/socket';
import { UploadService } from '../../services/uploadService';
import { error } from 'node:console';
import Swal from 'sweetalert2';
import { matchFieldsValidator } from '../../utils/validators';

@Component({
    selector: 'user-infor-modal',
    standalone: true,
    imports: [CommonModule, FormsModule, ReactiveFormsModule],
    templateUrl: './userinforModel.component.html',
    styleUrls: ['./userinforModel.component.css'],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UserInforModel {
    cdr = inject(ChangeDetectorRef);
    authService = inject(AuthService);

    userInfo = signal<any>(null);
    @Input() currentUserId = '';
    @Input() editPremission = true;
    @Output() profileUpdated = new EventEmitter<any>();

    @ViewChild('fileInput') fileInput!: ElementRef<HTMLInputElement>;

    showProfileModal = signal(false);
    isEditingProfile = signal(false);
    showChangePassword = signal(false);
    showSetPassword = signal(false);
    loadingUser = signal(false);
    uploadingAvatar = signal(false);
    isProcessing = signal(false);
    editForm: any = {};
    changePassForm = { oldPass: '', newPass: '', confirmPass: '' };
    private onUpdateProfileSocket?: (data: any) => void;

    private fb = inject(NonNullableFormBuilder);
    setPasswordForm = this.fb.group({
        password: [
            '',
            [
                Validators.required,
                Validators.minLength(6),
                Validators.pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).+$/),
            ],
        ],
        confirm_password: ['', [Validators.required]],
    }, { validators: matchFieldsValidator('password', 'confirm_password') });

    changePasswordForm = this.fb.group({
        oldPassword: ['', [Validators.required]],
        newPassword: [
            '',
            [
                Validators.required,
                Validators.minLength(6),
                Validators.pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).+$/),
            ]],
        confirmPassword: ['', [Validators.required]],
    }, { validators: matchFieldsValidator('newPassword', 'confirmPassword') });

    constructor(
        private userService: User,
        private uploadService: UploadService,
        private socketService: SocketService
    ) { }

    ngOnInit() {
        if (this.currentUserId) {
            this.setupSocketListeners();
        }
    }

    // Public method to open the modal from parent using User ID
    open(initialData?: any) {
        this.showProfileModal.set(true);

        if (initialData) {
            this.userInfo.set(initialData);
            this.loadingUser.set(false);
        }
        this.cdr.markForCheck();
    }

    setupSocketListeners() {
        if (this.onUpdateProfileSocket) {
            this.socketService.off('updateProfile', this.onUpdateProfileSocket);
        }

        this.onUpdateProfileSocket = (data: any) => {
            const updatedUserId = data?.id || data?.user_id;
            if (updatedUserId === this.currentUserId) {
                this.userInfo.update((old: any) => ({
                    ...old,
                    full_name: data.full_name,
                    avatar_url: data.avatar_url,
                    updated_at: data.updated_at
                }));
                this.cdr.markForCheck();
            }
        };

        this.socketService.on('updateProfile', this.onUpdateProfileSocket);
    }

    ngOnDestroy() {
        if (this.onUpdateProfileSocket) {
            this.socketService.off('updateProfile', this.onUpdateProfileSocket);
            this.onUpdateProfileSocket = undefined;
        }
    }

    openProfileModal() {
        this.showProfileModal.set(true);
    }

    closeProfileModal() {
        this.showProfileModal.set(false);
        this.isEditingProfile.set(false);
        this.showChangePassword.set(false);
    }

    toggleEditProfile() {
        if (!this.isEditingProfile()) {
            const user = this.userInfo();
            this.editForm = {
                full_name: user?.full_name || '',
                bio: user?.bio || '',
                email: user?.email || '',
                phone_number: user?.phone_number || '',
                birthday: user?.birthday ? new Date(user.birthday).toISOString().split('T')[0] : '',
                gender: user?.gender || '',
            };
        }
        this.isEditingProfile.update(v => !v);
    }

    toggleChangePassword() {
        this.showChangePassword.update(v => !v);
    }

    toggleSetPassword() {
        this.showSetPassword.update(v => !v);
    }

    setPassword() {
        if (this.setPasswordForm.invalid) return
        const { password } = this.setPasswordForm.value
        this.authService.setPassword(password as string).subscribe({
            next: () => {
                Swal.fire({
                    icon: 'success',
                    title: 'Thành công!',
                    text: 'Thiết lập mật khẩu thành công',
                    timer: 2000,
                    showConfirmButton: false
                });
                this.toggleSetPassword(); // Đóng form lại
                this.setPasswordForm.reset();
            },
            error: (error) => {
                console.error(error);
            }
        })
    }

    saveProfile() {
        this.isProcessing.set(true);
        this.userService.updateUser(this.currentUserId, this.editForm).subscribe({
            next: () => {
                const updatedData = { ...this.userInfo(), ...this.editForm, updated_at: new Date().toISOString() };
                this.userInfo.set(updatedData);

                // Emit to parent (Sidebar) to refresh the UI immediately
                this.profileUpdated.emit(updatedData);

                // Cập nhật state trung tâm để toàn ứng dụng nhận dữ liệu mới mà không cần gọi API
                this.authService.updateLocalUser(updatedData);

                this.socketService.emit('updateProfile', updatedData);
                this.isEditingProfile.set(false);
                this.isProcessing.set(false);
                this.cdr.markForCheck();
            },
            error: (err) => {
                console.error('Error updating profile:', err);
                this.isProcessing.set(false);
                this.cdr.markForCheck();
            },
        });
    }

    saveChangePassword() {
        if (this.changePasswordForm.invalid) return;
        
        this.isProcessing.set(true);
        const { oldPassword, newPassword } = this.changePasswordForm.value;

        this.authService.changePassword(oldPassword as string, newPassword as string).subscribe({
            next: () => {
                this.isProcessing.set(false);
                Swal.fire({
                    icon: 'success',
                    title: 'Thành công!',
                    text: 'Thay đổi mật khẩu thành công.',
                    timer: 2000,
                    showConfirmButton: false
                });
                this.changePasswordForm.reset();
                this.toggleChangePassword();
                this.cdr.markForCheck();
            },
            error: (error) => {
                this.isProcessing.set(false);

                // Bắt lỗi 400 (Bad Request) do sai mật khẩu cũ
                if (error.status === 400) {
                    this.changePasswordForm.get('oldPassword')?.setErrors({ incorrect: true });
                } else
                    console.error(error);
            }
        });
    }

    changeAvatar() {
        this.fileInput.nativeElement.click();
    }

    onAvatarFileSelected(event: Event) {
        const file = (event.target as HTMLInputElement).files?.[0];
        if (!file) return;

        const formData = new FormData();
        formData.append('files', file);

        this.uploadingAvatar.set(true);
        this.isProcessing.set(true);
        this.cdr.markForCheck();

        this.uploadService.uploadFile(`avatars:${this.currentUserId}`, formData).subscribe({
            next: (res: any) => {
                const avatarUrl = res?.metadata?.files?.[0]?.url;
                if (avatarUrl) {
                    this.userService.updateUser(this.currentUserId, { avatar_url: avatarUrl }).subscribe({
                        next: () => {
                            const updated = { ...this.userInfo(), avatar_url: avatarUrl };
                            this.userInfo.set(updated);
                            this.profileUpdated.emit(updated);

                            // Cập nhật state trung tâm
                            this.authService.updateLocalUser(updated);

                            this.socketService.emit('updateProfile', updated);
                        },
                        error: (err: any) => console.error('Error saving avatar:', err),
                    });
                }
                this.uploadingAvatar.set(false);
                this.isProcessing.set(false);
                this.cdr.markForCheck();
                this.fileInput.nativeElement.value = '';
            },
            error: (err: any) => {
                console.error('Error uploading avatar:', err);
                this.uploadingAvatar.set(false);
                this.isProcessing.set(false);
                this.cdr.markForCheck();
                this.fileInput.nativeElement.value = '';
            },
        });
    }
}