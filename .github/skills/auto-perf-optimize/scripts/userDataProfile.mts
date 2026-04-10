/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { cp, mkdir, readdir, rm, stat } from 'node:fs/promises';
import path from 'node:path';

const skippedUserDataRootEntries = new Set([
	'Backups',
	'blob_storage',
	'BrowserMetrics',
	'Cache',
	'CachedData',
	'Code Cache',
	'component_crx_cache',
	'Crashpad',
	'DawnGraphiteCache',
	'DawnWebGPUCache',
	'GPUCache',
	'logs',
	'ShaderCache',
	'Session Storage',
	'SingletonCookie',
	'SingletonLock',
	'SingletonSocket',
]);

export interface UserDataProfileOptions {
	outputDir: string;
	persistentUserDataDir: string;
	temporaryUserData: boolean;
	keepOpen: boolean;
	keepUserData: boolean;
	reuse: boolean;
	userDataDir: string | undefined;
	seedUserDataDir: string | undefined;
}

export interface UserDataProfile {
	userDataDir: string;
	ownsUserDataDir: boolean;
}

export async function prepareUserDataProfile(options: UserDataProfileOptions): Promise<UserDataProfile> {
	const generatedUserDataDir = options.temporaryUserData ? path.join(options.outputDir, 'user-data') : options.persistentUserDataDir;
	const userDataDir = path.resolve(options.userDataDir ?? generatedUserDataDir);
	const ownsUserDataDir = !options.reuse && options.temporaryUserData && !options.keepOpen && !options.keepUserData && options.userDataDir === undefined;
	if (options.seedUserDataDir !== undefined) {
		if (options.reuse) {
			throw new Error('--seed-user-data-dir cannot be used with --reuse');
		}
		await copySeedUserDataDir(path.resolve(options.seedUserDataDir), userDataDir);
	}

	return { userDataDir, ownsUserDataDir };
}

async function copySeedUserDataDir(seedUserDataDir: string, userDataDir: string): Promise<void> {
	if (seedUserDataDir === userDataDir) {
		throw new Error('--seed-user-data-dir must be different from the target user-data-dir');
	}
	if (!await isDirectory(seedUserDataDir)) {
		throw new Error(`Seed user-data-dir does not exist or is not a directory: ${seedUserDataDir}`);
	}
	if (await pathExists(userDataDir)) {
		const children = await readdir(userDataDir).catch(() => []);
		if (children.length > 0) {
			throw new Error(`Refusing to copy seed profile because the target user-data-dir already exists: ${userDataDir}. Choose a fresh --user-data-dir, pass --temporary-user-data, or delete the target first.`);
		}
		await rm(userDataDir, { recursive: true, force: true, maxRetries: 3 });
	}

	console.log(`[code] copying seed user-data-dir: ${seedUserDataDir}`);
	console.log(`[code] seed copy target may contain auth secrets: ${userDataDir}`);
	await mkdir(path.dirname(userDataDir), { recursive: true });
	try {
		await cp(seedUserDataDir, userDataDir, {
			recursive: true,
			errorOnExist: true,
			force: false,
			filter: source => shouldCopyUserDataPath(seedUserDataDir, source),
		});
	} catch (error) {
		await rm(userDataDir, { recursive: true, force: true, maxRetries: 3 }).catch(() => undefined);
		throw error;
	}
}

function shouldCopyUserDataPath(seedUserDataDir: string, source: string): boolean {
	const relativePath = path.relative(seedUserDataDir, source);
	if (!relativePath) {
		return true;
	}

	const [rootEntry] = relativePath.split(path.sep);
	const basename = path.basename(relativePath);
	return !skippedUserDataRootEntries.has(rootEntry) && !basename.endsWith('.sock') && !basename.endsWith('.lock');
}

async function isDirectory(file: string): Promise<boolean> {
	return stat(file).then(value => value.isDirectory(), () => false);
}

async function pathExists(file: string): Promise<boolean> {
	return stat(file).then(() => true, () => false);
}
