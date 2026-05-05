const homeMessagesService = require('../services/homeMessagesServices');
const SuccessResponse = require('../core/successResponse');

class HomeMessagesController {
    async getHomeMessagesMedia(req, res) {
        const convID = req.params.convID;
        const mediaMesssage = await homeMessagesService.getHomeMessagesMedia(convID);
        new SuccessResponse({
            message: 'Get home messages media successfully',
            metadata: {
                mediaMesssage: mediaMesssage,
            },
        }).send(res);
    }

    async deleteHomeMessages(req, res) {
        const messageId = req.params.messID;
        const deleteResult = await homeMessagesService.deleteMessageInConversation(messageId);
        new SuccessResponse({
            message: 'Delete home message successfully',
            metadata: {
                deleteResult: deleteResult,
            },
        }).send(res);
    }

    async getHomeMessages(req, res) {
        const limit = parseInt(req.query.limit) || 100;
        const offset = parseInt(req.query.offset) || 0;
        const homeMessagesData = await homeMessagesService.getMessagesByConversation(req.params.convID, limit, offset);
        new SuccessResponse({
            message: 'Get home messages successfully',
            metadata: {
                homeMessagesData: homeMessagesData,
            },
        }).send(res);
    }

    async postHomeMessages(req, res) {
        const conversationId = req.params.convID;
        const { senderId, content, parent_message_id, message_type, file_url, file_name, file_size, thumbnail_url, duration, link_description, has_link } = req.body;

        const newMessage = await homeMessagesService.postMessageToConversation(
            conversationId,
            senderId,
            content,
            parent_message_id,
            message_type,
            file_url,
            file_name,
            file_size,
            thumbnail_url,
            duration,
            link_description,
            has_link
        );
        new SuccessResponse({
            message: 'Post home message successfully',
            metadata: {
                newMessage: newMessage,
            },
        }).send(res);
    }

    async putHomeMessages(req, res) {
        const messageId = req.params.messID;
        const messageData = req.body;
        const updatedMessage = await homeMessagesService.updateMessageInConversation(messageId, messageData);
        new SuccessResponse({
            message: 'Put home message successfully',
            metadata: {
                updatedMessage: updatedMessage,
            },
        }).send(res);
    }
}

module.exports = new HomeMessagesController();