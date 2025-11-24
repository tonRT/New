#!/usr/bin/env python3
"""
Crypto Analysis Script
Performs technical analysis and generates AI insights for cryptocurrencies
"""

import json
import requests
import numpy as np
import pandas as pd
from datetime import datetime, timedelta
import sys

class CryptoAnalyzer:
    def __init__(self):
        self.base_url = "https://api.coingecko.com/api/v3"
        
    def fetch_coin_data(self, coin_id, days=7):
        """Fetch historical data for a coin"""
        try:
            url = f"{self.base_url}/coins/{coin_id}/market_chart"
            params = {
                'vs_currency': 'usd',
                'days': days,
                'interval': 'hourly'
            }
            
            response = requests.get(url, timeout=10)
            response.raise_for_status()
            return response.json()
        except Exception as e:
            print(f"Error fetching data for {coin_id}: {e}")
            return None
    
    def calculate_technical_indicators(self, prices):
        """Calculate technical indicators from price data"""
        if len(prices) < 14:  # Need enough data for indicators
            return {}
        
        df = pd.DataFrame(prices, columns=['timestamp', 'price'])
        df['timestamp'] = pd.to_datetime(df['timestamp'], unit='ms')
        df.set_index('timestamp', inplace=True)
        
        # Simple Moving Averages
        df['sma_7'] = df['price'].rolling(window=7).mean()
        df['sma_25'] = df['price'].rolling(window=25).mean()
        
        # RSI
        df['price_diff'] = df['price'].diff()
        df['gain'] = np.where(df['price_diff'] > 0, df['price_diff'], 0)
        df['loss'] = np.where(df['price_diff'] < 0, -df['price_diff'], 0)
        
        avg_gain = df['gain'].rolling(window=14).mean()
        avg_loss = df['loss'].rolling(window=14).mean()
        
        rs = avg_gain / avg_loss
        df['rsi'] = 100 - (100 / (1 + rs))
        
        # MACD
        exp1 = df['price'].ewm(span=12).mean()
        exp2 = df['price'].ewm(span=26).mean()
        df['macd'] = exp1 - exp2
        df['macd_signal'] = df['macd'].ewm(span=9).mean()
        df['macd_histogram'] = df['macd'] - df['macd_signal']
        
        # Volatility
        df['returns'] = df['price'].pct_change()
        df['volatility'] = df['returns'].rolling(window=24).std() * np.sqrt(24) * 100
        
        # Get latest values
        latest = df.iloc[-1]
        
        return {
            'current_price': latest['price'],
            'sma_7': latest['sma_7'],
            'sma_25': latest['sma_25'],
            'rsi': latest['rsi'],
            'macd': latest['macd'],
            'macd_signal': latest['macd_signal'],
            'volatility': latest['volatility'],
            'trend': 'bullish' if latest['sma_7'] > latest['sma_25'] else 'bearish'
        }
    
    def analyze_sentiment(self, indicators, price_change_24h, volume):
        """Generate AI-like sentiment analysis based on technical indicators"""
        
        # Risk scoring
        pump_risk = 0
        dump_risk = 0
        
        # RSI-based signals
        if indicators['rsi'] > 70:
            pump_risk += 30
        elif indicators['rsi'] < 30:
            dump_risk += 30
        
        # MACD signals
        if indicators['macd'] > indicators['macd_signal']:
            pump_risk += 20
        else:
            dump_risk += 20
        
        # Price momentum
        if price_change_24h > 10:
            pump_risk += 25
        elif price_change_24h < -10:
            dump_risk += 25
        
        # Volatility adjustment
        if indicators['volatility'] > 15:
            pump_risk += 15
            dump_risk += 15
        
        # Volume consideration (simplified)
        if volume > 1000000000:  # High volume
            if price_change_24h > 0:
                pump_risk += 10
            else:
                dump_risk += 10
        
        # Cap risks at 100
        pump_risk = min(pump_risk, 100)
        dump_risk = min(dump_risk, 100)
        
        return {
            'pump_risk': int(pump_risk),
            'dump_risk': int(dump_risk),
            'sentiment': self.get_sentiment_text(pump_risk, dump_risk, indicators['trend']),
            'next_hour_prediction': self.generate_prediction(indicators, price_change_24h)
        }
    
    def get_sentiment_text(self, pump_risk, dump_risk, trend):
        """Generate human-readable sentiment analysis"""
        if pump_risk > 70:
            return "🚨 HIGH PUMP RISK - Strong upward momentum detected"
        elif dump_risk > 70:
            return "📉 HIGH DUMP RISK - Significant downward pressure"
        elif trend == 'bullish' and pump_risk > dump_risk:
            return "📈 BULLISH - Positive momentum with moderate risk"
        elif trend == 'bearish' and dump_risk > pump_risk:
            return "📉 BEARISH - Negative momentum with caution advised"
        else:
            return "⚡ NEUTRAL - Market consolidating, watch for breakout"
    
    def generate_prediction(self, indicators, price_change_24h):
        """Generate next hour price prediction"""
        rsi = indicators['rsi']
        macd_signal = indicators['macd'] - indicators['macd_signal']
        trend = indicators['trend']
        
        if rsi < 30 and macd_signal > 0:
            confidence = "HIGH"
            direction = "UP"
            reason = "Oversold with bullish MACD crossover"
        elif rsi > 70 and macd_signal < 0:
            confidence = "HIGH"
            direction = "DOWN"
            reason = "Overbought with bearish MACD crossover"
        elif trend == 'bullish' and price_change_24h > 0:
            confidence = "MEDIUM"
            direction = "UP"
            reason = "Bullish trend continuation"
        elif trend == 'bearish' and price_change_24h < 0:
            confidence = "MEDIUM"
            direction = "DOWN"
            reason = "Bearish trend continuation"
        else:
            confidence = "LOW"
            direction = "SIDEWAYS"
            reason = "Mixed signals, consolidation likely"
        
        return {
            'direction': direction,
            'confidence': confidence,
            'reason': reason,
            'expected_move': f"0.5-2%"  # Simplified estimate
        }
    
    def analyze_coin(self, coin_id, price_change_24h, volume):
        """Main analysis function for a coin"""
        print(f"Analyzing {coin_id}...")
        
        # Fetch historical data
        data = self.fetch_coin_data(coin_id)
        if not data:
            return None
        
        prices = data['prices']
        
        # Calculate technical indicators
        indicators = self.calculate_technical_indicators(prices)
        if not indicators:
            return None
        
        # Generate sentiment analysis
        sentiment = self.analyze_sentiment(indicators, price_change_24h, volume)
        
        # Compile full analysis
        analysis = {
            'coin_id': coin_id,
            'timestamp': datetime.now().isoformat(),
            'technical_indicators': indicators,
            'sentiment_analysis': sentiment,
            'summary': self.generate_summary(indicators, sentiment)
        }
        
        return analysis
    
    def generate_summary(self, indicators, sentiment):
        """Generate a comprehensive summary"""
        return f"""
Technical Overview:
- RSI: {indicators['rsi']:.1f} ({'Overbought' if indicators['rsi'] > 70 else 'Oversold' if indicators['rsi'] < 30 else 'Neutral'})
- Trend: {indicators['trend'].upper()}
- Volatility: {indicators['volatility']:.1f}%

Risk Assessment:
- Pump Risk: {sentiment['pump_risk']}% ({'High' if sentiment['pump_risk'] > 70 else 'Medium' if sentiment['pump_risk'] > 30 else 'Low'})
- Dump Risk: {sentiment['dump_risk']}% ({'High' if sentiment['dump_risk'] > 70 else 'Medium' if sentiment['dump_risk'] > 30 else 'Low'})

Prediction:
- Next Hour: {sentiment['next_hour_prediction']['direction']} with {sentiment['next_hour_prediction']['confidence']} confidence
- Reason: {sentiment['next_hour_prediction']['reason']}
        """.strip()
    
    def save_analysis(self, analysis, filename=None):
        """Save analysis to JSON file"""
        if not filename:
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            filename = f"crypto_analysis_{timestamp}.json"
        
        with open(filename, 'w') as f:
            json.dump(analysis, f, indent=2)
        
        print(f"Analysis saved to {filename}")
        return filename

def main():
    """Main function for command line usage"""
    analyzer = CryptoAnalyzer()
    
    if len(sys.argv) > 1:
        coin_id = sys.argv[1]
        price_change = float(sys.argv[2]) if len(sys.argv) > 2 else 0
        volume = float(sys.argv[3]) if len(sys.argv) > 3 else 0
    else:
        # Default analysis for Bitcoin
        coin_id = "bitcoin"
        price_change = 0
        volume = 0
    
    print(f"Starting analysis for {coin_id}...")
    
    analysis = analyzer.analyze_coin(coin_id, price_change, volume)
    
    if analysis:
        print("\n" + "="*50)
        print(f"ANALYSIS REPORT: {coin_id.upper()}")
        print("="*50)
        print(analysis['summary'])
        print("\nFull analysis saved to JSON file.")
        
        # Save to file
        filename = analyzer.save_analysis(analysis)
        
        return analysis
    else:
        print(f"Failed to analyze {coin_id}")
        return None

if __name__ == "__main__":
    main()
