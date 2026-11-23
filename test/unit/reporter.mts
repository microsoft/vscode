/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import mocha from 'mocha';
import { createRequire } from 'module';
import * as path from 'path';
import FullJsonStreamReporter from './fullJsonStreamReporter.js';

const require = createRequire(import.meta.url);

function parseReporterOption(value: string) {
	const r = /^([^=]+)=(.*)$/.exec(value);
	return r ? { [r[1]]: r[2] } : {};
}

export function importMochaReporter(name: string) {
	if (name === 'full-json-stream') {
		return FullJsonStreamReporter;
	}

	const reporterPath = path.join(path.dirname(require.resolve('mocha')), 'lib', 'reporters', name);
	return require(reporterPath);
}

export function applyReporter(runner: mocha.Runner, argv: { reporter: string; 'reporter-options': string | string[] }) {
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

	const reporterOptions = argv['reporter-options'];
	const parsedReporterOptions = (typeof reporterOptions === 'string' ? [reporterOptions] : reporterOptions).reduce((r, o) => Object.assign(r, parseReporterOption(o)), {});

	return new Reporter(runner, { reporterOptions: parsedReporterOptions });
}
