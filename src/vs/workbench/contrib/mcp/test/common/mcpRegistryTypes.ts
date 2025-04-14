/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter } from '../../../../../base/common/event.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { observableValue } from '../../../../../base/common/observable.js';
import { LogLevel } from '../../../../../platform/log/common/log.js';
import { IMcpMessageTransport } from '../../common/mcpRegistryTypes.js';
import { McpConnectionState } from '../../common/mcpTypes.js';
import { MCP } from '../../common/modelContextProtocol.js';

/**
 * Implementation of IMcpMessageTransport for testing purposes.
 * Allows tests to easily send/receive messages and control the connection state.
 */
export class TestMcpMessageTransport extends Disposable implements IMcpMessageTransport {
	private readonly _onDidLog = this._register(new Emitter<{ level: LogLevel; message: string }>());
	public readonly onDidLog = this._onDidLog.event;

	private readonly _onDidReceiveMessage = this._register(new Emitter<MCP.JSONRPCMessage>());
	public readonly onDidReceiveMessage = this._onDidReceiveMessage.event;

	private readonly _stateValue = observableValue<McpConnectionState>('testTransportState', { state: McpConnectionState.Kind.Starting });
	public readonly state = this._stateValue;

	private readonly _sentMessages: MCP.JSONRPCMessage[] = [];

	constructor() {
		super();
	}

	/**
	 * Send a message through the transport.
	 */
	public send(message: MCP.JSONRPCMessage): void {
		this._sentMessages.push(message);
	}

	/**
	 * Stop the transport.
	 */
	public stop(): void {
		this._stateValue.set({ state: McpConnectionState.Kind.Stopped }, undefined);
	}

	// Test Helper Methods

	/**
	 * Simulate receiving a message from the server.
	 */
	public simulateReceiveMessage(message: MCP.JSONRPCMessage): void {
		this._onDidReceiveMessage.fire(message);
	}

	/**
	 * Simulates a reply to an 'initialized' request.
	 */
	public simulateInitialized() {
		if (!this._sentMessages.length) {
			throw new Error('initialize was not called yet');
		}

		this.simulateReceiveMessage({
			jsonrpc: MCP.JSONRPC_VERSION,
			id: (this.getSentMessages()[0] as MCP.JSONRPCRequest).id,
			result: {
				protocolVersion: MCP.LATEST_PROTOCOL_VERSION,
				capabilities: {
					tools: {},
				},
				serverInfo: {
					name: 'Test Server',
					version: '1.0.0'
				},
			} satisfies MCP.InitializeResult
		});
	}

	/**
	 * Simulate a log event.
	 */
	public simulateLog(message: string): void {
		this._onDidLog.fire({ level: LogLevel.Info, message });
	}

	/**
	 * Set the connection state.
	 */
	public setConnectionState(state: McpConnectionState): void {
		this._stateValue.set(state, undefined);
	}

	/**
	 * Get all messages that have been sent.
	 */
	public getSentMessages(): readonly MCP.JSONRPCMessage[] {
		return [...this._sentMessages];
	}

	/**
	 * Clear the sent messages history.
	 */
	public clearSentMessages(): void {
		this._sentMessages.length = 0;
	}
}
