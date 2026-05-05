const { Op, fn, col, where } = require('sequelize');
const User = require('../models/usersModel');

class SearchService {
    async searchUsers(keyword) {
        if (!keyword) return [];
        
        // Chuyển từ khóa về định dạng không dấu để so sánh
        const unaccentKeyword = `%${keyword}%`;

        const users = await User.findAll({
            where: {
                [Op.or]: [
                    // Tìm kiếm không phân biệt dấu trên cột full_name
                    where(
                        fn('unaccent', col('full_name')),
                        { [Op.iLike]: fn('unaccent', unaccentKeyword) }
                    ),
                    // Tìm kiếm trên cột email (thường không có dấu nhưng unaccent vẫn an toàn)
                    where(
                        fn('unaccent', col('email')),
                        { [Op.iLike]: fn('unaccent', unaccentKeyword) }
                    )
                ],
                is_active: true,
            },
            attributes: ['id', 'full_name', 'email', 'avatar_url', 'status', 'is_bot'],
            limit: 10,
        });
        return users;
    }
}

module.exports = new SearchService();