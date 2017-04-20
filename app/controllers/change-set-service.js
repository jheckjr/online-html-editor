'use strict';

// Create identity changeset
var ChangeSet = function(startLen) {
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
};

var OpEnum = {
  ADD: '+',
  REMOVE: '-',
  EQUAL: '='
};

var newOp = function(op, opLength) {
  return {
    op: op,
    len: opLength
  };
};

// Convert data from server to changeset
var convertToChangeSet = function(data) {
  let newCS = new ChangeSet(0);
  newCS.startLen = data.startLen;
  newCS.endLen = data.endLen;
  newCS.ops = data.ops;
  newCS.changeText = data.changeText;

  return newCS;
};

var followCS = function(changeSetA, changeSetB) {
  if (changeSetA.startLen != changeSetB.startLen) {
    console.error('Changeset start lengths are different for merge.', changeSetA, changeSetB);
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
};

/*
 * Compose two changesets together
 */
var composeCS = function(changeSetA, changeSetB) {
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

  //console.log(JSON.stringify(newCS));
  newCS.compress();
  return newCS;
};

module.exports.ChangeSet = ChangeSet;
module.exports.OpEnum = OpEnum;
module.exports.newOp = newOp;
module.exports.convertToChangeSet = convertToChangeSet;
module.exports.followCS = followCS;
module.exports.composeCS = composeCS;
