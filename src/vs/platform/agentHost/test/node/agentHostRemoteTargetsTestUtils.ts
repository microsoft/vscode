/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { observableValue } from '../../../../base/common/observable.js';
import type { IAgentHostRemoteTargetConnectOptions, IAgentHostRemoteTargetConnector, IAgentHostRemoteTargetDescriptor } from '../../common/agentHostRemoteAgents.js';
import type { IRemoteAgentHostReconnectPolicy } from '../../common/reconnectPolicy.js';
import type { IRemoteAgentHostProtocolClient } from '../../common/remoteAgentHostService.js';

export class TestAgentHostRemoteTargetConnector implements IAgentHostRemoteTargetConnector {
	private readonly _targets = observableValue<readonly IAgentHostRemoteTargetDescriptor[]>(this, []);
	readonly targets = this._targets;
	readonly createCalls: Array<{ readonly target: IAgentHostRemoteTargetDescriptor; readonly options: IAgentHostRemoteTargetConnectOptions }> = [];

	constructor(
		readonly connectorId: string,
		private readonly _createConnection: (target: IAgentHostRemoteTargetDescriptor, options: IAgentHostRemoteTargetConnectOptions) => Promise<IRemoteAgentHostProtocolClient>,
		readonly reconnectPolicy?: IRemoteAgentHostReconnectPolicy,
	) { }

	setTargets(targets: readonly IAgentHostRemoteTargetDescriptor[]): void {
		this._targets.set(targets, undefined);
	}

	createConnection(target: IAgentHostRemoteTargetDescriptor, options: IAgentHostRemoteTargetConnectOptions): Promise<IRemoteAgentHostProtocolClient> {
		this.createCalls.push({ target, options });
		return this._createConnection(target, options);
	}
}

export function remoteTarget(internalKey: string, targetId: string, label: string): IAgentHostRemoteTargetDescriptor {
	return { internalKey, targetId, label };
}
