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
        return await conversationsModel.create({
            conversation_type,
            name: name || null,
            avatar_url: avatar_url || null,
            created_by: created_by || null,
            last_message_id: last_message_id || null,
            last_message_at: last_message_at || null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
        });
    }

    // Cập nhật conversation
    async updateConversation(conversationId, conversationData) {
        const conversation = await conversationsModel.findByPk(conversationId);
        conversationData.updated_at = new Date().toISOString();
        if (conversation) {
            return await conversation.update(conversationData);
        }
        return null;
    }

    // Xóa conversation (Soft Delete)
    async deleteConversation(conversationId) {
        const conversation = await conversationsModel.findByPk(conversationId);
        if (conversation) {
            await conversation.update({
                is_active: false,
                updated_at: new Date().toISOString(),
            });
            return true;
        }
        return false;
    }
}

module.exports = new ConversationsService();
