const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcryptjs');
const dbModule = require('../db');
const { isAuthenticated, hasRole } = require('./auth');


const getDb = () => dbModule.getDb();


router.use(isAuthenticated, hasRole('teacher'));


function validateStringLength(value, fieldName, min, max) {
    if (!value || !value.trim()) {
        return `Укажите ${fieldName}`;
    }
    const trimmed = value.trim();
    if (min && trimmed.length < min) {
        return `${fieldName}: минимум ${min} символов`;
    }
    if (max && trimmed.length > max) {
        return `${fieldName}: максимум ${max} символов`;
    }
    return null;
}


function validateTestParams({ time_limit, attempts_limit, questions_limit, passing_score }) {
    if (time_limit !== null && time_limit !== undefined) {
        const t = parseInt(time_limit);
        if (isNaN(t) || t < 60 || t > 36000) {
            return 'Время теста: от 1 до 600 минут';
        }
    }
    if (attempts_limit !== null && attempts_limit !== undefined) {
        const a = parseInt(attempts_limit);
        if (isNaN(a) || a < 1 || a > 100) {
            return 'Количество попыток: от 1 до 100';
        }
    }
    if (questions_limit !== null && questions_limit !== undefined && questions_limit !== '') {
        const q = parseInt(questions_limit);
        if (isNaN(q) || q < 1 || q > 500) {
            return 'Лимит вопросов: от 1 до 500';
        }
    }
    if (passing_score !== null && passing_score !== undefined) {
        const p = parseInt(passing_score);
        if (isNaN(p) || p < 0 || p > 100) {
            return 'Проходной балл: от 0 до 100';
        }
    }
    return null;
}

const VALID_QUESTION_TYPES = ['single', 'multiple', 'text', 'match', 'order'];


function getTeacherDiscipline(db, disciplineId, teacherId) {
    return db.prepare(`
        SELECT d.*
        FROM disciplines d
        WHERE d.id = ? AND d.created_by = ? AND d.is_deleted = 0
    `).get(disciplineId, teacherId);
}


function getTeacherTest(db, testId, teacherId) {
    return db.prepare(`
        SELECT t.*
        FROM tests t
        WHERE t.id = ? AND t.created_by = ? AND t.is_deleted = 0
    `).get(testId, teacherId);
}




router.post('/disciplines', (req, res) => {
    try {
        const db = getDb();
        const { title, description } = req.body;
        
        const titleErr = validateStringLength(title, 'Название дисциплины', 1, 200);
        if (titleErr) return res.status(400).json({ error: titleErr });
        
        if (description && description.length > 2000) {
            return res.status(400).json({ error: 'Описание: максимум 2000 символов' });
        }
        
        const id = uuidv4();
        db.prepare(`
            INSERT INTO disciplines (id, title, description, created_by)
            VALUES (?, ?, ?, ?)
        `).run(id, title, description, req.user.id);
        
        dbModule.save();
        
        const discipline = db.prepare('SELECT * FROM disciplines WHERE id = ?').get(id);
        res.json(discipline);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Ошибка создания дисциплины' });
    }
});


router.put('/disciplines/:id', (req, res) => {
    try {
        const db = getDb();
        const { title, description } = req.body;

        const discipline = getTeacherDiscipline(db, req.params.id, req.user.id);
        if (!discipline) {
            return res.status(404).json({ error: 'Дисциплина не найдена' });
        }
        
        const titleErr = validateStringLength(title, 'Название дисциплины', 1, 200);
        if (titleErr) return res.status(400).json({ error: titleErr });
        
        if (description && description.length > 2000) {
            return res.status(400).json({ error: 'Описание: максимум 2000 символов' });
        }
        
        db.prepare(`
            UPDATE disciplines 
            SET title = ?, description = ?, updated_at = strftime('%s', 'now')
            WHERE id = ? AND created_by = ?
        `).run(title, description, req.params.id, req.user.id);
        
        dbModule.save();
        
        const updatedDiscipline = db.prepare('SELECT * FROM disciplines WHERE id = ? AND created_by = ?').get(req.params.id, req.user.id);
        res.json(updatedDiscipline);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Ошибка обновления дисциплины' });
    }
});


router.delete('/disciplines/:id', (req, res) => {
    try {
        const db = getDb();

        const discipline = getTeacherDiscipline(db, req.params.id, req.user.id);
        if (!discipline) {
            return res.status(404).json({ error: 'Дисциплина не найдена' });
        }
        db.prepare(`
            UPDATE disciplines 
            SET is_deleted = 1, updated_at = strftime('%s', 'now')
            WHERE id = ? AND created_by = ?
        `).run(req.params.id, req.user.id);
        
        dbModule.save();
        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Ошибка удаления дисциплины' });
    }
});




router.post('/topics', (req, res) => {
    try {
        const db = getDb();
        const { discipline_id, title, description } = req.body;
        
        if (!discipline_id) {
            return res.status(400).json({ error: 'Укажите дисциплину' });
        }

        const discipline = getTeacherDiscipline(db, discipline_id, req.user.id);
        if (!discipline) {
            return res.status(404).json({ error: 'Дисциплина не найдена' });
        }
        const titleErr = validateStringLength(title, 'Название темы', 1, 200);
        if (titleErr) return res.status(400).json({ error: titleErr });
        
        if (description && description.length > 2000) {
            return res.status(400).json({ error: 'Описание: максимум 2000 символов' });
        }
        
        const id = uuidv4();
        const sortOrder = db.prepare(`
            SELECT COALESCE(MAX(sort_order), 0) + 1 as next FROM topics WHERE discipline_id = ?
        `).get(discipline_id).next;
        
        db.prepare(`
            INSERT INTO topics (id, discipline_id, title, description, sort_order)
            VALUES (?, ?, ?, ?, ?)
        `).run(id, discipline_id, title, description, sortOrder);
        
        dbModule.save();
        
        const topic = db.prepare('SELECT * FROM topics WHERE id = ?').get(id);
        res.json(topic);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Ошибка создания темы' });
    }
});


router.put('/topics/:id', (req, res) => {
    try {
        const db = getDb();
        const { title, description, sort_order } = req.body;
        
        const titleErr = validateStringLength(title, 'Название темы', 1, 200);
        if (titleErr) return res.status(400).json({ error: titleErr });
        
        if (description && description.length > 2000) {
            return res.status(400).json({ error: 'Описание: максимум 2000 символов' });
        }
        
        
        const existingTopic = db.prepare(`
            SELECT t.id FROM topics t
            JOIN disciplines d ON d.id = t.discipline_id
            WHERE t.id = ? AND d.created_by = ?
        `).get(req.params.id, req.user.id);
        if (!existingTopic) {
            return res.status(404).json({ error: 'Тема не найдена' });
        }
        
        db.prepare(`
            UPDATE topics 
            SET title = ?, description = ?, sort_order = COALESCE(?, sort_order), updated_at = strftime('%s', 'now')
            WHERE id = ?
        `).run(title, description, sort_order, req.params.id);
        
        dbModule.save();
        
        const topic = db.prepare('SELECT * FROM topics WHERE id = ?').get(req.params.id);
        res.json(topic);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Ошибка обновления темы' });
    }
});


router.delete('/topics/:id', (req, res) => {
    try {
        const db = getDb();
        
        
        const topic = db.prepare(`
            SELECT t.id FROM topics t
            JOIN disciplines d ON d.id = t.discipline_id
            WHERE t.id = ? AND d.created_by = ?
        `).get(req.params.id, req.user.id);
        if (!topic) {
            return res.status(404).json({ error: 'Тема не найдена' });
        }
        
        db.prepare(`
            UPDATE topics 
            SET is_deleted = 1, updated_at = strftime('%s', 'now')
            WHERE id = ?
        `).run(req.params.id);
        
        dbModule.save();
        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Ошибка удаления темы' });
    }
});




router.post('/tests', (req, res) => {
    try {
        const db = getDb();
        const {
            title, description, discipline_id, topic_id,
            time_limit, attempts_limit, questions_limit, passing_score,
            shuffle_questions, shuffle_answers, is_published
        } = req.body;
        
        const titleErr = validateStringLength(title, 'Название теста', 1, 200);
        if (titleErr) return res.status(400).json({ error: titleErr });
        
        if (!discipline_id) {
            return res.status(400).json({ error: 'Выберите дисциплину' });
        }

        const discipline = getTeacherDiscipline(db, discipline_id, req.user.id);
        if (!discipline) {
            return res.status(404).json({ error: 'Дисциплина не найдена' });
        }

        if (topic_id) {
            const topic = db.prepare(`
                SELECT t.id
                FROM topics t
                WHERE t.id = ? AND t.discipline_id = ? AND t.is_deleted = 0
            `).get(topic_id, discipline_id);
            if (!topic) {
                return res.status(400).json({ error: 'Тема не принадлежит выбранной дисциплине' });
            }
        }
        
        if (description && description.length > 2000) {
            return res.status(400).json({ error: 'Описание: максимум 2000 символов' });
        }
        
        const paramsErr = validateTestParams({ time_limit, attempts_limit, questions_limit, passing_score });
        if (paramsErr) return res.status(400).json({ error: paramsErr });
        
        const id = uuidv4();
        db.prepare(`
            INSERT INTO tests (
                id, title, description, discipline_id, topic_id,
                time_limit, attempts_limit, questions_limit, passing_score,
                shuffle_questions, shuffle_answers, is_published, created_by
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
            id, 
            title, 
            description || null, 
            discipline_id, 
            topic_id || null,
            time_limit || null, 
            attempts_limit || 1, 
            questions_limit || null, 
            passing_score || 60,
            shuffle_questions ? 1 : 0, 
            shuffle_answers ? 1 : 0, 
            is_published ? 1 : 0, 
            req.user.id
        );
        
        dbModule.save();
        
        const test = db.prepare('SELECT * FROM tests WHERE id = ?').get(id);
        res.json(test);
    } catch (err) {
        console.error('Error creating test:', err);
        res.status(500).json({ error: 'Ошибка создания теста' });
    }
});


router.put('/tests/:id', (req, res) => {
    try {
        const db = getDb();
        const {
            title, description, discipline_id, topic_id,
            time_limit, attempts_limit, questions_limit, passing_score,
            shuffle_questions, shuffle_answers, is_published
        } = req.body;

        const existingTest = getTeacherTest(db, req.params.id, req.user.id);
        if (!existingTest) {
            return res.status(404).json({ error: 'Тест не найден' });
        }

        const targetDisciplineId = discipline_id || existingTest.discipline_id;
        const discipline = getTeacherDiscipline(db, targetDisciplineId, req.user.id);
        if (!discipline) {
            return res.status(404).json({ error: 'Дисциплина не найдена' });
        }

        if (topic_id) {
            const topic = db.prepare(`
                SELECT t.id
                FROM topics t
                WHERE t.id = ? AND t.discipline_id = ? AND t.is_deleted = 0
            `).get(topic_id, targetDisciplineId);
            if (!topic) {
                return res.status(400).json({ error: 'Тема не принадлежит выбранной дисциплине' });
            }
        }
        
        const titleErr = validateStringLength(title, 'Название теста', 1, 200);
        if (titleErr) return res.status(400).json({ error: titleErr });
        
        if (description && description.length > 2000) {
            return res.status(400).json({ error: 'Описание: максимум 2000 символов' });
        }
        
        const paramsErr = validateTestParams({ time_limit, attempts_limit, questions_limit, passing_score });
        if (paramsErr) return res.status(400).json({ error: paramsErr });
        
        db.prepare(`
            UPDATE tests SET
                title = ?, description = ?, discipline_id = ?, topic_id = ?,
                time_limit = ?, attempts_limit = ?, questions_limit = ?, passing_score = ?,
                shuffle_questions = ?, shuffle_answers = ?, is_published = ?,
                updated_at = strftime('%s', 'now')
            WHERE id = ? AND created_by = ?
        `).run(
            title.trim(), 
            description || null, 
            targetDisciplineId || null, 
            topic_id || null,
            time_limit || null, 
            attempts_limit || 1, 
            questions_limit || null, 
            passing_score || 60,
            shuffle_questions ? 1 : 0, 
            shuffle_answers ? 1 : 0, 
            is_published ? 1 : 0,
            req.params.id, 
            req.user.id
        );
        
        dbModule.save();
        
        const test = db.prepare('SELECT * FROM tests WHERE id = ?').get(req.params.id);
        res.json(test);
    } catch (err) {
        console.error('Error updating test:', err);
        res.status(500).json({ error: 'Ошибка обновления теста' });
    }
});


router.delete('/tests/:id', (req, res) => {
    try {
        const db = getDb();

        const test = getTeacherTest(db, req.params.id, req.user.id);
        if (!test) {
            return res.status(404).json({ error: 'Тест не найден' });
        }
        db.prepare(`
            UPDATE tests 
            SET is_deleted = 1, updated_at = strftime('%s', 'now')
            WHERE id = ? AND created_by = ?
        `).run(req.params.id, req.user.id);
        
        dbModule.save();
        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Ошибка удаления теста' });
    }
});


router.post('/tests/:id/merge', (req, res) => {
    try {
        const db = getDb();
        const { child_test_ids, questions_counts } = req.body;

        const parentTest = getTeacherTest(db, req.params.id, req.user.id);
        if (!parentTest) {
            return res.status(404).json({ error: 'Тест не найден' });
        }

        const childIds = Array.isArray(child_test_ids) ? child_test_ids : [];
        if (childIds.length === 0) {
            return res.status(400).json({ error: 'Укажите дочерние тесты' });
        }

        const childPlaceholders = childIds.map(() => '?').join(',');
        const ownedChildren = db.prepare(`
            SELECT id FROM tests
            WHERE id IN (${childPlaceholders}) AND created_by = ? AND is_deleted = 0
        `).all(...childIds, req.user.id);

        if (ownedChildren.length !== childIds.length) {
            return res.status(404).json({ error: 'Один из тестов не найден' });
        }
        
        
        db.prepare('DELETE FROM test_merge WHERE parent_test_id = ?').run(req.params.id);
        
        
        for (let i = 0; i < childIds.length; i++) {
            db.prepare(`
                INSERT INTO test_merge (id, parent_test_id, child_test_id, questions_count)
                VALUES (?, ?, ?, ?)
            `).run(uuidv4(), req.params.id, childIds[i], questions_counts?.[i] || null);
        }
        
        dbModule.save();
        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Ошибка слияния тестов' });
    }
});




router.get('/tests/:id/questions', (req, res) => {
    try {
        const db = getDb();
        const test = getTeacherTest(db, req.params.id, req.user.id);
        if (!test) {
            return res.status(404).json({ error: 'Тест не найден' });
        }

        const questions = db.prepare(`
            SELECT * FROM questions
            WHERE test_id = ? AND is_deleted = 0
            ORDER BY sort_order
        `).all(req.params.id);
        
        for (let q of questions) {
            if (q.type === 'match') {
                q.pairs = db.prepare(`
                    SELECT * FROM matching_pairs WHERE question_id = ?
                `).all(q.id);
            } else {
                q.answers = db.prepare(`
                    SELECT * FROM answers WHERE question_id = ? AND is_deleted = 0 ORDER BY position, id
                `).all(q.id);
            }
        }
        
        res.json(questions);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Ошибка получения вопросов' });
    }
});


router.post('/questions', (req, res) => {
    try {
        const db = getDb();
        const { test_id, text, type, weight, image_url, explanation, answers, pairs } = req.body;
        
        if (!test_id) {
            return res.status(400).json({ error: 'Не указан тест' });
        }

        const test = getTeacherTest(db, test_id, req.user.id);
        if (!test) {
            return res.status(404).json({ error: 'Тест не найден' });
        }
        
        const textErr = validateStringLength(text, 'Текст вопроса', 1, 5000);
        if (textErr) return res.status(400).json({ error: textErr });
        
        if (!type || !VALID_QUESTION_TYPES.includes(type)) {
            return res.status(400).json({ error: 'Некорректный тип вопроса' });
        }
        
        if (weight !== undefined && weight !== null) {
            const w = parseInt(weight);
            if (isNaN(w) || w < 1 || w > 100) {
                return res.status(400).json({ error: 'Вес вопроса: от 1 до 100' });
            }
        }
        
        const id = uuidv4();
        const sortOrder = db.prepare(`
            SELECT COALESCE(MAX(sort_order), 0) + 1 as next FROM questions WHERE test_id = ?
        `).get(test_id).next;
        
        db.prepare(`
            INSERT INTO questions (id, test_id, text, type, weight, image_url, explanation, sort_order)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
            id, 
            test_id, 
            text, 
            type, 
            weight || 1, 
            image_url || null, 
            explanation || null, 
            sortOrder
        );
        
        
        if (type === 'match' && pairs && pairs.length > 0) {
            for (const pair of pairs) {
                if (pair.left_text && pair.right_text) {
                    db.prepare(`
                        INSERT INTO matching_pairs (id, question_id, left_text, right_text)
                        VALUES (?, ?, ?, ?)
                    `).run(uuidv4(), id, pair.left_text, pair.right_text);
                }
            }
        } else if (answers && answers.length > 0) {
            for (let i = 0; i < answers.length; i++) {
                const ans = answers[i];
                if (ans.text) {
                    db.prepare(`
                        INSERT INTO answers (id, question_id, text, is_correct, position)
                        VALUES (?, ?, ?, ?, ?)
                    `).run(
                        uuidv4(), 
                        id, 
                        ans.text, 
                        ans.is_correct ? 1 : 0, 
                        ans.position || i + 1
                    );
                }
            }
        }
        
        dbModule.save();
        
        const question = db.prepare('SELECT * FROM questions WHERE id = ?').get(id);
        res.json(question);
    } catch (err) {
        console.error('Error creating question:', err);
        res.status(500).json({ error: 'Ошибка создания вопроса: ' + err.message });
    }
});


router.get('/questions/:id', (req, res) => {
    try {
        const db = getDb();
        const question = db.prepare(`
            SELECT q.*
            FROM questions q
            JOIN tests t ON t.id = q.test_id
            WHERE q.id = ? AND q.is_deleted = 0 AND t.created_by = ?
        `).get(req.params.id, req.user.id);
        
        if (!question) {
            return res.status(404).json({ error: 'Вопрос не найден' });
        }
        
        
        if (question.type === 'match') {
            question.pairs = db.prepare(`
                SELECT * FROM matching_pairs WHERE question_id = ?
            `).all(question.id);
        } else {
            question.answers = db.prepare(`
                SELECT * FROM answers WHERE question_id = ? AND is_deleted = 0 ORDER BY position, id
            `).all(question.id);
        }
        
        res.json(question);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Ошибка получения вопроса' });
    }
});


router.put('/questions/:id', (req, res) => {
    try {
        const db = getDb();
        const { text, type, weight, image_url, explanation, sort_order, answers, pairs } = req.body;
        
        
        const question = db.prepare(`
            SELECT q.* FROM questions q
            JOIN tests t ON t.id = q.test_id
            WHERE q.id = ? AND q.is_deleted = 0 AND t.created_by = ?
        `).get(req.params.id, req.user.id);
        if (!question) {
            return res.status(404).json({ error: 'Вопрос не найден' });
        }
        
        db.prepare(`
            UPDATE questions SET
                text = ?, type = ?, weight = ?, image_url = ?, explanation = ?, 
                sort_order = COALESCE(?, sort_order), updated_at = strftime('%s', 'now')
            WHERE id = ?
        `).run(
            text || null, 
            type || null, 
            weight || 1, 
            image_url || null, 
            explanation || null, 
            sort_order || null, 
            req.params.id
        );
        
        
        if (type === 'match' && pairs && pairs.length > 0) {
            
            db.prepare('DELETE FROM matching_pairs WHERE question_id = ?').run(req.params.id);
            
            for (const pair of pairs) {
                if (pair.left_text && pair.right_text) {
                    db.prepare(`
                        INSERT INTO matching_pairs (id, question_id, left_text, right_text)
                        VALUES (?, ?, ?, ?)
                    `).run(uuidv4(), req.params.id, pair.left_text, pair.right_text);
                }
            }
        } else if (answers && answers.length > 0) {
            
            db.prepare(`
                UPDATE answers SET is_deleted = 1 WHERE question_id = ?
            `).run(req.params.id);
            
            for (let i = 0; i < answers.length; i++) {
                const ans = answers[i];
                if (ans.text) {
                    db.prepare(`
                        INSERT INTO answers (id, question_id, text, is_correct, position)
                        VALUES (?, ?, ?, ?, ?)
                    `).run(uuidv4(), req.params.id, ans.text, ans.is_correct ? 1 : 0, ans.position || i + 1);
                }
            }
        }
        
        dbModule.save();
        
        const updated = db.prepare('SELECT * FROM questions WHERE id = ?').get(req.params.id);
        res.json(updated);
    } catch (err) {
        console.error('Error updating question:', err);
        res.status(500).json({ error: 'Ошибка обновления вопроса' });
    }
});


router.delete('/questions/:id', (req, res) => {
    try {
        const db = getDb();
        
        
        const question = db.prepare(`
            SELECT q.id FROM questions q
            JOIN tests t ON t.id = q.test_id
            WHERE q.id = ? AND t.created_by = ?
        `).get(req.params.id, req.user.id);
        if (!question) {
            return res.status(404).json({ error: 'Вопрос не найден' });
        }
        
        db.prepare(`
            UPDATE questions 
            SET is_deleted = 1, updated_at = strftime('%s', 'now')
            WHERE id = ?
        `).run(req.params.id);
        
        dbModule.save();
        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Ошибка удаления вопроса' });
    }
});




router.get('/students', (req, res) => {
    try {
        const db = getDb();
        const { group_id, limit = 100, offset = 0 } = req.query;

        let sql, params;
        if (group_id) {
            const group = getTeacherGroup(db, group_id, req.user.id);
            if (!group) return res.status(404).json({ error: 'Группа не найдена' });
            sql = `
                SELECT u.id, u.name, u.email, u.avatar_url, u.created_at,
                       u.sync_status, u.google_id, u.created_offline
                FROM users u
                JOIN student_groups sg ON sg.user_id = u.id
                WHERE sg.group_id = ? AND u.is_deleted = 0
                ORDER BY u.name
                LIMIT ? OFFSET ?
            `;
            params = [group_id, parseInt(limit), parseInt(offset)];
        } else {
            sql = `
                SELECT u.id, u.name, u.email, u.avatar_url, u.created_at,
                       u.sync_status, u.google_id, u.created_offline
                FROM users u
                WHERE u.role = 'student' AND u.is_deleted = 0
                AND (
                    EXISTS (
                        SELECT 1 FROM student_disciplines sd
                        JOIN disciplines d ON d.id = sd.discipline_id
                        WHERE sd.user_id = u.id AND d.created_by = ? AND d.is_deleted = 0
                    )
                    OR EXISTS (
                        SELECT 1 FROM student_groups sg
                        JOIN groups g ON g.id = sg.group_id
                        WHERE sg.user_id = u.id AND g.created_by = ?
                    )
                )
                ORDER BY u.name
                LIMIT ? OFFSET ?
            `;
            params = [req.user.id, req.user.id, parseInt(limit), parseInt(offset)];
        }

        const students = db.prepare(sql).all(...params);
        const result = students.map(s => ({ ...s, google_linked: !!s.google_id }));
        res.json(result);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Ошибка получения студентов' });
    }
});


router.post('/students', (req, res) => {
    try {
        const db = getDb();
        const { email, name, discipline_id } = req.body;
        
        if (!email) {
            return res.status(400).json({ error: 'Укажите email студента' });
        }

        if (!discipline_id) {
            return res.status(400).json({ error: 'Укажите дисциплину' });
        }

        const discipline = getTeacherDiscipline(db, discipline_id, req.user.id);
        if (!discipline) {
            return res.status(404).json({ error: 'Дисциплина не найдена' });
        }
        
        
        let student = db.prepare('SELECT * FROM users WHERE email = ? AND is_deleted = 0').get(email);
        let generatedPassword = null;
        let isNew = false;
        
        if (!student) {
            
            generatedPassword = Math.random().toString(36).slice(-8) + Math.random().toString(36).slice(-4).toUpperCase();
            
            
            const id = uuidv4();
            const passwordHash = bcrypt.hashSync(generatedPassword, 10);
            const studentName = name || email.split('@')[0]; 
            
            
            const appMode = db.prepare("SELECT value FROM settings WHERE key = 'app_mode'").get();
            const isOffline = !appMode || appMode.value === 'offline';
            
            db.prepare(`
                INSERT INTO users (id, email, name, role, password_hash, sync_status, created_offline)
                VALUES (?, ?, ?, 'student', ?, ?, ?)
            `).run(id, email, studentName, passwordHash, isOffline ? 'local' : 'synced', isOffline ? 1 : 0);
            
            student = { id, email, name: studentName, role: 'student' };
            isNew = true;
        }
        
        
        const existing = db.prepare(
            'SELECT id FROM student_disciplines WHERE user_id = ? AND discipline_id = ?'
        ).get(student.id, discipline_id);
        
        if (!existing) {
            db.prepare(`
                INSERT INTO student_disciplines (id, user_id, discipline_id)
                VALUES (?, ?, ?)
            `).run(uuidv4(), student.id, discipline_id);
        }
        
        dbModule.save();
        
        res.json({
            ...student,
            isNew,
            generatedPassword 
        });
    } catch (err) {
        console.error('Error adding student:', err);
        res.status(500).json({ error: 'Ошибка добавления студента' });
    }
});


router.get('/disciplines/:id/students', (req, res) => {
    try {
        const db = getDb();
        const discipline = getTeacherDiscipline(db, req.params.id, req.user.id);
        if (!discipline) {
            return res.status(404).json({ error: 'Дисциплина не найдена' });
        }

        const students = db.prepare(`
            SELECT u.id, u.name, u.email, u.avatar_url, sd.enrolled_at,
                (SELECT COUNT(*) FROM attempts WHERE user_id = u.id AND test_id IN 
                    (SELECT id FROM tests WHERE discipline_id = ? AND is_deleted = 0)
                ) as attempts_count,
                (SELECT AVG(score) FROM attempts WHERE user_id = u.id AND finished_at IS NOT NULL AND test_id IN 
                    (SELECT id FROM tests WHERE discipline_id = ? AND is_deleted = 0)
                ) as avg_score
            FROM users u
            JOIN student_disciplines sd ON sd.user_id = u.id
            WHERE sd.discipline_id = ? AND u.is_deleted = 0
            ORDER BY u.name
        `).all(req.params.id, req.params.id, req.params.id);
        
        res.json(students);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Ошибка получения студентов' });
    }
});


router.post('/disciplines/:id/students', (req, res) => {
    try {
        const db = getDb();
        const discipline = getTeacherDiscipline(db, req.params.id, req.user.id);
        if (!discipline) {
            return res.status(404).json({ error: 'Дисциплина не найдена' });
        }

        const { user_id, email } = req.body;
        let studentId = user_id;
        
        if (!studentId && email) {
            const user = db.prepare('SELECT id FROM users WHERE email = ? AND role = ?').get(email, 'student');
            if (user) {
                studentId = user.id;
            } else {
                return res.status(404).json({ error: 'Студент не найден' });
            }
        }
        
        if (!studentId) {
            return res.status(400).json({ error: 'Укажите студента' });
        }
        
        db.prepare(`
            INSERT OR IGNORE INTO student_disciplines (id, user_id, discipline_id)
            VALUES (?, ?, ?)
        `).run(uuidv4(), studentId, req.params.id);
        
        dbModule.save();
        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Ошибка добавления студента' });
    }
});


router.delete('/disciplines/:discipline_id/students/:user_id', (req, res) => {
    try {
        const db = getDb();
        const discipline = getTeacherDiscipline(db, req.params.discipline_id, req.user.id);
        if (!discipline) {
            return res.status(404).json({ error: 'Дисциплина не найдена' });
        }

        db.prepare(`
            DELETE FROM student_disciplines 
            WHERE discipline_id = ? AND user_id = ?
        `).run(req.params.discipline_id, req.params.user_id);
        
        dbModule.save();
        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Ошибка удаления студента' });
    }
});


router.delete('/students/:id', (req, res) => {
    try {
        const db = getDb();
        const studentId = req.params.id;
        
        
        const student = db.prepare('SELECT * FROM users WHERE id = ? AND role = ?').get(studentId, 'student');
        if (!student) {
            return res.status(404).json({ error: 'Студент не найден' });
        }

        const studentDisciplines = db.prepare(`
            SELECT d.created_by
            FROM student_disciplines sd
            JOIN disciplines d ON d.id = sd.discipline_id
            WHERE sd.user_id = ? AND d.is_deleted = 0
        `).all(studentId);

        if (studentDisciplines.length === 0 || studentDisciplines.some(d => d.created_by !== req.user.id)) {
            return res.status(403).json({ error: 'Нельзя удалить студента из чужой дисциплины' });
        }
        
        
        const resultsCount = db.prepare('SELECT COUNT(*) as count FROM results WHERE user_id = ?').get(studentId).count;
        const attemptsCount = db.prepare('SELECT COUNT(*) as count FROM attempts WHERE user_id = ?').get(studentId).count;
        
        
        db.prepare('DELETE FROM user_answers WHERE attempt_id IN (SELECT id FROM attempts WHERE user_id = ?)').run(studentId);
        db.prepare('DELETE FROM user_matching_answers WHERE attempt_id IN (SELECT id FROM attempts WHERE user_id = ?)').run(studentId);
        db.prepare('DELETE FROM user_order_answers WHERE attempt_id IN (SELECT id FROM attempts WHERE user_id = ?)').run(studentId);
        
        
        db.prepare('DELETE FROM results WHERE user_id = ?').run(studentId);
        db.prepare('DELETE FROM attempts WHERE user_id = ?').run(studentId);
        
        
        db.prepare('DELETE FROM student_disciplines WHERE user_id = ?').run(studentId);
        
        
        db.prepare('DELETE FROM users WHERE id = ?').run(studentId);
        
        dbModule.save();
        
        res.json({ 
            success: true, 
            message: 'Студент удалён',
            deleted: {
                results: resultsCount,
                attempts: attemptsCount
            }
        });
    } catch (err) {
        console.error('Error deleting student:', err);
        res.status(500).json({ error: 'Ошибка удаления студента' });
    }
});


router.post('/students/import', (req, res) => {
    try {
        const db = getDb();
        const { students, discipline_id } = req.body;

        if (!discipline_id) {
            return res.status(400).json({ error: 'Укажите дисциплину' });
        }

        const discipline = getTeacherDiscipline(db, discipline_id, req.user.id);
        if (!discipline) {
            return res.status(404).json({ error: 'Дисциплина не найдена' });
        }
        
        let imported = 0;
        
        for (const student of students) {
            if (!student.email || !student.name) continue;
            
            const id = uuidv4();
            
            const password = student.password || student.email.split('@')[0] + '123';
            const passwordHash = bcrypt.hashSync(password, 10);
            
            
            const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(student.email);
            
            if (!existing) {
                db.prepare(`
                    INSERT INTO users (id, email, name, role, password_hash)
                    VALUES (?, ?, ?, 'student', ?)
                `).run(id, student.email, student.name, passwordHash);

                db.prepare(`
                    INSERT OR IGNORE INTO student_disciplines (id, user_id, discipline_id)
                    VALUES (?, ?, ?)
                `).run(uuidv4(), id, discipline_id);
                imported++;
            } else {
                db.prepare(`
                    INSERT OR IGNORE INTO student_disciplines (id, user_id, discipline_id)
                    VALUES (?, ?, ?)
                `).run(uuidv4(), existing.id, discipline_id);
                imported++;
            }
        }
        
        dbModule.save();
        res.json({ success: true, imported });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Ошибка импорта студентов' });
    }
});




router.get('/results', (req, res) => {
    try {
        const db = getDb();
        const { group_id, limit = 100, offset = 0 } = req.query;

        let extraJoin = '';
        let extraWhere = '';
        const params = [req.user.id];

        if (group_id) {
            const group = getTeacherGroup(db, group_id, req.user.id);
            if (!group) return res.status(404).json({ error: 'Группа не найдена' });
            extraJoin = 'JOIN student_groups sg ON sg.user_id = r.user_id';
            extraWhere = 'AND sg.group_id = ?';
            params.push(group_id);
        }

        params.push(parseInt(limit), parseInt(offset));

        const results = db.prepare(`
            SELECT
                r.id, r.score, r.is_passed, r.attempt_id,
                r.user_id,
                a.finished_at, a.id as attempt_id,
                t.title as test_title, t.id as test_id,
                d.title as discipline_title,
                u.name as student_name, u.email as student_email
            FROM results r
            JOIN attempts a ON a.id = r.attempt_id
            JOIN tests t ON t.id = r.test_id
            LEFT JOIN disciplines d ON d.id = t.discipline_id
            JOIN users u ON u.id = r.user_id
            ${extraJoin}
            WHERE t.created_by = ? AND r.is_deleted = 0
            ${extraWhere}
            ORDER BY a.finished_at DESC
            LIMIT ? OFFSET ?
        `).all(...params);

        res.json(results);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Ошибка получения результатов' });
    }
});


router.delete('/results/all', (req, res) => {
    try {
        const db = getDb();
        
        
        const testIds = db.prepare('SELECT id FROM tests WHERE created_by = ?').all(req.user.id).map(t => t.id);
        
        if (testIds.length === 0) {
            return res.json({ success: true, deleted: 0 });
        }
        
        const placeholders = testIds.map(() => '?').join(',');
        
        
        const count = db.prepare(`SELECT COUNT(*) as count FROM results WHERE test_id IN (${placeholders})`).get(...testIds).count;
        
        
        db.prepare(`DELETE FROM user_answers WHERE attempt_id IN (SELECT id FROM attempts WHERE test_id IN (${placeholders}))`).run(...testIds);
        db.prepare(`DELETE FROM user_matching_answers WHERE attempt_id IN (SELECT id FROM attempts WHERE test_id IN (${placeholders}))`).run(...testIds);
        db.prepare(`DELETE FROM user_order_answers WHERE attempt_id IN (SELECT id FROM attempts WHERE test_id IN (${placeholders}))`).run(...testIds);
        
        
        db.prepare(`DELETE FROM results WHERE test_id IN (${placeholders})`).run(...testIds);
        db.prepare(`DELETE FROM attempts WHERE test_id IN (${placeholders})`).run(...testIds);
        
        dbModule.save();
        
        res.json({ success: true, deleted: count });
    } catch (err) {
        console.error('Error deleting all results:', err);
        res.status(500).json({ error: 'Ошибка удаления результатов' });
    }
});


router.delete('/results/old/:days', (req, res) => {
    try {
        const db = getDb();
        const days = parseInt(req.params.days) || 90;
        const cutoffTime = Math.floor(Date.now() / 1000) - (days * 24 * 60 * 60);
        
        
        const testIds = db.prepare('SELECT id FROM tests WHERE created_by = ?').all(req.user.id).map(t => t.id);
        
        if (testIds.length === 0) {
            return res.json({ success: true, deleted: 0 });
        }
        
        const placeholders = testIds.map(() => '?').join(',');
        
        
        const count = db.prepare(`
            SELECT COUNT(*) as count FROM results r
            JOIN attempts a ON a.id = r.attempt_id
            WHERE r.test_id IN (${placeholders}) AND a.finished_at < ?
        `).get(...testIds, cutoffTime).count;
        
        
        const oldAttemptIds = db.prepare(`
            SELECT a.id FROM attempts a
            JOIN results r ON r.attempt_id = a.id
            WHERE a.test_id IN (${placeholders}) AND a.finished_at < ?
        `).all(...testIds, cutoffTime).map(a => a.id);
        
        if (oldAttemptIds.length > 0) {
            const attemptPlaceholders = oldAttemptIds.map(() => '?').join(',');
            
            
            db.prepare(`DELETE FROM user_answers WHERE attempt_id IN (${attemptPlaceholders})`).run(...oldAttemptIds);
            db.prepare(`DELETE FROM user_matching_answers WHERE attempt_id IN (${attemptPlaceholders})`).run(...oldAttemptIds);
            db.prepare(`DELETE FROM user_order_answers WHERE attempt_id IN (${attemptPlaceholders})`).run(...oldAttemptIds);
            
            
            db.prepare(`DELETE FROM results WHERE attempt_id IN (${attemptPlaceholders})`).run(...oldAttemptIds);
            db.prepare(`DELETE FROM attempts WHERE id IN (${attemptPlaceholders})`).run(...oldAttemptIds);
        }
        
        dbModule.save();
        
        res.json({ success: true, deleted: count, days });
    } catch (err) {
        console.error('Error deleting old results:', err);
        res.status(500).json({ error: 'Ошибка удаления старых результатов' });
    }
});


router.get('/attempts/:id', (req, res) => {
    try {
        const db = getDb();
        const attempt = db.prepare(`
            SELECT a.*, t.title as test_title, t.passing_score, u.name as student_name
            FROM attempts a
            JOIN tests t ON t.id = a.test_id
            JOIN users u ON u.id = a.user_id
            WHERE a.id = ? AND a.finished_at IS NOT NULL AND t.created_by = ?
        `).get(req.params.id, req.user.id);
        
        if (!attempt) {
            return res.status(404).json({ error: 'Попытка не найдена' });
        }
        
        
        const questions = db.prepare(`
            SELECT * FROM questions WHERE test_id = ? AND is_deleted = 0 ORDER BY sort_order
        `).all(attempt.test_id);
        
        for (const q of questions) {
            if (q.type === 'match') {
                q.pairs = db.prepare('SELECT * FROM matching_pairs WHERE question_id = ?').all(q.id);
                q.user_answers = db.prepare(`
                    SELECT * FROM user_matching_answers WHERE attempt_id = ? AND question_id = ?
                `).all(req.params.id, q.id);
            } else if (q.type === 'order') {
                q.answers = db.prepare(`
                    SELECT * FROM answers WHERE question_id = ? AND is_deleted = 0 ORDER BY position
                `).all(q.id);
                q.user_answers = db.prepare(`
                    SELECT * FROM user_order_answers WHERE attempt_id = ? AND question_id = ? ORDER BY user_position
                `).all(req.params.id, q.id);
            } else {
                q.answers = db.prepare(`
                    SELECT * FROM answers WHERE question_id = ? AND is_deleted = 0
                `).all(q.id);
                q.user_answers = db.prepare(`
                    SELECT * FROM user_answers WHERE attempt_id = ? AND question_id = ?
                `).all(req.params.id, q.id);
            }
        }
        
        res.json({ attempt, questions });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Ошибка получения попытки' });
    }
});


router.get('/tests/:id/results', (req, res) => {
    try {
        const db = getDb();
        const test = getTeacherTest(db, req.params.id, req.user.id);
        if (!test) {
            return res.status(404).json({ error: 'Тест не найден' });
        }

        const results = db.prepare(`
            SELECT a.*, u.name as student_name, u.email as student_email
            FROM attempts a
            JOIN users u ON u.id = a.user_id
            WHERE a.test_id = ? AND a.finished_at IS NOT NULL AND a.is_deleted = 0
            ORDER BY a.finished_at DESC
        `).all(req.params.id);
        
        res.json(results);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Ошибка получения результатов' });
    }
});


router.get('/disciplines/:id/stats', (req, res) => {
    try {
        const db = getDb();
        const discipline = getTeacherDiscipline(db, req.params.id, req.user.id);
        if (!discipline) {
            return res.status(404).json({ error: 'Дисциплина не найдена' });
        }

        const stats = {
            students_count: db.prepare(`
                SELECT COUNT(*) as count FROM student_disciplines WHERE discipline_id = ?
            `).get(req.params.id).count,
            
            tests_count: db.prepare(`
                SELECT COUNT(*) as count FROM tests WHERE discipline_id = ? AND is_deleted = 0
            `).get(req.params.id).count,
            
            attempts_count: db.prepare(`
                SELECT COUNT(*) as count FROM attempts 
                WHERE test_id IN (SELECT id FROM tests WHERE discipline_id = ?) AND finished_at IS NOT NULL
            `).get(req.params.id).count,
            
            avg_score: db.prepare(`
                SELECT AVG(score) as avg FROM attempts 
                WHERE test_id IN (SELECT id FROM tests WHERE discipline_id = ?) AND finished_at IS NOT NULL
            `).get(req.params.id).avg
        };
        
        res.json(stats);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Ошибка получения статистики' });
    }
});




router.get('/all-questions', (req, res) => {
    try {
        const db = getDb();
        const excludeTestId = req.query.exclude;
        
        let query = `
            SELECT t.id, t.title, d.title as discipline_title,
                (SELECT COUNT(*) FROM questions q WHERE q.test_id = t.id AND q.is_deleted = 0) as questions_count
            FROM tests t
            LEFT JOIN disciplines d ON d.id = t.discipline_id
            WHERE t.created_by = ? AND t.is_deleted = 0
            ${excludeTestId ? 'AND t.id != ?' : ''}
            ORDER BY t.created_at DESC
        `;
        
        let tests;
        if (excludeTestId) {
            tests = db.prepare(query).all(req.user.id, excludeTestId);
        } else {
            tests = db.prepare(query).all(req.user.id);
        }
        
        tests = tests.filter(t => t.questions_count > 0);
        
        for (let test of tests) {
            test.questions = db.prepare(`
                SELECT id, text, type, weight FROM questions
                WHERE test_id = ? AND is_deleted = 0
                ORDER BY sort_order
            `).all(test.id);
        }
        
        res.json(tests);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Ошибка получения вопросов' });
    }
});


router.post('/tests/:id/copy-questions', (req, res) => {
    try {
        const db = getDb();
        const targetTestId = req.params.id;
        const { question_ids } = req.body;
        
        if (!question_ids || question_ids.length === 0) {
            return res.status(400).json({ error: 'Выберите вопросы для копирования' });
        }
        
        
        const targetTest = db.prepare(`
            SELECT id FROM tests WHERE id = ? AND created_by = ? AND is_deleted = 0
        `).get(targetTestId, req.user.id);
        
        if (!targetTest) {
            return res.status(404).json({ error: 'Тест не найден' });
        }
        
        let copiedCount = 0;
        
        for (const questionId of question_ids) {
            
            const srcQuestion = db.prepare(`
                SELECT q.*
                FROM questions q
                JOIN tests t ON t.id = q.test_id
                WHERE q.id = ? AND q.is_deleted = 0 AND t.created_by = ?
            `).get(questionId, req.user.id);
            
            if (!srcQuestion) continue;
            
            
            const sortOrder = db.prepare(`
                SELECT COALESCE(MAX(sort_order), 0) + 1 as next FROM questions WHERE test_id = ?
            `).get(targetTestId).next;
            
            
            const newQuestionId = uuidv4();
            db.prepare(`
                INSERT INTO questions (id, test_id, text, type, weight, image_url, explanation, sort_order)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `).run(
                newQuestionId,
                targetTestId,
                srcQuestion.text,
                srcQuestion.type,
                srcQuestion.weight,
                srcQuestion.image_url,
                srcQuestion.explanation,
                sortOrder
            );
            
            
            if (srcQuestion.type === 'match') {
                const pairs = db.prepare(`
                    SELECT * FROM matching_pairs WHERE question_id = ?
                `).all(questionId);
                
                for (const pair of pairs) {
                    db.prepare(`
                        INSERT INTO matching_pairs (id, question_id, left_text, right_text)
                        VALUES (?, ?, ?, ?)
                    `).run(uuidv4(), newQuestionId, pair.left_text, pair.right_text);
                }
            } else {
                const answers = db.prepare(`
                    SELECT * FROM answers WHERE question_id = ? AND is_deleted = 0
                `).all(questionId);
                
                for (const answer of answers) {
                    db.prepare(`
                        INSERT INTO answers (id, question_id, text, is_correct, position)
                        VALUES (?, ?, ?, ?, ?)
                    `).run(uuidv4(), newQuestionId, answer.text, answer.is_correct, answer.position);
                }
            }
            
            copiedCount++;
        }
        
        dbModule.save();
        res.json({ success: true, copied: copiedCount });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Ошибка копирования вопросов' });
    }
});

// ─── Groups ───────────────────────────────────────────────────────────────────

function getTeacherGroup(db, groupId, teacherId) {
    return db.prepare(`
        SELECT g.*
        FROM groups g
        WHERE g.id = ? AND g.created_by = ? AND g.is_deleted = 0
    `).get(groupId, teacherId);
}

// GET /groups — list all groups for this teacher
router.get('/groups', (req, res) => {
    try {
        const db = getDb();
        const groups = db.prepare(`
            SELECT g.id, g.name, g.description, g.created_at,
                   COUNT(sg.user_id) as student_count
            FROM groups g
            LEFT JOIN student_groups sg ON sg.group_id = g.id
            WHERE g.created_by = ? AND g.is_deleted = 0
            GROUP BY g.id
            ORDER BY g.created_at DESC
        `).all(req.user.id);
        res.json(groups);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Ошибка получения групп' });
    }
});

// POST /groups — create a group
router.post('/groups', (req, res) => {
    try {
        const db = getDb();
        const nameErr = validateStringLength(req.body.name, 'Название группы', 1, 100);
        if (nameErr) return res.status(400).json({ error: nameErr });

        const id = uuidv4();
        db.prepare(`
            INSERT INTO groups (id, name, description, created_by)
            VALUES (?, ?, ?, ?)
        `).run(id, req.body.name.trim(), (req.body.description || '').trim(), req.user.id);

        dbModule.save();
        const group = db.prepare(`SELECT * FROM groups WHERE id = ?`).get(id);
        res.status(201).json(group);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Ошибка создания группы' });
    }
});

// PUT /groups/:id — rename/update group
router.put('/groups/:id', (req, res) => {
    try {
        const db = getDb();
        const group = getTeacherGroup(db, req.params.id, req.user.id);
        if (!group) return res.status(404).json({ error: 'Группа не найдена' });

        const nameErr = validateStringLength(req.body.name, 'Название группы', 1, 100);
        if (nameErr) return res.status(400).json({ error: nameErr });

        db.prepare(`
            UPDATE groups SET name = ?, description = ?, updated_at = strftime('%s','now')
            WHERE id = ?
        `).run(req.body.name.trim(), (req.body.description || '').trim(), group.id);

        dbModule.save();
        res.json(db.prepare(`SELECT * FROM groups WHERE id = ?`).get(group.id));
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Ошибка обновления группы' });
    }
});

// DELETE /groups/:id — soft-delete group
router.delete('/groups/:id', (req, res) => {
    try {
        const db = getDb();
        const group = getTeacherGroup(db, req.params.id, req.user.id);
        if (!group) return res.status(404).json({ error: 'Группа не найдена' });

        db.prepare(`UPDATE groups SET is_deleted = 1, updated_at = strftime('%s','now') WHERE id = ?`).run(group.id);
        dbModule.save();
        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Ошибка удаления группы' });
    }
});

// GET /groups/:id/students — list students in a group
router.get('/groups/:id/students', (req, res) => {
    try {
        const db = getDb();
        const group = getTeacherGroup(db, req.params.id, req.user.id);
        if (!group) return res.status(404).json({ error: 'Группа не найдена' });

        const students = db.prepare(`
            SELECT u.id, u.name, u.email
            FROM users u
            JOIN student_groups sg ON sg.user_id = u.id
            WHERE sg.group_id = ? AND u.is_deleted = 0
            ORDER BY u.name
        `).all(group.id);
        res.json(students);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Ошибка получения студентов группы' });
    }
});

// POST /groups/:id/students — add student to group
router.post('/groups/:id/students', (req, res) => {
    try {
        const db = getDb();
        const group = getTeacherGroup(db, req.params.id, req.user.id);
        if (!group) return res.status(404).json({ error: 'Группа не найдена' });

        const { user_id } = req.body;
        if (!user_id) return res.status(400).json({ error: 'Укажите student id' });

        // student must belong to this teacher (via discipline)
        const student = db.prepare(`
            SELECT u.id FROM users u
            WHERE u.id = ? AND u.role = 'student' AND u.is_deleted = 0
            AND EXISTS (
                SELECT 1 FROM student_disciplines sd
                JOIN disciplines d ON d.id = sd.discipline_id
                WHERE sd.user_id = u.id AND d.created_by = ? AND d.is_deleted = 0
            )
        `).get(user_id, req.user.id);

        if (!student) return res.status(404).json({ error: 'Студент не найден' });

        try {
            db.prepare(`
                INSERT INTO student_groups (id, user_id, group_id) VALUES (?, ?, ?)
            `).run(uuidv4(), user_id, group.id);
        } catch (e) {
            if (e.message && e.message.includes('UNIQUE')) {
                return res.status(409).json({ error: 'Студент уже в группе' });
            }
            throw e;
        }

        dbModule.save();
        res.status(201).json({ success: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Ошибка добавления студента в группу' });
    }
});

// DELETE /groups/:id/students/:user_id — remove student from group
router.delete('/groups/:id/students/:user_id', (req, res) => {
    try {
        const db = getDb();
        const group = getTeacherGroup(db, req.params.id, req.user.id);
        if (!group) return res.status(404).json({ error: 'Группа не найдена' });

        db.prepare(`DELETE FROM student_groups WHERE group_id = ? AND user_id = ?`).run(group.id, req.params.user_id);
        dbModule.save();
        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Ошибка удаления студента из группы' });
    }
});

// POST /groups/:id/enroll-discipline — enroll all group members to a discipline
router.post('/groups/:id/enroll-discipline', (req, res) => {
    try {
        const db = getDb();
        const group = getTeacherGroup(db, req.params.id, req.user.id);
        if (!group) return res.status(404).json({ error: 'Группа не найдена' });

        const discipline = getTeacherDiscipline(db, req.body.discipline_id, req.user.id);
        if (!discipline) return res.status(404).json({ error: 'Дисциплина не найдена' });

        const members = db.prepare(`
            SELECT u.id FROM users u
            JOIN student_groups sg ON sg.user_id = u.id
            WHERE sg.group_id = ? AND u.is_deleted = 0
        `).all(group.id);

        let enrolled = 0;
        for (const m of members) {
            const exists = db.prepare(`
                SELECT 1 FROM student_disciplines WHERE user_id = ? AND discipline_id = ?
            `).get(m.id, discipline.id);
            if (!exists) {
                db.prepare(`
                    INSERT INTO student_disciplines (id, user_id, discipline_id)
                    VALUES (?, ?, ?)
                `).run(uuidv4(), m.id, discipline.id);
                enrolled++;
            }
        }

        dbModule.save();
        res.json({ success: true, enrolled, total: members.length });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Ошибка зачисления группы' });
    }
});

// ============================================================
// REVIEW — ручная проверка текстовых ответов
// ============================================================

// GET /review/pending — список попыток ожидающих проверки
router.get('/review/pending', (req, res) => {
    try {
        const db = getDb();
        const pending = db.prepare(`
            SELECT
                a.id as attempt_id,
                a.started_at,
                a.finished_at,
                a.score,
                a.needs_review,
                a.review_completed,
                u.id as student_id,
                u.name as student_name,
                u.email as student_email,
                t.id as test_id,
                t.title as test_title,
                d.title as discipline_name,
                (SELECT COUNT(*) FROM user_answers ua
                 WHERE ua.attempt_id = a.id AND ua.is_correct IS NULL) as pending_count
            FROM attempts a
            JOIN users u ON u.id = a.user_id
            JOIN tests t ON t.id = a.test_id
            JOIN disciplines d ON d.id = t.discipline_id
            WHERE a.needs_review = 1
              AND a.review_completed = 0
              AND a.finished_at IS NOT NULL
              AND t.created_by = ?
              AND a.is_deleted = 0
            ORDER BY a.finished_at DESC
        `).all(req.user.id);

        res.json(pending);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Ошибка получения списка на проверку' });
    }
});

// GET /review/pending/count — только количество для бейджа
router.get('/review/pending/count', (req, res) => {
    try {
        const db = getDb();
        const row = db.prepare(`
            SELECT COUNT(*) as count FROM attempts a
            JOIN tests t ON t.id = a.test_id
            WHERE a.needs_review = 1
              AND a.review_completed = 0
              AND a.finished_at IS NOT NULL
              AND t.created_by = ?
              AND a.is_deleted = 0
        `).get(req.user.id);
        res.json({ count: row.count });
    } catch (err) {
        res.status(500).json({ error: 'Ошибка' });
    }
});

// GET /review/:attemptId — детали попытки для проверки
router.get('/review/:attemptId', (req, res) => {
    try {
        const db = getDb();
        const attempt = db.prepare(`
            SELECT a.*, u.name as student_name, u.email as student_email,
                   t.title as test_title, t.passing_score, t.created_by
            FROM attempts a
            JOIN users u ON u.id = a.user_id
            JOIN tests t ON t.id = a.test_id
            WHERE a.id = ? AND t.created_by = ?
        `).get(req.params.attemptId, req.user.id);

        if (!attempt) return res.status(404).json({ error: 'Попытка не найдена' });

        // Только текстовые вопросы без эталона (те что ждут проверки)
        const questions = db.prepare(`
            SELECT q.id, q.text, q.weight
            FROM questions q
            WHERE q.test_id = ? AND q.type = 'text' AND q.is_deleted = 0
              AND NOT EXISTS (
                SELECT 1 FROM answers a2 WHERE a2.question_id = q.id AND a2.is_correct = 1 AND a2.is_deleted = 0
              )
        `).all(attempt.test_id);

        for (const q of questions) {
            const ua = db.prepare(`
                SELECT id, text_answer, is_correct, teacher_comment
                FROM user_answers WHERE attempt_id = ? AND question_id = ?
            `).get(req.params.attemptId, q.id);
            q.user_answer = ua || null;
        }

        res.json({ attempt, questions });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Ошибка получения данных для проверки' });
    }
});

// POST /review/:attemptId/answer/:answerId — выставить оценку за ответ
router.post('/review/:attemptId/answer/:answerId', (req, res) => {
    try {
        const db = getDb();
        const { is_correct, teacher_comment } = req.body;

        if (is_correct === undefined || is_correct === null) {
            return res.status(400).json({ error: 'Укажите is_correct' });
        }

        // Проверить что попытка принадлежит тесту этого учителя
        const attempt = db.prepare(`
            SELECT a.id FROM attempts a
            JOIN tests t ON t.id = a.test_id
            WHERE a.id = ? AND t.created_by = ?
        `).get(req.params.attemptId, req.user.id);

        if (!attempt) return res.status(404).json({ error: 'Попытка не найдена' });

        db.prepare(`
            UPDATE user_answers
            SET is_correct = ?, teacher_comment = ?
            WHERE id = ? AND attempt_id = ?
        `).run(is_correct ? 1 : 0, teacher_comment || null, req.params.answerId, req.params.attemptId);

        dbModule.save();
        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Ошибка сохранения оценки' });
    }
});

// POST /review/:attemptId/complete — завершить проверку, пересчитать балл
router.post('/review/:attemptId/complete', (req, res) => {
    try {
        const db = getDb();

        const attempt = db.prepare(`
            SELECT a.*, t.passing_score, t.created_by
            FROM attempts a
            JOIN tests t ON t.id = a.test_id
            WHERE a.id = ? AND t.created_by = ?
        `).get(req.params.attemptId, req.user.id);

        if (!attempt) return res.status(404).json({ error: 'Попытка не найдена' });

        // Проверить что все текстовые ответы без эталона оценены
        const pendingCount = db.prepare(`
            SELECT COUNT(*) as count FROM user_answers ua
            JOIN questions q ON q.id = ua.question_id
            WHERE ua.attempt_id = ? AND ua.is_correct IS NULL
        `).get(req.params.attemptId).count;

        if (pendingCount > 0) {
            return res.status(400).json({ error: `Ещё ${pendingCount} ответов не проверено` });
        }

        // Пересчитать балл по всем вопросам
        const questions = db.prepare(`
            SELECT * FROM questions WHERE test_id = ? AND is_deleted = 0
        `).all(attempt.test_id);

        let correctAnswers = 0;
        let totalWeight = 0;
        let earnedWeight = 0;

        for (const q of questions) {
            totalWeight += q.weight;
            let isCorrect = false;

            if (q.type === 'text') {
                const ua = db.prepare(`
                    SELECT is_correct FROM user_answers WHERE attempt_id = ? AND question_id = ?
                `).get(req.params.attemptId, q.id);
                isCorrect = ua?.is_correct === 1;
            } else if (q.type === 'single' || q.type === 'multiple') {
                const ua = db.prepare(`
                    SELECT is_correct FROM user_answers WHERE attempt_id = ? AND question_id = ?
                `).get(req.params.attemptId, q.id);
                isCorrect = ua?.is_correct === 1;
            } else if (q.type === 'match') {
                const uma = db.prepare(`
                    SELECT is_correct FROM user_matching_answers WHERE attempt_id = ? AND question_id = ? LIMIT 1
                `).get(req.params.attemptId, q.id);
                isCorrect = uma?.is_correct === 1;
            } else if (q.type === 'order') {
                const uoa = db.prepare(`
                    SELECT is_correct FROM user_order_answers WHERE attempt_id = ? AND question_id = ? LIMIT 1
                `).get(req.params.attemptId, q.id);
                isCorrect = uoa?.is_correct === 1;
            }

            if (isCorrect) {
                correctAnswers++;
                earnedWeight += q.weight;
            }
        }

        const newScore = totalWeight > 0 ? Math.round((earnedWeight / totalWeight) * 100) : 0;
        const isPassed = newScore >= attempt.passing_score;

        db.prepare(`
            UPDATE attempts SET
                score = ?, correct_answers = ?, is_passed = ?,
                review_completed = 1, needs_review = 0,
                updated_at = strftime('%s', 'now')
            WHERE id = ?
        `).run(newScore, correctAnswers, isPassed ? 1 : 0, req.params.attemptId);

        db.prepare(`
            UPDATE results SET score = ?, is_passed = ?, needs_review = 0,
                updated_at = strftime('%s', 'now')
            WHERE attempt_id = ?
        `).run(newScore, isPassed ? 1 : 0, req.params.attemptId);

        dbModule.save();
        res.json({ success: true, score: newScore, is_passed: isPassed });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Ошибка завершения проверки' });
    }
});

module.exports = router;
