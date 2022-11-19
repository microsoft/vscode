/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

//@ts-check
'use strict';

const paths = require('path');
const glob = require('glob');
// Linux: prevent a weird NPE when mocha on Linux requires the window size from the TTY
// Since we are not running in a tty environment, we just implement the method statically
const tty = require('tty');
// @ts-ignore
if (!tty.getWindowSize) {
	// @ts-ignore
	tty.getWindowSize = function () { return [80, 75]; };
}
const Mocha = require('mocha');

let mocha = new Mocha({
	ui: 'tdd',
	color: true
});

exports.configure = function configure(opts) {
	mocha = new Mocha(opts);
};

exports.run = function run(testsRoot, clb) {
	// Enable source map support
	require('source-map-support').install();

	// Glob test files
	glob('**/**.test.js', { cwd: testsRoot }, function (error, files) {
		if (error) {
			return clb(error);
		}
		try {
			// Fill into Mocha
			files.forEach(function (f) { return mocha.addFile(paths.join(testsRoot, f)); });
			// Run the tests
			mocha.run(function (failures) {
				clb(null, failures);
			});
		}
		catch (error) {
			return clb(error);
		}
	});
};
