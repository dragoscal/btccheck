// Automatic scraper using Puppeteer to bypass Cloudflare

async function scrapeIasiATM(customUrl = null) {
    let browser;
    try {
        const puppeteer = require('puppeteer');

        console.log('🌐 Launching browser...');
        
        const launchOptions = {
            headless: 'new',
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-accelerated-2d-canvas',
                '--no-first-run',
                '--no-zygote',
                '--disable-gpu',
                '--disable-software-rasterizer',
                '--disable-blink-features=AutomationControlled'
            ]
        };
        
        // Only set executablePath on Linux/Railway
        if (process.platform === 'linux') {
            launchOptions.executablePath = process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/chromium';
        }
        
        browser = await puppeteer.launch(launchOptions);

        const page = await browser.newPage();
        
        // Set viewport and user agent to look like a real browser
        await page.setViewport({ width: 1920, height: 1080 });
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
        
        // Remove webdriver property to avoid detection
        await page.evaluateOnNewDocument(() => {
            Object.defineProperty(navigator, 'webdriver', {
                get: () => false,
            });
        });

        console.log('📡 Fetching Iași ATM page...');
        // Use bitomat.com - much cleaner and easier to scrape
        const url = customUrl || 'https://www.bitomat.com/ro/bitomaty/bancomat-bitcoin-iasi-palas-mall';
        
        try {
            const response = await page.goto(url, {
                waitUntil: 'domcontentloaded',
                timeout: 30000
            });
            
            console.log('Response status:', response.status());
            
            if (response.status() === 403 || response.status() === 503) {
                console.log('❌ Blocked by Cloudflare (status ' + response.status() + ')');
                await browser.close();
                return null;
            }
        } catch (e) {
            console.log('❌ Navigation error:', e.message);
            await browser.close();
            return null;
        }

        // Wait for content to load
        console.log('⏳ Waiting for content...');
        await page.waitForTimeout(10000);

        // Get page content and check for Cloudflare
        const pageContent = await page.content();
        
        if (pageContent.includes('Cloudflare') && pageContent.includes('blocked')) {
            console.log('❌ Cloudflare challenge detected');
            await browser.close();
            return null;
        }
        
        console.log('📄 Page loaded, extracting data...');
        
        // Get page content
        const balance = await page.evaluate(() => {
            const bodyText = document.body.innerText;
            
            // Look for "include acum" followed by RON amount (bitomat.com format)
            const includeAcumMatch = bodyText.match(/include acum[\s\n\r]+(\d+)\s*RON/i);
            if (includeAcumMatch) {
                return parseInt(includeAcumMatch[1]);
            }
            
            // Alternative: Look for numbers followed by RON
            const ronMatch = bodyText.match(/(\d+)\s*RON/i);
            if (ronMatch) {
                return parseInt(ronMatch[1]);
            }
            
            return 0;
        });

        // Get location name
        const locationName = await page.evaluate(() => {
            const title = document.querySelector('h1, h2, .title, [class*="location"]');
            if (title) {
                return title.innerText.trim();
            }
            return 'Iași Palas Mall';
        });

        await browser.close();

        console.log(`✅ Scraped: ${locationName}`);
        console.log(`💰 Balance: ${balance} RON`);

        return {
            location: locationName,
            balance: balance,
            timestamp: new Date().toISOString()
        };

    } catch (error) {
        console.error('❌ Error scraping:', error.message);
        if (browser) {
            try {
                await browser.close();
            } catch (e) {}
        }
        return null;
    }
}

// Allow this to be called directly or imported
if (require.main === module) {
    console.log('🧪 Testing scraper...\n');
    scrapeIasiATM().then(result => {
        if (result) {
            console.log('\n✅ SUCCESS!');
            console.log('Result:', JSON.stringify(result, null, 2));
        } else {
            console.log('\n❌ FAILED - Could not scrape');
        }
        process.exit(result ? 0 : 1);
    }).catch(error => {
        console.error('\n❌ ERROR:', error);
        process.exit(1);
    });
}

module.exports = scrapeIasiATM;

