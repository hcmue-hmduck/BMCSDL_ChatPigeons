const participantsService = require('../services/participantsService');
const SuccessResponse = require('../core/successResponse');

class ParticipantsController {
     async createParticipant(req, res) {
        const convID = req.params.convID;
        const participantData = req.body;
        const newParticipant = await participantsService.createParticipant(convID, participantData);
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
}

module.exports = new ParticipantsController();
