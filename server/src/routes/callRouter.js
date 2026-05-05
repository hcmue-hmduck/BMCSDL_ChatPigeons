const express = require('express');
const router = express.Router();
const callController = require('../controllers/callController');

router.post('/:convID', callController.startHomeCall);
router.post('/logs-group-call/:convID', callController.createLogJoinGroupCall);
router.patch('/ongoing/:callID', callController.setCallOngoing);
router.patch('/completed/:callID', callController.setCallCompleted);
router.patch('/declined/:callID', callController.setCallDecliend);
router.patch('/cancelled/:callID', callController.setCallCancelled);
router.patch('/missed/:callID', callController.setCallMissed);
router.patch('/ended/:callID', callController.setCallEnded);

module.exports = router;