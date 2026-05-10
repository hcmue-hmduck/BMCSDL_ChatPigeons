const participantsService = require('../services/participantsService');
const SuccessResponse = require('../core/successResponse');

class ParticipantsController {
    async createParticipant(req, res) {
        const convID = req.params.convID;
        const { requireRotation = false, ...participantData } = req.body;

        const newParticipant = await participantsService.createParticipant(convID, participantData, requireRotation === true);
        new SuccessResponse({
            message: 'Create participant successfully',
            metadata: {
                newParticipant: newParticipant,
            },
        }).send(res);
    }

    async putParticipant(req, res) {
        const id = req.params.id;
        const participantData = req.body;
        const updatedParticipant = await participantsService.updateParticipant(id, participantData);
        new SuccessResponse({
            message: 'Update participant successfully',
            metadata: {
                updatedParticipant: updatedParticipant,
            },
        }).send(res);
    }

    async getLastReadMessageByConversationAndUser(req, res) {
        const convID = req.params.convID;
        const userID = req.params.userID;

        new SuccessResponse({
            message: 'Get last read message successfully',
            metadata: await participantsService.getLastReadMessageByConversationAndUser(convID, userID)
        }).send(res);
    }

    /**
     * POST /home/participants/leave/:convID
     */
    async leaveConversation(req, res) {
        const conversation_id = req.params.convID;
        const user_id = req.user.id;
        const result = await participantsService.leaveConversation(conversation_id, user_id);
        new SuccessResponse({
            message: 'Left conversation successfully',
            metadata: result,
        }).send(res);
    }

    /**
     * POST /home/participants/kick/:convID
     */
    async kickMember(req, res) {
        const conversation_id = req.params.convID;
        const actor_id = req.user.id;
        const { target_user_id } = req.body;
        const result = await participantsService.kickMember(conversation_id, actor_id, target_user_id);
        new SuccessResponse({
            message: 'Kicked member successfully',
            metadata: result,
        }).send(res);
    }
}

module.exports = new ParticipantsController();
