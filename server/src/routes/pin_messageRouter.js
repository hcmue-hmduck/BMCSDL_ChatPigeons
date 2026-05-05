const express = require('express');
const router = express.Router();

const pinMessageController = require('../controllers/pin_messageController');

router.post('/', pinMessageController.postHomePinMessage);
router.put('/:pinMessID', pinMessageController.putHomePinMessage);
router.delete('/:pinMessID', pinMessageController.deleteHomePinMessage);

module.exports = router;
