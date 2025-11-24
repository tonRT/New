import json
import math
import statistics
from typing import Dict, List, Any

def calculate_rsi(prices: List[float], period: int = 14) -> float:
    """Calculate Relative Strength Index"""
    if len(prices) < period + 1:
        return 50.0
    
    gains = []
    losses = []
    
    for i in range(1, len(prices)):
        change = prices[i] - prices[i-1]
        if change > 0:
            gains.append(change)
            losses.append(0.0)
        else:
            gains.append(0.0)
            losses.append(abs(change))
    
    avg_gain = statistics.mean(gains[-period:]) if gains else 0
    avg_loss = statistics.mean(losses[-period:]) if losses else 0
    
    if avg_loss == 0:
        return 100.0
    
    rs = avg_gain / avg_loss
    rsi = 100 - (100 / (1 + rs))
    
    return rsi

def calculate_sma(prices: List[float], period: int) -> float:
    """Calculate Simple Moving Average"""
    if len(prices) < period:
        return prices[-1] if prices else 0
    return statistics.mean(prices[-period:])

def calculate_ema(prices: List[float], period: int) -> float:
    """Calculate Exponential Moving Average"""
    if len(prices) < period:
        return prices[-1] if prices else 0
    
    multiplier = 2 / (period + 1)
    ema = prices[0]
    
    for price in prices[1:]:
        ema = (price - ema) * multiplier + ema
    
    return ema

def calculate_macd(prices: List[float]) -> Dict[str, float]:
    """Calculate MACD (Moving Average Convergence Divergence)"""
    ema_12 = calculate_ema(prices, 12)
    ema_26 = calculate_ema(prices, 26)
    macd_line = ema_12 - ema_26
    signal_line = calculate_ema([macd_line] * 9, 9)  # Simplified signal line
    histogram = macd_line - signal_line
    
    return {
        'macd': macd_line,
        'signal': signal_line,
        'histogram': histogram
    }

def calculate_bollinger_bands(prices: List[float], period: int = 20) -> Dict[str, float]:
    """Calculate Bollinger Bands"""
    if len(prices) < period:
        current_price = prices[-1] if prices else 0
        return {
            'upper': current_price * 1.1,
            'middle': current_price,
            'lower': current_price * 0.9
        }
    
    sma = calculate_sma(prices, period)
    std_dev = statistics.stdev(prices[-period:])
    
    return {
        'upper': sma + (std_dev * 2),
        'middle': sma,
        'lower': sma - (std_dev * 2)
    }

def calculate_stochastic_rsi(rsi_values: List[float], period: int = 14) -> float:
    """Calculate Stochastic RSI"""
    if len(rsi_values) < period:
        return 50.0
    
    current_rsi = rsi_values[-1]
    min_rsi = min(rsi_values[-period:])
    max_rsi = max(rsi_values[-period:])
    
    if max_rsi == min_rsi:
        return 50.0
    
    stoch_rsi = (current_rsi - min_rsi) / (max_rsi - min_rsi) * 100
    return stoch_rsi

def calculate_vwap(high_prices: List[float], low_prices: List[float], close_prices: List[float], volumes: List[float]) -> float:
    """Calculate Volume Weighted Average Price"""
    if not all([high_prices, low_prices, close_prices, volumes]):
        return close_prices[-1] if close_prices else 0
    
    typical_prices = [(h + l + c) / 3 for h, l, c in zip(high_prices, low_prices, close_prices)]
    vwap = sum(tp * v for tp, v in zip(typical_prices, volumes)) / sum(volumes)
    return vwap

def analyze_trend(prices: List[float]) -> str:
    """Analyze price trend"""
    if len(prices) < 5:
        return "SIDEWAYS"
    
    short_term = statistics.mean(prices[-5:])
    medium_term = statistics.mean(prices[-10:]) if len(prices) >= 10 else short_term
    long_term = statistics.mean(prices[-20:]) if len(prices) >= 20 else medium_term
    
    if short_term > medium_term > long_term:
        return "STRONG_UPTREND"
    elif short_term > medium_term:
        return "UPTREND"
    elif short_term < medium_term < long_term:
        return "STRONG_DOWNTREND"
    elif short_term < medium_term:
        return "DOWNTREND"
    else:
        return "SIDEWAYS"

def calculate_support_resistance(prices: List[float]) -> Dict[str, float]:
    """Calculate support and resistance levels"""
    if len(prices) < 10:
        current_price = prices[-1] if prices else 0
        return {
            'support_1': current_price * 0.95,
            'support_2': current_price * 0.90,
            'resistance_1': current_price * 1.05,
            'resistance_2': current_price * 1.10
        }
    
    # Simplified S/R calculation using recent highs and lows
    recent_high = max(prices[-10:])
    recent_low = min(prices[-10:])
    current_price = prices[-1]
    price_range = recent_high - recent_low
    
    return {
        'support_1': recent_low + price_range * 0.2,
        'support_2': recent_low,
        'resistance_1': recent_high - price_range * 0.2,
        'resistance_2': recent_high
    }

def generate_trading_signal(analysis: Dict[str, Any]) -> Dict[str, Any]:
    """Generate trading signal based on technical analysis"""
    rsi = analysis['rsi']
    macd = analysis['macd']
    trend = analysis['trend']
    volatility = analysis['volatility']
    
    # Signal logic
    signal_strength = 0
    signal = "HOLD"
    
    # RSI based signals
    if rsi < 30:
        signal_strength += 3
        signal = "BUY"
    elif rsi > 70:
        signal_strength += 3
        signal = "SELL"
    
    # MACD based signals
    if macd['macd'] > macd['signal']:
        signal_strength += 2
        if signal == "HOLD":
            signal = "BUY"
    else:
        signal_strength += 1
        if signal == "HOLD":
            signal = "SELL"
    
    # Trend based signals
    if "UPTREND" in trend:
        signal_strength += 2
        if signal == "SELL":
            signal = "HOLD"
    elif "DOWNTREND" in trend:
        signal_strength += 2
        if signal == "BUY":
            signal = "HOLD"
    
    # Volatility adjustment
    if volatility == "HIGH":
        signal_strength = max(1, signal_strength - 1)
    
    signal_strength = min(10, signal_strength)
    
    return {
        'signal': signal,
        'signal_strength': signal_strength,
        'confidence': min(95, signal_strength * 10 + 5)
    }

def analyze_crypto(market_data: Dict[str, Any]) -> str:
    """Main analysis function that returns JSON string of analysis results"""
    
    # Simulate price history for demonstration
    # In production, this would use real historical data
    current_price = market_data['current_price']
    price_history = [current_price * (0.95 + i * 0.01) for i in range(50)]
    
    # Calculate indicators
    rsi = calculate_rsi(price_history)
    sma_20 = calculate_sma(price_history, 20)
    ema_12 = calculate_ema(price_history, 12)
    macd = calculate_macd(price_history)
    bollinger = calculate_bollinger_bands(price_history)
    stoch_rsi = calculate_stochastic_rsi([rsi] * 14)  # Simplified
    
    # Calculate trend
    trend = analyze_trend(price_history)
    
    # Calculate volatility
    price_changes = [abs(price_history[i] - price_history[i-1]) for i in range(1, len(price_history))]
    avg_change = statistics.mean(price_changes) if price_changes else 0
    volatility = "HIGH" if avg_change > current_price * 0.02 else "LOW"
    
    # Support and resistance
    sr_levels = calculate_support_resistance(price_history)
    
    # Generate trading signal
    preliminary_analysis = {
        'rsi': rsi,
        'macd': macd,
        'trend': trend,
        'volatility': volatility
    }
    signal_data = generate_trading_signal(preliminary_analysis)
    
    # RSI signal interpretation
    if rsi < 30:
        rsi_signal = "OVERSOLD"
    elif rsi > 70:
        rsi_signal = "OVERBOUGHT"
    else:
        rsi_signal = "NEUTRAL"
    
    # MACD signal interpretation
    if macd['macd'] > macd['signal']:
        macd_signal = "BULLISH"
    else:
        macd_signal = "BEARISH"
    
    # Final analysis result
    analysis_result = {
        'rsi': rsi,
        'rsi_signal': rsi_signal,
        'sma_20': sma_20,
        'ema_12': ema_12,
        'macd': macd['macd'],
        'macd_signal': macd_signal,
        'bollinger_upper': bollinger['upper'],
        'bollinger_lower': bollinger['lower'],
        'stoch_rsi': stoch_rsi,
        'trend': trend,
        'volatility': volatility,
        'support_1': sr_levels['support_1'],
        'support_2': sr_levels['support_2'],
        'resistance_1': sr_levels['resistance_1'],
        'resistance_2': sr_levels['resistance_2'],
        'signal': signal_data['signal'],
        'signal_strength': signal_data['signal_strength'],
        'confidence': signal_data['confidence'],
        'overall_signal': f"{signal_data['signal']} (Strength: {signal_data['signal_strength']}/10)"
    }
    
    return json.dumps(analysis_result)

# Example usage for testing
if __name__ == "__main__":
    sample_data = {
        'current_price': 45000.0,
        'price_change_24h': 1500.0,
        'price_change_percentage_24h': 3.45,
        'market_cap': 850000000000,
        'volume': 25000000000,
        'high_24h': 45500.0,
        'low_24h': 44500.0
    }
    
    result = analyze_crypto(sample_data)
    print("Analysis Result:", result)
