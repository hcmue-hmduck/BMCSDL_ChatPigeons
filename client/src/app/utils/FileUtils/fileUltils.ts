import { Injectable } from '@angular/core';
import { environment } from '../../../environments/environment';

@Injectable({
    providedIn: 'root',
})

export class FileUtils {

    formatFileSize(bytes: number): string {
        if (!bytes && bytes !== 0) return 'Unknown size';
        if (bytes < 1024) return `${bytes} B`;
        const kb = bytes / 1024;
        if (kb < 1024) return `${kb.toFixed(1)} KB`;
        const mb = kb / 1024;
        if (mb < 1024) return `${mb.toFixed(1)} MB`;
        const gb = mb / 1024;
        return `${gb.toFixed(1)} GB`;
    }

    getFileExtension(input: any): string {
        if (!input) return 'UNKNOWN_FILE';

        let filename = '';
        if (typeof input === 'string') {
            filename = input;
        } else {
            filename = input.file_name || input.name || '';
            if (!filename) {
                const url = input.media_url || input.url || input.file_url;
                if (url) {
                    filename = this.getFileName(url);
                }
            }
        }

        const lastDot = filename.lastIndexOf('.');
        if (lastDot === -1 || lastDot === filename.length - 1) return 'UNKNOWN_FILE';
        return filename.slice(lastDot + 1).toUpperCase();
    }

    getAttachmentIconClass(input: any): string {
        if (!input) return 'bi-file-earmark';

        // 1. Browser Native File object
        if (input instanceof File) {
            return this.getAttachmentIconClassByMimeType(input.type);
        }

        // 2. Message object (from DB)
        if (typeof input === 'object') {
            const type = input.mime_type || input.message_type || '';
            const name = input.file_name || '';

            // Priority 1: Mime type check
            const iconFromMime = this.getAttachmentIconClassByMimeType(type);
            if (iconFromMime !== 'bi-file-earmark') return iconFromMime;

            // Priority 2: Extension check from file_name
            const ext = this.getFileExtension(name);
            return this.getIconClassByExtension(ext);
        }

        // 3. String (filename)
        if (typeof input === 'string') {
            const ext = this.getFileExtension(input);
            return this.getIconClassByExtension(ext);
        }

        return 'bi-file-earmark';
    }

    getAttachmentIconClassByMimeType(type: string): string {
        const mime = (type || '').toLowerCase();

        if (mime.startsWith('image/')) return 'bi-file-earmark-image';
        if (mime.startsWith('video/')) return 'bi-file-earmark-play';
        if (mime.includes('pdf')) return 'bi-file-earmark-pdf';
        if (mime.includes('zip') || mime.includes('rar') || mime.includes('compressed')) return 'bi-file-earmark-zip';

        // spreadsheet check MUST come before document check because Excel mime includes 'officedocument'
        if (mime.includes('sheet') || mime.includes('excel') || mime.includes('spreadsheet')) return 'bi-file-earmark-spreadsheet';
        if (mime.includes('word') || mime.includes('document')) return 'bi-file-earmark-word';

        return 'bi-file-earmark';
    }

    private getIconClassByExtension(ext: string): string {
        switch (ext) {
            case 'PDF': return 'bi-file-earmark-pdf';
            case 'DOC': return 'bi-file-earmark-word';
            case 'DOCX': return 'bi-file-earmark-word';
            case 'XLS': return 'bi-file-earmark-spreadsheet';
            case 'XLSX': return 'bi-file-earmark-spreadsheet';
            case 'ZIP': return 'bi-file-earmark-zip';
            case 'RAR': return 'bi-file-earmark-zip';
            case '7Z': return 'bi-file-earmark-zip';
            case 'TXT': return 'bi-file-earmark-text';
            case 'PPTX': return 'bi-file-earmark-ppt';
            default: return 'bi-file-earmark';
        }
    }

    // Cloudinary Free tier limits (in bytes)
    readonly LIMITS = {
        RAW: 10 * 1024 * 1024,      // 10MB
        IMAGE: 20 * 1024 * 1024,    // 20MB
        VIDEO: 100 * 1024 * 1024    // 100MB
    };

    validateFileSize(file: File | any): { valid: boolean, message?: string } {
        if (!file) return { valid: true };

        const size = file.size || file.file_size || 0;
        const name = file.name || file.file_name || '';
        const type = (file.type || '').toLowerCase();
        
        let resourceType = 'raw';
        
        // Image check
        if (type.startsWith('image/')) {
            resourceType = 'image';
        } else {
            const ext = this.getFileExtension(name);
            const imageExts = ['JPG', 'JPEG', 'PNG', 'GIF', 'WEBP', 'SVG', 'BMP', 'ICO'];
            const videoExts = ['MP4', 'MOV', 'AVI', 'MKV', 'WEBM', 'FLV'];
            
            if (imageExts.includes(ext)) {
                resourceType = 'image';
            } else if (videoExts.includes(ext) || type.startsWith('video/')) {
                resourceType = 'video';
            }
        }

        if (resourceType === 'image' && size > this.LIMITS.IMAGE) {
            return { valid: false, message: `Ảnh quá lớn. Giới hạn là 20MB (Hiện tại: ${this.formatFileSize(size)})` };
        }
        if (resourceType === 'video' && size > this.LIMITS.VIDEO) {
            return { valid: false, message: `Video quá lớn. Giới hạn là 100MB (Hiện tại: ${this.formatFileSize(size)})` };
        }
        if (resourceType === 'raw' && size > this.LIMITS.RAW) {
            return { valid: false, message: `Tệp quá lớn. Giới hạn cho tài liệu/nén là 10MB (Hiện tại: ${this.formatFileSize(size)})` };
        }

        return { valid: true };
    }

    resolveMediaUrl(input: any): string {
        if (!input) return '';

        let url = '';
        if (typeof input === 'string') {
            url = input;
        } else if (input && typeof input === 'object') {
            // Lấy URL từ các thuộc tính phổ biến trong các model khác nhau
            url = input.file_url || input.media_url || input.url || '';
        }

        const trimmed = String(url).trim();
        if (!trimmed) return '';

        if (/^(blob:|data:)/i.test(trimmed)) {
            return trimmed;
        }

        if (/^https?:\/\//i.test(trimmed)) {
            return trimmed;
        }

        if (/^\/\//.test(trimmed)) {
            return `https:${trimmed}`;
        }

        if (/^(\/)?uploads\//i.test(trimmed)) {
            const normalizedPath = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
            try {
                const backendOrigin = new URL(environment.apiUrl).origin;
                return `${backendOrigin}${normalizedPath}`;
            } catch {
                return `${window.location.origin}${normalizedPath}`;
            }
        }

        if (/^[\w.-]+\.[a-z]{2,}(?:[/:?#]|$)/i.test(trimmed)) {
            return `https://${trimmed}`;
        }

        return trimmed;
    }

    openFileInNewTab(input: any, event?: MouseEvent) {
        event?.preventDefault();
        event?.stopPropagation();

        const resolved = this.resolveMediaUrl(input);
        if (!resolved) {
            return;
        }
        window.open(resolved, '_blank', 'noopener,noreferrer');
    }

    downloadFile(input: any, event?: MouseEvent) {
        event?.preventDefault();
        event?.stopPropagation();

        const resolved = this.resolveMediaUrl(input);
        if (!resolved) return;

        const fileName = this.getAttachmentDisplayName(input);

        // Tạo một thẻ link tạm thời để kích hoạt tải xuống
        const link = document.createElement('a');
        link.href = resolved;
        link.download = fileName;
        link.target = '_blank'; // Dự phòng cho một số trình duyệt
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }

    getFileName(url: string | undefined | null): string {
        if (!url) return 'file';
        const decoded = decodeURIComponent(url);
        const parts = decoded.split('/');
        const lastPart = parts[parts.length - 1];
        return lastPart.split('?')[0] || 'file';
    }

    getAttachmentDisplayName(attachment: any): string {
        if (!attachment) return 'file';
        // Support both DB model (file_name) and browser File object (name)
        let name = attachment.file_name || attachment.name || '';
        const url = attachment.media_url || attachment.url || attachment.file_url;

        if (!name && url) {
            return this.getFileName(url);
        }

        if (name) {
            try {
                return decodeURIComponent(name);
            } catch {
                return name;
            }
        }

        return 'file';
    }
}
