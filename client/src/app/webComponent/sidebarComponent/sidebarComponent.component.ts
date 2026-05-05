import {
    Component,
    Input,
    Output,
    EventEmitter,
    OnInit,
    OnDestroy,
    inject,
    signal,
    ChangeDetectionStrategy,
    ChangeDetectorRef,
    computed,
    effect
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import { AuthService } from '../../services/authService';
import { User } from '../../services/user';
import { SocketService } from '../../services/socket';
import { UserInforModel } from '../userinforModel/userinforModel.component';
import { FileUtils } from '../../utils/FileUtils/fileUltils';

@Component({
    selector: 'sidebar-component',
    standalone: true,
    imports: [
        CommonModule,
        FormsModule,
        UserInforModel,
    ],
    templateUrl: './sidebarComponent.component.html',
    styleUrls: ['./sidebarComponent.component.css'],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SidebarComponent implements OnInit, OnDestroy {
    authService = inject(AuthService);
    cdr = inject(ChangeDetectorRef);
    router = inject(Router);

    // ── State ──────────────────────────────────────────────
    currentUserId = computed(() => this.authService.getUserId());
    userInfo = signal<any>(null);
    loading = signal(false);
    isReady = signal(false);

    constructor(
        private route: ActivatedRoute,
        private userService: User,
        private socketService: SocketService,
        public fileUtils: FileUtils
    ) {
        effect(() => {
            console.log('currentUserId changed:', this.currentUserId());
        this.userInfo.set(this.authService.getUserInfor());
            console.log('userInfo', this.userInfo());
        });
    }

    ngOnInit() {
        this.setupSocketListeners();
    }

    ngOnDestroy() {
        this.socketService.off('updateProfile_sidebar');
    }

    handleLogout() {
        this.authService
            .logout()
            .subscribe({
                next: () => {
                    this.authService.clearLocalUser();
                    window.location.href = '/';
                },
                error: () => {
                    // Kể cả khi server lỗi (token hết hạn, 401...),
                    // vẫn xóa trạng thái local và chuyển về trang đăng nhập.
                    this.authService.clearLocalUser();
                    window.location.href = '/';
                },
            });
    }

    // ── Socket Listeners ──────────────────────────────────
    setupSocketListeners() {
        this.socketService.on('updateProfile_sidebar', (data: any) => {
            if (data.id === this.currentUserId()) {
                this.userInfo.set(data);
                this.cdr.markForCheck();
            }
        });
    }

    // ── Load Data ─────────────────────────────────────────
    loadUserInfo() {
        this.loading.set(true);
        this.userService.getUserById(this.currentUserId()).subscribe({
            next: (response) => {
                console.log('User', response.metadata?.userInfor);
                this.userInfo.set(response.metadata?.userInfor || null);
                this.isReady.set(true);
                this.loading.set(false);
                this.cdr.markForCheck(); // Cần thiết để báo cho OnPush biết dữ liệu đã về
            },
            error: (error) => {
                console.error('Error loading user info:', error);
                this.isReady.set(true);
                this.loading.set(false);
            },
        });
    }

    // ── Navigation ────────────────────────────────────────
    setView(view: string) {
        if (view === 'messages') {
            this.router.navigate(['/conversations']);
        } else if (view === 'friends') {
            this.router.navigate(['/relationship']);
        }
    }

    goToMessagesWelcome() {
        this.router.navigate(['/conversations']);
    }

    isActive(view: string): boolean {
        const url = this.router.url;
        if (view === 'messages') return url.includes('/conversations');
        if (view === 'friends') return url.includes('/relationship');
        return false;
    }

    // ── Profile Modal Callback ────────────────────────────
    handleProfileUpdate(updatedData: any) {
        // Sync local userInfo state from modal response
        this.userInfo.set(updatedData);
        this.cdr.markForCheck();
    }
}
