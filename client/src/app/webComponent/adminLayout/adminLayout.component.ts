import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { UserAdminLayoutComponent } from '../userAdminLayout/userAdminLayout.component';
import { User } from '../../services/user';
import { AuthService } from '../../services/authService';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';

@Component({
  selector: 'app-admin-layout',
  standalone: true,
  imports: [CommonModule, UserAdminLayoutComponent],
  templateUrl: './adminLayout.component.html',
  styleUrl: './adminLayout.component.css'
})
export class AdminLayoutComponent {
  private userService = inject(User);
  private authService = inject(AuthService);
  private http = inject(HttpClient);

  users = signal<any[]>([]);
  usersLoading = signal(false);
  usersError = signal('');

  currentTab = signal('Dashboard');
  adminProfile = computed(() => this.authService.getUserInfor());
  statsData = signal<{ totalPosts: number, totalMessages: number, totalUsers: number } | null>(null);

  navItems = [
    { id: 'Dashboard', label: 'Dashboard', icon: 'bi-grid-1x2-fill' },
    { id: 'Users', label: 'Users', icon: 'bi-people-fill' },
  ];

  stats = computed(() => {
    const nonBotUsers = this.users().filter((u: any) => !u.is_bot);
    const totalUsers = nonBotUsers.length;
    const recentUsers = nonBotUsers.filter((u: any) => {
      if (!u.created_at) return false;
      const date = new Date(u.created_at);
      const now = new Date();
      const diffTime = Math.abs(now.getTime() - date.getTime());
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      return diffDays <= 7;
    }).length;

    const data = this.statsData();

    return [
      { label: 'Tổng người dùng', value: String(data?.totalUsers ?? totalUsers), trend: '', icon: 'bi-people', color: 'primary' },
      { label: 'Đăng ký gần đây', value: String(recentUsers), trend: '', icon: 'bi-person-plus', color: 'success' },
      { label: 'Tin nhắn đã gửi', value: String(data?.totalMessages ?? 0), trend: '', icon: 'bi-chat-dots', color: 'info' },
    ];
  });

  postsChartData = signal<{ name: string, height: number, count?: number }[]>([]);
  messagesChartData = signal<{ name: string, height: number, count?: number }[]>([]);

  ngOnInit(): void {
    this.loadUsers();
    this.loadStats();
  }

  private loadUsers() {
    this.usersLoading.set(true);
    this.usersError.set('');

    this.userService.getAllUsers().subscribe({
      next: (response: any) => {
        const allUsers = response?.metadata || [];
        // Lọc bỏ tài khoản có role là admin (cùng cấp quản trị viên)
        const filteredUsers = allUsers.filter((u: any) => u.role?.toLowerCase() !== 'admin');
        this.users.set(filteredUsers);
        this.usersLoading.set(false);
      },
      error: (error: any) => {
        this.users.set([]);
        this.usersError.set(error?.message || 'Failed to load users');
        this.usersLoading.set(false);
      }
    });
  }

  private loadStats() {
    this.http.get<any>(`${environment.apiUrl}/admin/stats`).subscribe({
      next: (response) => {
        if (response && response.metadata) {
          const data = response.metadata;
          this.statsData.set(data);

          // Process postsByDay
          if (data.postsByDay) {
            const mappedPosts = this.mapDataToChart(data.postsByDay);
            this.postsChartData.set(mappedPosts);
          }

          // Process messagesByDay
          if (data.messagesByDay) {
            const mappedMessages = this.mapDataToChart(data.messagesByDay);
            this.messagesChartData.set(mappedMessages);
          }
        }
      },
      error: (err) => {
        console.error('Failed to load stats', err);
      }
    });
  }

  private mapDataToChart(dbData: any[]): { name: string, height: number, count?: number }[] {
    try {
      const days = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
      const result: { name: string, height: number, count?: number }[] = [];

      if (!Array.isArray(dbData)) return [];

      const counts = dbData.map(item => {
        const c = Number(item.count);
        return isNaN(c) ? 0 : c;
      });
      const maxCount = Math.max(...counts, 10);

      // Get last 7 days using local timezone to avoid browser day shifts
      for (let i = 6; i >= 0; i--) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        const dayName = days[date.getDay()];
        
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const dateStr = `${year}-${month}-${day}`; // YYYY-MM-DD local

        // Find match in dbData
        const match = dbData.find(item => {
          if (!item.date) return false;
          try {
            // Lấy trực tiếp chuỗi YYYY-MM-DD từ database để tránh browser tự chuyển múi giờ
            let itemDate = '';
            if (typeof item.date === 'string') {
              itemDate = item.date.split('T')[0];
            } else {
              const d = new Date(item.date);
              const y = d.getFullYear();
              const m = String(d.getMonth() + 1).padStart(2, '0');
              const dayPart = String(d.getDate()).padStart(2, '0');
              itemDate = `${y}-${m}-${dayPart}`;
            }
            return itemDate === dateStr;
          } catch (e) {
            return false;
          }
        });

        const count = match ? Number(match.count) : 0;
        result.push({
          name: dayName,
          height: Math.round((count / maxCount) * 100),
          count: count
        });
      }

      return result;
    } catch (error) {
      console.error('Error mapping data to chart:', error);
      return [];
    }
  }

  selectTab(tabId: string) {
    this.currentTab.set(tabId);
  }
}
