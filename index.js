const https = require('https');
const fs = require('fs');

class BitcoinATMMonitor {
    constructor() {
        // Direct API endpoint for the specific Iași ATM (if available)
        // Or we can use the Telegram channel they mentioned in search results
        this.iasiAtmUrl = 'https://shitcoins.club/localizarea-atm/bancomat-bitcoin-iași-palas-mall';
        this.telegramBotToken = process.env.TELEGRAM_BOT_TOKEN;
        this.telegramChatId = process.env.TELEGRAM_CHAT_ID;
        this.lastBalanceFile = 'last_balance.json';
    }

    // Temporary: Manual balance entry until we can bypass Cloudflare
    async checkManualBalance() {
        console.log(`[${new Date().toISOString()}] Manual balance check`);
        console.log('\n⚠️  The website is protected by Cloudflare and blocks automated access.');
        console.log('Please manually check: ' + this.iasiAtmUrl);
        console.log('\nTo set balance manually, create last_balance.json with:');
        console.log('{"Iași Palas Mall": 150}');
        console.log('\nThen run this script again to send notification.');
        
        const lastBalance = this.loadLastBalance();
        if (Object.keys(lastBalance).length > 0) {
            console.log('\nCurrent tracked balances:');
            console.log(JSON.stringify(lastBalance, null, 2));
        }
    }

    async sendTelegramMessage(message) {
        if (!this.telegramBotToken || !this.telegramChatId) {
            console.log('Telegram credentials not configured');
            console.log('Message:', message);
            return false;
        }

        const data = JSON.stringify({
            chat_id: this.telegramChatId,
            text: message,
            parse_mode: 'HTML'
        });

        return new Promise((resolve, reject) => {
            const options = {
                hostname: 'api.telegram.org',
                path: `/bot${this.telegramBotToken}/sendMessage`,
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
                        console.log('✅ Telegram notification sent successfully!');
                        resolve(true);
                    } else {
                        console.error('❌ Telegram error:', responseData);
                        resolve(false);
                    }
                });
            });

            req.on('error', (error) => {
                console.error('❌ Error sending Telegram message:', error.message);
                reject(error);
            });

            req.write(data);
            req.end();
        });
    }

    loadLastBalance() {
        try {
            if (fs.existsSync(this.lastBalanceFile)) {
                const data = fs.readFileSync(this.lastBalanceFile, 'utf8');
                return JSON.parse(data);
            }
        } catch (error) {
            console.error('Error loading last balance:', error.message);
        }
        return {};
    }

    saveLastBalance(balanceData) {
        try {
            fs.writeFileSync(this.lastBalanceFile, JSON.stringify(balanceData, null, 2));
            console.log('💾 Balance saved');
        } catch (error) {
            console.error('Error saving balance:', error.message);
        }
    }

    // Test Telegram connection
    async testTelegram() {
        console.log('🧪 Testing Telegram connection...\n');
        const message = `<b>🧪 Test Message</b>\n\nBitcoin ATM Monitor is set up correctly!\n\n🕐 Time: ${new Date().toLocaleString('ro-RO')}`;
        return await this.sendTelegramMessage(message);
    }

    // Manual notification (for testing or manual balance entry)
    async notifyBalance(locationName, balance) {
        const lastBalance = this.loadLastBalance();
        const lastValue = lastBalance[locationName] || 0;

        if (balance !== lastValue) {
            let message = `<b>🏧 Bitcoin ATM Balance Alert</b>\n\n`;
            message += `📍 Location: ${locationName}\n`;
            message += `💰 Balance: ${balance} RON\n`;
            message += `🕐 Time: ${new Date().toLocaleString('ro-RO')}`;

            if (lastValue > 0) {
                const change = balance - lastValue;
                const emoji = change > 0 ? '📈' : '📉';
                message += `\n\n${emoji} Previous: ${lastValue} RON (${change > 0 ? '+' : ''}${change} RON)`;
            }

            await this.sendTelegramMessage(message);
            lastBalance[locationName] = balance;
            this.saveLastBalance(lastBalance);
        } else {
            console.log('ℹ️  Balance unchanged, no notification sent');
        }
    }
}

// Main execution
async function main() {
    const monitor = new BitcoinATMMonitor();
    
    // Check if we're testing Telegram
    if (process.argv.includes('--test')) {
        await monitor.testTelegram();
        return;
    }
    
    // Check if manual balance is provided
    const balanceIndex = process.argv.indexOf('--balance');
    if (balanceIndex > -1 && process.argv[balanceIndex + 1]) {
        const balance = parseInt(process.argv[balanceIndex + 1]);
        const location = process.argv[balanceIndex + 2] || 'Iași Palas Mall';
        console.log(`Setting balance: ${balance} RON for ${location}`);
        await monitor.notifyBalance(location, balance);
        return;
    }
    
    // Otherwise show instructions
    await monitor.checkManualBalance();
}

// Allow module to be imported
if (require.main === module) {
    main().catch(console.error);
}

module.exports = BitcoinATMMonitor;
