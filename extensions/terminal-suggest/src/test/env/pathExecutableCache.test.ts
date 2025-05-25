/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'mocha';
import { strictEqual } from 'node:assert';
import { PathExecutableCache } from '../../env/pathExecutableCache';

suite('PathExecutableCache', () => {
	test('cache should return empty for empty PATH', async () => {
		const cache = new PathExecutableCache();
		const result = await cache.getExecutablesInPath({ PATH: '' });
		strictEqual(Array.from(result!.completionResources!).length, 0);
		strictEqual(Array.from(result!.labels!).length, 0);
	});

	test('caching is working on successive calls', async () => {
		const cache = new PathExecutableCache();
		const env = { PATH: process.env.PATH };
		const result = await cache.getExecutablesInPath(env);
		const result2 = await cache.getExecutablesInPath(env);
		strictEqual(result, result2);
	});

	test('refresh clears the cache', async () => {
		const cache = new PathExecutableCache();
		const env = { PATH: process.env.PATH };
		const result = await cache.getExecutablesInPath(env);
		cache.refresh();
		const result2 = await cache.getExecutablesInPath(env);
		strictEqual(result !== result2, true);
	});
});
