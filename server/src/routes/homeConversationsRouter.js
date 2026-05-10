const express = require('express');
const router = express.Router();

const homeConversationController = require('../controllers/homeConversationsController');

// Conversation routes
router.get('/:userID', homeConversationController.getHomeConversation);
router.put('/:convID', homeConversationController.putHomeConversation);
router.post('/group', homeConversationController.createGroup);
router.post('/', homeConversationController.createConversation);
router.get('/name/:convID', homeConversationController.getConversationNameById);

module.exports = router;