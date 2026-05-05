const livekitController = require('../controllers/livekitController.js');
const express = require('express');
const router = express.Router();

// [GET] lấy access token để tham gia vào room
router.get('/access-token', livekitController.getAccessToken);

module.exports = router;
