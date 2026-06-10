require('dotenv').config();
const fs = require('fs');
const path = require('path');
const dbModule = require('./db');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

async function init() {
    console.log('🔧 Инициализация базы данных...');
    
    
    await dbModule.ready;
    const db = dbModule.getDb();
    
    
    const schemaPath = path.join(__dirname, '../database/schema.sql');
    const schema = fs.readFileSync(schemaPath, 'utf-8');
    
    
    const statements = schema.split(';').filter(s => s.trim());
    
    for (const statement of statements) {
        if (statement.trim()) {
            try {
                db.exec(statement + ';');
            } catch (err) {
                console.error('Ошибка выполнения:', statement.substring(0, 50) + '...');
                console.error(err.message);
            }
        }
    }
    
    console.log('✅ Схема базы данных создана');
    
    
    console.log('📝 Создание демо-данных...');
    
    
    let teacher = db.prepare("SELECT id FROM users WHERE email = 'teacher@test.ru'").get();
    let teacherId;
    
    if (teacher) {
        teacherId = teacher.id;
        console.log('   Учитель уже существует');
    } else {
        teacherId = uuidv4();
        const teacherPassword = bcrypt.hashSync('teacher123', 10);
        db.prepare(`
            INSERT INTO users (id, email, name, role, password_hash)
            VALUES (?, ?, ?, ?, ?)
        `).run(teacherId, 'teacher@test.ru', 'Иванов Иван Иванович', 'teacher', teacherPassword);
        console.log('   Учитель создан');
    }
    
    
    let student = db.prepare("SELECT id FROM users WHERE email = 'student@test.ru'").get();
    let studentId;
    
    if (student) {
        studentId = student.id;
        console.log('   Студент уже существует');
    } else {
        studentId = uuidv4();
        const studentPassword = bcrypt.hashSync('student123', 10);
        db.prepare(`
            INSERT INTO users (id, email, name, role, password_hash)
            VALUES (?, ?, ?, ?, ?)
        `).run(studentId, 'student@test.ru', 'Петров Петр Петрович', 'student', studentPassword);
        console.log('   Студент создан');
    }
    
    
    let discipline = db.prepare("SELECT id FROM disciplines WHERE title = 'Информатика' AND is_deleted = 0").get();
    let disciplineId;
    
    if (discipline) {
        disciplineId = discipline.id;
    } else {
        disciplineId = uuidv4();
        db.prepare(`
            INSERT INTO disciplines (id, title, description, created_by)
            VALUES (?, ?, ?, ?)
        `).run(disciplineId, 'Информатика', 'Основы информатики и программирования', teacherId);
    }
    
    
    let topic = db.prepare("SELECT id FROM topics WHERE title = 'Основы программирования' AND is_deleted = 0").get();
    let topicId;
    
    if (topic) {
        topicId = topic.id;
    } else {
        topicId = uuidv4();
        db.prepare(`
            INSERT INTO topics (id, discipline_id, title, description)
            VALUES (?, ?, ?, ?)
        `).run(topicId, disciplineId, 'Основы программирования', 'Введение в программирование');
    }
    
    
    let test = db.prepare("SELECT id FROM tests WHERE title = 'Тест по основам программирования' AND is_deleted = 0").get();
    let testId;
    
    if (test) {
        testId = test.id;
    } else {
        testId = uuidv4();
        db.prepare(`
            INSERT INTO tests (id, title, description, discipline_id, topic_id, 
                time_limit, attempts_limit, passing_score, shuffle_questions, is_published, created_by)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(testId, 'Тест по основам программирования', 'Проверка базовых знаний', 
            disciplineId, topicId, 1800, 3, 60, 1, 1, teacherId);
    }
    
    
    const existingQuestions = db.prepare("SELECT COUNT(*) as count FROM questions WHERE test_id = ?").get(testId);
    
    if (existingQuestions.count === 0) {
        
    
    
    const q1Id = uuidv4();
    db.prepare(`
        INSERT INTO questions (id, test_id, text, type, weight, sort_order)
        VALUES (?, ?, ?, ?, ?, ?)
    `).run(q1Id, testId, 'Какой язык программирования является статически типизированным?', 'single', 1, 1);
    
    const answers1 = [
        { text: 'Python', correct: 0 },
        { text: 'JavaScript', correct: 0 },
        { text: 'Java', correct: 1 },
        { text: 'Ruby', correct: 0 }
    ];
    
    for (const ans of answers1) {
        db.prepare(`
            INSERT INTO answers (id, question_id, text, is_correct)
            VALUES (?, ?, ?, ?)
        `).run(uuidv4(), q1Id, ans.text, ans.correct);
    }
    
    
    const q2Id = uuidv4();
    db.prepare(`
        INSERT INTO questions (id, test_id, text, type, weight, sort_order)
        VALUES (?, ?, ?, ?, ?, ?)
    `).run(q2Id, testId, 'Выберите языки программирования, которые поддерживают ООП:', 'multiple', 2, 2);
    
    const answers2 = [
        { text: 'C++', correct: 1 },
        { text: 'HTML', correct: 0 },
        { text: 'Python', correct: 1 },
        { text: 'Java', correct: 1 },
        { text: 'CSS', correct: 0 }
    ];
    
    for (const ans of answers2) {
        db.prepare(`
            INSERT INTO answers (id, question_id, text, is_correct)
            VALUES (?, ?, ?, ?)
        `).run(uuidv4(), q2Id, ans.text, ans.correct);
    }
    
    
    const q3Id = uuidv4();
    db.prepare(`
        INSERT INTO questions (id, test_id, text, type, weight, sort_order)
        VALUES (?, ?, ?, ?, ?, ?)
    `).run(q3Id, testId, 'Как называется процесс поиска и устранения ошибок в программе?', 'text', 1, 3);
    
    
    db.prepare(`
        INSERT INTO answers (id, question_id, text, is_correct)
        VALUES (?, ?, ?, ?)
    `).run(uuidv4(), q3Id, 'отладка', 1);
    
    db.prepare(`
        INSERT INTO answers (id, question_id, text, is_correct)
        VALUES (?, ?, ?, ?)
    `).run(uuidv4(), q3Id, 'debugging', 1);
    
    
    const q4Id = uuidv4();
    db.prepare(`
        INSERT INTO questions (id, test_id, text, type, weight, sort_order)
        VALUES (?, ?, ?, ?, ?, ?)
    `).run(q4Id, testId, 'Сопоставьте язык программирования с его основным применением:', 'match', 3, 4);
    
    const pairs = [
        { left: 'Python', right: 'Data Science' },
        { left: 'JavaScript', right: 'Web Frontend' },
        { left: 'SQL', right: 'Базы данных' },
        { left: 'C', right: 'Системное программирование' }
    ];
    
    for (const pair of pairs) {
        db.prepare(`
            INSERT INTO matching_pairs (id, question_id, left_text, right_text)
            VALUES (?, ?, ?, ?)
        `).run(uuidv4(), q4Id, pair.left, pair.right);
    }
    
    
    const q5Id = uuidv4();
    db.prepare(`
        INSERT INTO questions (id, test_id, text, type, weight, sort_order)
        VALUES (?, ?, ?, ?, ?, ?)
    `).run(q5Id, testId, 'Расположите этапы разработки ПО в правильном порядке:', 'order', 2, 5);
    
    const orderAnswers = [
        { text: 'Анализ требований', position: 1 },
        { text: 'Проектирование', position: 2 },
        { text: 'Разработка', position: 3 },
        { text: 'Тестирование', position: 4 },
        { text: 'Внедрение', position: 5 }
    ];
    
    for (const ans of orderAnswers) {
        db.prepare(`
            INSERT INTO answers (id, question_id, text, position)
            VALUES (?, ?, ?, ?)
        `).run(uuidv4(), q5Id, ans.text, ans.position);
    }
    } 
    
    
    const existingEnrollment = db.prepare(
        "SELECT id FROM student_disciplines WHERE user_id = ? AND discipline_id = ?"
    ).get(studentId, disciplineId);
    
    if (!existingEnrollment) {
        db.prepare(`
            INSERT INTO student_disciplines (id, user_id, discipline_id)
            VALUES (?, ?, ?)
        `).run(uuidv4(), studentId, disciplineId);
    }
    
    
    dbModule.save();
    
    console.log('✅ Демо-данные созданы');
    console.log('');
    console.log('📋 Учётные записи для входа:');
    console.log('   Преподаватель: teacher@test.ru / teacher123');
    console.log('   Студент: student@test.ru / student123');
    console.log('');
    console.log('🎉 База данных готова к работе!');
}

init().catch(err => {
    console.error('Ошибка инициализации:', err);
    process.exit(1);
});
