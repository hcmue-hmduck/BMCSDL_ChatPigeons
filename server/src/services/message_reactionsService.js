const { Op } = require('sequelize');
const messageReactionModel = require('../models/messagereactionsModel');

class MessageReactionService {
    async addMessageReaction(message_id, user_id, conversation_id, emoji_char) {
        try {
            await messageReactionModel.sequelize.query(
                'EXEC sp_AddMessageReaction ?, ?, ?',
                {
                    replacements: [
                        message_id,
                        user_id,
                        emoji_char
                    ],
                    type: messageReactionModel.sequelize.QueryTypes.RAW
                }
            );

            // Lấy lại bản ghi vừa tạo để trả về
            return await messageReactionModel.findOne({
                where: {
                    message_id: message_id,
                    user_id: user_id,
                    emoji_char: emoji_char
                }
            });
        } catch (error) {
            throw error;
        }
    }

    async removeMessageReaction(reactionID) {
        try {
            await messageReactionModel.sequelize.query(
                'EXEC sp_RemoveMessageReaction ?, ?, ?, ?',
                {
                    replacements: [
                        reactionID,
                        null,
                        null,
                        null
                    ],
                    type: messageReactionModel.sequelize.QueryTypes.RAW
                }
            );
            return { success: true };
        } catch (error) {
            throw error;
        }
    }

    async getMessageReactions(conversation_id) {
        return await messageReactionModel.sequelize.query(
            'SELECT * FROM vw_GetMessageReactions WHERE conversation_id = :conversation_id',
            {
                replacements: { conversation_id },
                type: messageReactionModel.sequelize.QueryTypes.SELECT
            }
        );
    }

    async getMessageReactionsByMessageIds(messageIds = []) {
        const uniqueIds = [...new Set((messageIds || []).filter(Boolean))];
        if (uniqueIds.length === 0) return [];

        return await messageReactionModel.sequelize.query(
            'SELECT * FROM vw_GetMessageReactions WHERE message_id IN (:messageIds)',
            {
                replacements: { messageIds: uniqueIds },
                type: messageReactionModel.sequelize.QueryTypes.SELECT
            }
        );
    }
}

module.exports = new MessageReactionService();
