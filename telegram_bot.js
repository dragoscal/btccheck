const https = require('https');
const fs = require('fs');

class ATMTelegramBot {
    constructor(botToken, chatId) {
        this.botToken = botToken;
        this.chatId = chatId;
        this.lastBalanceFile = 'last_balance.json';
        this.atmUrl = 'https://shitcoins.club/localizarea-atm/bancomat-bitcoin-iași-palas-mall';
        this.lastUpdateId = 0;
        this.reminderInterval = 3 * 60 * 60 * 1000; // 3 hours in milliseconds
        this.lastReminder = 0;
    }

    // Send message via Telegram
    async sendMessage(text, parseMode = 'HTML') {
        const data = JSON.stringify({
            chat_id: this.chatId,
            text: text,
            parse_mode: parseMode,
            disable_web_page_preview: false
        });

        return new Promise((resolve, reject) => {
            const options = {
                hostname: 'api.telegram.org',
                path: `/bot${this.botToken}/sendMessage`,
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Content-Length': data.length
                }
            };

            const req = https.request(options, (res) => {
                let responseData = '';
                res.on('data', (chunk) => responseData += chunk);
                res.on('end', () => {
                    if (res.statusCode === 200) {
                        resolve(JSON.parse(responseData));
                    } else {
                        console.error('Telegram API error:', responseData);
                        reject(new Error(responseData));
                    }
                });
            });

            req.on('error', reject);
            req.write(data);
            req.end();
        });
    }

    // Get updates from Telegram
    async getUpdates() {
        return new Promise((resolve, reject) => {
            const path = `/bot${this.botToken}/getUpdates?offset=${this.lastUpdateId + 1}&timeout=30`;
            
            https.get(`https://api.telegram.org${path}`, (res) => {
                let data = '';
                res.on('data', (chunk) => data += chunk);
                res.on('end', () => {
                    try {
                        const result = JSON.parse(data);
                        if (result.ok) {
                            resolve(result.result);
                        } else {
                            reject(new Error(result.description));
                        }
                    } catch (e) {
                        reject(e);
                    }
                });
            }).on('error', reject);
        });
    }

    // Load last balance
    loadLastBalance() {
        try {
            if (fs.existsSync(this.lastBalanceFile)) {
                const data = fs.readFileSync(this.lastBalanceFile, 'utf8');
                return JSON.parse(data);
            }
        } catch (error) {
            console.error('Error loading balance:', error.message);
        }
        return { balance: 0, location: 'Iași Palas Mall', timestamp: null };
    }

    // Save balance
    saveBalance(balance) {
        try {
            const data = {
                balance: balance,
                location: 'Iași Palas Mall',
                timestamp: new Date().toISOString()
            };
            fs.writeFileSync(this.lastBalanceFile, JSON.stringify(data, null, 2));
            return data;
        } catch (error) {
            console.error('Error saving balance:', error.message);
            return null;
        }
    }

    // Handle /start command
    async handleStart() {
        const message = `<b>🏧 Bitcoin ATM Monitor - Iași</b>

Welcome! I'll help you monitor the Bitcoin ATM balance at Palas Mall.

<b>📋 Commands:</b>
/check - Get link to check ATM manually
/balance &lt;amount&gt; - Set current balance (e.g., /balance 150)
/status - Show last known balance
/remind - Toggle 3-hour reminders ON/OFF
/help - Show this message

<b>🔔 Automatic Reminders:</b>
I'll remind you to check every 3 hours (currently ON).

Ready to start! Use /check to begin.`;
        
        await this.sendMessage(message);
    }

    // Handle /check command
    async handleCheck() {
        const message = `<b>🔍 Time to Check the ATM</b>

<b>📍 Location:</b> Iași Palas Mall
<b>🔗 Link:</b> <a href="${this.atmUrl}">Click here to check balance</a>

<b>Instructions:</b>
1. Click the link above
2. Look for the available balance (RON)
3. Send me: /balance [amount]

Example: <code>/balance 150</code>

💡 Tip: If there's no balance, send <code>/balance 0</code>`;

        await this.sendMessage(message);
    }

    // Handle /balance command
    async handleBalance(amount) {
        const balance = parseInt(amount);
        
        if (isNaN(balance) || balance < 0) {
            await this.sendMessage('❌ Invalid amount. Use: /balance 150\n(or /balance 0 if no balance)');
            return;
        }

        const lastData = this.loadLastBalance();
        const lastBalance = lastData.balance || 0;

        this.saveBalance(balance);

        let message = `<b>✅ Balance Updated</b>\n\n`;
        message += `📍 Location: Iași Palas Mall\n`;
        message += `💰 Current Balance: ${balance} RON\n`;
        message += `🕐 Time: ${new Date().toLocaleString('ro-RO')}`;

        if (lastBalance > 0 && balance !== lastBalance) {
            const change = balance - lastBalance;
            const emoji = change > 0 ? '📈' : '📉';
            message += `\n\n${emoji} <b>Change Detected!</b>`;
            message += `\nPrevious: ${lastBalance} RON`;
            message += `\nDifference: ${change > 0 ? '+' : ''}${change} RON`;
        } else if (lastBalance === 0 && balance > 0) {
            message += `\n\n🎉 <b>Balance Available!</b>`;
        } else if (balance === lastBalance) {
            message += `\n\nℹ️ No change from last check.`;
        }

        await this.sendMessage(message);
    }

    // Handle /status command
    async handleStatus() {
        const data = this.loadLastBalance();
        
        let message = `<b>📊 Current Status</b>\n\n`;
        message += `📍 Location: ${data.location}\n`;
        message += `💰 Balance: ${data.balance} RON\n`;
        
        if (data.timestamp) {
            const lastCheck = new Date(data.timestamp);
            const now = new Date();
            const diffMs = now - lastCheck;
            const diffMins = Math.floor(diffMs / 60000);
            const diffHours = Math.floor(diffMins / 60);
            
            message += `🕐 Last Updated: ${lastCheck.toLocaleString('ro-RO')}\n`;
            
            if (diffHours > 0) {
                message += `⏱️ Time Since: ${diffHours}h ${diffMins % 60}m ago`;
            } else {
                message += `⏱️ Time Since: ${diffMins}m ago`;
            }
        } else {
            message += `\n⚠️ No data yet. Use /check to start!`;
        }

        message += `\n\n🔗 <a href="${this.atmUrl}">Check ATM Now</a>`;

        await this.sendMessage(message);
    }

    // Send reminder
    async sendReminder() {
        const now = Date.now();
        
        if (now - this.lastReminder < this.reminderInterval) {
            return; // Not time yet
        }

        this.lastReminder = now;

        const message = `<b>⏰ Reminder: Check ATM Balance</b>

It's been 3 hours! Time to check the Bitcoin ATM.

Use /check to get the link, then send me the balance.`;

        await this.sendMessage(message);
        console.log('✅ Reminder sent');
    }

    // Process incoming message
    async processMessage(message) {
        const text = message.text || '';
        const command = text.split(' ')[0].toLowerCase();
        const args = text.split(' ').slice(1);

        console.log(`📨 Command received: ${command}`);

        try {
            switch (command) {
                case '/start':
                case '/help':
                    await this.handleStart();
                    break;
                
                case '/check':
                    await this.handleCheck();
                    break;
                
                case '/balance':
                    if (args.length === 0) {
                        await this.sendMessage('❌ Please provide amount.\n\nExample: <code>/balance 150</code>');
                    } else {
                        await this.handleBalance(args[0]);
                    }
                    break;
                
                case '/status':
                    await this.handleStatus();
                    break;
                
                default:
                    await this.sendMessage('❓ Unknown command. Use /help to see available commands.');
            }
        } catch (error) {
            console.error('Error processing message:', error);
            await this.sendMessage('❌ An error occurred. Please try again.');
        }
    }

    // Main polling loop
    async start() {
        console.log('🤖 Bot started!');
        console.log(`📱 Chat ID: ${this.chatId}`);
        console.log('⏰ Reminders: Every 3 hours\n');

        // Send startup message
        await this.sendMessage('🤖 <b>Bot is now running!</b>\n\nUse /help to see commands.');

        // Set first reminder time
        this.lastReminder = Date.now();

        // Main loop
        while (true) {
            try {
                // Get updates
                const updates = await this.getUpdates();
                
                for (const update of updates) {
                    this.lastUpdateId = update.update_id;
                    
                    if (update.message && update.message.chat.id.toString() === this.chatId) {
                        await this.processMessage(update.message);
                    }
                }

                // Check if it's time for reminder
                await this.sendReminder();

            } catch (error) {
                console.error('❌ Error in main loop:', error.message);
                await new Promise(resolve => setTimeout(resolve, 5000));
            }
        }
    }
}

// Main execution
async function main() {
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;

    if (!botToken || !chatId) {
        console.error('❌ Missing environment variables:');
        console.error('   TELEGRAM_BOT_TOKEN');
        console.error('   TELEGRAM_CHAT_ID');
        process.exit(1);
    }

    const bot = new ATMTelegramBot(botToken, chatId);
    await bot.start();
}

if (require.main === module) {
    main().catch(console.error);
}

module.exports = ATMTelegramBot;

