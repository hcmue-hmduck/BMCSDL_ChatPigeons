const { Op } = require('sequelize');
const { BadRequestError } = require('../core/errorResponse.js');
const participantsModel = require('../models/participantsModel');

class ParticipantsService {
    // Lấy participants theo điều kiện filter (where object)
    async getAllParticipants(where = {}) {
        return await participantsModel.findAll({ where });
    }

    async getParticipant(where = {}) {
        return await participantsModel.findOne({ where });
    }

    // Lấy participant theo ID
    async getParticipantById(participantId) {
        return await participantsModel.findByPk(participantId);
    }

    async getParticipantByConversationsAndUserIds(conversationId, userIds = [], options = {}) {
        if (!conversationId || userIds.length === 0) throw new BadRequestError('params invalid');
        return await participantsModel.findAll({
            where: {
                conversation_id: conversationId,
                user_id: { [Op.in]: userIds },
            },
            ...options,
        });
    }

    async getLastReadMessageByConversationAndUser(conversationId, userId) {
        if (!conversationId || !userId) throw new BadRequestError('params invalid');

        return await participantsModel.findOne({
            where: {
                conversation_id: conversationId,
                user_id: userId,
            },
            attributes: ['last_read_message_id'],
            raw: true,
        });
    }

    async getParticipantByConversationId(conversationId) {
        return await participantsModel.findAll({
            where: { conversation_id: conversationId },
            order: [['joined_at', 'ASC']],
        });
    }

    // Tạo participant mới
    async createParticipant(conversation_id, participantData) {
        const participantsData = {
            conversation_id,
            ...participantData,
            joined_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
        };
        return await participantsModel.create(participantsData);
    }

    // Cập nhật participant
    async updateParticipant(id, participantData) {
        const participant = await participantsModel.findByPk(id);
        if (participant) {
            return await participant.update({
                ...participantData,
                updated_at: new Date().toISOString(),
            });
        }
        return null;
    }

    // Xóa participant (Soft Delete)
    async deleteParticipant(participantId) {
        const participant = await participantsModel.findByPk(participantId);
        if (participant) {
            await participant.update({
                is_active: false,
                updated_at: new Date().toISOString(),
            });
            return true;
        }
        return false;
    }
}

module.exports = new ParticipantsService();
