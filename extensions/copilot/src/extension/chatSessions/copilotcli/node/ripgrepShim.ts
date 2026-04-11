/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { promises as fs } from 'fs';
import * as path from 'path';
import { ILogService } from '../../../../platform/log/common/logService';

let shimCreated: Promise<void> | undefined = undefined;

const RETRIABLE_COPY_ERROR_CODES = new Set(['EPERM', 'EBUSY']);
const MAX_COPY_ATTEMPTS = 6;
const RETRY_DELAY_BASE_MS = 50;
const RETRY_DELAY_CAP_MS = 500;
const MATERIALIZATION_TIMEOUT_MS = 4000;
const MATERIALIZATION_POLL_INTERVAL_MS = 100;

/**
 * Copies the ripgrep files from VS Code's installation into a @github/copilot location
 *
 * MUST be called before any `import('@github/copilot/sdk')` or `import('@github/copilot')`.
 *
 * @github/copilot bundles the ripgrep code
 *
 * @param extensionPath The extension's path (where to create the shim)
 * @param vscodeAppRoot VS Code's installation path (where ripgrep is located)
 */
export async function ensureRipgrepShim(extensionPath: string, vscodeAppRoot: string, logService: ILogService): Promise<void> {
	if (shimCreated) {
		return shimCreated;
	}

	const creation = _ensureRipgrepShim(extensionPath, vscodeAppRoot, logService);
	shimCreated = creation.catch(error => {
		shimCreated = undefined;
		throw error;
	});
	return shimCreated;
}

async function _ensureRipgrepShim(extensionPath: string, vscodeAppRoot: string, logService: ILogService): Promise<void> {
	const vscodeRipgrepPath = path.join(vscodeAppRoot, 'node_modules', '@vscode', 'ripgrep', 'bin');

	await copyRipgrepShim(extensionPath, vscodeRipgrepPath, logService);
}

export async function copyRipgrepShim(extensionPath: string, vscodeRipgrepPath: string, logService: ILogService): Promise<void> {
	const ripgrepDir = path.join(extensionPath, 'node_modules', '@github', 'copilot', 'sdk', 'ripgrep', 'bin', process.platform + '-' + process.arch);

	logService.info(`Creating ripgrep shim: source=${vscodeRipgrepPath}, dest=${ripgrepDir}`);
	try {
		await fs.mkdir(ripgrepDir, { recursive: true });
		const entries = await fs.readdir(vscodeRipgrepPath);
		const uniqueEntries = [...new Set(entries)];
		logService.info(`Found ${uniqueEntries.length} entries to copy${uniqueEntries.length !== entries.length ? ` (${entries.length - uniqueEntries.length} duplicates ignored)` : ''}: ${uniqueEntries.join(', ')}`);

		await copyRipgrepWithRetries(vscodeRipgrepPath, ripgrepDir, uniqueEntries, logService);
	} catch (error) {
		logService.error(`Failed to create ripgrep shim (vscode dir: ${vscodeRipgrepPath}, extension dir: ${ripgrepDir})`, error);
		throw error;
	}
}

async function copyRipgrepWithRetries(sourceDir: string, destDir: string, entries: string[], logService: ILogService): Promise<void> {
	const primaryBinary = entries.find(entry => entry.endsWith('.node'));
	for (let attempt = 1; attempt <= MAX_COPY_ATTEMPTS; attempt++) {
		try {
			await fs.cp(sourceDir, destDir, {
				recursive: true,
				dereference: true,
				force: true,
				filter: async (srcPath) => shouldCopyEntry(srcPath, logService)
			});
			logService.trace(`Copied ripgrep prebuilds to ${destDir} (attempt ${attempt})`);
			return;
		} catch (error) {
			if (await waitForMaterializedShim(destDir, primaryBinary, logService)) {
				logService.trace(`Detected ripgrep shim materialized at ${destDir} by another extension host`);
				return;
			}

			if (!RETRIABLE_COPY_ERROR_CODES.has(error?.code) || attempt === MAX_COPY_ATTEMPTS) {
				throw error;
			}

			const delayMs = Math.min(RETRY_DELAY_BASE_MS * Math.pow(2, attempt - 1), RETRY_DELAY_CAP_MS);
			logService.warn(`Retryable error (${error.code}) copying ripgrep shim. Retrying in ${delayMs}ms (attempt ${attempt + 1}/${MAX_COPY_ATTEMPTS})`);
			await new Promise(resolve => setTimeout(resolve, delayMs));
		}
	}
}

async function shouldCopyEntry(srcPath: string, logService: ILogService): Promise<boolean> {
	try {
		const stat = await fs.stat(srcPath);
		if (stat.isDirectory()) {
			return true;
		}

		if (stat.size === 0) {
			logService.trace(`Skipping ${path.basename(srcPath)}: zero-byte file (likely symlink or special file)`);
			return false;
		}

		return true;
	} catch (error) {
		logService.warn(`Failed to stat ${srcPath}: ${error?.message ?? error}`);
		return false;
	}
}

async function waitForMaterializedShim(destDir: string, primaryBinary: string | undefined, logService: ILogService): Promise<boolean> {
	const deadline = Date.now() + MATERIALIZATION_TIMEOUT_MS;
	while (Date.now() <= deadline) {
		if (await isShimMaterialized(destDir, primaryBinary)) {
			logService.trace(`Reusing ripgrep shim that materialized at ${destDir}`);
			return true;
		}

		await new Promise(resolve => setTimeout(resolve, MATERIALIZATION_POLL_INTERVAL_MS));
	}

	return false;
}

async function isShimMaterialized(destDir: string, primaryBinary: string | undefined): Promise<boolean> {
	if (primaryBinary) {
		const binaryStat = await fs.stat(path.join(destDir, primaryBinary)).catch(() => undefined);
		if (binaryStat && binaryStat.isFile() && binaryStat.size > 0) {
			return true;
		}
	}

	const entries = await fs.readdir(destDir).catch(() => []);
	for (const entry of entries) {
		const stat = await fs.stat(path.join(destDir, entry)).catch(() => undefined);
		if (stat && stat.isFile() && stat.size > 0) {
			return true;
		}
	}

	return false;
}
