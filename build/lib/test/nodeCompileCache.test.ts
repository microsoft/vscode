/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as path from 'path';
import { suite, test } from 'node:test';
import { getNodeCompileCachePaths, shouldGenerateNodeCompileCache, type INodeCompileCacheProduct } from '../nodeCompileCache.ts';

const product: INodeCompileCacheProduct = {
	applicationName: 'code-oss',
	nameLong: 'Code - OSS',
	nameShort: 'Code - OSS'
};

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
});
