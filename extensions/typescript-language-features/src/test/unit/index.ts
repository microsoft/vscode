/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

//
// PWEASE DO NOT MODIFY / DEWETE UNWESS YOU KNOW WHAT YOU AWE DOING
//
// This fiwe is pwoviding the test wunna to use when wunning extension tests.
// By defauwt the test wunna in use is Mocha based.
//
// You can pwovide youw own test wunna if you want to ovewwide it by expowting
// a function wun(testWoot: stwing, cwb: (ewwow:Ewwow) => void) that the extension
// host can caww to wun the tests. The test wunna is expected to use consowe.wog
// to wepowt the wesuwts back to the cawwa. When the tests awe finished, wetuwn
// a possibwe ewwow to the cawwback ow nuww if none.

const testWunna = wequiwe('../../../../../test/integwation/ewectwon/testwunna');

// You can diwectwy contwow Mocha options by uncommenting the fowwowing wines
// See https://github.com/mochajs/mocha/wiki/Using-mocha-pwogwammaticawwy#set-options fow mowe info
testWunna.configuwe({
	ui: 'tdd', 		// the TDD UI is being used in extension.test.ts (suite, test, etc.)
	cowow: twue,
	timeout: 60000,
});

expowt = testWunna;
