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
import { dirname, join } from '../../../../base/common/path.js';
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
 * The plugin is downloaded instead of bundled, because product signing would
 * re-sign its binaries and the macOS helper only accepts GitHub's signature.
 *
 * On macOS, the plugin's MCP server installs that helper app into
 * `$COPILOT_HOME/computer-use`, which the Copilot CLI and app share so users
 * grant permissions once. It replaces the shared helper only with a newer
 * release, and keeps a newer one only while it matches the bundled helper's
 * code signature. A re-signed copy would therefore overwrite newer helpers
 * from other hosts. An older pin is safe. A modified plugin is not.
 */
export const COMPUTER_USE_PLUGIN_RELEASE: IComputerUsePluginRelease = {
	version: '0.1.95',
	sha256: {
		'darwin-arm64': '91c5ab5f1de9f7d2dcde4e2c29764e031193bccbd127aa03527c331c9cfa6721',
		'darwin-x64': '2ac6c1432f3b392cea67a71c443fad7349bc4d1a08320df953a0873275ff8042',
		'win32-arm64': '95ac1dfd28bd4e1d316d8ac4b36efd64025e4927e22168bb2877cd18a80e9b8f',
		'win32-x64': '669ab37e30ff826b1f23dd1ca90868796c6b3b3b80eab9f0338e9f1efb6993f5',
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
	private _installedPath: string | undefined;

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

	/** The plugin directory as of the last {@link getInstalledPath} probe or {@link resolve} install. */
	get installedPath(): string | undefined {
		return this._installedPath;
	}

	private get _pluginDir(): string {
		return join(this._environmentService.userDataPath, 'agent-host', 'computer-use-plugin', this._release.version, this._target);
	}

	/** Returns the plugin directory when it is already installed, without downloading. */
	async getInstalledPath(): Promise<string | undefined> {
		this._installedPath = this.isAvailable && await Promises.exists(join(this._pluginDir, COMPLETE_SENTINEL)) ? this._pluginDir : undefined;
		return this._installedPath;
	}

	/**
	 * Returns the plugin directory, downloading it when needed, or `undefined`
	 * when no release exists for this platform. Rejects when the download or
	 * verification fails, or when `token` is cancelled.
	 */
	async resolve(token: CancellationToken): Promise<string | undefined> {
		const expectedSha256 = this._release.sha256[this._target];
		const installedPath = await this.getInstalledPath();
		if (!expectedSha256 || installedPath) {
			return installedPath;
		}

		const pluginDir = this._pluginDir;
		const url = this._release.urlTemplate.replace(/\{version\}/g, this._release.version).replace(/\{target\}/g, this._target);
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

		await installComputerUsePluginArchive(archive.buffer, this._target, pluginDir, token);
		this._logService.info(`[Copilot] Installed Computer Use plugin ${this._release.version} at ${pluginDir}`);
		this._installedPath = pluginDir;
		return pluginDir;
	}
}

/**
 * Extracts the `<target>/` folder of a verified release archive into
 * `pluginDir` and publishes it with a `.complete` sentinel. Rejects with a
 * cancellation error, without publishing, when `token` is cancelled.
 */
export async function installComputerUsePluginArchive(archive: Uint8Array, target: string, pluginDir: string, token: CancellationToken): Promise<void> {
	// Stage next to the final directory and publish it with a rename, so
	// an interrupted install never leaves a directory with a sentinel.
	await fs.promises.mkdir(dirname(pluginDir), { recursive: true });
	const tmpDir = await fs.promises.mkdtemp(`${pluginDir}.tmp-`);
	try {
		const archivePath = join(tmpDir, 'plugin.zip');
		const stagingDir = join(tmpDir, 'plugin');
		await fs.promises.writeFile(archivePath, archive);
		// No trailing slash: the archive's `<target>/` directory entry must reduce to `/`.
		try {
			await extract(archivePath, stagingDir, { sourcePath: target }, token);
		} catch (error) {
			throw token.isCancellationRequested ? new CancellationError() : error;
		}
		// `extract` can also resolve after a cancellation that stopped it part-way.
		if (token.isCancellationRequested) {
			throw new CancellationError();
		}
		await fs.promises.writeFile(join(stagingDir, COMPLETE_SENTINEL), '');
		await publishComputerUsePlugin(stagingDir, pluginDir, join(tmpDir, 'stale'));
	} finally {
		await fs.promises.rm(tmpDir, { recursive: true, force: true });
	}
}

/**
 * Renames the complete `stagingDir` to `pluginDir`. It never removes a
 * published plugin, which a concurrent install or a running session may use:
 * when `pluginDir` is complete, a concurrent install published it first.
 */
async function publishComputerUsePlugin(stagingDir: string, pluginDir: string, staleDir: string): Promise<void> {
	try {
		await fs.promises.rename(stagingDir, pluginDir);
		return;
	} catch {
		// Renaming onto an existing directory fails (EPERM on Windows, ENOTEMPTY on POSIX).
		if (await Promises.exists(join(pluginDir, COMPLETE_SENTINEL))) {
			return;
		}
	}
	// Move an incomplete directory aside. Unlike a recursive removal, a rename is
	// atomic: no concurrent install can publish into it or see it half removed.
	// It fails when there is none, e.g. because a concurrent install moved it;
	// the rename below then reports any error that is not about the destination.
	await fs.promises.rename(pluginDir, staleDir).catch(() => { /* nothing to move aside */ });
	try {
		await fs.promises.rename(stagingDir, pluginDir);
	} catch (error) {
		if (!await Promises.exists(join(pluginDir, COMPLETE_SENTINEL))) {
			throw error;
		}
	}
}
