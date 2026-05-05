import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, tap } from 'rxjs';
import { environment } from '../../environments/environment';

@Injectable({
    providedIn: 'root',
})
export class Messages {
    private apiUrl = `${environment.apiUrl}/home/messages`;
    constructor(private http: HttpClient) { }

    // Lấy tất cả messages của users này
    getMessages(conversationId: string, limit: number = 50, offset: number = 0): Observable<any> {
        return this.http
            .get(`${this.apiUrl}/${conversationId}?limit=${limit}&offset=${offset}`)
            .pipe(tap((data) => console.log('getMessages:::', data)));
    }

    postMessage(
        conversationId: string,
        senderId: string,
        content: string,
        replyTo?: string,
        message_type?: string,
        file_metadata?: {
            file_url?: string;
            file_name?: string;
            file_size?: number;
            thumbnail_url?: string;
            duration?: number;
            link_description?: string;
            has_link?: boolean;
        }
    ): Observable<any> {
        const body: any = { senderId, content, message_type, ...file_metadata };
        if (replyTo) body.parent_message_id = replyTo;
        return this.http.post(`${this.apiUrl}/${conversationId}`, body);
    }

    putMessage(messageId: string, content: string): Observable<any> {
        return this.http.put(`${this.apiUrl}/${messageId}`, { content });
    }

    deleteMessage(messageId: string): Observable<any> {
        return this.http.delete(`${this.apiUrl}/${messageId}`);
    }

    async streamSummaryMessages(
        conversationId: string,
        fromLastReadMessageId: string,
        handlers: {
            onChunk: (content: string) => void;
            onDone: () => void;
            onError: (error: unknown) => void;
        },
    ): Promise<void> {
        try {
            const safeLastReadMessageId = encodeURIComponent(fromLastReadMessageId || 'null');
            const response = await fetch(`${this.apiUrl}/${conversationId}/summary/${safeLastReadMessageId}`, {
                method: 'GET',
                credentials: 'include',
                headers: {
                    Accept: 'text/event-stream',
                },
            });

            if (!response.ok) {
                throw new Error(`Summary request failed with status ${response.status}`);
            }

            const reader = response.body?.getReader();
            if (!reader) {
                throw new Error('Readable stream is not available for summary response');
            }

            const decoder = new TextDecoder('utf-8');
            let buffer = '';

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const events = buffer.split('\n\n');
                buffer = events.pop() || '';

                for (const eventChunk of events) {
                    const lines = eventChunk
                        .split('\n')
                        .map((line) => line.trim())
                        .filter((line) => line.startsWith('data:'));

                    for (const line of lines) {
                        const payload = line.slice(5).trim();
                        if (!payload) continue;

                        if (payload === '[DONE]') {
                            handlers.onDone();
                            return;
                        }

                        const parsed = JSON.parse(payload);
                        if (parsed?.error) {
                            throw new Error(parsed.error);
                        }

                        if (parsed?.content) {
                            handlers.onChunk(parsed.content);
                        }
                    }
                }
            }

            handlers.onDone();
        } catch (error) {
            handlers.onError(error);
        }
    }
}
