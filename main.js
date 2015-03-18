var fb = require('./fb');

fb.login(function(err, fbuser) {
	if (err) {
		console.log(err)
	} else {
		//stay online
		//listen to messages
		fb.get_some_friends(fbuser.id);
		// fb.get_buddy(fbuser)
	}
})