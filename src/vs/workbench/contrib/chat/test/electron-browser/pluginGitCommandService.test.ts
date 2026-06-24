/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { CancellationTokenSource } from '../../../../../base/common/cancellation.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ILocalGitService } from '../../../../../platform/git/common/localGitService.js';
import { NativePluginGitCommandService } from '../../electron-browser/pluginGitCommandService.js';

suite('NativePluginGitCommandService', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function createLocalGitStub(overrides?: Partial<ILocalGitService>): ILocalGitService {
		return {
			_serviceBrand: undefined,
			clone: async () => { },
			pull: async () => false,
			checkout: async () => { },
			revParse: async () => '',
			fetch: async () => { },
			revListCount: async () => 0,
			cancel: async () => { },
			...overrides,
		} as ILocalGitService;
	}

	test('cloneRepository delegates to ILocalGitService', async () => {
		const calls: string[] = [];
		const service = new NativePluginGitCommandService(createLocalGitStub({
			clone: async (_operationId, url, path, ref) => { calls.push(`clone:${url}:${path}:${ref}`); },
		}));

		const targetDir = URI.file('/tmp/repo');
		await service.cloneRepository('https://github.com/test/repo.git', targetDir, 'main');
		assert.deepStrictEqual(calls, [`clone:https://github.com/test/repo.git:${targetDir.fsPath}:main`]);
	});

	test('pull delegates to ILocalGitService and returns result', async () => {
		const service = new NativePluginGitCommandService(createLocalGitStub({
			pull: async () => true,
		}));

		const result = await service.pull(URI.file('/tmp/repo'));
		assert.strictEqual(result, true);
	});

	test('checkout delegates to ILocalGitService with detached flag', async () => {
		const calls: string[] = [];
		const service = new NativePluginGitCommandService(createLocalGitStub({
			checkout: async (_operationId, _path, treeish, detached) => { calls.push(`checkout:${treeish}:${detached}`); },
		}));

		await service.checkout(URI.file('/tmp/repo'), 'abc123', true);
		assert.deepStrictEqual(calls, ['checkout:abc123:true']);
	});

	test('revParse delegates to ILocalGitService', async () => {
		const service = new NativePluginGitCommandService(createLocalGitStub({
			revParse: async () => 'abc123',
		}));

		const result = await service.revParse(URI.file('/tmp/repo'), 'HEAD');
		assert.strictEqual(result, 'abc123');
	});

	test('fetch delegates to ILocalGitService', async () => {
		const calls: string[] = [];
		const service = new NativePluginGitCommandService(createLocalGitStub({
			fetch: async (_operationId, path) => { calls.push(`fetch:${path}`); },
		}));

		const repoDir = URI.file('/tmp/repo');
		await service.fetch(repoDir);
		assert.deepStrictEqual(calls, [`fetch:${repoDir.fsPath}`]);
	});

	test('fetchRepository delegates to ILocalGitService.fetch', async () => {
		const calls: string[] = [];
		const service = new NativePluginGitCommandService(createLocalGitStub({
			fetch: async (_operationId, path) => { calls.push(`fetch:${path}`); },
		}));

		const repoDir = URI.file('/tmp/repo');
		await service.fetchRepository(repoDir);
		assert.deepStrictEqual(calls, [`fetch:${repoDir.fsPath}`]);
	});

	test('revListCount delegates to ILocalGitService', async () => {
		const service = new NativePluginGitCommandService(createLocalGitStub({
			revListCount: async () => 5,
		}));

		const result = await service.revListCount(URI.file('/tmp/repo'), 'HEAD', '@{u}');
		assert.strictEqual(result, 5);
	});

	test('cancellation token triggers cancel on local git service', async () => {
		const cts = store.add(new CancellationTokenSource());
		const cancelledIds: string[] = [];
		let cloneResolve: (() => void) | undefined;
		const service = new NativePluginGitCommandService(createLocalGitStub({
			clone: () => new Promise(resolve => { cloneResolve = resolve; }),
			cancel: async (id) => { cancelledIds.push(id); },
		}));

		const p = service.cloneRepository('https://github.com/test/repo.git', URI.file('/tmp/repo'), undefined, cts.token);
		cts.cancel();
		assert.strictEqual(cancelledIds.length, 1);
		cloneResolve!();
		await p;
	});
});
