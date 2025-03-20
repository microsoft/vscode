/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { assertNever } from '../../../../base/common/assert.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { IDisposable } from '../../../../base/common/lifecycle.js';
import { equals as objectsEqual } from '../../../../base/common/objects.js';
import { IObservable } from '../../../../base/common/observable.js';
import { URI, UriComponents } from '../../../../base/common/uri.js';
import { Location } from '../../../../editor/common/languages.js';
import { localize } from '../../../../nls.js';
import { ConfigurationTarget } from '../../../../platform/configuration/common/configuration.js';
import { ExtensionIdentifier } from '../../../../platform/extensions/common/extensions.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { StorageScope } from '../../../../platform/storage/common/storage.js';
import { IWorkspaceFolderData } from '../../../../platform/workspace/common/workspace.js';
import { McpServerRequestHandler } from './mcpServerRequestHandler.js';
import { MCP } from './modelContextProtocol.js';

export const extensionMcpCollectionPrefix = 'ext.';

export function extensionPrefixedIdentifier(identifier: ExtensionIdentifier, id: string): string {
	return ExtensionIdentifier.toKey(identifier) + '/' + id;
}

/**
 * An McpCollection contains McpServers. There may be multiple collections for
 * different locations servers are discovered.
 */
export interface McpCollectionDefinition {
	/** Origin authority from which this collection was discovered. */
	readonly remoteAuthority: string | null;
	/** Globally-unique, stable ID for this definition */
	readonly id: string;
	/** Human-readable label for the definition */
	readonly label: string;
	/** Definitions this collection contains. */
	readonly serverDefinitions: IObservable<readonly McpServerDefinition[]>;
	/** If 'false', consent is required before any MCP servers in this collection are automatically launched. */
	readonly isTrustedByDefault: boolean;
	/** Scope where associated collection info should be stored. */
	readonly scope: StorageScope;

	/** For lazy-loaded collections only: */
	readonly lazy?: {
		/** True if `serverDefinitions` were loaded from the cache */
		isCached: boolean;
		/** Triggers a load of the real server definition, which should be pushed to the IMcpRegistry. If not this definition will be removed. */
		load(): Promise<void>;
		/** Called after `load()` if the extension is not found. */
		removed?(): void;
	};

	readonly presentation?: {
		/** Sort order of the collection. */
		readonly order?: number;
		/** Place where this collection is configured, used in workspace trust prompts and "show config" */
		readonly origin?: URI;
	};
}

export const enum McpCollectionSortOrder {
	Workspace = 0,
	User = 100,
	Extension = 200,
	Filesystem = 300,

	RemotePenalty = 50,
}

export namespace McpCollectionDefinition {
	export interface FromExtHost {
		readonly id: string;
		readonly label: string;
		readonly isTrustedByDefault: boolean;
		readonly scope: StorageScope;
	}

	export function equals(a: McpCollectionDefinition, b: McpCollectionDefinition): boolean {
		return a.id === b.id
			&& a.remoteAuthority === b.remoteAuthority
			&& a.label === b.label
			&& a.isTrustedByDefault === b.isTrustedByDefault;
	}
}

export interface McpServerDefinition {
	/** Globally-unique, stable ID for this definition */
	readonly id: string;
	/** Human-readable label for the definition */
	readonly label: string;
	/** Descriptor defining how the configuration should be launched. */
	readonly launch: McpServerLaunch;
	/** If set, allows configuration variables to be resolved in the {@link launch} with the given context */
	readonly variableReplacement?: McpServerDefinitionVariableReplacement;

	readonly presentation?: {
		/** Sort order of the definition. */
		readonly order?: number;
		/** Place where this server is configured, used in workspace trust prompts and "show config" */
		readonly origin?: Location;
	};
}

export namespace McpServerDefinition {
	export interface Serialized {
		readonly id: string;
		readonly label: string;
		readonly launch: McpServerLaunch.Serialized;
		readonly variableReplacement?: McpServerDefinitionVariableReplacement.Serialized;
	}

	export function toSerialized(def: McpServerDefinition): McpServerDefinition.Serialized {
		return def;
	}

	export function fromSerialized(def: McpServerDefinition.Serialized): McpServerDefinition {
		return {
			id: def.id,
			label: def.label,
			launch: McpServerLaunch.fromSerialized(def.launch),
			variableReplacement: def.variableReplacement ? McpServerDefinitionVariableReplacement.fromSerialized(def.variableReplacement) : undefined,
		};
	}

	export function equals(a: McpServerDefinition, b: McpServerDefinition): boolean {
		return a.id === b.id
			&& a.label === b.label
			&& objectsEqual(a.launch, b.launch)
			&& objectsEqual(a.variableReplacement, b.variableReplacement);
	}
}


export interface McpServerDefinitionVariableReplacement {
	section?: string; // e.g. 'mcp'
	folder?: IWorkspaceFolderData;
	target: ConfigurationTarget;
}

export namespace McpServerDefinitionVariableReplacement {
	export interface Serialized {
		target: ConfigurationTarget;
		section?: string;
		folder?: { name: string; index: number; uri: UriComponents };
	}

	export function toSerialized(def: McpServerDefinitionVariableReplacement): McpServerDefinitionVariableReplacement.Serialized {
		return def;
	}

	export function fromSerialized(def: McpServerDefinitionVariableReplacement.Serialized): McpServerDefinitionVariableReplacement {
		return {
			section: def.section,
			folder: def.folder ? { ...def.folder, uri: URI.revive(def.folder.uri) } : undefined,
			target: def.target,
		};
	}
}

export interface IMcpService {
	_serviceBrand: undefined;
	readonly servers: IObservable<readonly IMcpServer[]>;

	/** Resets the cached tools. */
	resetCaches(): void;

	/** Set if there are extensions that register MCP servers that have never been activated. */
	readonly lazyCollectionState: IObservable<LazyCollectionState>;
	/** Activatese extensions and runs their MCP servers. */
	activateCollections(): Promise<void>;
}

export const enum LazyCollectionState {
	HasUnknown,
	LoadingUnknown,
	AllKnown,
}

export const IMcpService = createDecorator<IMcpService>('IMcpService');

export interface McpCollectionReference {
	id: string;
	label: string;
	presentation?: McpCollectionDefinition['presentation'];
}

export interface McpDefinitionReference {
	id: string;
	label: string;
}

export interface IMcpServer extends IDisposable {
	readonly collection: McpCollectionReference;
	readonly definition: McpDefinitionReference;
	readonly connection: IObservable<IMcpServerConnection | undefined>;
	readonly connectionState: IObservable<McpConnectionState>;
	/**
	 * Reflects the MCP server trust state. True if trusted, false if untrusted,
	 * undefined if consent is required but not indicated.
	 */
	readonly trusted: IObservable<boolean | undefined>;

	showOutput(): void;
	/**
	 * Starts the server and returns its resulting state. One of:
	 * - Running, if all good
	 * - Error, if the server failed to start
	 * - Stopped, if the server was disposed or the user cancelled the launch
	 */
	start(isFromInteraction?: boolean): Promise<McpConnectionState>;
	stop(): Promise<void>;

	readonly toolsState: IObservable<McpServerToolsState>;
	readonly tools: IObservable<readonly IMcpTool[]>;
}

export const enum McpServerToolsState {
	/** Tools have not been read before */
	Unknown,
	/** Tools were read from the cache */
	Cached,
	/** Tools are refreshing for the first time */
	RefreshingFromUnknown,
	/** Tools are refreshing and the current tools are cached */
	RefreshingFromCached,
	/** Tool state is live, server is connected */
	Live,
}

export interface IMcpTool {

	readonly id: string;

	readonly definition: MCP.Tool;

	/**
	 * Calls a tool
	 * @throws {@link MpcResponseError} if the tool fails to execute
	 * @throws {@link McpConnectionFailedError} if the connection to the server fails
	 */
	call(params: Record<string, unknown>, token?: CancellationToken): Promise<MCP.CallToolResult>;
}

export const enum McpServerTransportType {
	/** A command-line MCP server communicating over standard in/out */
	Stdio = 1 << 0,
	/** An MCP server that uses Server-Sent Events */
	SSE = 1 << 1,
}

/**
 * MCP server launched on the command line which communicated over stdio.
 * https://spec.modelcontextprotocol.io/specification/2024-11-05/basic/transports/#stdio
 */
export interface McpServerTransportStdio {
	readonly type: McpServerTransportType.Stdio;
	readonly cwd: URI | undefined;
	readonly command: string;
	readonly args: readonly string[];
	readonly env: Record<string, string | number | null>;
	readonly envFile: string | undefined;
}

/**
 * MCP server launched on the command line which communicated over server-sent-events.
 * https://spec.modelcontextprotocol.io/specification/2024-11-05/basic/transports/#http-with-sse
 */
export interface McpServerTransportSSE {
	readonly type: McpServerTransportType.SSE;
	readonly uri: URI;
	readonly headers: [string, string][];
}

export type McpServerLaunch =
	| McpServerTransportStdio
	| McpServerTransportSSE;

export namespace McpServerLaunch {
	export type Serialized =
		| { type: McpServerTransportType.SSE; uri: UriComponents; headers: [string, string][] }
		| { type: McpServerTransportType.Stdio; cwd: UriComponents | undefined; command: string; args: readonly string[]; env: Record<string, string | number | null>; envFile: string | undefined };

	export function toSerialized(launch: McpServerLaunch): McpServerLaunch.Serialized {
		return launch;
	}

	export function fromSerialized(launch: McpServerLaunch.Serialized): McpServerLaunch {
		switch (launch.type) {
			case McpServerTransportType.SSE:
				return { type: launch.type, uri: URI.revive(launch.uri), headers: launch.headers };
			case McpServerTransportType.Stdio:
				return {
					type: launch.type,
					cwd: launch.cwd ? URI.revive(launch.cwd) : undefined,
					command: launch.command,
					args: launch.args,
					env: launch.env,
					envFile: launch.envFile,
				};
		}
	}
}

/**
 * An instance that manages a connection to an MCP server. It can be started,
 * stopped, and restarted. Once started and in a running state, it will
 * eventually build a {@link IMcpServerConnection.handler}.
 */
export interface IMcpServerConnection extends IDisposable {
	readonly definition: McpServerDefinition;
	readonly state: IObservable<McpConnectionState>;
	readonly handler: IObservable<McpServerRequestHandler | undefined>;

	/**
	 * Starts the server if it's stopped. Returns a promise that resolves once
	 * server exits a 'starting' state.
	 */
	start(): Promise<McpConnectionState>;

	/**
	 * Stops the server.
	 */
	stop(): Promise<void>;
}

/**
 * McpConnectionState is the state of the underlying connection and is
 * communicated e.g. from the extension host to the renderer.
 */
export namespace McpConnectionState {
	export const enum Kind {
		Stopped,
		Starting,
		Running,
		Error,
	}

	export const toString = (s: McpConnectionState): string => {
		switch (s.state) {
			case Kind.Stopped:
				return localize('mcpstate.stopped', 'Stopped');
			case Kind.Starting:
				return localize('mcpstate.starting', 'Starting');
			case Kind.Running:
				return localize('mcpstate.running', 'Running');
			case Kind.Error:
				return localize('mcpstate.error', 'Error {0}', s.message);
			default:
				assertNever(s);
		}
	};

	/** Returns if the MCP state is one where starting a new server is valid */
	export const canBeStarted = (s: Kind) => s === Kind.Error || s === Kind.Stopped;

	/** Gets whether the state is a running state. */
	export const isRunning = (s: McpConnectionState) => !canBeStarted(s.state);

	export interface Stopped {
		readonly state: Kind.Stopped;
	}

	export interface Starting {
		readonly state: Kind.Starting;
	}

	export interface Running {
		readonly state: Kind.Running;
	}

	export interface Error {
		readonly state: Kind.Error;
		readonly message: string;
	}
}

export type McpConnectionState =
	| McpConnectionState.Stopped
	| McpConnectionState.Starting
	| McpConnectionState.Running
	| McpConnectionState.Error;

export class MpcResponseError extends Error {
	constructor(message: string, public readonly code: number, public readonly data: unknown) {
		super(`MPC ${code}: ${message}`);
	}
}

export class McpConnectionFailedError extends Error { }
