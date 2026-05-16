# Hướng dẫn Cài đặt Ứng dụng (Setup Guide)

Tài liệu này hướng dẫn chi tiết các bước để cài đặt và khởi chạy ứng dụng ChatPigeons (bao gồm Client, Server và Cơ sở dữ liệu SQL Server). Bạn có thể sử dụng nội dung này để đưa vào báo cáo môn học.

---

## 1. Yêu cầu Hệ thống (Prerequisites)

Trước khi bắt đầu, hãy đảm bảo máy tính của bạn đã cài đặt các công cụ sau:

*   **Node.js**: Phiên bản 18.x trở lên (Khuyến nghị dùng bản LTS).
*   **npm**: Trình quản lý gói đi kèm với Node.js.
*   **SQL Server**: Phiên bản 2019 trở lên (Hỗ trợ TDE và Audit). Bạn cần có quyền admin (sa) để thực hiện các cấu hình bảo mật.
*   **SQL Server Management Studio (SSMS)**: Công cụ để quản lý và chạy các script SQL.
*   **Redis**: Cần thiết cho các tính năng realtime và quản lý session/socket.

---

## 2. Cài đặt Cơ sở Dữ liệu SQL Server (Chi tiết)

Hệ thống sử dụng SQL Server làm cơ sở dữ liệu chính với các tính năng bảo mật nâng cao như Phân quyền (Least Privilege), Giám sát (Auditing), và Mã hóa (TDE). 

Hãy thực hiện theo các bước chi tiết sau đây bằng cách sử dụng SSMS:

### Bước 1: Tạo Database và Cấu trúc Bảng
*   **Mục tiêu**: Khởi tạo database và các bảng lưu trữ dữ liệu.
*   **Thực hiện**: Mở và chạy file `ScriptSQL/ChatPigeons.sql`.
*   **Chi tiết**: Script này sẽ kiểm tra nếu database `ChatPigeons` chưa tồn tại thì sẽ tạo mới. Sau đó, nó tạo các bảng cốt lõi như `users`, `conversations`, `messages`, `participants`, `calls`,... với các ràng buộc khóa ngoại và toàn vẹn dữ liệu.

### Bước 2: Cấu hình Tài khoản và Phân quyền (Security)
*   **Mục tiêu**: Áp dụng nguyên tắc đặc quyền tối thiểu (Principle of Least Privilege) cho ứng dụng.
*   **Thực hiện**: Mở và chạy file `ScriptSQL/ChatPigeonsAccount.sql`.
*   **Chi tiết**: 
    *   Tạo một Login cấp server tên là `AppLogin` với mật khẩu mạnh.
    *   Tạo một User cấp database tên là `AppUser` ánh xạ từ `AppLogin`.
    *   Tạo một Role tên là `AppRole` và thêm `AppUser` vào Role này. Ứng dụng từ backend sẽ kết nối bằng tài khoản này thay vì dùng tài khoản `sa`.

### Bước 3: Tạo các View (Khung nhìn)
*   **Mục tiêu**: Đơn giản hóa các truy vấn phức tạp và hỗ trợ phân quyền trên mức khung nhìn.
*   **Thực hiện**: Mở và chạy file `ScriptSQL/ChatPigeonsView.sql`.
*   **Chi tiết**: Tạo các view để tổng hợp thông tin hoặc che giấu các trường dữ liệu nhạy cảm nếu cần.

### Bước 4: Tạo Stored Procedures (Thủ tục lưu trữ)
*   **Mục tiêu**: Đóng gói logic xử lý dữ liệu trên database, tăng hiệu năng và bảo mật (tránh SQL Injection).
*   **Thực hiện**: Mở và chạy file `ScriptSQL/ChatPigeonsSP.sql`.
*   **Chi tiết**: Chứa các thủ tục xử lý nghiệp vụ như gửi tin nhắn, tạo nhóm, cập nhật trạng thái...

### Bước 5: Tạo Triggers (Bẫy sự kiện)
*   **Mục tiêu**: Tự động hóa các hành động kiểm tra hoặc cập nhật dữ liệu khi có sự kiện INSERT/UPDATE/DELETE.
*   **Thực hiện**: Mở và chạy file `ScriptSQL/ChatPigeonsTrigger.sql`.
*   **Chi tiết**: Tự động cập nhật thời gian `updated_at` hoặc kiểm tra các ràng buộc nghiệp vụ phức tạp.

### Bước 6: Cấu hình Giám sát (SQL Server Auditing)
*   **Mục tiêu**: Ghi lại nhật ký các hành động nhạy cảm để phục vụ việc điều tra và tuân thủ bảo mật.
*   **Thực hiện**: Mở file `ScriptSQL/ChatPigeonsAudit.sql`.
*   **LƯU Ý QUAN TRỌNG**: 
    *   Trong script có đường dẫn lưu file log: `FILEPATH = 'D:\SQLAuditLogs\'`. Bạn **BẮT BUỘC** phải tạo thư mục này trên ổ đĩa của mình hoặc sửa lại đường dẫn hợp lệ trước khi chạy script.
*   **Nội dung**: Script sẽ tạo một Server Audit và Database Audit Specification để giám sát các hành động như thay đổi cấu trúc bảng, thay đổi quyền và các thao tác INSERT/UPDATE/DELETE trên bảng `Users`.

### Bước 7: Cấu hình Mã hóa TDE (Transparent Data Encryption)
*   **Mục tiêu**: Mã hóa toàn bộ database ở mức lưu trữ vật lý (mã hóa file .mdf và .ldf) để chống rò rỉ dữ liệu khi bị mất file database.
*   **Thực hiện**: Mở file `ScriptSQL/ChatPigeonsTDE.sql`.
*   **LƯU Ý QUAN TRỌNG**:
    *   Script có bước backup certificate ra file: `FILE = 'D:\TDE_Cert_ChatPigeons.cer'`. Bạn cần đảm bảo đường dẫn này tồn tại hoặc sửa lại đường dẫn khác.
*   **Nội dung**: Tạo Master Key, Certificate và Database Encryption Key (DEK) sử dụng thuật toán AES_256, sau đó bật tính năng mã hóa cho database `ChatPigeons`.

---

## 3. Cài đặt Backend (Server)

Backend được xây dựng bằng Node.js và Express.

### Bước 1: Cài đặt Dependencies
Mở terminal, di chuyển vào thư mục `server` và chạy lệnh:
```bash
cd server
npm install
```

### Bước 2: Cấu hình Biến môi trường
1.  Sao chép file `.env.example` thành file `.env`.
2.  Mở file `.env` và điền đầy đủ các thông tin cấu hình:
    *   **SQL Server**: Điền `DB_USER=AppLogin`, `DB_PASS=YourStrongPassword123` (Mật khẩu bạn đã đặt trong file Account script), `DB_HOST=localhost`, `DB_NAME=ChatPigeons`.
    *   **Redis**: Điền `REDIS_URL`.
    *   **SSL Certificates**: Đảm bảo bạn có file `cert.key` và `cert.crt` trong thư mục `cert` ở gốc dự án (Thư mục ngang hàng với `server` và `client`). Backend sẽ sử dụng các file này để chạy giao thức HTTPS.

---

## 4. Cài đặt Frontend (Client)

Frontend được xây dựng bằng Angular.

### Bước 1: Cài đặt Dependencies
Mở một terminal mới, di chuyển vào thư mục `client` và chạy lệnh:
```bash
cd client
npm install
```

### Bước 2: Cấu hình API URL
Kiểm tra file `client/src/environments/environment.ts`. Đảm bảo biến `apiUrl` đang trỏ về đúng địa chỉ của Backend (mặc định là `https://localhost:8080`).

---

## 5. Khởi chạy Ứng dụng

Sau khi đã hoàn tất các bước cài đặt trên, bạn có thể khởi chạy ứng dụng.

### Khởi chạy Backend
Trong thư mục `server`, chạy lệnh:
```bash
npm run dev
```
*Lệnh này sẽ sử dụng `nodemon` để tự động khởi động lại server khi có thay đổi code.*

### Khởi chạy Frontend
Trong thư mục `client`, chạy lệnh:
```bash
npm run start
```
*Ứng dụng client sẽ được biên dịch và chạy. Bạn có thể truy cập vào ứng dụng qua trình duyệt theo địa chỉ được hiển thị ở terminal (thường là `https://localhost:4200` hoặc cấu hình tương đương).*

> [!NOTE]
> Do ứng dụng sử dụng HTTPS với chứng chỉ tự ký (Self-signed certificate) trong môi trường local, trình duyệt có thể cảnh báo "Kết nối không an toàn". Bạn chỉ cần chọn "Nâng cao" (Advanced) và "Tiếp tục truy cập" (Proceed to localhost).
