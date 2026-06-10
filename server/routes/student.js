const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const dbModule = require('../db');
const { isAuthenticated, hasRole } = require('./auth');


const getDb = () => dbModule.getDb();


router.use(isAuthenticated, hasRole('student'));


router.post('/tests/:id/start', (req, res) => {
    try {
        const db = getDb();
        const test = db.prepare(`
            SELECT * FROM tests WHERE id = ? AND is_published = 1 AND is_deleted = 0
        `).get(req.params.id);
        
        if (!test) {
            return res.status(404).json({ error: 'Тест не найден' });
        }
        
        
        const hasAccess = db.prepare(`
            SELECT 1 FROM student_disciplines
            WHERE user_id = ? AND discipline_id = ?
        `).get(req.user.id, test.discipline_id);
        
        if (!hasAccess) {
            return res.status(403).json({ error: 'Нет доступа к этому тесту' });
        }
        
        
        const attemptsCount = db.prepare(`
            SELECT COUNT(*) as count FROM attempts
            WHERE user_id = ? AND test_id = ? AND is_deleted = 0
        `).get(req.user.id, req.params.id).count;
        
        if (test.attempts_limit && attemptsCount >= test.attempts_limit) {
            return res.status(400).json({ error: 'Превышено максимальное количество попыток' });
        }
        
        
        const activeAttempt = db.prepare(`
            SELECT * FROM attempts
            WHERE user_id = ? AND test_id = ? AND finished_at IS NULL AND is_deleted = 0
        `).get(req.user.id, req.params.id);
        
        if (activeAttempt) {
            
            return res.json({ attempt_id: activeAttempt.id, resumed: true });
        }
        
        
        const attemptId = uuidv4();
        const questionsCount = db.prepare(`
            SELECT COUNT(*) as count FROM questions WHERE test_id = ? AND is_deleted = 0
        `).get(req.params.id).count;
        
        db.prepare(`
            INSERT INTO attempts (id, user_id, test_id, total_questions)
            VALUES (?, ?, ?, ?)
        `).run(attemptId, req.user.id, req.params.id, test.questions_limit || questionsCount);
        
        dbModule.save();
        res.json({ attempt_id: attemptId, resumed: false });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Ошибка начала теста' });
    }
});


router.post('/attempts/:id/answer', (req, res) => {
    try {
        const db = getDb();
        const { question_id, answer_ids, text_answer, matching_answers, order_answers } = req.body;
        
        const attempt = db.prepare(`
            SELECT * FROM attempts WHERE id = ? AND user_id = ? AND finished_at IS NULL
        `).get(req.params.id, req.user.id);
        
        if (!attempt) {
            return res.status(404).json({ error: 'Попытка не найдена или уже завершена' });
        }
        
        const question = db.prepare('SELECT * FROM questions WHERE id = ?').get(question_id);
        
        if (!question) {
            return res.status(404).json({ error: 'Вопрос не найден' });
        }
        
        
        if (question.test_id !== attempt.test_id) {
            return res.status(400).json({ error: 'Вопрос не принадлежит этому тесту' });
        }
        
        
        db.prepare('DELETE FROM user_answers WHERE attempt_id = ? AND question_id = ?')
            .run(req.params.id, question_id);
        db.prepare('DELETE FROM user_matching_answers WHERE attempt_id = ? AND question_id = ?')
            .run(req.params.id, question_id);
        db.prepare('DELETE FROM user_order_answers WHERE attempt_id = ? AND question_id = ?')
            .run(req.params.id, question_id);
        
        if (question.type === 'single' || question.type === 'multiple') {
            
            const selectedAnswers = Array.isArray(answer_ids) ? answer_ids : [answer_ids];
            
            for (const answerId of selectedAnswers) {
                if (answerId) {
                    db.prepare(`
                        INSERT INTO user_answers (id, attempt_id, question_id, answer_id)
                        VALUES (?, ?, ?, ?)
                    `).run(uuidv4(), req.params.id, question_id, answerId);
                }
            }
        } else if (question.type === 'text') {
            
            db.prepare(`
                INSERT INTO user_answers (id, attempt_id, question_id, text_answer)
                VALUES (?, ?, ?, ?)
            `).run(uuidv4(), req.params.id, question_id, text_answer);
        } else if (question.type === 'match') {
            
            for (const match of (matching_answers || [])) {
                db.prepare(`
                    INSERT INTO user_matching_answers (id, attempt_id, question_id, pair_id, user_right_text)
                    VALUES (?, ?, ?, ?, ?)
                `).run(uuidv4(), req.params.id, question_id, match.pair_id, match.right_text);
            }
        } else if (question.type === 'order') {
            
            for (let i = 0; i < (order_answers || []).length; i++) {
                db.prepare(`
                    INSERT INTO user_order_answers (id, attempt_id, question_id, answer_id, user_position)
                    VALUES (?, ?, ?, ?, ?)
                `).run(uuidv4(), req.params.id, question_id, order_answers[i], i + 1);
            }
        }
        
        dbModule.save();
        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Ошибка сохранения ответа' });
    }
});


router.post('/attempts/:id/finish', (req, res) => {
    try {
        const db = getDb();
        const attempt = db.prepare(`
            SELECT a.*, t.passing_score, t.time_limit FROM attempts a
            JOIN tests t ON t.id = a.test_id
            WHERE a.id = ? AND a.user_id = ? AND a.finished_at IS NULL
        `).get(req.params.id, req.user.id);
        
        if (!attempt) {
            return res.status(404).json({ error: 'Попытка не найдена или уже завершена' });
        }
        
        
        if (attempt.time_limit && attempt.started_at) {
            const now = Math.floor(Date.now() / 1000);
            const elapsed = now - attempt.started_at;
            if (elapsed > attempt.time_limit + 30) {
                
                console.warn(`Attempt ${req.params.id} finished ${elapsed - attempt.time_limit}s after time limit`);
            }
        }
        
        
        let correctAnswers = 0;
        let totalWeight = 0;
        let earnedWeight = 0;
        let needsReview = false;
        
        
        const questions = db.prepare(`
            SELECT * FROM questions WHERE test_id = ? AND is_deleted = 0
        `).all(attempt.test_id);
        
        for (const question of questions) {
            totalWeight += question.weight;
            let isCorrect = false;
            let isPendingReview = false;
            
            if (question.type === 'single') {
                const userAnswer = db.prepare(`
                    SELECT ua.answer_id, a.is_correct
                    FROM user_answers ua
                    JOIN answers a ON a.id = ua.answer_id
                    WHERE ua.attempt_id = ? AND ua.question_id = ?
                `).get(req.params.id, question.id);
                
                isCorrect = userAnswer?.is_correct === 1;
            } else if (question.type === 'multiple') {
                
                const correctIds = db.prepare(`
                    SELECT id FROM answers WHERE question_id = ? AND is_correct = 1 AND is_deleted = 0
                `).all(question.id).map(a => a.id);
                
                
                const userAnswerIds = db.prepare(`
                    SELECT answer_id FROM user_answers WHERE attempt_id = ? AND question_id = ?
                `).all(req.params.id, question.id).map(a => a.answer_id);
                
                
                isCorrect = correctIds.length === userAnswerIds.length &&
                    correctIds.every(id => userAnswerIds.includes(id));
            } else if (question.type === 'text') {
                const userAnswer = db.prepare(`
                    SELECT text_answer FROM user_answers WHERE attempt_id = ? AND question_id = ?
                `).get(req.params.id, question.id);
                
                const correctAnswersList = db.prepare(`
                    SELECT text FROM answers WHERE question_id = ? AND is_correct = 1 AND is_deleted = 0
                `).all(question.id).map(a => a.text.toLowerCase().trim());
                
                if (correctAnswersList.length > 0) {
                    // Auto-check against etalon answers
                    const userText = userAnswer?.text_answer?.toLowerCase().trim();
                    isCorrect = correctAnswersList.includes(userText);
                } else {
                    // No etalon — needs manual review by teacher
                    isPendingReview = true;
                    needsReview = true;
                    totalWeight -= question.weight; // exclude from current score
                }
            } else if (question.type === 'match') {
                const pairs = db.prepare(`
                    SELECT * FROM matching_pairs WHERE question_id = ?
                `).all(question.id);
                
                const userMatches = db.prepare(`
                    SELECT * FROM user_matching_answers WHERE attempt_id = ? AND question_id = ?
                `).all(req.params.id, question.id);
                
                
                let allCorrect = pairs.length === userMatches.length;
                
                for (const pair of pairs) {
                    const userMatch = userMatches.find(m => m.pair_id === pair.id);
                    if (!userMatch || userMatch.user_right_text !== pair.right_text) {
                        allCorrect = false;
                        break;
                    }
                }
                
                isCorrect = allCorrect;
            } else if (question.type === 'order') {
                const correctOrder = db.prepare(`
                    SELECT id, position FROM answers 
                    WHERE question_id = ? AND is_deleted = 0 
                    ORDER BY position
                `).all(question.id);
                
                const userOrder = db.prepare(`
                    SELECT answer_id, user_position FROM user_order_answers 
                    WHERE attempt_id = ? AND question_id = ?
                    ORDER BY user_position
                `).all(req.params.id, question.id);
                
                
                isCorrect = correctOrder.length === userOrder.length;
                
                for (let i = 0; i < correctOrder.length && isCorrect; i++) {
                    if (correctOrder[i].id !== userOrder[i]?.answer_id) {
                        isCorrect = false;
                    }
                }
            }
            
            
            if (question.type === 'single' || question.type === 'multiple' || question.type === 'text') {
                if (!isPendingReview) {
                    db.prepare(`
                        UPDATE user_answers SET is_correct = ? WHERE attempt_id = ? AND question_id = ?
                    `).run(isCorrect ? 1 : 0, req.params.id, question.id);
                }
                // if isPendingReview, is_correct stays NULL
            } else if (question.type === 'match') {
                db.prepare(`
                    UPDATE user_matching_answers SET is_correct = ? WHERE attempt_id = ? AND question_id = ?
                `).run(isCorrect ? 1 : 0, req.params.id, question.id);
            } else if (question.type === 'order') {
                db.prepare(`
                    UPDATE user_order_answers SET is_correct = ? WHERE attempt_id = ? AND question_id = ?
                `).run(isCorrect ? 1 : 0, req.params.id, question.id);
            }
            
            if (isCorrect && !isPendingReview) {
                correctAnswers++;
                earnedWeight += question.weight;
            }
        }
        
        
        const score = totalWeight > 0 ? Math.round((earnedWeight / totalWeight) * 100) : 0;
        const isPassed = score >= attempt.passing_score;
        
        
        db.prepare(`
            UPDATE attempts SET
                finished_at = strftime('%s', 'now'),
                correct_answers = ?,
                score = ?,
                is_passed = ?,
                needs_review = ?,
                updated_at = strftime('%s', 'now')
            WHERE id = ?
        `).run(correctAnswers, score, isPassed ? 1 : 0, needsReview ? 1 : 0, req.params.id);
        
        
        const resultId = uuidv4();
        db.prepare(`
            INSERT INTO results (id, user_id, test_id, attempt_id, score, is_passed, needs_review)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(resultId, req.user.id, attempt.test_id, req.params.id, score, isPassed ? 1 : 0, needsReview ? 1 : 0);
        
        dbModule.save();
        res.json({
            success: true,
            score,
            correct_answers: correctAnswers,
            total_questions: questions.length,
            is_passed: isPassed,
            needs_review: needsReview
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Ошибка завершения теста' });
    }
});


router.get('/attempts/:id', (req, res) => {
    try {
        const db = getDb();
        const attempt = db.prepare(`
            SELECT a.*, t.title as test_title, t.passing_score
            FROM attempts a
            JOIN tests t ON t.id = a.test_id
            WHERE a.id = ? AND a.user_id = ? AND a.finished_at IS NOT NULL
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
        
        res.json({
            attempt,
            questions
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Ошибка получения попытки' });
    }
});


router.get('/tests/:id/attempts', (req, res) => {
    try {
        const db = getDb();
        const attempts = db.prepare(`
            SELECT * FROM attempts 
            WHERE user_id = ? AND test_id = ? AND is_deleted = 0
            ORDER BY started_at DESC
        `).all(req.user.id, req.params.id);
        
        res.json(attempts);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Ошибка получения попыток' });
    }
});

module.exports = router;
