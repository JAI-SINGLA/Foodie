const express = require("express");
const cookieParser= require("cookie-parser");
const path = require("path");
const mongoose= require("mongoose");
const session= require('express-session');
const passport= require("passport"),LocalStrategy = require('passport-local').Strategy;
const https = require('https');
const checksum_lib=require('./paytm/checksum.js');
const qs = require('querystring');


const port=8000;
const app = express();
app.set("view engine","ejs");
app.set("views",path.join(__dirname,"/views"));
app.use(express.urlencoded({extended:false}));
const parseUrl=express.urlencoded({extended:false});
app.use(express.json({ extended: false }));
const parseJson=express.json({ extended: false });
app.use(express.static("assests"));
app.use(cookieParser());

app.use(session({
	name:"tomato",
	secret:"allo",
	saveUninitialized:false,
	resave:false,
	cookie:{
		maxAge:(1000*60*100)
	}
}));

mongoose.connect('mongodb://localhost/myDB', {useNewUrlParser: true, useUnifiedTopology: true});

const db = mongoose.connection;
db.on('error', console.error.bind(console, 'connection error:'));
db.once('open', function() {
  console.log("Sucessfully Connected to database");
});
const restuarantSchema= new mongoose.Schema({
	name:String,
	password:{
		type:String,
		required:true
	},
	email:{
		type:String,
		required:true,
		unique:true
	},
	image:String,
	items:[
	{
		itemName:String,
		itemPrice:Number,
		itemImage:String
	}],
	orders:[
	{orderId: String}
	],
	delivery:[{
		pincode:Number,
		area:String,
		time:String,
		price:Number
	}],
},{
	timestamps:true
});

const userSchema= new mongoose.Schema({
	email:{
		type:String,
		unique:true,
		required:true
	},
	password:{
		type:String,
		required:true
	},
	name:{
		type:String
	},
	address:[{
		name:String,
		pincode:Number,
		area:String,
		city:String,
		state:String,
		details:String,
		phone:{
			type:String,
		}
	}],
	cart:[{
		restaurantId:String,
		itemId:String,
		quantity:Number,

	}],
	orders:[{orderId:String}]

},{timestamps:true});

const orderSchema = new mongoose.Schema({
	_id:String,
	txnId:String,
	txnDate:String,
	orderAmount:Number,
	paymentStatus:String,
	paymentMethod:String,
	order:[{
		quantity:Number,
		restaurantId:String,
		restaurantName:String,
		itemId:String,
		itemName:String,
		itemImage:String,
		status:String,
		amount:Number,
		delivery:String,
		deliveryTime:String
	}],
	customerId:String
},{_id:false,
timestamps:true});

const Restaurant= mongoose.model("Restaurant",restuarantSchema);
const User=mongoose.model("User",userSchema);
const Order=mongoose.model("Order",orderSchema); 


passport.use(new LocalStrategy({
	usernameField:'email'
},
  function(email, password, done) {
    User.findOne({ email: email }, function (err, user) {
      if (err) { return done(err); }
      if (!user) { return done(null, false); }
      if (user.password!=password) { return done(null, false); }
      return done(null, user);
    });
  }
));

passport.serializeUser(function(user, done) {
  done(null, user.id);
});



passport.deserializeUser(function(id, done) {
  User.findById(id, function(err, user) {
  	if(err){
  		return done(err);
  	}
    return done(null, user);
  });
});


passport.checkAuthentication=function(req,res,next){
	if(req.isAuthenticated()){
		res.locals.loggedIn=true;
		return next();
	}
	return res.redirect("/login");
}

passport.setAuthenticatedUser =function(req,res,next){
	if(req.isAuthenticated()){
		res.locals.loggedIn=true;
		res.locals.user=req.user;
	}
	next();
}
app.use(passport.initialize());
app.use(passport.session());
app.use(passport.setAuthenticatedUser);



app.get("/",function(req,res){
	Restaurant.find({},function(err,restaurants){
		if(err){
			console.log("err");
			return;
		}
		else{
			if(req.isAuthenticated()){
				res.locals.loggedIn=true;
				return res.render("index",{
		    "restuarants":restaurants
	});
			}
			else{
				res.locals.loggedIn=false;
				return res.render("index",{
		    "restuarants":restaurants
	});
			}
			//console.log(restaurants);
		}
	});
});

app.get("/login",function(req,res){
	if(req.isAuthenticated()){
		res.locals.loggedIn=true;
		return res.redirect("/");
	}
	else{
		res.locals.loggedIn=false;
		res.render("login");
	}
});
app.get("/signup",function(req,res){
	if(req.isAuthenticated()){
		res.locals.loggedIn=true;
		return res.redirect("/");
	}
	else{
		res.locals.loggedIn=false;
		res.render("signup");
	}
});

app.get("/signout",function(req,res){
	res.locals.loggedIn=false;
	req.logout();
	return res.redirect("/");
});

app.get("/address",function(req,res){
	if(!req.isAuthenticated()){
		return res.redirect("/login");
	}
	else{
		res.render("address");
	}
})


app.get("/restaurants/name/:id",function(req,res){
	Restaurant.findById(req.params.id,function(err,restaurant){
		if(err){
			console.log(err);
			return res.redirect("back");
		}
		if(restaurant){
			res.render("restaurant",{
		specificRestaurant:restaurant
	});
		}
		if(!restaurant){return res.redirect("back")};
	});
});
app.get("/cart/item/delete/:rId/:iId",function(req,res){

	if(req.isAuthenticated()){
		for(i of req.user.cart){
			if(i.restaurantId==req.params.rId && i.itemId==req.params.iId){
				req.user.cart.pull(i._id);
				req.user.save(function(err){
				if(!err){
					return res.redirect("/cart");
				}
			});
		}}
		}
	else{
		return res.redirect("back");
	}
});

app.get("/user/account",passport.checkAuthentication,function(req,res){
	return res.render("account")
});
app.get("/address/delete/:id",function(req,res){
	if(req.isAuthenticated()){
		req.user.address.pull(req.params.id);
		req.user.save(function(err){
			if(!err){
				res.redirect("/user/account");
			}
		});
   }
   else{
	res.redirect("/");
	}
});

app.get("/cart",async function(req,res){
	if(req.isAuthenticated()){
		let restaurantName=new Array();
		let item=new Array();
		let quantity=new Array();
		for(let i of req.user.cart){
			//console.log(i);
			quantity.push(i.quantity);
			try{await Restaurant.findById(i.restaurantId,function(err,restaurant){
				if(err){
					console.log("Error: ",err);
					return res.redirect("back");
				}
				if(restaurant){
				//console.log(restaurantName);
				let myFlag=0;
				for(let j of restaurant.items){
					if(j._id==i.itemId){
					myFlag=1;
					 item.push(j);
					 restaurantName.push(restaurant)
						break;
					}

				}
				if(myFlag=0){
					res.redirect("/delete/restaurant._id/i.itemId");
				}
			}

			});}catch(e){
				console.log(e);
			}
		}
		return res.render("cart",{
			restaurantName:restaurantName,
			item:item,
			quantity:quantity
		});
	}
	else{
		return res.redirect("/login");
	}
});

app.get("/cart/item/:add/:rId/:iId/:qn",async function(req,res){
		if(req.isAuthenticated()){
				try{for(let i of req.user.cart){
					let userId=req.user._id;
					if(i.restaurantId==req.params.rId && i.itemId==req.params.iId){
						if(req.params.add=="minus"){
						await User.updateOne({_id:userId,"cart.itemId":req.params.iId}, {'$set': {
    						'cart.$.quantity':i.quantity-1
							}});
							return res.redirect("/cart");
					}else if(req.params.add=="plus"){
							await User.updateOne( {_id:userId,"cart.itemId":req.params.iId},{'$set': {
   		 'cart.$.quantity':i.quantity+1
				}});
							return res.redirect("/cart");
						}
					else{
						return res.redirect("/cart");
					}
					}
				}}catch(e){
					console.log(e);
				}
		}
		else{
			return res.redirect("/login");
		}

});



app.post("/account/address",function(req,res){
	if(req.isAuthenticated()){
		var newAddress={
		name:req.body.name,
		pincode:req.body.zip,
		state:req.body.state,
		phone:req.body.phone,
		details:req.body.allDetails,
		area:req.body.area,

		}
		req.user.address.push(newAddress);
		req.user.save(function(err){
			if(!err){
				res.redirect("/user/account");
			}
		});
	}
	else{
		res.redirect("/login");
	}
});
app.get("/cart/:iId/:rId",function(req,res){
	if(req.isAuthenticated()){
		let cartProduct={
			restaurantId:req.params.rId,
			itemId:req.params.iId,
			quantity:1
		}
		req.user.cart.push(cartProduct);
		req.user.save(function(err){
			if(!err){
				res.redirect("/cart");
			}
		});
	}
	else{
		res.redirect("/login");
	}
});
app.post("/signup",function(req,res){
	if(req.body.password!=req.body.confirmPassword){
		return res.redirect("/signup");
	}
	User.findOne({email:req.body.email},function(err,user){
		if(err){
			console.log("Error");
			return;
		}
		if(!user){
			User.create({
				email:req.body.email,
				password:req.body.password
			},function(err){
				if(!err){
					return res.redirect("/login");
				}
			});
		}
		else{
			return res.redirect('back');
		}
	});
});


app.post('/paynow', [parseUrl, parseJson], async(req, res) => {
	try{
	if(!req.isAuthenticated()){
		return res.redirect("/login");
	}
	if(req.user.address.length==0){
		console.log("In address Length");
		return res.redirect("back");
	}
	var checkRes=[];
	var order=[];
	var price=0;
	var totalPrice=0;
	var deliveryPrice=0;
	var orders=[];

	for(i of req.user.cart){
		let flag=0;
		let specificOrder={};
		await Restaurant.findById(i.restaurantId,function(err,restaurant){
			// console.log(restaurant);
			// console.log(req.user.address[0].pincode);
			for(k of restaurant.delivery){
				if(k.pincode==req.user.address[0].pincode && k.area==req.user.address[0].area){
					console.log("delivery available");
					specificOrder.deliveryTime=k.time;
					flag=1;
					specificOrder.restaurantId=restaurant.id;
					specificOrder.restaurantName=restaurant.name;
					if(!checkRes.includes(restaurant.id)){
						deliveryPrice+=k.price;
						checkRes.push(restaurant.id);
						specificOrder.delivery=k.price.toString();

					}else{
						specificOrder.delivery="0";
					}
					for(j of restaurant.items){
					if(j.id==i.itemId){
						console.log("Item Found");
						price+=j.itemPrice*i.quantity;
						specificOrder.quantity=i.quantity;
						specificOrder.itemId=i.itemId;
						specificOrder.itemName=j.itemName;
						specificOrder.itemImage=j.itemImage;
						specificOrder.amount=(j.itemPrice*i.quantity).toString();
						specificOrder.quantity=i.quantity.toString();
						break;
				}
			}
				break;
				}
			}
		});
		console.log(flag);
		if(flag==0){
			return res.redirect("/cart");
		}
		orders.push(specificOrder);
	}
	totalPrice=price+deliveryPrice;
	
	var myId=req.user.id +"5523"+new Date().getTime();
	var orderId={
		orderId:myId
	}

	await Order.create({
		_id:myId,
		orderAmount:totalPrice,
		customerId:req.user.id,
		order:orders,
		paymentStatus:"pending"
	},function(err){
		if(err){
			console.log(err);
		}
	});
	req.user.orders.push(orderId);
	req.user.save();
	console.log("CheckRes");
	console.log(checkRes);
	for(let k=0;k<checkRes.length;k++){
		let id = mongoose.Types.ObjectId(checkRes[k]);
		await Restaurant.findById(id,function(err,restaurant){
			console.log(restaurant);
			if(!err){
				if(restaurant){
				restaurant.orders.push(orderId);
				restaurant.save();
			}
			else{
				console.log("Didn't Match");
			}
			}
		});
	}
}catch(e){
	console.log("ERRor");
}
	var paytmParams = {


            /* Find your MID in your Paytm Dashboard at https://dashboard.paytm.com/next/apikeys */
    
            "MID": "XWdbcZ52997974087537",


            /* Find your WEBSITE in your Paytm Dashboard at https://dashboard.paytm.com/next/apikeys */
            "WEBSITE": "WEBSTAGING",


            /* Find your INDUSTRY_TYPE_ID in your Paytm Dashboard at https://dashboard.paytm.com/next/apikeys */
            "INDUSTRY_TYPE_ID": "Retail",


            /* WEB for website and WAP for Mobile-websites or App */
            "CHANNEL_ID": "WEB",
            /* Enter your unique order id */
            "ORDER_ID": myId,


            /* unique id that belongs to your customer */
            "CUST_ID": req.user.id,


            /* customer's mobile number */
            "MOBILE_NO": req.user.address[0].phone,


            /* customer's email */
            "EMAIL": req.user.email,
             /**
             * Amount in INR that is payble by customer
             * this should be numeric with optionally having two decimal points
             */
            "TXN_AMOUNT": totalPrice.toString(),


            /* on completion of transaction, we will send you the response on this URL */
            "CALLBACK_URL": "http://localhost:8000/callback",
        };
        console.log(paytmParams);
        /**
         * Generate checksum for parameters we have
         * Find your Merchant Key in your Paytm Dashboard at https://dashboard.paytm.com/next/apikeys 
         */
            checksum_lib.genchecksum(paytmParams, "war1bWLyTR6%s4Ae", function (err, checksum) {


            /* for Staging */
             var url = "https://securegw-stage.paytm.in/order/process";


            /* for Production */
            //var url = "https://securegw.paytm.in/order/process";
            /* Prepare HTML Form and Submit to Paytm */
            res.writeHead(200, {
                'Content-Type': 'text/html'
            });
            res.write('<html>');
            res.write('<head>');
            res.write('<title>Merchant Checkout Page</title>');
            res.write('</head>');
            res.write('<body>');
            res.write('<center><h1>Please do not refresh this page...</h1></center>');
            res.write('<form method="post" action="' + url + '" name="paytm_form">');
            for (var x in paytmParams) {
                res.write('<input type="hidden" name="' + x + '" value="' + paytmParams[x] + '">');
            }
            res.write('<input type="hidden" name="CHECKSUMHASH" value="' + checksum + '">');
            res.write('</form>');
            res.write('<script type="text/javascript">');
            res.write('document.paytm_form.submit();');
            res.write('</script>');
            res.write('</body>');
            res.write('</html>');
            res.end();
        });
    });
app.post('/callback', (req, res) => {
	var paramlist = req.body;
    var paramarray = new Array();
    console.log(paramlist);
    var paytmParams = {};
    for (var key in paramlist) {
        if (key == "CHECKSUMHASH") {
            paytmChecksum = paramlist[key];
        } else {
            paytmParams[key] = paramlist[key];
        }


    }


    /**
     * Verify checksum
     * Find your Merchant Key in your Paytm Dashboard at https://dashboard.paytm.com/next/apikeys 
     */
    var isValidChecksum = checksum_lib.verifychecksum(paytmParams, "war1bWLyTR6%s4Ae", paytmChecksum);


    if (isValidChecksum) {
        console.log("Checksum Matched");
        console.log(paytmParams);
        console.log("true");
        if (paytmParams['STATUS'] == 'TXN_SUCCESS') {
            //FOR SUCCESS
       				console.log("Transaction Sucessful");
       				//res.send('<h1>Transaction Sucess:)</h1><p>Redirecting</p>');




        }
        //FOR FAILURE
        else if (paytmParams['STATUS'] == 'TXN_FAILURE') {

        	//res.send('<h1>Transaction Failed! </h1><p>Redirecting</p>')
           console.log("FAILURE");


        }
        console.log("Hi! I ma here!");
        return res.render('order_intermediate', {
        	'restdata': "true",
            'paramlist': paytmParams
        });
    } else {


        console.log("false");


        res.render('order_intermediate', {
            'restdata': "false",
            'paramlist': paytmParams
        });
    }



});

app.post("/order-intermediate",async function(req,res){
	if(req.isAuthenticated()){	try{
		console.log(req.body);
		console.log(req.body.txnStatus);
	await Order.update({_id:req.body.orderId}, 
    {paymentStatus:req.body.txnStatus,txnId:req.body.txnId,txnDate:req.body.txnDate,paymentMethod:req.body.bank},{multi:true},function (err, docs) {
    if (err){
        console.log(err);
    }
    else{
        console.log("Updated Docs : ", docs);
    }
});
		if(req.body.txnStatus=="TXN_SUCCESS"){
	await User.update({},{$pull:{cart:{}}},{multi:true});

}

	res.redirect("/order");

}catch(err){
	if(err){
		console.log("Error");
	}
}}
else{
	res.redirect("/login");
}

})

app.get("/order",async function(req,res){try{
	var allOrders=[];
	if(req.isAuthenticated()){
		for(i of req.user.orders){
			console.log(typeof i.orderId);
			await Order.findById(i.orderId, function (err, docs) {
				//console.log("Id",i.orderId);
    if (err){
        console.log(err);
    }
    else{
    	//console.log(docs);
        for(j of docs.order){
        	console.log(j);
        	var specificOrder={
        		orderId:i.orderId,
        		itemName:j.itemName,
        		itemImage:j.itemImage,
        		quantity:j.quantity,
        		restaurantName:j.restaurantName,
        		amount:j.amount,
        		delivery:j.delivery,
        		deliveryTime:j.deliveryTime,
        		txnId:docs.txnId,
        		txnDate:docs.txnDate,
        		restaurantId:j.restaurantId
        	}
        	if(j.status){
        		specificOrder.status=j.status;
        	}
        	else{
        		specificOrder.status=docs.paymentStatus;
        	}
        	allOrders.push(specificOrder);
        	console.log("Checking all orders");
        	//console.log(allOrders);
        }
    }
});
		}
		res.render("order",{
			allOrders:allOrders
		});
	}
	else{
		res.redirect("/login");
	}}catch(err){
		console.log(err);
	}
})

app.post('/login',
  passport.authenticate('local', { successRedirect: '/',
                                   failureRedirect: '/login',
                                   failureFlash: true })
);
app.listen(port,function(err){
	if(err){
		console.log("Error! ",err);
		return;
	}
	console.log("Server is runing on port: ",port);
});