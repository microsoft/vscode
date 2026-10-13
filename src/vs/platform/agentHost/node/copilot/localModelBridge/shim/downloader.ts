/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createHash } from 'crypto';
import * as fs from 'fs';
import { timeout } from '../../../../../../base/common/async.js';
import { VSBuffer, type VSBufferReadableStream } from '../../../../../../base/common/buffer.js';
import { CancellationTokenSource } from '../../../../../../base/common/cancellation.js';
import { isCancellationError } from '../../../../../../base/common/errors.js';
import { isValidBasename } from '../../../../../../base/common/extpath.js';
import * as path from '../../../../../../base/common/path.js';
import type { IRequestContext } from '../../../../../../base/parts/request/common/request.js';
import { localize } from '../../../../../../nls.js';
import type { ILogService } from '../../../../../log/common/log.js';
import type { IRequestService } from '../../../../../request/common/request.js';
import type { ITelemetryService } from '../../../../../telemetry/common/telemetry.js';
import type { ILocalModelErrorV1, LocalModelErrorAction } from '../../../../common/localModel.js';
import { containsCredential, errorCodeForLog } from '../../../../common/logRedaction.js';
import { AZURE_ML_DOWNLOAD_HOST_SUFFIXES, BLOB_REQUEST_HEADERS, DOWNLOAD_CONNECT_TIMEOUT_MS, DOWNLOAD_IDLE_TIMEOUT_MS, DOWNLOAD_MAX_REDIRECTS, DOWNLOAD_MAX_SAS_RENEWALS, DOWNLOAD_MAX_TRANSFER_ATTEMPTS, DOWNLOAD_PROGRESS_THROTTLE_MS, DOWNLOAD_RETRY_BASE_DELAY_MS, DOWNLOAD_RETRY_MAX_DELAY_MS, GGUF_ARCHITECTURE_READ_INITIAL_BYTES, GGUF_ARCHITECTURE_READ_MAX_BYTES, HASH_CHUNK_BYTES, LOCAL_MODEL_TELEMETRY_ARCHITECTURES, PARTIAL_FILE_SUFFIX, PLACE_RENAME_RETRIES, PLACE_RENAME_RETRY_DELAY_MS, type LocalModelRegistryName } from './constants.js';
import { readGgufArchitectureFromPrefix, type GgufArchitectureRead } from './gguf.js';
import { acquireProcessLock, clearStaleProcessLock, type IProcessLock, type IProcessLockOptions } from './processLock.js';

/* Sequential, resumable, verified multi-file download, one per family directory per machine. SAS URLs live only in memory and are never logged; logs carry hosts only. */

// #region HTTP transport

/** One HTTP request. Redirects are never followed by the transport. */
export interface ILocalModelHttpRequest {
	readonly url: string;
	readonly method: 'GET' | 'HEAD' | 'POST';
	readonly headers?: Readonly<Record<string, string>>;
	readonly body?: string;
	readonly timeoutMs?: number;
}

export interface ILocalModelHttpResponse {
	readonly status: number;
	/** Response headers with lowercase names. */
	readonly headers: Readonly<Record<string, string | undefined>>;
	readonly body: VSBufferReadableStream;
	/** Aborts the request and closes its connection when the body wasn't read to its end; idempotent. Destroying {@link body} alone may leave the connection transferring. */
	abort(): void;
}

/** Narrow injectable HTTP transport. Implementations return 3xx responses instead of following them, so the caller re-checks its URL policy on every hop. */
export interface ILocalModelHttpClient {
	request(request: ILocalModelHttpRequest, signal: AbortSignal): Promise<ILocalModelHttpResponse>;
}

/**
 * {@link ILocalModelHttpClient} over `IRequestService`, so proxy, certificate and Kerberos settings apply. Uses
 * `followRedirects: 0` and `logUrl: false`, so no (signed) URL is logged. {@link ILocalModelHttpResponse.abort} cancels
 * the request and destroys the raw response (closing its socket), because destroying the body stream does neither.
 */
export class RequestServiceHttpClient implements ILocalModelHttpClient {

	constructor(private readonly _requestService: Pick<IRequestService, 'request'>) { }

	async request(request: ILocalModelHttpRequest, signal: AbortSignal): Promise<ILocalModelHttpResponse> {
		// Lives as long as the response: cancelling it after the headers arrived still aborts a fetch-based request.
		const source = new CancellationTokenSource();
		const onAbort = () => source.cancel();
		signal.addEventListener('abort', onAbort);
		let context: IRequestContext;
		try {
			if (signal.aborted) {
				throw new LocalModelDownloadError('cancelled');
			}
			context = await this._requestService.request({
				url: request.url,
				type: request.method,
				headers: request.headers ? { ...request.headers } : undefined,
				data: request.body,
				timeout: request.timeoutMs,
				followRedirects: 0,
				disableCache: true,
				logUrl: false,
				callSite: 'localModelBridge',
			}, source.token);
		} catch (error) {
			source.dispose();
			if (signal.aborted || isCancellationError(error)) {
				throw new LocalModelDownloadError('cancelled');
			}
			throw error;
		} finally {
			signal.removeEventListener('abort', onAbort);
		}
		const headers: Record<string, string | undefined> = {};
		for (const [name, value] of Object.entries(context.res.headers)) {
			headers[name.toLowerCase()] = Array.isArray(value) ? value[0] : value;
		}
		const { res, stream } = context;
		// No listener on the body here: adding one would make it flow buffered errors and its end
		// to the transport instead of the consumer. The token source goes with the response.
		return {
			status: res.statusCode ?? 0,
			headers,
			body: stream,
			abort: () => {
				// Harmless once the body was read to its end: the request service no longer listens, and
				// Node destroys the socket of an `IncomingMessage` only while it is incomplete or unread.
				source.cancel();
				if (isDestroyable(res)) {
					res.destroy();
				}
				stream.destroy();
				source.dispose();
			},
		};
	}
}

/** Whether a request-service response can be destroyed (Node's `http.IncomingMessage`). */
function isDestroyable(value: object): value is { destroy(): void } {
	return typeof (value as { destroy?: unknown }).destroy === 'function';
}

/** Reads a response body as text, failing past `maxBytes`. `error` and `end` handlers attach before `data`, which starts the flow and only reaches handlers present then. */
export function readResponseText(response: ILocalModelHttpResponse, maxBytes: number, signal?: AbortSignal): Promise<string> {
	return new Promise<string>((resolve, reject) => {
		const chunks: VSBuffer[] = [];
		let bytes = 0;
		let settled = false;
		const settle = (error: Error | undefined) => {
			if (settled) {
				return;
			}
			settled = true;
			signal?.removeEventListener('abort', onAbort);
			if (error) {
				discardResponse(response);
				reject(error);
			} else {
				resolve(VSBuffer.concat(chunks).toString());
			}
		};
		const onAbort = () => settle(new LocalModelDownloadError('cancelled'));
		signal?.addEventListener('abort', onAbort);
		response.body.on('error', error => settle(error instanceof Error ? error : new Error(String(error))));
		response.body.on('end', () => settle(undefined));
		response.body.on('data', chunk => {
			bytes += chunk.byteLength;
			if (bytes > maxBytes) {
				settle(new Error('Response exceeds the size cap'));
				return;
			}
			chunks.push(chunk);
		});
	});
}

/** Discards a response: aborts its request and connection and destroys its body. Discard every response not read to its end before retrying or giving up. */
export function discardResponse(response: ILocalModelHttpResponse): void {
	try {
		response.abort();
	} catch {
		// Already closed.
	}
	try {
		response.body.destroy();
	} catch {
		// Already closed.
	}
}

/** Host of a URL, for logs. Never log full URLs: they may carry SAS signatures. */
export function hostForLog(url: string): string {
	try {
		return new URL(url).host;
	} catch {
		return '<invalid url>';
	}
}

function hasHostSuffix(host: string, suffixes: readonly string[]): boolean {
	const lower = host.toLowerCase();
	return suffixes.some(suffix => lower.endsWith(suffix) && lower.length > suffix.length);
}

/** Download URL policy: HTTPS on port 443, hosts under {@link AZURE_ML_DOWNLOAD_HOST_SUFFIXES}, no userinfo or fragment; re-checked on every redirect hop. Pure. */
export function isAllowedDownloadUrl(url: string): boolean {
	let parsed: URL;
	try {
		parsed = new URL(url);
	} catch {
		return false;
	}
	return parsed.protocol === 'https:'
		&& (parsed.port === '' || parsed.port === '443')
		&& !parsed.username && !parsed.password
		&& !parsed.hash && !url.includes('#')
		&& hasHostSuffix(parsed.hostname, AZURE_ML_DOWNLOAD_HOST_SUFFIXES);
}

/** Longest model file name accepted (its partial and sidecar names still fit in 255 characters). */
const MODEL_FILE_NAME_MAX_LENGTH = 200;
/** Windows device names {@link isValidBasename} does not list. */
const EXTRA_WINDOWS_DEVICE_NAMES = /^(?:conin\$|conout\$|com[\u00b9\u00b2\u00b3]|lpt[\u00b9\u00b2\u00b3])(?:\.|$)/i;

/**
 * The single validator for a registry-provided model file name: a bare name valid on Windows on every platform (no
 * reserved characters or device names), no control characters, `..`, leading or trailing dot or space, nothing
 * credential-like (it is persisted), at most {@link MODEL_FILE_NAME_MAX_LENGTH} characters. Pure.
 */
export function isSafeModelFileName(name: string): boolean {
	return name.length <= MODEL_FILE_NAME_MAX_LENGTH
		&& isValidBasename(name, true)
		&& !/[\u0000-\u001f\u007f]/.test(name)
		&& !name.includes('..')
		&& !/^[. ]|[. ]$/.test(name)
		&& !EXTRA_WINDOWS_DEVICE_NAMES.test(name)
		&& !containsCredential(name);
}

/** `dir/name` when `name` passes {@link isSafeModelFileName} and resolves directly beneath `dir`; every file system use of a registry name goes through it. Pure. */
export function resolveModelFilePath(dir: string, name: string): string | undefined {
	if (!isSafeModelFileName(name)) {
		return undefined;
	}
	const base = path.resolve(dir);
	const resolved = path.resolve(base, name);
	return path.dirname(resolved) === base ? resolved : undefined;
}

// #endregion

// #region Errors

/** Downloader and store error codes. */
export type LocalModelDownloadErrorCode =
	| 'network'
	| 'accessExpired'
	| 'identityChanged'
	| 'integrity'
	| 'storage'
	| 'diskFull'
	| 'notPublished'
	| 'noChecksum'
	| 'cancelled'
	| 'lockedElsewhere'
	| 'staleLock'
	| 'filesInUse'
	| 'urlPolicy';

export class LocalModelDownloadError extends Error {
	/** @param transient A dropped or stalled connection, a timeout or HTTP 5xx/408/429: retried from the partial file. */
	constructor(readonly code: LocalModelDownloadErrorCode, message?: string, readonly transient = false) {
		super(message ?? code);
		this.name = 'LocalModelDownloadError';
	}
}

function fsErrorCode(error: unknown): string | undefined {
	const code = error && typeof error === 'object' ? (error as { code?: unknown }).code : undefined;
	return typeof code === 'string' ? code : undefined;
}

/** Localized error for an acquisition failure; `args`: `diskFull` -> [needed, volume, available], `insufficientMemory` -> [available, needed]. */
export function createLocalModelAcquisitionError(code: LocalModelDownloadErrorCode | 'insufficientMemory' | 'catalogUnavailable', displayName: string, args: readonly string[] = []): ILocalModelErrorV1 {
	const retry: LocalModelErrorAction[] = ['retry'];
	switch (code) {
		case 'network': return { code, message: localize('localModel.download.network', "The download was interrupted. Select Retry to resume."), actions: retry };
		case 'accessExpired': return { code, message: localize('localModel.download.accessExpired', "The download link expired before the download finished. Select Retry to continue."), actions: retry };
		case 'identityChanged': return { code, message: localize('localModel.download.identityChanged', "The model was updated on the server. Select Retry to download the latest files."), actions: retry };
		case 'integrity': return { code, message: localize('localModel.download.integrity', "The downloaded file didn't match its SHA-256 checksum and was discarded. Select Retry to download it again."), actions: retry };
		case 'diskFull': return { code, message: localize('localModel.download.diskFull', "{0} needs {1} of free space on {2}; {3} is available.", displayName, args[0] ?? '?', args[1] ?? '?', args[2] ?? '?'), actions: retry };
		case 'notPublished': return { code, message: localize('localModel.download.notPublished', "{0} isn't available yet.", displayName), actions: retry };
		case 'noChecksum': return { code, message: localize('localModel.download.noChecksum', "This model version doesn't publish a SHA-256 checksum, so it can't be verified or downloaded."), actions: [] };
		case 'filesInUse': return { code, message: localize('localModel.download.filesInUse', "Some files are in use. Close other apps using this model and try again."), actions: retry };
		case 'lockedElsewhere': return { code, message: localize('localModel.download.lockedElsewhere', "{0} is downloading in another VS Code window.", displayName), actions: retry };
		case 'staleLock': return { code, message: localize('localModel.download.staleLock', "A previous download of {0} didn't finish cleanly. Select Retry to continue.", displayName), actions: retry };
		case 'insufficientMemory': return { code, message: localize('localModel.insufficientMemory', "This device doesn't have enough GPU memory for {0} ({1} available, {2} needed).", displayName, args[0] ?? '?', args[1] ?? '?'), actions: [] };
		case 'catalogUnavailable': return { code, message: localize('localModel.catalogUnavailable', "Couldn't reach the model catalog. Check your connection and select Retry."), actions: retry };
		case 'cancelled': return { code, message: localize('localModel.download.cancelled', "The download was cancelled."), actions: retry };
		default: return { code, message: localize('localModel.download.storage', "Couldn't write the model files. Check that the disk is available and select Retry."), actions: retry };
	}
}

/** Maps a file-system error to a download error code. */
export function classifyFileSystemError(error: unknown): LocalModelDownloadErrorCode {
	switch (fsErrorCode(error)) {
		case 'ENOSPC':
		case 'EDQUOT': return 'diskFull';
		case 'EBUSY':
		case 'EPERM':
		case 'EACCES': return 'filesInUse';
		default: return 'storage';
	}
}

// #endregion

// #region Hashing

/** SHA-256 of a file in {@link HASH_CHUNK_BYTES} chunks, checking `signal` between chunks so cancellation is immediate even for 50 GB files. */
export async function computeFileSha256(filePath: string, options: { readonly signal?: AbortSignal; readonly onBytes?: (bytes: number) => void } = {}): Promise<string> {
	const hash = createHash('sha256');
	const handle = await fs.promises.open(filePath, 'r');
	try {
		const buffer = Buffer.allocUnsafe(HASH_CHUNK_BYTES);
		let position = 0;
		while (true) {
			if (options.signal?.aborted) {
				throw new LocalModelDownloadError('cancelled');
			}
			const { bytesRead } = await handle.read(buffer, 0, buffer.byteLength, position);
			if (bytesRead === 0) {
				break;
			}
			hash.update(buffer.subarray(0, bytesRead));
			position += bytesRead;
			options.onBytes?.(position);
		}
	} finally {
		await handle.close();
	}
	return hash.digest('hex');
}

// #endregion

// #region Machine lock

/** `type` of the per-family download lock (see `processLock.ts`). */
export const DOWNLOAD_LOCK_TYPE = 'lmdl';

/**
 * Takes the per-family download lock for the whole download: a live holder fails with `lockedElsewhere`. A socket file
 * left behind on macOS fails with `staleLock` until Retry clears it ({@link ModelDownloader.clearStaleLock}).
 */
async function acquireDownloadLock(familyDir: string, options: IProcessLockOptions | undefined): Promise<IProcessLock> {
	let lock: IProcessLock | 'busy' | 'stale';
	try {
		await fs.promises.mkdir(familyDir, { recursive: true });
		lock = await acquireProcessLock(familyDir, DOWNLOAD_LOCK_TYPE, options);
	} catch (error) {
		throw new LocalModelDownloadError(classifyFileSystemError(error));
	}
	if (lock === 'busy') {
		throw new LocalModelDownloadError('lockedElsewhere');
	}
	if (lock === 'stale') {
		throw new LocalModelDownloadError('staleLock');
	}
	return lock;
}

// #endregion

// #region Downloader

/** One file of a model version. `url` carries a SAS signature: memory only. */
export interface IDownloadFileSpec {
	/** File name relative to the version directory (no separators). */
	readonly relativePath: string;
	readonly url: string;
	readonly sizeBytes: number;
	/** Lowercase hex SHA-256 from `x-ms-meta-sha256`. */
	readonly sha256: string;
	readonly etag?: string;
}

/** Identity sidecar `<file>.vscode.partial.json`. */
export interface IPartialSidecar {
	readonly modelId: string;
	readonly totalBytes: number;
	readonly sha256: string;
	readonly etag: string | undefined;
}

export type LocalModelDownloadPhase = 'downloading' | 'verifying' | 'placing';

export interface ILocalModelDownloadProgress {
	readonly phase: LocalModelDownloadPhase;
	/** Aggregated across files. */
	readonly completedBytes: number;
	readonly totalBytes: number;
	readonly bytesPerSecond: number | undefined;
	readonly fileIndex: number;
	readonly fileCount: number;
}

export interface ILocalModelDownloadRequest {
	/** Asset id recorded in sidecars (for example `azureml://registries/azureml/models/X/versions/3`). */
	readonly modelId: string;
	/** Directory receiving the files (the version directory). */
	readonly targetDir: string;
	/** Family directory whose download lock is held for the whole download. */
	readonly familyDir: string;
	readonly files: readonly IDownloadFileSpec[];
	/** Re-resolves SAS URLs after a 401/403 (at most {@link DOWNLOAD_MAX_SAS_RENEWALS} times); throws `accessExpired` when impossible. */
	readonly renewFiles?: (signal: AbortSignal) => Promise<readonly IDownloadFileSpec[]>;
	readonly signal: AbortSignal;
	readonly onProgress?: (progress: ILocalModelDownloadProgress) => void;
	/** Telemetry context. */
	readonly registry?: LocalModelRegistryName;
	readonly autoResumed?: boolean;
}

export interface ILocalModelDownloadResult {
	readonly downloadedBytes: number;
	readonly reusedFiles: readonly string[];
	readonly resumed: boolean;
	readonly sasRenewals: number;
}

export interface IModelDownloaderOptions {
	readonly http: ILocalModelHttpClient;
	readonly log: ILogService;
	readonly telemetry?: Pick<ITelemetryService, 'publicLog2'>;
	readonly now?: () => number;
	/** Delay between rename retries (tests shorten it). */
	readonly renameRetryDelayMs?: number;
	/** Rename used to place files; injectable to simulate antivirus locks. */
	readonly rename?: (from: string, to: string) => Promise<void>;
	/** Download lock seams (tests simulate a stale macOS lock). */
	readonly lockOptions?: IProcessLockOptions;
	/** Waits before a transient transfer retry; rejects or returns early when `signal` aborts (tests make it immediate). */
	readonly retryDelay?: (ms: number, signal: AbortSignal) => Promise<void>;
	/** {@link DOWNLOAD_CONNECT_TIMEOUT_MS}, shortened by tests. */
	readonly connectTimeoutMs?: number;
	/** {@link DOWNLOAD_IDLE_TIMEOUT_MS}, shortened by tests. */
	readonly idleTimeoutMs?: number;
}

/** HTTP statuses a transfer retries: server errors, request timeout and throttling. Pure. */
function isTransientStatus(status: number): boolean {
	return status >= 500 || status === 408 || status === 429;
}

/** `etag` when it is strong: a weak ETag can never match `If-Match`, so a resume sends none (the SHA-256 check still applies). Pure. */
export function strongEtag(etag: string | undefined): string | undefined {
	return etag !== undefined && !/^\s*W\//i.test(etag) ? etag : undefined;
}

/** Backoff before the `failures`-th consecutive transient retry. Pure. */
export function transferRetryDelayMs(failures: number): number {
	return Math.min(DOWNLOAD_RETRY_MAX_DELAY_MS, DOWNLOAD_RETRY_BASE_DELAY_MS * 2 ** Math.max(0, failures - 1));
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
	return new Promise<void>(resolve => {
		if (signal.aborted) {
			resolve();
			return;
		}
		const done = () => {
			clearTimeout(handle);
			signal.removeEventListener('abort', done);
			resolve();
		};
		const handle = setTimeout(done, ms);
		signal.addEventListener('abort', done);
	});
}

const CONTENT_RANGE = /^bytes (?<start>\d+)-(?<end>\d+)\/(?<total>\d+)$/;
const SHA256_HEX = /^[0-9a-f]{64}$/;

/** Parses `Content-Range: bytes a-b/total`. Pure. */
export function parseContentRange(value: string | undefined): { readonly start: number; readonly end: number; readonly total: number } | undefined {
	const match = value ? CONTENT_RANGE.exec(value.trim()) : null;
	if (!match?.groups) {
		return undefined;
	}
	return { start: Number(match.groups.start), end: Number(match.groups.end), total: Number(match.groups.total) };
}

/** Compares ETags ignoring weak markers and quotes. Pure. */
export function etagsMatch(a: string | undefined, b: string | undefined): boolean {
	const normalize = (value: string) => value.trim().replace(/^W\//, '').replace(/^"|"$/g, '');
	return a === undefined || b === undefined || normalize(a) === normalize(b);
}

class ProgressReporter {
	private _lastEmit = 0;
	private _rateSampleTime: number;
	private _rateSampleBytes = 0;
	private _bytesPerSecond: number | undefined;

	constructor(
		private readonly _request: ILocalModelDownloadRequest,
		private readonly _now: () => number,
		readonly totalBytes: number,
	) {
		this._rateSampleTime = _now();
	}

	report(phase: LocalModelDownloadPhase, completedBytes: number, fileIndex: number, force: boolean): void {
		const now = this._now();
		if (now - this._rateSampleTime >= 1000) {
			const rate = (completedBytes - this._rateSampleBytes) * 1000 / (now - this._rateSampleTime);
			this._bytesPerSecond = this._bytesPerSecond === undefined ? rate : this._bytesPerSecond * 0.7 + rate * 0.3;
			this._rateSampleTime = now;
			this._rateSampleBytes = completedBytes;
		}
		if (!force && now - this._lastEmit < DOWNLOAD_PROGRESS_THROTTLE_MS) {
			return;
		}
		this._lastEmit = now;
		this._request.onProgress?.({
			phase,
			completedBytes,
			totalBytes: this.totalBytes,
			bytesPerSecond: phase === 'downloading' && this._bytesPerSecond !== undefined ? Math.max(0, Math.round(this._bytesPerSecond)) : undefined,
			fileIndex,
			fileCount: this._request.files.length,
		});
	}

	resetRate(completedBytes: number): void {
		this._rateSampleTime = this._now();
		this._rateSampleBytes = completedBytes;
	}
}

/**
 * Downloads a model version's files sequentially: `Range` + `If-Match` resume against the identity sidecar, SAS renewal,
 * full-file SHA-256 before atomic placement, and immediate cancellation in every phase. Transient failures retry from
 * the partial file with backoff; partial files and sidecars are kept on cancel so the download can resume.
 */
export class ModelDownloader {

	private readonly _now: () => number;
	private readonly _rename: (from: string, to: string) => Promise<void>;

	constructor(private readonly _options: IModelDownloaderOptions) {
		this._now = _options.now ?? Date.now;
		this._rename = _options.rename ?? ((from, to) => fs.promises.rename(from, to));
	}

	/** Retry after `staleLock`: removes the family's stale download lock once nothing answers on it. */
	clearStaleLock(familyDir: string): Promise<boolean> {
		return clearStaleProcessLock(familyDir, DOWNLOAD_LOCK_TYPE, this._options.lockOptions);
	}

	async download(request: ILocalModelDownloadRequest): Promise<ILocalModelDownloadResult> {
		const started = this._now();
		let sasRenewals = 0;
		let resumed = false;
		const totalBytes = request.files.reduce((sum, file) => sum + file.sizeBytes, 0);
		try {
			this._validateFiles(request.files);
			if (request.signal.aborted) {
				throw new LocalModelDownloadError('cancelled');
			}
			const lock = await acquireDownloadLock(request.familyDir, this._options.lockOptions);
			try {
				await fs.promises.mkdir(request.targetDir, { recursive: true }).catch(error => {
					throw new LocalModelDownloadError(classifyFileSystemError(error));
				});
				const progress = new ProgressReporter(request, this._now, totalBytes);
				let files = request.files;
				let completed = 0;
				let downloadedBytes = 0;
				const reusedFiles: string[] = [];
				for (let index = 0; index < files.length; index++) {
					const outcome = await this._downloadFile(request, files[index], index, completed, progress, async () => {
						if (!request.renewFiles || sasRenewals >= DOWNLOAD_MAX_SAS_RENEWALS) {
							throw new LocalModelDownloadError('accessExpired');
						}
						sasRenewals++;
						const renewed = await request.renewFiles(request.signal);
						this._checkRenewedIdentity(files, renewed);
						files = renewed;
						return renewed[index];
					});
					resumed ||= outcome.resumed;
					downloadedBytes += outcome.downloadedBytes;
					if (outcome.reused) {
						reusedFiles.push(files[index].relativePath);
					}
					completed += files[index].sizeBytes;
				}
				progress.report('placing', totalBytes, files.length - 1, true);
				const result: ILocalModelDownloadResult = { downloadedBytes, reusedFiles, resumed, sasRenewals };
				this._report(request, 'success', undefined, started, totalBytes, resumed, sasRenewals);
				return result;
			} finally {
				lock.dispose();
			}
		} catch (error) {
			const downloadError = error instanceof LocalModelDownloadError ? error : new LocalModelDownloadError(request.signal.aborted ? 'cancelled' : classifyFileSystemError(error), errorCodeForLog(error));
			const code = request.signal.aborted ? 'cancelled' : downloadError.code;
			this._report(request, code === 'cancelled' ? 'cancelled' : 'failed', code, started, totalBytes, resumed, sasRenewals);
			throw code === downloadError.code ? downloadError : new LocalModelDownloadError(code);
		}
	}

	private _validateFiles(files: readonly IDownloadFileSpec[]): void {
		for (const file of files) {
			if (!SHA256_HEX.test(file.sha256)) {
				throw new LocalModelDownloadError('noChecksum');
			}
			if (!isSafeModelFileName(file.relativePath) || !Number.isSafeInteger(file.sizeBytes) || file.sizeBytes < 0) {
				throw new LocalModelDownloadError('integrity', 'Invalid file spec');
			}
			if (!isAllowedDownloadUrl(file.url)) {
				throw new LocalModelDownloadError('urlPolicy');
			}
		}
	}

	private _checkRenewedIdentity(previous: readonly IDownloadFileSpec[], renewed: readonly IDownloadFileSpec[]): void {
		const same = previous.length === renewed.length && previous.every((file, i) => file.relativePath === renewed[i].relativePath && file.sizeBytes === renewed[i].sizeBytes && file.sha256 === renewed[i].sha256);
		if (!same) {
			throw new LocalModelDownloadError('identityChanged');
		}
	}

	private async _downloadFile(
		request: ILocalModelDownloadRequest,
		initialSpec: IDownloadFileSpec,
		index: number,
		completedBefore: number,
		progress: ProgressReporter,
		renew: () => Promise<IDownloadFileSpec>,
	): Promise<{ readonly reused: boolean; readonly resumed: boolean; readonly downloadedBytes: number }> {
		let spec = initialSpec;
		const finalPath = resolveModelFilePath(request.targetDir, spec.relativePath);
		if (!finalPath) {
			throw new LocalModelDownloadError('integrity', 'Invalid file spec');
		}
		const partialPath = finalPath + PARTIAL_FILE_SUFFIX;
		const sidecarPath = partialPath + '.json';

		// Reuse a verified final copy.
		const finalStat = await statOrUndefined(finalPath);
		if (finalStat?.isFile() && finalStat.size === spec.sizeBytes) {
			progress.report('verifying', completedBefore, index, true);
			const hash = await computeFileSha256(finalPath, { signal: request.signal, onBytes: bytes => progress.report('verifying', completedBefore + bytes, index, false) });
			if (hash === spec.sha256) {
				this._options.log.info(`[LocalModelDownloader] Reusing a verified file (${spec.sizeBytes} bytes)`);
				return { reused: true, resumed: false, downloadedBytes: 0 };
			}
		}

		// Resume only against an identical sidecar.
		let offset = 0;
		const sidecar = await readSidecar(sidecarPath);
		const partialStat = await statOrUndefined(partialPath);
		if (partialStat?.isFile() && sidecar && sidecar.modelId === request.modelId && sidecar.totalBytes === spec.sizeBytes && sidecar.sha256 === spec.sha256 && etagsMatch(sidecar.etag, spec.etag) && partialStat.size <= spec.sizeBytes) {
			offset = partialStat.size;
		} else {
			await fs.promises.rm(partialPath, { force: true });
			await writeSidecar(sidecarPath, { modelId: request.modelId, totalBytes: spec.sizeBytes, sha256: spec.sha256, etag: spec.etag });
		}
		const resumed = offset > 0;
		let downloadedBytes = 0;

		let attempts = 0;
		let transientFailures = 0;
		while (offset < spec.sizeBytes) {
			if (attempts++ > DOWNLOAD_MAX_SAS_RENEWALS + 2) {
				throw new LocalModelDownloadError('network', 'Too many attempts');
			}
			const attemptOffset = offset;
			try {
				const response = await this._get(spec.url, offset > 0 ? { range: `bytes=${offset}-`, ifMatch: strongEtag(spec.etag) } : undefined, request.signal);
				if (response.status === 401 || response.status === 403) {
					discardResponse(response);
					spec = await renew();
					continue;
				}
				if (response.status === 404) {
					discardResponse(response);
					throw new LocalModelDownloadError('notPublished');
				}
				if (isTransientStatus(response.status)) {
					discardResponse(response);
					throw new LocalModelDownloadError('network', `HTTP ${response.status} from ${hostForLog(spec.url)}`, true);
				}
				if (response.status === 412 || !etagsMatch(response.headers.etag, spec.etag)) {
					discardResponse(response);
					await this._resetPartial(partialPath, sidecarPath);
					throw new LocalModelDownloadError('identityChanged');
				}
				if (response.status === 416) {
					discardResponse(response);
					await fs.promises.rm(partialPath, { force: true });
					offset = 0;
					continue;
				}
				let writeFrom: number;
				if (response.status === 206 && offset > 0) {
					const range = parseContentRange(response.headers['content-range']);
					if (!range || range.start !== offset || range.end !== spec.sizeBytes - 1 || range.total !== spec.sizeBytes) {
						discardResponse(response);
						await this._resetPartial(partialPath, sidecarPath);
						throw new LocalModelDownloadError('identityChanged', 'Unexpected Content-Range');
					}
					writeFrom = offset;
				} else if (response.status === 200) {
					const length = response.headers['content-length'];
					if (length !== undefined && Number(length) !== spec.sizeBytes) {
						discardResponse(response);
						await this._resetPartial(partialPath, sidecarPath);
						throw new LocalModelDownloadError('identityChanged', 'Unexpected Content-Length');
					}
					writeFrom = 0;
				} else {
					discardResponse(response);
					throw new LocalModelDownloadError('network', `HTTP ${response.status} from ${hostForLog(spec.url)}`);
				}
				progress.resetRate(completedBefore + writeFrom);
				const written = await this._stream(response, partialPath, writeFrom, spec.sizeBytes, request.signal, bytes => progress.report('downloading', completedBefore + bytes, index, false));
				downloadedBytes += written - writeFrom;
				offset = written;
				if (offset < spec.sizeBytes) {
					throw new LocalModelDownloadError('network', 'The transfer ended early', true);
				}
			} catch (error) {
				if (!(error instanceof LocalModelDownloadError) || !error.transient || request.signal.aborted) {
					throw error;
				}
				// Resume from what reached the disk. An attempt that wrote new bytes starts a new run of failures.
				const onDisk = Math.min((await statOrUndefined(partialPath))?.size ?? 0, spec.sizeBytes);
				if (onDisk > offset) {
					downloadedBytes += onDisk - offset;
				}
				offset = onDisk;
				transientFailures = onDisk > attemptOffset ? 1 : transientFailures + 1;
				if (transientFailures >= DOWNLOAD_MAX_TRANSFER_ATTEMPTS) {
					throw error;
				}
				// A transient retry doesn't count against the SAS renewal budget.
				attempts--;
				const delayMs = transferRetryDelayMs(transientFailures);
				this._options.log.info(`[LocalModelDownloader] The transfer was interrupted after ${onDisk} of ${spec.sizeBytes} bytes; retrying (${transientFailures}/${DOWNLOAD_MAX_TRANSFER_ATTEMPTS - 1}) in ${delayMs} ms`);
				await (this._options.retryDelay ?? sleep)(delayMs, request.signal);
				if (request.signal.aborted) {
					throw new LocalModelDownloadError('cancelled');
				}
			}
		}

		progress.report('verifying', completedBefore, index, true);
		const partialSize = (await statOrUndefined(partialPath))?.size ?? -1;
		const hash = partialSize === spec.sizeBytes
			? await computeFileSha256(partialPath, { signal: request.signal, onBytes: bytes => progress.report('verifying', completedBefore + bytes, index, false) })
			: undefined;
		if (hash !== spec.sha256) {
			await this._resetPartial(partialPath, sidecarPath);
			throw new LocalModelDownloadError('integrity');
		}
		if (request.signal.aborted) {
			throw new LocalModelDownloadError('cancelled');
		}
		progress.report('placing', completedBefore + spec.sizeBytes, index, true);
		await this._place(partialPath, finalPath, request.signal);
		await fs.promises.rm(sidecarPath, { force: true });
		return { reused: false, resumed, downloadedBytes };
	}

	private async _get(url: string, range: { readonly range: string; readonly ifMatch: string | undefined } | undefined, signal: AbortSignal): Promise<ILocalModelHttpResponse> {
		let current = url;
		for (let hop = 0; hop <= DOWNLOAD_MAX_REDIRECTS; hop++) {
			if (!isAllowedDownloadUrl(current)) {
				throw new LocalModelDownloadError('urlPolicy', `Blocked download host ${hostForLog(current)}`);
			}
			const headers: Record<string, string> = { ...BLOB_REQUEST_HEADERS };
			if (range) {
				headers.Range = range.range;
				if (range.ifMatch) {
					headers['If-Match'] = range.ifMatch;
				}
			}
			let response: ILocalModelHttpResponse;
			// The response headers must arrive within the connect timeout; a stalled request counts as a dropped connection.
			const attempt = new AbortController();
			const onAbort = () => attempt.abort();
			signal.addEventListener('abort', onAbort);
			let timedOut = false;
			const timer = setTimeout(() => {
				timedOut = true;
				attempt.abort();
			}, this._options.connectTimeoutMs ?? DOWNLOAD_CONNECT_TIMEOUT_MS);
			try {
				response = await raceAbort(this._options.http.request({ url: current, method: 'GET', headers }, attempt.signal), attempt.signal);
			} catch (error) {
				if (signal.aborted || (!timedOut && error instanceof LocalModelDownloadError && error.code === 'cancelled')) {
					throw new LocalModelDownloadError('cancelled');
				}
				throw new LocalModelDownloadError('network', timedOut ? `Request to ${hostForLog(current)} timed out` : `Request to ${hostForLog(current)} failed`, true);
			} finally {
				clearTimeout(timer);
				signal.removeEventListener('abort', onAbort);
			}
			if (response.status >= 300 && response.status < 400 && response.headers.location) {
				discardResponse(response);
				current = new URL(response.headers.location, current).toString();
				continue;
			}
			return response;
		}
		throw new LocalModelDownloadError('network', 'Too many redirects');
	}

	private _stream(response: ILocalModelHttpResponse, partialPath: string, writeFrom: number, totalBytes: number, signal: AbortSignal, onBytes: (bytes: number) => void): Promise<number> {
		return new Promise<number>((resolve, reject) => {
			const out = fs.createWriteStream(partialPath, writeFrom > 0 ? { flags: 'a' } : { flags: 'w' });
			let written = writeFrom;
			let settled = false;
			// A connection that delivers nothing for the idle timeout is dead (sleep, network change); not armed while the disk drains.
			const idleTimeoutMs = this._options.idleTimeoutMs ?? DOWNLOAD_IDLE_TIMEOUT_MS;
			let idle: ReturnType<typeof setTimeout> | undefined;
			const armIdle = () => {
				clearTimeout(idle);
				idle = setTimeout(() => settle(new LocalModelDownloadError('network', 'The transfer stalled', true)), idleTimeoutMs);
			};
			const settle = (error: LocalModelDownloadError | undefined, fileFailed = false) => {
				if (settled) {
					return;
				}
				settled = true;
				clearTimeout(idle);
				signal.removeEventListener('abort', onAbort);
				// Wait for the handle to close so the partial file can be reopened, renamed or deleted.
				const afterClose = (callback: () => void) => out.closed ? callback() : out.once('close', callback);
				if (error) {
					discardResponse(response);
					// Bytes received before a failure are kept (the next attempt resumes from the file's size and the
					// SHA-256 check covers them): an error can arrive while earlier data still waits for the disk.
					if (fileFailed) {
						out.destroy();
					} else {
						out.end();
					}
					afterClose(() => reject(error));
				} else {
					out.end();
					afterClose(() => resolve(written));
				}
			};
			const onAbort = () => settle(new LocalModelDownloadError('cancelled'));
			signal.addEventListener('abort', onAbort);
			out.on('error', error => settle(new LocalModelDownloadError(classifyFileSystemError(error)), true));
			out.on('drain', () => {
				if (!settled) {
					armIdle();
					response.body.resume();
				}
			});
			// `error` and `end` before `data` (see readResponseText): one buffered before the flow starts reaches them.
			response.body.on('error', () => settle(new LocalModelDownloadError(signal.aborted ? 'cancelled' : 'network', 'The transfer was interrupted', !signal.aborted)));
			response.body.on('end', () => settle(undefined));
			response.body.on('data', chunk => {
				if (settled) {
					return;
				}
				written += chunk.byteLength;
				if (written > totalBytes) {
					settle(new LocalModelDownloadError('integrity', 'The server sent more bytes than expected'));
					return;
				}
				onBytes(written);
				if (settled) {
					return;
				}
				if (out.write(chunk.buffer)) {
					armIdle();
				} else {
					clearTimeout(idle);
					response.body.pause();
				}
			});
			armIdle();
		});
	}

	private async _place(partialPath: string, finalPath: string, signal: AbortSignal): Promise<void> {
		for (let attempt = 0; ; attempt++) {
			try {
				await this._rename(partialPath, finalPath);
				return;
			} catch (error) {
				const code = fsErrorCode(error);
				const retryable = code === 'EBUSY' || code === 'EPERM' || code === 'EACCES';
				if (!retryable || attempt >= PLACE_RENAME_RETRIES) {
					throw new LocalModelDownloadError(classifyFileSystemError(error));
				}
				if (signal.aborted) {
					throw new LocalModelDownloadError('cancelled');
				}
				await timeout(this._options.renameRetryDelayMs ?? PLACE_RENAME_RETRY_DELAY_MS);
			}
		}
	}

	private async _resetPartial(partialPath: string, sidecarPath: string): Promise<void> {
		await fs.promises.rm(partialPath, { force: true });
		await fs.promises.rm(sidecarPath, { force: true });
	}

	private _report(request: ILocalModelDownloadRequest, outcome: 'success' | 'failed' | 'cancelled', errorCode: string | undefined, started: number, totalBytes: number, resumed: boolean, sasRefreshes: number): void {
		if (!this._options.telemetry) {
			return;
		}
		reportLocalModelSetup(this._options.telemetry, {
			phase: 'download',
			outcome,
			errorCode: errorCode ?? '',
			registry: request.registry ?? '',
			pausedReason: '',
			autoResumed: !!request.autoResumed,
			resumed,
			sasRefreshes,
			durationMs: Math.max(0, this._now() - started),
			totalBytes,
			dflashSupported: false,
			architecture: '',
			architectureSupport: '',
		});
	}
}

/** Settles with `request`, or rejects with `cancelled` once `signal` aborts first; a later response is discarded. */
function raceAbort(request: Promise<ILocalModelHttpResponse>, signal: AbortSignal): Promise<ILocalModelHttpResponse> {
	return new Promise<ILocalModelHttpResponse>((resolve, reject) => {
		const onAbort = () => {
			request.then(discardResponse, () => undefined);
			reject(new LocalModelDownloadError('cancelled'));
		};
		if (signal.aborted) {
			onAbort();
			return;
		}
		signal.addEventListener('abort', onAbort, { once: true });
		request.then(response => {
			signal.removeEventListener('abort', onAbort);
			resolve(response);
		}, error => {
			signal.removeEventListener('abort', onAbort);
			reject(error);
		});
	});
}

async function statOrUndefined(filePath: string): Promise<fs.Stats | undefined> {
	try {
		return await fs.promises.stat(filePath);
	} catch {
		return undefined;
	}
}

async function readSidecar(sidecarPath: string): Promise<IPartialSidecar | undefined> {
	try {
		const value: unknown = JSON.parse(await fs.promises.readFile(sidecarPath, 'utf8'));
		if (!value || typeof value !== 'object') {
			return undefined;
		}
		const record = value as Partial<Record<keyof IPartialSidecar, unknown>>;
		if (typeof record.modelId !== 'string' || typeof record.totalBytes !== 'number' || typeof record.sha256 !== 'string') {
			return undefined;
		}
		return { modelId: record.modelId, totalBytes: record.totalBytes, sha256: record.sha256, etag: typeof record.etag === 'string' ? record.etag : undefined };
	} catch {
		return undefined;
	}
}

async function writeSidecar(sidecarPath: string, sidecar: IPartialSidecar): Promise<void> {
	try {
		await fs.promises.writeFile(sidecarPath, JSON.stringify(sidecar));
	} catch (error) {
		throw new LocalModelDownloadError(classifyFileSystemError(error));
	}
}

/** The local path of `spec`'s partial download in `targetDir` when its identity sidecar matches, else `undefined`. */
export async function findResumablePartial(targetDir: string, modelId: string, spec: Pick<IDownloadFileSpec, 'relativePath' | 'sizeBytes' | 'sha256' | 'etag'>): Promise<string | undefined> {
	const finalPath = resolveModelFilePath(targetDir, spec.relativePath);
	if (!finalPath) {
		return undefined;
	}
	const partialPath = finalPath + PARTIAL_FILE_SUFFIX;
	const sidecar = await readSidecar(partialPath + '.json');
	const stat = await statOrUndefined(partialPath);
	return stat?.isFile() && stat.size > 0 && stat.size <= spec.sizeBytes && sidecar && sidecar.modelId === modelId && sidecar.totalBytes === spec.sizeBytes && sidecar.sha256 === spec.sha256 && etagsMatch(sidecar.etag, spec.etag) ? partialPath : undefined;
}

// #endregion

// #region Architecture read

const ARCHITECTURE_READ_TIMEOUT_MS = 30_000;

/** Inputs of {@link readRemoteGgufArchitecture}. */
export interface IRemoteGgufArchitectureRequest {
	readonly http: ILocalModelHttpClient;
	readonly log: ILogService;
	/** The primary GGUF. Its URL carries a SAS signature: memory only, never logged. */
	readonly file: IDownloadFileSpec;
	readonly signal: AbortSignal;
	/** Re-resolves the file's URL after a 401/403 (once), as the downloader does; `undefined` when that is impossible. */
	readonly renew?: (signal: AbortSignal) => Promise<IDownloadFileSpec | undefined>;
	/** First request size; defaults to {@link GGUF_ARCHITECTURE_READ_INITIAL_BYTES}. */
	readonly initialBytes?: number;
	/** Hard cap on the bytes read; defaults to {@link GGUF_ARCHITECTURE_READ_MAX_BYTES}. */
	readonly maxBytes?: number;
}

type RangeFetch =
	| { readonly kind: 'bytes'; readonly bytes: Uint8Array }
	| { readonly kind: 'renew' }
	| { readonly kind: 'unknown'; readonly reason: 'network' | 'http' | 'urlPolicy' };

/**
 * Reads `general.architecture` of a remote GGUF before download with `Range` requests under the download URL policy
 * (`If-Match` on its ETag), doubling from `initialBytes` up to `maxBytes` until the key is found. Logs hosts only;
 * every failure is an `unknown` result and only cancellation throws.
 */
export async function readRemoteGgufArchitecture(request: IRemoteGgufArchitectureRequest): Promise<GgufArchitectureRead> {
	const total = request.file.sizeBytes;
	const cap = Math.min(request.maxBytes ?? GGUF_ARCHITECTURE_READ_MAX_BYTES, total);
	let target = Math.min(request.initialBytes ?? GGUF_ARCHITECTURE_READ_INITIAL_BYTES, cap);
	let file = request.file;
	let renewed = false;
	let prefix = new Uint8Array(0);
	while (target > prefix.byteLength) {
		const fetched = await fetchRange(request, file, prefix.byteLength, target);
		if (fetched.kind === 'renew') {
			const renewal = renewed || !request.renew ? undefined : await request.renew(request.signal).catch(() => undefined);
			if (request.signal.aborted) {
				throw new LocalModelDownloadError('cancelled');
			}
			if (!renewal || renewal.sizeBytes !== file.sizeBytes || renewal.sha256 !== file.sha256) {
				return { kind: 'unknown', reason: 'accessExpired' };
			}
			renewed = true;
			file = renewal;
			continue;
		}
		if (fetched.kind === 'unknown') {
			return fetched;
		}
		const next = new Uint8Array(prefix.byteLength + fetched.bytes.byteLength);
		next.set(prefix);
		next.set(fetched.bytes, prefix.byteLength);
		prefix = next;
		const parsed = await readGgufArchitectureFromPrefix(prefix, total);
		if (parsed.kind !== 'needMore') {
			request.log.info(`[LocalModelArchitecture] ${parsed.kind === 'found' ? 'Read general.architecture' : `general.architecture is unknown (${parsed.reason})`} from the first ${prefix.byteLength} bytes at ${hostForLog(file.url)}`);
			return parsed;
		}
		target = Math.min(target * 2, cap);
	}
	request.log.info(`[LocalModelArchitecture] general.architecture is not in the first ${prefix.byteLength} bytes`);
	return { kind: 'unknown', reason: prefix.byteLength < total ? 'overCap' : 'truncated' };
}

/** `GET` of bytes `[start, end)` of `file`, following redirects under the download URL policy. */
async function fetchRange(request: IRemoteGgufArchitectureRequest, file: IDownloadFileSpec, start: number, end: number): Promise<RangeFetch> {
	const { http, log, signal } = request;
	let url = file.url;
	for (let hop = 0; hop <= DOWNLOAD_MAX_REDIRECTS; hop++) {
		if (!isAllowedDownloadUrl(url)) {
			log.warn(`[LocalModelArchitecture] Blocked host ${hostForLog(url)}`);
			return { kind: 'unknown', reason: 'urlPolicy' };
		}
		const headers: Record<string, string> = { ...BLOB_REQUEST_HEADERS, Range: `bytes=${start}-${end - 1}` };
		if (file.etag) {
			headers['If-Match'] = file.etag;
		}
		let response: ILocalModelHttpResponse;
		try {
			response = await http.request({ url, method: 'GET', headers, timeoutMs: ARCHITECTURE_READ_TIMEOUT_MS }, signal);
		} catch {
			if (signal.aborted) {
				throw new LocalModelDownloadError('cancelled');
			}
			log.info(`[LocalModelArchitecture] Request to ${hostForLog(url)} failed`);
			return { kind: 'unknown', reason: 'network' };
		}
		if (response.status >= 300 && response.status < 400 && response.headers.location) {
			discardResponse(response);
			url = new URL(response.headers.location, url).toString();
			continue;
		}
		if (response.status === 401 || response.status === 403) {
			discardResponse(response);
			return { kind: 'renew' };
		}
		const length = end - start;
		let expected: number;
		if (response.status === 206) {
			const range = parseContentRange(response.headers['content-range']);
			expected = range && range.start === start && range.end === end - 1 && range.total === file.sizeBytes ? length : -1;
		} else {
			// A server that ignores `Range` sends the whole file: only its first bytes are read.
			expected = response.status === 200 && start === 0 && (response.headers['content-length'] === undefined || Number(response.headers['content-length']) === file.sizeBytes) ? length : -1;
		}
		if (expected <= 0 || !etagsMatch(response.headers.etag, file.etag)) {
			discardResponse(response);
			log.info(`[LocalModelArchitecture] Unexpected HTTP ${response.status} from ${hostForLog(url)}`);
			return { kind: 'unknown', reason: 'http' };
		}
		let bytes: Uint8Array;
		try {
			bytes = await readResponsePrefix(response, expected, signal);
		} catch {
			if (signal.aborted) {
				throw new LocalModelDownloadError('cancelled');
			}
			return { kind: 'unknown', reason: 'network' };
		}
		return bytes.byteLength === expected ? { kind: 'bytes', bytes } : { kind: 'unknown', reason: 'network' };
	}
	return { kind: 'unknown', reason: 'network' };
}

/** Reads at most `maxBytes` of a response body, then drops the connection. */
function readResponsePrefix(response: ILocalModelHttpResponse, maxBytes: number, signal: AbortSignal): Promise<Uint8Array> {
	return new Promise<Uint8Array>((resolve, reject) => {
		const chunks: VSBuffer[] = [];
		let bytes = 0;
		let settled = false;
		const settle = (error: Error | undefined) => {
			if (settled) {
				return;
			}
			settled = true;
			signal.removeEventListener('abort', onAbort);
			discardResponse(response);
			if (error) {
				reject(error);
			} else {
				resolve(VSBuffer.concat(chunks).buffer.subarray(0, Math.min(bytes, maxBytes)));
			}
		};
		const onAbort = () => settle(new LocalModelDownloadError('cancelled'));
		if (signal.aborted) {
			onAbort();
			return;
		}
		signal.addEventListener('abort', onAbort);
		// `error` and `end` before `data` (see readResponseText).
		response.body.on('error', error => settle(error instanceof Error ? error : new Error(String(error))));
		response.body.on('end', () => settle(undefined));
		response.body.on('data', chunk => {
			chunks.push(chunk);
			bytes += chunk.byteLength;
			if (bytes >= maxBytes) {
				settle(undefined);
			}
		});
	});
}

// #endregion

// #region Telemetry

/** `localModel.setup`: one event per acquisition phase outcome. */
export interface ILocalModelSetupEvent {
	phase: 'download' | 'verify' | 'complete' | 'update' | 'adopt';
	outcome: string;
	errorCode: string;
	registry: string;
	pausedReason: string;
	autoResumed: boolean;
	resumed: boolean;
	sasRefreshes: number;
	durationMs: number;
	totalBytes: number;
	dflashSupported: boolean;
	/** {@link toTelemetryArchitecture} of the model's architecture; empty when it was not read. */
	architecture: string;
	/** The architecture probe result (`supported`, `unsupported` or `unknown`); empty when it did not run. */
	architectureSupport: string;
}

type LocalModelSetupClassification = {
	phase: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Acquisition phase: download, verify, complete, update or adopt.' };
	outcome: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Outcome of the phase: success, failed, cancelled or paused.' };
	errorCode: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Closed-set error code when the phase failed (for example network, integrity, insufficientMemory); empty on success.' };
	registry: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Azure ML registry the content came from (azureml).' };
	pausedReason: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Why the operation paused, when it did.' };
	autoResumed: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Whether the operation resumed automatically after a quit or crash.' };
	resumed: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Whether a partial download was resumed with a Range request.' };
	sasRefreshes: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'How many times expired download URLs were re-resolved.' };
	durationMs: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Duration of the phase in milliseconds.' };
	totalBytes: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Total bytes of the files involved in the phase.' };
	dflashSupported: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Whether the resolved llama-server supports DFlash speculative decoding.' };
	architecture: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The model architecture read from its GGUF header before the download, from a fixed allowlist of public llama.cpp architecture names; other for any other name; empty when it was not read.' };
	architectureSupport: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Whether the resolved llama.cpp build supports that architecture: supported, unsupported or unknown; empty when it was not checked.' };
	owner: 'lramos15';
	comment: 'On-device model acquisition funnel: model download outcomes.';
};

/** Emits `localModel.setup`. */
export function reportLocalModelSetup(telemetryService: Pick<ITelemetryService, 'publicLog2'>, event: ILocalModelSetupEvent): void {
	telemetryService.publicLog2<ILocalModelSetupEvent, LocalModelSetupClassification>('localModel.setup', event);
}

/** A model architecture for telemetry: a name from the allowlist of public llama.cpp architectures, `other`, or empty when unknown. Pure. */
export function toTelemetryArchitecture(architecture: string | undefined): string {
	if (!architecture) {
		return '';
	}
	return LOCAL_MODEL_TELEMETRY_ARCHITECTURES.includes(architecture) ? architecture : 'other';
}

// #endregion
