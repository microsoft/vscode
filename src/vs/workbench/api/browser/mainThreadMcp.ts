/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter } from '../../../base/common/event.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import { observableValue } from '../../../base/common/observable.js';
import { IMcpRegistry, IMcpMessageTransport } from '../../contrib/mcp/common/mcpRegistryTypes.js';
import { McpConnectionState, McpServerTransportType } from '../../contrib/mcp/common/mcpTypes.js';
import { MCP } from '../../contrib/mcp/common/modelContextProtocol.js';
import { ExtensionHostKind } from '../../services/extensions/common/extensionHostKind.js';
import { IExtHostContext, extHostNamedCustomer } from '../../services/extensions/common/extHostCustomers.js';
import { ExtHostContext, MainContext, MainThreadMcpShape } from '../common/extHost.protocol.js';

@extHostNamedCustomer(MainContext.MainThreadMcp)
export class MainThreadMcp extends Disposable implements MainThreadMcpShape {

	private _serverIdCounter = 0;

	private readonly _servers: Map<number, ExtHostMcpServerLaunch> = new Map();

	constructor(
		extHostContext: IExtHostContext,
		@IMcpRegistry private readonly _mcpRegistry: IMcpRegistry,
	) {
		super();
		const proxy = extHostContext.getProxy(ExtHostContext.ExtHostMcp);
		this._register(this._mcpRegistry.registerDelegate({
			canStart(collection, serverDefinition) {
				// todo: SSE MPC servers without a remote authority could be served from the renderer
				if (collection.remoteAuthority !== extHostContext.remoteAuthority) {
					return false;
				}
				if (serverDefinition.launch.type === McpServerTransportType.Stdio && extHostContext.extensionHostKind === ExtensionHostKind.LocalWebWorker) {
					return false;
				}
				return true;
			},
			start: (collection, _serverDefiniton, resolveLaunch) => {
				const id = ++this._serverIdCounter;
				const launch = new ExtHostMcpServerLaunch(
					() => proxy.$stopMcp(id),
					msg => proxy.$sendMessage(id, JSON.stringify(msg)),
				);

				this._servers.set(id, launch);
				proxy.$startMcp(id, resolveLaunch);

				return launch;
			},
		}));
	}

	$onDidChangeState(id: number, update: McpConnectionState): void {
		this._servers.get(id)?.state.set(update, undefined);

		if (update.state === McpConnectionState.Kind.Stopped || update.state === McpConnectionState.Kind.Error) {
			this._servers.delete(id);
		}
	}
	$onDidPublishLog(id: number, log: string): void {
		this._servers.get(id)?.pushLog(log);
	}
	$onDidReceiveMessage(id: number, message: string): void {
		this._servers.get(id)?.pushMessage(message);
	}
}


class ExtHostMcpServerLaunch extends Disposable implements IMcpMessageTransport {
	public readonly state = observableValue<McpConnectionState>('mcpServerState', { state: McpConnectionState.Kind.Starting });

	private readonly _onDidLog = this._register(new Emitter<string>());
	public readonly onDidLog = this._onDidLog.event;

	private readonly _onDidReceiveMessage = this._register(new Emitter<MCP.JSONRPCMessage>());
	public readonly onDidReceiveMessage = this._onDidReceiveMessage.event;

	pushLog(log: string): void {
		this._onDidLog.fire(log);
	}

	pushMessage(message: string): void {
		let parsed: MCP.JSONRPCMessage | undefined;
		try {
			parsed = JSON.parse(message);
		} catch (e) {
			this.pushLog(`Failed to parse message: ${JSON.stringify(message)}`);
		}

		if (parsed) {
			this._onDidReceiveMessage.fire(parsed);
		}
	}

	constructor(
		public readonly stop: () => void,
		public readonly send: (message: MCP.JSONRPCMessage) => void,
	) {
		super();
	}

}
