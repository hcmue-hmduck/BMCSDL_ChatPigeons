const FriendsService = require('../services/friendsService');
const SuccessResponse = require('../core/successResponse');

class FriendsController {
    async getFriendByUserId(req, res) {
        const userId = req.params.userId;
        const friends = await FriendsService.getFriendByUserId(userId);
        new SuccessResponse({
            message: 'Get friends successfully',
            metadata: {
                friends: friends,
            }
        }).send(res)
    }

    async createFriendByUserId(req, res) {
        const userId = req.params.userId;
        const { friend_id, is_favorite, notes } = req.body;
        const newFriend = await FriendsService.createFriendByUserId(userId, friend_id, is_favorite, notes);
        new SuccessResponse({
            message: 'Create friend successfully',
            metadata: {
                newFriend: newFriend,
            },
        }).send(res);
    }

    async deleteFriendByUserId(req, res) {
        const userId = req.params.userId;
        const { friend_id } = req.body;
        const deleteResult = await FriendsService.deleteFriendByUserId(userId, friend_id);
        new SuccessResponse({
            message: 'Delete friend successfully',
            metadata: {
                deleteResult: deleteResult,
            },
        }).send(res);
    }
}

module.exports = new FriendsController();

