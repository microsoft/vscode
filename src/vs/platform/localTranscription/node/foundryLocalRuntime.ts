/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs';
import * as os from 'os';
import { dirname, join } from '../../../base/common/path.js';
import { CancellationToken } from '../../../base/common/cancellation.js';
import { CancellationError } from '../../../base/common/errors.js';

/**
 * On-demand provisioning of the Foundry Local native runtime used by on-device
 * dictation.
 *
 * `foundry-local-sdk` ships a prebuilt N-API addon (`foundry_local_napi.node`)
 * and downloads native core libraries (Foundry Local Core + ONNX Runtime +
 * ONNX Runtime GenAI) next to it. The addon requires a newer glibc than VS
 * Code's minimum supported Linux distros, so we deliberately do NOT bundle any
 * of this native payload with the product (see `build/gulpfile.vscode.ts`).
 * Instead we download it here, at runtime, only on supported platforms, into a
 * per-user writable cache — keeping the shipped package's glibc floor intact.
 *
 * The SDK loader (`dist/detail/coreInterop.js`) is patched during
 * `postinstall` to honor `VSCODE_FOUNDRY_LOCAL_NATIVE_DIR`, pointing it at the
 * cache directory this module populates. The cache layout mirrors the SDK's
 * own package layout so the patched resolution is a trivial path join:
 *
 *   <cacheRoot>/<sdkVersion>/prebuilds/<platformKey>/foundry_local_napi.node
 *   <cacheRoot>/<sdkVersion>/foundry-local-core/<platformKey>/<core libraries>
 *
 * NOTE: the two JavaScript download legs — the npm-registry addon tarball and
 * the NuGet core-library fetch (via the SDK's own installer) — honor the
 * standard proxy environment variables (`HTTPS_PROXY`/`HTTP_PROXY`/`ALL_PROXY`,
 * with `NO_PROXY`), matching how the GitHub desktop app's Rust
 * `foundry-local-sdk` reaches these endpoints. VS Code's `http.proxy`/
 * `http.noProxy` settings are applied as these same environment variables
 * before provisioning (see `LocalTranscriptionService.start`), so a proxy
 * configured only in VS Code is honored here and by the native model download
 * too; `http.proxyAuthorization` (Basic) is folded into the proxy URL and
 * `http.proxyStrictSSL === false` disables TLS verification for these Node legs.
 * TLS-intercepting proxies otherwise rely on the CA being in the OS trust store.
 */

/**
 * Platforms (`<process.platform>-<process.arch>`) for which Foundry Local ships
 * a native addon + core libraries. Mirrors the SDK installer's RID map.
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

/** De-dupes concurrent provisioning requests targeting the same cache dir. */
const inFlight = new Map<string, Promise<string>>();

/** Abort a download after this long without any connection/response progress. */
const DOWNLOAD_INACTIVITY_TIMEOUT_MS = 60_000;

/**
 * Ensure the Foundry Local native runtime (addon + core libraries) is present
 * in `<cacheRoot>`, downloading it if necessary. Returns the versioned override
 * directory to set as `VSCODE_FOUNDRY_LOCAL_NATIVE_DIR` before loading the SDK.
 *
 * Idempotent: once a version is fully provisioned a per-platform `.complete`
 * marker is written and subsequent calls return immediately (after verifying the
 * payload) without touching the network.
 */
export async function ensureFoundryLocalRuntime(cacheRoot: string, token: CancellationToken, onProgress?: FoundryLocalRuntimeProgress): Promise<string> {
	const platformKey = foundryLocalPlatformKey();
	if (!platformKey) {
		throw new Error(`Foundry Local native runtime is not available on ${process.platform}-${process.arch}.`);
	}

	const nodeRequire = await getNativeRequire();
	const sdkVersion: string = nodeRequire('foundry-local-sdk/package.json').version;
	const overrideDir = join(cacheRoot, sdkVersion);

	// A single in-flight provisioning per override dir; late joiners share it.
	const existing = inFlight.get(overrideDir);
	if (existing) {
		return existing;
	}
	const promise = doEnsure(overrideDir, platformKey, sdkVersion, nodeRequire, token, onProgress)
		.finally(() => inFlight.delete(overrideDir));
	inFlight.set(overrideDir, promise);
	return promise;
}

async function doEnsure(overrideDir: string, platformKey: string, sdkVersion: string, nodeRequire: NodeJS.Require, token: CancellationToken, onProgress?: FoundryLocalRuntimeProgress): Promise<string> {
	const addonPath = foundryAddonPath(overrideDir, platformKey);
	const coreDir = foundryCoreDir(overrideDir, platformKey);
	// The completion marker is per-platform: the shared `<cacheRoot>/<version>`
	// dir can hold payloads for multiple architectures (e.g. a win32-arm64
	// machine running x64 VS Code under emulation, then arm64 VS Code). Verify
	// the target-specific payload as well as the marker, so a different arch's
	// marker never short-circuits this arch's provisioning and a stale/partially
	// deleted cache is repaired rather than trusted.
	if (isRuntimeProvisioned(overrideDir, platformKey)) {
		return overrideDir;
	}

	// Fail fast (before any download) when the host can't actually load the
	// addon — e.g. Linux with glibc older than the addon requires — so users see
	// a clear "unsupported" error instead of a large download that crashes on
	// native import.
	assertRuntimeLoadable(platformKey);

	onProgress?.('Downloading dictation runtime…');

	// The cache is shared by the utility processes of every open VS Code window,
	// so provision into a process-unique staging dir and atomically promote each
	// payload directory into place. Two concurrent first-use downloads therefore
	// never write to the same final path; whichever process wins the rename is
	// the published copy and the loser accepts it as success.
	const staging = join(overrideDir, `.staging-${process.pid}-${randomSuffix()}`);
	const stagingAddon = join(staging, 'prebuilds', platformKey, 'foundry_local_napi.node');
	const stagingCore = join(staging, 'foundry-local-core', platformKey);
	try {
		await ensureAddon(stagingAddon, platformKey, sdkVersion, token);
		throwIfCancelled(token);
		await ensureCoreLibraries(stagingCore, nodeRequire);
		throwIfCancelled(token);

		if (!fs.existsSync(stagingAddon) || !hasAllCoreLibraries(stagingCore)) {
			throw new Error('Foundry Local native runtime download completed but expected files are missing.');
		}

		await promoteDir(dirname(stagingAddon), dirname(addonPath));
		await promoteDir(stagingCore, coreDir);
	} finally {
		await fs.promises.rm(staging, { recursive: true, force: true }).catch(() => { /* best effort */ });
	}

	// Verify the published payload — ours or a concurrent winner's — is complete.
	if (!fs.existsSync(addonPath) || !hasAllCoreLibraries(coreDir)) {
		throw new Error('Foundry Local native runtime is incomplete after provisioning.');
	}

	await fs.promises.writeFile(foundryMarkerPath(overrideDir, platformKey), `${sdkVersion}\n`).catch(() => { /* best effort marker */ });
	return overrideDir;
}

/** Path of the per-platform completion marker inside a versioned override dir. */
function foundryMarkerPath(overrideDir: string, platformKey: string): string {
	return join(overrideDir, `.complete-${platformKey}`);
}

/** Path of the prebuilt N-API addon inside a versioned override dir. */
function foundryAddonPath(overrideDir: string, platformKey: string): string {
	return join(overrideDir, 'prebuilds', platformKey, 'foundry_local_napi.node');
}

/** Directory of the native core libraries inside a versioned override dir. */
function foundryCoreDir(overrideDir: string, platformKey: string): string {
	return join(overrideDir, 'foundry-local-core', platformKey);
}

/**
 * Whether `<overrideDir>` holds a complete, verified runtime for `platformKey`:
 * the per-platform marker AND the actual addon + all core libraries. A marker
 * alone is insufficient (it can belong to a different architecture, or the
 * payload can be partially deleted). Exported for tests.
 */
export function isRuntimeProvisioned(overrideDir: string, platformKey: string): boolean {
	return fs.existsSync(foundryMarkerPath(overrideDir, platformKey))
		&& fs.existsSync(foundryAddonPath(overrideDir, platformKey))
		&& hasAllCoreLibraries(foundryCoreDir(overrideDir, platformKey));
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
 * Download the prebuilt N-API addon for `platformKey` from the pinned
 * `foundry-local-sdk` npm tarball and place it at `addonPath`.
 */
async function ensureAddon(addonPath: string, platformKey: string, sdkVersion: string, token: CancellationToken): Promise<void> {
	const tarballUrl = `https://registry.npmjs.org/foundry-local-sdk/-/foundry-local-sdk-${sdkVersion}.tgz`;
	const entryName = `package/prebuilds/${platformKey}/foundry_local_napi.node`;

	const tmpDir = await fs.promises.mkdtemp(join(os.tmpdir(), 'vscode-foundry-addon-'));
	try {
		const tarballPath = join(tmpDir, 'sdk.tgz');
		await downloadFile(tarballUrl, tarballPath, token);
		throwIfCancelled(token);

		// npm tarballs are gzip'd tar; extract only the single addon we need.
		// `tar` is a node_modules package, so it must be imported dynamically.
		const tar = await import('tar');
		await tar.x({ file: tarballPath, cwd: tmpDir, filter: p => p.replace(/\\/g, '/') === entryName });

		const extracted = join(tmpDir, entryName);
		if (!fs.existsSync(extracted)) {
			throw new Error(`Foundry Local addon for ${platformKey} not found in ${tarballUrl}.`);
		}

		await fs.promises.mkdir(dirname(addonPath), { recursive: true });
		// Publish atomically: copy to a sibling temp file, then rename into place.
		const stagingPath = `${addonPath}.download`;
		await fs.promises.copyFile(extracted, stagingPath);
		await fs.promises.rename(stagingPath, addonPath);
	} finally {
		await fs.promises.rm(tmpDir, { recursive: true, force: true }).catch(() => { /* best effort */ });
	}
}

/**
 * Download the Foundry Local core libraries into `coreDir` by reusing the SDK's
 * own NuGet installer (`script/install-utils.cjs`), targeted at our cache with
 * its `binDir` option. Replicates the standard variant's artifact selection
 * (`script/install-standard.cjs`), including the linux-x64 GPU ORT package.
 */
async function ensureCoreLibraries(coreDir: string, nodeRequire: NodeJS.Require): Promise<void> {
	const deps = nodeRequire('foundry-local-sdk/deps_versions.json');
	const { runInstall } = nodeRequire('foundry-local-sdk/script/install-utils.cjs') as {
		runInstall(artifacts: { name: string; version: string }[], options?: { binDir?: string }): Promise<void>;
	};

	// Microsoft.ML.OnnxRuntime.Gpu.Linux only ships x86_64 native binaries, so
	// linux-arm64 falls back to the cross-platform Foundry ORT package.
	const isLinuxX64 = process.platform === 'linux' && process.arch === 'x64';
	const ortPackageName = isLinuxX64 ? 'Microsoft.ML.OnnxRuntime.Gpu.Linux' : 'Microsoft.ML.OnnxRuntime.Foundry';

	const artifacts = [
		{ name: 'Microsoft.AI.Foundry.Local.Core', version: deps['foundry-local-core'].nuget },
		{ name: ortPackageName, version: deps.onnxruntime.version },
		{ name: 'Microsoft.ML.OnnxRuntimeGenAI.Foundry', version: deps['onnxruntime-genai'].version },
	];

	await fs.promises.mkdir(coreDir, { recursive: true });
	const restoreProxy = await applyGlobalProxyForNuget();
	try {
		await runInstall(artifacts, { binDir: coreDir });
	} finally {
		restoreProxy();
	}
}

/** The core library filenames required for the current platform. Exported for tests. */
export function requiredCoreLibraryNames(): string[] {
	const ext = process.platform === 'win32' ? '.dll' : process.platform === 'darwin' ? '.dylib' : '.so';
	const prefix = process.platform === 'win32' ? '' : 'lib';
	return [
		`Microsoft.AI.Foundry.Local.Core${ext}`,
		`${prefix}onnxruntime${ext}`,
		`${prefix}onnxruntime-genai${ext}`,
	];
}

/** Whether all required core libraries already exist in `coreDir`. */
function hasAllCoreLibraries(coreDir: string): boolean {
	return requiredCoreLibraryNames().every(name => fs.existsSync(join(coreDir, name)));
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

/**
 * Temporarily route `https.globalAgent` — used by the SDK installer's bare
 * `https.get(url, cb)` NuGet downloads — through the env-configured proxy so
 * corporate proxies are honored without patching third-party SDK code. Returns
 * a function that restores the previous global agent; no-ops when no proxy
 * applies.
 */
async function applyGlobalProxyForNuget(): Promise<() => void> {
	const agent = await resolveProxyAgent('https://api.nuget.org/');
	if (!agent) {
		return () => { /* nothing to restore */ };
	}
	const https = await import('https');
	const previous = https.globalAgent;
	// `HttpsProxyAgent` extends `http.Agent`, not `https.Agent`; the cast only
	// satisfies the field's declared type.
	https.globalAgent = agent as unknown as typeof previous;
	return () => {
		https.globalAgent = previous;
	};
}

/** Download `url` to `dest`, following redirects, honoring cancellation. */
async function downloadFile(url: string, dest: string, token: CancellationToken): Promise<void> {
	// `https` is a slow-to-load builtin; import it lazily at runtime.
	const https = await import('https');
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
			activeRequest = https.get(currentUrl, { agent }, response => {
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

let cachedNativeRequire: NodeJS.Require | undefined;
/**
 * A CommonJS `require` bound to this module for loading `foundry-local-sdk`'s
 * package metadata and its NuGet installer at runtime. `foundry-local-sdk` has
 * no `exports` map, so its subpaths resolve directly; it is kept external from
 * the bundle (loaded from `node_modules`) like the SDK's own dynamic import.
 * Uses a dynamic `import('node:module')` so the `node:` specifier is resolved
 * lazily at runtime rather than at bundle/load time.
 */
async function getNativeRequire(): Promise<NodeJS.Require> {
	if (!cachedNativeRequire) {
		const nodeModule = await import('node:module');
		cachedNativeRequire = nodeModule.createRequire(import.meta.url);
	}
	return cachedNativeRequire;
}
