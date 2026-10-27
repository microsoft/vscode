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

	return platform === 'darwin' ? arch === 'arm64' : (platform === 'linux' || platform === 'win32') && arch === 'x64';
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
