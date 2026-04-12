/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
import { Emitter, Event } from '../../../../../base/common/event.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { observableValue } from '../../../../../base/common/observable.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { LogLevel, NullLogger } from '../../../../../platform/log/common/log.js';
import { McpServerConnection } from '../../common/mcpServerConnection.js';
import { MCP } from '../../common/modelContextProtocol.js';
/**
 * Implementation of IMcpMessageTransport for testing purposes.
 * Allows tests to easily send/receive messages and control the connection state.
 */
export class TestMcpMessageTransport extends Disposable {
    constructor() {
        super();
        this._onDidLog = this._register(new Emitter());
        this.onDidLog = this._onDidLog.event;
        this._onDidReceiveMessage = this._register(new Emitter());
        this.onDidReceiveMessage = this._onDidReceiveMessage.event;
        this._stateValue = observableValue('testTransportState', { state: 1 /* McpConnectionState.Kind.Starting */ });
        this.state = this._stateValue;
        this._sentMessages = [];
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
    setResponder(method, responder) {
        if (!this._responders) {
            this._responders = new Map();
        }
        this._responders.set(method, responder);
    }
    /**
     * Send a message through the transport.
     */
    send(message) {
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
    stop() {
        this._stateValue.set({ state: 0 /* McpConnectionState.Kind.Stopped */ }, undefined);
    }
    // Test Helper Methods
    /**
     * Simulate receiving a message from the server.
     */
    simulateReceiveMessage(message) {
        this._onDidReceiveMessage.fire(message);
    }
    /**
     * Simulates a reply to an 'initialized' request.
     */
    simulateInitialized() {
        if (!this._sentMessages.length) {
            throw new Error('initialize was not called yet');
        }
        this.simulateReceiveMessage({
            jsonrpc: MCP.JSONRPC_VERSION,
            id: this.getSentMessages()[0].id,
            result: {
                protocolVersion: MCP.LATEST_PROTOCOL_VERSION,
                capabilities: {
                    tools: {},
                },
                serverInfo: {
                    name: 'Test Server',
                    version: '1.0.0'
                },
            }
        });
    }
    /**
     * Simulate a log event.
     */
    simulateLog(message) {
        this._onDidLog.fire({ level: LogLevel.Info, message });
    }
    /**
     * Set the connection state.
     */
    setConnectionState(state) {
        this._stateValue.set(state, undefined);
    }
    /**
     * Get all messages that have been sent.
     */
    getSentMessages() {
        return [...this._sentMessages];
    }
    /**
     * Clear the sent messages history.
     */
    clearSentMessages() {
        this._sentMessages.length = 0;
    }
}
let TestMcpRegistry = class TestMcpRegistry {
    constructor(_instantiationService) {
        this._instantiationService = _instantiationService;
        this.makeTestTransport = () => new TestMcpMessageTransport();
        this.onDidChangeInputs = Event.None;
        this.collections = observableValue(this, [{
                id: 'test-collection',
                remoteAuthority: null,
                label: 'Test Collection',
                configTarget: 2 /* ConfigurationTarget.USER */,
                serverDefinitions: observableValue(this, [{
                        id: 'test-server',
                        label: 'Test Server',
                        launch: { type: 1 /* McpServerTransportType.Stdio */, command: 'echo', args: ['Hello MCP'], env: {}, envFile: undefined, cwd: undefined, sandbox: undefined },
                        cacheNonce: 'a',
                    }]),
                trustBehavior: 0 /* McpServerTrust.Kind.Trusted */,
                scope: -1 /* StorageScope.APPLICATION */,
            }]);
        this.delegates = observableValue(this, [{
                priority: 0,
                canStart: () => true,
                substituteVariables(serverDefinition, launch) {
                    return Promise.resolve(launch);
                },
                start: () => {
                    const t = this.makeTestTransport();
                    setTimeout(() => t.setConnectionState({ state: 2 /* McpConnectionState.Kind.Running */ }));
                    return t;
                },
                waitForInitialProviderPromises: () => Promise.resolve(),
            }]);
        this.lazyCollectionState = observableValue(this, { state: 2 /* LazyCollectionState.AllKnown */, collections: [] });
    }
    collectionToolPrefix(collection) {
        return observableValue(this, `mcp-${collection.id}-`);
    }
    getServerDefinition(collectionRef, definitionRef) {
        const collectionObs = this.collections.map(cols => cols.find(c => c.id === collectionRef.id));
        return collectionObs.map((collection, reader) => {
            const server = collection?.serverDefinitions.read(reader).find(s => s.id === definitionRef.id);
            return { collection, server };
        });
    }
    discoverCollections() {
        throw new Error('Method not implemented.');
    }
    registerDelegate(delegate) {
        throw new Error('Method not implemented.');
    }
    registerCollection(collection) {
        throw new Error('Method not implemented.');
    }
    resetTrust() {
        throw new Error('Method not implemented.');
    }
    clearSavedInputs(scope, inputId) {
        throw new Error('Method not implemented.');
    }
    editSavedInput(inputId, folderData, configSection, target) {
        throw new Error('Method not implemented.');
    }
    setSavedInput(inputId, target, value) {
        throw new Error('Method not implemented.');
    }
    getSavedInputs(scope) {
        throw new Error('Method not implemented.');
    }
    resolveConnection(options) {
        const collection = this.collections.get().find(c => c.id === options.collectionRef.id);
        const definition = collection?.serverDefinitions.get().find(d => d.id === options.definitionRef.id);
        if (!collection || !definition) {
            throw new Error(`Collection or definition not found: ${options.collectionRef.id}, ${options.definitionRef.id}`);
        }
        const del = this.delegates.get()[0];
        return Promise.resolve(new McpServerConnection(collection, definition, del, definition.launch, new NullLogger(), false, options.taskManager, this._instantiationService));
    }
};
TestMcpRegistry = __decorate([
    __param(0, IInstantiationService)
], TestMcpRegistry);
export { TestMcpRegistry };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWNwUmVnaXN0cnlUeXBlcy5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL21jcC90ZXN0L2NvbW1vbi9tY3BSZWdpc3RyeVR5cGVzLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7O0FBRWhHLE9BQU8sRUFBRSxPQUFPLEVBQUUsS0FBSyxFQUFFLE1BQU0scUNBQXFDLENBQUM7QUFDckUsT0FBTyxFQUFFLFVBQVUsRUFBZSxNQUFNLHlDQUF5QyxDQUFDO0FBQ2xGLE9BQU8sRUFBZSxlQUFlLEVBQUUsTUFBTSwwQ0FBMEMsQ0FBQztBQUV4RixPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSwrREFBK0QsQ0FBQztBQUN0RyxPQUFPLEVBQUUsUUFBUSxFQUFFLFVBQVUsRUFBRSxNQUFNLDJDQUEyQyxDQUFDO0FBS2pGLE9BQU8sRUFBRSxtQkFBbUIsRUFBRSxNQUFNLHFDQUFxQyxDQUFDO0FBRTFFLE9BQU8sRUFBRSxHQUFHLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUUzRDs7O0dBR0c7QUFDSCxNQUFNLE9BQU8sdUJBQXdCLFNBQVEsVUFBVTtJQVl0RDtRQUNDLEtBQUssRUFBRSxDQUFDO1FBWlEsY0FBUyxHQUFHLElBQUksQ0FBQyxTQUFTLENBQUMsSUFBSSxPQUFPLEVBQXdDLENBQUMsQ0FBQztRQUNqRixhQUFRLEdBQUcsSUFBSSxDQUFDLFNBQVMsQ0FBQyxLQUFLLENBQUM7UUFFL0IseUJBQW9CLEdBQUcsSUFBSSxDQUFDLFNBQVMsQ0FBQyxJQUFJLE9BQU8sRUFBc0IsQ0FBQyxDQUFDO1FBQzFFLHdCQUFtQixHQUFHLElBQUksQ0FBQyxvQkFBb0IsQ0FBQyxLQUFLLENBQUM7UUFFckQsZ0JBQVcsR0FBRyxlQUFlLENBQXFCLG9CQUFvQixFQUFFLEVBQUUsS0FBSywwQ0FBa0MsRUFBRSxDQUFDLENB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