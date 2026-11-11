/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, DisposableStore } from '../../../../../../base/common/lifecycle.js';
import { autorun } from '../../../../../../base/common/observable.js';
import { IAgentHostConnectionsService } from '../../../../../../platform/agentHost/common/agentHostConnectionsService.js';
import { AgentHostConfigKey } from '../../../../../../platform/agentHost/common/agentHostCustomizationConfig.js';
import { IAgentHostEnablementService } from '../../../../../../platform/agentHost/common/agentHostEnablementService.js';
import { ActionType } from '../../../../../../platform/agentHost/common/state/protocol/actions.js';
import { ROOT_STATE_URI } from '../../../../../../platform/agentHost/common/state/sessionState.js';
import { IWorkbenchContribution } from '../../../../../common/contributions.js';

/** Remove once all supported hosts allow signed-out operation without this legacy key. */
export class AgentHostSignedOutCompatibilityContribution extends Disposable implements IWorkbenchContribution {
	static readonly ID = 'workbench.contrib.agentHostSignedOutCompatibility';

	constructor(
		@IAgentHostConnectionsService connectionsService: IAgentHostConnectionsService,
		@IAgentHostEnablementService enablementService: IAgentHostEnablementService,
	) {
		super();
		this._register(autorun(reader => {
			if (!enablementService.enabled.read(reader)) {
				return;
			}
			const connections = reader.store.add(new DisposableStore());
			const bind = () => {
				connections.clear();
				for (const { connection } of connectionsService.connections) {
					if (!connection) {
						continue;
					}
					const push = () => {
						const root = connection.rootState.value;
						const key = AgentHostConfigKey.AllowSignedOutWhenUsable;
						if (root && !(root instanceof Error) && root.config?.schema.properties[key] && root.config.values[key] !== true) {
							connection.dispatch(ROOT_STATE_URI, { type: ActionType.RootConfigChanged, config: { [key]: true } });
						}
					};
					connections.add(connection.rootState.onDidChange(push));
					push();
				}
			};
			reader.store.add(connectionsService.onDidChangeConnections(bind));
			bind();
		}));
	}
}
