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
      let revNum = parsedMsg.revNum;

      // Update the state
      let update = serverState.updateState(socket.id, data, revNum);
      // Broadcast update to all other clients
      let msgObj = {
        data: update.cs,
        revNum: update.revNum
      };
      socket.broadcast.emit('serverUpdate', JSON.stringify(msgObj));

      // Send acknowledgement back to sending client
      socket.emit('serverAck');
    });

    // New client connection
    socket.on('newClientId', function(id) {
      console.log('New user connection. Id: ' + id);
      // Add client
      let revNum = serverState.addClient(socket.id);
      // Send latest version of document to new client
      socket.emit('serverHeadText', JSON.stringify(serverState.headText), revNum);
    });

    // Client acknowledgement of update
    socket.on('clientAck', function(revNum) {
      serverState.updateClientRev(socket.id, revNum);
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
