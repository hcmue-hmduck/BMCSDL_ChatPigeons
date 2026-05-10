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

        const messages = await messagesModel.findAll({
            where: whereCondition,
            include: [
                {
                    association: 'call',
                    required: false,
                },
            ],
            order: [['created_at', 'DESC']], // Lấy tin nhắn mới nhất trước
            limit: limit, // Giới hạn số lượng tin nhắn
            offset: offset, // Bỏ qua số tin nhắn đầu (cho pagination)
        });
        // Đảo ngược lại để hiển thị theo thứ tự cũ nhất đến mới nhất
        return messages.reverse();
    }

    async getUnreadMessages({ conversation_id, last_read_message_id }, options = {}) {
        if (!conversation_id) throw new BadRequestError('params invalid')

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
        return await messagesModel.create(messageData, options);
    }

    // Cập nhật message
    async updateMessage(messageId, messageData) {
        messageData.is_edited = true;
        messageData.updated_at = new Date();
        const message = await messagesModel.findByPk(messageId);
        if (message) {
            return await message.update(messageData);
        }
        return null;
    }

    // Xóa message (Soft Delete)
    async deleteMessage(messageId) {
        const message = await messagesModel.findByPk(messageId);
        if (message) {
            // Soft delete - chỉ đánh dấu is_deleted = true
            return await message.update({
                is_deleted: true,
                updated_at: new Date(),
            });
        }
        return null;
    }

    // Đếm số lượng tin nhắn chưa đọc cho nhiều cuộc hội thoại
    async countUnreadMessages(convReadTimestamps) {
        if (convReadTimestamps.length === 0) return {};

        const orConditions = convReadTimestamps.map((item) => {
            const base = {
                conversation_id: item.conversation_id,
                created_at: { [Op.gt]: item.last_read_at },
                is_deleted: false,
            };

            if (item.left_at) {
                base.created_at = {
                    [Op.gt]: item.last_read_at,
                    [Op.lte]: item.left_at,
                };
            }

            return base;
        });

        const counts = await messagesModel.findAll({
            attributes: [
                'conversation_id',
                [messagesModel.sequelize.fn('COUNT', messagesModel.sequelize.col('id')), 'unread_count']
            ],
            where: {
                [Op.or]: orConditions
            },
            group: ['conversation_id'],
            raw: true
        });

        const result = {};
        counts.forEach(c => {
            result[c.conversation_id] = parseInt(c.unread_count, 10);
        });
        return result;
    }

    async getHomeMessagesMedia(convID) {
        const media = await messagesModel.findAll({
            where: {
                conversation_id: convID,
                [Op.or]: [
                    { message_type: { [Op.in]: ['image', 'video', 'file'] } },
                    {
                        message_type: 'text',
                        has_link: true
                    }
                ]
            },
            order: [['created_at', 'DESC']]
        });
        return {
            video: media.filter(m => m.message_type === 'video'),
            image: media.filter(m => m.message_type === 'image'),
            file: media.filter(m => m.message_type === 'file'),
            link: media.filter(m => m.message_type === 'text'),
        }
    }
}

module.exports = new MessagesService();
