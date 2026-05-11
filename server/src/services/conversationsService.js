const { Op } = require('sequelize');
const conversationsModel = require('../models/conversationsModel');

class ConversationsService {
    // Lấy conversations theo điều kiện filter
    // Hỗ trợ: { id: [array] } hoặc bất kỳ where object nào
    async getAllConversations(where = {}) {
        const resolvedWhere = { is_active: true };

        if (where.id) {
            resolvedWhere.id = Array.isArray(where.id)
                ? { [Op.in]: where.id }
                : where.id;
        }

        return await conversationsModel.findAll({
            where: resolvedWhere,
            order: [['updated_at', 'DESC']]
        });
    }

    // Lấy conversation theo ID
    async getConversationById(conversationId) {
        return await conversationsModel.findByPk(conversationId);
    }

    // Lấy conversation theo ID
    async getConversationNameById(conversationId) {
        return await conversationsModel.findByPk(conversationId, {
            attributes: ['name'],
        });
    }

    // Tạo conversation mới
    async createConversation(conversation_type = "direct", name, avatar_url, created_by, last_message_id, last_message_at) {
        if (conversation_type === 'group') {
            const result = await conversationsModel.sequelize.query(
                'EXEC sp_CreateGroupConversation ?, ?, ?',
                {
                    replacements: [
                        name,
                        created_by,
                        avatar_url || null
                    ],
                    type: conversationsModel.sequelize.QueryTypes.SELECT
                }
            );

            const newConvId = result[0].NewConversationId;
            return await conversationsModel.findByPk(newConvId);
        } else {
            return await conversationsModel.create({
                conversation_type,
                name: name || null,
                avatar_url: avatar_url || null,
                created_by: created_by || null,
                last_message_id: last_message_id || null,
                last_message_at: last_message_at || null,
            });
        }
    }

    // Cập nhật conversation
    async updateConversation(conversationId, conversationData) {
        const { name, avatar_url, last_message_id } = conversationData;

        // Kiểm tra xem các trường cần update có nằm trong danh sách SP hỗ trợ không
        const supportedFields = ['name', 'avatar_url', 'last_message_id'];
        const dataKeys = Object.keys(conversationData);
        const canUseSP = dataKeys.every(key => supportedFields.includes(key));

        if (canUseSP) {
            await conversationsModel.sequelize.query(
                'EXEC sp_UpdateConversation ?, ?, ?, ?',
                {
                    replacements: [
                        conversationId,
                        name || null,
                        avatar_url || null,
                        last_message_id || null
                    ],
                    type: conversationsModel.sequelize.QueryTypes.RAW
                }
            );
            return await conversationsModel.findByPk(conversationId);
        } else {
            // Fallback cho các trường khác nếu có
            const conversation = await conversationsModel.findByPk(conversationId);
            if (conversation) {
                return await conversation.update(conversationData);
            }
            return null;
        }
    }

    // Xóa conversation (Soft Delete)
    async deleteConversation(conversationId) {
        const conversation = await conversationsModel.findByPk(conversationId);
        if (conversation) {
            await conversation.update({
                is_active: false
            });
            return true;
        }
        return false;
    }

    // Cập nhật key_status cho E2EE rotation
    async updateKeyStatus(conversationId, keyStatus) {
        const validStatuses = ['no_key', 'active', 'require_rotation'];
        if (!validStatuses.includes(keyStatus)) throw new Error(`Invalid key_status: ${keyStatus}`);

        try {
            await conversationsModel.sequelize.query(
                'EXEC sp_UpdateKeyStatus ?, ?',
                {
                    replacements: [
                        conversationId,
                        keyStatus
                    ],
                    type: conversationsModel.sequelize.QueryTypes.RAW
                }
            );
            return { success: true };
        } catch (error) {
            throw error;
        }
    }
}

module.exports = new ConversationsService();
