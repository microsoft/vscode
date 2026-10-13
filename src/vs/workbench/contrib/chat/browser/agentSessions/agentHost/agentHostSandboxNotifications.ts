/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, DisposableMap } from '../../../../../../base/common/lifecycle.js';
import { LRUCache } from '../../../../../../base/common/map.js';
import { localize } from '../../../../../../nls.js';
import { IAgentConnection } from '../../../../../../platform/agentHost/common/agentService.js';
import { IAgentHostConnectionsService } from '../../../../../../platform/agentHost/common/agentHostConnectionsService.js';
import { readSessionSandboxState } from '../../../../../../platform/agentHost/common/meta/agentSandboxStateMeta.js';
import { ActionType } from '../../../../../../platform/agentHost/common/state/sessionActions.js';
import { ILogService } from '../../../../../../platform/log/common/log.js';
import { INotificationService } from '../../../../../../platform/notification/common/notification.js';
import { IWorkbenchContribution } from '../../../../../common/contributions.js';

export class AgentHostSandboxNotifications extends Disposable implements IWorkbenchContribution {
	static readonly ID = 'workbench.contrib.agentHostSandboxNotifications';
	private readonly _listeners = this._register(new DisposableMap<IAgentConnection>());

	constructor(
		@IAgentHostConnectionsService private readonly _connectionsService: IAgentHostConnectionsService,
		@ILogService private readonly _logService: ILogService,
		@INotificationService private readonly _notificationService: INotificationService,
	) {
		super();
		this._register(this._connectionsService.onDidChangeConnections(() => this._watchConnections()));
		this._watchConnections();
	}

	private _watchConnections(): void {
		const connections = new Set(this._connectionsService.connections.flatMap(info => info.connection ? [info.connection] : []));
		for (const connection of this._listeners.keys()) {
			if (!connections.has(connection)) {
				this._listeners.deleteAndDispose(connection);
			}
		}
		for (const connection of connections) {
			if (this._listeners.has(connection)) {
				continue;
			}
			const reported = new LRUCache<string, number>(100);
			this._listeners.set(connection, connection.onDidAction(envelope => {
				if (envelope.action.type !== ActionType.SessionMetaChanged) {
					return;
				}
				const error = readSessionSandboxState(envelope.action)?.error;
				if (!error || error.clientId !== connection.clientId || reported.get(envelope.channel) === error.clientSeq) {
					return;
				}
				reported.set(envelope.channel, error.clientSeq);
				this._logService.error('Failed to update session sandbox configuration', error.message);
				this._notificationService.error(localize('agentHost.sandboxUpdateFailed', "Could not change terminal sandboxing. Try the action again. {0}", error.message));
			}));
		}
	}
}
