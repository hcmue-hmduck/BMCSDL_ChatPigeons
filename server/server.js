const dns = require('dns');
dns.setServers(['8.8.8.8', '8.8.4.4']);

const express = require('express');
const dotenv = require('dotenv');
const cors = require('cors');
const compression = require('compression');
const path = require('path');
const Server = require('socket.io');
const models = require('./src/models/index'); // Khởi tạo tất cả associations
const fs = require('fs');
const morgan = require('morgan');
const cookieParser = require('cookie-parser');
const passport = require('./src/configs/passportConfig.js')

const { connectToDB } = require('./src/configs/dbConfig');

const http = require('http');
const https = require('https');

dotenv.config();

const routes = require('./src/routes/index');

const app = express();

let server;

if (process.env.RENDER === 'true') {
    server = http.createServer(app);
} else {
    server = https.createServer(
        {
            key: fs.readFileSync(path.join(__dirname, '../cert/cert.key')),
            cert: fs.readFileSync(path.join(__dirname, '../cert/cert.crt')),
        },
        app,
    );
}

const io = Server(server, {
    cors: {
        origin: [
            process.env.LINK_CLIENT,
            process.env.LINK_SERVER,
            process.env.LINK_CLIENT_PROD,
            process.env.LINK_SERVER_PROD,
            process.env.LINK_CLIENT_LOCAL_IP,
        ],
        methods: ['GET', 'POST'],
        credentials: true,
    },
});
const PORT = process.env.PORT || 8888;

// CORS - Cho phép Angular gọi API
app.use(
    cors({
        origin: [
            process.env.LINK_CLIENT,
            process.env.LINK_SERVER,
            process.env.LINK_CLIENT_PROD,
            process.env.LINK_SERVER_PROD,
            process.env.LINK_CLIENT_LOCAL_IP,
        ],
        credentials: true,
    }),
);

app.use(compression());
app.use(morgan('dev'));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

app.use(passport.initialize())


// Browsers often auto-request favicon; return no-content instead of triggering 404 logs.
app.get('/favicon.ico', (req, res) => {
    res.status(204).end();
});

// Map để lưu trạng thái online của users (tối ưu cho multiple devices)
const onlineUsers = new Map(); // { userId: Set<socketId> }
const socketToUser = new Map(); // { socketId: userId } - O(1) lookup
const disconnectTimeouts = new Map(); // { userId: NodeJS.Timeout }

app.set('io', io);
app.set('onlineUsers', onlineUsers);

routes(app);

io.on('connection', (socket) => {
    console.log('A user connected:', socket.id);

    // User login - set online status
    socket.on('userOnline', async (userId) => {
        // Hủy timeout thiết lập offline nếu user reconnect (reload trang)
        if (disconnectTimeouts.has(userId)) {
            clearTimeout(disconnectTimeouts.get(userId));
            disconnectTimeouts.delete(userId);
        }

        // Thêm socketId vào Set của userId
        if (!onlineUsers.has(userId)) {
            onlineUsers.set(userId, new Set());
        }
        onlineUsers.get(userId).add(socket.id);
        socketToUser.set(socket.id, userId);

        console.log(`User ${userId} is online (${onlineUsers.get(userId).size} connections)`);

        // Gửi danh sách tất cả users đang online cho user mới login
        const allOnlineUserIds = Array.from(onlineUsers.keys());
        socket.emit('onlineUsersList', allOnlineUserIds);

        // Chỉ emit nếu đây là connection đầu tiên (user mới online)
        if (onlineUsers.get(userId).size === 1) {
            // Cập nhật status thành online vào database
            try {
                await models.User.update({ status: 'online' }, { where: { id: userId } });
                console.log(`Updated status to online for user ${userId}`);
            } catch (error) {
                console.error(`Error updating status for user ${userId}:`, error);
            }

            io.emit('userStatusChanged', { userId, status: 'online' });
        }
    });

    // User join vào conversation room
    socket.on('joinConversation', async (conversationId) => {
        const userId = socketToUser.get(socket.id);
        if (!userId) return;

        try {
            // Kiểm tra xem user có phải là thành viên đang hoạt động trong cuộc hội thoại không
            const participant = await models.Participant.findOne({
                where: {
                    conversation_id: conversationId,
                    user_id: userId,
                    left_at: null
                }
            });

            if (participant) {
                socket.join(conversationId);
                console.log(`Socket ${socket.id} (User ${userId}) joined conversation ${conversationId}`);
            } else {
                console.log(`Socket ${socket.id} (User ${userId}) was rejected from conversation ${conversationId} (Not active member)`);
            }
        } catch (error) {
            console.error(`Error checking participant for joinConversation:`, error);
        }
    });

    // Thông báo cho người nhận biết có cuộc trò chuyện mới
    socket.on('notifyNewConversation', (data) => {
        const { receiverIds } = data;
        if (!Array.isArray(receiverIds)) return;
        receiverIds.forEach((receiverId) => {
            const receiverSockets = onlineUsers.get(receiverId);
            if (receiverSockets) {
                receiverSockets.forEach((socketId) => {
                    io.to(socketId).emit('newConversation', data);
                });
            } else {
                // Thử tìm kiếm theo kiểu dữ liệu khác (String/Number) để phòng trường hợp lệch kiểu giữa DB và Socket Map
                const alternateId = typeof receiverId === 'string' ? Number(receiverId) : String(receiverId);
                const altSockets = onlineUsers.get(alternateId);
                if (altSockets) {
                    altSockets.forEach((socketId) => {
                        io.to(socketId).emit('newConversation', data);
                    });
                }
            }
        });
    });

    // Nhận tin nhắn từ client và broadcast cho người khác
    socket.on('sendMessage', (data) => {
        // console.log('Received sendMessage event on server:', data);
        io.to(data.conversation_id).emit('newMessage', data);
    });

    socket.on('typing', (data) => {
        // console.log('Received typing event on server:', data);
        socket.to(data.conversation_id).emit('typing', data);
    });

    socket.on('stopTyping', (data) => {
        // console.log('Received stopTyping event on server:', data);
        socket.to(data.conversation_id).emit('stopTyping', data);
    });

    socket.on('updateConversation', (data) => {
        // console.log('Received updateConversation event on server:', data);
        io.to(data.conversation_id).emit('updateConversation', data);
    });

    // Cập nhật tin nhắn
    socket.on('updateMessage', (data) => {
        console.log('Received updateMessage event on server:', data);
        // Broadcast tới tất cả clients trong conversation (trừ người gửi)
        io.to(data.conversation_id).emit('updateMessage', data);
    });

    // Xóa tin nhắn
    socket.on('deleteMessage', (data) => {
        console.log('Received deleteMessage event on server:', data);
        // Broadcast tới tất cả clients trong conversation (trừ người gửi)
        socket.to(data.conversation_id).emit('deleteMessage', data);
    });

    // Ghim tin nhắn
    socket.on('pinMessage', (data) => {
        console.log('Received pinMessage event on server:', data);
        // Broadcast tới tất cả clients trong conversation (trừ người gửi)
        socket.to(data.conversation_id).emit('pinMessage', data);
    });

    socket.on('unpinMessage', (data) => {
        console.log('Received unpinMessage event on server:', data);
        // Broadcast tới tất cả clients trong conversation (trừ người gửi)
        socket.to(data.conversation_id).emit('unpinMessage', data);
    });

    socket.on('updateProfile', (data) => {
        console.log('Received updateProfile event on server:', data);
        io.emit('updateProfile', data);
    });

    socket.on('updateParticipant', (data) => {
       // console.log('Received updateParticipant event on server:', data);
        // Broadcast tới tất cả thành viên trong conversation room
        io.to(data.conversation_id).emit('updateParticipant', data);
    });

    socket.on('addMember', (data) => {
        console.log('Received addMember event on server:', data);
        // Broadcast tới tất cả trong phòng để cập nhật danh sách thành viên cho những người đang ở sẵn trong phòng
        io.to(data.conversation_id).emit('addMember', data);

        // Gửi tới riêng những người được thêm vào (vì họ chưa join room conversation_id nên lệnh io.to phía trên sẽ không tới họ)
        if (data.added_user_ids && Array.isArray(data.added_user_ids)) {
            data.added_user_ids.forEach(userId => {
                const userSockets = onlineUsers.get(String(userId));
                if (userSockets) {
                    userSockets.forEach(socketId => {
                        io.to(socketId).emit('addMember', data);
                    });
                }
            });
        }
    });

    socket.on('leaveGroup', (data) => {
        const { conversation_id, user_id } = data;
        
        // 1. Thông báo cho tất cả mọi người trong phòng (bao gồm các thiết bị khác của user này)
        io.to(conversation_id).emit('leaveGroup', data);

        // 2. Tìm tất cả socket của người rời nhóm để cho out khỏi phòng trên server
        const userSockets = onlineUsers.get(user_id) || onlineUsers.get(Number(user_id)) || onlineUsers.get(String(user_id));
        if (userSockets) {
            userSockets.forEach(sId => {
                const s = io.sockets.sockets.get(sId);
                if (s) {
                    s.leave(conversation_id);
                }
            });
        }
        console.log(`User ${user_id} left group ${conversation_id}`);
    });

    socket.on('disbandGroup', (data) => {
        const { conversation_id } = data;
        io.to(conversation_id).emit('disbandGroup', data);
        console.log(`Group ${conversation_id} disbanded`);
    });

    socket.on('kickMember', (data) => {
        const { conversation_id, kicked_user_id } = data;
        
        // 1. Broadcast cho mọi người trong phòng (bao gồm người bị kick) để họ cập nhật UI
        io.to(conversation_id).emit('kickMember', data);

        // 2. Sau đó mới tìm tất cả socket của người bị kick để ép rời phòng trên server
        const userSockets = onlineUsers.get(kicked_user_id) || onlineUsers.get(Number(kicked_user_id)) || onlineUsers.get(String(kicked_user_id));
        if (userSockets) {
            userSockets.forEach(sId => {
                const s = io.sockets.sockets.get(sId);
                if (s) {
                    s.leave(conversation_id);
                    console.log(`Forced socket ${sId} (User ${kicked_user_id}) to leave room ${conversation_id} (Kicked)`);
                }
            });
        }
    });

    socket.on('updateFriend', (data) => {
        console.log('Received updateFriend event on server:', data);
        io.emit('updateFriend', data);
    });

    socket.on('sendFriendRequest', (data) => {
        console.log('Received sendFriendRequest event on server:', data);
        io.emit('sendFriendRequest', data);
    })

    socket.on('cancelSentRequest', (data) => {
        console.log('Received cancelSentRequest event on server:', data);
        io.emit('cancelSentRequest', data);
    })

    socket.on('rejectFriendRequest', (data) => {
        console.log('Received rejectFriendRequest event on server:', data);
        io.emit('rejectFriendRequest', data);
    })

    socket.on('acceptFriendRequest', (data) => {
        console.log('Received acceptFriendRequest event on server:', data);
        io.emit('acceptFriendRequest', data);
    })

    socket.on('blockUser', (data) => {
        console.log('Received blockUser event on server:', data);
        io.emit('blockUser', data);
    })

    socket.on('unblockUser', (data) => {
        console.log('Received unblockUser event on server:', data);
        io.emit('unblockUser', data);
    })

    socket.on('reactionMessage', (data) => {
        console.log('Received reactionMessage event on server:', data);
        socket.to(data.conversation_id).emit('reactionMessage', data);
    })

    socket.on('newPost', (data) => {
        console.log('Received newPost event on server:', data);
        io.emit('newPost', data);
    })

    socket.on('updatePost', (data) => {
        console.log('Received updatePost event on server:', data);
        io.emit('updatePost', data);
    })

    socket.on('deletePost', (data) => {
        console.log('Received deletePost event on server:', data);
        io.emit('deletePost', data);
    })

    socket.on('newComment', (data) => {
        console.log('Received newComment event on server:', data);
        io.emit('newComment', data);
    })

    socket.on('deleteComment', (data) => {
        console.log('Received deleteComment event on server:', data);
        io.emit('deleteComment', data);
    })

    socket.on('deleteReply', (data) => {
        console.log('Received deleteReply event on server:', data);
        io.emit('deleteReply', data);
    })

    socket.on('newReaction', (data) => {
        console.log('Received newReaction event on server:', data);
        io.emit('newReaction', data);
    })

    socket.on('deleteReaction', (data) => {
        console.log('Received deleteReaction event on server:', data);
        io.emit('deleteReaction', data);
    })

    socket.on('PostReact', (data) => {
        console.log('Received PostReact event on server:', data);
        io.emit('PostReact', data);
    })

    socket.on('updateConversationInfo', (data) => {
        console.log('Received updateConversationInfo event on server:', data);
        io.to(data.conversation_id).emit('updateConversationInfo', data);
    })

    socket.on('getServerTime', () => {
        socket.emit('serverTime', { time: Date.now() });
    });

    socket.on('disconnect', async () => {
        console.log('User disconnected:', socket.id);

        const userId = socketToUser.get(socket.id);
        if (userId && onlineUsers.has(userId)) {
            onlineUsers.get(userId).delete(socket.id);
            socketToUser.delete(socket.id);

            console.log(`User ${userId} connection removed (${onlineUsers.get(userId).size} remaining)`);

            // Chỉ emit offline nếu không còn connection nào
            if (onlineUsers.get(userId).size === 0) {
                // Sử dụng setTimeout để đợi 3 giây, tránh tình trạng client reload trang bị hiển thị offline
                const timeoutId = setTimeout(async () => {
                    // Check lại nếu vẫn thật sự không có connection nào
                    if (onlineUsers.has(userId) && onlineUsers.get(userId).size === 0) {
                        onlineUsers.delete(userId);
                        disconnectTimeouts.delete(userId);

                        const lastOnlineAt = new Date();
                        // Cập nhật last_online_at vào database
                        try {
                            await models.User.update(
                                {
                                    status: 'offline',
                                    last_online_at: lastOnlineAt,
                                },
                                { where: { id: userId } },
                            );
                            console.log(`Updated last_online_at for user ${userId}`);
                        } catch (error) {
                            console.error(`Error updating last_online_at for user ${userId}:`, error);
                        }

                        io.emit('userStatusChanged', { userId, status: 'offline', last_online_at: lastOnlineAt });
                    }
                }, 3000); // Đợi 3 giây (grace period)

                disconnectTimeouts.set(userId, timeoutId);
            }
        }
    });

    // Client 1 gửi offer cho Client 2 (mời tham gia cuộc gọi 2 người)
    socket.on('directCall:newOffer', (data) => {
        const { conversationId } = data;
        socket.to(conversationId).emit('directCall:offerAwaiting', data);
        console.log('Đã gửi offer cho client 2....', conversationId);
    });

    // Client 2 gửi answer về Client 1
    socket.on('directCall:newAnswer', (data) => {
        const { conversationId } = data;
        socket.to(conversationId).emit('directCall:answerResponse', data);
        console.log('Đã gửi answer cho client 1....', conversationId);
    });

    // Client gửi ICE candidate qua đối phương
    socket.on('directCall:newIceCandidate', (data) => {
        const { conversationId, iceCandidate } = data;
        socket.to(conversationId).emit('directCall:newIceCandidate', iceCandidate);
    });

    // chuyển tiếp tín hiệu mời tham gia cuộc gọi nhóm
    socket.on('groupCall:inviteToJoinTheRoom', (data) => {
        socket.to(data.conversationId).emit('groupCall:joinRoom', data);
    });

    // chuyển tiếp tín hiệu cleanup call state
    socket.on('call:cleanUp', ({ conversationId, userId }) => {
        socket.to(conversationId).emit('call:cleanUp', userId);
    });

    // chuyển tiếp tín hiệu gác máy
    socket.on('call:hangUp', (conversationId) => {
        socket.to(conversationId).emit('call:hangUp');
    });

    // chuyển tiếp tín hiệu từ chối cuộc gọi
    socket.on('call:declined', (conversationId) => {
        socket.to(conversationId).emit('call:declined');
    });

    // chuyển tiếp tín hiệu cuộc gọi nhỡ
    socket.on('call:missed', (conversationId) => {
        socket.to(conversationId).emit('call:missed');
    });

    // đồng bộ call state giữa 2 instance
    socket.on('call:syncCallState', (data) => {
        socket.to(data.conversationId).emit('call:syncCallState', data);
    });
});

// handle error

app.use((req, res, next) => {
    const error = new Error('Not Found');
    error.status = 404;
    next(error);
});

app.use((error, req, res, next) => {
    console.error(error.stack);
    res.status(error.status || 500).json({
        message: error.message || 'Internal Server Error',
        code: error.code || 'INTERNAL_ERROR',
        errorCode: error.errorCode || ''
    });
});

connectToDB()
    .then(() => {
        server.listen(PORT, () => {
            console.log(`Server is running on port ${PORT}`);
        });
    })
    .catch((err) => {
        console.error('Failed to connect to databases:', err);
        process.exit(1);
    });