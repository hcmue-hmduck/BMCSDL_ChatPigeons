const express = require('express');
const router = express.Router();

const homeMessagesController = require('../controllers/homeMessagesController');

router.get('/:convID/media', homeMessagesController.getHomeMessagesMedia);
router.delete('/:messID', homeMessagesController.deleteHomeMessages);
router.put('/:messID', homeMessagesController.putHomeMessages);
router.post('/:convID', homeMessagesController.postHomeMessages);
router.get('/:convID', homeMessagesController.getHomeMessages);

module.exports = router;