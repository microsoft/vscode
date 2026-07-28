/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type * as AgentSdk from '@anthropic-ai/claude-agent-sdk';
import * as vscode from 'vscode';
import { ConfigKey, IConfigurationService } from '../../../../platform/configuration/common/configurationService';
import { ILogService } from '../../../../platform/log/common/logService';
import { raceCancellation, raceTimeout } from '../../../../util/vs/base/common/async';
import { Event } from '../../../../util/vs/base/common/event';
import { DisposableStore } from '../../../../util/vs/base/common/lifecycle';
import { CLAUDE_SDK_EXTENSION_ID, IClaudeAgentSdkLoaderService } from '../common/claudeAgentSdkLoaderService';

type SDKActivation =
	| { sdk: typeof AgentSdk; error: null }
	| { sdk: null; error: Error };

class SdkExtensionNotInstalledError extends Error {
	constructor() {
		super('The ms-vscode.vscode-claude-sdk extension is not installed.');
		this.name = 'SdkExtensionNotInstalledError';
	}
}

export class VsCodeClaudeAgentSdkLoaderService implements IClaudeAgentSdkLoaderService {
	readonly _serviceBrand: undefined;

	// Cached on success; reset to undefined on failure so the next call retries.
	private _sdk: Promise<typeof AgentSdk> | undefined;

	constructor(
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@ILogService private readonly _logService: ILogService,
	) { }

	get isAvailable(): boolean {
		return vscode.extensions.getExtension(CLAUDE_SDK_EXTENSION_ID) !== undefined;
	}

	async install(token: vscode.CancellationToken): Promise<boolean> {
		if (token.isCancellationRequested) {
			return false;
		}

		try {
			await vscode.commands.executeCommand('workbench.extensions.installExtension', CLAUDE_SDK_EXTENSION_ID);
		} catch (err) {
			// May throw if already installing or on network error; check availability below.
			this._logService.warn(`[ClaudeAgentSdkLoader] installExtension command failed for ${CLAUDE_SDK_EXTENSION_ID}: ${err}`);
		}

		if (this.isAvailable) {
			return true;
		}

		// The install command may return before the extension is activated — wait for onDidChange.
		const store = new DisposableStore();
		try {
			const onDidChange: Event<void> = listener => vscode.extensions.onDidChange(listener);
			const ready = Event.toPromise(Event.onceIf(onDidChange, () => this.isAvailable), store);
			// Re-check after registering the listener: the extension may have become available
			// between the pre-check above and the listener hookup, in which case onDidChange
			// will never fire again and we would otherwise hang until the timeout.
			if (this.isAvailable) {
				return true;
			}
			const timeoutMs = this._configurationService.getConfig(ConfigKey.ClaudeAgentSdkExtensionInstallTimeout);
			await raceCancellation(raceTimeout(ready, timeoutMs), token);
			return this.isAvailable;
		} finally {
			store.dispose();
		}
	}

	load(): Promise<typeof AgentSdk> {
		if (!this._sdk) {
			const attempt = this._doLoad();
			// Only cache on success — reset on failure so the next call retries.
			this._sdk = attempt.then(
				sdk => { this._sdk = Promise.resolve(sdk); return sdk; },
				err => { this._sdk = undefined; throw err; }
			);
		}
		return this._sdk;
	}

	private async _doLoad(): Promise<typeof AgentSdk> {
		const ext = vscode.extensions.getExtension<SDKActivation>(CLAUDE_SDK_EXTENSION_ID);
		if (!ext) {
			throw new SdkExtensionNotInstalledError();
		}
		const result = await ext.activate();
		if (result.error) {
			throw result.error;
		}
		return result.sdk!;
	}
}
