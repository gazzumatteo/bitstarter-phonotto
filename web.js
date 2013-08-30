// Define routes for simple SSJS web app.
// Writes Coinbase orders to database.
var async = require('async')
        , express = require('express')
        , fs = require('fs')
        , http = require('http')
        , https = require('https')
        , db = require('./models')
        , qs = require('querystring')
        , url = require('url');

var limit_line = 10000;
var start_date = new Date(2013, 08 , 30 )

var app = express();
app.set('views', __dirname + '/views');
app.set('view engine', 'ejs');
app.set('port', process.env.PORT || 8080);

app.use(express.static(__dirname + '/public')); // images
// Render homepage (note trailing slash): example.com/
app.get('/', function(request, response) {
    
   // var data = fs.readFileSync('index.html').toString();
   // response.send(data);
    
    //get the amount of money async.
    //obtain data.
    global.db.Order.findAll().success(function (orders){
        var backers = 0;
        var amount = 0;
        
        orders.forEach(function(order) {
            backers ++;
            amount += order.amount;
        });
        
        //calculate date diff.  
        var today = Date();
        var diff = start_date -  today;
        
        //percentage (limit_line/amount)*100
        var amount_percentage = Math.round((limit_line/amount)*100);
        var remains_percentage = 100-amount_percentage;
        
        response.render("index", {backers: orders_json , amount: amount  , limit_line: limit_line , date_diff: diff , amount_percentage: amount_percentage , remains_percentage: remains_percentage });
       
    }).error(function(err) {
        console.log(err);
        response.send("error retrieving amounts");
    });  

    
});

// Render example.com/orders
app.get('/orders', function(request, response) {
    global.db.Order.findAll().success(function(orders) {
        var orders_json = [];
        orders.forEach(function(order) {
            orders_json.push({id: order.coinbase_id, amount: order.amount, time: order.time});
        });
        // Uses views/orders.ejs
        response.render("orders", {orders: orders_json});
    }).error(function(err) {
        console.log(err);
        response.send("error retrieving orders");
    });
});

app.get('/paypal_failed', function(request, response) {

//failed payment, intercept event, redirect to:

    response.writeHead(301, {'Location': '/'});
    response.end();

});

app.get('/payment_success', function(request, response) {

 //TODO: control if it's really a paypal payment

    //semplified express edition
    var payment_value = request.query.order;
    
    //TODO: AddOrder
    global.db.Order.insert({coinbase_id: "Paypal Donator", amount: payment_value, time: Date.now().toString()})

    response.writeHead(301, {'Location': '/'});
    response.end();

});




// Hit this URL while on example.com/orders to refresh
app.get('/refresh_orders', function(request, response) {
    https.get("https://coinbase.com/api/v1/orders?api_key=" + process.env.COINBASE_API_KEY, function(res) {
        var body = '';
    res.on('data', function(chunk) {body += chunk;});
        res.on('end', function() {
            try {
                var orders_json = JSON.parse(body);
                if (orders_json.error) {
                    response.send(orders_json.error);
                    return;
                }
                // add each order asynchronously
                async.forEach(orders_json.orders, addOrder, function(err) {
                    if (err) {
                        console.log(err);
                        response.send("error adding orders");
                    } else {
                        // orders added successfully
                        response.redirect("/orders");
                    }
                });
            } catch (error) {
                console.log(error);
                response.send("error parsing json");
            }
        });

        res.on('error', function(e) {
            console.log(e);
            response.send("error syncing orders");
        });
    });

});

// sync the database and start the server
db.sequelize.sync().complete(function(err) {
    if (err) {
        throw err;
    } else {
        http.createServer(app).listen(app.get('port'), function() {
            console.log("Listening on " + app.get('port'));
        });
    }
});

// add order to the database if it doesn't already exist
var addOrder = function(order_obj, callback) {
    var order = order_obj.order; // order json from coinbase
    if (order.status != "completed") {
        // only add completed orders
        callback();
    } else {
        var Order = global.db.Order;
        // find if order has already been added to our database
        Order.find({where: {coinbase_id: order.id}}).success(function(order_instance) {
            if (order_instance) {
                // order already exists, do nothing
                callback();
            } else {
                // build instance and save
                var new_order_instance = Order.build({
                    coinbase_id: order.id,
                    amount: order.total_btc.cents / 100000000, // convert satoshis to BTC
                    time: order.created_at
                });
                new_order_instance.save().success(function() {
                    callback();
                }).error(function(err) {
                    callback(err);
                });
            }
        });
    }
};
