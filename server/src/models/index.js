// Import tất cả models
const Message = require('./messagesModel');
const Call = require('./callsModel');
const User = require('./usersModel');
const Conversation = require('./conversationsModel');
const ConversationKeysVault = require('./conversationkeysvaultModel');
const Participant = require('./participantsModel');
const PinnedMessages = require('./pinnedmessagesModel');
const Friends = require('./friendsModel');
const FriendRequest = require('./friendrequestsModel');
const UserBlock = require('./userblockModel');
const GroupJoinRequest = require('./groupjoinrequestsModel');



const Emojis = require('./emojisModel');
const MessageReaction = require('./messagereactionsModel');


// Tổng hợp tất cả models
const models = {

    Message,
    Call,
    User,
    Conversation,
    ConversationKeysVault,
    Participant,
    PinnedMessages,
    Friends,
    FriendRequest,
    UserBlock,
    GroupJoinRequest,



    Emojis,
    MessageReaction,

};

// Khởi tạo tất cả associations
Object.keys(models).forEach(modelName => {
    if (models[modelName].associate) {
        models[modelName].associate(models);
    }
});

module.exports = models;
