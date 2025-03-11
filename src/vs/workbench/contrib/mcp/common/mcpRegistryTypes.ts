/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../../base/common/event.js';
import { IDisposable } from '../../../../base/common/lifecycle.js';
import { IObservable } from '../../../../base/common/observable.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { McpCollectionDefinition, McpServerDefinition, McpServerLaunch, McpConnectionState, IMcpServerConnection } from './mcpTypes.js';
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
	canStart(collectionDefinition: McpCollectionDefinition, serverDefinition: McpServerDefinition): boolean;
	start(collectionDefinition: McpCollectionDefinition, serverDefinition: McpServerDefinition, resolvedLaunch: McpServerLaunch): IMcpMessageTransport;
}

export interface IMcpRegistry {
	readonly _serviceBrand: undefined;

	readonly collections: IObservable<readonly McpCollectionDefinition[]>;
	readonly delegates: readonly IMcpHostDelegate[];

	registerDelegate(delegate: IMcpHostDelegate): IDisposable;
	registerCollection(collection: McpCollectionDefinition): IDisposable;

	/** Resets any saved inputs for the connection. */
	clearSavedInputs(collection: McpCollectionDefinition, definition: McpServerDefinition): void;
	/** Createse a connection for the collection and definition. */
	resolveConnection(collection: McpCollectionDefinition, definition: McpServerDefinition): Promise<IMcpServerConnection>;
}
