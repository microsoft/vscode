/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import mocha from 'mocha';
import { createRequire } from 'module';
import * as path from 'node:path';
import FullJsonStreamReporter from './fullJsonStreamReporter.js';

const require = createRequire(import.meta.url);

function parseReporterOption(value) {
	const r = /^([^=]+)=(.*)$/.exec(value);
	return r ? { [r[1]]: r[2] } : {};
}

export const importMochaReporter = name => {
	if (name === 'full-json-stream') {
		return FullJsonStreamReporter;
	}

	const reporterPath = path.join(path.dirname(require.resolve('mocha')), 'lib', 'reporters', name);
	return require(reporterPath);
};

export const applyReporter = (runner, argv) => {
	let Reporter;
	try {
		Reporter = importMochaReporter(argv.reporter);
	} catch (err) {
		try {
			Reporter = require(argv.reporter);
		} catch (err) {
			Reporter = process.platform === 'win32' ? mocha.reporters.List : mocha.reporters.Spec;
			console.warn(`could not load reporter: ${argv.reporter}, using ${Reporter.name}`);
		}
	}

	let reporterOptions = argv['reporter-options'];
	reporterOptions = typeof reporterOptions === 'string' ? [reporterOptions] : reporterOptions;
	reporterOptions = reporterOptions.reduce((r, o) => Object.assign(r, parseReporterOption(o)), {});

	return new Reporter(runner, { reporterOptions });
};
