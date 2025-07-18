/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../../base/common/event.js';
import { IDisposable } from '../../../../base/common/lifecycle.js';
import { IObservable } from '../../../../base/common/observable.js';
import { ConfigurationTarget } from '../../../../platform/configuration/common/configuration.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { ILogger, LogLevel } from '../../../../platform/log/common/log.js';
import { StorageScope } from '../../../../platform/storage/common/storage.js';
import { IWorkspaceFolderData } from '../../../../platform/workspace/common/workspace.js';
import { IResolvedValue } from '../../../services/configurationResolver/common/configurationResolverExpression.js';
import { IMcpServerConnection, LazyCollectionState, McpCollectionDefinition, McpCollectionReference, McpConnectionState, McpDefinitionReference, McpServerDefinition, McpServerLaunch } from './mcpTypes.js';
import { MCP } from './modelContextProtocol.js';

export const IMcpRegistry = createDecorator<IMcpRegistry>('mcpRegistry');

/** Message transport to a single MCP server. */
export interface IMcpMessageTransport extends IDisposable {
	readonly state: IObservable<McpConnectionState>;
	readonly onDidLog: Event<{ level: LogLevel; message: string }>;
	readonly onDidReceiveMessage: Event<MCP.JSONRPCMessage>;
	send(message: MCP.JSONRPCMessage): void;
	stop(): void;
}

export interface IMcpHostDelegate {
	/** Priority for this delegate, delegates are tested in descending priority order */
	readonly priority: number;
	waitForInitialProviderPromises(): Promise<void>;
	canStart(collectionDefinition: McpCollectionDefinition, serverDefinition: McpServerDefinition): boolean;
	start(collectionDefinition: McpCollectionDefinition, serverDefinition: McpServerDefinition, resolvedLaunch: McpServerLaunch): IMcpMessageTransport;
}

export interface IMcpResolveConnectionOptions {
	logger: ILogger;
	collectionRef: McpCollectionReference;
	definitionRef: McpDefinitionReference;
	/** If set, the user will be asked to trust the collection even if they untrusted it previously */
	forceTrust?: boolean;
	/** If set, try to launch with debugging when dev mode is configured */
	debug?: boolean;
}

export interface IMcpRegistry {
	readonly _serviceBrand: undefined;

	/** Fired when the user provides more inputs when creating a connection. */
	readonly onDidChangeInputs: Event<void>;

	readonly collections: IObservable<readonly McpCollectionDefinition[]>;
	readonly delegates: IObservable<readonly IMcpHostDelegate[]>;
	/** Whether there are new collections that can be resolved with a discover() call */
	readonly lazyCollectionState: IObservable<LazyCollectionState>;

	/** Helper function to observe a definition by its reference. */
	getServerDefinition(collectionRef: McpDefinitionReference, definitionRef: McpDefinitionReference): IObservable<{ server: McpServerDefinition | undefined; collection: McpCollectionDefinition | undefined }>;

	/** Discover new collections, returning newly-discovered ones. */
	discoverCollections(): Promise<McpCollectionDefinition[]>;

	registerDelegate(delegate: IMcpHostDelegate): IDisposable;
	registerCollection(collection: McpCollectionDefinition): IDisposable;

	/** Resets the trust state of all collections. */
	resetTrust(): void;

	/** Gets whether the collection is trusted. */
	getTrust(collection: McpCollectionReference): IObservable<boolean | undefined>;

	/** Resets any saved inputs for the input, or globally. */
	clearSavedInputs(scope: StorageScope, inputId?: string): Promise<void>;
	/** Edits a previously-saved input. */
	editSavedInput(inputId: string, folderData: IWorkspaceFolderData | undefined, configSection: string, target: ConfigurationTarget): Promise<void>;
	/** Updates a saved input. */
	setSavedInput(inputId: string, target: ConfigurationTarget, value: string): Promise<void>;
	/** Gets saved inputs from storage. */
	getSavedInputs(scope: StorageScope): Promise<{ [id: string]: IResolvedValue }>;
	/** Creates a connection for the collection and definition. */
	resolveConnection(options: IMcpResolveConnectionOptions): Promise<IMcpServerConnection | undefined>;
}
