const express = require('express');
const router = express.Router();
const PinnedMessagesController = require('../controllers/pinnedmessagesController');

router.get('/', PinnedMessagesController.getAllPinnedMessages);

module.exports = router;