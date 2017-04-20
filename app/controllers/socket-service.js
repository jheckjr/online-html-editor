'use strict';
let serverState = require('./server-state');

module.exports = function(server) {
  // Create socket.io server
  var io = require('socket.io')(server);

  // socket.io connection
  io.on('connection', function(socket) {

    // Client disconnection
    socket.on('disconnect', function() {
      console.log('User disconnected. Id: ' + socket.id);
      // Remove the client
      serverState.removeClient(socket.id);
    });

    socket.on('clientUpdate', function(msg) {
      console.log('Received update from client: ' + socket.id);
      let parsedMsg = JSON.parse(msg);
      let data = parsedMsg.data;

      // Update the state
      let update = serverState.updateState(socket.id, data);
      // Broadcast update to all other clients
      socket.broadcast.emit('serverUpdate', JSON.stringify(update));

      // Send acknowledgement back to sending client
      socket.emit('serverAck', update.revNum);
    });

    // New client connection
    socket.on('newClientId', function(id) {
      console.log('New user connection. Id: ' + id);
      // Add client
      let revNum = serverState.addClient(socket.id);
      // Send latest version of document to new client
      socket.emit('serverHeadText', JSON.stringify(serverState.headText), revNum);
    });

    // Send client an update to fast forward to latest revision
    socket.on('clientFastForward', function(clientRevNum) {
      let update = serverState.clientFF(socket.id, clientRevNum);
      socket.emit('serverFastForward', JSON.stringify(update));
    });

    // Get the latest document revision for viewing
    socket.on('getDocument', function() {
      console.log('Document requested.');
      // Send the latest document revision
      socket.emit('serverHeadText', JSON.stringify(serverState.headText));
    });
  });

  return io;
};
