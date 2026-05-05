const searchService = require('../services/searchService');
const SuccessResponse = require('../core/successResponse');

class SearchController {
    async searchUsers(req, res) {
        const keyword = req.query.keyword;
        const users = await searchService.searchUsers(keyword);
        new SuccessResponse({
            message: 'Search users successfully',
            metadata: {
                users: users,
            },
        }).send(res);
    }
}

module.exports = new SearchController();