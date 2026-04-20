/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, MutableDisposable } from '../../../../../../base/common/lifecycle.js';
import { localize } from '../../../../../../nls.js';
import { IAgentHostService } from '../../../../../../platform/agentHost/common/agentService.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { IWorkbenchContribution } from '../../../../../../workbench/common/contributions.js';
import { LoggingAgentConnection } from '../../../../../../workbench/contrib/chat/browser/agentSessions/agentHost/loggingAgentConnection.js';
import { IAgentHostTerminalService } from '../../../../../../workbench/contrib/terminal/browser/agentHostTerminalService.js';

/**
 * Registers local agent host terminal entries with
 * {@link IAgentHostTerminalService} so they appear in the terminal dropdown.
 */
export class AgentHostTerminalContribution extends Disposable implements IWorkbenchContribution {
	static readonly ID = 'workbench.contrib.agentHostTerminal';

	private readonly _localEntry = this._register(new MutableDisposable());

	constructor(
		@IAgentHostService private readonly _agentHostService: IAgentHostService,
		@IAgentHostTerminalService private readonly _agentHostTerminalService: IAgentHostTerminalService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
	) {
		super();

		this._register(this._agentHostService.onAgentHostStart(() => this._reconcile()));
		this._register(this._agentHostService.onAgentHostExit(() => this._reconcile()));
		this._reconcile();
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
