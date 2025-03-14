/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../../base/common/event.js';
import { IDisposable } from '../../../../base/common/lifecycle.js';
import { IObservable } from '../../../../base/common/observable.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { McpCollectionDefinition, McpServerDefinition, McpServerLaunch, McpConnectionState, IMcpServerConnection, McpCollectionReference, McpDefinitionReference } from './mcpTypes.js';
import { MCP } from './modelContextProtocol.js';

export const IMcpRegistry = createDecorator<IMcpRegistry>('mcpRegistry');

/** Message transport to a single MCP server. */
export interface IMcpMessageTransport extends IDisposable {
	readonly state: IObservable<McpConnectionState>;
	readonly onDidLog: Event<string>;
	readonly onDidReceiveMessage: Event<MCP.JSONRPCMessage>;
	send(message: MCP.JSONRPCMessage): void;
	stop(): void;
}

export interface IMcpHostDelegate {
	waitForInitialProviderPromises(): Promise<void>;
	canStart(collectionDefinition: McpCollectionDefinition, serverDefinition: McpServerDefinition): boolean;
	start(collectionDefinition: McpCollectionDefinition, serverDefinition: McpServerDefinition, resolvedLaunch: McpServerLaunch): IMcpMessageTransport;
}

export interface IMcpResolveConnectionOptions {
	collectionRef: McpCollectionReference;
	definitionRef: McpDefinitionReference;
	/** If set, the user will be asked to trust the collection even if they untrusted it previously */
	forceTrust?: boolean;
}

export interface IMcpRegistry {
	readonly _serviceBrand: undefined;

	readonly collections: IObservable<readonly McpCollectionDefinition[]>;
	readonly delegates: readonly IMcpHostDelegate[];

	registerDelegate(delegate: IMcpHostDelegate): IDisposable;
	registerCollection(collection: McpCollectionDefinition): IDisposable;

	/** Resets the trust state of all collections. */
	resetTrust(): void;

	/** Gets whether the collection is trusted. */
	getTrust(collection: McpCollectionReference): IObservable<boolean | undefined>;

	/** Resets any saved inputs for the connection. */
	clearSavedInputs(collection: McpCollectionReference, definition: McpServerDefinition): void;
	/** Creates a connection for the collection and definition. */
	resolveConnection(options: IMcpResolveConnectionOptions): Promise<IMcpServerConnection | undefined>;
}
