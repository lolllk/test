



const App = {
    currentUser: null,
    currentPage: 'home',
    appMode: 'offline',
    googleEnabled: false,
    theme: 'light',
    
    
    async init() {
        this.loadTheme();
        await this.checkAppMode();
        await this.checkAuth();
        this.setupEventListeners();
        this.handleUrlParams();
    },

    
    handleUrlParams() {
        const params = new URLSearchParams(window.location.search);
        
        
        if (params.get('success') === 'google_linked') {
            this.showToast('Google успешно привязан к аккаунту!', 'success');
            
            setTimeout(() => this.navigateTo('settings'), 500);
        }
        
        
        if (params.get('error') === 'google_already_linked') {
            this.showToast('Этот Google аккаунт уже привязан к другому пользователю', 'error');
        }
        if (params.get('error') === 'google_auth_failed') {
            this.showToast('Ошибка авторизации через Google', 'error');
        }
        if (params.get('error') === 'google_not_configured') {
            this.showToast('Google OAuth не настроен на сервере', 'warning');
        }
        
        
        if (params.has('success') || params.has('error')) {
            window.history.replaceState({}, document.title, window.location.pathname);
        }
    },
    
    
    loadTheme() {
        const savedTheme = localStorage.getItem('theme') || 'light';
        this.setTheme(savedTheme);
    },
    
    
    setTheme(theme) {
        this.theme = theme;
        document.documentElement.setAttribute('data-theme', theme);
        localStorage.setItem('theme', theme);
    },
    
    
    toggleTheme() {
        const newTheme = this.theme === 'light' ? 'dark' : 'light';
        this.setTheme(newTheme);
    },
    
    
    toggleMobileMenu() {
        const sidebar = document.getElementById('sidebar');
        const overlay = document.getElementById('sidebar-overlay');
        
        if (!sidebar) {
            console.error('Sidebar not found!');
            return;
        }
        
        if (sidebar.classList.contains('open')) {
            sidebar.classList.remove('open');
            overlay?.classList.remove('active');
            document.body.style.overflow = '';
        } else {
            sidebar.classList.add('open');
            overlay?.classList.add('active');
            document.body.style.overflow = 'hidden';
        }
    },
    
    
    async checkAppMode() {
        try {
            const response = await API.get('/api/app-mode');
            this.appMode = response.mode || 'offline';
            this.googleEnabled = response.google_enabled || false;
            this.updateModeUI();
        } catch (error) {
            this.appMode = 'offline';
            this.googleEnabled = false;
            this.updateModeUI();
        }
    },
    
    
    updateModeUI() {
        
        const googleButtons = document.querySelectorAll('#google-login-btn, .google-auth-btn');
        googleButtons.forEach(btn => {
            btn.style.display = this.googleEnabled ? '' : 'none';
        });
        
        
        const dividers = document.querySelectorAll('.auth-divider');
        dividers.forEach(div => {
            div.style.display = this.googleEnabled ? '' : 'none';
        });
        
        
        const modeIndicator = document.getElementById('mode-indicator');
        if (modeIndicator) {
            if (this.appMode === 'online') {
                modeIndicator.classList.add('online');
                modeIndicator.innerHTML = '<i class="fas fa-wifi"></i><span>Online</span>';
            } else {
                modeIndicator.classList.remove('online');
                modeIndicator.innerHTML = '<i class="fas fa-wifi-slash"></i><span>Offline</span>';
            }
        }
    },
    
    
    async checkAuth() {
        try {
            const response = await API.get('/auth/me');
            if (response.user) {
                this.currentUser = response.user;
                this.showDashboard();
            } else {
                this.showLogin();
            }
        } catch (error) {
            this.showLogin();
        }
    },
    
    
    setupEventListeners() {
        
        document.querySelectorAll('.toggle-password').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const input = e.target.closest('.input-wrapper').querySelector('input');
                const icon = btn.querySelector('i');
                
                if (input.type === 'password') {
                    input.type = 'text';
                    icon.classList.replace('fa-eye', 'fa-eye-slash');
                } else {
                    input.type = 'password';
                    icon.classList.replace('fa-eye-slash', 'fa-eye');
                }
            });
        });
        
        
        document.getElementById('show-register')?.addEventListener('click', (e) => {
            e.preventDefault();
            this.showPage('register-page');
        });
        
        
        document.getElementById('show-login')?.addEventListener('click', (e) => {
            e.preventDefault();
            this.showPage('login-page');
        });
        
        
        document.getElementById('sidebar-toggle')?.addEventListener('click', () => {
            document.getElementById('sidebar').classList.toggle('collapsed');
        });
        
        
        const sidebar = document.getElementById('sidebar');
        const overlay = document.getElementById('sidebar-overlay');
        
        const openMobileMenu = () => {
            sidebar?.classList.add('open');
            overlay?.classList.add('active');
            document.body.style.overflow = 'hidden';
        };
        
        const closeMobileMenu = () => {
            sidebar?.classList.remove('open');
            overlay?.classList.remove('active');
            document.body.style.overflow = '';
        };
        
        document.getElementById('mobile-menu-btn')?.addEventListener('click', () => {
            if (sidebar?.classList.contains('open')) {
                closeMobileMenu();
            } else {
                openMobileMenu();
            }
        });
        
        
        overlay?.addEventListener('click', closeMobileMenu);
        
        
        document.getElementById('sidebar-close')?.addEventListener('click', closeMobileMenu);
        
        
        document.querySelectorAll('.nav-link').forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                const page = link.dataset.page;
                this.navigateTo(page);
            });
        });
        
        
        document.getElementById('modal-close')?.addEventListener('click', () => {
            this.closeModal();
        });
        
        document.getElementById('modal-overlay')?.addEventListener('click', (e) => {
            if (e.target.id === 'modal-overlay') {
                this.closeModal();
            }
        });
        
        
        document.getElementById('logout-btn')?.addEventListener('click', () => {
            Auth.logout();
        });
        
        
        document.getElementById('settings-logout-btn')?.addEventListener('click', () => {
            Auth.logout();
        });
        
        
        document.getElementById('google-login-btn')?.addEventListener('click', () => {
            window.location.href = '/auth/google';
        });
        
        
        document.querySelector('.main-content')?.addEventListener('click', () => {
            if (window.innerWidth <= 1024) {
                closeMobileMenu();
            }
        });
        
        
        document.querySelectorAll('.sidebar-nav .nav-link').forEach(link => {
            link.addEventListener('click', () => {
                if (window.innerWidth <= 1024) {
                    closeMobileMenu();
                }
            });
        });
        
        
        document.querySelectorAll('.bottom-nav-item').forEach(item => {
            item.addEventListener('click', (e) => {
                e.preventDefault();
                const page = item.dataset.page;
                this.navigateTo(page);
                
                
                document.querySelectorAll('.bottom-nav-item').forEach(i => i.classList.remove('active'));
                item.classList.add('active');
            });
        });
    },
    
    
    showPage(pageId) {
        document.querySelectorAll('.page').forEach(page => {
            page.style.display = 'none';
        });
        document.getElementById('loading-screen').style.display = 'none';
        document.getElementById(pageId).style.display = 'flex';
    },
    
    
    showLogin() {
        document.getElementById('loading-screen').style.display = 'none';
        this.showPage('login-page');
    },
    
    
    showDashboard() {
        document.getElementById('loading-screen').style.display = 'none';
        this.showPage('dashboard-page');
        
        
        this.updateUserUI();
        
        
        document.body.className = `role-${this.currentUser.role}`;
        
        
        this.currentPage = 'home';
        
        
        Dashboard.init();
        
        
        if (typeof Sync !== 'undefined') {
            Sync.init();
        }
    },
    
    
    updateUserUI() {
        const userNameEl = document.getElementById('user-name');
        const userRoleEl = document.getElementById('user-role');
        const userAvatarEl = document.getElementById('user-avatar');
        
        if (userNameEl) userNameEl.textContent = this.currentUser.name;
        if (userRoleEl) userRoleEl.textContent = this.currentUser.role === 'teacher' ? 'Преподаватель' : 'Студент';
        
        if (userAvatarEl && this.currentUser.avatar_url) {
            userAvatarEl.innerHTML = `<img src="${this.currentUser.avatar_url}" alt="${this.currentUser.name}">`;
        }
    },
    
    
    navigateTo(page) {
        
        document.querySelectorAll('.nav-link').forEach(link => {
            link.classList.toggle('active', link.dataset.page === page);
        });
        
        
        document.querySelectorAll('.bottom-nav-item').forEach(item => {
            item.classList.toggle('active', item.dataset.page === page);
        });
        
        
        document.querySelectorAll('.content-section').forEach(section => {
            section.classList.remove('active');
        });
        
        const contentSection = document.getElementById(`${page}-content`);
        if (contentSection) {
            contentSection.classList.add('active');
        }
        
        
        const titles = {
            home: 'Главная',
            disciplines: 'Дисциплины',
            tests: 'Тесты',
            results: 'Результаты',
            students: 'Студенты',
            review: 'На проверку',
            settings: 'Настройки'
        };
        
        document.getElementById('page-title').textContent = titles[page] || page;
        this.currentPage = page;
        
        
        Dashboard.loadPageData(page);
        
        
        if (window.innerWidth <= 1024 && window.innerWidth > 768) {
            const sidebar = document.getElementById('sidebar');
            const overlay = document.getElementById('sidebar-overlay');
            sidebar?.classList.remove('open');
            overlay?.classList.remove('active');
            document.body.style.overflow = '';
        }
    },
    
    
    openModal(title, content) {
        document.getElementById('modal-title').textContent = title;
        document.getElementById('modal-body').innerHTML = content;
        document.getElementById('modal-overlay').classList.add('active');
    },
    
    
    closeModal() {
        document.getElementById('modal-overlay').classList.remove('active');
        const body = document.getElementById('modal-body');
        if (body) body.onclick = null;
    },
    
    
    showToast(message, type = 'info') {
        const container = document.getElementById('toast-container');
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        
        const icons = {
            success: 'fa-check',
            error: 'fa-times',
            warning: 'fa-exclamation',
            info: 'fa-info'
        };
        
        toast.innerHTML = `
            <div class="toast-icon">
                <i class="fas ${icons[type]}"></i>
            </div>
            <span class="toast-message">${message}</span>
            <button class="toast-close">
                <i class="fas fa-times"></i>
            </button>
        `;
        
        container.appendChild(toast);
        
        
        toast.querySelector('.toast-close').addEventListener('click', () => {
            toast.classList.add('hiding');
            setTimeout(() => toast.remove(), 300);
        });
        
        
        setTimeout(() => {
            if (toast.parentNode) {
                toast.classList.add('hiding');
                setTimeout(() => toast.remove(), 300);
            }
        }, 5000);
    },
    
    
    formatDate(timestamp) {
        if (!timestamp) return '-';
        const date = new Date(timestamp * 1000);
        return date.toLocaleDateString('ru-RU', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    },
    
    
    formatTime(seconds) {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
};


document.addEventListener('DOMContentLoaded', () => {
    App.init();
});
