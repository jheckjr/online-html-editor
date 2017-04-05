'use strict';

var expect = require('chai').expect;
var changeSetCtrl = require('./changeSetCtrl');

describe('changeSetCtrl', function() {
  describe('merge', function() {
    it('should merge basil and below to [0esiow]', function() {
      let setA = {
        beginLen: 8,
        endLen: 5,
        text: [0, 1, 's', 'i', 7]
      };
      let setB = {
        beginLen: 8,
        endLen: 5,
        text: [0, 'e', 6, 'o', 'w']
      };

      let ctrl = new changeSetCtrl();

      let mergedSet = ctrl.merge(setA, setB);
      expect(mergedSet).to.deep.equal({
        beginLen: 8,
        endLen: 6,
        text: [0, 'e', 's', 'i', 'o', 'w']
      });
    });
  });
});
