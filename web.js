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
var start_date = new Date(2013, 08, 30);

var app = express();
app.set('views', __dirname + '/views');
app.set('view engine', 'ejs');
app.set('port', process.env.PORT || 8080);

app.use(express.static(__dirname + '/public')); // images
// Render homepage (note trailing slash): example.com/
app.get('/', function(request, response) {

    // var data = fs.readFileSync('index.html').toString();
    // response.send(data);

    //it's a paypal failed?
    var message = "";

    if (request.query.paypal == "failed") {
        console.log("failed");
        message = "failed";
    }
    else if (request.query.paypal == "success") {
        console.log("success");
        message = "success";
    }

    //get the amount of money async.
    //obtain data.
    global.db.Order.findAll().success(function(orders) {
        var backers = 0;
        var amount = 0;

        orders.forEach(function(order) {
            backers++;
            amount += order.amount;
        });

        //calculate date diff.  
        var today = new Date();
        var diff = Math.round((start_date.getDate() - today.getDate() / (1000 * 60 * 60 * 24)));



        //percentage 100:limit_line = x : amount
        var amount_percentage = Math.round((amount * 100) / limit_line);
        //remains
        var remains_percentage = 100 - amount_percentage;

        response.render("index", {message: message, backers: backers, amount: amount, limit_line: limit_line, date_diff: diff, amount_percentage: amount_percentage, remains_percentage: remains_percentage});

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
    response.redirect('/?paypal=failed');

});

app.get('/paypal_success', function(request, response) {

    //TODO: control if it's really a paypal payment

    console.log('someone pay!');

    //semplified express edition
    var payment_value = request.query.order;

    //TODO: AddOrder

    //var order_ins = [{coinbase_id: "Paypal Donator", amount: payment_value, time: Date.now().toString() }];

    //async.forEach(order_ins, addOrder, function(err) {
    //  if (err) {
    //    console.log(err);
    //      response.send("error adding orders");
//        } else {
//            // orders added successfully
//            response.redirect('/?paypal=success');
//        }
//    });

    var Order = global.db.Order;

    Order.create({
        coinbase_id: 'Paypal Donator3',
        amount: payment_value,
        time: Date().toString()
    }).success(function(john) {
         response.redirect('/?paypal=success&order='+ payment_value );
          console.log('Inserted into DB');
    }).error(function() {
        console.log('H. have a problem');
            response.redirect('/?paypal=failed' );
    });


});


// Hit this URL while on example.com/orders to refresh
app.get('/refresh_orders', function(request, response) {
    https.get("https://coinbase.com/api/v1/orders?api_key=" + process.env.COINBASE_API_KEY, function(res) {
        var body = '';
        res.on('data', function(chunk) {
            body += chunk;
        });
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
