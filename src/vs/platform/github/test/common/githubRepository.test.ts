/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise, timeout } from '../../../../base/common/async.js';
import { encodeBase64, VSBuffer } from '../../../../base/common/buffer.js';
import { CancellationToken, CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { CancellationError } from '../../../../base/common/errors.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { IReference, toDisposable } from '../../../../base/common/lifecycle.js';
import { runWithFakedTimers } from '../../../../base/test/common/timeTravelScheduler.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NullLogService } from '../../../log/common/log.js';
import { NullTelemetryService } from '../../../telemetry/common/telemetryUtils.js';
import { GitHubService, IGitHubAnonymousClient, IGitHubService } from '../../common/githubService.js';
import { GitHubAnonymousReadOptions } from '../../common/githubTransport.js';
import { GitHubAnonymousClientOptions, GitHubRequestError } from '../../common/githubTypes.js';
import { RequestFetch } from '../../common/types.js';

class RecordingGitHubService extends GitHubService {
	readonly apiBases: string[] = [];
	readonly reads: { readonly path: string; readonly signal: AbortSignal; readonly options: GitHubAnonymousReadOptions | undefined }[] = [];
	releasedClients = 0;

	override acquireAnonymousClient(options: GitHubAnonymousClientOptions): IReference<IGitHubAnonymousClient> {
		const reference = super.acquireAnonymousClient(options);
		this.apiBases.push(options.apiBaseUri);
		const release = toDisposable(() => {
			this.releasedClients++;
			reference.dispose();
		});
		return {
			object: {
				authorization: reference.object.authorization,
				apiBaseUri: reference.object.apiBaseUri,
				get: <T>(path: string, signal: AbortSignal, options?: GitHubAnonymousReadOptions) => {
					this.reads.push({ path, signal, options });
					return reference.object.get<T>(path, signal, options);
				},
			},
			dispose: () => release.dispose(),
		};
	}
}

suite('GitHub public repository files', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const apiBaseUri = 'https://api.github.com';
	const commitSha = 'a'.repeat(40);
	const blobSha = 'b'.repeat(40);
	const path = '.devcontainer/devcontainer.json';
	const paths = ['/repos/microsoft/sample/commits/HEAD', `/repos/microsoft/sample/contents/${path}?ref=${commitSha}`];
	const content = '{ // JSONC and UTF-8\n"image":"image","name":"caf\u00e9",}';

	function file(content: string) {
		const buffer = VSBuffer.fromString(content);
		return {
			type: 'file', sha: blobSha, encoding: 'base64', size: buffer.byteLength, content: encodeBase64(buffer),
			download_url: `https://raw.githubusercontent.com/microsoft/sample/${commitSha}/${path}`,
		};
	}

	function create(fetch: RequestFetch): RecordingGitHubService {
		return store.add(new RecordingGitHubService({
			fetch,
			credentialProvider: {
				onDidChange: Event.None,
				getToken: () => { throw new Error('Public repository reads must not request credentials'); },
			},
		}, new NullLogService(), NullTelemetryService));
	}

	const read = (service: IGitHubService, token: CancellationToken = CancellationToken.None) =>
		service.repositories.readPublicFile('microsoft', 'sample', path, token);

	test('owns a stable repository domain without acquiring a client at construction', () => {
		const service = create(async () => { throw new Error('No fetch expected'); });
		const repositories = service.repositories;
		assert.deepStrictEqual({
			sameDomain: repositories === service.repositories, apiBases: service.apiBases, reads: service.reads,
		}, { sameDomain: true, apiBases: [], reads: [] });
	});

	test('rejects domain reads after the owning service is disposed', async () => {
		const service = create(async () => { throw new Error('No fetch expected'); });
		service.dispose();
		await assert.rejects(read(service), { kind: 'unknown', message: 'GitHub service was disposed' });
		assert.deepStrictEqual({ apiBases: service.apiBases, reads: service.reads }, { apiBases: [], reads: [] });
	});

	test('pins Contents to HEAD, decodes wrapped base64, and releases its anonymous lease and cancellation listener', () => runWithFakedTimers({}, async () => {
		const requests: Request[] = [];
		const token = store.add(new CancellationTokenSource());
		const startedAt = Date.now();
		const service = create(async (input, init) => {
			requests.push(new Request(input, init));
			if (requests.length === 1) {
				await timeout(10);
				return new Response(JSON.stringify({ sha: commitSha }));
			}
			const response = file(content);
			response.content = `${response.content.slice(0, 60)}\r\n${response.content.slice(60)}\n`;
			return new Response(JSON.stringify(response));
		});
		try {
			const result = await read(service, token.token);
			token.cancel();
			assert.deepStrictEqual({
				result,
				apiBases: service.apiBases,
				releasedClients: service.releasedClients,
				reads: service.reads.map(read => ({ path: read.path, options: read.options, aborted: read.signal.aborted })),
				requests: requests.map(request => ({ url: request.url, method: request.method, credentials: request.credentials, authorization: request.headers.get('authorization') })),
			}, {
				result: { commitSha, content },
				apiBases: [apiBaseUri],
				releasedClients: 1,
				reads: paths.map(path => ({ path, options: { caller: 'github.query', priority: 'interactive', deadline: startedAt + 5 * 60_000 }, aborted: false })),
				requests: paths.map(path => ({ url: `${apiBaseUri}${path}`, method: 'GET', credentials: 'omit', authorization: null })),
			});
		} finally {
			service.dispose();
		}
	}));

	for (const [name, response] of [
		['missing', undefined], ['null', null], ['array', []], ['missing SHA', {}],
		['non-string SHA', { sha: 123 }], ['short SHA', { sha: 'a'.repeat(39) }],
		['non-hex SHA', { sha: 'z'.repeat(40) }],
	] as const) {
		test(`rejects ${name} commit responses before requesting contents`, async () => {
			const service = create(async () => new Response(JSON.stringify(response)));
			await assert.rejects(read(service), { kind: 'malformedResponse' });
			assert.deepStrictEqual({ paths: service.reads.map(read => read.path), released: service.releasedClients }, { paths: [paths[0]], released: 1 });
		});
	}

	const validFile = file(content);
	for (const [name, response] of [
		['missing', undefined], ['null', null], ['directory listing', []],
		['directory', { ...validFile, type: 'dir' }],
		['symlink', { ...validFile, type: 'symlink' }],
		['unsupported encoding', { ...validFile, encoding: 'none' }],
		['missing size', { ...validFile, size: undefined }],
		['string size', { ...validFile, size: '5' }],
		['negative size', { ...validFile, size: -1 }],
		['fractional size', { ...validFile, size: 1.5 }],
		['oversized file', { ...validFile, size: 1024 * 1024 + 1 }],
		['missing content', { ...validFile, content: undefined }],
		['non-string content', { ...validFile, content: [] }],
		['truncated content', { ...validFile, content: '' }],
		['invalid base64', { ...validFile, size: 1, content: '!!!!' }],
		['noncanonical padding', { ...validFile, size: 1, content: 'YR==' }],
		['content after padding', { ...validFile, size: 3, content: 'YQ=A' }],
		['decoded size mismatch', { ...validFile, size: 2, content: 'YQ==' }],
	] as const) {
		test(`rejects ${name} file responses without following download_url`, async () => {
			const token = store.add(new CancellationTokenSource());
			const service = create(async input => new Response(JSON.stringify(String(input).endsWith('/commits/HEAD') ? { sha: commitSha } : response)));
			await assert.rejects(read(service, token.token), { kind: 'malformedResponse' });
			token.cancel();
			assert.deepStrictEqual({
				paths: service.reads.map(read => read.path), released: service.releasedClients, aborted: service.reads.map(read => read.signal.aborted),
			}, { paths, released: 1, aborted: [false, false] });
		});
	}

	for (const size of [0, 1024 * 1024]) {
		test(`accepts a file of exactly ${size} bytes`, async () => {
			const content = 'a'.repeat(size);
			const service = create(async input => new Response(JSON.stringify(String(input).endsWith('/commits/HEAD') ? { sha: commitSha } : file(content))));
			assert.deepStrictEqual(await read(service), { commitSha, content });
		});
	}

	test('propagates HTTP errors without a raw-host fallback and releases the lease', async () => {
		const service = create(async input => String(input).endsWith('/commits/HEAD')
			? new Response(JSON.stringify({ sha: commitSha }))
			: new Response('{}', { status: 404 }));
		await assert.rejects(read(service), { kind: 'notFound', statusCode: 404 });
		assert.deepStrictEqual({ paths: service.reads.map(read => read.path), released: service.releasedClients }, { paths, released: 1 });
	});

	test('cancellation before acquisition performs no reads', async () => {
		const service = create(async () => { throw new Error('No fetch expected'); });
		await assert.rejects(read(service, CancellationToken.Cancelled), CancellationError);
		assert.deepStrictEqual({ apiBases: service.apiBases, reads: service.reads, released: service.releasedClients }, { apiBases: [], reads: [], released: 0 });
	});

	for (const cancelledRead of [1, 2]) {
		test(`cancels read ${cancelledRead} and releases the lease`, async () => {
			const token = store.add(new CancellationTokenSource());
			const started = new DeferredPromise<AbortSignal>();
			let calls = 0;
			const service = create(async (_input, init) => {
				if (++calls !== cancelledRead) {
					return new Response(JSON.stringify({ sha: commitSha }));
				}
				assert.ok(init?.signal);
				const signal = init.signal;
				await started.complete(signal);
				return new Promise<Response>((_resolve, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true }));
			});
			const rejected = assert.rejects(read(service, token.token), CancellationError);
			const signal = await started.p;
			token.cancel();
			await rejected;
			assert.deepStrictEqual({ calls, aborted: signal.aborted, released: service.releasedClients }, { calls: cancelledRead, aborted: true, released: 1 });
		});
	}

	test('removes the cancellation listener when client acquisition fails', async () => {
		const cancelled = store.add(new Emitter<void>());
		const error = new GitHubRequestError('Client capacity exceeded', 'overloaded');
		const service = store.add(new class extends GitHubService {
			override acquireAnonymousClient(): IReference<IGitHubAnonymousClient> { throw error; }
		}({ fetch: async () => { throw new Error('No fetch expected'); } }, new NullLogService(), NullTelemetryService));
		await assert.rejects(read(service, { isCancellationRequested: false, onCancellationRequested: cancelled.event }), error);
		assert.strictEqual(cancelled.hasListeners(), false);
	});

	test('disposing the owning service aborts domain reads and releases the lease', async () => {
		const started = new DeferredPromise<AbortSignal>();
		const service = create(async (_input, init) => {
			assert.ok(init?.signal);
			const signal = init.signal;
			await started.complete(signal);
			return new Promise<Response>((_resolve, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true }));
		});
		const rejected = assert.rejects(read(service));
		const signal = await started.p;
		service.dispose();
		await rejected;
		assert.deepStrictEqual({ aborted: signal.aborted, released: service.releasedClients }, { aborted: true, released: 1 });
	});

	test('the second read expires at the original operation deadline', () => runWithFakedTimers({}, async () => {
		const startedAt = Date.now();
		let calls = 0;
		const service = create(async (_input, init) => {
			if (++calls === 1) {
				await timeout(60_000);
				return new Response(JSON.stringify({ sha: commitSha }));
			}
			assert.ok(init?.signal);
			const signal = init.signal;
			return new Promise<Response>((_resolve, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true }));
		});
		try {
			const rejected = assert.rejects(read(service), { kind: 'timeout' });
			await timeout(5 * 60_000);
			await rejected;
			assert.deepStrictEqual({
				calls, released: service.releasedClients, deadlines: service.reads.map(read => read.options?.deadline), elapsed: Date.now() - startedAt,
			}, { calls: 2, released: 1, deadlines: [startedAt + 5 * 60_000, startedAt + 5 * 60_000], elapsed: 5 * 60_000 });
		} finally {
			service.dispose();
		}
	}));
});
