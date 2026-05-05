const express = require('express');
const router = express.Router();
const friendsController = require('../controllers/friendsController');

router.get('/:userId', friendsController.getFriendByUserId);

module.exports = router;