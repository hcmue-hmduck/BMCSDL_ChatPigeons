const express = require('express');
const router = express.Router();

const messageReactionsController = require('../controllers/message_reactionsController');

router.post('/:convID', messageReactionsController.addMessageReaction);
router.delete('/:reactionID', messageReactionsController.removeMessageReaction);
router.get('/:convID', messageReactionsController.getMessageReactions);

module.exports = router;