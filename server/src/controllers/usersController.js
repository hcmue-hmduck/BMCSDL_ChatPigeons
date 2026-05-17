const usersService = require('../services/usersService');
const redisService = require('../services/redisService');
const SuccessResponse = require('../core/successResponse');

class UsersController {
    // GET /admin/users - Lấy tất cả users
    async getAllUsers(req, res, next) {
        const allUsers = await usersService.getAllUsers();
        new SuccessResponse({
            message: 'Get all users successfully',
            metadata: allUsers,
        }).send(res)
    }

    // GET /admin/users/:id - Lấy user theo ID
    async getUserById(req, res) {
        const user = await usersService.getUserById(req.params.id);
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        new SuccessResponse({
            message: 'Get user successfully',
            metadata: {
                // user,
                userInfor: user,
            },
        }).send(res)
    }

    // GET /home/userinfo/me
    async getMe(req, res, next) {
        const id = req?.user?.id;

        const user = await usersService.getUserById(id);
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        new SuccessResponse({
            message: 'Get me successfully',
            metadata: {
                // user,
                userInfor: user,
            },
        }).send(res)
    }

    // POST /admin/users - Tạo user mới
    async createUser(req, res) {
        const newUser = await usersService.createUser(req.body);
        res.status(201).json({
            success: true,
            message: 'User created successfully',
            data: newUser
        });

        new SuccessResponse({
            message: 'Create user successfully',
            metadata: newUser,
        }).send(res)
    }

    // PUT /admin/users/:id - Cập nhật user
    async updateUser(req, res) {
        const updatedUser = await usersService.updateUser(req.params.id, req.body);
        return new SuccessResponse({
            message: 'updated user successfully',
            metadata: updatedUser
        }).send(res);
    }

    // PATCH /home/userinfo/me/password-setup
    async setPassword(req, res, next) {
        const password = req.body.password;
        const { id } = req.user
        new SuccessResponse({
            message: 'set password successfully',
            metadata: await usersService.setPassword(id, password)
        }).send(res)
    }

    // PATCH /home/userinfo/me/password-change
    async changePassword(req, res, next) {
        const { oldPassword, newPassword } = req.body;
        const { id } = req.user
        new SuccessResponse({
            message: 'change password successfully',
            metadata: await usersService.changePassword(id, oldPassword, newPassword)
        }).send(res)

    }

    // PATCH /admin/users/:id/active - Lock / Unlock user
    async toggleActive(req, res, next) {
        const { is_active } = req.body;
        const userId = req.params.id;

        const updatedUser = await usersService.toggleActive(userId, is_active);

        // Nếu khóa tài khoản, xóa toàn bộ session đang hoạt động trong Redis để chặn API ngay lập tức
        if (!is_active) {
            await redisService.deleteAllUserSessions(userId);
        }

        // Phát tín hiệu socket tới các client của user bị tác động
        const io = req.app.get('io');
        const onlineUsers = req.app.get('onlineUsers');

        if (io && onlineUsers) {
            const userSockets = onlineUsers.get(String(userId));
            if (userSockets) {
                if (!is_active) {
                    // Nếu khóa tài khoản, ép buộc đăng xuất ngay lập tức
                    userSockets.forEach(socketId => {
                        io.to(socketId).emit('forceLogout', { message: 'Tài khoản của bạn đã bị khóa bởi Admin!' });
                    });
                } else {
                    userSockets.forEach(socketId => {
                        io.to(socketId).emit('accountUnlocked', { message: 'Tài khoản của bạn đã được mở khóa!' });
                    });
                }
            }

            // Gửi sự kiện cập nhật trạng thái hoạt động toàn cục
            io.emit('userActiveStatusChanged', { userId, is_active });
        }

        new SuccessResponse({
            message: is_active ? 'Unlock user successfully' : 'Lock user successfully',
            metadata: updatedUser
        }).send(res);
    }

    // DELETE /admin/users/:id - Xóa user
    async deleteUser(req, res) {
        try {
            const deleted = await usersService.deleteUser(req.params.id);
            if (!deleted) {
                return res.status(404).json({
                    success: false,
                    message: 'User not found'
                });
            }
            res.status(200).json({
                success: true,
                message: 'User deleted successfully'
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                message: 'Error deleting user',
                error: error.message
            });
        }
    }
}

module.exports = new UsersController();