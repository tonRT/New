// Crypto Analytics Dashboard - Main Application
class CryptoDashboard {
    constructor() {
        this.config = {
            coingecko: {
                baseURL: 'https://api.coingecko.com/api/v3',
                endpoints: {
                    markets: '/coins/markets',
                    coin: '/coins/{id}',
                    trending: '/search/trending',
                    global: '/global',
                    history: '/coins/{id}/market_chart'
                }
            },
            news: {
                baseURL: 'https://min-api.cryptocompare.com/data/v2/news/',
                apiKey: 'YOUR_API_KEY' // Note: Get free API key from cryptocompare
            },
            fearGreed: 'https://api.alternative.me/fng/',
            gasFees: 'https://ethgasstation.info/api/ethgasAPI.json'
        };

        this.state = {
            coins: [],
            currentCurrency: 'usd',
            theme: 'dark',
            refreshInterval: null
        };

        this.init();
    }

    async init() {
        this.setupEventListeners();
        this.loadSettings();
        await this.loadInitialData();
        this.startAutoRefresh();
    }

    setupEventListeners() {
        // Theme toggle
        document.getElementById('themeToggle').addEventListener('click', () => this.toggleTheme());

        // Refresh button
        document.getElementById('refreshBtn').addEventListener('click', () => this.refreshData());

        // Navigation
        document.querySelectorAll('.nav-link').forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                this.showPage(link.dataset.page);
            });
        });

        // Search functionality
        const searchInput = document.getElementById('coinSearch');
        searchInput.addEventListener('input', (e) => this.handleSearch(e.target.value));
        searchInput.addEventListener('focus', () => this.showSearchResults());

        // Currency and sort changes
        document.getElementById('currencySelect').addEventListener('change', (e) => {
            this.state.currentCurrency = e.target.value;
            this.refreshCoinData();
        });

        document.getElementById('sortSelect').addEventListener('change', (e) => {
            this.sortCoins(e.target.value);
        });

        // Portfolio calculator
        document.getElementById('calculateBtn').addEventListener('click', () => this.calculatePortfolio());

        // Modal close
        document.querySelector('.close').addEventListener('click', () => this.closeModal());
        window.addEventListener('click', (e) => {
            if (e.target.classList.contains('modal')) {
                this.closeModal();
            }
        });
    }

    loadSettings() {
        const savedTheme = localStorage.getItem('cryptoTheme');
        const savedCurrency = localStorage.getItem('cryptoCurrency');
        
        if (savedTheme) {
            this.state.theme = savedTheme;
            document.documentElement.setAttribute('data-theme', savedTheme);
        }
        
        if (savedCurrency) {
            this.state.currentCurrency = savedCurrency;
            document.getElementById('currencySelect').value = savedCurrency;
        }
    }

    async loadInitialData() {
        this.showLoading(true);
        
        try {
            await Promise.all([
                this.loadMarketData(),
                this.loadFearGreedIndex(),
                this.loadGasFees(),
                this.loadNews()
            ]);
            
            this.showLoading(false);
        } catch (error) {
            console.error('Error loading initial data:', error);
            this.showError('Failed to load market data. Please refresh.');
            this.showLoading(false);
        }
    }

    async loadMarketData() {
        try {
            const response = await fetch(
                `${this.config.coingecko.baseURL}${this.config.coingecko.endpoints.markets}?vs_currency=${this.state.currentCurrency}&order=market_cap_desc&per_page=50&page=1&sparkline=true&price_change_percentage=24h`
            );
            
            if (!response.ok) throw new Error('Market data fetch failed');
            
            const coins = await response.json();
            this.state.coins = coins;
            
            this.updateMarketOverview(coins);
            this.updateTopMovers(coins);
            this.updateCoinsList(coins);
            this.updateMarketChart(coins);
            
        } catch (error) {
            throw new Error(`Market data: ${error.message}`);
        }
    }

    async loadFearGreedIndex() {
        try {
            const response = await fetch(this.config.fearGreed);
            const data = await response.json();
            
            const value = data.data[0].value;
            document.getElementById('fearGreed').textContent = `${value} - ${data.data[0].value_classification}`;
            
            // Update gauge
            const gauge = document.getElementById('fearGreedValue');
            gauge.textContent = value;
            gauge.style.background = this.getFearGreedColor(value);
            
        } catch (error) {
            console.error('Error loading fear & greed index:', error);
        }
    }

    async loadGasFees() {
        try {
            const response = await fetch(this.config.gasFees);
            const data = await response.json();
            
            document.getElementById('slowGas').textContent = `${Math.round(data.safeLow / 10)} Gwei`;
            document.getElementById('standardGas').textContent = `${Math.round(data.average / 10)} Gwei`;
            document.getElementById('fastGas').textContent = `${Math.round(data.fast / 10)} Gwei`;
            
        } catch (error) {
            console.error('Error loading gas fees:', error);
            // Fallback to static values
            document.getElementById('slowGas').textContent = '30 Gwei';
            document.getElementById('standardGas').textContent = '45 Gwei';
            document.getElementById('fastGas').textContent = '60 Gwei';
        }
    }

    async loadNews() {
        try {
            // Using CryptoCompare news API (requires free API key)
            const response = await fetch(`${this.config.news.baseURL}?lang=EN&api_key=${this.config.news.apiKey}`);
            const data = await response.json();
            
            this.updateNewsFeed(data.Data.slice(0, 6));
            
        } catch (error) {
            console.error('Error loading news:', error);
            // Fallback to static news or show message
            document.getElementById('newsFeed').innerHTML = '<p>News feed temporarily unavailable</p>';
        }
    }

    updateMarketOverview(coins) {
        const totalMarketCap = coins.reduce((sum, coin) => sum + coin.market_cap, 0);
        const totalVolume = coins.reduce((sum, coin) => sum + coin.total_volume, 0);
        
        document.getElementById('totalMarketCap').textContent = this.formatCurrency(totalMarketCap);
        document.getElementById('totalVolume').textContent = this.formatCurrency(totalVolume);
    }

    updateTopMovers(coins) {
        const gainers = [...coins].sort((a, b) => 
            (b.price_change_percentage_24h || 0) - (a.price_change_percentage_24h || 0)
        ).slice(0, 5);
        
        const losers = [...coins].sort((a, b) => 
            (a.price_change_percentage_24h || 0) - (b.price_change_percentage_24h || 0)
        ).slice(0, 5);
        
        this.renderCoinList(gainers, 'topGainers');
        this.renderCoinList(losers, 'topLosers');
    }

    updateCoinsList(coins) {
        const container = document.getElementById('coinsList');
        container.innerHTML = coins.map(coin => this.createCoinCard(coin)).join('');
        
        // Add click events to coin cards
        container.querySelectorAll('.coin-card').forEach(card => {
            card.addEventListener('click', () => this.showCoinDetails(card.dataset.coinId));
        });
    }

    updateMarketChart(coins) {
        // Simple implementation - in production, use ApexCharts or similar
        const ctx = document.createElement('canvas');
        document.getElementById('marketChart').innerHTML = '';
        document.getElementById('marketChart').appendChild(ctx);
        
        new Chart(ctx, {
            type: 'line',
            data: {
                labels: coins.slice(0, 10).map(coin => coin.symbol.toUpperCase()),
                datasets: [{
                    label: 'Market Cap (Billions)',
                    data: coins.slice(0, 10).map(coin => coin.market_cap / 1e9),
                    borderColor: '#2563eb',
                    backgroundColor: 'rgba(37, 99, 235, 0.1)',
                    tension: 0.4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: false
                    }
                }
            }
        });
    }

    updateNewsFeed(news) {
        const container = document.getElementById('newsFeed');
        container.innerHTML = news.map(item => `
            <div class="news-card">
                ${item.imageurl ? `<img src="${item.imageurl}" alt="${item.title}" class="news-image">` : ''}
                <div class="news-content">
                    <h3 class="news-title">${item.title}</h3>
                    <p>${item.body.substring(0, 150)}...</p>
                    <div class="news-meta">
                        <span>${new Date(item.published_on * 1000).toLocaleDateString()}</span>
                        <span>${item.source}</span>
                    </div>
                </div>
            </div>
        `).join('');
    }

    createCoinCard(coin) {
        const change = coin.price_change_percentage_24h;
        const changeClass = change >= 0 ? 'change-positive' : 'change-negative';
        const changeSymbol = change >= 0 ? '+' : '';
        
        return `
            <div class="coin-card" data-coin-id="${coin.id}">
                <div class="coin-header">
                    <img src="${coin.image}" alt="${coin.name}" class="coin-icon">
                    <div>
                        <div class="coin-symbol">${coin.symbol.toUpperCase()}</div>
                        <div>${coin.name}</div>
                    </div>
                </div>
                <div class="coin-price">${this.formatCurrency(coin.current_price)}</div>
                <div class="coin-change ${changeClass}">
                    ${changeSymbol}${change ? change.toFixed(2) : '0.00'}%
                </div>
                <div class="coin-volume">${this.formatCurrency(coin.total_volume)}</div>
                <div class="coin-marketcap">${this.formatCurrency(coin.market_cap)}</div>
            </div>
        `;
    }

    renderCoinList(coins, containerId) {
        const container = document.getElementById(containerId);
        container.innerHTML = coins.map(coin => {
            const change = coin.price_change_percentage_24h;
            const changeClass = change >= 0 ? 'change-positive' : 'change-negative';
            const changeSymbol = change >= 0 ? '+' : '';
            
            return `
                <div class="coin-item" data-coin-id="${coin.id}">
                    <div class="coin-info">
                        <img src="${coin.image}" alt="${coin.name}" class="coin-icon">
                        <span class="coin-symbol">${coin.symbol.toUpperCase()}</span>
                    </div>
                    <div class="coin-price">${this.formatCurrency(coin.current_price)}</div>
                    <div class="coin-change ${changeClass}">
                        ${changeSymbol}${change ? change.toFixed(2) : '0.00'}%
                    </div>
                </div>
            `;
        }).join('');
        
        // Add click events
        container.querySelectorAll('.coin-item').forEach(item => {
            item.addEventListener('click', () => this.showCoinDetails(item.dataset.coinId));
        });
    }

    async showCoinDetails(coinId) {
        this.showLoading(true);
        
        try {
            const [coinData, historyData] = await Promise.all([
                this.fetchCoinData(coinId),
                this.fetchCoinHistory(coinId)
            ]);
            
            this.displayCoinModal(coinData, historyData);
            this.showLoading(false);
            
        } catch (error) {
            console.error('Error loading coin details:', error);
            this.showError('Failed to load coin details');
            this.showLoading(false);
        }
    }

    async fetchCoinData(coinId) {
        const response = await fetch(
            `${this.config.coingecko.baseURL}${this.config.coingecko.endpoints.coin.replace('{id}', coinId)}`
        );
        return await response.json();
    }

    async fetchCoinHistory(coinId) {
        const response = await fetch(
            `${this.config.coingecko.baseURL}${this.config.coingecko.endpoints.history.replace('{id}', coinId)}?vs_currency=usd&days=7`
        );
        return await response.json();
    }

    displayCoinModal(coin, history) {
        document.getElementById('modalCoinName').textContent = `${coin.name} (${coin.symbol.toUpperCase()})`;
        
        // Update price chart
        this.updateCoinChart(history);
        
        // Generate AI analysis
        this.generateAIAnalysis(coin, history);
        
        // Show modal
        document.getElementById('coinModal').style.display = 'block';
    }

    updateCoinChart(history) {
        const ctx = document.createElement('canvas');
        document.getElementById('coinPriceChart').innerHTML = '';
        document.getElementById('coinPriceChart').appendChild(ctx);
        
        const prices = history.prices.map(price => price[1]);
        const times = history.prices.map(price => new Date(price[0]).toLocaleDateString());
        
        new Chart(ctx, {
            type: 'line',
            data: {
                labels: times,
                datasets: [{
                    label: 'Price',
                    data: prices,
                    borderColor: '#10b981',
                    backgroundColor: 'rgba(16, 185, 129, 0.1)',
                    tension: 0.4,
                    fill: true
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: false
                    }
                }
            }
        });
    }

    generateAIAnalysis(coin, history) {
        // Simple rule-based AI analysis
        const priceChange24h = coin.market_data.price_change_percentage_24h;
        const volume = coin.market_data.total_volume.usd;
        const marketCap = coin.market_data.market_cap.usd;
        
        // Calculate simple indicators
        const prices = history.prices.map(p => p[1]);
        const volatility = this.calculateVolatility(prices);
        const trend = this.calculateTrend(prices);
        
        // Risk assessment
        const pumpRisk = this.calculatePumpRisk(priceChange24h, volume, volatility);
        const dumpRisk = this.calculateDumpRisk(priceChange24h, volume, volatility);
        
        // Generate analysis text
        const analysis = this.generateAnalysisText(coin, priceChange24h, trend, pumpRisk, dumpRisk);
        
        document.getElementById('aiAnalysis').innerHTML = analysis;
        document.getElementById('pumpRisk').style.width = `${pumpRisk}%`;
        document.getElementById('dumpRisk').style.width = `${dumpRisk}%`;
        
        // Color coding for risks
        document.getElementById('pumpRisk').style.background = this.getRiskColor(pumpRisk);
        document.getElementById('dumpRisk').style.background = this.getRiskColor(dumpRisk);
    }

    calculateVolatility(prices) {
        const returns = [];
        for (let i = 1; i < prices.length; i++) {
            returns.push((prices[i] - prices[i-1]) / prices[i-1]);
        }
        const avgReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
        const variance = returns.reduce((a, b) => a + Math.pow(b - avgReturn, 2), 0) / returns.length;
        return Math.sqrt(variance) * 100;
    }

    calculateTrend(prices) {
        if (prices.length < 2) return 'neutral';
        const first = prices[0];
        const last = prices[prices.length - 1];
        const change = ((last - first) / first) * 100;
        
        if (change > 5) return 'bullish';
        if (change < -5) return 'bearish';
        return 'neutral';
    }

    calculatePumpRisk(priceChange, volume, volatility) {
        let risk = 0;
        if (priceChange > 20) risk += 40;
        if (priceChange > 50) risk += 30;
        if (volatility > 10) risk += 20;
        if (volume > 1e9) risk += 10;
        return Math.min(risk, 100);
    }

    calculateDumpRisk(priceChange, volume, volatility) {
        let risk = 0;
        if (priceChange < -10) risk += 40;
        if (priceChange < -30) risk += 30;
        if (volatility > 15) risk += 20;
        if (volume < 1e6) risk += 10;
        return Math.min(risk, 100);
    }

    generateAnalysisText(coin, priceChange, trend, pumpRisk, dumpRisk) {
        const symbol = coin.symbol.toUpperCase();
        
        let summary = '';
        let prediction = '';
        let recommendation = '';
        
        if (trend === 'bullish' && priceChange > 10) {
            summary = `🚀 ${symbol} is showing strong bullish momentum with significant price appreciation.`;
            prediction = 'Next 1 hour: Likely continuation of upward trend';
            recommendation = pumpRisk > 50 ? 'Consider taking profits' : 'Hold with stop-loss';
        } else if (trend === 'bearish' && priceChange < -10) {
            summary = `📉 ${symbol} is under selling pressure with notable price decline.`;
            prediction = 'Next 1 hour: Potential further downside';
            recommendation = dumpRisk > 50 ? 'Avoid new positions' : 'Wait for stabilization';
        } else {
            summary = `⚡ ${symbol} is consolidating within a range.`;
            prediction = 'Next 1 hour: Sideways movement expected';
            recommendation = 'Monitor for breakout direction';
        }
        
        return `
            <div class="analysis-summary">
                <h4>Market Analysis</h4>
                <p>${summary}</p>
                <p><strong>Trend:</strong> ${trend.toUpperCase()}</p>
                <p><strong>Prediction:</strong> ${prediction}</p>
                <p><strong>Recommendation:</strong> ${recommendation}</p>
            </div>
            <div class="risk-assessment">
                <h4>Risk Assessment</h4>
                <p>Pump Risk: ${pumpRisk}% - ${this.getRiskLevel(pumpRisk)}</p>
                <p>Dump Risk: ${dumpRisk}% - ${this.getRiskLevel(dumpRisk)}</p>
            </div>
        `;
    }

    getRiskLevel(risk) {
        if (risk < 30) return 'Low';
        if (risk < 70) return 'Medium';
        return 'High';
    }

    getRiskColor(risk) {
        if (risk < 30) return '#10b981';
        if (risk < 70) return '#f59e0b';
        return '#ef4444';
    }

    getFearGreedColor(value) {
        if (value < 25) return '#ef4444';
        if (value < 50) return '#f59e0b';
        if (value < 75) return '#10b981';
        return '#2563eb';
    }

    async handleSearch(query) {
        if (query.length < 2) {
            document.getElementById('searchResults').style.display = 'none';
            return;
        }

        try {
            const response = await fetch(
                `${this.config.coingecko.baseURL}/search?query=${query}`
            );
            const data = await response.json();
            
            this.showSearchResults(data.coins.slice(0, 5));
        } catch (error) {
            console.error('Search error:', error);
        }
    }

    showSearchResults(coins) {
        const container = document.getElementById('searchResults');
        
        if (coins.length === 0) {
            container.innerHTML = '<div class="search-result-item">No results found</div>';
        } else {
            container.innerHTML = coins.map(coin => `
                <div class="search-result-item" data-coin-id="${coin.id}">
                    <img src="${coin.thumb}" alt="${coin.name}">
                    <span>${coin.name} (${coin.symbol})</span>
                </div>
            `).join('');
            
            // Add click events
            container.querySelectorAll('.search-result-item').forEach(item => {
                item.addEventListener('click', () => {
                    this.showCoinDetails(item.dataset.coinId);
                    container.style.display = 'none';
                    document.getElementById('coinSearch').value = '';
                });
            });
        }
        
        container.style.display = 'block';
    }

    showPage(pageId) {
        // Update navigation
        document.querySelectorAll('.nav-link').forEach(link => {
            link.classList.remove('active');
        });
        document.querySelector(`[data-page="${pageId}"]`).classList.add('active');
        
        // Show page
        document.querySelectorAll('.page').forEach(page => {
            page.classList.remove('active');
        });
        document.getElementById(pageId).classList.add('active');
    }

    toggleTheme() {
        this.state.theme = this.state.theme === 'dark' ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', this.state.theme);
        localStorage.setItem('cryptoTheme', this.state.theme);
        
        // Update theme button icon
        const icon = document.querySelector('#themeToggle i');
        icon.className = this.state.theme === 'dark' ? 'fas fa-moon' : 'fas fa-sun';
    }

    async refreshData() {
        this.showLoading(true);
        await this.loadInitialData();
        this.showLoading(false);
    }

    startAutoRefresh() {
        // Refresh data every 15 seconds
        this.state.refreshInterval = setInterval(() => {
            this.refreshData();
        }, 15000);
    }

    calculatePortfolio() {
        const amount = parseFloat(document.getElementById('calcAmount').value);
        const coin = document.getElementById('calcCoin').value;
        
        if (!amount || amount <= 0) {
            alert('Please enter a valid amount');
            return;
        }
        
        const coinData = this.state.coins.find(c => c.id === coin);
        if (!coinData) {
            alert('Coin data not available');
            return;
        }
        
        const coinAmount = amount / coinData.current_price;
        const potentialGain = coinAmount * coinData.current_price * 1.1; // 10% gain
        
        document.getElementById('calcResult').innerHTML = `
            <p>You would get: <strong>${coinAmount.toFixed(6)} ${coinData.symbol.toUpperCase()}</strong></p>
            <p>Potential value at 10% gain: <strong>${this.formatCurrency(potentialGain)}</strong></p>
            <p>24h change: <span class="${coinData.price_change_percentage_24h >= 0 ? 'change-positive' : 'change-negative'}">
                ${coinData.price_change_percentage_24h >= 0 ? '+' : ''}${coinData.price_change_percentage_24h.toFixed(2)}%
            </span></p>
        `;
    }

    sortCoins(criteria) {
        const sortedCoins = [...this.state.coins].sort((a, b) => {
            switch(criteria) {
                case 'volume':
                    return b.total_volume - a.total_volume;
                case 'price_change_24h':
                    return (b.price_change_percentage_24h || 0) - (a.price_change_percentage_24h || 0);
                default: // market_cap
                    return b.market_cap - a.market_cap;
            }
        });
        
        this.updateCoinsList(sortedCoins);
    }

    refreshCoinData() {
        localStorage.setItem('cryptoCurrency', this.state.currentCurrency);
        this.loadMarketData();
    }

    closeModal() {
        document.getElementById('coinModal').style.display = 'none';
    }

    showLoading(show) {
        document.getElementById('loadingOverlay').style.display = show ? 'block' : 'none';
    }

    showError(message) {
        // Simple error notification
        const errorDiv = document.createElement('div');
        errorDiv.style.cssText = `
            position: fixed;
            top: 100px;
            right: 20px;
            background: #ef4444;
            color: white;
            padding: 1rem;
            border-radius: 8px;
            z-index: 4000;
        `;
        errorDiv.textContent = message;
        document.body.appendChild(errorDiv);
        
        setTimeout(() => {
            document.body.removeChild(errorDiv);
        }, 5000);
    }

    formatCurrency(value) {
        if (value >= 1e9) {
            return '$' + (value / 1e9).toFixed(2) + 'B';
        }
        if (value >= 1e6) {
            return '$' + (value / 1e6).toFixed(2) + 'M';
        }
        if (value >= 1e3) {
            return '$' + (value / 1e3).toFixed(2) + 'K';
        }
        return '$' + value.toFixed(2);
    }
}

// Initialize application when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new CryptoDashboard();
});

// Export for potential module usage
if (typeof module !== 'undefined' && module.exports) {
    module.exports = CryptoDashboard;
}
