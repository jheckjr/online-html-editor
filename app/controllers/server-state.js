'use strict';
let csService = require('./change-set-service');

let serverState = module.exports = {
  // Connected clients
  clients: {},
  // Latest version of the document
  headText: new csService.ChangeSet(0),
  // List of document revisions/changesets
  revisions: [new RevisionRecord(new csService.ChangeSet(0), 0, 0)],

  // Add a client
  addClient: function(id) {
    this.clients[id] = new Client(id);
    this.clients[id].revNum = this.revisions.length - 1;

    return this.clients[id].revNum;
  },

  // Remove a client from the list, if the client exists
  removeClient: function(id) {
    if (this.clients[id]) {
      delete this.clients[id];
    }
  },

  // Update the state based on a new changeset from a client
  updateState: function(id, cs) {
    // Update the latest version of the document
    let updatedCS = updateCS(this.clients[id].revNum, cs);
    this.headText = csService.composeCS(this.headText, updatedCS);

    // Store updated version of the document
    let newRevNum = this.revisions.length;
    Object.keys(this.clients).forEach((id) => {
      this.clients[id].revNum = newRevNum;
    });
    this.revisions.push(new RevisionRecord(updatedCS, id, newRevNum));

    return {
      data: updatedCS,
      revNum: newRevNum
    };
  },

  // Fast forward a client from its known revision to the latest revision
  clientFF: function(id, revNum) {
    let ffCS = fastForwardCS(revNum);

    return {
      data: ffCS,
      revNum: this.revisions.length - 1
    };
  }
};

// Creates a new client record
function Client(id) {
  this.id;
  this.revNum = 0;
}

// Creates a new revision record
function RevisionRecord(changeSet, sourceId, revNum) {
  this.changeSet = csService.convertToChangeSet(JSON.parse(JSON.stringify(changeSet)));
  this.sourceId = sourceId;
  this.revNum = revNum;
}

// Create a new changeset based on a client update
function updateCS(revNum, clientCS) {
  // If client revision is head revision, return clientCS
  if (revNum === serverState.revisions.length - 1) {
    return clientCS;
  }

  let newCS = csService.convertToChangeSet(clientCS);
  // for each rev from client revNum to head, perform followCS(revision, newCS)
  for (let idx = revNum + 1; idx < serverState.revisions.length; idx++) {
    newCS = csService.followCS(serverState.revisions[idx].changeSet, newCS);
  }

  return newCS;
}

// Create a changeset of composed changesets from a revision to the latest revision
function fastForwardCS(revNum) {
  // Return the latest revision if already at the latest (shouldn't occur)
  if (revNum === serverState.revisions.length - 1) {
    return serverState.revisions[revNum].changeSet;
  }

  let ffCS = serverState.revisions[revNum + 1].changeSet;
  for (let idx = revNum + 2; idx < serverState.revisions.length; idx++) {
    ffCS = csService.composeCS(ffCS, serverState.revisions[idx].changeSet);
  }

  return ffCS;
}
