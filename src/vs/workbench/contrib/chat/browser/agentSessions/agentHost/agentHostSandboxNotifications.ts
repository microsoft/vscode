/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, DisposableMap } from '../../../../../../base/common/lifecycle.js';
import { LRUCache } from '../../../../../../base/common/map.js';
import { localize } from '../../../../../../nls.js';
import { IAgentConnection } from '../../../../../../platform/agentHost/common/agentService.js';
import { IAgentHostConnectionsService } from '../../../../../../platform/agentHost/common/agentHostConnectionsService.js';
import { readChatSandboxStates, readSessionSandboxState } from '../../../../../../platform/agentHost/common/meta/agentSandboxStateMeta.js';
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
			// Errors stay in the state until the next change, so each is reported once per session.
			const reported = new LRUCache<string, true>(100);
			this._listeners.set(connection, connection.onDidAction(envelope => {
				if (envelope.action.type !== ActionType.SessionMetaChanged) {
					return;
				}
				// A chat's failed change is in its own entry; the session-level one is the default chat's or an older host's.
				for (const state of [readSessionSandboxState(envelope.action), ...readChatSandboxStates(envelope.action).values()]) {
					const error = state?.error;
					const key = error && `${envelope.channel}\n${error.clientSeq}`;
					if (!error || !key || error.clientId !== connection.clientId || reported.get(key)) {
						continue;
					}
					reported.set(key, true);
					this._logService.error('Failed to update session sandbox configuration', error.message);
					this._notificationService.error(localize('agentHost.sandboxUpdateFailed', "Could not change sandbox access. {0}", error.message));
				}
			}));
		}
	}
}
