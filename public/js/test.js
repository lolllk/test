



const TestRunner = {
    currentTest: null,
    currentAttempt: null,
    currentQuestionIndex: 0,
    questions: [],
    answers: {},
    timer: null,
    timeLeft: 0,
    _saveTimers: {},
    attemptsInfo: null, 
    
    
    async startTest(testId) {
        try {
            
            const test = await API.get(`/api/tests/${testId}`);
            
            
            const attempts = await API.get(`/api/student/tests/${testId}/attempts`);
            const activeAttempt = attempts.find(a => !a.finished_at);
            const finishedAttempts = attempts.filter(a => a.finished_at);
            
            if (!activeAttempt && test.attempts_limit && attempts.length >= test.attempts_limit) {
                App.showToast('Превышено максимальное количество попыток', 'warning');
                return;
            }
            
            
            this.attemptsInfo = {
                used: finishedAttempts.length + 1, 
                limit: test.attempts_limit || null
            };
            
            
            const result = await API.post(`/api/student/tests/${testId}/start`, {});
            this.currentAttempt = result.attempt_id;
            
            
            const data = await API.get(`/api/tests/${testId}/questions`);
            this.currentTest = data.test;
            this.questions = data.questions;
            this.currentQuestionIndex = 0;
            this.answers = {};
            
            
            this.showTestPage();
            
            
            if (this.currentTest.time_limit) {
                let timerSeconds = this.currentTest.time_limit;
                
                
                if (result.resumed && activeAttempt && activeAttempt.started_at) {
                    const elapsed = Math.floor(Date.now() / 1000) - activeAttempt.started_at;
                    timerSeconds = Math.max(0, this.currentTest.time_limit - elapsed);
                    if (timerSeconds <= 0) {
                        App.showToast('Время на эту попытку истекло.', 'warning');
                        this.forceFinishTest();
                        return;
                    }
                }
                
                this.startTimer(timerSeconds);
            }
            
            
            this.renderQuestion();
            this.renderNavigation();
            
        } catch (error) {
            App.showToast(error.message, 'error');
        }
    },
    
    
    showTestPage() {
        document.getElementById('dashboard-page').style.display = 'none';
        document.getElementById('test-page').style.display = 'block';
        
        
        document.getElementById('test-timer').style.display = 'none';
        document.querySelector('.test-navigation').style.display = '';
        document.querySelector('.test-progress').style.display = '';
        document.getElementById('test-timer').classList.remove('warning', 'danger');
        
        
        let titleText = this.currentTest.title;
        if (this.attemptsInfo) {
            const limitText = this.attemptsInfo.limit ? this.attemptsInfo.limit : '∞';
            titleText += ` (попытка ${this.attemptsInfo.used} из ${limitText})`;
        }
        document.getElementById('test-title').textContent = titleText;
        
        
        document.getElementById('prev-question-btn').onclick = () => this.prevQuestion();
        document.getElementById('next-question-btn').onclick = () => this.nextQuestion();
        document.getElementById('finish-test-btn').onclick = () => this.finishTest();
    },
    
    
    startTimer(seconds) {
        this.timeLeft = seconds;
        const timerEl = document.getElementById('test-timer');
        const displayEl = document.getElementById('timer-display');
        
        timerEl.style.display = 'flex';
        
        this.timer = setInterval(() => {
            this.timeLeft--;
            displayEl.textContent = App.formatTime(this.timeLeft);
            
            
            if (this.timeLeft <= 300 && this.timeLeft > 60) {
                timerEl.classList.add('warning');
                timerEl.classList.remove('danger');
            } else if (this.timeLeft <= 60) {
                timerEl.classList.remove('warning');
                timerEl.classList.add('danger');
            }
            
            
            if (this.timeLeft <= 0) {
                clearInterval(this.timer);
                this.timer = null;
                App.showToast('Время вышло! Тест завершён автоматически.', 'warning');
                this.forceFinishTest();
            }
        }, 1000);
    },
    
    
    stopTimer() {
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
        }
    },
    
    
    clearAnswer(question) {
        delete this.answers[question.id];

        // Cancel any pending debounced save for this question
        if (this._saveTimers[question.id]) {
            clearTimeout(this._saveTimers[question.id]);
            delete this._saveTimers[question.id];
        }
        
        API.post(`/api/student/attempts/${this.currentAttempt}/answer`, {
            question_id: question.id,
            answer_ids: null,
            text_answer: '',
            matching_answers: [],
            order_answers: []
        }).catch(err => console.error('Failed to clear answer:', err));
        
        this.renderQuestion();
        this.updateDots();
    },
    
    
    async forceFinishTest() {
        this.stopTimer();
        
        try {
            const result = await API.post(`/api/student/attempts/${this.currentAttempt}/finish`, {});
            this.showFinalResult(result);
        } catch (error) {
            App.showToast(error.message, 'error');
            this.backToDashboard();
        }
    },
    
    
    renderQuestion() {
        const question = this.questions[this.currentQuestionIndex];
        const container = document.getElementById('question-container');
        
        
        document.getElementById('question-counter').textContent = 
            `Вопрос ${this.currentQuestionIndex + 1} из ${this.questions.length}`;
        
        
        const progress = ((this.currentQuestionIndex + 1) / this.questions.length) * 100;
        document.getElementById('progress-fill').style.width = `${progress}%`;
        
        
        const typeLabels = {
            single: 'Один ответ',
            multiple: 'Несколько ответов',
            text: 'Текстовый ответ',
            match: 'Сопоставление',
            order: 'Сортировка'
        };
        
        let answersHtml = '';
        
        switch (question.type) {
            case 'single':
                answersHtml = this.renderSingleChoice(question);
                break;
            case 'multiple':
                answersHtml = this.renderMultipleChoice(question);
                break;
            case 'text':
                answersHtml = this.renderTextAnswer(question);
                break;
            case 'match':
                answersHtml = this.renderMatchingQuestion(question);
                break;
            case 'order':
                answersHtml = this.renderOrderQuestion(question);
                break;
        }
        
        const hasAnswer = this.answers[question.id] !== undefined;
        
        container.innerHTML = `
            <div class="question-type">
                <i class="fas fa-${this.getQuestionIcon(question.type)}"></i>
                ${typeLabels[question.type]}
            </div>
            <div class="question-text">${Dashboard.escapeHtml(question.text)}</div>
            ${answersHtml}
            ${hasAnswer ? `
                <div class="clear-answer-wrapper" style="margin-top: 1rem; text-align: right;">
                    <button class="btn btn-outline btn-sm" id="clear-answer-btn" type="button">
                        <i class="fas fa-eraser"></i> Очистить ответ
                    </button>
                </div>
            ` : ''}
        `;
        
        
        this.bindAnswerHandlers(question);
        
        
        const clearBtn = document.getElementById('clear-answer-btn');
        if (clearBtn) {
            clearBtn.addEventListener('click', () => this.clearAnswer(question));
        }
        
        
        this.updateNavigationButtons();
    },
    
    
    getQuestionIcon(type) {
        const icons = {
            single: 'dot-circle',
            multiple: 'check-square',
            text: 'keyboard',
            match: 'exchange-alt',
            order: 'sort'
        };
        return icons[type] || 'question';
    },
    
    
    renderSingleChoice(question) {
        const saved = this.answers[question.id];
        
        return `
            <div class="answers-list">
                ${question.answers.map(a => `
                    <label class="answer-option ${saved === a.id ? 'selected' : ''}" data-answer-id="${a.id}">
                        <input type="radio" name="answer" value="${a.id}" ${saved === a.id ? 'checked' : ''}>
                        <span class="answer-radio">
                            ${saved === a.id ? '<i class="fas fa-check"></i>' : ''}
                        </span>
                        <span class="answer-text">${Dashboard.escapeHtml(a.text)}</span>
                    </label>
                `).join('')}
            </div>
        `;
    },
    
    
    renderMultipleChoice(question) {
        const saved = this.answers[question.id] || [];
        
        return `
            <div class="answers-list">
                ${question.answers.map(a => `
                    <label class="answer-option ${saved.includes(a.id) ? 'selected' : ''}" data-answer-id="${a.id}">
                        <input type="checkbox" name="answer" value="${a.id}" ${saved.includes(a.id) ? 'checked' : ''}>
                        <span class="answer-checkbox">
                            ${saved.includes(a.id) ? '<i class="fas fa-check"></i>' : ''}
                        </span>
                        <span class="answer-text">${Dashboard.escapeHtml(a.text)}</span>
                    </label>
                `).join('')}
            </div>
        `;
    },
    
    
    renderTextAnswer(question) {
        const saved = this.answers[question.id] || '';
        
        return `
            <textarea class="text-answer-input" placeholder="Введите ваш ответ...">${Dashboard.escapeHtml(saved)}</textarea>
        `;
    },
    
    
    renderMatchingQuestion(question) {
        const saved = this.answers[question.id] || {};
        
        return `
            <div class="matching-container">
                ${question.pairs.map(pair => `
                    <div class="matching-pair">
                        <div class="matching-left">${Dashboard.escapeHtml(pair.left_text)}</div>
                        <div class="matching-arrow"><i class="fas fa-arrow-right"></i></div>
                        <select class="matching-select" data-pair-id="${pair.id}">
                            <option value="">Выберите...</option>
                            ${question.right_options.map(opt => `
                                <option value="${Dashboard.escapeHtml(opt)}" ${saved[pair.id] === opt ? 'selected' : ''}>
                                    ${Dashboard.escapeHtml(opt)}
                                </option>
                            `).join('')}
                        </select>
                    </div>
                `).join('')}
            </div>
        `;
    },
    
    
    renderOrderQuestion(question) {
        const saved = this.answers[question.id] || question.answers.map(a => a.id);
        const orderedAnswers = saved.map(id => question.answers.find(a => a.id === id)).filter(Boolean);
        
        return `
            <div class="order-list" id="order-list">
                ${orderedAnswers.map((a, i) => `
                    <div class="order-item" draggable="true" data-answer-id="${a.id}">
                        <span class="order-item-number">${i + 1}</span>
                        <span class="order-item-handle"><i class="fas fa-grip-vertical"></i></span>
                        <span class="answer-text">${Dashboard.escapeHtml(a.text)}</span>
                    </div>
                `).join('')}
            </div>
        `;
    },
    
    
    bindAnswerHandlers(question) {
        const container = document.getElementById('question-container');
        
        switch (question.type) {
            case 'single':
                container.querySelectorAll('.answer-option').forEach(option => {
                    option.addEventListener('click', () => {
                        container.querySelectorAll('.answer-option').forEach(o => {
                            o.classList.remove('selected');
                            o.querySelector('.answer-radio').innerHTML = '';
                        });
                        option.classList.add('selected');
                        option.querySelector('.answer-radio').innerHTML = '<i class="fas fa-check"></i>';
                        option.querySelector('input').checked = true;
                        
                        this.answers[question.id] = option.dataset.answerId;
                        this.saveAnswer(question);
                        this.updateDots();
                    });
                });
                break;
                
            case 'multiple':
                container.querySelectorAll('.answer-option').forEach(option => {
                    option.addEventListener('click', () => {
                        const checkbox = option.querySelector('input');
                        checkbox.checked = !checkbox.checked;
                        option.classList.toggle('selected', checkbox.checked);
                        
                        const checkmark = option.querySelector('.answer-checkbox');
                        checkmark.innerHTML = checkbox.checked ? '<i class="fas fa-check"></i>' : '';
                        
                        if (!this.answers[question.id]) {
                            this.answers[question.id] = [];
                        }
                        
                        if (checkbox.checked) {
                            this.answers[question.id].push(option.dataset.answerId);
                        } else {
                            this.answers[question.id] = this.answers[question.id].filter(
                                id => id !== option.dataset.answerId
                            );
                        }
                        
                        this.saveAnswer(question);
                        this.updateDots();
                    });
                });
                break;
                
            case 'text':
                const textarea = container.querySelector('.text-answer-input');
                textarea.addEventListener('input', () => {
                    this.answers[question.id] = textarea.value;
                    this.saveAnswer(question);
                    this.updateDots();
                });
                break;
                
            case 'match':
                container.querySelectorAll('.matching-select').forEach(select => {
                    select.addEventListener('change', () => {
                        if (!this.answers[question.id]) {
                            this.answers[question.id] = {};
                        }
                        this.answers[question.id][select.dataset.pairId] = select.value;
                        this.saveAnswer(question);
                        this.updateDots();
                    });
                });
                break;
                
            case 'order':
                this.initDragAndDrop(question);
                break;
        }
    },
    
    
    initDragAndDrop(question) {
        const list = document.getElementById('order-list');
        let draggedItem = null;
        
        list.querySelectorAll('.order-item').forEach(item => {
            item.addEventListener('dragstart', (e) => {
                draggedItem = item;
                item.classList.add('dragging');
            });
            
            item.addEventListener('dragend', () => {
                item.classList.remove('dragging');
                this.updateOrderNumbers();
                
                
                const order = Array.from(list.querySelectorAll('.order-item'))
                    .map(i => i.dataset.answerId);
                this.answers[question.id] = order;
                this.saveAnswer(question);
                this.updateDots();
            });
            
            item.addEventListener('dragover', (e) => {
                e.preventDefault();
                const afterElement = this.getDragAfterElement(list, e.clientY);
                if (afterElement) {
                    list.insertBefore(draggedItem, afterElement);
                } else {
                    list.appendChild(draggedItem);
                }
            });
        });
    },
    
    getDragAfterElement(container, y) {
        const draggableElements = [...container.querySelectorAll('.order-item:not(.dragging)')];
        
        return draggableElements.reduce((closest, child) => {
            const box = child.getBoundingClientRect();
            const offset = y - box.top - box.height / 2;
            
            if (offset < 0 && offset > closest.offset) {
                return { offset: offset, element: child };
            } else {
                return closest;
            }
        }, { offset: Number.NEGATIVE_INFINITY }).element;
    },
    
    updateOrderNumbers() {
        const list = document.getElementById('order-list');
        list.querySelectorAll('.order-item').forEach((item, index) => {
            item.querySelector('.order-item-number').textContent = index + 1;
        });
    },
    
    
    async saveAnswer(question) {
        const answer = this.answers[question.id];
        
        // Debounce multiple-choice to avoid race conditions when clicking fast
        if (question.type === 'multiple') {
            if (this._saveTimers[question.id]) {
                clearTimeout(this._saveTimers[question.id]);
            }
            this._saveTimers[question.id] = setTimeout(() => {
                delete this._saveTimers[question.id];
                this._doSaveAnswer(question, this.answers[question.id]);
            }, 150);
            return;
        }
        
        await this._doSaveAnswer(question, answer);
    },
    
    
    async _doSaveAnswer(question, answer) {
        try {
            let data = { question_id: question.id };
            
            switch (question.type) {
                case 'single':
                    data.answer_ids = answer;
                    break;
                case 'multiple':
                    data.answer_ids = answer;
                    break;
                case 'text':
                    data.text_answer = answer;
                    break;
                case 'match':
                    data.matching_answers = Object.entries(answer || {}).map(([pair_id, right_text]) => ({
                        pair_id,
                        right_text
                    }));
                    break;
                case 'order':
                    data.order_answers = answer;
                    break;
            }
            
            await API.post(`/api/student/attempts/${this.currentAttempt}/answer`, data);
        } catch (error) {
            console.error('Failed to save answer:', error);
        }
    },
    
    
    renderNavigation() {
        const dotsContainer = document.getElementById('question-dots');
        
        dotsContainer.innerHTML = this.questions.map((q, i) => `
            <button class="question-dot ${i === this.currentQuestionIndex ? 'current' : ''} ${this.answers[q.id] !== undefined ? 'answered' : ''}" 
                    data-index="${i}">
                ${i + 1}
            </button>
        `).join('');
        
        dotsContainer.querySelectorAll('.question-dot').forEach(dot => {
            dot.addEventListener('click', () => {
                this.currentQuestionIndex = parseInt(dot.dataset.index);
                this.renderQuestion();
                this.updateDots();
            });
        });
    },
    
    
    updateDots() {
        document.querySelectorAll('.question-dot').forEach((dot, i) => {
            dot.classList.toggle('current', i === this.currentQuestionIndex);
            dot.classList.toggle('answered', this.answers[this.questions[i].id] !== undefined);
        });
    },
    
    
    updateNavigationButtons() {
        const prevBtn = document.getElementById('prev-question-btn');
        const nextBtn = document.getElementById('next-question-btn');
        const finishBtn = document.getElementById('finish-test-btn');
        
        prevBtn.style.display = this.currentQuestionIndex > 0 ? 'inline-flex' : 'none';
        
        if (this.currentQuestionIndex === this.questions.length - 1) {
            nextBtn.style.display = 'none';
            finishBtn.style.display = 'inline-flex';
        } else {
            nextBtn.style.display = 'inline-flex';
            finishBtn.style.display = 'none';
        }
    },
    
    
    prevQuestion() {
        if (this.currentQuestionIndex > 0) {
            this.currentQuestionIndex--;
            this.renderQuestion();
            this.updateDots();
        }
    },
    
    
    nextQuestion() {
        if (this.currentQuestionIndex < this.questions.length - 1) {
            this.currentQuestionIndex++;
            this.renderQuestion();
            this.updateDots();
        }
    },
    
    
    async finishTest() {
        
        const unanswered = this.questions.filter(q => this.answers[q.id] === undefined);
        
        if (unanswered.length > 0) {
            if (!confirm(`У вас ${unanswered.length} неотвеченных вопросов. Завершить тест?`)) {
                return;
            }
        }
        
        this.stopTimer();

        // Flush any pending debounced saves (e.g. multiple-choice) before finishing
        const pendingIds = Object.keys(this._saveTimers);
        if (pendingIds.length > 0) {
            for (const qId of pendingIds) {
                clearTimeout(this._saveTimers[qId]);
                delete this._saveTimers[qId];
            }
            const multipleQuestions = this.questions.filter(
                q => q.type === 'multiple' && this.answers[q.id] !== undefined
            );
            await Promise.all(multipleQuestions.map(q => this._doSaveAnswer(q, this.answers[q.id])));
        }
        
        try {
            const result = await API.post(`/api/student/attempts/${this.currentAttempt}/finish`, {});
            
            
            this.showFinalResult(result);
            
        } catch (error) {
            App.showToast(error.message, 'error');
        }
    },
    
    
    showFinalResult(result) {
        const container = document.getElementById('question-container');
        
        document.getElementById('test-timer').style.display = 'none';
        document.querySelector('.test-navigation').style.display = 'none';
        document.querySelector('.test-progress').style.display = 'none';
        
        
        let attemptsHtml = '';
        if (this.attemptsInfo) {
            const limitText = this.attemptsInfo.limit ? this.attemptsInfo.limit : '∞';
            attemptsHtml = `<p style="margin-top: 0.5rem; color: var(--text-secondary); font-size: 0.9rem;">Попытка ${this.attemptsInfo.used} из ${limitText}</p>`;
        }
        
        container.innerHTML = `
            <div class="test-result ${result.is_passed ? 'passed' : 'failed'}">
                <div class="result-icon">
                    <i class="fas fa-${result.is_passed ? 'check-circle text-success' : 'times-circle text-danger'}"></i>
                </div>
                <h2>${result.is_passed ? 'Тест пройден!' : 'Тест не пройден'}</h2>
                <div class="result-score">
                    <span class="score-value">${result.score}%</span>
                </div>
                <div class="result-details">
                    <p>Правильных ответов: ${result.correct_answers} из ${result.total_questions}</p>
                    ${attemptsHtml}
                </div>
                <div class="result-actions" style="margin-top: 2rem; display: flex; gap: 1rem; justify-content: center; flex-wrap: wrap;">
                    <button class="btn btn-secondary" onclick="TestRunner.viewCurrentAttemptDetails()">
                        <i class="fas fa-eye"></i>
                        <span>Подробнее</span>
                    </button>
                    <button class="btn btn-primary" onclick="TestRunner.backToDashboard()">
                        <i class="fas fa-home"></i>
                        <span>На главную</span>
                    </button>
                </div>
            </div>
        `;
        
        
        const style = document.createElement('style');
        style.textContent = `
            .test-result {
                text-align: center;
                padding: 3rem 2rem;
            }
            .result-icon i {
                font-size: 5rem;
                margin-bottom: 1.5rem;
            }
            .test-result h2 {
                font-size: 2rem;
                margin-bottom: 1rem;
            }
            .result-score {
                margin: 2rem 0;
            }
            .score-value {
                font-size: 4rem;
                font-weight: 700;
                background: var(--gradient-primary);
                -webkit-background-clip: text;
                -webkit-text-fill-color: transparent;
                background-clip: text;
            }
            .test-result.failed .score-value {
                background: var(--danger);
                -webkit-background-clip: text;
                -webkit-text-fill-color: transparent;
            }
        `;
        document.head.appendChild(style);
    },
    
    
    showResults(data) {
        
        let content = `<div class="results-review">`;
        
        data.questions.forEach((q, i) => {
            
            let isCorrect = false;
            let isPending = false;
            
            if (q.type === 'match') {
                isCorrect = q.user_answers?.every(ua => ua.is_correct) && q.user_answers?.length > 0;
            } else if (q.type === 'order') {
                isCorrect = q.user_answers?.every(ua => ua.is_correct) && q.user_answers?.length > 0;
            } else if (q.type === 'text') {
                const ua = q.user_answers?.[0];
                if (ua?.is_correct === null || ua?.is_correct === undefined) {
                    isPending = true;
                } else {
                    isCorrect = !!ua.is_correct;
                }
            } else {
                isCorrect = !!q.user_answers?.[0]?.is_correct;
            }
            
            const questionClass = isPending ? 'pending' : (isCorrect ? 'correct' : 'incorrect');
            const statusIcon = isPending ? 'clock' : (isCorrect ? 'check' : 'times');
            
            content += `
                <div class="review-question ${questionClass}">
                    <div class="review-header">
                        <span class="review-number">${i + 1}</span>
                        <span class="review-status">
                            <i class="fas fa-${statusIcon}"></i>
                        </span>
                    </div>
                    <p class="review-text">${Dashboard.escapeHtml(q.text)}</p>
            `;
            
            if (q.type === 'single' || q.type === 'multiple') {
                const totalCorrect = q.answers?.filter(a => a.is_correct).length || 0;
                const selectedCorrect = q.answers?.filter(a => a.is_correct && q.user_answers?.some(ua => ua.answer_id === a.id)).length || 0;
                const selectedWrong = q.answers?.filter(a => !a.is_correct && q.user_answers?.some(ua => ua.answer_id === a.id)).length || 0;
                
                if (q.type === 'multiple' && !isCorrect && selectedCorrect > 0 && selectedWrong > 0) {
                    content += `<div class="review-partial-hint"><i class="fas fa-info-circle"></i> Выбрано ${selectedCorrect} из ${totalCorrect} правильных + ${selectedWrong} лишних</div>`;
                }
                
                content += `<div class="review-answers">`;
                q.answers.forEach(a => {
                    const isSelected = q.user_answers?.some(ua => ua.answer_id === a.id);
                    let stateClass = '';
                    let icon = '';
                    if (a.is_correct && isSelected) {
                        stateClass = 'correct selected';
                        icon = '<i class="fas fa-check"></i>';
                    } else if (a.is_correct && !isSelected) {
                        stateClass = 'correct missed';
                        icon = '<i class="fas fa-check"></i>';
                    } else if (!a.is_correct && isSelected) {
                        stateClass = 'wrong selected';
                        icon = '<i class="fas fa-times"></i>';
                    }
                    content += `
                        <div class="review-answer ${stateClass}">
                            <span class="review-answer-icon">${icon}</span>
                            ${Dashboard.escapeHtml(a.text)}
                        </div>
                    `;
                });
                content += `</div>`;
            } else if (q.type === 'text') {
                const userAnswer = q.user_answers?.[0];
                const correctAnswers = q.answers?.filter(a => a.is_correct).map(a => a.text) || [];
                const teacherComment = userAnswer?.teacher_comment;
                if (isPending) {
                    content += `
                        <div class="review-text-answer">
                            <strong>Ваш ответ:</strong> ${userAnswer?.text_answer ? Dashboard.escapeHtml(userAnswer.text_answer) : '<em>Нет ответа</em>'}
                        </div>
                        <div class="review-pending-note">
                            <i class="fas fa-clock"></i> Ответ на проверке у преподавателя
                        </div>
                    `;
                } else {
                    content += `
                        <div class="review-text-answer">
                            <strong>Ваш ответ:</strong> ${userAnswer?.text_answer ? Dashboard.escapeHtml(userAnswer.text_answer) : '<em>Нет ответа</em>'}
                        </div>
                        ${correctAnswers.length ? `
                        <div class="review-correct-answer">
                            <strong>Правильные ответы:</strong> ${correctAnswers.map(a => Dashboard.escapeHtml(a)).join(', ')}
                        </div>` : ''}
                        ${teacherComment ? `<div class="review-teacher-comment"><i class="fas fa-comment"></i> ${Dashboard.escapeHtml(teacherComment)}</div>` : ''}
                    `;
                }
            } else if (q.type === 'match') {
                content += `<div class="review-match">`;
                q.pairs?.forEach(pair => {
                    const userMatch = q.user_answers?.find(ua => ua.pair_id === pair.id);
                    const userRight = userMatch?.user_right_text || '';
                    const isMatchCorrect = userRight === pair.right_text;
                    
                    content += `
                        <div class="review-match-pair ${isMatchCorrect ? 'correct' : 'incorrect'}">
                            <span class="match-left">${Dashboard.escapeHtml(pair.left_text)}</span>
                            <i class="fas fa-arrow-right"></i>
                            <span class="match-user ${isMatchCorrect ? '' : 'wrong'}">${userRight ? Dashboard.escapeHtml(userRight) : '<em>—</em>'}</span>
                            ${!isMatchCorrect ? `<span class="match-correct">(${Dashboard.escapeHtml(pair.right_text)})</span>` : ''}
                        </div>
                    `;
                });
                content += `</div>`;
            } else if (q.type === 'order') {
                content += `<div class="review-order">`;
                
                const correctOrder = [...(q.answers || [])].sort((a, b) => a.position - b.position);
                
                const userOrder = [...(q.user_answers || [])].sort((a, b) => a.user_position - b.user_position);
                
                content += `<div class="order-comparison">`;
                content += `<div class="order-column"><strong>Ваш порядок:</strong>`;
                userOrder.forEach((ua, idx) => {
                    const answer = q.answers?.find(a => a.id === ua.answer_id);
                    const isPositionCorrect = correctOrder[idx]?.id === ua.answer_id;
                    content += `
                        <div class="order-item ${isPositionCorrect ? 'correct' : 'incorrect'}">
                            ${idx + 1}. ${answer ? Dashboard.escapeHtml(answer.text) : '?'}
                        </div>
                    `;
                });
                content += `</div>`;
                
                content += `<div class="order-column"><strong>Правильный порядок:</strong>`;
                correctOrder.forEach((a, idx) => {
                    content += `
                        <div class="order-item correct">
                            ${idx + 1}. ${Dashboard.escapeHtml(a.text)}
                        </div>
                    `;
                });
                content += `</div></div>`;
                content += `</div>`;
            }
            
            if (q.explanation) {
                content += `
                    <div class="review-explanation">
                        <strong>Пояснение:</strong> ${Dashboard.escapeHtml(q.explanation)}
                    </div>
                `;
            }
            
            content += `</div>`;
        });
        
        content += `</div>`;
        
        
        content = `
            <style>
                .results-review { max-height: 60vh; overflow-y: auto; }
                .review-question { 
                    padding: 1rem; 
                    margin-bottom: 1rem; 
                    border-radius: 0.5rem;
                    background: var(--gray-50, #f9fafb);
                }
                .review-question.correct { border-left: 4px solid var(--success, #22c55e); }
                .review-question.incorrect { border-left: 4px solid var(--danger, #ef4444); }
                .review-question.pending { border-left: 4px solid var(--warning, #f59e0b); }
                .review-header { display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.5rem; }
                .review-number { 
                    width: 24px; height: 24px; 
                    background: var(--primary); 
                    color: white; 
                    border-radius: 50%; 
                    display: flex; 
                    align-items: center; 
                    justify-content: center;
                    font-size: 0.75rem;
                    font-weight: 600;
                }
                .review-status { font-size: 1.25rem; }
                .review-question.correct .review-status { color: var(--success, #22c55e); }
                .review-question.incorrect .review-status { color: var(--danger, #ef4444); }
                .review-question.pending .review-status { color: var(--warning, #f59e0b); }
                .review-text { font-weight: 500; margin-bottom: 0.75rem; }
                .review-answers { display: flex; flex-direction: column; gap: 0.5rem; }
                .review-answer { 
                    padding: 0.5rem 0.75rem; 
                    background: var(--bg-secondary, #f3f4f6); 
                    border-radius: 0.25rem;
                    display: flex;
                    align-items: center;
                    gap: 0.5rem;
                    color: var(--text-primary);
                }
                .review-answer-icon { width: 16px; flex-shrink: 0; text-align: center; }
                .review-answer.correct.selected { 
                    background: #d1fae5; 
                    border: 1px solid #22c55e;
                    color: #065f46;
                }
                .review-answer.correct.selected .review-answer-icon { color: #16a34a; }
                .review-answer.correct.missed { 
                    background: #f0fdf4;
                    border: 1px dashed #86efac;
                    color: #15803d;
                }
                .review-answer.correct.missed .review-answer-icon { color: #16a34a; opacity: 0.7; }
                .review-answer.wrong.selected { 
                    background: #fee2e2;
                    border: 1px solid #ef4444;
                    color: #991b1b;
                }
                .review-answer.wrong.selected .review-answer-icon { color: #ef4444; }
                .review-text-answer, .review-correct-answer {
                    padding: 0.5rem 0.75rem;
                    background: var(--bg-secondary, #f3f4f6);
                    border-radius: 0.25rem;
                    margin-bottom: 0.5rem;
                    color: var(--text-primary);
                }
                .review-pending-note {
                    padding: 0.5rem 0.75rem;
                    background: #fef3c7;
                    border: 1px solid #fcd34d;
                    border-radius: 0.25rem;
                    color: #92400e;
                    font-size: 0.875rem;
                    display: flex;
                    align-items: center;
                    gap: 0.5rem;
                }
                .review-partial-hint {
                    padding: 0.4rem 0.75rem;
                    background: #eff6ff;
                    border: 1px solid #93c5fd;
                    border-radius: 0.25rem;
                    color: #1e40af;
                    font-size: 0.8rem;
                    margin-bottom: 0.5rem;
                    display: flex;
                    align-items: center;
                    gap: 0.5rem;
                }
                .review-teacher-comment {
                    padding: 0.5rem 0.75rem;
                    background: #eff6ff;
                    border-left: 3px solid #3b82f6;
                    border-radius: 0.25rem;
                    font-size: 0.875rem;
                    color: #1e40af;
                    display: flex;
                    gap: 0.5rem;
                    align-items: flex-start;
                }
                .review-match { display: flex; flex-direction: column; gap: 0.5rem; }
                .review-match-pair {
                    display: flex;
                    align-items: center;
                    gap: 0.5rem;
                    padding: 0.5rem 0.75rem;
                    background: var(--bg-secondary, #f3f4f6);
                    border-radius: 0.25rem;
                    color: var(--text-primary);
                }
                .review-match-pair.correct { background: #d1fae5; }
                .review-match-pair.incorrect { background: #fee2e2; }
                .match-left { font-weight: 500; min-width: 100px; }
                .match-user.wrong { text-decoration: line-through; color: var(--danger, #ef4444); }
                .match-correct { color: var(--success, #22c55e); font-weight: 500; }
                .order-comparison { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; }
                .order-column { display: flex; flex-direction: column; gap: 0.25rem; }
                .order-item { 
                    padding: 0.375rem 0.5rem; 
                    background: white; 
                    border-radius: 0.25rem;
                    font-size: 0.875rem;
                }
                .order-item.correct { background: #d1fae5; }
                .order-item.incorrect { background: #fee2e2; }
                .review-explanation { 
                    margin-top: 0.75rem; 
                    padding: 0.75rem; 
                    background: var(--info-light, #eff6ff); 
                    border-radius: 0.25rem;
                    font-size: 0.875rem;
                }
            </style>
        ` + content;
        
        App.openModal(`Результаты: ${data.attempt.score}%`, content);
    },
    
    
    async viewCurrentAttemptDetails() {
        try {
            const data = await API.get(`/api/student/attempts/${this.currentAttempt}`);
            this.showResults(data);
        } catch (error) {
            App.showToast(error.message || 'Ошибка загрузки деталей', 'error');
        }
    },
    
    
    backToDashboard() {
        document.getElementById('test-page').style.display = 'none';
        document.getElementById('dashboard-page').style.display = 'flex';
        
        
        document.getElementById('test-timer').style.display = 'none';
        document.getElementById('test-timer').classList.remove('warning', 'danger');
        document.querySelector('.test-navigation').style.display = '';
        document.querySelector('.test-progress').style.display = '';
        
        
        Dashboard.loadPageData('home', true);
    }
};
