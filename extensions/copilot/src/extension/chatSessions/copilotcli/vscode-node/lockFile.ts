/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs/promises';
import * as path from 'path';
import * as vscode from 'vscode';
import { ILogger } from '../../../../platform/log/common/logService';
import { generateUuid } from '../../../../util/vs/base/common/uuid';
import { getCopilotCliStateDir } from '../node/cliHelpers';

export interface LockFileInfo {
	socketPath: string;
	scheme: string;
	headers: Record<string, string>;
	pid: number;
	ideName: string;
	timestamp: number;
	workspaceFolders: string[];
	isTrusted: boolean;
}

export class LockFileHandle {
	private readonly lockFilePath: string;
	private readonly serverUri: vscode.Uri;
	private readonly headers: Record<string, string>;
	private readonly timestamp: number;
	private readonly logger: ILogger;

	constructor(lockFilePath: string, serverUri: vscode.Uri, headers: Record<string, string>, timestamp: number, logger: ILogger) {
		this.lockFilePath = lockFilePath;
		this.serverUri = serverUri;
		this.headers = headers;
		this.timestamp = timestamp;
		this.logger = logger;
	}

	get path(): string {
		return this.lockFilePath;
	}

	async update(): Promise<void> {
		try {
			const workspaceFolders = vscode.workspace.workspaceFolders?.map(f => f.uri.fsPath) || [];

			const lockInfo: LockFileInfo = {
				socketPath: this.serverUri.path,
				scheme: this.serverUri.scheme,
				headers: this.headers,
				pid: process.pid,
				ideName: vscode.env.appName,
				timestamp: this.timestamp,
				workspaceFolders: workspaceFolders,
				isTrusted: vscode.workspace.isTrusted,
			};

			await fs.writeFile(this.lockFilePath, JSON.stringify(lockInfo, null, 2), { mode: 0o600 });
			this.logger.trace(`Lock file updated: ${this.lockFilePath}`);
		} catch (error) {
			this.logger.debug(`Failed to update lock file: ${error instanceof Error ? error.message : String(error)}`);
		}
	}

	async remove(): Promise<void> {
		try {
			await fs.unlink(this.lockFilePath);
			this.logger.debug(`Lock file removed: ${this.lockFilePath}`);
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
				this.logger.debug(`Failed to remove lock file: ${error instanceof Error ? error.message : String(error)}`);
			}
		}
	}
}

export async function createLockFile(serverUri: vscode.Uri, headers: Record<string, string>, logger: ILogger): Promise<LockFileHandle> {
	const copilotDir = getCopilotCliStateDir();
	logger.trace(`Creating lock file in: ${copilotDir}`);

	await fs.mkdir(copilotDir, { recursive: true, mode: 0o700 });

	const uuid = generateUuid();
	const lockFilePath = path.join(copilotDir, `${uuid}.lock`);

	const workspaceFolders = vscode.workspace.workspaceFolders?.map(f => f.uri.fsPath) || [];
	const timestamp = Date.now();

	const lockInfo: LockFileInfo = {
		socketPath: serverUri.path,
		scheme: serverUri.scheme,
		headers: headers,
		pid: process.pid,
		ideName: vscode.env.appName,
		timestamp: timestamp,
		workspaceFolders: workspaceFolders,
		isTrusted: vscode.workspace.isTrusted,
	};

	await fs.writeFile(lockFilePath, JSON.stringify(lockInfo, null, 2), { mode: 0o600 });
	logger.debug(`Created lock file: ${lockFilePath}`);

	return new LockFileHandle(lockFilePath, serverUri, headers, timestamp, logger);
}

/**
 * Checks if a process with the given PID is still running.
 * Note: Signal 0 is a special "null signal" that doesn't actually kill the process -
 * it only checks if the process exists and we have permission to signal it.
 */
export function isProcessRunning(pid: number): boolean {
	try {
		process.kill(pid, 0);
		return true;
	} catch {
		return false;
	}
}

/**
 * Cleans up stale lockfiles where the associated process is no longer running.
 * Returns the number of lockfiles cleaned up.
 */
export async function cleanupStaleLockFiles(logger: ILogger): Promise<number> {
	const copilotDir = getCopilotCliStateDir();

	let files: string[];
	try {
		files = await fs.readdir(copilotDir);
	} catch {
		return 0;
	}

	const lockFiles = files.filter(file => file.endsWith('.lock'));

	const results = await Promise.all(lockFiles.map(async (file) => {
		const filePath = path.join(copilotDir, file);
		try {
			const content = await fs.readFile(filePath, 'utf-8');
			const info = JSON.parse(content) as LockFileInfo;

			if (!isProcessRunning(info.pid)) {
				await fs.unlink(filePath);
				logger.debug(`Removed stale lock file for PID ${info.pid}: ${filePath}`);
				return true;
			}
		} catch {
			// Skip files that can't be read or parsed
		}
		return false;
	}));

	return results.filter(Boolean).length;
}
