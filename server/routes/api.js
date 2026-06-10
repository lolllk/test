const express = require('express');
const router = express.Router();
const dbModule = require('../db');
const { isAuthenticated } = require('./auth');


const getDb = () => dbModule.getDb();


router.get('/disciplines', isAuthenticated, (req, res) => {
    try {
        const db = getDb();
        let disciplines;
        
        if (req.user.role === 'teacher') {
            
            disciplines = db.prepare(`
                SELECT d.*, 
                    (SELECT COUNT(*) FROM tests WHERE discipline_id = d.id AND is_deleted = 0) as tests_count,
                    (SELECT COUNT(*) FROM student_disciplines WHERE discipline_id = d.id) as students_count,
                    (SELECT COUNT(*) FROM topics WHERE discipline_id = d.id AND is_deleted = 0) as topics_count
                FROM disciplines d
                WHERE d.created_by = ? AND d.is_deleted = 0
                ORDER BY d.title
            `).all(req.user.id);
        } else {
            
            disciplines = db.prepare(`
                SELECT d.*,
                    (SELECT COUNT(*) FROM tests WHERE discipline_id = d.id AND is_published = 1 AND is_deleted = 0) as tests_count
                FROM disciplines d
                JOIN student_disciplines sd ON sd.discipline_id = d.id
                WHERE sd.user_id = ? AND d.is_deleted = 0
                ORDER BY d.title
            `).all(req.user.id);
        }
        
        res.json(disciplines);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Ошибка получения дисциплин' });
    }
});


router.get('/disciplines/:id/topics', isAuthenticated, (req, res) => {
    try {
        const db = getDb();

        if (req.user.role === 'teacher') {
            const discipline = db.prepare(`
                SELECT id FROM disciplines
                WHERE id = ? AND created_by = ? AND is_deleted = 0
            `).get(req.params.id, req.user.id);

            if (!discipline) {
                return res.status(404).json({ error: 'Дисциплина не найдена' });
            }
        } else if (req.user.role === 'student') {
            const access = db.prepare(`
                SELECT 1
                FROM student_disciplines sd
                JOIN disciplines d ON d.id = sd.discipline_id
                WHERE sd.user_id = ? AND sd.discipline_id = ? AND d.is_deleted = 0
            `).get(req.user.id, req.params.id);

            if (!access) {
                return res.status(403).json({ error: 'Доступ запрещён' });
            }
        }

        const topics = db.prepare(`
            SELECT t.*,
                (SELECT COUNT(*) FROM tests WHERE topic_id = t.id AND is_deleted = 0) as tests_count
            FROM topics t
            WHERE t.discipline_id = ? AND t.is_deleted = 0
            ORDER BY t.sort_order, t.title
        `).all(req.params.id);
        
        res.json(topics);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Ошибка получения тем' });
    }
});


router.get('/tests', isAuthenticated, (req, res) => {
    try {
        const db = getDb();
        const { discipline_id, topic_id } = req.query;
        let query = '';
        let params = [];
        
        if (req.user.role === 'teacher') {
            query = `
                SELECT t.*, d.title as discipline_title, tp.title as topic_title,
                    (SELECT COUNT(*) FROM questions WHERE test_id = t.id AND is_deleted = 0) as questions_count,
                    (SELECT COUNT(DISTINCT user_id) FROM attempts WHERE test_id = t.id) as attempts_count
                FROM tests t
                LEFT JOIN disciplines d ON d.id = t.discipline_id
                LEFT JOIN topics tp ON tp.id = t.topic_id
                WHERE t.created_by = ? AND t.is_deleted = 0
            `;
            params.push(req.user.id);
        } else {
            query = `
                SELECT t.*, d.title as discipline_title, tp.title as topic_title,
                    (SELECT COUNT(*) FROM questions WHERE test_id = t.id AND is_deleted = 0) as questions_count,
                    (SELECT COUNT(*) FROM attempts WHERE test_id = t.id AND user_id = ?) as my_attempts
                FROM tests t
                LEFT JOIN disciplines d ON d.id = t.discipline_id
                LEFT JOIN topics tp ON tp.id = t.topic_id
                JOIN student_disciplines sd ON sd.discipline_id = t.discipline_id
                WHERE sd.user_id = ? AND t.is_published = 1 AND t.is_deleted = 0
            `;
            params.push(req.user.id, req.user.id);
        }
        
        if (discipline_id) {
            query += ' AND t.discipline_id = ?';
            params.push(discipline_id);
        }
        
        if (topic_id) {
            query += ' AND t.topic_id = ?';
            params.push(topic_id);
        }
        
        query += ' ORDER BY t.created_at DESC';
        
        const tests = db.prepare(query).all(...params);
        res.json(tests);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Ошибка получения тестов' });
    }
});


router.get('/tests/:id', isAuthenticated, (req, res) => {
    try {
        const db = getDb();
        const test = db.prepare(`
            SELECT t.*, d.title as discipline_title, tp.title as topic_title
            FROM tests t
            LEFT JOIN disciplines d ON d.id = t.discipline_id
            LEFT JOIN topics tp ON tp.id = t.topic_id
            WHERE t.id = ? AND t.is_deleted = 0
        `).get(req.params.id);
        
        if (!test) {
            return res.status(404).json({ error: 'Тест не найден' });
        }

        if (req.user.role === 'teacher' && test.created_by !== req.user.id) {
            return res.status(404).json({ error: 'Тест не найден' });
        }
        
        
        if (req.user.role === 'student') {
            const hasAccess = db.prepare(`
                SELECT 1 FROM student_disciplines
                WHERE user_id = ? AND discipline_id = ?
            `).get(req.user.id, test.discipline_id);
            
            if (!hasAccess || !test.is_published) {
                return res.status(403).json({ error: 'Доступ запрещён' });
            }
        }
        
        res.json(test);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Ошибка получения теста' });
    }
});


router.get('/tests/:id/questions', isAuthenticated, (req, res) => {
    try {
        const db = getDb();
        const test = db.prepare('SELECT * FROM tests WHERE id = ? AND is_deleted = 0').get(req.params.id);
        
        if (!test) {
            return res.status(404).json({ error: 'Тест не найден' });
        }

        if (req.user.role === 'teacher' && test.created_by !== req.user.id) {
            return res.status(404).json({ error: 'Тест не найден' });
        }

        if (req.user.role === 'student') {
            const hasAccess = db.prepare(`
                SELECT 1 FROM student_disciplines
                WHERE user_id = ? AND discipline_id = ?
            `).get(req.user.id, test.discipline_id);

            if (!hasAccess || !test.is_published) {
                return res.status(403).json({ error: 'Доступ запрещён' });
            }
        }
        
        let questionsQuery = `
            SELECT id, text, type, weight
            FROM questions
            WHERE test_id = ? AND is_deleted = 0
        `;
        
        if (test.shuffle_questions) {
            questionsQuery += ' ORDER BY RANDOM()';
        } else {
            questionsQuery += ' ORDER BY sort_order';
        }
        
        if (test.questions_limit) {
            const limit = parseInt(test.questions_limit);
            if (limit > 0) {
                questionsQuery += ' LIMIT ' + limit;
            }
        }
        
        let questions = db.prepare(questionsQuery).all(req.params.id);
        
        
        for (let q of questions) {
            if (q.type === 'match') {
                
                const pairs = db.prepare(`
                    SELECT id, left_text, right_text FROM matching_pairs
                    WHERE question_id = ?
                `).all(q.id);
                
                q.pairs = pairs;
                
                q.right_options = pairs.map(p => p.right_text).sort(() => Math.random() - 0.5);
            } else if (q.type === 'text') {
                
                q.answers = [];
            } else {
                
                let answersQuery = `
                    SELECT id, text FROM answers
                    WHERE question_id = ? AND is_deleted = 0
                `;
                
                if (test.shuffle_answers && q.type !== 'order') {
                    answersQuery += ' ORDER BY RANDOM()';
                } else if (q.type === 'order') {
                    answersQuery += ' ORDER BY RANDOM()'; 
                } else {
                    answersQuery += ' ORDER BY id';
                }
                
                q.answers = db.prepare(answersQuery).all(q.id);
            }
        }
        
        res.json({
            test: {
                id: test.id,
                title: test.title,
                time_limit: test.time_limit,
                questions_count: questions.length
            },
            questions
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Ошибка получения вопросов' });
    }
});


router.get('/my-results', isAuthenticated, (req, res) => {
    try {
        const db = getDb();
        const results = db.prepare(`
            SELECT a.*, t.title as test_title, d.title as discipline_title
            FROM attempts a
            JOIN tests t ON t.id = a.test_id
            LEFT JOIN disciplines d ON d.id = t.discipline_id
            WHERE a.user_id = ? AND a.finished_at IS NOT NULL AND a.is_deleted = 0
            ORDER BY a.finished_at DESC
        `).all(req.user.id);
        
        res.json(results);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Ошибка получения результатов' });
    }
});

module.exports = router;
