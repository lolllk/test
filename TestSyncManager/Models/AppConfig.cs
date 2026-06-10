using System;
using System.Collections.Generic;

namespace TestSyncManager.Models
{
    public class AppConfig
    {
        public string LocalDatabasePath { get; set; } = "";
        public string OnlineServerUrl { get; set; } = "";
        public string OnlineApiKey { get; set; } = "";
        public int LocalServerPort { get; set; } = 3000;
        public string WebsitePath { get; set; } = "";
        public bool IsOfflineMode { get; set; } = true;
        public DateTime? LastSyncDate { get; set; }

        public SyncSettings SyncSettings { get; set; } = new SyncSettings();

        public TeacherCredentials? TeacherCredentials { get; set; }
    }

    public class SyncSettings
    {
        public bool SyncDisciplines { get; set; } = true;
        public bool SyncTopics { get; set; } = true;
        public bool SyncTests { get; set; } = true;
        public bool SyncQuestions { get; set; } = true;
        public bool SyncResults { get; set; } = true;
        public bool SyncStudents { get; set; } = false;

        public SyncDirection Direction { get; set; } = SyncDirection.Both;

        public bool AutoSyncEnabled { get; set; } = false;
        public int AutoSyncIntervalSeconds { get; set; } = 30;
    }

    public enum SyncDirection
    {
        Both,
        Upload,
        Download
    }

    public class TeacherCredentials
    {
        public string Id { get; set; } = "";
        public string Email { get; set; } = "";
        public string Name { get; set; } = "";
        public string PasswordHash { get; set; } = "";
    }

    public class SyncStatus
    {
        public bool IsRunning { get; set; }
        public int Progress { get; set; }
        public string CurrentOperation { get; set; } = "";
        public int TotalRecords { get; set; }
        public int ProcessedRecords { get; set; }
        public int UploadedRecords { get; set; }
        public int DownloadedRecords { get; set; }
        public int ConflictsResolved { get; set; }
        public List<string> Errors { get; set; } = new();
        public List<string> Log { get; set; } = new();
    }

    public class ServerStatus
    {
        public bool IsRunning { get; set; }
        public int Port { get; set; }
        public int? ProcessId { get; set; }
        public DateTime? StartTime { get; set; }
        public string StatusText => IsRunning ? $"Запущен на порту {Port}" : "Остановлен";
    }
}
