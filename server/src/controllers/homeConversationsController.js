const homeConversationsService = require('../services/homeConversationsService');
const SuccessResponse = require('../core/successResponse');

class HomeConversationController {
    async getHomeConversation(req, res) {
        const homeConversationData = await homeConversationsService.getAllUserMessagesInJoinedConversations(req.params.userID);
        if (homeConversationData.length === 0) {
            return new SuccessResponse({
                message: 'No home data found',
                metadata: {},
            }).send(res);
        }
        new SuccessResponse({
            message: 'Get home data successfully',
            metadata: {
                homeConversationData: homeConversationData,
            },
        }).send(res);
    }

    async putHomeConversation(req, res) {
        const conversationId = req.params.convID;
        const conversationData = req.body;
        const updatedConversation = await homeConversationsService.updateConversation(conversationId, conversationData);
        new SuccessResponse({
            message: 'Put home conversation successfully',
            metadata: {
                updatedConversation: updatedConversation,
            },
        }).send(res);
    }

    async createConversation(req, res) {
        const { participants_id, conversation_type, name, avatar_url, created_by, last_message_id, last_message_at } = req.body;
        const newConversation = await homeConversationsService.createConversation(participants_id, conversation_type, name, avatar_url, created_by, last_message_id, last_message_at);
        new SuccessResponse({
            message: 'Create conversation successfully',
            metadata: {
                newConversation: newConversation,
            },
        }).send(res);
    }

    async getConversationNameById(req, res) {
        const conversationId = req.params.convID;
        const groupName = await homeConversationsService.getConversationNameById(conversationId);
        new SuccessResponse({
            message: 'Get conversation name successfully',
            metadata: groupName,
        }).send(res);
    }
}

module.exports = new HomeConversationController();