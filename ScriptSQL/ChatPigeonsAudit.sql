USE master;
GO

IF EXISTS (SELECT * FROM sys.server_audits WHERE name = 'ChatPigeons_Global_Audit')
BEGIN
    ALTER SERVER AUDIT [ChatPigeons_Global_Audit] WITH (STATE = OFF);
    DROP SERVER AUDIT [ChatPigeons_Global_Audit];
END
GO

-- khởi tạo server audit (định nghĩa nơi lưu trữ file nhật ký)
CREATE SERVER AUDIT [ChatPigeons_Global_Audit]
TO FILE 
(	FILEPATH = 'D:\SQLAuditLogs\' 
	,MAXSIZE = 10 MB              
	,MAX_ROLLOVER_FILES = 5       
	,RESERVE_DISK_SPACE = OFF
)
WITH (QUEUE_DELAY = 1000, ON_FAILURE = CONTINUE);
GO

-- kích hoạt đối tượng server audit
ALTER SERVER AUDIT [ChatPigeons_Global_Audit] WITH (STATE = ON);
GO

-----------------------------------------------------------------------------

USE ChatPigeons;
GO

IF EXISTS (SELECT * FROM sys.database_audit_specifications WHERE name = 'ChatPigeons_DB_Audit_Spec')
BEGIN
    ALTER DATABASE AUDIT SPECIFICATION [ChatPigeons_DB_Audit_Spec] WITH (STATE = OFF);
    DROP DATABASE AUDIT SPECIFICATION [ChatPigeons_DB_Audit_Spec];
END
GO

-- khởi tạo database audit specification
CREATE DATABASE AUDIT SPECIFICATION [ChatPigeons_DB_Audit_Spec]
FOR SERVER AUDIT [ChatPigeons_Global_Audit]
ADD (SCHEMA_OBJECT_CHANGE_GROUP),
ADD (DATABASE_OBJECT_PERMISSION_CHANGE_GROUP),
ADD (DATABASE_PRINCIPAL_CHANGE_GROUP),
ADD (INSERT, UPDATE, DELETE ON OBJECT::dbo.Users BY [public])
WITH (STATE = ON);
GO

-- câu lệnh kiểm tra nhật ký (dùng để truy xuất dữ liệu từ file audit)
SELECT 
    event_time,
    action_id,
    succeeded,
    session_server_principal_name AS [Login_Name],
    database_name,
    object_name,
    statement AS [SQL_Query]
FROM fn_get_audit_file('D:\SQLAuditLogs\*', DEFAULT, DEFAULT)
ORDER BY event_time DESC;