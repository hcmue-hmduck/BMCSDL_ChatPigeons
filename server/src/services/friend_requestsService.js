const friendrequestsModel = require('../models/friendrequestsModel');
const usersService = require('./usersService');

class FriendRequestsService {
    async getFriendRequests(receiver_id) {
        try {
            return await friendrequestsModel.sequelize.query(
                'SELECT * FROM vw_GetFriendRequests WHERE receiver_id = :receiver_id',
                {
                    replacements: { receiver_id },
                    type: friendrequestsModel.sequelize.QueryTypes.SELECT
                }
            );
        } catch (error) {
            throw error;
        }
    }

    async getSentFriendRequest(sender_id) {
        try {
            return await friendrequestsModel.findAll({
                where: {
                    sender_id: sender_id,
                    status: 'pending'
                }
            });
        } catch (error) {
            throw error;
        }
    }

    async getSentFriendRequests(senderId) {
        try {
            return await friendrequestsModel.sequelize.query(
                "SELECT * FROM vw_GetSentFriendRequests WHERE sender_id = :senderId AND status = 'pending'",
                {
                    replacements: { senderId },
                    type: friendrequestsModel.sequelize.QueryTypes.SELECT
                }
            );
        } catch (error) {
            throw error;
        }
    }

    async createFriendRequest(sender_id, receiver_id, note) {
        try {
            await friendrequestsModel.sequelize.query(
                'EXEC sp_CreateFriendRequest ?, ?, ?',
                {
                    replacements: [
                        sender_id,
                        receiver_id,
                        note || null
                    ],
                    type: friendrequestsModel.sequelize.QueryTypes.RAW
                }
            );

            // Lấy lại bản ghi vừa tạo/cập nhật để trả về
            return await friendrequestsModel.findOne({
                where: {
                    sender_id: sender_id,
                    receiver_id: receiver_id,
                }
            });
        } catch (error) {
            throw error;
        }
    }

    async updateFriendRequestStatus(id, status) {
        try {
            await friendrequestsModel.sequelize.query(
                'EXEC sp_UpdateFriendRequestStatus ?, ?',
                {
                    replacements: [
                        id,
                        status
                    ],
                    type: friendrequestsModel.sequelize.QueryTypes.RAW
                }
            );
            return await friendrequestsModel.findByPk(id);
        } catch (error) {
            throw error;
        }
    }
}

module.exports = new FriendRequestsService();