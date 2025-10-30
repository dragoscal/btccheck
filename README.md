# Bitcoin ATM Monitor - Telegram Bot

Monitor Bitcoin ATM balance at Iași Palas Mall via Telegram bot.

## Features

✅ **Telegram Commands** - Control everything from your phone  
✅ **Manual Checks** - You check the website, bot tracks changes  
✅ **Automatic Reminders** - Get reminded every 3 hours  
✅ **Balance Tracking** - Notifies when balance changes  
✅ **24/7 Online** - Runs on free hosting platforms

## Bot Commands

- `/start` or `/help` - Show help message
- `/check` - Get link to check ATM manually
- `/balance <amount>` - Set current balance (e.g., `/balance 150`)
- `/status` - Show last known balance and when it was updated

## How It Works

1. **Bot reminds you** every 3 hours to check
2. **You check manually** at the website (avoids Cloudflare blocking)
3. **You send balance** via `/balance` command
4. **Bot notifies you** if balance changed since last check

## Quick Start (Local Testing)

```bash
cd C:\Users\drago\Desktop\shit

# Set credentials
$env:TELEGRAM_BOT_TOKEN="your_bot_token"
$env:TELEGRAM_CHAT_ID="your_chat_id"

# Run bot
node telegram_bot.js
```

## Deploy Online (FREE 24/7)

See **DEPLOY_GUIDE.md** for detailed instructions.

**Recommended:** Railway.app (easiest setup, 500 free hours/month)

Quick deploy:
1. Push to GitHub
2. Connect to Railway.app
3. Add environment variables
4. Done!

## Configuration

Set these environment variables:

- `TELEGRAM_BOT_TOKEN` - Your bot token from @BotFather
- `TELEGRAM_CHAT_ID` - Your Telegram user ID

## Files

- `telegram_bot.js` - Main bot code
- `last_balance.json` - Auto-created to track balance changes
- `package.json` - Node.js dependencies
- `railway.json` - Railway deployment config
- `render.yaml` - Render deployment config
- `Procfile` - Process configuration

## Requirements

- Node.js 14+
- No external dependencies (uses only built-in modules)

## Reminder Schedule

Bot sends reminders every **3 hours** to check the ATM.

To change interval, edit this line in `telegram_bot.js`:
```javascript
this.reminderInterval = 3 * 60 * 60 * 1000; // 3 hours
```

## Why Manual Checking?

The shitcoins.club website uses Cloudflare protection which blocks automated scraping. Manual checking is:
- ✅ More reliable
- ✅ Takes 10 seconds
- ✅ No complex setup needed
- ✅ Works from any device

## Support

Bot automatically:
- Tracks balance changes
- Sends notifications
- Saves history
- Auto-restarts on errors

If bot stops responding, check the logs on your hosting platform.
