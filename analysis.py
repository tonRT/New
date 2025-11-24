"""
Crypto Indicators for Mobile
Pure Python - Zero Dependencies
"""

import math

def calculate_sma(prices, period=14):
    if len(prices) < period: return prices[-1] if prices else 0
    return sum(prices[-period:]) / period

def calculate_ema(prices, period=14):
    if len(prices) < period: return prices[-1] if prices else 0
    multiplier = 2 / (period + 1)
    ema = prices[0]
    for p in prices[1:]: ema = (p - ema) * multiplier + ema
    return ema

def calculate_rsi(prices, period=14):
    if len(prices) < period + 1: return 50
    gains = losses = 0
    for i in range(1, period + 1):
        change = prices[-i] - prices[-i - 1]
        if change > 0: gains += change
        else: losses -= change
    avg_gain = gains / period
    avg_loss = losses / period
    if avg_loss == 0: return 100
    rs = avg_gain / avg_loss
    return 100 - (100 / (1 + rs))

def calculate_macd(prices):
    ema12 = calculate_ema(prices, 12)
    ema26 = calculate_ema(prices, 26)
    macd = ema12 - ema26
    signal = calculate_ema([macd], 9)
    return {"macd_line": macd, "signal_line": signal, "histogram": macd - signal}

def calculate_bollinger(prices, period=20):
    if len(prices) < period: return {"upper": prices[-1], "middle": prices[-1], "lower": prices[-1]}
    sma = calculate_sma(prices, period)
    variance = sum((p - sma) ** 2 for p in prices[-period:]) / period
    std = math.sqrt(variance)
    return {"upper": sma + 2 * std, "middle": sma, "lower": sma - 2 * std}

def analyze_all(data):
    prices = data.get("prices", [])
    if not prices: return {}
    
    indicators = {
        "sma_14": calculate_sma(prices, 14),
        "ema_14": calculate_ema(prices, 14),
        "rsi": calculate_rsi(prices),
        "macd": calculate_macd(prices),
        "bollinger_bands": calculate_bollinger(prices)
    }
    
    price = prices[-1]
    rsi = indicators["rsi"]
    bb = indicators["bollinger_bands"]
    
    decision = "Hold"
    if rsi < 30 and price < bb["lower"]: decision = "Buy"
    elif rsi > 70 and price > bb["upper"]: decision = "Sell"
    
    return {
        **indicators,
        "decision": decision,
        "confidence": 75 if decision != "Hold" else 50,
        "entry": price,
        "stoploss": price * 0.99,
        "take_profit": price * (1.02 if decision == "Buy" else 0.98)
    }
