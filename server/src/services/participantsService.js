const { Op } = require('sequelize');
const { BadRequestError, ForbiddenError } = require('../core/errorResponse.js');
const participantsModel = require('../models/participantsModel');
const conversationsService = require('./conversationsService');

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
            where: { conversation_id: conversationId, left_at: null },
            order: [['joined_at', 'ASC']],
        });
    }

    async getParticipantIdsByConversationId(conversationId) {
        if (!conversationId) throw new BadRequestError('invalid params');
        return await participantsModel.findAll({
            where: {
                conversation_id: conversationId,
                left_at: null, // Chỉ lấy người đang trong nhóm
            },
            attributes: ['user_id'],
            raw: true,
        });
    }

    /**
     * Tạo hoặc tái kích hoạt participant (upsert).
     * Nếu user đã từng tham gia (có bản ghi cũ), cập nhật lại left_at = null và joined_at mới.
     * Nếu chưa từng tham gia, tạo bản ghi mới.
     * @param {string} conversation_id
     * @param {object} participantData - { user_id, role, nick_name, ... }
     * @param {boolean} requireRotation - Nếu true, cập nhật key_status = 'require_rotation' sau khi thêm
     */
    async createParticipant(conversation_id, participantData, requireRotation = false) {
        const { user_id } = participantData;
        if (!conversation_id || !user_id) throw new BadRequestError('params invalid');

        const now = new Date().toISOString();

        // Kiểm tra xem đã từng tham gia chưa
        const existing = await participantsModel.findOne({
            where: { conversation_id, user_id },
        });

        let participant;
        if (existing) {
            // Đã từng tham gia → tái kích hoạt
            participant = await existing.update({
                left_at: null,
                joined_at: now,
                role: participantData.role || existing.role,
                nick_name: participantData.nick_name || existing.nick_name,
                is_muted: participantData.is_muted ?? existing.is_muted,
                updated_at: now,
            });
        } else {
            // Chưa từng tham gia → tạo mới
            participant = await participantsModel.create({
                conversation_id,
                ...participantData,
                joined_at: now,
                updated_at: now,
            });
        }

        // Nếu cần rotate key sau khi thêm thành viên
        if (requireRotation) {
            await conversationsService.updateKeyStatus(conversation_id, 'require_rotation');
        }

        return participant;
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

    /**
     * Tự rời nhóm (Soft Delete — đặt left_at).
     * Sau khi rời, cập nhật key_status = 'require_rotation'.
     * @param {string} conversation_id
     * @param {string} user_id - Người tự rời
     */
    async leaveConversation(conversation_id, user_id) {
        if (!conversation_id || !user_id) throw new BadRequestError('params invalid');

        const participant = await participantsModel.findOne({
            where: { conversation_id, user_id, left_at: null },
        });

        if (!participant) throw new BadRequestError('Bạn không phải thành viên của cuộc hội thoại này');

        const now = new Date().toISOString();
        await participant.update({ left_at: now, updated_at: now });

        // Tự động đặt cờ cần xoay key
        await conversationsService.updateKeyStatus(conversation_id, 'require_rotation');

        return { success: true };
    }

    /**
     * Kick thành viên khỏi nhóm (Soft Delete — đặt left_at).
     * Sau khi kick, cập nhật key_status = 'require_rotation'.
     * Chỉ admin/owner mới có thể kick.
     * @param {string} conversation_id
     * @param {string} actor_id - Người thực hiện kick (phải là admin/owner)
     * @param {string} target_user_id - Người bị kick
     */
    async kickMember(conversation_id, actor_id, target_user_id) {
        if (!conversation_id || !actor_id || !target_user_id) throw new BadRequestError('params invalid');
        if (actor_id === target_user_id) throw new BadRequestError('Không thể tự kick chính mình');

        // Kiểm tra quyền của người thực hiện
        const actorParticipant = await participantsModel.findOne({
            where: { conversation_id, user_id: actor_id, left_at: null },
        });
        if (!actorParticipant) throw new ForbiddenError('Bạn không phải thành viên của cuộc hội thoại này');
        if (!['admin', 'owner'].includes(actorParticipant.role)) {
            throw new ForbiddenError('Bạn không có quyền kick thành viên');
        }

        // Kiểm tra người bị kick
        const targetParticipant = await participantsModel.findOne({
            where: { conversation_id, user_id: target_user_id, left_at: null },
        });
        if (!targetParticipant) throw new BadRequestError('Thành viên không tồn tại trong nhóm');
        if (targetParticipant.role === 'owner') throw new ForbiddenError('Không thể kick owner');

        const now = new Date().toISOString();
        await targetParticipant.update({ left_at: now, updated_at: now });

        // Cập nhật key_status = require_rotation (Client của actor sẽ thực hiện rotate ngay) - đã rotate trên client
        await conversationsService.updateKeyStatus(conversation_id, 'require_rotation');

        return { success: true, kicked_user_id: target_user_id };
    }
}

module.exports = new ParticipantsService();
