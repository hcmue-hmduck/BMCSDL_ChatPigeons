const express = require('express');
const router = express.Router();

const linkPreviewController = require('../controllers/link_previewController');

router.get('/', linkPreviewController.getLinkPreview);

module.exports = router;