import { Component, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { User } from '../../services/user';
import { ActivatedRoute, Router } from '@angular/router';
import { SocketService } from '../../services/socket';

@Component({
    selector: 'user-admin-layout',
    standalone: true,
    imports: [CommonModule],
    templateUrl: './userAdminLayout.component.html',
    styleUrls: ['./userAdminLayout.component.css']
})

export class UserAdminLayoutComponent implements OnInit {
    protected readonly title = signal('User Administration');
    users = signal<any[]>([]);
    loading = false;
    error = '';

    constructor(
        private userService: User,
        private router: ActivatedRoute,
        private socketService: SocketService
    ) { }

    ngOnInit() {
        this.loadUsers();
        this.setupSocketListener();
    }

    loadUsers() {
        this.loading = true;
        this.userService.getAllUsers().subscribe({
            next: (response) => {
                console.log(response.metadata);
                this.users.set(response.metadata || []);
                this.loading = false;
            },
            error: (error) => {
                this.error = error.message;
                this.loading = false;
            }
        });
    }

    setupSocketListener() {
        this.socketService.on('userActiveStatusChanged', (data: { userId: string, is_active: boolean }) => {
            this.users.update(current => {
                return current.map(u => {
                    if (u.id === data.userId) {
                        return { ...u, is_active: data.is_active };
                    }
                    return u;
                });
            });
        });
    }

    toggleLock(user: any, isActive: boolean) {
        this.userService.toggleActive(user.id, isActive).subscribe({
            next: () => {
                this.users.update(current => {
                    return current.map(u => {
                        if (u.id === user.id) {
                            return { ...u, is_active: isActive };
                        }
                        return u;
                    });
                });
            },
            error: (error) => {
                alert(error.message || 'Lỗi khi thay đổi trạng thái hoạt động.');
            }
        });
    }
}