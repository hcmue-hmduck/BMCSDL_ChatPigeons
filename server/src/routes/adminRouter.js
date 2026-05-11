const express = require('express');
const router = express.Router();
const { authorize } = require('../middlewares/authMiddleware.js');

const usersRouter = require('./usersRouter');

router.use(authorize(['admin']));
router.use('/users', usersRouter);

module.exports = router;