/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../../../base/common/event.js';
import { Disposable, IDisposable } from '../../../../../base/common/lifecycle.js';
import { IObservable, observableValue } from '../../../../../base/common/observable.js';
import { ConfigurationTarget } from '../../../../../platform/configuration/common/configuration.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { LogLevel, NullLogger } from '../../../../../platform/log/common/log.js';
import { StorageScope } from '../../../../../platform/storage/common/storage.js';
import { IWorkspaceFolderData } from '../../../../../platform/workspace/common/workspace.js';
import { IResolvedValue } from '../../../../services/configurationResolver/common/configurationResolverExpression.js';
import { IMcpHostDelegate, IMcpMessageTransport, IMcpRegistry, IMcpResolveConnectionOptions } from '../../common/mcpRegistryTypes.js';
import { McpServerConnection } from '../../common/mcpServerConnection.js';
import { IMcpServerConnection, LazyCollectionState, McpCollectionDefinition, McpCollectionReference, McpConnectionState, McpDefinitionReference, McpServerDefinition, McpServerTransportType } from '../../common/mcpTypes.js';
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

		this.setResponder('initialize', () => ({
			jsonrpc: MCP.JSONRPC_VERSION,
			id: 1, // The handler uses 1 for the first request
			result: {
				protocolVersion: MCP.LATEST_PROTOCOL_VERSION,
				serverInfo: {
					name: 'Test MCP Server',
					version: '1.0.0',
				},
				capabilities: {
					resources: {
						supportedTypes: ['text/plain'],
					},
					tools: {
						supportsCancellation: true,
					}
				}
			}
		}));
	}

	/**
	 * Set a responder function for a specific method.
	 * The responder receives the sent message and should return a response object,
	 * which will be simulated as a server response.
	 */
	public setResponder(method: string, responder: (message: any) => MCP.JSONRPCMessage | undefined): void {
		if (!this._responders) {
			this._responders = new Map();
		}
		this._responders.set(method, responder);
	}

	private _responders?: Map<string, (message: MCP.JSONRPCMessage) => MCP.JSONRPCMessage | undefined>;

	/**
	 * Send a message through the transport.
	 */
	public send(message: MCP.JSONRPCMessage): void {
		this._sentMessages.push(message);
		if (this._responders && 'method' in message && typeof message.method === 'string') {
			const responder = this._responders.get(message.method);
			if (responder) {
				const response = responder(message);
				if (response) {
					setTimeout(() => this.simulateReceiveMessage(response));
				}
			}
		}
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

export class TestMcpRegistry implements IMcpRegistry {
	public makeTestTransport = () => new TestMcpMessageTransport();

	constructor(@IInstantiationService private readonly _instantiationService: IInstantiationService) { }

	_serviceBrand: undefined;
	onDidChangeInputs = Event.None;
	collections = observableValue<readonly McpCollectionDefinition[]>(this, [{
		id: 'test-collection',
		remoteAuthority: null,
		label: 'Test Collection',
		configTarget: ConfigurationTarget.USER,
		serverDefinitions: observableValue(this, [{
			id: 'test-server',
			label: 'Test Server',
			launch: { type: McpServerTransportType.Stdio, command: 'echo', args: ['Hello MCP'], env: {}, envFile: undefined, cwd: undefined },
		} satisfies McpServerDefinition]),
		isTrustedByDefault: true,
		scope: StorageScope.APPLICATION,
	}]);
	delegates = observableValue<readonly IMcpHostDelegate[]>(this, [{
		priority: 0,
		canStart: () => true,
		start: () => {
			const t = this.makeTestTransport();
			setTimeout(() => t.setConnectionState({ state: McpConnectionState.Kind.Running }));
			return t;
		},
		waitForInitialProviderPromises: () => Promise.resolve(),
	}]);
	lazyCollectionState = observableValue<LazyCollectionState>(this, LazyCollectionState.AllKnown);
	collectionToolPrefix(collection: McpCollectionReference): IObservable<string> {
		return observableValue<string>(this, `mcp-${collection.id}-`);
	}
	getServerDefinition(collectionRef: McpDefinitionReference, definitionRef: McpDefinitionReference): IObservable<{ server: McpServerDefinition | undefined; collection: McpCollectionDefinition | undefined }> {
		const collectionObs = this.collections.map(cols => cols.find(c => c.id === collectionRef.id));
		return collectionObs.map((collection, reader) => {
			const server = collection?.serverDefinitions.read(reader).find(s => s.id === definitionRef.id);
			return { collection, server };
		});
	}
	discoverCollections(): Promise<McpCollectionDefinition[]> {
		throw new Error('Method not implemented.');
	}
	registerDelegate(delegate: IMcpHostDelegate): IDisposable {
		throw new Error('Method not implemented.');
	}
	registerCollection(collection: McpCollectionDefinition): IDisposable {
		throw new Error('Method not implemented.');
	}
	resetTrust(): void {
		throw new Error('Method not implemented.');
	}
	getTrust(collection: McpCollectionReference): IObservable<boolean | undefined> {
		throw new Error('Method not implemented.');
	}
	clearSavedInputs(scope: StorageScope, inputId?: string): Promise<void> {
		throw new Error('Method not implemented.');
	}
	editSavedInput(inputId: string, folderData: IWorkspaceFolderData | undefined, configSection: string, target: ConfigurationTarget): Promise<void> {
		throw new Error('Method not implemented.');
	}
	setSavedInput(inputId: string, target: ConfigurationTarget, value: string): Promise<void> {
		throw new Error('Method not implemented.');
	}
	getSavedInputs(scope: StorageScope): Promise<{ [id: string]: IResolvedValue }> {
		throw new Error('Method not implemented.');
	}
	resolveConnection(options: IMcpResolveConnectionOptions): Promise<IMcpServerConnection | undefined> {
		const collection = this.collections.get().find(c => c.id === options.collectionRef.id);
		const definition = collection?.serverDefinitions.get().find(d => d.id === options.definitionRef.id);
		if (!collection || !definition) {
			throw new Error(`Collection or definition not found: ${options.collectionRef.id}, ${options.definitionRef.id}`);
		}
		const del = this.delegates.get()[0];
		return Promise.resolve(new McpServerConnection(
			collection,
			definition,
			del,
			definition.launch,
			new NullLogger(),
			this._instantiationService,
		));
	}
}
