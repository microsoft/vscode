/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { CopilotSession } from '@github/copilot-sdk';
import { equals } from '../../../../base/common/arrays.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { ILogService } from '../../../log/common/log.js';
import { readRuntimePluginEnablement, withRuntimePluginEnablement, type IRuntimePluginEnablement } from '../../common/meta/runtimePluginEnablement.js';
import { AgentHostStateManager, IAgentHostStateManager } from '../agentHostStateManager.js';

type CopilotSessionPlugins = Awaited<ReturnType<CopilotSession['rpc']['plugins']['list']>>['plugins'];

/**
 * Publishes the plugin enablement a live Copilot SDK session reports into its
 * owning session's `_meta`.
 *
 * `session.rpc.plugins.list()` is the runtime's effective state for that
 * session: a team-default plugin is enabled there although its persisted
 * install record (`client.rpc.plugins.list()`) stays disabled so the team
 * default never becomes a personal opt-in. Clients use the report as a
 * runtime default, never as a user decision.
 */
export class CopilotRuntimePluginEnablement extends Disposable {
	private _generation = 0;

	constructor(
		private readonly _getSession: () => string,
		private readonly _logPrefix: string,
		@IAgentHostStateManager private readonly _stateManager: AgentHostStateManager,
		@ILogService private readonly _logService: ILogService,
	) {
		super();
	}

	/** Re-reads `list` and republishes when the reported enablement changed. The latest call wins. */
	async refresh(list: () => Promise<CopilotSessionPlugins>): Promise<void> {
		const generation = ++this._generation;
		let plugins: CopilotSessionPlugins;
		try {
			plugins = await list();
		} catch (error) {
			if (!this._store.isDisposed && generation === this._generation) {
				this._logService.warn(`[Copilot:${this._logPrefix}] Failed to list session plugins for runtime enablement`, error);
			}
			return;
		}
		if (this._store.isDisposed || generation !== this._generation) {
			return;
		}
		const session = this._getSession();
		const summary = this._stateManager.getSessionSummary(session);
		if (!summary) {
			return;
		}
		const report: IRuntimePluginEnablement[] = plugins
			.filter(plugin => plugin.installed !== false && !!plugin.name)
			.map(plugin => ({
				name: plugin.name,
				marketplace: plugin.marketplace,
				...(plugin.directSourceId ? { directSourceId: plugin.directSourceId } : {}),
				enabled: plugin.enabled,
			}));
		const current = readRuntimePluginEnablement(summary);
		if (!current && report.length === 0) {
			return;
		}
		if (current && equals(current, report, (a, b) => a.name === b.name && a.marketplace === b.marketplace && a.directSourceId === b.directSourceId && a.enabled === b.enabled)) {
			return;
		}
		this._stateManager.setSessionMeta(session, withRuntimePluginEnablement(summary._meta, report));
	}
}
