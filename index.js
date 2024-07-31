const express = require('express');
const app = express();
const path = require('path');
const exphbs = require('express-handlebars');
const request = require('request');
const bodyParser = require('body-parser');
const { Purchase, sequelize } = require('./models');
const { INTEGER } = require('sequelize');
const { Watchlist } = require('./models/watchIndex');
const { User } = require('./models/user');
const passport = require('passport');
const session = require('express-session');
const SequelizeStore = require('connect-session-sequelize')(session.Store);
const bcrypt = require('bcrypt');


const sessionStore = new SequelizeStore({ db: sequelize });

app.use(session({
    secret: 'your_secret_key',
    resave: false,
    saveUninitialized: false,
    store: sessionStore
}));

app.use(passport.initialize());
app.use(passport.session());

// Load Passport configuration
require('./passport-config');



const PORT = process.env.PORT || 5000;

app.engine('handlebars', exphbs.engine());
app.set('view engine', 'handlebars');

// API KEY: d0b827bd2ec745b59bccc4c90f2193c5
const avKey = 'd0b827bd2ec745b59bccc4c90f2193c5';



app.use(bodyParser.urlencoded({ extended: false }));


app.use(express.static(path.join(__dirname, "public")));

function callAPI(finishedAPI, ticker) {
    request(`https://api.twelvedata.com/time_series?symbol=${ticker}&interval=1min&apikey=${avKey}`, { json: true }, (err, res, body) => {
        if (err) { console.log(err); }
        if (res.statusCode === 200) {
            finishedAPI(body);
        }
    });
}


function getLTP(ticker) {
    return new Promise((resolve, reject) => {
        request(`https://api.twelvedata.com/time_series?symbol=${ticker}&interval=1min&apikey=${avKey}`, { json: true }, (err, res, body) => {
            if (err) {
                console.error('Error fetching LTP:', err);
                return reject(err);
            }
            if (res.statusCode === 200 && body.values && body.values.length > 0) {
                const price = parseFloat(body.values[0].close);
                if (!isNaN(price)) {
                    resolve(price);
                } else {
                    console.error('Invalid price:', body.values[0].close);
                    reject(new Error('Invalid price returned'));
                }
            } else {
                reject(new Error('Failed to fetch price or no data available'));
            }
        });
    });
}




app.get('/account', (req, res) => {
    res.render('account');
})




app.get('/', (req, res) => {
    res.render('home');
});

app.get('/browse', (req, res) => {
    res.render('browse');
});

app.post('/view', (req, res) => {
    callAPI(function (doneAPI) {
        const stock = req.body.search;
        res.render('view', {
            stock: doneAPI,
            values: doneAPI.values[0],
            url: `https://api.stockdio.com/visualization/financial/charts/v1/HistoricalPrices?app-key=E8A4807F0D0C41F49C2AFD41D6D4805D&symbol=${stock}&dividends=true&splits=true&palette=Financial-Dark`
        });
    }, req.body.search);

});


app.post('/view/:symbol', async (req, res) => {
    const symbol = req.params.symbol;


    callAPI(function (doneAPI) {
        res.render('view', {
            stock: doneAPI,
            values: doneAPI.values[0],
            url: `https://api.stockdio.com/visualization/financial/charts/v1/HistoricalPrices?app-key=E8A4807F0D0C41F49C2AFD41D6D4805D&symbol=${symbol}&dividends=true&splits=true&palette=Financial-Dark`
        });
    }, symbol);

});



app.get('/buy/:symbol&:price', (req, res) => {

    const symbol = req.params.symbol;
    const price = req.params.price;

    res.render('buy', {
        symbol: symbol,
        price: price
    });

});


app.post('/purchase/:symbol&:price', async (req, res) => {
    const symbol = req.params.symbol;
    const price = parseFloat(req.params.price);
    console.log(symbol);
    const quantity = parseInt(req.body.quantity);
    try {
        const parsedPrice = parseFloat(price);
        const parsedQuantity = parseInt(quantity, 10);

        if (isNaN(parsedPrice) || isNaN(parsedQuantity)) {
            throw new Error('Invalid price or quantity');
        }

        // Find existing purchase record
        const existingPurchase = await Purchase.findOne({ where: { symbol } });

        if (existingPurchase) {
            // Update existing record
            const currentPrice = existingPurchase.price;
            const currentQuantity = existingPurchase.quantity;

            // Calculate new average price
            const totalCost = (currentPrice * currentQuantity) + (parsedPrice * parsedQuantity);
            const newQuantity = currentQuantity + parsedQuantity;
            const newAveragePrice = Math.round(100 * totalCost / newQuantity) / 100;


            // Update record with new average price and quantity
            await existingPurchase.update({
                price: newAveragePrice,
                quantity: newQuantity
            });
        } else {
            // Create a new purchase record if it does not exist
            await Purchase.create({
                symbol,
                price: parsedPrice,
                quantity: parsedQuantity
            });
        }

        res.redirect('/portfolio');
    } catch (error) {
        console.error('Error saving purchase:', error);
        res.status(500).send('Internal Server Error');
    }
});

app.get('/sell/:symbol&:price&:quantity', async (req, res) => {
    const symbol = req.params.symbol;
    const price = req.params.price;
    const quantity = req.params.quantity;

    if (!symbol) {
        return res.status(400).send('Symbol is required');
    }

    try {
        const purchase = await Purchase.findOne({ where: { symbol } });
        if (purchase) {
            res.render('sell', {
                symbol: purchase.symbol,
                price: price,
                quantity: quantity
            });
        } else {
            res.status(404).send('Purchase not found');
        }
    } catch (error) {
        console.error('Error fetching purchase:', error);
        res.status(500).send('Internal Server Error');
    }
});

let allbuy = 0;
let allPL = 0;


app.get('/portfolio', async (req, res) => {
    try {
        // Fetch all purchases
        const purchases = await Purchase.findAll();

        let totalNetBuyAmount = 0;
        let totalNetWorth = 0;
        let totalProfitLoss = 0;

        // Compute total value for each purchase
        const purchasesWithTotal = await Promise.all(purchases.map(async (purchase) => {
            // Convert to plain object
            const purchaseData = purchase.toJSON();

            // Parse price and quantity
            const buyPrice = parseFloat(purchaseData.price);
            const quantity = parseInt(purchaseData.quantity, 10);

            // Calculate total buy value
            const totalBuyValue = Math.round(buyPrice * quantity * 100) / 100;
            totalNetBuyAmount += totalBuyValue;

            // Fetch live price asynchronously
            let livePrice;
            try {
                livePrice = await getLTP(purchaseData.symbol);
            } catch (error) {
                console.error(`Failed to get live price for ${purchaseData.symbol}:`, error.message);
                livePrice = NaN;
            }

            // Calculate live worth
            const liveWorth = isNaN(livePrice) ? 0 : Math.round(livePrice * quantity * 100) / 100;
            totalNetWorth += liveWorth;


            // Calculate profit/loss
            const profitLoss = Math.round((liveWorth - totalBuyValue) * 100) / 100;
            const isProfit = profitLoss > 0;
            totalProfitLoss += profitLoss;

            return {
                ...purchaseData,
                totalBuyValue,
                liveWorth,
                profitLoss,
                isProfit,
                livePrice
            };
        }));

        totalNetBuyAmount = Math.round(totalNetBuyAmount * 100) / 100;
        totalNetWorth = Math.round(totalNetWorth * 100) / 100;
        totalProfitLoss = Math.round(totalProfitLoss * 100) / 100;
        isNetProfit = totalProfitLoss > 0;

        // Render the portfolio page with the computed data
        res.render('portfolio', {
            purchases: purchasesWithTotal,
            totalNetBuyAmount,
            totalNetWorth,
            totalProfitLoss,
            isNetProfit
        });
    } catch (error) {
        console.error('Error fetching purchases:', error);
        res.status(500).send('Internal Server Error');
    }
});


app.post('/sell/:symbol&:price', async (req, res) => {
    // Extract symbol, sell price, and quantity from request parameters
    const { symbol, price: sellPrice } = req.params;
    const sellQty = req.body.sell;

    // Validate input
    if (!symbol || !sellQty || !sellPrice) {
        return res.status(400).send('Symbol, sell price, and quantity are required');
    }

    try {
        // Parse and validate quantity and price
        const parsedQuantity = parseInt(sellQty, 10);
        const parsedSellPrice = parseFloat(sellPrice);

        if (isNaN(parsedQuantity) || isNaN(parsedSellPrice)) {
            throw new Error('Invalid quantity or sell price');
        }

        // Fetch the purchase record for the given symbol
        const purchase = await Purchase.findOne({ where: { symbol } });

        if (!purchase) {
            return res.status(404).send('Purchase not found');
        }

        // Retrieve current quantity and average buy price
        const currentQuantity = purchase.quantity;
        const averageBuyPrice = purchase.price;

        if (parsedQuantity > currentQuantity) {
            return res.status(400).send('Quantity to sell exceeds current quantity');
        }

        // Calculate total buy cost and total sell revenue
        const totalBuyCost = averageBuyPrice * parsedQuantity;
        const totalSellRevenue = parsedSellPrice * parsedQuantity;
        const profitLoss = totalSellRevenue - totalBuyCost;

        // Update or delete the purchase record
        if (parsedQuantity === currentQuantity) {
            // Remove the record if the quantity becomes zero
            await purchase.destroy();
        } else {
            // Update the quantity
            const newQuantity = currentQuantity - parsedQuantity;
            await purchase.update({ quantity: newQuantity });
        }

        // Log profit/loss for debugging
        console.log(`Profit/Loss for ${symbol}: ${profitLoss.toFixed(2)}`);

        // Redirect to portfolio page
        res.redirect('/portfolio');
    } catch (error) {
        console.error('Error handling sell request:', error);
        res.status(500).send('Internal Server Error');
    }
});





app.post('/addWatch/:symbol', async (req, res) => {
    const symbol = req.params.symbol;

    try {
        const exists = await Watchlist.findOne({ where: { symbol } });

        if (exists) {
            console.log(`Symbol ${symbol} already exists in watchlist.`);
        } else {
            await Watchlist.create({ symbol });
            console.log(`Symbol ${symbol} added to watchlist.`);
        }
        res.redirect('/watchlist');
    } catch (error) {
        console.error('Error saving watchlist:', error);
        res.status(500).send('Internal Server Error');
    }
});

app.get('/remove/:symbol', async (req, res) => {

    const symbol = req.params.symbol;

    res.render('remove', {
        symbol: symbol
    })

})


// Remove a stock from the watchlist
app.post('/watchlist/remove/:symbol', async (req, res) => {
    const { symbol } = req.params;

    try {
        await Watchlist.destroy({ where: { symbol } });
        res.redirect('/watchlist');
    } catch (error) {
        console.error('Error removing from watchlist:', error);
        res.status(500).send('Internal Server Error');
    }
});

app.get('/add/:symbol', async (req, res) => {

    const symbol = req.params.symbol;

    res.render('add', {
        symbol: symbol
    })

})

app.get('/watchlist', async (req, res) => {
    try {
        const watchlistItems = await Watchlist.findAll();

        const watchlistWithPrices = await Promise.all(watchlistItems.map(async (watchlist) => {

            const watchlistData = watchlist.toJSON();
            const symbol = watchlistData.symbol;
            let livePrice;
            try {
                livePrice = await getLTP(symbol)
            } catch (error) {
                console.log("Error in watchlist");
                livePrice = NaN;
            }

            return {
                ...watchlistData,
                livePrice
            }

        }));



        res.render('watchlist', { watchlistItems: watchlistWithPrices });
    } catch (error) {
        console.error('Error fetching watchlist:', error);
        res.status(500).send('Internal Server Error');
    }
});




app.listen(PORT, () => console.log("Server launched"));