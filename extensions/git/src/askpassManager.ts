/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import * as cp from 'child_process';
import { env, LogOutputChannel } from 'vscode';

/**
 * Manages content-addressed copies of askpass scripts in a user-controlled folder.
 *
 * This solves the problem on Windows user/system setups where environment variables
 * like GIT_ASKPASS point to scripts inside the VS Code installation directory, which
 * changes on each update. By copying the scripts to a content-addressed location in
 * user storage, the paths remain stable across updates (as long as the script contents
 * don't change).
 *
 * This feature is only enabled on Windows user and system setups (not archive or portable)
 * because those are the only configurations where the installation path changes on each update.
 *
 * Security considerations:
 * - Scripts are placed in user-controlled storage (not TEMP to avoid TOCTOU attacks)
 * - On Windows, ACLs are set to allow only the current user to modify the files
 */

/**
 * Checks if the current VS Code installation is a Windows user or system setup.
 * Returns false for archive, portable, or non-Windows installations.
 */
function isWindowsUserOrSystemSetup(): boolean {
	if (process.platform !== 'win32') {
		return false;
	}

	try {
		const productJsonPath = path.join(env.appRoot, 'product.json');
		const productJson = JSON.parse(fs.readFileSync(productJsonPath, 'utf8'));
		const target = productJson.target as string | undefined;

		// Target is 'user' or 'system' for Inno Setup installations.
		// Archive and portable builds don't have a target property.
		return target === 'user' || target === 'system';
	} catch {
		// If we can't read product.json, assume not applicable
		return false;
	}
}

interface SourceAskpassPaths {
	askpass: string;
	askpassMain: string;
	sshAskpass: string;
	askpassEmpty: string;
	sshAskpassEmpty: string;
}

/**
 * Computes a SHA-256 hash of the combined contents of all askpass-related files.
 * This hash is used to create content-addressed directories.
 */
function computeContentHash(sourcePaths: SourceAskpassPaths): string {
	const hash = crypto.createHash('sha256');

	// Hash all source files in a deterministic order
	const files = [
		sourcePaths.askpass,
		sourcePaths.askpassMain,
		sourcePaths.sshAskpass,
		sourcePaths.askpassEmpty,
		sourcePaths.sshAskpassEmpty,
	];

	for (const file of files) {
		const content = fs.readFileSync(file);
		hash.update(content);
		// Include filename in hash to ensure different files with same content produce different hash
		hash.update(path.basename(file));
	}

	return hash.digest('hex').substring(0, 16);
}

/**
 * Sets restrictive file permissions on Windows using icacls.
 * Grants full control only to the current user and removes inherited permissions.
 */
async function setWindowsPermissions(filePath: string, logger: LogOutputChannel): Promise<void> {
	const username = process.env['USERNAME'];
	if (!username) {
		logger.warn(`[askpassManager] Cannot set Windows permissions: USERNAME not set`);
		return;
	}

	return new Promise<void>((resolve) => {
		// icacls <file> /inheritance:r /grant:r "<username>:F"
		// /inheritance:r - Remove all inherited permissions
		// /grant:r - Replace (not add) permissions, giving Full control to user
		const args = [filePath, '/inheritance:r', '/grant:r', `${username}:F`];

		cp.execFile('icacls', args, (error, _stdout, stderr) => {
			if (error) {
				logger.warn(`[askpassManager] Failed to set permissions on ${filePath}: ${error.message}`);
				if (stderr) {
					logger.warn(`[askpassManager] icacls stderr: ${stderr}`);
				}
			} else {
				logger.trace(`[askpassManager] Set permissions on ${filePath}`);
			}
			resolve();
		});
	});
}

/**
 * Copies a file to the destination, creating parent directories as needed.
 * Sets restrictive permissions on the copied file.
 */
async function copyFileSecure(
	source: string,
	dest: string,
	logger: LogOutputChannel
): Promise<void> {
	const content = await fs.promises.readFile(source);
	await fs.promises.writeFile(dest, content);
	await setWindowsPermissions(dest, logger);
}

/**
 * Updates the modification time of a directory to mark it as recently used.
 */
async function updateDirectoryMtime(dirPath: string, logger: LogOutputChannel): Promise<void> {
	try {
		const now = new Date();
		await fs.promises.utimes(dirPath, now, now);
		logger.trace(`[askpassManager] Updated mtime for ${dirPath}`);
	} catch (err) {
		logger.warn(`[askpassManager] Failed to update mtime for ${dirPath}: ${err}`);
	}
}

/**
 * Garbage collects old content-addressed askpass directories that haven't been used in 7 days.
 * This prevents accumulation of old versions when VS Code updates.
 */
async function garbageCollectOldDirectories(
	askpassBaseDir: string,
	currentHash: string,
	logger: LogOutputChannel
): Promise<void> {
	try {
		// Check if the askpass base directory exists
		try {
			await fs.promises.access(askpassBaseDir);
		} catch {
			// Directory doesn't exist, nothing to clean
			return;
		}

		const entries = await fs.promises.readdir(askpassBaseDir);
		const sevenDaysAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);

		for (const entry of entries) {
			// Skip the current content-addressed directory
			if (entry === currentHash) {
				continue;
			}

			const entryPath = path.join(askpassBaseDir, entry);

			try {
				const stat = await fs.promises.stat(entryPath);

				// Only process directories
				if (!stat.isDirectory()) {
					continue;
				}

				// Check if the directory hasn't been used in 7 days
				if (stat.mtime.getTime() < sevenDaysAgo) {
					logger.info(`[askpassManager] Removing old askpass directory: ${entryPath} (last used: ${stat.mtime.toISOString()})`);

					// Remove the directory and all its contents
					await fs.promises.rm(entryPath, { recursive: true, force: true });
				} else {
					logger.trace(`[askpassManager] Keeping askpass directory: ${entryPath} (last used: ${stat.mtime.toISOString()})`);
				}
			} catch (err) {
				logger.warn(`[askpassManager] Failed to process/remove directory ${entryPath}: ${err}`);
			}
		}
	} catch (err) {
		logger.warn(`[askpassManager] Failed to garbage collect old directories: ${err}`);
	}
}

export interface AskpassPaths {
	readonly askpass: string;
	readonly askpassMain: string;
	readonly sshAskpass: string;
	readonly askpassEmpty: string;
	readonly sshAskpassEmpty: string;
}

/**
 * Ensures that content-addressed copies of askpass scripts exist in user storage.
 * Returns the paths to the content-addressed copies.
 *
 * @param sourceDir The directory containing the original askpass scripts (__dirname)
 * @param storageDir The user-controlled storage directory (context.storageUri.fsPath)
 * @param logger Logger for diagnostic output
 */
export async function ensureAskpassScripts(
	sourceDir: string,
	storageDir: string,
	logger: LogOutputChannel
): Promise<AskpassPaths> {
	const sourcePaths: SourceAskpassPaths = {
		askpass: path.join(sourceDir, 'askpass.sh'),
		askpassMain: path.join(sourceDir, 'askpass-main.js'),
		sshAskpass: path.join(sourceDir, 'ssh-askpass.sh'),
		askpassEmpty: path.join(sourceDir, 'askpass-empty.sh'),
		sshAskpassEmpty: path.join(sourceDir, 'ssh-askpass-empty.sh'),
	};

	// Compute content hash
	const contentHash = computeContentHash(sourcePaths);
	logger.trace(`[askpassManager] Content hash: ${contentHash}`);

	// Create content-addressed directory
	const askpassBaseDir = path.join(storageDir, 'askpass');
	const askpassDir = path.join(askpassBaseDir, contentHash);

	const destPaths: AskpassPaths = {
		askpass: path.join(askpassDir, 'askpass.sh'),
		askpassMain: path.join(askpassDir, 'askpass-main.js'),
		sshAskpass: path.join(askpassDir, 'ssh-askpass.sh'),
		askpassEmpty: path.join(askpassDir, 'askpass-empty.sh'),
		sshAskpassEmpty: path.join(askpassDir, 'ssh-askpass-empty.sh'),
	};

	// Check if already exists (fast path for subsequent activations)
	try {
		const stat = await fs.promises.stat(destPaths.askpass);
		if (stat.isFile()) {
			logger.trace(`[askpassManager] Using existing content-addressed askpass at ${askpassDir}`);

			// Update mtime to mark this directory as recently used
			await updateDirectoryMtime(askpassDir, logger);

			return destPaths;
		}
	} catch {
		// Directory doesn't exist, create it
	}

	logger.info(`[askpassManager] Creating content-addressed askpass scripts at ${askpassDir}`);

	// Create directory and set Windows ACLs
	await fs.promises.mkdir(askpassDir, { recursive: true });
	await setWindowsPermissions(askpassDir, logger);

	// Copy all files
	await Promise.all([
		copyFileSecure(sourcePaths.askpass, destPaths.askpass, logger),
		copyFileSecure(sourcePaths.askpassMain, destPaths.askpassMain, logger),
		copyFileSecure(sourcePaths.sshAskpass, destPaths.sshAskpass, logger),
		copyFileSecure(sourcePaths.askpassEmpty, destPaths.askpassEmpty, logger),
		copyFileSecure(sourcePaths.sshAskpassEmpty, destPaths.sshAskpassEmpty, logger),
	]);

	logger.info(`[askpassManager] Successfully created content-addressed askpass scripts`);

	// Update mtime to mark this directory as recently used
	await updateDirectoryMtime(askpassDir, logger);

	// Garbage collect old directories
	await garbageCollectOldDirectories(askpassBaseDir, contentHash, logger);

	return destPaths;
}

/**
 * Returns the askpass script paths. Uses content-addressed copies
 * on Windows user/system setups (to keep paths stable across updates),
 * otherwise returns paths relative to the source directory.
 */
export async function getAskpassPaths(
	sourceDir: string,
	storagePath: string | undefined,
	logger: LogOutputChannel
): Promise<AskpassPaths> {
	// Try content-addressed paths on Windows user/system setups
	if (storagePath && isWindowsUserOrSystemSetup()) {
		try {
			return await ensureAskpassScripts(sourceDir, storagePath, logger);
		} catch (err) {
			logger.error(`[askpassManager] Failed to create content-addressed askpass scripts: ${err}`);
		}
	}

	// Fallback to source directory paths (for development or non-Windows setups)
	return {
		askpass: path.join(sourceDir, 'askpass.sh'),
		askpassMain: path.join(sourceDir, 'askpass-main.js'),
		sshAskpass: path.join(sourceDir, 'ssh-askpass.sh'),
		askpassEmpty: path.join(sourceDir, 'askpass-empty.sh'),
		sshAskpassEmpty: path.join(sourceDir, 'ssh-askpass-empty.sh'),
	};
}
