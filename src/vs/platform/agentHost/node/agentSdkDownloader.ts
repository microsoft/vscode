/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs';
import * as tar from 'tar';
import { VSBuffer } from '../../../base/common/buffer.js';
import { CancellationToken } from '../../../base/common/cancellation.js';
import { CancellationError } from '../../../base/common/errors.js';
import { Emitter, Event } from '../../../base/common/event.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import * as path from '../../../base/common/path.js';
import { format2 } from '../../../base/common/strings.js';
import { URI } from '../../../base/common/uri.js';
import { generateUuid } from '../../../base/common/uuid.js';
import { detectLibcSync, type LibcFamily } from '../../../base/node/libc.js';
import { INativeEnvironmentService } from '../../environment/common/environment.js';
import { FileOperationError, FileOperationResult, IFileService, toFileOperationResult } from '../../files/common/files.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';
import { ILogService } from '../../log/common/log.js';
import { IProductService } from '../../product/common/productService.js';
import { IRequestService } from '../../request/common/request.js';
import { IRequestContext } from '../../../base/parts/request/common/request.js';

// #region Per-package strategy

/**
 * One agent-SDK package the downloader can fetch. Holds the per-package
 * knowledge that varies between Claude, Codex, and any future provider —
 * the package id, the env var that acts as a dev override, and one
 * boolean covering the only mapping detail that differs between SDKs
 * today (Claude has separate `linux-*-musl` SKUs; Codex's Linux binary
 * is statically musl-linked and ships as a single `linux-*` SKU).
 *
 * The downloader itself is package-agnostic: it consumes this interface and
 * never branches on `id`. Concrete `IAgentSdkPackage` instances live in
 * their owning agent module (e.g. `ClaudeSdkPackage` in
 * `claude/claudeAgentSdkService.ts`, `CodexSdkPackage` in
 * `codex/codexAgent.ts`) so Claude-specific / Codex-specific knowledge
 * stays in those modules — the downloader doesn't name the providers it
 * serves.
 *
 * Each shipped `product.json` carries one `{version, urlTemplate}` per
 * SDK. The downloader substitutes `{sdkTarget}` (resolved via
 * `resolveSdkTarget(pkg)`) into the template to get the per-target
 * tarball URL. This shape supports macOS Universal builds, where the
 * same `product.json` is shared by arm64 and x64 launches.
 */
export interface IAgentSdkPackage {
	/** Key under `product.agentSdks` — e.g. `'claude'`, `'codex'`. */
	readonly id: string;
	/**
	 * Brand display name for user-facing progress, e.g. `'Claude'`, `'Codex'`.
	 * The downloader puts this on {@link IAgentSdkDownloadProgress.displayName}
	 * so clients can build a localized "Downloading {displayName} agent" label.
	 */
	readonly displayName: string;
	/** Env var that, when set, becomes the SDK root and short-circuits the download. */
	readonly devOverrideEnvVar: string;
	/**
	 * True iff this SDK publishes separate `linux-{x64,arm64}-musl`
	 * packages alongside the glibc default. Claude does; Codex doesn't
	 * (its Linux binary is statically musl-linked and runs on both).
	 */
	readonly hasSeparateMuslLinuxPackage: boolean;
}

/**
 * Per-host info used by `resolveSdkTarget`. Defaulted from the running
 * process; tests inject synthetic values to exercise targets the test
 * host doesn't actually run on (Universal-launch case, musl, etc.).
 */
export interface ISdkTargetHost {
	readonly platform: NodeJS.Platform;
	readonly arch: string;
	readonly libc: LibcFamily | undefined;
}

const SUPPORTED_PLATFORMS = new Set<NodeJS.Platform>(['linux', 'darwin', 'win32']);
const SUPPORTED_ARCHES = new Set<string>(['x64', 'arm64']);

/**
 * Resolves the build's `sdkTarget` suffix for the given host. Defaults
 * to the current Node process — production callers omit `host`; tests
 * pass a synthetic host to cover targets the test machine can't reach
 * (Universal launches from a single-arch host, musl Linux on macOS CI,
 * etc.).
 *
 *   - claude on glibc Linux: `linux-x64` / `linux-arm64`
 *   - claude on musl Linux:  `linux-x64-musl` / `linux-arm64-musl`
 *   - codex Linux (any libc): `linux-x64` / `linux-arm64`
 *   - everywhere else:       `<platform>-<arch>`
 *
 * Returns `undefined` when no SDK applies (`armhf`, web, etc.); the
 * downloader treats that the same as "no product config" and never
 * registers the provider.
 *
 * Mirror of the build pipeline's `getSdkTargetForBuild` (in
 * `build/agent-sdk/common.ts`) translated from build-time
 * `vscodePlatform` to runtime `process.platform` + libc detection.
 * Keep the two in sync when adding new target SKUs.
 */
export function resolveSdkTarget(
	pkg: Pick<IAgentSdkPackage, 'hasSeparateMuslLinuxPackage'>,
	host: ISdkTargetHost = { platform: process.platform, arch: process.arch, libc: detectLibcSync() },
): string | undefined {
	if (!SUPPORTED_PLATFORMS.has(host.platform) || !SUPPORTED_ARCHES.has(host.arch)) {
		return undefined;
	}
	if (host.platform === 'linux' && pkg.hasSeparateMuslLinuxPackage && host.libc === 'musl') {
		return `linux-${host.arch}-musl`;
	}
	return `${host.platform}-${host.arch}`;
}

// #endregion

// #region Service decorator

export const IAgentSdkDownloader = createDecorator<IAgentSdkDownloader>('agentSdkDownloader');

/** Lifecycle phase of a single SDK download (downloader-internal). */
export type AgentSdkDownloadPhase = 'started' | 'progress' | 'completed' | 'failed';

/**
 * A process-global download-progress sample fired on
 * {@link IAgentSdkDownloader.onDidDownloadProgress}. The downloader owns the
 * lifecycle: one `started`, throttled `progress` frames, then exactly one
 * terminal `completed` / `failed` — all sharing a `downloadId`. Concurrent
 * `loadSdkRoot` callers for the same tarball are deduped, so they observe one
 * shared download (one `downloadId`).
 */
export interface IAgentSdkDownloadProgress {
	/** Stable id for one download; coalesces frames and distinguishes concurrent fetches. */
	readonly downloadId: string;
	/** Package id, e.g. `'claude'` / `'codex'`. */
	readonly packageId: string;
	/** Brand display name, e.g. `'Claude'`. */
	readonly displayName: string;
	/** Lifecycle phase of this frame. */
	readonly phase: AgentSdkDownloadPhase;
	/** Bytes written so far. Monotonically non-decreasing within a `downloadId`. */
	readonly receivedBytes: number;
	/** Total bytes from `Content-Length`, or `undefined` when unknown (indeterminate). */
	readonly totalBytes: number | undefined;
	/** Short, non-localized failure reason; present only when `phase: 'failed'`. */
	readonly error?: string;
}

export interface IAgentSdkDownloader {
	readonly _serviceBrand: undefined;

	/**
	 * Fires while a tarball is being fetched (cold cache only): one `started`,
	 * throttled `progress` samples, then one terminal `completed` / `failed`.
	 * Never fires for dev-override or cache-hit resolutions (no bytes move).
	 * Process-global so a single subscriber (the protocol server) can forward
	 * progress to clients regardless of which session triggered the fetch.
	 */
	readonly onDidDownloadProgress: Event<IAgentSdkDownloadProgress>;

	/**
	 * Returns the absolute path of the SDK root directory — the directory that
	 * contains the package's `node_modules/` subtree. Callers resolve the
	 * package-specific entrypoint from there themselves.
	 *
	 * Resolution order:
	 *   1. dev-override env var (returned unchanged)
	 *   2. on-disk cache hit (`.complete` sentinel present)
	 *   3. download from `product.agentSdks?.[pkg.id]` with
	 *      `{sdkTarget}` substituted into the urlTemplate
	 *
	 * Repeated failures are latched for {@link LOAD_FAILURE_NEGATIVE_CACHE_MS}
	 * so a misconfigured CDN doesn't get hammered on every SDK method call.
	 */
	loadSdkRoot(pkg: IAgentSdkPackage, token: CancellationToken): Promise<string>;

	/**
	 * Cheap, synchronous gate used at startup to decide whether to register
	 * the corresponding agent provider. True iff the dev override is set, OR
	 * (`product.agentSdks?.[pkg.id]` is populated AND `pkg.currentSdkTarget()`
	 * resolves — i.e. an SDK exists for this host). Does NOT trigger a
	 * download.
	 */
	isAvailable(pkg: IAgentSdkPackage): boolean;

	/**
	 * True iff {@link loadSdkRoot} would resolve WITHOUT a network download —
	 * the dev override is set, or a completed cache for the configured version
	 * already exists on disk. False when product config is present but the
	 * cache is cold (a fetch would be required), and false when neither an
	 * override nor product config is configured.
	 *
	 * Performs at most a single sentinel `exists` check and never downloads.
	 * Eager / background callers (e.g. a provider listing its sessions at
	 * startup) use this to avoid kicking off a multi-second cold download
	 * before the user has asked for anything.
	 */
	isSdkResolvableWithoutDownload(pkg: IAgentSdkPackage): Promise<boolean>;
}

// #endregion

// #region Implementation

/** How long a `loadSdkRoot` failure latches before we try again. */
const LOAD_FAILURE_NEGATIVE_CACHE_MS = 30_000;

/**
 * Minimum gap between download-progress samples. A 70-95MB tarball over a fast
 * link produces thousands of chunks; without throttling we'd flood the progress
 * channel. ~250ms keeps the percentage visibly moving without spamming.
 */
const PROGRESS_EMIT_THROTTLE_MS = 250;

/**
 * Parses a `Content-Length` header into a positive integer byte count, or
 * `undefined` when the header is absent, an array, or not a clean integer.
 */
function parseContentLength(header: string | string[] | undefined): number | undefined {
	if (typeof header !== 'string' || !/^\d+$/.test(header)) {
		return undefined;
	}
	const parsed = parseInt(header, 10);
	return parsed > 0 ? parsed : undefined;
}

export class AgentSdkDownloader extends Disposable implements IAgentSdkDownloader {
	declare readonly _serviceBrand: undefined;

	private readonly _onDidDownloadProgress = this._register(new Emitter<IAgentSdkDownloadProgress>());
	readonly onDidDownloadProgress: Event<IAgentSdkDownloadProgress> = this._onDidDownloadProgress.event;

	/**
	 * In-flight downloads keyed by the destination `cacheDir` (which
	 * already encodes `<pkg>/<sdkVersion>/<sdkTarget>`). Concurrent
	 * `loadSdkRoot` calls in the same process share the same promise so
	 * we never download the same tarball twice. Universal launches that
	 * resolve to different targets get distinct entries because their
	 * cacheDirs differ.
	 */
	private readonly _pendingDownloads = new Map<string, Promise<string>>();

	/**
	 * Negative cache: most recent failure per package id, with an expiry.
	 * While within the window, `loadSdkRoot` re-throws the cached error
	 * immediately instead of re-attempting the download. Without this, a
	 * broken CDN causes every SDK method call (poll-driven UIs hit this
	 * hard) to fire a fresh request.
	 *
	 * Keyed by `pkg.id` (not the finer cacheDir): CDN failures are
	 * effectively global per SDK (DNS, proxy auth, 5xx) and per-target
	 * latching wouldn't protect against the actual failure modes — the
	 * broader latch is intentional.
	 */
	private readonly _failureLatch = new Map<string, { error: Error; expiresAt: number }>();

	constructor(
		@INativeEnvironmentService private readonly _environmentService: INativeEnvironmentService,
		@IProductService private readonly _productService: IProductService,
		@IRequestService private readonly _requestService: IRequestService,
		@IFileService private readonly _fileService: IFileService,
		@ILogService private readonly _logService: ILogService,
	) {
		super();
	}

	isAvailable(pkg: IAgentSdkPackage): boolean {
		if (process.env[pkg.devOverrideEnvVar]) {
			return true;
		}
		return !!this._productService.agentSdks?.[pkg.id] && resolveSdkTarget(pkg) !== undefined;
	}

	async isSdkResolvableWithoutDownload(pkg: IAgentSdkPackage): Promise<boolean> {
		if (process.env[pkg.devOverrideEnvVar]) {
			return true;
		}
		const config = this._productService.agentSdks?.[pkg.id];
		if (!config) {
			return false;
		}
		const sdkTarget = resolveSdkTarget(pkg);
		if (!sdkTarget) {
			return false;
		}
		const sentinel = URI.joinPath(URI.file(this._cacheDir(pkg.id, config.version, sdkTarget)), '.complete');
		return this._fileService.exists(sentinel);
	}

	async loadSdkRoot(pkg: IAgentSdkPackage, token: CancellationToken): Promise<string> {
		// 1. Dev override.
		const override = process.env[pkg.devOverrideEnvVar];
		if (override) {
			this._logService.info(`[AgentSdkDownloader] ${pkg.id}: using dev override at ${override}`);
			return override;
		}

		// 2. Negative cache: a recent failure short-circuits without I/O.
		const latched = this._failureLatch.get(pkg.id);
		if (latched && latched.expiresAt > Date.now()) {
			throw latched.error;
		}

		try {
			const root = await this._resolveOrDownload(pkg, token);
			this._failureLatch.delete(pkg.id);
			return root;
		} catch (err) {
			if (token.isCancellationRequested) {
				// Don't latch cancellations — user intent, not a real failure.
				throw err;
			}
			const error = err instanceof Error ? err : new Error(String(err));
			this._failureLatch.set(pkg.id, {
				error,
				expiresAt: Date.now() + LOAD_FAILURE_NEGATIVE_CACHE_MS,
			});
			throw error;
		}
	}

	private async _resolveOrDownload(pkg: IAgentSdkPackage, token: CancellationToken): Promise<string> {
		const config = this._productService.agentSdks?.[pkg.id];
		if (!config) {
			throw new Error(
				`Cannot load ${pkg.id} SDK: no \`product.agentSdks.${pkg.id}\` configured and ` +
				`no ${pkg.devOverrideEnvVar} dev override set.`,
			);
		}
		const sdkTarget = resolveSdkTarget(pkg);
		if (!sdkTarget) {
			throw new Error(
				`Cannot load ${pkg.id} SDK: no SDK target for this host ` +
				`(${process.platform}/${process.arch}). ` +
				`Set ${pkg.devOverrideEnvVar} to a local SDK root to bypass.`,
			);
		}
		const url = format2(config.urlTemplate, { sdkTarget });
		// `format2` leaves unknown `{placeholder}` segments untouched; catch
		// vscode-distro typos like `{sdkTaret}` here instead of letting the
		// CDN return a 404 against a clearly-broken URL.
		const stray = /{[^}]+}/.exec(url);
		if (stray) {
			throw new Error(
				`Cannot load ${pkg.id} SDK: \`product.agentSdks.${pkg.id}.urlTemplate\` ` +
				`contains an unknown placeholder ${stray[0]} — only {sdkTarget} is substituted. ` +
				`Template: ${config.urlTemplate}`,
			);
		}

		const cacheDir = this._cacheDir(pkg.id, config.version, sdkTarget);
		const sentinel = URI.joinPath(URI.file(cacheDir), '.complete');

		// `.complete`'s mere presence is the integrity signal — extracts
		// that crashed mid-way never write it. See `_download` for why
		// the sentinel is written inside the tmp dir before the rename.
		if (await this._fileService.exists(sentinel)) {
			return cacheDir;
		}

		// Download (deduped across concurrent callers in the same process).
		// cacheDir is already unique per (pkg, version, sdkTarget) — within
		// a single downloader instance userDataPath is fixed, so it serves
		// as the dedup key without an extra string allocation.
		let pending = this._pendingDownloads.get(cacheDir);
		if (!pending) {
			pending = this._download(pkg, url, cacheDir, sentinel, token).finally(() => {
				this._pendingDownloads.delete(cacheDir);
			});
			this._pendingDownloads.set(cacheDir, pending);
		}
		return pending;
	}

	private _cacheDir(packageId: string, sdkVersion: string, sdkTarget: string): string {
		// `sdkTarget` is in the path so macOS Universal builds keep two
		// independent caches — one per resolved target — instead of
		// thrashing a single shared one as launches alternate.
		return path.join(
			this._environmentService.userDataPath,
			'agent-host',
			'sdk-cache',
			packageId,
			sdkVersion,
			sdkTarget,
		);
	}

	private async _download(
		pkg: IAgentSdkPackage,
		url: string,
		cacheDir: string,
		sentinel: URI,
		token: CancellationToken,
	): Promise<string> {
		this._logService.info(`[AgentSdkDownloader] ${pkg.id}: downloading from ${url}`);
		const start = Date.now();
		const parent = path.dirname(cacheDir);
		await this._fileService.createFolder(URI.file(parent));

		// Extract to a per-pid scratch dir alongside the final cache dir, then
		// rename into place. If two windows of the same install race, the loser
		// catches the `move`'s `FILE_MOVE_CONFLICT`, checks the existing
		// .complete sentinel, and uses that instead — see the rename-loser
		// path below.
		const tmpDir = `${cacheDir}.tmp.${process.pid}`;
		const tmpDirUri = URI.file(tmpDir);
		await this._delIgnoringMissing(tmpDirUri);
		await this._fileService.createFolder(tmpDirUri);

		// Fire the download lifecycle on the process-global event so a single
		// subscriber (the protocol server) can forward it to clients. One
		// `started`, throttled `progress` from `_fetch`, then a terminal frame.
		const downloadId = generateUuid();
		let lastReceived = 0;
		let lastTotal: number | undefined;
		this._fireProgress(pkg, downloadId, 'started', 0, undefined);

		try {
			const tarballPath = path.join(tmpDir, 'sdk.tgz');
			await this._fetch(url, tarballPath, token, (receivedBytes, totalBytes) => {
				lastReceived = receivedBytes;
				lastTotal = totalBytes;
				this._fireProgress(pkg, downloadId, 'progress', receivedBytes, totalBytes);
			});
			await this._extractTarGz(tarballPath, tmpDir);
			await this._fileService.del(URI.file(tarballPath));

			// Write the `.complete` sentinel inside the tmp dir BEFORE the
			// move so the move atomically publishes a directory that
			// already carries its sentinel — a crash between move and
			// sentinel-write can't leave a wedged, sentinel-less cacheDir
			// behind. Content is intentionally empty: only existence
			// matters, and the cache dir path already encodes
			// `<pkg>/<version>/<sdkTarget>` for debugging.
			await this._fileService.writeFile(
				URI.joinPath(tmpDirUri, '.complete'),
				VSBuffer.fromString(''),
			);

			// Atomic publish of the completed extraction.
			try {
				await this._fileService.move(tmpDirUri, URI.file(cacheDir));
			} catch (err) {
				if (await this._handleRenameLoser(err, sentinel, tmpDirUri)) {
					this._logService.info(`[AgentSdkDownloader] ${pkg.id}: lost rename race, using existing cache`);
					this._fireProgress(pkg, downloadId, 'completed', lastReceived, lastTotal);
					return cacheDir;
				}
				throw err;
			}

			const elapsed = Math.round((Date.now() - start) / 1000);
			this._logService.info(`[AgentSdkDownloader] ${pkg.id}: downloaded in ${elapsed}s`);
			this._fireProgress(pkg, downloadId, 'completed', lastTotal ?? lastReceived, lastTotal);
			return cacheDir;
		} catch (err) {
			await this._delIgnoringMissing(tmpDirUri);
			if (token.isCancellationRequested) {
				this._fireProgress(pkg, downloadId, 'failed', lastReceived, lastTotal, 'cancelled');
				throw new CancellationError();
			}
			const message = err instanceof Error ? err.message : String(err);
			this._fireProgress(pkg, downloadId, 'failed', lastReceived, lastTotal, message);
			throw new Error(
				`Failed to download ${pkg.id} SDK from ${url} ` +
				`(cache target: ${cacheDir}). ` +
				`Set ${pkg.devOverrideEnvVar} to a local SDK root to bypass. ` +
				`Cause: ${message}`,
			);
		}
	}

	private _fireProgress(
		pkg: IAgentSdkPackage,
		downloadId: string,
		phase: AgentSdkDownloadPhase,
		receivedBytes: number,
		totalBytes: number | undefined,
		error?: string,
	): void {
		this._onDidDownloadProgress.fire({
			downloadId,
			packageId: pkg.id,
			displayName: pkg.displayName,
			phase,
			receivedBytes,
			totalBytes,
			...(error !== undefined ? { error } : {}),
		});
	}

	private async _handleRenameLoser(
		err: unknown,
		sentinel: URI,
		tmpDirUri: URI,
	): Promise<boolean> {
		// `IFileService.move` with default (overwrite: false) throws a
		// FileOperationError with FILE_MOVE_CONFLICT when the target exists.
		// Anything else is a real error.
		if (!(err instanceof FileOperationError) || err.fileOperationResult !== FileOperationResult.FILE_MOVE_CONFLICT) {
			return false;
		}
		if (!(await this._fileService.exists(sentinel))) {
			return false;
		}
		// Winner already published a complete cache. Drop our scratch dir.
		await this._delIgnoringMissing(tmpDirUri);
		return true;
	}

	private async _fetch(
		url: string,
		dest: string,
		token: CancellationToken,
		onBytes?: (receivedBytes: number, totalBytes: number | undefined) => void,
	): Promise<void> {
		// Delegate to IRequestService (corporate proxy, strictSSL, kerberos,
		// retries, redirect follow). `fs.createWriteStream` (not
		// `IFileService.writeFile`) so that cancelling a multi-MB download
		// aborts promptly via destroy(). Manual pipe (not `stream.pipeline`)
		// because the source is a VSBufferReadableStream — not a Node
		// Readable — so node-stream utilities can't introspect it.
		if (token.isCancellationRequested) {
			throw new CancellationError();
		}
		const context: IRequestContext = await this._requestService.request({
			url,
			type: 'GET',
			callSite: 'agentSdkDownloader',
		}, token);
		if (token.isCancellationRequested) {
			context.stream.destroy();
			throw new CancellationError();
		}

		const statusCode = context.res.statusCode ?? 0;
		if (statusCode < 200 || statusCode >= 300) {
			context.stream.destroy();
			throw new Error(`HTTP ${statusCode} fetching ${url}`);
		}

		// The CDN sends `Content-Length` for these static tarballs, which lets
		// us report determinate percentage progress. A missing/garbled header
		// degrades gracefully to an indeterminate (byte-count only) report.
		const totalBytes = parseContentLength(context.res.headers['content-length']);

		await new Promise<void>((resolve, reject) => {
			const out = fs.createWriteStream(dest);
			let settled = false;
			// Throttle progress so a fast link doesn't fire thousands of
			// samples. The first chunk always passes (lastEmit starts at 0)
			// and 'end' forces a final sample, so consumers see a start and a
			// 100% finish regardless of chunk timing.
			let receivedBytes = 0;
			let lastEmitTime = 0;
			const emitBytes = (force: boolean) => {
				if (!onBytes) {
					return;
				}
				const now = Date.now();
				if (!force && now - lastEmitTime < PROGRESS_EMIT_THROTTLE_MS) {
					return;
				}
				lastEmitTime = now;
				onBytes(receivedBytes, totalBytes);
			};
			const settleResolve = () => {
				if (settled) { return; }
				settled = true;
				cancelSub.dispose();
				resolve();
			};
			const settleReject = (err: unknown) => {
				if (settled) { return; }
				settled = true;
				cancelSub.dispose();
				context.stream.destroy();
				out.destroy();
				reject(err);
			};
			const cancelSub = token.onCancellationRequested(() => settleReject(new CancellationError()));
			out.on('error', settleReject);
			out.on('finish', settleResolve);
			// Backpressure: tarballs are 70-95MB; if the disk is slower
			// than the network (Windows AV scan, network home dir, …) an
			// unthrottled pipe buffers the whole thing in memory. Pause the
			// source when the sink's internal buffer hits highWaterMark and
			// resume on 'drain'.
			out.on('drain', () => context.stream.resume());
			context.stream.on('data', chunk => {
				receivedBytes += chunk.byteLength;
				emitBytes(false);
				if (!out.write(chunk.buffer)) {
					context.stream.pause();
				}
			});
			context.stream.on('end', () => {
				emitBytes(true);
				out.end();
			});
			context.stream.on('error', settleReject);
		});
	}

	private async _extractTarGz(tarball: string, dest: string): Promise<void> {
		// `tar` (node-tar) is pure JS — works on every platform the agent host
		// runs on without depending on a system `tar` binary.
		await tar.x({ file: tarball, cwd: dest });
	}

	private async _delIgnoringMissing(uri: URI): Promise<void> {
		try {
			await this._fileService.del(uri, { recursive: true });
		} catch (err) {
			// `force: true` behaviour: missing path is a no-op.
			if (toFileOperationResult(err as Error) !== FileOperationResult.FILE_NOT_FOUND) {
				throw err;
			}
		}
	}
}

// #endregion
