/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Nikolaas Bender. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { IAgentService } from '../../../../platform/agent/common/agent.js';
import { Emitter } from '../../../../base/common/event.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { registerSingleton, InstantiationType } from '../../../../platform/instantiation/common/extensions.js';

export class AgentService extends Disposable implements IAgentService {

	declare readonly _serviceBrand: undefined;

	private readonly _onDidChangeConnectionState = this._register(new Emitter<boolean>());
	readonly onDidChangeConnectionState = this._onDidChangeConnectionState.event;

	private _connected = false;
	get connected(): boolean { return this._connected; }

	constructor(
		@IInstantiationService private readonly instantiationService: IInstantiationService
	) {
		super();
		this.checkConnection();
	}

	private async checkConnection(): Promise<void> {
		try {
			const response = await fetch('http://localhost:3000');
			if (response.ok) {
				if (!this._connected) {
					this._connected = true;
					this._onDidChangeConnectionState.fire(true);
					console.log('AgentService: Connected to Sidecar');
				}
			} else {
				this.handleDisconnect();
			}
		} catch (error) {
			this.handleDisconnect();
		}

		// Poll every 5 seconds
		setTimeout(() => this.checkConnection(), 5000);
	}

	private handleDisconnect(): void {
		if (this._connected) {
			this._connected = false;
			this._onDidChangeConnectionState.fire(false);
			console.log('AgentService: Disconnected from Sidecar');
		}
	}

	async sendMessage(topic: string, message: any): Promise<void> {
		if (!this._connected) {
			console.warn('AgentService: Not connected, dropping message', topic, message);
			return;
		}
		try {
			await fetch('http://localhost:3000', {
				method: 'POST',
				body: JSON.stringify({ topic, message })
			});
		} catch (error) {
			console.error('AgentService: Failed to send message', error);
		}
	}
}

registerSingleton(IAgentService, AgentService, InstantiationType.Delayed);
