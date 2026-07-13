const express = require('express');
const { getPlans, initBrowser } = require('./pb_scraper');
const { getFallbackPlans } = require('./fallback_scraper');

process.on('uncaughtException', (err) => {
    console.error('UNCAUGHT EXCEPTION:', err);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('UNHANDLED REJECTION at:', promise, 'reason:', reason);
});

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
const https = require('https');

app.get(/^\/media\/.*/, (req, res) => {
    const targetUrl = `https://static.paisabazaar.com${req.originalUrl}`;
    https.get(targetUrl, (proxyRes) => {
        Object.entries(proxyRes.headers).forEach(([key, value]) => {
            if (value) res.setHeader(key, value);
        });
        res.status(proxyRes.statusCode);
        proxyRes.pipe(res);
    }).on('error', (err) => {
        console.error("Image proxy error:", err);
        res.status(500).send("Error proxying image");
    });
});

app.get('/api/plans', async (req, res) => {
    let mobileNo = req.query.mobileNo;
    
    if (!mobileNo || !/^\d{10}$/.test(mobileNo)) {
        return res.status(400).json({ error: 'Valid 10-digit mobileNo is required' });
    }

    console.log(`Fetching plans for ${mobileNo}...`);
    
    let isFallback = false;
    let operatorDetails;
    let plans;

    try {
        const plansData = await getPlans(mobileNo);
        let operatorDetailsStr = JSON.stringify(plansData.response.operatorDetails);
        let plansStr = JSON.stringify(plansData.response.plans);
        
        const hostUrl = `http://${req.headers.host}`;
        operatorDetailsStr = operatorDetailsStr.replace(/https:\/\/static\.paisabazaar\.com/g, hostUrl);
        plansStr = plansStr.replace(/https:\/\/static\.paisabazaar\.com/g, hostUrl);

        operatorDetails = JSON.parse(operatorDetailsStr);
        plans = JSON.parse(plansStr);

        Object.keys(plans).forEach(category => {
            if (Array.isArray(plans[category])) {
                plans[category].forEach(plan => {
                    delete plan.fee;
                });
            }
        });
    } catch (err) {
        console.error(`Primary scraper failed for ${mobileNo} (${err.message}), attempting fallback...`);
        try {
            const fallbackData = await getFallbackPlans(mobileNo);
            operatorDetails = fallbackData.operatorDetails;
            plans = fallbackData.plans;
            isFallback = true;
        } catch (fallbackErr) {
            console.error("Fallback fetching also failed:", fallbackErr);
            return res.status(500).json({
                success: false,
                mobileNo,
                error: `Both primary and fallback scrapers failed. Primary: ${err.message} | Fallback: ${fallbackErr.message}`
            });
        }
    }

    res.json({
        success: true,
        mobileNo,
        source: isFallback ? "plansinfo" : "paisabazaar",
        data: {
            operatorDetails,
            plans
        }
    });
});

app.listen(PORT, async () => {
    console.log(`API running on http://localhost:${PORT}`);
    console.log(`Test endpoint: http://localhost:${PORT}/api/plans?mobileNo=9933718668`);
    
    // Pre-warm the headless browser
    console.log("Pre-warming headless browser...");
    await initBrowser();
    console.log("Browser is ready!");
});
