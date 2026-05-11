const userblockModel = require('../models/userblockModel');
const { Op } = require('sequelize');

class UserBlockService {
    async getUserBlocks(blocker_id) {
        try {
            return await userblockModel.sequelize.query(
                'SELECT * FROM vw_GetBlockedUsers WHERE blocker_id = :userId OR blocked_id = :userId',
                {
                    replacements: { userId: blocker_id },
                    type: userblockModel.sequelize.QueryTypes.SELECT
                }
            );
        } catch (error) {
            throw error;
        }
    }

    async createUserBlock(blocker_id, blocked_id, reason) {
        try {
            await userblockModel.sequelize.query(
                'EXEC sp_BlockUser ?, ?, ?',
                {
                    replacements: [
                        blocker_id,
                        blocked_id,
                        reason || null
                    ],
                    type: userblockModel.sequelize.QueryTypes.RAW
                }
            );

            // Lấy lại bản ghi vừa tạo để trả về
            return await userblockModel.findOne({
                where: { blocker_id, blocked_id }
            });
        } catch (error) {
            throw error;
        }
    }

    async deleteUserBlock(id) {
        try {
            await userblockModel.sequelize.query(
                'EXEC sp_UnblockUser ?, ?, ?',
                {
                    replacements: [
                        id,
                        null,
                        null
                    ],
                    type: userblockModel.sequelize.QueryTypes.RAW
                }
            );
            return { success: true };
        } catch (error) {
            throw error;
        }
    }
}

module.exports = new UserBlockService();