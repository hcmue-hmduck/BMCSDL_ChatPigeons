const express = require('express');
const router = express.Router();

const userblocksController = require('../controllers/user_blocksController');

router.get('/:blockerId', userblocksController.getUserBlocks);
router.post('/', userblocksController.createUserBlock);
router.delete('/:id', userblocksController.deleteUserBlock);


module.exports = router;
