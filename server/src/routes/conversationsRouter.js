const express = require('express');
const router = express.Router();
const conversationsController = require('../controllers/conversationsController');

// Định nghĩa các routes cho conversations
router.get('/', conversationsController.getAllConversations);
router.get('/:id', conversationsController.getConversationById);
router.post('/', conversationsController.createConversation);
router.put('/:id', conversationsController.updateConversation);
router.delete('/:id', conversationsController.deleteConversation);

module.exports = router;