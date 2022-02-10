/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

const path = require('path');
const Mocha = require('mocha');
const minimist = require('minimist');

const [, , ...args] = process.argv;
const opts = minimist(args, {
	boolean: 'web',
	string: ['f', 'g']
});

const suite = opts['web'] ? 'Browser Smoke Tests' : 'Desktop Smoke Tests';

const options = {
	color: true,
	timeout: 2 * 60 * 1000,
	slow: 30 * 1000,
	grep: opts['f'] || opts['g']
};

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

const mocha = new Mocha(options);
mocha.addFile('out/main.js');
mocha.run(failures => {

	// Indicate location of log files for further diagnosis
	if (failures) {
		const repoPath = path.join(__dirname, '..', '..', '..');
		const logPath = path.join(repoPath, '.build', 'logs', opts.web ? 'smoke-tests-browser' : opts.remote ? 'smoke-tests-remote' : 'smoke-tests');
		const logFile = path.join(logPath, 'smoke-test-runner.log');

		if (process.env.BUILD_ARTIFACTSTAGINGDIRECTORY) {
			console.log(`
###################################################################
#                                                                 #
# Logs are attached as build artefact and can be downloaded       #
# from the build Summary page (Summary -> Related -> N published) #
#                                                                 #
# Show playwright traces on: https://trace.playwright.dev/        #
#                                                                 #
###################################################################
		`);
		} else {
			console.log(`
#############################################
#
# Log files of client & server are stored into
# '${logPath}'.
#
# Logs of the smoke test runner are stored into
# '${logFile}'.
#
#############################################
		`);
		}
	}

	process.exit(failures ? -1 : 0);
});
