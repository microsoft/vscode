/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { disposableTimeout } from '../../../base/common/async.js';
import { Emitter } from '../../../base/common/event.js';
import { Disposable, DisposableMap } from '../../../base/common/lifecycle.js';
import { ISettableObservable, observableValue } from '../../../base/common/observable.js';
import { LogLevel } from '../../../platform/log/common/log.js';
import { IMcpMessageTransport, IMcpRegistry } from '../../contrib/mcp/common/mcpRegistryTypes.js';
import { McpCollectionDefinition, McpConnectionState, McpServerDefinition, McpServerTransportType } from '../../contrib/mcp/common/mcpTypes.js';
import { MCP } from '../../contrib/mcp/common/modelContextProtocol.js';
import { ExtensionHostKind, extensionHostKindToString } from '../../services/extensions/common/extensionHostKind.js';
import { IExtHostContext, extHostNamedCustomer } from '../../services/extensions/common/extHostCustomers.js';
import { ExtHostContext, MainContext, MainThreadMcpShape } from '../common/extHost.protocol.js';

@extHostNamedCustomer(MainContext.MainThreadMcp)
export class MainThreadMcp extends Disposable implements MainThreadMcpShape {

	private _serverIdCounter = 0;

	private readonly _servers = this._register(new DisposableMap<number, ExtHostMcpServerLaunch>());
	private readonly _collectionDefinitions = this._register(new DisposableMap<string, {
		fromExtHost: McpCollectionDefinition.FromExtHost;
		servers: ISettableObservable<readonly McpServerDefinition[]>;
		dispose(): void;
	}>());

	constructor(
		private readonly _extHostContext: IExtHostContext,
		@IMcpRegistry private readonly _mcpRegistry: IMcpRegistry,
	) {
		super();
		const proxy = _extHostContext.getProxy(ExtHostContext.ExtHostMcp);
		this._register(this._mcpRegistry.registerDelegate({
			waitForInitialProviderPromises() {
				return proxy.$waitForInitialCollectionProviders();
			},
			canStart(collection, serverDefinition) {
				// todo: SSE MPC servers without a remote authority could be served from the renderer
				if (collection.remoteAuthority !== _extHostContext.remoteAuthority) {
					return false;
				}
				if (serverDefinition.launch.type === McpServerTransportType.Stdio && _extHostContext.extensionHostKind === ExtensionHostKind.LocalWebWorker) {
					return false;
				}
				return true;
			},
			start: (collection, _serverDefiniton, resolveLaunch) => {
				const id = ++this._serverIdCounter;
				const launch = new ExtHostMcpServerLaunch(
					_extHostContext.extensionHostKind,
					() => proxy.$stopMcp(id),
					msg => proxy.$sendMessage(id, JSON.stringify(msg)),
				);

				this._servers.set(id, launch);
				proxy.$startMcp(id, resolveLaunch);

				return launch;
			},
		}));
	}

	$upsertMcpCollection(collection: McpCollectionDefinition.FromExtHost, serversDto: McpServerDefinition.Serialized[]): void {
		const servers = serversDto.map(McpServerDefinition.fromSerialized);
		const existing = this._collectionDefinitions.get(collection.id);
		if (existing) {
			existing.servers.set(servers, undefined);
		} else {
			const serverDefinitions = observableValue<readonly McpServerDefinition[]>('mcpServers', servers);
			const handle = this._mcpRegistry.registerCollection({
				...collection,
				remoteAuthority: this._extHostContext.remoteAuthority,
				serverDefinitions,
			});

			this._collectionDefinitions.set(collection.id, {
				fromExtHost: collection,
				servers: serverDefinitions,
				dispose: () => handle.dispose(),
			});
		}
	}

	$deleteMcpCollection(collectionId: string): void {
		this._collectionDefinitions.deleteAndDispose(collectionId);
	}

	$onDidChangeState(id: number, update: McpConnectionState): void {
		this._servers.get(id)?.state.set(update, undefined);

		if (!McpConnectionState.isRunning(update)) {
			this._servers.deleteAndDispose(id);
		}
	}

	$onDidPublishLog(id: number, level: LogLevel, log: string): void {
		if (typeof level === 'string') {
			level = LogLevel.Info;
			log = level as unknown as string;
		}

		this._servers.get(id)?.pushLog(level, log);
	}

	$onDidReceiveMessage(id: number, message: string): void {
		this._servers.get(id)?.pushMessage(message);
	}
}


class ExtHostMcpServerLaunch extends Disposable implements IMcpMessageTransport {
	public readonly state = observableValue<McpConnectionState>('mcpServerState', { state: McpConnectionState.Kind.Starting });

	private readonly _onDidLog = this._register(new Emitter<{ level: LogLevel; message: string }>());
	public readonly onDidLog = this._onDidLog.event;

	private readonly _onDidReceiveMessage = this._register(new Emitter<MCP.JSONRPCMessage>());
	public readonly onDidReceiveMessage = this._onDidReceiveMessage.event;

	pushLog(level: LogLevel, message: string): void {
		this._onDidLog.fire({ message, level });
	}

	pushMessage(message: string): void {
		let parsed: MCP.JSONRPCMessage | undefined;
		try {
			parsed = JSON.parse(message);
		} catch (e) {
			this.pushLog(LogLevel.Warning, `Failed to parse message: ${JSON.stringify(message)}`);
		}

		if (parsed) {
			this._onDidReceiveMessage.fire(parsed);
		}
	}

	constructor(
		extHostKind: ExtensionHostKind,
		public readonly stop: () => void,
		public readonly send: (message: MCP.JSONRPCMessage) => void,
	) {
		super();

		this._register(disposableTimeout(() => {
			this.pushLog(LogLevel.Info, `Starting server from ${extensionHostKindToString(extHostKind)} extension host`);
		}));
	}

	public override dispose(): void {
		if (McpConnectionState.isRunning(this.state.get())) {
			this.pushLog(LogLevel.Warning, 'Extension host shut down, server will stop.');
			this.state.set({ state: McpConnectionState.Kind.Stopped }, undefined);
		}

		super.dispose();
	}
}
