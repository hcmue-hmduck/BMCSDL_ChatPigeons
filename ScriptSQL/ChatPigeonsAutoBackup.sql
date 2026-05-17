USE msdb;
GO

EXEC sp_add_job
    @job_name = N'AutoBackup_ChatPigeons_Monday_0AM';
GO

EXEC sp_add_jobstep
    @job_name = N'AutoBackup_ChatPigeons_Monday_0AM',
    @step_name = N'Full Backup ChatPigeons',
    @subsystem = N'TSQL',
    @database_name = N'ChatPigeons',
    @command = N'
DECLARE @FileName NVARCHAR(260);

SET @FileName = N''D:\SQLBackup\ChatPigeons_FULL_'' 
    + CONVERT(CHAR(8), GETDATE(), 112)
    + N''_''
    + REPLACE(CONVERT(CHAR(8), GETDATE(), 108), '':'', '''')
    + N''.bak'';

BACKUP DATABASE [ChatPigeons]
TO DISK = @FileName
WITH FORMAT, INIT, NAME = N''Full Backup ChatPigeons'';
';
GO

EXEC sp_add_schedule
    @schedule_name = N'Every_Monday_0AM',
    @freq_type = 8,              -- weekly
    @freq_interval = 2,          -- Monday
    @freq_recurrence_factor = 1, -- every week
    @active_start_time = 000000; -- 00:00:00
GO

EXEC sp_attach_schedule
    @job_name = N'AutoBackup_ChatPigeons_Monday_0AM',
    @schedule_name = N'Every_Monday_0AM';
GO

EXEC sp_add_jobserver
    @job_name = N'AutoBackup_ChatPigeons_Monday_0AM';
GO


-- Xóa job nếu không cần thiết nữa
-- EXEC msdb.dbo.sp_delete_job @job_name = N'AutoBackup_ChatPigeons_Monday_0AM';