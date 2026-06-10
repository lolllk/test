require('dotenv').config();
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const dbModule = require('./db');

async function seed() {
    await dbModule.ready;
    const db = dbModule.getDb();
    const now = Math.floor(Date.now() / 1000);
    const ago = (days) => now - days * 86400;
    const hash = (pw) => bcrypt.hashSync(pw, 10);

    // Wipe existing data (order matters for FK)
    const tables = [
        'user_order_answers', 'user_matching_answers', 'user_answers',
        'results', 'attempts', 'student_disciplines', 'student_groups',
        'matching_pairs', 'answers', 'questions', 'test_merge', 'tests',
        'topics', 'disciplines', 'sessions', 'http_sessions', 'groups', 'users'
    ];
    db.exec('PRAGMA foreign_keys = OFF');
    for (const t of tables) {
        try { db.exec(`DELETE FROM ${t}`); } catch {}
    }
    db.exec('PRAGMA foreign_keys = ON');

    // ========== USERS ==========
    const t1 = uuidv4(), t2 = uuidv4();
    const s1 = uuidv4(), s2 = uuidv4(), s3 = uuidv4(), s4 = uuidv4(), s5 = uuidv4();

    const users = [
        [t1, 'ivanov@university.ru',  'Иванов Иван Петрович',     'teacher', hash('teacher1'), ago(60)],
        [t2, 'petrova@university.ru',  'Петрова Анна Сергеевна',   'teacher', hash('teacher2'), ago(45)],
        [s1, 'sidorov@student.ru',     'Сидоров Алексей Дмитриевич','student', hash('student1'), ago(30)],
        [s2, 'kuznecova@student.ru',   'Кузнецова Мария Игоревна', 'student', hash('student2'), ago(28)],
        [s3, 'volkov@student.ru',      'Волков Дмитрий Андреевич', 'student', hash('student3'), ago(25)],
        [s4, 'sokolova@student.ru',    'Соколова Елена Викторовна','student', hash('student4'), ago(20)],
        [s5, 'morozov@student.ru',     'Морозов Никита Олегович',  'student', hash('student5'), ago(15)],
    ];
    for (const [id, email, name, role, pw, cat] of users) {
        db.prepare(`INSERT INTO users (id,email,name,role,password_hash,created_at,updated_at) VALUES (?,?,?,?,?,?,?)`).run(id, email, name, role, pw, cat, cat);
    }

    // ========== GROUPS ==========
    const g1 = uuidv4(), g2 = uuidv4();
    db.prepare(`INSERT INTO groups (id,name,description,created_by,created_at) VALUES (?,?,?,?,?)`).run(g1, 'ИС-301', 'Информационные системы, 3 курс', t1, ago(40));
    db.prepare(`INSERT INTO groups (id,name,description,created_by,created_at) VALUES (?,?,?,?,?)`).run(g2, 'ПИ-201', 'Прикладная информатика, 2 курс', t2, ago(35));
    for (const uid of [s1, s2, s3]) {
        db.prepare(`INSERT INTO student_groups (id,user_id,group_id) VALUES (?,?,?)`).run(uuidv4(), uid, g1);
    }
    for (const uid of [s3, s4, s5]) {
        db.prepare(`INSERT INTO student_groups (id,user_id,group_id) VALUES (?,?,?)`).run(uuidv4(), uid, g2);
    }

    // ========== DISCIPLINES ==========
    const d1 = uuidv4(), d2 = uuidv4(), d3 = uuidv4();
    const disciplines = [
        [d1, 'Базы данных',         'Реляционные и NoSQL базы данных, SQL, проектирование', t1, ago(50)],
        [d2, 'Веб-программирование','HTML, CSS, JavaScript, Node.js, React',                t1, ago(48)],
        [d3, 'Операционные системы', 'Linux, Windows, процессы, файловые системы',           t2, ago(40)],
    ];
    for (const [id, title, desc, by, cat] of disciplines) {
        db.prepare(`INSERT INTO disciplines (id,title,description,created_by,created_at,updated_at) VALUES (?,?,?,?,?,?)`).run(id, title, desc, by, cat, cat);
    }

    // Enroll students
    for (const uid of [s1, s2, s3, s4]) {
        db.prepare(`INSERT INTO student_disciplines (id,user_id,discipline_id) VALUES (?,?,?)`).run(uuidv4(), uid, d1);
    }
    for (const uid of [s1, s2, s5]) {
        db.prepare(`INSERT INTO student_disciplines (id,user_id,discipline_id) VALUES (?,?,?)`).run(uuidv4(), uid, d2);
    }
    for (const uid of [s3, s4, s5]) {
        db.prepare(`INSERT INTO student_disciplines (id,user_id,discipline_id) VALUES (?,?,?)`).run(uuidv4(), uid, d3);
    }

    // ========== TOPICS ==========
    const tp1 = uuidv4(), tp2 = uuidv4(), tp3 = uuidv4(), tp4 = uuidv4();
    db.prepare(`INSERT INTO topics (id,discipline_id,title,description,sort_order,created_at) VALUES (?,?,?,?,?,?)`).run(tp1, d1, 'SQL-запросы',       'SELECT, INSERT, UPDATE, DELETE, JOIN', 1, ago(49));
    db.prepare(`INSERT INTO topics (id,discipline_id,title,description,sort_order,created_at) VALUES (?,?,?,?,?,?)`).run(tp2, d1, 'Нормализация',      '1НФ, 2НФ, 3НФ, НФБК',                 2, ago(49));
    db.prepare(`INSERT INTO topics (id,discipline_id,title,description,sort_order,created_at) VALUES (?,?,?,?,?,?)`).run(tp3, d2, 'JavaScript основы', 'Переменные, функции, DOM',              1, ago(47));
    db.prepare(`INSERT INTO topics (id,discipline_id,title,description,sort_order,created_at) VALUES (?,?,?,?,?,?)`).run(tp4, d3, 'Процессы Linux',    'ps, top, kill, systemctl',              1, ago(39));

    // ========== TESTS ==========
    // Test 1: SQL (single + multiple) — published, with topic
    const test1 = uuidv4();
    db.prepare(`INSERT INTO tests (id,title,description,discipline_id,topic_id,time_limit,attempts_limit,passing_score,shuffle_questions,shuffle_answers,is_published,created_by,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
        test1, 'SQL: SELECT-запросы', 'Основы выборки данных из таблиц', d1, tp1, 900, 3, 60, 1, 1, 1, t1, ago(40), ago(40));

    // Test 2: Normalization (text questions) — published
    const test2 = uuidv4();
    db.prepare(`INSERT INTO tests (id,title,description,discipline_id,topic_id,time_limit,attempts_limit,passing_score,is_published,created_by,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`).run(
        test2, 'Нормализация БД', 'Нормальные формы и денормализация', d1, tp2, 1200, 2, 70, 1, t1, ago(38), ago(38));

    // Test 3: JS (match + order) — published
    const test3 = uuidv4();
    db.prepare(`INSERT INTO tests (id,title,description,discipline_id,topic_id,time_limit,attempts_limit,passing_score,shuffle_questions,is_published,created_by,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
        test3, 'JavaScript: типы и операторы', 'Типы данных, операторы, приведение типов', d2, tp3, 600, 5, 50, 1, 1, t1, ago(35), ago(35));

    // Test 4: Linux (mix of all types) — published
    const test4 = uuidv4();
    db.prepare(`INSERT INTO tests (id,title,description,discipline_id,topic_id,time_limit,attempts_limit,passing_score,is_published,created_by,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`).run(
        test4, 'Процессы в Linux', 'Управление процессами в Linux', d3, tp4, 1800, 2, 60, 1, t2, ago(30), ago(30));

    // Test 5: Unpublished draft
    const test5 = uuidv4();
    db.prepare(`INSERT INTO tests (id,title,description,discipline_id,time_limit,passing_score,is_published,created_by,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)`).run(
        test5, 'Индексы и оптимизация (черновик)', 'B-tree, хеш-индексы, EXPLAIN', d1, 1500, 70, 0, t1, ago(5), ago(5));

    // Test 6: No time limit, unlimited attempts
    const test6 = uuidv4();
    db.prepare(`INSERT INTO tests (id,title,description,discipline_id,passing_score,is_published,created_by,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)`).run(
        test6, 'CSS Flexbox и Grid', 'Практика по CSS-верстке', d2, 40, 1, t1, ago(20), ago(20));

    // ========== QUESTIONS & ANSWERS ==========

    // --- Test 1: SQL SELECT (single + multiple) ---
    const q1a = uuidv4(); // single
    db.prepare(`INSERT INTO questions (id,test_id,text,type,weight,explanation,sort_order,created_at) VALUES (?,?,?,?,?,?,?,?)`).run(
        q1a, test1, 'Какой оператор используется для выборки данных из таблицы?', 'single', 1, 'SELECT — основной оператор выборки', 1, ago(40));
    const a1 = [[uuidv4(),'SELECT',1],[uuidv4(),'INSERT',0],[uuidv4(),'UPDATE',0],[uuidv4(),'DELETE',0]];
    a1.forEach(([id,text,cor],i) => db.prepare(`INSERT INTO answers (id,question_id,text,is_correct,position) VALUES (?,?,?,?,?)`).run(id, q1a, text, cor, i));

    const q1b = uuidv4(); // single
    db.prepare(`INSERT INTO questions (id,test_id,text,type,weight,sort_order,created_at) VALUES (?,?,?,?,?,?,?)`).run(
        q1b, test1, 'Какое ключевое слово исключает дубликаты в результате?', 'single', 1, 2, ago(40));
    const a2 = [[uuidv4(),'DISTINCT',1],[uuidv4(),'UNIQUE',0],[uuidv4(),'GROUP BY',0],[uuidv4(),'HAVING',0]];
    a2.forEach(([id,text,cor],i) => db.prepare(`INSERT INTO answers (id,question_id,text,is_correct,position) VALUES (?,?,?,?,?)`).run(id, q1b, text, cor, i));

    const q1c = uuidv4(); // multiple
    db.prepare(`INSERT INTO questions (id,test_id,text,type,weight,sort_order,created_at) VALUES (?,?,?,?,?,?,?)`).run(
        q1c, test1, 'Какие из перечисленных являются агрегатными функциями SQL? (несколько ответов)', 'multiple', 2, 3, ago(40));
    const a3 = [[uuidv4(),'COUNT()',1],[uuidv4(),'SUM()',1],[uuidv4(),'CONCAT()',0],[uuidv4(),'AVG()',1],[uuidv4(),'LENGTH()',0]];
    a3.forEach(([id,text,cor],i) => db.prepare(`INSERT INTO answers (id,question_id,text,is_correct,position) VALUES (?,?,?,?,?)`).run(id, q1c, text, cor, i));

    const q1d = uuidv4(); // single
    db.prepare(`INSERT INTO questions (id,test_id,text,type,weight,sort_order,created_at) VALUES (?,?,?,?,?,?,?)`).run(
        q1d, test1, 'Какой тип JOIN возвращает только совпадающие строки из обеих таблиц?', 'single', 1, 4, ago(40));
    const a4 = [[uuidv4(),'INNER JOIN',1],[uuidv4(),'LEFT JOIN',0],[uuidv4(),'RIGHT JOIN',0],[uuidv4(),'FULL JOIN',0]];
    a4.forEach(([id,text,cor],i) => db.prepare(`INSERT INTO answers (id,question_id,text,is_correct,position) VALUES (?,?,?,?,?)`).run(id, q1d, text, cor, i));

    // --- Test 2: Normalization (text questions + single) ---
    const q2a = uuidv4(); // text
    db.prepare(`INSERT INTO questions (id,test_id,text,type,weight,sort_order,created_at) VALUES (?,?,?,?,?,?,?)`).run(
        q2a, test2, 'Дайте определение первой нормальной формы (1НФ).', 'text', 3, 1, ago(38));

    const q2b = uuidv4(); // text
    db.prepare(`INSERT INTO questions (id,test_id,text,type,weight,sort_order,created_at) VALUES (?,?,?,?,?,?,?)`).run(
        q2b, test2, 'Приведите пример таблицы, нарушающей 2НФ, и покажите как её нормализовать.', 'text', 5, 2, ago(38));

    const q2c = uuidv4(); // single
    db.prepare(`INSERT INTO questions (id,test_id,text,type,weight,sort_order,created_at) VALUES (?,?,?,?,?,?,?)`).run(
        q2c, test2, 'Какая нормальная форма устраняет транзитивные зависимости?', 'single', 1, 3, ago(38));
    const a5 = [[uuidv4(),'1НФ',0],[uuidv4(),'2НФ',0],[uuidv4(),'3НФ',1],[uuidv4(),'НФБК',0]];
    a5.forEach(([id,text,cor],i) => db.prepare(`INSERT INTO answers (id,question_id,text,is_correct,position) VALUES (?,?,?,?,?)`).run(id, q2c, text, cor, i));

    // --- Test 3: JS (match + order + single) ---
    const q3a = uuidv4(); // match
    db.prepare(`INSERT INTO questions (id,test_id,text,type,weight,sort_order,created_at) VALUES (?,?,?,?,?,?,?)`).run(
        q3a, test3, 'Сопоставьте типы данных JavaScript с примерами значений:', 'match', 2, 1, ago(35));
    const pairs = [
        [uuidv4(),'number','42'],
        [uuidv4(),'string','"hello"'],
        [uuidv4(),'boolean','true'],
        [uuidv4(),'undefined','undefined'],
    ];
    pairs.forEach(([id,l,r]) => db.prepare(`INSERT INTO matching_pairs (id,question_id,left_text,right_text) VALUES (?,?,?,?)`).run(id, q3a, l, r));

    const q3b = uuidv4(); // order
    db.prepare(`INSERT INTO questions (id,test_id,text,type,weight,sort_order,created_at) VALUES (?,?,?,?,?,?,?)`).run(
        q3b, test3, 'Расположите операторы по приоритету выполнения (от высшего к низшему):', 'order', 2, 2, ago(35));
    const orderAnswers = [[uuidv4(),'() скобки',0],[uuidv4(),'! логическое НЕ',1],[uuidv4(),'* / умножение-деление',2],[uuidv4(),'+ - сложение-вычитание',3],[uuidv4(),'=== сравнение',4]];
    orderAnswers.forEach(([id,text,pos]) => db.prepare(`INSERT INTO answers (id,question_id,text,is_correct,position) VALUES (?,?,?,?,?)`).run(id, q3b, text, 1, pos));

    const q3c = uuidv4(); // single
    db.prepare(`INSERT INTO questions (id,test_id,text,type,weight,sort_order,created_at) VALUES (?,?,?,?,?,?,?)`).run(
        q3c, test3, 'Чему равно typeof null в JavaScript?', 'single', 1, 3, ago(35));
    const a6 = [[uuidv4(),'"object"',1],[uuidv4(),'"null"',0],[uuidv4(),'"undefined"',0],[uuidv4(),'"boolean"',0]];
    a6.forEach(([id,text,cor],i) => db.prepare(`INSERT INTO answers (id,question_id,text,is_correct,position) VALUES (?,?,?,?,?)`).run(id, q3c, text, cor, i));

    // --- Test 4: Linux (mix) ---
    const q4a = uuidv4(); // single
    db.prepare(`INSERT INTO questions (id,test_id,text,type,weight,sort_order,created_at) VALUES (?,?,?,?,?,?,?)`).run(
        q4a, test4, 'Какая команда отображает дерево процессов?', 'single', 1, 1, ago(30));
    const a7 = [[uuidv4(),'pstree',1],[uuidv4(),'ps aux',0],[uuidv4(),'top',0],[uuidv4(),'htop',0]];
    a7.forEach(([id,text,cor],i) => db.prepare(`INSERT INTO answers (id,question_id,text,is_correct,position) VALUES (?,?,?,?,?)`).run(id, q4a, text, cor, i));

    const q4b = uuidv4(); // multiple
    db.prepare(`INSERT INTO questions (id,test_id,text,type,weight,sort_order,created_at) VALUES (?,?,?,?,?,?,?)`).run(
        q4b, test4, 'Какие сигналы можно отправить процессу через kill? (несколько)', 'multiple', 2, 2, ago(30));
    const a8 = [[uuidv4(),'SIGTERM',1],[uuidv4(),'SIGKILL',1],[uuidv4(),'SIGHUP',1],[uuidv4(),'SIGSTART',0],[uuidv4(),'SIGRUN',0]];
    a8.forEach(([id,text,cor],i) => db.prepare(`INSERT INTO answers (id,question_id,text,is_correct,position) VALUES (?,?,?,?,?)`).run(id, q4b, text, cor, i));

    const q4c = uuidv4(); // text
    db.prepare(`INSERT INTO questions (id,test_id,text,type,weight,sort_order,created_at) VALUES (?,?,?,?,?,?,?)`).run(
        q4c, test4, 'Объясните разницу между SIGTERM и SIGKILL.', 'text', 3, 3, ago(30));

    const q4d = uuidv4(); // match
    db.prepare(`INSERT INTO questions (id,test_id,text,type,weight,sort_order,created_at) VALUES (?,?,?,?,?,?,?)`).run(
        q4d, test4, 'Сопоставьте команды с их назначением:', 'match', 2, 4, ago(30));
    const pairs2 = [
        [uuidv4(),'ps aux','Список всех процессов'],
        [uuidv4(),'kill -9','Принудительное завершение'],
        [uuidv4(),'nice','Приоритет процесса'],
        [uuidv4(),'nohup','Запуск без привязки к терминалу'],
    ];
    pairs2.forEach(([id,l,r]) => db.prepare(`INSERT INTO matching_pairs (id,question_id,left_text,right_text) VALUES (?,?,?,?)`).run(id, q4d, l, r));

    // --- Test 5: Draft (no questions yet) ---
    // (intentionally empty)

    // --- Test 6: CSS (single + multiple) ---
    const q6a = uuidv4();
    db.prepare(`INSERT INTO questions (id,test_id,text,type,weight,sort_order,created_at) VALUES (?,?,?,?,?,?,?)`).run(
        q6a, test6, 'Какое свойство делает контейнер flex-контейнером?', 'single', 1, 1, ago(20));
    const a9 = [[uuidv4(),'display: flex',1],[uuidv4(),'display: block',0],[uuidv4(),'display: grid',0],[uuidv4(),'display: inline',0]];
    a9.forEach(([id,text,cor],i) => db.prepare(`INSERT INTO answers (id,question_id,text,is_correct,position) VALUES (?,?,?,?,?)`).run(id, q6a, text, cor, i));

    const q6b = uuidv4();
    db.prepare(`INSERT INTO questions (id,test_id,text,type,weight,sort_order,created_at) VALUES (?,?,?,?,?,?,?)`).run(
        q6b, test6, 'Какие значения принимает justify-content? (несколько)', 'multiple', 2, 2, ago(20));
    const a10 = [[uuidv4(),'center',1],[uuidv4(),'space-between',1],[uuidv4(),'flex-start',1],[uuidv4(),'auto',0],[uuidv4(),'left',0]];
    a10.forEach(([id,text,cor],i) => db.prepare(`INSERT INTO answers (id,question_id,text,is_correct,position) VALUES (?,?,?,?,?)`).run(id, q6b, text, cor, i));

    // ========== ATTEMPTS & RESULTS ==========
    // Student 1: passed test1, failed test2 (needs review for text), passed test3
    const att1 = uuidv4();
    db.prepare(`INSERT INTO attempts (id,user_id,test_id,started_at,finished_at,total_questions,correct_answers,score,is_passed,needs_review,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)`).run(
        att1, s1, test1, ago(10), ago(10)+500, 4, 3, 75, 1, 0, ago(10));
    db.prepare(`INSERT INTO user_answers (id,attempt_id,question_id,answer_id,is_correct,created_at) VALUES (?,?,?,?,?,?)`).run(uuidv4(), att1, q1a, a1[0][0], 1, ago(10));
    db.prepare(`INSERT INTO user_answers (id,attempt_id,question_id,answer_id,is_correct,created_at) VALUES (?,?,?,?,?,?)`).run(uuidv4(), att1, q1b, a2[0][0], 1, ago(10));
    db.prepare(`INSERT INTO user_answers (id,attempt_id,question_id,answer_id,is_correct,created_at) VALUES (?,?,?,?,?,?)`).run(uuidv4(), att1, q1c, a3[0][0], 1, ago(10));
    db.prepare(`INSERT INTO user_answers (id,attempt_id,question_id,answer_id,is_correct,created_at) VALUES (?,?,?,?,?,?)`).run(uuidv4(), att1, q1d, a4[1][0], 0, ago(10));
    db.prepare(`INSERT INTO results (id,user_id,test_id,attempt_id,score,is_passed,needs_review,created_at) VALUES (?,?,?,?,?,?,?,?)`).run(uuidv4(), s1, test1, att1, 75, 1, 0, ago(10));

    const att2 = uuidv4();
    db.prepare(`INSERT INTO attempts (id,user_id,test_id,started_at,finished_at,total_questions,correct_answers,score,is_passed,needs_review,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)`).run(
        att2, s1, test2, ago(8), ago(8)+800, 3, 1, 33, 0, 1, ago(8));
    db.prepare(`INSERT INTO user_answers (id,attempt_id,question_id,text_answer,is_correct,created_at) VALUES (?,?,?,?,?,?)`).run(uuidv4(), att2, q2a, 'Каждый атрибут содержит только атомарные значения', null, ago(8));
    db.prepare(`INSERT INTO user_answers (id,attempt_id,question_id,text_answer,is_correct,created_at) VALUES (?,?,?,?,?,?)`).run(uuidv4(), att2, q2b, 'Таблица Заказы(OrderID, ProductID, ProductName) нарушает 2НФ', null, ago(8));
    db.prepare(`INSERT INTO user_answers (id,attempt_id,question_id,answer_id,is_correct,created_at) VALUES (?,?,?,?,?,?)`).run(uuidv4(), att2, q2c, a5[2][0], 1, ago(8));
    db.prepare(`INSERT INTO results (id,user_id,test_id,attempt_id,score,is_passed,needs_review,created_at) VALUES (?,?,?,?,?,?,?,?)`).run(uuidv4(), s1, test2, att2, 33, 0, 1, ago(8));

    // Student 2: passed test1 100%, passed test4
    const att3 = uuidv4();
    db.prepare(`INSERT INTO attempts (id,user_id,test_id,started_at,finished_at,total_questions,correct_answers,score,is_passed,needs_review,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)`).run(
        att3, s2, test1, ago(9), ago(9)+300, 4, 4, 100, 1, 0, ago(9));
    db.prepare(`INSERT INTO user_answers (id,attempt_id,question_id,answer_id,is_correct,created_at) VALUES (?,?,?,?,?,?)`).run(uuidv4(), att3, q1a, a1[0][0], 1, ago(9));
    db.prepare(`INSERT INTO user_answers (id,attempt_id,question_id,answer_id,is_correct,created_at) VALUES (?,?,?,?,?,?)`).run(uuidv4(), att3, q1b, a2[0][0], 1, ago(9));
    db.prepare(`INSERT INTO user_answers (id,attempt_id,question_id,answer_id,is_correct,created_at) VALUES (?,?,?,?,?,?)`).run(uuidv4(), att3, q1c, a3[0][0], 1, ago(9));
    db.prepare(`INSERT INTO user_answers (id,attempt_id,question_id,answer_id,is_correct,created_at) VALUES (?,?,?,?,?,?)`).run(uuidv4(), att3, q1d, a4[0][0], 1, ago(9));
    db.prepare(`INSERT INTO results (id,user_id,test_id,attempt_id,score,is_passed,needs_review,created_at) VALUES (?,?,?,?,?,?,?,?)`).run(uuidv4(), s2, test1, att3, 100, 1, 0, ago(9));

    // Student 3: failed test4 (has text answer needing review), passed test6
    const att4 = uuidv4();
    db.prepare(`INSERT INTO attempts (id,user_id,test_id,started_at,finished_at,total_questions,correct_answers,score,is_passed,needs_review,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)`).run(
        att4, s3, test4, ago(7), ago(7)+900, 4, 1, 25, 0, 1, ago(7));
    db.prepare(`INSERT INTO user_answers (id,attempt_id,question_id,answer_id,is_correct,created_at) VALUES (?,?,?,?,?,?)`).run(uuidv4(), att4, q4a, a7[0][0], 1, ago(7));
    db.prepare(`INSERT INTO user_answers (id,attempt_id,question_id,answer_id,is_correct,created_at) VALUES (?,?,?,?,?,?)`).run(uuidv4(), att4, q4b, a8[3][0], 0, ago(7));
    db.prepare(`INSERT INTO user_answers (id,attempt_id,question_id,text_answer,is_correct,created_at) VALUES (?,?,?,?,?,?)`).run(uuidv4(), att4, q4c, 'SIGTERM можно перехватить, SIGKILL нельзя', null, ago(7));
    db.prepare(`INSERT INTO results (id,user_id,test_id,attempt_id,score,is_passed,needs_review,created_at) VALUES (?,?,?,?,?,?,?,?)`).run(uuidv4(), s3, test4, att4, 25, 0, 1, ago(7));

    const att5 = uuidv4();
    db.prepare(`INSERT INTO attempts (id,user_id,test_id,started_at,finished_at,total_questions,correct_answers,score,is_passed,needs_review,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)`).run(
        att5, s3, test6, ago(5), ago(5)+200, 2, 2, 100, 1, 0, ago(5));
    db.prepare(`INSERT INTO user_answers (id,attempt_id,question_id,answer_id,is_correct,created_at) VALUES (?,?,?,?,?,?)`).run(uuidv4(), att5, q6a, a9[0][0], 1, ago(5));
    db.prepare(`INSERT INTO user_answers (id,attempt_id,question_id,answer_id,is_correct,created_at) VALUES (?,?,?,?,?,?)`).run(uuidv4(), att5, q6b, a10[0][0], 1, ago(5));
    db.prepare(`INSERT INTO results (id,user_id,test_id,attempt_id,score,is_passed,needs_review,created_at) VALUES (?,?,?,?,?,?,?,?)`).run(uuidv4(), s3, test6, att5, 100, 1, 0, ago(5));

    // Student 4: took test1 twice (failed then passed)
    const att6 = uuidv4();
    db.prepare(`INSERT INTO attempts (id,user_id,test_id,started_at,finished_at,total_questions,correct_answers,score,is_passed,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)`).run(
        att6, s4, test1, ago(12), ago(12)+600, 4, 1, 25, 0, ago(12));
    db.prepare(`INSERT INTO user_answers (id,attempt_id,question_id,answer_id,is_correct,created_at) VALUES (?,?,?,?,?,?)`).run(uuidv4(), att6, q1a, a1[0][0], 1, ago(12));
    db.prepare(`INSERT INTO user_answers (id,attempt_id,question_id,answer_id,is_correct,created_at) VALUES (?,?,?,?,?,?)`).run(uuidv4(), att6, q1b, a2[2][0], 0, ago(12));
    db.prepare(`INSERT INTO user_answers (id,attempt_id,question_id,answer_id,is_correct,created_at) VALUES (?,?,?,?,?,?)`).run(uuidv4(), att6, q1c, a3[2][0], 0, ago(12));
    db.prepare(`INSERT INTO user_answers (id,attempt_id,question_id,answer_id,is_correct,created_at) VALUES (?,?,?,?,?,?)`).run(uuidv4(), att6, q1d, a4[2][0], 0, ago(12));
    db.prepare(`INSERT INTO results (id,user_id,test_id,attempt_id,score,is_passed,created_at) VALUES (?,?,?,?,?,?,?)`).run(uuidv4(), s4, test1, att6, 25, 0, ago(12));

    const att7 = uuidv4();
    db.prepare(`INSERT INTO attempts (id,user_id,test_id,started_at,finished_at,total_questions,correct_answers,score,is_passed,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)`).run(
        att7, s4, test1, ago(6), ago(6)+450, 4, 3, 75, 1, ago(6));
    db.prepare(`INSERT INTO user_answers (id,attempt_id,question_id,answer_id,is_correct,created_at) VALUES (?,?,?,?,?,?)`).run(uuidv4(), att7, q1a, a1[0][0], 1, ago(6));
    db.prepare(`INSERT INTO user_answers (id,attempt_id,question_id,answer_id,is_correct,created_at) VALUES (?,?,?,?,?,?)`).run(uuidv4(), att7, q1b, a2[0][0], 1, ago(6));
    db.prepare(`INSERT INTO user_answers (id,attempt_id,question_id,answer_id,is_correct,created_at) VALUES (?,?,?,?,?,?)`).run(uuidv4(), att7, q1c, a3[0][0], 1, ago(6));
    db.prepare(`INSERT INTO user_answers (id,attempt_id,question_id,answer_id,is_correct,created_at) VALUES (?,?,?,?,?,?)`).run(uuidv4(), att7, q1d, a4[3][0], 0, ago(6));
    db.prepare(`INSERT INTO results (id,user_id,test_id,attempt_id,score,is_passed,created_at) VALUES (?,?,?,?,?,?,?)`).run(uuidv4(), s4, test1, att7, 75, 1, ago(6));

    // Student 5: no attempts yet (just enrolled)

    dbModule.save();
    console.log('');
    console.log('=== Тестовые данные созданы ===');
    console.log('');
    console.log('Преподаватели:');
    console.log('  ivanov@university.ru    / teacher1  (БД, Веб)');
    console.log('  petrova@university.ru   / teacher2  (ОС)');
    console.log('');
    console.log('Студенты:');
    console.log('  sidorov@student.ru      / student1');
    console.log('  kuznecova@student.ru    / student2');
    console.log('  volkov@student.ru       / student3');
    console.log('  sokolova@student.ru     / student4');
    console.log('  morozov@student.ru      / student5  (без попыток)');
    console.log('');
    console.log('Группы: ИС-301 (Иванов), ПИ-201 (Петрова)');
    console.log('Дисциплины: 3 | Темы: 4 | Тесты: 6 (5 опубл + 1 черновик)');
    console.log('Типы вопросов: single, multiple, text, match, order');
    console.log('Попытки: 7 | Результаты: 7 (из них 2 на проверку)');
    console.log('');
    process.exit(0);
}

seed().catch(e => { console.error(e); process.exit(1); });
