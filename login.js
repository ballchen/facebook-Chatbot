var cheerio = require('cheerio');
var fs = require('fs');
var request = require('request');
var tough = require('tough-cookie');
var _ = require('underscore');
var async = require('async');
var secret = require('./secret.js');
var CronJob = require('cron').CronJob;


var message = 'https://www.facebook.com/ajax/mercury/send_messages.php';
var friends = 'https://www.facebook.com/friends'



//initial a cookie jar to save the session
var j = request.jar(); 
var fbrequest = request.defaults({
	headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 5.1; rv:31.0) Gecko/20100101 Firefox/31.0'
    },
    jar: j
})

// let fb know you are alive 
var pingpong = function(fbid){
	var ping = 'https://3-edge-chat.facebook.com/active_ping?channel=p_'+fbid+'&partition=-2&clientid=67c47f2f&cb=hsod&cap=8&uid='+fbid+'&viewer_uid='+fbid+'&sticky_token=444&sticky_pool=ash2c07_chat-proxy&state=active'
	var job = new CronJob({
	  cronTime: '0 * * * * *',
	  onTick: function() {
	  	fbrequest({
	  		method: "GET",
	  		url: ping
	  	},function(err, httpResponse, body){
	  		if(body){
	  			console.log(body);
	  		}
	  	})
	  },
	  start: false,
	  timeZone: "Asia/Taipei"
	});

	job.start();
}


var login = function(callback){
	console.log('login....')
	fbrequest({
		method: 'GET',
		url: 'https://www.facebook.com/login.php',
	}, function(err, httpResponse, body){
		if(err) return callback('error:1')

		$ = cheerio.load(body);
		var login_form = new Object();
		$('form#login_form input').each(function(i, elem){
			login_form[$(this).attr('name')] = $(this).attr('value')
		})

		login_form.pass = secret.password
		login_form.email = secret.email
		fbrequest({
			method: 'POST',
			url: 'https://www.facebook.com/login.php',
			form: login_form,
		}, function(err, httpResponse, body){
			if(err) console.log(err)
			
			fbrequest({
				method:'GET',
				url: 'https://www.facebook.com'
			}, function(err, httpResponse, body){

				console.log('logged in!')

				fb_userid = (body.split(/USER_ID":"(\d+)/)[1]);
				fb_dtsg = (body.split(/fb_dtsg" value="(.*?)"/)[1]);

				var fbuser = {
					id: fb_userid,
					dtsg: fb_dtsg
				}

				if(fb_userid == '0'){
					callback('error:2')
				}else{
					console.log('User_id: '+fb_userid)
					callback(null, fbuser);
				}	
			})
		})
	})	
}


var get_messages = function(seq, callback){

	var url = 'https://3-edge-chat.facebook.com/pull?channel=p_'+fb_userid+'&partition=-2&clientid=67c47f2f&cb=hsod&cap=8&uid='+fb_userid+'&viewer_uid='+fb_userid+'&sticky_token=444&sticky_pool=ash2c07_chat-proxy&state=active'
	if(seq) url = url+'&seq='+seq;
	fbrequest({
		method: 'GET',
		url: url,
		timeout: 60000
	}, function(err, httpResponse, body){
		var cuthead = /for \(;;\); (.+)/

		var raw = JSON.parse(cuthead.exec(body)[1])
		// console.log(raw.seq);
		if(raw.ms){
			_.each(raw.ms, function(elem){
				if(elem.type == 'm_messaging' && elem.event != 'read' && elem.author_fbid != fb_userid){
					
					//person message
					if(elem.tid.substr(0,3) == 'mid'){
						console.log('[個人] '+elem.author_name+"("+elem.author_fbid+"): "+elem.message)
						// send_messages(elem.author_fbid)
						search_user(fb_userid, [elem.author_fbid], function(err, result){

						});
					}

					//group message
					else if(elem.tid.substr(0,3) == 'id.'){
						var thread_fbid = elem.tid.split(/id\.(.+)/)[1]
						console.log('[群組] '+elem.thread_name+"("+thread_fbid+"): "+elem.message)
						// send_messages(elem.author_fbid, thread_fbid)
					}
					
				}
			})
		}

		get_messages(raw.seq);
	})
}

var send_messages = function(receiver, tid){
	data = {
        "message_batch[0][action_type]": "ma-type:user-generated-message",
        "message_batch[0][author]": "fbid:"+fb_userid,
        "message_batch[0][source]": "source:chat:web",
        "message_batch[0][body]": '＠＠',
        "message_batch[0][signatureID]": "3c132b09",
        "message_batch[0][ui_push_phase]": "V3",
        "message_batch[0][status]": "0",
        "message_batch[0][has_attachment]":true,
		"message_batch[0][sticker_id]":1530358417204967,
        
        "client": "mercury",
        "__user": fb_userid,
        "__a": "1",
        "__dyn": "7n8anEBQ9FoBUSt2u6aAix97xN6yUgByV9GiyFqzQC-C26m6oDAyoSnx2ubhHAyXBBzEy5E",
        "__req": "c",
        "fb_dtsg": fb_dtsg,
        "ttstamp": "26581691011017411284781047297",
        "__rev": "1436610",
    }

	if(tid){
		data['message_batch[0][thread_fbid]'] = tid
	}

	if(!tid){
		var persondata = {
			"message_batch[0][specific_to_list][0]": "fbid:"+receiver, //this is receiver
        	"message_batch[0][specific_to_list][1]": "fbid:"+fb_userid, //this is sender
		}
		data = _.extend(data, persondata);
	}


    fbrequest({
		method: 'POST',
		url: message,
		form: data
	}, function(err, httpResponse, body){
		console.log("已回復")
	})
}

var search_user = function(fbid, ids, callback){
	var search = 'https://www.facebook.com/chat/user_info/?__user='+fbid+'&__a=1&__dyn=7nm8RW8BgCBynzpQ9UoGya4Au74qbx2mbAKGiyFqzQC-C26m5-9V8CdDx2ubhHximmey8szoyfwgo&__req=j&__rev=1579293'
	_.each(ids, function(elem, idx){
		search += '&ids['+idx+']='+elem;
	}) 
	// console.log(search)
	// 'ids[0]=100002343712028&ids[1]=100002343712028'
	// 
	fbrequest.get(search, function(err, httpResponse, body){
		if(err) callback(err);
		var cuthead = /for \(;;\);(.+)/
		var raw = JSON.parse(cuthead.exec(body)[1])

		callback(null, raw.payload.profiles)
	})
}

var main = function(){
	login(function(err, fbuser){
		if(err){
			console.log(err)
		}
		else{
			pingpong(fbuser);
			get_messages();
		}
	})
}

main()
