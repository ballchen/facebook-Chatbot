var express = require('express');
var fb = require('./fb')
var bodyParser = require('body-parser');
var app = express();
var port = 6667;



fb.login(function(err, fbuser){
	if(err){
		console.log(err)
	}
	else{
		console.log('logged in!')
		//stay online
		fb.pingpong(fbuser);
		//listen to messages
		// fb.get_messages();
		// fb.get_friends();
		// fb.get_buddy(fbuser)
		// 
		app.use(bodyParser.json());
		app.use(bodyParser.urlencoded({ extended: true }));

		app.use(express.static(__dirname + '/public'));

		app.get('/', function(req, res){
			console.log('get')
			// res.send('ok')
			res.sendFile('/public/index.html' )
		})

		app.get('/api/send', function(req, res){
			// res.send('go')
			fb.send_messages('100002590277281');
			res.send('go');
		})

		app.listen(3000);
	}
})

