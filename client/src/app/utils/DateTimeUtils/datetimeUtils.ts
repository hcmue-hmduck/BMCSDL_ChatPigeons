import { Injectable } from '@angular/core';

@Injectable({
    providedIn: 'root',
})
export class DateTimeUtils {
    private dateCache = new Map<string, string>();
    private timeCache = new Map<string, string>();
    private postTimeCache = new Map<string, string>();

    relativeTime(dateInput: string | Date | null | undefined): string {
        if (!dateInput) return '';

        const timeToCompare = this.getTimestamp(dateInput);
        const diff = Math.floor((Date.now() - timeToCompare) / 1000);

        if (diff <= 60) { return 'vài giây'; }
        if (diff < 3600) { return `${Math.floor(diff / 60)} phút`; }
        if (diff < 86400) return `${Math.floor(diff / 3600)} giờ`;
        if (diff < 604800) return `${Math.floor(diff / 86400)} ngày`;
        if (diff < 2592000) return `${Math.floor(diff / 604800)} tuần`;
        if (diff < 31536000) return `${Math.floor(diff / 2592000)} tháng`;
        return `${Math.floor(diff / 31536000)} năm`;
    }

    formatTime(dateStr: string): string {
        if (!dateStr) return '';
        if (this.timeCache.has(dateStr)) return this.timeCache.get(dateStr)!;

        const date = new Date(this.normalizeIsoString(dateStr));
        const hours = date.getHours().toString().padStart(2, '0');
        const minutes = date.getMinutes().toString().padStart(2, '0');
        const result = `${hours}:${minutes}`;

        this.timeCache.set(dateStr, result);
        return result;
    }

    formatDateLabel(dateStr: string): string {
        if (!dateStr) return '';
        if (this.dateCache.has(dateStr)) return this.dateCache.get(dateStr)!;

        const msgDate = new Date(this.normalizeIsoString(dateStr));
        const today = new Date();
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);

        let result: string;
        if (msgDate.toDateString() === today.toDateString()) {
            result = 'Hôm nay';
        } else if (msgDate.toDateString() === yesterday.toDateString()) {
            result = 'Hôm qua';
        } else {
            result = msgDate.toLocaleDateString('vi-VN', {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric',
            });
        }

        this.dateCache.set(dateStr, result);
        return result;
    }

    getMessageDate(dateStr: string): string {
        if (!dateStr) return '';
        const date = new Date(this.normalizeIsoString(dateStr));
        return date.toDateString();
    }

    shouldShowDateSeparator(currentDateStr: string, prevDateStr: string | null | undefined): boolean {
        if (!prevDateStr) return true;
        return this.getMessageDate(currentDateStr) !== this.getMessageDate(prevDateStr);
    }

    formatPostTime(dateValue: string | null | undefined): string {
        if (!dateValue) return 'Vừa xong';
        
        const date = new Date(dateValue);
        if (Number.isNaN(date.getTime())) return 'Vừa xong';

        const now = Date.now();
        const diffSeconds = Math.max(0, Math.floor((now - date.getTime()) / 1000));
        let result: string;
        let isRelative = true;

        if (diffSeconds < 60) {
            result = 'Vừa xong';
        } else if (diffSeconds < 3600) {
            result = `${Math.floor(diffSeconds / 60)} phút trước`;
        } else if (diffSeconds < 86400) {
            result = `${Math.floor(diffSeconds / 3600)} giờ trước`;
        } else if (diffSeconds < 604800) {
            result = `${Math.floor(diffSeconds / 86400)} ngày trước`;
        } else {
            isRelative = false;
            result = new Intl.DateTimeFormat('vi-VN', {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            }).format(date);
        }

        // Cache absolute dates
        if (!isRelative) {
            this.postTimeCache.set(dateValue, result);
        }
        
        return result;
    }

    private getTimestamp(input: string | Date): number {
        return typeof input === 'string'
            ? new Date(this.normalizeIsoString(input)).getTime()
            : input.getTime();
    }

    private normalizeIsoString(str: string): string {
        if (str.endsWith('Z') || str.length !== 23) return str;
        return str.replace(' ', 'T') + 'Z';
    }
}