/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, DisposableMap } from '../../../../base/common/lifecycle.js';
import { localize } from '../../../../nls.js';
import { IRemoteAgentHostService, RemoteAgentHostConnectionStatus } from '../../../../platform/agentHost/common/remoteAgentHostService.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { registerWorkbenchContribution2, WorkbenchPhase } from '../../../../workbench/common/contributions.js';
import { LoggingAgentConnection } from '../../../../workbench/contrib/chat/browser/agentSessions/agentHost/loggingAgentConnection.js';
import { IAgentHostTerminalService } from '../../../../workbench/contrib/terminal/browser/agentHostTerminalService.js';

/**
 * Registers remote agent host terminal entries with
 * {@link IAgentHostTerminalService}.
 */
class RemoteAgentHostTerminalContribution extends Disposable {
	private readonly _remoteEntries = this._register(new DisposableMap<string>());

	constructor(
		@IRemoteAgentHostService private readonly _remoteAgentHostService: IRemoteAgentHostService,
		@IAgentHostTerminalService private readonly _agentHostTerminalService: IAgentHostTerminalService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
	) {
		super();

		this._register(this._remoteAgentHostService.onDidChangeConnections(() => this._reconcileRemote()));
		this._reconcileRemote();
	}

	private _reconcileRemote(): void {
		const connectedAddresses = new Set<string>();

		for (const info of this._remoteAgentHostService.connections) {
			if (info.status !== RemoteAgentHostConnectionStatus.Connected) {
				continue;
			}
			const connection = this._remoteAgentHostService.getConnection(info.address);
			if (!connection) {
				continue;
			}
			connectedAddresses.add(info.address);
			if (!this._remoteEntries.has(info.address)) {
				this._remoteEntries.set(info.address, this._agentHostTerminalService.registerEntry({
					name: info.name || info.address,
					address: info.address,
					getConnection: () => this._instantiationService.createInstance(
						LoggingAgentConnection,
						connection,
						`agenthost.${connection.clientId}`,
						localize('agentHostTerminal.channelRemote', "Agent Host Terminal ({0})", info.address),
					),
				}));
			}
		}

		// Remove entries for disconnected hosts
		for (const address of this._remoteEntries.keys()) {
			if (!connectedAddresses.has(address)) {
				this._remoteEntries.deleteAndDispose(address);
			}
		}
	}
}

registerWorkbenchContribution2('workbench.contrib.remoteAgentHostTerminal', RemoteAgentHostTerminalContribution, WorkbenchPhase.AfterRestored);
