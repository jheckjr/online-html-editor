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

  // expandAdds is boolean for expanding add operations
  this.expand = function(expandAdds) {
    let newOps = [];
    let newEndLen = 0;
    for (let idx = 0; idx < this.ops.length; idx++) {
      // Keep adds as they are
      if (this.ops[idx].op === OpEnum.ADD) {
        if (expandAdds){
          // Expand to be multiple ops of length one
          for (let newIdx = 0; newIdx < this.ops[idx].len; newIdx++) {
            newOps.push(newOp(this.ops[idx].op, 1));
            newEndLen += 1;
          }
        } else {
          newOps.push(JSON.parse(JSON.stringify(this.ops[idx])));
          newEndLen += 1;
        }
      } else {
        // Expand removes and equals to be multiple ops of length one
        for (let newIdx = 0; newIdx < this.ops[idx].len; newIdx++) {
          newOps.push(newOp(this.ops[idx].op, 1));
          newEndLen += 1;
        }
      }
    }

    this.ops = newOps;
    this.endLen = newEndLen;
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

/*
 * Compose two changesets together
 */
/*function composeCS(changeSetA, changeSetB) {
  // Check that the lengths match
  if (changeSetA.endLen != changeSetB.startLen) {
    return new ChangeSet(0);
  }

  // Make copies of input changesets
  let csA = convertToChangeSet(JSON.parse(JSON.stringify(changeSetA)));
  let csB = convertToChangeSet(JSON.parse(JSON.stringify(changeSetB)));

  // Init new changeset
  let newCS = new ChangeSet(0);
  newCS.startLen = csA.startLen;
  newCS.endLen = csB.endLen;

  let textAIdx = 0; // index of change text in csA
  let textBIdx = 0; // index of change text in csB
  let opAIdx = 0; // index of current operation in csA

  for (let opBIdx = 0; opBIdx < csB.ops.length; opBIdx++) {
    let opBLen = csB.ops[opBIdx].len;

    switch (csB.ops[opBIdx].op) {
      // Push additions in csB
      case OpEnum.ADD:
        newCS.ops.push(JSON.parse(JSON.stringify(csB.ops[opBIdx])));
        newCS.changeText += csB.changeText.substr(textBIdx, opBLen);
        textBIdx += opBLen;
        break;

      // Push operations from csA for the length of the csB operation
      case OpEnum.EQUAL:
        // Continue to push csA operations until end of csB equals
        while (opBLen > 0 && opAIdx < csA.ops.length) {
          switch (csA.ops[opAIdx].op) {
            case OpEnum.ADD:
              // Push csA operation up to opBLen if csA longer
              if (opBLen < csA.ops[opAIdx].len) {
                newCS.ops.push(newOp(OpEnum.ADD, opBLen));
                newCS.changeText += csA.changeText.substr(textAIdx, opBLen);
                textAIdx += opBLen;
                csA.ops[opAIdx].len -= opBLen;
                opBLen = 0;
              } else {
                // Push whole csA operation if length less than opBLen
                newCS.ops.push(JSON.parse(JSON.stringify(csA.ops[opAIdx])));
                newCS.changeText += csA.changeText.substr(textAIdx, csA.ops[opAIdx].len);
                textAIdx += csA.ops[opAIdx].len;
                opBLen -= csA.ops[opAIdx].len;
                opAIdx += 1;
              }
              break;

            case OpEnum.EQUAL:
              // Push the shorter equals operation
              if (opBLen < csA.ops[opAIdx].len) {
                newCS.ops.push(newOp(OpEnum.EQUAL, opBLen));
                csA.ops[opAIdx].len -= opBLen;
                opBLen = 0;
              } else {
                newCS.ops.push(JSON.parse(JSON.stringify(csA.ops[opAIdx])));
                opBLen -= csA.ops[opAIdx].len;
                opAIdx += 1;
              }
              break;

            // Push all of remove operation in csA since not known to csB
            case OpEnum.REMOVE:
              newCS.ops.push(JSON.parse(JSON.stringify(csA.ops[opAIdx])));
              opAIdx += 1;
              break;

            default:
              console.error('Invalid operation in composeCS.');
          }
        }
        break;

      case OpEnum.REMOVE:
        while (opBLen > 0 && opAIdx < csA.ops.length) {
          switch (csA.ops[opAIdx].op) {
            case OpEnum.EQUAL:
              // Push remove operation with the shorter length
              if (opBLen < csA.ops[opAIdx].len) {
                newCS.ops.push(newOp(OpEnum.REMOVE, opBLen));
                csA.ops[opAIdx].len -= opBLen;
                opBLen = 0;
              } else {
                newCS.ops.push(newOp(OpEnum.REMOVE, csA.ops[opAIdx].len));
                opBLen -= csA.ops[opAIdx].len;
                opAIdx += 1;
              }
              break;

            case OpEnum.ADD:
              // Remove in csB cancels add in csA, so don't push change. Just update
              // pointers
              if (opBLen < csA.ops[opAIdx].len) {
                newCS.ops.push(newOp(OpEnum.REMOVE, opBLen));
                csA.ops[opAIdx].len -= opBLen;
                textAIdx += opBLen;
                opBLen = 0;
              } else {
                // If last operation in csA, skip the rest of the csB remove
                // because it would remove nonexistent characters
                if (opAIdx < csA.ops.length - 1) {
                  newCS.ops.push(newOp(OpEnum.REMOVE, csA.ops[opAIdx].len));
                  opBLen -= csA.ops[opAIdx].len;
                  textAIdx += csA.ops[opAIdx].len;
                  opAIdx += 1;
                } else {
                  opBLen = 0;
                }
              }
              break;

            // Push remove from csA
            case OpEnum.REMOVE:
              newCS.ops.push(newOp(OpEnum.REMOVE, csA.ops[opAIdx].len));
              opAIdx += 1;
              break;

            default:
              console.error('Invalid operation in composeCS.');
          }
        }
        break;

      default:
        console.error('Invalid operation in composeCS.', csB.ops[opBIdx].op, opBIdx);
    }
  }

  // Add any remaining remove operations
  while (opAIdx < csA.ops.length) {
    if (csA.ops[opAIdx].op === OpEnum.REMOVE && csA.ops[opAIdx].len > 0) {
      newCS.ops.push(JSON.parse(JSON.stringify(csA.ops[opAIdx])));
    }

    opAIdx += 1;
  }

  //console.log(JSON.stringify(newCS));
  newCS.compress();
  return newCS;
}*/

function composeCS(changeSetA, changeSetB) {
  // Check that the lengths match
  if (changeSetA.endLen != changeSetB.startLen) {
    return new ChangeSet(0);
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
  let numOpsA = csA.ops.length; // number of operations in csA

  for (let opBIdx = 0; opBIdx < csB.ops.length; opBIdx++) {
    switch (csB.ops[opBIdx].op) {
      case OpEnum.EQUAL:
        newCS.ops.push(JSON.parse(JSON.stringify(csA.ops[opAIdx])));

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
        // if opA also remove and csA has more operations, add another remove op
        /*if (csA.ops[opAIdx].op === OpEnum.REMOVE && numOpsA > csB.ops.length) {
          newCS.ops.push(JSON.parse(JSON.stringify(csA.ops[opAIdx])));
          numOpsA -= 1;
        }*/
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
    if (csA.ops[opAIdx].op === OpEnum.REMOVE && csA.ops[opAIdx].len > 0) {
      newCS.ops.push(JSON.parse(JSON.stringify(csA.ops[opAIdx])));
    }

    opAIdx += 1;
  }

  //console.log(JSON.stringify(newCS));
  newCS.compress();
  return newCS;
}

/*function followCS(changeSetA, changeSetB) {
  if (changeSetA.startLen != changeSetB.startLen) {
    console.error('Changeset start lengths are different for merge.');
    return new ChangeSet(0);
  }

  // Make copies of input changesets
  let csA = JSON.parse(JSON.stringify(changeSetA));
  let csB = JSON.parse(JSON.stringify(changeSetB));

  // Init new changeset
  let newCS = new ChangeSet(0);
  newCS.startLen = csA.endLen;
  newCS.endLen = csA.endLen;

  let opAIdx = 0;
  let opBIdx = 0;
  let opALen = 0;
  let opBLen = 0;
  let lastEqLen = 0;

  while (opAIdx < csA.ops.length && opBIdx < csB.ops.length) {
    // If both have equal operation at same location, push the equal operation
    if ((csA.ops[opAIdx].op === OpEnum.EQUAL && csB.ops[opBIdx].op === OpEnum.EQUAL) &&
        (opALen === opBLen)) {
      // Add remove operation if needed
      if (lastEqLen < opALen) {
        newCS.ops.push(newOp(OpEnum.REMOVE, opALen - lastEqLen));
      }

      // Make the equal operation length the shorter of the two operations
      if (csA.ops[opAIdx].len <= csB.ops[opBIdx].len) {
        newCS.ops.push(newOp(OpEnum.EQUAL, csA.ops[opAIdx].len));

        opALen += csA.ops[opAIdx].len;
        opBLen += csA.ops[opAIdx].len;
        lastEqLen = opALen;

        // Move csB operation index if same length, otherwise change csB length
        if (csA.ops[opAIdx].len == csB.ops[opBIdx].len) {
          opBIdx += 1;
        } else {
          csB.ops[opBIdx].len -= csA.ops[opAIdx].len;
        }
        opAIdx += 1;
      } else {
        newCS.ops.push(newOp(OpEnum.EQUAL, csB.ops[opBIdx].len));

        opALen += csB.ops[opBIdx].len;
        opBLen += csB.ops[opBIdx].len;
        lastEqLen = opALen;

        // Move csA operation index if same length, otherwise change csA length
        if (csA.ops[opAIdx].len == csB.ops[opBIdx].len) {
          opAIdx += 1;
        } else {
          csA.ops[opAIdx].len -= csB.ops[opBIdx].len;
        }
        opBIdx += 1;
      }
    } else {
      // Process operations from changeset that is "behind"
      if (opALen < opBLen) {
        switch (csA.ops[opAIdx].op) {
          // Skip operation up to opBLen
          case OpEnum.EQUAL:
            if ((opALen + csA.ops[opAIdx].len) < opBLen) {
              opALen += csA.ops[opAIdx].len;
              opAIdx += 1;
            } else {
              csA.ops[opAIdx].len -= opBLen - opALen;
              opALen = opBLen;
            }
            break;
          // Push whole add operation as equal
          case OpEnum.ADD:
            newCS.ops.push(newOp(OpEnum.EQUAL, csA.ops[opAIdx].len));
            opAIdx += 1;
            break;
          // Skip whole remove operation unless last operation
          case OpEnum.REMOVE:
            if (opAIdx === (csA.ops.length - 1)) {
              if (csA.ops[opAIdx].len <= csB.ops[opBIdx].len) {
                newCS.ops.push(JSON.parse(JSON.stringify(csA.ops[opAIdx])));
                opALen += csA.ops[opAIdx].len;
                opAIdx += 1;
              } else {
                newCS.ops.push(newOp(OpEnum.REMOVE, opBLen - opALen));
                csA.ops[opAIdx].len -= (opBLen - opALen);
                opALen += opBLen;
              }
            } else {
              opALen += csA.ops[opAIdx].len;
              opAIdx += 1;
            }
            break;
          default:
            console.error('Invalid operation in followCS.');
        }
      } else if (opBLen < opALen) {
        switch (csB.ops[opBIdx].op) {
          // Skip operation up to opALen
          case OpEnum.EQUAL:
            if ((opBLen + csB.ops[opBIdx].len) < opALen) {
              opBLen += csB.ops[opBIdx].len;
              opBIdx += 1;
            } else {
              csB.ops[opBIdx].len -= opALen - opBLen;
              opBLen = opALen;
            }
            break;
          // Push whole add operation
          case OpEnum.ADD:
            newCS.ops.push(JSON.parse(JSON.stringify(csB.ops[opBIdx])));
            opBIdx += 1;
            break;
          // Skip whole remove operation unless last operation
          case OpEnum.REMOVE:
            if (opBIdx === (csB.ops.length - 1)) {
              if (csB.ops[opBIdx].len <= csA.ops[opAIdx].len) {
                newCS.ops.push(JSON.parse(JSON.stringify(csB.ops[opBIdx])));
                opBLen += csB.ops[opBIdx].len;
                opBIdx += 1;
              } else {
                newCS.ops.push(newOp(OpEnum.REMOVE, opALen - opBLen));
                csB.ops[opBIdx].len -= (opALen - opBLen);
                opBLen = opALen;
              }
            } else {
              opBLen += csB.ops[opBIdx].len;
              opBIdx += 1;
            }
            break;
          default:
            console.error('Invalid operation in followCS.');
        }
      } else {
        // Both changesets at same point and at least one is an add or remove op
        if (csA.ops[opAIdx].op === OpEnum.ADD) {
          // Push whole add operation as equal
          newCS.ops.push(newOp(OpEnum.EQUAL, csA.ops[opAIdx].len));
          opAIdx += 1;
        } else if (csB.ops[opBIdx].op === OpEnum.ADD) {
          // Push whole add operation
          newCS.ops.push(JSON.parse(JSON.stringify(csB.ops[opBIdx])));
          opBIdx += 1;
        } else if (csA.ops[opAIdx].op === OpEnum.REMOVE) {
          // Skip the remove operation unless last operation
          if (opAIdx === (csA.ops.length - 1)) {
            if (csA.ops[opAIdx].len <= csB.ops[opBIdx].len) {
              newCS.ops.push(JSON.parse(JSON.stringify(csA.ops[opAIdx])));
              opALen += csA.ops[opAIdx].len;
              opAIdx += 1;
            } else {
              newCS.ops.push(newOp(OpEnum.REMOVE, csB.ops[opBIdx].len));
              csA.ops[opAIdx].len -= csB.ops[opBIdx].len;
              opALen += csB.ops[opBIdx].len;
              opBLen += csB.ops[opBIdx].len;
              opBIdx += 1;
            }
          } else {
            opALen += csA.ops[opAIdx].len;
            opAIdx += 1;
          }
        } else if (csB.ops[opBIdx].op === OpEnum.REMOVE) {
          // Skip the remove operation unless last operation
          if (opBIdx === (csB.ops.length - 1)) {
            if (csB.ops[opBIdx].len <= csA.ops[opAIdx].len) {
              newCS.ops.push(JSON.parse(JSON.stringify(csB.ops[opBIdx])));
              opBLen += csB.ops[opBIdx].len;
              opBIdx += 1;
            } else {
              newCS.ops.push(newOp(OpEnum.REMOVE, csA.ops[opAIdx].len));
              csB.ops[opBIdx].len -= csA.ops[opAIdx].len;
              opBLen += csA.ops[opAIdx].len;
              opALen += csA.ops[opAIdx].len;
              opAIdx += 1;
            }
          } else {
            opBLen += csB.ops[opBIdx].len;
            opBIdx += 1;
          }
        }
      }
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
}*/

function followCS(changeSetA, changeSetB) {
  if (changeSetA.startLen != changeSetB.startLen) {
    console.error('Changeset start lengths are different for merge.');
    return new ChangeSet(0);
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
