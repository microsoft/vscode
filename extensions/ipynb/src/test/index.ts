/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as path from 'path';
import * as testRunner from '../../../../test/integration/electron/testrunner';

const options: import('mocha').MochaOptions = {
	ui: 'tdd',
	color: true,
	timeout: 60000
};

// These integration tests is being run in multiple environments (electron, web, remote)
// so we need to set the suite name based on the environment as the suite name is used
// for the test results file name
let suite = '';
if (process.env.VSCODE_BROWSER) {
	suite = `${process.env.VSCODE_BROWSER} Browser Integration .ipynb Tests`;
} else if (process.env.REMOTE_VSCODE) {
	suite = 'Remote Integration .ipynb Tests';
} else {
	suite = 'Integration .ipynb Tests';
}

if (process.env.BUILD_ARTIFACTSTAGINGDIRECTORY || process.env.GITHUB_WORKSPACE) {
	options.reporter = 'mocha-multi-reporters';
	options.reporterOptions = {
		reporterEnabled: 'spec, mocha-junit-reporter',
		mochaJunitReporterReporterOptions: {
			testsuitesTitle: `${suite} ${process.platform}`,
			mochaFile: path.join(
				process.env.BUILD_ARTIFACTSTAGINGDIRECTORY || process.env.GITHUB_WORKSPACE || __dirname,
				`test-results/${process.platform}-${process.arch}-${suite.toLowerCase().replace(/[^\w]/g, '-')}-results.xml`)
		}
	};
}

testRunner.configure(options);

export = testRunner;
