// OneSignal notification service using native fetch API

class OneSignalService {
    constructor() {
        this.appId = process.env.ONESIGNAL_APP_ID || '9a1b4e85-7b6d-4393-abcc-5b657c28f385';
        this.apiKey = process.env.ONESIGNAL_REST_API_KEY;
        // Use api.onesignal.com for current App/Org API keys (see docs/migration)
        this.apiUrl = 'https://api.onesignal.com/notifications';
    }

    /**
     * Gửi notification đến các user (identified by external_id)
     * @param {Array<string>} userIds - List of user IDs (external_id in OneSignal)
     * @param {string} title - Notification title
     * @param {string} content - Notification content/body
     * @param {object} options - Optional: { url, icon, image, data }
     */
    async sendNotificationToUsers(userIds, title, content, options = {}) {
        try {
            if (!this.apiKey) {
                console.warn('[OneSignal] REST API Key not configured. Skipping notification.');
                return { skipped: true, reason: 'No API key' };
            }

            if (!userIds || userIds.length === 0) {
                console.warn('[OneSignal] No user IDs provided');
                return { skipped: true, reason: 'No user IDs' };
            }

            const payload = {
                app_id: this.appId,
                include_external_user_ids: userIds,
                headings: { en: title },
                contents: { en: content },
                ...options,
            };

            const response = await fetch(this.apiUrl, {
                method: 'POST',
                headers: {
                    'Authorization': `key ${this.apiKey}`,
                    'Content-Type': 'application/json; charset=utf-8',
                },
                body: JSON.stringify(payload),
            });

            if (!response.ok) {
                const errorData = await response.json();
                console.error('[OneSignal] Error sending notification:', {
                    status: response.status,
                    data: errorData,
                });
                return { error: `HTTP ${response.status}`, details: errorData };
            }

            const responseText = await response.text();
            let data = null;
            try {
                data = responseText ? JSON.parse(responseText) : null;
            } catch (parseError) {
                console.warn('[OneSignal] Non-JSON response body');
            }

            if (!response.ok) {
                console.error('[OneSignal] Error sending notification:', {
                    status: response.status,
                    statusText: response.statusText,
                    body: data || responseText,
                });
                return { error: `HTTP ${response.status}`, details: data || responseText };
            }

            return data || responseText;
        } catch (error) {
            console.error('[OneSignal] Error sending notification:', {
                message: error.message,
            });
            return { error: error.message };
        }
    }

    /**
     * Gửi notification tin nhắn mới đến tất cả user trong conversation (except sender)
     * @param {Array<object>} participants - List participant objects with user_id
     * @param {string} senderId - ID của người gửi (sẽ bị loại)
     * @param {string} senderName - Tên của người gửi
     * @param {string} messageContent - Nội dung tin nhắn
    * @param {object} senderInfo - User info of sender (optional)
    * @param {string} url - Click-through URL (optional)
     */
    async sendMessageNotification(participants, senderId, senderName, messageContent, senderInfo = {}, url = null) {
        try {
            // Filter ra participants khác sender
            const recipientIds = participants
                .filter((p) => p.user_id !== senderId)
                .map((p) => p.user_id);

            if (recipientIds.length === 0) {
                console.log('[OneSignal] No recipients to notify');
                return { skipped: true, reason: 'No recipients' };
            }

            // Build notification (do not include ciphertext content)
            const title = senderName || 'New message';
            const content = 'You have a new message';

            return await this.sendNotificationToUsers(recipientIds, title, content, {
                ...(url ? { url } : {}),
                // Optional: add custom data
                data: {
                    sender_id: senderId,
                    sender_name: senderName,
                },
            });
        } catch (error) {
            console.error('[OneSignal] Error in sendMessageNotification:', error.message);
            return { error: error.message };
        }
    }
}

module.exports = new OneSignalService();
