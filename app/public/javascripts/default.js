'use strict';

var socket = io();
let ackReceived = false;
// TODO: what if no ack received from server?

// Send client id to server on first connection
socket.on('connect', function() {
  socket.emit('newClientId', socket.id);
  let a = {
    startLen: 8,
    endLen: 5,
    ops: [{
      op: '=',
      len: 2
    }, {
      op: '+',
      len: 2
    }, {
      op: '-',
      len: 5
    }, {
      op: '=',
      len: 1
    }],
    changeText: 'si'
  };
  let b = {
    startLen: 5,
    endLen: 6,
    ops: [{
      op: '=',
      len: 1
    }, {
      op: '+',
      len: 1
    }, {
      op: '=',
      len: 2
    }, {
      op: '+',
      len: 2
    }],
    changeText: 'eow'
  };
  console.log(composeCS(a, b));
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
  let serverCS = JSON.parse(msg).data;
  console.log('Update received');
  console.log(serverCS);
  clientCS.a = composeCS(clientCS.a, serverCS);
  console.log('a' + JSON.stringify(clientCS.a));
  let newX = followCS(serverCS, clientCS.x);
  let newY = followCS(followCS(clientCS.x, serverCS), clientCS.y);
  clientCS.x = newX;
  clientCS.y = newY;
  console.log('x' + JSON.stringify(clientCS.x));
  console.log('y' + JSON.stringify(clientCS.y));
  let newViewCS = composeCS(clientCS.a, composeCS(clientCS.x, clientCS.y));
  console.log('view' + JSON.stringify(newViewCS));
  applyChangeToEditor(newViewCS);
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
    console.log(JSON.stringify(clientCS.y));
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
      console.error("Cannot send. Waiting for previous server ack.");
  }
}

function requestUpdate() {
  socket.emit('requestUpdate');
}

function applyChangeToEditor(viewCS) {
  let editorContent = editor.getValue();
  let contentIdx = 0;
  let changeTextIdx = 0;

  for (let opIdx = 0; opIdx < viewCS.ops.length; opIdx++) {
    switch (viewCS.ops[opIdx].op) {
      case OpEnum.EQUAL:
        contentIdx += viewCS.ops[opIdx].len;
        break;
      case OpEnum.ADD:
        editorContent = editorContent.substring(0, contentIdx) +
          viewCS.changeText.substr(changeTextIdx, viewCS.ops[opIdx].len) +
          editorContent.substring(contentIdx);
        contentIdx += viewCS.ops[opIdx].len;
        changeTextIdx += viewCS.ops[opIdx].len;
        break;
      case OpEnum.REMOVE:
        editorContent = editorContent.substring(0, contentIdx) +
          eidtorContent.substring(contentIdx + viewCS.ops[opIdx].len);
        break;
      default:
        // Do nothing
    }
  }

  editor.setValue(editorContent);
}
