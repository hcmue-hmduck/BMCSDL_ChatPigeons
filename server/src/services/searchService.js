const { Op, fn, col, where } = require('sequelize');
const User = require('../models/usersModel');
const Conversation = require('../models/conversationsModel');

class SearchService {
    async searchUsers(keyword) {
        if (!keyword) return [];
        
        // Chuyển từ khóa về định dạng không dấu để so sánh
        const unaccentKeyword = `%${keyword}%`;

        // 1. Tìm kiếm bằng View
        const results = await User.sequelize.query(
            "SELECT * FROM vw_SearchUsersAndGroups WHERE name LIKE :keyword OR email LIKE :keyword",
            {
                replacements: { keyword: unaccentKeyword },
                type: User.sequelize.QueryTypes.SELECT
            }
        );

        // 2. Chuẩn hóa dữ liệu trả về
        return results.map(r => ({
            id: r.id,
            full_name: r.name || (r.result_type === 'group' ? 'Nhóm không tên' : 'Người dùng'),
            email: r.result_type === 'group' ? 'Nhóm chat' : r.email,
            avatar_url: r.avatar_url,
            status: r.status,
            is_group: r.result_type === 'group'
        }));
    }
}

module.exports = new SearchService();