/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

const path = require('path');
const testRunner = require('../../../../test/integration/electron/testrunner');

const options: any = {
	ui: 'tdd',
	useColors: (!process.env.BUILD_ARTIFACTSTAGINGDIRECTORY && process.platform !== 'win32'),
	timeout: 60000
};

// These integration tests is being run in multiple environments (electron, web, remote)
// so we need to set the suite name based on the environment as the suite name is used
// for the test results file name
let suite = '';
if (process.env.VSCODE_BROWSER) {
	suite = `${process.env.VSCODE_BROWSER} Browser Integration Emmet Tests`;
} else if (process.env.REMOTE_VSCODE) {
	suite = 'Remote Integration Emmet Tests';
} else {
	suite = 'Integration Emmet Tests';
}

if (process.env.BUILD_ARTIFACTSTAGINGDIRECTORY) {
	options.reporter = 'mocha-multi-reporters';
	options.reporterOptions = {
		reporterEnabled: 'spec, mocha-junit-reporter',
		mochaJunitReporterReporterOptions: {
			testsuitesTitle: `${suite} ${process.platform}`,
			mochaFile: path.join(process.env.BUILD_ARTIFACTSTAGINGDIRECTORY, `test-results/${process.platform}-${process.arch}-${suite.toLowerCase().replace(/[^\w]/g, '-')}-results.xml`)
		}
	};
}

testRunner.configure(options);

export = testRunner;

// import * as path from 'path';
// import * as Mocha from 'mocha';
// import * as glob from 'glob';

// export function run(testsRoot: string, cb: (error: any, failures?: number) => void): void {
// 	// Create the mocha test
// 	const mocha = new Mocha({
// 		ui: 'tdd'
// 	});
// 	mocha.useColors(true);

// 	glob('**/**.test.js', { cwd: testsRoot }, (err, files) => {
// 		if (err) {
// 			return cb(err);
// 		}

// 		// Add files to the test suite
// 		files.forEach(f => mocha.addFile(path.resolve(testsRoot, f)));

// 		try {
// 			// Run the mocha test
// 			mocha.run(failures => {
// 				cb(null, failures);
// 			});
// 		} catch (err) {
// 			console.error(err);
// 			cb(err);
// 		}
// 	});
// }
