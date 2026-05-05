const express = require('express');
const router = express.Router();
const upload = require('../configs/multerConfig');
const uploadController = require('../controllers/uploadController');


router.post(
	'/:convID',
	upload.fields([
		{ name: 'files', maxCount: 10 }
	]),
	uploadController.uploadFile.bind(uploadController),
);

router.post(
	'/feeds/:feedID',
	upload.fields([
		{ name: 'files', maxCount: 100 }
	]),
	uploadController.uploadFileFeeds.bind(uploadController),
);

module.exports = router;