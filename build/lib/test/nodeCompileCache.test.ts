/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { suite, test } from 'node:test';
import { createNodeCompileCacheGenerationEnvironment, getNodeCompileCachePaths, shouldGenerateNodeCompileCache, validateNodeCompileCache, type INodeCompileCacheProduct } from '../nodeCompileCache.ts';

const product: INodeCompileCacheProduct = {
	applicationName: 'code-oss',
	nameLong: 'Code - OSS',
	nameShort: 'Code - OSS'
};
const cacheKinds = ['main', 'extension-host', 'shared-process', 'pty-host', 'agent-host'];

async function createCacheOutput(cacheDirectory: string, tag: string, unexpectedEntry?: string): Promise<void> {
	for (const kind of cacheKinds) {
		const kindDirectory = path.join(cacheDirectory, kind);
		const tagDirectory = path.join(kindDirectory, tag);
		await fs.promises.mkdir(tagDirectory, { recursive: true });
		await fs.promises.writeFile(path.join(kindDirectory, '.ready'), '');
		await fs.promises.writeFile(path.join(tagDirectory, '12345678'), '');
		if (unexpectedEntry) {
			await fs.promises.writeFile(path.join(kindDirectory, unexpectedEntry), '');
		}
	}
}

suite('Node compile cache', () => {
	test('resolves packaged application and cache paths', () => {
		assert.deepStrictEqual({
			darwin: getNodeCompileCachePaths('darwin', '/build/VSCode-darwin-x64', '', product),
			linux: getNodeCompileCachePaths('linux', '/build/VSCode-linux-x64', '', product),
			win32: getNodeCompileCachePaths('win32', 'C:\\build\\VSCode-win32-x64', '1234567890', product)
		}, {
			darwin: {
				application: path.join('/build/VSCode-darwin-x64', 'Code - OSS.app', 'Contents', 'MacOS', 'Code - OSS'),
				cacheDirectory: path.join('/build/VSCode-darwin-x64', 'Code - OSS.app', 'Contents', 'Resources', 'app', 'node-compile-cache')
			},
			linux: {
				application: path.join('/build/VSCode-linux-x64', 'code-oss'),
				cacheDirectory: path.join('/build/VSCode-linux-x64', 'resources', 'app', 'node-compile-cache')
			},
			win32: {
				application: path.join('C:\\build\\VSCode-win32-x64', 'Code - OSS.exe'),
				cacheDirectory: path.join('C:\\build\\VSCode-win32-x64', '1234567890', 'resources', 'app', 'node-compile-cache')
			}
		});
	});

	test('generates caches only for native product build targets', () => {
		assert.deepStrictEqual({
			oss: shouldGenerateNodeCompileCache('darwin', 'arm64', product),
			darwinX64: shouldGenerateNodeCompileCache('darwin', 'x64', { ...product, quality: 'insider' }),
			darwinArm64: shouldGenerateNodeCompileCache('darwin', 'arm64', { ...product, quality: 'insider' }),
			linuxX64: shouldGenerateNodeCompileCache('linux', 'x64', { ...product, quality: 'insider' }),
			linuxArm64: shouldGenerateNodeCompileCache('linux', 'arm64', { ...product, quality: 'insider' }),
			win32X64: shouldGenerateNodeCompileCache('win32', 'x64', { ...product, quality: 'insider' }),
			win32Arm64: shouldGenerateNodeCompileCache('win32', 'arm64', { ...product, quality: 'insider' })
		}, {
			oss: false,
			darwinX64: false,
			darwinArm64: true,
			linuxX64: true,
			linuxArm64: false,
			win32X64: true,
			win32Arm64: false
		});
	});

	test('creates an isolated cache generation environment', () => {
		const inheritedEnvironment = {
			PATH: '/bin',
			ELECTRON_RUN_AS_NODE: '1',
			NODE_COMPILE_CACHE: '/node-cache',
			NODE_COMPILE_CACHE_PORTABLE: '1',
			NODE_COMPILE_CACHE_READONLY: '1',
			NODE_DISABLE_COMPILE_CACHE: '1',
			VSCODE_DEV: '1',
			VSCODE_GENERATE_NODE_COMPILE_CACHE: '0',
			VSCODE_MEASURE_NODE_COMPILE_CACHE: '1',
			VSCODE_NODE_COMPILE_CACHE_KIND: 'main',
			VSCODE_NODE_COMPILE_CACHE_MEASUREMENTS: '/measurements',
			VSCODE_NODE_COMPILE_CACHE_ROOT: '/cache',
			VSCODE_PORTABLE: '/inherited-portable'
		};

		assert.deepStrictEqual(createNodeCompileCacheGenerationEnvironment('/portable', inheritedEnvironment), {
			PATH: '/bin',
			VSCODE_GENERATE_NODE_COMPILE_CACHE: '1',
			VSCODE_PORTABLE: '/portable'
		});
	});

	test('rejects cache output with unexpected role entries', async () => {
		const cacheDirectory = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'vscode-node-compile-cache-test-'));

		try {
			await createCacheOutput(cacheDirectory, 'v24.20.0-x64-12345678', 'manifest.jsonl');

			await assert.rejects(
				validateNodeCompileCache(cacheDirectory, 'x64'),
				/unexpected main entries.*manifest\.jsonl/
			);
		} finally {
			await fs.promises.rm(cacheDirectory, { recursive: true, force: true });
		}
	});

	test('validates cache output and removes readiness markers', async () => {
		const cacheDirectory = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'vscode-node-compile-cache-test-'));

		try {
			await createCacheOutput(cacheDirectory, 'v24.20.0-x64-12345678');

			assert.strictEqual(await validateNodeCompileCache(cacheDirectory, 'x64'), cacheKinds.length);
			for (const kind of cacheKinds) {
				assert.strictEqual(fs.existsSync(path.join(cacheDirectory, kind, '.ready')), false);
			}
		} finally {
			await fs.promises.rm(cacheDirectory, { recursive: true, force: true });
		}
	});

	test('rejects cache output with a UID-specific tag', async () => {
		const cacheDirectory = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'vscode-node-compile-cache-test-'));

		try {
			await createCacheOutput(cacheDirectory, 'v24.20.0-x64-12345678-1000');

			await assert.rejects(
				validateNodeCompileCache(cacheDirectory, 'x64'),
				/produced 0 x64 version-tag directories for main/
			);
		} finally {
			await fs.promises.rm(cacheDirectory, { recursive: true, force: true });
		}
	});
});
