/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { Codex, CodexOptions } from '@openai/codex-sdk';
import * as fs from 'fs';
import { pathToFileURL } from 'url';
import { join, resolve } from '../../../../base/common/path.js';
import { createDecorator } from '../../../instantiation/common/instantiation.js';
import { ILogService } from '../../../log/common/log.js';
import { AgentHostCodexSdkPathEnvVar } from '../../common/agentService.js';

export const ICodexAgentSdkService = createDecorator<ICodexAgentSdkService>('codexAgentSdkService');

/**
 * Lazy wrapper over `@openai/codex-sdk` for the agent host Codex provider.
 * The SDK (and the ~190MB native `codex` CLI binary it bundles per
 * platform) is intentionally not shipped with VS Code; users supply an
 * absolute path to a locally-installed `@openai/codex-sdk` package via
 * the `chat.agentHost.codexAgent.path` setting, which is forwarded to
 * this process as `AgentHostCodexSdkPathEnvVar`.
 */
export interface ICodexAgentSdkService {
	readonly _serviceBrand: undefined;

	/**
	 * Instantiate a {@link Codex} client. Loads the SDK module on first
	 * use; subsequent calls reuse the cached module. Throws if the SDK
	 * path setting is not set or the module fails to load.
	 */
	createCodex(options: CodexOptions): Promise<Codex>;
}

/**
 * Narrowed structural slice of `@openai/codex-sdk` covering exactly the
 * bindings the agent host pulls from the SDK. Production `import()`
 * returns the full module which is structurally assignable to this
 * interface; tests can subclass {@link CodexAgentSdkService} and
 * override {@link CodexAgentSdkService._loadSdk} to stub these bindings.
 */
export interface ICodexSdkBindings {
	Codex: new (options: CodexOptions) => Codex;
}

/**
 * Production implementation. The SDK module is loaded lazily via dynamic
 * `import()` because it pulls in the codex native CLI binary (~190MB per
 * platform) which we deliberately do not bundle with VS Code.
 */
export class CodexAgentSdkService implements ICodexAgentSdkService {
	declare readonly _serviceBrand: undefined;

	/**
	 * Cached resolved bindings. We deliberately cache the *resolved* value,
	 * not the in-flight promise — if a transient `import()` failure recovers
	 * (e.g. user fixes a broken `node_modules`), the next call retries.
	 * Mirrors the convention in `claudeAgentSdkService.ts`.
	 */
	private _sdkModule: ICodexSdkBindings | undefined;

	/**
	 * Latched once we've logged a load failure, so a corrupt postinstall
	 * doesn't flood `error` events on every `createCodex()` call.
	 */
	private _firstLoadFailureLogged = false;

	constructor(
		@ILogService private readonly _logService: ILogService,
	) { }

	async createCodex(options: CodexOptions): Promise<Codex> {
		const sdk = await this._getSdk();
		return new sdk.Codex(options);
	}

	private async _getSdk(): Promise<ICodexSdkBindings> {
		if (this._sdkModule) {
			return this._sdkModule;
		}
		try {
			this._sdkModule = await this._loadSdk();
			return this._sdkModule;
		} catch (err) {
			if (!this._firstLoadFailureLogged) {
				this._firstLoadFailureLogged = true;
				this._logService.error('[Codex] Failed to load @openai/codex-sdk', err);
			}
			throw err;
		}
	}

	protected async _loadSdk(): Promise<ICodexSdkBindings> {
		// The SDK is intentionally not bundled with VS Code. The user supplies an
		// absolute path to a locally-installed `@openai/codex-sdk` package via
		// the `chat.agentHost.codexAgent.path` setting, which is forwarded to
		// this process as `AgentHostCodexSdkPathEnvVar`. Convert to a `file://`
		// URL so dynamic `import()` accepts paths with spaces and works on Windows.
		const sdkPath = process.env[AgentHostCodexSdkPathEnvVar];
		if (!sdkPath) {
			throw new Error(`Cannot load @openai/codex-sdk: ${AgentHostCodexSdkPathEnvVar} is not set. Set the 'chat.agentHost.codexAgent.path' setting to a locally-installed SDK package.`);
		}
		// Node ESM rejects directory imports, so if the user pointed at the
		// package directory, resolve its `exports['.']` / `main` entry first.
		let entry = sdkPath;
		if (fs.statSync(sdkPath).isDirectory()) {
			const pkgJson = JSON.parse(fs.readFileSync(join(sdkPath, 'package.json'), 'utf8'));
			const mainEntry = pkgJson.exports?.['.']?.default
				?? pkgJson.exports?.['.']?.import
				?? pkgJson.module
				?? pkgJson.main
				?? 'index.js';
			entry = resolve(sdkPath, mainEntry);
		}
		return import(pathToFileURL(entry).href);
	}
}
