/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { equals as arraysEqual } from '../../../../base/common/arrays.js';
import { assertNever } from '../../../../base/common/assert.js';
import { decodeHex, encodeHex, VSBuffer } from '../../../../base/common/buffer.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Event } from '../../../../base/common/event.js';
import { IMarkdownString } from '../../../../base/common/htmlContent.js';
import { Disposable, IDisposable } from '../../../../base/common/lifecycle.js';
import { equals as objectsEqual } from '../../../../base/common/objects.js';
import { IObservable, ObservableMap } from '../../../../base/common/observable.js';
import { IIterativePager } from '../../../../base/common/paging.js';
import Severity from '../../../../base/common/severity.js';
import { URI, UriComponents } from '../../../../base/common/uri.js';
import { Location } from '../../../../editor/common/languages.js';
import { localize } from '../../../../nls.js';
import { ConfigurationTarget } from '../../../../platform/configuration/common/configuration.js';
import { RawContextKey } from '../../../../platform/contextkey/common/contextkey.js';
import { IEditorOptions } from '../../../../platform/editor/common/editor.js';
import { ExtensionIdentifier } from '../../../../platform/extensions/common/extensions.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { McpGalleryManifestStatus } from '../../../../platform/mcp/common/mcpGalleryManifest.js';
import { IGalleryMcpServer, IInstallableMcpServer, IGalleryMcpServerConfiguration, IQueryOptions } from '../../../../platform/mcp/common/mcpManagement.js';
import { IMcpDevModeConfig, IMcpServerConfiguration } from '../../../../platform/mcp/common/mcpPlatformTypes.js';
import { StorageScope } from '../../../../platform/storage/common/storage.js';
import { IWorkspaceFolder, IWorkspaceFolderData } from '../../../../platform/workspace/common/workspace.js';
import { IWorkbenchLocalMcpServer, IWorkbencMcpServerInstallOptions } from '../../../services/mcp/common/mcpWorkbenchManagementService.js';
import { ToolProgress } from '../../chat/common/tools/languageModelToolsService.js';
import { IMcpServerSamplingConfiguration } from './mcpConfiguration.js';
import { McpServerRequestHandler } from './mcpServerRequestHandler.js';
import { MCP } from './modelContextProtocol.js';
import { UriTemplate } from './uriTemplate.js';

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
	/**
	 * Trust behavior of the servers. `Trusted` means it will run without a prompt, always.
	 * `TrustedOnNonce` means it will run without a prompt as long as the nonce matches.
	 */
	readonly trustBehavior: McpServerTrust.Kind.Trusted | McpServerTrust.Kind.TrustedOnNonce;
	/** Scope where associated collection info should be stored. */
	readonly scope: StorageScope;
	/** Configuration target where configuration related to this server should be stored. */
	readonly configTarget: ConfigurationTarget;

	/** Resolves a server definition. If present, always called before a server starts. */
	resolveServerLanch?(definition: McpServerDefinition): Promise<McpServerLaunch | undefined>;

	/** For lazy-loaded collections only: */
	readonly lazy?: {
		/** True if `serverDefinitions` were loaded from the cache */
		isCached: boolean;
		/** Triggers a load of the real server definition, which should be pushed to the IMcpRegistry. If not this definition will be removed. */
		load(): Promise<void>;
		/** Called after `load()` if the extension is not found. */
		removed?(): void;
	};

	readonly source?: IWorkbenchMcpServer | ExtensionIdentifier;

	readonly presentation?: {
		/** Sort order of the collection. */
		readonly order?: number;
		/** Place where this collection is configured, used in workspace trust prompts and "show config" */
		readonly origin?: URI;
	};
}

export const enum McpCollectionSortOrder {
	WorkspaceFolder = 0,
	Workspace = 100,
	User = 200,
	Extension = 300,
	Filesystem = 400,

	RemoteBoost = -50,
}

export namespace McpCollectionDefinition {
	export interface FromExtHost {
		readonly id: string;
		readonly label: string;
		readonly isTrustedByDefault: boolean;
		readonly scope: StorageScope;
		readonly canResolveLaunch: boolean;
		readonly extensionId: string;
		readonly configTarget: ConfigurationTarget;
	}

	export function equals(a: McpCollectionDefinition, b: McpCollectionDefinition): boolean {
		return a.id === b.id
			&& a.remoteAuthority === b.remoteAuthority
			&& a.label === b.label
			&& a.trustBehavior === b.trustBehavior;
	}
}

export interface McpServerDefinition {
	/** Globally-unique, stable ID for this definition */
	readonly id: string;
	/** Human-readable label for the definition */
	readonly label: string;
	/** Descriptor defining how the configuration should be launched. */
	readonly launch: McpServerLaunch;
	/** Explicit roots. If undefined, all workspace folders. */
	readonly roots?: URI[] | undefined;
	/** If set, allows configuration variables to be resolved in the {@link launch} with the given context */
	readonly variableReplacement?: McpServerDefinitionVariableReplacement;
	/** Nonce used for caching the server. Changing the nonce will indicate that tools need to be refreshed. */
	readonly cacheNonce: string;
	/** Dev mode configuration for the server */
	readonly devMode?: IMcpDevModeConfig;
	/** Static description of server tools/data, used to hydrate the cache. */
	readonly staticMetadata?: McpServerStaticMetadata;


	readonly presentation?: {
		/** Sort order of the definition. */
		readonly order?: number;
		/** Place where this server is configured, used in workspace trust prompts and "show config" */
		readonly origin?: Location;
	};
}

export const enum McpServerStaticToolAvailability {
	/** Tool is expected to be present as soon as the server is started. */
	Initial,
	/** Tool may be present later. */
	Dynamic,
}

export interface McpServerStaticMetadata {
	tools?: { availability: McpServerStaticToolAvailability; definition: MCP.Tool }[];
	instructions?: string;
	capabilities?: MCP.ServerCapabilities;
	serverInfo?: MCP.Implementation;
}

export namespace McpServerDefinition {
	export interface Serialized {
		readonly id: string;
		readonly label: string;
		readonly cacheNonce: string;
		readonly launch: McpServerLaunch.Serialized;
		readonly variableReplacement?: McpServerDefinitionVariableReplacement.Serialized;
		readonly staticMetadata?: McpServerStaticMetadata;
	}

	export function toSerialized(def: McpServerDefinition): McpServerDefinition.Serialized {
		return def;
	}

	export function fromSerialized(def: McpServerDefinition.Serialized): McpServerDefinition {
		return {
			id: def.id,
			label: def.label,
			cacheNonce: def.cacheNonce,
			staticMetadata: def.staticMetadata,
			launch: McpServerLaunch.fromSerialized(def.launch),
			variableReplacement: def.variableReplacement ? McpServerDefinitionVariableReplacement.fromSerialized(def.variableReplacement) : undefined,
		};
	}

	export function equals(a: McpServerDefinition, b: McpServerDefinition): boolean {
		return a.id === b.id
			&& a.label === b.label
			&& a.cacheNonce === b.cacheNonce
			&& arraysEqual(a.roots, b.roots, (a, b) => a.toString() === b.toString())
			&& objectsEqual(a.launch, b.launch)
			&& objectsEqual(a.presentation, b.presentation)
			&& objectsEqual(a.variableReplacement, b.variableReplacement)
			&& objectsEqual(a.devMode, b.devMode);
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

/** An observable of the auto-starting servers. When 'starting' is empty, the operation is complete. */
export interface IAutostartResult {
	working: boolean;
	starting: McpDefinitionReference[];
	serversRequiringInteraction: Array<McpDefinitionReference & { errorMessage?: string }>;
}

export namespace IAutostartResult {
	export const Empty: IAutostartResult = { working: false, starting: [], serversRequiringInteraction: [] };
}

export interface IMcpService {
	_serviceBrand: undefined;
	readonly servers: IObservable<readonly IMcpServer[]>;

	/** Resets the cached tools. */
	resetCaches(): void;

	/** Resets trusted MCP servers. */
	resetTrust(): void;

	/** Set if there are extensions that register MCP servers that have never been activated. */
	readonly lazyCollectionState: IObservable<{ state: LazyCollectionState; collections: McpCollectionDefinition[] }>;

	/** Auto-starts pending servers based on user settings. */
	autostart(token?: CancellationToken): IObservable<IAutostartResult>;

	/** Cancels any current autostart @internal */
	cancelAutostart(): void;

	/** Activates extension-providing MCP servers that have not yet been discovered. */
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

export class McpStartServerInteraction {
	/** @internal */
	public readonly participants = new ObservableMap</* server definition ID */ string, { s: 'unknown' | 'resolved' } | { s: 'waiting'; definition: McpServerDefinition; collection: McpCollectionDefinition }>();
	choice?: Promise<string[] | undefined>;
}

export interface IMcpServerStartOpts {
	/**
	 * Automatically trust if changed. This should ONLY be set for afforances that
	 * ensure the user sees the config before it gets started (e.g. code lenses)
	 */
	autoTrustChanges?: boolean;
	/**
	 * When to trigger the trust prompt.
	 * - only-new: only prompt for servers that are not previously explicitly untrusted (default)
	 * - all-untrusted: prompt for all servers that are not trusted
	 * - never: don't prompt, fail silently when trying to start an untrusted server
	 */
	promptType?: 'only-new' | 'all-untrusted' | 'never';
	/** True if th servre should be launched with debugging. */
	debug?: boolean;
	/** Correlate multiple interactions such that any trust prompts are presented in combination. */
	interaction?: McpStartServerInteraction;
	/**
	 * If true, throw an error if any user interaction would be required during startup.
	 * This includes variable resolution, trust prompts, and authentication prompts.
	 */
	errorOnUserInteraction?: boolean;
}

export namespace McpServerTrust {
	export const enum Kind {
		/** The server is trusted */
		Trusted,
		/** The server is trusted as long as its nonce matches */
		TrustedOnNonce,
		/** The server trust was denied. */
		Untrusted,
		/** The server is not yet trusted or untrusted. */
		Unknown,
	}
}

export interface IMcpServer extends IDisposable {
	readonly collection: McpCollectionReference;
	readonly definition: McpDefinitionReference;
	readonly connection: IObservable<IMcpServerConnection | undefined>;
	readonly connectionState: IObservable<McpConnectionState>;
	readonly serverMetadata: IObservable<{
		serverName?: string;
		serverInstructions?: string;
		icons: IMcpIcons;
	} | undefined>;

	/**
	 * Full definition as it exists in the MCP registry. Unlike the references
	 * in `collection` and `definition`, this may change over time.
	 */
	readDefinitions(): IObservable<{ server: McpServerDefinition | undefined; collection: McpCollectionDefinition | undefined }>;

	showOutput(preserveFocus?: boolean): Promise<void>;
	/**
	 * Starts the server and returns its resulting state. One of:
	 * - Running, if all good
	 * - Error, if the server failed to start
	 * - Stopped, if the server was disposed or the user cancelled the launch
	 */
	start(opts?: IMcpServerStartOpts): Promise<McpConnectionState>;
	stop(): Promise<void>;

	readonly cacheState: IObservable<McpServerCacheState>;
	readonly tools: IObservable<readonly IMcpTool[]>;
	readonly prompts: IObservable<readonly IMcpPrompt[]>;
	readonly capabilities: IObservable<McpCapability | undefined>;

	/**
	 * Lists all resources on the server.
	 */
	resources(token?: CancellationToken): AsyncIterable<IMcpResource[]>;

	/**
	 * List resource templates on the server.
	 */
	resourceTemplates(token?: CancellationToken): Promise<IMcpResourceTemplate[]>;
}

/**
 * A representation of an MCP resource. The `uri` is namespaced to VS Code and
 * can be used in filesystem APIs.
 */
export interface IMcpResource {
	/** Identifier for the file in VS Code and operable with filesystem API */
	readonly uri: URI;
	/** Identifier of the file as given from the MCP server. */
	readonly mcpUri: string;
	readonly name: string;
	readonly title?: string;
	readonly description?: string;
	readonly mimeType?: string;
	readonly sizeInBytes?: number;
	readonly icons: IMcpIcons;
}

export interface IMcpResourceTemplate {
	readonly name: string;
	readonly title?: string;
	readonly description?: string;
	readonly mimeType?: string;
	readonly template: UriTemplate;
	readonly icons: IMcpIcons;

	/** Gets string completions for the given template part. */
	complete(templatePart: string, prefix: string, alreadyResolved: Record<string, string | string[]>, token: CancellationToken): Promise<string[]>;

	/** Gets the resolved URI from template parts. */
	resolveURI(vars: Record<string, unknown>): URI;
}

export const isMcpResourceTemplate = (obj: IMcpResource | IMcpResourceTemplate): obj is IMcpResourceTemplate => {
	return (obj as IMcpResourceTemplate).template !== undefined;
};
export const isMcpResource = (obj: IMcpResource | IMcpResourceTemplate): obj is IMcpResource => {
	return (obj as IMcpResource).mcpUri !== undefined;
};

export const enum McpServerCacheState {
	/** Tools have not been read before */
	Unknown,
	/** Tools were read from the cache */
	Cached,
	/** Tools were read from the cache or live, but they may be outdated. */
	Outdated,
	/** Tools are refreshing for the first time */
	RefreshingFromUnknown,
	/** Tools are refreshing and the current tools are cached */
	RefreshingFromCached,
	/** Tool state is live, server is connected */
	Live,
}

export interface IMcpPrompt {
	readonly id: string;
	readonly name: string;
	readonly title?: string;
	readonly description?: string;
	readonly arguments: readonly MCP.PromptArgument[];

	/** Gets string completions for the given prompt part. */
	complete(argument: string, prefix: string, alreadyResolved: Record<string, string>, token: CancellationToken): Promise<string[]>;

	resolve(args: Record<string, string | undefined>, token?: CancellationToken): Promise<IMcpPromptMessage[]>;
}

export const mcpPromptReplaceSpecialChars = (s: string) => s.replace(/[^a-z0-9_.-]/gi, '_');

export const mcpPromptPrefix = (definition: McpDefinitionReference) =>
	`/mcp.` + mcpPromptReplaceSpecialChars(definition.label);

export interface IMcpPromptMessage extends MCP.PromptMessage { }

export interface IMcpToolCallContext {
	chatSessionId?: string;
	chatRequestId?: string;
}

export interface IMcpTool {

	readonly id: string;
	/** Name for #referencing in chat */
	readonly referenceName: string;
	readonly icons: IMcpIcons;
	readonly definition: MCP.Tool;

	/**
	 * Calls a tool
	 * @throws {@link MpcResponseError} if the tool fails to execute
	 * @throws {@link McpConnectionFailedError} if the connection to the server fails
	 */
	call(params: Record<string, unknown>, context?: IMcpToolCallContext, token?: CancellationToken): Promise<MCP.CallToolResult>;

	/**
	 * Identical to {@link call}, but reports progress.
	 */
	callWithProgress(params: Record<string, unknown>, progress: ToolProgress, context?: IMcpToolCallContext, token?: CancellationToken): Promise<MCP.CallToolResult>;
}

export const enum McpServerTransportType {
	/** A command-line MCP server communicating over standard in/out */
	Stdio = 1 << 0,
	/** An MCP server that uses Server-Sent Events */
	HTTP = 1 << 1,
}

/**
 * MCP server launched on the command line which communicated over stdio.
 * https://spec.modelcontextprotocol.io/specification/2024-11-05/basic/transports/#stdio
 */
export interface McpServerTransportStdio {
	readonly type: McpServerTransportType.Stdio;
	readonly cwd: string | undefined;
	readonly command: string;
	readonly args: readonly string[];
	readonly env: Record<string, string | number | null>;
	readonly envFile: string | undefined;
}

export interface McpServerTransportHTTPAuthentication {
	/**
	 * Authentication provider ID to use to get a session for the initial MCP server connection.
	 */
	readonly providerId: string;
	/**
	 * Scopes to use to get a session for the initial MCP server connection.
	 */
	readonly scopes: string[];
}

/**
 * MCP server launched on the command line which communicated over SSE or Streamable HTTP.
 * https://spec.modelcontextprotocol.io/specification/2024-11-05/basic/transports/#http-with-sse
 * https://modelcontextprotocol.io/specification/2025-03-26/basic/transports#streamable-http
 */
export interface McpServerTransportHTTP {
	readonly type: McpServerTransportType.HTTP;
	readonly uri: URI;
	readonly headers: [string, string][];
	readonly authentication?: McpServerTransportHTTPAuthentication;
}

export type McpServerLaunch =
	| McpServerTransportStdio
	| McpServerTransportHTTP;

export namespace McpServerLaunch {
	export type Serialized =
		| { type: McpServerTransportType.HTTP; uri: UriComponents; headers: [string, string][]; authentication?: McpServerTransportHTTPAuthentication }
		| { type: McpServerTransportType.Stdio; cwd: string | undefined; command: string; args: readonly string[]; env: Record<string, string | number | null>; envFile: string | undefined };

	export function toSerialized(launch: McpServerLaunch): McpServerLaunch.Serialized {
		return launch;
	}

	export function fromSerialized(launch: McpServerLaunch.Serialized): McpServerLaunch {
		switch (launch.type) {
			case McpServerTransportType.HTTP:
				return { type: launch.type, uri: URI.revive(launch.uri), headers: launch.headers, authentication: launch.authentication };
			case McpServerTransportType.Stdio:
				return {
					type: launch.type,
					cwd: launch.cwd,
					command: launch.command,
					args: launch.args,
					env: launch.env,
					envFile: launch.envFile,
				};
		}
	}

	export async function hash(launch: McpServerLaunch): Promise<string> {
		const nonce = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(launch)));
		return encodeHex(VSBuffer.wrap(new Uint8Array(nonce)));
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
	 * Resolved launch definition. Might not match the `definition.launch` due to
	 * resolution logic in extension-provided MCPs.
	 */
	readonly launchDefinition: McpServerLaunch;

	/**
	 * Starts the server if it's stopped. Returns a promise that resolves once
	 * server exits a 'starting' state.
	 */
	start(methods: IMcpClientMethods): Promise<McpConnectionState>;

	/**
	 * Stops the server.
	 */
	stop(): Promise<void>;
}

/** Client methods whose implementations are passed through the server connection. */
export interface IMcpClientMethods {
	/** Handler for `sampling/createMessage` */
	createMessageRequestHandler?(req: MCP.CreateMessageRequest['params'], token?: CancellationToken): Promise<MCP.CreateMessageResult>;
	/** Handler for `elicitation/create` */
	elicitationRequestHandler?(req: MCP.ElicitRequest['params'], token?: CancellationToken): Promise<MCP.ElicitResult>;
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

	export const toKindString = (s: McpConnectionState.Kind): string => {
		switch (s) {
			case Kind.Stopped:
				return 'stopped';
			case Kind.Starting:
				return 'starting';
			case Kind.Running:
				return 'running';
			case Kind.Error:
				return 'error';
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
		readonly reason?: 'needs-user-interaction';
	}

	export interface Starting {
		readonly state: Kind.Starting;
	}

	export interface Running {
		readonly state: Kind.Running;
	}

	export interface Error {
		readonly state: Kind.Error;
		readonly code?: string;
		readonly shouldRetry?: boolean;
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

export class UserInteractionRequiredError extends Error {
	private static readonly prefix = 'User interaction required: ';

	public static is(error: Error): boolean {
		return error.message.startsWith(this.prefix);
	}

	constructor(public readonly reason: string) {
		super(`${UserInteractionRequiredError.prefix}${reason}`);
	}
}

export interface IMcpConfigPath {
	id: string;
	key: 'userLocalValue' | 'userRemoteValue' | 'workspaceValue' | 'workspaceFolderValue';
	label: string;
	scope: StorageScope;
	target: ConfigurationTarget;
	order: number;
	remoteAuthority?: string;
	uri: URI | undefined;
	section?: string[];
	workspaceFolder?: IWorkspaceFolder;
}

export interface IMcpServerContainer extends IDisposable {
	mcpServer: IWorkbenchMcpServer | null;
	update(): void;
}

export interface IMcpServerEditorOptions extends IEditorOptions {
	tab?: McpServerEditorTab;
	sideByside?: boolean;
}

export const enum McpServerEnablementState {
	Disabled,
	DisabledByAccess,
	Enabled,
}

export const enum McpServerInstallState {
	Installing,
	Installed,
	Uninstalling,
	Uninstalled
}

export const enum McpServerEditorTab {
	Readme = 'readme',
	Manifest = 'manifest',
	Configuration = 'configuration',
}

export type McpServerEnablementStatus = {
	readonly state: McpServerEnablementState;
	readonly message?: {
		readonly severity: Severity;
		readonly text: IMarkdownString;
	};
};

export interface IWorkbenchMcpServer {
	readonly gallery: IGalleryMcpServer | undefined;
	readonly local: IWorkbenchLocalMcpServer | undefined;
	readonly installable: IInstallableMcpServer | undefined;
	readonly installState: McpServerInstallState;
	readonly runtimeStatus: McpServerEnablementStatus | undefined;
	readonly id: string;
	readonly name: string;
	readonly label: string;
	readonly description: string;
	readonly icon?: {
		readonly dark: string;
		readonly light: string;
	};
	readonly codicon?: string;
	readonly publisherUrl?: string;
	readonly publisherDisplayName?: string;
	readonly starsCount?: number;
	readonly license?: string;
	readonly repository?: string;
	readonly config?: IMcpServerConfiguration | undefined;
	readonly readmeUrl?: URI;
	getReadme(token: CancellationToken): Promise<string>;
	getManifest(token: CancellationToken): Promise<IGalleryMcpServerConfiguration>;
}

export const IMcpWorkbenchService = createDecorator<IMcpWorkbenchService>('IMcpWorkbenchService');
export interface IMcpWorkbenchService {
	readonly _serviceBrand: undefined;
	readonly onChange: Event<IWorkbenchMcpServer | undefined>;
	readonly onReset: Event<void>;
	readonly local: readonly IWorkbenchMcpServer[];
	getEnabledLocalMcpServers(): IWorkbenchLocalMcpServer[];
	queryLocal(): Promise<IWorkbenchMcpServer[]>;
	queryGallery(options?: IQueryOptions, token?: CancellationToken): Promise<IIterativePager<IWorkbenchMcpServer>>;
	canInstall(mcpServer: IWorkbenchMcpServer): true | IMarkdownString;
	install(server: IWorkbenchMcpServer, installOptions?: IWorkbencMcpServerInstallOptions): Promise<IWorkbenchMcpServer>;
	uninstall(mcpServer: IWorkbenchMcpServer): Promise<void>;
	getMcpConfigPath(arg: IWorkbenchLocalMcpServer): IMcpConfigPath | undefined;
	getMcpConfigPath(arg: URI): Promise<IMcpConfigPath | undefined>;
	openSearch(searchValue: string, preserveFoucs?: boolean): Promise<void>;
	open(extension: IWorkbenchMcpServer | string, options?: IMcpServerEditorOptions): Promise<void>;
}

export class McpServerContainers extends Disposable {
	constructor(
		private readonly containers: IMcpServerContainer[],
		@IMcpWorkbenchService mcpWorkbenchService: IMcpWorkbenchService
	) {
		super();
		this._register(mcpWorkbenchService.onChange(this.update, this));
	}

	set mcpServer(extension: IWorkbenchMcpServer | null) {
		this.containers.forEach(c => c.mcpServer = extension);
	}

	update(server: IWorkbenchMcpServer | undefined): void {
		for (const container of this.containers) {
			if (server && container.mcpServer) {
				if (server.id === container.mcpServer.id) {
					container.mcpServer = server;
				}
			} else {
				container.update();
			}
		}
	}
}

export const McpServersGalleryStatusContext = new RawContextKey<string>('mcpServersGalleryStatus', McpGalleryManifestStatus.Unavailable);
export const HasInstalledMcpServersContext = new RawContextKey<boolean>('hasInstalledMcpServers', true);
export const InstalledMcpServersViewId = 'workbench.views.mcp.installed';

export namespace McpResourceURI {
	export const scheme = 'mcp-resource';

	// Random placeholder for empty authorities, otherwise they're represente as
	// `scheme//path/here` in the URI which would get normalized to `scheme/path/here`.
	const emptyAuthorityPlaceholder = 'dylo78gyp'; // chosen by a fair dice roll. Guaranteed to be random.

	export function fromServer(def: McpDefinitionReference, resourceURI: URI | string): URI {
		if (typeof resourceURI === 'string') {
			resourceURI = URI.parse(resourceURI);
		}
		return resourceURI.with({
			scheme,
			authority: encodeHex(VSBuffer.fromString(def.id)),
			path: ['', resourceURI.scheme, resourceURI.authority || emptyAuthorityPlaceholder].join('/') + resourceURI.path,
		});
	}

	export function toServer(uri: URI | string): { definitionId: string; resourceURL: URL } {
		if (typeof uri === 'string') {
			uri = URI.parse(uri);
		}
		if (uri.scheme !== scheme) {
			throw new Error(`Invalid MCP resource URI: ${uri.toString()}`);
		}
		const parts = uri.path.split('/');
		if (parts.length < 3) {
			throw new Error(`Invalid MCP resource URI: ${uri.toString()}`);
		}
		const [, serverScheme, authority, ...path] = parts;

		// URI cannot correctly stringify empty authorities (#250905) so we use URL instead to construct
		const url = new URL(`${serverScheme}://${authority.toLowerCase() === emptyAuthorityPlaceholder ? '' : authority}`);
		url.pathname = path.length ? ('/' + path.join('/')) : '';
		url.search = uri.query;
		url.hash = uri.fragment;

		return {
			definitionId: decodeHex(uri.authority).toString(),
			resourceURL: url,
		};
	}

}

/** Warning: this enum is cached in `mcpServer.ts` and all changes MUST only be additive. */
export const enum McpCapability {
	Logging = 1 << 0,
	Completions = 1 << 1,
	Prompts = 1 << 2,
	PromptsListChanged = 1 << 3,
	Resources = 1 << 4,
	ResourcesSubscribe = 1 << 5,
	ResourcesListChanged = 1 << 6,
	Tools = 1 << 7,
	ToolsListChanged = 1 << 8,
}

export interface ISamplingOptions {
	server: IMcpServer;
	isDuringToolCall: boolean;
	params: MCP.CreateMessageRequest['params'];
}

export interface ISamplingResult {
	sample: MCP.CreateMessageResult;
}

export interface IMcpSamplingService {
	_serviceBrand: undefined;

	sample(opts: ISamplingOptions, token?: CancellationToken): Promise<ISamplingResult>;

	/** Whether MCP sampling logs are available for this server */
	hasLogs(server: IMcpServer): boolean;
	/** Gets a text report of the MCP server's sampling usage */
	getLogText(server: IMcpServer): string;

	getConfig(server: IMcpServer): IMcpServerSamplingConfiguration;
	updateConfig(server: IMcpServer, mutate: (r: IMcpServerSamplingConfiguration) => unknown): Promise<IMcpServerSamplingConfiguration>;
}

export const IMcpSamplingService = createDecorator<IMcpSamplingService>('IMcpServerSampling');

export class McpError extends Error {
	public static methodNotFound(method: string) {
		return new McpError(MCP.METHOD_NOT_FOUND, `Method not found: ${method}`);
	}

	public static notAllowed() {
		return new McpError(-32000, 'The user has denied permission to call this method.');
	}

	public static unknown(e: Error) {
		const mcpError = new McpError(MCP.INTERNAL_ERROR, `Unknown error: ${e.stack}`);
		mcpError.cause = e;
		return mcpError;
	}

	constructor(
		public readonly code: number,
		message: string,
		public readonly data?: unknown
	) {
		super(message);
	}
}

export const enum McpToolName {
	Prefix = 'mcp_',
	MaxPrefixLen = 18,
	MaxLength = 64,
}


export interface IMcpElicitationService {
	_serviceBrand: undefined;

	/**
	 * Elicits a response from the user. The `context` is optional and can be used
	 * to provide additional information about the request.
	 *
	 * @param context Context for the elicitation, e.g. chat session ID.
	 * @param elicitation Request to elicit a response.
	 * @returns A promise that resolves to an {@link ElicitationResult}.
	 */
	elicit(server: IMcpServer, context: IMcpToolCallContext | undefined, elicitation: MCP.ElicitRequest['params'], token: CancellationToken): Promise<ElicitResult>;
}

export const enum ElicitationKind {
	Form,
	URL,
}

export interface IUrlModeElicitResult extends IDisposable {
	kind: ElicitationKind.URL;
	value: MCP.ElicitResult;
	/**
	 * Waits until the server tells us the elicitation is completed before resolving.
	 * Rejects with a CancellationError if the server stops before elicitation is
	 * complete, or if the token is cancelled.
	 */
	wait: Promise<void>;
}

export interface IFormModeElicitResult extends IDisposable {
	kind: ElicitationKind.Form;
	value: MCP.ElicitResult;
}

export type ElicitResult = IUrlModeElicitResult | IFormModeElicitResult;

export const IMcpElicitationService = createDecorator<IMcpElicitationService>('IMcpElicitationService');

export const McpToolResourceLinkMimeType = 'application/vnd.code.resource-link';

export interface IMcpToolResourceLinkContents {
	uri: UriComponents;
	underlyingMimeType?: string;
}

export interface IMcpIcons {
	/** Gets the image URI appropriate to the approximate display size */
	getUrl(size: number): { dark: URI; light?: URI } | undefined;
}
