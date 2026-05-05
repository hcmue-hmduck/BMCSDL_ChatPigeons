import { Injectable, signal } from '@angular/core';

export interface ConversationState {
    getMessagesData: any;
    pinnedMessages: any[];
    messageReactions: Map<string, any[]>;
    lastMessageId: string;
    isLoaded: boolean;
    scrollPosition?: number;
}

@Injectable({
    providedIn: 'root'
})
export class MessageStoreService {
    // Cache map: conversationId -> ConversationState
    private cache = signal<Map<string, ConversationState>>(new Map());

    /**
     * Lấy trạng thái từ cache hoặc tạo mặc định nếu chưa có
     */
    getConversationState(convId: string): ConversationState {
        const current = this.cache().get(convId);
        if (current) return current;

        // Trạng thái mặc định
        return {
            getMessagesData: {
                homeMessagesData: {
                    messages: [],
                    conversation_type: '',
                    pinnedMessages: [],
                },
            },
            pinnedMessages: [],
            messageReactions: new Map<string, any[]>(),
            lastMessageId: '',
            isLoaded: false
        };
    }

    /**
     * Cập nhật toàn bộ trạng thái cho một hội thoại
     */
    setConversationState(convId: string, state: ConversationState) {
        this.cache.update(map => {
            const newMap = new Map(map);
            newMap.set(convId, state);
            return newMap;
        });
    }

    /**
     * Cập nhật từng phần (Partial Update)
     */
    updateState(convId: string, partial: Partial<ConversationState>) {
        const current = this.getConversationState(convId);
        this.setConversationState(convId, { ...current, ...partial });
    }

    /**
     * Logic đặc thù: Thêm tin nhắn mới (cho Socket/Gửi tin nhắn)
     */
    addMessage(convId: string, message: any) {
        const current = this.getConversationState(convId);
        const messages = current.getMessagesData.homeMessagesData?.messages || [];
        
        // Kiểm tra trùng lặp
        if (messages.some((m: any) => m.id === message.id)) return;

        const updatedMessages = [...messages, message];
        this.updateState(convId, {
            getMessagesData: {
                ...current.getMessagesData,
                homeMessagesData: {
                    ...current.getMessagesData.homeMessagesData,
                    messages: updatedMessages
                }
            },
            lastMessageId: message.id
        });
    }

    /**
     * Logic đặc thù: Cập nhật tin nhắn (updateMessage socket)
     */
    updateMessage(convId: string, updatedMessage: any) {
        const current = this.getConversationState(convId);
        const messages = current.getMessagesData.homeMessagesData?.messages || [];
        
        const updatedList = messages.map((m: any) => 
            (m.id === updatedMessage.id || m.id === updatedMessage.message_id) 
            ? { ...m, ...updatedMessage } 
            : m
        );

        this.updateState(convId, {
            getMessagesData: {
                ...current.getMessagesData,
                homeMessagesData: {
                    ...current.getMessagesData.homeMessagesData,
                    messages: updatedList
                }
            }
        });
    }

    /**
     * Logic đặc thù: Cập nhật Reactions
     */
    updateReactions(convId: string, messageId: string, reactions: any[]) {
        const current = this.getConversationState(convId);
        const newReactions = new Map(current.messageReactions);
        newReactions.set(messageId, reactions);
        
        this.updateState(convId, { messageReactions: newReactions });
    }

    /**
     * Di chuyển dữ liệu từ ID cũ sang ID mới (dùng khi nâng cấp hội thoại ảo)
     */
    migrateCache(oldId: string, newId: string) {
        this.cache.update(map => {
            const currentData = map.get(oldId);
            if (!currentData) return map;

            const newMap = new Map(map);
            newMap.set(newId, currentData);
            newMap.delete(oldId);
            return newMap;
        });
    }

    /**
     * Xóa cache nếu cần (ví dụ khi logout)
     */
    clearAll() {
        this.cache.set(new Map());
    }
}
