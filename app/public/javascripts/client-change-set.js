'use strict';

// Create identity changeset
function ChangeSet(startLen) {
  this.startLen = startLen;
  this.endLen = startLen;
  this.ops = [newOp(noOp, startLen)];
  this.changeText = '';
}

let clientCS = {
  a: new ChangeSet(0), // Latest changeset from server
  x: new ChangeSet(0), // Last changeset sent to server
  y: new ChangeSet(0) // Unsubmitted changes
};

let addOp = '+';
let removeOp = '-';
let noOp = '=';

function newOp(op, opLength) {
  return {
    op: op,
    len: opLength
  };
}

/*
 * Create a changeset from the change object created by CodeMirror for an
 * added or removed character(s).
 */
function getCSFromCM(changeObj, content) {
  let cmCS = new ChangeSet(0);
  let offset = getOffset(content, changeObj);
  if (offset === -1) {
    // Error in getting offset so return identity
    return cmCS;
  }

  let numRemaining = content.length - offset;
  cmCS.ops[0].len = offset;
  cmCS.endLen = content.length;

  // Add new line operation
  if (changeObj.text.length == 2) {
    cmCS.ops.push(newOp(addOp, 1));
    cmCS.changeText += '\n';
    numRemaining -= 1;
  }

  // Remove characters
  let numToChange = changeObj.removed[0].length;
  if (numToChange > 0) {
    cmCS.ops.push(newOp(removeOp, numToChange));
  }

  // Add new characters
  numToChange = changeObj.text[0].length;
  if (numToChange > 0) {
    cmCS.ops.push(newOp(addOp, numToChange));
    cmCS.changeText += changeObj.text[0];
    numRemaining -= numToChange;
  }
  // Add remaining characters
  if (numRemaining > 0) {
    cmCS.ops.push(newOp(noOp, numRemaining));
  }

  return cmCS;

  // Find the index in the content string of a change
  function getOffset(content, changeObj) {
    let numLines = changeObj.from.line;
    let offset = 0;

    // Find the index of the target new line
    while (numLines > 0 && offset !== -1) {
      offset = content.indexOf('\n', offset) + 1;
      numLines -= 1;
    }

    // Not enough new lines in content
    if (offset === -1) {
      console.err("Too few new lines in content");
      return offset;
    }

    offset += changeObj.from.ch;

    return offset;
  }
}

/*
 * Apply a change from the editor to the unsubmitted changeset
 */
function applyCSFromCM(cmCS) {
  clientCS.compose(cmCS);
}
