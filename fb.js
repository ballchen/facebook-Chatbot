var cheerio = require('cheerio');
var fs = require('fs');
var request = require('request');
var tough = require('tough-cookie');
var _ = require('underscore');
var async = require('async');
var secret = require('./secret.js');
var CronJob = require('cron').CronJob;
var commands = require('./commands').commands;


var message = 'https://www.facebook.com/ajax/mercury/send_messages.php';
var friends = 'https://www.facebook.com/friends'

var users = {
	'甲豪': '100000187207997',
	'小馬': '100000032300808',
	'坤樸': '758662410890874'
};


//initial a cookie jar to save the session
var j = request.jar();
var fbrequest = request.defaults({
	headers: {
		'User-Agent': 'Mozilla/5.0 (Windows NT 5.1; rv:31.0) Gecko/20100101 Firefox/31.0',
		'Cookie': '_js_reg_fb_gate=https%3A%2F%2Fwww.facebook.com%2F;',
		'referer': 'https://www.messenger.com/'
	},
	jar: j
})



// let fb know you are alive 
exports.pingpong = function(fbid) {
	var ping = 'https://3-edge-chat.facebook.com/active_ping?channel=p_' + fbid.id + '&partition=-2&clientid=67c47f2f&cb=hsod&cap=8&uid=' + fbid.id + '&viewer_uid=' + fbid.id + '&sticky_token=444&sticky_pool=ash2c07_chat-proxy&state=active'
	var job = new CronJob({
		cronTime: '0 * * * * *',
		onTick: function() {
			fbrequest({
				method: "GET",
				url: ping
			}, function(err, httpResponse, body) {
				if (body) {
					// console.log(body);
				}
			})
		},
		start: false,
		timeZone: "Asia/Taipei"
	});

	job.start();
};



exports.login = function login(callback) {
	console.log('login....')
	fbrequest({
		method: 'GET',
		url: 'https://www.facebook.com/login.php',
	}, function(err, httpResponse, body) {
		if (err) return callback('error: login failed.')

		$ = cheerio.load(body);
		var login_form = new Object();
		$('form#login_form input').each(function(i, elem) {
			login_form[$(this).attr('name')] = $(this).attr('value')
		})

		login_form.pass = secret.password
		login_form.email = secret.email
		fbrequest({
			method: 'POST',
			url: 'https://www.facebook.com/login.php',
			form: login_form,
		}, function(err, httpResponse, body) {
			if (err) console.log(err)

			fbrequest({
				method: 'GET',
				url: 'https://www.facebook.com'
			}, function(err, httpResponse, body) {
				console.log('logged in!')

				fb_userid = httpResponse.request.headers.Cookie.match(/c_user\=(.*?)\;/)[1];
				fb_dtsg = (body.split(/fb_dtsg" value="(.*?)"/)[1]);
				fs.writeFileSync('a.json', JSON.stringify(httpResponse));
				var fbuser = {
					id: fb_userid,
					dtsg: fb_dtsg
				};

				if (fb_userid == '0') {
					callback('error:2')
				} else {
					console.log('User_id: ' + fb_userid)
					callback(null, fbuser);
				}
			})
		})
	})
}


exports.get_messages = function get_messages(seq, callback) {
	var spy = false;

	var url = 'https://4-edge-chat.facebook.com/pull?channel=p_' + fb_userid + '&partition=-2&clientid=aff67a3&cb=dlnw&idle=0&cap=8&msgs_recv=13&uid=' + fb_userid + '&viewer_uid=' + fb_userid + '&sticky_token=127&sticky_pool=frc3c04_chat-proxy&traceid=1Nh3x&state=active'
	if (seq) url = url + '&seq=' + seq;
	fbrequest({
		method: 'GET',
		url: url,
		timeout: 60000
	}, function(err, httpResponse, body) {
		var cuthead = /for \(;;\); (.+)/
		var raw = JSON.parse(cuthead.exec(body)[1])
		if (raw.ms) {
			_.each(raw.ms, function(elem) {
				if (elem.type == 'messaging' && elem.event == 'deliver' && elem.message.sender_fbid != fb_userid) {
					//person message
					if (elem.message.thread_fbid == null) {
						console.log('[個人] ' + elem.message.sender_name + "(" + elem.message.sender_fbid + "): " + elem.message.body);

						if (elem.message.sender_fbid == '100002590277281') {
							if (elem.message == 'spy on') {
								spy = true;
								send_messages(elem.message.sender_fbid, null, '竊聽模式已打開');
							} else if (elem.message == 'spy off') {
								spy = false;
								send_messages(elem.message.sender_fbid, null, '竊聽模式已關閉');
							}

						}

						idenify_messages(elem.message.body, function(response) {
							if (response.action == 'back') {
								send_messages(elem.message.sender_fbid, null, response.response);
							} else if (response.action == 'forward') {
								send_messages(response.receiver, null, response.response);
							}
						})

						// search_user(fb_userid, [elem.author_fbid], function(err, result) {

						// });
					}

					//group message
					else if (elem.message.thread_fbid) {
						var thread_fbid = elem.message.thread_fbid;
						console.log('[群組] ' + elem.message.group_thread_info.name + "(" + thread_fbid + "): " + elem.message.body)
							// send_messages(elem.author_fbid, thread_fbid)
					}

				}
			});
		}

		get_messages(raw.seq);
	});
};

var idenify_messages = function(m, callback) {
	var commandtype = m.split(' ')[0];
	if (commands.indexOf(commandtype) >= 0) {
		var getcommand = /^.+? (.+)/


		if (!getcommand.exec(m)) {
			command = '';
		} else {
			command = getcommand.exec(m)[1];
		}

		require('./util/' + commandtype).execute(command, function(response) {
			callback({
				action: 'back',
				response: response
			});
		});
	} else if (m.match(/跟(.+?)說(.+)/)) {
		var who = users[m.match(/跟(.+?)說(.+)/)[1]];
		var what = m.match(/跟(.+?)說(.+)/)[2];

		if (!who) {
			return callback({
				action: 'back',
				response: "我不認識這個人耶QQ"
			});
		}

		callback({
			action: 'forward',
			receiver: who,
			response: what
		});
	}

}

function send_messages(receiver, tid, text, sticker) {
	data = {
		"message_batch[0][action_type]": "ma-type:user-generated-message",
		"message_batch[0][coordinates]": {
			longitude: 121.56495726032,
			latitude: 25.055668592402,
			accuracy: 65
		},
		"message_batch[0][author]": "fbid:" + fb_userid,
		"message_batch[0][source]": "source:chat:web",
		"message_batch[0][body]": text,
		"message_batch[0][signatureID]": "3c132b09",
		"message_batch[0][ui_push_phase]": "V3",
		"message_batch[0][status]": "0",
		"message_batch[0][has_attachment]": false,
		"message_batch[0][sticker_id]": sticker,

		"client": "mercury",
		"__user": fb_userid,
		"__a": "1",
		"__dyn": "7n8anEBQ9FoBUSt2u6aAix97xN6yUgByV9GiyFqzQC-C26m6oDAyoSnx2ubhHAyXBBzEy5E",
		"__req": "c",
		"fb_dtsg": fb_dtsg,
		"ttstamp": "26581691011017411284781047297",
		"__rev": "1436610",
	}

	if (tid) {
		data['message_batch[0][thread_fbid]'] = tid
	}

	if (!tid) {
		var persondata = {
			"message_batch[0][specific_to_list][0]": "fbid:" + receiver, //this is receiver
			"message_batch[0][specific_to_list][1]": "fbid:" + fb_userid, //this is sender
		}
		data = _.extend(data, persondata);
	}


	fbrequest({
		method: 'POST',
		url: message,
		form: data
	}, function(err, httpResponse, body) {
		console.log("已回復")
	})
}

exports.send_messages = send_messages;

exports.search_user = function(fbid, ids, callback) {
	var search = 'https://www.facebook.com/chat/user_info/?__user=' + fbid + '&__a=1&__dyn=7nm8RW8BgCBynzpQ9UoGya4Au74qbx2mbAKGiyFqzQC-C26m5-9V8CdDx2ubhHximmey8szoyfwgo&__req=j&__rev=1579293'
	_.each(ids, function(elem, idx) {
			search += '&ids[' + idx + ']=' + elem;
		}) 
		// console.log(search)
		// 'ids[0]=100002343712028&ids[1]=100002343712028'
		// 
	fbrequest.get(search, function(err, httpResponse, body) {
		if (err) {
			return callback(err);
		}
		var cuthead = /for \(;;\);(.+)/
		var raw = JSON.parse(cuthead.exec(body)[1])
		console.log(raw.payload.profiles);

		callback(null, raw.payload.profiles)
	})
}

exports.get_buddy = function(fbid) {
	fbrequest({
		method: 'POST',
		url: 'https://www.facebook.com/ajax/chat/buddy_list.php',
		form: {
			user: fbid
		}
	}, function(err, httpResponse, body) {
		console.log(body)
	})
}

exports.get_some_friends = function(fbid) {


	get_access_token(fbid, function(err, token) {
		if (err) return console.log('err: get_access_token failed.');

		var url = 'https://graph.facebook.com/me/friends?access_token=' + token;
		fbrequest({
			method: 'GET',
			url: url

		}, function(err, httpResponse, body) {
			var allfriends = JSON.parse(body).data;
			console.log(allfriends)

		});
	})


}


var get_access_token = function(fbid, callback) {
	fbrequest({
		method: 'GET',
		url: 'https://developers.facebook.com/tools/explorer/145634995501895/permissions?version=v2.2&__asyncDialog=3&__user=' + fbid + '&__a=1&__dyn=5U463-i3S2e4oK4pomXWo5O12wAxu3mdwqo&__req=6&__rev=1643773'
	}, function(err, httpResponse, body) {
		if (err) return callback(err);
		var cuthead = /for \(;;\);(.+)/
		try {
			var raw = JSON.parse(cuthead.exec(body)[1])
			callback(null, raw.jsmods.instances[2][2][2])
		} catch (e) {
			callback(e)
		}
	})

}

exports.levelup = function() {
	for (i = 1; i <= 10; i++) {
		// send_messages('100002679552621',null,"喔是喔");
		send_messages('100000015941516', null, "嫩");
	}


}