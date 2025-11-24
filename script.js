// ===== CONFIGURATION & STATE =====
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
    pyodide: null,
    cache: new Map()
};

// ===== DOM ELEMENTS =====
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
    toast: document.getElementById('toast')
};

// ===== INITIALIZATION =====
async function init() {
    try {
        showToast('Initializing AI Engine...', 'success');
        await loadPyodide();
        initChart();
        setupEventListeners();
        await fetchMarketData();
        await Promise.all([
            fetchFearGreed(),
            fetchNews(),
            fetchGas()
        ]);
        startAutoRefresh();
        showToast('System Ready', 'success');
    } catch (error) {
        showToast(`Init Error: ${error.message}`, 'error');
        console.error('Init failed:', error);
    }
}

// ===== PYTHON LOADING =====
async function loadPyodide() {
    if (STATE.pyodide) return;
    
    const pyodide = await loadPyodideModule();
    await pyodide.loadPackage(['numpy']);
    
    const response = await fetch('analysis.py');
    const pythonCode = await response.text();
    await pyodide.runPythonAsync(pythonCode);
    
    STATE.pyodide = pyodide;
}

async function loadPyodideModule() {
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/pyodide/v0.24.1/full/pyodide.mjs';
    script.type = 'module';
    document.head.appendChild(script);
    
    return new Promise((resolve) => {
        script.onload = () => resolve(globalThis.loadPyodide());
    });
}

// ===== API FETCHING WITH RETRY & CACHE =====
async function fetchWithRetry(url, options = {}, retries = CONFIG.MAX_RETRIES) {
    const cacheKey = url + JSON.stringify(options);
    const cached = getCache(cacheKey);
    if (cached) return cached;

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
        if (retries > 0) {
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
        
        // Generate signals for top 10 coins
        const topCoins = coins.slice(0, 10);
        await Promise.all(topCoins.map(coin => generateSignal(coin)));
        
    } catch (error) {
        showToast(`Market data error: ${error.message}`, 'error');
    }
}

async function fetchCoinChart(coinId) {
    try {
        const url = `${CONFIG.COINGEKO_BASE}/coins/${coinId}/market_chart?vs_currency=usd&days=1&interval=5m`;
        const data = await fetchWithRetry(url);
        return data.prices.map(p => ({ time: p[0] / 1000, price: p[1] }));
    } catch (error) {
        showToast(`Chart data error: ${error.message}`, 'error');
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
        DOM.fearGreed.textContent = 'N/A';
    }
}

async function fetchNews() {
    try {
        const data = await fetchWithRetry(CONFIG.NEWS_API);
        updateNews(data.results.slice(0, 5));
    } catch (error) {
        DOM.newsList.innerHTML = '<div class="news-item">News feed unavailable</div>';
    }
}

async function fetchGas() {
    try {
        const data = await fetchWithRetry(CONFIG.GAS_API);
        const gas = data.blockPrices[0].estimatedPrices[0].price;
        DOM.gasPrice.classList.remove('skeleton');
        DOM.gasPrice.innerHTML = `<div class="sentiment-value">${Math.round(gas)}</div>`;
    } catch (error) {
        DOM.gasPrice.textContent = 'N/A';
    }
}

// ===== CHART INITIALIZATION =====
function initChart() {
    const chartOptions = {
        layout: { background: { color: 'transparent' }, textColor: getComputedStyle(document.documentElement).getPropertyValue('--text-primary') },
        grid: { vertLines: { color: 'rgba(0,0,0,0.1)' }, horzLines: { color: 'rgba(0,0,0,0.1)' } },
        width: DOM.chartContainer.clientWidth,
        height: 400
    };
    
    STATE.chart = LightweightCharts.createChart(DOM.chartContainer, chartOptions);
    
    const candleSeries = STATE.chart.addCandlestickSeries();
    const volumeSeries = STATE.chart.addHistogramSeries({
        color: '#26a69a',
        priceFormat: { type: 'volume' },
        priceScaleId: '',
        scaleMargins: { top: 0.8, bottom: 0 }
    });
}

// ===== AI SIGNAL GENERATION =====
async function generateSignal(coinData) {
    try {
        const priceHistory = await fetchCoinChart(coinData.id);
        if (priceHistory.length < 30) throw new Error('Insufficient price data');
        
        const prices = priceHistory.map(p => p.price);
        const volumes = Array(prices.length).fill(coinData.total_volume / prices.length);
        
        const indicators = await calculateIndicators(prices, volumes);
        
        const aiPrompt = createAIPrompt(coinData, indicators);
        let signal = await callHuggingFace(aiPrompt);
        
        // Fallback to heuristic if AI fails
        if (!signal || !signal.decision) {
            signal = fallbackHeuristicSignal(coinData, indicators);
        }
        
        STATE.signals.set(coinData.id, { ...signal, coin: coinData.name, symbol: coinData.symbol });
        updateSignals();
        
        // Play alert on new strong signal
        if (signal.confidence > 80) playAlert();
        
    } catch (error) {
        console.error(`Signal generation failed for ${coinData.id}:`, error);
    }
}

function createAIPrompt(coinData, indicators) {
    return {
        system: "You are a crypto scalping expert. Analyze the data and return ONLY a JSON object with exact keys. Do not include any additional text.",
        data: {
            coin: coinData.name,
            symbol: coinData.symbol,
            price: coinData.current_price,
            change_1h: coinData.price_change_percentage_1h_in_currency || 0,
            change_24h: coinData.price_change_percentage_24h || 0,
            volume: coinData.total_volume,
            market_cap: coinData.market_cap,
            indicators: indicators
        },
        required_output: {
            decision: "Buy|Sell|Hold",
            pump_probability: "0.0 to 1.0",
            dump_probability: "0.0 to 1.0",
            next_5min_trend: "Up|Down|Sideways",
            confidence: "0-100",
            entry_price: "number",
            exit_price: "number",
            stoploss: "number",
            take_profit: "number",
            explanation: "One sentence"
        }
    };
}

async function callHuggingFace(prompt) {
    try {
        const response = await fetch(CONFIG.HF_API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                inputs: JSON.stringify(prompt),
                parameters: { max_new_tokens: 200, temperature: 0.1 }
            })
        });
        
        if (!response.ok) throw new Error(`HF API: ${response.status}`);
        
        const data = await response.json();
        const generatedText = data[0]?.generated_text || '';
        
        // Extract JSON from response
        const jsonMatch = generatedText.match(/\{[\s\S]*\}/);
        if (!jsonMatch) return null;
        
        return JSON.parse(jsonMatch[0]);
    } catch (error) {
        console.warn('HF API failed, using fallback:', error);
        return null;
    }
}

function fallbackHeuristicSignal(coinData, indicators) {
    const rsi = indicators.rsi;
    const macd = indicators.macd.histogram;
    const bbPosition = (coinData.current_price - indicators.bollinger_bands.lower) / 
                       (indicators.bollinger_bands.upper - indicators.bollinger_bands.lower);
    
    let decision = 'Hold';
    let confidence = 50;
    
    if (rsi < 30 && macd > 0 && bbPosition < 0.3) {
        decision = 'Buy';
        confidence = 75;
    } else if (rsi > 70 && macd < 0 && bbPosition > 0.7) {
        decision = 'Sell';
        confidence = 75;
    }
    
    const price = coinData.current_price;
    return {
        decision,
        pump_probability: decision === 'Buy' ? 0.7 : 0.3,
        dump_probability: decision === 'Sell' ? 0.7 : 0.3,
        next_5min_trend: decision === 'Buy' ? 'Up' : decision === 'Sell' ? 'Down' : 'Sideways',
        confidence,
        entry_price: price,
        exit_price: decision === 'Buy' ? price * 1.02 : price * 0.98,
        stoploss: decision === 'Buy' ? price * 0.99 : price * 1.01,
        take_profit: decision === 'Buy' ? price * 1.03 : price * 0.97,
        explanation: `Heuristic model based on RSI(${rsi.toFixed(1)}) and MACD`
    };
}

// ===== PYTHON INDICATOR CALCULATION =====
async function calculateIndicators(prices, volumes) {
    if (!STATE.pyodide) throw new Error('Pyodide not loaded');
    
    const pyodide = STATE.pyodide;
    const data = { prices, volumes };
    
    await pyodide.globals.set('input_data', data);
    const result = await pyodide.runPythonAsync(`analyze_all(input_data)`);
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
}

function renderCoinCard(coin) {
    const card = document.createElement('div');
    card.className = 'coin-card glass';
    card.dataset.coinId = coin.id;
    
    const priceChange1h = coin.price_change_percentage_1h_in_currency || 0;
    const priceChange24h = coin.price_change_percentage_24h || 0;
    const changeClass = priceChange1h > 0 ? 'price-up' : 'price-down';
    
    card.innerHTML = `
        <div class="coin-header">
            <img class="coin-icon" src="${coin.image}" alt="${coin.name}" onerror="this.src='data:image/svg+xml,<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 24 24\"><circle cx=\"12\" cy=\"12\" r=\"10\" fill=\"%23${Math.floor(Math.random()*16777215).toString(16)}\"/></svg>'">
            <div>
                <div class="coin-name">${coin.name}</div>
                <div class="coin-symbol">${coin.symbol.toUpperCase()}</div>
            </div>
        </div>
        <div class="price ${changeClass}">$${coin.current_price.toLocaleString()}</div>
        <div class="price-change ${changeClass}">1h: ${priceChange1h.toFixed(2)}% | 24h: ${priceChange24h.toFixed(2)}%</div>
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
            <div class="stat">
                <span>ATH</span>
                <span class="stat-value">$${coin.ath.toLocaleString()}</span>
            </div>
        </div>
    `;
    
    card.addEventListener('click', () => {
        STATE.currentCoin = coin.id;
        updateChart(coin.id);
        generateSignal(coin);
    });
    
    return card;
}

function updateSignals() {
    const fragment = document.createDocumentFragment();
    DOM.signalsPanel.innerHTML = '<h2>AI Scalping Signals</h2><div id="signalDisplay" class="signal-display"></div>';
    
    STATE.signals.forEach((signal, coinId) => {
        const card = document.createElement('div');
        card.className = 'signal-card';
        
        const strength = Math.max(signal.pump_probability, signal.dump_probability);
        const strengthColor = signal.decision === 'Buy' ? 'var(--success)' : signal.decision === 'Sell' ? 'var(--danger)' : 'var(--warning)';
        
        card.innerHTML = `
            <div class="signal-decision ${signal.decision}">${signal.symbol}: ${signal.decision}</div>
            <div class="signal-confidence">Confidence: ${signal.confidence}%</div>
            <div class="signal-meter">
                <div class="signal-meter-fill" style="width: ${strength * 100}%; background: ${strengthColor}"></div>
            </div>
            <div style="font-size: 0.8rem; margin-top: 0.5rem;">
                Entry: $${signal.entry_price.toFixed(2)} | SL: $${signal.stoploss.toFixed(2)} | TP: $${signal.take_profit.toFixed(2)}
            </div>
            <div style="font-size: 0.75rem; color: var(--text-secondary); margin-top: 0.25rem;">
                ${signal.explanation}
            </div>
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

// ===== CHART UPDATE =====
async function updateChart(coinId) {
    if (!STATE.chart) return;
    
    STATE.chart.remove();
    initChart();
    
    const data = await fetchCoinChart(coinId);
    if (!data.length) return;
    
    const candlestickData = data.map((point, i) => {
        const open = i > 0 ? data[i - 1].price : point.price;
        const close = point.price;
        const high = Math.max(open, close) * 1.001;
        const low = Math.min(open, close) * 0.999;
        
        return {
            time: point.time,
            open,
            high,
            low,
            close
        };
    });
    
    const volumeData = data.map(point => ({
        time: point.time,
        value: point.price * 0.001,
        color: 'rgba(59, 130, 246, 0.5)'
    }));
    
    STATE.chart.addCandlestickSeries().setData(candlestickData);
    STATE.chart.addHistogramSeries({
        color: 'rgba(59, 130, 246, 0.5)',
        priceFormat: { type: 'volume' },
        priceScaleId: '',
        scaleMargins: { top: 0.8, bottom: 0 }
    }).setData(volumeData);
}

// ===== UTILITIES =====
function playAlert() {
    const audio = new AudioContext();
    const oscillator = audio.createOscillator();
    const gainNode = audio.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(audio.destination);
    
    oscillator.frequency.setValueAtTime(800, audio.currentTime);
    oscillator.type = 'sine';
    gainNode.gain.setValueAtTime(0.1, audio.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audio.currentTime + 0.5);
    
    oscillator.start(audio.currentTime);
    oscillator.stop(audio.currentTime + 0.5);
}

function showToast(message, type = 'info') {
    DOM.toast.textContent = message;
    DOM.toast.className = `toast ${type} show`;
    setTimeout(() => DOM.toast.classList.remove('show'), 3000);
}

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

// ===== EVENT LISTENERS =====
function setupEventListeners() {
    DOM.themeToggle.addEventListener('click', () => {
        STATE.isDarkMode = !STATE.isDarkMode;
        document.documentElement.setAttribute('data-theme', STATE.isDarkMode ? 'dark' : 'light');
    });
    
    DOM.searchInput.addEventListener('input', debounce((e) => {
        const query = e.target.value.trim();
        if (query.length < 2) {
            DOM.searchResults.style.display = 'none';
            return;
        }
        searchCoins(query);
    }, 300));
    
    // Hide search results on click outside
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

// ===== START APPLICATION =====
init().catch(console.error);
