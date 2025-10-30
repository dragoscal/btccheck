# Deploy Telegram Bot Online - FREE 24/7

Your bot is ready! Choose any of these **FREE** platforms to run it 24/7:

---

## ⭐ OPTION 1: Railway.app (RECOMMENDED - Easiest)

**✅ 500 hours/month FREE** (~16 hours/day or continuous if optimized)
**✅ Easiest setup**
**✅ Auto-restarts**

### Steps:

1. **Create Railway Account**
   - Go to [railway.app](https://railway.app)
   - Sign in with GitHub

2. **Create New Project**
   - Click "New Project"
   - Select "Deploy from GitHub repo"
   - Connect your GitHub account
   - Select this repository

3. **Add Environment Variables**
   - Click on your service
   - Go to "Variables" tab
   - Add:
     ```
     TELEGRAM_BOT_TOKEN = 8312867740:AAHiyn5LsxsWXS9avbAQ8Rz9K2yeRqFDyms
     TELEGRAM_CHAT_ID = 7897235228
     ```

4. **Deploy**
   - Click "Deploy"
   - Bot will start automatically!
   - Check logs to confirm it's running

**Done!** Your bot is now online 24/7.

---

## OPTION 2: Render.com

**✅ 750 hours/month FREE**
**✅ Never sleeps**

### Steps:

1. **Create Render Account**
   - Go to [render.com](https://render.com)
   - Sign in with GitHub

2. **Create New Service**
   - Click "New" → "Background Worker"
   - Connect repository
   - Name: `bitcoin-atm-bot`
   - Build Command: `npm install`
   - Start Command: `node telegram_bot.js`

3. **Add Environment Variables**
   - Add same variables as above

4. **Deploy**
   - Click "Create Web Service"
   - Wait for deployment (~2 minutes)

---

## OPTION 3: Fly.io

**✅ Completely FREE for small apps**
**✅ Runs 24/7**

### Steps:

1. Install Fly CLI:
```bash
# Windows
powershell -Command "iwr https://fly.io/install.ps1 -useb | iex"
```

2. Login and deploy:
```bash
cd C:\Users\drago\Desktop\shit
fly auth login
fly launch
# Say NO to database
# Set environment variables when prompted
fly deploy
```

---

## After Deployment

### Test Your Bot:

1. Open Telegram
2. Find your bot
3. Send `/start`
4. Send `/check` to get ATM link
5. After checking manually, send `/balance 150` (or whatever amount)

### Commands:

- `/check` - Get link to check ATM
- `/balance 150` - Set balance amount
- `/status` - Check last known balance
- `/help` - Show all commands

### Automatic Reminders:

Bot will remind you every **3 hours** to check the ATM.

---

## Monitoring

Check if bot is running:
- **Railway**: Dashboard → Logs
- **Render**: Dashboard → Logs
- **Fly.io**: Run `fly logs`

If bot stops, platforms will auto-restart it!

---

## Cost:

✅ **$0.00/month** - All platforms have free tiers
✅ No credit card required (for Railway/Render)

---

## Tips:

1. **Keep `last_balance.json` file** - It's auto-created by the bot
2. **Check logs occasionally** to ensure bot is running
3. **Test with `/status`** command anytime

---

## Need Help?

If you see errors in logs or bot doesn't respond:
- Check environment variables are correct
- Restart the service from dashboard
- Check Telegram bot token is valid

