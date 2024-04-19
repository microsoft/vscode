/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

//@ts-check
'use strict';

import * as  paths from 'path';
import glob from 'glob';
// Linux: prevent a weird NPE when mocha on Linux requires the window size from the TTY
// Since we are not running in a tty environment, we just implement the method statically
import tty from 'tty';
// @ts-ignore
if (!tty.getWindowSize) {
	// @ts-ignore
	tty.getWindowSize = function () { return [80, 75]; };
}
import Mocha from 'mocha';

let mocha = new Mocha({
	ui: 'tdd',
	color: true
});

export const configure = function configure(opts) {
	mocha = new Mocha(opts);
};

export const run = async function run(testsRoot, clb) {
	// Enable source map support
	// TODO perhaps could also use nodejs builtin source map option here
	const sourceMapSupport = await import('source-map-support')
	sourceMapSupport.install()

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
