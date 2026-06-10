



const Auth = {
    
    init() {
        this.setupLoginForm();
        this.setupRegisterForm();
    },
    
    
    setupLoginForm() {
        const form = document.getElementById('login-form');
        if (!form) return;
        
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const email = document.getElementById('login-email').value.trim();
            const password = document.getElementById('login-password').value;
            const errorEl = document.getElementById('login-error');
            
            errorEl.textContent = '';
            
            
            if (!email) {
                errorEl.textContent = 'Введите email';
                return;
            }
            
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(email)) {
                errorEl.textContent = 'Введите корректный email';
                return;
            }
            
            if (!password) {
                errorEl.textContent = 'Введите пароль';
                return;
            }
            
            try {
                const result = await API.post('/auth/login', { email, password });
                
                if (result.success) {
                    App.currentUser = result.user;
                    App.showDashboard();
                    App.showToast('Добро пожаловать!', 'success');
                }
            } catch (error) {
                errorEl.textContent = error.message;
            }
        });
    },
    
    
    setupRegisterForm() {
        const form = document.getElementById('register-form');
        if (!form) return;
        
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const name = document.getElementById('register-name').value.trim();
            const email = document.getElementById('register-email').value.trim();
            const password = document.getElementById('register-password').value;
            
            const role = 'student';
            const errorEl = document.getElementById('register-error');
            
            errorEl.textContent = '';
            
            
            if (!name) {
                errorEl.textContent = 'Введите ФИО';
                return;
            }
            
            if (name.length < 2) {
                errorEl.textContent = 'ФИО должно быть не менее 2 символов';
                return;
            }
            
            if (!email) {
                errorEl.textContent = 'Введите email';
                return;
            }
            
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(email)) {
                errorEl.textContent = 'Введите корректный email';
                return;
            }
            
            if (!password) {
                errorEl.textContent = 'Введите пароль';
                return;
            }
            
            if (password.length < 6) {
                errorEl.textContent = 'Пароль должен быть не менее 6 символов';
                return;
            }
            
            try {
                const result = await API.post('/auth/register', { name, email, password, role });
                
                if (result.success) {
                    App.showToast('Регистрация успешна! Войдите в систему.', 'success');
                    App.showPage('login-page');
                    document.getElementById('login-email').value = email;
                }
            } catch (error) {
                errorEl.textContent = error.message;
            }
        });
    },
    
    
    async logout() {
        try {
            await API.post('/auth/logout', {});
        } catch (error) {
            console.error('Logout error:', error);
        }
        
        App.currentUser = null;
        document.body.className = '';
        Dashboard.reset(); 
        App.showLogin();
        App.showToast('Вы вышли из системы', 'info');
    }
};


document.addEventListener('DOMContentLoaded', () => {
    Auth.init();
});
