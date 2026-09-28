/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import type { IDevContainerAgentHostConfig, IDevContainerAgentHostConnectResult, IDevContainerAgentHostMainService, IDevContainerAgentHostOutput } from '../../common/devContainerAgentHost.js';
import type { IRelayMessage } from '../../common/relayTransport.js';

export class MockDevContainerService extends Disposable implements IDevContainerAgentHostMainService {
	declare readonly _serviceBrand: undefined;
	readonly relayMessage = this._register(new Emitter<IRelayMessage>());
	readonly onDidRelayMessage = this.relayMessage.event;
	readonly relayClose = this._register(new Emitter<string>());
	readonly onDidRelayClose = this.relayClose.event;
	readonly closeConnection = this._register(new Emitter<string>());
	readonly onDidCloseConnection = this.closeConnection.event;
	readonly output = this._register(new Emitter<IDevContainerAgentHostOutput>());
	readonly onDidOutput = this.output.event;
	readonly connects: IDevContainerAgentHostConfig[] = [];
	readonly disconnects: string[] = [];
	readonly sent: IRelayMessage[] = [];
	connectResult: Promise<IDevContainerAgentHostConnectResult> | undefined;

	async isDockerAvailable(): Promise<boolean> {
		return true;
	}

	async connect(config: IDevContainerAgentHostConfig): Promise<IDevContainerAgentHostConnectResult> {
		this.connects.push(config);
		return this.connectResult ?? { connectionId: config.connectionId, name: config.name, address: 'devcontainer:test', remoteWorkspaceFolder: '/workspaces/project' };
	}

	async disconnect(connectionId: string): Promise<void> {
		this.disconnects.push(connectionId);
	}

	async relaySend(connectionId: string, data: string): Promise<void> {
		this.sent.push({ connectionId, data });
	}
}
