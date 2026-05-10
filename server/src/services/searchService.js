const { Op, fn, col, where } = require('sequelize');
const User = require('../models/usersModel');
const Conversation = require('../models/conversationsModel');

class SearchService {
    async searchUsers(keyword) {
        if (!keyword) return [];
        
        // Chuyển từ khóa về định dạng không dấu để so sánh
        const unaccentKeyword = `%${keyword}%`;

        // 1. Tìm kiếm Users
        const users = await User.findAll({
            where: {
                [Op.and]: [
                    {
                        [Op.or]: [
                            { full_name: { [Op.like]: unaccentKeyword } },
                            { email: { [Op.like]: unaccentKeyword } }
                        ]
                    },
                    { is_active: true },
                    { public_key: { [Op.ne]: null } }
                ]
            },
            attributes: ['id', 'full_name', 'email', 'avatar_url', 'status'],
            limit: 10,
        });

        // 2. Tìm kiếm Groups (conversations có type là group)
        const groups = await Conversation.findAll({
            where: {
                conversation_type: 'group',
                name: { [Op.like]: unaccentKeyword },
                is_active: true
            },
            attributes: ['id', 'name', 'avatar_url'],
            limit: 10,
        });

        // Chuẩn hóa dữ liệu trả về để client dễ xử lý
        const normalizedUsers = users.map(u => ({
            id: u.id,
            full_name: u.full_name || 'Người dùng',
            email: u.email,
            avatar_url: u.avatar_url,
            status: u.status,
            is_group: false
        }));

        const normalizedGroups = groups.map(g => ({
            id: g.id,
            full_name: g.name || 'Nhóm không tên',
            email: 'Nhóm chat', // Hiển thị thay cho email ở giao diện
            avatar_url: g.avatar_url,
            status: 'online',
            is_group: true
        }));

        return [...normalizedUsers, ...normalizedGroups];
    }
}

module.exports = new SearchService();