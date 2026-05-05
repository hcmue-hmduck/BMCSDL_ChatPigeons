const express = require('express');
const router = express.Router();
const usersController = require('../controllers/usersController');

// Định nghĩa các routes cho users
router.get('/', usersController.getAllUsers);
router.get('/me', usersController.getMe);
router.get('/:id', usersController.getUserById);
router.post('/', usersController.createUser);
router.put('/:id', usersController.updateUser);
router.patch('/me/password-setup', usersController.setPassword);
router.patch('/me/password-change', usersController.changePassword);
router.delete('/:id', usersController.deleteUser);

module.exports = router;
