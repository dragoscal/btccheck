const https = require('https');
const fs = require('fs');

// Try to load scraper (may not exist in all setups)
let scrapeAllIasiATMs;
try {
    scrapeAllIasiATMs = require('./multi_scraper');
} catch (e) {
    console.log('⚠️  Auto-scraper not available, manual mode only');
    scrapeAllIasiATMs = null;
}

class ATMTelegramBot {
    constructor(botToken, chatId, groupChatId = null) {
        this.botToken = botToken;
        this.chatId = chatId; // Personal chat for commands
        this.groupChatId = groupChatId || chatId; // Group for notifications (defaults to personal)
        this.lastBalanceFile = 'last_balance.json';
        this.atmUrl = 'https://www.bitomat.com/ro/bitomaty/bancomat-bitcoin-iasi-palas-mall';
        this.lastUpdateId = 0;
        this.checkInterval = 3 * 60 * 60 * 1000; // 3 hours in milliseconds
        this.lastCheck = 0;
        this.autoCheckEnabled = !!scrapeAllIasiATMs;
    }

    // Send message via Telegram
    async sendMessage(text, parseMode = 'HTML', toGroup = false) {
        const targetChatId = toGroup ? this.groupChatId : this.chatId;
        
        const data = JSON.stringify({
            chat_id: targetChatId,
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

    // Delete webhook (needed for polling mode)
    async deleteWebhook() {
        return new Promise((resolve, reject) => {
            const path = `/bot${this.botToken}/deleteWebhook`;
            
            https.get(`https://api.telegram.org${path}`, (res) => {
                let data = '';
                res.on('data', (chunk) => data += chunk);
                res.on('end', () => {
                    try {
                        const result = JSON.parse(data);
                        if (result.ok) {
                            console.log('✅ Webhook deleted');
                            resolve(true);
                        } else {
                            console.log('⚠️  No webhook to delete');
                            resolve(false);
                        }
                    } catch (e) {
                        resolve(false);
                    }
                });
            }).on('error', () => resolve(false));
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
                            console.error('Telegram API error:', result.description);
                            resolve([]); // Return empty array instead of rejecting
                        }
                    } catch (e) {
                        // If JSON parse fails, log but don't crash
                        console.error('Failed to parse Telegram response:', e.message);
                        resolve([]); // Return empty array to continue
                    }
                });
            }).on('error', (err) => {
                console.error('HTTPS error:', err.message);
                resolve([]); // Don't reject, just return empty
            });
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
        const mode = this.autoCheckEnabled ? '🤖 <b>AUTOMATIC MODE</b>' : '👤 <b>MANUAL MODE</b>';
        const description = this.autoCheckEnabled 
            ? 'I automatically check the ATM every 3 hours and notify you of changes.'
            : 'I remind you to check every 3 hours.';
        
        const message = `<b>🏧 Bitcoin ATM Monitor - Iași</b>

Welcome! I monitor the Bitcoin ATM balance at Palas Mall.

${mode}
${description}

<b>📋 Commands:</b>
/check - Check ATM now
/balance &lt;amount&gt; - Set balance manually (e.g., /balance 150)
/status - Show last known balance
/help - Show this message

Ready to start! ${this.autoCheckEnabled ? 'I\'ll notify you when balance changes.' : 'Use /check to begin.'}`;
        
        await this.sendMessage(message);
    }

    // Handle /check command
    async handleCheck() {
        if (!this.autoCheckEnabled) {
            // Manual mode - send link
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
            return;
        }

        // Auto mode - trigger immediate check of all ATMs
        await this.sendMessage('🔄 Checking all ATMs now...');
        
        try {
            const results = await scrapeAllIasiATMs();
            
            if (!results || results.length === 0) {
                await this.sendMessage(`❌ Could not check ATMs automatically.\n\n<a href="${this.atmUrl}">Check manually here</a>`);
                return;
            }

            let message = `<b>✅ ATM Check Complete</b>\n\n`;
            
            let totalBalance = 0;
            let availableCount = 0;

            for (const result of results) {
                message += `📍 <b>${result.location}</b>\n`;
                
                if (result.balance !== null) {
                    message += `   💰 ${result.balance.toLocaleString()} RON`;
                    if (result.balance > 0) {
                        totalBalance += result.balance;
                        availableCount++;
                    } else {
                        message += ` ❌`;
                    }
                    message += `\n`;
                    
                    // Save this balance
                    const lastData = this.loadLastBalance();
                    lastData[result.location] = result.balance;
                    try {
                        require('fs').writeFileSync(this.lastBalanceFile, JSON.stringify(lastData, null, 2));
                    } catch (e) {}
                } else {
                    message += `   ❌ Could not check\n`;
                }
                message += `\n`;
            }

            message += `📊 <b>Total: ${totalBalance.toLocaleString()} RON</b>`;
            if (availableCount > 0) {
                message += ` (${availableCount} ATM${availableCount > 1 ? 's' : ''})`;
            }
            message += `\n🕐 Checked: ${new Date().toLocaleString('ro-RO')}`;

            await this.sendMessage(message);

        } catch (error) {
            await this.sendMessage(`❌ Error checking ATMs: ${error.message}\n\n<a href="${this.atmUrl}">Try checking manually</a>`);
        }
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

    // Auto-check ATM balance
    async autoCheckBalance() {
        const now = Date.now();
        
        if (now - this.lastCheck < this.checkInterval) {
            return; // Not time yet
        }

        this.lastCheck = now;

        if (!scrapeAllIasiATMs) {
            // Manual mode - send reminder
            const message = `<b>⏰ Reminder: Check ATM Balance</b>

It's been 3 hours! Time to check the Bitcoin ATM.

Use /check to get the link, then send me the balance.`;
            await this.sendMessage(message);
            console.log('✅ Reminder sent (manual mode)');
            return;
        }

        // Auto mode - scrape all ATMs
        console.log('🔄 Auto-checking all ATM balances...');
        
        try {
            const results = await scrapeAllIasiATMs();
            
            if (!results || results.length === 0) {
                console.log('⚠️  Auto-check failed, will retry in 3 hours');
                return;
            }

            const lastData = this.loadLastBalance();
            let notificationSent = false;

            for (const result of results) {
                if (result.balance === null) continue;

                const { location, balance } = result;
                const lastBalance = lastData[location] || 0;

                console.log(`💰 ${location}: ${balance} RON (was: ${lastBalance} RON)`);

                // Notify if balance changed
                if (balance !== lastBalance) {
                    const change = balance - lastBalance;
                    
                    // Only notify if money was ADDED (balance increased)
                    if (change > 0) {
                        let message = `<b>💰 Money Added to ATM!</b>\n\n`;
                        message += `📍 Location: ${location}\n`;
                        message += `💵 Current Balance: ${balance.toLocaleString()} RON\n`;
                        message += `📈 Added: +${change.toLocaleString()} RON\n`;
                        message += `🕐 Time: ${new Date().toLocaleString('ro-RO')}`;
                        
                        if (lastBalance > 0) {
                            message += `\n\n⬆️ Previous: ${lastBalance.toLocaleString()} RON`;
                        } else {
                            message += `\n\n🎉 <b>ATM Refilled!</b>`;
                        }

                        // Send to GROUP
                        await this.sendMessage(message, 'HTML', true);
                        notificationSent = true;
                        console.log(`✅ Group notified: ${location} +${change} RON`);
                    } else if (change < 0) {
                        // Money decreased (withdrawn) - just log, don't notify
                        console.log(`ℹ️  ${location}: ${Math.abs(change)} RON withdrawn`);
                    }
                }

                // Update last balance for this location
                lastData[location] = balance;
            }

            // Save updated balances
            try {
                require('fs').writeFileSync(this.lastBalanceFile, JSON.stringify(lastData, null, 2));
            } catch (e) {}

            if (notificationSent) {
                console.log('✅ Balance notifications sent');
            } else {
                console.log('ℹ️  No changes detected');
            }

        } catch (error) {
            console.error('❌ Auto-check error:', error.message);
        }
    }

    // Process incoming message
    async processMessage(message) {
        const text = message.text || '';
        const command = text.split(' ')[0].toLowerCase();
        const args = text.split(' ').slice(1);
        const isFromGroup = message.chat.id.toString() === this.groupChatId;

        console.log(`📨 Command received: ${command} ${isFromGroup ? '(from group)' : '(from personal chat)'}`);
        
        // Temporarily override chatId for this message if from group
        const originalChatId = this.chatId;
        if (isFromGroup) {
            this.chatId = this.groupChatId;
        }

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
        } finally {
            // Restore original chatId
            this.chatId = originalChatId;
        }
    }

    // Main polling loop
    async start() {
        console.log('🤖 Bot started!');
        console.log(`📱 Chat ID: ${this.chatId}`);
        console.log(`🔧 Mode: ${this.autoCheckEnabled ? 'AUTOMATIC' : 'MANUAL'}`);
        console.log('⏰ Check interval: Every 3 hours\n');

        // Delete any existing webhook (needed for polling)
        await this.deleteWebhook();

        // Send startup message
        const mode = this.autoCheckEnabled ? 'automatic checking' : 'manual reminders';
        await this.sendMessage(`🤖 <b>Bot is now running!</b>\n\nMode: ${mode}\n\nUse /help to see commands.`);

        // Set first check time
        this.lastCheck = Date.now();

        // Main loop
        while (true) {
            try {
                // Get updates
                const updates = await this.getUpdates();
                
                for (const update of updates) {
                    this.lastUpdateId = update.update_id;
                    
                    if (update.message) {
                        const chatId = update.message.chat.id.toString();
                        // Accept commands from personal chat OR group
                        if (chatId === this.chatId || chatId === this.groupChatId) {
                            await this.processMessage(update.message);
                        }
                    }
                }

                // Check if it's time for auto-check or reminder
                await this.autoCheckBalance();

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
    const groupChatId = process.env.TELEGRAM_GROUP_ID; // Optional: for group notifications

    if (!botToken || !chatId) {
        console.error('❌ Missing environment variables:');
        console.error('   TELEGRAM_BOT_TOKEN');
        console.error('   TELEGRAM_CHAT_ID');
        process.exit(1);
    }

    console.log('📱 Personal Chat ID:', chatId);
    if (groupChatId) {
        console.log('👥 Group Chat ID:', groupChatId);
        console.log('📢 Notifications will be sent to group');
    } else {
        console.log('ℹ️  No group ID set, notifications to personal chat');
    }

    const bot = new ATMTelegramBot(botToken, chatId, groupChatId);
    await bot.start();
}

if (require.main === module) {
    main().catch(console.error);
}

module.exports = ATMTelegramBot;

