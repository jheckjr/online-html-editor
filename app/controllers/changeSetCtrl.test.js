'use strict';

var expect = require('chai').expect;
var changeSetCtrl = require('./changeSetCtrl');

describe('changeSetCtrl', function() {
  describe('merge', function() {
    let setA;
    let setB;
    let ctrl;

    beforeEach(function() {
      setA = {
        beginLen: 8,
        endLen: 5,
        text: [0, 1, 's', 'i', 7]
      };
      setB = {
        beginLen: 8,
        endLen: 5,
        text: [0, 'e', 6, 'o', 'w']
      };
      ctrl = new changeSetCtrl();
    });

    it('should merge basil and below to [0esiow]', function() {
      let mergedSet = ctrl.merge(setA, setB);
      expect(mergedSet).to.deep.equal({
        beginLen: 8,
        endLen: 6,
        text: [0, 'e', 's', 'i', 'o', 'w']
      });
    });

    it('should merge below and basil to [0esiow]', function() {
      let mergedSet = ctrl.merge(setB, setA);
      expect(mergedSet).to.deep.equal({
        beginLen: 8,
        endLen: 6,
        text: [0, 'e', 's', 'i', 'o', 'w']
      });
    });
  });

  describe('follow', function() {
    let setA;
    let setB;
    let ctrl;
    before(function() {
      setA = {
        beginLen: 8,
        endLen: 5,
        text: [0, 1, 's', 'i', 7]
      };
      setB = {
        beginLen: 8,
        endLen: 5,
        text: [0, 'e', 6, 'o', 'w']
      };
      ctrl = new changeSetCtrl();
    });

    it('should turn (8, 5, "01si7") and (8, 5, "0e6ow") into (5, 6, "0e23ow")',
      function() {
        let followSet = ctrl.follow(setA, setB);
        expect(followSet).to.deep.equal({
          beginLen: 5,
          endLen: 6,
          text: [0, 'e', 2, 3, 'o', 'w']
        });
      });

    it('should turn (8, 5, "01si7") and (8, 5, "0e6ow") into (5, 6, "01si34")',
      function() {
        let followSet = ctrl.follow(setB, setA);
        expect(followSet).to.deep.equal({
          beginLen: 5,
          endLen: 6,
          text: [0, 1, 's', 'i', 3, 4]
        });
      });
  });

  describe('compose', function() {
    let setA;
    let setB;
    let ctrl;
    before(function() {
      setA = {
        beginLen: 8,
        endLen: 5,
        text: [0, 1, 's', 'i', 7]
      };
      setB = {
        beginLen: 8,
        endLen: 5,
        text: [0, 'e', 6, 'o', 'w']
      };
      ctrl = new changeSetCtrl();
    });

    it('should turn (8, 5, "01si7") and (8, 5, "0e6ow") into (5, 6, "01si34")',
      function() {
        let followSet = ctrl.follow(setB, setA);
        let composedSet = ctrl.compose(setB, followSet);
        expect(composedSet).to.deep.equal({
          beginLen: 8,
          endLen: 6,
          text: [0, 'e', 's', 'i', 'o', 'w']
        });
      });
  });
});
