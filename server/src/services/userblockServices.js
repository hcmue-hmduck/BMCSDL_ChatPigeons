const userblockModel = require('../models/userblockModel');

class UserBlockService {
    async getUserBlocks(blocker_id) {
        try {
            return await userblockModel.findAll({
                where: {
                    blocker_id: blocker_id,
                }
            });
        } catch (error) {
            throw error;
        }
    }

    async createUserBlock(blocker_id, blocked_id, reason) {
        try {
            const userBlock = await userblockModel.create({
                blocker_id,
                blocked_id,
                reason
            });
            return userBlock;
        } catch (error) {
            throw error;
        }
    }

    async deleteUserBlock(id) {
        try {
            return await userblockModel.destroy({
                where: {
                    id: id,
                }
            });
        } catch (error) {
            throw error;
        }
    }
}

module.exports = new UserBlockService();