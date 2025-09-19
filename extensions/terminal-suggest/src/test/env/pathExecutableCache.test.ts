/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'mocha';
import { deepStrictEqual, strictEqual } from 'node:assert';
import type { MarkdownString } from 'vscode';
import { PathExecutableCache } from '../../env/pathExecutableCache';

suite('PathExecutableCache', () => {
	test('cache should return empty for empty PATH', async () => {
		const cache = new PathExecutableCache();
		const result = await cache.getExecutablesInPath({ PATH: '' });
		strictEqual(Array.from(result!.completionResources!).length, 0);
		strictEqual(Array.from(result!.labels!).length, 0);
	});

	test('results are the same on successive calls', async () => {
		const cache = new PathExecutableCache();
		const env = { PATH: process.env.PATH };
		const result = await cache.getExecutablesInPath(env);
		const result2 = await cache.getExecutablesInPath(env);
		deepStrictEqual(result!.labels, result2!.labels);
	});

	test('refresh clears the cache', async () => {
		const cache = new PathExecutableCache();
		const env = { PATH: process.env.PATH };
		const result = await cache.getExecutablesInPath(env);
		cache.refresh();
		const result2 = await cache.getExecutablesInPath(env);
		strictEqual(result !== result2, true);
	});

	if (process.platform !== 'win32') {
		test('cache should include executables found via symbolic links', async () => {
			const path = require('path');
			// Always use the source fixture directory to ensure symlinks are present
			const fixtureDir = path.resolve(__dirname.replace(/out[\/].*$/, 'src/test/env'), '../fixtures/symlink-test');
			const env = { PATH: fixtureDir };
			const cache = new PathExecutableCache();
			const result = await cache.getExecutablesInPath(env);
			cache.refresh();
			const labels = Array.from(result!.labels!);

			strictEqual(labels.includes('real-executable.sh'), true);
			strictEqual(labels.includes('symlink-executable.sh'), true);
			strictEqual(result?.completionResources?.size, 2);

			const completionResources = result!.completionResources!;
			let realDocRaw: string | MarkdownString | undefined = undefined;
			let symlinkDocRaw: string | MarkdownString | undefined = undefined;
			for (const resource of completionResources) {
				if (resource.label === 'real-executable.sh') {
					realDocRaw = resource.documentation;
				} else if (resource.label === 'symlink-executable.sh') {
					symlinkDocRaw = resource.documentation;
				}
			}
			const realDoc = typeof realDocRaw === 'string' ? realDocRaw : (realDocRaw && 'value' in realDocRaw ? realDocRaw.value : undefined);
			const symlinkDoc = typeof symlinkDocRaw === 'string' ? symlinkDocRaw : (symlinkDocRaw && 'value' in symlinkDocRaw ? symlinkDocRaw.value : undefined);

			const realPath = path.join(fixtureDir, 'real-executable.sh');
			const symlinkPath = path.join(fixtureDir, 'symlink-executable.sh');
			strictEqual(realDoc, realPath);
			strictEqual(symlinkDoc, `${symlinkPath} -> ${realPath}`);
		});
	}
});
