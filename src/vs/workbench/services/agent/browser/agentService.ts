/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Nikolaas Bender. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { IAgentService, ITool } from '../../../../platform/agent/common/agent.js';
import { Emitter } from '../../../../base/common/event.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { registerSingleton, InstantiationType } from '../../../../platform/instantiation/common/extensions.js';

import { ReadFileTool, WriteFileTool, ExecCommandTool } from './tools.js';

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
		this.registerTool(this.instantiationService.createInstance(ReadFileTool));
		this.registerTool(this.instantiationService.createInstance(WriteFileTool));
		this.registerTool(this.instantiationService.createInstance(ExecCommandTool));
		this.checkConnection();
	}

	private async checkConnection(): Promise<void> {
		try {
			// Poll for messages (commands)
			const response = await fetch('http://localhost:3000/messages');
			if (response.ok) {
				if (!this._connected) {
					this._connected = true;
					this._onDidChangeConnectionState.fire(true);
					console.log('AgentService: Connected to Sidecar');
				}

				const messages = await response.json() as any[];
				if (Array.isArray(messages)) {
					for (const msg of messages) {
						if (msg.type === 'tool_call') {
							this.executeTool(msg);
						}
					}
				}
			} else {
				this.handleDisconnect();
			}
		} catch (error) {
			this.handleDisconnect();
		}

		// Poll every 1 second for faster responsiveness
		setTimeout(() => this.checkConnection(), 1000);
	}

	private async executeTool(msg: any): Promise<void> {
		const tool = this.tools.get(msg.name);
		if (!tool) {
			console.warn(`AgentService: Tool not found: ${msg.name}`);
			this.sendMessage('tool_result', { id: msg.id, error: 'Tool not found' });
			return;
		}

		try {
			console.log(`AgentService: Executing tool ${msg.name}`, msg.args);
			const result = await tool.execute(msg.args);
			this.sendMessage('tool_result', { id: msg.id, result });
		} catch (error) {
			console.error(`AgentService: Tool ${msg.name} failed`, error);
			this.sendMessage('tool_result', { id: msg.id, error: String(error) });
		}
	}

	private handleDisconnect(): void {
		if (this._connected) {
			this._connected = false;
			this._onDidChangeConnectionState.fire(false);
			console.log('AgentService: Disconnected from Sidecar');
		}
	}

	private readonly tools = new Map<string, ITool>();

	registerTool(tool: ITool): void {
		if (this.tools.has(tool.name)) {
			console.warn(`AgentService: Tool ${tool.name} is already registered.`);
			return;
		}
		this.tools.set(tool.name, tool);
		console.log(`AgentService: Registered tool ${tool.name}`);
	}

	async sendMessage(topic: string, message: any): Promise<void> {
		if (!this._connected) {
			console.warn('AgentService: Not connected, dropping message', topic, message);
			return;
		}
		try {
			// We use a specific endpoint for messages now if we want to support long-polling or similar in future
			// For now, keep using root or /message
			await fetch('http://localhost:3000/message', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ topic, message })
			});
		} catch (error) {
			console.error('AgentService: Failed to send message', error);
		}
	}
}

registerSingleton(IAgentService, AgentService, InstantiationType.Delayed);
