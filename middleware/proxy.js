var url = require('url');
var net = require('net');
var http = require('http');
var express = require('express');
var request = require('request');

var app = express();
var server = http.createServer(app);
var io = require('socket.io')(server);
var SocketStream = require('socket.io-stream');

io.on('connection', function (socket) {
  console.log('Connection to client: ' + socket.request.connection.remoteAddress)

  var onError = function(error) {
    socket.emit('proxy-error', error);
  };

  SocketStream(socket).on('request', function(stream, request, callback) {
    var handle = request.ssl ? handleSsl : handleHttp;
    handle(request, stream, onError, callback);
  });
});

server.listen(3001, function() {
  console.log('HTTP/socket.io server started on port 3001');
});

function handleHttp(requestData, stream, onError, callback) {
  console.log('Stream requested, url: ' + requestData.url);
  // we first make a HEAD request to see if the file is there. If not, or there
  // is any other issue, we return the error to the requestor as a JSON object.
  request.head(requestData.url, function (error, response, body) {
    if (error || (response !== undefined && response.statusCode >= 400)) {
      var statusCode = 0;
      if (response) {
        console.log("Status code: " + response.statusCode);
        statusCode = response.statusCode;
      }
      callback();
      console.log('There was an error: ' + error + '\nStatus Code: ' + statusCode);
      onError({ error: error ? error.toString() : 'Unknown error', statusCode: statusCode}); // the 'toString()' is needed to create a
                                                                   // copy of the error object.
                                                                   // Otherwise error isn't populated for some reason.
    }
    else {
      // once we are sure all is good, we go ahead and request the file and pipe it to the requestor
      request(requestData.url, function (error, response, body) {
        console.log('Done');
        callback();
      })
        // this is where some magic happens.
        // we pipe the data from the 'request()' directly to the stream
        // on the browser, this will be piped directly to the ROV.
        .pipe(stream);
    }
  });
}

function handleSsl(request, stream, onError, callback) {
  var requestUrl = request.url;
  var srvUrl = url.parse(requestUrl );

  var client = net.connect(
    {port: srvUrl.port, host: srvUrl.hostname},
    function() {
      stream.write('HTTP/1.1 200 Connection Established\r\n' +
        'Proxy-agent: Node-Proxy\r\n' +
        '\r\n');
    });

  stream.on('data', function(data) {
    client.write(data);
    console.log('#' + data);
  });
  client.on('data', function(data) {
    stream.write(data);
    console.log('@' + data);
  });

  client.on('end', function() {
    console.log('Done');
    callback();
  });

  client.on('error', function(error) {
    console.log('Client error ' + error);
    onError({error: error, statusCode: 500});
  });
}
