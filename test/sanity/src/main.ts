/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import minimist from 'minimist';
import os from 'os';
import { setup as setupCliTests } from './cli.test.js';
import { TestContext } from './context.js';
import { setup as setupDesktopTests } from './desktop.test.js';
import { setup as setupServerTests } from './server.test.js';
import { setup as setupServerWebTests } from './serverWeb.test.js';
import { setup as setupWSLTests } from './wsl.test.js';

const options = minimist(process.argv.slice(2), {
	string: ['commit', 'quality'],
	boolean: ['cleanup', 'verbose', 'signing-check', 'headless', 'detection'],
	alias: { commit: 'c', quality: 'q', verbose: 'v' },
	default: { cleanup: true, verbose: false, 'signing-check': true, headless: true, 'detection': true },
});

if (!options.commit) {
	throw new Error('--commit is required');
}

if (!options.quality) {
	throw new Error('--quality is required');
}

const context = new TestContext({
	quality: options.quality,
	commit: options.commit,
	verbose: options.verbose,
	cleanup: options.cleanup,
	checkSigning: options['signing-check'],
	headlessBrowser: options.headless,
	downloadOnly: !options['detection'],
});

context.log(`Arguments: ${process.argv.slice(2).join(' ')}`);
context.log(`Platform: ${os.platform()}, Architecture: ${os.arch()}`);
context.log(`Capabilities: ${Array.from(context.capabilities).join(', ')}`);

beforeEach(function () {
	context.consoleOutputs = [];
	(this.currentTest! as { consoleOutputs?: string[] }).consoleOutputs = context.consoleOutputs;
});

setupCliTests(context);
setupDesktopTests(context);
setupServerTests(context);
setupServerWebTests(context);
setupWSLTests(context);
