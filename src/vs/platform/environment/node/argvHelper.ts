/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { tmpdir } from 'os';
import { firstIndex } from 'vs/base/common/arrays';
import { localize } from 'vs/nls';
import { ParsedArgs } from '../common/environment';
import { MIN_MAX_MEMORY_SIZE_MB } from 'vs/platform/files/common/files';
import { parseArgs } from 'vs/platform/environment/node/argv';
import { join } from 'vs/base/common/path';
import { writeFile } from 'vs/base/node/pfs';

function validate(args: ParsedArgs): ParsedArgs {
	if (args.goto) {
		args._.forEach(arg => assert(/^(\w:)?[^:]+(:\d*){0,2}$/.test(arg), localize('gotoValidation', "Arguments in `--goto` mode should be in the format of `FILE(:LINE(:CHARACTER))`.")));
	}

	if (args['max-memory']) {
		assert(parseInt(args['max-memory']) >= MIN_MAX_MEMORY_SIZE_MB, `The max-memory argument cannot be specified lower than ${MIN_MAX_MEMORY_SIZE_MB} MB.`);
	}

	return args;
}

function stripAppPath(argv: string[]): string[] | undefined {
	const index = firstIndex(argv, a => !/^-/.test(a));

	if (index > -1) {
		return [...argv.slice(0, index), ...argv.slice(index + 1)];
	}
	return undefined;
}

/**
 * Use this to parse raw code process.argv such as: `Electron . --verbose --wait`
 */
export function parseMainProcessArgv(processArgv: string[]): ParsedArgs {
	let [, ...args] = processArgv;

	// If dev, remove the first non-option argument: it's the app location
	if (process.env['VSCODE_DEV']) {
		args = stripAppPath(args) || [];
	}

	return validate(parseArgs(args));
}

/**
 * Use this to parse raw code CLI process.argv such as: `Electron cli.js . --verbose --wait`
 */
export function parseCLIProcessArgv(processArgv: string[]): ParsedArgs {
	let [, , ...args] = processArgv;

	if (process.env['VSCODE_DEV']) {
		args = stripAppPath(args) || [];
	}

	return validate(parseArgs(args));
}

export function createWaitMarkerFile(verbose?: boolean): Promise<string> {
	const randomWaitMarkerPath = join(tmpdir(), Math.random().toString(36).replace(/[^a-z]+/g, '').substr(0, 10));

	return writeFile(randomWaitMarkerPath, '').then(() => {
		if (verbose) {
			console.log(`Marker file for --wait created: ${randomWaitMarkerPath}`);
		}

		return randomWaitMarkerPath;
	}, error => {
		if (verbose) {
			console.error(`Failed to create marker file for --wait: ${error}`);
		}

		return Promise.resolve(undefined);
	});
}
