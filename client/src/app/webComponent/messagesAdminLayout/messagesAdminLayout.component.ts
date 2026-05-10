import { Component, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

interface ModeratedMessage {
  id: string;
  senderId: string;
  senderName: string;
  senderAvatar: string;
  anonymous: boolean;
  content: string;
  status: 'pending' | 'approved' | 'blocked';
  violations: string[];
  aiScore: number | null;
  createdAt: Date;
  imageThumb?: string;
  linkPreview?: {
    url: string;
    title: string;
    description: string;
    image?: string;
    host?: string;
  };
  aiCategories: { label: string; value: number }[];
  aiSuggestion: string;
  history: { time: string; action: string }[];
}

@Component({
  selector: 'app-messages-admin-layout',
  standalone: true,
  imports: [CommonModule, FormsModule],
  styleUrls: ['./messagesAdminLayout.component.css'],
  templateUrl: './messagesAdminLayout.component.html'
})
export class MessagesAdminLayoutComponent {
  // State Signals
  messages = signal<ModeratedMessage[]>([]);
  loading = signal(false);
  error = signal<string | null>(null);
  
  // Filters
  violationFilter = signal('all');
  statusFilter = signal('all');
  dateRange = signal('today');
  searchTerm = signal('');
  
  // Selection
  selectedIds = signal<Set<string>>(new Set());
  
  // Pagination
  page = signal(1);
  pageSize = signal(10);
  pageInput = signal('1');
  
  // Detail Panel
  detailOpen = signal(false);
  activeMessageId = signal<string | null>(null);
  internalNote = signal('');
  
  // UI Helpers
  toast = signal<string | null>(null);
  Math = Math;

  constructor() {
    this.loadMockData();
  }

  // Computed Values
  filteredItems = computed(() => {
    let items = this.messages();
    const vFilter = this.violationFilter();
    const sFilter = this.statusFilter();
    const dRange = this.dateRange();
    const search = this.searchTerm().toLowerCase();

    if (vFilter !== 'all') {
      items = items.filter(m => m.violations.includes(vFilter));
    }
    if (sFilter !== 'all') {
      items = items.filter(m => m.status === sFilter);
    }
    if (dRange !== 'all') {
      const now = new Date();
      items = items.filter(m => {
        const diff = now.getTime() - m.createdAt.getTime();
        if (dRange === 'today') return diff < 24 * 60 * 60 * 1000;
        if (dRange === '7d') return diff < 7 * 24 * 60 * 60 * 1000;
        if (dRange === '30d') return diff < 30 * 24 * 60 * 60 * 1000;
        return true;
      });
    }
    if (search) {
      items = items.filter(m => 
        m.senderName.toLowerCase().includes(search) || 
        m.content.toLowerCase().includes(search) ||
        (m.anonymous && ('Ẩn danh #' + m.senderId).toLowerCase().includes(search))
      );
    }
    return items;
  });

  pageItems = computed(() => {
    const items = this.filteredItems();
    const start = (this.page() - 1) * this.pageSize();
    return items.slice(start, start + this.pageSize());
  });

  totalPages = computed(() => Math.ceil(this.filteredItems().length / this.pageSize()) || 1);
  
  selectedCount = computed(() => this.selectedIds().size);
  pendingCount = computed(() => this.messages().filter(m => m.status === 'pending').length);
  newFlagCount = signal(12); // Mock count matching requirement "Chưa xử lý: 12"

  activeMessage = computed(() => 
    this.messages().find(m => m.id === this.activeMessageId()) || null
  );

  // Actions
  loadMockData() {
    this.loading.set(true);
    setTimeout(() => {
      const mock: ModeratedMessage[] = [
        {
          id: '101',
          senderId: 'usr_01',
          senderName: 'Nguyễn Văn A',
          senderAvatar: 'https://i.pravatar.cc/150?u=usr_01',
          anonymous: false,
          content: 'Chào cậu, mình thấy tài liệu này rất hay: http://toxic-link.com/payload',
          status: 'pending',
          violations: ['Link', 'Toxic'],
          aiScore: 0.85,
          createdAt: new Date(Date.now() - 1000 * 60 * 5),
          linkPreview: {
            url: 'http://toxic-link.com/payload',
            title: 'Tài liệu mật',
            description: 'Tải ngay tài liệu quan trọng tại đây',
            host: 'toxic-link.com'
          },
          aiCategories: [
            { label: 'Toxic', value: 0.85 },
            { label: 'Spam', value: 0.12 },
            { label: 'NSFW', value: 0.05 }
          ],
          aiSuggestion: 'Chặn',
          history: [{ time: '12:00', action: 'Hệ thống gắn cờ tự động' }]
        },
        {
          id: '102',
          senderId: 'usr_02',
          senderName: 'Trần Thị B',
          senderAvatar: 'https://i.pravatar.cc/150?u=usr_02',
          anonymous: true,
          content: 'Đồ khốn khiếp, sao dám đối xử với tôi như vậy hả???',
          status: 'pending',
          violations: ['Toxic'],
          aiScore: 0.92,
          createdAt: new Date(Date.now() - 1000 * 60 * 60 * 2),
          aiCategories: [
            { label: 'Toxic', value: 0.92 },
            { label: 'Insult', value: 0.88 }
          ],
          aiSuggestion: 'Chặn',
          history: [{ time: '10:00', action: 'Hệ thống gắn cờ tự động' }]
        },
        {
          id: '103',
          senderId: 'usr_03',
          senderName: 'Lê Văn C',
          senderAvatar: 'https://i.pravatar.cc/150?u=usr_03',
          anonymous: false,
          content: 'Mua hàng giảm giá 90% tại đây, nhanh tay kẻo lỡ!',
          status: 'approved',
          violations: ['Spam'],
          aiScore: 0.45,
          createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24),
          aiCategories: [
            { label: 'Spam', value: 0.45 }
          ],
          aiSuggestion: 'Cảnh báo',
          history: [
            { time: 'Hôm qua', action: 'Hệ thống gắn cờ' },
            { time: 'Hôm qua', action: 'Admin phê duyệt' }
          ]
        },
        ...Array.from({ length: 25 }).map((_, i) => ({
          id: `99${i}`,
          senderId: `usr_mock_${i}`,
          senderName: `Mock User ${i}`,
          senderAvatar: `https://i.pravatar.cc/150?u=mock${i}`,
          anonymous: i % 5 === 0,
          content: `Nội dung tin nhắn giả lập số ${i}. Đây là một đoạn nội dung dài để kiểm tra hiển thị tối đa 2 dòng trên bảng danh sách.`,
          status: (i % 3 === 0 ? 'blocked' : (i % 2 === 0 ? 'approved' : 'pending')) as any,
          violations: i % 4 === 0 ? ['Spam'] : (i % 7 === 0 ? ['NSFW'] : []),
          aiScore: Math.random(),
          createdAt: new Date(Date.now() - i * 3600000),
          aiCategories: [
            { label: 'Toxic', value: Math.random() },
            { label: 'Spam', value: Math.random() }
          ],
          aiSuggestion: Math.random() > 0.5 ? 'Chặn' : 'Phê duyệt',
          history: [{ time: 'Vừa xong', action: 'Khởi tạo' }]
        }))
      ];
      this.messages.set(mock);
      this.loading.set(false);
    }, 800);
  }

  resetFilters() {
    this.violationFilter.set('all');
    this.statusFilter.set('all');
    this.dateRange.set('today');
    this.searchTerm.set('');
    this.page.set(1);
    this.pageInput.set('1');
  }

  retry() {
    this.error.set(null);
    this.loadMockData();
  }

  // Selection Logic
  isSelected(id: string) {
    return this.selectedIds().has(id);
  }

  toggleSelect(id: string, checked: boolean) {
    const next = new Set(this.selectedIds());
    if (checked) next.add(id);
    else next.delete(id);
    this.selectedIds.set(next);
  }

  toggleSelectAllOnPage(checked: boolean) {
    const next = new Set(this.selectedIds());
    const items = this.pageItems();
    if (checked) {
      items.forEach(m => next.add(m.id));
    } else {
      items.forEach(m => next.delete(m.id));
    }
    this.selectedIds.set(next);
  }

  isAllOnPageSelected() {
    const items = this.pageItems();
    if (items.length === 0) return false;
    return items.every(m => this.selectedIds().has(m.id));
  }

  clearSelection() {
    this.selectedIds.set(new Set());
  }

  // Batch Actions
  batchApprove() {
    const selected = Array.from(this.selectedIds());
    this.messages.update(msgs => msgs.map(m => 
      selected.includes(m.id) ? { ...m, status: 'approved' as const } : m
    ));
    this.showToast(`Đã phê duyệt ${selected.length} tin nhắn`);
    this.clearSelection();
  }

  batchBlock() {
    const selected = Array.from(this.selectedIds());
    this.messages.update(msgs => msgs.map(m => 
      selected.includes(m.id) ? { ...m, status: 'blocked' as const } : m
    ));
    this.showToast(`Đã chặn ${selected.length} tin nhắn`);
    this.clearSelection();
  }

  // Single Actions
  approveMessage(id: string) {
    this.messages.update(msgs => msgs.map(m => 
      m.id === id ? { ...m, status: 'approved' as const } : m
    ));
    this.showToast(`Đã phê duyệt tin nhắn #${id}`);
  }

  blockMessage(id: string) {
    this.messages.update(msgs => msgs.map(m => 
      m.id === id ? { ...m, status: 'blocked' as const } : m
    ));
    this.showToast(`Đã chặn tin nhắn #${id}`);
  }

  deferMessage(id: string) {
    this.closeDetail();
  }

  // Pagination Logic
  prevPage() {
    if (this.page() > 1) {
      this.page.update(p => p - 1);
      this.pageInput.set(this.page().toString());
    }
  }

  nextPage() {
    if (this.page() < this.totalPages()) {
      this.page.update(p => p + 1);
      this.pageInput.set(this.page().toString());
    }
  }

  onPageInputChange(val: string) {
    this.pageInput.set(val);
  }

  applyPageJump() {
    const target = parseInt(this.pageInput());
    if (!isNaN(target) && target >= 1 && target <= this.totalPages()) {
      this.page.set(target);
    } else {
      this.pageInput.set(this.page().toString());
    }
  }

  // Detail Panel Logic
  openDetail(id: string) {
    this.activeMessageId.set(id);
    this.detailOpen.set(true);
    this.internalNote.set('');
  }

  closeDetail() {
    this.detailOpen.set(false);
    this.activeMessageId.set(null);
  }

  goToSibling(delta: number) {
    const items = this.filteredItems();
    const currentIdx = items.findIndex(m => m.id === this.activeMessageId());
    if (currentIdx === -1) return;
    
    const nextIdx = currentIdx + delta;
    if (nextIdx >= 0 && nextIdx < items.length) {
      this.activeMessageId.set(items[nextIdx].id);
      this.internalNote.set('');
    }
  }

  // Formatter Helpers
  statusLabel(status: string) {
    if (status === 'pending') return 'Chưa XL';
    if (status === 'approved') return 'Đã duyệt';
    if (status === 'blocked') return 'Đã chặn';
    return status;
  }

  statusClass(status: string) {
    return `status-${status}`;
  }

  confidenceLabel(score: number) {
    return Math.round(score * 100) + '%';
  }

  confidenceColor(score: number) {
    if (score < 0.3) return '#22c55e'; // Green
    if (score < 0.7) return '#f59e0b'; // Yellow
    return '#ef4444'; // Red
  }

  relativeTime(date: Date) {
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    if (diff < 60000) return 'Vừa xong';
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins} phút trước`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours} giờ trước`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days} ngày trước`;
    return date.toLocaleDateString('vi-VN');
  }

  formatFullTime(date: Date) {
    return date.toLocaleString('vi-VN');
  }

  onRowFocus(index: number) {
    // Row focus logic
  }

  showToast(msg: string) {
    this.toast.set(msg);
    setTimeout(() => this.toast.set(null), 3000);
  }
}
