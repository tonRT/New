"""
Crypto Technical Analysis Module
Pure Python functions for indicator calculations
Runs in-browser via Pyodide
"""

import math
import statistics
import json

def calculate_sma(prices, period=20):
    """Simple Moving Average"""
    if len(prices) < period:
        return prices[-1] if prices else 0
    return sum(prices[-period:]) / period

def calculate_ema(prices, period=20):
    """Exponential Moving Average"""
    if len(prices) < period:
        return prices[-1] if prices else 0
    
    multiplier = 2 / (period + 1)
    ema = prices[0]
    
    for price in prices[1:]:
        ema = (price - ema) * multiplier + ema
    
    return ema

def calculate_rsi(prices, period=14):
    """Relative Strength Index"""
    if len(prices) < period + 1:
        return 50
    
    gains = []
    losses = []
    
    for i in range(1, len(prices)):
        change = prices[i] - prices[i-1]
        if change > 0:
            gains.append(change)
            losses.append(0)
        else:
            gains.append(0)
            losses.append(abs(change))
    
    avg_gain = sum(gains[-period:]) / period
    avg_loss = sum(losses[-period:]) / period
    
    if avg_loss == 0:
        return 100
    
    rs = avg_gain / avg_loss
    rsi = 100 - (100 / (1 + rs))
    
    return rsi

def calculate_macd(prices):
    """MACD Line and Signal Line"""
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
    """Bollinger Bands"""
    if len(prices) < period:
        return {"upper": prices[-1], "middle": prices[-1], "lower": prices[-1]}
    
    sma = calculate_sma(prices, period)
    variance = sum((p - sma) ** 2 for p in prices[-period:]) / period
    std = math.sqrt(variance)
    
    return {
        "upper": sma + (std * std_dev),
        "middle": sma,
        "lower": sma - (std * std_dev)
    }

def calculate_vwap(prices, volumes):
    """Volume Weighted Average Price"""
    if not volumes or len(prices) != len(volumes):
        return prices[-1] if prices else 0
    
    cumulative_pv = sum(p * v for p, v in zip(prices, volumes))
    cumulative_v = sum(volumes)
    
    return cumulative_pv / cumulative_v if cumulative_v > 0 else prices[-1]

def calculate_stoch_rsi(prices, rsi_period=14, stoch_period=14):
    """Stochastic RSI"""
    rsi_values = []
    
    for i in range(len(prices)):
        window = prices[max(0, i - rsi_period + 1):i + 1]
        if len(window) < 2:
            continue
        rsi = calculate_rsi(window, rsi_period)
        rsi_values.append(rsi)
    
    if len(rsi_values) < stoch_period:
        return 50
    
    current_rsi = rsi_values[-1]
    rsi_min = min(rsi_values[-stoch_period:])
    rsi_max = max(rsi_values[-stoch_period:])
    
    if rsi_max == rsi_min:
        return 0
    
    return ((current_rsi - rsi_min) / (rsi_max - rsi_min)) * 100

def detect_support_resistance(prices, window=20):
    """Simple Support/Resistance detection"""
    if len(prices) < window:
        return {"support": prices[-1], "resistance": prices[-1]}
    
    recent_prices = prices[-window:]
    return {
        "support": min(recent_prices),
        "resistance": max(recent_prices)
    }

def generate_trade_plan(indicators, current_price):
    """Generate entry/exit/stoploss based on indicators"""
    rsi = indicators["rsi"]
    bb = indicators["bollinger_bands"]
    macd = indicators["macd"]["histogram"]
    
    decision = "Hold"
    entry = current_price
    stoploss = current_price * 0.98
    take_profit = current_price * 1.02
    risk_level = "Medium"
    
    if rsi < 30 and current_price < bb["lower"]:
        decision = "Buy"
        entry = current_price
        stoploss = bb["lower"] * 0.99
        take_profit = bb["middle"]
        risk_level = "Low"
    elif rsi > 70 and current_price > bb["upper"]:
        decision = "Sell"
        entry = current_price
        stoploss = bb["upper"] * 1.01
        take_profit = bb["middle"]
        risk_level = "Low"
    
    return {
        "decision": decision,
        "entry_price": entry,
        "exit_price": take_profit,
        "stoploss": stoploss,
        "take_profit": take_profit,
        "risk_level": risk_level
    }

def analyze_all(data):
    """Main analysis function called from JavaScript"""
    prices = data["prices"]
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
        "stoch_rsi": calculate_stoch_rsi(prices),
        "support_resistance": detect_support_resistance(prices)
    }
    
    current_price = prices[-1]
    trade_plan = generate_trade_plan(indicators, current_price)
    
    return {**indicators, **trade_plan}
