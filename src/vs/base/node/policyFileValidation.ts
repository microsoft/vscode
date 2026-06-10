/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { lstat } from 'fs/promises';

/**
 * Result of validating a policy file's security properties.
 */
export interface IPolicyFileValidationResult {
	readonly valid: boolean;
	readonly reason?: string;
}

/**
 * Validates that a policy file at `filePath` meets the security requirements
 * for enterprise managed-settings delivery:
 *
 * 1. **No symlinks** — the path must be a regular file (`lstat`, not `stat`).
 * 2. **Root-owned** — uid must be 0 (POSIX only).
 * 3. **Not world-writable** — mode must not have the "others write" bit set.
 *
 * These checks mirror the model used by SSH (`/etc/ssh/sshd_config`) and
 * Claude Code's policy hook file discovery.
 *
 * On Windows, ownership and permission checks are skipped — the registry
 * is the primary MDM channel, and file ACLs use a different model.
 */
export async function validatePolicyFile(filePath: string): Promise<IPolicyFileValidationResult> {
	try {
		const stats = await lstat(filePath);

		if (stats.isSymbolicLink()) {
			return { valid: false, reason: `Policy file is a symbolic link: ${filePath}` };
		}

		if (!stats.isFile()) {
			return { valid: false, reason: `Policy path is not a regular file: ${filePath}` };
		}

		// POSIX ownership and permission checks
		if (process.platform !== 'win32') {
			if (stats.uid !== 0) {
				return { valid: false, reason: `Policy file is not owned by root (uid=${stats.uid}): ${filePath}` };
			}

			// Check group-writable or world-writable bits (0o022 = group-write | others-write)
			if ((stats.mode & 0o022) !== 0) {
				return { valid: false, reason: `Policy file is writable by group or others: ${filePath}` };
			}
		}

		return { valid: true };
	} catch (err) {
		if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
			// File not existing is not an error — it means no policy file is deployed
			return { valid: true, reason: 'file-not-found' };
		}
		return { valid: false, reason: `Failed to stat policy file: ${(err as Error).message}` };
	}
}
