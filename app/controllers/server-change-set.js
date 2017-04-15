'use strict';

var serverChangeSet = function() {
  // Create identity changeset
  this.ChangeSet = function(startLen) {
    this.startLen = startLen;
    this.endLen = startLen;
    this.ops = [];
    if (startLen > 0) {
      this.ops = [this.newOp(this.OpEnum.EQUAL, startLen)];
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
        newOps.push(this.newOp(this.ops[idx].op, len));
        if (this.ops[idx].op !== this.OpEnum.REMOVE) {
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
        if (this.ops[idx].op === this.OpEnum.ADD) {
          if (expandAdds){
            // Expand to be multiple ops of length one
            for (let newIdx = 0; newIdx < this.ops[idx].len; newIdx++) {
              newOps.push(this.newOp(this.ops[idx].op, 1));
              newEndLen += 1;
            }
          } else {
            newOps.push(JSON.parse(JSON.stringify(this.ops[idx])));
            newEndLen += 1;
          }
        } else {
          // Expand removes and equals to be multiple ops of length one
          for (let newIdx = 0; newIdx < this.ops[idx].len; newIdx++) {
            newOps.push(this.newOp(this.ops[idx].op, 1));
            newEndLen += 1;
          }
        }
      }

      this.ops = newOps;
      this.endLen = newEndLen;
    };
  };

  this.OpEnum = {
    ADD: '+',
    REMOVE: '-',
    EQUAL: '='
  };

  this.newOp = function(op, opLength) {
    return {
      op: op,
      len: opLength
    };
  };

  // Convert data from server to changeset
  this.convertToChangeSet = function(data) {
    let newCS = new this.ChangeSet(0);
    newCS.startLen = data.startLen;
    newCS.endLen = data.endLen;
    newCS.ops = data.ops;
    newCS.changeText = data.changeText;

    return newCS;
  };

  this.followCS = function(changeSetA, changeSetB) {
    if (changeSetA.startLen != changeSetB.startLen) {
      console.error('Changeset start lengths are different for merge.');
      return new this.ChangeSet(0);
    }

    // Make copies of input changesets
    let csA = this.convertToChangeSet(JSON.parse(JSON.stringify(changeSetA)));
    let csB = this.convertToChangeSet(JSON.parse(JSON.stringify(changeSetB)));

    // Init new changeset
    let newCS = new this.ChangeSet(0);
    newCS.startLen = csA.endLen;
    newCS.endLen = csA.endLen;

    csA.expand(false);
    csB.expand(false);

    let opAIdx = 0;
    let opBIdx = 0;

    while (opAIdx < csA.ops.length && opBIdx < csB.ops.length) {
      // Push all adds
      if (csA.ops[opAIdx].op === this.OpEnum.ADD) {
        // Push whole add operation as equal
        newCS.ops.push(this.newOp(this.OpEnum.EQUAL, csA.ops[opAIdx].len));
        opAIdx += 1;
      } else if (csB.ops[opBIdx].op === this.OpEnum.ADD) {
        // Push whole add operation
        newCS.ops.push(JSON.parse(JSON.stringify(csB.ops[opBIdx])));
        opBIdx += 1;
      } else if (csA.ops[opAIdx].op === this.OpEnum.EQUAL &&
        csB.ops[opBIdx].op === this.OpEnum.EQUAL ) {
        // Push equal if both equal
        newCS.ops.push(this.newOp(this.OpEnum.EQUAL, csA.ops[opAIdx].len));
        opAIdx += 1;
        opBIdx += 1;
      } else {
        // If one or both is remove, push remove
        newCS.ops.push(this.newOp(this.OpEnum.REMOVE, csA.ops[opAIdx].len));
        opAIdx += 1;
        opBIdx += 1;
      }
    }

    // Process remaining add operations and keep remove operation if last operation
    if (opAIdx < csA.ops.length) {
      for (let idx = opAIdx; idx < csA.ops.length; idx++) {
        if (csA.ops[idx].op === this.OpEnum.ADD) {
          newCS.ops.push(this.newOp(this.OpEnum.EQUAL, csA.ops[idx].len));
        } else if (csA.ops[idx].op === this.OpEnum.REMOVE && (idx === csA.ops.length - 1)) {
          newCS.ops.push(JSON.parse(JSON.stringify(csA.ops[idx])));
        }
      }
    } else if (opBIdx < csB.ops.length) {
      for (let idx = opBIdx; idx < csB.ops.length; idx++) {
        if (csB.ops[idx].op === this.OpEnum.ADD) {
          newCS.ops.push(this.newOp(this.OpEnum.ADD, csB.ops[idx].len));
        } else if (csB.ops[idx].op === this.OpEnum.REMOVE && (idx === csB.ops.length - 1)) {
          newCS.ops.push(JSON.parse(JSON.stringify(csB.ops[idx])));
        }
      }
    }

    newCS.changeText = csB.changeText;
    newCS.compress();

    return newCS;
  };
};

module.exports = serverChangeSet;
