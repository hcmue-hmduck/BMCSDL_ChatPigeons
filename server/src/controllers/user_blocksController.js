const userblocksService = require('../services/userblockServices');
const SuccessResponse = require('../core/successResponse');

class UserBlocksService {
    async getUserBlocks(req, res) {
        const blockerId = req.params.blockerId;
        const userBlocks = await userblocksService.getUserBlocks(blockerId);
        new SuccessResponse({
            message: 'Get user blocks successfully',
            metadata: {
                userBlocks: userBlocks,
            },
        }).send(res);
    }

    async createUserBlock(req, res) {
        const { blockerId, blockedId, reason } = req.body;
        const newUserBlock = await userblocksService.createUserBlock(blockerId, blockedId, reason);
        new SuccessResponse({
            message: 'Create user block successfully',
            metadata: {
                newUserBlock: newUserBlock,
            },
        }).send(res);
    }

    async deleteUserBlock(req, res) {
        const id = req.params.id;
        const deleteResult = await userblocksService.deleteUserBlock(id);
        new SuccessResponse({
            message: 'Delete user block successfully',
            metadata: {
                deleteResult: deleteResult,
            },
        }).send(res);
    }
}

module.exports = new UserBlocksService();
