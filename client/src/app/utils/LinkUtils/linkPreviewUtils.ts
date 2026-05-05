import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';

@Injectable({
    providedIn: 'root',
})
export class LinkPreviewUtils {
    private http = inject(HttpClient);
    private homeApiUrl = `${environment.apiUrl}/home`;

    private linkPreviewCache = new Map<string, any | null>();
    private linkPreviewPromises = new Map<string, Promise<any | null>>();

    private escapeHtml(input: string): string {
        return input
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    private normalizeUrl(rawUrl: string): string {
        const trimmed = rawUrl.trim();
        if (/^https?:\/\//i.test(trimmed)) {
            return trimmed;
        }
        return `https://${trimmed}`;
    }

    formatMessageText(content: string | null | undefined, participants?: any[]): string {
        if (!content) return '';

        const escaped = this.escapeHtml(content);
        const urlPattern = /((?:https?:\/\/|www\.)[^\s<]+)/gi;

        let linked = escaped.replace(urlPattern, (match: string) => {
            const trailingPunctuationMatch = match.match(/[.,!?;:]+$/);
            const trailingPunctuation = trailingPunctuationMatch ? trailingPunctuationMatch[0] : '';
            const cleanUrl = trailingPunctuation
                ? match.slice(0, match.length - trailingPunctuation.length)
                : match;

            const href = this.escapeHtml(this.normalizeUrl(cleanUrl));
            return `<a href="${href}" target="_blank" rel="noopener noreferrer">${cleanUrl}</a>${trailingPunctuation}`;
        });

        // 2. Mentions: @[user_id]
        const mentionPattern = /@\[([^\]]+)\]/g;
        linked = linked.replace(mentionPattern, (match, userId) => {
            const participant = participants?.find(p => p.user_id === userId);
            const name = participant ? participant.full_name : 'người dùng';
            return `<span class="mention-tag">@${name}</span>`;
        });

        return linked.replace(/\n/g, '<br>');
    }

    extractFirstUrl(content: string | null | undefined): string | null {
        if (!content) return null;

        const matches = Array.from(content.matchAll(/((?:https?:\/\/|www\.)[^\s<]+)/gi));

        // Return null if there are no URLs, or if there are 2 or more URLs to save space
        if (!matches || matches.length !== 1) return null;

        const rawUrl = (matches[0][1] || '').replace(/[.,!?;:]+$/, '');
        if (!rawUrl) return null;

        return /^https?:\/\//i.test(rawUrl) ? rawUrl : `https://${rawUrl}`;
    }

    private buildStoredLinkPreview(message: any): any | null {
        if (!message || message.message_type !== 'text') return null;
        const url = this.extractFirstUrl(message.content);
        if (!url) return null;
        if (!message.file_url) return null;

        const hasPreviewData = !!(message.thumbnail_url || message.file_name);
        if (!hasPreviewData) return null;

        let hostname = '';
        try {
            hostname = new URL(message.file_url).hostname;
        } catch {
            hostname = '';
        }

        return {
            url: message.file_url,
            title: message.file_name || message.file_url,
            description: '',
            image: message.thumbnail_url || null,
            siteName: hostname,
            hostname,
        };
    }

    isFetchingURL(url: string | null | undefined): boolean {
        if (!url) return false;
        return this.linkPreviewPromises.has(url);
    }

    getLinkPreview(content: string | null | undefined, callback?: (preview?: any) => void): any | null {
        const url = this.extractFirstUrl(content);
        if (!url) return null;

        if (this.linkPreviewCache.has(url)) {
            const cached = this.linkPreviewCache.get(url) || null;
            if (callback) callback(cached);
            return cached;
        }

        // Trigger fetch (non-blocking for UI)
        this.fetchLinkPreview(url, callback);

        // Return a loading state object so the component knows it's fetching
        return { loading: true, url };
    }

    async getLinkPreviewAsync(content: string | null | undefined): Promise<any | null> {
        const url = this.extractFirstUrl(content);
        if (!url) return null;

        if (this.linkPreviewCache.has(url)) {
            return this.linkPreviewCache.get(url) || null;
        }

        return await this.fetchLinkPreview(url);
    }

    getLinkPreviewForMessage(message: any, callback?: (preview?: any) => void): any | null {
        const storedPreview = this.buildStoredLinkPreview(message);
        if (storedPreview) return storedPreview;

        return this.getLinkPreview(message?.content, callback);
    }

    private fetchLinkPreview(url: string, callback?: (preview?: any) => void): Promise<any | null> {
        // If already loading this URL, return the existing promise
        if (this.linkPreviewPromises.has(url)) {
            const existingPromise = this.linkPreviewPromises.get(url)!;
            if (callback) existingPromise.then(res => callback(res));
            return existingPromise;
        }

        const promise = new Promise<any | null>((resolve) => {
            this.http.get<any>(`${this.homeApiUrl}/link-preview?url=${encodeURIComponent(url)}`).subscribe({
                next: (response) => {
                    const preview = response?.metadata?.linkPreview || null;
                    if (preview) {
                        console.log('Link Preview Fetched:', preview.title);
                    }
                    this.linkPreviewCache.set(url, preview);
                    if (callback) callback(preview);
                    resolve(preview);
                },
                error: (err) => {
                    console.error('Link Preview Fetch Error:', err);
                    this.linkPreviewCache.set(url, null);
                    if (callback) callback(null);
                    resolve(null);
                },
                complete: () => {
                    this.linkPreviewPromises.delete(url);
                }
            });
        });

        this.linkPreviewPromises.set(url, promise);
        return promise;
    }
}