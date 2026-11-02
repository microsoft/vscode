/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs';
import * as path from 'path';

/**
 * Resolves an executable name to an absolute path by searching only the absolute
 * entries of `PATH`.
 *
 * Unlike spawning a bare command name, this never considers the current working
 * directory, which Windows searches before `PATH`. Relative and empty `PATH` entries
 * are ignored for the same reason.
 */
export function findExecutableOnPath(
	name: string,
	env: NodeJS.ProcessEnv = process.env,
	platform: NodeJS.Platform = process.platform,
	isExecutableFile: (candidate: string) => boolean = candidate => defaultIsExecutableFile(candidate, platform),
): string | undefined {
	const pathLib = platform === 'win32' ? path.win32 : path.posix;
	const pathValue = platform === 'win32'
		? Object.keys(env).filter(key => key.toUpperCase() === 'PATH').map(key => env[key]).find(value => !!value)
		: env.PATH;
	if (!pathValue) {
		return undefined;
	}

	// Node's child_process (libuv) only tries these extensions when spawning without a shell.
	const extensions = platform === 'win32' && !pathLib.extname(name) ? ['.com', '.exe'] : [''];
	for (const entry of pathValue.split(pathLib.delimiter)) {
		const directory = platform === 'win32' ? entry.replace(/^"(.*)"$/, '$1') : entry;
		if (!isFullyQualified(directory, platform)) {
			continue;
		}
		for (const extension of extensions) {
			const candidate = pathLib.join(directory, name + extension);
			if (isExecutableFile(candidate)) {
				return candidate;
			}
		}
	}
	return undefined;
}

/**
 * On Windows, `\dir` is relative to the current drive, so only drive-letter and UNC paths qualify.
 */
function isFullyQualified(directory: string, platform: NodeJS.Platform): boolean {
	return platform === 'win32'
		? /^[a-zA-Z]:[\\/]|^[\\/]{2}[^\\/]/.test(directory)
		: path.posix.isAbsolute(directory);
}

function defaultIsExecutableFile(candidate: string, platform: NodeJS.Platform): boolean {
	try {
		// eslint-disable-next-line local/code-no-sync-fs -- Service configuration is loaded synchronously, so Node detection must resolve before the configuration is published.
		if (!fs.statSync(candidate).isFile()) {
			return false;
		}
		if (platform !== 'win32') {
			// eslint-disable-next-line local/code-no-sync-fs -- See above.
			fs.accessSync(candidate, fs.constants.X_OK);
		}
		return true;
	} catch {
		return false;
	}
}
