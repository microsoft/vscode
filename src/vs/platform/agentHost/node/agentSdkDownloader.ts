/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as crypto from 'crypto';
import * as fs from 'fs';
import * as tar from 'tar';
import { VSBuffer } from '../../../base/common/buffer.js';
import { CancellationToken } from '../../../base/common/cancellation.js';
import { CancellationError } from '../../../base/common/errors.js';
import * as path from '../../../base/common/path.js';
import { URI } from '../../../base/common/uri.js';
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
 * just the package id and the env var that acts as a dev override.
 *
 * The downloader itself is package-agnostic: it consumes this interface and
 * never branches on `id`. Concrete `IAgentSdkPackage` instances live in
 * their owning agent module (e.g. `ClaudeSdkPackage` in
 * `claude/claudeAgentSdkService.ts`, `CodexSdkPackage` in
 * `codex/codexAgent.ts`) so Claude-specific / Codex-specific knowledge
 * stays in those modules — the downloader doesn't name the providers it
 * serves.
 *
 * Platform discrimination is done at packaging time: the build sets
 * `product.agentSdks[pkg]` to the `{ version, url, sha256 }` appropriate
 * for the platform being packaged, so there is no per-target lookup at
 * runtime.
 */
export interface IAgentSdkPackage {
	/** Key under `product.agentSdks` — e.g. `'claude'`, `'codex'`. */
	readonly id: string;
	/** Env var that, when set, becomes the SDK root and short-circuits the download. */
	readonly devOverrideEnvVar: string;
}

// #endregion

// #region Service decorator

export const IAgentSdkDownloader = createDecorator<IAgentSdkDownloader>('agentSdkDownloader');

export interface IAgentSdkDownloader {
	readonly _serviceBrand: undefined;

	/**
	 * Returns the absolute path of the SDK root directory — the directory that
	 * contains the package's `node_modules/` subtree. Callers resolve the
	 * package-specific entrypoint from there themselves.
	 *
	 * Resolution order:
	 *   1. dev-override env var (returned unchanged)
	 *   2. on-disk cache hit (re-verified against `product.json` sha256)
	 *   3. download from `product.agentSdks?.[pkg.id]` and verify
	 *
	 * Repeated failures are latched for {@link LOAD_FAILURE_NEGATIVE_CACHE_MS}
	 * so a misconfigured CDN doesn't get hammered on every SDK method call.
	 */
	loadSdkRoot(pkg: IAgentSdkPackage, token: CancellationToken): Promise<string>;

	/**
	 * Cheap, synchronous gate used at startup to decide whether to register
	 * the corresponding agent provider. True iff the dev override is set, OR
	 * `product.agentSdks?.[pkg.id]` is populated (which it only is on the
	 * platform that build packaged for). Does NOT trigger a download.
	 */
	isAvailable(pkg: IAgentSdkPackage): boolean;
}

// #endregion

// #region Implementation

/** How long a `loadSdkRoot` failure latches before we try again. */
const LOAD_FAILURE_NEGATIVE_CACHE_MS = 30_000;

export class AgentSdkDownloader implements IAgentSdkDownloader {
	declare readonly _serviceBrand: undefined;

	/**
	 * In-flight downloads keyed by `<pkg>/<sdkVersion>`. Concurrent
	 * `loadSdkRoot` calls in the same process share the same promise so we
	 * never download the same tarball twice.
	 */
	private readonly _pendingDownloads = new Map<string, Promise<string>>();

	/**
	 * Negative cache: most recent failure per package id, with an expiry. While
	 * within the window, `loadSdkRoot` re-throws the cached error immediately
	 * instead of re-attempting the download. Without this, a broken CDN /
	 * mismatched sha causes every SDK method call (poll-driven UIs hit this
	 * hard) to fire a fresh request.
	 */
	private readonly _failureLatch = new Map<string, { error: Error; expiresAt: number }>();

	constructor(
		@INativeEnvironmentService private readonly _environmentService: INativeEnvironmentService,
		@IProductService private readonly _productService: IProductService,
		@IRequestService private readonly _requestService: IRequestService,
		@IFileService private readonly _fileService: IFileService,
		@ILogService private readonly _logService: ILogService,
	) { }

	isAvailable(pkg: IAgentSdkPackage): boolean {
		return !!process.env[pkg.devOverrideEnvVar] || !!this._productService.agentSdks?.[pkg.id];
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
		const expectedSha = config.sha256;

		const cacheDir = this._cacheDir(pkg.id, config.version);
		const sentinel = URI.joinPath(URI.file(cacheDir), '.complete');

		// Cache hit (always re-verify against product.json sha256).
		if (await this._cacheHit(sentinel, expectedSha)) {
			return cacheDir;
		}
		// Drop a stale cache before re-downloading — covers the vscode-distro
		// "same version, different sha" case.
		if (await this._fileService.exists(sentinel)) {
			this._logService.warn(`[AgentSdkDownloader] ${pkg.id}@${config.version}: cache sha mismatch, redownloading`);
			await this._delIgnoringMissing(URI.file(cacheDir));
		}

		// Download (deduped across concurrent callers in the same process).
		const key = `${pkg.id}/${config.version}`;
		let pending = this._pendingDownloads.get(key);
		if (!pending) {
			pending = this._download(pkg, config.url, expectedSha, cacheDir, sentinel, token).finally(() => {
				this._pendingDownloads.delete(key);
			});
			this._pendingDownloads.set(key, pending);
		}
		return pending;
	}

	private _cacheDir(packageId: string, sdkVersion: string): string {
		return path.join(
			this._environmentService.userDataPath,
			'agent-host',
			'sdk-cache',
			packageId,
			sdkVersion,
		);
	}

	/**
	 * True iff the `.complete` sentinel at {@link sentinel} exists and contains
	 * `expectedSha`. Shared by the fast-path cache check and the rename-loser
	 * race recovery.
	 */
	private async _cacheHit(sentinel: URI, expectedSha: string): Promise<boolean> {
		if (!(await this._fileService.exists(sentinel))) {
			return false;
		}
		const recorded = await this._readFileText(sentinel);
		return recorded.trim() === expectedSha;
	}

	private async _download(
		pkg: IAgentSdkPackage,
		url: string,
		expectedSha: string,
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
		// catches the `move`'s `FILE_MOVE_CONFLICT`, verifies the existing
		// .complete sha, and uses that instead — see the rename-loser path below.
		const tmpDir = `${cacheDir}.tmp.${process.pid}`;
		const tmpDirUri = URI.file(tmpDir);
		await this._delIgnoringMissing(tmpDirUri);
		await this._fileService.createFolder(tmpDirUri);

		try {
			const tarballPath = path.join(tmpDir, 'sdk.tgz');
			await this._fetchAndVerify(url, tarballPath, expectedSha, token);
			await this._extractTarGz(tarballPath, tmpDir);
			await this._fileService.del(URI.file(tarballPath));

			// Write the `.complete` sentinel inside the tmp dir BEFORE the move.
			// That way the move atomically publishes a directory that already
			// carries its sentinel — a crash between move and sentinel-write
			// can't leave a wedged, sentinel-less cacheDir behind (which would
			// trip `_handleRenameLoser` on the next attempt and require a
			// manual cache wipe to recover).
			await this._fileService.writeFile(
				URI.joinPath(tmpDirUri, '.complete'),
				VSBuffer.fromString(expectedSha),
			);

			// Atomic publish of the completed extraction.
			try {
				await this._fileService.move(tmpDirUri, URI.file(cacheDir));
			} catch (err) {
				if (await this._handleRenameLoser(err, sentinel, expectedSha, tmpDirUri)) {
					this._logService.info(`[AgentSdkDownloader] ${pkg.id}: lost rename race, using existing cache`);
					return cacheDir;
				}
				throw err;
			}

			const elapsed = Math.round((Date.now() - start) / 1000);
			this._logService.info(`[AgentSdkDownloader] ${pkg.id}: downloaded + verified in ${elapsed}s`);
			return cacheDir;
		} catch (err) {
			await this._delIgnoringMissing(tmpDirUri);
			if (token.isCancellationRequested) {
				throw new CancellationError();
			}
			throw new Error(
				`Failed to download ${pkg.id} SDK from ${url} ` +
				`(cache target: ${cacheDir}). ` +
				`Set ${pkg.devOverrideEnvVar} to a local SDK root to bypass. ` +
				`Cause: ${err instanceof Error ? err.message : String(err)}`,
			);
		}
	}

	private async _handleRenameLoser(
		err: unknown,
		sentinel: URI,
		expectedSha: string,
		tmpDirUri: URI,
	): Promise<boolean> {
		// `IFileService.move` with default (overwrite: false) throws a
		// FileOperationError with FILE_MOVE_CONFLICT when the target exists.
		// Anything else is a real error.
		if (!(err instanceof FileOperationError) || err.fileOperationResult !== FileOperationResult.FILE_MOVE_CONFLICT) {
			return false;
		}
		if (!(await this._cacheHit(sentinel, expectedSha))) {
			return false;
		}
		// Winner already published a matching cache. Drop our scratch dir.
		await this._delIgnoringMissing(tmpDirUri);
		return true;
	}

	private async _fetchAndVerify(url: string, dest: string, expectedSha: string, token: CancellationToken): Promise<void> {
		// Delegate to IRequestService (corporate proxy, strictSSL, kerberos,
		// retries, redirect follow). We tee the network stream through a
		// sha256 hasher AND a write stream so the tarball is verified on
		// the way in — one pass instead of writing then re-reading.
		// `fs.createWriteStream` (not `IFileService.writeFile`) so that
		// cancelling a multi-MB download aborts promptly via destroy().
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

		const hash = crypto.createHash('sha256');
		await new Promise<void>((resolve, reject) => {
			const out = fs.createWriteStream(dest);
			let settled = false;
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
			context.stream.on('data', chunk => { hash.update(chunk.buffer); out.write(chunk.buffer); });
			context.stream.on('end', () => out.end());
			context.stream.on('error', settleReject);
		});

		const actualSha = hash.digest('hex');
		if (actualSha !== expectedSha) {
			throw new Error(`sha256 mismatch: expected ${expectedSha}, got ${actualSha}`);
		}
	}

	private async _extractTarGz(tarball: string, dest: string): Promise<void> {
		// `tar` (node-tar) is pure JS — works on every platform the agent host
		// runs on without depending on a system `tar` binary.
		await tar.x({ file: tarball, cwd: dest });
	}

	private async _readFileText(uri: URI): Promise<string> {
		try {
			const content = await this._fileService.readFile(uri);
			return content.value.toString();
		} catch {
			return '';
		}
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
