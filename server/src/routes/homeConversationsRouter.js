const express = require('express');
const router = express.Router();

const homeConversationController = require('../controllers/homeConversationsController');

// Conversation routes
router.get('/:userID', homeConversationController.getHomeConversation);
router.put('/:convID', homeConversationController.putHomeConversation);
router.post('/group', homeConversationController.createGroup);
router.post('/', homeConversationController.createConversation);
router.get('/name/:convID', homeConversationController.getConversationNameById);
router.delete('/:convID/clear', homeConversationController.clearHistory);
router.delete('/:convID', homeConversationController.deleteConversation);

module.exports = router;