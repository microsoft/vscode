/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import fs from 'fs';
import minimist from 'minimist';
import Mocha, { MochaOptions } from 'mocha';
import path from 'path';
import { fileURLToPath } from 'url';

const options = minimist(process.argv.slice(2), {
	string: ['fgrep', 'grep', 'test-results', 'timeout'],
	boolean: ['help'],
	alias: { fgrep: 'f', grep: 'g', help: 'h', 'test-results': 't' },
});

if (options.help) {
	console.info('Usage: npm run sanity-test -- [options]');
	console.info('Options:');
	console.info('  --commit, -c <commit>           The commit to test (required)');
	console.info(`  --quality, -q <quality>         The quality to test (required, "stable", "insider" or "exploration")`);
	console.info('  --no-cleanup                    Do not cleanup downloaded files after each test');
	console.info('  --no-signing-check              Skip Authenticode and codesign signature checks');
	console.info('  --no-headless                   Run tests with a visible UI (desktop tests only)');
	console.info('  --no-detection                  Enable all tests regardless of platform and skip executable runs');
	console.info('  --grep, -g <pattern>            Only run tests matching the given <pattern>');
	console.info('  --fgrep, -f <string>            Only run tests containing the given <string>');
	console.info('  --test-results, -t <path>       Output test results in JUnit format to the specified path');
	console.info('  --timeout <sec>                 Set the test-case timeout in seconds (default: 600 seconds)');
	console.info('  --verbose, -v                   Enable verbose logging');
	console.info('  --help, -h                      Show this help message');
	process.exit(0);
}

const testResults = options['test-results'];
const mochaOptions: MochaOptions = {
	color: true,
	timeout: (options.timeout ?? 600) * 1000,
	slow: 3 * 60 * 1000,
	grep: options.grep,
	fgrep: options.fgrep,
	reporter: testResults ? 'mocha-junit-reporter' : undefined,
	reporterOptions: testResults ? { mochaFile: testResults, outputs: true } : undefined,
};

if (testResults) {
	fs.mkdirSync(path.dirname(testResults), { recursive: true });
}

const mocha = new Mocha(mochaOptions);
mocha.addFile(fileURLToPath(new URL('./main.js', import.meta.url)));
await mocha.loadFilesAsync();
mocha.run(failures => {
	process.exitCode = failures > 0 ? 1 : 0;
	// Force exit to prevent hanging on open handles (background processes, timers, etc.)
	setTimeout(() => process.exit(process.exitCode), 1000);
});
