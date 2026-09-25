/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { CancellationTokenSource } from '../../../../../base/common/cancellation.js';
import { CancellationError, isCancellationError } from '../../../../../base/common/errors.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
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
			getRemoteUrl: async () => 'https://example.com/test/repo.git',
			fetch: async () => { },
			revListCount: async () => 0,
			cancel: async () => { },
			...overrides,
		} as ILocalGitService;
	}

	function createAuthenticationService(accessToken?: string, scopes: readonly string[] = ['repo']): IAuthenticationService {
		const sessions: AuthenticationSession[] = accessToken ? [{
			id: 'session',
			accessToken,
			account: { id: 'account', label: 'account' },
			scopes,
		}] : [];
		return {
			getSessions: async () => sessions,
		} as Partial<IAuthenticationService> as IAuthenticationService;
	}

	function createFileService(overrides?: Partial<IFileService>): IFileService {
		return {
			_serviceBrand: undefined,
			exists: async () => false,
			del: async () => { },
			...overrides,
		} as Partial<IFileService> as IFileService;
	}

	function createAuthenticationError(): Error & { code: number; stderr: string } {
		const error = new Error('fatal: unable to get password from user') as Error & { code: number; stderr: string };
		error.code = 128;
		error.stderr = 'fatal: unable to get password from user';
		return error;
	}

	function createSerializedAuthenticationError(): Error {
		return new Error(`Command failed: git clone -- https://github.com/test/private.git /tmp/repo
fatal: could not read Username for 'https://github.com': terminal prompts disabled`);
	}

	function createHttpAuthenticationError(status: 401 | 403): Error & { code: number; stderr: string } {
		const message = `fatal: unable to access 'https://github.com/test/private.git/': The requested URL returned error: ${status}`;
		const error = new Error(message) as Error & { code: number; stderr: string };
		error.code = 128;
		error.stderr = message;
		return error;
	}

	function createNonAuthenticationError(): Error & { code: number; stderr: string } {
		const message = `fatal: destination path '/tmp/repo' already exists and is not an empty directory.`;
		const error = new Error(message) as Error & { code: number; stderr: string };
		error.code = 128;
		error.stderr = message;
		return error;
	}

	function createService(localGitService: ILocalGitService, accessToken?: string, fileService = createFileService(), authenticationService = createAuthenticationService(accessToken), logService = new NullLogService()): NativePluginGitCommandService {
		return new NativePluginGitCommandService(localGitService, authenticationService, fileService, logService);
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

	test('cloneRepository does not look up a GitHub session before native success', async () => {
		let sessionLookups = 0;
		const authenticationService: Partial<IAuthenticationService> = {
			getSessions: async () => {
				sessionLookups++;
				return [];
			},
		};
		const service = createService(createLocalGitStub(), undefined, createFileService(), authenticationService as IAuthenticationService);

		await service.cloneRepository('https://github.com/test/public.git', URI.file('/tmp/repo'));

		assert.strictEqual(sessionLookups, 0);
	});

	test('cloneRepository forwards an existing GitHub session for canonical GitHub HTTPS URLs', async () => {
		const authentications: (IGitAuthentication | undefined)[] = [];
		const debugMessages: string[] = [];
		const warningMessages: string[] = [];
		const logService = new class extends NullLogService {
			override debug(message: string, ...args: unknown[]): void {
				debugMessages.push([message, ...args].join(' '));
			}

			override warn(message: string, ...args: unknown[]): void {
				warningMessages.push([message, ...args].join(' '));
			}
		}();
		let deleted = false;
		const service = createService(createLocalGitStub({
			clone: async (_operationId, _url, _path, _ref, options) => {
				authentications.push(options?.authentication);
				if (!options?.authentication) {
					throw createSerializedAuthenticationError();
				}
			},
		}), 'github-token', createFileService({
			exists: async () => true,
			del: async () => { deleted = true; },
		}), createAuthenticationService('github-token'), logService);

		await service.cloneRepository('https://github.com/test/private.git', URI.file('/tmp/repo'));

		assert.deepStrictEqual(authentications, [undefined, {
			url: 'https://github.com/test/private.git',
			authorizationHeader: 'Authorization: Basic eC1hY2Nlc3MtdG9rZW46Z2l0aHViLXRva2Vu',
		}]);
		assert.deepStrictEqual({
			deleted,
			debugMessages,
			warningMessages,
		}, {
			deleted: true,
			debugMessages: ['[NativePluginGitCommandService] Native Git authentication failed for \'clone\'. Retrying with JustRide authentication.'],
			warningMessages: [],
		});
	});

	test('cloneRepository accepts a GitHub session whose scopes include repo', async () => {
		const authentications: (IGitAuthentication | undefined)[] = [];
		const authenticationService = createAuthenticationService('github-token', ['read:user', 'repo', 'user:email', 'workflow']);
		const service = createService(createLocalGitStub({
			clone: async (_operationId, _url, _path, _ref, options) => {
				authentications.push(options?.authentication);
				if (!options?.authentication) {
					throw createSerializedAuthenticationError();
				}
			},
		}), undefined, createFileService(), authenticationService);

		await service.cloneRepository('https://github.com/test/private.git', URI.file('/tmp/repo'));

		assert.deepStrictEqual(authentications, [undefined, {
			url: 'https://github.com/test/private.git',
			authorizationHeader: 'Authorization: Basic eC1hY2Nlc3MtdG9rZW46Z2l0aHViLXRva2Vu',
		}]);
	});

	test('cloneRepository retries session lookup after native authentication failure', async () => {
		let authentication: IGitAuthentication | undefined;
		const sessionLookups: string[][] = [];
		const authenticationService: Partial<IAuthenticationService> = {
			getSessions: async (_providerId, scopes) => {
				sessionLookups.push(Array.isArray(scopes) ? [...scopes] : []);
				return createAuthenticationService('github-token').getSessions('github', ['repo']);
			},
		};
		const service = createService(createLocalGitStub({
			clone: async (_operationId, _url, _path, _ref, options) => {
				authentication = options?.authentication;
				if (!authentication) {
					throw createAuthenticationError();
				}
			},
		}), undefined, createFileService(), authenticationService as IAuthenticationService);

		await service.cloneRepository('https://github.com/test/private.git', URI.file('/tmp/repo'));

		assert.deepStrictEqual({
			sessionLookups,
			authentication,
		}, {
			sessionLookups: [[]],
			authentication: {
				url: 'https://github.com/test/private.git',
				authorizationHeader: 'Authorization: Basic eC1hY2Nlc3MtdG9rZW46Z2l0aHViLXRva2Vu',
			},
		});
	});

	for (const status of [401, 403] as const) {
		test(`cloneRepository retries with JustRide authentication after Git HTTP ${status}`, async () => {
			const authentications: (IGitAuthentication | undefined)[] = [];
			const service = createService(createLocalGitStub({
				clone: async (_operationId, _url, _path, _ref, options) => {
					authentications.push(options?.authentication);
					if (!options?.authentication) {
						throw createHttpAuthenticationError(status);
					}
				},
			}), 'github-token');

			await service.cloneRepository('https://github.com/test/private.git', URI.file('/tmp/repo'));

			assert.deepStrictEqual(authentications, [undefined, {
				url: 'https://github.com/test/private.git',
				authorizationHeader: 'Authorization: Basic eC1hY2Nlc3MtdG9rZW46Z2l0aHViLXRva2Vu',
			}]);
		});
	}

	test('cloneRepository does not use a GitHub session without repo scope', async () => {
		const authentications: (IGitAuthentication | undefined)[] = [];
		const authenticationService: Partial<IAuthenticationService> = {
			getSessions: async () => [{
				id: 'session',
				accessToken: 'github-token',
				account: { id: 'account', label: 'account' },
				scopes: ['read:user'],
			}],
		};
		const service = createService(createLocalGitStub({
			clone: async (_operationId, _url, _path, _ref, options) => {
				authentications.push(options?.authentication);
				throw createAuthenticationError();
			},
		}), undefined, createFileService(), authenticationService as IAuthenticationService);

		await assert.rejects(
			service.cloneRepository('https://github.com/test/private.git', URI.file('/tmp/repo')),
			createAuthenticationError(),
		);

		assert.deepStrictEqual(authentications, [undefined]);
	});

	test('cloneRepository does not forward GitHub authentication to unsupported origins', async () => {
		const authentications: (IGitAuthentication | undefined)[] = [];
		const service = createService(createLocalGitStub({
			clone: async (_operationId, _url, _path, _ref, options) => {
				authentications.push(options?.authentication);
				if (!options?.authentication) {
					throw createAuthenticationError();
				}
			},
		}), 'github-token');

		for (const url of [
			'https://example.com/test/repo.git',
			'https://www.github.com/test/repo.git',
			'https://github.com:8443/test/repo.git',
			'http://github.com/test/repo.git',
			'git@github.com:test/repo.git',
		]) {
			await assert.rejects(service.cloneRepository(url, URI.file('/tmp/repo')), /unable to get password/);
		}

		assert.deepStrictEqual(authentications, [undefined, undefined, undefined, undefined, undefined]);
	});

	test('cloneRepository does not retry or clean up non-authentication failures', async () => {
		const authentications: (IGitAuthentication | undefined)[] = [];
		let deleted = false;
		const service = createService(createLocalGitStub({
			clone: async (_operationId, _url, _path, _ref, options) => {
				authentications.push(options?.authentication);
				throw createNonAuthenticationError();
			},
		}), 'github-token', createFileService({
			exists: async () => true,
			del: async () => { deleted = true; },
		}));

		await assert.rejects(
			service.cloneRepository('https://github.com/test/private.git', URI.file('/tmp/repo')),
			/destination path/,
		);
		assert.deepStrictEqual({ authentications, deleted }, { authentications: [undefined], deleted: false });
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
			getRemoteUrl: async () => 'https://github.com/test/private.git',
			pull: async (_operationId, _repoPath, options) => {
				authentications.push(options?.authentication);
				if (!options?.authentication) {
					throw createAuthenticationError();
				}
				return false;
			},
			fetch: async (_operationId, _repoPath, options) => {
				authentications.push(options?.authentication);
				if (!options?.authentication) {
					throw createAuthenticationError();
				}
			},
		}), 'github-token');

		const repository = URI.file('/tmp/repo');
		await service.pull(repository);
		await service.fetchRepository(repository);

		const expectedAuthentication = {
			url: 'https://github.com/test/private.git',
			authorizationHeader: 'Authorization: Basic eC1hY2Nlc3MtdG9rZW46Z2l0aHViLXRva2Vu',
		};
		assert.deepStrictEqual(authentications, [undefined, expectedAuthentication, undefined, expectedAuthentication]);
	});

	test('pull and fetch do not forward GitHub authentication to non-GitHub remotes', async () => {
		const authentications: (IGitAuthentication | undefined)[] = [];
		const service = createService(createLocalGitStub({
			getRemoteUrl: async () => 'https://gitlab.com/test/private.git',
			pull: async (_operationId, _repoPath, options) => {
				authentications.push(options?.authentication);
				throw createAuthenticationError();
			},
			fetch: async (_operationId, _repoPath, options) => {
				authentications.push(options?.authentication);
				throw createAuthenticationError();
			},
		}), 'github-token');

		const repository = URI.file('/tmp/repo');
		await assert.rejects(service.pull(repository), /unable to get password/);
		await assert.rejects(service.fetchRepository(repository), /unable to get password/);

		assert.deepStrictEqual(authentications, [undefined, undefined]);
	});

	test('pull and fetch proceed without authentication when origin cannot be resolved', async () => {
		const authentications: (IGitAuthentication | undefined)[] = [];
		const remoteLogErrors: (boolean | undefined)[] = [];
		const service = createService(createLocalGitStub({
			getRemoteUrl: async (_operationId, _repoPath, options) => {
				remoteLogErrors.push(options?.logErrors);
				throw new Error('No origin remote');
			},
			pull: async (_operationId, _repoPath, options) => {
				authentications.push(options?.authentication);
				return false;
			},
			fetch: async (_operationId, _repoPath, options) => {
				authentications.push(options?.authentication);
			},
		}), 'github-token');

		const repository = URI.file('/tmp/repo');
		await service.pull(repository);
		await service.fetchRepository(repository);

		assert.deepStrictEqual({ authentications, remoteLogErrors }, {
			authentications: [undefined, undefined],
			remoteLogErrors: [false, false],
		});
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

	for (const cleanupStep of ['exists', 'delete']) {
		test(`cancellation during clone cleanup ${cleanupStep} prevents the authenticated retry`, async () => {
			const cts = store.add(new CancellationTokenSource());
			let cloneCalls = 0;
			let cancellationCalls = 0;
			const service = createService(createLocalGitStub({
				clone: async () => {
					cloneCalls++;
					throw createAuthenticationError();
				},
				cancel: async () => { cancellationCalls++; },
			}), 'github-token', createFileService({
				exists: async () => {
					if (cleanupStep === 'exists') {
						cts.cancel();
					}
					return true;
				},
				del: async () => {
					if (cleanupStep === 'delete') {
						cts.cancel();
					}
				},
			}));

			await assert.rejects(service.cloneRepository('https://github.com/test/private.git', URI.file('/tmp/repo'), undefined, cts.token), isCancellationError);
			assert.deepStrictEqual({ cloneCalls, cancellationCalls }, { cloneCalls: 1, cancellationCalls: 1 });
		});
	}

	test('cancellation errors are not logged', async () => {
		const logged: string[] = [];
		const logService = new class extends NullLogService {
			override error(message: string | Error, ...args: unknown[]): void {
				logged.push([message, ...args].join(' '));
			}
		}();
		const service = createService(createLocalGitStub({
			clone: async () => { throw new CancellationError(); },
		}), undefined, createFileService(), createAuthenticationService(), logService);

		await assert.rejects(
			service.cloneRepository('https://github.com/test/private.git', URI.file('/tmp/repo')),
			isCancellationError,
		);
		assert.deepStrictEqual(logged, []);
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
