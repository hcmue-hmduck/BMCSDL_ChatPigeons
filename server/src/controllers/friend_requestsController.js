const friendrequestsService = require('../services/friend_requestsService');
const SuccessResponse = require('../core/successResponse');

class FriendRequestsController {
    async getFriendRequests(req, res) {
        try {
            const friendRequests = await friendrequestsService.getFriendRequests(req.params.receiverId);
            new SuccessResponse({
                message: 'Get friend requests successfully',
                metadata: friendRequests,
                statusCode: 200,
                status: 'success'
            }).send(res);
        } catch (error) {
            new SuccessResponse({
                message: 'Get friend requests failed',
                metadata: null,
                statuscode: 500,
                status: 'failed'
            }).send(res);
        }
    }

    async createFriendRequest(req, res) {
        try {
            const { senderId, receiverId, reason } = req.body;
            const friendRequest = await friendrequestsService.createFriendRequest(senderId, receiverId, reason);
            new SuccessResponse({
                message: 'Create friend request successfully',
                metadata: friendRequest,
                statusCode: 200,
                status: 'success'
            }).send(res);
        } catch (error) {
            new SuccessResponse({
                message: 'Create friend request failed',
                metadata: null,
                statuscode: 500,
                status: 'failed'
            }).send(res);
        }
    }

    async updateFriendRequestStatus(req, res) {
        const id = req.params.id;
        const { status } = req.body;
        const updatedFriendRequest = await friendrequestsService.updateFriendRequestStatus(id, status);
        new SuccessResponse({
            message: 'Update friend request status successfully',
            metadata: {
                updatedFriendRequest: updatedFriendRequest,
            },
        }).send(res);
    }

    async getSentFriendRequests(req, res) {
        const senderId = req.params.senderId;
        const sentFriendRequests = await friendrequestsService.getSentFriendRequests(senderId);
        new SuccessResponse({
            message: 'Get sent friend requests successfully',
            metadata: {
                sentFriendRequests: sentFriendRequests,
            },
        }).send(res);
    }
}

module.exports = new FriendRequestsController();