/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as path from 'path';
import * as glob from 'glob';
import Mocha from 'mocha';

const options: Mocha.MochaOptions = {
	ui: 'tdd',
	color: true,
	timeout: 60000,
	grep: process.env.MOCHA_GREP,
};

const ciOutputDir = process.env.BUILD_ARTIFACTSTAGINGDIRECTORY || process.env.GITHUB_WORKSPACE;
if (ciOutputDir) {
	const suite = 'Integration JSON Extension Tests';
	options.reporter = 'mocha-multi-reporters';
	options.reporterOptions = {
		reporterEnabled: 'spec, mocha-junit-reporter',
		mochaJunitReporterReporterOptions: {
			testsuitesTitle: `${suite} ${process.platform}`,
			mochaFile: path.join(ciOutputDir, `test-results/${process.platform}-${process.arch}-${suite.toLowerCase().replace(/[^\w]/g, '-')}-results.xml`)
		}
	};
}

const files = glob.sync('**/*.test.js', { cwd: __dirname });
if (files.length === 0) {
	throw new Error('No compiled JSON extension tests found.');
}

const mocha = new Mocha(options);
for (const file of files) {
	mocha.addFile(path.join(__dirname, file));
}
mocha.run(failures => {
	process.exitCode = failures ? 1 : 0;
});
