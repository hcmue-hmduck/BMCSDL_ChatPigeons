USE master;
GO

IF NOT EXISTS (SELECT * FROM sys.server_principals WHERE name = 'AppLogin')
BEGIN
    CREATE LOGIN AppLogin WITH PASSWORD = 'YourStrongPassword123';
END
GO

USE ChatPigeons;
GO

IF NOT EXISTS (SELECT * FROM sys.database_principals WHERE name = 'AppUser')
BEGIN
    CREATE USER AppUser FOR LOGIN AppLogin;
END
GO

IF NOT EXISTS (SELECT * FROM sys.database_principals WHERE name = 'AppRole')
BEGIN
    CREATE ROLE AppRole;
END
GO

ALTER ROLE AppRole ADD MEMBER AppUser;
GO
