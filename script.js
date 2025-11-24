// ===== MOBILE CORE LOGIC =====
const CONFIG = {
    REFRESH: 5000,
    COINGEKO: 'https://api.coingecko.com/api/v3',
    HF: 'https://api-inference.huggingface.co/models/google/gemma-2b',
    CACHE_TTL: 60000
};

const STATE = {
    coins: JSON.parse(localStorage.getItem('coins_cache') || '[]'),
    signals: new Map(),
    chart: null,
    pyodide: window.APP_STATE?.pyodide,
    isOnline: navigator.onLine
};

const DOM = {
    coins: document.getElementById('coins'),
    signals: document.getElementById('signals'),
    chart: document.getElementById('chart'),
    chartCoin: document.getElementById('chartCoin'),
    search: document.getElementById('search'),
    fng: document.getElementById('fng'),
    gas: document.getElementById('gas'),
    news: document.getElementById('news'),
    toast: document.getElementById('toast'),
    status: document.getElementById('onlineStatus')
};

// ===== TOAST =====
function toast(msg, type = 'info', duration = 2500) {
    DOM.toast.textContent = msg;
    DOM.toast.className = `toast ${type} show`;
    setTimeout(() => DOM.toast.classList.remove('show'), duration);
}

// ===== CACHE MANAGER =====
const Cache = {
    get(key) {
        const data = localStorage.getItem(`cache_${key}`);
        const meta = localStorage.getItem(`cache_${key}_meta`);
        if (!data || !meta) return null;
        
        const { timestamp } = JSON.parse(meta);
        if (Date.now() - timestamp > CONFIG.CACHE_TTL) {
            this.delete(key);
            return null;
        }
        return JSON.parse(data);
    },
    set(key, value) {
        localStorage.setItem(`cache_${key}`, JSON.stringify(value));
        localStorage.setItem(`cache_${key}_meta`, JSON.stringify({ timestamp: Date.now() }));
    },
    delete(key) {
        localStorage.removeItem(`cache_${key}`);
        localStorage.removeItem(`cache_${key}_meta`);
    }
};

// ===== FETCH WITH CACHE =====
async function fetchWithCache(url, name) {
    // Return cache immediately if offline
    if (!STATE.isOnline) {
        const cached = Cache.get(name);
        if (cached) return cached;
        throw new Error('Offline - no cache');
    }
    
    try {
        const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        Cache.set(name, data);
        return data;
    } catch (error) {
        // Fallback to cache on error
        const cached = Cache.get(name);
        if (cached) {
            toast('Using cached data', 'warning');
            return cached;
        }
        throw error;
    }
}

// ===== LOAD COINS =====
async function loadCoins() {
    try {
        const url = `${CONFIG.COINGEKO}/coins/markets?vs_currency=usd&per_page=50&page=1&price_change_percentage=1h`;
        const coins = await fetchWithCache(url, 'coins');
        
        STATE.coins = coins;
        localStorage.setItem('coins_cache', JSON.stringify(coins.slice(0, 20)));
        renderCoins(coins.slice(0, 20));
        
        // Generate signals for top 5
        coins.slice(0, 5).forEach(coin => generateSignal(coin));
    } catch (error) {
        toast(`Load failed: ${error.message}`, 'error');
        // Use localStorage backup
        const backup = localStorage.getItem('coins_cache');
        if (backup) {
            STATE.coins = JSON.parse(backup);
            renderCoins(STATE.coins);
        }
    }
}

// ===== RENDER COINS =====
function renderCoins(coins) {
    DOM.coins.innerHTML = coins.map(coin => `
        <div class="coin-card" data-id="${coin.id}">
            <div class="coin-name">${coin.name}</div>
            <div class="coin-price $${coin.price_change_percentage_1h_in_currency > 0 ? 'up' : 'down'}">
                $${coin.current_price.toFixed(2)}
            </div>
            <div class="coin-change ${coin.price_change_percentage_1h_in_currency > 0 ? 'up' : 'down'}">
                ${coin.price_change_percentage_1h_in_currency?.toFixed(2)}%
            </div>
        </div>
    `).join('');
    
    // Add click handlers
    document.querySelectorAll('.coin-card').forEach(card => {
        card.addEventListener('click', () => {
            document.querySelectorAll('.coin-card').forEach(c => c.classList.remove('active'));
            card.classList.add('active');
            STATE.currentCoin = card.dataset.id;
            loadChart(card.dataset.id);
            generateSignal(STATE.coins.find(c => c.id === card.dataset.id));
        });
    });
}

// ===== GENERATE SIGNAL =====
async function generateSignal(coin) {
    if (!coin) return;
    
    try {
        // Get chart data
        const chartUrl = `${CONFIG.COINGEKO}/coins/${coin.id}/market_chart?vs_currency=usd&days=1&interval=5m`;
        const chartData = await fetchWithCache(chartUrl, `chart_${coin.id}`);
        const prices = chartData.prices.map(p => p[1]);
        
        // Calculate indicators
        const indicators = await calculateIndicators(prices);
        
        // Try AI API, fallback to local
        let signal = null;
        if (STATE.isOnline) {
            signal = await callAI(coin, indicators);
        }
        
        if (!signal) {
            signal = localSignal(coin, indicators);
        }
        
        STATE.signals.set(coin.id, { ...signal, symbol: coin.symbol });
        renderSignals();
        
        if (signal.confidence > 80) playAlert();
    } catch (error) {
        console.warn(`Signal for ${coin.id}:`, error.message);
    }
}

// ===== CALL HUGGINGFACE AI =====
async function callAI(coin, indicators) {
    try {
        const prompt = JSON.stringify({
            system: "You are a crypto scalper. Return ONLY JSON.",
            data: {
                coin: coin.name,
                price: coin.current_price,
                change: coin.price_change_percentage_1h_in_currency,
                rsi: indicators.rsi,
                macd: indicators.macd.histogram
            }
        });
        
        const res = await fetch(CONFIG.HF, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ inputs: prompt, parameters: { max_new_tokens: 100 } }),
            signal: AbortSignal.timeout(5000)
        });
        
        if (res.status === 429) {
            toast('AI rate limited', 'warning');
            return null;
        }
        
        const data = await res.json();
        const text = data[0]?.generated_text || '';
        const match = text.match(/\{[\s\S]*\}/);
        return match ? JSON.parse(match[0]) : null;
    } catch (e) {
        return null;
    }
}

// ===== LOCAL AI FALLBACK =====
function localSignal(coin, indicators) {
    const rsi = indicators.rsi;
    const macd = indicators.macd.histogram;
    const price = coin.current_price;
    
    let decision = 'Hold';
    let confidence = 50;
    
    if (rsi < 30 && macd > 0) {
        decision = 'Buy';
        confidence = 75;
    } else if (rsi > 70 && macd < 0) {
        decision = 'Sell';
        confidence = 75;
    }
    
    return {
        decision,
        confidence,
        pump_probability: decision === 'Buy' ? 0.7 : 0.3,
        dump_probability: decision === 'Sell' ? 0.7 : 0.3,
        entry_price: price,
        stoploss: price * 0.99,
        take_profit: price * (decision === 'Buy' ? 1.02 : 0.98),
        explanation: `Local AI: RSI=${rsi.toFixed(1)}`
    };
}

// ===== CALCULATE INDICATORS =====
async function calculateIndicators(prices) {
    if (!STATE.pyodide || !prices.length) {
        // Fallback to simple calculation
        return {
            rsi: 50,
            macd: { histogram: 0 },
            bollinger_bands: { upper: prices[0], middle: prices[0], lower: prices[0] }
        };
    }
    
    await STATE.pyodide.globals.set('input_data', { prices, volumes: [] });
    const result = await STATE.pyodide.runPythonAsync(`analyze_all(input_data)`);
    return result.toJs();
}

// ===== RENDER SIGNALS =====
function renderSignals() {
    const signals = Array.from(STATE.signals.values()).slice(0, 3);
    DOM.signals.innerHTML = signals.map(s => `
        <div class="signal-card">
            <div class="signal-header">
                <span class="signal-symbol">${s.symbol}</span>
                <span class="signal-decision ${s.decision}">${s.decision}</span>
            </div>
            <div class="signal-details">
                Confidence: ${s.confidence}% | ${s.explanation}
            </div>
            <div class="signal-bar">
                <div class="signal-fill" style="width: ${s.confidence}%; background: ${s.decision === 'Buy' ? 'var(--up)' : s.decision === 'Sell' ? 'var(--down)' : 'var(--warn)'}"></div>
            </div>
        </div>
    `).join('');
}

// ===== LOAD CHART =====
async function loadChart(coinId) {
    const coin = STATE.coins.find(c => c.id === coinId);
    if (!coin) return;
    
    DOM.chartCoin.textContent = coin.symbol.toUpperCase();
    
    // Clear and init chart
    if (STATE.chart) STATE.chart.remove();
    
    STATE.chart = LightweightCharts.createChart(DOM.chart, {
        layout: { background: { color: 'transparent' }, textColor: '#e2e8f0' },
        grid: { vertLines: { color: 'rgba(255,255,255,0.05)' }, horzLines: { color: 'rgba(255,255,255,0.05)' } },
        width: DOM.chart.clientWidth,
        height: 250
    });
    
    const series = STATE.chart.addCandlestickSeries();
    
    // Mock candle data
    const data = await fetchWithCache(
        `${CONFIG.COINGEKO}/coins/${coinId}/market_chart?vs_currency=usd&days=1&interval=15m`,
        `chart_${coinId}`
    );
    
    const candles = data.prices.map((p, i) => ({
        time: p[0] / 1000,
        open: p[1] * 0.99,
        high: p[1] * 1.01,
        low: p[1] * 0.98,
        close: p[1]
    }));
    
    series.setData(candles);
}

// ===== LOAD SENTIMENT =====
async function loadSentiment() {
    try {
        // Fear & Greed
        const fng = await fetchWithCache('https://api.alternative.me/fng/?limit=1', 'fng');
        DOM.fng.classList.remove('skeleton');
        DOM.fng.innerHTML = `${fng.data[0].value}`;
        
        // Gas
        const gas = await fetchWithCache('https://api.blocknative.com/gasprices/blockprices', 'gas');
        DOM.gas.classList.remove('skeleton');
        DOM.gas.textContent = Math.round(gas.blockPrices[0].estimatedPrices[0].price);
    } catch (e) {
        DOM.fng.textContent = 'N/A';
        DOM.gas.textContent = 'N/A';
    }
}

// ===== LOAD NEWS =====
async function loadNews() {
    try {
        const data = await fetchWithCache('https://cryptopanic.com/api/free/v1/posts/?auth_token=demo&filter=hot', 'news');
        DOM.news.innerHTML = data.results.slice(0, 5).map(n => `
            <div class="news-item">
                <div class="news-title">${n.title}</div>
                <div class="news-meta">${n.source_domain} • ${new Date(n.published_at).toLocaleString()}</div>
            </div>
        `).join('');
    } catch (e) {
        DOM.news.innerHTML = '<div class="news-item">📴 Offline</div>';
    }
}

// ===== AUDIO ALERT =====
function playAlert() {
    try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain).connect(ctx.destination);
        osc.frequency.value = 800;
        gain.gain.value = 0.1;
        osc.start();
        osc.stop(ctx.currentTime + 0.2);
    } catch (e) {}
}

// ===== EVENT LISTENERS =====
function setupEvents() {
    // Theme
    const saved = localStorage.getItem('theme');
    if (saved) {
        document.documentElement.setAttribute('data-theme', saved);
        DOM.themeBtn.textContent = saved === 'dark' ? '☀️' : '🌙';
    }
    
    DOM.themeBtn.addEventListener('click', () => {
        const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
        const newTheme = isDark ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', newTheme);
        localStorage.setItem('theme', newTheme);
        DOM.themeBtn.textContent = isDark ? '☀️' : '🌙';
    });
    
    // Search
    DOM.search.addEventListener('input', (e) => {
        const q = e.target.value.toLowerCase();
        if (!q) return renderCoins(STATE.coins.slice(0, 20));
        
        const filtered = STATE.coins.filter(c => 
            c.name.toLowerCase().includes(q) || c.symbol.toLowerCase().includes(q)
        );
        renderCoins(filtered.slice(0, 20));
    });
    
    // Online status
    const updateStatus = () => {
        STATE.isOnline = navigator.onLine;
        DOM.status.textContent = STATE.isOnline ? '🟢' : '🔴';
        DOM.status.className = STATE.isOnline ? 'online' : 'offline';
    };
    
    window.addEventListener('online', updateStatus);
    window.addEventListener('offline', updateStatus);
    updateStatus();
}

// ===== AUTO REFRESH =====
function startRefresh() {
    setInterval(() => {
        if (document.hidden) return;
        loadCoins();
        loadSentiment();
        loadNews();
    }, CONFIG.REFRESH);
}

// ===== INIT =====
async function init() {
    setupEvents();
    await loadCoins();
    await Promise.all([loadSentiment(), loadNews()]);
    startRefresh();
    toast('✅ Ready to trade!', 'success');
}

// Start when DOM ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
