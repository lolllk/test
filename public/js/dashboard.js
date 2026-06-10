



const Dashboard = {
    disciplines: [],
    tests: [],
    results: [],
    _loadingPage: null,
    _lastLoadTime: {},
    _loadDebounce: 300, 
    
    
    reset() {
        this.disciplines = [];
        this.tests = [];
        this.results = [];
        this._loadingPage = null;
        this._lastLoadTime = {};
        
        
        const statTests = document.getElementById('stat-tests');
        if (statTests) statTests.textContent = '0';
        const statCompleted = document.getElementById('stat-completed');
        if (statCompleted) statCompleted.textContent = '0';
        
        
        const containers = ['available-tests', 'disciplines-list', 'tests-list', 'results-list', 'students-list'];
        containers.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.innerHTML = '';
        });
    },
    
    
    getGreeting() {
        const hour = new Date().getHours();
        if (hour >= 5 && hour < 12) return 'Доброе утро';
        if (hour >= 12 && hour < 17) return 'Добрый день';
        if (hour >= 17 && hour < 22) return 'Добрый вечер';
        return 'Доброй ночи';
    },
    
    
    async init() {
        this.reset();
        
        
        const teacherDash = document.getElementById('teacher-dashboard');
        const studentDash = document.getElementById('student-dashboard');
        
        if (App.currentUser?.role === 'teacher') {
            if (teacherDash) teacherDash.style.display = 'block';
            if (studentDash) studentDash.style.display = 'none';
            
            
            const greetingTime = document.getElementById('greeting-time');
            const greetingName = document.getElementById('greeting-name');
            if (greetingTime) greetingTime.textContent = this.getGreeting();
            if (greetingName) greetingName.textContent = App.currentUser?.name || 'Преподаватель';
            
            await this.loadTeacherDashboard();
            Teacher.refreshReviewBadge();
        } else {
            if (teacherDash) teacherDash.style.display = 'none';
            if (studentDash) studentDash.style.display = 'block';
            await this.loadStats();
            await this.loadAvailableTests();
        }
        
        
        this._lastLoadTime['home'] = Date.now();
    },
    
    
    async loadTeacherDashboard() {
        try {
            const [tests, students, allResults, pendingCount] = await Promise.all([
                API.get('/api/tests'),
                API.get('/api/teacher/students').catch(() => []),
                API.get('/api/teacher/results').catch(() => []),
                API.get('/api/teacher/review/pending/count').catch(() => ({ count: 0 }))
            ]);
            
            
            document.getElementById('t-stat-tests').textContent = tests.length;
            document.getElementById('t-stat-pending').textContent = pendingCount.count ?? 0;
            document.getElementById('t-stat-students').textContent = students.length;
            document.getElementById('t-stat-attempts').textContent = allResults.length;
            
            
            this.renderRecentResults(allResults.slice(0, 5));
            
            
            this.renderMyTests(tests.slice(0, 5));
            
        } catch (error) {
            console.error('Failed to load teacher dashboard:', error);
        }
    },
    
    
    renderRecentResults(results) {
        const container = document.getElementById('teacher-recent-results');
        if (!container) return;
        
        if (results.length === 0) {
            container.innerHTML = '<div class="bento-empty"><i class="fas fa-inbox"></i><span>Нет результатов</span></div>';
            return;
        }
        
        container.innerHTML = results.map(r => {
            const initials = (r.student_name || 'U').substring(0, 2).toUpperCase();
            const scoreClass = r.score >= 80 ? 'high' : r.score >= 50 ? 'medium' : 'low';
            
            const timestamp = r.finished_at ? r.finished_at * 1000 : null;
            const date = timestamp ? new Date(timestamp).toLocaleDateString('ru-RU') : '';
            
            return `
                <div class="bento-list-item">
                    <div class="bento-avatar">${initials}</div>
                    <div class="bento-item-info">
                        <div class="bento-item-title">${this.escapeHtml(r.student_name || 'Студент')}</div>
                        <div class="bento-item-subtitle">${this.escapeHtml(r.test_title || 'Тест')}${date ? ' • ' + date : ''}</div>
                    </div>
                    <div class="bento-score ${scoreClass}">${Math.round(r.score)}%</div>
                </div>
            `;
        }).join('');
    },
    
    
    renderMyTests(tests) {
        const container = document.getElementById('teacher-my-tests');
        if (!container) return;
        
        if (tests.length === 0) {
            container.innerHTML = '<div class="bento-empty"><i class="fas fa-clipboard-list"></i><span>Нет тестов</span></div>';
            return;
        }
        
        container.innerHTML = tests.map(t => `
            <div class="bento-list-item clickable" onclick="Teacher.editTest('${t.id}')">
                <div class="bento-test-icon"><i class="fas fa-file-alt"></i></div>
                <div class="bento-item-info">
                    <div class="bento-item-title">${this.escapeHtml(t.title)}</div>
                    <div class="bento-item-subtitle">${this.escapeHtml(t.discipline_title || 'Без дисциплины')}</div>
                </div>
                <div class="bento-badge ${t.is_published ? 'published' : 'draft'}">
                    <i class="fas ${t.is_published ? 'fa-eye' : 'fa-eye-slash'}"></i>
                </div>
            </div>
        `).join('');
    },
    
    
    async loadPageData(page, force = false) {
        
        if (this._loadingPage === page) return;
        
        
        const now = Date.now();
        if (!force && this._lastLoadTime[page] && (now - this._lastLoadTime[page] < this._loadDebounce)) {
            return;
        }
        
        this._loadingPage = page;
        
        try {
            switch (page) {
                case 'home':
                    if (App.currentUser?.role === 'teacher') {
                        await this.loadTeacherDashboard();
                    } else {
                        await this.loadStats();
                        await this.loadAvailableTests();
                    }
                    break;
                case 'disciplines':
                    await this.loadDisciplines();
                    break;
                case 'tests':
                    await this.loadTests();
                    break;
                case 'results':
                    await this.loadResults();
                    break;
                case 'students':
                    if (App.currentUser?.role === 'teacher') {
                        await this.initStudentsTab();
                    }
                    break;
                case 'review':
                    if (App.currentUser?.role === 'teacher') {
                        await Teacher.loadReview();
                    }
                    break;
                case 'settings':
                    await this.loadSettings();
                    break;
            }
            this._lastLoadTime[page] = Date.now();
        } finally {
            this._loadingPage = null;
        }
    },

    
    async loadSettings() {
        
        let user;
        try {
            const response = await API.get('/auth/me');
            user = response.user;
            
            App.currentUser = { 
                ...App.currentUser, 
                ...user,
                
                has_password: user.has_password || App.currentUser?.has_password
            };
            user = App.currentUser;
        } catch (e) {
            user = App.currentUser;
        }
        
        if (!user) return;

        
        document.getElementById('settings-name').textContent = user.name || '—';
        document.getElementById('settings-email').textContent = user.email || '—';
        document.getElementById('settings-role').textContent = 
            user.role === 'teacher' ? 'Преподаватель' : 'Студент';

        
        let googleAvailable = false;
        try {
            const googleStatus = await API.get('/auth/google-status');
            googleAvailable = googleStatus.available;
        } catch (e) { /* google status unavailable */ }

        
        const googleStatusEl = document.getElementById('google-status');
        if (user.google_linked) {
            googleStatusEl.innerHTML = `
                <div class="google-linked">
                    <i class="fab fa-google"></i>
                    <div>
                        <strong>Google привязан</strong>
                        <p style="margin: 0; font-size: 12px; opacity: 0.8;">Вы можете входить через Google</p>
                    </div>
                </div>
                <div class="settings-actions">
                    <button class="btn btn-outline btn-sm" onclick="Dashboard.unlinkGoogle()">
                        <i class="fas fa-unlink"></i> Отвязать
                    </button>
                </div>
            `;
        } else if (googleAvailable) {
            googleStatusEl.innerHTML = `
                <div class="google-not-linked">
                    <p>Google не привязан. Привяжите для удобного входа.</p>
                    <button class="btn btn-primary" onclick="Dashboard.linkGoogle()">
                        <i class="fab fa-google"></i> Привязать Google
                    </button>
                </div>
            `;
        } else {
            googleStatusEl.innerHTML = `
                <div class="google-not-available">
                    <p style="color: var(--text-tertiary);">
                        <i class="fas fa-info-circle"></i>
                        Google OAuth не настроен на сервере
                    </p>
                </div>
            `;
        }

        
        const changePasswordBtn = document.getElementById('change-password-btn');
        if (changePasswordBtn) {
            
            if (!user.has_password) {
                changePasswordBtn.innerHTML = '<i class="fas fa-key"></i> Установить пароль';
            } else {
                changePasswordBtn.innerHTML = '<i class="fas fa-key"></i> Сменить пароль';
            }
            
            changePasswordBtn.onclick = () => this.showChangePasswordDialog();
            
            
            const securityCard = changePasswordBtn.closest('.settings-card');
            const existingWarning = securityCard.querySelector('.password-warning');
            if (existingWarning) existingWarning.remove();
            
            if (!user.has_password && user.google_linked) {
                const warning = document.createElement('div');
                warning.className = 'password-warning';
                warning.innerHTML = `
                    <div class="warning-banner">
                        <i class="fas fa-exclamation-triangle"></i>
                        <div>
                            <strong>У вас нет пароля для офлайн-входа</strong>
                            <p>Без интернета вы не сможете войти через Google. Установите пароль!</p>
                        </div>
                    </div>
                `;
                securityCard.insertBefore(warning, securityCard.querySelector('.settings-actions'));
            }
        }
    },

    
    showChangePasswordDialog() {
        const user = App.currentUser;

        const modal = document.createElement('div');
        modal.className = 'modal-overlay active';
        modal.innerHTML = `
            <div class="modal">
                <div class="modal-header">
                    <h2>${user.has_password ? 'Смена пароля' : 'Установка пароля'}</h2>
                    <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <div class="modal-body">
                    <form id="change-password-form" class="modal-form">
                        ${user.has_password ? `
                        <div class="form-group">
                            <label>Текущий пароль</label>
                            <input type="password" id="current-password" class="form-input" required>
                        </div>
                        ` : `
                        <p style="margin-bottom: 16px; color: var(--text-secondary);">
                            ${user.google_linked 
                                ? 'Установите пароль, чтобы входить в систему без интернета (офлайн).' 
                                : 'Установите пароль для входа в систему.'}
                        </p>
                        `}
                        <div class="form-group">
                            <label>Новый пароль</label>
                            <input type="password" id="new-password" class="form-input" required minlength="6">
                            <small class="form-hint">Минимум 6 символов</small>
                        </div>
                        <div class="form-group">
                            <label>Повтор нового пароля</label>
                            <input type="password" id="confirm-password" class="form-input" required>
                        </div>
                        <div id="password-error" class="form-error" style="display: none;"></div>
                        <div class="modal-actions">
                            <button type="button" class="btn btn-outline" onclick="this.closest('.modal-overlay').remove()">
                                Отмена
                            </button>
                            <button type="submit" class="btn btn-primary">
                                Сохранить
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        
        document.getElementById('change-password-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            const errorEl = document.getElementById('password-error');
            errorEl.style.display = 'none';

            const currentPassword = document.getElementById('current-password')?.value || '';
            const newPassword = document.getElementById('new-password').value;
            const confirmPassword = document.getElementById('confirm-password').value;

            if (newPassword.length < 6) {
                errorEl.textContent = 'Пароль должен быть не менее 6 символов';
                errorEl.style.display = 'block';
                return;
            }

            if (newPassword !== confirmPassword) {
                errorEl.textContent = 'Пароли не совпадают';
                errorEl.style.display = 'block';
                return;
            }

            try {
                await API.post('/auth/change-password', {
                    currentPassword,
                    newPassword
                });

                modal.remove();
                App.showToast('Пароль успешно изменён!', 'success');
                
                
                App.currentUser.has_password = true;
                this.loadSettings();
            } catch (error) {
                errorEl.textContent = error.message;
                errorEl.style.display = 'block';
            }
        });
    },

    
    linkGoogle() {
        window.location.href = '/auth/google?link=true';
    },
    
    
    showChangeNameDialog() {
        const user = App.currentUser;
        
        const modal = document.createElement('div');
        modal.className = 'modal-overlay active';
        modal.innerHTML = `
            <div class="modal">
                <div class="modal-header">
                    <h2>Изменить ФИО</h2>
                    <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <div class="modal-body">
                    <form id="change-name-form" class="modal-form">
                        <div class="form-group">
                            <label>ФИО</label>
                            <div class="input-wrapper">
                                <i class="fas fa-user"></i>
                                <input type="text" id="new-name" value="${this.escapeHtml(user.name || '')}" required minlength="2">
                            </div>
                        </div>
                        
                        <div class="form-error" id="name-error" style="display: none;"></div>
                        
                        <div class="modal-actions">
                            <button type="button" class="btn btn-secondary" onclick="this.closest('.modal-overlay').remove()">
                                Отмена
                            </button>
                            <button type="submit" class="btn btn-primary">
                                Сохранить
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
        document.getElementById('new-name').focus();
        
        document.getElementById('change-name-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            const errorEl = document.getElementById('name-error');
            errorEl.style.display = 'none';
            
            const newName = document.getElementById('new-name').value.trim();
            
            if (!newName || newName.length < 2) {
                errorEl.textContent = 'ФИО должно быть не менее 2 символов';
                errorEl.style.display = 'block';
                return;
            }
            
            try {
                const result = await API.post('/auth/change-name', { name: newName });
                
                modal.remove();
                App.showToast('ФИО успешно изменено!', 'success');
                
                
                App.currentUser.name = result.name;
                App.updateUserUI();
                this.loadSettings();
            } catch (error) {
                errorEl.textContent = error.message;
                errorEl.style.display = 'block';
            }
        });
    },

    
    async unlinkGoogle() {
        if (!confirm('Отвязать Google от аккаунта? Вы сможете входить только по паролю.')) {
            return;
        }

        try {
            await API.post('/auth/unlink-google', {});
            App.showToast('Google отвязан от аккаунта', 'success');
            
            
            await App.checkAuth();
            this.loadSettings();
        } catch (error) {
            App.showToast(error.message, 'error');
        }
    },
    
    
    async loadStats() {
        try {
            const [tests, results] = await Promise.all([
                API.get('/api/tests'),
                API.get('/api/my-results')
            ]);
            
            
            const greetingEl = document.getElementById('student-greeting');
            const nameEl = document.getElementById('student-name');
            
            if (greetingEl) greetingEl.textContent = this.getGreeting();
            if (nameEl) nameEl.textContent = App.currentUser?.name || 'Студент';
            
            
            const completedEl = document.getElementById('stat-completed');
            const testsEl = document.getElementById('stat-tests');
            
            if (completedEl) completedEl.textContent = results.length;
            if (testsEl) testsEl.textContent = tests.length;
        } catch (error) {
            console.error('Failed to load stats:', error);
        }
    },
    
    
    async loadAvailableTests() {
        try {
            const tests = await API.get('/api/tests');
            const container = document.getElementById('available-tests');
            
            if (tests.length === 0) {
                container.innerHTML = `
                    <div class="empty-state">
                        <div class="empty-state-icon">
                            <i class="fas fa-clipboard-list"></i>
                        </div>
                        <h3>Нет доступных тестов</h3>
                        <p>Тесты появятся здесь, когда преподаватель их опубликует</p>
                    </div>
                `;
                return;
            }
            
            container.innerHTML = tests.slice(0, 6).map(test => this.renderTestCard(test)).join('');
            
            
            container.querySelectorAll('.test-card').forEach(card => {
                card.addEventListener('click', () => {
                    const testId = card.dataset.testId;
                    if (App.currentUser.role === 'student') {
                        TestRunner.startTest(testId);
                    } else {
                        Teacher.editTest(testId);
                    }
                });
            });
        } catch (error) {
            console.error('Failed to load tests:', error);
        }
    },
    
    
    renderTestCard(test) {
        
        
        const isStudent = App.currentUser?.role === 'student';
        const attemptsText = isStudent && test.my_attempts !== undefined 
            ? `${test.my_attempts}/${test.attempts_limit || '∞'}`
            : `${test.attempts_limit || '∞'}`;
        
        return `
            <div class="card test-card" data-test-id="${test.id}">
                <div class="card-header">
                    <div class="card-icon" style="background: var(--gradient-primary);">
                        <i class="fas fa-clipboard-list"></i>
                    </div>
                </div>
                <h3 class="card-title">${this.escapeHtml(test.title)}</h3>
                <p class="card-description">${this.escapeHtml(test.description || 'Описание отсутствует')}</p>
                <div class="card-badges">
                    ${test.time_limit ? `<span class="badge badge-info"><i class="fas fa-clock"></i> ${Math.floor(test.time_limit / 60)} мин</span>` : ''}
                    <span class="badge badge-success"><i class="fas fa-question-circle"></i> ${test.questions_count || 0} вопросов</span>
                </div>
                <div class="card-meta">
                    <div class="card-meta-item">
                        <i class="fas fa-book"></i>
                        <span>${this.escapeHtml(test.discipline_title || 'Без дисциплины')}</span>
                    </div>
                    <div class="card-meta-item">
                        <i class="fas fa-redo"></i>
                        <span>${attemptsText} попыток</span>
                    </div>
                </div>
            </div>
        `;
    },
    
    
    async loadDisciplines() {
        try {
            this.disciplines = await API.get('/api/disciplines');
            const container = document.getElementById('disciplines-list');
            
            if (this.disciplines.length === 0) {
                container.innerHTML = `
                    <div class="empty-state">
                        <div class="empty-state-icon">
                            <i class="fas fa-book"></i>
                        </div>
                        <h3>Нет дисциплин</h3>
                        <p>${App.currentUser.role === 'teacher' ? 'Создайте первую дисциплину' : 'Вы не записаны ни на одну дисциплину'}</p>
                    </div>
                `;
                return;
            }
            
            container.innerHTML = this.disciplines.map(d => this.renderDisciplineCard(d)).join('');
            
            
            if (App.currentUser.role === 'teacher') {
                container.querySelectorAll('.btn-delete-discipline').forEach(btn => {
                    btn.addEventListener('click', (e) => {
                        e.stopPropagation();
                        this.deleteDiscipline(btn.dataset.id);
                    });
                });
                
                container.querySelectorAll('.btn-edit-discipline').forEach(btn => {
                    btn.addEventListener('click', (e) => {
                        e.stopPropagation();
                        Teacher.editDiscipline(btn.dataset.id);
                    });
                });
                
                container.querySelectorAll('.btn-manage-students').forEach(btn => {
                    btn.addEventListener('click', (e) => {
                        e.stopPropagation();
                        Teacher.manageStudentsForDiscipline(btn.dataset.id);
                    });
                });
                
                container.querySelectorAll('.btn-manage-topics').forEach(btn => {
                    btn.addEventListener('click', (e) => {
                        e.stopPropagation();
                        Teacher.manageTopics(btn.dataset.id);
                    });
                });
            }
        } catch (error) {
            console.error('Failed to load disciplines:', error);
            App.showToast('Ошибка загрузки дисциплин', 'error');
        }
    },
    
    
    renderDisciplineCard(discipline) {
        const teacherActions = App.currentUser.role === 'teacher' ? `
            <div class="card-actions">
                <button class="btn-manage-topics" data-id="${discipline.id}" title="Управление темами">
                    <i class="fas fa-layer-group"></i>
                </button>
                <button class="btn-manage-students" data-id="${discipline.id}" title="Управление студентами">
                    <i class="fas fa-users"></i>
                </button>
                <button class="btn-edit-discipline" data-id="${discipline.id}" title="Редактировать">
                    <i class="fas fa-edit"></i>
                </button>
                <button class="btn-delete-discipline" data-id="${discipline.id}" title="Удалить">
                    <i class="fas fa-trash"></i>
                </button>
            </div>
        ` : '';
        
        return `
            <div class="card">
                <div class="card-header">
                    <div class="card-icon" style="background: var(--gradient-secondary);">
                        <i class="fas fa-book"></i>
                    </div>
                    ${teacherActions}
                </div>
                <h3 class="card-title">${this.escapeHtml(discipline.title)}</h3>
                <p class="card-description">${this.escapeHtml(discipline.description || 'Описание отсутствует')}</p>
                <div class="card-meta">
                    ${discipline.topics_count !== undefined ? `
                        <div class="card-meta-item">
                            <i class="fas fa-layer-group"></i>
                            <span>${discipline.topics_count} тем</span>
                        </div>
                    ` : ''}
                    <div class="card-meta-item">
                        <i class="fas fa-clipboard-list"></i>
                        <span>${discipline.tests_count || 0} тестов</span>
                    </div>
                    ${discipline.students_count !== undefined ? `
                        <div class="card-meta-item">
                            <i class="fas fa-users"></i>
                            <span>${discipline.students_count} студентов</span>
                        </div>
                    ` : ''}
                </div>
            </div>
        `;
    },
    
    
    async deleteDiscipline(id) {
        if (!confirm('Удалить дисциплину? Это действие нельзя отменить.')) return;
        
        try {
            await API.delete(`/api/teacher/disciplines/${id}`);
            App.showToast('Дисциплина удалена', 'success');
            await this.loadDisciplines();
        } catch (error) {
            App.showToast(error.message, 'error');
        }
    },
    
    
    async loadTests() {
        try {
            this.tests = await API.get('/api/tests');
            await this.updateFilterDisciplines();
            this.renderTests();
            
            
            document.getElementById('filter-discipline').addEventListener('change', () => {
                this.renderTests();
            });
        } catch (error) {
            console.error('Failed to load tests:', error);
            App.showToast('Ошибка загрузки тестов', 'error');
        }
    },
    
    
    async updateFilterDisciplines() {
        const select = document.getElementById('filter-discipline');
        const disciplines = await API.get('/api/disciplines');
        
        select.innerHTML = '<option value="">Все дисциплины</option>' +
            disciplines.map(d => `<option value="${d.id}">${this.escapeHtml(d.title)}</option>`).join('');
    },
    
    
    renderTests() {
        const container = document.getElementById('tests-list');
        const filterValue = document.getElementById('filter-discipline').value;
        
        let filteredTests = this.tests;
        if (filterValue) {
            filteredTests = this.tests.filter(t => t.discipline_id === filterValue);
        }
        
        if (filteredTests.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <div class="empty-state-icon">
                        <i class="fas fa-clipboard-list"></i>
                    </div>
                    <h3>Нет тестов</h3>
                    <p>${App.currentUser.role === 'teacher' ? 'Создайте первый тест' : 'Тесты появятся после публикации'}</p>
                </div>
            `;
            return;
        }
        
        container.innerHTML = `<div class="tests-grid">${filteredTests.map(t => this.renderTestCard(t)).join('')}</div>`;
        
        
        container.querySelectorAll('.test-card').forEach(card => {
            card.addEventListener('click', () => {
                const testId = card.dataset.testId;
                if (App.currentUser.role === 'student') {
                    TestRunner.startTest(testId);
                } else {
                    Teacher.editTest(testId);
                }
            });
        });
    },
    
    
    async loadResults() {
        try {
            const isTeacher = App.currentUser?.role === 'teacher';

            const titleEl = document.getElementById('results-title');
            if (titleEl) {
                titleEl.textContent = isTeacher ? 'Результаты студентов' : 'Мои результаты';
            }

            // Populate group filter for teacher (only once per session)
            if (isTeacher) {
                const groupSel = document.getElementById('filter-group-results');
                if (groupSel && !groupSel._groupsLoaded) {
                    groupSel._groupsLoaded = true;
                    try {
                        const groups = await API.get('/api/teacher/groups');
                        groups.forEach(g => {
                            const opt = document.createElement('option');
                            opt.value = g.id;
                            opt.textContent = g.name;
                            groupSel.appendChild(opt);
                        });
                    } catch (e) { /* no groups yet */ }
                    // bind ONCE using onchange to avoid duplicates
                    groupSel.onchange = () => {
                        const sf = document.getElementById('filter-student');
                        if (sf) sf.value = '';
                        const tf = document.getElementById('filter-test-results');
                        if (tf) tf.value = '';
                        this.loadResults();
                    };
                }
            }

            const groupId = isTeacher ? (document.getElementById('filter-group-results')?.value || '') : '';
            const endpoint = isTeacher
                ? '/api/teacher/results?limit=200' + (groupId ? `&group_id=${encodeURIComponent(groupId)}` : '')
                : '/api/my-results';

            this.results = await API.get(endpoint);

            if (isTeacher) {
                this.populateResultFilters();
            }

            this.renderResults();
        } catch (error) {
            console.error('Failed to load results:', error);
            App.showToast('Ошибка загрузки результатов', 'error');
        }
    },
    
    
    populateResultFilters() {
        const studentFilter = document.getElementById('filter-student');
        const testFilter = document.getElementById('filter-test-results');

        if (studentFilter) {
            const students = new Map();
            this.results.forEach(r => {
                const name = r.student_name || r.user_name || 'Студент';
                const id = r.user_id || name;
                if (id && !students.has(id)) students.set(id, name);
            });

            const prevStudentVal = studentFilter.value;
            studentFilter.innerHTML = '<option value="">Все студенты</option>' +
                Array.from(students.entries()).map(([id, name]) =>
                    `<option value="${this.escapeHtml(String(id))}">${this.escapeHtml(name)}</option>`
                ).join('');
            // restore previous value only if it still exists in new options
            if (prevStudentVal && studentFilter.querySelector(`option[value="${prevStudentVal}"]`)) {
                studentFilter.value = prevStudentVal;
            }
            // use onchange — replaces any previous handler, no duplicates
            studentFilter.onchange = () => this.renderResults();
        }

        if (testFilter) {
            const tests = new Map();
            this.results.forEach(r => {
                if (r.test_id && r.test_title) tests.set(r.test_id, r.test_title);
            });

            const prevTestVal = testFilter.value;
            testFilter.innerHTML = '<option value="">Все тесты</option>' +
                Array.from(tests.entries()).map(([id, title]) =>
                    `<option value="${this.escapeHtml(String(id))}">${this.escapeHtml(title)}</option>`
                ).join('');
            if (prevTestVal && testFilter.querySelector(`option[value="${prevTestVal}"]`)) {
                testFilter.value = prevTestVal;
            }
            testFilter.onchange = () => this.renderResults();
        }
    },
    
    
    renderResults() {
        const isTeacher = App.currentUser?.role === 'teacher';
        const container = document.getElementById('results-list');
        const cardsContainer = document.getElementById('results-cards');
        
        
        let filtered = this.results;
        
        if (isTeacher) {
            const studentVal = document.getElementById('filter-student')?.value;
            const testVal = document.getElementById('filter-test-results')?.value;
            
            if (studentVal) {
                filtered = filtered.filter(r => String(r.user_id) === studentVal);
            }
            if (testVal) {
                filtered = filtered.filter(r => String(r.test_id) === testVal);
            }
        }
        
        if (filtered.length === 0) {
            const emptyMessage = isTeacher 
                ? 'Пока нет результатов тестирования' 
                : 'Вы ещё не прошли ни одного теста';
            container.innerHTML = `
                <tr>
                    <td colspan="${isTeacher ? 7 : 6}" class="text-center" style="padding: 3rem;">
                        <div class="empty-state-icon" style="font-size: 2rem; margin-bottom: 1rem;">
                            <i class="fas fa-chart-bar"></i>
                        </div>
                        <p>${emptyMessage}</p>
                    </td>
                </tr>
            `;
            if (cardsContainer) {
                cardsContainer.innerHTML = `
                    <div class="empty-state" style="text-align: center; padding: 3rem;">
                        <i class="fas fa-chart-bar" style="font-size: 2rem; color: var(--text-tertiary); margin-bottom: 1rem;"></i>
                        <p style="color: var(--text-secondary);">${emptyMessage}</p>
                    </div>
                `;
            }
            return;
        }
        
        if (isTeacher) {
                
                container.innerHTML = filtered.map(r => `
                    <tr>
                        <td><strong>${this.escapeHtml(r.student_name || r.user_name || 'Студент')}</strong></td>
                        <td>${this.escapeHtml(r.test_title)}</td>
                        <td>${this.escapeHtml(r.discipline_title || '-')}</td>
                        <td>${App.formatDate(r.finished_at)}</td>
                        <td>
                            <span class="score-badge ${r.is_passed ? 'passed' : 'failed'}">
                                ${r.score}%
                            </span>
                        </td>
                        <td>
                            <span class="status-badge ${r.is_passed ? 'passed' : 'failed'}">
                                <i class="fas fa-${r.is_passed ? 'check' : 'times'}"></i>
                                ${r.is_passed ? 'Сдан' : 'Не сдан'}
                            </span>
                        </td>
                        <td>
                            <button class="btn btn-secondary btn-icon" onclick="Dashboard.viewStudentAttempt('${r.attempt_id || r.id}')" title="Просмотреть">
                                <i class="fas fa-eye"></i>
                            </button>
                        </td>
                    </tr>
                `).join('');
                
                
                if (cardsContainer) {
                    cardsContainer.innerHTML = filtered.map(r => `
                        <div class="result-card">
                            <div class="result-card-student">${this.escapeHtml(r.student_name || r.user_name || 'Студент')}</div>
                            <div class="result-card-header">
                                <div class="result-card-title">${this.escapeHtml(r.test_title)}</div>
                                <div class="result-card-score ${r.is_passed ? 'passed' : 'failed'}">${r.score}%</div>
                            </div>
                            <div class="result-card-info">
                                <span><i class="fas fa-book"></i> ${this.escapeHtml(r.discipline_title || '-')}</span>
                                <span><i class="fas fa-calendar"></i> ${App.formatDate(r.finished_at)}</span>
                                <span><i class="fas fa-${r.is_passed ? 'check' : 'times'}"></i> ${r.is_passed ? 'Сдан' : 'Не сдан'}</span>
                            </div>
                            <div class="result-card-actions">
                                <button class="btn btn-secondary" onclick="Dashboard.viewStudentAttempt('${r.attempt_id || r.id}')">
                                    <i class="fas fa-eye"></i> Подробнее
                                </button>
                            </div>
                        </div>
                    `).join('');
                }
            } else {
                
                container.innerHTML = filtered.map(r => `
                    <tr>
                        <td><strong>${this.escapeHtml(r.test_title)}</strong></td>
                        <td>${this.escapeHtml(r.discipline_title || '-')}</td>
                        <td>${App.formatDate(r.finished_at)}</td>
                        <td>
                            <span class="score-badge ${r.is_passed ? 'passed' : 'failed'}">
                                ${r.score}%
                            </span>
                        </td>
                        <td>
                            <span class="status-badge ${r.is_passed ? 'passed' : 'failed'}">
                                <i class="fas fa-${r.is_passed ? 'check' : 'times'}"></i>
                                ${r.is_passed ? 'Сдан' : 'Не сдан'}
                            </span>
                        </td>
                        <td>
                            <button class="btn btn-secondary btn-icon" onclick="Dashboard.viewAttempt('${r.id}')" title="Просмотреть">
                                <i class="fas fa-eye"></i>
                            </button>
                        </td>
                    </tr>
                `).join('');
                
                
                if (cardsContainer) {
                    cardsContainer.innerHTML = filtered.map(r => `
                        <div class="result-card">
                            <div class="result-card-header">
                                <div class="result-card-title">${this.escapeHtml(r.test_title)}</div>
                                <div class="result-card-score ${r.is_passed ? 'passed' : 'failed'}">${r.score}%</div>
                            </div>
                            <div class="result-card-info">
                                <span><i class="fas fa-book"></i> ${this.escapeHtml(r.discipline_title || '-')}</span>
                                <span><i class="fas fa-calendar"></i> ${App.formatDate(r.finished_at)}</span>
                                <span><i class="fas fa-${r.is_passed ? 'check' : 'times'}"></i> ${r.is_passed ? 'Сдан' : 'Не сдан'}</span>
                            </div>
                            <div class="result-card-actions">
                                <button class="btn btn-secondary" onclick="Dashboard.viewAttempt('${r.id}')">
                                    <i class="fas fa-eye"></i> Подробнее
                                </button>
                            </div>
                        </div>
                    `).join('');
                }
            }
    },
    
    
    async viewStudentAttempt(attemptId) {
        try {
            const data = await API.get(`/api/teacher/attempts/${attemptId}`);
            TestRunner.showResults(data);
        } catch (error) {
            App.showToast(error.message || 'Ошибка загрузки', 'error');
        }
    },
    
    
    async viewAttempt(attemptId) {
        try {
            const data = await API.get(`/api/student/attempts/${attemptId}`);
            TestRunner.showResults(data);
        } catch (error) {
            App.showToast(error.message, 'error');
        }
    },
    
    
    async initStudentsTab() {
        // Populate group filter (only once)
        const groupSel = document.getElementById('filter-group-students');
        if (groupSel && groupSel.options.length <= 1) {
            try {
                const groups = await API.get('/api/teacher/groups');
                groups.forEach(g => {
                    const opt = document.createElement('option');
                    opt.value = g.id;
                    opt.textContent = g.name;
                    groupSel.appendChild(opt);
                });
            } catch (e) { /* no groups yet */ }

            if (!groupSel._bound) {
                groupSel._bound = true;
                groupSel.addEventListener('change', () => this.loadStudents());
            }
        }

        // Bind "load all" button
        const loadAllBtn = document.getElementById('load-all-students-btn');
        if (loadAllBtn && !loadAllBtn._bound) {
            loadAllBtn._bound = true;
            loadAllBtn.addEventListener('click', () => {
                if (groupSel) groupSel.value = '';
                this.loadStudents();
            });
        }
    },

    async loadStudents() {
        const container = document.getElementById('students-list');
        container.innerHTML = '<div class="loading-spinner-inline"><i class="fas fa-spinner fa-spin"></i> Загрузка...</div>';

        const groupId = document.getElementById('filter-group-students')?.value || '';
        const url = '/api/teacher/students' + (groupId ? `?group_id=${encodeURIComponent(groupId)}&limit=200` : '?limit=200');

        try {
            const students = await API.get(url);

            if (students.length === 0) {
                container.innerHTML = `
                    <div class="empty-state">
                        <div class="empty-state-icon"><i class="fas fa-users"></i></div>
                        <h3>${groupId ? 'В группе нет студентов' : 'Нет студентов'}</h3>
                        <p>${groupId ? 'Добавьте студентов в эту группу' : 'Добавьте студентов вручную или импортируйте список'}</p>
                    </div>
                `;
                return;
            }

            container.innerHTML = students.map(s => {
                let statusIcon = '';
                let statusTitle = '';
                if (s.sync_status === 'synced') {
                    statusIcon = '<i class="fas fa-cloud" style="color: var(--success);"></i>';
                    statusTitle = 'Синхронизирован';
                } else if (s.sync_status === 'local') {
                    statusIcon = '<i class="fas fa-desktop" style="color: var(--warning);"></i>';
                    statusTitle = 'Локальный аккаунт';
                } else if (s.sync_status === 'conflict') {
                    statusIcon = '<i class="fas fa-exclamation-triangle" style="color: var(--danger);"></i>';
                    statusTitle = 'Конфликт синхронизации';
                }
                const googleIcon = s.google_linked
                    ? '<i class="fab fa-google" style="color: #4285f4; margin-left: 6px;" title="Google привязан"></i>'
                    : '';
                return `
                    <div class="student-card">
                        <div class="student-avatar">
                            ${s.avatar_url
                                ? `<img src="${s.avatar_url}" alt="${this.escapeHtml(s.name)}">`
                                : `<i class="fas fa-user"></i>`
                            }
                        </div>
                        <div class="student-info">
                            <div class="student-name">${this.escapeHtml(s.name)}${googleIcon}</div>
                            <div class="student-email">${this.escapeHtml(s.email)}</div>
                        </div>
                        <div class="student-actions">
                            <div class="student-status" title="${statusTitle}">${statusIcon}</div>
                            <button class="btn btn-icon btn-danger-ghost" onclick="Dashboard.deleteStudent('${s.id}', '${this.escapeHtml(s.name)}')" title="Удалить студента">
                                <i class="fas fa-trash"></i>
                            </button>
                        </div>
                    </div>
                `;
            }).join('');
        } catch (error) {
            console.error('Failed to load students:', error);
            container.innerHTML = '<div class="empty-state"><h3>Ошибка загрузки</h3></div>';
        }
    },
    
    
    async deleteStudent(id, name) {
        if (!confirm(`Удалить студента "${name}"?\n\nВнимание: будут удалены все его результаты тестов!`)) {
            return;
        }
        
        try {
            const result = await API.delete(`/api/teacher/students/${id}`);
            App.showToast(`Студент удалён. Удалено результатов: ${result.deleted?.results || 0}`, 'success');
            this.loadStudents();
        } catch (error) {
            App.showToast(error.message || 'Ошибка удаления', 'error');
        }
    },
    
    
    async clearAllResults() {
        if (!confirm('Удалить ВСЕ результаты тестов?\n\nЭто действие нельзя отменить!')) {
            return;
        }
        
        try {
            const result = await API.delete('/api/teacher/results/all');
            App.showToast(`Удалено результатов: ${result.deleted}`, 'success');
            this.loadResults();
        } catch (error) {
            App.showToast(error.message || 'Ошибка очистки', 'error');
        }
    },
    
    
    async clearOldResults(days = 90) {
        if (!confirm(`Удалить результаты старше ${days} дней?`)) {
            return;
        }
        
        try {
            const result = await API.delete(`/api/teacher/results/old/${days}`);
            App.showToast(`Удалено результатов: ${result.deleted}`, 'success');
            this.loadResults();
        } catch (error) {
            App.showToast(error.message || 'Ошибка очистки', 'error');
        }
    },
    
    
    escapeHtml(str) {
        if (!str) return '';
        return str
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }
};

document.getElementById('add-discipline-btn')?.addEventListener('click', () => {
    Teacher.addDiscipline();
});

document.getElementById('add-test-btn')?.addEventListener('click', () => {
    Teacher.addTest();
});

document.getElementById('add-student-btn')?.addEventListener('click', () => {
    Teacher.addStudent();
});

document.getElementById('import-students-btn')?.addEventListener('click', () => {
    Teacher.importStudents();
});

document.getElementById('manage-groups-btn')?.addEventListener('click', () => {
    Teacher.manageGroups();
});


