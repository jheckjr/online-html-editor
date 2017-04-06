'use strict';
/*
 * set = {beginLen: , endLen: , text:[]}
 */
function changeSetCtrl() {
  this.merge = function(setA, setB) {
    let newText = new Array();
    let idxA = 0;
    let idxB = 0;

    while (idxA < setA.endLen && idxB < setB.endLen) {
      // Add retained characters in both sets
      if ((idxA == idxB) && (setA.text[idxA] === setB.text[idxB]) &&
        (Number.isInteger(setA.text[idxA]))) {
        newText.push(idxA);
        idxA += 1;
        idxB += 1;
      } else {
        if (idxA <= idxB) {
          // Add continuous inserts from A
          while (idxA < setA.endLen && !Number.isInteger(setA.text[idxA])) {
            newText.push(setA.text[idxA]);
            idxA += 1;
          }

          idxA += 1;
        } else {
          // Add continuous inserts from B
          while (idxB < setB.endLen && !Number.isInteger(setB.text[idxB])) {
            newText.push(setB.text[idxB]);
            idxB += 1;
          }

          idxB += 1;
        }
      }
    }

    // Add any insert remaining in the longer set
    while (idxA < setA.endLen) {
      if (!Number.isInteger(setA.text[idxA])) {
        newText.push(setA.text[idxA]);
      }
      idxA += 1;
    }
    while (idxB < setB.endLen) {
      if (!Number.isInteger(setB.text[idxB])) {
        newText.push(setB.text[idxB]);
      }
      idxB += 1;
    }

    return {
      beginLen: setA.beginLen,
      endLen: newText.length,
      text: newText
    };
  };

  this.follow = function(setA, setB) {
    let mergedSet = this.merge(setA, setB);
    let followSet = {
      beginLen: setA.endLen,
      endLen: mergedSet.endLen,
      text: mergedSet.text
    };

    // Change inserts in mergedSet from setA to retained characters
    let startIdx = 0;
    for (let i = 0; i < followSet.text.length; i++) {
      // If not a number, find in setA text
      if (!Number.isInteger(followSet.text[i])) {
        let nextIdx = setA.text.indexOf(followSet.text[i], startIdx);
        // If in setA text, change the insert to retained character with index from setA
        if (nextIdx !== -1) {
          startIdx = nextIdx + 1;
          followSet.text[i] = nextIdx;
        }
      }
    }

    return followSet;
  };

  this.compose = function(setA, setB) {
    let composeSet = Object.assign({}, setB);
    composeSet.beginLen = setA.beginLen;
    let idxA = 0;

    for (let idxB = 0; idxB < setB.endLen; idxB++) {
      // If retained character in setB, use value in setA
      if (Number.isInteger(setB.text[idxB])) {
        setB.text[idxB] = setA.text[idxA];
        idxA += 1;
      } else if (Number.isInteger(setA.text[idxA])) {
        // Skip retained character in setA if insert in setB
        idxA += 1;
      }

      // Stop if all characters in setA used
      if (idxA >= setA.text.length) {
        break;
      }
    }

    return composeSet;
  };
}

module.exports = changeSetCtrl;
