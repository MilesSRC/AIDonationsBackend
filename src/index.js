require('dotenv').config();

// Express
const express = require('express');
const app = express();

// Database
const database = require('monk')(process.env.DATABASE);
const donations = database.get("donations");
const donators = database.get('donators');
const errors = database.get("errors");

// Middlewares
app.use(express.json())
app.use(require('morgan')('dev'));
app.use(function(req, res, next){
    if(!req.headers["rblxsec"])
        return res.status(403).send({ message: "Not allowed1!" });
    
    if(req.headers["rblxsec"] != process.env.SEC)
        return res.status(403).send({ message: "Not allowed2!" });

    next();
})

// Quick Functions
function parseAmount(id){
    switch(id){
    // 25 - 1216919519
    // 100 - 1216919827
    // 500 - 1216919821
    // 1000 - 1216919823
    // 5000 - 1216919822
        case '1216919519':
            return 25;
        case '1216919827':
            return 100;
        case '1216919821':
            return 500;
        case '1216919823':
            return 1000;
        case '1216919822':
            return 5000;
        default:
            return null;
    }
}

// Paths
app.get('/donations', function(req, res){
    donations.count({}, {estimate: true}).then(amount => res.send(amount.toString()));
});

app.get('/donators/top', function(req, res){
    donators.find({}, { limit: 10, sort: { donated: -1 }}).then(result => res.send(result));
})

app.get('/donations/recent', function(req, res){
    donations.find({}, { limit: 10, sort: { created: -1 }}).then(result => res.send(result));
})

app.post('/donation', async function(req, res){
    var body = req.body;
    if(!body.PurchaseId || !body.PlayerId || !body.ProductId)
        return res.status(400).send({ message: "Missing PurchaseId, PlayerId, or ProductId" });

    const purchase = {
        id: body.PurchaseId,
        player: body.PlayerId,
        product: body.ProductId,
        amount: parseAmount(body.ProductId),
        created: Date.now()
    }

    if(!purchase.amount){
        errors.insert(purchase);
        return res.status(400).send({ message: "Product ID not registered! Cached."});
    }

    var donator = await donators.findOne({ id: body.PlayerId });
    if(!donator){
        var donator = {
            id: body.PlayerId,
            donated: purchase.amount,
            created: Date.now(),
            lastUpdated: Date.now()
        };

        await donators.insert(donator);
    } else {
        await donators.findOneAndUpdate({ id: body.PlayerId }, { $set: { donated: donator.donated + purchase.amount, lastUpdated: Date.now() }  });
    }

    await donations.insert(purchase);
    res.status(201).send({ message: "Created!" });
});

app.post('/donations/clear', async function(req, res){
    donations.find({}).each((donation, {close, pause, resume}) => {
        donations.findOneAndDelete({ id: donation.id });
    }).then(() => {
        res.send("Cleared.")
    })
});

app.post('/donators/clear', async function(req, res){
    donators.find({}).each((donator, {close, pause, resume}) => {
        donators.findOneAndDelete({ id: donator.id });
    }).then(() => {
        res.send("Cleared.")
    })
})

// Listen
app.listen(process.env.PORT || 8090, function(){
    console.log("Listening...");
})

// Trasher
setInterval(async () => {
    var count1 = await donations.count();
    var count2 = await donators.count();

     if(count1 >! 100 || count2 >! 20)
         return;

    // GO
    var donati = await donations.find({}, { limit: 100, sort: { created: 1 }});
    var donator = await donators.find({}, { limit: 20, sort: { lastUpdated: 1 }});

    donati.forEach((key) => { 
        if((Date.now() - key.created) > 1209600000){ // 14 days
            donations.findOneAndDelete({ id: key.id });
        }
    });

    donator.forEach((key) => {
        if((Date.now() - key.lastUpdated) > 7776000000){ // 90 days
            donators.findOneAndDelete({ id: key.id });
        }
    })
}, 60 * 60000) // Trasher runs every hour