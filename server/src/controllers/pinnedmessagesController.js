const pinnedmessagesService = require('../services/pinnedmessagesService');
const SuccessResponse = require('../core/successResponse');

class PinnedMessagesController {
    async createPinnedMessage(req, res) {
        const data = req.body;
        const result = await pinnedmessagesService.createPinnedMessage(data);
        new SuccessResponse({
            message: 'Create pinned message successfully',
            metadata: result,
        }).send(res)
    }

    async deletePinnedMessage(req, res) {
        const data = req.body;
        const result = await pinnedmessagesService.deletePinnedMessage(data);
        new SuccessResponse({
            message: 'Delete pinned message successfully',
            metadata: result,
        }).send(res)
    }

    async getAllPinnedMessages(req, res) {
        const result = await pinnedmessagesService.getAllPinnedMessages();
        new SuccessResponse({
            message: 'Get all pinned messages successfully',
            metadata: result,
        }).send(res)
    }

    async getPinnedMessagesByConversationId(req, res) {
        const result = await pinnedmessagesService.getPinnedMessagesByConversationId(req.params.conversationId);
        new SuccessResponse({
            message: 'Get pinned messages by conversation id successfully',
            metadata: result,
        }).send(res)
    }

    async updatePinnedMessage(req, res) {
        const data = req.body;
        const result = await pinnedmessagesService.updatePinnedMessage(data);
        new SuccessResponse({
            message: 'Update pinned message successfully',
            metadata: result,
        }).send(res)
    }
}

module.exports = new PinnedMessagesController();
