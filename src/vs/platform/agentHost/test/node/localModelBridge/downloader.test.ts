/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { createHash } from 'crypto';
import * as fs from 'fs';
import type { AddressInfo, Socket } from 'net';
import * as os from 'os';
import { newWriteableBufferStream, VSBuffer, type VSBufferReadableStream } from '../../../../../base/common/buffer.js';
import * as path from '../../../../../base/common/path.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import type { IRequestContext, IRequestOptions } from '../../../../../base/parts/request/common/request.js';
import { NullLogService } from '../../../../log/common/log.js';
import { AbstractRequestService } from '../../../../request/common/request.js';
import { nodeRequest } from '../../../../request/node/requestService.js';
import { createLocalModelAcquisitionError, DOWNLOAD_LOCK_TYPE, findResumablePartial, isAllowedDownloadUrl, isSafeModelFileName, LocalModelDownloadError, ModelDownloader, readRemoteGgufArchitecture, readResponseText, RequestServiceHttpClient, resolveModelFilePath, toTelemetryArchitecture, type IDownloadFileSpec, type ILocalModelDownloadProgress, type ILocalModelHttpClient, type ILocalModelHttpRequest, type ILocalModelHttpResponse } from '../../../node/copilot/localModelBridge/shim/downloader.js';
import { acquireProcessLock } from '../../../node/copilot/localModelBridge/shim/processLock.js';

const MiB = 1024 * 1024;

function bytes(size: number, seed: number): Uint8Array {
	const data = new Uint8Array(size);
	for (let i = 0; i < size; i++) {
		data[i] = (i * 31 + seed) & 0xff;
	}
	return data;
}

const PRIMARY = bytes(3 * MiB + 123, 7);
const INI = new TextEncoder().encode('version = 1\n[MAI-Code-1.1-Flash]\n');
const sha = (data: Uint8Array) => createHash('sha256').update(data).digest('hex');

function spec(name: string, data: Uint8Array, sas = 'SAS1'): IDownloadFileSpec {
	return { relativePath: name, url: `https://acct.blob.core.windows.net/models/mai/${name}?sv=2024&sig=${sas}`, sizeBytes: data.byteLength, sha256: sha(data), etag: `"etag-${name}"` };
}

/** A response body that emits `data` in chunks and, with `stallAfter`, never ends. */
function chunkedBody(data: Uint8Array, stallAfter?: number): VSBufferReadableStream {
	const stream = newWriteableBufferStream();
	void (async () => {
		for (let offset = 0; offset < data.byteLength; offset += 256 * 1024) {
			if (stallAfter !== undefined && offset >= stallAfter) {
				return;
			}
			await stream.write(VSBuffer.wrap(data.subarray(offset, offset + 256 * 1024)));
		}
		stream.end();
	})();
	return stream;
}

/** A response body that emits `data` up to `failAfter` bytes, then fails like a dropped connection. */
function failingBody(data: Uint8Array, failAfter: number): VSBufferReadableStream {
	const stream = newWriteableBufferStream();
	void (async () => {
		for (let offset = 0; offset < failAfter; offset += 256 * 1024) {
			await stream.write(VSBuffer.wrap(data.subarray(offset, Math.min(offset + 256 * 1024, failAfter))));
		}
		stream.error(new Error('ECONNRESET'));
		stream.end();
	})();
	return stream;
}

interface IFakeReply {
	readonly status: number;
	readonly headers?: Record<string, string>;
	readonly body?: Uint8Array;
	readonly stallAfter?: number;
}

class FakeHttp implements ILocalModelHttpClient {
	readonly requests: ILocalModelHttpRequest[] = [];
	constructor(private readonly _reply: (request: ILocalModelHttpRequest) => IFakeReply) { }
	async request(request: ILocalModelHttpRequest): Promise<ILocalModelHttpResponse> {
		this.requests.push(request);
		const reply = this._reply(request);
		const body = chunkedBody(reply.body ?? new Uint8Array(0), reply.stallAfter);
		return fakeResponse(reply.status, reply.headers ?? {}, body);
	}
}

/** A fake response whose transport is its body. */
function fakeResponse(status: number, headers: Record<string, string>, body: VSBufferReadableStream): ILocalModelHttpResponse {
	return { status, headers, body, abort: () => body.destroy() };
}

/** Serves files by name: full bodies, `Range` requests as 206, with the file's ETag. */
function blobServer(files: Record<string, Uint8Array>, overrides: (request: ILocalModelHttpRequest, name: string) => IFakeReply | undefined = () => undefined) {
	return (request: ILocalModelHttpRequest): IFakeReply => {
		const name = decodeURIComponent(new URL(request.url).pathname.split('/').pop()!);
		const override = overrides(request, name);
		if (override) {
			return override;
		}
		const data = files[name];
		if (!data) {
			return { status: 404 };
		}
		const range = request.headers?.Range;
		if (range) {
			const start = Number(/bytes=(\d+)-/.exec(range)![1]);
			return { status: 206, headers: { 'etag': `"etag-${name}"`, 'content-range': `bytes ${start}-${data.byteLength - 1}/${data.byteLength}` }, body: data.subarray(start) };
		}
		return { status: 200, headers: { 'etag': `"etag-${name}"`, 'content-length': String(data.byteLength) }, body: data };
	};
}

suite('localModel downloader', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	let root: string;
	let familyDir: string;
	let targetDir: string;
	setup(async () => {
		root = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'vscode-local-model-download-'));
		familyDir = path.join(root, 'azureml', 'MAI-Code-1.1-Flash');
		targetDir = path.join(familyDir, '3');
	});
	teardown(async () => {
		await fs.promises.rm(root, { recursive: true, force: true });
	});

	function createDownloader(http: ILocalModelHttpClient, options: { rename?: (from: string, to: string) => Promise<void>; telemetry?: { name: string; data: unknown }[]; retryDelays?: number[]; connectTimeoutMs?: number; idleTimeoutMs?: number } = {}) {
		return new ModelDownloader({
			http,
			log: new NullLogService(),
			renameRetryDelayMs: 1,
			retryDelay: async ms => { options.retryDelays?.push(ms); },
			...(options.connectTimeoutMs !== undefined ? { connectTimeoutMs: options.connectTimeoutMs } : {}),
			...(options.idleTimeoutMs !== undefined ? { idleTimeoutMs: options.idleTimeoutMs } : {}),
			...(options.rename ? { rename: options.rename } : {}),
			...(options.telemetry ? { telemetry: { publicLog2: (name: string, data?: unknown) => options.telemetry!.push({ name, data }) } as never } : {}),
		});
	}

	async function run(downloader: ModelDownloader, files: readonly IDownloadFileSpec[], options: { signal?: AbortSignal; renewFiles?: () => Promise<readonly IDownloadFileSpec[]>; onProgress?: (p: ILocalModelDownloadProgress) => void } = {}) {
		try {
			return await downloader.download({ modelId: 'azureml://registries/azureml/models/MAI-Code-1.1-Flash/versions/3', targetDir, familyDir, files, signal: options.signal ?? new AbortController().signal, renewFiles: options.renewFiles, onProgress: options.onProgress, registry: 'azureml' });
		} catch (error) {
			return error instanceof LocalModelDownloadError ? error.code : String(error);
		}
	}

	/** Whether nothing holds the family's download lock. */
	async function lockIsFree(): Promise<boolean> {
		const lock = await acquireProcessLock(familyDir, DOWNLOAD_LOCK_TYPE);
		if (typeof lock === 'string') {
			return false;
		}
		lock.dispose();
		return true;
	}

	async function listDir(dir: string): Promise<string[]> {
		try {
			return (await fs.promises.readdir(dir)).sort();
		} catch {
			return [];
		}
	}

	async function fileMatches(name: string, data: Uint8Array): Promise<boolean> {
		try {
			return sha(await fs.promises.readFile(path.join(targetDir, name))) === sha(data);
		} catch {
			return false;
		}
	}

	async function writePartial(name: string, data: Uint8Array, etag = `"etag-${name}"`): Promise<void> {
		await fs.promises.mkdir(targetDir, { recursive: true });
		await fs.promises.writeFile(path.join(targetDir, `${name}.vscode.partial`), data.subarray(0, MiB));
		await fs.promises.writeFile(path.join(targetDir, `${name}.vscode.partial.json`), JSON.stringify({ modelId: 'azureml://registries/azureml/models/MAI-Code-1.1-Flash/versions/3', totalBytes: data.byteLength, sha256: sha(data), etag }));
	}

	test('fresh download: sequential, verified, placed; sidecars and lock removed; progress phases; telemetry', async () => {
		const http = new FakeHttp(blobServer({ 'model.gguf': PRIMARY, 'llama-default.ini': INI }));
		const telemetry: { name: string; data: unknown }[] = [];
		const phases = new Set<string>();
		const result = await run(createDownloader(http, { telemetry }), [spec('model.gguf', PRIMARY), spec('llama-default.ini', INI)], { onProgress: p => phases.add(p.phase) });
		const event = telemetry[0]?.data as Record<string, unknown>;
		assert.deepStrictEqual({
			result,
			files: await listDir(targetDir),
			familyFiles: await listDir(familyDir),
			primary: await fileMatches('model.gguf', PRIMARY),
			requests: http.requests.map(r => [r.method, new URL(r.url).pathname, r.headers?.Range, r.headers?.['Accept-Encoding']]),
			phases: [...phases].sort(),
			telemetry: [telemetry[0]?.name, event?.phase, event?.outcome, event?.registry, event?.totalBytes, event?.sasRefreshes],
		}, {
			result: { downloadedBytes: PRIMARY.byteLength + INI.byteLength, reusedFiles: [], resumed: false, sasRenewals: 0 },
			files: ['llama-default.ini', 'model.gguf'],
			familyFiles: ['3'],
			primary: true,
			// `identity`: a storage endpoint may gzip small blobs otherwise, dropping Content-Length and weakening the ETag.
			requests: [['GET', '/models/mai/model.gguf', undefined, 'identity'], ['GET', '/models/mai/llama-default.ini', undefined, 'identity']],
			phases: ['downloading', 'placing', 'verifying'],
			telemetry: ['localModel.setup', 'download', 'success', 'azureml', PRIMARY.byteLength + INI.byteLength, 0],
		});
	});

	test('resumes with Range + If-Match against a matching sidecar (206)', async () => {
		await writePartial('model.gguf', PRIMARY);
		const http = new FakeHttp(blobServer({ 'model.gguf': PRIMARY }));
		const result = await run(createDownloader(http), [spec('model.gguf', PRIMARY)]);
		assert.deepStrictEqual({
			result,
			headers: http.requests[0].headers,
			primary: await fileMatches('model.gguf', PRIMARY),
			files: await listDir(targetDir),
		}, {
			result: { downloadedBytes: PRIMARY.byteLength - MiB, reusedFiles: [], resumed: true, sasRenewals: 0 },
			headers: { 'Accept-Encoding': 'identity', 'Range': `bytes=${MiB}-`, 'If-Match': '"etag-model.gguf"' },
			primary: true,
			files: ['model.gguf'],
		});
	});

	test('a changed ETag resets the partial file (identityChanged); a mismatched sidecar restarts from zero', async () => {
		await writePartial('model.gguf', PRIMARY);
		const changed = await run(createDownloader(new FakeHttp(blobServer({ 'model.gguf': PRIMARY }, () => ({ status: 412 })))), [spec('model.gguf', PRIMARY)]);
		const afterChange = await listDir(targetDir);
		await writePartial('model.gguf', PRIMARY);
		const etagMismatch = await run(createDownloader(new FakeHttp(blobServer({ 'model.gguf': PRIMARY }, request => request.headers?.Range ? { status: 206, headers: { etag: '"etag-new"', 'content-range': `bytes ${MiB}-${PRIMARY.byteLength - 1}/${PRIMARY.byteLength}` }, body: PRIMARY.subarray(MiB) } : undefined))), [spec('model.gguf', PRIMARY)]);
		await writePartial('model.gguf', PRIMARY, '"etag-old-sidecar"');
		const restartHttp = new FakeHttp(blobServer({ 'model.gguf': PRIMARY }));
		const restarted = await run(createDownloader(restartHttp), [spec('model.gguf', PRIMARY)]);
		assert.deepStrictEqual({
			changed, afterChange, etagMismatch,
			restarted: [typeof restarted === 'object' ? restarted.resumed : restarted, restartHttp.requests[0].headers?.Range],
		}, {
			changed: 'identityChanged', afterChange: [], etagMismatch: 'identityChanged',
			restarted: [false, undefined],
		});
	});

	test('SAS 403 re-resolves (at most twice) with unchanged identity', async () => {
		const files = { 'model.gguf': PRIMARY };
		const expiredFirst = new FakeHttp(blobServer(files, request => request.url.includes('sig=SAS1') ? { status: 403 } : undefined));
		const renewed = await run(createDownloader(expiredFirst), [spec('model.gguf', PRIMARY)], { renewFiles: async () => [spec('model.gguf', PRIMARY, 'SAS2')] });
		await fs.promises.rm(targetDir, { recursive: true, force: true });
		const alwaysExpired = await run(createDownloader(new FakeHttp(blobServer(files, () => ({ status: 403 })))), [spec('model.gguf', PRIMARY)], { renewFiles: async () => [spec('model.gguf', PRIMARY, 'SAS2')] });
		const identityChanged = await run(createDownloader(new FakeHttp(blobServer(files, () => ({ status: 401 })))), [spec('model.gguf', PRIMARY)], { renewFiles: async () => [{ ...spec('model.gguf', PRIMARY, 'SAS2'), sha256: 'f'.repeat(64) }] });
		await fs.promises.rm(targetDir, { recursive: true, force: true });
		const noRenewal = await run(createDownloader(new FakeHttp(blobServer(files, () => ({ status: 403 })))), [spec('model.gguf', PRIMARY)]);
		assert.deepStrictEqual({
			renewed: typeof renewed === 'object' ? renewed.sasRenewals : renewed,
			urls: expiredFirst.requests.map(r => new URL(r.url).searchParams.get('sig')),
			alwaysExpired, identityChanged, noRenewal,
		}, {
			renewed: 1,
			urls: ['SAS1', 'SAS2'],
			alwaysExpired: 'accessExpired', identityChanged: 'identityChanged', noRenewal: 'accessExpired',
		});
	});

	test('transient failures retry from the partial file with backoff (a stall, a dropped connection, HTTP 503, a connect timeout); progress resets the count; a weak ETag is never sent as If-Match', async () => {
		const weak = { ...spec('model.gguf', PRIMARY), etag: 'W/"etag-model.gguf"' };
		const size = PRIMARY.byteLength;
		const ranged = (request: ILocalModelHttpRequest, body: VSBufferReadableStream): ILocalModelHttpResponse => {
			const start = Number(/bytes=(\d+)-/.exec(request.headers?.Range ?? '')?.[1] ?? 0);
			return fakeResponse(206, { 'etag': 'W/"etag-model.gguf"', 'content-range': `bytes ${start}-${size - 1}/${size}` }, body);
		};
		const startOf = (request: ILocalModelHttpRequest) => Number(/bytes=(\d+)-/.exec(request.headers?.Range ?? '')?.[1] ?? 0);
		const script: ((request: ILocalModelHttpRequest) => Promise<ILocalModelHttpResponse>)[] = [
			// Stalls after 1 MiB: the idle timeout ends it.
			async () => fakeResponse(200, { 'etag': 'W/"etag-model.gguf"', 'content-length': String(size) }, chunkedBody(PRIMARY, MiB)),
			// The connection drops after another 512 KiB.
			async request => ranged(request, failingBody(PRIMARY.subarray(startOf(request)), 512 * 1024)),
			async () => fakeResponse(503, {}, chunkedBody(new Uint8Array(0))),
			// Never answers: the connect timeout ends it.
			() => new Promise<ILocalModelHttpResponse>(() => { }),
			async request => ranged(request, chunkedBody(PRIMARY.subarray(startOf(request)))),
		];
		const requests: ILocalModelHttpRequest[] = [];
		const http: ILocalModelHttpClient = { request: async request => { requests.push(request); return script.shift()!(request); } };
		const retryDelays: number[] = [];
		const result = await run(createDownloader(http, { retryDelays, idleTimeoutMs: 200, connectTimeoutMs: 100 }), [weak]);
		const starts = requests.map(startOf);
		assert.deepStrictEqual({
			result,
			primary: await fileMatches('model.gguf', PRIMARY),
			files: await listDir(targetDir),
			ifMatch: requests.map(request => request.headers?.['If-Match'] ?? null),
			rangesResume: starts.slice(1).every((start, index) => start > 0 && start >= starts[index]),
			retryDelays,
		}, {
			result: { downloadedBytes: size, reusedFiles: [], resumed: false, sasRenewals: 0 },
			primary: true,
			files: ['model.gguf'],
			ifMatch: [null, null, null, null, null],
			rangesResume: true,
			// The stall and the drop each wrote bytes (a new run of failures); 503 and the timeout did not.
			retryDelays: [1000, 1000, 2000, 4000],
		});
	});

	test('after 8 consecutive transient failures without progress the download pauses with network and keeps the partial for Retry; a strong ETag is sent as If-Match', async () => {
		await writePartial('model.gguf', PRIMARY);
		const retryDelays: number[] = [];
		const http = new FakeHttp(blobServer({ 'model.gguf': PRIMARY }, () => ({ status: 503 })));
		const result = await run(createDownloader(http, { retryDelays }), [spec('model.gguf', PRIMARY)]);
		assert.deepStrictEqual({ result, attempts: http.requests.length, ifMatch: [...new Set(http.requests.map(request => request.headers?.['If-Match']))], retryDelays, files: await listDir(targetDir) }, {
			result: 'network',
			attempts: 8,
			ifMatch: ['"etag-model.gguf"'],
			retryDelays: [1000, 2000, 4000, 8000, 16000, 30000, 30000],
			files: ['model.gguf.vscode.partial', 'model.gguf.vscode.partial.json'],
		});
	});

	test('a stalled or cancelled transfer closes its connection before the retry or the cancellation completes (RequestServiceHttpClient over nodeRequest, a real local server)', async () => {
		const size = PRIMARY.byteLength;
		const etag = '"etag-model.gguf"';
		const requestSockets: Socket[] = [];
		const { createServer } = await import('http');
		const server = createServer((req, res) => {
			requestSockets.push(req.socket);
			const range = req.headers.range;
			if (requestSockets.length === 1 || requestSockets.length === 3) {
				// The first attempt of each download sends 1 MiB, then stalls and never ends.
				res.writeHead(200, { etag, 'content-length': String(size) });
				res.write(PRIMARY.subarray(0, MiB));
				return;
			}
			const start = Number(/bytes=(\d+)-/.exec(range ?? '')?.[1] ?? 0);
			res.writeHead(start > 0 ? 206 : 200, { etag, 'content-length': String(size - start), ...(start > 0 ? { 'content-range': `bytes ${start}-${size - 1}/${size}` } : {}) });
			res.end(PRIMARY.subarray(start));
		});
		await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
		const port = (server.address() as AddressInfo).port;
		const transport = new RequestServiceHttpClient({ request: (options, token) => nodeRequest(options, token) });
		// The download URL policy admits only Azure blob hosts: the requests go to the local server instead.
		const local: ILocalModelHttpClient = { request: (request, signal) => transport.request({ ...request, url: `http://127.0.0.1:${port}${new URL(request.url).pathname}` }, signal) };
		/** Whether the server sees the connection close within 2 s. */
		const closes = (socket: Socket) => new Promise<boolean>(resolve => {
			if (socket.destroyed) {
				resolve(true);
				return;
			}
			const timer = setTimeout(() => resolve(false), 2000);
			socket.once('close', () => {
				clearTimeout(timer);
				resolve(true);
			});
		});
		try {
			const closedBeforeRetry: boolean[] = [];
			const stalled = await run(new ModelDownloader({ http: local, log: new NullLogService(), renameRetryDelayMs: 1, idleTimeoutMs: 200, retryDelay: async () => { closedBeforeRetry.push(await closes(requestSockets[0])); } }), [spec('model.gguf', PRIMARY)]);
			const stalledFile = await fileMatches('model.gguf', PRIMARY);
			await fs.promises.rm(targetDir, { recursive: true, force: true });
			const cancellation = new AbortController();
			const cancelled = await run(new ModelDownloader({ http: local, log: new NullLogService(), renameRetryDelayMs: 1 }), [spec('model.gguf', PRIMARY)], {
				signal: cancellation.signal,
				onProgress: progress => {
					if (progress.phase === 'downloading' && progress.completedBytes > 0) {
						cancellation.abort();
					}
				},
			});
			assert.deepStrictEqual({
				stalled: typeof stalled === 'object' ? stalled.downloadedBytes : stalled,
				stalledFile,
				closedBeforeRetry,
				cancelled,
				cancelledClosed: await closes(requestSockets[2]),
				requests: requestSockets.length,
			}, {
				stalled: size,
				stalledFile: true,
				// Without a transport-level abort, the stalled request kept its connection while the retry opened another.
				closedBeforeRetry: [true],
				cancelled: 'cancelled',
				cancelledClosed: true,
				requests: 3,
			});
		} finally {
			server.closeAllConnections();
			await new Promise(resolve => server.close(resolve));
		}
	});

	test('an error buffered before the body is consumed (a reset right after the headers) reaches the consumer: readResponseText rejects, the download retries at once', async () => {
		const size = PRIMARY.byteLength;
		const etag = '"etag-model.gguf"';
		/** Data and a connection reset, both buffered before anyone listens (a reset ends a body without `end`). */
		const resetBody = (data: Uint8Array) => {
			const stream = newWriteableBufferStream();
			void stream.write(VSBuffer.wrap(data));
			stream.error(new Error('connection reset'));
			return stream;
		};
		const within = async <T>(promise: Promise<T>, ms: number): Promise<T | 'still pending'> => {
			let timer: ReturnType<typeof setTimeout> | undefined;
			try {
				return await Promise.race([promise, new Promise<'still pending'>(resolve => { timer = setTimeout(() => resolve('still pending'), ms); })]);
			} finally {
				clearTimeout(timer);
			}
		};
		let resetServed = false;
		const transport = new RequestServiceHttpClient({
			request: async (options: IRequestOptions): Promise<IRequestContext> => {
				if (options.url?.endsWith('/catalog.json')) {
					return { res: { statusCode: 200, headers: {} }, stream: resetBody(new TextEncoder().encode('{"value":')) };
				}
				const start = Number(/bytes=(\d+)-/.exec(String(options.headers?.Range ?? ''))?.[1] ?? 0);
				if (!resetServed) {
					resetServed = true;
					return { res: { statusCode: 200, headers: { etag, 'content-length': String(size) } }, stream: resetBody(PRIMARY.subarray(0, MiB)) };
				}
				return start > 0
					? { res: { statusCode: 206, headers: { etag, 'content-range': `bytes ${start}-${size - 1}/${size}` } }, stream: chunkedBody(PRIMARY.subarray(start)) }
					: { res: { statusCode: 200, headers: { etag, 'content-length': String(size) } }, stream: chunkedBody(PRIMARY) };
			},
		});
		const catalogResponse = await transport.request({ url: 'https://acct.blob.core.windows.net/models/catalog.json', method: 'GET' }, new AbortController().signal);
		const text = await within(readResponseText(catalogResponse, 1024).then(value => `resolved: ${value}`, (error: Error) => `rejected: ${error.message}`), 1000);
		// The idle timeout (60 s) would end a swallowed error too, but much later: only an error that reaches the consumer retries at once.
		const cancellation = new AbortController();
		const retryDelays: number[] = [];
		const download = await within(run(createDownloader(transport, { retryDelays }), [spec('model.gguf', PRIMARY)], { signal: cancellation.signal }), 3000);
		if (download === 'still pending') {
			cancellation.abort();
		}
		assert.deepStrictEqual({
			text,
			download: typeof download === 'object' ? download.downloadedBytes : download,
			retryDelays,
			primary: await fileMatches('model.gguf', PRIMARY),
		}, {
			text: 'rejected: connection reset',
			download: size,
			retryDelays: [1000],
			primary: true,
		});
	});

	test('SHA-256 mismatch discards the file (integrity); missing checksum and URL policy are rejected', async () => {
		const corrupted = bytes(PRIMARY.byteLength, 99);
		const integrity = await run(createDownloader(new FakeHttp(blobServer({ 'model.gguf': corrupted }))), [spec('model.gguf', PRIMARY)]);
		const afterIntegrity = await listDir(targetDir);
		const redirectHttp = new FakeHttp(blobServer({ 'model.gguf': PRIMARY }, request => request.url.includes('acct.blob') ? { status: 302, headers: { location: 'https://evil.example.com/model.gguf' } } : undefined));
		assert.deepStrictEqual({
			integrity,
			afterIntegrity,
			noChecksum: await run(createDownloader(new FakeHttp(blobServer({}))), [{ ...spec('model.gguf', PRIMARY), sha256: 'abc' }]),
			httpUrl: await run(createDownloader(new FakeHttp(blobServer({}))), [{ ...spec('model.gguf', PRIMARY), url: 'http://acct.blob.core.windows.net/m/model.gguf?sig=x' }]),
			redirectToOtherHost: await run(createDownloader(redirectHttp), [spec('model.gguf', PRIMARY)]),
			policy: ['https://a.blob.core.windows.net/c/f', 'https://eastus.api.azureml.ms/x', 'https://a.blob.core.windows.net:8443/c/f', 'https://user:pw@a.blob.core.windows.net/c', 'https://blob.core.windows.net.evil.com/c', 'https://a.blob.core.windows.net/c#frag', 'https://acct.api.azureml.ms.evil.com/c/f'].map(isAllowedDownloadUrl),
		}, {
			integrity: 'integrity',
			afterIntegrity: [],
			noChecksum: 'noChecksum',
			httpUrl: 'urlPolicy',
			redirectToOtherHost: 'urlPolicy',
			policy: [true, true, false, false, false, false, false],
		});
	});

	test('file names: one validator for every registry name; traversal, device and malformed names are rejected before the disk is touched', async () => {
		const modelId = 'azureml://registries/azureml/models/MAI-Code-1.1-Flash/versions/3';
		// What `..\..\..\outside.gguf` would reach from the version directory, with a matching partial and sidecar planted there.
		const outside = path.join(root, 'outside.gguf');
		const traversal = spec('..\\..\\..\\outside.gguf', PRIMARY);
		await fs.promises.writeFile(`${outside}.vscode.partial`, PRIMARY.subarray(0, 1024));
		await fs.promises.writeFile(`${outside}.vscode.partial.json`, JSON.stringify({ modelId, totalBytes: traversal.sizeBytes, sha256: traversal.sha256, etag: traversal.etag }));
		const names = ['MAI-Code-1.1-Flash-Q2-XS.gguf', 'llama-config.json', 'model v2.gguf', '..\\..\\..\\outside.gguf', '..\\outside.gguf', '../outside.gguf', 'sub\\model.gguf', 'C:outside.gguf', 'C:\\outside.gguf', 'NUL.gguf', 'com1', 'COM\u00b9.gguf', 'model..gguf', '.hidden.gguf', 'model.gguf.', ' model.gguf', 'model.gguf ', 'model\u0001.gguf', 'model?sig=x.gguf', 'model&sv=2024&sig=SECRET&suffix=.gguf', 'x'.repeat(196) + '.gguf', ''];
		const http = new FakeHttp(blobServer({ 'outside.gguf': PRIMARY }));
		const downloads: string[] = [];
		for (const name of ['..\\..\\..\\outside.gguf', 'NUL.gguf', 'model.gguf.']) {
			downloads.push(await run(createDownloader(http), [spec(name, PRIMARY)]).then(result => typeof result === 'string' ? result : 'downloaded'));
		}
		assert.deepStrictEqual({
			valid: names.map(name => isSafeModelFileName(name)),
			contained: ['model.gguf', '..\\..\\..\\outside.gguf', 'C:\\outside.gguf'].map(name => resolveModelFilePath(targetDir, name) ?? null),
			downloads,
			requests: http.requests.length,
			outsideFinal: fs.existsSync(outside),
			partialOutside: await findResumablePartial(targetDir, modelId, traversal),
		}, {
			valid: [true, true, true, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false],
			contained: [path.join(targetDir, 'model.gguf'), null, null],
			downloads: ['integrity', 'integrity', 'integrity'],
			requests: 0,
			outsideFinal: false,
			partialOutside: undefined,
		});
	});

	test('cancel is immediate in every phase and keeps the partial file for resume', async () => {
		const preAborted = new AbortController();
		preAborted.abort();
		const beforeStart = await run(createDownloader(new FakeHttp(blobServer({ 'model.gguf': PRIMARY }))), [spec('model.gguf', PRIMARY)], { signal: preAborted.signal });

		const transfer = new AbortController();
		const transferHttp = new FakeHttp(blobServer({}, () => ({ status: 200, headers: { etag: '"etag-model.gguf"' }, body: PRIMARY, stallAfter: MiB })));
		const transferPromise = run(createDownloader(transferHttp), [spec('model.gguf', PRIMARY)], { signal: transfer.signal, onProgress: p => p.completedBytes > 0 && transfer.abort() });
		const duringTransfer = await transferPromise;
		const afterTransfer = await listDir(targetDir);

		const verify = new AbortController();
		const duringVerify = await run(createDownloader(new FakeHttp(blobServer({ 'model.gguf': PRIMARY }))), [spec('model.gguf', PRIMARY)], { signal: verify.signal, onProgress: p => p.phase === 'verifying' && verify.abort() });
		const afterVerify = await listDir(targetDir);

		const place = new AbortController();
		const busyRename = async () => { throw Object.assign(new Error('busy'), { code: 'EBUSY' }); };
		const duringPlace = await run(createDownloader(new FakeHttp(blobServer({ 'model.gguf': PRIMARY })), { rename: busyRename }), [spec('model.gguf', PRIMARY)], { signal: place.signal, onProgress: p => p.phase === 'placing' && place.abort() });
		assert.deepStrictEqual({
			beforeStart, duringTransfer, afterTransfer, duringVerify, afterVerify, duringPlace,
			lockReleased: await lockIsFree(),
		}, {
			beforeStart: 'cancelled',
			duringTransfer: 'cancelled',
			afterTransfer: ['model.gguf.vscode.partial', 'model.gguf.vscode.partial.json'],
			duringVerify: 'cancelled',
			afterVerify: ['model.gguf.vscode.partial', 'model.gguf.vscode.partial.json'],
			duringPlace: 'cancelled',
			lockReleased: true,
		});
	});

	test('download diagnostics: the request service logs only hosts and statuses (logUrl: false), the downloader only byte counts and codes', async () => {
		const log = new RecordingLogService();
		const reply = blobServer({ 'model.gguf': PRIMARY, 'llama-default.ini': INI }, (_request, name) => name === 'broken.gguf' ? { status: 500, headers: { etag: '"etag-broken.gguf"' } } : undefined);
		const requestService = new class extends AbstractRequestService {
			async request(options: IRequestOptions): Promise<IRequestContext> {
				return this.logAndRequest(options, async () => {
					const fake = reply({ url: options.url ?? '', method: 'GET', headers: options.headers as Record<string, string> | undefined });
					return { res: { statusCode: fake.status, headers: fake.headers ?? {} }, stream: chunkedBody(fake.body ?? new Uint8Array(0)) };
				});
			}
			async resolveProxy(): Promise<string | undefined> { return undefined; }
			async lookupAuthorization(): Promise<undefined> { return undefined; }
			async lookupKerberosAuthorization(): Promise<string | undefined> { return undefined; }
			async loadCertificates(): Promise<string[]> { return []; }
		}(log);
		try {
			await fs.promises.mkdir(targetDir, { recursive: true });
			await fs.promises.writeFile(path.join(targetDir, 'llama-default.ini'), INI);
			const downloader = new ModelDownloader({ http: new RequestServiceHttpClient(requestService), log, renameRetryDelayMs: 1, retryDelay: async () => { } });
			const downloaded = await run(downloader, [spec('model.gguf', PRIMARY), spec('llama-default.ini', INI)]);
			const failed = await run(downloader, [spec('broken.gguf', PRIMARY)]);
			// An HTTP 500 is transient: 8 attempts, the retries logged with byte counts only.
			const failedAttempts = Array.from({ length: 8 }, (_, attempt) => [
				`#${attempt + 2}: acct.blob.core.windows.net - begin GET`,
				`#${attempt + 2}: acct.blob.core.windows.net - end GET 500`,
				...(attempt < 7 ? [`[LocalModelDownloader] The transfer was interrupted after 0 of ${PRIMARY.byteLength} bytes; retrying (${attempt + 1}/7) in ${Math.min(30_000, 1000 * 2 ** attempt)} ms`] : []),
			]).flat();
			assert.deepStrictEqual({ downloaded: typeof downloaded === 'object' ? downloaded.reusedFiles : downloaded, failed, logged: log.messages }, {
				downloaded: ['llama-default.ini'],
				failed: 'network',
				logged: [
					'#1: acct.blob.core.windows.net - begin GET',
					'#1: acct.blob.core.windows.net - end GET 200',
					`[LocalModelDownloader] Reusing a verified file (${INI.byteLength} bytes)`,
					...failedAttempts,
				],
			});
		} finally {
			requestService.dispose();
		}
	});

	test('rename retries for antivirus locks; verified final copies are reused', async () => {
		let attempts = 0;
		const flakyRename = async (from: string, to: string) => {
			if (++attempts < 3) {
				throw Object.assign(new Error('busy'), { code: 'EPERM' });
			}
			await fs.promises.rename(from, to);
		};
		const placed = await run(createDownloader(new FakeHttp(blobServer({ 'model.gguf': PRIMARY })), { rename: flakyRename }), [spec('model.gguf', PRIMARY)]);
		const reuseHttp = new FakeHttp(blobServer({ 'model.gguf': PRIMARY, 'llama-default.ini': INI }));
		const reused = await run(createDownloader(reuseHttp), [spec('model.gguf', PRIMARY), spec('llama-default.ini', INI)]);
		assert.deepStrictEqual({
			placed: typeof placed === 'object' ? placed.downloadedBytes : placed,
			attempts,
			reused: typeof reused === 'object' ? reused.reusedFiles : reused,
			reuseRequests: reuseHttp.requests.map(r => new URL(r.url).pathname),
		}, {
			placed: PRIMARY.byteLength,
			attempts: 3,
			reused: ['model.gguf'],
			reuseRequests: ['/models/mai/llama-default.ini'],
		});
	});

	test('a lock held elsewhere fails with lockedElsewhere and touches nothing', async () => {
		await fs.promises.mkdir(familyDir, { recursive: true });
		const holder = await acquireProcessLock(familyDir, DOWNLOAD_LOCK_TYPE);
		const http = new FakeHttp(blobServer({ 'model.gguf': PRIMARY }));
		const blocked = await run(createDownloader(http), [spec('model.gguf', PRIMARY)]);
		if (typeof holder !== 'string') {
			holder.dispose();
		}
		const afterRelease = await run(createDownloader(new FakeHttp(blobServer({ 'model.gguf': PRIMARY }))), [spec('model.gguf', PRIMARY)]);
		assert.deepStrictEqual({
			blocked,
			requests: http.requests.length,
			afterRelease: typeof afterRelease === 'object' ? afterRelease.downloadedBytes : afterRelease,
			message: createLocalModelAcquisitionError('lockedElsewhere', 'Example Flash 1.0'),
		}, {
			blocked: 'lockedElsewhere',
			requests: 0,
			afterRelease: PRIMARY.byteLength,
			message: { code: 'lockedElsewhere', message: 'Example Flash 1.0 is downloading in another VS Code window.', actions: ['retry'] },
		});
	});

	test('a stale lock (macOS: a socket file nobody answers on) fails with staleLock and Retry; only clearStaleLock removes it', async () => {
		const steps: string[] = [];
		let stale = true;
		const downloader = new ModelDownloader({
			http: new FakeHttp(blobServer({ 'model.gguf': PRIMARY })),
			log: new NullLogService(),
			lockOptions: {
				platform: 'darwin',
				listen: async () => {
					steps.push('listen');
					return stale ? undefined : { dispose: () => steps.push('release') };
				},
				probe: async () => {
					steps.push('probe');
					return stale ? 'ECONNREFUSED' : undefined;
				},
				unlink: async () => {
					steps.push('unlink');
					stale = false;
				},
			},
		});
		const first = await run(downloader, [spec('model.gguf', PRIMARY)]);
		const again = await run(downloader, [spec('model.gguf', PRIMARY)]);
		const cleared = await downloader.clearStaleLock(familyDir);
		const afterClear = await run(downloader, [spec('model.gguf', PRIMARY)]);
		assert.deepStrictEqual({
			first,
			again,
			cleared,
			afterClear: typeof afterClear === 'object' ? afterClear.downloadedBytes : afterClear,
			steps,
			message: createLocalModelAcquisitionError('staleLock', 'Example Flash 1.0'),
		}, {
			first: 'staleLock',
			again: 'staleLock',
			cleared: true,
			afterClear: PRIMARY.byteLength,
			steps: ['listen', 'probe', 'listen', 'probe', 'probe', 'unlink', 'listen', 'release'],
			message: { code: 'staleLock', message: 'A previous download of Example Flash 1.0 didn\'t finish cleanly. Select Retry to continue.', actions: ['retry'] },
		});
	});
});

/** A GGUF v3 header with string (or string-array) values, zero-padded to `fileSize` bytes. */
function ggufWithStrings(entries: readonly (readonly [string, string | readonly string[]])[], fileSize: number): Uint8Array {
	const parts: Buffer[] = [];
	const u32 = (value: number) => { const b = Buffer.alloc(4); b.writeUInt32LE(value); parts.push(b); };
	const u64 = (value: number) => { const b = Buffer.alloc(8); b.writeBigUInt64LE(BigInt(value)); parts.push(b); };
	const str = (value: string) => { const encoded = Buffer.from(value, 'utf8'); u64(encoded.length); parts.push(encoded); };
	u32(0x46554747);
	u32(3);
	u64(1);
	u64(entries.length);
	for (const [key, value] of entries) {
		str(key);
		if (typeof value === 'string') {
			u32(8);
			str(value);
		} else {
			u32(9);
			u32(8);
			u64(value.length);
			value.forEach(str);
		}
	}
	const header = Buffer.concat(parts);
	const bytes = new Uint8Array(Math.max(fileSize, header.byteLength));
	bytes.set(header);
	return bytes;
}

/** Serves `bytes=<start>-<end>` requests as 206 with the file's ETag; any other request gets the whole file (200). */
function rangeServer(files: Record<string, Uint8Array>, overrides: (request: ILocalModelHttpRequest, name: string) => IFakeReply | undefined = () => undefined) {
	return (request: ILocalModelHttpRequest): IFakeReply => {
		const name = decodeURIComponent(new URL(request.url).pathname.split('/').pop()!);
		const override = overrides(request, name);
		if (override) {
			return override;
		}
		const data = files[name];
		if (!data) {
			return { status: 404 };
		}
		const range = /^bytes=(?<start>\d+)-(?<end>\d+)$/.exec(request.headers?.Range ?? '')?.groups;
		if (!range) {
			return { status: 200, headers: { 'etag': `"etag-${name}"`, 'content-length': String(data.byteLength) }, body: data };
		}
		const start = Number(range.start);
		const end = Math.min(Number(range.end), data.byteLength - 1);
		return { status: 206, headers: { 'etag': `"etag-${name}"`, 'content-range': `bytes ${start}-${end}/${data.byteLength}` }, body: data.subarray(start, end + 1) };
	};
}

class RecordingLogService extends NullLogService {
	readonly messages: string[] = [];
	override trace(message: string, ...args: unknown[]): void { this.messages.push([message, ...args].map(String).join(' ')); }
	override debug(message: string, ...args: unknown[]): void { this.messages.push([message, ...args].map(String).join(' ')); }
	override info(message: string, ...args: unknown[]): void { this.messages.push([message, ...args].map(String).join(' ')); }
	override warn(message: string, ...args: unknown[]): void { this.messages.push([message, ...args].map(String).join(' ')); }
	override error(message: string | Error, ...args: unknown[]): void { this.messages.push([message, ...args].map(String).join(' ')); }
}

suite('localModel remote architecture read (§5.2.2)', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	const MAI_HEADER = ggufWithStrings([['general.architecture', 'maion-coder'], ['general.name', 'MAI-Code-1.1-Flash']], 2 * MiB);
	const LATE_HEADER = ggufWithStrings([['general.description', 'x'.repeat(300 * 1024)], ['general.architecture', 'qwen3']], 2 * MiB);
	const BEYOND_CAP = ggufWithStrings([['tokenizer.ggml.tokens', ['a', 'b', 'c'].map(letter => letter.repeat(3 * MiB))], ['general.architecture', 'qwen3']], 10 * MiB);

	test('reads general.architecture with bounded Range requests: the first 256 KiB, then grown chunks, unknown beyond the 8 MiB cap', async () => {
		const read = async (data: Uint8Array) => {
			const http = new FakeHttp(rangeServer({ 'model.gguf': data }));
			const result = await readRemoteGgufArchitecture({ http, log: new NullLogService(), file: spec('model.gguf', data), signal: new AbortController().signal });
			return { result, ranges: http.requests.map(request => request.headers?.Range), ifMatch: [...new Set(http.requests.map(request => request.headers?.['If-Match']))] };
		};
		assert.deepStrictEqual({ firstChunk: await read(MAI_HEADER), grown: await read(LATE_HEADER), beyondCap: await read(BEYOND_CAP) }, {
			firstChunk: { result: { kind: 'found', architecture: 'maion-coder' }, ranges: ['bytes=0-262143'], ifMatch: ['"etag-model.gguf"'] },
			grown: { result: { kind: 'found', architecture: 'qwen3' }, ranges: ['bytes=0-262143', 'bytes=262144-524287'], ifMatch: ['"etag-model.gguf"'] },
			beyondCap: {
				result: { kind: 'unknown', reason: 'overCap' },
				ranges: ['bytes=0-262143', 'bytes=262144-524287', 'bytes=524288-1048575', 'bytes=1048576-2097151', 'bytes=2097152-4194303', 'bytes=4194304-8388607'],
				ifMatch: ['"etag-model.gguf"'],
			},
		});
	});

	test('renews an expired SAS once, re-checks the URL policy on every hop, reads only the start of a server that ignores Range, and never logs a SAS', async () => {
		const log = new RecordingLogService();
		const file = spec('model.gguf', MAI_HEADER, 'SAS1');
		const sasOf = (url: string) => `${new URL(url).host}:${new URL(url).searchParams.get('sig')}`;
		const run = async (reply: (request: ILocalModelHttpRequest) => IFakeReply, options: { readonly file?: IDownloadFileSpec; readonly renew?: () => Promise<IDownloadFileSpec | undefined>; readonly signal?: AbortSignal } = {}) => {
			const http = new FakeHttp(reply);
			const result = await readRemoteGgufArchitecture({ http, log, file: options.file ?? file, signal: options.signal ?? new AbortController().signal, renew: options.renew }).catch((error: LocalModelDownloadError) => `threw ${error.code}`);
			return { result, requests: http.requests.map(request => sasOf(request.url)) };
		};
		const files = { 'model.gguf': MAI_HEADER };
		const expiredFirst = rangeServer(files, request => request.url.includes('sig=SAS1') ? { status: 403 } : undefined);
		const renewTo = (sas: string, data = MAI_HEADER) => async () => spec('model.gguf', data, sas);
		const aborted = new AbortController();
		aborted.abort();
		assert.deepStrictEqual({
			renewed: await run(expiredFirst, { renew: renewTo('SAS2') }),
			expiredTwice: await run(() => ({ status: 403 }), { renew: renewTo('SAS2') }),
			noRenewal: await run(expiredFirst),
			renewedOtherContent: await run(expiredFirst, { renew: renewTo('SAS2', LATE_HEADER) }),
			allowedRedirect: await run(rangeServer(files, request => request.url.startsWith('https://acct.') ? { status: 307, headers: { location: 'https://mirror.blob.core.windows.net/models/mai/model.gguf?sv=2024&sig=SAS1' } } : undefined)),
			blockedRedirect: await run(() => ({ status: 302, headers: { location: 'https://evil.example.com/model.gguf?sig=SAS1' } })),
			insecureUrl: await run(rangeServer(files), { file: { ...file, url: 'http://acct.blob.core.windows.net/models/mai/model.gguf?sig=SAS1' } }),
			ignoresRange: await run(request => ({ status: 200, headers: { 'etag': '"etag-model.gguf"', 'content-length': String(MAI_HEADER.byteLength) }, body: MAI_HEADER })),
			etagChanged: await run(rangeServer(files, () => ({ status: 206, headers: { 'etag': '"replaced"', 'content-range': `bytes 0-262143/${MAI_HEADER.byteLength}` }, body: MAI_HEADER.subarray(0, 262144) }))),
			serverError: await run(() => ({ status: 500 })),
			cancelled: await run(rangeServer(files), { signal: aborted.signal }),
			forbidden: log.messages.filter(message => /:\/\/|\?|sig|se=|SAS\d|model\.gguf|\/models\//.test(message)),
			hostsLogged: log.messages.some(message => message.includes('acct.blob.core.windows.net')),
			telemetry: ['maion-coder', 'qwen3', 'gpt-oss', undefined].map(toTelemetryArchitecture),
		}, {
			renewed: { result: { kind: 'found', architecture: 'maion-coder' }, requests: ['acct.blob.core.windows.net:SAS1', 'acct.blob.core.windows.net:SAS2'] },
			expiredTwice: { result: { kind: 'unknown', reason: 'accessExpired' }, requests: ['acct.blob.core.windows.net:SAS1', 'acct.blob.core.windows.net:SAS2'] },
			noRenewal: { result: { kind: 'unknown', reason: 'accessExpired' }, requests: ['acct.blob.core.windows.net:SAS1'] },
			renewedOtherContent: { result: { kind: 'unknown', reason: 'accessExpired' }, requests: ['acct.blob.core.windows.net:SAS1'] },
			allowedRedirect: { result: { kind: 'found', architecture: 'maion-coder' }, requests: ['acct.blob.core.windows.net:SAS1', 'mirror.blob.core.windows.net:SAS1'] },
			blockedRedirect: { result: { kind: 'unknown', reason: 'urlPolicy' }, requests: ['acct.blob.core.windows.net:SAS1'] },
			insecureUrl: { result: { kind: 'unknown', reason: 'urlPolicy' }, requests: [] },
			ignoresRange: { result: { kind: 'found', architecture: 'maion-coder' }, requests: ['acct.blob.core.windows.net:SAS1'] },
			etagChanged: { result: { kind: 'unknown', reason: 'http' }, requests: ['acct.blob.core.windows.net:SAS1'] },
			serverError: { result: { kind: 'unknown', reason: 'http' }, requests: ['acct.blob.core.windows.net:SAS1'] },
			cancelled: { result: 'threw cancelled', requests: ['acct.blob.core.windows.net:SAS1'] },
			forbidden: [],
			hostsLogged: true,
			telemetry: ['other', 'qwen3', 'gpt-oss', ''],
		});
	});

	test('Range-read diagnostics carry only hosts and byte counts, never a registry file name, a URL or a signed parameter', async () => {
		const log = new RecordingLogService();
		const http = new FakeHttp(rangeServer({ 'model.gguf': MAI_HEADER }));
		const file = { ...spec('model.gguf', MAI_HEADER), relativePath: 'model?sig=SECRET.gguf' };
		const read = await readRemoteGgufArchitecture({ http, log, file, signal: new AbortController().signal });
		const late = await readRemoteGgufArchitecture({ http: new FakeHttp(rangeServer({ 'model.gguf': LATE_HEADER })), log, file: { ...spec('model.gguf', LATE_HEADER), relativePath: 'late?se=2026&sig=SECRET.gguf' }, signal: new AbortController().signal, maxBytes: 1024, initialBytes: 512 });
		assert.deepStrictEqual({ read, late, logged: log.messages }, {
			read: { kind: 'found', architecture: 'maion-coder' },
			late: { kind: 'unknown', reason: 'overCap' },
			logged: [
				'[LocalModelArchitecture] Read general.architecture from the first 262144 bytes at acct.blob.core.windows.net',
				'[LocalModelArchitecture] general.architecture is not in the first 1024 bytes',
			],
		});
	});

	test('a resumable partial is found only when its identity sidecar matches the file', async () => {
		const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'vscode-local-model-partial-'));
		try {
			const file = spec('model.gguf', MAI_HEADER);
			const modelId = 'azureml://registries/azureml/models/MAI-Code-1.1-Flash/versions/5';
			const partial = path.join(root, 'model.gguf.vscode.partial');
			await fs.promises.writeFile(partial, MAI_HEADER.subarray(0, 4096));
			const withSidecar = async (sidecar: object) => {
				await fs.promises.writeFile(`${partial}.json`, JSON.stringify(sidecar));
				return findResumablePartial(root, modelId, file);
			};
			const matching = { modelId, totalBytes: file.sizeBytes, sha256: file.sha256, etag: file.etag };
			assert.deepStrictEqual({
				matching: await withSidecar(matching),
				otherVersion: await withSidecar({ ...matching, modelId: modelId.replace('/5', '/4') }),
				otherContent: await withSidecar({ ...matching, sha256: 'f'.repeat(64) }),
				otherEtag: await withSidecar({ ...matching, etag: '"other"' }),
			}, {
				matching: partial,
				otherVersion: undefined,
				otherContent: undefined,
				otherEtag: undefined,
			});
		} finally {
			await fs.promises.rm(root, { recursive: true, force: true });
		}
	});
});
