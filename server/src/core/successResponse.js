class SuccessResponse {
    constructor({message = 'OK', statuscode = 200, metadata = {}}) {
        this.message = message;
        this.metadata = metadata;
        this.code = statuscode;
    }

    send(res, header = {}){
        res.status(this.code).json(this)
    }
}

module.exports = SuccessResponse;