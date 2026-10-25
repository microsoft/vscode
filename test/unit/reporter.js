/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

const mocha = require('mocha');
const FullJsonStreamReporter = require('./fullJsonStreamReporter');
const fs = require('fs');
const path = require('path');

function parseReporterOption(value) {
	const r = /^([^=]+)=(.*)$/.exec(value);
	return r ? { [r[1]]: r[2] } : {};
}

exports.importMochaReporter = name => {
	if (name === 'full-json-stream') {
		return FullJsonStreamReporter;
	}

	const reporterPath = path.join(path.dirname(require.resolve('mocha')), 'lib', 'reporters', name);
	return require(reporterPath);
};

exports.applyReporter = (runner, argv) => {
	let Reporter;
	try {
		Reporter = exports.importMochaReporter(argv.reporter);
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

/**
 * Names the file in which a test runner reports which test files failed, when its run ends.
 */
exports.FAILURE_REPORT_ENV = 'VSCODE_TEST_FAILURE_REPORT';

/**
 * Writes the test files that still failed at the end of the run (`failed`), the ones that
 * failed but whose failures all passed when rerun (`flaky`), and the titles of the failures
 * that do not belong to a test file (`unattributed`) as JSON to the file that the
 * `VSCODE_TEST_FAILURE_REPORT` environment variable names, when it is set. Test files are
 * named the way `--runList` lists them: `src/vs/a.test.ts` for the module `vs/a.test`.
 * Never throws, so that the report cannot change the result of the run.
 * @param {{ failed: Iterable<string>; flaky?: Iterable<string>; unattributed: Iterable<string> }} failures
 * the test files as modules relative to the output folder, without extension
 */
exports.writeFailureReport = ({ failed, flaky = [], unattributed }) => {
	const reportPath = process.env[exports.FAILURE_REPORT_ENV];
	if (!reportPath) {
		return;
	}

	const toTestFile = (/** @type {string} */ moduleId) => `src/${moduleId.replace(/\\/g, '/')}.ts`;
	const failedFiles = new Set([...failed].map(toTestFile));
	const report = {
		failed: [...failedFiles].sort(),
		flaky: [...new Set([...flaky].map(toTestFile))].filter(file => !failedFiles.has(file)).sort(),
		unattributed: [...unattributed],
	};
	try {
		fs.mkdirSync(path.dirname(path.resolve(reportPath)), { recursive: true });
		fs.writeFileSync(reportPath, JSON.stringify(report, undefined, '\t'));
	} catch (err) {
		console.error(`Failed to write the failure report to ${reportPath}:`, err);
	}
};
