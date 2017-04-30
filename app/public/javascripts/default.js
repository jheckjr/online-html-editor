'use strict';

let socket = io();
let ackReceived = false;  // acknowledgement received from server for last change
let viewChanged = false;  // user has edited the document/view
let latestRevNum = -1;  // number of last revision received from server

// Send client id to server on first connection
socket.on('connect', function() {
  if (latestRevNum === -1) {
    socket.emit('newClientId', socket.id);
  }
});

// Initialize changesets on connection
socket.on('serverHeadText', function(headtext, revNum) {
  // Received data from server, so can send data
  ackReceived = true;

  // Init changesets
  latestRevNum = revNum;
  let headCS = JSON.parse(headtext);
  clientCS.a = headCS;
  clientCS.x = new ChangeSet(headCS.endLen);
  clientCS.y = new ChangeSet(headCS.endLen);

  // Update viewable editor content
  editor.setValue(headCS.changeText);

  sendUpdate();
});

// Server acknowledgement of received update (a<-ax, x<-identity)
socket.on('serverAck', function(revNum) {
  latestRevNum = revNum;
  ackReceived = true;
  clientCS.a = composeCS(clientCS.a, clientCS.x);
  clientCS.x = new ChangeSet(clientCS.a.endLen);
});

// Server update from other client
socket.on('serverUpdate', function(msg) {
  let parsedMsg = JSON.parse(msg);

  // Check that update can be applied (revNum is next in sequence)
  if (parsedMsg.revNum === (latestRevNum + 1)) {
    latestRevNum = parsedMsg.revNum;
    let serverCS = convertToChangeSet(parsedMsg.data);
    let viewCS = composeCS(clientCS.a, composeCS(clientCS.x, clientCS.y));
    clientCS.a = composeCS(clientCS.a, serverCS);

    let newX = followCS(serverCS, clientCS.x);
    let newY = followCS(followCS(clientCS.x, serverCS), clientCS.y);
    let D = followCS(clientCS.y, followCS(clientCS.x, serverCS));
    clientCS.x = newX;
    clientCS.y = newY;

    let newViewCS = composeCS(viewCS, D);
    applyChangeToEditor(newViewCS);
  } else {
    // Ask server for changeset relative to client's last known revision
    socket.emit('clientFastForward', latestRevNum);
  }
});

// Server fast forward update
socket.on('serverFastForward', function(msg) {
  let parsedMsg = JSON.parse(msg);
  latestRevNum = parsedMsg.revNum;

  let serverCS = convertToChangeSet(parsedMsg.data);
  let viewCS = composeCS(clientCS.a, composeCS(clientCS.x, clientCS.y));
  clientCS.a = composeCS(clientCS.a, serverCS);

  let newX = followCS(serverCS, clientCS.x);
  let newY = followCS(followCS(clientCS.x, serverCS), clientCS.y);
  let D = followCS(clientCS.y, followCS(clientCS.x, serverCS));
  clientCS.x = newX;
  clientCS.y = newY;

  let newViewCS = composeCS(viewCS, D);
  applyChangeToEditor(newViewCS);
})

// Create the editor
var div = document.getElementsByClassName("editor-div")[0];
var inputArea = document.createElement('textarea');
div.appendChild(inputArea);
var editor = CodeMirror.fromTextArea(inputArea, {
  lineNumbers: true
});

// Update the changesets on user input to the editor
editor.on("change", function(instance, changeObj) {
  // Do nothing if setValue (only used in initialization)
  if (changeObj.origin === 'setValue') {
    return;
  }

  // Convert change object to changeset and add to unsubmitted changeset
  getCSFromCM(changeObj, instance.getValue());
  viewChanged = true;
});

// Send any user updates to the server (send every 500 ms if change)
function sendUpdate() {
  if (ackReceived) {
    // Only send update if there's been a change
    if (viewChanged) {
      // Send latest client updates
      viewChanged = false;
      let msg = {
        data: clientCS.y
      };
      ackReceived = false;
      socket.emit('clientUpdate', JSON.stringify(msg));

      // Modify changesets (x<-y, y<-identity)
      clientCS.x = JSON.parse(JSON.stringify(clientCS.y));
      clientCS.y = new ChangeSet(clientCS.x.endLen);
    }
  }

  setTimeout('sendUpdate()', 500);
}

// Update the view with the new changeset
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
          editorContent.substring(contentIdx + viewCS.ops[opIdx].len);
        break;
      default:
        // Do nothing
    }
  }

  // Remove anything remaining from old view content
  editorContent = editorContent.substring(0, contentIdx);
  editor.setValue(editorContent);
}
