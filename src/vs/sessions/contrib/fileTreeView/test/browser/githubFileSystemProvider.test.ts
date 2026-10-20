/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise, timeout } from '../../../../../base/common/async.js';
import { encodeBase64, VSBuffer } from '../../../../../base/common/buffer.js';
import { IDefaultAccount } from '../../../../../base/common/defaultAccount.js';
import { isCancellationError } from '../../../../../base/common/errors.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { toDisposable } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock, upcastPartial } from '../../../../../base/test/common/mock.js';
import { runWithFakedTimers } from '../../../../../base/test/common/timeTravelScheduler.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IDefaultAccountService } from '../../../../../platform/defaultAccount/common/defaultAccount.js';
import { FileSystemProviderCapabilities, FileSystemProviderError, FileSystemProviderErrorCode, FileType } from '../../../../../platform/files/common/files.js';
import { IGitHubAccountClient } from '../../../../../platform/github/common/account/account.js';
import { LocalApiRequestProvider } from '../../../../../platform/github/common/client/localApiRequestProvider.js';
import { SchemaError } from '../../../../../platform/github/common/client/schema.js';
import { GitBlob, GitTree, IContentClient } from '../../../../../platform/github/common/content/content.js';
import { ContentClient } from '../../../../../platform/github/common/content/contentClient.js';
import { GitHubTransport } from '../../../../../platform/github/common/githubTransport.js';
import { GitHubRequestError } from '../../../../../platform/github/common/githubTypes.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ILogService, NullLogService } from '../../../../../platform/log/common/log.js';
import { IWorkbenchGitHubService } from '../../../../../workbench/services/github/common/githubService.js';
import { GITHUB_REMOTE_FILE_SCHEME } from '../../../../services/sessions/common/session.js';
import { GitHubFileSystemProvider } from '../../browser/githubFileSystemProvider.js';

const account: IDefaultAccount = {
	accountName: 'octocat', sessionId: 'selected', enterprise: false,
	authenticationProvider: { id: 'github', name: 'GitHub', enterprise: false },
};
const root = URI.from({ scheme: GITHUB_REMOTE_FILE_SCHEME, authority: 'github', path: '/owner/repo/HEAD' });
const tree: GitTree = {
	sha: 'root-tree', url: 'https://api.github.com/repos/owner/repo/git/trees/root-tree', truncated: false,
	tree: [
		{ path: 'README.md', mode: '100644', type: 'blob', sha: 'readme', size: 5 },
		{ path: 'src', mode: '040000', type: 'tree', sha: 'src-tree' },
		{ path: 'src/main.ts', mode: '100644', type: 'blob', sha: 'main', size: 3 },
		{ path: 'implicit/file.txt', mode: '100644', type: 'blob', sha: 'implicit', size: 1 },
	],
};
const blob: GitBlob = {
	sha: 'readme', node_id: 'B_1', size: 5,
	url: 'https://api.github.com/repos/owner/repo/git/blobs/readme', content: 'aGVsbG8=', encoding: 'base64',
};

suite('GitHubFileSystemProvider', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function setup(contentClient?: IContentClient) {
		const instantiation = store.add(new TestInstantiationService());
		const changed = store.add(new Emitter<IDefaultAccount | null>());
		const invalidated = store.add(new Emitter<void>());
		const treeRequested = store.add(new Emitter<AbortSignal>());
		const blobRequested = store.add(new Emitter<AbortSignal>());
		const acquisitionRequested = store.add(new Emitter<AbortSignal>());
		let selectedAccount: IDefaultAccount | null = account;
		const state: {
			tree: GitTree | Error | Promise<GitTree>;
			blob: GitBlob | Error | Promise<GitBlob>;
			acquisition?: Promise<void>;
			acquisitionError?: Error;
		} = { tree, blob };
		const treeCalls: Parameters<IContentClient['getTree']>[] = [];
		const blobCalls: Parameters<IContentClient['getBlob']>[] = [];
		const acquisitions: AbortSignal[] = [];
		let releases = 0;
		instantiation.stub(IDefaultAccountService, new class extends mock<IDefaultAccountService>() {
			override readonly onDidChangeDefaultAccount = changed.event;
			override get currentDefaultAccount() { return selectedAccount; }
			override getDefaultAccountAuthenticationProvider() { return selectedAccount?.authenticationProvider ?? account.authenticationProvider; }
			override resolveGitHubUrl() { return 'https://enterprise.example.test'; }
			override async signIn() { return assert.fail('Filesystem reads must not prompt for sign-in'); }
		}());
		instantiation.stub(IWorkbenchGitHubService, new class extends mock<IWorkbenchGitHubService>() {
			override async acquireDefaultAccountApiClient(signal: AbortSignal): Promise<IGitHubAccountClient> {
				const selected = selectedAccount;
				acquisitions.push(signal);
				acquisitionRequested.fire(signal);
				await state.acquisition;
				if (state.acquisitionError) {
					throw state.acquisitionError;
				}
				if (!selected) {
					throw new GitHubRequestError('No selected account', 'authentication');
				}
				const release = store.add(toDisposable(() => releases++));
				return upcastPartial<IGitHubAccountClient>({
					authorization: { providerId: selected.authenticationProvider.id, sessionId: selected.sessionId, scopes: ['repo'] },
					onDidInvalidate: invalidated.event,
					content: contentClient ?? new class extends mock<IContentClient>() {
						override async getTree(...args: Parameters<IContentClient['getTree']>): Promise<GitTree> {
							const result = state.tree;
							treeCalls.push(args);
							treeRequested.fire(args[3]);
							if (result instanceof Error) {
								throw result;
							}
							return result;
						}
						override async getBlob(...args: Parameters<IContentClient['getBlob']>): Promise<GitBlob> {
							const result = state.blob;
							blobCalls.push(args);
							blobRequested.fire(args[3]);
							if (result instanceof Error) {
								throw result;
							}
							return result;
						}
					}(),
					dispose: () => release.dispose(),
				});
			}
		}());
		instantiation.stub(ILogService, new NullLogService());
		const provider = store.add(instantiation.createInstance(GitHubFileSystemProvider));
		return {
			provider, state, treeCalls, blobCalls, acquisitions, treeRequested, blobRequested, acquisitionRequested, invalidated,
			get releases() { return releases; },
			changeAccount: (value: IDefaultAccount | null) => {
				selectedAccount = value;
				changed.fire(value);
			},
		};
	}

	test('remains read-only and does not acquire a client until reading', async () => {
		const { provider, acquisitions } = setup();
		await assert.rejects(provider.writeFile(root, new Uint8Array(), { create: true, overwrite: true, unlock: false, atomic: false }), { code: FileSystemProviderErrorCode.NoPermissions });
		await assert.rejects(provider.mkdir(root), { code: FileSystemProviderErrorCode.NoPermissions });
		await assert.rejects(provider.delete(root, { recursive: true, useTrash: false, atomic: false }), { code: FileSystemProviderErrorCode.NoPermissions });
		await assert.rejects(provider.rename(root, root, { overwrite: true }), { code: FileSystemProviderErrorCode.NoPermissions });
		provider.watch().dispose();
		assert.deepStrictEqual({ capabilities: provider.capabilities, acquisitions: acquisitions.length }, {
			capabilities: FileSystemProviderCapabilities.Readonly | FileSystemProviderCapabilities.FileReadWrite | FileSystemProviderCapabilities.PathCaseSensitive,
			acquisitions: 0,
		});
	});

	test('shares a recursive tree across stat and readdir and synthesizes parent directories', async () => {
		const { provider, treeCalls, acquisitions } = setup();
		const results = await Promise.all([
			provider.stat(root),
			provider.readdir(root),
			provider.readdir(root.with({ path: root.path + '/src' })),
			provider.stat(root.with({ path: root.path + '/src/main.ts' })),
			provider.stat(root.with({ path: root.path + '/implicit' })),
		]);
		assert.deepStrictEqual({
			results,
			requests: treeCalls.map(([owner, repo, ref, _signal, options]) => ({ owner, repo, ref, options })),
			acquisitions: acquisitions.length,
		}, {
			results: [
				{ type: FileType.Directory, ctime: 0, mtime: 0, size: 0 },
				[['README.md', FileType.File], ['src', FileType.Directory], ['implicit', FileType.Directory]],
				[['main.ts', FileType.File]],
				{ type: FileType.File, ctime: 0, mtime: 0, size: 3 },
				{ type: FileType.Directory, ctime: 0, mtime: 0, size: 0 },
			],
			requests: [{ owner: 'owner', repo: 'repo', ref: 'HEAD', options: { query: { recursive: true }, caller: 'githubFileSystemProvider.fetchTree' } }],
			acquisitions: 1,
		});
	});

	test('passes decoded refs and reads blobs by the cached immutable SHA', async () => {
		const { provider, state, treeCalls, blobCalls } = setup();
		state.tree = { ...tree, tree: [{ path: 'src/a #%.txt', mode: '100644', type: 'blob', sha: 'pinned-blob', size: 5 }] };
		const resource = root.with({ path: `/owner/repo/${encodeURIComponent('feature/a b')}/src/${encodeURIComponent('a #%.txt')}` });
		const contents = await provider.readFile(resource);
		assert.deepStrictEqual({
			contents: VSBuffer.wrap(contents).toString(),
			ref: treeCalls[0][2],
			blob: blobCalls.map(([owner, repo, sha, _signal, options]) => ({ owner, repo, sha, options })),
			sameSignal: treeCalls[0][3] === blobCalls[0][3],
		}, {
			contents: 'hello', ref: 'feature/a b',
			blob: [{ owner: 'owner', repo: 'repo', sha: 'pinned-blob', options: { caller: 'githubFileSystemProvider.readFile' } }],
			sameSignal: true,
		});
	});

	test('decodes multiline base64 without changing binary bytes, BOM, or empty content', async () => {
		const { provider, state } = setup();
		const bytes = new Uint8Array([0xef, 0xbb, 0xbf, 0, 0xff, 0xc3, 0xa9, 10]);
		const encoded = encodeBase64(VSBuffer.wrap(bytes));
		state.blob = { ...blob, size: bytes.length, content: encoded.slice(0, 4) + '\r\n' + encoded.slice(4) + '\n' };
		const resource = root.with({ path: root.path + '/README.md' });
		const contents = await provider.readFile(resource);
		state.blob = { ...blob, size: 0, content: '' };
		assert.deepStrictEqual({ contents: [...contents], empty: [...await provider.readFile(resource)] }, { contents: [...bytes], empty: [] });
	});

	for (const { name, size, reportedSize, outcome } of [
		{ name: 'accepts exactly 10 MiB', size: 10 * 1024 * 1024, reportedSize: 10 * 1024 * 1024, outcome: 'success' },
		{ name: 'rejects an advertised 10 MiB plus one byte before downloading', size: 10 * 1024 * 1024 + 1, reportedSize: 10 * 1024 * 1024 + 1, outcome: 'preflight' },
		{ name: 'rejects an advertised 13 MiB before downloading', size: 13 * 1024 * 1024, reportedSize: 13 * 1024 * 1024, outcome: 'preflight' },
		{ name: 'rejects decoded bytes above 10 MiB despite underreported metadata', size: 10 * 1024 * 1024 + 1, reportedSize: 1, outcome: 'decoded' },
		{ name: 'retains the 16 MiB transport cap when tree size is unknown', size: 13 * 1024 * 1024, reportedSize: undefined, outcome: 'transport' },
	] as const) {
		test(`bounded blob reads: ${name}`, async () => {
			const requests: string[] = [];
			let cancelled = false;
			let responseBytes = 0;
			const transport = store.add(new GitHubTransport(async input => {
				const path = new URL(String(input)).pathname;
				requests.push(path);
				if (path === '/repos/owner/repo/git/trees/HEAD') {
					return Response.json({ ...tree, tree: [{ ...tree.tree[0], size: reportedSize }] });
				}
				assert.strictEqual(path, '/repos/owner/repo/git/blobs/readme');
				const content = encodeBase64(VSBuffer.wrap(new Uint8Array(size).fill(0xa5))).replace(/.{60}/g, '$&\n');
				const body = VSBuffer.fromString(JSON.stringify({ ...blob, size: reportedSize ?? 0, content })).buffer;
				responseBytes = body.byteLength;
				let offset = 0;
				return new Response(new ReadableStream<Uint8Array>({
					pull(controller) {
						if (offset === body.byteLength) {
							controller.close();
						} else {
							const end = Math.min(offset + 64 * 1024, body.byteLength);
							controller.enqueue(body.subarray(offset, end));
							offset = end;
						}
					},
					cancel: () => { cancelled = true; },
				}), { headers: { 'content-type': 'application/json' } });
			}));
			const client = new ContentClient(new LocalApiRequestProvider('https://api.github.com', transport));
			const { provider } = setup(client);
			const resource = root.with({ path: root.path + '/README.md' });
			const stat = await provider.stat(resource);
			if (outcome === 'success') {
				const bytes = await provider.readFile(resource);
				assert.deepStrictEqual({ length: bytes.byteLength, intact: bytes.every(byte => byte === 0xa5) }, { length: size, intact: true });
			} else {
				await assert.rejects(provider.readFile(resource), error =>
					error instanceof FileSystemProviderError
					&& error.code === FileSystemProviderErrorCode.FileTooLarge
					&& error.message.includes('Clone the repository')
					&& (outcome === 'transport' || error.message.includes('10 MiB')));
			}
			assert.deepStrictEqual({
				size: stat.size, requests, cancelled, exceedsTransportBudget: responseBytes > 16 * 1024 * 1024,
			}, {
				size: reportedSize ?? 0,
				requests: ['/repos/owner/repo/git/trees/HEAD', ...(outcome === 'preflight' ? [] : ['/repos/owner/repo/git/blobs/readme'])],
				cancelled: outcome === 'transport',
				exceedsTransportBudget: outcome === 'transport',
			});
		});
	}

	test('missing files, directory reads, and case mismatches do not request blobs', async () => {
		const { provider, blobCalls } = setup();
		await assert.rejects(provider.stat(root.with({ path: root.path + '/readme.md' })), { code: FileSystemProviderErrorCode.FileNotFound });
		await assert.rejects(provider.readFile(root.with({ path: root.path + '/missing' })), { code: FileSystemProviderErrorCode.FileNotFound });
		await assert.rejects(provider.readFile(root.with({ path: root.path + '/src' })), { code: FileSystemProviderErrorCode.FileNotFound });
		assert.deepStrictEqual(blobCalls, []);
	});

	test('refreshes the tree cache after five minutes', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const { provider, treeCalls } = setup();
		await provider.stat(root);
		await timeout(5 * 60_000 - 1);
		await provider.stat(root);
		const callsBeforeExpiry = treeCalls.length;
		await timeout(1);
		await provider.stat(root);
		await provider.stat(root);
		assert.deepStrictEqual({ callsBeforeExpiry, total: treeCalls.length }, { callsBeforeExpiry: 1, total: 2 });
	}));

	test('caches tree 404s for one minute without caching other failures', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const { provider, state, treeCalls } = setup();
		state.tree = new GitHubRequestError('Missing tree', 'notFound', 404);
		await assert.rejects(provider.stat(root), { code: FileSystemProviderErrorCode.FileNotFound });
		state.tree = tree;
		await timeout(60_000 - 1);
		await assert.rejects(provider.stat(root), { code: FileSystemProviderErrorCode.FileNotFound });
		const callsBeforeExpiry = treeCalls.length;
		await timeout(1);
		await provider.stat(root);
		assert.deepStrictEqual({ callsBeforeExpiry, total: treeCalls.length }, { callsBeforeExpiry: 1, total: 2 });
	}));

	for (const { error, code } of [
		{ error: new GitHubRequestError('Sign in required', 'authentication'), code: FileSystemProviderErrorCode.NoPermissions },
		{ error: new GitHubRequestError('Forbidden', 'authorization', 403), code: FileSystemProviderErrorCode.NoPermissions },
		{ error: new GitHubRequestError('Network failure', 'network'), code: FileSystemProviderErrorCode.Unavailable },
		{ error: new GitHubRequestError('Rate limited', 'rateLimit', 429), code: FileSystemProviderErrorCode.Unavailable },
		{ error: new SchemaError('Invalid tree response'), code: FileSystemProviderErrorCode.Unavailable },
	]) {
		test(`maps ${error.message} to a filesystem error without a negative cache entry`, async () => {
			const { provider, state, treeCalls } = setup();
			state.tree = error;
			await assert.rejects(provider.stat(root), { code });
			state.tree = tree;
			await provider.stat(root);
			assert.strictEqual(treeCalls.length, 2);
		});
	}

	test('rejects truncated trees without caching a partial filesystem', async () => {
		const { provider, state, treeCalls } = setup();
		state.tree = { ...tree, truncated: true };
		await assert.rejects(provider.readdir(root), { code: FileSystemProviderErrorCode.Unavailable });
		await assert.rejects(provider.stat(root), { code: FileSystemProviderErrorCode.Unavailable });
		state.tree = { ...tree, tree: [] };
		assert.deepStrictEqual({ entries: await provider.readdir(root), calls: treeCalls.length }, { entries: [], calls: 3 });
	});

	test('maps blob errors without poisoning a cached tree', async () => {
		const { provider, state, treeCalls } = setup();
		const resource = root.with({ path: root.path + '/README.md' });
		state.blob = new GitHubRequestError('Missing blob', 'notFound', 404);
		await assert.rejects(provider.readFile(resource), { code: FileSystemProviderErrorCode.FileNotFound });
		state.blob = { ...blob, content: 'not@base64' };
		await assert.rejects(provider.readFile(resource), { code: FileSystemProviderErrorCode.Unavailable });
		state.blob = blob;
		assert.deepStrictEqual({ contents: VSBuffer.wrap(await provider.readFile(resource)).toString(), trees: treeCalls.length }, { contents: 'hello', trees: 1 });
	});

	test('does not prompt or serve cached private data after sign-out', async () => {
		const context = setup();
		await context.provider.stat(root);
		context.changeAccount(null);
		await assert.rejects(context.provider.stat(root), { code: FileSystemProviderErrorCode.NoPermissions });
		context.changeAccount(account);
		await context.provider.stat(root);
		assert.deepStrictEqual({ trees: context.treeCalls.length, acquisitions: context.acquisitions.length, releases: context.releases }, { trees: 2, acquisitions: 3, releases: 1 });
	});

	test('does not send GitHub.com resources to the selected Enterprise account', async () => {
		const { provider, changeAccount, treeCalls } = setup();
		changeAccount({ ...account, enterprise: true, authenticationProvider: { id: 'github-enterprise', name: 'Enterprise', enterprise: true } });
		await assert.rejects(provider.readdir(root), { code: FileSystemProviderErrorCode.NoPermissions });
		assert.deepStrictEqual(treeCalls, []);
	});

	test('failed account acquisition can be retried without changing the account', async () => {
		const { provider, state, acquisitions } = setup();
		state.acquisitionError = new GitHubRequestError('No repository grant', 'authentication');
		await assert.rejects(provider.stat(root), { code: FileSystemProviderErrorCode.NoPermissions });
		state.acquisitionError = undefined;
		await provider.stat(root);
		assert.strictEqual(acquisitions.length, 2);
	});

	test('account changes and client invalidation clear positive and negative caches', async () => {
		const context = setup();
		const missing = root.with({ path: '/owner/repo/missing' });
		await context.provider.stat(root);
		context.state.tree = new GitHubRequestError('Missing tree', 'notFound', 404);
		await assert.rejects(context.provider.stat(missing), { code: FileSystemProviderErrorCode.FileNotFound });
		context.state.tree = tree;
		context.changeAccount({ ...account, sessionId: 'other' });
		await context.provider.stat(root);
		await context.provider.stat(missing);
		context.invalidated.fire();
		await context.provider.stat(root);
		assert.deepStrictEqual({ trees: context.treeCalls.length, acquisitions: context.acquisitions.length, releases: context.releases }, { trees: 5, acquisitions: 3, releases: 2 });
	});

	for (const ending of ['success', 'notFound'] as const) {
		test(`an obsolete ${ending} tree request cannot poison or remove a new account's pending fetch`, async () => {
			const context = setup();
			const first = new DeferredPromise<GitTree>();
			context.state.tree = first.p;
			const firstStarted = Event.toPromise(context.treeRequested.event);
			const obsolete = assert.rejects(context.provider.readdir(root), isCancellationError);
			const oldSignal = await firstStarted;
			context.changeAccount({ ...account, sessionId: 'other' });
			const second = new DeferredPromise<GitTree>();
			context.state.tree = second.p;
			const secondStarted = Event.toPromise(context.treeRequested.event);
			const current = context.provider.readdir(root);
			await secondStarted;
			if (ending === 'success') {
				await first.complete(tree);
			} else {
				await first.error(new GitHubRequestError('Old account cannot see the tree', 'notFound', 404));
			}
			await obsolete;
			const peer = context.provider.stat(root);
			await second.complete({ ...tree, tree: [] });
			const [entries, stat] = await Promise.all([current, peer]);
			assert.deepStrictEqual({ entries, type: stat.type, trees: context.treeCalls.length, cancelled: oldSignal.aborted }, {
				entries: [], type: FileType.Directory, trees: 2, cancelled: true,
			});
		});
	}

	for (const stage of ['tree', 'blob'] as const) {
		test(`disposal cancels an outstanding ${stage} read and prevents further requests`, async () => {
			const context = setup();
			const pendingTree = new DeferredPromise<GitTree>();
			const pendingBlob = new DeferredPromise<GitBlob>();
			if (stage === 'tree') {
				context.state.tree = pendingTree.p;
			} else {
				context.state.blob = pendingBlob.p;
			}
			const started = Event.toPromise(stage === 'tree' ? context.treeRequested.event : context.blobRequested.event);
			const rejected = assert.rejects(context.provider.readFile(root.with({ path: root.path + '/README.md' })), isCancellationError);
			const signal = await started;
			context.provider.dispose();
			await pendingTree.complete(tree);
			await pendingBlob.complete(blob);
			await rejected;
			await assert.rejects(context.provider.stat(root), isCancellationError);
			assert.deepStrictEqual({ cancelled: signal.aborted, acquisitions: context.acquisitions.length, releases: context.releases }, { cancelled: true, acquisitions: 1, releases: 1 });
		});
	}

	test('disposal releases a client that finishes acquisition late', async () => {
		const context = setup();
		const gate = new DeferredPromise<void>();
		context.state.acquisition = gate.p;
		const started = Event.toPromise(context.acquisitionRequested.event);
		const rejected = assert.rejects(context.provider.stat(root), isCancellationError);
		await started;
		context.provider.dispose();
		await gate.complete();
		await rejected;
		assert.deepStrictEqual({ trees: context.treeCalls.length, releases: context.releases }, { trees: 0, releases: 1 });
	});
});
