/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import minimist from 'minimist';
import Mocha, { MochaOptions } from 'mocha';

const options = minimist(process.argv.slice(2), {
	string: ['fgrep', 'grep'],
	boolean: ['help'],
	alias: { fgrep: 'f', grep: 'g', help: 'h' },
});

if (options.help) {
	console.info('Usage: npm run sanity-test -- [options]');
	console.info('Options:');
	console.info('  --commit, -c <commit>           The commit to test (required)');
	console.info(`  --quality, -q <quality>         The quality to test (required, "stable", "insider" or "exploration")`);
	console.info('  --no-cleanup                    Do not cleanup downloaded files after each test');
	console.info('  --grep, -g <pattern>            Only run tests matching the given <pattern>');
	console.info('  --fgrep, -f <string>            Only run tests containing the given <string>');
	console.info('  --verbose, -v                   Enable verbose logging');
	console.info('  --help, -h                      Show this help message');
	process.exit(0);
}

const mochaOptions: MochaOptions = {
	color: true,
	timeout: 5 * 60 * 1000,
	slow: 3 * 60 * 1000,
	grep: options.grep,
	fgrep: options.fgrep,
};

const mocha = new Mocha(mochaOptions);
mocha.addFile(require.resolve('./main.js'));
mocha.run(failures => {
	process.exitCode = failures > 0 ? 1 : 0;
});
