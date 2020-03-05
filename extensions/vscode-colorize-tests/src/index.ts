/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as path from 'path';
import * as Mocha from 'mocha';
import * as glob from 'glob';

const suite = 'Integration Colorize Tests';

export function run(): Promise<void> {
	// Create the mocha test
	const options: {
		ui?: string;
		timeout?: number;
		reporter?: string;
		reporterOptions?: any;
	} = {
		ui: 'tdd',
		timeout: 60000,
		reporter: undefined,
		reporterOptions: undefined
	};

	if (process.env.BUILD_ARTIFACTSTAGINGDIRECTORY) {
		options.reporter = 'mocha-multi-reporters';
		options.reporterOptions = {
			reporterEnabled: 'spec, mocha-junit-reporter',
			mochaJunitReporterReporterOptions: {
				testsuitesTitle: `${suite} ${process.platform}`,
				mochaFile: path.join(
					process.env.BUILD_ARTIFACTSTAGINGDIRECTORY,
					`test-results/${process.platform}-${suite.toLowerCase().replace(/[^\w]/g, '-')}-results.xml`
				)
			}
		};
	}

	const mocha = new Mocha(options);
	if (!process.env.BUILD_ARTIFACTSTAGINGDIRECTORY && process.platform !== 'win32') {
		mocha.useColors(true);
	}

	const testsRoot = path.resolve(__dirname, '..');

	return new Promise((c, e) => {
		glob('**/**.test.js', { cwd: testsRoot, ignore: '**/node_modules/**' }, (err, files) => {
			if (err) {
				return e(err);
			}

			// Add files to the test suite
			files.forEach(f => mocha.addFile(path.resolve(testsRoot, f)));

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
	});
}
