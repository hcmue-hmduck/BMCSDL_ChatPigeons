const { Op } = require('sequelize');
const { BadRequestError, ForbiddenError } = require('../core/errorResponse.js');
const participantsModel = require('../models/participantsModel');
const conversationsService = require('./conversationsService');

class ParticipantsService {
    // Lấy participants theo điều kiện filter (where object)
    async getAllParticipants(where = {}) {
        if (where.conversation_id) {
            const conversationIds = Array.isArray(where.conversation_id) ? where.conversation_id : [where.conversation_id];
            return await participantsModel.sequelize.query(
                'SELECT * FROM vw_GetParticipants WHERE conversation_id IN (:conversationIds)',
                {
                    replacements: { conversationIds },
                    type: participantsModel.sequelize.QueryTypes.SELECT
                }
            );
        }
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
        const { user_id, inviterId } = participantData;
        if (!conversation_id || !user_id) throw new BadRequestError('params invalid');

        // Nếu có người mời (inviterId), dùng SP để thêm thành viên và kiểm tra quyền
        if (inviterId) {
            await participantsModel.sequelize.query(
                'EXEC sp_AddGroupMember ?, ?, ?',
                {
                    replacements: [
                        conversation_id,
                        user_id,
                        inviterId
                    ],
                    type: participantsModel.sequelize.QueryTypes.RAW
                }
            );
            return await participantsModel.findOne({
                where: { conversation_id, user_id }
            });
        }

        // Kiểm tra xem có trường nào khác ngoài user_id và role không (SP chỉ hỗ trợ 2 trường này)
        const supportedFields = ['user_id', 'role'];
        const dataKeys = Object.keys(participantData).filter(k => k !== 'inviterId');
        const canUseSP = dataKeys.every(key => supportedFields.includes(key));

        let participant;
        if (canUseSP) {
            await participantsModel.sequelize.query(
                'EXEC sp_CreateParticipant ?, ?, ?',
                {
                    replacements: [
                        conversation_id,
                        user_id,
                        role || 'member'
                    ],
                    type: participantsModel.sequelize.QueryTypes.RAW
                }
            );
            participant = await participantsModel.findOne({
                where: { conversation_id, user_id }
            });
        } else {
            // Fallback cho logic cũ nếu có các trường như nick_name, is_muted...
            const existing = await participantsModel.findOne({
                where: { conversation_id, user_id },
            });

            if (existing) {
                // Đã từng tham gia → tái kích hoạt
                participant = await existing.update({
                    left_at: null,
                    role: participantData.role || existing.role,
                    nick_name: participantData.nick_name || existing.nick_name,
                    is_muted: participantData.is_muted ?? existing.is_muted,
                });
            } else {
                // Chưa từng tham gia → tạo mới
                participant = await participantsModel.create({
                    conversation_id,
                    ...participantData,
                });
            }
        }

        // Nếu cần rotate key sau khi thêm thành viên
        if (requireRotation) {
            await conversationsService.updateKeyStatus(conversation_id, 'require_rotation');
        }

        return participant;
    }

    // Cập nhật participant
    async updateParticipant(id, participantData, changerId = null) {
        const participant = await participantsModel.findByPk(id);
        if (!participant) return null;

        // Nếu có đổi role và có thông tin người đổi (ChangerId), dùng SP để kiểm tra quyền Owner
        if (participantData.role && changerId) {
            try {
                await participantsModel.sequelize.query(
                    'EXEC sp_ChangeMemberRole ?, ?, ?, ?',
                    {
                        replacements: [
                            participant.conversation_id,
                            participant.user_id,
                            participantData.role,
                            changerId
                        ],
                        type: participantsModel.sequelize.QueryTypes.RAW
                    }
                );
                await participant.reload();
                return participant;
            } catch (error) {
                console.error('ERROR IN UPDATE PARTICIPANT SP:', error);
                const fs = require('fs');
                let errorMsg = error.stack || error.message;
                if (error.original) {
                    errorMsg += '\nOriginal Error:\n' + (error.original.stack || error.original.message);
                }
                fs.writeFileSync('c:\\Users\\ROG\\Desktop\\BMCSDL\\server\\error.log', errorMsg);
                throw error;
            }
        }

        // Kiểm tra xem các trường cần update có nằm trong danh sách SP hỗ trợ không
        const { nick_name, is_muted, is_pinned, last_read_message_id } = participantData;
        const supportedFields = ['nick_name', 'is_muted', 'is_pinned', 'last_read_message_id'];
        const dataKeys = Object.keys(participantData);
        const canUseSP = dataKeys.every(key => supportedFields.includes(key));

        if (canUseSP) {
            await participantsModel.sequelize.query(
                'EXEC sp_UpdateParticipant ?, ?, ?, ?, ?',
                {
                    replacements: [
                        id,
                        nick_name || null,
                        is_muted ?? null,
                        is_pinned ?? null,
                        last_read_message_id || null
                    ],
                    type: participantsModel.sequelize.QueryTypes.RAW
                }
            );
            await participant.reload();
            return participant;
        } else {
            // Logic cũ cho các cập nhật khác (nếu có)
            return await participant.update(participantData);
        }
    }

    /**
     * Tự rời nhóm (Soft Delete — đặt left_at).
     * Sau khi rời, cập nhật key_status = 'require_rotation'.
     * @param {string} conversation_id
     * @param {string} user_id - Người tự rời
     */
    async leaveConversation(conversation_id, user_id) {
        if (!conversation_id || !user_id) throw new BadRequestError('params invalid');

        try {
            await participantsModel.sequelize.query(
                'EXEC sp_LeaveConversation ?, ?',
                {
                    replacements: [
                        conversation_id,
                        user_id
                    ],
                    type: participantsModel.sequelize.QueryTypes.RAW
                }
            );

            return { success: true };
        } catch (error) {
            throw error;
        }
    }

    /**
     * Kick thành viên khỏi nhóm (Soft Delete — đặt left_at).
     * Sau khi kick, cập nhật key_status = 'require_rotation'.
     * Chỉ admin/owner mới có thể kick.
     * @param {string} conversation_id
     * @param {string} actor_id - Người thực hiện kick (phải là admin/owner)
     * @param {string} target_user_id - Người bị kick
     */
    // Kick member
    async kickMember(conversation_id, actor_id, target_user_id) {
        if (!conversation_id || !actor_id || !target_user_id) throw new BadRequestError('params invalid');
        if (actor_id === target_user_id) throw new BadRequestError('Không thể tự kick chính mình');

        await participantsModel.sequelize.query(
            'EXEC sp_KickGroupMember ?, ?, ?',
            {
                replacements: [
                    conversation_id,
                    target_user_id,
                    actor_id
                ],
                type: participantsModel.sequelize.QueryTypes.RAW
            }
        );

        return { success: true, kicked_user_id: target_user_id };
    }
}

module.exports = new ParticipantsService();
