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
import { IAuthenticationService } from '../../../../services/authentication/common/authentication.js';
import { BrowserPluginGitCommandService } from '../../browser/pluginGitCommandService.js';
import { parseGitHubCloneUrl } from '../../browser/githubTarballFetcher.js';

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

		test('downloads tarball, extracts files, and persists SHA metadata', async () => {
			const tarball = await makeGzippedTar({
				'pkg-deadbeef/README.md': 'hello\n',
				'pkg-deadbeef/src/index.js': 'console.log(1);',
			});
			requestStub.queue('GET', /\/commits\/main$/, jsonResponse(200, { sha: 'deadbeef' }));
			requestStub.queue('GET', /\/tarball\/deadbeef$/, bytesResponse(200, tarball));

			await service.cloneRepository('https://github.com/octocat/Hello-World.git', targetDir, 'main');

			const readme = await fileService.readFile(URI.joinPath(targetDir, 'README.md'));
			assert.strictEqual(readme.value.toString(), 'hello\n');
			const index = await fileService.readFile(URI.joinPath(targetDir, 'src/index.js'));
			assert.strictEqual(index.value.toString(), 'console.log(1);');

			// revParse should now answer from the persisted metadata.
			assert.strictEqual(await service.revParse(targetDir, 'HEAD'), 'deadbeef');
		});

		test('surfaces a GitHubAuthRequiredError on 401', async () => {
			requestStub.queue('GET', /\/commits\/main$/, plainResponse(401));

			await assert.rejects(
				() => service.cloneRepository('https://github.com/octocat/Private.git', targetDir, 'main'),
				/GitHubAuthRequiredError|401/,
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

		test('failed extraction leaves the previous targetDir intact', async () => {
			// First install: succeeds.
			const tarball = await makeGzippedTar({ 'pkg-sha1/keep.txt': 'preserved' });
			requestStub.queue('GET', /\/commits\/main$/, jsonResponse(200, { sha: 'sha1' }));
			requestStub.queue('GET', /\/tarball\/sha1$/, bytesResponse(200, tarball));
			await service.cloneRepository('https://github.com/octocat/Hello-World.git', targetDir, 'main');

			// Second install: corrupted tarball -> gunzip / parse throws.
			requestStub.queue('GET', /\/commits\/main$/, jsonResponse(200, { sha: 'sha2' }));
			requestStub.queue('GET', /\/tarball\/sha2$/, bytesResponse(200, new Uint8Array([0xff, 0xff, 0xff, 0xff])));

			await assert.rejects(() => service.cloneRepository('https://github.com/octocat/Hello-World.git', targetDir, 'main'));

			// Original tree still readable; cache still reports old SHA.
			const keep = await fileService.readFile(URI.joinPath(targetDir, 'keep.txt'));
			assert.strictEqual(keep.value.toString(), 'preserved');
			assert.strictEqual(await service.revParse(targetDir, 'HEAD'), 'sha1');
		});

		test('extracts archives that exercise GNU LongLink and USTAR prefix', async () => {
			const longSegment = 'a'.repeat(120); // > 100 bytes -> forces LongLink path
			const longLinkPath = `pkg-sha1/${longSegment}/file.txt`;
			const prefixPath: readonly [string, string, string] = ['pkg-sha1', 'short'.repeat(30), 'name.txt'];

			const tarball = await makeGzippedTarWithSpecial([
				{ longLink: longLinkPath, content: 'long' },
				{ prefixSplit: prefixPath, content: 'pfx' },
			]);
			requestStub.queue('GET', /\/commits\/main$/, jsonResponse(200, { sha: 'sha1' }));
			requestStub.queue('GET', /\/tarball\/sha1$/, bytesResponse(200, tarball));

			await service.cloneRepository('https://github.com/octocat/Hello-World.git', targetDir, 'main');

			const longFile = await fileService.readFile(URI.joinPath(targetDir, longSegment, 'file.txt'));
			assert.strictEqual(longFile.value.toString(), 'long');
			const prefixFile = await fileService.readFile(URI.joinPath(targetDir, prefixPath[1], prefixPath[2]));
			assert.strictEqual(prefixFile.value.toString(), 'pfx');
		});
	});

	// ---- pull ---------------------------------------------------------------

	suite('pull', () => {
		test('returns false when upstream SHA is unchanged', async () => {
			const tarball = await makeGzippedTar({ 'pkg-sha1/a.txt': 'a' });
			requestStub.queue('GET', /\/commits\/main$/, jsonResponse(200, { sha: 'sha1' }));
			requestStub.queue('GET', /\/tarball\/sha1$/, bytesResponse(200, tarball));
			await service.cloneRepository('https://github.com/octocat/Hello-World.git', targetDir, 'main');

			requestStub.queue('GET', /\/commits\/main$/, jsonResponse(200, { sha: 'sha1' }));

			assert.strictEqual(await service.pull(targetDir), false);
		});

		test('re-downloads tarball and returns true when SHA moves', async () => {
			const oldTar = await makeGzippedTar({ 'pkg-sha1/a.txt': 'old' });
			const newTar = await makeGzippedTar({ 'pkg-sha2/a.txt': 'new' });
			requestStub.queue('GET', /\/commits\/main$/, jsonResponse(200, { sha: 'sha1' }));
			requestStub.queue('GET', /\/tarball\/sha1$/, bytesResponse(200, oldTar));
			await service.cloneRepository('https://github.com/octocat/Hello-World.git', targetDir, 'main');

			requestStub.queue('GET', /\/commits\/main$/, jsonResponse(200, { sha: 'sha2' }));
			requestStub.queue('GET', /\/tarball\/sha2$/, bytesResponse(200, newTar));

			assert.strictEqual(await service.pull(targetDir), true);
			const a = await fileService.readFile(URI.joinPath(targetDir, 'a.txt'));
			assert.strictEqual(a.value.toString(), 'new');
			assert.strictEqual(await service.revParse(targetDir, 'HEAD'), 'sha2');
		});

		test('throws when called for a target with no cached metadata', async () => {
			await assert.rejects(() => service.pull(targetDir), /no cached metadata/);
		});

		test('clears stale files from a prior extraction', async () => {
			const oldTar = await makeGzippedTar({
				'pkg-sha1/keep.txt': 'k1',
				'pkg-sha1/removed.txt': 'will be deleted',
			});
			requestStub.queue('GET', /\/commits\/main$/, jsonResponse(200, { sha: 'sha1' }));
			requestStub.queue('GET', /\/tarball\/sha1$/, bytesResponse(200, oldTar));
			await service.cloneRepository('https://github.com/octocat/Hello-World.git', targetDir, 'main');

			const newTar = await makeGzippedTar({ 'pkg-sha2/keep.txt': 'k2' });
			requestStub.queue('GET', /\/commits\/main$/, jsonResponse(200, { sha: 'sha2' }));
			requestStub.queue('GET', /\/tarball\/sha2$/, bytesResponse(200, newTar));
			assert.strictEqual(await service.pull(targetDir), true);

			assert.strictEqual(await fileService.exists(URI.joinPath(targetDir, 'removed.txt')), false);
			const keep = await fileService.readFile(URI.joinPath(targetDir, 'keep.txt'));
			assert.strictEqual(keep.value.toString(), 'k2');
		});

		test('rejects path-traversal entries in the archive', async () => {
			const tarball = await makeGzippedTar({
				'pkg-sha1/safe.txt': 'safe',
				'pkg-sha1/../escaped.txt': 'evil',
			});
			requestStub.queue('GET', /\/commits\/main$/, jsonResponse(200, { sha: 'sha1' }));
			requestStub.queue('GET', /\/tarball\/sha1$/, bytesResponse(200, tarball));

			await service.cloneRepository('https://github.com/octocat/Hello-World.git', targetDir, 'main');

			// safe entry written; escaped entry was rejected and never written
			// to a sibling of `targetDir` (or anywhere outside it).
			const safe = await fileService.readFile(URI.joinPath(targetDir, 'safe.txt'));
			assert.strictEqual(safe.value.toString(), 'safe');
			const escapedSibling = URI.from({ scheme: targetDir.scheme, path: '/cache/github.com/octocat/escaped.txt' });
			assert.strictEqual(await fileService.exists(escapedSibling), false);
		});

		test('rejects backslash-traversal entries (Windows path separator)', async () => {
			const tarball = await makeGzippedTar({
				'pkg-sha1/safe.txt': 'safe',
				'pkg-sha1/..\\..\\escaped.txt': 'evil',
			});
			requestStub.queue('GET', /\/commits\/main$/, jsonResponse(200, { sha: 'sha1' }));
			requestStub.queue('GET', /\/tarball\/sha1$/, bytesResponse(200, tarball));

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
			const tarball = await makeGzippedTar({ 'pkg-sha1/a.txt': 'a' });
			requestStub.queue('GET', /\/commits\/main$/, jsonResponse(200, { sha: 'aabbccddeeff00112233445566778899aabbccdd' }));
			requestStub.queue('GET', /\/tarball\/aabbccddeeff00112233445566778899aabbccdd$/, bytesResponse(200, tarball));
			await service.cloneRepository('https://github.com/octocat/Hello-World.git', targetDir, 'main');

			// No additional queued responses — checkout to the same SHA must
			// not issue any HTTP calls.
			await service.checkout(targetDir, 'aabbccddeeff00112233445566778899aabbccdd', true);
		});

		test('re-extracts when the SHA differs', async () => {
			const oldTar = await makeGzippedTar({ 'pkg-sha1/a.txt': 'old' });
			requestStub.queue('GET', /\/commits\/main$/, jsonResponse(200, { sha: '1111111111111111111111111111111111111111' }));
			requestStub.queue('GET', /\/tarball\/1111111111111111111111111111111111111111$/, bytesResponse(200, oldTar));
			await service.cloneRepository('https://github.com/octocat/Hello-World.git', targetDir, 'main');

			const newTar = await makeGzippedTar({ 'pkg-sha2/a.txt': 'new' });
			requestStub.queue('GET', /\/tarball\/2222222222222222222222222222222222222222$/, bytesResponse(200, newTar));

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
			const tarball = await makeGzippedTar({ 'pkg-sha1/a.txt': 'a' });
			requestStub.queue('GET', /\/commits\/main$/, jsonResponse(200, { sha: 'aabbccddeeff00112233445566778899aabbccdd' }));
			requestStub.queue('GET', /\/tarball\/aabbccddeeff00112233445566778899aabbccdd$/, bytesResponse(200, tarball));
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

	queue(method: string, urlMatcher: RegExp, response: () => IRequestContext): void {
		this._queue.push({ methodMatcher: method, urlMatcher, response });
	}

	async request(options: IRequestOptions, _token: CancellationToken): Promise<IRequestContext> {
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

function bytesResponse(statusCode: number, body: Uint8Array, headers: Record<string, string> = {}): () => IRequestContext {
	return plainResponse(statusCode, VSBuffer.wrap(body), headers);
}

function jsonResponse(statusCode: number, body: unknown): () => IRequestContext {
	return plainResponse(statusCode, VSBuffer.fromString(JSON.stringify(body)));
}

/**
 * Build a gzipped tar archive containing the given path -> content mapping.
 * Uses the platform's `CompressionStream('gzip')` so the bytes round-trip
 * through the production code's `DecompressionStream`.
 */
async function makeGzippedTar(files: Record<string, string>): Promise<Uint8Array> {
	const tar = buildTar(files).slice();
	const source = new ReadableStream<Uint8Array<ArrayBuffer>>({
		start(controller) {
			controller.enqueue(tar);
			controller.close();
		},
	});
	const compressed = source.pipeThrough(new CompressionStream('gzip'));
	const out = await new Response(compressed).arrayBuffer();
	return new Uint8Array(out);
}

// Build a minimal USTAR archive matching what the production parser expects.
function buildTar(files: Record<string, string>): Uint8Array {
	return buildTarFromEntries(Object.entries(files).map(([path, content]) => ({ path, content, prefix: '' })));
}

interface ITarEntrySpec {
	readonly path: string;
	readonly content: string;
	readonly prefix: string;
	readonly typeFlag?: '0' | 'L';
}

function buildTarFromEntries(entries: readonly ITarEntrySpec[]): Uint8Array {
	const blocks: Uint8Array[] = [];
	const enc = new TextEncoder();
	for (const { path, content, prefix, typeFlag } of entries) {
		const data = enc.encode(content);
		const header = new Uint8Array(512);
		writeAscii(header, 0, path, 100);
		writeOctal(header, 100, 0o644, 8);
		writeOctal(header, 108, 0, 8);
		writeOctal(header, 116, 0, 8);
		writeOctal(header, 124, data.length, 12);
		writeOctal(header, 136, 0, 12);
		for (let i = 148; i < 156; i++) {
			header[i] = 0x20;
		}
		header[156] = (typeFlag ?? '0').charCodeAt(0);
		writeAscii(header, 257, 'ustar', 6);
		writeAscii(header, 263, '00', 2);
		writeAscii(header, 345, prefix, 155);
		let sum = 0;
		for (let i = 0; i < 512; i++) {
			sum += header[i];
		}
		writeOctal(header, 148, sum, 7);
		header[155] = 0x20;
		blocks.push(header);

		const padded = new Uint8Array(Math.ceil(data.length / 512) * 512);
		padded.set(data);
		blocks.push(padded);
	}
	blocks.push(new Uint8Array(1024));

	let totalLen = 0;
	for (const b of blocks) {
		totalLen += b.length;
	}
	const out = new Uint8Array(totalLen);
	let pos = 0;
	for (const b of blocks) {
		out.set(b, pos);
		pos += b.length;
	}
	return out;
}

interface ILongLinkSpec { readonly longLink: string; readonly content: string }
interface IPrefixSplitSpec { readonly prefixSplit: readonly [string, string, string]; readonly content: string }

async function makeGzippedTarWithSpecial(specs: readonly (ILongLinkSpec | IPrefixSplitSpec)[]): Promise<Uint8Array> {
	const entries: ITarEntrySpec[] = [];
	for (const spec of specs) {
		if ('longLink' in spec) {
			// GNU LongLink: emit a 'L'-typed entry whose payload is the
			// long path, immediately followed by a regular entry whose
			// header `name` is truncated (the parser prefers the longLink
			// payload). We use a unique placeholder in the truncated name
			// to make the test's intent explicit.
			entries.push({ path: '././@LongLink', content: spec.longLink + '\0', prefix: '', typeFlag: 'L' });
			entries.push({ path: 'truncated-by-longlink', content: spec.content, prefix: '' });
		} else {
			// USTAR prefix split: encode the path as `${prefix}/${name}`
			// in the dedicated header fields. This is the spec-compliant
			// way to express paths > 100 bytes without GNU extensions.
			const [prefixDir, midDir, name] = spec.prefixSplit;
			entries.push({ path: name, content: spec.content, prefix: `${prefixDir}/${midDir}` });
		}
	}
	const tar = buildTarFromEntries(entries).slice();
	const source = new ReadableStream<Uint8Array<ArrayBuffer>>({
		start(controller) {
			controller.enqueue(tar);
			controller.close();
		},
	});
	const compressed = source.pipeThrough(new CompressionStream('gzip'));
	const out = await new Response(compressed).arrayBuffer();
	return new Uint8Array(out);
}

function writeAscii(view: Uint8Array, offset: number, value: string, max: number): void {
	for (let i = 0; i < Math.min(value.length, max); i++) {
		view[offset + i] = value.charCodeAt(i) & 0xff;
	}
}

function writeOctal(view: Uint8Array, offset: number, value: number, length: number): void {
	const s = value.toString(8).padStart(length - 1, '0');
	for (let i = 0; i < length - 1; i++) {
		view[offset + i] = s.charCodeAt(i);
	}
	view[offset + length - 1] = 0;
}

function stubAuthenticationService(): IAuthenticationService {
	return {
		getSessions: async () => [],
	} as unknown as IAuthenticationService;
}
