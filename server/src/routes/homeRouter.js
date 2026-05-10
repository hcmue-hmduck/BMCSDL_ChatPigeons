const express = require('express');
const router = express.Router();

const homeConversationRouter = require('./homeConversationsRouter');
const homeMessagesRouter = require('./homeMessagesRouter');
const messageReactionsRouter = require('./message_reactionsRouter');
const friendrequestsRouter = require('./friend_requestsRouter');

const emojiRouter = require ('./emojiRouter');

const userblocksRouter = require('./user_blocksRouter');
const pinmessageRouter = require('./pin_messageRouter');
const usersRouter = require('./usersRouter');
const linkPreviewRouter = require('./link_previewRouter');
const participantsRouter = require('./participantsRouter');
const friendRouter = require('./friendRouter');
const searchRouter = require('./searchRouter');
const callRouter = require('./callRouter');

router.use('/userinfor', usersRouter);

router.use('/conversation', homeConversationRouter);
router.use('/message-reactions', messageReactionsRouter);
router.use('/friendrequests', friendrequestsRouter);

router.use('/emojis', emojiRouter);

router.use('/userblocks', userblocksRouter);
router.use('/pinmessage', pinmessageRouter);
router.use('/messages', homeMessagesRouter);
router.use('/link-preview', linkPreviewRouter);
router.use('/participants', participantsRouter);
router.use('/friends', friendRouter);
router.use('/search', searchRouter);
router.use('/call', callRouter);

module.exports = router;
