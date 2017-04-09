var socket = io();
let ackReceived = false;
// TODO: what if no ack received from server?

// Send client id to server on first connection
socket.on('connect', function() {
  socket.emit('newClientId', socket.id);
});

// Initialize changesets on connection
socket.on('headtext', function(headtext) {
  // Received data from server, so can send data
  ackReceived = true;

  // Init changesets
  let headCS = JSON.parse(headtext);
  clientCS.a = headCS;
  clientCS.x = new ChangeSet(headCS.endLen);
  clientCS.y = new ChangeSet(headCS.endLen);

  // Update viewable editor content
  editor.setValue(headCS.changeText);
});

// Server acknowledgement of received update (a<-ax, x<-identity)
socket.on('serverAck', function() {
  console.log('Ack received');
  ackReceived = true;
  clientCS.a = composeCS(clientCS.a, clientCS.x);
  clientCS.x = new ChangeSet(clientCS.a.endLen);
});

// Server update from other client
socket.on('serverUpdate', function(msg) {
  
});

var div = document.getElementsByClassName("editor-div")[0];
var inputArea = document.createElement('textarea');
div.appendChild(inputArea);

var editor = CodeMirror.fromTextArea(inputArea, {
  lineNumbers: true
});

editor.on("change", function(instance, changeObj) {
  // Do nothing if setValue (only used in initialization)
  if (changeObj.origin === 'setValue') {
    return;
  }

  var debug = false;
  // Convert change object to changeset and add to unsubmitted changeset
  let cmCS = getCSFromCM(changeObj, instance.getValue());

  if (debug) {
    console.log('cmCS');
    console.log(cmCS);
    console.log('y_init');
    console.log(clientCS.y);
  }

  applyCSFromCM(cmCS);

  if (debug) {
    console.log(changeObj);
    console.log(JSON.stringify(instance.getValue()));
    console.log('y');
    console.log(clientCS.y);
  }
});

function sendUpdate() {
  if (ackReceived) {
    // Send latest client updates
    let msg = {
      id: socket.id,
      data: clientCS.y
    }
    ackReceived = false;
    socket.emit('clientUpdate', JSON.stringify(msg));

    // Modify changesets (x<-y, y<-identity)
    clientCS.x = Object.assign({}, clientCS.y);
    clientCS.y = new ChangeSet(clientCS.x.endLen);
  } else {
      console.err("Cannot send. Waiting for previous server ack.");
  }
}
