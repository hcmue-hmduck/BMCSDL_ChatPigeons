<div align="center">

[![Typing SVG](https://readme-typing-svg.demolab.com?font=Fira+Code&weight=700&size=50&pause=1000&color=00f2ff&center=true&vCenter=true&width=435&lines=CHAT+PIGEONS)](https://git.io/typing-svg)

<img src="https://img.shields.io/badge/version-1.0.0-blue?style=for-the-badge" alt="Version" />
<img src="https://img.shields.io/badge/license-ISC-green?style=for-the-badge" alt="License" />
<img src="https://img.shields.io/badge/status-Active-success?style=for-the-badge" alt="Status" />

<br/>

![Angular](https://img.shields.io/badge/Angular-DD0031?style=for-the-badge&logo=angular&logoColor=white)
![NodeJS](https://img.shields.io/badge/Node.js-339933?style=for-the-badge&logo=nodedotjs&logoColor=white)
![Express](https://img.shields.io/badge/Express.js-000000?style=for-the-badge&logo=express&logoColor=white)
![Sequelize](https://img.shields.io/badge/Sequelize-52B0E7?style=for-the-badge&logo=sequelize&logoColor=white)
![Socket.io](https://img.shields.io/badge/Socket.io-010101?style=for-the-badge&logo=socketdotio&logoColor=white)
![TailwindCSS](https://img.shields.io/badge/Tailwind_CSS-38B2AC?style=for-the-badge&logo=tailwindcss&logoColor=white)

**Ứng dụng nhắn tin và mạng xã hội thời gian thực, kết nối mọi lúc mọi nơi với kiến trúc hiện đại!**

</div>

## Cấu trúc dự án

```
ChatApps_Pigeons/
├── client/                     # Mã nguồn Angular frontend
│   ├── src/                    # Source code
│   │   ├── app/                # Angular components & services
│   │   │   ├── webComponent/   # UI components (Feed, Messages, etc.)
│   │   │   ├── services/       # API & Socket services
│   │   │   └── utils/          # Utility functions
│   │   └── assets/             # Static assets (Logos, sounds)
│   └── tailwind.config.js      # Cấu hình Tailwind CSS 4
├── server/                     # Ứng dụng Node.js backend
│   ├── src/                    # Backend source code
│   │   ├── controllers/        # Route handlers
│   │   ├── models/             # Sequelize & Mongoose models
│   │   ├── routes/             # API routing
│   │   ├── services/           # Business logic
│   │   └── configs/            # Database & app configuration (Sequelize, Redis)
│   └── server.js               # Express app entry point
└── README.md                   # File này
```

## Tính năng chính

### Bảng tin & Tương tác Xã hội
- **Infinite Scroll**: Tải bài viết mượt mà với hiệu ứng cyber-spinner và quản lý offset thông minh.
- **Chia sẻ bài viết**: Hệ thống Share Post nâng cao với cập nhật trạng thái thời gian thực.
- **Tương tác Đa tầng**: Like, comment và reply theo cấu trúc lồng nhau (nested comments).
- **Optimistic UI**: Cập nhật giao diện tức thì, không có độ trễ cho trải nghiệm người dùng tối ưu.
- **Xử lý Nội dung Xoá**: Hiển thị placeholder thông minh cho các bài viết gốc đã bị xoá bởi tác giả.

### Nhắn tin & Giao tiếp Real-time
- **Socket.io**: Giao tiếp hai chiều tốc độ cao cho tin nhắn và thông báo.
- **Trạng thái Trực tuyến**: Theo dõi danh sách bạn bè đang online/offline thời gian thực.
- **Đa phương tiện**: Hỗ trợ gửi hình ảnh, video (Cloudinary) và tệp tin đính kèm dung lượng lớn.

### Cuộc gọi Video/Audio
- **LiveKit Integration**: Tích hợp SDK LiveKit cho các cuộc gọi thoại và video nhóm ổn định, chất lượng cao.

## Công nghệ sử dụng

### Frontend Stack
- **Angular 21**: Tận dụng triệt để sức mạnh của Signals cho hiệu năng vượt trội.
- **Tailwind CSS 4**: Thiết kế giao diện theo phong cách Cyber-glassmorphism sang trọng.
- **RxJS**: Quản lý luồng dữ liệu phức tạp và tối ưu hóa các sự kiện socket.
- **SweetAlert2**: Hệ thống thông báo và modal đẹp mắt, hiện đại.

### Backend Stack
- **Node.js & Express**: Nền tảng server JavaScript mạnh mẽ và linh hoạt.
- **Sequelize & Mongoose**: Hỗ trợ cả SQL (Postgres/MSSQL) và NoSQL (MongoDB).
- **Socket.io**: Xương sống cho các tính năng thời gian thực.
- **Redis (ioredis)**: Cache và quản lý trạng thái hiệu năng cao.
- **Cloudinary**: Xử lý và lưu trữ tài nguyên đa phương tiện đám mây.

## Cài đặt chương trình

### Yêu cầu hệ thống
- **Node.js**: Phiên bản 20 trở lên.
- **Cơ sở dữ liệu**: MySQL/PostgreSQL (Sequelize) và MongoDB (Mongoose).
- **Redis Server**: Cho các tính năng nâng cao.

### 1. Cài đặt Backend (Server)
```bash
cd server
npm install
# Tạo file .env dựa trên CONFIG hướng dẫn (Database, Cloudinary, LiveKit, JWT Secrets,...)
npm run dev
```

### 2. Cài đặt Frontend (Client)
```bash
cd client
npm install
npm run start
```

Ứng dụng sẽ khả dụng tại: `http://localhost:5200`.

---

<div align="center">

Dự án này được thiết kế với chuẩn mực cao nhất về UI/UX và hiệu năng backend ^_^ 

---
</div>
