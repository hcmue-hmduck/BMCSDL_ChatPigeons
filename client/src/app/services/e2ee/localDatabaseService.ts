import { effect, Injectable } from '@angular/core';
import { Dexie, Table } from 'dexie';
import { AuthService } from '../authService';
import { Base64String } from './cryptoUtilityService';



// 1. Lưu bộ khóa cá nhân
export interface OwnKey {
    userId: string; // FK
    publicKeyBase64: Base64String; // Base64
    privateKeyObj: CryptoKey;
    pinHash: Base64String;
}

// 2. Lưu lịch sử Shared Keys
export interface ConversationKey {
    // Compound Index: [conversationId, keyVersion]
    conversationId: string;
    keyVersion: number;
    sharedKeyObj: CryptoKey;
}

// 3. Lưu tin nhắn Plaintext
export interface LocalMessage {
    localId: number; // FK: khóa tạm tại local
    id?: string; // ID từ Server (Chỉ có sau khi gửi thành công)
    conversationId: string;
    senderId: string;
    content: string; // Văn bản đã giải mã
    messageType: 'text' | 'image' | 'file' | 'audio' | 'video' | 'sticker' | 'call' | 'system';

    // Metadata cho Media
    fileUrl?: string;
    fileSize?: number;
    fileName?: string;
    thumbnailUrl?: string;
    duration?: number;

    // Trạng thái & Đồng bộ
    status: 'pending' | 'sent' | 'error';
    createdAt: number; // Sẽ update lại khi có ID Server
    isEdited: boolean;
    isDeleted: boolean;
    parentMessageId?: string;
}

class PigeonsDatabase extends Dexie {
    ownKeys!: Table<OwnKey>;
    conversationKeys!: Table<ConversationKey>;
    messages!: Table<LocalMessage>;

    constructor(userId: string) {
        super(`pigeons_db_${userId}`);
        this.version(1).stores({
            ownKeys: 'userId',
            conversationKeys: '[conversationId+keyVersion], conversationId',
            messages: '++localId, id, createdAt, [conversationId+createdAt]', // localId tự tăng
        });
    }
}

@Injectable({
    providedIn: 'root',
})
export class LocalDatabaseService {
    private db: PigeonsDatabase | null = null;

    constructor(private authService: AuthService) {
        if (typeof window !== 'undefined') {
            (window as any).TestLocalDB = this;
            
            effect(() => {
                const userId = this.authService.getUserId();
                if (userId) {
                    this.initDb(userId);
                } else {
                    if (this.db) {
                        this.db.close();
                        this.db = null;
                    }
                }
            });
        }
    }

    async initDb(userId: string) {
        if (typeof window === 'undefined' || !window.indexedDB) return;
        if (this.db) this.db.close();

        this.db = new PigeonsDatabase(userId);
        return await this.db.open();
    }

    async saveOwnKey(keys: OwnKey) {
        if (!this.db) throw new Error('Database not initialized');
        return await this.db.ownKeys.put(keys);
    }

    async updateOwnKey(userId: string, data: Partial<OwnKey>) {
        if (!this.db) throw new Error('Database not initialized');
        return await this.db.ownKeys.update(userId, data);
    }

    async getOwnKey(userId: string) {
        if (!this.db) throw new Error('Database not initialized');
        return await this.db.ownKeys.get(userId);
    }

    async saveConversationKey(keyEntry: ConversationKey) {
        if (!this.db) throw new Error('Database not initialized');
        return await this.db.conversationKeys.put(keyEntry);
    }

    async getConversationKey(conversationId: string, keyVersion: number) {
        if (!this.db) throw new Error('Database not initialized');
        return await this.db.conversationKeys.get([conversationId, keyVersion]);
    }

    async getConversationsKeys() {
        if (!this.db) throw new Error('Database not initialized');
        return await this.db.conversationKeys.toArray();
    }

    async getLatestConversationKey(conversationId: string) {
        if (!this.db) throw new Error('Database not initialized');
        return await this.db.conversationKeys
            .where('[conversationId+keyVersion]')
            .between([conversationId, Dexie.minKey], [conversationId, Dexie.maxKey])
            .reverse()
            .first();
    }

    async saveMessage(message: LocalMessage) {
        if (!this.db) throw new Error('Database not initialized');
        return await this.db.messages.put(message);
    }

    async saveMessages(messages: LocalMessage[]) {
        console.log(`saveMessages to local db`);
        if (!this.db) throw new Error('Database not initialized');
        return await this.db.messages.bulkPut(messages);
    }

    async getMessages(conversationId: string, offset = 0, limit = 20) {
        if (!this.db) throw new Error('Database not initialized');
        return await this.db.messages
            .where('[conversationId+createdAt]')
            .between([conversationId, Dexie.minKey], [conversationId, Dexie.maxKey])
            .reverse() // lấy tin nhắn mới nhất trước
            .offset(offset)
            .limit(limit)
            .toArray();
    }
}
