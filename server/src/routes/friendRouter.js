const express = require('express');
const router = express.Router();

const friendsController = require('../controllers/friendsController');

router.get('/:userId', friendsController.getFriendByUserId);
router.post('/:userId', friendsController.createFriendByUserId);
router.delete('/:userId', friendsController.deleteFriendByUserId);

module.exports = router;