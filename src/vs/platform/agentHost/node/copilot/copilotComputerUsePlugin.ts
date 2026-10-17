/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createHash } from 'crypto';
import * as fs from 'fs';
import { raceCancellationError } from '../../../../base/common/async.js';
import { streamToBuffer, type VSBuffer } from '../../../../base/common/buffer.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { CancellationError } from '../../../../base/common/errors.js';
import { join } from '../../../../base/common/path.js';
import { Promises } from '../../../../base/node/pfs.js';
import { extract } from '../../../../base/node/zip.js';
import { INativeEnvironmentService } from '../../../environment/common/environment.js';
import { ILogService } from '../../../log/common/log.js';
import { IRequestService } from '../../../request/common/request.js';

/**
 * A pinned release of GitHub's Computer Use plugin.
 */
export interface IComputerUsePluginRelease {
	readonly version: string;
	/** Expected SHA-256 (hex) of each release archive, keyed by `<platform>-<arch>`. */
	readonly sha256: { readonly [target: string]: string };
	/** Archive URL with `{version}` and `{target}` placeholders. */
	readonly urlTemplate: string;
}

/**
 * The plugin is downloaded instead of bundled: product signing re-signs bundled
 * binaries, and Computer Use's macOS helper only accepts GitHub's signature.
 */
export const COMPUTER_USE_PLUGIN_RELEASE: IComputerUsePluginRelease = {
	version: '0.1.94',
	sha256: {
		'darwin-arm64': 'a625140b3b0cff6cec122eb6db954374577cb21dec21783b3eb9a3236257c4c6',
		'darwin-x64': 'dd1d2a2ac4e8595c6a7edcae9b9f5029585b7479d1e9a8c1865b6b800a4be0c9',
		'win32-arm64': 'da605d8c3359fc0a7062dfeb2edb6acc414a3234184935886e8ba62d6a696a62',
		'win32-x64': '9cd4a91f585d48a8fb42f3157046f49b0e0980fed47eed689f8a761e3593254a',
	},
	urlTemplate: 'https://github.com/github/computer-use-plugin/releases/download/v{version}/computer-use-v{version}-{target}.zip',
};

const COMPLETE_SENTINEL = '.complete';

/** Name of the Computer Use built-in plugin and of the MCP server it contributes. */
export const COMPUTER_USE_PLUGIN_NAME = 'computer-use';

/**
 * Resolves GitHub's Computer Use plugin for the current platform, downloading
 * and verifying the pinned release into the agent host's cache on first use.
 */
export class CopilotComputerUsePlugin {

	private readonly _target = `${process.platform}-${process.arch}`;
	private _pending: Promise<string> | undefined;

	constructor(
		private readonly _release: IComputerUsePluginRelease,
		@IRequestService private readonly _requestService: IRequestService,
		@INativeEnvironmentService private readonly _environmentService: INativeEnvironmentService,
		@ILogService private readonly _logService: ILogService,
	) { }

	/** Whether a release exists for this platform. */
	get isAvailable(): boolean {
		return !!this._release.sha256[this._target];
	}

	private get _pluginDir(): string {
		return join(this._environmentService.userDataPath, 'agent-host', 'computer-use-plugin', this._release.version, this._target);
	}

	/** Returns the plugin directory when it is already installed, without downloading. */
	async getInstalledPath(): Promise<string | undefined> {
		return this.isAvailable && await Promises.exists(join(this._pluginDir, COMPLETE_SENTINEL)) ? this._pluginDir : undefined;
	}

	/**
	 * Returns the plugin directory, downloading it when needed, or `undefined`
	 * when no release exists for this platform. Rejects when the download or
	 * verification fails, or when `token` is cancelled. Concurrent callers share
	 * the first caller's download.
	 */
	resolve(token: CancellationToken): Promise<string | undefined> {
		const expectedSha256 = this._release.sha256[this._target];
		if (!expectedSha256) {
			return Promise.resolve(undefined);
		}
		if (!this._pending) {
			const pending = this._resolve(this._target, expectedSha256, token);
			this._pending = pending;
			pending.catch(() => {
				if (this._pending === pending) {
					this._pending = undefined;
				}
			});
		}
		return this._pending;
	}

	private async _resolve(target: string, expectedSha256: string, token: CancellationToken): Promise<string> {
		const pluginDir = this._pluginDir;
		if (await Promises.exists(join(pluginDir, COMPLETE_SENTINEL))) {
			return pluginDir;
		}

		const url = this._release.urlTemplate.replace(/\{version\}/g, this._release.version).replace(/\{target\}/g, target);
		this._logService.info(`[Copilot] Downloading Computer Use plugin ${this._release.version} from ${url}`);
		const context = await this._requestService.request({ url, type: 'GET', callSite: 'copilotComputerUsePlugin' }, token);
		const statusCode = context.res.statusCode ?? 0;
		if (statusCode < 200 || statusCode >= 300) {
			context.stream.destroy();
			throw new Error(`HTTP ${statusCode} fetching ${url}`);
		}
		// Cancellation must also abort a response body that stalls after its headers.
		const cancellation = token.onCancellationRequested(() => context.stream.destroy());
		let archive: VSBuffer;
		try {
			archive = await raceCancellationError(streamToBuffer(context.stream), token);
		} finally {
			cancellation.dispose();
		}
		const actualSha256 = createHash('sha256').update(archive.buffer).digest('hex');
		if (actualSha256 !== expectedSha256) {
			throw new Error(`Computer Use plugin checksum mismatch for ${url}: expected ${expectedSha256}, got ${actualSha256}`);
		}

		await installComputerUsePluginArchive(archive.buffer, target, pluginDir, token);
		this._logService.info(`[Copilot] Installed Computer Use plugin ${this._release.version} at ${pluginDir}`);
		return pluginDir;
	}
}

/**
 * Extracts the `<target>/` folder of a verified release archive into
 * `pluginDir` and publishes it with a `.complete` sentinel. Rejects with a
 * cancellation error, without publishing, when `token` is cancelled.
 */
export async function installComputerUsePluginArchive(archive: Uint8Array, target: string, pluginDir: string, token: CancellationToken): Promise<void> {
	// Extract next to the final directory and publish it with a rename, so
	// an interrupted extraction never leaves a directory with a sentinel.
	const tmpDir = `${pluginDir}.tmp.${process.pid}`;
	const archivePath = `${tmpDir}.zip`;
	await fs.promises.rm(tmpDir, { recursive: true, force: true });
	await fs.promises.mkdir(tmpDir, { recursive: true });
	try {
		await fs.promises.writeFile(archivePath, archive);
		// No trailing slash: the archive's `<target>/` directory entry must reduce to `/`.
		try {
			await extract(archivePath, tmpDir, { sourcePath: target }, token);
		} catch (error) {
			throw token.isCancellationRequested ? new CancellationError() : error;
		}
		// `extract` can also resolve after a cancellation that stopped it part-way.
		if (token.isCancellationRequested) {
			throw new CancellationError();
		}
		await fs.promises.writeFile(join(tmpDir, COMPLETE_SENTINEL), '');
		if (await Promises.exists(join(pluginDir, COMPLETE_SENTINEL))) {
			return;
		}
		await fs.promises.rm(pluginDir, { recursive: true, force: true });
		await fs.promises.rename(tmpDir, pluginDir);
	} finally {
		await fs.promises.rm(archivePath, { force: true });
		await fs.promises.rm(tmpDir, { recursive: true, force: true });
	}
}
