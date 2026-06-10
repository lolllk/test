using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Net.Http;
using System.Runtime.CompilerServices;
using System.Security.Cryptography;
using System.Text;
using System.Threading.Tasks;
using System.Windows;
using System.Windows.Input;
using System.Windows.Threading;
using Microsoft.Data.Sqlite;
using Microsoft.Win32;
using Newtonsoft.Json;
using TestSyncManager.Models;

namespace TestSyncManager.ViewModels
{
    public class MainViewModel : BaseViewModel
    {
        private AppConfig _config;
        private Process? _serverProcess;
        private const string ConfigPath = "appsettings.json";
        private static readonly HttpClient _httpClient = new() { Timeout = TimeSpan.FromSeconds(15) };
        private DispatcherTimer? _autoSyncTimer;

        public MainViewModel()
        {
            _config = LoadConfig();
            _serverStatus = new ServerStatus();

            BrowseLocalDatabaseCommand = new RelayCommand(BrowseLocalDatabase);
            CreateLocalDatabaseCommand = new RelayCommand(CreateLocalDatabase);
            RecreateDatabaseCommand = new RelayCommand(RecreateDatabase);
            BrowseWebsitePathCommand = new RelayCommand(BrowseWebsitePath);
            StartServerCommand = new RelayCommand(StartServer, () => !ServerStatus.IsRunning && HasLocalDatabase);
            StopServerCommand = new RelayCommand(StopServer, () => ServerStatus.IsRunning);
            OpenInBrowserCommand = new RelayCommand(OpenInBrowser, () => ServerStatus.IsRunning);
            TestOnlineConnectionCommand = new RelayCommand(TestOnlineConnection);
            SyncCommand = new RelayCommand(DoSync);
            ShowRegisterTeacherDialogCommand = new RelayCommand(ShowRegisterTeacherDialog);
            LogoutTeacherCommand = new RelayCommand(LogoutTeacher, () => HasTeacherAccount);

            InitAutoSyncTimer();
        }

        private void InitAutoSyncTimer()
        {
            _autoSyncTimer = new DispatcherTimer();
            _autoSyncTimer.Tick += (_, _) =>
            {
                if (!IsSyncing && CanSync)
                    DoSync();
            };
            ApplyAutoSyncTimer();
        }

        private void ApplyAutoSyncTimer()
        {
            if (_autoSyncTimer == null) return;
            _autoSyncTimer.Stop();
            if (AutoSyncEnabled && AutoSyncIntervalSeconds >= 5)
            {
                _autoSyncTimer.Interval = TimeSpan.FromSeconds(AutoSyncIntervalSeconds);
                _autoSyncTimer.Start();
            }
        }

        public void Shutdown()
        {
            _autoSyncTimer?.Stop();
            StopServer();
        }

        #region Properties

        public string TeacherName => _config.TeacherCredentials != null
            ? "\u041F\u0440\u0435\u043F\u043E\u0434\u0430\u0432\u0430\u0442\u0435\u043B\u044C: " + _config.TeacherCredentials.Name
            : "\u041F\u0440\u0435\u043F\u043E\u0434\u0430\u0432\u0430\u0442\u0435\u043B\u044C \u043D\u0435 \u0437\u0430\u0440\u0435\u0433\u0438\u0441\u0442\u0440\u0438\u0440\u043E\u0432\u0430\u043D";

        public string LocalDatabasePath
        {
            get => _config.LocalDatabasePath;
            set { _config.LocalDatabasePath = value; OnPropertyChanged(); OnPropertyChanged(nameof(HasLocalDatabase)); SaveConfig(); }
        }

        public bool HasLocalDatabase => !string.IsNullOrEmpty(LocalDatabasePath) && File.Exists(LocalDatabasePath);
        public bool HasTeacherAccount => _config.TeacherCredentials != null;

        public string WebsitePath
        {
            get => _config.WebsitePath;
            set { _config.WebsitePath = value; OnPropertyChanged(); SaveConfig(); }
        }

        public int LocalServerPort
        {
            get => _config.LocalServerPort;
            set { _config.LocalServerPort = value; OnPropertyChanged(); SaveConfig(); }
        }

        public bool IsOfflineMode
        {
            get => _config.IsOfflineMode;
            set { _config.IsOfflineMode = value; OnPropertyChanged(); OnPropertyChanged(nameof(IsOnlineMode)); SaveConfig(); }
        }

        public bool IsOnlineMode
        {
            get => !_config.IsOfflineMode;
            set { _config.IsOfflineMode = !value; OnPropertyChanged(); OnPropertyChanged(nameof(IsOfflineMode)); SaveConfig(); }
        }

        public string OnlineServerUrl
        {
            get => _config.OnlineServerUrl ?? "";
            set { _config.OnlineServerUrl = value; OnPropertyChanged(); SaveConfig(); }
        }

        public string OnlineApiKey
        {
            get => _config.OnlineApiKey ?? "";
            set { _config.OnlineApiKey = value; OnPropertyChanged(); SaveConfig(); }
        }

        private ServerStatus _serverStatus;
        public ServerStatus ServerStatus
        {
            get => _serverStatus;
            set { _serverStatus = value; OnPropertyChanged(); }
        }

        public string LocalServerAddress => ServerStatus.IsRunning ? "http://localhost:" + ServerStatus.Port : "";

        public bool SyncDisciplines { get => _config.SyncSettings.SyncDisciplines; set { _config.SyncSettings.SyncDisciplines = value; OnPropertyChanged(); SaveConfig(); } }
        public bool SyncTopics { get => _config.SyncSettings.SyncTopics; set { _config.SyncSettings.SyncTopics = value; OnPropertyChanged(); SaveConfig(); } }
        public bool SyncTests { get => _config.SyncSettings.SyncTests; set { _config.SyncSettings.SyncTests = value; OnPropertyChanged(); SaveConfig(); } }
        public bool SyncQuestions { get => _config.SyncSettings.SyncQuestions; set { _config.SyncSettings.SyncQuestions = value; OnPropertyChanged(); SaveConfig(); } }
        public bool SyncResults { get => _config.SyncSettings.SyncResults; set { _config.SyncSettings.SyncResults = value; OnPropertyChanged(); SaveConfig(); } }
        public bool SyncStudents { get => _config.SyncSettings.SyncStudents; set { _config.SyncSettings.SyncStudents = value; OnPropertyChanged(); SaveConfig(); } }
        public bool AutoSyncEnabled
        {
            get => _config.SyncSettings.AutoSyncEnabled;
            set { _config.SyncSettings.AutoSyncEnabled = value; OnPropertyChanged(); SaveConfig(); ApplyAutoSyncTimer(); }
        }

        public int AutoSyncIntervalSeconds
        {
            get => _config.SyncSettings.AutoSyncIntervalSeconds;
            set { _config.SyncSettings.AutoSyncIntervalSeconds = value; OnPropertyChanged(); SaveConfig(); ApplyAutoSyncTimer(); }
        }

        public SyncDirection SyncDirection
        {
            get => _config.SyncSettings.Direction;
            set { _config.SyncSettings.Direction = value; OnPropertyChanged(); SaveConfig(); }
        }

        private bool _isSyncing;
        public bool IsSyncing { get => _isSyncing; set { _isSyncing = value; OnPropertyChanged(); } }

        private int _syncProgress;
        public int SyncProgress { get => _syncProgress; set { _syncProgress = value; OnPropertyChanged(); } }

        private string _syncStatusText = "";
        public string SyncStatusText { get => _syncStatusText; set { _syncStatusText = value; OnPropertyChanged(); } }

        private string _syncLog = "";
        public string SyncLog { get => _syncLog; set { _syncLog = value; OnPropertyChanged(); } }

        public bool CanSync => HasLocalDatabase && !string.IsNullOrEmpty(OnlineServerUrl) && !IsSyncing;

        public string LastSyncText => _config.LastSyncDate.HasValue
            ? "\u041F\u043E\u0441\u043B\u0435\u0434\u043D\u044F\u044F: " + _config.LastSyncDate.Value.ToString("dd.MM.yyyy HH:mm")
            : "\u0415\u0449\u0451 \u043D\u0435 \u0432\u044B\u043F\u043E\u043B\u043D\u044F\u043B\u0430\u0441\u044C";

        private string _statusMessage = "\u0413\u043E\u0442\u043E\u0432\u043E";
        public string StatusMessage { get => _statusMessage; set { _statusMessage = value; OnPropertyChanged(); } }

        private bool _isBusy;
        public bool IsBusy { get => _isBusy; set { _isBusy = value; OnPropertyChanged(); } }

        #endregion

        #region Commands

        public ICommand BrowseLocalDatabaseCommand { get; }
        public ICommand CreateLocalDatabaseCommand { get; }
        public ICommand RecreateDatabaseCommand { get; }
        public ICommand BrowseWebsitePathCommand { get; }
        public ICommand StartServerCommand { get; }
        public ICommand StopServerCommand { get; }
        public ICommand OpenInBrowserCommand { get; }
        public ICommand TestOnlineConnectionCommand { get; }
        public ICommand SyncCommand { get; }
        public ICommand ShowRegisterTeacherDialogCommand { get; }
        public ICommand LogoutTeacherCommand { get; }

        #endregion

        #region Database

        private void BrowseLocalDatabase()
        {
            var dialog = new OpenFileDialog
            {
                Filter = "SQLite Database (*.db;*.sqlite)|*.db;*.sqlite|All files (*.*)|*.*",
                Title = "\u0412\u044B\u0431\u0435\u0440\u0438\u0442\u0435 \u0444\u0430\u0439\u043B \u0431\u0430\u0437\u044B \u0434\u0430\u043D\u043D\u044B\u0445"
            };
            if (dialog.ShowDialog() == true)
            {
                LocalDatabasePath = dialog.FileName;
                StatusMessage = "\u0411\u0430\u0437\u0430 \u0434\u0430\u043D\u043D\u044B\u0445 \u0432\u044B\u0431\u0440\u0430\u043D\u0430: " + Path.GetFileName(dialog.FileName);
            }
        }

        private void CreateLocalDatabase()
        {
            var dialog = new SaveFileDialog
            {
                Filter = "SQLite Database (*.db)|*.db",
                FileName = "test_system.db",
                Title = "\u0421\u043E\u0437\u0434\u0430\u0442\u044C \u043D\u043E\u0432\u0443\u044E \u0431\u0430\u0437\u0443 \u0434\u0430\u043D\u043D\u044B\u0445"
            };
            if (dialog.ShowDialog() == true)
            {
                try
                {
                    InitializeDatabase(dialog.FileName);
                    LocalDatabasePath = dialog.FileName;
                    StatusMessage = "\u0411\u0430\u0437\u0430 \u0434\u0430\u043D\u043D\u044B\u0445 \u0441\u043E\u0437\u0434\u0430\u043D\u0430: " + Path.GetFileName(dialog.FileName);
                    MessageBox.Show("\u0411\u0430\u0437\u0430 \u0434\u0430\u043D\u043D\u044B\u0445 \u0443\u0441\u043F\u0435\u0448\u043D\u043E \u0441\u043E\u0437\u0434\u0430\u043D\u0430!", "\u0423\u0441\u043F\u0435\u0445", MessageBoxButton.OK, MessageBoxImage.Information);
                }
                catch (Exception ex)
                {
                    MessageBox.Show("\u041E\u0448\u0438\u0431\u043A\u0430 \u0441\u043E\u0437\u0434\u0430\u043D\u0438\u044F \u0431\u0430\u0437\u044B \u0434\u0430\u043D\u043D\u044B\u0445:\n" + ex.Message, "\u041E\u0448\u0438\u0431\u043A\u0430", MessageBoxButton.OK, MessageBoxImage.Error);
                }
            }
        }

        private void RecreateDatabase()
        {
            if (!HasLocalDatabase)
            {
                MessageBox.Show("\u0424\u0430\u0439\u043B \u0431\u0430\u0437\u044B \u0434\u0430\u043D\u043D\u044B\u0445 \u043D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D.", "\u041E\u0448\u0438\u0431\u043A\u0430", MessageBoxButton.OK, MessageBoxImage.Warning);
                return;
            }

            var result = MessageBox.Show(
                "\u0412\u0441\u0435 \u0434\u0430\u043D\u043D\u044B\u0435 \u0432 \u0431\u0430\u0437\u0435 \u0431\u0443\u0434\u0443\u0442 \u0423\u0414\u0410\u041B\u0415\u041D\u042B \u0438 \u0431\u0430\u0437\u0430 \u0431\u0443\u0434\u0435\u0442 \u0441\u043E\u0437\u0434\u0430\u043D\u0430 \u0437\u0430\u043D\u043E\u0432\u043E!\n\n\u042D\u0442\u043E \u0434\u0435\u0439\u0441\u0442\u0432\u0438\u0435 \u043D\u0435\u043E\u0431\u0440\u0430\u0442\u0438\u043C\u043E. \u041F\u0440\u043E\u0434\u043E\u043B\u0436\u0438\u0442\u044C?",
                "\u041F\u0435\u0440\u0435\u0441\u043E\u0437\u0434\u0430\u043D\u0438\u0435 \u0431\u0430\u0437\u044B \u0434\u0430\u043D\u043D\u044B\u0445",
                MessageBoxButton.YesNo,
                MessageBoxImage.Warning);

            if (result != MessageBoxResult.Yes) return;

            try
            {
                var dbPath = LocalDatabasePath;

                SqliteConnection.ClearAllPools();

                if (File.Exists(dbPath))
                    File.Delete(dbPath);

                var walFile = dbPath + "-wal";
                var shmFile = dbPath + "-shm";
                if (File.Exists(walFile)) File.Delete(walFile);
                if (File.Exists(shmFile)) File.Delete(shmFile);

                InitializeDatabase(dbPath);

                if (_config.TeacherCredentials != null)
                {
                    try { RegisterTeacherInDb(dbPath, _config.TeacherCredentials); } catch { }
                }

                OnPropertyChanged(nameof(HasLocalDatabase));
                StatusMessage = "\u0411\u0430\u0437\u0430 \u0434\u0430\u043D\u043D\u044B\u0445 \u043F\u0435\u0440\u0435\u0441\u043E\u0437\u0434\u0430\u043D\u0430: " + Path.GetFileName(dbPath);
                MessageBox.Show("\u0411\u0430\u0437\u0430 \u0434\u0430\u043D\u043D\u044B\u0445 \u0443\u0441\u043F\u0435\u0448\u043D\u043E \u043F\u0435\u0440\u0435\u0441\u043E\u0437\u0434\u0430\u043D\u0430!", "\u0423\u0441\u043F\u0435\u0445", MessageBoxButton.OK, MessageBoxImage.Information);
            }
            catch (Exception ex)
            {
                MessageBox.Show("\u041E\u0448\u0438\u0431\u043A\u0430 \u043F\u0435\u0440\u0435\u0441\u043E\u0437\u0434\u0430\u043D\u0438\u044F \u0431\u0430\u0437\u044B \u0434\u0430\u043D\u043D\u044B\u0445:\n" + ex.Message, "\u041E\u0448\u0438\u0431\u043A\u0430", MessageBoxButton.OK, MessageBoxImage.Error);
            }
        }

        private void InitializeDatabase(string dbPath)
        {
            var dir = Path.GetDirectoryName(dbPath);
            if (!string.IsNullOrEmpty(dir) && !Directory.Exists(dir))
                Directory.CreateDirectory(dir);

            using var connection = new SqliteConnection("Data Source=" + dbPath);
            connection.Open();

            using var pragmaCmd = connection.CreateCommand();
            pragmaCmd.CommandText = "PRAGMA journal_mode=DELETE; PRAGMA foreign_keys=ON;";
            pragmaCmd.ExecuteNonQuery();

            var schemaSql = GetDatabaseSchema();
            foreach (var statement in SplitSqlStatements(schemaSql))
            {
                if (string.IsNullOrWhiteSpace(statement)) continue;
                using var stmtCmd = connection.CreateCommand();
                stmtCmd.CommandText = statement;
                stmtCmd.ExecuteNonQuery();
            }
        }

        private static string[] SplitSqlStatements(string sql)
        {
            var statements = new System.Collections.Generic.List<string>();
            var sb = new StringBuilder();
            int parenDepth = 0;
            foreach (var ch in sql)
            {
                if (ch == '(') parenDepth++;
                else if (ch == ')') parenDepth--;
                else if (ch == ';' && parenDepth <= 0)
                {
                    var stmt = sb.ToString().Trim();
                    if (!string.IsNullOrEmpty(stmt))
                        statements.Add(stmt + ";");
                    sb.Clear();
                    continue;
                }
                sb.Append(ch);
            }
            var last = sb.ToString().Trim();
            if (!string.IsNullOrEmpty(last))
                statements.Add(last);
            return statements.ToArray();
        }

        private void RegisterTeacherInDb(string dbPath, TeacherCredentials creds)
        {
            using var connection = new SqliteConnection("Data Source=" + dbPath);
            connection.Open();
            using var cmd = connection.CreateCommand();
            cmd.CommandText = @"INSERT INTO users (id, email, name, role, password_hash, created_at, updated_at) 
                VALUES (@id, @email, @name, 'teacher', @hash, strftime('%s','now'), strftime('%s','now'))
                ON CONFLICT(email) DO UPDATE SET name=excluded.name, password_hash=excluded.password_hash, updated_at=strftime('%s','now')";
            cmd.Parameters.AddWithValue("@id", creds.Id);
            cmd.Parameters.AddWithValue("@email", creds.Email);
            cmd.Parameters.AddWithValue("@name", creds.Name);
            cmd.Parameters.AddWithValue("@hash", creds.PasswordHash);
            cmd.ExecuteNonQuery();
        }

        private static string GetDatabaseSchema()
        {
            return @"
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT, description TEXT, updated_at INTEGER DEFAULT (strftime('%s', 'now')));
INSERT OR IGNORE INTO settings (key, value, description) VALUES ('app_mode', 'offline', 'mode');
INSERT OR IGNORE INTO settings (key, value, description) VALUES ('port', '3000', 'port');
INSERT OR IGNORE INTO settings (key, value, description) VALUES ('sync_enabled', '0', 'sync');
INSERT OR IGNORE INTO settings (key, value, description) VALUES ('sync_interval', '300', 'interval');
INSERT OR IGNORE INTO settings (key, value, description) VALUES ('sync_url', '', 'sync_url');
INSERT OR IGNORE INTO settings (key, value, description) VALUES ('last_sync', '', 'last_sync');
INSERT OR IGNORE INTO settings (key, value, description) VALUES ('google_enabled', '0', 'google');

CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, email TEXT UNIQUE, name TEXT NOT NULL, role TEXT NOT NULL CHECK(role IN ('student', 'teacher')), password_hash TEXT, google_id TEXT UNIQUE, avatar_url TEXT, sync_status TEXT DEFAULT 'local' CHECK(sync_status IN ('local', 'synced', 'pending', 'conflict')), remote_id TEXT, created_offline INTEGER DEFAULT 0, last_sync_at INTEGER, created_at INTEGER DEFAULT (strftime('%s', 'now')), updated_at INTEGER DEFAULT (strftime('%s', 'now')), is_deleted INTEGER DEFAULT 0);
CREATE INDEX IF NOT EXISTS idx_users_sync_status ON users(sync_status);
CREATE INDEX IF NOT EXISTS idx_users_remote_id ON users(remote_id);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_google_id ON users(google_id);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);

CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, token TEXT UNIQUE NOT NULL, expires_at INTEGER NOT NULL, created_at INTEGER DEFAULT (strftime('%s', 'now')), FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE);
CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token);
CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);

CREATE TABLE IF NOT EXISTS disciplines (id TEXT PRIMARY KEY, title TEXT NOT NULL, description TEXT, created_by TEXT, created_at INTEGER DEFAULT (strftime('%s', 'now')), updated_at INTEGER DEFAULT (strftime('%s', 'now')), is_deleted INTEGER DEFAULT 0, FOREIGN KEY (created_by) REFERENCES users(id));

CREATE TABLE IF NOT EXISTS topics (id TEXT PRIMARY KEY, discipline_id TEXT NOT NULL, title TEXT NOT NULL, description TEXT, sort_order INTEGER DEFAULT 0, created_at INTEGER DEFAULT (strftime('%s', 'now')), updated_at INTEGER DEFAULT (strftime('%s', 'now')), is_deleted INTEGER DEFAULT 0, FOREIGN KEY (discipline_id) REFERENCES disciplines(id) ON DELETE CASCADE);
CREATE INDEX IF NOT EXISTS idx_topics_discipline ON topics(discipline_id);

CREATE TABLE IF NOT EXISTS tests (id TEXT PRIMARY KEY, title TEXT NOT NULL, description TEXT, discipline_id TEXT, topic_id TEXT, time_limit INTEGER, attempts_limit INTEGER DEFAULT 1, questions_limit INTEGER, passing_score INTEGER DEFAULT 60, shuffle_questions INTEGER DEFAULT 0, shuffle_answers INTEGER DEFAULT 0, is_published INTEGER DEFAULT 0, created_by TEXT, created_at INTEGER DEFAULT (strftime('%s', 'now')), updated_at INTEGER DEFAULT (strftime('%s', 'now')), is_deleted INTEGER DEFAULT 0, FOREIGN KEY (discipline_id) REFERENCES disciplines(id), FOREIGN KEY (topic_id) REFERENCES topics(id), FOREIGN KEY (created_by) REFERENCES users(id));
CREATE INDEX IF NOT EXISTS idx_tests_discipline ON tests(discipline_id);
CREATE INDEX IF NOT EXISTS idx_tests_topic ON tests(topic_id);
CREATE INDEX IF NOT EXISTS idx_tests_created_by ON tests(created_by);

CREATE TABLE IF NOT EXISTS test_merge (id TEXT PRIMARY KEY, parent_test_id TEXT NOT NULL, child_test_id TEXT NOT NULL, questions_count INTEGER, FOREIGN KEY (parent_test_id) REFERENCES tests(id) ON DELETE CASCADE, FOREIGN KEY (child_test_id) REFERENCES tests(id) ON DELETE CASCADE);

CREATE TABLE IF NOT EXISTS questions (id TEXT PRIMARY KEY, test_id TEXT NOT NULL, text TEXT NOT NULL, type TEXT NOT NULL CHECK(type IN ('single', 'multiple', 'text', 'match', 'order')), weight INTEGER DEFAULT 1, image_url TEXT, explanation TEXT, sort_order INTEGER DEFAULT 0, created_at INTEGER DEFAULT (strftime('%s', 'now')), updated_at INTEGER DEFAULT (strftime('%s', 'now')), is_deleted INTEGER DEFAULT 0, FOREIGN KEY (test_id) REFERENCES tests(id) ON DELETE CASCADE);
CREATE INDEX IF NOT EXISTS idx_questions_test ON questions(test_id);

CREATE TABLE IF NOT EXISTS answers (id TEXT PRIMARY KEY, question_id TEXT NOT NULL, text TEXT NOT NULL, is_correct INTEGER DEFAULT 0, position INTEGER, created_at INTEGER DEFAULT (strftime('%s', 'now')), updated_at INTEGER DEFAULT (strftime('%s', 'now')), is_deleted INTEGER DEFAULT 0, FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE CASCADE);
CREATE INDEX IF NOT EXISTS idx_answers_question ON answers(question_id);

CREATE TABLE IF NOT EXISTS matching_pairs (id TEXT PRIMARY KEY, question_id TEXT NOT NULL, left_text TEXT NOT NULL, right_text TEXT NOT NULL, FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE CASCADE);
CREATE INDEX IF NOT EXISTS idx_matching_pairs_question ON matching_pairs(question_id);

CREATE TABLE IF NOT EXISTS attempts (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, test_id TEXT NOT NULL, started_at INTEGER DEFAULT (strftime('%s', 'now')), finished_at INTEGER, total_questions INTEGER, correct_answers INTEGER, score INTEGER, is_passed INTEGER DEFAULT 0, created_at INTEGER DEFAULT (strftime('%s', 'now')), updated_at INTEGER DEFAULT (strftime('%s', 'now')), is_deleted INTEGER DEFAULT 0, FOREIGN KEY (user_id) REFERENCES users(id), FOREIGN KEY (test_id) REFERENCES tests(id));
CREATE INDEX IF NOT EXISTS idx_attempts_user ON attempts(user_id);
CREATE INDEX IF NOT EXISTS idx_attempts_test ON attempts(test_id);

CREATE TABLE IF NOT EXISTS user_answers (id TEXT PRIMARY KEY, attempt_id TEXT NOT NULL, question_id TEXT NOT NULL, answer_id TEXT, text_answer TEXT, is_correct INTEGER, created_at INTEGER DEFAULT (strftime('%s', 'now')), FOREIGN KEY (attempt_id) REFERENCES attempts(id) ON DELETE CASCADE, FOREIGN KEY (question_id) REFERENCES questions(id), FOREIGN KEY (answer_id) REFERENCES answers(id));
CREATE INDEX IF NOT EXISTS idx_user_answers_attempt ON user_answers(attempt_id);

CREATE TABLE IF NOT EXISTS user_matching_answers (id TEXT PRIMARY KEY, attempt_id TEXT NOT NULL, question_id TEXT NOT NULL, pair_id TEXT NOT NULL, user_right_text TEXT, is_correct INTEGER, created_at INTEGER DEFAULT (strftime('%s', 'now')), FOREIGN KEY (attempt_id) REFERENCES attempts(id) ON DELETE CASCADE, FOREIGN KEY (question_id) REFERENCES questions(id), FOREIGN KEY (pair_id) REFERENCES matching_pairs(id));

CREATE TABLE IF NOT EXISTS user_order_answers (id TEXT PRIMARY KEY, attempt_id TEXT NOT NULL, question_id TEXT NOT NULL, answer_id TEXT NOT NULL, user_position INTEGER, is_correct INTEGER, created_at INTEGER DEFAULT (strftime('%s', 'now')), FOREIGN KEY (attempt_id) REFERENCES attempts(id) ON DELETE CASCADE, FOREIGN KEY (question_id) REFERENCES questions(id), FOREIGN KEY (answer_id) REFERENCES answers(id));

CREATE TABLE IF NOT EXISTS results (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, test_id TEXT NOT NULL, attempt_id TEXT NOT NULL, score INTEGER, is_passed INTEGER DEFAULT 0, synced INTEGER DEFAULT 0, synced_at INTEGER, google_classroom_id TEXT, created_at INTEGER DEFAULT (strftime('%s', 'now')), updated_at INTEGER DEFAULT (strftime('%s', 'now')), is_deleted INTEGER DEFAULT 0, FOREIGN KEY (user_id) REFERENCES users(id), FOREIGN KEY (test_id) REFERENCES tests(id), FOREIGN KEY (attempt_id) REFERENCES attempts(id));
CREATE INDEX IF NOT EXISTS idx_results_user ON results(user_id);
CREATE INDEX IF NOT EXISTS idx_results_test ON results(test_id);
CREATE INDEX IF NOT EXISTS idx_results_synced ON results(synced);

CREATE TABLE IF NOT EXISTS student_disciplines (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, discipline_id TEXT NOT NULL, enrolled_at INTEGER DEFAULT (strftime('%s', 'now')), FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE, FOREIGN KEY (discipline_id) REFERENCES disciplines(id) ON DELETE CASCADE, UNIQUE(user_id, discipline_id));
";
        }

        #endregion

        #region Server

        private void BrowseWebsitePath()
        {
            var dialog = new OpenFolderDialog { Title = "\u0412\u044B\u0431\u0435\u0440\u0438\u0442\u0435 \u043F\u0430\u043F\u043A\u0443 \u0441 \u0441\u0430\u0439\u0442\u043E\u043C (package.json)" };
            if (dialog.ShowDialog() == true)
            {
                WebsitePath = dialog.FolderName;
                StatusMessage = "\u041F\u0443\u0442\u044C \u043A \u0441\u0430\u0439\u0442\u0443: " + dialog.FolderName;
            }
        }

        private void StartServer()
        {
            if (string.IsNullOrEmpty(WebsitePath))
            {
                MessageBox.Show("\u0423\u043A\u0430\u0436\u0438\u0442\u0435 \u043F\u0443\u0442\u044C \u043A \u043F\u0430\u043F\u043A\u0435 \u0441 \u0441\u0430\u0439\u0442\u043E\u043C.", "\u041E\u0448\u0438\u0431\u043A\u0430", MessageBoxButton.OK, MessageBoxImage.Warning);
                return;
            }
            if (!HasLocalDatabase)
            {
                MessageBox.Show("\u0421\u043D\u0430\u0447\u0430\u043B\u0430 \u0441\u043E\u0437\u0434\u0430\u0439\u0442\u0435 \u0438\u043B\u0438 \u0432\u044B\u0431\u0435\u0440\u0438\u0442\u0435 \u0431\u0430\u0437\u0443 \u0434\u0430\u043D\u043D\u044B\u0445.", "\u041E\u0448\u0438\u0431\u043A\u0430", MessageBoxButton.OK, MessageBoxImage.Warning);
                return;
            }
            try
            {
                var appMode = IsOfflineMode ? "offline" : "online";
                
                // Preserve existing .env values (e.g. GOOGLE_CLIENT_ID) and only override what WPF controls
                var envPath = Path.Combine(WebsitePath, ".env");
                var existingEnv = new System.Collections.Generic.Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
                if (File.Exists(envPath))
                {
                    foreach (var line in File.ReadAllLines(envPath))
                    {
                        var eq = line.IndexOf('=');
                        if (eq > 0)
                            existingEnv[line[..eq].Trim()] = line[(eq + 1)..];
                    }
                }
                existingEnv["PORT"] = LocalServerPort.ToString();
                existingEnv["NODE_ENV"] = "development";
                existingEnv["SESSION_SECRET"] = existingEnv.ContainsKey("SESSION_SECRET") ? existingEnv["SESSION_SECRET"] : "local-session-secret";
                existingEnv["ADMIN_API_KEY"] = "local-admin-key";
                existingEnv["DB_PATH"] = LocalDatabasePath;
                existingEnv["APP_MODE"] = appMode;
                var envContent = string.Join("\n", existingEnv.Select(kv => kv.Key + "=" + kv.Value)) + "\n";
                File.WriteAllText(envPath, envContent);

                _serverProcess = new Process
                {
                    StartInfo = new ProcessStartInfo
                    {
                        FileName = "node",
                        Arguments = "server/index.js",
                        WorkingDirectory = WebsitePath,
                        UseShellExecute = false,
                        CreateNoWindow = true,
                        RedirectStandardOutput = true,
                        RedirectStandardError = true
                    }
                };
                _serverProcess.Start();
                _serverProcess.EnableRaisingEvents = true;
                _serverProcess.Exited += (_, _) =>
                {
                    Application.Current.Dispatcher.Invoke(() =>
                    {
                        _serverStatus = new ServerStatus { IsRunning = false };
                        OnPropertyChanged(nameof(ServerStatus));
                        OnPropertyChanged(nameof(LocalServerAddress));
                        StatusMessage = "Сервер остановлен (процесс завершился)";
                    });
                };
                _serverStatus = new ServerStatus { IsRunning = true, Port = LocalServerPort, ProcessId = _serverProcess.Id, StartTime = DateTime.Now };
                OnPropertyChanged(nameof(ServerStatus));
                OnPropertyChanged(nameof(LocalServerAddress));
                StatusMessage = "\u0421\u0435\u0440\u0432\u0435\u0440 \u0437\u0430\u043F\u0443\u0449\u0435\u043D \u043D\u0430 \u043F\u043E\u0440\u0442\u0443 " + LocalServerPort;
            }
            catch (Exception ex)
            {
                MessageBox.Show("\u041E\u0448\u0438\u0431\u043A\u0430 \u0437\u0430\u043F\u0443\u0441\u043A\u0430 \u0441\u0435\u0440\u0432\u0435\u0440\u0430:\n" + ex.Message, "\u041E\u0448\u0438\u0431\u043A\u0430", MessageBoxButton.OK, MessageBoxImage.Error);
            }
        }

        private void StopServer()
        {
            try
            {
                if (_serverProcess != null && !_serverProcess.HasExited)
                {
                    _serverProcess.Kill(entireProcessTree: true);
                    _serverProcess.Dispose();
                    _serverProcess = null;
                }
                _serverStatus = new ServerStatus { IsRunning = false };
                OnPropertyChanged(nameof(ServerStatus));
                OnPropertyChanged(nameof(LocalServerAddress));
                StatusMessage = "\u0421\u0435\u0440\u0432\u0435\u0440 \u043E\u0441\u0442\u0430\u043D\u043E\u0432\u043B\u0435\u043D";
            }
            catch (Exception ex)
            {
                MessageBox.Show("\u041E\u0448\u0438\u0431\u043A\u0430 \u043E\u0441\u0442\u0430\u043D\u043E\u0432\u043A\u0438 \u0441\u0435\u0440\u0432\u0435\u0440\u0430:\n" + ex.Message, "\u041E\u0448\u0438\u0431\u043A\u0430", MessageBoxButton.OK, MessageBoxImage.Error);
            }
        }

        private void OpenInBrowser()
        {
            try { Process.Start(new ProcessStartInfo { FileName = "http://localhost:" + ServerStatus.Port, UseShellExecute = true }); } catch { }
        }

        #endregion

        #region Online / Sync

        private async void TestOnlineConnection()
        {
            var url = OnlineServerUrl?.TrimEnd('/');
            if (string.IsNullOrWhiteSpace(url))
            {
                MessageBox.Show("\u0423\u043A\u0430\u0436\u0438\u0442\u0435 URL \u0443\u0434\u0430\u043B\u0451\u043D\u043D\u043E\u0433\u043E \u0441\u0435\u0440\u0432\u0435\u0440\u0430.",
                    "\u041E\u0448\u0438\u0431\u043A\u0430", MessageBoxButton.OK, MessageBoxImage.Warning);
                return;
            }

            StatusMessage = "\u041F\u0440\u043E\u0432\u0435\u0440\u043A\u0430 \u043F\u043E\u0434\u043A\u043B\u044E\u0447\u0435\u043D\u0438\u044F \u043A " + url + "...";
            IsBusy = true;

            try
            {
                var req = new HttpRequestMessage(HttpMethod.Get, url + "/api/sync/wpf/stats/summary");
                req.Headers.Add("x-api-key", OnlineApiKey);
                var response = await _httpClient.SendAsync(req);
                if (response.IsSuccessStatusCode)
                {
                    var json = await response.Content.ReadAsStringAsync();
                    var stats = JsonConvert.DeserializeObject<Dictionary<string, int>>(json);
                    var info = new StringBuilder();
                    info.AppendLine("\u2705 \u041F\u043E\u0434\u043A\u043B\u044E\u0447\u0435\u043D\u0438\u0435 \u0443\u0441\u0442\u0430\u043D\u043E\u0432\u043B\u0435\u043D\u043E!\n");
                    info.AppendLine("\u0421\u0442\u0430\u0442\u0438\u0441\u0442\u0438\u043A\u0430 \u0443\u0434\u0430\u043B\u0451\u043D\u043D\u043E\u0439 \u0411\u0414:");
                    if (stats != null)
                    {
                        foreach (var kv in stats)
                            info.AppendLine("  " + kv.Key + ": " + kv.Value);
                    }
                    StatusMessage = "\u041F\u043E\u0434\u043A\u043B\u044E\u0447\u0435\u043D\u0438\u0435 \u0443\u0441\u043F\u0435\u0448\u043D\u043E";
                    MessageBox.Show(info.ToString(), "\u041F\u0440\u043E\u0432\u0435\u0440\u043A\u0430 \u043F\u043E\u0434\u043A\u043B\u044E\u0447\u0435\u043D\u0438\u044F", MessageBoxButton.OK, MessageBoxImage.Information);
                }
                else
                {
                    StatusMessage = "\u041E\u0448\u0438\u0431\u043A\u0430 \u043F\u043E\u0434\u043A\u043B\u044E\u0447\u0435\u043D\u0438\u044F: HTTP " + (int)response.StatusCode;
                    MessageBox.Show("\u0421\u0435\u0440\u0432\u0435\u0440 \u043E\u0442\u0432\u0435\u0442\u0438\u043B \u043A\u043E\u0434\u043E\u043C " + (int)response.StatusCode + ".\n\u041F\u0440\u043E\u0432\u0435\u0440\u044C\u0442\u0435 URL \u0438 \u0434\u043E\u0441\u0442\u0443\u043F\u043D\u043E\u0441\u0442\u044C \u0441\u0435\u0440\u0432\u0435\u0440\u0430.",
                        "\u041E\u0448\u0438\u0431\u043A\u0430", MessageBoxButton.OK, MessageBoxImage.Warning);
                }
            }
            catch (TaskCanceledException)
            {
                StatusMessage = "\u0422\u0430\u0439\u043C\u0430\u0443\u0442 \u043F\u043E\u0434\u043A\u043B\u044E\u0447\u0435\u043D\u0438\u044F";
                MessageBox.Show("\u0421\u0435\u0440\u0432\u0435\u0440 \u043D\u0435 \u043E\u0442\u0432\u0435\u0442\u0438\u043B \u0432 \u0442\u0435\u0447\u0435\u043D\u0438\u0435 15 \u0441\u0435\u043A\u0443\u043D\u0434.\n\u041F\u0440\u043E\u0432\u0435\u0440\u044C\u0442\u0435 URL \u0438 \u0434\u043E\u0441\u0442\u0443\u043F\u043D\u043E\u0441\u0442\u044C \u0441\u0435\u0440\u0432\u0435\u0440\u0430.",
                    "\u0422\u0430\u0439\u043C\u0430\u0443\u0442", MessageBoxButton.OK, MessageBoxImage.Warning);
            }
            catch (HttpRequestException ex)
            {
                StatusMessage = "\u041D\u0435\u0442 \u043F\u043E\u0434\u043A\u043B\u044E\u0447\u0435\u043D\u0438\u044F";
                MessageBox.Show("\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u043F\u043E\u0434\u043A\u043B\u044E\u0447\u0438\u0442\u044C\u0441\u044F \u043A \u0441\u0435\u0440\u0432\u0435\u0440\u0443:\n" + ex.Message,
                    "\u041E\u0448\u0438\u0431\u043A\u0430 \u043F\u043E\u0434\u043A\u043B\u044E\u0447\u0435\u043D\u0438\u044F", MessageBoxButton.OK, MessageBoxImage.Error);
            }
            catch (Exception ex)
            {
                StatusMessage = "\u041E\u0448\u0438\u0431\u043A\u0430";
                MessageBox.Show("\u041E\u0448\u0438\u0431\u043A\u0430 \u043F\u0440\u043E\u0432\u0435\u0440\u043A\u0438 \u043F\u043E\u0434\u043A\u043B\u044E\u0447\u0435\u043D\u0438\u044F:\n" + ex.Message,
                    "\u041E\u0448\u0438\u0431\u043A\u0430", MessageBoxButton.OK, MessageBoxImage.Error);
            }
            finally
            {
                IsBusy = false;
            }
        }

        private async void DoSync()
        {
            var url = OnlineServerUrl?.TrimEnd('/');
            if (string.IsNullOrWhiteSpace(url))
            {
                MessageBox.Show("\u0423\u043A\u0430\u0436\u0438\u0442\u0435 URL \u0443\u0434\u0430\u043B\u0451\u043D\u043D\u043E\u0433\u043E \u0441\u0435\u0440\u0432\u0435\u0440\u0430.",
                    "\u041E\u0448\u0438\u0431\u043A\u0430", MessageBoxButton.OK, MessageBoxImage.Warning);
                return;
            }
            if (!HasLocalDatabase)
            {
                MessageBox.Show("\u0421\u043D\u0430\u0447\u0430\u043B\u0430 \u0441\u043E\u0437\u0434\u0430\u0439\u0442\u0435 \u0438\u043B\u0438 \u0432\u044B\u0431\u0435\u0440\u0438\u0442\u0435 \u043B\u043E\u043A\u0430\u043B\u044C\u043D\u0443\u044E \u0411\u0414.",
                    "\u041E\u0448\u0438\u0431\u043A\u0430", MessageBoxButton.OK, MessageBoxImage.Warning);
                return;
            }
            if (!ServerStatus.IsRunning)
            {
                MessageBox.Show("\u0421\u043D\u0430\u0447\u0430\u043B\u0430 \u0437\u0430\u043F\u0443\u0441\u0442\u0438\u0442\u0435 \u043B\u043E\u043A\u0430\u043B\u044C\u043D\u044B\u0439 \u0441\u0435\u0440\u0432\u0435\u0440.",
                    "\u041E\u0448\u0438\u0431\u043A\u0430", MessageBoxButton.OK, MessageBoxImage.Warning);
                return;
            }

            IsSyncing = true;
            IsBusy = true;
            SyncProgress = 0;
            SyncLog = "";
            var direction = _config.SyncSettings.Direction;

            var tableMap = new List<(string table, string displayName, bool enabled)>
            {
                ("users", "\u041F\u043E\u043B\u044C\u0437\u043E\u0432\u0430\u0442\u0435\u043B\u0438", SyncStudents),
                ("disciplines", "\u0414\u0438\u0441\u0446\u0438\u043F\u043B\u0438\u043D\u044B", SyncDisciplines),
                ("topics", "\u0422\u0435\u043C\u044B", SyncTopics),
                ("tests", "\u0422\u0435\u0441\u0442\u044B", SyncTests),
                ("questions", "\u0412\u043E\u043F\u0440\u043E\u0441\u044B", SyncQuestions),
                ("answers", "\u041E\u0442\u0432\u0435\u0442\u044B", SyncQuestions),
                ("matching_pairs", "\u041F\u0430\u0440\u044B \u0441\u043E\u043E\u0442\u0432\u0435\u0442\u0441\u0442\u0432\u0438\u0439", SyncQuestions),
                ("student_disciplines", "\u0417\u0430\u043F\u0438\u0441\u0438 \u043D\u0430 \u0434\u0438\u0441\u0446\u0438\u043F\u043B\u0438\u043D\u044B", SyncStudents || SyncDisciplines),
            };
            if (SyncResults)
            {
                tableMap.Add(("attempts", "\u041F\u043E\u043F\u044B\u0442\u043A\u0438", true));
                tableMap.Add(("user_answers", "\u041E\u0442\u0432\u0435\u0442\u044B \u0441\u0442\u0443\u0434\u0435\u043D\u0442\u043E\u0432", true));
                tableMap.Add(("results", "\u0420\u0435\u0437\u0443\u043B\u044C\u0442\u0430\u0442\u044B", true));
            }

            var enabledTables = tableMap.Where(t => t.enabled).ToList();
            if (enabledTables.Count == 0)
            {
                MessageBox.Show("\u0412\u044B\u0431\u0435\u0440\u0438\u0442\u0435 \u0445\u043E\u0442\u044F \u0431\u044B \u043E\u0434\u0438\u043D \u0442\u0438\u043F \u0434\u0430\u043D\u043D\u044B\u0445 \u0434\u043B\u044F \u0441\u0438\u043D\u0445\u0440\u043E\u043D\u0438\u0437\u0430\u0446\u0438\u0438.",
                    "\u041F\u0440\u0435\u0434\u0443\u043F\u0440\u0435\u0436\u0434\u0435\u043D\u0438\u0435", MessageBoxButton.OK, MessageBoxImage.Warning);
                IsSyncing = false;
                IsBusy = false;
                return;
            }

            int totalSteps = enabledTables.Count * (direction == SyncDirection.Both ? 2 : 1);
            int currentStep = 0;
            int totalUploaded = 0, totalDownloaded = 0, totalErrors = 0;

            var localUrl = "http://localhost:" + LocalServerPort;

            try
            {
                await Task.Run(async () =>
                {
                    if (direction == SyncDirection.Both || direction == SyncDirection.Upload)
                    {
                        foreach (var (table, displayName, _) in enabledTables)
                        {
                            currentStep++;
                            UpdateSyncUI(currentStep, totalSteps, "\u2B06 \u0412\u044B\u0433\u0440\u0443\u0437\u043A\u0430: " + displayName + "...");

                            try
                            {
                                var localGetReq = new HttpRequestMessage(HttpMethod.Get, localUrl + "/api/sync/wpf/" + table);
                                localGetReq.Headers.Add("x-api-key", "local-admin-key");
                                var getResp = await _httpClient.SendAsync(localGetReq);
                                if (!getResp.IsSuccessStatusCode)
                                {
                                    totalErrors++;
                                    AppendLog("\u274C " + displayName + " (\u0447\u0442\u0435\u043D\u0438\u0435): HTTP " + (int)getResp.StatusCode);
                                    continue;
                                }
                                var rowsJson = await getResp.Content.ReadAsStringAsync();
                                var rows = JsonConvert.DeserializeObject<List<Dictionary<string, object>>>(rowsJson);
                                if (rows == null || rows.Count == 0)
                                {
                                    AppendLog("\u2B06 " + displayName + ": \u043D\u0435\u0442 \u0434\u0430\u043D\u043D\u044B\u0445");
                                    continue;
                                }

                                // Send all rows in a single batch request instead of one request per row
                                var batchJson = JsonConvert.SerializeObject(rows);
                                var batchContent = new StringContent(batchJson, Encoding.UTF8, "application/json");
                                var remoteBatchReq = new HttpRequestMessage(HttpMethod.Post, url + "/api/sync/wpf/" + table + "/batch") { Content = batchContent };
                                remoteBatchReq.Headers.Add("x-api-key", OnlineApiKey);
                                var batchResp = await _httpClient.SendAsync(remoteBatchReq);
                                int uploaded = 0;
                                if (batchResp.IsSuccessStatusCode)
                                {
                                    var result = JsonConvert.DeserializeObject<Dictionary<string, object>>(await batchResp.Content.ReadAsStringAsync());
                                    uploaded = result != null && result.TryGetValue("upserted", out var u) ? Convert.ToInt32(u) : rows.Count;
                                }
                                else
                                {
                                    totalErrors++;
                                }
                                totalUploaded += uploaded;
                                AppendLog("\u2B06 " + displayName + ": \u0432\u044B\u0433\u0440\u0443\u0436\u0435\u043D\u043E " + uploaded + " \u0437\u0430\u043F\u0438\u0441\u0435\u0439");
                            }
                            catch (Exception ex)
                            {
                                totalErrors++;
                                AppendLog("\u274C " + displayName + " (\u0432\u044B\u0433\u0440\u0443\u0437\u043A\u0430): " + ex.Message);
                            }
                        }
                    }

                    if (direction == SyncDirection.Both || direction == SyncDirection.Download)
                    {
                        foreach (var (table, displayName, _) in enabledTables)
                        {
                            currentStep++;
                            UpdateSyncUI(currentStep, totalSteps, "\u2B07 \u0417\u0430\u0433\u0440\u0443\u0437\u043A\u0430: " + displayName + "...");

                            try
                            {
                                var remoteGetReq = new HttpRequestMessage(HttpMethod.Get, url + "/api/sync/wpf/" + table);
                                remoteGetReq.Headers.Add("x-api-key", OnlineApiKey);
                                var resp = await _httpClient.SendAsync(remoteGetReq);
                                if (!resp.IsSuccessStatusCode)
                                {
                                    totalErrors++;
                                    AppendLog("\u274C " + displayName + " (\u0437\u0430\u0433\u0440\u0443\u0437\u043A\u0430): HTTP " + (int)resp.StatusCode);
                                    continue;
                                }
                                var json = await resp.Content.ReadAsStringAsync();
                                var records = JsonConvert.DeserializeObject<List<Dictionary<string, object>>>(json);
                                if (records == null || records.Count == 0)
                                {
                                    AppendLog("\u2B07 " + displayName + ": \u043D\u0435\u0442 \u0434\u0430\u043D\u043D\u044B\u0445 \u043D\u0430 \u0441\u0435\u0440\u0432\u0435\u0440\u0435");
                                    continue;
                                }

                                // Send all records to local server in a single batch request
                                int downloaded = 0;
                                var localBatchJson = JsonConvert.SerializeObject(records);
                                var localBatchContent = new StringContent(localBatchJson, Encoding.UTF8, "application/json");
                                var localBatchReq = new HttpRequestMessage(HttpMethod.Post, localUrl + "/api/sync/wpf/" + table + "/batch") { Content = localBatchContent };
                                localBatchReq.Headers.Add("x-api-key", "local-admin-key");
                                var localBatchResp = await _httpClient.SendAsync(localBatchReq);
                                if (localBatchResp.IsSuccessStatusCode)
                                {
                                    var result = JsonConvert.DeserializeObject<Dictionary<string, object>>(await localBatchResp.Content.ReadAsStringAsync());
                                    downloaded = result != null && result.TryGetValue("upserted", out var u) ? Convert.ToInt32(u) : records.Count;
                                }
                                else
                                {
                                    totalErrors++;
                                }
                                totalDownloaded += downloaded;
                                AppendLog("\u2B07 " + displayName + ": \u0437\u0430\u0433\u0440\u0443\u0436\u0435\u043D\u043E " + downloaded + " \u0437\u0430\u043F\u0438\u0441\u0435\u0439");
                            }
                            catch (Exception ex)
                            {
                                totalErrors++;
                                AppendLog("\u274C " + displayName + " (\u0437\u0430\u0433\u0440\u0443\u0437\u043A\u0430): " + ex.Message);
                            }
                        }
                    }
                });

                _config.LastSyncDate = DateTime.Now;
                SaveConfig();
                OnPropertyChanged(nameof(LastSyncText));

                SyncProgress = 100;
                var summary = "\u2705 \u0421\u0438\u043D\u0445\u0440\u043E\u043D\u0438\u0437\u0430\u0446\u0438\u044F \u0437\u0430\u0432\u0435\u0440\u0448\u0435\u043D\u0430"
                    + "\n\u0412\u044B\u0433\u0440\u0443\u0436\u0435\u043D\u043E: " + totalUploaded
                    + "\n\u0417\u0430\u0433\u0440\u0443\u0436\u0435\u043D\u043E: " + totalDownloaded
                    + (totalErrors > 0 ? "\n\u041E\u0448\u0438\u0431\u043E\u043A: " + totalErrors : "");
                AppendLog("\n" + summary);
                StatusMessage = "\u0421\u0438\u043D\u0445\u0440\u043E\u043D\u0438\u0437\u0430\u0446\u0438\u044F \u0437\u0430\u0432\u0435\u0440\u0448\u0435\u043D\u0430. \u0412\u044B\u0433\u0440\u0443\u0436\u0435\u043D\u043E: " + totalUploaded + ", \u0437\u0430\u0433\u0440\u0443\u0436\u0435\u043D\u043E: " + totalDownloaded;
            }
            catch (Exception ex)
            {
                AppendLog("\u274C \u041A\u0440\u0438\u0442\u0438\u0447\u0435\u0441\u043A\u0430\u044F \u043E\u0448\u0438\u0431\u043A\u0430: " + ex.Message);
                StatusMessage = "\u041E\u0448\u0438\u0431\u043A\u0430 \u0441\u0438\u043D\u0445\u0440\u043E\u043D\u0438\u0437\u0430\u0446\u0438\u0438: " + ex.Message;
            }
            finally
            {
                IsSyncing = false;
                IsBusy = false;
                SyncStatusText = "";
            }
        }

        private void UpdateSyncUI(int step, int total, string text)
        {
            Application.Current.Dispatcher.Invoke(() =>
            {
                SyncProgress = (int)((double)step / total * 100);
                SyncStatusText = text;
                StatusMessage = text;
            });
        }

        private void AppendLog(string line)
        {
            Application.Current.Dispatcher.Invoke(() =>
            {
                SyncLog += DateTime.Now.ToString("HH:mm:ss") + " " + line + "\n";
            });
        }

        #endregion

        #region Teacher Registration

        private async void ShowRegisterTeacherDialog()
        {
            var dialog = new RegisterTeacherDialog();
            dialog.Owner = Application.Current.MainWindow;

            if (dialog.ShowDialog() == true)
            {
                var email = dialog.EmailBox.Text.Trim();
                var name = dialog.NameBox.Text.Trim();
                var password = dialog.PasswordBox.Password;

                if (ServerStatus.IsRunning)
                {
                    try
                    {
                        var payload = JsonConvert.SerializeObject(new { email, name, password, role = "teacher" });
                        var content = new StringContent(payload, Encoding.UTF8, "application/json");
                        var resp = await _httpClient.PostAsync("http://localhost:" + LocalServerPort + "/auth/register", content);
                        var body = await resp.Content.ReadAsStringAsync();

                        if (!resp.IsSuccessStatusCode)
                        {
                            var err = JsonConvert.DeserializeObject<Dictionary<string, string>>(body);
                            var msg = err != null && err.ContainsKey("error") ? err["error"] : "HTTP " + (int)resp.StatusCode;
                            MessageBox.Show("Ошибка регистрации через сервер:\n" + msg, "Ошибка", MessageBoxButton.OK, MessageBoxImage.Warning);
                            return;
                        }
                    }
                    catch (Exception ex)
                    {
                        MessageBox.Show("Ошибка связи с сервером:\n" + ex.Message + "\n\nЗапустите сервер перед регистрацией.", "Ошибка", MessageBoxButton.OK, MessageBoxImage.Warning);
                        return;
                    }
                }
                else
                {
                    MessageBox.Show("Сначала запустите сервер, затем регистрируйте преподавателя.", "Сервер не запущен", MessageBoxButton.OK, MessageBoxImage.Warning);
                    return;
                }

                var creds = new TeacherCredentials
                {
                    Id = Guid.NewGuid().ToString(),
                    Email = email,
                    Name = name,
                    PasswordHash = HashPassword(password)
                };
                _config.TeacherCredentials = creds;
                SaveConfig();

                OnPropertyChanged(nameof(TeacherName));
                OnPropertyChanged(nameof(HasTeacherAccount));
                StatusMessage = "Преподаватель зарегистрирован: " + name;
                MessageBox.Show("Преподаватель " + name + " успешно зарегистрирован!", "Успех", MessageBoxButton.OK, MessageBoxImage.Information);
            }
        }

        private void LogoutTeacher()
        {
            var result = MessageBox.Show(
                "Вы уверены, что хотите выйти из аккаунта преподавателя?",
                "Выход из аккаунта",
                MessageBoxButton.YesNo,
                MessageBoxImage.Question);

            if (result != MessageBoxResult.Yes) return;

            _config.TeacherCredentials = null;
            SaveConfig();

            OnPropertyChanged(nameof(TeacherName));
            OnPropertyChanged(nameof(HasTeacherAccount));
            StatusMessage = "Выход из аккаунта преподавателя выполнен";
        }

        private static string HashPassword(string password)
        {
            using var rng = RandomNumberGenerator.Create();
            var salt = new byte[16];
            rng.GetBytes(salt);
            using var pbkdf2 = new Rfc2898DeriveBytes(password, salt, 100000, HashAlgorithmName.SHA256);
            var hash = pbkdf2.GetBytes(32);
            return Convert.ToBase64String(salt) + "$" + Convert.ToBase64String(hash);
        }

        #endregion

        #region Config

        private AppConfig LoadConfig()
        {
            try
            {
                if (File.Exists(ConfigPath))
                {
                    var json = File.ReadAllText(ConfigPath);
                    return JsonConvert.DeserializeObject<AppConfig>(json) ?? new AppConfig();
                }
            }
            catch { }
            return new AppConfig();
        }

        private void SaveConfig()
        {
            try
            {
                var json = JsonConvert.SerializeObject(_config, Formatting.Indented);
                File.WriteAllText(ConfigPath, json);
            }
            catch { }
        }

        #endregion

    }

    public class RelayCommand : ICommand
    {
        private readonly Action _execute;
        private readonly Func<bool>? _canExecute;

        public RelayCommand(Action execute, Func<bool>? canExecute = null)
        {
            _execute = execute;
            _canExecute = canExecute;
        }

        public event EventHandler? CanExecuteChanged
        {
            add { CommandManager.RequerySuggested += value; }
            remove { CommandManager.RequerySuggested -= value; }
        }

        public bool CanExecute(object? parameter) => _canExecute?.Invoke() ?? true;
        public void Execute(object? parameter) => _execute();
    }
}
