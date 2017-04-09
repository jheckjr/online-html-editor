'use strict';

// Create identity changeset
function ChangeSet(startLen) {
  this.startLen = startLen;
  this.endLen = startLen;
  this.ops = [];
  if (startLen > 0) {
    this.ops = [newOp(OpEnum.EQUAL, startLen)];
  }
  this.changeText = '';

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
  cmCS.ops.push(newOp(OpEnum.EQUAL, offset));
  cmCS.startLen = content.length;
  cmCS.endLen = content.length;

  // Add new line operation
  if (changeObj.text.length == 2) {
    cmCS.ops.push(newOp(OpEnum.ADD, 1));
    cmCS.changeText += '\n';
    cmCS.startLen -= 1;
    numRemaining -= 1;
  }

  // Remove characters
  let numToChange = changeObj.removed[0].length;
  if (numToChange > 0) {
    cmCS.ops.push(newOp(OpEnum.REMOVE, numToChange));
    cmCS.startLen += numToChange;
  }

  // Add new characters
  numToChange = changeObj.text[0].length;
  if (numToChange > 0) {
    cmCS.ops.push(newOp(OpEnum.ADD, numToChange));
    cmCS.changeText += changeObj.text[0];
    cmCS.startLen -= numToChange;
    numRemaining -= numToChange;
  }
  // Add remaining characters
  if (numRemaining > 0) {
    cmCS.ops.push(newOp(OpEnum.EQUAL, numRemaining));
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
  clientCS.y = composeCS(clientCS.y, cmCS);
}

/*
 * Compose two changesets together
 */
function composeCS(csA, csB) {
  // Check that the lengths match
  if (csA.endLen != csB.startLen) {
    return new ChangeSet(0);
  }

  // Init new changeset
  let newCS = new ChangeSet(0);
  newCS.startLen = csA.startLen;
  newCS.endLen = csB.endLen;

  let changeTextAIdx = 0; // index of next text in csA changeText
  let changeTextBIdx = 0; // index of next text in csB changeText
  let opsAIdx = 0; // index of next operation in csA
  let opA = Object.assign({}, csA.ops[opsAIdx]); // next operation in csA
  // Apply each operation in csB to csA
  for (let opsBIdx = 0; opsBIdx < csB.ops.length; opsBIdx++) {
    let opB = csB.ops[opsBIdx];

    if (opB.op === OpEnum.EQUAL || opB.op === OpEnum.REMOVE) {
      while (opB.len > 0) {
        // Keep removes from csA first
        if (opA.op === OpEnum.REMOVE) {
          newCS.ops.push(newOp(opA.op, opA.len));
          opsAIdx += 1;
          opA = Object.assign({}, csA.ops[opsAIdx]);
        } else {
          // If more change in csB than csA
          if (opB.len >= opA.len) {
            opB.len -= opA.len;
            if (opB.op === OpEnum.EQUAL) {
              // Keep csA operation if opB is equal
              newCS.ops.push(newOp(opA.op, opA.len));
            } else if (opA.op === OpEnum.EQUAL){
              // Keep csB remove operation if csA is equal
              newCS.ops.push(newOp(OpEnum.REMOVE, opA.len));
            }

            // Move csA changeText index if add operation
            if (opA.op === OpEnum.ADD) {
              if (opB.op === OpEnum.EQUAL) {
                newCS.changeText += csA.changeText.substr(changeTextAIdx, opA.len);
              }
              changeTextAIdx += opA.len;
            }

            opsAIdx += 1;
            opA = Object.assign({}, csA.ops[opsAIdx]);
          } else {
            // Less change in csB than csA
            if (opA.op === OpEnum.EQUAL) {
              // Keep csB operation if equal operation in csA
              newCS.ops.push(newOp(opB.op, opB.len));
            } else if (opA.op === OpEnum.ADD) {
              // Keep csA add operation if equal operation in csB
              if (opB.op === OpEnum.EQUAL) {
                newCS.ops.push(newOp(OpEnum.ADD, opB.len));
                newCS.changeText += csA.changeText.substr(changeTextAIdx, opB.len);
              }
              changeTextAIdx += opB.len;
            }

            opA.len -= opB.len;
            opB.len = 0;
          }
        }
      }
    } else if (opB.op === OpEnum.ADD) {
      // If adding, push the add operation
      newCS.ops.push(newOp(opB.op, opB.len));
      newCS.changeText += csB.changeText.substr(changeTextBIdx, opB.len);
      changeTextBIdx += opB.len;
    } else {
      console.err("Unknown operation: " + opB);
    }
  }

  while (opsAIdx < csA.ops.length) {
    if (opA.op === OpEnum.REMOVE) {
      newCS.ops.push(newOp(opA.op, opA.len));
    }

    opsAIdx += 1;
    opA = Object.assign({}, csA.ops[opsAIdx]);
  }

  newCS.compress();

  return newCS;
}

function followCS(csA, csB) {
  if (csA.startLen != csB.startLen) {
    console.err("Changeset start lengths are different for merge.");
    return new ChangeSet(0);
  }

  // Init new changeset
  newCS = new ChangeSet(0);
  newCS.startLen = csA.startLen;

  let opsAIdx = 0;
  let opsBIdx = 0;
  let changeTextAIdx = 0;
  let changeTextBIdx = 0;
  let opLenA = 0;
  let opLenB = 0;
  let left = 0;
  while (opsAIdx < csA.ops.length && opsBIdx < csB.ops.length) {
    // Insertions in setA become retained
    if (csA.ops[opsAIdx].op === OpEnum.ADD) {
      newCS.ops.push(newOp(OpEnum.EQUAL), csA.ops[opsAIdx].len);
      changeTextAIdx += csA.ops[opsAIdx].len;
      opsAIdx += 1;
      opLenA += csA.ops[opsAIdx].len;
    }
    // Insertions in setB stay as insertions
    if (csB.ops[opsBIdx].op === OpEnum.ADD) {
      newCS.ops.push(newOp(csB.ops[opsBIdx].op, csB.ops[opsBIdx].len));
      changeTextBIdx += csB.ops[opsBIdx].len;
      opsBIdx += 1;
      opLenB += csB.ops[opsBIdx].len;
    }

    if (csA.ops[opsAIdx].op !== OpEnum.ADD && csB.ops[opsBIdx].op === OpEnum.ADD) {
      let right = Math.min(opLenA, opLenB);
      if (csA.ops[opsAIdx].op === OpEnum.EQUAL) {
        newCS.ops.push(newOp(csB.ops[opsBIdx].op, right - left + 1));
      }

      if (opLenA === right) {
        opsAIdx += 1;
        if (csA.ops[opsAIdx].op !== OpEnum.ADD) {
          opLenA += csA.ops[opsAIdx].len;
        }
      }
      if (opLenB === right) {
        opsBIdx += 1;
        if (csB.ops[opsBIdx].op !== OpEnum.ADD) {
          opLenB += csB.ops[opsBIdx].len;
        }
      }
    }
    left = right + 1;
  }

  newCS.changeText = csB.changeText;
  newCS.compress();

  return newCS;
}
