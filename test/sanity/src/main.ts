/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import minimist from 'minimist';
import { setup as setupCliTests } from './cli.test';
import { TestContext } from './context';
import { setup as setupDesktopTests } from './desktop.test';
import { setup as setupServerTests } from './server.test';
import { setup as setupServerWebTests } from './serverWeb.test';

const options = minimist(process.argv.slice(2), {
	string: ['commit', 'quality'],
	boolean: ['cleanup', 'verbose'],
	alias: { commit: 'c', quality: 'q', verbose: 'v' },
	default: { cleanup: true, verbose: false },
});

if (!options.commit) {
	throw new Error('--commit is required');
}

if (!options.quality) {
	throw new Error('--quality is required');
}

const context = new TestContext(options.quality, options.commit, options.verbose);

describe('VS Code Sanity Tests', () => {
	if (options.cleanup) {
		afterEach(() => {
			context.cleanup();
		});
	}

	setupCliTests(context);
	setupDesktopTests(context);
	setupServerTests(context);
	setupServerWebTests(context);
});
