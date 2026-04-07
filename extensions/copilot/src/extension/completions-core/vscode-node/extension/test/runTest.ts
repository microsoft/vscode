/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { promises as fs } from 'fs';
import * as os from 'os';
import * as path from 'path';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';

import { runTests } from '@vscode/test-electron';

async function main() {
	const tempdir = await fs.mkdtemp(os.tmpdir() + '/copilot-extension-test-');

	let exitCode;
	try {
		// The folder containing the Extension Manifest package.json
		// Passed to `--extensionDevelopmentPath`
		const extensionDevelopmentPath = path.resolve(__dirname, '../..');

		// The path to the extension test script (must be javascript)
		// Passed to --extensionTestsPath
		const extensionTestsPath = path.resolve(__dirname, './run');

		const launchArgs = [];
		// Disable other extensions while testing,
		launchArgs.push('--disable-extensions');

		// use a temporary folder so we can run multiple instances of the same VS Code together
		// see https://github.com/microsoft/vscode/issues/137678
		launchArgs.push('--user-data-dir', tempdir);

		const argv = await yargs(hideBin(process.argv))
			.options({
				stable: {
					type: 'boolean',
					default: false,
				},
				grep: {
					alias: 'g',
					type: 'string',
					default: '',
				},
			})
			.parse();
		const extensionTestsEnv: typeof process.env = {};
		// Pass arguments to mocha by environment variables
		if (argv.grep) { extensionTestsEnv.MOCHA_GREP = argv.grep; }
		if (argv._.length > 0) { extensionTestsEnv.MOCHA_FILES = argv._.join('\n'); }
		if (!process.stdout.isTTY) { extensionTestsEnv.NO_COLOR = 'true'; }
		const workspaceFolder = await fs.mkdtemp(path.join(os.tmpdir(), 'copilot-extension-test-'));
		launchArgs.push(workspaceFolder);

		extensionTestsEnv.CORETEST = 'true';
		//@dbaeumer This can be removed as soon as we have the cache handle CORETEST
		extensionTestsEnv.VITEST = 'true';
		extensionTestsEnv.TSX_TSCONFIG_PATH = path.resolve(__dirname, '../../../../../../tsconfig.json');

		const testOptions: Parameters<typeof runTests>[0] = {
			extensionDevelopmentPath,
			extensionTestsPath,
			launchArgs,
			extensionTestsEnv,
		};

		if (process.env.VSCODE_UNDER_TEST) {
			testOptions.vscodeExecutablePath = process.env.VSCODE_UNDER_TEST;
		} else {
			testOptions.version = argv.stable ? 'stable' : 'insiders';
		}

		// Download VS Code, unzip it and run the integration test
		exitCode = await runTests(testOptions);
	} catch (err) {
		console.error('Failed to run tests', err);
		exitCode = 1;
	} finally {
		await fs.rm(tempdir, { recursive: true });
	}
	process.exit(exitCode);
}

void main();
