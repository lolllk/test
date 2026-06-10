





CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT,
    description TEXT,
    updated_at INTEGER DEFAULT (strftime('%s', 'now'))
);


INSERT OR IGNORE INTO settings (key, value, description) VALUES 
    ('app_mode', 'offline', 'Режим работы: online/offline'),
    ('port', '3000', 'Порт сервера'),
    ('sync_enabled', '0', 'Синхронизация включена: 0/1'),
    ('sync_interval', '300', 'Интервал синхронизации в секундах'),
    ('sync_url', '', 'URL удалённого сервера для синхронизации'),
    ('last_sync', '', 'Время последней синхронизации'),
    ('google_enabled', '0', 'Google OAuth включен: 0/1');


CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE,
    name TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('student', 'teacher')),
    
    
    password_hash TEXT,
    
    
    google_id TEXT UNIQUE,
    avatar_url TEXT,
    google_access_token TEXT,
    google_refresh_token TEXT,
    google_token_expiry INTEGER,
    google_sheets_spreadsheet_id TEXT,
    google_sheets_sheet_name TEXT DEFAULT 'Results',
    
    
    sync_status TEXT DEFAULT 'local' CHECK(sync_status IN ('local', 'synced', 'pending', 'conflict')),
    remote_id TEXT,              
    created_offline INTEGER DEFAULT 0,
    last_sync_at INTEGER,
    
    created_at INTEGER DEFAULT (strftime('%s', 'now')),
    updated_at INTEGER DEFAULT (strftime('%s', 'now')),
    is_deleted INTEGER DEFAULT 0
);


CREATE INDEX IF NOT EXISTS idx_users_sync_status ON users(sync_status);
CREATE INDEX IF NOT EXISTS idx_users_remote_id ON users(remote_id);


CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    token TEXT UNIQUE NOT NULL,
    expires_at INTEGER NOT NULL,
    
    created_at INTEGER DEFAULT (strftime('%s', 'now')),
    
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);


CREATE TABLE IF NOT EXISTS disciplines (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT,
    
    created_by TEXT,
    
    created_at INTEGER DEFAULT (strftime('%s', 'now')),
    updated_at INTEGER DEFAULT (strftime('%s', 'now')),
    is_deleted INTEGER DEFAULT 0,
    
    FOREIGN KEY (created_by) REFERENCES users(id)
);


CREATE TABLE IF NOT EXISTS topics (
    id TEXT PRIMARY KEY,
    discipline_id TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    sort_order INTEGER DEFAULT 0,
    
    created_at INTEGER DEFAULT (strftime('%s', 'now')),
    updated_at INTEGER DEFAULT (strftime('%s', 'now')),
    is_deleted INTEGER DEFAULT 0,
    
    FOREIGN KEY (discipline_id) REFERENCES disciplines(id) ON DELETE CASCADE
);


CREATE TABLE IF NOT EXISTS tests (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT,
    discipline_id TEXT,
    topic_id TEXT,
    
    
    time_limit INTEGER,              
    attempts_limit INTEGER DEFAULT 1, 
    questions_limit INTEGER,          
    passing_score INTEGER DEFAULT 60, 
    
    
    shuffle_questions INTEGER DEFAULT 0,
    shuffle_answers INTEGER DEFAULT 0,
    
    
    is_published INTEGER DEFAULT 0,
    
    created_by TEXT,
    
    created_at INTEGER DEFAULT (strftime('%s', 'now')),
    updated_at INTEGER DEFAULT (strftime('%s', 'now')),
    is_deleted INTEGER DEFAULT 0,
    
    FOREIGN KEY (discipline_id) REFERENCES disciplines(id),
    FOREIGN KEY (topic_id) REFERENCES topics(id),
    FOREIGN KEY (created_by) REFERENCES users(id)
);


CREATE TABLE IF NOT EXISTS test_merge (
    id TEXT PRIMARY KEY,
    parent_test_id TEXT NOT NULL,
    child_test_id TEXT NOT NULL,
    questions_count INTEGER,  
    
    FOREIGN KEY (parent_test_id) REFERENCES tests(id) ON DELETE CASCADE,
    FOREIGN KEY (child_test_id) REFERENCES tests(id) ON DELETE CASCADE
);


CREATE TABLE IF NOT EXISTS questions (
    id TEXT PRIMARY KEY,
    test_id TEXT NOT NULL,
    
    text TEXT NOT NULL,
    type TEXT NOT NULL CHECK(type IN ('single', 'multiple', 'text', 'match', 'order')),
    
    
    
    
    
    
    weight INTEGER DEFAULT 1,        
    image_url TEXT,                  
    explanation TEXT,                
    sort_order INTEGER DEFAULT 0,
    
    created_at INTEGER DEFAULT (strftime('%s', 'now')),
    updated_at INTEGER DEFAULT (strftime('%s', 'now')),
    is_deleted INTEGER DEFAULT 0,
    
    FOREIGN KEY (test_id) REFERENCES tests(id) ON DELETE CASCADE
);


CREATE TABLE IF NOT EXISTS answers (
    id TEXT PRIMARY KEY,
    question_id TEXT NOT NULL,
    
    text TEXT NOT NULL,
    is_correct INTEGER DEFAULT 0,    
    position INTEGER,                
    
    created_at INTEGER DEFAULT (strftime('%s', 'now')),
    updated_at INTEGER DEFAULT (strftime('%s', 'now')),
    is_deleted INTEGER DEFAULT 0,
    
    FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE CASCADE
);


CREATE TABLE IF NOT EXISTS matching_pairs (
    id TEXT PRIMARY KEY,
    question_id TEXT NOT NULL,
    
    left_text TEXT NOT NULL,
    right_text TEXT NOT NULL,
    
    FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE CASCADE
);


CREATE TABLE IF NOT EXISTS attempts (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    test_id TEXT NOT NULL,
    
    started_at INTEGER DEFAULT (strftime('%s', 'now')),
    finished_at INTEGER,
    
    
    total_questions INTEGER,
    correct_answers INTEGER,
    score INTEGER,                   
    is_passed INTEGER DEFAULT 0,
    
    created_at INTEGER DEFAULT (strftime('%s', 'now')),
    updated_at INTEGER DEFAULT (strftime('%s', 'now')),
    is_deleted INTEGER DEFAULT 0,
    
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (test_id) REFERENCES tests(id)
);


CREATE TABLE IF NOT EXISTS user_answers (
    id TEXT PRIMARY KEY,
    attempt_id TEXT NOT NULL,
    question_id TEXT NOT NULL,
    
    answer_id TEXT,                  
    text_answer TEXT,                
    is_correct INTEGER,              
    
    created_at INTEGER DEFAULT (strftime('%s', 'now')),
    
    FOREIGN KEY (attempt_id) REFERENCES attempts(id) ON DELETE CASCADE,
    FOREIGN KEY (question_id) REFERENCES questions(id),
    FOREIGN KEY (answer_id) REFERENCES answers(id)
);


CREATE TABLE IF NOT EXISTS user_matching_answers (
    id TEXT PRIMARY KEY,
    attempt_id TEXT NOT NULL,
    question_id TEXT NOT NULL,
    pair_id TEXT NOT NULL,
    
    user_right_text TEXT,            
    is_correct INTEGER,
    
    created_at INTEGER DEFAULT (strftime('%s', 'now')),
    
    FOREIGN KEY (attempt_id) REFERENCES attempts(id) ON DELETE CASCADE,
    FOREIGN KEY (question_id) REFERENCES questions(id),
    FOREIGN KEY (pair_id) REFERENCES matching_pairs(id)
);


CREATE TABLE IF NOT EXISTS user_order_answers (
    id TEXT PRIMARY KEY,
    attempt_id TEXT NOT NULL,
    question_id TEXT NOT NULL,
    answer_id TEXT NOT NULL,
    
    user_position INTEGER,           
    is_correct INTEGER,
    
    created_at INTEGER DEFAULT (strftime('%s', 'now')),
    
    FOREIGN KEY (attempt_id) REFERENCES attempts(id) ON DELETE CASCADE,
    FOREIGN KEY (question_id) REFERENCES questions(id),
    FOREIGN KEY (answer_id) REFERENCES answers(id)
);


CREATE TABLE IF NOT EXISTS results (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    test_id TEXT NOT NULL,
    attempt_id TEXT NOT NULL,
    
    score INTEGER,
    is_passed INTEGER DEFAULT 0,
    
    
    synced INTEGER DEFAULT 0,
    synced_at INTEGER,
    google_classroom_id TEXT,
    
    created_at INTEGER DEFAULT (strftime('%s', 'now')),
    updated_at INTEGER DEFAULT (strftime('%s', 'now')),
    is_deleted INTEGER DEFAULT 0,
    
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (test_id) REFERENCES tests(id),
    FOREIGN KEY (attempt_id) REFERENCES attempts(id)
);

CREATE TABLE IF NOT EXISTS sheets_sync_queue (
    id TEXT PRIMARY KEY,
    result_id TEXT NOT NULL UNIQUE,
    teacher_id TEXT NOT NULL,
    payload_json TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','sent','failed')),
    attempts_count INTEGER DEFAULT 0,
    next_retry_at INTEGER,
    last_error TEXT,
    sent_at INTEGER,
    created_at INTEGER DEFAULT (strftime('%s', 'now')),
    updated_at INTEGER DEFAULT (strftime('%s', 'now')),
    FOREIGN KEY (result_id) REFERENCES results(id) ON DELETE CASCADE,
    FOREIGN KEY (teacher_id) REFERENCES users(id) ON DELETE CASCADE
);


CREATE TABLE IF NOT EXISTS student_disciplines (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    discipline_id TEXT NOT NULL,
    
    enrolled_at INTEGER DEFAULT (strftime('%s', 'now')),
    
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (discipline_id) REFERENCES disciplines(id) ON DELETE CASCADE,
    
    UNIQUE(user_id, discipline_id)
);





CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_google_id ON users(google_id);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);

CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token);
CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);

CREATE INDEX IF NOT EXISTS idx_topics_discipline ON topics(discipline_id);

CREATE INDEX IF NOT EXISTS idx_tests_discipline ON tests(discipline_id);
CREATE INDEX IF NOT EXISTS idx_tests_topic ON tests(topic_id);
CREATE INDEX IF NOT EXISTS idx_tests_created_by ON tests(created_by);

CREATE INDEX IF NOT EXISTS idx_questions_test ON questions(test_id);

CREATE INDEX IF NOT EXISTS idx_answers_question ON answers(question_id);

CREATE INDEX IF NOT EXISTS idx_matching_pairs_question ON matching_pairs(question_id);

CREATE INDEX IF NOT EXISTS idx_attempts_user ON attempts(user_id);
CREATE INDEX IF NOT EXISTS idx_attempts_test ON attempts(test_id);

CREATE INDEX IF NOT EXISTS idx_user_answers_attempt ON user_answers(attempt_id);

CREATE INDEX IF NOT EXISTS idx_results_user ON results(user_id);
CREATE INDEX IF NOT EXISTS idx_results_test ON results(test_id);
CREATE INDEX IF NOT EXISTS idx_results_synced ON results(synced);
CREATE INDEX IF NOT EXISTS idx_sheets_sync_queue_status_retry ON sheets_sync_queue(status, next_retry_at);
