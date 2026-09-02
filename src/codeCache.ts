/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'node:fs';
import { constants, enableCompileCache } from 'node:module';
import * as path from 'node:path';

const cacheDirectory = path.join(import.meta.dirname, '..', 'node-compile-cache');
const isGeneratingCache = process.env['VSCODE_GENERATE_NODE_COMPILE_CACHE'] === '1';
const runtimeCachePrefix = `${process.version}-${process.arch}-`;
const hasRuntimeCache = fs.existsSync(cacheDirectory) && fs.readdirSync(cacheDirectory).some(entry => entry.startsWith(runtimeCachePrefix));

if (!process.env['VSCODE_DEV'] && (isGeneratingCache || hasRuntimeCache)) {
	if (isGeneratingCache) {
		delete process.env['NODE_COMPILE_CACHE_READONLY'];
	} else {
		process.env['NODE_COMPILE_CACHE_READONLY'] = '1';
	}

	const result = enableCompileCache({
		directory: cacheDirectory,
		portable: true
	});

	if (result.status === constants.compileCacheStatus.FAILED) {
		const message = `Unable to enable the packaged Node.js compile cache: ${result.message ?? 'unknown error'}`;
		if (isGeneratingCache) {
			throw new Error(message);
		}
		console.warn(message);
	}
}

await import('./main.js');
