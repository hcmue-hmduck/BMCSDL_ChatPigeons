const messageReactionsService = require('../services/message_reactionsService');
const SuccessResponse = require('../core/successResponse');

class MessageReactionsController {
    async getMessageReactions(req, res) {
        const convID = req.params.convID;
        const messageReactions = await messageReactionsService.getMessageReactions(convID);
        new SuccessResponse({
            message: 'Get message reactions successfully',
            metadata: {
                messageReactions: messageReactions,
            },
        }).send(res);
    }

    async addMessageReaction(req, res) {
        const { convID } = req.params;
        const { message_id, user_id, emoji_char } = req.body;
        const newReaction = await messageReactionsService.addMessageReaction(message_id, user_id, convID, emoji_char);
        new SuccessResponse({
            message: 'Add message reaction successfully',
            metadata: {
                newReaction: newReaction,
            },
        }).send(res);
    }

    async removeMessageReaction(req, res) {
        const reactionID = req.params.reactionID;
        const deleteResult = await messageReactionsService.removeMessageReaction(reactionID);
        new SuccessResponse({
            message: 'Remove message reaction successfully',
            metadata: {
                deleteResult: deleteResult,
            },
        }).send(res);
    }
}

module.exports = new MessageReactionsController();