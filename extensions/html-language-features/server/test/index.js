/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as path from 'node:path';
import glob from 'glob';
import Mocha from 'mocha';

const suite = 'Integration HTML Extension Tests';
const testRoot = import.meta.dirname;

const options = {
	ui: 'tdd',
	color: true,
	timeout: 60000
};

if (process.env.MOCHA_GREP) {
	options.grep = process.env.MOCHA_GREP;
}

if (process.env.BUILD_ARTIFACTSTAGINGDIRECTORY || process.env.GITHUB_WORKSPACE) {
	options.reporter = 'mocha-multi-reporters';
	options.reporterOptions = {
		reporterEnabled: 'spec, mocha-junit-reporter',
		mochaJunitReporterReporterOptions: {
			testsuitesTitle: `${suite} ${process.platform}`,
			mochaFile: path.join(
				process.env.BUILD_ARTIFACTSTAGINGDIRECTORY || process.env.GITHUB_WORKSPACE || testRoot,
				`test-results/${process.platform}-${process.arch}-${suite.toLowerCase().replace(/[^\w]/g, '-')}-results.xml`)
		}
	};
}

const mocha = new Mocha(options);

glob.sync(path.posix.join(testRoot, '../out/test/**/*.test.js'))
	.forEach(file => mocha.addFile(file));

mocha.run(failures => process.exit(failures ? -1 : 0));
