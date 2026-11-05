/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { equals } from '../../../../base/common/objects.js';
import { ILogService } from '../../../log/common/log.js';
import { readAgentSandboxCertificate, withAgentSandboxCertificate, type IAgentSandboxCertificateStatus } from '../../common/meta/agentSandboxCertificate.js';
import type { IAgentChatConfigurationTarget } from '../agentConfigurationService.js';
import { AgentHostStateManager, IAgentHostStateManager } from '../agentHostStateManager.js';
import type { SandboxConfig } from './sandboxConfigForSdk.js';

/** Projects a background host check onto a chat without joining the session's startup or send path. */
export class CopilotSandboxCertificateDiagnostics extends Disposable {
	private _generation = 0;

	constructor(
		private readonly _getTarget: () => IAgentChatConfigurationTarget,
		private readonly _getStatus: (config: SandboxConfig) => Promise<IAgentSandboxCertificateStatus | undefined>,
		@IAgentHostStateManager private readonly _stateManager: AgentHostStateManager,
		@ILogService private readonly _logService: ILogService,
	) {
		super();
	}

	update(config: SandboxConfig): Promise<void> {
		const generation = ++this._generation;
		return this._update(config, generation).catch(error => {
			this._logService.warn('[Copilot] Failed to publish sandbox certificate diagnostics', error);
		});
	}

	private async _update(config: SandboxConfig, generation: number): Promise<void> {
		const result = config.enabled ? await this._getStatus(config) : undefined;
		const status = result?.state === 'notRequired' ? undefined : result;
		if (this._store.isDisposed || generation !== this._generation) {
			return;
		}
		// Resolve ownership after the await: a live chat can move to a different session.
		const target = this._getTarget();
		const session = target.session;
		const summary = this._stateManager.getSessionSummary(session);
		if (summary && !equals(readAgentSandboxCertificate(summary, target.chat), status)) {
			this._stateManager.setSessionMeta(session, withAgentSandboxCertificate(summary._meta, target.chat, status));
		}
	}
}
