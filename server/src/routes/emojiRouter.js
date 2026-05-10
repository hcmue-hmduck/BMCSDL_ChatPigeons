const express = require('express');
const router = express.Router();

const emojiController = require('../controllers/emojiController');

router.get('/', emojiController.getAllEmojis);


module.exports = router;
