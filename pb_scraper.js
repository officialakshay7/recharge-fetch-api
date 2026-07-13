const puppeteer = require('puppeteer');

const LAUNCH_OPTIONS = {
    headless: 'new',
    ...(process.env.PUPPETEER_EXECUTABLE_PATH && {
        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    })
};

let browserInstance = null;
let currentPassToken = null;
let initPromise = null;

async function initBrowser() {
    if (initPromise) {
        return initPromise;
    }
    
    initPromise = (async () => {
        if (!browserInstance) {
            browserInstance = await puppeteer.launch(LAUNCH_OPTIONS);
        }
        
        if (!currentPassToken) {
            await doRefreshPassToken();
        }
        return browserInstance;
    })();
    
    return initPromise;
}

async function refreshPassToken() {
    if (initPromise) {
        await initPromise;
    }
    
    currentPassToken = null;
    initPromise = doRefreshPassToken();
    await initPromise;
}

async function doRefreshPassToken() {
    return new Promise(async (resolve, reject) => {
        let page;
        try {
            if (!browserInstance) {
                browserInstance = await puppeteer.launch(LAUNCH_OPTIONS);
            }
            page = await browserInstance.newPage();
            
            await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36');
            await page.setRequestInterception(true);
            
            page.on('request', (request) => {
                const headers = request.headers();
                if (headers['pb-pass-token']) {
                    currentPassToken = headers['pb-pass-token'];
                }
                
                const type = request.resourceType();
                if (['image', 'stylesheet', 'font', 'media'].includes(type)) {
                    request.abort();
                } else {
                    request.continue();
                }
            });

            await page.goto('https://www.paisabazaar.com/bill-payments/mobile-prepaid-plan-selection?mobileNo=9933718668', { waitUntil: 'domcontentloaded' }).catch(()=>{});
            
            let waitTime = 0;
            const interval = setInterval(async () => {
                if (currentPassToken || waitTime > 15000) {
                    clearInterval(interval);
                    if (page && !page.isClosed()) await page.close().catch(()=>{});
                    if (currentPassToken) resolve();
                    else reject(new Error("Failed to extract pb-pass-token after 15s"));
                }
                waitTime += 100;
            }, 100);
            
        } catch(e) {
            if (page && !page.isClosed()) await page.close().catch(()=>{});
            reject(e);
        }
    });
}

async function getPlans(mobileNo) {
    if (!currentPassToken) {
        await initBrowser();
    }

    // 1. Get Guest Session Token (pure fetch, extremely fast)
    let sessionRes = await fetch('https://api-external.paisabazaar.com/PBBPSSP/api/v1/guest/session', {
        method: 'POST',
        headers: {
            'pb-pass-token': currentPassToken,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ rechargeMobileNumber: mobileNo })
    });
    
    // If token is expired or invalid, refresh it and try again
    if (sessionRes.status === 401) {
        console.log("Token expired, refreshing...");
        await refreshPassToken();
        sessionRes = await fetch('https://api-external.paisabazaar.com/PBBPSSP/api/v1/guest/session', {
            method: 'POST',
            headers: { 'pb-pass-token': currentPassToken, 'Content-Type': 'application/json' },
            body: JSON.stringify({ rechargeMobileNumber: mobileNo })
        });
    }

    if (!sessionRes.ok) throw new Error('Failed to get guest session token');
    const sessionData = await sessionRes.json();
    const pbGuestToken = sessionData.response.accessToken;

    // 2. Fetch Plans (pure fetch, extremely fast)
    const plansRes = await fetch('https://api-external.paisabazaar.com/PBBPSSP/api/v1/guest/mobileRecharge/plans', {
        method: 'POST',
        headers: {
            'pb-pass-token': currentPassToken,
            'pb-guest-token': pbGuestToken,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ rechargeMobileNumber: mobileNo, tag: '', validate: false })
    });

    if (!plansRes.ok) throw new Error('Failed to fetch plans API');
    return await plansRes.json();
}

module.exports = { getPlans, initBrowser };
