var fs = require('fs');
var app = require('express')();
var http = require('http').Server(app);
var io = require('socket.io')(http);
var SocketStream = require('socket.io-stream');

var port = process.env.PORT || 3000;
var browserSocket = null;

io.on('connection', function (socket) {
  console.log('Socket.IO: connected');
  // this could be improved as right now we only keep one client (browser).
  // Should not be an issue as we only should have one browser connected anyway.
  browserSocket = socket;
});

app.use(function(req, res){
  if (req.url == '/' ) { // if the request is for '/' we send the index file
    res.sendfile(__dirname + '/public/index.html');
  }
  else if (req.url == '/js/socket.io-stream.js' ) {
    res.sendfile(__dirname + '/node_modules/socket.io-stream/socket.io-stream.js');
  }
  // otherwise we proxying the request
  else { proxyReq(req, res); }
});

http.addListener('connect', function(req, socket, head) {
  proxyReq(req, socket, head);
});

http.listen(port, function(){
  console.log('listening on *:' + port);
});

// This function acts as a HTTP proxy.
// The request looks something like: GET HTTP://www.google.com
// We pass this on to to our proxy on the internet and they download it for us.
function proxyReq(req, res, head) {
  console.log("Request: " + req.url);

  if (browserSocket !== null) {
    var ssl = req.method === 'CONNECT';
    var url = (ssl ? 'https://' : '') + req.url;
    var stream =  SocketStream.createStream();

    SocketStream(browserSocket).emit('request', stream, { head: head, url: url, ssl: ssl });

    console.log("Created stream for: " + url);
    res.statusCode = 200;

    var onError;
    onError = function(error) {
      console.log("Error occurd " + JSON.stringify(error) + ' ');
      if (error.statusCode) {
        res.statusCode = error.statusCode === 0 ? 500 : error.statusCode;
      }
      res.end("Error");
      browserSocket.removeListener('proxy-error', onError);
    }

    browserSocket.on('proxy-error', onError);

    // this is where some of the magic happens.
    // We sent the url to the proxy and the proxy starts a download
    // of a file and pipes the response to us.
    // Thanks to JavaScript streams, we can just pipe the data on towards our
    // client.
    stream.pipe(res);
    req.socket.pipe(stream);

    stream.on('end', function() {
      // When the proxy tells us everything was sent, we end the response to the client.
      res.end();
    });
  }
  else {
    console.log('No client connected!');
    res.statusCode = 500;
    res.end("No client connected!");
  }
}
