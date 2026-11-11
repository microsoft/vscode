/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { mkdirSync, mkdtempSync, realpathSync, rmdirSync } from 'fs';
import { createRequire } from 'module';
import { join } from '../../../../../../base/common/path.js';

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

/**
 * Prepares `workspace` for Codex chats that start concurrently in it on Linux (see "Codex Linux startup races in shared
 * empty workspaces" in KNOWN_ISSUES.md): each Codex sandbox setup mounts a temporary placeholder at a missing protected
 * metadata directory and removes it on exit, so a setup running meanwhile can bind it and fail. Created by the fixture
 * beforehand, the directories survive that cleanup. No-op for other providers and platforms.
 */
export function ownCodexProtectedDirectories(workspace: string, provider: string, isLinux: boolean): void {
	if (provider !== 'codex' || !isLinux) {
		return;
	}
	for (const directory of ['.git', '.agents', '.codex']) {
		mkdirSync(join(workspace, directory));
	}
}
