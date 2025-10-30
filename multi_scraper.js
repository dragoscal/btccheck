// Multi-location scraper for all Iași Bitcoin ATMs

const scrapeIasiATM = require('./auto_scraper');

// List of Iași ATM locations
const iasiLocations = [
    {
        name: 'Iași Palas Mall',
        url: 'https://www.bitomat.com/ro/bitomaty/bancomat-bitcoin-iasi-palas-mall'
    },
    {
        name: 'Iași Piața Gării',
        url: 'https://www.bitomat.com/ro/bitomaty/bitcoin-atm-lasi-piata-garii'
    }
];

async function scrapeAllIasiATMs() {
    const results = [];
    
    for (const location of iasiLocations) {
        console.log(`\n🔍 Checking ${location.name}...`);
        
        try {
            const result = await scrapeIasiATM(location.url);
            
            if (result) {
                results.push({
                    ...result,
                    location: location.name,
                    url: location.url
                });
            } else {
                results.push({
                    location: location.name,
                    balance: null,
                    error: 'Could not scrape',
                    url: location.url,
                    timestamp: new Date().toISOString()
                });
            }
        } catch (error) {
            console.error(`❌ Error checking ${location.name}:`, error.message);
            results.push({
                location: location.name,
                balance: null,
                error: error.message,
                url: location.url,
                timestamp: new Date().toISOString()
            });
        }
    }
    
    return results;
}

// Allow this to be called directly or imported
if (require.main === module) {
    console.log('🧪 Testing all Iași ATM locations...\n');
    scrapeAllIasiATMs().then(results => {
        console.log('\n✅ RESULTS:\n');
        results.forEach(result => {
            console.log(`📍 ${result.location}`);
            if (result.balance !== null) {
                console.log(`   💰 Balance: ${result.balance} RON`);
            } else {
                console.log(`   ❌ Error: ${result.error}`);
            }
            console.log(`   🔗 ${result.url}`);
            console.log('');
        });
        
        const totalBalance = results
            .filter(r => r.balance !== null)
            .reduce((sum, r) => sum + r.balance, 0);
        
        console.log(`📊 Total available: ${totalBalance} RON across ${results.filter(r => r.balance > 0).length} ATMs`);
        
        process.exit(0);
    }).catch(error => {
        console.error('\n❌ ERROR:', error);
        process.exit(1);
    });
}

module.exports = scrapeAllIasiATMs;

