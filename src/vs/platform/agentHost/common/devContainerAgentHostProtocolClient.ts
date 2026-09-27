/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationError } from '../../../base/common/errors.js';
import { Emitter } from '../../../base/common/event.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import { DevContainerCloseConnectionNotification, DevContainerConnectExtensionMethod, devContainerConnectResultValidator, devContainerConnectionParamsValidator, DevContainerDisconnectExtensionMethod, DevContainerIsDockerAvailableExtensionMethod, DevContainerOutputNotification, DevContainerRelayCloseNotification, DevContainerRelayMessageNotification, devContainerRelayMessageValidator, DevContainerRelaySendExtensionMethod, type IAgentHostExtensionCommandMap } from './agentHostExtensionProtocol.js';
import type { IDevContainerAgentHostConfig, IDevContainerAgentHostConnectResult, IDevContainerAgentHostMainService, IDevContainerAgentHostOutput } from './devContainerAgentHost.js';
import type { IRelayMessage } from './relayTransport.js';

/** Adapts the VS Code extension RPCs to the shared-process Dev Container service contract. */
export class DevContainerAgentHostProtocolClient extends Disposable implements IDevContainerAgentHostMainService {
	declare readonly _serviceBrand: undefined;

	private readonly _onDidRelayMessage = this._register(new Emitter<IRelayMessage>());
	readonly onDidRelayMessage = this._onDidRelayMessage.event;
	private readonly _onDidRelayClose = this._register(new Emitter<string>());
	readonly onDidRelayClose = this._onDidRelayClose.event;
	private readonly _onDidCloseConnection = this._register(new Emitter<string>());
	readonly onDidCloseConnection = this._onDidCloseConnection.event;
	private readonly _onDidOutput = this._register(new Emitter<IDevContainerAgentHostOutput>());
	readonly onDidOutput = this._onDidOutput.event;
	private readonly _connections = new Map<string, object>();

	constructor(
		private readonly _request: <M extends keyof IAgentHostExtensionCommandMap>(method: M, params: IAgentHostExtensionCommandMap[M]['params']) => Promise<IAgentHostExtensionCommandMap[M]['result']>,
	) {
		super();
	}

	async isDockerAvailable(): Promise<boolean> {
		const result = await this._request(DevContainerIsDockerAvailableExtensionMethod, undefined);
		if (typeof result !== 'boolean') {
			throw new Error('Invalid Dev Container Docker availability response');
		}
		return result;
	}

	async connect(config: IDevContainerAgentHostConfig): Promise<IDevContainerAgentHostConnectResult> {
		if (this._connections.has(config.connectionId)) {
			throw new Error('Dev Container connectionId is already in use');
		}
		const generation = {};
		this._connections.set(config.connectionId, generation);
		try {
			const result = devContainerConnectResultValidator.validate(await this._request(DevContainerConnectExtensionMethod, config));
			if (result.error || result.content.connectionId !== config.connectionId || !result.content.address || !result.content.remoteWorkspaceFolder || result.content.hostWorkspaceFolder === '') {
				throw new Error('Invalid Dev Container connection response');
			}
			if (this._connections.get(config.connectionId) !== generation) {
				throw new CancellationError();
			}
			return result.content;
		} catch (error) {
			if (this._connections.get(config.connectionId) === generation) {
				this._connections.delete(config.connectionId);
			}
			throw error;
		}
	}

	async disconnect(connectionId: string): Promise<void> {
		if (this._connections.delete(connectionId)) {
			await this._request(DevContainerDisconnectExtensionMethod, { connectionId });
		}
	}

	async relaySend(connectionId: string, data: string): Promise<void> {
		if (!this._connections.has(connectionId)) {
			throw new Error('Dev Container relay is not connected');
		}
		await this._request(DevContainerRelaySendExtensionMethod, { connectionId, data });
	}

	handleNotification(method: string, params: unknown): boolean {
		switch (method) {
			case DevContainerRelayMessageNotification:
			case DevContainerOutputNotification: {
				const result = devContainerRelayMessageValidator.validate(params);
				if (!result.error && this._connections.has(result.content.connectionId)) {
					(method === DevContainerRelayMessageNotification ? this._onDidRelayMessage : this._onDidOutput).fire(result.content);
				}
				return true;
			}
			case DevContainerRelayCloseNotification:
			case DevContainerCloseConnectionNotification: {
				const result = devContainerConnectionParamsValidator.validate(params);
				if (!result.error && this._connections.has(result.content.connectionId)) {
					if (method === DevContainerRelayCloseNotification) {
						this._onDidRelayClose.fire(result.content.connectionId);
					} else {
						this._connections.delete(result.content.connectionId);
						this._onDidCloseConnection.fire(result.content.connectionId);
					}
				}
				return true;
			}
			default:
				return false;
		}
	}

	connectionClosed(): void {
		const ids = [...this._connections.keys()];
		this._connections.clear();
		for (const id of ids) {
			this._onDidRelayClose.fire(id);
			this._onDidCloseConnection.fire(id);
		}
	}

	override dispose(): void {
		this.connectionClosed();
		super.dispose();
	}
}
