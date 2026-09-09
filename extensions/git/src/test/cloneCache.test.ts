/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'mocha';
import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { CachedCloneInfo, filterExistingCachedRepositories, resolveCachedCloneOpenPath } from '../cloneCache';

suite('cloneCache', () => {
	suite('filterExistingCachedRepositories', () => {
		test('keeps entries whose repositoryPath still exists', async () => {
			const entries: CachedCloneInfo[] = [
				{ repositoryPath: '/clones/repo-a', workspacePath: '/workspace' },
				{ repositoryPath: '/clones/repo-b', workspacePath: '/workspace' },
			];
			const existing = new Set(['/clones/repo-a', '/clones/repo-b', '/workspace']);
			const missing: CachedCloneInfo[] = [];

			const result = await filterExistingCachedRepositories(entries, {
				pathExists: async (p) => existing.has(p),
				onMissing: (info) => missing.push(info),
			});

			assert.deepStrictEqual(result, entries);
			assert.strictEqual(missing.length, 0);
		});

		test('drops deleted repositoryPath even when workspacePath still exists', async () => {
			const alive: CachedCloneInfo = { repositoryPath: '/clones/alive', workspacePath: '/workspace' };
			const deleted: CachedCloneInfo = { repositoryPath: '/clones/deleted', workspacePath: '/workspace' };
			const existing = new Set(['/clones/alive', '/workspace']); // parent workspace survives
			const missing: CachedCloneInfo[] = [];

			const result = await filterExistingCachedRepositories([alive, deleted], {
				pathExists: async (p) => existing.has(p),
				onMissing: (info) => missing.push(info),
			});

			assert.deepStrictEqual(result, [alive]);
			assert.deepStrictEqual(missing, [deleted]);
		});

		test('returns empty when all repositoryPaths are gone', async () => {
			const entries: CachedCloneInfo[] = [
				{ repositoryPath: '/clones/gone-a', workspacePath: '/workspace' },
				{ repositoryPath: '/clones/gone-b', workspacePath: '/workspace' },
			];
			const existing = new Set(['/workspace']);
			const missing: CachedCloneInfo[] = [];

			const result = await filterExistingCachedRepositories(entries, {
				pathExists: async (p) => existing.has(p),
				onMissing: (info) => missing.push(info),
			});

			assert.deepStrictEqual(result, []);
			assert.strictEqual(missing.length, 2);
		});

		test('real fs: deleted clone under surviving parent is pruned', async () => {
			const parent = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'clone-cache-'));
			const repo = path.join(parent, 'repo');
			await fs.promises.mkdir(repo);
			try {
				const alive: CachedCloneInfo = { repositoryPath: repo, workspacePath: parent };
				assert.deepStrictEqual(
					await filterExistingCachedRepositories([alive], {
						pathExists: async (p) => !!(await fs.promises.stat(p).catch(() => undefined)),
					}),
					[alive]
				);

				await fs.promises.rm(repo, { recursive: true, force: true });
				const missing: CachedCloneInfo[] = [];
				const result = await filterExistingCachedRepositories([alive], {
					pathExists: async (p) => !!(await fs.promises.stat(p).catch(() => undefined)),
					onMissing: (info) => missing.push(info),
				});
				assert.deepStrictEqual(result, []);
				assert.deepStrictEqual(missing, [alive]);
			} finally {
				await fs.promises.rm(parent, { recursive: true, force: true });
			}
		});
	});

	suite('resolveCachedCloneOpenPath', () => {
		test('uses workspacePath when it still exists', async () => {
			const info: CachedCloneInfo = { repositoryPath: '/clones/repo', workspacePath: '/workspace/proj.code-workspace' };
			const existing = new Set(['/clones/repo', '/workspace/proj.code-workspace']);
			assert.strictEqual(
				await resolveCachedCloneOpenPath(info, async (p) => existing.has(p)),
				'/workspace/proj.code-workspace'
			);
		});

		test('falls back to repositoryPath when workspacePath is gone', async () => {
			const info: CachedCloneInfo = { repositoryPath: '/clones/repo', workspacePath: '/workspace/proj.code-workspace' };
			const existing = new Set(['/clones/repo']);
			assert.strictEqual(
				await resolveCachedCloneOpenPath(info, async (p) => existing.has(p)),
				'/clones/repo'
			);
		});
	});
});
