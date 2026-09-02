/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as cp from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

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

export async function generateNodeCompileCache(platform: string, outputDirectory: string, versionedResourcesFolder: string, product: INodeCompileCacheProduct): Promise<void> {
	const paths = getNodeCompileCachePaths(platform, outputDirectory, versionedResourcesFolder, product);
	const temporaryDirectory = platform === 'win32' ? os.tmpdir() : '/tmp';
	const portableDirectory = await fs.promises.mkdtemp(path.join(temporaryDirectory, 'vscode-cache-'));

	await fs.promises.rm(paths.cacheDirectory, { recursive: true, force: true });

	try {
		const env: NodeJS.ProcessEnv = {
			...process.env,
			VSCODE_GENERATE_NODE_COMPILE_CACHE: '1',
			VSCODE_PORTABLE: portableDirectory
		};
		delete env['ELECTRON_RUN_AS_NODE'];
		delete env['NODE_COMPILE_CACHE'];
		delete env['NODE_COMPILE_CACHE_PORTABLE'];
		delete env['NODE_COMPILE_CACHE_READONLY'];
		delete env['NODE_DISABLE_COMPILE_CACHE'];
		delete env['VSCODE_DEV'];

		await runCacheGeneration(paths.application, env);

		const entries = await fs.promises.readdir(paths.cacheDirectory, { recursive: true, withFileTypes: true });
		const cacheEntryCount = entries.filter(entry => entry.isFile()).length;
		if (cacheEntryCount === 0) {
			throw new Error(`Node.js compile cache generation produced no cache entries in ${paths.cacheDirectory}.`);
		}

		console.log(`Generated ${cacheEntryCount} Node.js compile cache entries in ${paths.cacheDirectory}.`);
	} finally {
		await fs.promises.rm(portableDirectory, { recursive: true, force: true });
	}
}

function runCacheGeneration(application: string, env: NodeJS.ProcessEnv): Promise<void> {
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
				reject(new Error(`Node.js compile cache generation timed out.\n${output}`));
			} else if (code !== 0) {
				reject(new Error(`Node.js compile cache generation exited with code ${code} and signal ${signal ?? 'none'}.\n${output}`));
			} else {
				resolve();
			}
		});
	});
}
