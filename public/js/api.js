



const API = {
    baseUrl: '',
    
    
    async get(url) {
        const response = await fetch(this.baseUrl + url, {
            method: 'GET',
            credentials: 'include',
            headers: {
                'Content-Type': 'application/json'
            }
        });
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Ошибка запроса');
        }
        
        return response.json();
    },
    
    
    async post(url, data) {
        const response = await fetch(this.baseUrl + url, {
            method: 'POST',
            credentials: 'include',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(data)
        });
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Ошибка запроса');
        }
        
        return response.json();
    },
    
    
    async put(url, data) {
        const response = await fetch(this.baseUrl + url, {
            method: 'PUT',
            credentials: 'include',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(data)
        });
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Ошибка запроса');
        }
        
        return response.json();
    },
    
    
    async delete(url) {
        const response = await fetch(this.baseUrl + url, {
            method: 'DELETE',
            credentials: 'include',
            headers: {
                'Content-Type': 'application/json'
            }
        });
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Ошибка запроса');
        }
        
        return response.json();
    }
};
