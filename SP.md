# Tài liệu SP & View cho Hệ thống Chat Pigeons

Theo yêu cầu của bạn, tôi đã tách tài liệu làm 2 phần riêng biệt: **Stored Procedures (SPs)** chuyên dùng cho Thao tác dữ liệu (Insert, Update, Delete) và **Views** chuyên dùng cho Truy vấn dữ liệu (Select).

---

## PHẦN 1: DANH SÁCH STORED PROCEDURES (Thao tác dữ liệu)

*(Giữ nguyên toàn bộ nội dung và logic bảo mật của bạn ở các mục 1, 2, 3, 4, 5)*

### 1. Nhóm SP Quản lý tài khoản & Xác thực (Auth & Profile)
sp_RegisterUser: Nhận tham số email và password_hash (đã băm từ client/server). Không bao giờ nhận password rõ.
sp_UpdateProfile: Cho phép cập nhật full_name, bio, avatar_url. Ràng buộc: Chỉ cập nhật đúng dòng có id trùng với ID của người đang đăng nhập.
sp_UpdatePrivacySettings: Cho phép người dùng tùy chỉnh ai được nhắn tin, ai thấy trạng thái online. (Đoé làm)

### 2. Nhóm SP Quản lý tin nhắn (Messaging - Cốt lõi của E2EE)
Lưu ý bảo mật quan trọng: Các SP trong nhóm này tuyệt đối chỉ nhận chuỗi mã hóa (Ciphertext) cho nội dung tin nhắn, tuân thủ nguyên tắc "CSDL không biết người dùng chat gì".
sp_SendMessage: Thêm tin nhắn mới.
Logic bảo mật: Kiểm tra xem sender_id có bị receiver_id chặn (bảng UserBlocks) hay không. Nếu có, từ chối INSERT.
sp_EditMessage: Cập nhật lại cột content (bản mã mới) và đổi cờ is_edited = TRUE.
Logic bảo mật: Tham số truyền vào phải có @sender_id. Lệnh UPDATE phải có điều kiện WHERE id = @message_id AND sender_id = @sender_id để ngăn chặn hacker gọi API sửa tin nhắn của người khác.
sp_RevokeMessage (Thu hồi tin nhắn):
Logic bảo mật: Áp dụng "Soft Delete". Thay vì dùng lệnh DELETE, SP này chạy lệnh UPDATE messages SET is_deleted = TRUE, deleted_for_all = TRUE WHERE id = @message_id AND sender_id = @sender_id.

### 3. Nhóm SP Quản trị nhóm chat (Group Conversations & RBAC)
sp_CreateGroupConversation: Tạo nhóm mới, tự động gán người tạo làm owner trong bảng Participants.
sp_AddGroupMember: Thêm thành viên mới.
Logic bảo mật: Query kiểm tra role của người mời trong bảng Participants. Chỉ cho phép thực thi INSERT nếu người mời là owner hoặc admin.
sp_KickGroupMember: Xóa thành viên.
Logic bảo mật: Tương tự, kiểm tra quyền. Đảm bảo member không thể kích admin.
sp_ChangeMemberRole: Trưởng nhóm thăng cấp/giáng cấp phó nhóm.

### 4. Nhóm SP Tương tác & Tiện ích
sp_PinMessage: Ghim tin nhắn. Cần tham gia logic RBAC để xem người ghim có quyền trong nhóm hay không trước khi INSERT vào bảng PinnedMessages.
sp_LogCallHistory: Lưu lại siêu dữ liệu cuộc gọi (thời lượng, thời gian bắt đầu/kết thúc) vào bảng Calls. Chỉ lưu metadata, không lưu nội dung.
sp_BlockUser: Thêm bản ghi vào bảng UserBlocks để chặn người dùng.

### 5. Nhóm SP Dành riêng cho Quản trị viên hệ thống (System Admin)
sp_AdminLockAccount / sp_AdminUnlockAccount: Thay đổi trạng thái is_active của User.
Logic bảo mật bổ sung: Bên trong SP này có thể gọi thêm một lệnh INSERT INTO Audit_Log để ghi nhận lại nhật ký kiểm toán (như lý thuyết Auditing ở mục 2.2.5). Đéo biết làm =))

---

### Bổ sung các SP Thao tác từ Code (Của tôi thêm vào):

sp_CreateDirectConversation: Tạo cuộc trò chuyện 2 người.
Logic: Tạo conversation mới type = 'direct' và thêm 2 bản ghi vào bảng participants.

sp_UpdateConversation: Cập nhật thông tin hội thoại.
Logic: Cập nhật tên nhóm hoặc ảnh đại diện của nhóm trong bảng conversations.

sp_DeleteConversation: Xóa cuộc trò chuyện.
Logic: Cập nhật trạng thái is_active = FALSE hoặc xóa bản ghi trong bảng conversations.

sp_CreateParticipant: Thêm thành viên vào cuộc trò chuyện.
Logic: Thêm bản ghi mới vào bảng participants với user_id và conversation_id.

sp_CreateFriendRequest: Gửi lời mời kết bạn.
Logic: Thêm bản ghi vào bảng friend_requests với status là 'pending'.

sp_UpdateFriendRequestStatus: Chấp nhận hoặc từ chối kết bạn.
Logic: Cập nhật status trong bảng friend_requests. Nếu accepted thì thêm bản ghi vào bảng friends cho cả 2 phía.

sp_DeleteFriend: Hủy kết bạn.
Logic: Xóa các bản ghi liên quan trong bảng friends cho cả 2 phía.

sp_AddMessageReaction: Thả cảm xúc (emoji) vào tin nhắn.
Logic: INSERT vào bảng message_reactions.

sp_RemoveMessageReaction: Gỡ cảm xúc khỏi tin nhắn.
Logic: DELETE từ bảng message_reactions theo reaction_id hoặc (message_id AND user_id).

sp_UnpinMessage: Bỏ ghim tin nhắn trong nhóm.
Logic: DELETE từ bảng pinned_messages WHERE message_id = @message_id.

sp_UpdateParticipant: Cập nhật cài đặt của thành viên trong phòng chat (nick_name, is_muted, last_read_message_id).
Logic: UPDATE bảng participants WHERE id = @participant_id.

sp_CreateGroupJoinRequest: Gửi yêu cầu tham gia nhóm.
Logic: Thêm bản ghi vào bảng group_join_requests với status 'pending'.

sp_UpdateGroupJoinRequestStatus: Duyệt hoặc từ chối yêu cầu tham gia nhóm.
Logic: Cập nhật status trong group_join_requests. Nếu duyệt thì thêm user vào bảng participants.

sp_UnblockUser: Bỏ chặn người dùng.
Logic: DELETE từ bảng user_blocks WHERE blocker_id = @blocker_id AND blocked_id = @blocked_id.

sp_StartCall: Khởi tạo cuộc gọi.
Logic: INSERT vào bảng calls với trạng thái 'ringing' hoặc 'started'.

sp_UpdateCallStatus: Cập nhật trạng thái cuộc gọi.
Logic: UPDATE bảng calls SET status = @status, ended_at = NOW() (nếu kết thúc).

sp_UpdateUserStatus: Cập nhật trạng thái hoạt động (Online/Offline).
Logic: UPDATE bảng users SET status = @status WHERE id = @user_id.

sp_UpdateFriend: Cập nhật ghi chú hoặc trạng thái yêu thích của bạn bè.
Logic: UPDATE bảng friends SET notes = @notes, is_favorite = @is_favorite WHERE user_id = @user_id AND friend_id = @friend_id.

---

## PHẦN 2: DANH SÁCH VIEWS (Truy vấn dữ liệu)

> [!NOTE]
> Vì View trong SQL không nhận tham số trực tiếp như SP, nên khi gọi View từ code, bạn sẽ dùng lệnh SELECT kết hợp với mệnh đề `WHERE` để lọc dữ liệu theo nhu cầu (ví dụ: `SELECT * FROM vw_GetMessages WHERE conversation_id = @id`).

vw_GetConversations: Lấy danh sách cuộc trò chuyện.
Logic: SELECT JOIN bảng conversations và participants để lấy danh sách các phòng chat mà user tham gia.

vw_GetMessages: Lấy danh sách tin nhắn trong một cuộc trò chuyện.
Logic: SELECT từ bảng messages ORDER BY created_at DESC (Code sẽ tự thêm LIMIT/OFFSET).

vw_GetUnreadMessages: Lấy danh sách các tin nhắn chưa đọc.
Logic: SELECT từ bảng messages JOIN participants để so sánh created_at với last_read_message_id.

vw_CountUnreadMessages: Đếm số tin nhắn chưa đọc của user.
Logic: SELECT COUNT từ bảng messages lớn hơn mốc đã đọc.

vw_GetHomeMessagesMedia: Lấy tất cả file, ảnh, media trong cuộc trò chuyện.
Logic: SELECT từ bảng messages WHERE message_type IN ('image', 'file', 'video').

vw_GetFriendRequests: Lấy danh sách lời mời kết bạn đã nhận (Đang chờ xử lý).
Logic: SELECT từ bảng friend_requests WHERE status = 'pending'.

vw_GetSentFriendRequests: Lấy danh sách lời mời kết bạn đã gửi.
Logic: SELECT từ bảng friend_requests.

vw_GetFriends: Lấy danh sách bạn bè của User.
Logic: SELECT từ bảng friends JOIN với bảng users để lấy thông tin bạn bè.

vw_GetMessageReactions: Lấy danh sách cảm xúc của các tin nhắn.
Logic: SELECT từ bảng message_reactions.

vw_GetPinnedMessages: Lấy danh sách tin nhắn đã ghim của cuộc trò chuyện.
Logic: SELECT từ bảng pinned_messages JOIN messages.

vw_GetParticipants: Lấy danh sách thành viên của cuộc trò chuyện.
Logic: SELECT từ bảng participants JOIN users.

vw_GetGroupJoinRequests: Lấy danh sách yêu cầu tham gia nhóm.
Logic: SELECT từ bảng group_join_requests.

vw_GetBlockedUsers: Lấy danh sách người dùng đã chặn.
Logic: SELECT từ bảng user_blocks.

vw_SearchUsersAndGroups: Tìm kiếm người dùng và nhóm.
Logic: SELECT UNION từ bảng users và conversations (type='group').

vw_GetUsersByIds: Lấy thông tin chi tiết của nhiều người dùng cùng lúc.
Logic: SELECT từ bảng users. (Dùng `WHERE id IN (...)` khi gọi).
