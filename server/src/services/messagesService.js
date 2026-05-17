const { Op, literal } = require('sequelize');
const messagesModel = require('../models/messagesModel');
const conversationKeysVaultModel = require('../models/conversationkeysvaultModel');
const { BadRequestError } = require('../core/errorResponse.js');


class MessagesService {
    // Lấy tất cả messages
    async getAllMessages() {
        return await messagesModel.findAll({
            where: { is_deleted: false },
            include: [
                {
                    association: 'call',
                    required: false,
                },
            ],
        });
    }

    // Lấy message theo ID
    async getMessageById(messageId, options = {}) {
        return await messagesModel.findByPk(messageId, {
            include: [
                {
                    association: 'call',
                    required: false,
                },
            ],
            ...options
        });
    }

    // Thêm vào class MessagesService
    async getMessagesByIds(ids) {
        return await messagesModel.findAll({
            where: { id: ids },
            include: [
                {
                    association: 'call',
                    required: false,
                },
            ],
        });
    }

    async getAllMessagesByConversationId(
        conversationId,
        limit = 100,
        offset = 0,
        userId = null,
        leftAt = null,
    ) {
        let whereCondition = { conversation_id: conversationId };

        if (userId) {
            const vaults = await conversationKeysVaultModel.findAll({
                where: { user_id: userId, conversation_id: conversationId },
                attributes: ['key_version'],
                raw: true
            });
            const keyVersions = vaults.map(v => v.key_version);

            whereCondition[Op.or] = [
                { is_e2ee: false },
                { is_e2ee: true, key_version: { [Op.in]: keyVersions } },
            ];
        }

        if (leftAt) {
            whereCondition.created_at = { [Op.lte]: leftAt };
        }

        let query = 'SELECT * FROM vw_GetMessagesWithSender WHERE conversation_id = :conversationId AND is_deleted = 0';
        const replacements = { conversationId };

        if (userId) {
            const [participant] = await messagesModel.sequelize.query(
                'SELECT history_cleared_at FROM participants WHERE conversation_id = :conversationId AND user_id = :userId',
                {
                    replacements: { conversationId, userId },
                    type: messagesModel.sequelize.QueryTypes.SELECT
                }
            );
            if (participant && participant.history_cleared_at) {
                query += ' AND created_at > :historyClearedAt';
                replacements.historyClearedAt = participant.history_cleared_at;
            }
        }

        if (userId) {
            const vaults = await conversationKeysVaultModel.findAll({
                where: { user_id: userId, conversation_id: conversationId },
                attributes: ['key_version'],
                raw: true
            });
            const keyVersions = vaults.map(v => v.key_version);

            if (keyVersions.length > 0) {
                query += ' AND (is_e2ee = 0 OR (is_e2ee = 1 AND key_version IN (:keyVersions)))';
                replacements.keyVersions = keyVersions;
            } else {
                query += ' AND is_e2ee = 0';
            }
        }

        if (leftAt) {
            query += ' AND created_at <= :leftAt';
            replacements.leftAt = leftAt;
        }

        // T-SQL pagination
        query += ' ORDER BY created_at DESC OFFSET :offset ROWS FETCH NEXT :limit ROWS ONLY';
        replacements.offset = offset;
        replacements.limit = limit;

        const messages = await messagesModel.sequelize.query(query, {
            replacements,
            type: messagesModel.sequelize.QueryTypes.SELECT
        });

        // Map lại thành cấu trúc lồng nhau (nested) cho object 'call' để không làm gãy code ngoài
        const mappedMessages = messages.map(m => {
            const msg = { ...m, id: m.message_id };
            if (m.call_id) {
                msg.call = {
                    id: m.call_id,
                    call_type: m.call_type,
                    media_type: m.media_type,
                    status: m.call_status,
                    started_at: m.started_at,
                    ended_at: m.ended_at,
                    duration_seconds: m.duration_seconds
                };
            }
            return msg;
        });

        // Đảo ngược lại để hiển thị theo thứ tự cũ nhất đến mới nhất
        return mappedMessages.reverse();
    }

    async getUnreadMessages({ conversation_id, last_read_message_id, userId }, options = {}) {
        if (!conversation_id) throw new BadRequestError('params invalid')

        // Nếu có userId, dùng View vw_GetUnreadMessages sẽ tối ưu hơn
        if (userId) {
            const results = await messagesModel.sequelize.query(
                'SELECT * FROM vw_GetUnreadMessages WHERE user_id = :userId AND conversation_id = :conversation_id',
                {
                    replacements: { userId, conversation_id },
                    type: messagesModel.sequelize.QueryTypes.SELECT
                }
            );
            return results.map(r => ({
                ...r,
                id: r.message_id
            }));
        }

        // Fallback logic cũ nếu không có userId
        if (!last_read_message_id) {
            return await messagesModel.findAll({
                where: {
                    conversation_id,
                    is_deleted: false,
                    message_type: { [Op.ne]: 'system' }
                },
                limit: 20,
                ...options
            });
        }

        const escapedLastReadMessageId = messagesModel.sequelize.escape(last_read_message_id);
        const lastReadCreatedAtSubQuery = literal(
            `COALESCE((SELECT "created_at" FROM "messages" WHERE "id" = ${escapedLastReadMessageId} LIMIT 1), TO_TIMESTAMP(0))`
        );

        const unreadMessages = await messagesModel.findAll({
            where: {
                conversation_id,
                created_at: { [Op.gt]: lastReadCreatedAtSubQuery },
                is_deleted: false,
                message_type: { [Op.ne]: 'system' }
            },
            ...options
        });

        return unreadMessages;
    }

    // Tạo message mới
    async createMessage(messageData, options = {}) {
        // console.log('Creating message with data:', messageData);

        const result = await messagesModel.sequelize.query(
            'EXEC sp_SendMessage ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?',
            {
                replacements: [
                    messageData.conversation_id,
                    messageData.sender_id,
                    messageData.message_type,
                    messageData.content,
                    messageData.is_e2ee ? 1 : 0,
                    messageData.key_version || null,
                    messageData.iv || null,
                    messageData.parent_message_id || null,
                    messageData.file_url || null,
                    messageData.file_name || null,
                    messageData.file_size || null,
                    messageData.thumbnail_url || null,
                    messageData.duration || null,
                    messageData.link_description || null,
                    messageData.has_link ? 1 : 0
                ],
                type: messagesModel.sequelize.QueryTypes.SELECT
            }
        );

        const newMessageId = result[0].NewMessageId;
        return await messagesModel.findByPk(newMessageId);
    }

    // Cập nhật message
    // Cập nhật message
    async updateMessage(messageId, messageData) {
        const message = await messagesModel.findByPk(messageId);
        if (!message) return null;

        await messagesModel.sequelize.query(
            'EXEC sp_EditMessage ?, ?, ?, ?, ?',
            {
                replacements: [
                    messageId,
                    message.sender_id,
                    messageData.content,
                    messageData.iv || null,
                    messageData.key_version || null
                ],
                type: messagesModel.sequelize.QueryTypes.RAW
            }
        );

        // Trả về message sau khi đã update
        await message.reload();
        return message;
    }

    // Xóa message (Soft Delete)
    async deleteMessage(messageId) {
        const message = await messagesModel.findByPk(messageId);
        if (!message) return null;

        await messagesModel.sequelize.query(
            'EXEC sp_RevokeMessage ?, ?',
            {
                replacements: [
                    messageId,
                    message.sender_id
                ],
                type: messagesModel.sequelize.QueryTypes.RAW
            }
        );

        // Trả về message sau khi đã update
        await message.reload();
        return message;
    }

    // Đếm số lượng tin nhắn chưa đọc cho nhiều cuộc hội thoại
    async countUnreadMessages(userId) {
        if (!userId) return {};

        const results = await messagesModel.sequelize.query(
            'SELECT conversation_id, unread_count FROM vw_CountUnreadMessages WHERE user_id = :userId',
            {
                replacements: { userId },
                type: messagesModel.sequelize.QueryTypes.SELECT
            }
        );

        const result = {};
        results.forEach(c => {
            result[c.conversation_id] = parseInt(c.unread_count, 10);
        });
        return result;
    }

    async getHomeMessagesMedia(convID) {
        const results = await messagesModel.sequelize.query(
            'SELECT * FROM vw_GetHomeMessagesMedia WHERE conversation_id = :convID ORDER BY created_at DESC',
            {
                replacements: { convID },
                type: messagesModel.sequelize.QueryTypes.SELECT
            }
        );

        const media = results.map(r => ({
            ...r,
            id: r.message_id // Đảm bảo có id như model cũ
        }));
        return {
            video: media.filter(m => m.message_type === 'video'),
            image: media.filter(m => m.message_type === 'image'),
            file: media.filter(m => m.message_type === 'file'),
            link: media.filter(m => m.message_type === 'text'),
        }
    }
}

module.exports = new MessagesService();
