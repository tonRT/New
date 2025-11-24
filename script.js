// ===== MAIN APPLICATION LOGIC =====
import { AIFallbackEngine } from './ai-fallback.js'; // Will be inlined

const CONFIG = {
    REFRESH_INTERVAL: 5000,
    MAX_RETRIES: 3,
    CACHE_TTL: 30000,
    HF_API_URL: 'https://api-inference.huggingface.co/models/google/gemma-2b',
    COINGEKO_BASE: 'https://api.coingecko.com/api/v3',
    FNG_API: 'https://api.alternative.me/fng/?limit=1&format=json',
    NEWS_API: 'https://cryptopanic.com/api/free/v1/posts/?auth_token=demo&filter=hot&kind=news',
    GAS_API: 'https://api.blocknative.com/gasprices/blockprices',
    CHART_POINTS: 60
};

const STATE = {
    coins: [],
    signals: new Map(),
    chart: null,
    currentCoin: 'bitcoin',
    isDarkMode: true,
    pyodide: window.APP_STATE?.pyodide,
    isOnline: window.APP_STATE?.isOnline ?? navigator.onLine,
    cache: new Map(),
    aiEngine: null
};

const DOM = {
    dashboard: document.getElementById('dashboard'),
    signalsPanel: document.getElementById('signalDisplay'),
    chartContainer: document.getElementById('chartContainer'),
    fearGreed: document.getElementById('fearGreed'),
    gasPrice: document.getElementById('gasPrice'),
    newsList: document.getElementById('newsList'),
    searchInput: document.getElementById('searchInput'),
    searchResults: document.getElementById('searchResults'),
    themeToggle: document.getElementById('themeToggle'),
    toast: document.getElementById('toast'),
    statusIndicator: document.getElementById('statusIndicator')
};

// ===== AI FALLBACK ENGINE =====
class AIFallbackEngine {
    generateSignal(data) {
        const indicators = data.indicators;
        const price = data.price;
        const rsi = indicators.rsi;
        const macd = indicators.macd.histogram;
        const bb = indicators.bollinger_bands;
        
        // Scoring system
        let buyScore = 0;
        let sellScore = 0;
        
        // RSI logic
        if (rsi < 30) buyScore += 3;
        else if (rsi > 70) sellScore += 3;
        
        // MACD logic
        if (macd > 0) buyScore += 2;
        else sellScore += 2;
        
        // Bollinger Bands
        if (price < bb.lower) buyScore += 2;
        else if (price > bb.upper) sellScore += 2;
        
        // Price momentum
        const momentum = data.change_1h;
        if (momentum > 0.5) buyScore += 1;
        else if (momentum < -0.5) sellScore += 1;
        
        // Volume
        if (data.volume > data.market_cap * 0.05) {
            buyScore += 1;
            sellScore += 1;
        }
        
        // Decision
        let decision = 'Hold';
        let confidence = 50;
        
        if (buyScore >= 5 && buyScore > sellScore) {
            decision = 'Buy';
            confidence = Math.min(90, 50 + (buyScore * 8));
        } else if (sellScore >= 5 && sellScore > buyScore) {
            decision = 'Sell';
            confidence = Math.min(90, 50 + (sellScore * 8));
        }
        
        const strength = Math.random() * 0.3 + 0.6; // 60-90% probability
        
        return {
            decision,
            confidence,
            pump_probability: decision === 'Buy' ? strength : (1 - strength) * 0.3,
            dump_probability: decision === 'Sell' ? strength : (1 - strength) * 0.3,
            next_5min_trend: decision === 'Buy' ? 'Up' : decision === 'Sell' ? 'Down' : 'Sideways',
            entry_price: price,
            exit_price: decision === 'Buy' ? price * 1.02 : price * 0.98,
            stoploss: decision === 'Buy' ? price * 0.99 : price * 1.01,
            take_profit: decision === 'Buy' ? price * 1.03 : price * 0.97,
            explanation: `Local AI: RSI=${rsi.toFixed(1)}, MACD=${macd.toFixed(2)}, Score=${buyScore}:${sellScore}`
        };
    }
}

// ===== INITIALIZATION =====
async function init() {
    try {
        STATE.aiEngine = new AIFallbackEngine();
        
        initChart();
        setupEventListeners();
        
        // Load initial data
        await fetchMarketData();
        await Promise.all([
            fetchFearGreed(),
            fetchNews(),
            fetchGas()
        ]);
        
        startAutoRefresh();
        showToast('✅ All systems operational!', 'success');
    } catch (error) {
        showToast(`❌ Startup failed: ${error.message}`, 'error');
        console.error('Init error:', error);
    }
}

// ===== CHART SETUP =====
function initChart() {
    const chartOptions = {
        layout: { 
            background: { color: 'transparent' }, 
            textColor: getComputedStyle(document.documentElement).getPropertyValue('--text-primary') 
        },
        grid: { 
            vertLines: { color: 'rgba(0,0,0,0.1)' }, 
            horzLines: { color: 'rgba(0,0,0,0.1)' } 
        },
        width: DOM.chartContainer.clientWidth,
        height: 400,
        crosshair: { mode: LightweightCharts.CrosshairMode.Normal }
    };
    
    STATE.chart = LightweightCharts.createChart(DOM.chartContainer, chartOptions);
}

// ===== API FETCHING =====
async function fetchWithRetry(url, options = {}, retries = CONFIG.MAX_RETRIES) {
    const cacheKey = url + JSON.stringify(options);
    const cached = getCache(cacheKey);
    if (cached) return cached;

    if (!STATE.isOnline) throw new Error('Offline - using cache only');

    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 5000);
        
        const response = await fetch(url, { ...options, signal: controller.signal });
        clearTimeout(timeout);
        
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        
        const data = await response.json();
        setCache(cacheKey, data);
        return data;
    } catch (error) {
        if (retries > 0 && STATE.isOnline) {
            await new Promise(r => setTimeout(r, (CONFIG.MAX_RETRIES - retries + 1) * 1000));
            return fetchWithRetry(url, options, retries - 1);
        }
        throw error;
    }
}

function getCache(key) {
    const item = STATE.cache.get(key);
    if (!item) return null;
    if (Date.now() - item.timestamp > CONFIG.CACHE_TTL) {
        STATE.cache.delete(key);
        return null;
    }
    return item.data;
}

function setCache(key, data) {
    STATE.cache.set(key, { data, timestamp: Date.now() });
}

// ===== DATA FETCHING =====
async function fetchMarketData() {
    try {
        const url = `${CONFIG.COINGEKO_BASE}/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=100&page=1&sparkline=false&price_change_percentage=1h,24h`;
        const coins = await fetchWithRetry(url);
        
        STATE.coins = coins;
        updateDashboard(coins);
        
        // Generate signals for top 5 coins
        const topCoins = coins.slice(0, 5);
        await Promise.all(topCoins.map(coin => generateSignal(coin)));
        
    } catch (error) {
        showToast(`Market data: ${error.message}. Using cached.`, 'warning');
        // Try to load from localStorage backup
        const backup = localStorage.getItem('crypto_backup');
        if (backup) {
            STATE.coins = JSON.parse(backup);
            updateDashboard(STATE.coins);
        }
    }
}

async function fetchCoinChart(coinId) {
    try {
        const url = `${CONFIG.COINGEKO_BASE}/coins/${coinId}/market_chart?vs_currency=usd&days=1&interval=5m`;
        const data = await fetchWithRetry(url);
        return data.prices.map(p => ({ time: p[0] / 1000, price: p[1] }));
    } catch (error) {
        showToast(`Chart data unavailable`, 'warning');
        return [];
    }
}

async function fetchFearGreed() {
    try {
        const data = await fetchWithRetry(CONFIG.FNG_API);
        const value = data.data[0].value;
        const classification = data.data[0].value_classification;
        DOM.fearGreed.classList.remove('skeleton');
        DOM.fearGreed.innerHTML = `<div class="sentiment-value" style="color: ${getFearGreedColor(value)}">${value}</div><div>${classification}</div>`;
    } catch (error) {
        DOM.fearGreed.textContent = 'Offline';
    }
}

async function fetchNews() {
    try {
        const data = await fetchWithRetry(CONFIG.NEWS_API);
        updateNews(data.results.slice(0, 5));
    } catch (error) {
        DOM.newsList.innerHTML = '<div class="news-item">📴 Offline - News unavailable</div>';
    }
}

async function fetchGas() {
    try {
        const data = await fetchWithRetry(CONFIG.GAS_API);
        const gas = data.blockPrices[0].estimatedPrices[0].price;
        DOM.gasPrice.classList.remove('skeleton');
        DOM.gasPrice.innerHTML = `<div class="sentiment-value">${Math.round(gas)}</div>`;
    } catch (error) {
        DOM.gasPrice.textContent = 'Offline';
    }
}

// ===== AI SIGNAL GENERATION =====
async function generateSignal(coinData) {
    try {
        const priceHistory = await fetchCoinChart(coinData.id);
        if (priceHistory.length < 30) throw new Error('Insufficient data');
        
        const prices = priceHistory.map(p => p.price);
        const volumes = Array(prices.length).fill(coinData.total_volume / prices.length);
        
        const indicators = await calculateIndicators(prices, volumes);
        
        // Try HuggingFace API first, fallback to local AI
        let signal = null;
        if (STATE.isOnline) {
            signal = await callHuggingFace(createAIPrompt(coinData, indicators));
        }
        
        if (!signal) {
            showToast(`Using offline AI for ${coinData.symbol}`, 'warning');
            signal = STATE.aiEngine.generateSignal({
                ...coinData,
                indicators
            });
        }
        
        STATE.signals.set(coinData.id, { ...signal, coin: coinData.name, symbol: coinData.symbol });
        updateSignals();
        
        if (signal.confidence > 80) playAlert();
        
    } catch (error) {
        console.warn(`Signal for ${coinData.id}:`, error.message);
    }
}

function createAIPrompt(coinData, indicators) {
    return JSON.stringify({
        system: "You are a crypto scalping expert. Return ONLY JSON with exact keys.",
        data: {
            coin: coinData.name,
            symbol: coinData.symbol,
            price: coinData.current_price,
            change_1h: coinData.price_change_percentage_1h_in_currency || 0,
            change_24h: coinData.price_change_percentage_24h || 0,
            volume: coinData.total_volume,
            market_cap: coinData.market_cap,
            indicators
        },
        required: {
            decision: "Buy|Sell|Hold",
            pump_probability: "0.0-1.0",
            dump_probability: "0.0-1.0",
            confidence: "0-100",
            entry_price: "number",
            stoploss: "number",
            take_profit: "number",
            explanation: "One sentence"
        }
    });
}

async function callHuggingFace(prompt) {
    try {
        const response = await fetch(CONFIG.HF_API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                inputs: prompt,
                parameters: { max_new_tokens: 150, temperature: 0.1 }
            })
        });
        
        if (response.status === 429) {
            showToast('AI API rate limited, using local model', 'warning');
            return null;
        }
        
        if (!response.ok) throw new Error(`HF ${response.status}`);
        
        const data = await response.json();
        const text = data[0]?.generated_text || '';
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        
        if (!jsonMatch) return null;
        return JSON.parse(jsonMatch[0]);
    } catch (error) {
        console.warn('HuggingFace API failed:', error.message);
        return null;
    }
}

// ===== PYTHON INDICATOR CALCULATION =====
async function calculateIndicators(prices, volumes) {
    if (!STATE.pyodide) {
        throw new Error('Pyodide not ready');
    }
    
    await STATE.pyodide.globals.set('input_data', { prices, volumes });
    const result = await STATE.pyodide.runPythonAsync(`analyze_all(input_data)`);
    return result.toJs();
}

// ===== UI UPDATES =====
function updateDashboard(coins) {
    const fragment = document.createDocumentFragment();
    DOM.dashboard.innerHTML = '';
    
    coins.forEach(coin => {
        const card = renderCoinCard(coin);
        fragment.appendChild(card);
    });
    
    DOM.dashboard.appendChild(fragment);
    
    // Save backup to localStorage
    localStorage.setItem('crypto_backup', JSON.stringify(coins.slice(0, 20)));
}

function renderCoinCard(coin) {
    const card = document.createElement('div');
    card.className = 'coin-card glass';
    card.dataset.coinId = coin.id;
    
    const priceChange1h = coin.price_change_percentage_1h_in_currency || 0;
    const changeClass = priceChange1h > 0 ? 'price-up' : 'price-down';
    
    card.innerHTML = `
        <div class="coin-header">
            <img class="coin-icon" src="${coin.image}" alt="${coin.name}" 
                 onerror="this.src='data:image/svg+xml,<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 24 24\"><circle cx=\"12\" cy=\"12\" r=\"10\" fill=\"%23${Math.floor(Math.random()*16777215).toString(16)}\"/></svg>'">
            <div>
                <div class="coin-name">${coin.name}</div>
                <div class="coin-symbol">${coin.symbol.toUpperCase()}</div>
            </div>
        </div>
        <div class="price ${changeClass}">$${coin.current_price.toLocaleString()}</div>
        <div class="price-change ${changeClass}">1h: ${priceChange1h.toFixed(2)}%</div>
        <div class="coin-stats">
            <div class="stat">
                <span>MCap</span>
                <span class="stat-value">$${(coin.market_cap / 1e9).toFixed(2)}B</span>
            </div>
            <div class="stat">
                <span>Volume</span>
                <span class="stat-value">$${(coin.total_volume / 1e9).toFixed(2)}B</span>
            </div>
            <div class="stat">
                <span>Rank</span>
                <span class="stat-value">#${coin.market_cap_rank}</span>
            </div>
        </div>
    `;
    
    card.addEventListener('click', () => {
        document.querySelectorAll('.coin-card').forEach(c => c.classList.remove('active'));
        card.classList.add('active');
        STATE.currentCoin = coin.id;
        updateChart(coin.id);
        generateSignal(coin);
    });
    
    return card;
}

function updateSignals() {
    const fragment = document.createDocumentFragment();
    DOM.signalsPanel.innerHTML = '<h2>🤖 AI Scalping Signals (Live)</h2><div id="signalDisplay" class="signal-display"></div>';
    
    STATE.signals.forEach((signal, coinId) => {
        const card = document.createElement('div');
        card.className = 'signal-card';
        
        const strength = Math.max(signal.pump_probability, signal.dump_probability);
        const strengthColor = signal.decision === 'Buy' ? 'var(--success)' : 
                              signal.decision === 'Sell' ? 'var(--danger)' : 'var(--warning)';
        
        card.innerHTML = `
            <div class="signal-decision ${signal.decision}">${signal.symbol}: ${signal.decision}</div>
            <div class="signal-confidence">Confidence: ${signal.confidence}%</div>
            <div class="signal-meter">
                <div class="signal-meter-fill" style="width: ${strength * 100}%; background: ${strengthColor}"></div>
            </div>
            <div style="font-size: 0.8rem; margin: 0.5rem 0;">
                📈 Entry: $${signal.entry_price.toFixed(2)} | 🎯 TP: $${signal.take_profit.toFixed(2)}<br>
                🛑 SL: $${signal.stoploss.toFixed(2)}
            </div>
            <div class="signal-details">${signal.explanation}</div>
        `;
        
        fragment.appendChild(card);
    });
    
    document.getElementById('signalDisplay').appendChild(fragment);
}

function updateNews(news) {
    const fragment = document.createDocumentFragment();
    DOM.newsList.innerHTML = '';
    
    news.forEach(article => {
        const item = document.createElement('div');
        item.className = 'news-item';
        item.innerHTML = `
            <div class="news-title">${article.title}</div>
            <div class="news-meta">${article.source_domain} • ${new Date(article.published_at).toLocaleString()}</div>
        `;
        fragment.appendChild(item);
    });
    
    DOM.newsList.appendChild(fragment);
}

// ===== AUDIO ALERT =====
function playAlert() {
    try {
        const audio = new AudioContext();
        const osc = audio.createOscillator();
        const gain = audio.createGain();
        
        osc.connect(gain);
        gain.connect(audio.destination);
        
        osc.frequency.setValueAtTime(800, audio.currentTime);
        osc.type = 'sine';
        gain.gain.setValueAtTime(0.1, audio.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, audio.currentTime + 0.5);
        
        osc.start(audio.currentTime);
        osc.stop(audio.currentTime + 0.5);
    } catch (e) {
        console.warn('Audio alert failed:', e);
    }
}

// ===== EVENT LISTENERS =====
function setupEventListeners() {
    DOM.themeToggle.addEventListener('click', () => {
        STATE.isDarkMode = !STATE.isDarkMode;
        document.documentElement.setAttribute('data-theme', STATE.isDarkMode ? 'dark' : 'light');
        localStorage.setItem('theme', STATE.isDarkMode ? 'dark' : 'light');
    });
    
    // Load saved theme
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme) {
        STATE.isDarkMode = savedTheme === 'dark';
        document.documentElement.setAttribute('data-theme', savedTheme);
    }
    
    // Search
    DOM.searchInput.addEventListener('input', debounce((e) => {
        const query = e.target.value.trim();
        if (query.length < 2) {
            DOM.searchResults.style.display = 'none';
            return;
        }
        searchCoins(query);
    }, 300));
    
    // Hide search on outside click
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.search-box')) {
            DOM.searchResults.style.display = 'none';
        }
    });
}

async function searchCoins(query) {
    try {
        const url = `${CONFIG.COINGEKO_BASE}/search?query=${query}`;
        const data = await fetchWithRetry(url);
        
        DOM.searchResults.innerHTML = '';
        data.coins.slice(0, 5).forEach(coin => {
            const item = document.createElement('div');
            item.className = 'search-result-item';
            item.textContent = `${coin.name} (${coin.symbol.toUpperCase()})`;
            item.addEventListener('click', () => {
                STATE.currentCoin = coin.id;
                DOM.searchInput.value = '';
                DOM.searchResults.style.display = 'none';
                generateSignal({ id: coin.id, name: coin.name, symbol: coin.symbol });
            });
            DOM.searchResults.appendChild(item);
        });
        DOM.searchResults.style.display = 'block';
    } catch (error) {
        DOM.searchResults.style.display = 'none';
    }
}

// ===== AUTO REFRESH =====
function startAutoRefresh() {
    setInterval(async () => {
        if (document.hidden) return;
        await fetchMarketData();
        fetchFearGreed();
        fetchGas();
    }, CONFIG.REFRESH_INTERVAL);
}

// ===== UTILITY =====
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

function getFearGreedColor(value) {
    if (value > 75) return 'var(--success)';
    if (value > 55) return 'var(--warning)';
    if (value > 45) return 'var(--text-secondary)';
    if (value > 25) return 'var(--warning)';
    return 'var(--danger)';
}

// ===== START APP =====
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
