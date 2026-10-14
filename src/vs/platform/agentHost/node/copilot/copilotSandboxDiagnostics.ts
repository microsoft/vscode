/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { CopilotClient } from '@github/copilot-sdk';
import { equals } from '../../../../base/common/arrays.js';
import { raceTimeout } from '../../../../base/common/async.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { localize } from '../../../../nls.js';
import { ILogService } from '../../../log/common/log.js';
import { agentSandboxDiagnosticsMetaKey, readAgentSandboxDiagnostics } from '../../common/meta/agentSandboxDiagnostics.js';
import { AgentHostStateManager, IAgentHostStateManager } from '../agentHostStateManager.js';
import type { SandboxConfig } from './sandboxConfigForSdk.js';

type SandboxHostSupport = Awaited<ReturnType<CopilotClient['rpc']['sandbox']['getHostSupport']>>;

const SANDBOX_DIAGNOSTICS_TIMEOUT_MS = 5_000;

export class CopilotSandboxDiagnostics extends Disposable {
	private _generation = 0;

	constructor(
		private readonly _session: string,
		private readonly _getHostSupport: () => Promise<SandboxHostSupport>,
		@IAgentHostStateManager private readonly _stateManager: AgentHostStateManager,
		@ILogService private readonly _logService: ILogService,
	) {
		super();
	}

	async update(config: SandboxConfig): Promise<void> {
		const generation = ++this._generation;
		let reasons: string[] = [];
		if (config.enabled) {
			try {
				const support = await raceTimeout(this._getHostSupport(), SANDBOX_DIAGNOSTICS_TIMEOUT_MS);
				if (!support) {
					this._logService.warn(`[Copilot:${this._session}] Sandbox host support query timed out after ${SANDBOX_DIAGNOSTICS_TIMEOUT_MS}ms`);
					return;
				}
				if (!support.supported) {
					this._logService.warn(`[Copilot:${this._session}] Sandbox backend unavailable`, support.reason);
					reasons = [localize('copilot.sandbox.missingDependencies', "Missing sandbox dependencies may prevent terminal commands from running.")];
				} else {
					const network = config.userPolicy?.network;
					const missingCapabilities = support.capabilities.filter(capability => !capability.supported && (
						capability.name === 'shell'
						|| capability.name === 'filesystem_enumeration'
						|| capability.name === 'network' && network?.allowOutbound === true
						|| capability.name === 'network_filtering'
						|| capability.name === 'denied_paths' && !!config.userPolicy?.filesystem?.deniedPaths?.length
					));
					for (const capability of missingCapabilities) {
						this._logService.warn(`[Copilot:${this._session}] Sandbox capability '${capability.name}' unavailable`, capability.reason);
					}
					const capability = missingCapabilities[0];
					if (capability) {
						reasons = [getMissingCapabilityMessage(capability.name)];
					}
				}

				function getMissingCapabilityMessage(capability: string): string {
					switch (capability) {
						case 'shell':
							return localize('copilot.sandbox.missingShell', "Missing sandbox dependencies may prevent terminal commands from running.");
						case 'filesystem_enumeration':
							return localize('copilot.sandbox.missingFilesystemEnumeration', "Missing sandbox dependencies may prevent terminal commands from accessing folders.");
						case 'network':
							return localize('copilot.sandbox.missingNetwork', "Missing sandbox dependencies may prevent terminal commands from connecting to the network.");
						case 'network_filtering':
							return localize('copilot.sandbox.missingNetworkFiltering', "Missing sandbox dependencies may prevent network access restrictions from working.");
						case 'denied_paths':
							return localize('copilot.sandbox.missingDeniedPaths', "Missing sandbox dependencies may prevent blocked files and folders from being protected.");
						default:
							return localize('copilot.sandbox.missingDependencies', "Missing sandbox dependencies may prevent terminal commands from running.");
					}
				}
			} catch (error) {
				this._logService.warn(`[Copilot:${this._session}] Failed to query sandbox host support`, error);
				return;
			}
		}
		if (this._store.isDisposed || generation !== this._generation) {
			return;
		}
		const summary = this._stateManager.getSessionSummary(this._session);
		if (!summary || equals(readAgentSandboxDiagnostics(summary) ?? [], reasons)) {
			return;
		}
		const meta = { ...summary._meta };
		if (reasons.length) {
			meta[agentSandboxDiagnosticsMetaKey] = reasons;
		} else {
			delete meta[agentSandboxDiagnosticsMetaKey];
		}
		this._stateManager.setSessionMeta(this._session, meta);
	}
}
