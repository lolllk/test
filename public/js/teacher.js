



const Teacher = {
    
    
    
    
    addDiscipline() {
        const content = `
            <form id="discipline-form" class="modal-form">
                <div class="form-group">
                    <label>Название</label>
                    <div class="input-wrapper">
                        <i class="fas fa-book"></i>
                        <input type="text" id="discipline-title" placeholder="Название дисциплины" required maxlength="200">
                    </div>
                </div>
                <div class="form-group">
                    <label>Описание</label>
                    <textarea id="discipline-description" class="text-answer-input" 
                        placeholder="Описание дисциплины (необязательно)" rows="3" maxlength="2000"></textarea>
                </div>
                <div class="modal-actions">
                    <button type="button" class="btn btn-secondary" onclick="App.closeModal()">Отмена</button>
                    <button type="submit" class="btn btn-primary">Создать</button>
                </div>
            </form>
        `;
        
        App.openModal('Новая дисциплина', content);
        
        document.getElementById('discipline-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const title = document.getElementById('discipline-title').value;
            const description = document.getElementById('discipline-description').value;
            
            try {
                await API.post('/api/teacher/disciplines', { title, description });
                App.closeModal();
                App.showToast('Дисциплина создана', 'success');
                Dashboard.loadDisciplines();
            } catch (error) {
                App.showToast(error.message, 'error');
            }
        });
    },
    
    
    async editDiscipline(id) {
        const disciplines = Dashboard.disciplines;
        const discipline = disciplines.find(d => d.id === id);
        
        if (!discipline) return;
        
        const content = `
            <form id="discipline-form" class="modal-form">
                <div class="form-group">
                    <label>Название</label>
                    <div class="input-wrapper">
                        <i class="fas fa-book"></i>
                        <input type="text" id="discipline-title" value="${Dashboard.escapeHtml(discipline.title)}" required maxlength="200">
                    </div>
                </div>
                <div class="form-group">
                    <label>Описание</label>
                    <textarea id="discipline-description" class="text-answer-input" rows="3" maxlength="2000">${Dashboard.escapeHtml(discipline.description || '')}</textarea>
                </div>
                <div class="modal-actions">
                    <button type="button" class="btn btn-secondary" onclick="App.closeModal()">Отмена</button>
                    <button type="submit" class="btn btn-primary">Сохранить</button>
                </div>
            </form>
        `;
        
        App.openModal('Редактировать дисциплину', content);
        
        document.getElementById('discipline-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const title = document.getElementById('discipline-title').value;
            const description = document.getElementById('discipline-description').value;
            
            try {
                await API.put(`/api/teacher/disciplines/${id}`, { title, description });
                App.closeModal();
                App.showToast('Дисциплина обновлена', 'success');
                Dashboard.loadDisciplines();
            } catch (error) {
                App.showToast(error.message, 'error');
            }
        });
    },
    
    
    async manageStudentsForDiscipline(disciplineId) {
        try {
            const [discipline, disciplineStudents, allStudents] = await Promise.all([
                Dashboard.disciplines.find(d => d.id === disciplineId) || { title: 'Дисциплина' },
                API.get(`/api/teacher/disciplines/${disciplineId}/students`).catch(() => []),
                API.get('/api/teacher/students').catch(() => [])
            ]);
            
            const enrolledIds = new Set(disciplineStudents.map(s => s.id));
            const availableStudents = allStudents.filter(s => !enrolledIds.has(s.id));
            
            const content = `
                <div class="manage-students-modal">
                    <div class="manage-tabs">
                        <button class="manage-tab active" data-tab="enrolled">
                            <i class="fas fa-users"></i> На дисциплине (${disciplineStudents.length})
                        </button>
                        <button class="manage-tab" data-tab="available">
                            <i class="fas fa-user-plus"></i> Добавить (${availableStudents.length})
                        </button>
                    </div>
                    
                    <div class="manage-content">
                        <div class="manage-panel active" id="panel-enrolled">
                            ${disciplineStudents.length === 0 ? `
                                <div class="manage-empty">
                                    <i class="fas fa-user-slash"></i>
                                    <p>Нет студентов на этой дисциплине</p>
                                </div>
                            ` : disciplineStudents.map(s => `
                                <div class="manage-student-item">
                                    <div class="manage-avatar">${(s.name || s.email || 'S').substring(0, 2).toUpperCase()}</div>
                                    <div class="manage-info">
                                        <div class="manage-name">${Dashboard.escapeHtml(s.name || 'Без имени')}</div>
                                        <div class="manage-email">${Dashboard.escapeHtml(s.email)}</div>
                                    </div>
                                    <button class="manage-remove" data-student-id="${s.id}" title="Удалить из дисциплины">
                                        <i class="fas fa-times"></i>
                                    </button>
                                </div>
                            `).join('')}
                        </div>
                        
                        <div class="manage-panel" id="panel-available">
                            ${availableStudents.length === 0 ? `
                                <div class="manage-empty">
                                    <i class="fas fa-check-circle"></i>
                                    <p>Все студенты уже добавлены</p>
                                </div>
                            ` : availableStudents.map(s => `
                                <div class="manage-student-item">
                                    <div class="manage-avatar add">${(s.name || s.email || 'S').substring(0, 2).toUpperCase()}</div>
                                    <div class="manage-info">
                                        <div class="manage-name">${Dashboard.escapeHtml(s.name || 'Без имени')}</div>
                                        <div class="manage-email">${Dashboard.escapeHtml(s.email)}</div>
                                    </div>
                                    <button class="manage-add" data-student-id="${s.id}" title="Добавить на дисциплину">
                                        <i class="fas fa-plus"></i>
                                    </button>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                    
                    <div class="modal-actions">
                        <button class="btn btn-secondary" onclick="App.closeModal(); Dashboard.loadDisciplines();">
                            Закрыть
                        </button>
                    </div>
                </div>
                
                <style>
                    .manage-students-modal { margin: -24px; }
                    .manage-tabs { display: flex; border-bottom: 1px solid var(--border-primary); }
                    .manage-tab { 
                        flex: 1; padding: 14px; background: none; border: none; 
                        font-size: 14px; font-weight: 500; color: var(--text-secondary);
                        cursor: pointer; transition: all 0.2s; display: flex; 
                        align-items: center; justify-content: center; gap: 8px;
                    }
                    .manage-tab:hover { color: var(--text-primary); background: var(--bg-tertiary); }
                    .manage-tab.active { color: var(--primary); border-bottom: 2px solid var(--primary); }
                    
                    .manage-content { max-height: 50vh; overflow-y: auto; }
                    .manage-panel { display: none; padding: 16px; }
                    .manage-panel.active { display: block; }
                    
                    .manage-empty { text-align: center; padding: 40px 20px; color: var(--text-tertiary); }
                    .manage-empty i { font-size: 32px; margin-bottom: 12px; opacity: 0.5; display: block; }
                    .manage-empty p { font-size: 14px; }
                    
                    .manage-student-item { 
                        display: flex; align-items: center; gap: 12px;
                        padding: 12px; background: var(--bg-tertiary); 
                        border-radius: 12px; margin-bottom: 8px;
                    }
                    .manage-avatar { 
                        width: 40px; height: 40px; border-radius: 10px;
                        background: linear-gradient(135deg, #bf5af2, #ff375f);
                        display: flex; align-items: center; justify-content: center;
                        color: white; font-weight: 600; font-size: 14px; flex-shrink: 0;
                    }
                    .manage-avatar.add { background: linear-gradient(135deg, #30d158, #34c759); }
                    .manage-info { flex: 1; min-width: 0; }
                    .manage-name { font-weight: 600; font-size: 14px; color: var(--text-primary); }
                    .manage-email { font-size: 12px; color: var(--text-tertiary); margin-top: 2px; }
                    
                    .manage-remove, .manage-add { 
                        width: 32px; height: 32px; border-radius: 8px; 
                        border: none; cursor: pointer; display: flex;
                        align-items: center; justify-content: center;
                        transition: all 0.2s;
                    }
                    .manage-remove { background: var(--danger-bg); color: var(--danger); }
                    .manage-remove:hover { background: var(--danger); color: white; }
                    .manage-add { background: var(--success-bg); color: var(--success); }
                    .manage-add:hover { background: var(--success); color: white; }
                    
                    .manage-students-modal .modal-actions { padding: 16px 24px; border-top: 1px solid var(--border-primary); margin: 0; }
                </style>
            `;
            
            App.openModal(`Студенты: ${Dashboard.escapeHtml(discipline.title)}`, content);
            
            
            document.querySelectorAll('.manage-tab').forEach(tab => {
                tab.addEventListener('click', () => {
                    document.querySelectorAll('.manage-tab').forEach(t => t.classList.remove('active'));
                    document.querySelectorAll('.manage-panel').forEach(p => p.classList.remove('active'));
                    tab.classList.add('active');
                    document.getElementById(`panel-${tab.dataset.tab}`).classList.add('active');
                });
            });
            
            
            document.querySelectorAll('.manage-remove').forEach(btn => {
                btn.addEventListener('click', async () => {
                    const studentId = btn.dataset.studentId;
                    try {
                        await API.delete(`/api/teacher/disciplines/${disciplineId}/students/${studentId}`);
                        App.showToast('Студент удалён из дисциплины', 'success');
                        this.manageStudentsForDiscipline(disciplineId);
                    } catch (error) {
                        App.showToast(error.message, 'error');
                    }
                });
            });
            
            
            document.querySelectorAll('.manage-add').forEach(btn => {
                btn.addEventListener('click', async () => {
                    const studentId = btn.dataset.studentId;
                    try {
                        await API.post(`/api/teacher/disciplines/${disciplineId}/students`, { user_id: studentId });
                        App.showToast('Студент добавлен на дисциплину', 'success');
                        this.manageStudentsForDiscipline(disciplineId);
                    } catch (error) {
                        App.showToast(error.message, 'error');
                    }
                });
            });
            
        } catch (error) {
            console.error('Error managing students:', error);
            App.showToast('Ошибка загрузки студентов', 'error');
        }
    },
    
    
    
    
    async manageTopics(disciplineId) {
        try {
            const discipline = Dashboard.disciplines.find(d => d.id === disciplineId) || { title: 'Дисциплина' };
            const topics = await API.get(`/api/disciplines/${disciplineId}/topics`);
            
            const content = `
                <div class="manage-topics-modal">
                    <div class="manage-topics-header">
                        <div class="topics-info">
                            <span class="topics-count">${topics.length} тем</span>
                        </div>
                        <button class="btn btn-primary btn-sm" id="add-topic-btn">
                            <i class="fas fa-plus"></i> Добавить тему
                        </button>
                    </div>
                    
                    <div class="topics-list" id="topics-list">
                        ${topics.length === 0 ? `
                            <div class="manage-empty">
                                <i class="fas fa-layer-group"></i>
                                <p>Нет тем в этой дисциплине</p>
                                <button class="btn btn-primary btn-sm" onclick="document.getElementById('add-topic-btn').click()">
                                    Создать первую тему
                                </button>
                            </div>
                        ` : topics.map(topic => `
                            <div class="topic-item" data-id="${topic.id}">
                                <div class="topic-icon">
                                    <i class="fas fa-layer-group"></i>
                                </div>
                                <div class="topic-info">
                                    <div class="topic-title">${Dashboard.escapeHtml(topic.title)}</div>
                                    <div class="topic-meta">
                                        <span><i class="fas fa-clipboard-list"></i> ${topic.tests_count || 0} тестов</span>
                                        ${topic.description ? `<span class="topic-desc">${Dashboard.escapeHtml(topic.description)}</span>` : ''}
                                    </div>
                                </div>
                                <div class="topic-actions">
                                    <button class="btn-edit-topic" data-id="${topic.id}" title="Редактировать">
                                        <i class="fas fa-edit"></i>
                                    </button>
                                    <button class="btn-delete-topic" data-id="${topic.id}" title="Удалить">
                                        <i class="fas fa-trash"></i>
                                    </button>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                    
                    <div class="modal-actions">
                        <button class="btn btn-secondary" onclick="App.closeModal(); Dashboard.loadDisciplines();">
                            Закрыть
                        </button>
                    </div>
                </div>
                
                <style>
                    .manage-topics-modal { margin: -24px; }
                    .manage-topics-header { 
                        display: flex; justify-content: space-between; align-items: center;
                        padding: 16px 24px; border-bottom: 1px solid var(--border-primary);
                    }
                    .topics-info { color: var(--text-secondary); font-size: 14px; }
                    .topics-count { font-weight: 600; color: var(--text-primary); }
                    
                    .topics-list { max-height: 50vh; overflow-y: auto; padding: 16px; }
                    
                    .manage-empty { text-align: center; padding: 40px 20px; color: var(--text-tertiary); }
                    .manage-empty i { font-size: 48px; margin-bottom: 16px; opacity: 0.3; display: block; }
                    .manage-empty p { font-size: 14px; margin-bottom: 16px; }
                    
                    .topic-item { 
                        display: flex; align-items: center; gap: 12px;
                        padding: 14px 16px; background: var(--bg-tertiary); 
                        border-radius: 12px; margin-bottom: 8px;
                        transition: all 0.2s;
                    }
                    .topic-item:hover { background: var(--bg-secondary); }
                    
                    .topic-icon { 
                        width: 42px; height: 42px; border-radius: 10px;
                        background: var(--gradient-secondary);
                        display: flex; align-items: center; justify-content: center;
                        color: white; font-size: 16px; flex-shrink: 0;
                    }
                    .topic-info { flex: 1; min-width: 0; }
                    .topic-title { font-weight: 600; font-size: 15px; color: var(--text-primary); }
                    .topic-meta { 
                        font-size: 12px; color: var(--text-tertiary); margin-top: 4px;
                        display: flex; gap: 12px; flex-wrap: wrap;
                    }
                    .topic-meta i { margin-right: 4px; }
                    .topic-desc { 
                        max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
                    }
                    
                    .topic-actions { display: flex; gap: 6px; }
                    .btn-edit-topic, .btn-delete-topic { 
                        width: 32px; height: 32px; border-radius: 8px; 
                        border: none; cursor: pointer; display: flex;
                        align-items: center; justify-content: center;
                        transition: all 0.2s; background: var(--bg-primary);
                        color: var(--text-secondary);
                    }
                    .btn-edit-topic:hover { background: var(--primary); color: white; }
                    .btn-delete-topic:hover { background: var(--danger); color: white; }
                    
                    .manage-topics-modal .modal-actions { padding: 16px 24px; border-top: 1px solid var(--border-primary); margin: 0; }
                </style>
            `;
            
            App.openModal(`Темы: ${Dashboard.escapeHtml(discipline.title)}`, content);
            
            
            window.currentDisciplineId = disciplineId;
            
            
            document.getElementById('add-topic-btn').addEventListener('click', () => {
                this.addTopic(disciplineId);
            });
            
            
            document.querySelectorAll('.btn-edit-topic').forEach(btn => {
                btn.addEventListener('click', () => {
                    this.editTopic(btn.dataset.id, disciplineId);
                });
            });
            
            
            document.querySelectorAll('.btn-delete-topic').forEach(btn => {
                btn.addEventListener('click', async () => {
                    if (!confirm('Удалить тему? Тесты, связанные с этой темой, останутся без темы.')) return;
                    try {
                        await API.delete(`/api/teacher/topics/${btn.dataset.id}`);
                        App.showToast('Тема удалена', 'success');
                        this.manageTopics(disciplineId);
                    } catch (error) {
                        App.showToast(error.message, 'error');
                    }
                });
            });
            
        } catch (error) {
            console.error('Error managing topics:', error);
            App.showToast('Ошибка загрузки тем', 'error');
        }
    },
    
    
    addTopic(disciplineId) {
        const content = `
            <form id="topic-form" class="modal-form">
                <div class="form-group">
                    <label>Название темы</label>
                    <div class="input-wrapper">
                        <i class="fas fa-layer-group"></i>
                        <input type="text" id="topic-title" placeholder="Название темы" required maxlength="200">
                    </div>
                </div>
                <div class="form-group">
                    <label>Описание</label>
                    <textarea id="topic-description" class="text-answer-input" 
                        placeholder="Описание темы (необязательно)" rows="3" maxlength="2000"></textarea>
                </div>
                <div class="modal-actions">
                    <button type="button" class="btn btn-secondary" onclick="Teacher.manageTopics('${disciplineId}')">Назад</button>
                    <button type="submit" class="btn btn-primary">Создать</button>
                </div>
            </form>
        `;
        
        App.openModal('Новая тема', content);
        
        document.getElementById('topic-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const title = document.getElementById('topic-title').value;
            const description = document.getElementById('topic-description').value;
            
            try {
                await API.post('/api/teacher/topics', { discipline_id: disciplineId, title, description });
                App.showToast('Тема создана', 'success');
                this.manageTopics(disciplineId);
            } catch (error) {
                App.showToast(error.message, 'error');
            }
        });
    },
    
    
    async editTopic(topicId, disciplineId) {
        try {
            const topics = await API.get(`/api/disciplines/${disciplineId}/topics`);
            const topic = topics.find(t => t.id === topicId);
            
            if (!topic) {
                App.showToast('Тема не найдена', 'error');
                return;
            }
            
            const content = `
                <form id="topic-form" class="modal-form">
                    <div class="form-group">
                        <label>Название темы</label>
                        <div class="input-wrapper">
                            <i class="fas fa-layer-group"></i>
                            <input type="text" id="topic-title" value="${Dashboard.escapeHtml(topic.title)}" required maxlength="200">
                        </div>
                    </div>
                    <div class="form-group">
                        <label>Описание</label>
                        <textarea id="topic-description" class="text-answer-input" rows="3" maxlength="2000">${Dashboard.escapeHtml(topic.description || '')}</textarea>
                    </div>
                    <div class="modal-actions">
                        <button type="button" class="btn btn-secondary" onclick="Teacher.manageTopics('${disciplineId}')">Назад</button>
                        <button type="submit" class="btn btn-primary">Сохранить</button>
                    </div>
                </form>
            `;
            
            App.openModal('Редактировать тему', content);
            
            document.getElementById('topic-form').addEventListener('submit', async (e) => {
                e.preventDefault();
                
                const title = document.getElementById('topic-title').value;
                const description = document.getElementById('topic-description').value;
                
                try {
                    await API.put(`/api/teacher/topics/${topicId}`, { title, description });
                    App.showToast('Тема обновлена', 'success');
                    this.manageTopics(disciplineId);
                } catch (error) {
                    App.showToast(error.message, 'error');
                }
            });
        } catch (error) {
            App.showToast('Ошибка загрузки темы', 'error');
        }
    },
    
    
    
    
    async addTest() {
        let disciplines;
        try {
            disciplines = await API.get('/api/disciplines');
        } catch (e) {
            App.showToast('Ошибка загрузки дисциплин', 'error');
            return;
        }
        
        if (!disciplines || disciplines.length === 0) {
            App.showToast('Сначала создайте дисциплину', 'warning');
            return;
        }
        
        const content = `
            <div class="modal-form">
                <div class="form-group">
                    <label>Название теста</label>
                    <div class="input-wrapper">
                        <i class="fas fa-clipboard-list"></i>
                        <input type="text" id="new-test-title" placeholder="Название теста" maxlength="200">
                    </div>
                </div>
                
                <div class="form-group">
                    <label>Дисциплина</label>
                    <div class="input-wrapper">
                        <i class="fas fa-book"></i>
                        <select id="new-test-discipline">
                            <option value="">Выберите дисциплину</option>
                            ${disciplines.map(d => `<option value="${d.id}">${Dashboard.escapeHtml(d.title)}</option>`).join('')}
                        </select>
                    </div>
                </div>
                
                <div class="form-group">
                    <label>Тема (необязательно)</label>
                    <div class="input-wrapper">
                        <i class="fas fa-layer-group"></i>
                        <select id="new-test-topic" disabled>
                            <option value="">Сначала выберите дисциплину</option>
                        </select>
                    </div>
                </div>
                
                <div class="form-group">
                    <label>Описание</label>
                    <textarea id="new-test-description" class="text-answer-input" rows="2" 
                        placeholder="Описание теста (необязательно)" maxlength="2000"></textarea>
                </div>
                
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
                    <div class="form-group">
                        <label>Время (минуты)</label>
                        <div class="input-wrapper">
                            <i class="fas fa-clock"></i>
                            <input type="number" id="new-test-time" placeholder="Без ограничения" min="1" max="600" step="1">
                        </div>
                    </div>
                    
                    <div class="form-group">
                        <label>Попытки</label>
                        <div class="input-wrapper">
                            <i class="fas fa-redo"></i>
                            <input type="number" id="new-test-attempts" value="1" min="1" max="100" step="1">
                        </div>
                    </div>
                    
                    <div class="form-group">
                        <label>Вопросов (макс)</label>
                        <div class="input-wrapper">
                            <i class="fas fa-question-circle"></i>
                            <input type="number" id="new-test-questions-limit" placeholder="Все" min="1" max="500" step="1">
                        </div>
                    </div>
                    
                    <div class="form-group">
                        <label>Проходной %</label>
                        <div class="input-wrapper">
                            <i class="fas fa-percentage"></i>
                            <input type="number" id="new-test-passing" value="60" min="0" max="100" step="1">
                        </div>
                    </div>
                </div>
                
                <div style="display: flex; gap: 1rem; margin-top: 0.5rem;">
                    <label style="display: flex; align-items: center; gap: 0.5rem; cursor: pointer;">
                        <input type="checkbox" id="new-test-shuffle-questions">
                        <span>Перемешивать вопросы</span>
                    </label>
                    <label style="display: flex; align-items: center; gap: 0.5rem; cursor: pointer;">
                        <input type="checkbox" id="new-test-shuffle-answers">
                        <span>Перемешивать ответы</span>
                    </label>
                </div>
                
                <div class="modal-actions">
                    <button type="button" class="btn btn-secondary" onclick="App.closeModal()">Отмена</button>
                    <button type="button" class="btn btn-primary" onclick="window.createTest()">
                        <i class="fas fa-plus"></i> Создать
                    </button>
                </div>
            </div>
        `;
        
        App.openModal('Новый тест', content);
        
        
        document.getElementById('new-test-discipline').addEventListener('change', async (e) => {
            const topicSelect = document.getElementById('new-test-topic');
            const disciplineId = e.target.value;
            
            if (!disciplineId) {
                topicSelect.disabled = true;
                topicSelect.innerHTML = '<option value="">Сначала выберите дисциплину</option>';
                return;
            }
            
            try {
                const topics = await API.get(`/api/disciplines/${disciplineId}/topics`);
                topicSelect.disabled = false;
                topicSelect.innerHTML = '<option value="">Без темы</option>' +
                    topics.map(t => `<option value="${t.id}">${Dashboard.escapeHtml(t.title)}</option>`).join('');
            } catch (error) {
                topicSelect.disabled = true;
                topicSelect.innerHTML = '<option value="">Ошибка загрузки тем</option>';
            }
        });
    },
    
    
    async editTest(testId) {
        try {
            const test = await API.get(`/api/tests/${testId}`);
            const disciplines = await API.get('/api/disciplines');
            
            const content = `
                <form id="edit-test-form" class="modal-form">
                    <div class="form-group">
                        <label>Название теста</label>
                        <div class="input-wrapper">
                            <i class="fas fa-clipboard-list"></i>
                            <input type="text" id="edit-test-title" value="${Dashboard.escapeHtml(test.title)}" required>
                        </div>
                    </div>
                    
                    <div class="form-group">
                        <label>Дисциплина</label>
                        <div class="input-wrapper">
                            <i class="fas fa-book"></i>
                            <select id="edit-test-discipline" required>
                                ${disciplines.map(d => `
                                    <option value="${d.id}" ${d.id === test.discipline_id ? 'selected' : ''}>
                                        ${Dashboard.escapeHtml(d.title)}
                                    </option>
                                `).join('')}
                            </select>
                        </div>
                    </div>
                    
                    <div class="form-group">
                        <label>Описание</label>
                        <textarea id="edit-test-description" class="text-answer-input" rows="2" maxlength="2000">${Dashboard.escapeHtml(test.description || '')}</textarea>
                    </div>
                    
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
                        <div class="form-group">
                            <label>Время (минуты)</label>
                            <div class="input-wrapper">
                                <i class="fas fa-clock"></i>
                                <input type="number" id="edit-test-time" value="${test.time_limit ? Math.round(test.time_limit / 60) : ''}" min="1" max="600" step="1">
                            </div>
                        </div>
                        
                        <div class="form-group">
                            <label>Попытки</label>
                            <div class="input-wrapper">
                                <i class="fas fa-redo"></i>
                                <input type="number" id="edit-test-attempts" value="${test.attempts_limit || 1}" min="1" max="100" step="1">
                            </div>
                        </div>
                        
                        <div class="form-group">
                            <label>Вопросов (макс)</label>
                            <div class="input-wrapper">
                                <i class="fas fa-question-circle"></i>
                                <input type="number" id="edit-test-questions-limit" value="${test.questions_limit || ''}" min="1" max="500" step="1">
                            </div>
                        </div>
                        
                        <div class="form-group">
                            <label>Проходной %</label>
                            <div class="input-wrapper">
                                <i class="fas fa-percentage"></i>
                                <input type="number" id="edit-test-passing" value="${test.passing_score || 60}" min="0" max="100" step="1">
                            </div>
                        </div>
                    </div>
                    
                    <div style="display: flex; flex-wrap: wrap; gap: 1rem; margin-top: 0.5rem;">
                        <label style="display: flex; align-items: center; gap: 0.5rem; cursor: pointer;">
                            <input type="checkbox" id="edit-test-shuffle-questions" ${test.shuffle_questions ? 'checked' : ''}>
                            <span>Перемешивать вопросы</span>
                        </label>
                        <label style="display: flex; align-items: center; gap: 0.5rem; cursor: pointer;">
                            <input type="checkbox" id="edit-test-shuffle-answers" ${test.shuffle_answers ? 'checked' : ''}>
                            <span>Перемешивать ответы</span>
                        </label>
                    </div>
                    
                    <div class="publish-hint ${test.is_published ? 'published' : ''}">
                        <label style="display: flex; align-items: center; gap: 0.5rem; cursor: pointer;">
                            <input type="checkbox" id="edit-test-published" ${test.is_published ? 'checked' : ''}>
                            <span><i class="fas ${test.is_published ? 'fa-eye' : 'fa-eye-slash'}"></i> <strong>Опубликован</strong></span>
                        </label>
                        <small>${test.is_published ? '✓ Студенты видят этот тест' : '⚠ Студенты НЕ видят этот тест'}</small>
                    </div>
                    
                    <style>
                        .publish-hint { padding: 12px; border-radius: 10px; background: var(--warning-bg); border: 1px solid var(--warning); margin-top: 8px; }
                        .publish-hint.published { background: var(--success-bg); border-color: var(--success); }
                        .publish-hint small { display: block; margin-top: 6px; font-size: 12px; color: var(--text-secondary); }
                    </style>
                    
                    <div class="modal-actions">
                        <button type="button" class="btn btn-secondary" onclick="Teacher.editTestQuestions('${testId}')">
                            <i class="fas fa-list"></i> Вопросы
                        </button>
                        <button type="button" class="btn btn-danger" onclick="Teacher.deleteTest('${testId}')">
                            <i class="fas fa-trash"></i>
                        </button>
                        <button type="submit" class="btn btn-primary">Сохранить</button>
                    </div>
                </form>
            `;
            
            App.openModal('Редактировать тест', content);
            
            document.getElementById('edit-test-form').addEventListener('submit', async (e) => {
                e.preventDefault();
                
                const titleInput = document.getElementById('edit-test-title');
                const disciplineInput = document.getElementById('edit-test-discipline');
                const descriptionInput = document.getElementById('edit-test-description');
                const timeInput = document.getElementById('edit-test-time');
                const attemptsInput = document.getElementById('edit-test-attempts');
                const questionsLimitInput = document.getElementById('edit-test-questions-limit');
                const passingInput = document.getElementById('edit-test-passing');
                const shuffleQuestionsInput = document.getElementById('edit-test-shuffle-questions');
                const shuffleAnswersInput = document.getElementById('edit-test-shuffle-answers');
                const publishedInput = document.getElementById('edit-test-published');
                
                const title = titleInput?.value?.trim() || '';
                
                if (!title) {
                    App.showToast('Введите название теста', 'error');
                    if (titleInput) titleInput.focus();
                    return;
                }
                
                if (title.length > 200) {
                    App.showToast('Название: максимум 200 символов', 'error');
                    return;
                }
                
                
                let timeLimit = null;
                if (timeInput?.value) {
                    const mins = parseInt(timeInput.value);
                    if (isNaN(mins) || mins < 1 || mins > 600) {
                        App.showToast('Время теста: от 1 до 600 минут', 'error');
                        return;
                    }
                    timeLimit = mins * 60;
                }
                
                const attemptsVal = parseInt(attemptsInput?.value) || 1;
                if (attemptsVal < 1 || attemptsVal > 100) {
                    App.showToast('Попытки: от 1 до 100', 'error');
                    return;
                }
                
                const passingVal = parseInt(passingInput?.value) || 60;
                if (passingVal < 0 || passingVal > 100) {
                    App.showToast('Проходной балл: от 0 до 100', 'error');
                    return;
                }
                
                const data = {
                    title: title,
                    discipline_id: disciplineInput?.value || null,
                    description: descriptionInput?.value || '',
                    time_limit: timeLimit,
                    attempts_limit: attemptsVal,
                    questions_limit: questionsLimitInput?.value ? parseInt(questionsLimitInput.value) : null,
                    passing_score: passingVal,
                    shuffle_questions: shuffleQuestionsInput?.checked || false,
                    shuffle_answers: shuffleAnswersInput?.checked || false,
                    is_published: publishedInput?.checked || false
                };
                
                try {
                    await API.put(`/api/teacher/tests/${testId}`, data);
                    App.closeModal();
                    App.showToast('Тест обновлён', 'success');
                    Dashboard.loadTests();
                } catch (error) {
                    App.showToast(error.message, 'error');
                }
            });
        } catch (error) {
            App.showToast(error.message, 'error');
        }
    },
    
    
    async deleteTest(testId) {
        if (!confirm('Удалить тест? Все вопросы и результаты будут потеряны.')) return;
        
        try {
            await API.delete(`/api/teacher/tests/${testId}`);
            App.closeModal();
            App.showToast('Тест удалён', 'success');
            Dashboard.loadTests();
        } catch (error) {
            App.showToast(error.message, 'error');
        }
    },
    
    
    
    
    async editTestQuestions(testId) {
        try {
            const questions = await API.get(`/api/teacher/tests/${testId}/questions`);
            const test = await API.get(`/api/tests/${testId}`);
            
            const totalPoints = questions.reduce((sum, q) => sum + (q.weight || 1), 0);
            
            let content = `
                <div class="question-editor">
                    <div class="qed-header">
                        <div class="qed-actions-row">
                            <button class="qed-action-main" onclick="Teacher.addQuestion('${testId}')">
                                <i class="fas fa-plus"></i>
                                <span>Добавить вопрос</span>
                            </button>
                            <button class="qed-action-alt" onclick="Teacher.openCopyQuestions('${testId}')">
                                <i class="fas fa-file-import"></i>
                                <span>Импорт</span>
                            </button>
                        </div>
                    </div>
                    
                    <div class="qed-body">
            `;
            
            if (questions.length === 0) {
                content += `
                    <div class="qed-empty">
                        <div class="qed-empty-visual">
                            <div class="qed-empty-circle"></div>
                            <i class="fas fa-clipboard-list"></i>
                        </div>
                        <h3>Добавьте первый вопрос</h3>
                        <p>Нажмите кнопку "Новый вопрос" или импортируйте из другого теста</p>
                    </div>
                `;
            } else {
                content += `<div class="qed-list">`;
                questions.forEach((q, i) => {
                    content += this.renderQuestionItem(q, i + 1);
                });
                content += `</div>`;
            }
            
            content += `
                    </div>
                    
                    <div class="qed-footer">
                        <button class="qed-done" onclick="App.closeModal(); Dashboard.loadTests();">
                            <i class="fas fa-check"></i>
                            Готово
                        </button>
                    </div>
                </div>
                
                <style>
                    .question-editor {
                        display: flex;
                        flex-direction: column;
                        height: 65vh;
                        max-height: 550px;
                        margin: -1.5rem;
                    }
                    
                    .qed-header {
                        display: flex;
                        justify-content: center;
                        align-items: center;
                        padding: 0.875rem 1.25rem;
                        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                        border-bottom: none;
                    }
                    .qed-actions-row {
                        display: flex;
                        gap: 0.75rem;
                    }
                    .qed-stat-card {
                        display: flex;
                        align-items: center;
                        gap: 0.5rem;
                        background: rgba(255, 255, 255, 0.15);
                        backdrop-filter: blur(10px);
                        padding: 0.5rem 0.75rem;
                        border-radius: 10px;
                        border: 1px solid rgba(255, 255, 255, 0.2);
                    }
                    .qed-stat-icon {
                        width: 30px;
                        height: 30px;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        border-radius: 10px;
                        font-size: 0.875rem;
                    }
                    .qed-stat-icon.blue {
                        background: rgba(96, 165, 250, 0.3);
                        color: #bfdbfe;
                    }
                    .qed-stat-icon.gold {
                        background: rgba(251, 191, 36, 0.3);
                        color: #fde68a;
                    }
                    .qed-stat-data {
                        display: flex;
                        flex-direction: column;
                        line-height: 1.2;
                    }
                    .qed-stat-value {
                        font-size: 1.125rem;
                        font-weight: 700;
                        color: white;
                    }
                    .qed-stat-label {
                        font-size: 0.7rem;
                        color: rgba(255, 255, 255, 0.75);
                        text-transform: uppercase;
                        letter-spacing: 0.3px;
                    }
                    .qed-actions-row {
                        display: flex;
                        gap: 0.5rem;
                    }
                    .qed-action-main {
                        display: inline-flex;
                        align-items: center;
                        gap: 0.375rem;
                        padding: 0.5rem 0.875rem;
                        background: white;
                        color: #6366f1;
                        border: none;
                        border-radius: 10px;
                        font-weight: 600;
                        font-size: 0.875rem;
                        cursor: pointer;
                        transition: all 0.2s ease;
                        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
                    }
                    .qed-action-main:hover {
                        transform: translateY(-2px);
                        box-shadow: 0 6px 20px rgba(0, 0, 0, 0.2);
                    }
                    .qed-action-alt {
                        display: inline-flex;
                        align-items: center;
                        gap: 0.375rem;
                        padding: 0.5rem 0.75rem;
                        background: rgba(255, 255, 255, 0.15);
                        color: white;
                        border: 1px solid rgba(255, 255, 255, 0.3);
                        border-radius: 10px;
                        font-weight: 500;
                        font-size: 0.875rem;
                        cursor: pointer;
                        transition: all 0.2s ease;
                        backdrop-filter: blur(5px);
                    }
                    .qed-action-alt:hover {
                        background: rgba(255, 255, 255, 0.25);
                        border-color: rgba(255, 255, 255, 0.5);
                    }
                    
                    .qed-body {
                        flex: 1;
                        overflow-y: auto;
                        padding: 1.25rem 1.5rem;
                        background: #f1f5f9;
                    }
                    .qed-body::-webkit-scrollbar { width: 8px; }
                    .qed-body::-webkit-scrollbar-track { background: transparent; }
                    .qed-body::-webkit-scrollbar-thumb { 
                        background: #cbd5e1; 
                        border-radius: 4px;
                    }
                    .qed-body::-webkit-scrollbar-thumb:hover { background: #94a3b8; }
                    
                    .qed-empty {
                        display: flex;
                        flex-direction: column;
                        align-items: center;
                        justify-content: center;
                        height: 100%;
                        text-align: center;
                    }
                    .qed-empty-visual {
                        position: relative;
                        width: 100px;
                        height: 100px;
                        margin-bottom: 1.5rem;
                    }
                    .qed-empty-circle {
                        position: absolute;
                        inset: 0;
                        background: linear-gradient(135deg, #e0e7ff 0%, #c7d2fe 100%);
                        border-radius: 50%;
                        animation: pulse-subtle 2s ease-in-out infinite;
                    }
                    .qed-empty-visual i {
                        position: relative;
                        font-size: 2.5rem;
                        color: #6366f1;
                        line-height: 100px;
                    }
                    @keyframes pulse-subtle {
                        0%, 100% { transform: scale(1); opacity: 1; }
                        50% { transform: scale(1.05); opacity: 0.8; }
                    }
                    .qed-empty h3 {
                        margin: 0;
                        font-size: 1.25rem;
                        font-weight: 600;
                        color: #1e293b;
                    }
                    .qed-empty p {
                        margin: 0.5rem 0 0;
                        color: #64748b;
                        font-size: 0.9375rem;
                    }
                    
                    .qed-list {
                        display: flex;
                        flex-direction: column;
                        gap: 0.75rem;
                    }
                    
                    .qed-item {
                        display: flex;
                        align-items: center;
                        background: white;
                        border-radius: 14px;
                        padding: 1rem 1.25rem;
                        box-shadow: 0 1px 3px rgba(0,0,0,0.05), 0 1px 2px rgba(0,0,0,0.03);
                        transition: all 0.2s ease;
                        border: 1px solid transparent;
                    }
                    .qed-item:hover {
                        box-shadow: 0 4px 12px rgba(0,0,0,0.08);
                        border-color: #c7d2fe;
                    }
                    .qed-item-num {
                        width: 36px;
                        height: 36px;
                        background: linear-gradient(135deg, #6366f1 0%, #818cf8 100%);
                        color: white;
                        border-radius: 10px;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        font-weight: 700;
                        font-size: 0.9375rem;
                        flex-shrink: 0;
                        margin-right: 1rem;
                    }
                    .qed-item-main {
                        flex: 1;
                        min-width: 0;
                    }
                    .qed-item-top {
                        display: flex;
                        align-items: center;
                        gap: 0.625rem;
                        margin-bottom: 0.25rem;
                    }
                    .qed-item-type {
                        display: inline-flex;
                        align-items: center;
                        gap: 0.25rem;
                        padding: 0.2rem 0.6rem;
                        background: #eff6ff;
                        color: #3b82f6;
                        border-radius: 5px;
                        font-size: 0.6875rem;
                        font-weight: 600;
                        text-transform: uppercase;
                        letter-spacing: 0.03em;
                    }
                    .qed-item-type.single { background: #f0fdf4; color: #16a34a; }
                    .qed-item-type.multiple { background: #fef3c7; color: #d97706; }
                    .qed-item-type.text { background: #fae8ff; color: #c026d3; }
                    .qed-item-type.match { background: #ecfeff; color: #0891b2; }
                    .qed-item-type.order { background: #fef2f2; color: #dc2626; }
                    
                    .qed-item-pts {
                        font-size: 0.75rem;
                        color: #94a3b8;
                    }
                    .qed-item-pts i {
                        color: #fbbf24;
                        margin-right: 0.2rem;
                    }
                    .qed-item-text {
                        color: #334155;
                        font-size: 0.9375rem;
                        line-height: 1.4;
                        display: -webkit-box;
                        -webkit-line-clamp: 1;
                        -webkit-box-orient: vertical;
                        overflow: hidden;
                    }
                    .qed-item-actions {
                        display: flex;
                        gap: 0.5rem;
                        margin-left: 1rem;
                        opacity: 0;
                        transition: opacity 0.15s;
                    }
                    .qed-item:hover .qed-item-actions {
                        opacity: 1;
                    }
                    .qed-action-btn {
                        width: 36px;
                        height: 36px;
                        border-radius: 10px;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        color: #64748b;
                        background: #f1f5f9;
                        border: none;
                        cursor: pointer;
                        transition: all 0.15s;
                    }
                    .qed-action-btn:hover {
                        color: white;
                    }
                    .qed-action-btn.edit:hover { background: #6366f1; }
                    .qed-action-btn.delete:hover { background: #ef4444; }
                    
                    .qed-footer {
                        padding: 1rem 1.5rem;
                        background: white;
                        border-top: 1px solid #e2e8f0;
                        display: flex;
                        justify-content: flex-end;
                    }
                    .qed-done {
                        display: inline-flex;
                        align-items: center;
                        gap: 0.625rem;
                        padding: 0.75rem 2rem;
                        background: linear-gradient(135deg, #10b981 0%, #059669 100%);
                        color: white;
                        border: none;
                        border-radius: 12px;
                        font-weight: 600;
                        font-size: 1rem;
                        cursor: pointer;
                        transition: all 0.15s;
                        box-shadow: 0 4px 14px rgba(16, 185, 129, 0.35);
                    }
                    .qed-done:hover {
                        transform: translateY(-2px);
                        box-shadow: 0 6px 20px rgba(16, 185, 129, 0.45);
                    }

                    [data-theme="dark"] .qed-body {
                        background: #1c1c1e;
                    }
                    [data-theme="dark"] .qed-body::-webkit-scrollbar-thumb {
                        background: #48484a;
                    }
                    [data-theme="dark"] .qed-body::-webkit-scrollbar-thumb:hover {
                        background: #636366;
                    }
                    [data-theme="dark"] .qed-empty-circle {
                        background: linear-gradient(135deg, rgba(99, 102, 241, 0.2) 0%, rgba(129, 140, 248, 0.2) 100%);
                    }
                    [data-theme="dark"] .qed-empty h3 {
                        color: #f5f5f7;
                    }
                    [data-theme="dark"] .qed-empty p {
                        color: #a1a1a6;
                    }
                    [data-theme="dark"] .qed-item {
                        background: #2c2c2e;
                        box-shadow: 0 1px 3px rgba(0,0,0,0.2);
                    }
                    [data-theme="dark"] .qed-item:hover {
                        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
                        border-color: rgba(99, 102, 241, 0.3);
                    }
                    [data-theme="dark"] .qed-item-text {
                        color: #e5e5ea;
                    }
                    [data-theme="dark"] .qed-item-pts {
                        color: #8e8e93;
                    }
                    [data-theme="dark"] .qed-action-btn {
                        color: #a1a1a6;
                        background: #3a3a3c;
                    }
                    [data-theme="dark"] .qed-action-main {
                        background: rgba(255, 255, 255, 0.12);
                        color: #a5b4fc;
                    }
                    [data-theme="dark"] .qed-footer {
                        background: #1c1c1e;
                        border-top-color: rgba(255, 255, 255, 0.1);
                    }
                </style>
            `;
            
            App.openModal(`Вопросы: ${test.title}`, content);
            
        } catch (error) {
            App.showToast(error.message, 'error');
        }
    },
    
    
    renderQuestionItem(question, number) {
        const typeConfig = {
            single: { label: 'Один', icon: 'fa-dot-circle', cls: 'single' },
            multiple: { label: 'Несколько', icon: 'fa-check-square', cls: 'multiple' },
            text: { label: 'Текст', icon: 'fa-font', cls: 'text' },
            match: { label: 'Соответствие', icon: 'fa-random', cls: 'match' },
            order: { label: 'Порядок', icon: 'fa-sort-numeric-down', cls: 'order' }
        };
        const type = typeConfig[question.type] || { label: question.type, icon: 'fa-question', cls: '' };
        
        return `
            <div class="qed-item" data-id="${question.id}">
                <div class="qed-item-num">${number}</div>
                <div class="qed-item-main">
                    <div class="qed-item-top">
                        <span class="qed-item-type ${type.cls}">
                            <i class="fas ${type.icon}"></i> ${type.label}
                        </span>
                        <span class="qed-item-pts"><i class="fas fa-star"></i>${question.weight || 1} б.</span>
                    </div>
                    <div class="qed-item-text">${Dashboard.escapeHtml(question.text)}</div>
                </div>
                <div class="qed-item-actions">
                    <button class="qed-action-btn edit" onclick="Teacher.editQuestion('${question.id}')" title="Редактировать">
                        <i class="fas fa-pen"></i>
                    </button>
                    <button class="qed-action-btn delete" onclick="Teacher.deleteQuestion('${question.id}', '${question.test_id}')" title="Удалить">
                        <i class="fas fa-trash-alt"></i>
                    </button>
                </div>
            </div>
        `;
    },
    
    
    addQuestion(testId) {
        const content = `
            <form id="question-form" class="modal-form">
                <div class="form-group">
                    <label>Тип вопроса</label>
                    <div class="input-wrapper">
                        <i class="fas fa-list"></i>
                        <select id="question-type" required>
                            <option value="single">Один ответ</option>
                            <option value="multiple">Несколько ответов</option>
                            <option value="text">Текстовый ответ</option>
                            <option value="match">Сопоставление</option>
                            <option value="order">Сортировка</option>
                        </select>
                    </div>
                </div>
                
                <div class="form-group">
                    <label>Текст вопроса</label>
                    <textarea id="question-text" class="text-answer-input" rows="2" required></textarea>
                </div>
                
                <div class="form-group">
                    <label>Вес вопроса</label>
                    <div class="input-wrapper">
                        <i class="fas fa-balance-scale"></i>
                        <input type="number" id="question-weight" value="1" min="1" required>
                    </div>
                </div>
                
                <div id="answers-section">
                    <label>Варианты ответов</label>
                    <div id="answers-list"></div>
                    <button type="button" class="btn btn-secondary mt-2" onclick="Teacher.addAnswerField()">
                        <i class="fas fa-plus"></i> Добавить вариант
                    </button>
                </div>
                
                <div class="modal-actions">
                    <button type="button" class="btn btn-secondary" onclick="Teacher.editTestQuestions('${testId}')">Назад</button>
                    <button type="submit" class="btn btn-primary">Сохранить</button>
                </div>
            </form>
            
            <style>
                .answer-field {
                    display: flex;
                    gap: 0.5rem;
                    margin-bottom: 0.5rem;
                    align-items: center;
                }
                .answer-field input[type="text"] {
                    flex: 1;
                    padding: 0.5rem 0.75rem;
                    border: 1px solid var(--gray-300);
                    border-radius: 0.5rem;
                    background: var(--bg-primary);
                    color: var(--text-primary);
                    font-size: 0.875rem;
                    transition: border-color 0.2s, box-shadow 0.2s;
                }
                .answer-field input[type="text"]:focus {
                    outline: none;
                    border-color: var(--primary);
                    box-shadow: 0 0 0 3px var(--primary-light);
                }
                .answer-field input[type="text"]::placeholder {
                    color: var(--text-tertiary);
                }
                .answer-field input[type="checkbox"],
                .answer-field input[type="radio"] {
                    width: 20px;
                    height: 20px;
                    cursor: pointer;
                    accent-color: var(--primary);
                }
                .answer-field button {
                    padding: 0.375rem 0.5rem;
                    color: var(--danger);
                    background: none;
                    border: none;
                    border-radius: 0.375rem;
                    cursor: pointer;
                    transition: background 0.15s;
                }
                .answer-field button:hover {
                    background: var(--danger-light);
                }
            </style>
        `;
        
        App.openModal('Добавить вопрос', content);
        
        
        this.initAnswersSection();
        
        document.getElementById('question-type').addEventListener('change', () => {
            this.initAnswersSection();
        });
        
        document.getElementById('question-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const type = document.getElementById('question-type').value;
            const data = {
                test_id: testId,
                text: document.getElementById('question-text').value,
                type: type,
                weight: parseInt(document.getElementById('question-weight').value)
            };
            
            
            if (type === 'match') {
                data.pairs = this.collectMatchingPairs();
                if (data.pairs.length < 2) {
                    App.showToast('Добавьте минимум 2 пары для сопоставления', 'error');
                    return;
                }
            } else if (type === 'text') {
                data.answers = this.collectAnswers(type);
            } else if (type === 'order') {
                data.answers = this.collectAnswers(type);
                if (data.answers.length < 2) {
                    App.showToast('Добавьте минимум 2 элемента для сортировки', 'error');
                    return;
                }
            } else {
                
                data.answers = this.collectAnswers(type);
                
                
                const hasCorrect = data.answers.some(a => a.is_correct);
                if (!hasCorrect) {
                    App.showToast('Укажите хотя бы один правильный ответ', 'error');
                    return;
                }
                
                
                if (data.answers.length < 2) {
                    App.showToast('Добавьте минимум 2 варианта ответа', 'error');
                    return;
                }
            }
            
            try {
                await API.post('/api/teacher/questions', data);
                App.showToast('Вопрос добавлен', 'success');
                this.editTestQuestions(testId);
            } catch (error) {
                App.showToast(error.message, 'error');
            }
        });
    },
    
    
    initAnswersSection() {
        const type = document.getElementById('question-type').value;
        const section = document.getElementById('answers-section');
        const list = document.getElementById('answers-list');
        
        list.innerHTML = '';
        
        if (type === 'match') {
            section.querySelector('label').textContent = 'Пары для сопоставления';
            section.querySelector('button').textContent = 'Добавить пару';
            this.addMatchingField();
            this.addMatchingField();
        } else {
            section.querySelector('label').textContent = 'Варианты ответов';
            section.querySelector('button').textContent = 'Добавить вариант';
            this.addAnswerField();
            this.addAnswerField();
        }
    },
    
    
    addAnswerField(text = '', isCorrect = false, position = null) {
        const type = document.getElementById('question-type').value;
        const list = document.getElementById('answers-list');
        const index = list.children.length;
        
        const div = document.createElement('div');
        div.className = 'answer-field';
        
        if (type === 'order') {
            div.innerHTML = `
                <span style="color: var(--gray-500);">${index + 1}.</span>
                <input type="text" placeholder="Текст ответа" value="${Dashboard.escapeHtml(text)}" required>
                <button type="button" onclick="this.parentElement.remove()"><i class="fas fa-times"></i></button>
            `;
        } else {
            const inputType = type === 'single' ? 'radio' : 'checkbox';
            div.innerHTML = `
                <input type="${inputType}" name="correct" ${isCorrect ? 'checked' : ''} title="Правильный ответ">
                <input type="text" placeholder="Текст ответа" value="${Dashboard.escapeHtml(text)}" required>
                <button type="button" onclick="this.parentElement.remove()"><i class="fas fa-times"></i></button>
            `;
        }
        
        list.appendChild(div);
    },
    
    
    addMatchingField(left = '', right = '') {
        const list = document.getElementById('answers-list');
        
        const div = document.createElement('div');
        div.className = 'answer-field';
        div.innerHTML = `
            <input type="text" placeholder="Левая часть" value="${Dashboard.escapeHtml(left)}" required>
            <i class="fas fa-arrow-right" style="color: var(--gray-400);"></i>
            <input type="text" placeholder="Правая часть" value="${Dashboard.escapeHtml(right)}" required>
            <button type="button" onclick="this.parentElement.remove()"><i class="fas fa-times"></i></button>
        `;
        
        list.appendChild(div);
    },
    
    
    collectAnswers(type) {
        const list = document.getElementById('answers-list');
        const fields = list.querySelectorAll('.answer-field');
        const answers = [];
        
        fields.forEach((field, index) => {
            const textInput = field.querySelector('input[type="text"]');
            const correctInput = field.querySelector('input[type="checkbox"], input[type="radio"]');
            
            answers.push({
                text: textInput.value,
                is_correct: type === 'order' ? false : (correctInput?.checked || false),
                position: type === 'order' ? index + 1 : null
            });
        });
        
        return answers;
    },
    
    
    collectMatchingPairs() {
        const list = document.getElementById('answers-list');
        const fields = list.querySelectorAll('.answer-field');
        const pairs = [];
        
        fields.forEach(field => {
            const inputs = field.querySelectorAll('input[type="text"]');
            if (inputs.length >= 2) {
                pairs.push({
                    left_text: inputs[0].value,
                    right_text: inputs[1].value
                });
            }
        });
        
        return pairs;
    },
    
    
    async openCopyQuestions(targetTestId) {
        try {
            const tests = await API.get(`/api/teacher/all-questions?exclude=${targetTestId}`);
            
            if (!tests || tests.length === 0) {
                App.showToast('Нет других тестов с вопросами. Создайте ещё один тест и добавьте в него вопросы.', 'info');
                return;
            }
            
            const typeLabels = {
                single: 'Один ответ',
                multiple: 'Несколько',
                text: 'Текст',
                match: 'Сопоставление',
                order: 'Сортировка'
            };
            
            let content = `
                <div class="import-questions-modal">
                    <p class="import-hint">Выберите вопросы для копирования:</p>
                    
                    <div class="import-tests-list">
            `;
            
            tests.forEach((test, index) => {
                content += `
                    <div class="import-test-block" data-test-index="${index}">
                        <div class="import-test-header" onclick="Teacher.toggleImportAccordion(${index})">
                            <input type="checkbox" class="import-test-checkbox" data-test-index="${index}" 
                                   onclick="Teacher.toggleTestQuestions(event, ${index})">
                            <i class="fas fa-chevron-right import-chevron"></i>
                            <div class="import-test-info">
                                <span class="import-test-title">${Dashboard.escapeHtml(test.title)}</span>
                                <span class="import-test-meta">${test.discipline_title || 'Без дисциплины'}</span>
                            </div>
                            <span class="import-test-count">${test.questions_count}</span>
                        </div>
                        <div class="import-test-questions">
                            ${test.questions.map(q => `
                                <label class="import-question-item">
                                    <input type="checkbox" class="question-checkbox" 
                                           data-question-id="${q.id}" data-test-index="${index}">
                                    <span class="import-question-text">${Dashboard.escapeHtml(q.text)}</span>
                                    <span class="import-question-type">${typeLabels[q.type] || q.type}</span>
                                </label>
                            `).join('')}
                        </div>
                    </div>
                `;
            });
            
            content += `
                    </div>
                    
                    <div class="modal-actions">
                        <button class="btn btn-secondary" onclick="Teacher.editTestQuestions('${targetTestId}')">
                            <i class="fas fa-arrow-left"></i> Назад
                        </button>
                        <button class="btn btn-primary" onclick="Teacher.copySelectedQuestions('${targetTestId}')">
                            <i class="fas fa-copy"></i> Копировать
                        </button>
                    </div>
                </div>
                
                <style>
                    .import-questions-modal { margin: -24px; }
                    .import-hint { padding: 16px 24px; color: var(--text-secondary); font-size: 14px; border-bottom: 1px solid var(--border-primary); margin: 0; }
                    .import-tests-list { max-height: 50vh; overflow-y: auto; }
                    
                    .import-test-block { border-bottom: 1px solid var(--border-secondary); }
                    .import-test-block.open .import-chevron { transform: rotate(90deg); }
                    .import-test-block.open .import-test-questions { display: block; }
                    
                    .import-test-header { 
                        display: flex; align-items: center; gap: 12px; 
                        padding: 14px 20px; cursor: pointer; 
                        transition: background 0.15s; 
                    }
                    .import-test-header:hover { background: var(--bg-tertiary); }
                    
                    .import-test-checkbox { width: 18px; height: 18px; cursor: pointer; flex-shrink: 0; }
                    .import-chevron { color: var(--text-quaternary); font-size: 12px; transition: transform 0.2s; flex-shrink: 0; }
                    
                    .import-test-info { flex: 1; min-width: 0; }
                    .import-test-title { display: block; font-weight: 600; font-size: 14px; color: var(--text-primary); }
                    .import-test-meta { display: block; font-size: 12px; color: var(--text-tertiary); margin-top: 2px; }
                    
                    .import-test-count { 
                        background: var(--primary); color: white; 
                        padding: 4px 10px; border-radius: 12px; 
                        font-size: 12px; font-weight: 600; flex-shrink: 0;
                    }
                    
                    .import-test-questions { display: none; padding: 0 20px 12px; }
                    
                    .import-question-item { 
                        display: flex; align-items: flex-start; gap: 10px; 
                        padding: 10px 12px; margin-bottom: 4px;
                        background: var(--bg-tertiary); border-radius: 8px;
                        cursor: pointer; transition: background 0.15s;
                    }
                    .import-question-item:hover { background: var(--bg-secondary); }
                    .import-question-item input { width: 16px; height: 16px; margin-top: 2px; flex-shrink: 0; }
                    .import-question-text { flex: 1; font-size: 13px; color: var(--text-primary); line-height: 1.4; }
                    .import-question-type { 
                        font-size: 11px; color: var(--text-tertiary); 
                        background: var(--bg-primary); padding: 3px 8px; 
                        border-radius: 6px; white-space: nowrap; flex-shrink: 0;
                    }
                    
                    .import-questions-modal .modal-actions { padding: 16px 24px; border-top: 1px solid var(--border-primary); margin: 0; }
                </style>
            `;
            
            App.openModal('Импорт вопросов', content);
            
        } catch (error) {
            console.error('[Import] Error:', error);
            App.showToast(error.message || 'Ошибка загрузки вопросов', 'error');
        }
    },
    
    
    toggleImportAccordion(testIndex) {
        const block = document.querySelector(`.import-test-block[data-test-index="${testIndex}"]`);
        if (block) {
            block.classList.toggle('open');
        }
    },
    
    
    toggleTestQuestions(event, testIndex) {
        event.stopPropagation();
        const checkbox = event.target;
        const questionCheckboxes = document.querySelectorAll(`.question-checkbox[data-test-index="${testIndex}"]`);
        questionCheckboxes.forEach(cb => cb.checked = checkbox.checked);
    },
    
    
    async copySelectedQuestions(targetTestId) {
        const checkboxes = document.querySelectorAll('.question-checkbox:checked');
        const questionIds = Array.from(checkboxes).map(cb => cb.dataset.questionId);
        
        if (questionIds.length === 0) {
            App.showToast('Выберите вопросы для копирования', 'warning');
            return;
        }
        
        try {
            const result = await API.post(`/api/teacher/tests/${targetTestId}/copy-questions`, {
                question_ids: questionIds
            });
            
            App.showToast(`Скопировано вопросов: ${result.copied}`, 'success');
            this.editTestQuestions(targetTestId);
        } catch (error) {
            App.showToast(error.message, 'error');
        }
    },
    
    
    async editQuestion(questionId) {
        try {
            const question = await API.get(`/api/teacher/questions/${questionId}`);
            
            const content = `
                <form id="edit-question-form" class="modal-form">
                    <div class="form-group">
                        <label>Тип вопроса</label>
                        <div class="input-wrapper">
                            <i class="fas fa-list"></i>
                            <select id="edit-question-type" required>
                                <option value="single" ${question.type === 'single' ? 'selected' : ''}>Один ответ</option>
                                <option value="multiple" ${question.type === 'multiple' ? 'selected' : ''}>Несколько ответов</option>
                                <option value="text" ${question.type === 'text' ? 'selected' : ''}>Текстовый ответ</option>
                                <option value="match" ${question.type === 'match' ? 'selected' : ''}>Сопоставление</option>
                                <option value="order" ${question.type === 'order' ? 'selected' : ''}>Сортировка</option>
                            </select>
                        </div>
                    </div>
                    
                    <div class="form-group">
                        <label>Текст вопроса</label>
                        <textarea id="edit-question-text" class="text-answer-input" rows="3" required>${Dashboard.escapeHtml(question.text)}</textarea>
                    </div>
                    
                    <div class="form-group">
                        <label>Вес вопроса</label>
                        <div class="input-wrapper">
                            <i class="fas fa-balance-scale"></i>
                            <input type="number" id="edit-question-weight" value="${question.weight || 1}" min="1" required>
                        </div>
                    </div>
                    
                    <div id="edit-answers-section">
                        <label>Варианты ответов</label>
                        <div id="edit-answers-list"></div>
                        <button type="button" class="btn btn-secondary btn-sm mt-2" onclick="Teacher.addEditAnswerField()">
                            <i class="fas fa-plus"></i> Добавить
                        </button>
                    </div>
                    
                    <div class="modal-actions">
                        <button type="button" class="btn btn-secondary" onclick="Teacher.editTestQuestions('${question.test_id}')">
                            <i class="fas fa-arrow-left"></i> Назад
                        </button>
                        <button type="submit" class="btn btn-primary">
                            <i class="fas fa-save"></i> Сохранить
                        </button>
                    </div>
                </form>
                
                <style>
                    .edit-answer-field {
                        display: flex;
                        gap: 0.5rem;
                        margin-bottom: 0.5rem;
                        align-items: center;
                        background: var(--gray-50);
                        padding: 0.5rem;
                        border-radius: 0.5rem;
                    }
                    .edit-answer-field input[type="text"] {
                        flex: 1;
                        padding: 0.5rem 0.75rem;
                        border: 1px solid var(--gray-300);
                        border-radius: 0.375rem;
                        font-size: 0.875rem;
                        background: var(--bg-primary);
                        color: var(--text-primary);
                        transition: border-color 0.2s, box-shadow 0.2s;
                    }
                    .edit-answer-field input[type="text"]:focus {
                        outline: none;
                        border-color: var(--primary);
                        box-shadow: 0 0 0 3px var(--primary-light);
                    }
                    .edit-answer-field input[type="text"]::placeholder {
                        color: var(--text-tertiary);
                    }
                    .edit-answer-field input[type="checkbox"],
                    .edit-answer-field input[type="radio"] {
                        width: 18px;
                        height: 18px;
                        cursor: pointer;
                    }
                    .edit-answer-field .btn-icon {
                        padding: 0.375rem;
                        color: var(--danger);
                        border-radius: 0.25rem;
                    }
                    .edit-answer-field .btn-icon:hover {
                        background: var(--danger);
                        color: white;
                    }
                    .btn-sm {
                        padding: 0.375rem 0.75rem;
                        font-size: 0.875rem;
                    }
                    .mt-2 { margin-top: 0.5rem; }
                </style>
            `;
            
            App.openModal('Редактировать вопрос', content);
            
            
            this.fillEditAnswers(question);
            
            
            document.getElementById('edit-question-type').addEventListener('change', () => {
                this.initEditAnswersSection(question.type);
            });
            
            
            document.getElementById('edit-question-form').addEventListener('submit', async (e) => {
                e.preventDefault();
                
                const type = document.getElementById('edit-question-type').value;
                const data = {
                    text: document.getElementById('edit-question-text').value,
                    type: type,
                    weight: parseInt(document.getElementById('edit-question-weight').value)
                };
                
                if (type === 'match') {
                    data.pairs = this.collectEditMatchingPairs();
                    if (data.pairs.length < 2) {
                        App.showToast('Добавьте минимум 2 пары для сопоставления', 'error');
                        return;
                    }
                } else if (type === 'text') {
                    data.answers = this.collectEditAnswers(type);
                } else if (type === 'order') {
                    data.answers = this.collectEditAnswers(type);
                    if (data.answers.length < 2) {
                        App.showToast('Добавьте минимум 2 элемента для сортировки', 'error');
                        return;
                    }
                } else {
                    
                    data.answers = this.collectEditAnswers(type);
                    
                    
                    const hasCorrect = data.answers.some(a => a.is_correct);
                    if (!hasCorrect) {
                        App.showToast('Укажите хотя бы один правильный ответ', 'error');
                        return;
                    }
                    
                    
                    if (data.answers.length < 2) {
                        App.showToast('Добавьте минимум 2 варианта ответа', 'error');
                        return;
                    }
                }
                
                try {
                    await API.put(`/api/teacher/questions/${questionId}`, data);
                    App.showToast('Вопрос обновлён', 'success');
                    this.editTestQuestions(question.test_id);
                } catch (error) {
                    App.showToast(error.message, 'error');
                }
            });
            
        } catch (error) {
            App.showToast(error.message, 'error');
        }
    },
    
    
    fillEditAnswers(question) {
        const list = document.getElementById('edit-answers-list');
        list.innerHTML = '';
        
        if (question.type === 'match' && question.pairs) {
            document.querySelector('#edit-answers-section label').textContent = 'Пары для сопоставления';
            question.pairs.forEach(pair => {
                this.addEditMatchingField(pair.left_text, pair.right_text);
            });
        } else if (question.answers) {
            document.querySelector('#edit-answers-section label').textContent = 'Варианты ответов';
            question.answers.forEach(ans => {
                this.addEditAnswerField(ans.text, ans.is_correct, ans.position);
            });
        }
        
        
        if (list.children.length === 0) {
            this.addEditAnswerField();
            this.addEditAnswerField();
        }
    },
    
    
    initEditAnswersSection(oldType) {
        const type = document.getElementById('edit-question-type').value;
        const list = document.getElementById('edit-answers-list');
        
        list.innerHTML = '';
        
        if (type === 'match') {
            document.querySelector('#edit-answers-section label').textContent = 'Пары для сопоставления';
            this.addEditMatchingField();
            this.addEditMatchingField();
        } else {
            document.querySelector('#edit-answers-section label').textContent = 'Варианты ответов';
            this.addEditAnswerField();
            this.addEditAnswerField();
        }
    },
    
    
    addEditAnswerField(text = '', isCorrect = false, position = null) {
        const type = document.getElementById('edit-question-type').value;
        const list = document.getElementById('edit-answers-list');
        const index = list.children.length;
        
        const div = document.createElement('div');
        div.className = 'edit-answer-field';
        
        if (type === 'order') {
            div.innerHTML = `
                <span style="color: var(--gray-500); font-weight: 500; min-width: 24px;">${index + 1}.</span>
                <input type="text" placeholder="Текст элемента" value="${Dashboard.escapeHtml(text)}" required>
                <button type="button" class="btn-icon" onclick="this.parentElement.remove(); Teacher.reorderEditAnswers()">
                    <i class="fas fa-times"></i>
                </button>
            `;
        } else if (type === 'text') {
            div.innerHTML = `
                <input type="text" placeholder="Правильный ответ (регистр не важен)" value="${Dashboard.escapeHtml(text)}" required>
                <button type="button" class="btn-icon" onclick="this.parentElement.remove()">
                    <i class="fas fa-times"></i>
                </button>
            `;
        } else {
            const inputType = type === 'single' ? 'radio' : 'checkbox';
            div.innerHTML = `
                <input type="${inputType}" name="edit-correct" ${isCorrect ? 'checked' : ''} title="Правильный ответ">
                <input type="text" placeholder="Вариант ответа" value="${Dashboard.escapeHtml(text)}" required>
                <button type="button" class="btn-icon" onclick="this.parentElement.remove()">
                    <i class="fas fa-times"></i>
                </button>
            `;
        }
        
        list.appendChild(div);
    },
    
    
    addEditMatchingField(left = '', right = '') {
        const list = document.getElementById('edit-answers-list');
        
        const div = document.createElement('div');
        div.className = 'edit-answer-field';
        div.innerHTML = `
            <input type="text" placeholder="Левая часть" value="${Dashboard.escapeHtml(left)}" style="flex: 1;" required>
            <i class="fas fa-arrow-right" style="color: var(--gray-400);"></i>
            <input type="text" placeholder="Правая часть" value="${Dashboard.escapeHtml(right)}" style="flex: 1;" required>
            <button type="button" class="btn-icon" onclick="this.parentElement.remove()">
                <i class="fas fa-times"></i>
            </button>
        `;
        
        list.appendChild(div);
    },
    
    
    reorderEditAnswers() {
        const list = document.getElementById('edit-answers-list');
        const items = list.querySelectorAll('.edit-answer-field');
        items.forEach((item, i) => {
            const num = item.querySelector('span');
            if (num) num.textContent = (i + 1) + '.';
        });
    },
    
    
    collectEditAnswers(type) {
        const list = document.getElementById('edit-answers-list');
        const fields = list.querySelectorAll('.edit-answer-field');
        const answers = [];
        
        fields.forEach((field, index) => {
            const textInput = field.querySelector('input[type="text"]');
            const correctInput = field.querySelector('input[type="checkbox"], input[type="radio"]');
            
            if (textInput && textInput.value.trim()) {
                answers.push({
                    text: textInput.value.trim(),
                    is_correct: type === 'order' || type === 'text' ? (type === 'text') : (correctInput?.checked || false),
                    position: type === 'order' ? index + 1 : null
                });
            }
        });
        
        return answers;
    },
    
    
    collectEditMatchingPairs() {
        const list = document.getElementById('edit-answers-list');
        const fields = list.querySelectorAll('.edit-answer-field');
        const pairs = [];
        
        fields.forEach(field => {
            const inputs = field.querySelectorAll('input[type="text"]');
            if (inputs.length >= 2 && inputs[0].value.trim() && inputs[1].value.trim()) {
                pairs.push({
                    left_text: inputs[0].value.trim(),
                    right_text: inputs[1].value.trim()
                });
            }
        });
        
        return pairs;
    },
    
    
    async deleteQuestion(questionId, testId) {
        if (!confirm('Удалить вопрос?')) return;
        
        try {
            await API.delete(`/api/teacher/questions/${questionId}`);
            App.showToast('Вопрос удалён', 'success');
            this.editTestQuestions(testId);
        } catch (error) {
            App.showToast(error.message, 'error');
        }
    },
    
    
    
    
    async addStudent() {
        const disciplines = await API.get('/api/disciplines');

        if (!disciplines || disciplines.length === 0) {
            App.showToast('Сначала создайте дисциплину', 'warning');
            return;
        }
        
        const content = `
            <form id="student-form" class="modal-form">
                <div class="form-group">
                    <label>Имя студента</label>
                    <div class="input-wrapper">
                        <i class="fas fa-user"></i>
                        <input type="text" id="student-name" placeholder="Иван Иванов" required>
                    </div>
                </div>
                
                <div class="form-group">
                    <label>Email студента</label>
                    <div class="input-wrapper">
                        <i class="fas fa-envelope"></i>
                        <input type="email" id="student-email" placeholder="student@example.com" required>
                    </div>
                </div>
                
                <div class="form-group">
                    <label>Дисциплина</label>
                    <div class="input-wrapper">
                        <i class="fas fa-book"></i>
                        <select id="student-discipline" required>
                            <option value="">Выберите дисциплину</option>
                            ${disciplines.map(d => `<option value="${d.id}">${Dashboard.escapeHtml(d.title)}</option>`).join('')}
                        </select>
                    </div>
                </div>
                
                <div id="generated-password-info" style="display: none;" class="password-generated-box">
                    <div class="password-box-header">
                        <i class="fas fa-key"></i>
                        <strong>Сгенерированный пароль для входа:</strong>
                    </div>
                    <code id="generated-password-value" class="password-value"></code>
                    <button type="button" class="btn btn-sm btn-outline" onclick="Teacher.copyPassword()">
                        <i class="fas fa-copy"></i> Скопировать
                    </button>
                    <p class="password-hint">Сообщите этот пароль студенту. Он сможет изменить его после входа.</p>
                </div>
                
                <div class="modal-actions">
                    <button type="button" class="btn btn-outline" onclick="App.closeModal()">Отмена</button>
                    <button type="submit" class="btn btn-primary" id="add-student-submit">Добавить</button>
                </div>
            </form>
        `;
        
        App.openModal('Добавить студента', content);
        
        document.getElementById('student-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const name = document.getElementById('student-name').value;
            const email = document.getElementById('student-email').value;
            const disciplineId = document.getElementById('student-discipline').value;
            
            try {
                const result = await API.post('/api/teacher/students', { 
                    name, 
                    email, 
                    discipline_id: disciplineId || null 
                });
                
                if (result.isNew && result.generatedPassword) {
                    
                    document.getElementById('generated-password-info').style.display = 'block';
                    document.getElementById('generated-password-value').textContent = result.generatedPassword;
                    document.getElementById('add-student-submit').style.display = 'none';
                    
                    
                    const actions = document.querySelector('.modal-actions');
                    actions.innerHTML = `
                        <button type="button" class="btn btn-primary" onclick="App.closeModal()">Готово</button>
                    `;
                    
                    App.showToast('Студент создан!', 'success');
                } else {
                    App.closeModal();
                    App.showToast('Студент добавлен', 'success');
                }
                
                Dashboard.loadStudents();
            } catch (error) {
                App.showToast(error.message, 'error');
            }
        });
    },
    
    
    copyPassword() {
        const password = document.getElementById('generated-password-value').textContent;
        navigator.clipboard.writeText(password).then(() => {
            App.showToast('Пароль скопирован!', 'success');
        }).catch(() => {
            App.showToast('Не удалось скопировать', 'error');
        });
    },
    
    
    async importStudents() {
        const disciplines = await API.get('/api/disciplines');

        if (!disciplines || disciplines.length === 0) {
            App.showToast('Сначала создайте дисциплину', 'warning');
            return;
        }
        
        const content = `
            <form id="import-form" class="modal-form">
                <div class="form-group">
                    <label>Дисциплина</label>
                    <div class="input-wrapper">
                        <i class="fas fa-book"></i>
                        <select id="import-discipline" required>
                            <option value="">Выберите дисциплину</option>
                            ${disciplines.map(d => `<option value="${d.id}">${Dashboard.escapeHtml(d.title)}</option>`).join('')}
                        </select>
                    </div>
                </div>
                
                <div class="form-group">
                    <label>Список студентов (CSV: имя, email)</label>
                    <textarea id="import-data" class="text-answer-input" rows="8" 
                        placeholder="Иванов Иван, ivanov@example.com&#10;Петров Петр, petrov@example.com" required></textarea>
                </div>
                
                <p style="font-size: 0.875rem; color: var(--gray-500);">
                    Формат: каждый студент на новой строке, имя и email через запятую
                </p>
                
                <div class="modal-actions">
                    <button type="button" class="btn btn-secondary" onclick="App.closeModal()">Отмена</button>
                    <button type="submit" class="btn btn-primary">Импортировать</button>
                </div>
            </form>
        `;
        
        App.openModal('Импорт студентов', content);
        
        document.getElementById('import-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const disciplineId = document.getElementById('import-discipline').value;
            const data = document.getElementById('import-data').value;
            
            const students = data.split('\n')
                .map(line => {
                    const [name, email] = line.split(',').map(s => s.trim());
                    return { name, email };
                })
                .filter(s => s.name && s.email);
            
            if (students.length === 0) {
                App.showToast('Не найдено данных для импорта', 'warning');
                return;
            }
            
            try {
                const result = await API.post('/api/teacher/students/import', {
                    students,
                    discipline_id: disciplineId || null
                });
                
                App.closeModal();
                App.showToast(`Импортировано: ${result.imported} студентов`, 'success');
                Dashboard.loadStudents();
            } catch (error) {
                App.showToast(error.message, 'error');
            }
        });
    },


    // ─── Groups ──────────────────────────────────────────────────────────────

    async manageGroups() {
        let groups = [];
        try {
            groups = await API.get('/api/teacher/groups');
        } catch (e) {
            App.showToast('Ошибка загрузки групп', 'error');
        }

        const renderGroups = (list) => list.length === 0 ? `
            <div class="manage-empty">
                <i class="fas fa-users"></i>
                <p>Нет групп. Создайте первую группу.</p>
            </div>
        ` : list.map(g => `
            <div class="manage-student-item" id="group-row-${g.id}">
                <div class="manage-avatar" style="background: linear-gradient(135deg, #5e5ce6, #bf5af2);">
                    <i class="fas fa-users" style="font-size:16px;"></i>
                </div>
                <div class="manage-info">
                    <div class="manage-name">${Dashboard.escapeHtml(g.name)}</div>
                    <div class="manage-email">${g.student_count} студ.${g.description ? ' · ' + Dashboard.escapeHtml(g.description) : ''}</div>
                </div>
                <div style="display:flex;gap:6px;flex-shrink:0;">
                    <button class="manage-add" title="Студенты группы"
                        onclick="Teacher.manageGroupStudents('${g.id}','${Dashboard.escapeHtml(g.name).replace(/'/g,"\\'")}')">
                        <i class="fas fa-user-friends"></i>
                    </button>
                    <button class="manage-add" title="Зачислить в дисциплину" style="background:var(--warning-bg,#fff3cd);color:var(--warning,#856404);"
                        onclick="Teacher.enrollGroupToDiscipline('${g.id}','${Dashboard.escapeHtml(g.name).replace(/'/g,"\\'")}')">
                        <i class="fas fa-book-open"></i>
                    </button>
                    <button class="manage-remove" title="Удалить группу"
                        onclick="Teacher.deleteGroup('${g.id}')">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </div>
        `).join('');

        const content = `
            <div class="manage-students-modal">
                <div style="padding:16px 24px 0;">
                    <button class="btn btn-primary btn-sm" onclick="Teacher.addGroup()">
                        <i class="fas fa-plus"></i> Создать группу
                    </button>
                </div>
                <div class="manage-content" style="padding:16px 24px;">
                    <div id="groups-panel">${renderGroups(groups)}</div>
                </div>
                <div class="modal-actions" style="padding:16px 24px;border-top:1px solid var(--border-primary);margin:0;">
                    <button class="btn btn-secondary" onclick="App.closeModal()">Закрыть</button>
                </div>
            </div>
            <style>
                .manage-students-modal { margin: -24px; }
                .manage-content { max-height: 55vh; overflow-y: auto; }
                .manage-empty { text-align: center; padding: 40px 20px; color: var(--text-tertiary); }
                .manage-empty i { font-size: 32px; margin-bottom: 12px; opacity: 0.5; display: block; }
                .manage-empty p { font-size: 14px; }
                .manage-student-item {
                    display: flex; align-items: center; gap: 12px;
                    padding: 12px; background: var(--bg-tertiary);
                    border-radius: 12px; margin-bottom: 8px;
                }
                .manage-avatar {
                    width: 40px; height: 40px; border-radius: 10px;
                    background: linear-gradient(135deg, #bf5af2, #ff375f);
                    display: flex; align-items: center; justify-content: center;
                    color: white; font-weight: 600; font-size: 14px; flex-shrink: 0;
                }
                .manage-avatar.add { background: linear-gradient(135deg, #30d158, #34c759); }
                .manage-info { flex: 1; min-width: 0; }
                .manage-name { font-weight: 600; font-size: 14px; color: var(--text-primary); }
                .manage-email { font-size: 12px; color: var(--text-tertiary); margin-top: 2px; }
                .manage-remove, .manage-add {
                    width: 32px; height: 32px; border-radius: 8px;
                    border: none; cursor: pointer; display: flex;
                    align-items: center; justify-content: center; transition: all 0.2s;
                }
                .manage-remove { background: var(--danger-bg); color: var(--danger); }
                .manage-remove:hover { background: var(--danger); color: white; }
                .manage-add { background: var(--success-bg); color: var(--success); }
                .manage-add:hover { background: var(--success); color: white; }
                .manage-students-modal .modal-actions { padding: 16px 24px; border-top: 1px solid var(--border-primary); margin: 0; }
                .manage-tabs { display: flex; border-bottom: 1px solid var(--border-primary); }
                .manage-tab {
                    flex: 1; padding: 14px; background: none; border: none;
                    font-size: 14px; font-weight: 500; color: var(--text-secondary);
                    cursor: pointer; transition: all 0.2s; display: flex;
                    align-items: center; justify-content: center; gap: 8px;
                }
                .manage-tab:hover { color: var(--text-primary); background: var(--bg-tertiary); }
                .manage-tab.active { color: var(--primary); border-bottom: 2px solid var(--primary); }
                .manage-panel { display: none; padding: 16px; }
                .manage-panel.active { display: block; }
            </style>
        `;

        App.openModal('Группы', content);
    },

    async addGroup() {
        const content = `
            <form id="group-form" class="modal-form">
                <div class="form-group">
                    <label>Название группы</label>
                    <div class="input-wrapper">
                        <i class="fas fa-users"></i>
                        <input type="text" id="group-name" placeholder="Например: 11-А" required maxlength="100">
                    </div>
                </div>
                <div class="form-group">
                    <label>Описание <span style="color:var(--text-tertiary);font-weight:400;">(необязательно)</span></label>
                    <textarea id="group-description" class="text-answer-input" rows="2" maxlength="500" placeholder="Краткое описание..."></textarea>
                </div>
                <div class="modal-actions">
                    <button type="button" class="btn btn-secondary" onclick="App.closeModal()">Отмена</button>
                    <button type="submit" class="btn btn-primary">Создать</button>
                </div>
            </form>
        `;
        App.openModal('Новая группа', content);

        document.getElementById('group-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            try {
                await API.post('/api/teacher/groups', {
                    name: document.getElementById('group-name').value,
                    description: document.getElementById('group-description').value
                });
                App.closeModal();
                App.showToast('Группа создана', 'success');
                this.manageGroups();
            } catch (error) {
                App.showToast(error.message || 'Ошибка создания группы', 'error');
            }
        });
    },

    async deleteGroup(groupId) {
        if (!confirm('Удалить группу? Студенты из неё не будут удалены.')) return;
        try {
            await API.delete(`/api/teacher/groups/${groupId}`);
            App.showToast('Группа удалена', 'success');
            this.manageGroups();
        } catch (error) {
            App.showToast(error.message || 'Ошибка удаления группы', 'error');
        }
    },

    async manageGroupStudents(groupId, groupName) {
        let allStudents = [], groupStudents = [];
        try {
            [allStudents, groupStudents] = await Promise.all([
                API.get('/api/teacher/students'),
                API.get(`/api/teacher/groups/${groupId}/students`)
            ]);
        } catch (e) {
            App.showToast('Ошибка загрузки данных', 'error');
            return;
        }

        const groupStudentIds = new Set(groupStudents.map(s => s.id));
        const notInGroup = allStudents.filter(s => !groupStudentIds.has(s.id));

        const renderIn = () => groupStudents.length === 0 ? `
            <div class="manage-empty">
                <i class="fas fa-user-slash"></i>
                <p>В группе нет студентов</p>
            </div>
        ` : groupStudents.map(s => `
            <div class="manage-student-item">
                <div class="manage-avatar">${(s.name || s.email || 'S').substring(0, 2).toUpperCase()}</div>
                <div class="manage-info">
                    <div class="manage-name">${Dashboard.escapeHtml(s.name || 'Без имени')}</div>
                    <div class="manage-email">${Dashboard.escapeHtml(s.email)}</div>
                </div>
                <button class="manage-remove" title="Убрать из группы"
                    data-uid="${s.id}" data-action="remove-from-group">
                    <i class="fas fa-times"></i>
                </button>
            </div>
        `).join('');

        const renderOut = () => notInGroup.length === 0 ? `
            <div class="manage-empty">
                <i class="fas fa-check-circle"></i>
                <p>Все студенты уже в группе</p>
            </div>
        ` : notInGroup.map(s => `
            <div class="manage-student-item">
                <div class="manage-avatar add">${(s.name || s.email || 'S').substring(0, 2).toUpperCase()}</div>
                <div class="manage-info">
                    <div class="manage-name">${Dashboard.escapeHtml(s.name || 'Без имени')}</div>
                    <div class="manage-email">${Dashboard.escapeHtml(s.email)}</div>
                </div>
                <button class="manage-add" title="Добавить в группу"
                    data-uid="${s.id}" data-action="add-to-group">
                    <i class="fas fa-plus"></i>
                </button>
            </div>
        `).join('');

        const content = `
            <div class="manage-students-modal">
                <div class="manage-tabs">
                    <button class="manage-tab active" data-tab="in-group">
                        <i class="fas fa-users"></i> В группе (${groupStudents.length})
                    </button>
                    <button class="manage-tab" data-tab="add-group">
                        <i class="fas fa-user-plus"></i> Добавить (${notInGroup.length})
                    </button>
                </div>
                <div class="manage-content">
                    <div class="manage-panel active" id="panel-in-group">${renderIn()}</div>
                    <div class="manage-panel" id="panel-add-group">${renderOut()}</div>
                </div>
                <div class="modal-actions" style="padding:16px 24px;border-top:1px solid var(--border-primary);margin:0;">
                    <button class="btn btn-secondary" onclick="App.closeModal()">Закрыть</button>
                </div>
            </div>
            <style>
                .manage-students-modal { margin: -24px; }
                .manage-content { max-height: 55vh; overflow-y: auto; }
                .manage-empty { text-align: center; padding: 40px 20px; color: var(--text-tertiary); }
                .manage-empty i { font-size: 32px; margin-bottom: 12px; opacity: 0.5; display: block; }
                .manage-empty p { font-size: 14px; }
                .manage-student-item {
                    display: flex; align-items: center; gap: 12px;
                    padding: 12px; background: var(--bg-tertiary);
                    border-radius: 12px; margin-bottom: 8px;
                }
                .manage-avatar {
                    width: 40px; height: 40px; border-radius: 10px;
                    background: linear-gradient(135deg, #bf5af2, #ff375f);
                    display: flex; align-items: center; justify-content: center;
                    color: white; font-weight: 600; font-size: 14px; flex-shrink: 0;
                }
                .manage-avatar.add { background: linear-gradient(135deg, #30d158, #34c759); }
                .manage-info { flex: 1; min-width: 0; }
                .manage-name { font-weight: 600; font-size: 14px; color: var(--text-primary); }
                .manage-email { font-size: 12px; color: var(--text-tertiary); margin-top: 2px; }
                .manage-remove, .manage-add {
                    width: 32px; height: 32px; border-radius: 8px;
                    border: none; cursor: pointer; display: flex;
                    align-items: center; justify-content: center; transition: all 0.2s;
                }
                .manage-remove { background: var(--danger-bg); color: var(--danger); }
                .manage-remove:hover { background: var(--danger); color: white; }
                .manage-add { background: var(--success-bg); color: var(--success); }
                .manage-add:hover { background: var(--success); color: white; }
                .manage-tabs { display: flex; border-bottom: 1px solid var(--border-primary); }
                .manage-tab {
                    flex: 1; padding: 14px; background: none; border: none;
                    font-size: 14px; font-weight: 500; color: var(--text-secondary);
                    cursor: pointer; transition: all 0.2s; display: flex;
                    align-items: center; justify-content: center; gap: 8px;
                }
                .manage-tab:hover { color: var(--text-primary); background: var(--bg-tertiary); }
                .manage-tab.active { color: var(--primary); border-bottom: 2px solid var(--primary); }
                .manage-panel { display: none; padding: 16px; }
                .manage-panel.active { display: block; }
            </style>
        `;

        App.openModal(`Группа: ${Dashboard.escapeHtml(groupName)}`, content);

        document.querySelectorAll('.manage-tab').forEach(tab => {
            tab.onclick = () => {
                document.querySelectorAll('.manage-tab').forEach(t => t.classList.remove('active'));
                document.querySelectorAll('.manage-panel').forEach(p => p.classList.remove('active'));
                tab.classList.add('active');
                document.getElementById(`panel-${tab.dataset.tab}`).classList.add('active');
            };
        });

        document.getElementById('modal-body').onclick = async (e) => {
            const btn = e.target.closest('[data-action]');
            if (!btn) return;
            const uid = btn.dataset.uid;
            const action = btn.dataset.action;
            if (action === 'add-to-group') {
                await this._addToGroup(groupId, uid, groupName);
            } else if (action === 'remove-from-group') {
                await this._removeFromGroup(groupId, uid, groupName);
            }
        };
    },

    async _addToGroup(groupId, userId, groupName) {
        try {
            await API.post(`/api/teacher/groups/${groupId}/students`, { user_id: userId });
            App.showToast('Студент добавлен в группу', 'success');
            this.manageGroupStudents(groupId, groupName);
        } catch (error) {
            App.showToast(error.message || 'Ошибка добавления', 'error');
        }
    },

    async _removeFromGroup(groupId, userId, groupName) {
        try {
            await API.delete(`/api/teacher/groups/${groupId}/students/${userId}`);
            App.showToast('Студент убран из группы', 'success');
            this.manageGroupStudents(groupId, groupName);
        } catch (error) {
            App.showToast(error.message || 'Ошибка удаления', 'error');
        }
    },

    async enrollGroupToDiscipline(groupId, groupName) {
        let disciplines = [];
        try {
            disciplines = await API.get('/api/disciplines');
        } catch (e) {
            App.showToast('Ошибка загрузки дисциплин', 'error');
            return;
        }

        if (!disciplines.length) {
            App.showToast('Сначала создайте дисциплину', 'warning');
            return;
        }

        const content = `
            <form id="enroll-form" class="modal-form">
                <p style="margin-bottom:16px;color:var(--text-secondary);font-size:14px;">
                    Все студенты группы <strong style="color:var(--text-primary);">${Dashboard.escapeHtml(groupName)}</strong>
                    будут зачислены в выбранную дисциплину.
                </p>
                <div class="form-group">
                    <label>Дисциплина</label>
                    <select id="enroll-discipline" class="form-select" required>
                        ${disciplines.map(d => `<option value="${d.id}">${Dashboard.escapeHtml(d.title)}</option>`).join('')}
                    </select>
                </div>
                <div class="modal-actions">
                    <button type="button" class="btn btn-secondary" onclick="App.closeModal()">Отмена</button>
                    <button type="submit" class="btn btn-primary">Зачислить</button>
                </div>
            </form>
        `;
        App.openModal('Зачисление группы', content);

        document.getElementById('enroll-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            const disciplineId = document.getElementById('enroll-discipline').value;
            try {
                const result = await API.post(`/api/teacher/groups/${groupId}/enroll-discipline`, {
                    discipline_id: disciplineId
                });
                App.closeModal();
                App.showToast(`Зачислено: ${result.enrolled} из ${result.total} студентов`, 'success');
                Dashboard.loadStudents();
            } catch (error) {
                App.showToast(error.message || 'Ошибка зачисления', 'error');
            }
        });
    },

    // ============================================================
    // REVIEW — ручная проверка текстовых ответов
    // ============================================================

    async refreshReviewBadge() {
        try {
            const data = await API.get('/api/teacher/review/pending/count');
            const count = data.count || 0;
            ['review-badge', 'review-badge-header'].forEach(id => {
                const el = document.getElementById(id);
                if (!el) return;
                if (count > 0) {
                    el.textContent = count;
                    el.style.display = 'inline-flex';
                } else {
                    el.style.display = 'none';
                }
            });
        } catch (e) { /* ignore */ }
    },

    async loadReview() {
        const list = document.getElementById('review-list');
        if (!list) return;

        list.innerHTML = '<div class="loading-spinner" style="margin:40px auto;"></div>';

        try {
            const pending = await API.get('/api/teacher/review/pending');

            if (!pending.length) {
                list.innerHTML = `
                    <div class="empty-state">
                        <div class="empty-state-icon"><i class="fas fa-check-circle"></i></div>
                        <h3>Нет работ на проверку</h3>
                        <p>Здесь появятся ответы студентов на вопросы с развёрнутым ответом</p>
                    </div>`;
                this.refreshReviewBadge();
                return;
            }

            list.innerHTML = `
                <style>
                    .review-card { background: var(--bg-elevated); border: 1px solid var(--border-primary);
                        border-radius: var(--radius-lg); padding: 20px; margin-bottom: 12px;
                        display: flex; align-items: center; gap: 16px; }
                    .review-card-info { flex: 1; min-width: 0; }
                    .review-card-info h4 { margin: 0 0 4px; font-size: 15px; font-weight: 600; }
                    .review-card-info p { margin: 0; font-size: 13px; color: var(--text-secondary); }
                    .review-pending-badge { background: var(--warning, #f59e0b); color: #fff;
                        border-radius: 12px; padding: 2px 10px; font-size: 12px; font-weight: 600; white-space: nowrap; }
                </style>
                ${pending.map(a => `
                    <div class="review-card">
                        <div class="review-card-info">
                            <h4>${Dashboard.escapeHtml(a.student_name)} — ${Dashboard.escapeHtml(a.test_title)}</h4>
                            <p>${Dashboard.escapeHtml(a.discipline_name)} &nbsp;·&nbsp;
                               Сдано: ${new Date(a.finished_at * 1000).toLocaleString('ru')}</p>
                        </div>
                        <span class="review-pending-badge">${a.pending_count} отв.</span>
                        <button class="btn btn-primary btn-sm"
                            onclick="Teacher.openReviewModal('${a.attempt_id}')">
                            Проверить
                        </button>
                    </div>
                `).join('')}`;

            this.refreshReviewBadge();
        } catch (err) {
            list.innerHTML = '<p style="color:var(--danger)">Ошибка загрузки</p>';
        }
    },

    async openReviewModal(attemptId) {
        try {
            const { attempt, questions } = await API.get(`/api/teacher/review/${attemptId}`);

            if (!questions.length) {
                App.showToast('Нет вопросов для проверки', 'info');
                return;
            }

            const renderQuestion = (q, idx) => {
                const ua = q.user_answer;
                const statusClass = ua?.is_correct === 1 ? 'correct' : ua?.is_correct === 0 ? 'incorrect' : 'pending';
                const statusLabel = ua?.is_correct === 1 ? '✓ Верно' : ua?.is_correct === 0 ? '✗ Неверно' : '⏳ Не проверено';
                return `
                    <div class="review-question-block" id="rq-${q.id}" data-ua-id="${ua?.id || ''}" style="
                        background: var(--bg-card); border: 1px solid var(--border-primary);
                        border-radius: var(--radius-lg); padding: 16px; margin-bottom: 14px;">
                        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                            <span style="font-size:13px; color:var(--text-secondary);">Вопрос ${idx + 1} · вес ${q.weight}</span>
                            <span class="review-status review-status-${statusClass}" id="rs-${q.id}">${statusLabel}</span>
                        </div>
                        <p style="font-weight:600; margin:0 0 10px;">${Dashboard.escapeHtml(q.text)}</p>
                        <div style="background: var(--bg-elevated); border-radius: var(--radius); padding: 10px 14px;
                            border-left: 3px solid var(--primary); margin-bottom: 10px; font-style: italic;">
                            ${Dashboard.escapeHtml(ua?.text_answer || '(ответ не дан)')}
                        </div>
                        <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap;">
                            <button class="btn btn-sm btn-success" style="background:var(--success,#22c55e);color:#fff;"
                                onclick="Teacher._gradeAnswer('${attemptId}','${q.id}','${ua?.id || ''}',true)">
                                ✓ Верно
                            </button>
                            <button class="btn btn-sm btn-danger" style="background:var(--danger,#ef4444);color:#fff;"
                                onclick="Teacher._gradeAnswer('${attemptId}','${q.id}','${ua?.id || ''}',false)">
                                ✗ Неверно
                            </button>
                            <input type="text" id="comment-${q.id}" placeholder="Комментарий (необязательно)"
                                class="form-select" style="flex:1; min-width:160px;"
                                value="${Dashboard.escapeHtml(ua?.teacher_comment || '')}">
                        </div>
                    </div>`;
            };

            const content = `
                <style>
                    .review-status { font-size: 12px; font-weight: 600; padding: 2px 10px;
                        border-radius: 10px; }
                    .review-status-pending { background: #fef3c7; color: #92400e; }
                    .review-status-correct { background: #d1fae5; color: #065f46; }
                    .review-status-incorrect { background: #fee2e2; color: #991b1b; }
                </style>
                <div style="margin-bottom:12px; padding:12px; background:var(--bg-elevated);
                    border-radius:var(--radius-lg);">
                    <strong>${Dashboard.escapeHtml(attempt.student_name)}</strong>
                    &nbsp;·&nbsp; ${Dashboard.escapeHtml(attempt.test_title)}
                    &nbsp;·&nbsp; Текущий балл: ${attempt.score}%
                </div>
                <div id="review-questions-wrap">
                    ${questions.map((q, i) => renderQuestion(q, i)).join('')}
                </div>
                <div class="modal-actions" style="margin-top:16px;">
                    <button type="button" class="btn btn-secondary" onclick="App.closeModal()">Закрыть</button>
                    <button type="button" class="btn btn-primary" id="complete-review-btn"
                        onclick="Teacher._completeReview('${attemptId}')">
                        Завершить проверку
                    </button>
                </div>`;

            App.openModal(`Проверка работы`, content);
        } catch (err) {
            App.showToast('Ошибка загрузки работы', 'error');
        }
    },

    async _gradeAnswer(attemptId, questionId, userAnswerId, isCorrect) {
        if (!userAnswerId) {
            App.showToast('Студент не дал ответа на этот вопрос', 'warning');
            return;
        }
        const comment = document.getElementById(`comment-${questionId}`)?.value || '';
        try {
            await API.post(`/api/teacher/review/${attemptId}/answer/${userAnswerId}`, {
                is_correct: isCorrect,
                teacher_comment: comment
            });
            const statusEl = document.getElementById(`rs-${questionId}`);
            if (statusEl) {
                statusEl.className = `review-status review-status-${isCorrect ? 'correct' : 'incorrect'}`;
                statusEl.textContent = isCorrect ? '✓ Верно' : '✗ Неверно';
            }
        } catch (err) {
            App.showToast('Ошибка сохранения оценки', 'error');
        }
    },

    async _completeReview(attemptId) {
        try {
            const result = await API.post(`/api/teacher/review/${attemptId}/complete`, {});
            App.closeModal();
            App.showToast(`Проверка завершена. Итоговый балл: ${result.score}%`, 'success');
            await Teacher.loadReview();
        } catch (err) {
            App.showToast(err.message || 'Не все ответы проверены', 'error');
        }
    }
};


window.createTest = async function() {
    const titleEl = document.getElementById('new-test-title');
    const disciplineEl = document.getElementById('new-test-discipline');
    
    const titleValue = titleEl ? (titleEl.value || '') : '';
    const disciplineValue = disciplineEl ? (disciplineEl.value || '') : '';
    
    if (!titleValue.trim()) {
        App.showToast('Введите название теста', 'error');
        if (titleEl) titleEl.focus();
        return;
    }
    
    if (!disciplineValue) {
        App.showToast('Выберите дисциплину', 'error');
        if (disciplineEl) disciplineEl.focus();
        return;
    }
    
    const data = {
        title: titleValue.trim(),
        discipline_id: disciplineValue,
        topic_id: document.getElementById('new-test-topic')?.value || null,
        description: document.getElementById('new-test-description')?.value || '',
        time_limit: null,
        attempts_limit: parseInt(document.getElementById('new-test-attempts')?.value) || 1,
        questions_limit: document.getElementById('new-test-questions-limit')?.value 
            ? parseInt(document.getElementById('new-test-questions-limit').value) : null,
        passing_score: parseInt(document.getElementById('new-test-passing')?.value) || 60,
        shuffle_questions: document.getElementById('new-test-shuffle-questions')?.checked || false,
        shuffle_answers: document.getElementById('new-test-shuffle-answers')?.checked || false,
        is_published: false
    };
    
    
    const timeVal = document.getElementById('new-test-time')?.value;
    if (timeVal) {
        const mins = parseInt(timeVal);
        if (isNaN(mins) || mins < 1 || mins > 600) {
            App.showToast('Время теста: от 1 до 600 минут', 'error');
            return;
        }
        data.time_limit = mins * 60;
    }
    
    
    if (data.attempts_limit < 1 || data.attempts_limit > 100) {
        App.showToast('Попытки: от 1 до 100', 'error');
        return;
    }
    
    
    if (data.passing_score < 0 || data.passing_score > 100) {
        App.showToast('Проходной балл: от 0 до 100', 'error');
        return;
    }
    
    try {
        const test = await API.post('/api/teacher/tests', data);
        App.closeModal();
        App.showToast('Тест создан', 'success');
        Teacher.editTestQuestions(test.id);
    } catch (error) {
        console.error('Error creating test:', error);
        App.showToast(error.message || 'Ошибка создания теста', 'error');
    }
};
