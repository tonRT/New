// ===== MOBILE-OPTIMIZED SETUP =====
const LOADER = {
    PYODIDE_URL: 'https://cdn.jsdelivr.net/pyodide/v0.24.1/full/pyodide.mjs',
    CHARTS_URL: 'https://unpkg.com/lightweight-charts/dist/lightweight-charts.standalone.production.js',
    CACHE_NAME: 'crypto-mobile-v1'
};

// ===== PROGRESS UPDATER =====
function updateProgress(msg, percent) {
    const status = document.getElementById('splashStatus');
    const fill = document.getElementById('progressFill');
    if (status) status.textContent = msg;
    console.log(`[Setup] ${msg}`);
}

// ===== SERVICE WORKER =====
async function setupSW() {
    if ('serviceWorker' in navigator) {
        try {
            const reg = await navigator.serviceWorker.register('sw.js');
            console.log('SW registered');
            return reg;
        } catch (e) {
            console.warn('SW failed:', e);
        }
    }
}

// ===== LOAD SCRIPT =====
function loadScript(src, id) {
    return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = src;
        script.id = id;
        script.onload = resolve;
        script.onerror = reject;
        document.head.appendChild(script);
    });
}

// ===== LOAD PYODIDE =====
async function loadPyodide() {
    updateProgress('Loading AI engine...');
    
    try {
        const script = document.createElement('script');
        script.src = LOADER.PYODIDE_URL;
        script.type = 'module';
        
        await new Promise((resolve, reject) => {
            script.onload = resolve;
            script.onerror = () => reject(new Error('Pyodide load failed'));
            document.head.appendChild(script);
        });
        
        const pyodide = await globalThis.loadPyodide();
        await pyodide.loadPackage(['numpy']);
        
        updateProgress('Loading indicators...');
        const response = await fetch('analysis.py');
        const code = await response.text();
        await pyodide.runPythonAsync(code);
        
        return pyodide;
    } catch (error) {
        updateProgress('Using fallback engine...');
        // Still return a mock for offline
        return { runPythonAsync: () => {}, globals: { set: () => {} } };
    }
}

// ===== MAIN SETUP =====
async function setup() {
    try {
        // Step 1: SW for offline
        updateProgress('Setting up offline mode...');
        await setupSW();
        
        // Step 2: Load charts
        updateProgress('Loading charts...');
        await loadScript(LOADER.CHARTS_URL, 'charts-script');
        
        // Step 3: Load Pyodide
        const pyodide = await loadPyodide();
        
        // Step 4: Load main app
        updateProgress('Starting app...');
        window.APP_STATE = { pyodide, isOnline: navigator.onLine };
        
        await loadScript('script.js', 'main-script');
        
        // Hide splash
        const splash = document.getElementById('splash');
        if (splash) {
            splash.style.opacity = '0';
            setTimeout(() => {
                splash.remove();
                document.getElementById('appMain').style.display = 'block';
            }, 500);
        }
        
    } catch (error) {
        console.error('Setup failed:', error);
        updateProgress('Error: ' + error.message);
    }
}

// ===== START =====
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setup);
} else {
    setup();
}
