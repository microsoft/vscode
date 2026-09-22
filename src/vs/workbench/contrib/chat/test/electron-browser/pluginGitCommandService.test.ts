/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { CancellationTokenSource } from '../../../../../base/common/cancellation.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IGitAuthentication, ILocalGitService } from '../../../../../platform/git/common/localGitService.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { AuthenticationSession, IAuthenticationService } from '../../../../services/authentication/common/authentication.js';
import { NativePluginGitCommandService } from '../../electron-browser/pluginGitCommandService.js';

suite('NativePluginGitCommandService', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function createLocalGitStub(overrides?: Partial<ILocalGitService>): ILocalGitService {
		return {
			_serviceBrand: undefined,
			clone: async () => { },
			pull: async () => false,
			checkout: async () => { },
			checkoutCommit: async () => { },
			revParse: async () => '',
			fetch: async () => { },
			revListCount: async () => 0,
			cancel: async () => { },
			...overrides,
		} as ILocalGitService;
	}

	function createAuthenticationService(accessToken?: string): IAuthenticationService {
		const sessions: AuthenticationSession[] = accessToken ? [{
			id: 'session',
			accessToken,
			account: { id: 'account', label: 'account' },
			scopes: ['repo'],
		}] : [];
		return {
			getSessions: async () => sessions,
		} as Partial<IAuthenticationService> as IAuthenticationService;
	}

	function createService(localGitService: ILocalGitService, accessToken?: string): NativePluginGitCommandService {
		return new NativePluginGitCommandService(localGitService, createAuthenticationService(accessToken), new NullLogService());
	}

	test('cloneRepository delegates to ILocalGitService', async () => {
		const calls: string[] = [];
		const service = createService(createLocalGitStub({
			clone: async (_operationId, url, path, ref) => { calls.push(`clone:${url}:${path}:${ref}`); },
		}));

		const targetDir = URI.file('/tmp/repo');
		await service.cloneRepository('https://github.com/test/repo.git', targetDir, 'main');
		assert.deepStrictEqual(calls, [`clone:https://github.com/test/repo.git:${targetDir.fsPath}:main`]);
	});

	test('cloneRepository forwards an existing GitHub session for canonical GitHub HTTPS URLs', async () => {
		let authentication: IGitAuthentication | undefined;
		const service = createService(createLocalGitStub({
			clone: async (_operationId, _url, _path, _ref, options) => { authentication = options?.authentication; },
		}), 'github-token');

		await service.cloneRepository('https://github.com/test/private.git', URI.file('/tmp/repo'));

		assert.deepStrictEqual(authentication, {
			urlPrefix: 'https://github.com/',
			authorizationHeader: 'Authorization: Basic eC1hY2Nlc3MtdG9rZW46Z2l0aHViLXRva2Vu',
		});
	});

	test('cloneRepository does not forward GitHub authentication to unsupported origins', async () => {
		const authentications: (IGitAuthentication | undefined)[] = [];
		const service = createService(createLocalGitStub({
			clone: async (_operationId, _url, _path, _ref, options) => { authentications.push(options?.authentication); },
		}), 'github-token');

		await service.cloneRepository('https://example.com/test/repo.git', URI.file('/tmp/repo'));
		await service.cloneRepository('https://www.github.com/test/repo.git', URI.file('/tmp/repo'));
		await service.cloneRepository('https://github.com:8443/test/repo.git', URI.file('/tmp/repo'));

		assert.deepStrictEqual(authentications, [undefined, undefined, undefined]);
	});

	test('pull delegates to ILocalGitService and returns result', async () => {
		let allowHardResetOnDivergence: boolean | undefined;
		const service = createService(createLocalGitStub({
			pull: async (_operationId, _repoPath, options) => {
				allowHardResetOnDivergence = options?.allowHardResetOnDivergence;
				return true;
			},
		}));

		const result = await service.pull(URI.file('/tmp/repo'));
		assert.strictEqual(result, true);
		assert.strictEqual(allowHardResetOnDivergence, true);
	});

	test('pull and fetch forward an existing GitHub session', async () => {
		const authentications: (IGitAuthentication | undefined)[] = [];
		const service = createService(createLocalGitStub({
			pull: async (_operationId, _repoPath, options) => {
				authentications.push(options?.authentication);
				return false;
			},
			fetch: async (_operationId, _repoPath, options) => {
				authentications.push(options?.authentication);
			},
		}), 'github-token');

		const repository = URI.file('/tmp/repo');
		await service.pull(repository, 'https://github.com/test/private.git');
		await service.fetchRepository(repository, 'https://github.com/test/private.git');

		assert.deepStrictEqual(authentications, [{
			urlPrefix: 'https://github.com/',
			authorizationHeader: 'Authorization: Basic eC1hY2Nlc3MtdG9rZW46Z2l0aHViLXRva2Vu',
		}, {
			urlPrefix: 'https://github.com/',
			authorizationHeader: 'Authorization: Basic eC1hY2Nlc3MtdG9rZW46Z2l0aHViLXRva2Vu',
		}]);
	});

	test('pull and fetch do not forward GitHub authentication to non-GitHub remotes', async () => {
		const authentications: (IGitAuthentication | undefined)[] = [];
		const service = createService(createLocalGitStub({
			pull: async (_operationId, _repoPath, options) => {
				authentications.push(options?.authentication);
				return false;
			},
			fetch: async (_operationId, _repoPath, options) => {
				authentications.push(options?.authentication);
			},
		}), 'github-token');

		const repository = URI.file('/tmp/repo');
		await service.pull(repository, 'https://gitlab.com/test/private.git');
		await service.fetchRepository(repository, 'https://gitlab.com/test/private.git');

		assert.deepStrictEqual(authentications, [undefined, undefined]);
	});

	test('checkout delegates to ILocalGitService with detached flag', async () => {
		const calls: string[] = [];
		const service = createService(createLocalGitStub({
			checkout: async (_operationId, _path, treeish, detached) => { calls.push(`checkout:${treeish}:${detached}`); },
		}));

		await service.checkout(URI.file('/tmp/repo'), 'abc123', true);
		assert.deepStrictEqual(calls, ['checkout:abc123:true']);
	});

	test('checkoutCommit delegates to ILocalGitService', async () => {
		const calls: string[] = [];
		const service = createService(createLocalGitStub({
			checkoutCommit: async (_operationId, path, commit) => {
				calls.push(`checkoutCommit:${path}:${commit}`);
			},
		}));

		const repoDir = URI.file('/tmp/repo');
		await service.checkoutCommit(repoDir, 'aabbccddeeff00112233445566778899aabbccdd');

		assert.deepStrictEqual(calls, [`checkoutCommit:${repoDir.fsPath}:aabbccddeeff00112233445566778899aabbccdd`]);
	});

	test('revParse delegates to ILocalGitService', async () => {
		const service = createService(createLocalGitStub({
			revParse: async () => 'abc123',
		}));

		const result = await service.revParse(URI.file('/tmp/repo'), 'HEAD');
		assert.strictEqual(result, 'abc123');
	});

	test('fetch delegates to ILocalGitService', async () => {
		const calls: string[] = [];
		const service = createService(createLocalGitStub({
			fetch: async (_operationId, path) => { calls.push(`fetch:${path}`); },
		}));

		const repoDir = URI.file('/tmp/repo');
		await service.fetch(repoDir);
		assert.deepStrictEqual(calls, [`fetch:${repoDir.fsPath}`]);
	});

	test('fetchRepository delegates to ILocalGitService.fetch', async () => {
		const calls: string[] = [];
		const service = createService(createLocalGitStub({
			fetch: async (_operationId, path) => { calls.push(`fetch:${path}`); },
		}));

		const repoDir = URI.file('/tmp/repo');
		await service.fetchRepository(repoDir);
		assert.deepStrictEqual(calls, [`fetch:${repoDir.fsPath}`]);
	});

	test('revListCount delegates to ILocalGitService', async () => {
		const service = createService(createLocalGitStub({
			revListCount: async () => 5,
		}));

		const result = await service.revListCount(URI.file('/tmp/repo'), 'HEAD', '@{u}');
		assert.strictEqual(result, 5);
	});

	test('cancellation token triggers cancel on local git service', async () => {
		const cts = store.add(new CancellationTokenSource());
		const cancelledIds: string[] = [];
		let cloneResolve: (() => void) | undefined;
		let cloneStartedResolve: (() => void) | undefined;
		const cloneStarted = new Promise<void>(resolve => { cloneStartedResolve = resolve; });
		const service = createService(createLocalGitStub({
			clone: () => {
				cloneStartedResolve!();
				return new Promise(resolve => { cloneResolve = resolve; });
			},
			cancel: async (id) => { cancelledIds.push(id); },
		}));

		const p = service.cloneRepository('https://github.com/test/repo.git', URI.file('/tmp/repo'), undefined, cts.token);
		await cloneStarted;
		cts.cancel();
		assert.strictEqual(cancelledIds.length, 1);
		cloneResolve!();
		await p;
	});
});
