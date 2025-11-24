// ===== SMART SETUP & LOADER =====
const SETUP = {
    PYODIDE_URL: 'https://cdn.jsdelivr.net/pyodide/v0.24.1/full/pyodide.mjs',
    CHARTS_URL: 'https://unpkg.com/lightweight-charts/dist/lightweight-charts.standalone.production.js',
    REQUIRED_FILES: ['analysis.py', 'script.js'],
    CACHE_NAME: 'crypto-ai-trader-v1'
};

// ===== PROGRESS TRACKER =====
const Progress = {
    total: 4,
    current: 0,
    update: function(msg, step = 0) {
        if (step) this.current = step;
        else this.current++;
        
        const percent = (this.current / this.total) * 100;
        const fill = document.getElementById('progressFill');
        const details = document.getElementById('loadingDetails');
        
        if (fill) fill.style.width = percent + '%';
        if (details) details.textContent = `[${this.current}/${this.total}] ${msg}`;
        
        console.log(`[Setup] ${msg}`);
    }
};

// ===== SERVICE WORKER REGISTRATION =====
async function registerServiceWorker() {
    if ('serviceWorker' in navigator) {
        try {
            const registration = await navigator.serviceWorker.register('sw.js');
            console.log('SW registered:', registration.scope);
            
            // Force cache update on first load
            if (registration.installing) {
                registration.installing.addEventListener('statechange', (e) => {
                    if (e.target.state === 'activated') {
                        showToast('App ready for offline use!', 'success');
                    }
                });
            }
        } catch (error) {
            console.warn('SW registration failed:', error);
        }
    }
}

// ===== PYODIDE LOADER WITH FALLBACK =====
async function loadPyodideWithFallback() {
    Progress.update('Loading Pyodide engine...', 1);
    
    try {
        // Try main CDN
        const pyodide = await loadPyodide(SETUP.PYODIDE_URL);
        Progress.update('Pyodide loaded, installing packages...', 2);
        return pyodide;
    } catch (error) {
        console.warn('Primary CDN failed, trying fallback...');
        showToast('Using fallback CDN...', 'warning');
        
        try {
            // Fallback CDN
            const fallbackUrl = 'https://pyodide-cdn2.iodide.io/v0.24.1/full/pyodide.mjs';
            const pyodide = await loadPyodide(fallbackUrl);
            Progress.update('Pyodide loaded via fallback', 2);
            return pyodide;
        } catch (e) {
            throw new Error('Pyodide load failed. Check internet connection.');
        }
    }
}

async function loadPyodide(url) {
    return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = url;
        script.type = 'module';
        script.crossOrigin = 'anonymous';
        
        script.onload = async () => {
            try {
                const pyodide = await globalThis.loadPyodide();
                await pyodide.loadPackage(['numpy', 'pandas']);
                Progress.update('Python packages installed', 3);
                resolve(pyodide);
            } catch (error) {
                reject(error);
            }
        };
        
        script.onerror = () => reject(new Error('Pyodide CDN unreachable'));
        document.head.appendChild(script);
    });
}

// ===== FILE VALIDATION =====
async function checkRequiredFiles() {
    for (const file of SETUP.REQUIRED_FILES) {
        try {
            const response = await fetch(file, { method: 'HEAD' });
            if (!response.ok) throw new Error(`${file} not found`);
        } catch (error) {
            throw new Error(`Missing required file: ${file}. Ensure all files are in same folder.`);
        }
    }
}

// ===== MAIN INITIALIZATION =====
async function initializeApp() {
    try {
        // Step 1: Check files
        Progress.update('Validating files...', 0);
        await checkRequiredFiles();
        
        // Step 2: Register SW for offline
        Progress.update('Setting up offline mode...', 1);
        await registerServiceWorker();
        
        // Step 3: Load Pyodide
        const pyodide = await loadPyodideWithFallback();
        
        // Step 4: Load Python analysis
        Progress.update('Loading AI engine...', 3);
        const response = await fetch('analysis.py');
        const pythonCode = await response.text();
        await pyodide.runPythonAsync(pythonCode);
        
        Progress.update('Starting application...', 4);
        
        // Step 5: Initialize main app
        window.APP_STATE = { pyodide, isOnline: navigator.onLine };
        
        // Load main script
        const script = document.createElement('script');
        script.src = 'script.js';
        script.type = 'module';
        script.onload = () => {
            // Hide loading overlay
            setTimeout(() => {
                const overlay = document.getElementById('loadingOverlay');
                if (overlay) {
                    overlay.style.opacity = '0';
                    setTimeout(() => overlay.remove(), 500);
                }
                showToast('✅ System Ready!', 'success');
            }, 500);
        };
        
        document.body.appendChild(script);
        
    } catch (error) {
        console.error('Setup failed:', error);
        showToast(`❌ Setup Error: ${error.message}`, 'error');
        document.getElementById('loadingDetails').textContent = 'Refresh page or check console (F12)';
    }
}

// ===== NETWORK STATUS =====
window.addEventListener('online', () => {
    window.APP_STATE.isOnline = true;
    document.getElementById('statusIndicator').className = 'status-indicator online';
    showToast('🌐 Back online!', 'success');
});

window.addEventListener('offline', () => {
    window.APP_STATE.isOnline = false;
    document.getElementById('statusIndicator').className = 'status-indicator offline';
    showToast('📴 Offline mode - using cached data', 'warning');
});

// ===== START ON PAGE LOAD =====
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeApp);
} else {
    initializeApp();
}

// ===== UTILITY FOR MAIN APP =====
window.showToast = function(message, type = 'info', duration = 3000) {
    const toast = document.getElementById('toast');
    if (!toast) return;
    
    toast.textContent = message;
    toast.className = `toast ${type} show`;
    setTimeout(() => toast.classList.remove('show'), duration);
};
