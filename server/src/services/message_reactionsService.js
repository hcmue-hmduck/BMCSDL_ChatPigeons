const { Op } = require('sequelize');
const messageReactionModel = require('../models/messagereactionsModel');

class MessageReactionService {
    async addMessageReaction(message_id, user_id, conversation_id, emoji_char) {
        return await messageReactionModel.create({
            message_id: message_id,
            user_id: user_id,
            conversation_id: conversation_id,
            emoji_char: emoji_char,
        });
    }

    async removeMessageReaction(reactionID) {
        return await messageReactionModel.destroy({
            where: {
                id: reactionID,
            },
        });
    }

    async getMessageReactions(conversation_id) {
        return await messageReactionModel.findAll({
            where: {
                conversation_id: conversation_id
            },
        });
    }

    async getMessageReactionsByMessageIds(messageIds = []) {
        const uniqueIds = [...new Set((messageIds || []).filter(Boolean))];
        if (uniqueIds.length === 0) return [];

        return await messageReactionModel.findAll({
            where: {
                message_id: {
                    [Op.in]: uniqueIds,
                },
            },
        });
    }
}

module.exports = new MessageReactionService();
