'use strict';

let socket = io();
let updateReceived = true;
let ttl = 0;      // Length of wait
let MAX_TTL = 6;  // Number of times to wait for reply before sending new request

// Request the document from the server
socket.on('connect', function() {
  getDocument();
});

// Update the view on receiving the document
socket.on('serverHeadText', function(headText) {
  // Parse out the document string to HTML
  let html = $.parseHTML(JSON.parse(headText).changeText);
  // Set the view to the parsed HTML
  $("#viewDiv").html(html);

  // Allow requests again
  updateReceived = true;
});

// Request a document
function getDocument() {
  // Only make request if received a reply to previous request
  if (updateReceived || ttl === MAX_TTL) {
    updateReceived = false;
    ttl = 0;
    socket.emit('getDocument');
  } else {
    ttl += 1;
  }

  // Request update every 5 seconds
  setTimeout('getDocument()', 5000);
}
