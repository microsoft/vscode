/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise, timeout } from '../../../../../base/common/async.js';
import { CancellationTokenSource } from '../../../../../base/common/cancellation.js';
import { encodeBase64, VSBuffer } from '../../../../../base/common/buffer.js';
import { Emitter } from '../../../../../base/common/event.js';
import { DisposableStore, toDisposable } from '../../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../../base/common/network.js';
import { dirname } from '../../../../../base/common/resources.js';
import { escapeRegExpCharacters } from '../../../../../base/common/strings.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { FileService } from '../../../../../platform/files/common/fileService.js';
import { InMemoryFileSystemProvider } from '../../../../../platform/files/common/inMemoryFilesystemProvider.js';
import { AccountClient } from '../../../../../platform/github/common/account/accountClient.js';
import { AnonymousClient } from '../../../../../platform/github/common/anonymous/anonymousClient.js';
import { ApiRequest, ApiResponse, BufferedApiRequestProvider } from '../../../../../platform/github/common/client/request.js';
import { GitTreeEntry, GitTreeEntryMode } from '../../../../../platform/github/common/content/content.js';
import { GitHubAuthorizationContext, GitHubRequestError } from '../../../../../platform/github/common/githubTypes.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { InMemoryStorageService } from '../../../../../platform/storage/common/storage.js';
import { AuthenticationSession, IAuthenticationService } from '../../../../services/authentication/common/authentication.js';
import { IWorkbenchGitHubService } from '../../../../services/github/common/githubService.js';
import { BrowserPluginGitCommandService } from '../../browser/pluginGitCommandService.js';
import { parseGitHubCloneUrl } from '../../browser/githubRepoFetcher.js';

suite('BrowserPluginGitCommandService', () => {
	const disposables = new DisposableStore();
	const sha1 = '1'.repeat(40);
	const sha2 = '2'.repeat(40);
	const targetDir = URI.from({ scheme: Schemas.inMemory, path: '/cache/github.com/octocat/hello' });
	let fileService: FileService;
	let github: StubGitHubService;
	let authentication: StubAuthenticationService;
	let storage: InMemoryStorageService;
	let service: BrowserPluginGitCommandService;

	setup(() => {
		fileService = disposables.add(new FileService(new NullLogService()));
		disposables.add(fileService.registerProvider(Schemas.inMemory, disposables.add(new InMemoryFileSystemProvider())));
		github = new StubGitHubService(disposables);
		authentication = new StubAuthenticationService();
		storage = disposables.add(new InMemoryStorageService());
		service = new BrowserPluginGitCommandService(fileService, new NullLogService(), github, storage, authentication);
	});

	teardown(() => {
		try {
			assert.ok(github.leases.every(lease => lease.disposed), 'Every operation must release its API client');
		} finally {
			disposables.clear();
		}
	});
	ensureNoDisposablesAreLeakedInTestSuite();

	async function clone(files: Record<string, string> = { 'a.txt': 'old' }): Promise<void> {
		queueResolve(github, sha1);
		queueRepoFetch(github, sha1, files);
		await service.cloneRepository('https://github.com/octocat/Hello-World.git', targetDir, 'main');
	}

	suite('parseGitHubCloneUrl', () => {
		test('parses GitHub HTTPS URLs with optional suffix and trailing slash', () => {
			assert.deepStrictEqual([
				'https://github.com/octocat/Hello-World.git',
				'https://github.com/octocat/Hello-World/',
				'https://github.com/octocat/Hello-World.git/',
				'https://www.github.com/octocat/Hello-World',
			].map(parseGitHubCloneUrl), Array(4).fill({ owner: 'octocat', name: 'Hello-World' }));
		});

		test('rejects unsupported hosts, protocols and extra path segments', () => {
			assert.deepStrictEqual([
				'https://github.com/octocat/Hello-World/issues/42',
				'https://github.com/octocat/Hello-World/tree/main',
				'git@github.com:octocat/repo.git',
				'https://gitlab.com/octocat/repo.git',
				'https://github.com/octocat',
				'not-a-url',
			].map(parseGitHubCloneUrl), Array(6).fill(undefined));
		});
	});

	suite('cloneRepository', () => {
		test('named Git tree modes match the API wire representation', () => {
			assert.deepStrictEqual([
				GitTreeEntryMode.File, GitTreeEntryMode.ExecutableFile, GitTreeEntryMode.Directory,
				GitTreeEntryMode.SymbolicLink, GitTreeEntryMode.Submodule,
			], ['100644', '100755', '040000', '120000', '160000']);
		});

		test('rejects non-GitHub clone URLs with an actionable message', async () => {
			await assert.rejects(service.cloneRepository('https://gitlab.com/foo/bar.git', targetDir), /can only be installed from GitHub HTTPS URLs/);
			assert.strictEqual(github.leases.length, 0);
		});

		test('uses typed ref, tree and blob requests and persists SHA metadata', async () => {
			await clone({ 'README.md': 'hello\n', 'src/index.js': 'console.log(1);' });
			assert.deepStrictEqual({
				readme: (await fileService.readFile(URI.joinPath(targetDir, 'README.md'))).value.toString(),
				source: (await fileService.readFile(URI.joinPath(targetDir, 'src/index.js'))).value.toString(),
				sha: await service.revParse(targetDir, 'HEAD'),
				requests: github.requests.map(({ request }) => ({ path: request.path, accept: request.accept, caller: request.options?.caller, priority: request.options?.priority, noCache: request.options?.noCache })),
			}, {
				readme: 'hello\n', source: 'console.log(1);', sha: sha1,
				requests: [
					{ path: '/repos/octocat/Hello-World/commits/main', accept: 'application/vnd.github.sha', caller: 'pluginGit.resolveSha', priority: undefined, noCache: undefined },
					{ path: `/repos/octocat/Hello-World/git/trees/${sha1}?recursive=1`, accept: 'application/vnd.github+json', caller: 'pluginGit.tree', priority: undefined, noCache: true },
					{ path: '/repos/octocat/Hello-World/git/blobs/b0', accept: 'application/vnd.github+json', caller: 'pluginGit.blob', priority: undefined, noCache: true },
					{ path: '/repos/octocat/Hello-World/git/blobs/b1', accept: 'application/vnd.github+json', caller: 'pluginGit.blob', priority: undefined, noCache: true },
				],
			});
		});

		test('resolves HEAD when no ref was supplied', async () => {
			queueResolve(github, sha1, 'HEAD');
			queueRepoFetch(github, sha1, { 'a.txt': 'a' });
			await service.cloneRepository('https://github.com/octocat/Hello-World.git', targetDir);
			assert.strictEqual(await service.revParse(targetDir, 'HEAD'), sha1);
		});

		test('surfaces a sign-in message when no repository session can be created', async () => {
			github.queue(/\/commits\/main$/, new GitHubRequestError('Unauthorized', 'authentication', 401));
			await assert.rejects(service.cloneRepository('https://github.com/octocat/Private.git', targetDir, 'main'), /Sign in to GitHub/);
			assert.strictEqual(authentication.createSessionCalls, 1);
		});

		for (const kind of ['rateLimit', 'network', 'server', 'notFound'] as const) {
			test(`${kind} failures do not trigger anonymous fallback or sign-in`, async () => {
				authentication.sessions = [session('existing', ['repo'])];
				const error = new GitHubRequestError('Request failed', kind, kind === 'rateLimit' ? 403 : undefined);
				github.queue(/\/commits\/main$/, error);
				await assert.rejects(service.cloneRepository('https://github.com/octocat/Hello-World.git', targetDir, 'main'), candidate => candidate === error);
				assert.deepStrictEqual({ grants: github.leases.map(lease => lease.authorization?.sessionId), prompts: authentication.createSessionCalls }, {
					grants: ['existing'], prompts: 0,
				});
			});
		}

		test('requests repository access only after an anonymous authorization failure', async () => {
			authentication.createdSession = session('created', ['repo']);
			github.queue(/\/commits\/main$/, new GitHubRequestError('Forbidden', 'authorization', 403));
			queueResolve(github, sha1);
			queueRepoFetch(github, sha1, { 'private.txt': 'secret' });
			await service.cloneRepository('https://github.com/octocat/Private.git', targetDir, 'main');
			assert.deepStrictEqual({
				grants: github.leases.map(lease => lease.authorization), prompts: authentication.createSessionCalls,
				content: (await fileService.readFile(URI.joinPath(targetDir, 'private.txt'))).value.toString(),
			}, {
				grants: [undefined, { providerId: 'github', sessionId: 'created', accountId: 'octocat', scopes: ['repo'] }],
				prompts: 1, content: 'secret',
			});
		});

		test('prefers an existing repository session and forwards its exact grant without tokens', async () => {
			authentication.sessions = [session('profile', ['read:user']), session('repository', ['repo', 'read:user'])];
			await clone();
			assert.deepStrictEqual({
				grants: github.leases.map(lease => lease.authorization),
				requestGrants: github.requests.map(request => request.authorization?.sessionId),
				prompts: authentication.createSessionCalls,
			}, {
				grants: [{ providerId: 'github', sessionId: 'repository', accountId: 'octocat', scopes: ['repo', 'read:user'] }],
				requestGrants: ['repository', 'repository', 'repository'], prompts: 0,
			});
		});

		test('falls back to anonymous when the signed-in grant is rejected', async () => {
			authentication.sessions = [session('sso-blocked', ['repo'])];
			github.queue(/\/commits\/main$/, new GitHubRequestError('Forbidden', 'authorization', 403));
			await clone();
			assert.deepStrictEqual({ grants: github.leases.map(lease => lease.authorization?.sessionId), prompts: authentication.createSessionCalls }, {
				grants: ['sso-blocked', undefined], prompts: 0,
			});
		});

		test('uses the newly requested grant after both existing and anonymous access fail', async () => {
			authentication.sessions = [session('old')];
			authentication.createdSession = session('new', ['repo']);
			github.queue(/\/commits\/main$/, new GitHubRequestError('Unauthorized', 'authentication', 401));
			github.queue(/\/commits\/main$/, new GitHubRequestError('Forbidden', 'authorization', 403));
			await clone();
			assert.deepStrictEqual({ grants: github.leases.map(lease => lease.authorization?.sessionId), prompts: authentication.createSessionCalls }, {
				grants: ['old', undefined, 'new'], prompts: 1,
			});
		});

		test('reports exhausted authentication attempts without another prompt', async () => {
			authentication.createdSession = session('created', ['repo']);
			github.queue(/\/commits\/main$/, new GitHubRequestError('Unauthorized', 'authentication', 401));
			github.queue(/\/commits\/main$/, new GitHubRequestError('Forbidden', 'authorization', 403));
			await assert.rejects(service.cloneRepository('https://github.com/octocat/Private.git', targetDir, 'main'), /GitHub authentication is required to install/);
			assert.strictEqual(authentication.createSessionCalls, 1);
		});

		test('a malformed response is not treated as missing authentication', async () => {
			github.queue(/\/commits\/main$/, { status: 200, data: 'not-a-sha' });
			await assert.rejects(service.cloneRepository('https://github.com/octocat/Hello-World.git', targetDir, 'main'), { name: 'SchemaError' });
			assert.strictEqual(authentication.createSessionCalls, 0);
		});

		test('pre-cancellation does not acquire a client or prompt', async () => {
			const cancellation = disposables.add(new CancellationTokenSource());
			cancellation.cancel();
			await assert.rejects(service.cloneRepository('https://github.com/octocat/Private.git', targetDir, 'main', cancellation.token), { name: 'Canceled' });
			assert.deepStrictEqual({ leases: github.leases.length, prompts: authentication.createSessionCalls }, { leases: 0, prompts: 0 });
		});

		test('failed extraction leaves the previous target and metadata intact', async () => {
			await clone({ 'keep.txt': 'preserved' });
			queueResolve(github, sha2);
			github.queue(new RegExp(`/git/trees/${sha2}`), new GitHubRequestError('Failed tree', 'server', 500));
			await assert.rejects(service.cloneRepository('https://github.com/octocat/Hello-World.git', targetDir, 'main'));
			assert.deepStrictEqual({
				content: (await fileService.readFile(URI.joinPath(targetDir, 'keep.txt'))).value.toString(), sha: await service.revParse(targetDir, 'HEAD'),
			}, { content: 'preserved', sha: sha1 });
		});

		test('skips symlinks and submodules while preserving binary blob contents', async () => {
			queueResolve(github, sha1);
			queueTree(github, sha1, [
				{ path: 'binary.bin', mode: GitTreeEntryMode.File, type: 'blob', sha: 'binary' },
				{ path: 'link', mode: GitTreeEntryMode.SymbolicLink, type: 'blob', sha: 'link' },
				{ path: 'subrepo', mode: GitTreeEntryMode.Submodule, type: 'commit', sha: 'subrepo' },
			]);
			const binary = VSBuffer.wrap(new Uint8Array([0, 255, 128, 10]));
			github.queue(/\/git\/blobs\/binary$/, jsonResponse({ ...blob('binary', binary), content: encodeBase64(binary).replace(/.{4}/g, '$&\n') }));
			await service.cloneRepository('https://github.com/octocat/Hello-World.git', targetDir, 'main');
			assert.deepStrictEqual({
				bytes: [...(await fileService.readFile(URI.joinPath(targetDir, 'binary.bin'))).value.buffer],
				link: await fileService.exists(URI.joinPath(targetDir, 'link')),
				submodule: await fileService.exists(URI.joinPath(targetDir, 'subrepo')),
			}, { bytes: [0, 255, 128, 10], link: false, submodule: false });
		});

		test('keeps at most ten blob downloads active', async () => {
			queueResolve(github, sha1);
			const entries: GitTreeEntry[] = Array.from({ length: 12 }, (_, index) => ({ path: `${index}.txt`, mode: GitTreeEntryMode.File, type: 'blob', sha: `blob${index}` }));
			queueTree(github, sha1, entries);
			const started = new DeferredPromise<void>();
			const release = new DeferredPromise<void>();
			let active = 0;
			let maximum = 0;
			for (const entry of entries) {
				github.queue(new RegExp(`/git/blobs/${entry.sha}$`), async () => {
					maximum = Math.max(maximum, ++active);
					if (active === 10) {
						void started.complete();
					}
					await release.p;
					active--;
					return jsonResponse(blob(entry.sha, VSBuffer.fromString(entry.path)));
				});
			}
			const pending = service.cloneRepository('https://github.com/octocat/Hello-World.git', targetDir, 'main');
			await started.p;
			const initiallyStarted = github.requests.filter(value => value.request.path.includes('/git/blobs/')).length;
			await release.complete();
			await pending;
			assert.deepStrictEqual({ maximum, initiallyStarted, active, files: (await fileService.resolve(targetDir)).children?.length }, {
				maximum: 10, initiallyStarted: 10, active: 0, files: 12,
			});
		});

		test('preserves the existing warning for truncated trees', async () => {
			const warnings: string[] = [];
			const log = new class extends NullLogService {
				override warn(message: string): void { warnings.push(message); }
			}();
			service = new BrowserPluginGitCommandService(fileService, log, github, storage, authentication);
			queueResolve(github, sha1);
			queueTree(github, sha1, [{ path: 'included.txt', mode: GitTreeEntryMode.File, type: 'blob', sha: 'included' }], true);
			github.queue(/\/git\/blobs\/included$/, jsonResponse(blob('included', VSBuffer.fromString('included'))));
			await service.cloneRepository('https://github.com/octocat/Hello-World.git', targetDir, 'main');
			assert.deepStrictEqual({
				warned: warnings.some(message => message.includes('is truncated')),
				files: (await fileService.resolve(targetDir)).children?.map(child => child.name),
			}, { warned: true, files: ['included.txt'] });
		});

		test('drains cancelled peer downloads before removing a failed staging directory', async () => {
			await clone({ 'keep.txt': 'preserved' });
			queueResolve(github, sha2);
			queueTree(github, sha2, [
				{ path: 'late.txt', mode: GitTreeEntryMode.File, type: 'blob', sha: 'late' },
				{ path: 'failed.txt', mode: GitTreeEntryMode.File, type: 'blob', sha: 'failed' },
			]);
			const started = new DeferredPromise<void>();
			const release = new DeferredPromise<void>();
			github.queue(/\/git\/blobs\/late$/, async () => {
				await started.complete();
				await release.p;
				return jsonResponse(blob('late', VSBuffer.fromString('late')));
			});
			const failure = new GitHubRequestError('Failed blob', 'server', 500);
			github.queue(/\/git\/blobs\/failed$/, failure);
			const pending = service.cloneRepository('https://github.com/octocat/Hello-World.git', targetDir, 'main');
			let settled = false;
			const rejected = assert.rejects(pending, error => error === failure).then(() => { settled = true; });
			await started.p;
			await timeout(0);
			const settledBeforePeer = settled;
			const peerCancelled = github.requests.find(value => value.request.path.endsWith('/blobs/late'))?.signal.aborted;
			await release.complete();
			await rejected;
			assert.deepStrictEqual({
				settledBeforePeer, peerCancelled, sha: await service.revParse(targetDir, 'HEAD'),
				content: (await fileService.readFile(URI.joinPath(targetDir, 'keep.txt'))).value.toString(),
				directories: (await fileService.resolve(dirname(targetDir))).children?.map(child => child.name),
			}, { settledBeforePeer: false, peerCancelled: true, sha: sha1, content: 'preserved', directories: ['hello'] });
		});

		test('grant invalidation during clone cancels without anonymous fallback or sign-in', async () => {
			authentication.sessions = [session('existing', ['repo'])];
			await clone();
			queueResolve(github, sha2);
			queueTree(github, sha2, [{ path: 'a.txt', mode: GitTreeEntryMode.File, type: 'blob', sha: 'revoked' }]);
			github.queue(/\/git\/blobs\/revoked$/, async signal => {
				github.leases.at(-1)!.invalidate();
				signal.throwIfAborted();
				return jsonResponse(blob('revoked', VSBuffer.fromString('new')));
			});
			github.queue(/\/commits\/main$/, new GitHubRequestError('Unauthorized', 'authentication', 401));
			await assert.rejects(service.cloneRepository('https://github.com/octocat/Hello-World.git', targetDir, 'main'), { name: 'Canceled' });
			assert.deepStrictEqual({
				grants: github.leases.map(lease => lease.authorization?.sessionId),
				prompts: authentication.createSessionCalls,
				sha: await service.revParse(targetDir, 'HEAD'),
				content: (await fileService.readFile(URI.joinPath(targetDir, 'a.txt'))).value.toString(),
				directories: (await fileService.resolve(dirname(targetDir))).children?.map(child => child.name),
			}, { grants: ['existing', 'existing'], prompts: 0, sha: sha1, content: 'old', directories: ['hello'] });
		});

		for (const stop of ['cancel', 'invalidate'] as const) {
			test(`${stop} during a blob read prevents publication and authentication retry`, async () => {
				authentication.sessions = [session('existing', ['repo'])];
				await clone();
				const cancellation = disposables.add(new CancellationTokenSource());
				queueResolve(github, sha2);
				queueTree(github, sha2, [{ path: 'a.txt', mode: GitTreeEntryMode.File, type: 'blob', sha: 'stopped' }]);
				github.queue(/\/git\/blobs\/stopped$/, async () => {
					if (stop === 'cancel') {
						cancellation.cancel();
					} else {
						github.leases.at(-1)!.invalidate();
					}
					return jsonResponse(blob('stopped', VSBuffer.fromString('new')));
				});
				await assert.rejects(service.pull(targetDir, cancellation.token), { name: 'Canceled' });
				assert.deepStrictEqual({
					sha: await service.revParse(targetDir, 'HEAD'),
					content: (await fileService.readFile(URI.joinPath(targetDir, 'a.txt'))).value.toString(),
					prompts: authentication.createSessionCalls,
					directories: (await fileService.resolve(dirname(targetDir))).children?.map(child => child.name),
				}, { sha: sha1, content: 'old', prompts: 0, directories: ['hello'] });
			});
		}
	});

	suite('pull', () => {
		test('returns false without fetching the tree when the SHA is unchanged', async () => {
			await clone();
			queueResolve(github, sha1);
			assert.deepStrictEqual({ changed: await service.pull(targetDir), requests: github.requests.length }, { changed: false, requests: 4 });
		});

		test('updates changed files, removes stale files and persists the new SHA', async () => {
			await clone({ 'keep.txt': 'old', 'removed.txt': 'obsolete' });
			queueResolve(github, sha2);
			queueRepoFetch(github, sha2, { 'keep.txt': 'new' });
			assert.deepStrictEqual({
				changed: await service.pull(targetDir),
				content: (await fileService.readFile(URI.joinPath(targetDir, 'keep.txt'))).value.toString(),
				staleFileExists: await fileService.exists(URI.joinPath(targetDir, 'removed.txt')),
				sha: await service.revParse(targetDir, 'HEAD'),
			}, { changed: true, content: 'new', staleFileExists: false, sha: sha2 });
		});

		test('rejects missing cached metadata', async () => {
			await assert.rejects(service.pull(targetDir), /no cached metadata/);
		});

		test('does not prompt or change credentials when an update is unauthorized', async () => {
			await clone();
			authentication.sessions = [session('update', ['repo'])];
			github.queue(/\/commits\/main$/, new GitHubRequestError('Forbidden', 'authorization', 403));
			await assert.rejects(service.pull(targetDir), { kind: 'authorization' });
			assert.deepStrictEqual({ prompts: authentication.createSessionCalls, sha: await service.revParse(targetDir, 'HEAD'), leases: github.leases.length }, {
				prompts: 0, sha: sha1, leases: 2,
			});
		});

		for (const unsafe of ['../escaped.txt', '..\\..\\escaped.txt', '/absolute.txt', 'nul\0.txt']) {
			test(`skips an unsafe tree path (${JSON.stringify(unsafe)})`, async () => {
				queueResolve(github, sha1);
				queueTree(github, sha1, [
					{ path: 'safe.txt', mode: GitTreeEntryMode.File, type: 'blob', sha: 'safe' },
					{ path: unsafe, mode: GitTreeEntryMode.File, type: 'blob', sha: 'unsafe' },
				]);
				github.queue(/\/git\/blobs\/safe$/, jsonResponse(blob('safe', VSBuffer.fromString('safe'))));
				await service.cloneRepository('https://github.com/octocat/Hello-World.git', targetDir, 'main');
				assert.deepStrictEqual({
					files: (await fileService.resolve(targetDir)).children?.map(child => child.name),
					content: (await fileService.readFile(URI.joinPath(targetDir, 'safe.txt'))).value.toString(),
					unsafeRequested: github.requests.some(value => value.request.path.endsWith('/unsafe')),
				}, { files: ['safe.txt'], content: 'safe', unsafeRequested: false });
			});
		}
	});

	suite('checkout', () => {
		test('cached exact SHAs need no requests for either checkout operation', async () => {
			await clone();
			await service.checkout(targetDir, sha1, true);
			await service.checkoutCommit(targetDir, sha1);
			assert.deepStrictEqual({ requests: github.requests.length, leases: github.leases.length, sha: await service.revParse(targetDir, 'HEAD') }, {
				requests: 3, leases: 1, sha: sha1,
			});
		});

		test('materializes a different full SHA without ref resolution', async () => {
			await clone();
			queueRepoFetch(github, sha2, { 'a.txt': 'new' });
			await service.checkout(targetDir, sha2, true);
			assert.deepStrictEqual({
				content: (await fileService.readFile(URI.joinPath(targetDir, 'a.txt'))).value.toString(), sha: await service.revParse(targetDir, 'HEAD'),
			}, { content: 'new', sha: sha2 });
		});

		test('resolves branch names and remembers the selected ref for later pulls', async () => {
			await clone();
			queueResolve(github, sha2, 'feature/next');
			queueRepoFetch(github, sha2, { 'a.txt': 'next' });
			await service.checkout(targetDir, 'feature/next');
			queueResolve(github, sha2, 'feature/next');
			assert.deepStrictEqual({ changed: await service.pull(targetDir), sha: await service.revParse(targetDir, 'HEAD') }, { changed: false, sha: sha2 });
		});

		test('checkoutCommit validates and materializes the exact requested commit', async () => {
			await clone();
			const pinned = 'a'.repeat(40);
			queueResolve(github, pinned, pinned);
			queueRepoFetch(github, pinned, { 'a.txt': 'pinned' });
			await service.checkoutCommit(targetDir, pinned.toUpperCase());
			assert.strictEqual(await service.revParse(targetDir, 'HEAD'), pinned);
		});

		test('checkoutCommit rejects a mismatching resolved SHA without changing the cached tree', async () => {
			await clone();
			queueResolve(github, sha1, sha2);
			await assert.rejects(service.checkoutCommit(targetDir, sha2), /resolved to a different commit/);
			assert.strictEqual(await service.revParse(targetDir, 'HEAD'), sha1);
		});

		test('rejects missing metadata and invalid pinned SHAs', async () => {
			await assert.rejects(service.checkout(targetDir, 'main'), /no cached metadata/);
			await assert.rejects(service.checkoutCommit(targetDir, 'short'), /not a full SHA-1/);
		});
	});

	test('persisted metadata supports a new service instance without network reads', async () => {
		await clone();
		const restored = new BrowserPluginGitCommandService(fileService, new NullLogService(), github, storage, authentication);
		assert.strictEqual(await restored.revParse(targetDir, 'HEAD'), sha1);
		await assert.rejects(restored.revParse(targetDir, sha2), /only HEAD/);
	});

	test('fetch, fetchRepository and revListCount are inert', async () => {
		await service.fetch(targetDir);
		await service.fetchRepository(targetDir);
		assert.deepStrictEqual({ count: await service.revListCount(targetDir, 'HEAD', '@{u}'), requests: github.requests.length }, { count: 0, requests: 0 });
	});
});

type ResponseFactory = ApiResponse<string> | Error | ((signal: AbortSignal) => Promise<ApiResponse<string>>);

class StubGitHubService extends mock<IWorkbenchGitHubService>() {
	private readonly responses: { path: RegExp; response: ResponseFactory }[] = [];
	readonly requests: { request: Omit<ApiRequest, 'body'>; authorization: GitHubAuthorizationContext | undefined; signal: AbortSignal }[] = [];
	readonly leases: { authorization: GitHubAuthorizationContext | undefined; invalidate: () => void; disposed: boolean }[] = [];

	constructor(private readonly store: DisposableStore) {
		super();
	}

	queue(path: RegExp, response: ResponseFactory): void {
		this.responses.push({ path, response });
	}

	override async acquireAccountApiClient(authorization: GitHubAuthorizationContext, signal: AbortSignal): Promise<AccountClient> {
		signal.throwIfAborted();
		const { provider, lifetime, invalidated } = this.providers(authorization);
		return this.store.add(new AccountClient(authorization, { rest: provider, graphql: provider, onDidInvalidate: invalidated.event }, lifetime));
	}

	override async acquireAnonymousApiClient(signal: AbortSignal): Promise<AnonymousClient> {
		signal.throwIfAborted();
		const { provider, lifetime } = this.providers(undefined);
		return this.store.add(new AnonymousClient(provider, undefined, lifetime));
	}

	private providers(authorization: GitHubAuthorizationContext | undefined) {
		const lifetime = new DisposableStore();
		const invalidated = lifetime.add(new Emitter<void>());
		const controller = new AbortController();
		const lease = {
			authorization, disposed: false,
			invalidate: () => {
				controller.abort(new GitHubRequestError('GitHub client grant is no longer available', 'authentication'));
				invalidated.fire();
			},
		};
		this.leases.push(lease);
		lifetime.add(toDisposable(() => { lease.disposed = true; controller.abort(); }));
		const take = async (request: Omit<ApiRequest, 'body'>, signal: AbortSignal): Promise<ApiResponse<string>> => {
			this.requests.push({ request, authorization, signal });
			const index = this.responses.findIndex(value => value.path.test(request.path));
			assert.notStrictEqual(index, -1, `Unexpected ${request.method} ${request.path}`);
			const [{ response }] = this.responses.splice(index, 1);
			if (response instanceof Error) {
				throw response;
			}
			return typeof response === 'function' ? response(signal) : response;
		};
		const provider = new class extends BufferedApiRequestProvider {
			protected override execute(request: Omit<ApiRequest, 'body'>, signal: AbortSignal): Promise<ApiResponse<string>> {
				return take(request, signal);
			}
		}(controller.signal);
		return { provider, lifetime, invalidated };
	}
}

class StubAuthenticationService extends mock<IAuthenticationService>() {
	sessions: readonly AuthenticationSession[] = [];
	createdSession: AuthenticationSession | undefined;
	createSessionCalls = 0;

	override async getSessions(): Promise<readonly AuthenticationSession[]> {
		return this.sessions;
	}

	override async createSession(providerId: string, scopes: string[], options?: { activateImmediate?: boolean }): Promise<AuthenticationSession> {
		this.createSessionCalls++;
		assert.deepStrictEqual({ providerId, scopes, options }, { providerId: 'github', scopes: ['repo'], options: { activateImmediate: true } });
		if (!this.createdSession) {
			throw new Error('No GitHub session available');
		}
		return this.createdSession;
	}
}

function session(id: string, scopes: readonly string[] = []): AuthenticationSession {
	return { id, accessToken: `unused-${id}`, account: { label: 'octocat', id: 'octocat' }, scopes };
}

function queueResolve(github: StubGitHubService, sha: string, ref = 'main'): void {
	github.queue(new RegExp(`/commits/${escapeRegExpCharacters(encodeURIComponent(ref))}$`), { status: 200, data: sha });
}

function jsonResponse(value: unknown): ApiResponse<string> {
	return { status: 200, data: JSON.stringify(value) };
}

function queueTree(github: StubGitHubService, sha: string, tree: readonly GitTreeEntry[], truncated = false): void {
	github.queue(new RegExp(`/git/trees/${sha}\\?recursive=1$`), jsonResponse({ sha, url: `https://api.github.com/tree/${sha}`, tree, truncated }));
}

function blob(sha: string, value: VSBuffer) {
	return { sha, node_id: `blob-${sha}`, size: value.byteLength, url: `https://api.github.com/blob/${sha}`, encoding: 'base64', content: encodeBase64(value) };
}

function queueRepoFetch(github: StubGitHubService, sha: string, files: Record<string, string>): void {
	const entries = Object.entries(files);
	queueTree(github, sha, entries.map(([path, text], index) => ({ path, mode: GitTreeEntryMode.File, type: 'blob', sha: `b${index}`, size: VSBuffer.fromString(text).byteLength })));
	for (const [index, [, text]] of entries.entries()) {
		github.queue(new RegExp(`/git/blobs/b${index}$`), jsonResponse(blob(`b${index}`, VSBuffer.fromString(text))));
	}
}
