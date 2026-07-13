const https = require('https');

async function getOperatorAndCircle(mobileNo) {
    try {
        const response = await fetch(`https://bmobile.in/${mobileNo}`);
        if (!response.ok) throw new Error("Failed to fetch bmobile.in");
        const html = await response.text();

        const opMatch = html.match(/Operator:\s*<\/th><td[^>]*><a[^>]*>([^<]+)<\/a>/i);
        const locMatch = html.match(/Location:\s*<\/th><td[^>]*>([^<]+)<\/td>/i);

        let operator = opMatch ? opMatch[1].trim().toLowerCase() : null;
        let location = locMatch ? locMatch[1].trim().toLowerCase() : null;

        if (!operator || !location) {
            throw new Error("Operator or Location not found in bmobile HTML");
        }

        if (operator.includes('airtel')) operator = 'airtel';
        else if (operator.includes('jio')) operator = 'jio';
        else if (operator.includes('vi') || operator.includes('vodafone') || operator.includes('idea')) operator = 'vi';
        else if (operator.includes('bsnl')) operator = 'bsnl';
        else if (operator.includes('mtnl')) operator = 'mtnl';
        
        let circle = location.split(/\s*(&|and)\s*/)[0].trim().replace(/\s+/g, '-');
        
        if (circle === 'delhi') circle = 'delhi-ncr';
        else if (circle === 'himachal-pradesh') circle = 'himanchal-pradesh'; 
        else if (circle === 'jammu---kashmir') circle = 'jammu-kashmir';
        
        return { operator, circle };
    } catch (err) {
        throw new Error(`Fallback circle identification failed: ${err.message}`);
    }
}

async function getFallbackPlans(mobileNo) {
    try {
        const { operator, circle } = await getOperatorAndCircle(mobileNo);
        console.log(`Fallback mapping: ${operator} / ${circle}`);

        const response = await fetch(`https://www.plansinfo.com/mobile/${operator}/${circle}`);
        if (!response.ok) throw new Error("Failed to fetch plansinfo.com");
        const html = await response.text();

        const match = html.match(/__NEXT_DATA__.*?>(.*?)<\/script>/s);
        if (!match) {
            throw new Error("__NEXT_DATA__ JSON not found in plansinfo HTML");
        }

        const nextData = JSON.parse(match[1]);
        const categories = nextData?.props?.pageProps?.categories || [];
        const operatorDetails = nextData?.props?.pageProps?.operator || {};
        
        const formattedPlans = {};
        
        categories.forEach(cat => {
            if (cat.plans && cat.plans.length > 0) {
                formattedPlans[cat.name] = cat.plans.map(plan => {
                    const addBenefits = (plan.subscriptions || []).map(sub => ({
                        key: sub.name,
                        value: "",
                        url: "http://localhost:3000/media/collections/deafault.png"
                    }));

                    return {
                        id: plan.id,
                        amount: plan.amount,
                        planName: cat.name,
                        data: plan.data || "NA",
                        validity: plan.validity || "NA",
                        talktime: plan.talktime || "NA",
                        details: plan.benefit ? plan.benefit.split(/\s*\|\s*/) : [],
                        additionalBenefits: addBenefits
                    };
                });
            }
        });

        const formattedOperatorDetails = {
            operatorId: operatorDetails.code || "NA",
            name: operatorDetails.name || operator,
            logo: `https://images.plansinfo.com/${operatorDetails.logo}`
        };

        return {
            operatorDetails: formattedOperatorDetails,
            plans: formattedPlans,
            source: "plansinfo"
        };
    } catch (err) {
        throw new Error(`Fallback scraping failed: ${err.message}`);
    }
}

module.exports = { getFallbackPlans };
