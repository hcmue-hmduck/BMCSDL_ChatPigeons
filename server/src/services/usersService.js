const { Op, where } = require('sequelize');
const usersModel = require('../models/usersModel');
const { compareHashString, hashString } = require('../utils/authUtil.js');
const { BadRequestError, UnauthorizedError, ConflictRequestError } = require('../core/errorResponse.js');
const { getUpdateData } = require('../utils/dataUtil.js');

class UsersService {
    // Lấy users theo điều kiện filter
    async getAllUsers(where = {}, options = {}) {
        let query = 'SELECT * FROM vw_AllUsers WHERE 1=1';
        const replacements = {};

        if (where.id) {
            query = 'SELECT * FROM users WHERE is_active = 1';
            const userIds = Array.isArray(where.id) ? where.id : [where.id];
            query += ' AND id IN (:userIds)';
            replacements.userIds = userIds;
        }

        if (where.full_name && typeof where.full_name === 'string') {
            query += ' AND full_name LIKE :fullName';
            replacements.fullName = `%${where.full_name}%`;
        }

        query += ' ORDER BY full_name ASC';

        return await usersModel.sequelize.query(query, {
            replacements,
            type: usersModel.sequelize.QueryTypes.SELECT
        });
    }

    // Lấy user theo ID
    async getUserById(userId) {
        return await usersModel.findByPk(userId);
    }

    // Lấy user theo email định danh
    async getUserByEmail(email) {
        return await usersModel.findOne({ where: { email } });
    }

    async getUserByEmailAndPassword(email, password) {
        console.log(email, password);
        if (!email || !password) throw new BadRequestError('missing parameters');

        const foundUser = await this.getUserByEmail(email);
        if (!foundUser) throw new UnauthorizedError('invalid email or password');

        const password_hash = foundUser.password_hash;
        if (!password_hash) throw new BadRequestError('This account never setup password');

        const isMatch = await compareHashString(password, foundUser.password_hash);
        if (!isMatch) throw new UnauthorizedError('invalid email or password');

        if (!foundUser.is_active) {
            throw new UnauthorizedError('account is locked');
        }

        return foundUser;
    }

    // Tạo user mới
    async createUser(userData) {
        try {
            const results = await usersModel.sequelize.query(
                'EXEC sp_RegisterUser @Email = :email, @PasswordHash = :password_hash, @FullName = :full_name, @IsEmailVerified = :is_email_verified',
                {
                    replacements: {
                        email: userData.email,
                        password_hash: userData.password_hash || null,
                        full_name: userData.full_name || null,
                        is_email_verified: userData.is_email_verified ? 1 : 0,
                    },
                    type: usersModel.sequelize.QueryTypes.SELECT,
                }
            );

            const newUserId = results[0].NewUserId;

            return {
                id: newUserId,
                role: 'user',
                full_name: userData.full_name,
                email: userData.email,
                avatar_url: null,
                is_active: true
            };
        } catch (error) {
            console.error('DETAILED SIGNUP ERROR:', error);
            if (error.parent) {
                console.error('SQL SERVER ORIGINAL ERROR:', error.parent.message);
            }
            throw error;
        }
    }

    async findOrCreateSocialUser({ displayName, email }) {
        if (!displayName || !email) throw new BadRequestError('missing parameters');

        let foundUser = await this.getUserByEmail(email);
        if (!foundUser)
            foundUser = await this.createUser({
                email,
                full_name: displayName,
                is_email_verified: true,
            });

        return foundUser;
    }


    // Cập nhật user
    async updateUser(userId, userData, options = {}) {
        const user = await usersModel.findByPk(userId);
        if (!user) throw new BadRequestError('User not found');

        if (userData.password_hash) {
            // Nếu có password_hash thì gọi SP sp_SetPassword
            await usersModel.sequelize.query(
                'EXEC sp_SetPassword ?, ?',
                {
                    replacements: [
                        userId,
                        userData.password_hash
                    ],
                    type: usersModel.sequelize.QueryTypes.RAW
                }
            );
        } else {
            // Ngược lại gọi SP sp_UpdateProfile
            // Dùng || null để biến chuỗi rỗng '' thành NULL trước khi truyền vào SP
            await usersModel.sequelize.query(
                'EXEC sp_UpdateProfile ?, ?, ?, ?, ?, ?, ?, ?',
                {
                    replacements: [
                        userId,
                        userData.full_name || null,
                        userData.bio || null,
                        userData.avatar_url || null,
                        userData.phone_number || null,
                        userData.birthday || null,
                        userData.gender || null,
                        userData.status || null
                    ],
                    type: usersModel.sequelize.QueryTypes.RAW
                }
            );
        }

        // Trả về user sau khi đã update
        return await usersModel.findByPk(userId);
    }

    async updateUserStatus(userId, status) {
        try {
            await usersModel.sequelize.query(
                'EXEC sp_UpdateUserStatus ?, ?',
                {
                    replacements: [
                        userId,
                        status
                    ],
                    type: usersModel.sequelize.QueryTypes.RAW
                }
            );
            return { success: true };
        } catch (error) {
            throw error;
        }
    }

    async setPassword(userId, password) {
        const password_hash = await hashString(password);
        console.log(`password_hash`, password_hash);
        return this.updateUser(userId, { password_hash });
    }

    async changePassword(userId, oldPassword, newPassword) {
        console.log(`changePassword:::`, { userId, oldPassword, newPassword });
        const user = await this.getUserById(userId);
        if (!user) throw new BadRequestError('User not found');

        const { password_hash } = user;

        // Xử lý trường hợp người dùng chưa từng có mật khẩu (vd: đăng nhập bằng Google)
        if (!password_hash) {
            throw new BadRequestError('User has no password set. Please use set password API instead.');
        }

        const ok = await compareHashString(oldPassword, password_hash);
        // Dùng BadRequestError (400) thay vì UnauthorizedError (401) để tránh Interceptor hiểu nhầm là hết token và logout
        if (!ok) throw new BadRequestError('Mật khẩu hiện tại không chính xác');

        user.password_hash = await hashString(newPassword);
        return await user.save();
    }

    async toggleActive(userId, isActive) {
        // Gọi Stored Procedure trực tiếp
        await usersModel.sequelize.query('EXEC sp_ToggleUserActive ?, ?', {
            replacements: [userId, isActive ? 1 : 0],
            type: usersModel.sequelize.QueryTypes.RAW
        });

        return await usersModel.findByPk(userId);
    }

    // Xóa user (Soft Delete)
    async deleteUser(userId) {
        const user = await usersModel.findByPk(userId);
        if (!user) return false;

        try {
            await usersModel.sequelize.query(
                'EXEC sp_DeleteUser ?',
                {
                    replacements: [userId],
                    type: usersModel.sequelize.QueryTypes.RAW
                }
            );
            return true;
        } catch (error) {
            throw error;
        }
    }
}

module.exports = new UsersService();
