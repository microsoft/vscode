/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { randomUUID } from 'crypto';
import { constants, promises as fs } from 'fs';
import { ILogService } from '../../../platform/log/common/logService';
import { timeout } from '../../../util/vs/base/common/async';
import * as path from '../../../util/vs/base/common/path';
import { isUUID } from '../../../util/vs/base/common/uuid';

// Fill in absolute local build paths on the extension-host machine (Linux paths for WSL/SSH).
const LOCAL_SHIM_SOURCE_PATHS: Partial<Record<NodeJS.Platform, string>> = {
	win32: 'C:\\development\\vsc\\vscode\\copilot_shim\\target\\debug\\copilot.exe',
	darwin: '',
	linux: '',
};

const SHIM_MARKER = Buffer.from('VSCODE_COPILOT_RUST_SHIM_V1');
const MAX_SHIM_SIZE = 16 * 1024 * 1024;
type ShimLogger = Pick<ILogService, 'info' | 'warn'>;

/**
 * Publishes a local development build without truncating a running executable. The stable storage directory also
 * serves ordinary integrated terminals, whose PATH contribution can outlive the extension host.
 */
export async function prepareCopilotCLINativeShim(
	globalStoragePath: string,
	logService: ShimLogger,
	sourcePath: string | undefined = LOCAL_SHIM_SOURCE_PATHS[process.platform],
	platform: NodeJS.Platform = process.platform,
): Promise<string | undefined> {
	if (!sourcePath) {
		logService.info('[CopilotCLITerminalIntegration] No local Rust shim path is configured in copilotCLINativeShim.ts; terminals run copilot from PATH.');
		return undefined;
	}

	const storagePath = path.join(globalStoragePath, 'copilotCli');
	const filename = platform === 'win32' ? 'copilot.exe' : 'copilot';
	const destination = path.join(storagePath, filename);
	const lockPath = path.join(storagePath, '.publish.lock');
	try {
		if (!path.isAbsolute(sourcePath)) {
			throw new Error('The local Rust shim source path must be absolute.');
		}
		const source = await readFile(sourcePath);
		if (!source?.includes(SHIM_MARKER)) {
			throw new Error(`The local build at ${sourcePath} is not a Rust Copilot shim.`);
		}
		await fs.mkdir(storagePath, { recursive: true });
		const lock = await acquireLock(lockPath);
		try {
			await lock.writeFile(`${process.pid}\n`);
			const current = await readFile(destination);
			if (!current?.equals(source)) {
				await publish(storagePath, filename, source, platform, logService);
			} else if (platform !== 'win32') {
				await fs.chmod(destination, 0o750);
			}
			await removeLegacyFiles(storagePath, platform);
			await removeRetiredCopies(storagePath, filename, logService);
		} finally {
			try {
				await lock.close();
			} finally {
				await fs.unlink(lockPath);
			}
		}
		return destination;
	} catch (error) {
		logService.warn(`[CopilotCLITerminalIntegration] Failed to prepare the local Rust shim: ${error}`);
		try {
			const current = await readFile(destination);
			if (current?.includes(SHIM_MARKER)) {
				if (platform !== 'win32') {
					await fs.access(destination, constants.X_OK);
				}
				// A surviving PowerShell/Git Bash wrapper could still win shell command resolution.
				await checkLegacyFilesRemoved(storagePath, platform);
				logService.warn(`[CopilotCLITerminalIntegration] Keeping the previously published Rust shim at ${destination}.`);
				return destination;
			}
		} catch (error) {
			logService.warn(`[CopilotCLITerminalIntegration] The stored shim is not ready: ${error}`);
		}
		logService.warn('[CopilotCLITerminalIntegration] No usable stored Rust shim is available; terminals run copilot from PATH.');
		return undefined;
	}
}

async function readFile(filename: string): Promise<Buffer | undefined> {
	try {
		const stat = await fs.stat(filename);
		if (!stat.isFile() || stat.size > MAX_SHIM_SIZE) {
			throw new Error(`Expected a shim file no larger than 16 MiB: ${filename}`);
		}
		return await fs.readFile(filename);
	} catch (error) {
		if (hasCode(error, 'ENOENT')) {
			return undefined;
		}
		throw error;
	}
}

async function acquireLock(lockPath: string) {
	for (let attempt = 0; ; attempt++) {
		try {
			return await fs.open(lockPath, 'wx');
		} catch (error) {
			if (!hasCode(error, 'EEXIST')) {
				throw error;
			}
			if (attempt >= 40) {
				throw new Error(`Timed out waiting for ${lockPath}. If its recorded extension-host process has exited, remove the stale lock and retry.`);
			}
			await timeout(50);
		}
	}
}

async function renameWithRetry(source: string, destination: string): Promise<void> {
	for (let attempt = 0; ; attempt++) {
		try {
			await fs.rename(source, destination);
			return;
		} catch (error) {
			if (attempt >= 4 || !['EACCES', 'EPERM', 'EBUSY'].some(code => hasCode(error, code))) {
				throw error;
			}
			await timeout(50 * (attempt + 1) ** 2);
		}
	}
}

async function publish(storagePath: string, filename: string, source: Buffer, platform: NodeJS.Platform, logService: ShimLogger): Promise<void> {
	const destination = path.join(storagePath, filename);
	const staging = path.join(storagePath, `.${filename}.new-${randomUUID()}`);
	const previous = path.join(storagePath, `.${filename}.previous-${randomUUID()}`);
	let movedPrevious = false;
	try {
		await fs.writeFile(staging, source, { flag: 'wx', mode: 0o750 });
		if (platform !== 'win32') {
			await fs.chmod(staging, 0o750);
		} else {
			try {
				await renameWithRetry(destination, previous);
				movedPrevious = true;
			} catch (error) {
				if (!hasCode(error, 'ENOENT')) {
					throw error;
				}
			}
		}
		try {
			await renameWithRetry(staging, destination);
		} catch (error) {
			if (movedPrevious) {
				try {
					await renameWithRetry(previous, destination);
				} catch (restoreError) {
					logService.warn(`[CopilotCLITerminalIntegration] Could not restore ${previous} to ${destination}: ${restoreError}`);
				}
			}
			throw error;
		}
	} finally {
		try {
			await fs.rm(staging, { force: true });
		} catch (error) {
			logService.warn(`[CopilotCLITerminalIntegration] Could not remove staging file ${staging}: ${error}`);
		}
	}
}

function legacyFiles(platform: NodeJS.Platform): string[] {
	return ['copilot.ps1', 'copilot.bat', 'copilot.cmd', 'copilotCLIShim.js', 'copilotCLIShim.ps1',
		...(platform === 'win32' ? ['copilot'] : [])];
}

async function removeLegacyFiles(storagePath: string, platform: NodeJS.Platform): Promise<void> {
	for (const filename of legacyFiles(platform)) {
		await fs.rm(path.join(storagePath, filename), { force: true });
	}
}

async function checkLegacyFilesRemoved(storagePath: string, platform: NodeJS.Platform): Promise<void> {
	for (const filename of legacyFiles(platform)) {
		try {
			await fs.lstat(path.join(storagePath, filename));
		} catch (error) {
			if (hasCode(error, 'ENOENT')) {
				continue;
			}
			throw error;
		}
		throw new Error(`The legacy shim ${filename} still exists in ${storagePath}.`);
	}
}

async function removeRetiredCopies(storagePath: string, filename: string, logService: ShimLogger): Promise<void> {
	const prefixes = [`.${filename}.previous-`, `.${filename}.new-`];
	for (const entry of await fs.readdir(storagePath, { withFileTypes: true })) {
		if (entry.isFile() && prefixes.some(prefix => entry.name.startsWith(prefix) && isUUID(entry.name.substring(prefix.length)))) {
			try {
				await fs.unlink(path.join(storagePath, entry.name));
			} catch (error) {
				logService.warn(`[CopilotCLITerminalIntegration] Could not remove retired shim ${entry.name}; it may still be running: ${error}`);
			}
		}
	}
}

function hasCode(error: unknown, code: string): boolean {
	return error instanceof Error && 'code' in error && error.code === code;
}
