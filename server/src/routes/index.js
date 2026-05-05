const homeRouter = require('./homeRouter');
const livekitRouter = require('./livekitRouter.js');
const uploadRouter = require('./uploadRouter');
const accessRouter = require('./accessRouter.js');
const { authentication } = require('../middlewares/authMiddleware.js');

function route(app) {
    app.use('/access', accessRouter);
    app.use(authentication);
    app.use('/home', homeRouter);
    app.use('/livekit', livekitRouter);
    app.use('/upload', uploadRouter);
}

module.exports = route;
