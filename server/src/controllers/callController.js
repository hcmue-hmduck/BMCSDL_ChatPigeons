const homeCallService = require('../services/homeCallService');
const SuccessResponse = require('../core/successResponse');

class CallController {
    // [POST] /home/call/:convID
    async startHomeCall(req, res) {
        const conversation_id = req.params.convID;
        new SuccessResponse({
            message: 'Start home call successfully',
            metadata: await homeCallService.startCall({ conversation_id, ...req.body }),
        }).send(res);
    }

    // [POST] /home/call/logs-group-call/:convID
    async createLogJoinGroupCall(req, res) {
        const conversation_id = req.params.convID;
        const { user_id } = req.body;
        new SuccessResponse({
            message: 'Create log join group call successfully',
            metadata: await homeCallService.createLogJoinGroupCall({ conversation_id, user_id }),
        }).send(res);
    }

    // [PATCH] /home/call/ongoing/:callID
    async setCallOngoing(req, res) {
        const call_id = req.params.callID;
        new SuccessResponse({
            message: 'Set call ongoing successfully',
            metadata: await homeCallService.setCallOngoing(call_id),
        }).send(res);
    }

    // [PATCH] /home/call/completed/:callID
    async setCallCompleted(req, res) {
        const call_id = req.params.callID;
        new SuccessResponse({
            message: 'Set call completed successfully',
            metadata: await homeCallService.setCallCompleted(call_id),
        }).send(res);
    }

    // [PATCH] /home/call/decliend/:callID
    async setCallDecliend(req, res) {
        const call_id = req.params.callID;
        new SuccessResponse({
            message: 'Set call declined successfully',
            metadata: await homeCallService.setCallDecliend(call_id),
        }).send(res);
    }

    // [PATCH] /home/call/cancelled/:callID
    async setCallCancelled(req, res) {
        const call_id = req.params.callID;
        new SuccessResponse({
            message: 'Set call cancelled successfully',
            metadata: await homeCallService.setCallCancelled(call_id),
        }).send(res);
    }

    // [PATCH] /home/call/missed/:callID
    async setCallMissed(req, res) {
        const call_id = req.params.callID;
        new SuccessResponse({
            message: 'Set call missed successfully',
            metadata: await homeCallService.setCallMissed(call_id),
        }).send(res);
    }

    // [PATCH] /home/call/ended/:callID
    async setCallEnded(req, res) {
        const call_id = req.params.callID;
        new SuccessResponse({
            message: 'Set call ended successfully',
            metadata: await homeCallService.endCall(call_id),
        }).send(res);
    }
}

module.exports = new CallController();