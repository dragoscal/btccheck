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
        this.lastBalanceFile = process.env.DATA_DIR ? `${process.env.DATA_DIR}/last_balance.json` : './last_balance.json';
        this.atmUrl = 'https://www.bitomat.com/ro/bitomaty/bancomat-bitcoin-iasi-palas-mall';
        this.lastUpdateId = 0;
        this.checkInterval = 1 * 60 * 60 * 1000; // 1 hour in milliseconds
        this.lastCheck = 0;
        this.autoCheckEnabled = !!scrapeAllIasiATMs;
        
        // Ensure data directory exists
        this.ensureDataDir();
    }
    
    ensureDataDir() {
        const fs = require('fs');
        if (process.env.DATA_DIR) {
            const dir = process.env.DATA_DIR;
            if (!fs.existsSync(dir)) {
                try {
                    fs.mkdirSync(dir, { recursive: true });
                    console.log(`📁 Created data directory: ${dir}`);
                } catch (e) {
                    console.log('⚠️  Could not create data directory, using current dir');
                    this.lastBalanceFile = './last_balance.json';
                }
            }
        } else {
            console.log('ℹ️  Using current directory for storage');
        }
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

    // Load last balance (multi-location format)
    loadLastBalance() {
        try {
            if (fs.existsSync(this.lastBalanceFile)) {
                const data = fs.readFileSync(this.lastBalanceFile, 'utf8');
                const parsed = JSON.parse(data);
                
                // Convert old format to new if needed
                if (parsed.balance !== undefined && parsed.location) {
                    console.log('⚠️  Converting old format to new multi-location format');
                    return { [parsed.location]: parsed.balance };
                }
                
                return parsed;
            }
        } catch (error) {
            console.error('Error loading balance:', error.message);
        }
        return {}; // Return empty object for multi-location format
    }

    // Save balances (multi-location format)
    saveAllBalances(balancesData) {
        try {
            fs.writeFileSync(this.lastBalanceFile, JSON.stringify(balancesData, null, 2));
            console.log(`💾 Saved all balances to ${this.lastBalanceFile}`);
            Object.keys(balancesData).forEach(location => {
                console.log(`   ${location}: ${balancesData[location]} RON`);
            });
        } catch (error) {
            console.error('❌ Error saving balances:', error.message);
        }
    }

    // Handle /start command
    async handleStart() {
        const mode = this.autoCheckEnabled ? '🤖 <b>AUTOMATIC MODE</b>' : '👤 <b>MANUAL MODE</b>';
        const description = this.autoCheckEnabled 
            ? 'I automatically check both ATMs every 1 hour and notify you of changes.'
            : 'I remind you to check every 1 hour.';
        
        const message = `<b>🏧 Bitcoin ATM Monitor - Iași</b>

Welcome! I monitor Bitcoin ATM balances at both Iași locations.

${mode}
${description}

<b>📋 Commands:</b>
/check - Check all ATMs now
/status - Show last known balances
/help - Show this message

<b>⏰ Auto-Check:</b>
I automatically check every 1 hour and notify when balances change.

Ready to monitor! ${this.autoCheckEnabled ? 'I\'ll notify you when balance changes.' : 'Use /check to begin.'}`;
        
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

            const lastData = this.loadLastBalance();
            
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
                    
                    // Update balance in memory
                    lastData[result.location] = result.balance;
                } else {
                    message += `   ❌ Could not check\n`;
                }
                message += `\n`;
            }
            
            // Save all balances at once
            this.saveAllBalances(lastData);

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


    // Handle /status command
    async handleStatus() {
        const data = this.loadLastBalance();
        
        let message = `<b>📊 Current Status - All Locations</b>\n\n`;
        
        if (Object.keys(data).length === 0) {
            message += `⚠️ No data yet. Use /check to start monitoring!`;
        } else {
            let totalBalance = 0;
            
            Object.keys(data).forEach(location => {
                const balance = data[location];
                message += `📍 <b>${location}</b>\n`;
                message += `   💰 ${balance.toLocaleString()} RON\n\n`;
                totalBalance += balance;
            });
            
            message += `📊 <b>Total: ${totalBalance.toLocaleString()} RON</b>\n`;
            message += `🕐 Last Check: Just now\n`;
            message += `⏰ Next Check: In ~1 hour`;
        }

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
                    
                    if (change > 0) {
                        // Money ADDED (ATM refilled)
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

                        await this.sendMessage(message, 'HTML', true);
                        notificationSent = true;
                        console.log(`✅ Group notified: ${location} +${change} RON`);
                        
                    } else if (change < 0) {
                        // Money WITHDRAWN (balance decreased)
                        let message = `<b>💸 Money Withdrawn from ATM</b>\n\n`;
                        message += `📍 Location: ${location}\n`;
                        message += `💵 Current Balance: ${balance.toLocaleString()} RON\n`;
                        message += `📉 Withdrawn: ${Math.abs(change).toLocaleString()} RON\n`;
                        message += `🕐 Time: ${new Date().toLocaleString('ro-RO')}`;
                        message += `\n\n⬇️ Previous: ${lastBalance.toLocaleString()} RON`;

                        await this.sendMessage(message, 'HTML', true);
                        notificationSent = true;
                        console.log(`✅ Group notified: ${location} -${Math.abs(change)} RON`);
                    }
                }

                // Update last balance for this location
                lastData[location] = balance;
            }

            // Save updated balances
            this.saveAllBalances(lastData);

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
                
                case '/status':
                    await this.handleStatus();
                    break;
                
                default:
                    // Silently ignore unknown commands in group
                    if (!isFromGroup) {
                        await this.sendMessage('❓ Unknown command. Use /help to see available commands.');
                    }
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
        console.log('⏰ Check interval: Every 1 hour\n');

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
                        const text = update.message.text || '';
                        
                        // Only process if it's a command (starts with /)
                        const isCommand = text.startsWith('/');
                        
                        // Accept commands from personal chat OR group
                        if (isCommand && (chatId === this.chatId || chatId === this.groupChatId)) {
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

