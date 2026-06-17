/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { bufferToStream, VSBuffer } from '../../../../../base/common/buffer.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../../base/common/network.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { FileService } from '../../../../../platform/files/common/fileService.js';
import { InMemoryFileSystemProvider } from '../../../../../platform/files/common/inMemoryFilesystemProvider.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { IRequestContext, IRequestOptions } from '../../../../../base/parts/request/common/request.js';
import { IRequestService } from '../../../../../platform/request/common/request.js';
import { InMemoryStorageService } from '../../../../../platform/storage/common/storage.js';
import { AuthenticationSession, IAuthenticationService } from '../../../../services/authentication/common/authentication.js';
import { BrowserPluginGitCommandService } from '../../browser/pluginGitCommandService.js';
import { parseGitHubCloneUrl } from '../../browser/githubRepoFetcher.js';

suite('BrowserPluginGitCommandService', () => {

	const disposables = new DisposableStore();
	let fileService: FileService;
	let requestStub: StubRequestService;
	let storage: InMemoryStorageService;
	let service: BrowserPluginGitCommandService;

	setup(() => {
		fileService = disposables.add(new FileService(new NullLogService()));
		disposables.add(fileService.registerProvider(Schemas.inMemory, disposables.add(new InMemoryFileSystemProvider())));
		requestStub = new StubRequestService();
		storage = disposables.add(new InMemoryStorageService());
		service = new BrowserPluginGitCommandService(
			fileService,
			new NullLogService(),
			requestStub as unknown as IRequestService,
			storage,
			stubAuthenticationService(),
		);
	});

	teardown(() => disposables.clear());
	ensureNoDisposablesAreLeakedInTestSuite();

	const targetDir = URI.from({ scheme: Schemas.inMemory, path: '/cache/github.com/octocat/hello' });

	// ---- parseGitHubCloneUrl -----------------------------------------------

	suite('parseGitHubCloneUrl', () => {
		test('parses canonical github HTTPS clone URL', () => {
			assert.deepStrictEqual(parseGitHubCloneUrl('https://github.com/octocat/Hello-World.git'), { owner: 'octocat', repo: 'Hello-World' });
		});

		test('strips trailing slash and missing .git suffix', () => {
			assert.deepStrictEqual(parseGitHubCloneUrl('https://github.com/octocat/Hello-World/'), { owner: 'octocat', repo: 'Hello-World' });
			assert.deepStrictEqual(parseGitHubCloneUrl('https://github.com/octocat/Hello-World'), { owner: 'octocat', repo: 'Hello-World' });
			// Order of trim + .git strip matters: trailing slash first, then .git
			assert.deepStrictEqual(parseGitHubCloneUrl('https://github.com/octocat/Hello-World.git/'), { owner: 'octocat', repo: 'Hello-World' });
		});

		test('rejects URLs with extra path segments', () => {
			assert.strictEqual(parseGitHubCloneUrl('https://github.com/octocat/Hello-World/issues/42'), undefined);
			assert.strictEqual(parseGitHubCloneUrl('https://github.com/octocat/Hello-World/tree/main'), undefined);
		});

		test('rejects non-HTTPS, non-GitHub, and malformed URLs', () => {
			assert.strictEqual(parseGitHubCloneUrl('git@github.com:octocat/repo.git'), undefined);
			assert.strictEqual(parseGitHubCloneUrl('https://gitlab.com/octocat/repo.git'), undefined);
			assert.strictEqual(parseGitHubCloneUrl('https://github.com/octocat'), undefined);
			assert.strictEqual(parseGitHubCloneUrl('not-a-url'), undefined);
		});
	});

	// ---- cloneRepository ----------------------------------------------------

	suite('cloneRepository', () => {
		test('rejects non-GitHub clone URLs with an actionable message', async () => {
			await assert.rejects(
				() => service.cloneRepository('https://gitlab.com/foo/bar.git', targetDir),
				/can only be installed from GitHub HTTPS URLs/,
			);
		});

		test('downloads tree + blobs and persists SHA metadata', async () => {
			requestStub.queue('GET', /\/commits\/main$/, jsonResponse(200, { sha: 'deadbeef' }));
			queueRepoFetch(requestStub, 'deadbeef', {
				'README.md': 'hello\n',
				'src/index.js': 'console.log(1);',
			});

			await service.cloneRepository('https://github.com/octocat/Hello-World.git', targetDir, 'main');

			const readme = await fileService.readFile(URI.joinPath(targetDir, 'README.md'));
			assert.strictEqual(readme.value.toString(), 'hello\n');
			const index = await fileService.readFile(URI.joinPath(targetDir, 'src/index.js'));
			assert.strictEqual(index.value.toString(), 'console.log(1);');

			// revParse should now answer from the persisted metadata.
			assert.strictEqual(await service.revParse(targetDir, 'HEAD'), 'deadbeef');
		});

		test('surfaces a sign-in message on 401 when auth is unavailable', async () => {
			requestStub.queue('GET', /\/commits\/main$/, plainResponse(401));

			await assert.rejects(
				() => service.cloneRepository('https://github.com/octocat/Private.git', targetDir, 'main'),
				/Sign in to GitHub/,
			);
		});

		test('surfaces a GitHubRateLimitError on 403 with X-RateLimit-Remaining: 0', async () => {
			requestStub.queue('GET', /\/commits\/main$/, plainResponse(403, VSBuffer.fromString('rate limit'), {
				'x-ratelimit-remaining': '0',
				'retry-after': '60',
			}));

			let captured: unknown;
			try {
				await service.cloneRepository('https://github.com/octocat/Hello-World.git', targetDir, 'main');
				assert.fail('expected rejection');
			} catch (err) {
				captured = err;
			}
			assert.ok(captured instanceof Error && captured.name === 'GitHubRateLimitError', `expected GitHubRateLimitError, got ${(captured as Error)?.name}`);
		});

		test('requests GitHub auth and retries when GitHub returns 403', async () => {
			const state = { createSessionCalls: 0 };
			service = new BrowserPluginGitCommandService(
				fileService,
				new NullLogService(),
				requestStub as unknown as IRequestService,
				storage,
				stubAuthenticationService({ createdAccessToken: 'repo-token', state }),
			);

			requestStub.queue('GET', /\/commits\/main$/, plainResponse(403));
			requestStub.queue('GET', /\/commits\/main$/, jsonResponse(200, { sha: 'sha1' }));
			queueRepoFetch(requestStub, 'sha1', { 'private.txt': 'secret' });

			await service.cloneRepository('https://github.com/octocat/Private.git', targetDir, 'main');

			const file = await fileService.readFile(URI.joinPath(targetDir, 'private.txt'));
			assert.strictEqual(file.value.toString(), 'secret');
			assert.strictEqual(state.createSessionCalls, 1);
		});

		test('uses an existing signed-in GitHub session before falling back to anonymous requests', async () => {
			service = new BrowserPluginGitCommandService(
				fileService,
				new NullLogService(),
				requestStub as unknown as IRequestService,
				storage,
				stubAuthenticationService({ sessions: [createAuthenticationSession('signed-in-token')] }),
			);

			requestStub.queue('GET', /\/commits\/main$/, jsonResponse(200, { sha: 'sha1' }));
			queueRepoFetch(requestStub, 'sha1', { 'auth.txt': 'authed' });

			await service.cloneRepository('https://github.com/octocat/Private.git', targetDir, 'main');

			assert.strictEqual(requestStub.requests[0].headers?.Authorization, 'Bearer signed-in-token');
			assert.strictEqual(requestStub.requests[1].headers?.Authorization, 'Bearer signed-in-token');
			assert.strictEqual(requestStub.requests[2].headers?.Authorization, 'Bearer signed-in-token');
		});

		test('falls back to anonymous when the signed-in GitHub session is rejected', async () => {
			const state = { createSessionCalls: 0 };
			service = new BrowserPluginGitCommandService(
				fileService,
				new NullLogService(),
				requestStub as unknown as IRequestService,
				storage,
				stubAuthenticationService({ sessions: [createAuthenticationSession('sso-blocked-token')], state }),
			);

			requestStub.queue('GET', /\/commits\/main$/, plainResponse(403));
			requestStub.queue('GET', /\/commits\/main$/, jsonResponse(200, { sha: 'sha1' }));
			queueRepoFetch(requestStub, 'sha1', { 'public.txt': 'public' });

			await service.cloneRepository('https://github.com/octocat/Public.git', targetDir, 'main');

			const file = await fileService.readFile(URI.joinPath(targetDir, 'public.txt'));
			assert.strictEqual(file.value.toString(), 'public');
			assert.strictEqual(requestStub.requests[0].headers?.Authorization, 'Bearer sso-blocked-token');
			assert.strictEqual(requestStub.requests[1].headers?.Authorization, undefined);
			assert.strictEqual(requestStub.requests[2].headers?.Authorization, undefined);
			assert.strictEqual(state.createSessionCalls, 0);
		});

		test('failed extraction leaves the previous targetDir intact', async () => {
			// First install: succeeds.
			requestStub.queue('GET', /\/commits\/main$/, jsonResponse(200, { sha: 'sha1' }));
			queueRepoFetch(requestStub, 'sha1', { 'keep.txt': 'preserved' });
			await service.cloneRepository('https://github.com/octocat/Hello-World.git', targetDir, 'main');

			// Second install: tree fetch returns 500 -> aborts before touching the staged dir.
			requestStub.queue('GET', /\/commits\/main$/, jsonResponse(200, { sha: 'sha2' }));
			requestStub.queue('GET', /\/git\/trees\/sha2/, plainResponse(500, VSBuffer.fromString('boom')));

			await assert.rejects(() => service.cloneRepository('https://github.com/octocat/Hello-World.git', targetDir, 'main'));

			// Original tree still readable; cache still reports old SHA.
			const keep = await fileService.readFile(URI.joinPath(targetDir, 'keep.txt'));
			assert.strictEqual(keep.value.toString(), 'preserved');
			assert.strictEqual(await service.revParse(targetDir, 'HEAD'), 'sha1');
		});

		test('skips symlink and submodule entries', async () => {
			requestStub.queue('GET', /\/commits\/main$/, jsonResponse(200, { sha: 'sha1' }));
			requestStub.queue('GET', /\/git\/trees\/sha1/, jsonResponse(200, {
				sha: 'sha1',
				truncated: false,
				tree: [
					{ path: 'README.md', mode: '100644', type: 'blob', sha: 'b-readme', size: 3 },
					{ path: 'link.txt', mode: '120000', type: 'blob', sha: 'b-link', size: 8 },
					{ path: 'subrepo', mode: '160000', type: 'commit', sha: 'b-sub' },
				],
			}));
			requestStub.queue('GET', /\/git\/blobs\/b-readme$/, jsonResponse(200, { content: encodeBase64(new TextEncoder().encode('hi\n')), encoding: 'base64' }));

			await service.cloneRepository('https://github.com/octocat/Hello-World.git', targetDir, 'main');

			assert.strictEqual((await fileService.readFile(URI.joinPath(targetDir, 'README.md'))).value.toString(), 'hi\n');
			assert.strictEqual(await fileService.exists(URI.joinPath(targetDir, 'link.txt')), false);
			assert.strictEqual(await fileService.exists(URI.joinPath(targetDir, 'subrepo')), false);
		});
	});

	// ---- pull ---------------------------------------------------------------

	suite('pull', () => {
		test('returns false when upstream SHA is unchanged', async () => {
			requestStub.queue('GET', /\/commits\/main$/, jsonResponse(200, { sha: 'sha1' }));
			queueRepoFetch(requestStub, 'sha1', { 'a.txt': 'a' });
			await service.cloneRepository('https://github.com/octocat/Hello-World.git', targetDir, 'main');

			requestStub.queue('GET', /\/commits\/main$/, jsonResponse(200, { sha: 'sha1' }));

			assert.strictEqual(await service.pull(targetDir), false);
		});

		test('re-downloads tree and returns true when SHA moves', async () => {
			requestStub.queue('GET', /\/commits\/main$/, jsonResponse(200, { sha: 'sha1' }));
			queueRepoFetch(requestStub, 'sha1', { 'a.txt': 'old' });
			await service.cloneRepository('https://github.com/octocat/Hello-World.git', targetDir, 'main');

			requestStub.queue('GET', /\/commits\/main$/, jsonResponse(200, { sha: 'sha2' }));
			queueRepoFetch(requestStub, 'sha2', { 'a.txt': 'new' });

			assert.strictEqual(await service.pull(targetDir), true);
			const a = await fileService.readFile(URI.joinPath(targetDir, 'a.txt'));
			assert.strictEqual(a.value.toString(), 'new');
			assert.strictEqual(await service.revParse(targetDir, 'HEAD'), 'sha2');
		});

		test('throws when called for a target with no cached metadata', async () => {
			await assert.rejects(() => service.pull(targetDir), /no cached metadata/);
		});

		test('clears stale files from a prior extraction', async () => {
			requestStub.queue('GET', /\/commits\/main$/, jsonResponse(200, { sha: 'sha1' }));
			queueRepoFetch(requestStub, 'sha1', {
				'keep.txt': 'k1',
				'removed.txt': 'will be deleted',
			});
			await service.cloneRepository('https://github.com/octocat/Hello-World.git', targetDir, 'main');

			requestStub.queue('GET', /\/commits\/main$/, jsonResponse(200, { sha: 'sha2' }));
			queueRepoFetch(requestStub, 'sha2', { 'keep.txt': 'k2' });
			assert.strictEqual(await service.pull(targetDir), true);

			assert.strictEqual(await fileService.exists(URI.joinPath(targetDir, 'removed.txt')), false);
			const keep = await fileService.readFile(URI.joinPath(targetDir, 'keep.txt'));
			assert.strictEqual(keep.value.toString(), 'k2');
		});

		test('rejects path-traversal entries in the tree', async () => {
			requestStub.queue('GET', /\/commits\/main$/, jsonResponse(200, { sha: 'sha1' }));
			requestStub.queue('GET', /\/git\/trees\/sha1/, jsonResponse(200, {
				sha: 'sha1',
				truncated: false,
				tree: [
					{ path: 'safe.txt', mode: '100644', type: 'blob', sha: 'b-safe', size: 4 },
					{ path: '../escaped.txt', mode: '100644', type: 'blob', sha: 'b-escape', size: 4 },
				],
			}));
			requestStub.queue('GET', /\/git\/blobs\/b-safe$/, jsonResponse(200, { content: encodeBase64(new TextEncoder().encode('safe')), encoding: 'base64' }));

			await service.cloneRepository('https://github.com/octocat/Hello-World.git', targetDir, 'main');

			// safe entry written; escaped entry was rejected and never written
			// to a sibling of `targetDir` (or anywhere outside it).
			const safe = await fileService.readFile(URI.joinPath(targetDir, 'safe.txt'));
			assert.strictEqual(safe.value.toString(), 'safe');
			const escapedSibling = URI.from({ scheme: targetDir.scheme, path: '/cache/github.com/octocat/escaped.txt' });
			assert.strictEqual(await fileService.exists(escapedSibling), false);
		});

		test('rejects backslash-traversal entries (Windows path separator)', async () => {
			requestStub.queue('GET', /\/commits\/main$/, jsonResponse(200, { sha: 'sha1' }));
			requestStub.queue('GET', /\/git\/trees\/sha1/, jsonResponse(200, {
				sha: 'sha1',
				truncated: false,
				tree: [
					{ path: 'safe.txt', mode: '100644', type: 'blob', sha: 'b-safe', size: 4 },
					{ path: '..\\..\\escaped.txt', mode: '100644', type: 'blob', sha: 'b-escape', size: 4 },
				],
			}));
			requestStub.queue('GET', /\/git\/blobs\/b-safe$/, jsonResponse(200, { content: encodeBase64(new TextEncoder().encode('safe')), encoding: 'base64' }));

			await service.cloneRepository('https://github.com/octocat/Hello-World.git', targetDir, 'main');

			const safe = await fileService.readFile(URI.joinPath(targetDir, 'safe.txt'));
			assert.strictEqual(safe.value.toString(), 'safe');
			// The malicious entry should not have been written under any
			// reasonable interpretation of its path.
			assert.strictEqual(await fileService.exists(URI.joinPath(targetDir, '..\\..\\escaped.txt')), false);
		});
	});

	// ---- checkout -----------------------------------------------------------

	suite('checkout', () => {
		test('no-ops when the requested SHA matches the cached SHA', async () => {
			requestStub.queue('GET', /\/commits\/main$/, jsonResponse(200, { sha: 'aabbccddeeff00112233445566778899aabbccdd' }));
			queueRepoFetch(requestStub, 'aabbccddeeff00112233445566778899aabbccdd', { 'a.txt': 'a' });
			await service.cloneRepository('https://github.com/octocat/Hello-World.git', targetDir, 'main');

			// No additional queued responses — checkout to the same SHA must
			// not issue any HTTP calls.
			await service.checkout(targetDir, 'aabbccddeeff00112233445566778899aabbccdd', true);
		});

		test('re-extracts when the SHA differs', async () => {
			requestStub.queue('GET', /\/commits\/main$/, jsonResponse(200, { sha: '1111111111111111111111111111111111111111' }));
			queueRepoFetch(requestStub, '1111111111111111111111111111111111111111', { 'a.txt': 'old' });
			await service.cloneRepository('https://github.com/octocat/Hello-World.git', targetDir, 'main');

			queueRepoFetch(requestStub, '2222222222222222222222222222222222222222', { 'a.txt': 'new' });

			await service.checkout(targetDir, '2222222222222222222222222222222222222222', true);

			const a = await fileService.readFile(URI.joinPath(targetDir, 'a.txt'));
			assert.strictEqual(a.value.toString(), 'new');
			assert.strictEqual(await service.revParse(targetDir, 'HEAD'), '2222222222222222222222222222222222222222');
		});

		test('throws when called for a target with no cached metadata', async () => {
			await assert.rejects(() => service.checkout(targetDir, 'abc'), /no cached metadata/);
		});
	});

	// ---- revParse -----------------------------------------------------------

	suite('revParse', () => {
		test('throws when asked for an unrelated full SHA', async () => {
			requestStub.queue('GET', /\/commits\/main$/, jsonResponse(200, { sha: 'aabbccddeeff00112233445566778899aabbccdd' }));
			queueRepoFetch(requestStub, 'aabbccddeeff00112233445566778899aabbccdd', { 'a.txt': 'a' });
			await service.cloneRepository('https://github.com/octocat/Hello-World.git', targetDir, 'main');

			// Querying the cached SHA still works
			assert.strictEqual(await service.revParse(targetDir, 'aabbccddeeff00112233445566778899aabbccdd'), 'aabbccddeeff00112233445566778899aabbccdd');
			// Querying an unrelated SHA must not silently lie
			await assert.rejects(() => service.revParse(targetDir, '1111111111111111111111111111111111111111'), /only HEAD/);
		});
	});

	// ---- noop ops -----------------------------------------------------------

	test('fetch / fetchRepository / revListCount are inert', async () => {
		await service.fetch(targetDir);
		await service.fetchRepository(targetDir);
		assert.strictEqual(await service.revListCount(targetDir, 'HEAD', '@{u}'), 0);
	});
});

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

interface QueuedResponse {
	readonly methodMatcher: string;
	readonly urlMatcher: RegExp;
	readonly response: () => IRequestContext;
}

class StubRequestService implements Partial<IRequestService> {
	declare readonly _serviceBrand: undefined;

	private readonly _queue: QueuedResponse[] = [];
	readonly requests: IRequestOptions[] = [];

	queue(method: string, urlMatcher: RegExp, response: () => IRequestContext): void {
		this._queue.push({ methodMatcher: method, urlMatcher, response });
	}

	async request(options: IRequestOptions, _token: CancellationToken): Promise<IRequestContext> {
		this.requests.push(options);
		const url = options.url ?? '';
		const method = options.type ?? 'GET';
		const idx = this._queue.findIndex(q => q.methodMatcher === method && q.urlMatcher.test(url));
		if (idx === -1) {
			throw new Error(`No queued response for ${method} ${url}`);
		}
		const [{ response }] = this._queue.splice(idx, 1);
		return response();
	}
}

function plainResponse(statusCode: number, body: VSBuffer = VSBuffer.alloc(0), headers: Record<string, string> = {}): () => IRequestContext {
	return () => ({
		res: { statusCode, headers },
		stream: bufferToStream(body),
	});
}

function jsonResponse(statusCode: number, body: unknown): () => IRequestContext {
	return plainResponse(statusCode, VSBuffer.fromString(JSON.stringify(body)));
}

/**
 * Queue stub responses representing a recursive Git Trees fetch followed
 * by per-blob `git/blobs/{sha}` downloads for the given commit SHA and
 * file map. The order of `files` does not matter; the request stub picks
 * the first regex that matches each outgoing URL.
 */
function queueRepoFetch(stub: StubRequestService, sha: string, files: Record<string, string>): void {
	const entries = Object.entries(files);
	const tree = entries.map(([path, content], i) => ({
		path,
		mode: '100644',
		type: 'blob' as const,
		sha: `b${i}`,
		size: content.length,
	}));
	stub.queue('GET', new RegExp(`/git/trees/${escapeForRegExp(sha)}\\?recursive=1$`), jsonResponse(200, { sha, tree, truncated: false }));
	entries.forEach(([, content], i) => {
		stub.queue('GET', blobShaMatcher(tree[i].sha), jsonResponse(200, {
			content: encodeBase64(new TextEncoder().encode(content)),
			encoding: 'base64',
		}));
	});
}

function blobShaMatcher(blobSha: string): RegExp {
	return new RegExp(`/git/blobs/${escapeForRegExp(blobSha)}$`);
}

function encodeBase64(bytes: Uint8Array): string {
	let binary = '';
	for (let i = 0; i < bytes.length; i++) {
		binary += String.fromCharCode(bytes[i]);
	}
	return btoa(binary);
}

function escapeForRegExp(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

interface IStubAuthenticationServiceOptions {
	readonly sessions?: readonly AuthenticationSession[];
	readonly createdAccessToken?: string;
	readonly state?: { createSessionCalls: number };
}

function stubAuthenticationService(options: IStubAuthenticationServiceOptions = {}): IAuthenticationService {
	return {
		getSessions: async () => options.sessions ?? [],
		createSession: async () => {
			if (options.state) {
				options.state.createSessionCalls++;
			}
			if (!options.createdAccessToken) {
				throw new Error('No GitHub session available');
			}
			return { accessToken: options.createdAccessToken };
		},
	} as unknown as IAuthenticationService;
}

function createAuthenticationSession(accessToken: string, scopes: readonly string[] = []): AuthenticationSession {
	return {
		id: accessToken,
		accessToken,
		account: { label: 'octocat', id: 'octocat' },
		scopes,
	};
}
