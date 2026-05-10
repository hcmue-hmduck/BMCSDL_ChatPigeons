import { inject, Injectable } from '@angular/core';
import { LocalDatabaseService } from './localDatabaseService';
import { KeyManagementService } from './keyManagementService';
import { AuthService } from '../authService';
import { Base64String, CryptoUtilityService } from './cryptoUtilityService';

export interface EncryptedPayload {
    ciphertext: Base64String;
    iv: Base64String;
    keyVersion: number;
}

@Injectable({
    providedIn: 'root',
})
export class E2EEMessageService {
    localDB = inject(LocalDatabaseService);
    keyManagementService = inject(KeyManagementService);
    cryptoUtil = inject(CryptoUtilityService);
    authService = inject(AuthService);

    private get userId() {
        return this.authService.getUserId();
    }

    constructor() {
        if (typeof window !== 'undefined') {
            (window as any).TestE2EEMessageService = this;
        }
    }

    async encryptMessage(conversationId: string, message: string) {
        try {
            const { keyVersion, sharedKeyObj } =
                await this.keyManagementService.getLatestConversationKey(conversationId);
            const { ciphertext, iv } = await this.cryptoUtil.encryptData(message, sharedKeyObj);
            return {
                ciphertext,
                iv,
                keyVersion,
            };
        } catch (error) {
            console.error(`encryptMessage`, error);
            throw error;
        }
    }

    async decryptMessage<T extends EncryptedPayload>(conversationId: string, encryptPayload: T) {
        try {
            const { ciphertext, iv, keyVersion, ...payload } = encryptPayload;
            const sharedKey = await this.keyManagementService.getSharedKey(
                conversationId,
                keyVersion,
            );
            const content = await this.cryptoUtil.decryptData(ciphertext, iv, sharedKey);
            return {
                ...payload,
                content,
                isDecrypted: true,
            };
        } catch (error) {
            console.error(`decryptMessage`, error);
            return {
                ...encryptPayload,
                content: `Nội dung đã được mã hóa`,
                isDecrypted: false,
            };
        }
    }

    async processIncomingMessage(conversationId: string, messages: any[] = []) {
        if (!messages || messages.length === 0) return [];

        // 1. Kiểm tra Identity Key một lần duy nhất cho cả đợt
        const ownKey = await this.localDB.getOwnKey(this.userId);
        if (!ownKey) {
            console.warn('[E2EE] Identity key not found. Skipping decryption batch.');
            return messages.map(msg => ({ ...msg, is_decryption_error: true, content: msg.is_e2ee ? '[Chưa thiết lập bảo mật]' : msg.content }));
        }

        // 2. Map để lưu trữ các Promise lấy khóa (Memoization)
        // Đảm bảo nhiều tin nhắn cùng keyVersion chỉ gọi getSharedKey 1 lần
        const keyPromiseMap = new Map<number, Promise<any>>();

        const getSharedKeyWithMemo = (version: number) => {
            if (!keyPromiseMap.has(version)) {
                keyPromiseMap.set(version, this.keyManagementService.getSharedKey(conversationId, version));
            }
            return keyPromiseMap.get(version)!;
        };

        const decryptedMessages = await Promise.all(
            messages.map(async (msg) => {
                let result = { ...msg };

                try {
                    // 1. Giải mã nội dung tin nhắn chính
                    if (result.is_e2ee && !result.is_deleted && result.content && !result.is_decrypted) {
                        const sharedKey = await getSharedKeyWithMemo(result.key_version);
                        const content = await this.cryptoUtil.decryptData(result.content, result.iv, sharedKey);
                        result = {
                            ...result,
                            content: content,
                            is_decrypted: true,
                        };
                    }

                    // 2. Giải mã nội dung tin nhắn cha (reply preview)
                    const parentInfo = result.parent_message_info;
                    if (
                        parentInfo &&
                        parentInfo.parent_message_is_e2ee &&
                        parentInfo.parent_message_content &&
                        !parentInfo.parent_message_is_deleted
                    ) {
                        const parentSharedKey = await getSharedKeyWithMemo(parentInfo.parent_message_key_version);
                        const decryptedParentContent = await this.cryptoUtil.decryptData(
                            parentInfo.parent_message_content,
                            parentInfo.parent_message_iv,
                            parentSharedKey
                        );
                        result = {
                            ...result,
                            parent_message_info: {
                                ...parentInfo,
                                parent_message_content: decryptedParentContent,
                            },
                        };
                    }
                } catch (error) {
                    // Nếu lỗi do thiếu key hoặc lỗi giải mã, đánh dấu để UI biết
                    result.is_decryption_error = true;
                    // Không throw lỗi ở đây để Promise.all không bị hỏng
                }

                return result;
            }),
        );

        return decryptedMessages;
    }
}
