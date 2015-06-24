// App

// Modules
var express = require('express'),
	app = express(),
	http = require('http').Server(app),
	io = require('socket.io')(http),
	fs = require('fs'),
	_ = require('lodash'),
	bunyan = require('bunyan'),
	config = require('./system/config/' + process.env.NODE_ENV),
	mongoose = require('mongoose'),
	db,
	users = {},
	server,
	log = bunyan.createLogger({name: 'interactive'}),
	System = {},
	// Paths
	helperPath = './system/helpers/';


// Initialize System object
System = {
	app: app,
	helpers: {}
};

// Load Helpers
var helperFiles = fs.readdirSync(helperPath);
helperFiles.forEach(function(helperFile){
	if(helperFile.indexOf('.js') > -1) {
		var helper = require(helperPath + helperFile)(System);
		System.helpers[helper.key] = helper.module;
	}
});

// Database connection
db = mongoose.connect(config.db);
mongoose.connection.on('open', function(){
	log.info('db connected');
});
mongoose.connection.on('error', function(){
	log.error('db connection failed!');
});

// Initialization
server = http.listen(config.port);
log.info('listening to server on http://localhost:' + config.port);

// Middlewares
app.use(express.static('public'));

app.get('/', function(req, res){
	res.sendFile(__dirname + '/public/views/index.html');
});

// Socket connection
io.on('connection', function(socket){
	log.info('socket:connected!');

	// Login listener
	socket.on('login', function(json){
		log.info('socket:login');
		
		// Ensure '#' prepend before channel name
		json.channel = json.channel.indexOf('#') == 0 ? json.channel : '#' + json.channel;

		// Add to room
		socket.join(json.channel);
		socket.userDetails = json.user;
		socket.channel = json.channel;

		// Add user to users list
		users[json.channel] = users[json.channel] || [];
		users[json.channel].push(json.user);

		// Broadcast new user
		io.to(socket.channel).emit('login', {
			message: 'New user has joined',
			channel: json.channel,
			user: json.user,
			users: users[json.channel]
		});
	});

	// Incoming message listener
	socket.on('message', function(json){
		log.info('socket:message');
		json.timestamp = Date.now();
		io.to(socket.channel).emit('message', json);
	});

	socket.on('logout', function(){
		socket.disconnect();
	});

	// Disconnect listener
	socket.on('disconnect', function(){
		log.info('socket:disconnect');
		// Let everyone, except the initiator, know that a user has left
		socket.broadcast.to(socket.channel).emit('userLeft', socket.userDetails);
		_.remove(users[socket.channel], socket.userDetails);
	})
});