/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createHash } from 'crypto';
import { accessSync, createReadStream, createWriteStream, promises as fs, readFileSync } from 'fs';
import * as os from 'os';
import { pipeline as pipelineCallback, Readable } from 'stream';
import { promisify } from 'util';
import { CancellationToken } from '../../../base/common/cancellation.js';
import * as path from '../../../base/common/path.js';
import { IAgentHostSdk, IAgentHostSdkAsset, IProductConfiguration } from '../../../base/common/product.js';
import { extract } from '../../../base/node/zip.js';
import { ILogService } from '../../log/common/log.js';

const pipeline = promisify(pipelineCallback);

/**
 * Identifies which agent host SDK to resolve. These keys match the
 * `product.agentHostSdks.<id>` section in `product.json`.
 */
export type AgentHostSdkId = 'codex' | 'claude';

/**
 * Manifest emitted at the root of every published SDK bundle by the build-time
 * packaging step (`agent-host-sdk.json`). It decouples the runtime from each
 * SDK's internal native-package layout: the runtime only needs to read the
 * relative entry path, never to understand how the upstream package is shaped.
 */
interface IAgentHostSdkManifest {
	readonly kind: AgentHostSdkId;
	readonly version: string;
	/**
	 * For `codex`: bundle-relative path to the `codex` executable that the
	 * agent host spawns as `<exec> app-server`.
	 */
	readonly exec?: string;
	/**
	 * For `claude`: bundle-relative path to the `@anthropic-ai/claude-agent-sdk`
	 * package root that the agent host loads via dynamic `import()`.
	 */
	readonly packageRoot?: string;
}

/** Subset of platform facts the resolver needs; injectable for tests. */
export interface IResolvedPlatform {
	readonly os: 'darwin' | 'linux' | 'win32';
	readonly arch: string;
	readonly isAlpine: boolean;
}

export interface IAgentHostSdkDownloaderOptions {
	/** Downloads `url` to `destFile`. Defaults to a `fetch`-based streamer. */
	readonly download?: (url: string, destFile: string, token: CancellationToken) => Promise<void>;
	/** Extracts a zip `archive` into `targetDir`. Defaults to `base/node/zip`. */
	readonly extractZip?: (archive: string, targetDir: string, token: CancellationToken) => Promise<void>;
	/** Resolves the current platform. Defaults to reading `process`/`os`. */
	readonly platform?: IResolvedPlatform;
}

/**
 * Resolves an agent host SDK to an on-disk path, downloading it on demand from
 * the VS Code download CDN when necessary.
 *
 * Behaviour is intentionally fail-soft: {@link resolve} returns `undefined`
 * (never throws) whenever the SDK cannot be delivered — including OSS/dev builds
 * with no pin or no `downloadUrl`, an unsupported platform, or a network/verify
 * failure. In those cases the agent host simply behaves as it does today, where
 * the provider is only available when a developer points the override setting at
 * a locally-installed SDK.
 *
 * See `src/vs/platform/agentHost/AGENT_HOST_SDK_DELIVERY_PLAN.md`.
 */
export class AgentHostSdkDownloader {

	/** De-dupes concurrent resolves of the same `<sdk>@<version>`. */
	private readonly _inFlight = new Map<string, Promise<string | undefined>>();

	private readonly _download: (url: string, destFile: string, token: CancellationToken) => Promise<void>;
	private readonly _extractZip: (archive: string, targetDir: string, token: CancellationToken) => Promise<void>;
	private readonly _platform: IResolvedPlatform;

	constructor(
		private readonly _product: IProductConfiguration,
		private readonly _userDataPath: string,
		private readonly _logService: ILogService,
		options: IAgentHostSdkDownloaderOptions = {},
	) {
		this._download = options.download ?? fetchToFile;
		this._extractZip = options.extractZip ?? ((archive, targetDir, token) => extract(archive, targetDir, { overwrite: true }, token));
		this._platform = options.platform ?? detectPlatform();
	}

	/**
	 * Ensures the pinned SDK is available on disk and returns the path the
	 * agent host should use (the codex executable, or the claude package root).
	 * Returns `undefined` when the SDK is not pinned/deliverable for this build
	 * or platform, or when delivery fails.
	 */
	async resolve(sdk: AgentHostSdkId, token: CancellationToken = CancellationToken.None): Promise<string | undefined> {
		const pin = this._product.agentHostSdks?.[sdk];
		const downloadUrl = this._product.downloadUrl;
		const quality = this._product.quality;
		if (!pin || !downloadUrl || !quality) {
			// OSS/dev build, or this SDK is not pinned: behave as today.
			return undefined;
		}

		const asset = this._selectAsset(pin);
		if (!asset) {
			this._logService.info(`[AgentHostSdk] No '${sdk}' asset pinned for platform ${this._platformKey()}; skipping on-demand download.`);
			return undefined;
		}

		const key = `${sdk}@${pin.version}`;
		let promise = this._inFlight.get(key);
		if (!promise) {
			promise = this._ensure(sdk, pin, asset, downloadUrl, quality, token)
				.catch(err => {
					this._logService.error(`[AgentHostSdk] Failed to deliver '${sdk}' v${pin.version}: ${err instanceof Error ? err.message : String(err)}`);
					return undefined;
				})
				.finally(() => this._inFlight.delete(key));
			this._inFlight.set(key, promise);
		}
		return promise;
	}

	private async _ensure(sdk: AgentHostSdkId, pin: IAgentHostSdk, asset: IAgentHostSdkAsset, downloadUrl: string, quality: string, token: CancellationToken): Promise<string | undefined> {
		const versionDir = path.join(this._userDataPath, 'agentHostSdks', sdk, pin.version);
		const completeMarker = path.join(versionDir, '.complete');

		if (await exists(completeMarker)) {
			return this._entryPath(sdk, versionDir);
		}

		// Build the version-keyed, commit-independent CDN URL.
		const url = `${trimTrailingSlash(downloadUrl)}/${quality}/agent-host-sdks/${asset.file}`;
		const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), `vscode-agent-host-sdk-${sdk}-`));
		const archivePath = path.join(tmpRoot, asset.file);
		const extractDir = path.join(tmpRoot, 'extracted');

		try {
			this._logService.info(`[AgentHostSdk] Downloading '${sdk}' v${pin.version} from ${url}`);
			await this._download(url, archivePath, token);

			const actual = await sha256OfFile(archivePath);
			if (actual !== asset.sha256.toLowerCase()) {
				throw new Error(`Checksum mismatch for ${asset.file}: expected ${asset.sha256.toLowerCase()}, got ${actual}`);
			}

			await this._extractZip(archivePath, extractDir, token);

			// Validate the bundle exposes the entry we expect before committing.
			const entry = await this._entryPath(sdk, extractDir);
			if (!entry || !(await exists(entry))) {
				throw new Error(`Bundle for '${sdk}' v${pin.version} is missing its entry path`);
			}

			// Atomic publish: write the marker last, then rename into place.
			await fs.writeFile(path.join(extractDir, '.complete'), pin.version);
			await fs.mkdir(path.dirname(versionDir), { recursive: true });
			await this._renameInto(extractDir, versionDir);

			this._pruneSiblings(sdk, pin.version);

			return this._entryPath(sdk, versionDir);
		} finally {
			await rmrf(tmpRoot);
		}
	}

	/** Reads the bundle manifest and resolves the SDK-specific entry path. */
	private async _entryPath(sdk: AgentHostSdkId, root: string): Promise<string | undefined> {
		let manifest: IAgentHostSdkManifest;
		try {
			manifest = JSON.parse(await fs.readFile(path.join(root, 'agent-host-sdk.json'), 'utf8'));
		} catch (err) {
			this._logService.error(`[AgentHostSdk] Unable to read manifest for '${sdk}': ${err instanceof Error ? err.message : String(err)}`);
			return undefined;
		}
		const rel = sdk === 'codex' ? manifest.exec : manifest.packageRoot;
		if (!rel) {
			return undefined;
		}
		return path.join(root, rel);
	}

	private _selectAsset(pin: IAgentHostSdk): IAgentHostSdkAsset | undefined {
		return pin.platforms?.[this._platformKey()];
	}

	/** Maps the running platform to a {@link TargetPlatform}-style key. */
	private _platformKey(): string {
		const { os: platformOs, arch, isAlpine } = this._platform;
		const normArch = arch === 'arm' ? 'armhf' : arch;
		switch (platformOs) {
			case 'darwin': return `darwin-${normArch}`;
			case 'win32': return `win32-${normArch}`;
			case 'linux': return `${isAlpine ? 'alpine' : 'linux'}-${normArch}`;
		}
	}

	private async _renameInto(from: string, to: string): Promise<void> {
		try {
			await fs.rename(from, to);
		} catch (err) {
			// A concurrent resolver (separate process) may have won the race, or
			// rename across devices failed. If the destination is now complete,
			// treat as success; otherwise rethrow.
			if (await exists(path.join(to, '.complete'))) {
				return;
			}
			throw err;
		}
	}

	private _pruneSiblings(sdk: AgentHostSdkId, keepVersion: string): void {
		const sdkDir = path.join(this._userDataPath, 'agentHostSdks', sdk);
		// Best-effort, fire-and-forget: never block resolution on cleanup.
		void (async () => {
			try {
				for (const entry of await fs.readdir(sdkDir)) {
					if (entry !== keepVersion) {
						await rmrf(path.join(sdkDir, entry));
					}
				}
			} catch {
				// ignore prune failures
			}
		})();
	}
}

function trimTrailingSlash(value: string): string {
	return value.endsWith('/') ? value.slice(0, -1) : value;
}

function detectPlatform(): IResolvedPlatform {
	const platformOs = process.platform === 'darwin' ? 'darwin' : process.platform === 'win32' ? 'win32' : 'linux';
	return { os: platformOs, arch: process.arch, isAlpine: platformOs === 'linux' && isAlpineSync() };
}

function isAlpineSync(): boolean {
	try {
		const content = readFileSync('/etc/os-release', 'utf8');
		return /^ID=alpine$/m.test(content);
	} catch {
		// Fall back to the alpine release marker file.
		try {
			accessSync('/etc/alpine-release');
			return true;
		} catch {
			return false;
		}
	}
}

async function exists(p: string): Promise<boolean> {
	try {
		await fs.access(p);
		return true;
	} catch {
		return false;
	}
}

async function rmrf(p: string): Promise<void> {
	try {
		await fs.rm(p, { recursive: true, force: true });
	} catch {
		// ignore
	}
}

async function sha256OfFile(file: string): Promise<string> {
	const hash = createHash('sha256');
	await pipeline(createReadStream(file), hash);
	return hash.digest('hex');
}

async function fetchToFile(url: string, destFile: string, token: CancellationToken): Promise<void> {
	const response = await fetch(url, { signal: toAbortSignal(token) });
	if (!response.ok || !response.body) {
		throw new Error(`Download failed (${response.status} ${response.statusText}) for ${url}`);
	}
	const nodeStream = Readable.fromWeb(response.body as Parameters<typeof Readable.fromWeb>[0]);
	await pipeline(nodeStream, createWriteStream(destFile));
}

function toAbortSignal(token: CancellationToken): AbortSignal {
	const controller = new AbortController();
	if (token.isCancellationRequested) {
		controller.abort();
	} else {
		token.onCancellationRequested(() => controller.abort());
	}
	return controller.signal;
}
