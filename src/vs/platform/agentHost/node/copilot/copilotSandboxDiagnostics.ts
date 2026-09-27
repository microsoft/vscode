/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { CopilotClient } from '@github/copilot-sdk';
import { equals } from '../../../../base/common/arrays.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { localize } from '../../../../nls.js';
import { ILogService } from '../../../log/common/log.js';
import { agentSandboxDiagnosticsMetaKey, readAgentSandboxDiagnostics } from '../../common/meta/agentSandboxDiagnostics.js';
import { AgentHostStateManager, IAgentHostStateManager } from '../agentHostStateManager.js';
import type { SandboxConfig } from './sandboxConfigForSdk.js';

type SandboxHostSupport = Awaited<ReturnType<CopilotClient['rpc']['sandbox']['getHostSupport']>>;

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
				const support = await this._getHostSupport();
				if (!support.supported) {
					reasons = [support.reason || localize('copilot.sandbox.unsupported', "The sandbox backend is unavailable on this host.")];
				} else {
					const network = config.userPolicy?.network;
					reasons = support.capabilities.filter(capability => !capability.supported && (
						capability.name === 'shell'
						|| capability.name === 'network' && network?.allowOutbound === true
						|| capability.name === 'network_filtering' && network?.proxy !== undefined
						|| capability.name === 'denied_paths' && !!config.userPolicy?.filesystem?.deniedPaths?.length
					)).map(capability => capability.reason || localize('copilot.sandbox.capabilityUnavailable', "The sandbox capability '{0}' is unavailable on this host.", capability.name));
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
