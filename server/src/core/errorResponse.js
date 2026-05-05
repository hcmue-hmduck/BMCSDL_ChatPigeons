const reasonPhrases = require('./reasonPhrases.js');
const statusCodes = require('./statusCodes.js');

class ErrorResponse extends Error {
    constructor(message, status) {
        super(message);
        this.status = status;
    }
}

// xung đột (vi phạm một quy tắc dữ liệu)
class ConflictRequestError extends ErrorResponse {
    constructor(message = reasonPhrases.CONFLICT, status = statusCodes.CONFLICT) {
        super(message, status);
    }
}

// lỗi xác thực
class UnauthorizedError extends ErrorResponse {
    constructor(message = reasonPhrases.UNAUTHORIZED, status = statusCodes.UNAUTHORIZED) {
        super(message, status);
    }
}

// lỗi quyền truy cập
class ForbiddenError extends ErrorResponse {
    constructor(message = reasonPhrases.FORBIDDEN, status = statusCodes.FORBIDDEN) {
        super(message, status);
    }
}

// không tìm thấy
class NotFoundError extends ErrorResponse {
    constructor(message = reasonPhrases.NOT_FOUND, status = statusCodes.NOT_FOUND) {
        super(message, status);
    }
}

// yêu cầu không hợp lệ
class BadRequestError extends ErrorResponse {
    constructor(message = reasonPhrases.BAD_REQUEST, status = statusCodes.BAD_REQUEST) {
        super(message, status);
    }
}

// lỗi hệ thống
class InternalServerError extends ErrorResponse {
    constructor(message = reasonPhrases.INTERNAL_SERVER_ERROR, status = statusCodes.INTERNAL_SERVER_ERROR) {
        super(message, status);
    }
}

class TooManyRequestError extends ErrorResponse {
    constructor(message = reasonPhrases.TOO_MANY_REQUESTS, status = statusCodes.TOO_MANY_REQUESTS) {
        super(message, status);
    }
}

module.exports = {
    ConflictRequestError,
    UnauthorizedError,
    ForbiddenError,
    NotFoundError,
    BadRequestError,
    InternalServerError,
    TooManyRequestError,
};
