'use strict';
/*
 * set = {beginLen: , endLen: , text:[]}
 */
function changeSetCtrl() {
  this.merge = function(setA, setB) {
    let newText = new Array();
    let minLength = Math.min(setA.endLen, setB.endLen);
    let maxLength = Math.max(setA.endLen, setB.endLen);

    for (let i = 0; i < minLength; i++) {
      if (setA.text[i] === setB.text[i] && Number.isInteger(setA.text[i])) {
        // if char in A and B is matching integer, add to array
        newText.push(i);
      } else {
        if (!Number.isInteger(setA.text[i])) {
          // if char in A is char, add to array
          newText.push(setA.text[i]);
        }
        if (!Number.isInteger(setB.text[i])) {
          // if char in B is char, add to array
          newText.push(setB.text[i]);
        }
      }
    }

    // add any char remaining in longer set to array
    let remainingText = maxLength === setA.endLen ? setA.text.slice(minLength) : setB.text.slice(minLength);
    for (let i = minLength; i < maxLength; i++) {
      if (!Number.isInteger(remainingText[i])) {
        newText.push(remainingText[i]);
      }
    }

    return {
      beginLen: setA.beginLen,
      endLen: newText.length,
      text: newText
    };
  };

  this.follow = function(setA, setB) {
    let newText = new Array();
    let minLength = Math.min(setA.endLen, setB.endLen);
    let maxLength = Math.max(setA.endLen, setB.endLen);

    for (let i = 0; i < minLength; i++) {
      if (setA.text[i] === setB.text[i] && Number.isInteger(setA.text[i])) {
        // if char in A and B is matching integer, add to array
        newText.push(i);
      } else if (!Number.isInteger(setA.text[i])) {
        // if char in A is char, add to array
        newText.push(i);
      } else if (!Number.isInteger(setB.text[i])) {
        // if char in B is char, add to array
        newText.push(setB.text[i]);
      }
    }

    // add any char remaining in longer set to array
    let remainingText = maxLength === setA.endLen ? setA.text.slice(minLength) : setB.text.slice(minLength);
    for (let i = minLength; i < maxLength; i++) {
      if (!Number.isInteger(remainingText[i])) {
        newText.push(remainingText[i]);
      }
    }

    return {
      beginLen: setA.beginLen,
      endLen: newText.length,
      text: newText
    };
  };
}

module.exports = changeSetCtrl;
