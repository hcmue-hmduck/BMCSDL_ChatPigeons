const friendrequestsModel = require('../models/friendrequestsModel');
const usersService = require('./usersService');

class FriendRequestsService {
    async getFriendRequests(receiver_id) {
        try {
            return await friendrequestsModel.findAll({
                where: {
                    receiver_id: receiver_id,
                    status: 'pending'
                }
            });
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
        const friendRequests = await this.getSentFriendRequest(senderId);
        if (friendRequests.length === 0) return [];

        const receiverIds = friendRequests.map(req => req.receiver_id);
        const receiverInfos = await usersService.getAllUsers({ id: receiverIds });

        const receiverInfoMap = new Map(receiverInfos.map(user => [user.id, user]));

        return friendRequests.map(req => {
            const receiverInfo = receiverInfoMap.get(req.receiver_id) || {};
            return {
                ...req.dataValues,
                receiver_name: receiverInfo.full_name,
                receiver_avatar: receiverInfo.avatar_url,
            };
        });
    }

    async createFriendRequest(sender_id, receiver_id, note) {
        try {
            const existingRequest = await friendrequestsModel.findOne({
                where: {
                    sender_id: sender_id,
                    receiver_id: receiver_id,
                }
            });
            if (existingRequest) {
                // Return updated instance
                return await existingRequest.update({
                    status: 'pending',
                    note
                });
            } else {
                // Return created instance
                return await friendrequestsModel.create({
                    sender_id,
                    receiver_id,
                    note
                });
            }
        } catch (error) {
            throw error;
        }
    }

    async updateFriendRequestStatus(id, status) {
        try {
            return await friendrequestsModel.update(
                { status: status },
                {
                    where: {
                        id: id,
                    }
                }
            );
        } catch (error) {
            throw error;
        }
    }
}

module.exports = new FriendRequestsService();