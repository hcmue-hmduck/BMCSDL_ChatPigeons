const express = require('express');
const router = express.Router();
const friendrequestsController = require('../controllers/friend_requestsController');

router.get('/:receiverId', friendrequestsController.getFriendRequests);
router.get('/sent/:senderId', friendrequestsController.getSentFriendRequests);
router.post('/', friendrequestsController.createFriendRequest);
router.put('/:id', friendrequestsController.updateFriendRequestStatus);

module.exports = router;