/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, DisposableStore, MutableDisposable } from '../../../../../../base/common/lifecycle.js';
import { localize } from '../../../../../../nls.js';
import { AgentHostEnabledSettingId, IAgentHostService } from '../../../../../../platform/agentHost/common/agentService.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { IWorkbenchContribution } from '../../../../../../workbench/common/contributions.js';
import { LoggingAgentConnection } from '../../../../../../workbench/contrib/chat/browser/agentSessions/agentHost/loggingAgentConnection.js';
import { IAgentHostTerminalService } from '../../../../../../workbench/contrib/terminal/browser/agentHostTerminalService.js';

/**
 * Registers local agent host terminal entries with
 * {@link IAgentHostTerminalService} so they appear in the terminal dropdown.
 *
 * Gated on the `chat.agentHost.enabled` setting.
 */
export class AgentHostTerminalContribution extends Disposable implements IWorkbenchContribution {
	static readonly ID = 'workbench.contrib.agentHostTerminal';

	private readonly _localEntry = this._register(new MutableDisposable());
	private readonly _conditionalListeners = this._register(new MutableDisposable<DisposableStore>());

	constructor(
		@IAgentHostService private readonly _agentHostService: IAgentHostService,
		@IAgentHostTerminalService private readonly _agentHostTerminalService: IAgentHostTerminalService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
	) {
		super();

		this._register(this._configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(AgentHostEnabledSettingId)) {
				this._updateEnabled();
			}
		}));

		this._updateEnabled();
	}

	private _updateEnabled(): void {
		if (this._configurationService.getValue<boolean>(AgentHostEnabledSettingId)) {
			if (!this._conditionalListeners.value) {
				const store = new DisposableStore();
				store.add(this._agentHostService.onAgentHostStart(() => this._reconcile()));
				store.add(this._agentHostService.onAgentHostExit(() => this._reconcile()));
				this._conditionalListeners.value = store;
				this._reconcile();
			}
		} else {
			this._conditionalListeners.value = undefined;
			this._localEntry.value = undefined;
		}
	}

	private _reconcile(): void {
		if (!this._localEntry.value) {
			this._localEntry.value = this._agentHostTerminalService.registerEntry({
				name: localize('agentHostTerminal.local', "Local"),
				address: '__local__',
				getConnection: () => this._instantiationService.createInstance(
					LoggingAgentConnection,
					this._agentHostService,
					`agenthost.${this._agentHostService.clientId}`,
					localize('agentHostTerminal.channelLocal', "Agent Host Terminal (Local)"),
				),
			});
		}
	}
}
