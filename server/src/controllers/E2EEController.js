const SuccessResponse = require('../core/successResponse.js');
const e2eeService = require('../services/E2EEService.js');

class E2EEController {
    async setupKeys(req, res, next) {
        const { id } = req.user;
        return new SuccessResponse({
            message: 'setup key successfully',
            metadata: await e2eeService.setupKeys(id, req.body),
        }).send(res);
    }

    async checkStatus(req, res, next) {
        const { id } = req.user;
        return new SuccessResponse({
            message: 'check e2ee status successfully',
            metadata: await e2eeService.checkStatus(id),
        }).send(res);
    }

    async getKeys(req, res, next) {
        const { id } = req.user;
        return new SuccessResponse({
            message: 'get keys successfully',
            metadata: await e2eeService.getKeys(id),
        }).send(res);
    }

    async getConversationMemberKeys(req, res, next) {
        const conv_id = req.params.conv_id;
        return new SuccessResponse({
            message: 'get conversation members keys successfully',
            metadata: await e2eeService.getConversationMemberKeys(conv_id),
        }).send(res);
    }

    async addConversationKeys(req, res, next) {
        const {id} = req.user
        return new SuccessResponse({
            message: 'add shared keys successfully',
            metadata: await e2eeService.addConversationKeys(id, req.body),
        }).send(res);
    }

    async getConversationKey(req, res, next) {
        const { id } = req.user;
        const conv_id = req.params?.conv_id;
        const key_version = req.params?.key_version;
        return new SuccessResponse({
            message: 'ger shared key successfully',
            metadata: await e2eeService.getConversationKey(id, conv_id, key_version),
        }).send(res);
    }

    async getConversationKeys(req, res, next) {
        const { id } = req.user;
        return new SuccessResponse({
            message: 'ger shared keys successfully',
            metadata: await e2eeService.getConversationKeys(id),
        }).send(res);
    }

    async getLatestConversationKey(req, res, next) {
        const { id } = req.user;
        const conv_id = req.params?.conv_id;
        return new SuccessResponse({
            message: 'get latest conversation key successfully',
            metadata: await e2eeService.getLatestConversationKey(id, conv_id),
        }).send(res);
    }
}

module.exports = new E2EEController();
