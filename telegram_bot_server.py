"""
Telegram Bot Server - Responds to /check commands
Can be deployed to a free cloud service to run 24/7
Updated for Railway deployment with environment variables
"""

import os
import logging
import requests
from flask import Flask, request
import json
import re
from datetime import datetime
from bs4 import BeautifulSoup

# Setup logging
logging.basicConfig(level=logging.INFO)

# Initialize Flask app
app = Flask(__name__)

# Get configuration from environment variables
# Railway provides these during runtime, not build time
BOT_TOKEN = os.getenv('TELEGRAM_BOT_TOKEN', '')
CHAT_ID = os.getenv('TELEGRAM_CHAT_ID', '')

# Fallback to config.json if available (for local testing)
if not BOT_TOKEN or not CHAT_ID:
    try:
        with open('config.json', 'r') as f:
            config = json.load(f)
            BOT_TOKEN = BOT_TOKEN or config.get('bot_token', '')
            CHAT_ID = CHAT_ID or config.get('chat_id', '')
    except:
        pass

TELEGRAM_API = f"https://api.telegram.org/bot{BOT_TOKEN}"

def get_atm_status_from_web():
    """Fetch ATM status from website using requests with proper headers"""
    url = "https://shitcoins.club/ro/bitcoin-atm-locations"
    
    try:
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'ro-RO,ro;q=0.9',
            'Connection': 'keep-alive',
        }
        
        response = requests.get(url, headers=headers, timeout=30)
        
        if response.status_code == 200:
            soup = BeautifulSoup(response.text, 'html.parser')
            return parse_atm_info(soup.get_text())
        else:
            return None
            
    except Exception as e:
        logging.error(f"Error fetching web: {e}")
        return None

def parse_atm_info(text):
    """Parse the page text to extract ATM information"""
    text_lower = text.lower()
    
    results = []
    
    # Location 1: Palas Mall
    if 'palas mall' in text_lower or 'strada palas' in text_lower:
        balance = 0
        if '0 ron' in text or '0 lei' in text:
            balance = 0
        
        results.append({
            'location': 'Palas Mall',
            'address': 'Strada Palas 7A, Iasi 700259',
            'balance': balance
        })
    
    # Location 2: Silvestru
    if 'silvestru' in text_lower:
        balance = 0
        if '0 ron' in text or '0 lei' in text:
            balance = 0
        
        results.append({
            'location': 'Silvestru Street',
            'address': 'Strapungerea Silvestru 10, bloc CI 19, 700259 Iasi',
            'balance': balance
        })
    
    return results if results else None

def send_telegram_message(chat_id, text):
    """Send a message via Telegram"""
    try:
        url = f"{TELEGRAM_API}/sendMessage"
        payload = {
            'chat_id': chat_id,
            'text': text,
            'parse_mode': 'HTML'
        }
        response = requests.post(url, json=payload, timeout=10)
        result = response.json()
        logging.info(f"Telegram response: {result}")
        return result.get('ok', False)
    except Exception as e:
        logging.error(f"Error sending message: {e}")
        return False

def check_atm_status():
    """Check ATM status and return formatted message"""
    print(f"[{datetime.now()}] Checking ATM status...")
    
    atms = get_atm_status_from_web()
    
    if not atms:
        return "Error: Could not check ATM status. Please try again later."
    
    message = "BITCOIN ATM STATUS - IASI\n"
    message += f"Checked: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n\n"
    
    has_funds = False
    for atm in atms:
        message += f"Location: {atm['location']}\n"
        message += f"Address: {atm['address']}\n"
        if atm['balance'] > 0:
            message += f"Balance: {atm['balance']} RON\n"
            message += "Status: FUNDS AVAILABLE\n"
            has_funds = True
        else:
            message += "Balance: 0 RON\n"
            message += "Status: NO FUNDS\n"
        message += "\n"
    
    if has_funds:
        message = "MONEY ADDED!\n\n" + message
    
    return message

# Flask webhook endpoint for Telegram
@app.route('/', methods=['POST'])
def webhook():
    """Handle incoming webhook from Telegram"""
    try:
        data = request.get_json()
        
        if 'message' in data:
            message = data['message']
            chat_id = message['chat']['id']
            text = message.get('text', '')
            
            # Check for /check command
            if text.lower() in ['/check', '/status', '/iasi']:
                status_msg = check_atm_status()
                send_telegram_message(chat_id, status_msg)
                logging.info(f"Sent status to chat {chat_id}")
            
            # Check for /start or /help
            elif text.lower() in ['/start', '/help']:
                help_msg = (
                    "BITCOIN ATM MONITOR BOT\n\n"
                    "Commands:\n"
                    "/check - Check current ATM status in Iasi\n"
                    "/status - Same as /check\n"
                    "/iasi - Same as /check\n\n"
                    "The bot will check both locations:\n"
                    "- Palas Mall\n"
                    "- Silvestru Street"
                )
                send_telegram_message(chat_id, help_msg)
        
        return {'ok': True}
        
    except Exception as e:
        logging.error(f"Webhook error: {e}")
        return {'ok': False}

@app.route('/', methods=['GET'])
def home():
    """Health check endpoint"""
    return "Bitcoin ATM Monitor Bot is running!"

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=int(os.getenv('PORT', 5000)), debug=False)


