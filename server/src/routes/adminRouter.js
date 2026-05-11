const express = require('express');
const router = express.Router();
const { authorize } = require('../middlewares/authMiddleware.js');

const usersRouter = require('./usersRouter');

// router.use(authorize(['admin'])); - kh bật vì đang có 1 số router của user xài ké  bên admin

router.use('/users', usersRouter);

module.exports = router;