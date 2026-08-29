/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

require('tsx/cjs');

const { globSync } = require('glob');
const Mocha = require('mocha');
const path = require('path');
const dotenv = require('dotenv');
const envfile = path.join(__dirname, '../../../../../../.env');
dotenv.config({ path: envfile });

function run() {
	const projectRoot = path.resolve(__dirname, '../..');
	const mochaOptions = {
		ui: 'tdd',
		color: !process.env.NO_COLOR && process.env.TERM !== 'dumb',
		reporter: 'mocha-multi-reporters',
		reporterOptions: {
			reporterEnabled: 'spec',
		},
	};
	if (process.env.MOCHA_GREP) {
		mochaOptions.grep = process.env.MOCHA_GREP;
	}
	if (process.env.CI) {
		mochaOptions.forbidOnly = true;
		mochaOptions.retries = 2;
		mochaOptions.reporterOptions.reporterEnabled += ', mocha-junit-reporter';
		mochaOptions.reporterOptions.mochaJunitReporterReporterOptions = {
			testCaseSwitchClassnameAndName: true,
			testsuitesTitle: 'Copilot VS Code Extension Tests',
			mochaFile: path.resolve(projectRoot, 'test-results-Extension.xml'),
		};
	}
	if (process.env.GITHUB_EVENT_NAME === 'merge_group') {
		mochaOptions.retries = 3;
	}

	// Create the mocha test
	const mocha = new Mocha(mochaOptions);

	let fileCount = 0;
	(process.env.MOCHA_FILES || [
		path.resolve(projectRoot, 'lib/src/**/*.test.{ts,tsx}'),
		path.resolve(projectRoot, 'extension/src/**/*.test.{ts,tsx}')
	].join('\n')).split('\n').forEach(f => {
		globSync(f, { windowsPathsNoEscape: true }).forEach(f => {
			fileCount++;
			mocha.addFile(f);
		});
	});
	if (!fileCount) {
		throw new Error('No tests to run');
	}

	return new Promise((c, e) => {
		try {
			// Run the mocha test
			mocha.run(failures => {
				if (failures > 0) {
					e(new Error(`${failures} tests failed.`));
				} else {
					c();
				}
			});
		} catch (err) {
			e(err);
		}
	});
}

module.exports = { run };
