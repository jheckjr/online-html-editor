'use strict';

// Create changeset
function ChangeSet(startLen) {
  this.startLen = startLen;
  this.endLen = startLen;
  this.ops = [];
  if (startLen > 0) {
    this.ops = [newOp(OpEnum.EQUAL, startLen)];
  }
  this.changeText = '';

  // Compress operations array to remove consecutive operations of same type
  this.compress = function() {
    let newOps = [];
    let newEndLen = 0;
    for (let idx = 0; idx < this.ops.length; idx++) {
      let jumpIdx = idx;
      let len = 0;

      // Collect consecutive operations with same type
      while (jumpIdx < this.ops.length && this.ops[jumpIdx].op === this.ops[idx].op) {
        len += this.ops[jumpIdx].len;
        jumpIdx += 1;
      }

      // Add operations to list and jump the index
      newOps.push(newOp(this.ops[idx].op, len));
      if (this.ops[idx].op !== OpEnum.REMOVE) {
        newEndLen += len;
      }
      idx = jumpIdx - 1;
    }

    // Use the compressed version if different
    if (newOps.length > 0) {
      this.ops = newOps;
      this.endLen = newEndLen;
    }
  };

  // Expand operations array so each operation is of length 1
  // expandAdds is boolean for expanding add operations
  this.expand = function(expandAdds) {
    let newOps = [];
    for (let idx = 0; idx < this.ops.length; idx++) {
      // Keep adds as they are
      if (this.ops[idx].op === OpEnum.ADD) {
        if (expandAdds){
          // Expand to be multiple ops of length one
          for (let newIdx = 0; newIdx < this.ops[idx].len; newIdx++) {
            newOps.push(newOp(this.ops[idx].op, 1));
          }
        } else {
          newOps.push(JSON.parse(JSON.stringify(this.ops[idx])));
        }
      } else {
        // Expand removes and equals to be multiple ops of length one
        for (let newIdx = 0; newIdx < this.ops[idx].len; newIdx++) {
          newOps.push(newOp(this.ops[idx].op, 1));
        }
      }
    }

    this.ops = newOps;
  };
}

let clientCS = {
  a: new ChangeSet(0), // Latest changeset from server
  x: new ChangeSet(0), // Last changeset sent to server
  y: new ChangeSet(0) // Unsubmitted changes
};

let OpEnum = {
  ADD: '+',
  REMOVE: '-',
  EQUAL: '='
};

// Create new operation
function newOp(op, opLength) {
  return {
    op: op,
    len: opLength
  };
}

// Convert data from server to changeset
function convertToChangeSet(data) {
  let newCS = new ChangeSet(0);
  newCS.startLen = data.startLen;
  newCS.endLen = data.endLen;
  newCS.ops = data.ops;
  newCS.changeText = data.changeText;

  return newCS;
}

/*
 * Create a changeset from the change object created by CodeMirror for an
 * added or removed character(s).
 */
function getCSFromCM(changeObj, content) {
  let offset = getOffset(content, changeObj);
  if (offset === -1) {
    // Error in getting offset so return identity
    return new ChangeSet(content.length);
  }

  let newCS = convertToChangeSet(JSON.parse(JSON.stringify(clientCS.y)));
  newCS.expand(true);

  // offset says how many characters to skip before insertion (only equal and add)
  let numAddSoFar = 0; // number of add operations seen so far
  let numRemoveSoFar = 0; // number of remove operations seen so far
  let numSoFar = 0; // number of add or equal operations seen so far
  let numChanged = 0; // number of changed operations

  for (let idx = 0; idx < newCS.ops.length; idx++) {
    // offset found in operations list
    if (offset === numSoFar) {
      break;
    }

    // count number of equal and add operations for offset
    if (newCS.ops[idx].op !== OpEnum.REMOVE) {
      numSoFar += 1;
    } else {
      numRemoveSoFar += 1;
    }

    // Increase index in the changeText if add operation
    if (newCS.ops[idx].op === OpEnum.ADD) {
      numAddSoFar += 1;
    }
  }

  // Add the removes back into the count to get the correct index in the changeSet
  numSoFar += numRemoveSoFar;
  // Skip past any removes if currently on a remove operation
  while (numSoFar < newCS.ops.length && newCS.ops[numSoFar].op === OpEnum.REMOVE) {
    numSoFar += 1;
  }

  // insert adds if new characters or new lines
  if (changeObj.text[0].length > 0 || changeObj.text.length > 1) {
    for (let line = 0; line < changeObj.text.length; line++) {
      // insert new line character if more than one line
      if (line > 0) {
        newCS.ops.splice(numSoFar + numChanged, 0, newOp(OpEnum.ADD, 1));
        newCS.changeText = newCS.changeText.substr(0, numAddSoFar + numChanged) +
          '\n' + newCS.changeText.substr(numAddSoFar + numChanged);
        numChanged += 1;
      }

      // insert text characters
      for (let char = 0; char < changeObj.text[line].length; char++) {
        newCS.ops.splice(numSoFar + numChanged, 0, newOp(OpEnum.ADD, 1));
        newCS.changeText = newCS.changeText.substr(0, numAddSoFar + numChanged) +
          changeObj.text[line][char] + newCS.changeText.substr(numAddSoFar + numChanged);
        numChanged += 1;
      }
    }
  }

  // replace operations with removes if deleted characters
  if (changeObj.removed[0].length > 0 || changeObj.removed.length > 1) {
    for (let line = 0; line < changeObj.removed.length; line++) {
      let removed;
      // remove new line character if more than one line
      if (line > 0) {
        removed = newCS.ops.splice(numSoFar + numChanged, 1)[0];
        if (removed.op === OpEnum.ADD) {
          newCS.changeText = newCS.changeText.substr(0, numAddSoFar + numChanged) +
            newCS.changeText.substr(numAddSoFar + numChanged + 1);
        } else if (removed.op === OpEnum.EQUAL) {
          // insert a remove if removed operation was equal
          newCS.ops.splice(numSoFar + numChanged, 0, newOp(OpEnum.REMOVE, 1));
          numChanged += 1;
        }
      }

      // remove text characters
      for (let char = 0; char < changeObj.removed[line].length; char++) {
        removed = newCS.ops.splice(numSoFar + numChanged, 1)[0];
        if (removed.op === OpEnum.ADD) {
          newCS.changeText = newCS.changeText.substr(0, numAddSoFar + numChanged) +
            newCS.changeText.substr(numAddSoFar + numChanged + 1);
        } else if (removed.op === OpEnum.EQUAL) {
          // insert a remove if removed operation was equal
          newCS.ops.splice(numSoFar + numChanged, 0, newOp(OpEnum.REMOVE, 1));
          numChanged += 1;
        }
      }
    }
  }

  newCS.compress();
  clientCS.y = newCS;

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
      console.error("Too few new lines in content");
      return offset;
    }

    offset += changeObj.from.ch;

    return offset;
  }
}

// Compose two changesets together
function composeCS(changeSetA, changeSetB) {
  // Check that the lengths match
  if (changeSetA.endLen != changeSetB.startLen) {
    return new ChangeSet(changeSetA.endLen);
  }

  // Make copies of input changesets
  let csA = convertToChangeSet(JSON.parse(JSON.stringify(changeSetA)));
  let csB = convertToChangeSet(JSON.parse(JSON.stringify(changeSetB)));

  // Init new changeset
  let newCS = new ChangeSet(0);
  newCS.startLen = csA.startLen;
  newCS.endLen = csB.endLen;

  csA.expand(true);
  csB.expand(true);

  let textAIdx = 0; // index of change text in csA
  let textBIdx = 0; // index of change text in csB
  let opAIdx = 0; // index of current operation in csA

  for (let opBIdx = 0; opBIdx < csB.ops.length; opBIdx++) {
    switch (csB.ops[opBIdx].op) {
      case OpEnum.EQUAL:
        // Add all of the remove operation from csA first
        if (csA.ops[opAIdx].op === OpEnum.REMOVE) {
          while(csA.ops[opAIdx].op === OpEnum.REMOVE) {
            newCS.ops.push(JSON.parse(JSON.stringify(csA.ops[opAIdx])));
            opAIdx += 1;
          }
        }

        newCS.ops.push(JSON.parse(JSON.stringify(csA.ops[opAIdx])));

        // Add the changeText for add operation
        if (csA.ops[opAIdx].op === OpEnum.ADD) {
          newCS.changeText += csA.changeText.substr(textAIdx, 1);
          textAIdx += 1;
        }
        opAIdx += 1;
        break;

      case OpEnum.ADD:
        newCS.ops.push(JSON.parse(JSON.stringify(csB.ops[opBIdx])));
        newCS.changeText += csB.changeText.substr(textBIdx, 1);
        textBIdx += 1;
        break;

      case OpEnum.REMOVE:
        newCS.ops.push(JSON.parse(JSON.stringify(csB.ops[opBIdx])));
        if (csA.ops[opAIdx].op === OpEnum.ADD) {
          textAIdx += 1;
        }
        opAIdx += 1;
        break;

      default:
        console.error('Invalid operation in composeCS.', csB.ops[opBIdx].op, opBIdx);
        break;
    }
  }

  // Add any remaining remove operations
  while (opAIdx < csA.ops.length) {
    if (csA.ops[opAIdx].op === OpEnum.REMOVE) {
      newCS.ops.push(JSON.parse(JSON.stringify(csA.ops[opAIdx])));
    }

    opAIdx += 1;
  }

  newCS.compress();
  return newCS;
}

// Follows function to merge concurrent changeSets
function followCS(changeSetA, changeSetB) {
  if (changeSetA.startLen != changeSetB.startLen) {
    console.error('Changeset start lengths are different for merge.');
    return new ChangeSet(changeSetA.endLen);
  }

  // Make copies of input changesets
  let csA = convertToChangeSet(JSON.parse(JSON.stringify(changeSetA)));
  let csB = convertToChangeSet(JSON.parse(JSON.stringify(changeSetB)));

  // Init new changeset
  let newCS = new ChangeSet(0);
  newCS.startLen = csA.endLen;
  newCS.endLen = csA.endLen;

  csA.expand(false);
  csB.expand(false);

  let opAIdx = 0;
  let opBIdx = 0;

  while (opAIdx < csA.ops.length && opBIdx < csB.ops.length) {
    // Push all adds
    if (csA.ops[opAIdx].op === OpEnum.ADD) {
      // Push whole add operation as equal
      newCS.ops.push(newOp(OpEnum.EQUAL, csA.ops[opAIdx].len));
      opAIdx += 1;
    } else if (csB.ops[opBIdx].op === OpEnum.ADD) {
      // Push whole add operation
      newCS.ops.push(JSON.parse(JSON.stringify(csB.ops[opBIdx])));
      opBIdx += 1;
    } else if (csA.ops[opAIdx].op === OpEnum.EQUAL &&
      csB.ops[opBIdx].op === OpEnum.EQUAL ) {
      // Push equal if both equal
      newCS.ops.push(newOp(OpEnum.EQUAL, csA.ops[opAIdx].len));
      opAIdx += 1;
      opBIdx += 1;
    } else if (csA.startLen === csA.endLen && csA.ops[opAIdx].op === OpEnum.REMOVE) {
      // If there's a remove in an identity, skip the remove
      opAIdx += 1;
    } else if (csB.startLen === csB.endLen && csB.ops[opBIdx].op === OpEnum.REMOVE) {
      // If there's a remove in an identity, skip the remove
      opBIdx += 1;
    } else {
      // If one or both is remove, push remove
      newCS.ops.push(newOp(OpEnum.REMOVE, csA.ops[opAIdx].len));
      opAIdx += 1;
      opBIdx += 1;
    }
  }

  // Process remaining add operations and keep remove operation if last operation
  if (opAIdx < csA.ops.length) {
    for (let idx = opAIdx; idx < csA.ops.length; idx++) {
      if (csA.ops[idx].op === OpEnum.ADD) {
        newCS.ops.push(newOp(OpEnum.EQUAL, csA.ops[idx].len));
      } else if (csA.ops[idx].op === OpEnum.REMOVE && (idx === csA.ops.length - 1)) {
        newCS.ops.push(JSON.parse(JSON.stringify(csA.ops[idx])));
      }
    }
  } else if (opBIdx < csB.ops.length) {
    for (let idx = opBIdx; idx < csB.ops.length; idx++) {
      if (csB.ops[idx].op === OpEnum.ADD) {
        newCS.ops.push(newOp(OpEnum.ADD, csB.ops[idx].len));
      } else if (csB.ops[idx].op === OpEnum.REMOVE && (idx === csB.ops.length - 1)) {
        newCS.ops.push(JSON.parse(JSON.stringify(csB.ops[idx])));
      }
    }
  }

  newCS.changeText = csB.changeText;
  newCS.compress();

  return newCS;
}
