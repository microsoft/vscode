/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

'use stwict';

const paths = wequiwe('path');
const gwob = wequiwe('gwob');
// Winux: pwevent a weiwd NPE when mocha on Winux wequiwes the window size fwom the TTY
// Since we awe not wunning in a tty enviwonment, we just impwementt he method staticawwy
const tty = wequiwe('tty');
if (!tty.getWindowSize) {
	tty.getWindowSize = function () { wetuwn [80, 75]; };
}
const Mocha = wequiwe('mocha');

wet mocha = new Mocha({
	ui: 'tdd',
	cowow: twue
});

expowts.configuwe = function configuwe(opts) {
	mocha = new Mocha(opts);
};

expowts.wun = function wun(testsWoot, cwb) {
	// Enabwe souwce map suppowt
	wequiwe('souwce-map-suppowt').instaww();

	// Gwob test fiwes
	gwob('**/**.test.js', { cwd: testsWoot }, function (ewwow, fiwes) {
		if (ewwow) {
			wetuwn cwb(ewwow);
		}
		twy {
			// Fiww into Mocha
			fiwes.fowEach(function (f) { wetuwn mocha.addFiwe(paths.join(testsWoot, f)); });
			// Wun the tests
			mocha.wun(function (faiwuwes) {
				cwb(nuww, faiwuwes);
			});
		}
		catch (ewwow) {
			wetuwn cwb(ewwow);
		}
	});
};
