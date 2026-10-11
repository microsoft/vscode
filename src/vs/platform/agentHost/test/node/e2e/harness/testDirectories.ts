/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { mkdtempSync, realpathSync, rmdirSync } from 'fs';
import { createRequire } from 'module';

// The Electron test runner wraps fs.realpathSync without retaining its native method.
const nativeRealpathSync = process.versions.electron
	? (createRequire(import.meta.url)('original-fs') as typeof import('fs')).realpathSync.native
	: realpathSync.native;

/** Returns the canonical directory identity shared with provider subprocesses; the caller owns cleanup. */
export function createTestDirectory(prefix: string, canonicalize: (directory: string) => string = nativeRealpathSync): string {
	const directory = mkdtempSync(prefix);
	try {
		return canonicalize(directory);
	} catch (error) {
		try {
			rmdirSync(directory);
		} catch (cleanupError) {
			throw new AggregateError([error, cleanupError], `Failed to canonicalize and remove Agent Host E2E directory: ${directory}`);
		}
		throw error;
	}
}
