const express = require('express');
const router = express.Router();
const e2eeController = require('../controllers/E2EEController');

router.get('/status', e2eeController.checkStatus);
router.get('/keys', e2eeController.getKeys);
router.get('/conversation-key/:conv_id/:key_version', e2eeController.getConversationKey);
router.get('/conversation-keys', e2eeController.getConversationKeys);
router.get('/latest-conversation-key/:conv_id', e2eeController.getLatestConversationKey);
router.get('/conversation-member-keys/:conv_id', e2eeController.getConversationMemberKeys);

router.post('/setup', e2eeController.setupKeys);
router.post('/conversation-keys', e2eeController.addConversationKeys);

module.exports = router;
