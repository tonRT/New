"""
Crypto Technical Analysis Engine
Optimized for Pyodide WebAssembly
Zero dependencies, pure Python
"""

import math
import json

def calculate_sma(prices, period=20):
    """Simple Moving Average - O(n)"""
    if len(prices) < period:
        return prices[-1] if prices else 0
    return sum(prices[-period:]) / period

def calculate_ema(prices, period=20):
    """Exponential Moving Average - O(n)"""
    if len(prices) < period:
        return prices[-1] if prices else 0
    
    multiplier = 2 / (period + 1)
    ema = prices[0]
    
    for price in prices[1:]:
        ema = (price - ema) * multiplier + ema
    
    return ema

def calculate_rsi(prices, period=14):
    """Relative Strength Index - O(n)"""
    if len(prices) < period + 1:
        return 50
    
    gains = []
    losses = []
    
    for i in range(1, len(prices)):
        change = prices[i] - prices[i-1]
        gains.append(max(change, 0))
        losses.append(max(-change, 0))
    
    avg_gain = sum(gains[-period:]) / period
    avg_loss = sum(losses[-period:]) / period
    
    if avg_loss == 0:
        return 100
    
    rs = avg_gain / avg_loss
    return 100 - (100 / (1 + rs))

def calculate_macd(prices):
    """MACD - O(n)"""
    ema12 = calculate_ema(prices, 12)
    ema26 = calculate_ema(prices, 26)
    macd_line = ema12 - ema26
    signal_line = calculate_ema([macd_line], 9)
    
    return {
        "macd_line": macd_line,
        "signal_line": signal_line,
        "histogram": macd_line - signal_line
    }

def calculate_bollinger_bands(prices, period=20, std_dev=2):
    """Bollinger Bands - O(n)"""
    if len(prices) < period:
        price = prices[-1] if prices else 0
        return {"upper": price, "middle": price, "lower": price}
    
    sma = calculate_sma(prices, period)
    variance = sum((p - sma) ** 2 for p in prices[-period:]) / period
    std = math.sqrt(variance)
    
    return {
        "upper": sma + (std * std_dev),
        "middle": sma,
        "lower": sma - (std * std_dev)
    }

def calculate_vwap(prices, volumes):
    """Volume Weighted Average Price - O(n)"""
    if not volumes or len(prices) != len(volumes) or sum(volumes) == 0:
        return prices[-1] if prices else 0
    
    return sum(p * v for p, v in zip(prices, volumes)) / sum(volumes)

def detect_support_resistance(prices, window=20):
    """Simplified S/R detection - O(n)"""
    if len(prices) < window:
        price = prices[-1] if prices else 0
        return {"support": price, "resistance": price}
    
    recent = prices[-window:]
    return {
        "support": min(recent),
        "resistance": max(recent)
    }

def generate_trade_plan(indicators, current_price):
    """Generate trading plan - O(1)"""
    rsi = indicators["rsi"]
    bb = indicators["bollinger_bands"]
    
    decision = "Hold"
    risk = "Medium"
    
    if rsi < 30 and current_price < bb["lower"]:
        decision = "Buy"
        risk = "Low"
    elif rsi > 70 and current_price > bb["upper"]:
        decision = "Sell"
        risk = "Low"
    
    return {
        "decision": decision,
        "entry_price": current_price,
        "stoploss": current_price * 0.99,
        "take_profit": current_price * (1.02 if decision == "Buy" else 0.98),
        "risk_level": risk
    }

def analyze_all(data):
    """Main analysis function - O(n) total"""
    prices = data.get("prices", [])
    volumes = data.get("volumes", [])
    
    if not prices:
        return {}
    
    indicators = {
        "sma_20": calculate_sma(prices, 20),
        "ema_20": calculate_ema(prices, 20),
        "rsi": calculate_rsi(prices),
        "macd": calculate_macd(prices),
        "bollinger_bands": calculate_bollinger_bands(prices),
        "vwap": calculate_vwap(prices, volumes),
        "support_resistance": detect_support_resistance(prices)
    }
    
    current_price = prices[-1]
    trade_plan = generate_trade_plan(indicators, current_price)
    
    return {**indicators, **trade_plan}
