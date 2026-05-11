const friendsModel = require('../models/friendsModel');
const usersModel = require('../models/usersModel');

class FriendsService {
    async getFriendByUserId(userId) {
        try {
            const results = await friendsModel.sequelize.query(
                'SELECT * FROM vw_GetFriends WHERE user_id = :userId',
                {
                    replacements: { userId },
                    type: friendsModel.sequelize.QueryTypes.SELECT
                }
            );

            return results.map(r => ({
                user_id: r.user_id,
                friend_id: r.friend_id,
                notes: r.notes,
                is_favorite: r.is_favorite,
                friendship_date: r.friendship_date,
                friend: {
                    id: r.friend_id,
                    full_name: r.friend_name,
                    avatar_url: r.friend_avatar,
                    status: r.friend_status
                }
            }));
        }
        catch (error) {
            throw error;
        }
    }

    async createFriendByUserId(userId, friend_id, is_favorite, notes) {
        try {
            await friendsModel.sequelize.query(
                'EXEC sp_AddFriend ?, ?, ?, ?',
                {
                    replacements: [
                        userId,
                        friend_id,
                        is_favorite ? 1 : 0,
                        notes || null
                    ],
                    type: friendsModel.sequelize.QueryTypes.RAW
                }
            );
            return { message: 'Thêm bạn bè thành công' };
        } catch (error) {
            throw error;
        }
    }

    async deleteFriendByUserId(userId, friend_id) {
        try {
            await friendsModel.sequelize.query(
                'EXEC sp_DeleteFriend ?, ?',
                {
                    replacements: [
                        userId,
                        friend_id
                    ],
                    type: friendsModel.sequelize.QueryTypes.RAW
                }
            );
            // Trả về kết quả giả lập thành công vì SP không return số dòng xóa
            return { userReq: 1, otherReq: 1 };
        } catch (error) {
            throw error;
        }
    }
}

module.exports = new FriendsService();