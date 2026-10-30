/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import minimist from 'minimist';
import Mocha, { MochaOptions } from 'mocha';
import path from 'path';
import { fileURLToPath } from 'url';
import { CopilotShimPackageFormat, loadCopilotShimFixtureManifest } from './copilotShimFixtures.js';
import { setCopilotShimTestRuntime } from './copilotShimRuntime.js';

const options = minimist(process.argv.slice(2), {
	string: ['fixtures', 'format', 'grep', 'timeout'],
	boolean: ['help', 'verbose'],
	alias: { fixtures: 'f', grep: 'g', help: 'h' },
});

if (options.help) {
	console.info(`Usage: node ${path.basename(process.argv[1])} --fixtures <manifest> --format <deb|rpm> --grep <selector> [options]`);
	console.info('Options:');
	console.info('  --fixtures, -f <manifest>  Fixture manifest generated from disposable source/build copies');
	console.info('  --format <deb|rpm>         Package format for this isolated runner');
	console.info('  --grep, -g <selector>      Required Mocha selector, for example "DEB (K[1-9]|OSS|warns)"');
	console.info('  --timeout <seconds>        Per-test timeout in seconds (default: 600)');
	console.info('  --verbose                  Print test lifecycle progress');
	console.info('  --help, -h                 Show this help');
	process.exit(0);
}

if (typeof options.fixtures !== 'string' || options.fixtures.length === 0) {
	throw new Error('--fixtures <manifest> is required. This runner never downloads or discovers package fixtures.');
}
if (options.format !== 'deb' && options.format !== 'rpm') {
	throw new Error('--format must be exactly "deb" or "rpm". Run each package family in its own disposable runner.');
}
if (typeof options.grep !== 'string' || options.grep.length === 0) {
	throw new Error('--grep <selector> is required so a stateful lifecycle run has an explicit scope.');
}

const timeout = parseTimeout(options.timeout);
const format = options.format as CopilotShimPackageFormat;
const fixtures = loadCopilotShimFixtureManifest(options.fixtures);
setCopilotShimTestRuntime({ fixtures, format, grep: options.grep, timeout });

const mochaOptions: MochaOptions = {
	color: true,
	timeout,
	grep: options.grep,
	retries: 0,
	bail: true,
};

const mocha = new Mocha(mochaOptions);
mocha.addFile(fileURLToPath(new URL('./copilotShim.test.js', import.meta.url)));
await mocha.loadFilesAsync();

let executedTests = 0;
const runner = mocha.run(failures => {
	if (executedTests === 0) {
		console.error(`No Copilot shim package lifecycle tests matched --grep ${JSON.stringify(options.grep)}.`);
	}
	process.exitCode = failures > 0 || executedTests === 0 ? 1 : 0;
});
runner.on('test', () => executedTests++);

if (options.verbose) {
	runner.on('test', test => console.log(`Starting: ${test.fullTitle()}`));
	runner.on('pass', test => console.log(`Passed: ${test.fullTitle()}`));
	runner.on('fail', (test, error) => console.log(`Failed: ${test.fullTitle()} - ${error.message}`));
}

function parseTimeout(value: unknown): number {
	if (value === undefined) {
		return 10 * 60 * 1000;
	}
	if (typeof value !== 'string' || !/^\d+(?:\.\d+)?$/u.test(value)) {
		throw new Error('--timeout must be a positive number of seconds.');
	}

	const seconds = Number(value);
	if (!Number.isFinite(seconds) || seconds <= 0) {
		throw new Error('--timeout must be a positive number of seconds.');
	}
	return seconds * 1000;
}
