/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as cp from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const nodeCompileCacheKinds = ['main', 'extension-host', 'shared-process', 'pty-host', 'agent-host'] as const;
const nodeCompileCacheTagPattern = /^v\d+\.\d+\.\d+-(arm64|x64)-[0-9a-f]{8}$/;
const nodeCompileCacheEntryPattern = /^[0-9a-f]{8}$/;
// Node.js writes each entry to `<entry>.XXXXXX` (`uv_fs_mkstemp`) and then renames it into place.
const nodeCompileCacheTemporaryEntryPattern = /^[0-9a-f]{8}\.[0-9A-Za-z]{6}$/;

export interface INodeCompileCacheProduct {
	readonly applicationName: string;
	readonly nameLong: string;
	readonly nameShort: string;
	readonly quality?: string;
}

export interface INodeCompileCachePaths {
	readonly application: string;
	readonly cacheDirectory: string;
}

export function shouldGenerateNodeCompileCache(platform: string, arch: string, product: INodeCompileCacheProduct): boolean {
	if (!product.quality) {
		return false;
	}

	// TODO: Re-enable POSIX caches once the runtime fixes portable caching with eager/read-only options.
	return platform === 'win32' && arch === 'x64';
}

export function getNodeCompileCachePaths(platform: string, outputDirectory: string, versionedResourcesFolder: string, product: INodeCompileCacheProduct): INodeCompileCachePaths {
	if (platform === 'darwin') {
		const applicationRoot = path.join(outputDirectory, `${product.nameLong}.app`);
		return {
			application: path.join(applicationRoot, 'Contents', 'MacOS', product.nameShort),
			cacheDirectory: path.join(applicationRoot, 'Contents', 'Resources', 'app', 'node-compile-cache')
		};
	}

	const application = platform === 'win32'
		? path.join(outputDirectory, `${product.nameShort}.exe`)
		: path.join(outputDirectory, product.applicationName);

	return {
		application,
		cacheDirectory: path.join(outputDirectory, versionedResourcesFolder, 'resources', 'app', 'node-compile-cache')
	};
}

export function createNodeCompileCacheGenerationEnvironment(portableDirectory: string, parentEnvironment: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
	const env = { ...parentEnvironment };
	delete env.ELECTRON_RUN_AS_NODE;
	delete env.NODE_COMPILE_CACHE;
	delete env.NODE_COMPILE_CACHE_PORTABLE;
	delete env.NODE_COMPILE_CACHE_READONLY;
	delete env.NODE_DISABLE_COMPILE_CACHE;
	delete env.VSCODE_DEV;
	delete env.VSCODE_MEASURE_NODE_COMPILE_CACHE;
	delete env.VSCODE_NODE_COMPILE_CACHE_KIND;
	delete env.VSCODE_NODE_COMPILE_CACHE_MEASUREMENTS;
	delete env.VSCODE_NODE_COMPILE_CACHE_ROOT;
	env.VSCODE_GENERATE_NODE_COMPILE_CACHE = '1';
	env.VSCODE_PORTABLE = portableDirectory;
	return env;
}

export async function generateNodeCompileCache(platform: string, outputDirectory: string, versionedResourcesFolder: string, product: INodeCompileCacheProduct): Promise<void> {
	const paths = getNodeCompileCachePaths(platform, outputDirectory, versionedResourcesFolder, product);
	const temporaryDirectory = platform === 'win32' ? os.tmpdir() : '/tmp';
	const portableDirectory = await fs.promises.mkdtemp(path.join(temporaryDirectory, 'vscode-cache-'));

	await fs.promises.rm(paths.cacheDirectory, { recursive: true, force: true });

	try {
		const env = createNodeCompileCacheGenerationEnvironment(portableDirectory);
		await runCacheGeneration(paths.application, paths.cacheDirectory, env);
		if (platform === 'win32') {
			// The app's child processes can outlive it briefly, and each persists its cache when it exits.
			await waitForProcessesToExit(() => listWindowsProcesses(paths.application), 60_000);
		}
		const totalCacheEntryCount = await validateNodeCompileCache(paths.cacheDirectory, process.arch);
		console.log(`Generated ${totalCacheEntryCount} total Node.js compile cache entries in ${paths.cacheDirectory}.`);
	} finally {
		await fs.promises.rm(portableDirectory, { recursive: true, force: true });
	}
}

export async function validateNodeCompileCache(rootDirectory: string, architecture: string): Promise<number> {
	let totalCacheEntryCount = 0;
	for (const kind of nodeCompileCacheKinds) {
		const kindDirectory = path.join(rootDirectory, kind);
		const entries = await fs.promises.readdir(kindDirectory, { withFileTypes: true });
		const tagDirectories = entries.filter(entry => entry.isDirectory() && nodeCompileCacheTagPattern.exec(entry.name)?.[1] === architecture);
		if (tagDirectories.length !== 1) {
			throw new Error(`Node.js compile cache generation produced ${tagDirectories.length} ${architecture} version-tag directories for ${kind} in ${kindDirectory}; expected exactly one.`);
		}
		if (!entries.some(entry => entry.isFile() && entry.name === '.ready')) {
			throw new Error(`Node.js compile cache generation did not produce a readiness marker for ${kind} in ${kindDirectory}.`);
		}
		const unexpectedEntries = entries.filter(entry => entry.name !== '.ready' && entry.name !== tagDirectories[0].name);
		if (unexpectedEntries.length > 0) {
			throw new Error(`Node.js compile cache generation produced unexpected ${kind} entries in ${kindDirectory}: ${unexpectedEntries.map(entry => entry.name).join(', ')}.`);
		}

		const cacheDirectory = path.join(kindDirectory, tagDirectories[0].name);
		await removeInterruptedCacheWrites(cacheDirectory, kind);
		const cacheEntries = await fs.promises.readdir(cacheDirectory, { withFileTypes: true });
		const validCacheEntries = cacheEntries.filter(entry => entry.isFile() && nodeCompileCacheEntryPattern.test(entry.name));
		const cacheEntryCount = validCacheEntries.length;
		if (cacheEntryCount === 0) {
			throw new Error(`Node.js compile cache generation produced no ${kind} cache entries in ${cacheDirectory}.`);
		}
		const unexpectedCacheEntries = cacheEntries.filter(entry => !entry.isFile() || !nodeCompileCacheEntryPattern.test(entry.name));
		if (unexpectedCacheEntries.length > 0) {
			throw new Error(`Node.js compile cache generation produced unexpected ${kind} cache entries in ${cacheDirectory}: ${unexpectedCacheEntries.map(entry => entry.name).join(', ')}.`);
		}
		totalCacheEntryCount += cacheEntryCount;
		console.log(`Generated ${cacheEntryCount} ${kind} Node.js compile cache entries in ${cacheDirectory}.`);
		await fs.promises.rm(path.join(kindDirectory, '.ready'));
	}
	return totalCacheEntryCount;
}

/**
 * Removes the temporary files of cache writes that never completed. A process persists the cache
 * of code it compiled after it marked the cache ready only when it exits, and the app does not wait
 * for every process to exit, so one can be torn down between writing such a file and renaming it
 * into place. The entry it was writing either keeps its earlier, complete version or is missing,
 * and a missing entry is compiled at runtime.
 */
async function removeInterruptedCacheWrites(cacheDirectory: string, kind: string): Promise<void> {
	const entries = await fs.promises.readdir(cacheDirectory, { withFileTypes: true });
	for (const entry of entries) {
		if (entry.isFile() && nodeCompileCacheTemporaryEntryPattern.test(entry.name)) {
			console.log(`Removing the interrupted ${kind} Node.js compile cache write ${entry.name} in ${cacheDirectory}.`);
			await fs.promises.rm(path.join(cacheDirectory, entry.name));
		}
	}
}

/**
 * Resolves once `listProcesses` reports no running process, polling every `intervalMs`. Logs the
 * processes still running after `timeoutMs` and resolves anyway; the validation that follows still
 * rejects a cache they leave inconsistent.
 */
export async function waitForProcessesToExit(listProcesses: () => Promise<readonly number[]>, timeoutMs: number, intervalMs = 250): Promise<void> {
	const deadline = Date.now() + timeoutMs;
	for (let processes = await listProcesses(); processes.length > 0; processes = await listProcesses()) {
		if (Date.now() >= deadline) {
			console.warn(`Node.js compile cache generation: processes ${processes.join(', ')} are still running after ${timeoutMs}ms.`);
			return;
		}
		await new Promise(resolve => setTimeout(resolve, intervalMs));
	}
}

function listWindowsProcesses(application: string): Promise<number[]> {
	const quote = (value: string) => `'${value.replace(/'/g, `''`)}'`;
	const command = `Get-CimInstance Win32_Process -Filter ${quote(`Name = '${path.basename(application).replace(/'/g, `\\'`)}'`)} | Where-Object { $_.ExecutablePath -eq ${quote(application)} } | ForEach-Object { $_.ProcessId }`;
	return new Promise((resolve, reject) => {
		cp.execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', command], (error, stdout) => {
			if (error) {
				reject(error);
			} else {
				resolve(stdout.split(/\r?\n/).filter(line => line.trim()).map(line => Number(line.trim())));
			}
		});
	});
}

function runCacheGeneration(application: string, cacheDirectory: string, env: NodeJS.ProcessEnv): Promise<void> {
	return new Promise((resolve, reject) => {
		const child = cp.spawn(application, [], {
			env,
			stdio: ['ignore', 'pipe', 'pipe']
		});
		let output = '';
		let didTimeOut = false;
		const timeout = setTimeout(() => {
			didTimeOut = true;
			child.kill();
		}, 120_000);

		child.stdout.on('data', chunk => output += chunk.toString());
		child.stderr.on('data', chunk => output += chunk.toString());
		child.on('error', error => {
			clearTimeout(timeout);
			reject(error);
		});
		child.on('close', (code, signal) => {
			clearTimeout(timeout);
			if (didTimeOut) {
				const missingKinds = nodeCompileCacheKinds.filter(kind => !fs.existsSync(path.join(cacheDirectory, kind, '.ready')));
				const missingKindsMessage = missingKinds.length > 0 ? ` Missing readiness markers: ${missingKinds.join(', ')}.` : '';
				reject(new Error(`Node.js compile cache generation timed out.${missingKindsMessage}\n${output}`));
			} else if (code !== 0) {
				reject(new Error(`Node.js compile cache generation exited with code ${code} and signal ${signal ?? 'none'}.\n${output}`));
			} else {
				resolve();
			}
		});
	});
}
