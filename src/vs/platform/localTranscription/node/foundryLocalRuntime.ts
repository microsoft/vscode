/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs';
import * as os from 'os';
import { timeout } from '../../../base/common/async.js';
import { dirname, join } from '../../../base/common/path.js';
import { format2 } from '../../../base/common/strings.js';
import { CancellationToken } from '../../../base/common/cancellation.js';
import { CancellationError } from '../../../base/common/errors.js';

/**
 * On-demand provisioning of the Foundry Local native runtime used by on-device
 * dictation.
 *
 * `foundry-local-sdk` ships two prebuilt N-API addons (`foundry_local_node.node`
 * and `foundry_local_preload.node`) and native libraries (Foundry Local + ONNX
 * Runtime + ONNX Runtime GenAI). The shared libraries require a newer glibc than
 * VS Code's minimum supported Linux distros, so we bundle only the addons with
 * the product (see `build/gulpfile.vscode.ts`). We republish the per-target
 * shared libraries to VS Code's CDN at build time (see
 * `build/dictation-runtime/`) and download them here, at runtime, into a
 * per-user writable cache. This keeps the shipped package's glibc floor intact
 * and avoids any runtime dependency on the npm registry or NuGet.
 *
 * The tarball's internal layout mirrors the SDK's own package layout:
 *
 *   <cacheRoot>/<version>/prebuilds/<target>/<shared libraries>
 *
 * The SDK keeps its addons in the packaged npm module and is configured through
 * `configureNativeLoader`/`FoundryLocalConfig.libraryPath` to preload the shared
 * libraries from this cache directory.
 *
 * NOTE: the single CDN download leg honors the standard proxy environment
 * variables (`HTTPS_PROXY`/`HTTP_PROXY`/`ALL_PROXY`, with `NO_PROXY`). VS Code's
 * `http.proxy`/`http.noProxy` settings are applied as these same environment
 * variables before provisioning (see `LocalTranscriptionService.start`), so a
 * proxy configured only in VS Code is honored here and by the native model
 * download too; `http.proxyAuthorization` (Basic) is folded into the proxy URL
 * and `http.proxyStrictSSL === false` disables TLS verification for this leg.
 * TLS-intercepting proxies otherwise rely on the CA being in the OS trust store.
 */

/**
 * Platforms (`<process.platform>-<process.arch>`) for which Foundry Local ships
 * native addons and libraries. Mirrors the SDK installer's RID map.
 */
export const FOUNDRY_LOCAL_SUPPORTED_PLATFORMS: ReadonlySet<string> = new Set([
	'darwin-arm64',
	'linux-x64',
	'linux-arm64',
	'win32-x64',
	'win32-arm64',
]);

/** The current host platform key, or `undefined` if Foundry Local can't run here. */
export function foundryLocalPlatformKey(): string | undefined {
	const key = `${process.platform}-${process.arch}`;
	return FOUNDRY_LOCAL_SUPPORTED_PLATFORMS.has(key) ? key : undefined;
}

/** Whether on-device dictation's native runtime can run on this host. */
export function isFoundryLocalRuntimeSupported(): boolean {
	return foundryLocalPlatformKey() !== undefined;
}

/** Progress callback invoked while the native runtime is being fetched. */
export type FoundryLocalRuntimeProgress = (message: string) => void;

/** Where the native runtime tarball is published (from `product.dictationRuntime`). */
export interface IFoundryLocalRuntimeDownload {
	/** CDN URL template with a `{target}` placeholder for the host platform key. */
	readonly urlTemplate: string;
	/** The published runtime version (the pinned `foundry-local-sdk` version). */
	readonly version: string;
}

/** De-dupes concurrent provisioning requests targeting the same cache dir. */
const inFlight = new Map<string, Promise<string>>();

/** Abort a download after this long without any connection/response progress. */
const DOWNLOAD_INACTIVITY_TIMEOUT_MS = 60_000;
const PUBLISH_LOCK_RETRY_MS = 100;
const INVALID_PUBLISH_LOCK_STALE_MS = 30_000;

/**
 * Ensure the Foundry Local shared libraries are present in `<cacheRoot>`,
 * downloading the per-target CDN tarball if necessary. Returns the concrete
 * cached `prebuilds/<target>` directory to use as the SDK's `libraryPath`
 * before constructing a manager.
 *
 * Idempotent: once a version is fully provisioned a per-platform `.complete`
 * marker is written and subsequent calls return immediately (after verifying the
 * payload) without touching the network.
 */
export async function ensureFoundryLocalRuntime(cacheRoot: string, download: IFoundryLocalRuntimeDownload, token: CancellationToken, onProgress?: FoundryLocalRuntimeProgress): Promise<string> {
	const platformKey = foundryLocalPlatformKey();
	if (!platformKey) {
		throw new Error(`Foundry Local native runtime is not available on ${process.platform}-${process.arch}.`);
	}

	const overrideDir = join(cacheRoot, download.version);
	const libraryPath = foundryPrebuildDir(overrideDir, platformKey);

	// A single in-flight provisioning per override dir; late joiners share it.
	const existing = inFlight.get(libraryPath);
	if (existing) {
		return existing;
	}
	const promise = doEnsure(overrideDir, platformKey, download, token, onProgress)
		.finally(() => inFlight.delete(libraryPath));
	inFlight.set(libraryPath, promise);
	return promise;
}

async function doEnsure(overrideDir: string, platformKey: string, download: IFoundryLocalRuntimeDownload, token: CancellationToken, onProgress?: FoundryLocalRuntimeProgress): Promise<string> {
	// The completion marker is per-platform: the shared `<cacheRoot>/<version>`
	// dir can hold payloads for multiple architectures (e.g. a win32-arm64
	// machine running x64 VS Code under emulation, then arm64 VS Code). Verify
	// the target-specific payload as well as the marker, so a different arch's
	// marker never short-circuits this arch's provisioning and a stale/partially
	// deleted cache is repaired rather than trusted.
	if (isRuntimeProvisioned(overrideDir, platformKey)) {
		return foundryPrebuildDir(overrideDir, platformKey);
	}

	// Fail fast (before any download) when the host can't actually load the
	// addon — e.g. Linux with glibc older than the addon requires — so users see
	// a clear "unsupported" error instead of a large download that crashes on
	// native import.
	assertRuntimeLoadable(platformKey);

	onProgress?.('Downloading dictation runtime…');
	await provisionRuntime(overrideDir, platformKey, download.urlTemplate, download.version, token);
	return foundryPrebuildDir(overrideDir, platformKey);
}

/**
 * Download the `{target}`-substituted CDN tarball for `platformKey` into
 * `overrideDir`, extract + verify + atomically promote its payload, and write the
 * per-platform completion marker. Host-independent (does NOT run the glibc
 * loadability gate); exported for tests. Callers that provision for the running
 * host should use `ensureFoundryLocalRuntime`, which gates and de-dupes.
 */
export async function provisionRuntime(overrideDir: string, platformKey: string, urlTemplate: string, version: string, token: CancellationToken): Promise<void> {
	const targetDir = foundryPrebuildDir(overrideDir, platformKey);

	// The cache is shared by the utility processes of every open VS Code window,
	// so provision into a process-unique staging dir and atomically promote each
	// payload directory into place. Two concurrent first-use downloads therefore
	// never write to the same final path; whichever process wins the rename is
	// the published copy and the loser accepts it as success.
	const url = format2(urlTemplate, { target: platformKey });
	const staging = join(overrideDir, `.staging-${process.pid}-${randomSuffix()}`);
	const stagingTarget = foundryPrebuildDir(staging, platformKey);
	try {
		await downloadAndExtractTarball(url, staging, token);
		throwIfCancelled(token);

		if (!hasAllRuntimeFiles(stagingTarget, platformKey)) {
			throw new Error(`Foundry Local native runtime download from ${url} completed but expected files are missing.`);
		}

		await publishRuntime(stagingTarget, overrideDir, platformKey, token);
	} finally {
		await fs.promises.rm(staging, { recursive: true, force: true }).catch(() => { /* best effort */ });
	}

	// Verify the published payload — ours or a concurrent winner's — is complete.
	if (!hasAllRuntimeFiles(targetDir, platformKey)) {
		throw new Error('Foundry Local native runtime is incomplete after provisioning.');
	}

	await fs.promises.writeFile(foundryMarkerPath(overrideDir, platformKey), `${version}\n`).catch(() => { /* best effort marker */ });
}

/** Publish a staged runtime without replacing a complete concurrent winner. */
export async function publishRuntime(stagingTarget: string, overrideDir: string, platformKey: string, token: CancellationToken): Promise<void> {
	const lock = await acquireRuntimePublishLock(overrideDir, platformKey, token);
	try {
		throwIfCancelled(token);
		const targetDir = foundryPrebuildDir(overrideDir, platformKey);
		if (hasAllRuntimeFiles(targetDir, platformKey)) {
			return;
		}
		await fs.promises.rm(targetDir, { recursive: true, force: true });
		await promoteDir(stagingTarget, targetDir);
	} finally {
		await releaseRuntimePublishLock(lock);
	}
}

interface IRuntimePublishLock {
	readonly path: string;
	readonly handle: fs.promises.FileHandle;
}

async function acquireRuntimePublishLock(overrideDir: string, platformKey: string, token: CancellationToken): Promise<IRuntimePublishLock> {
	await fs.promises.mkdir(overrideDir, { recursive: true });
	const lockPath = join(overrideDir, `.publish-${platformKey}.lock`);
	while (true) {
		throwIfCancelled(token);
		try {
			const handle = await fs.promises.open(lockPath, 'wx');
			try {
				await handle.writeFile(`${process.pid}\n`);
				return { path: lockPath, handle };
			} catch (err) {
				await handle.close();
				await removeFileIfExists(lockPath);
				throw err;
			}
		} catch (err) {
			if ((err as NodeJS.ErrnoException).code !== 'EEXIST') {
				throw err;
			}
		}

		if (await isStaleRuntimePublishLock(lockPath)) {
			await removeFileIfExists(lockPath);
			continue;
		}
		await timeout(PUBLISH_LOCK_RETRY_MS);
	}
}

async function releaseRuntimePublishLock(lock: IRuntimePublishLock): Promise<void> {
	await lock.handle.close();
	await removeFileIfExists(lock.path);
}

async function removeFileIfExists(path: string): Promise<void> {
	try {
		await fs.promises.unlink(path);
	} catch (err) {
		if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
			throw err;
		}
	}
}

async function isStaleRuntimePublishLock(lockPath: string): Promise<boolean> {
	try {
		const pid = Number.parseInt(await fs.promises.readFile(lockPath, 'utf8'), 10);
		if (Number.isSafeInteger(pid) && pid > 0) {
			return !isPidAlive(pid);
		}
		const stat = await fs.promises.stat(lockPath);
		return Date.now() - stat.mtimeMs >= INVALID_PUBLISH_LOCK_STALE_MS;
	} catch (err) {
		if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
			return false;
		}
		throw err;
	}
}

function isPidAlive(pid: number): boolean {
	try {
		process.kill(pid, 0);
		return true;
	} catch (err) {
		return (err as NodeJS.ErrnoException).code === 'EPERM';
	}
}

/** Path of the per-platform completion marker inside a versioned override dir. */
function foundryMarkerPath(overrideDir: string, platformKey: string): string {
	return join(overrideDir, `.complete-${platformKey}`);
}

/** Directory containing the target's shared libraries. */
function foundryPrebuildDir(overrideDir: string, platformKey: string): string {
	return join(overrideDir, 'prebuilds', platformKey);
}

/**
 * Whether `<overrideDir>` holds a complete, verified runtime for `platformKey`:
 * the per-platform marker AND all expected shared libraries. A marker alone is
 * insufficient (it can belong to a different architecture, or the payload can
 * be partially deleted). Exported for tests.
 */
export function isRuntimeProvisioned(overrideDir: string, platformKey: string): boolean {
	return fs.existsSync(foundryMarkerPath(overrideDir, platformKey))
		&& hasAllRuntimeFiles(foundryPrebuildDir(overrideDir, platformKey), platformKey);
}

/**
 * Atomically move the fully-staged directory `from` to `to`. If another process
 * already promoted the same payload (the destination exists), keep the existing
 * copy — the caller re-verifies completeness afterwards. Exported for tests.
 */
export async function promoteDir(from: string, to: string): Promise<void> {
	await fs.promises.mkdir(dirname(to), { recursive: true });
	try {
		await fs.promises.rename(from, to);
	} catch (err) {
		// A concurrent winner already created `to` (EEXIST/ENOTEMPTY), or the
		// staging dir is on a different filesystem. If a copy is already present,
		// accept it; otherwise surface the failure.
		if (fs.existsSync(to)) {
			return;
		}
		throw err;
	}
}

function randomSuffix(): string {
	return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Minimum glibc version the Foundry Local addon requires on Linux. */
const MIN_GLIBC: readonly [number, number] = [2, 34];

/**
 * Throw a classified error if this host cannot load the downloaded addon. Only
 * Linux is gated (on glibc): the prebuilt addon needs GLIBC_2.34, newer than VS
 * Code's minimum supported distros, so downloading + loading it there would
 * crash. Non-glibc / undetectable systems are left to fail at load time.
 */
function assertRuntimeLoadable(platformKey: string): void {
	if (!platformKey.startsWith('linux-')) {
		return;
	}
	const glibc = detectGlibcVersion();
	if (glibc && (glibc[0] < MIN_GLIBC[0] || (glibc[0] === MIN_GLIBC[0] && glibc[1] < MIN_GLIBC[1]))) {
		const err = new Error(`On-device dictation requires glibc ${MIN_GLIBC[0]}.${MIN_GLIBC[1]} or newer, but this system has glibc ${glibc[0]}.${glibc[1]}.`);
		(err as Error & { code?: string }).code = 'ERR_FOUNDRY_UNSUPPORTED_LIBC';
		throw err;
	}
}

/** Best-effort runtime glibc version via Node's diagnostic report, if available. */
function detectGlibcVersion(): [number, number] | undefined {
	try {
		const report = (process as unknown as { report?: { getReport?(): { header?: { glibcVersionRuntime?: string } } } }).report;
		const version = report?.getReport?.()?.header?.glibcVersionRuntime;
		const match = typeof version === 'string' ? /^(\d+)\.(\d+)/.exec(version) : null;
		if (match) {
			return [Number(match[1]), Number(match[2])];
		}
	} catch {
		// Diagnostic report unavailable (e.g. non-glibc build); can't gate.
	}
	return undefined;
}

/**
 * Download the per-target runtime tarball from `url` and extract it into
 * `stagingDir`, which then contains
 * `prebuilds/<target>/<shared libraries>`. The tarball is published
 * to VS Code's CDN by `build/dictation-runtime/`.
 */
async function downloadAndExtractTarball(url: string, stagingDir: string, token: CancellationToken): Promise<void> {
	await fs.promises.mkdir(stagingDir, { recursive: true });
	const tmpDir = await fs.promises.mkdtemp(join(os.tmpdir(), 'vscode-foundry-runtime-'));
	try {
		const tarballPath = join(tmpDir, 'runtime.tgz');
		await downloadFile(url, tarballPath, token);
		throwIfCancelled(token);

		// `tar` is a node_modules package, so it must be imported dynamically.
		const tar = await import('tar');
		await tar.x({ file: tarballPath, cwd: stagingDir });
	} finally {
		await fs.promises.rm(tmpDir, { recursive: true, force: true }).catch(() => { /* best effort */ });
	}
}

/** The native files required for a target's complete runtime. Exported for tests. */
export function requiredRuntimeFileNames(platformKey: string): string[] {
	const isWin = platformKey.startsWith('win32-');
	const isDarwin = platformKey.startsWith('darwin-');
	const ext = isWin ? '.dll' : isDarwin ? '.dylib' : '.so';
	const prefix = isWin ? '' : 'lib';
	return [
		`${prefix}foundry_local${ext}`,
		isWin ? 'onnxruntime.dll' : isDarwin ? 'libonnxruntime.1.dylib' : 'libonnxruntime.so.1',
		`${prefix}onnxruntime-genai${ext}`,
	];
}

/** Whether all required runtime files already exist in `targetDir`. */
function hasAllRuntimeFiles(targetDir: string, platformKey: string): boolean {
	return requiredRuntimeFileNames(platformKey).every(name => fs.existsSync(join(targetDir, name)));
}

/**
 * Resolve the proxy URL to use for `targetUrl` from the standard proxy
 * environment variables, or `undefined` when the request should go direct.
 *
 * Mirrors the env-var handling of the GitHub desktop app's Rust
 * `foundry-local-sdk` (reqwest/ureq): for an `https:` target it prefers
 * `HTTPS_PROXY`, for an `http:` target `HTTP_PROXY`, each falling back to
 * `ALL_PROXY` (all case-insensitive), and it skips the proxy when the host
 * matches `NO_PROXY`. `env` defaults to `process.env`; it is a parameter so the
 * resolution can be unit-tested without mutating global environment state.
 */
export function resolveProxyUrl(targetUrl: string, env: NodeJS.ProcessEnv = process.env): string | undefined {
	let parsed: URL;
	try {
		parsed = new URL(targetUrl);
	} catch {
		return undefined;
	}
	const scheme = parsed.protocol === 'http:'
		? (env.HTTP_PROXY ?? env.http_proxy)
		: (env.HTTPS_PROXY ?? env.https_proxy);
	const proxy = scheme ?? env.ALL_PROXY ?? env.all_proxy;
	if (!proxy) {
		return undefined;
	}
	const noProxy = env.NO_PROXY ?? env.no_proxy;
	if (noProxy && isNoProxyHost(noProxy, parsed.hostname)) {
		return undefined;
	}
	return proxy;
}

/** Whether `hostname` matches any entry in a `NO_PROXY` list. */
function isNoProxyHost(noProxy: string, hostname: string): boolean {
	const host = hostname.toLowerCase();
	return noProxy.split(',').some(raw => {
		const entry = raw.trim().toLowerCase().replace(/^\./, '');
		if (!entry) {
			return false;
		}
		return entry === '*' || host === entry || host.endsWith(`.${entry}`);
	});
}

/**
 * A proxy `Agent` for `targetUrl` built from the environment, or `undefined`
 * when no proxy applies. `https-proxy-agent` is a `node_modules` package, so it
 * is imported dynamically like the other runtime-only dependencies here.
 */
async function resolveProxyAgent(targetUrl: string): Promise<import('http').Agent | undefined> {
	const proxyUrl = resolveProxyUrl(targetUrl);
	if (!proxyUrl) {
		return undefined;
	}
	const { HttpsProxyAgent } = await import('https-proxy-agent');
	return new HttpsProxyAgent(proxyUrl);
}

/** Download `url` to `dest`, following redirects, honoring cancellation. */
async function downloadFile(url: string, dest: string, token: CancellationToken): Promise<void> {
	// `http`/`https` are slow-to-load builtins; import them lazily at runtime.
	// The CDN is always `https:`; `http:` support exists only so provisioning can
	// be exercised against a local test server.
	const [https, http] = await Promise.all([import('https'), import('http')]);
	const getFor = (u: string) => (new URL(u).protocol === 'http:' ? http.get : https.get);
	// A single proxy agent tunnels to whatever host each request (including any
	// redirect target) addresses, so resolving it once from the initial URL is
	// sufficient. `undefined` means "go direct".
	const agent = await resolveProxyAgent(url);
	return new Promise<void>((resolve, reject) => {
		let settled = false;
		let timer: ReturnType<typeof setTimeout> | undefined;
		let activeRequest: import('http').ClientRequest | undefined;
		const file = fs.createWriteStream(dest);

		const finish = (err?: Error) => {
			if (settled) {
				return;
			}
			settled = true;
			if (timer) {
				clearTimeout(timer);
			}
			activeRequest?.destroy();
			if (!err) {
				resolve();
				return;
			}
			// Remove the partial file before surfacing the failure.
			file.close(() => fs.promises.rm(dest, { force: true }).catch(() => { /* best effort */ }).finally(() => reject(err)));
		};
		// `https.get` has no default timeout, so a stalled connection/response
		// would hang forever (and, via `stop()` awaiting the open promise, hang
		// dictation shutdown). Bound it with an inactivity timeout that resets on
		// progress and tears the request/partial file down when it fires.
		const armTimeout = () => {
			if (timer) {
				clearTimeout(timer);
			}
			timer = setTimeout(() => finish(new Error(`Timed out downloading ${url}.`)), DOWNLOAD_INACTIVITY_TIMEOUT_MS);
		};

		const request = (currentUrl: string, redirectsLeft: number): void => {
			if (token.isCancellationRequested) {
				finish(new CancellationError());
				return;
			}
			armTimeout();
			activeRequest = getFor(currentUrl)(currentUrl, { agent }, response => {
				armTimeout();
				const status = response.statusCode ?? 0;
				if (status >= 300 && status < 400 && response.headers.location) {
					response.resume();
					if (redirectsLeft <= 0) {
						finish(new Error(`Too many redirects downloading ${url}.`));
						return;
					}
					request(new URL(response.headers.location, currentUrl).toString(), redirectsLeft - 1);
					return;
				}
				if (status !== 200) {
					response.resume();
					finish(new Error(`Download failed with status ${status}: ${currentUrl}`));
					return;
				}
				response.on('data', armTimeout);
				response.on('error', err => finish(err));
				response.pipe(file);
				file.on('finish', () => file.close(err => err ? finish(err) : finish()));
			});
			activeRequest.on('error', err => finish(err));
		};
		file.on('error', err => finish(err));
		request(url, 5);
	});
}

function throwIfCancelled(token: CancellationToken): void {
	if (token.isCancellationRequested) {
		throw new CancellationError();
	}
}
