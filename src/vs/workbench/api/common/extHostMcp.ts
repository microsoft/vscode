/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { DeferredPromise, raceCancellationError, Sequencer, timeout } from '../../../base/common/async.js';
import { CancellationToken, CancellationTokenSource } from '../../../base/common/cancellation.js';
import { CancellationError } from '../../../base/common/errors.js';
import { Disposable, DisposableMap, DisposableStore, IDisposable, toDisposable } from '../../../base/common/lifecycle.js';
import { AUTH_SERVER_METADATA_DISCOVERY_PATH, fetchResourceMetadata, getDefaultMetadataForUrl, IAuthorizationProtectedResourceMetadata, IAuthorizationServerMetadata, isAuthorizationServerMetadata, OPENID_CONNECT_DISCOVERY_PATH, parseWWWAuthenticateHeader } from '../../../base/common/oauth.js';
import { SSEParser } from '../../../base/common/sseParser.js';
import { URI, UriComponents } from '../../../base/common/uri.js';
import { ConfigurationTarget } from '../../../platform/configuration/common/configuration.js';
import { ExtensionIdentifier, IExtensionDescription } from '../../../platform/extensions/common/extensions.js';
import { createDecorator } from '../../../platform/instantiation/common/instantiation.js';
import { canLog, ILogService, LogLevel } from '../../../platform/log/common/log.js';
import { StorageScope } from '../../../platform/storage/common/storage.js';
import { extensionPrefixedIdentifier, McpCollectionDefinition, McpConnectionState, McpServerDefinition, McpServerLaunch, McpServerTransportHTTP, McpServerTransportType, UserInteractionRequiredError } from '../../contrib/mcp/common/mcpTypes.js';
import { MCP } from '../../contrib/mcp/common/modelContextProtocol.js';
import { ExtHostMcpShape, IStartMcpOptions, MainContext, MainThreadMcpShape } from './extHost.protocol.js';
import { IExtHostInitDataService } from './extHostInitDataService.js';
import { IExtHostRpcService } from './extHostRpcService.js';
import * as Convert from './extHostTypeConverters.js';
import { IExtHostVariableResolverProvider } from './extHostVariableResolverService.js';
import { IExtHostWorkspace } from './extHostWorkspace.js';

export const IExtHostMpcService = createDecorator<IExtHostMpcService>('IExtHostMpcService');

export interface IExtHostMpcService extends ExtHostMcpShape {
	registerMcpConfigurationProvider(extension: IExtensionDescription, id: string, provider: vscode.McpServerDefinitionProvider): IDisposable;
}

export class ExtHostMcpService extends Disposable implements IExtHostMpcService {
	protected _proxy: MainThreadMcpShape;
	private readonly _initialProviderPromises = new Set<Promise<void>>();
	protected readonly _sseEventSources = this._register(new DisposableMap<number, McpHTTPHandle>());
	private readonly _unresolvedMcpServers = new Map</* collectionId */ string, {
		provider: vscode.McpServerDefinitionProvider;
		servers: vscode.McpServerDefinition[];
	}>();

	constructor(
		@IExtHostRpcService extHostRpc: IExtHostRpcService,
		@ILogService protected readonly _logService: ILogService,
		@IExtHostInitDataService private readonly _extHostInitData: IExtHostInitDataService,
		@IExtHostWorkspace protected readonly _workspaceService: IExtHostWorkspace,
		@IExtHostVariableResolverProvider private readonly _variableResolver: IExtHostVariableResolverProvider,
	) {
		super();
		this._proxy = extHostRpc.getProxy(MainContext.MainThreadMcp);
	}

	$startMcp(id: number, opts: IStartMcpOptions): void {
		this._startMcp(id, McpServerLaunch.fromSerialized(opts.launch), opts.defaultCwd && URI.revive(opts.defaultCwd), opts.errorOnUserInteraction);
	}

	protected _startMcp(id: number, launch: McpServerLaunch, _defaultCwd?: URI, errorOnUserInteraction?: boolean): void {
		if (launch.type === McpServerTransportType.HTTP) {
			this._sseEventSources.set(id, new McpHTTPHandle(id, launch, this._proxy, this._logService, errorOnUserInteraction));
			return;
		}

		throw new Error('not implemented');
	}

	async $substituteVariables<T>(_workspaceFolder: UriComponents | undefined, value: T): Promise<T> {
		const folderURI = URI.revive(_workspaceFolder);
		const folder = folderURI && await this._workspaceService.resolveWorkspaceFolder(folderURI);
		const variableResolver = await this._variableResolver.getResolver();
		return variableResolver.resolveAsync(folder && {
			uri: folder.uri,
			name: folder.name,
			index: folder.index,
		}, value) as T;
	}

	$stopMcp(id: number): void {
		if (this._sseEventSources.has(id)) {
			this._sseEventSources.deleteAndDispose(id);
			this._proxy.$onDidChangeState(id, { state: McpConnectionState.Kind.Stopped });
		}
	}

	$sendMessage(id: number, message: string): void {
		this._sseEventSources.get(id)?.send(message);
	}

	async $waitForInitialCollectionProviders(): Promise<void> {
		await Promise.all(this._initialProviderPromises);
	}

	async $resolveMcpLaunch(collectionId: string, label: string): Promise<McpServerLaunch.Serialized | undefined> {
		const rec = this._unresolvedMcpServers.get(collectionId);
		if (!rec) {
			return;
		}

		const server = rec.servers.find(s => s.label === label);
		if (!server) {
			return;
		}
		if (!rec.provider.resolveMcpServerDefinition) {
			return Convert.McpServerDefinition.from(server);
		}

		const resolved = await rec.provider.resolveMcpServerDefinition(server, CancellationToken.None);
		return resolved ? Convert.McpServerDefinition.from(resolved) : undefined;
	}

	/** {@link vscode.lm.registerMcpServerDefinitionProvider} */
	public registerMcpConfigurationProvider(extension: IExtensionDescription, id: string, provider: vscode.McpServerDefinitionProvider): IDisposable {
		const store = new DisposableStore();

		const metadata = extension.contributes?.mcpServerDefinitionProviders?.find(m => m.id === id);
		if (!metadata) {
			throw new Error(`MCP configuration providers must be registered in the contributes.mcpServerDefinitionProviders array within your package.json, but "${id}" was not`);
		}

		const mcp: McpCollectionDefinition.FromExtHost = {
			id: extensionPrefixedIdentifier(extension.identifier, id),
			isTrustedByDefault: true,
			label: metadata?.label ?? extension.displayName ?? extension.name,
			scope: StorageScope.WORKSPACE,
			canResolveLaunch: typeof provider.resolveMcpServerDefinition === 'function',
			extensionId: extension.identifier.value,
			configTarget: this._extHostInitData.remote.isRemote ? ConfigurationTarget.USER_REMOTE : ConfigurationTarget.USER,
		};

		const update = async () => {
			const list = await provider.provideMcpServerDefinitions(CancellationToken.None);
			this._unresolvedMcpServers.set(mcp.id, { servers: list ?? [], provider });

			const servers: McpServerDefinition.Serialized[] = [];
			for (const item of list ?? []) {
				let id = ExtensionIdentifier.toKey(extension.identifier) + '/' + item.label;
				if (servers.some(s => s.id === id)) {
					let i = 2;
					while (servers.some(s => s.id === id + i)) { i++; }
					id = id + i;
				}

				servers.push({
					id,
					label: item.label,
					cacheNonce: item.version || '$$NONE',
					launch: Convert.McpServerDefinition.from(item),
				});
			}

			this._proxy.$upsertMcpCollection(mcp, servers);
		};

		store.add(toDisposable(() => {
			this._unresolvedMcpServers.delete(mcp.id);
			this._proxy.$deleteMcpCollection(mcp.id);
		}));

		if (provider.onDidChangeMcpServerDefinitions) {
			store.add(provider.onDidChangeMcpServerDefinitions(update));
		}
		// todo@connor4312: proposed API back-compat
		// eslint-disable-next-line local/code-no-any-casts
		if ((provider as any).onDidChangeServerDefinitions) {
			// eslint-disable-next-line local/code-no-any-casts
			store.add((provider as any).onDidChangeServerDefinitions(update));
		}
		// eslint-disable-next-line local/code-no-any-casts
		if ((provider as any).onDidChange) {
			// eslint-disable-next-line local/code-no-any-casts
			store.add((provider as any).onDidChange(update));
		}

		const promise = new Promise<void>(resolve => {
			setTimeout(() => update().finally(() => {
				this._initialProviderPromises.delete(promise);
				resolve();
			}), 0);
		});

		this._initialProviderPromises.add(promise);

		return store;
	}
}

const enum HttpMode {
	Unknown,
	Http,
	SSE,
}

type HttpModeT =
	| { value: HttpMode.Unknown }
	| { value: HttpMode.Http; sessionId: string | undefined }
	| { value: HttpMode.SSE; endpoint: string };

const MAX_FOLLOW_REDIRECTS = 5;
const REDIRECT_STATUS_CODES = [301, 302, 303, 307, 308];

/**
 * Implementation of both MCP HTTP Streaming as well as legacy SSE.
 *
 * The first request will POST to the endpoint, assuming HTTP streaming. If the
 * server is legacy SSE, it should return some 4xx status in that case,
 * and we'll automatically fall back to SSE and res
 */
export class McpHTTPHandle extends Disposable {
	private readonly _requestSequencer = new Sequencer();
	private readonly _postEndpoint = new DeferredPromise<{ url: string; transport: McpServerTransportHTTP }>();
	private _mode: HttpModeT = { value: HttpMode.Unknown };
	private readonly _cts = new CancellationTokenSource();
	private readonly _abortCtrl = new AbortController();
	private _authMetadata?: {
		authorizationServer: URI;
		serverMetadata: IAuthorizationServerMetadata;
		resourceMetadata?: IAuthorizationProtectedResourceMetadata;
	};

	constructor(
		private readonly _id: number,
		private readonly _launch: McpServerTransportHTTP,
		private readonly _proxy: MainThreadMcpShape,
		private readonly _logService: ILogService,
		private readonly _errorOnUserInteraction?: boolean,
	) {
		super();

		this._register(toDisposable(() => {
			this._abortCtrl.abort();
			this._cts.dispose(true);
		}));
		this._proxy.$onDidChangeState(this._id, { state: McpConnectionState.Kind.Running });
	}

	async send(message: string) {
		try {
			if (this._mode.value === HttpMode.Unknown) {
				await this._requestSequencer.queue(() => this._send(message));
			} else {
				await this._send(message);
			}
		} catch (err) {
			const msg = `Error sending message to ${this._launch.uri}: ${String(err)}`;
			this._proxy.$onDidChangeState(this._id, { state: McpConnectionState.Kind.Error, message: msg });
		}
	}

	_send(message: string) {
		if (this._mode.value === HttpMode.SSE) {
			return this._sendLegacySSE(this._mode.endpoint, message);
		} else {
			return this._sendStreamableHttp(message, this._mode.value === HttpMode.Http ? this._mode.sessionId : undefined);
		}
	}

	/**
	 * Sends a streamable-HTTP request.
	 * 1. Posts to the endpoint
	 * 2. Updates internal state as needed. Falls back to SSE if appropriate.
	 * 3. If the response body is empty, JSON, or a JSON stream, handle it appropriately.
	 */
	private async _sendStreamableHttp(message: string, sessionId: string | undefined) {
		const asBytes = new TextEncoder().encode(message) as Uint8Array<ArrayBuffer>;
		const headers: Record<string, string> = {
			...Object.fromEntries(this._launch.headers),
			'Content-Type': 'application/json',
			'Content-Length': String(asBytes.length),
			Accept: 'text/event-stream, application/json',
		};
		if (sessionId) {
			headers['Mcp-Session-Id'] = sessionId;
		}
		await this._addAuthHeader(headers);

		const res = await this._fetchWithAuthRetry(
			this._launch.uri.toString(true),
			{
				method: 'POST',
				headers,
				body: asBytes,
			},
			headers
		);

		const wasUnknown = this._mode.value === HttpMode.Unknown;

		// Mcp-Session-Id is the strongest signal that we're in streamable HTTP mode
		const nextSessionId = res.headers.get('Mcp-Session-Id');
		if (nextSessionId) {
			this._mode = { value: HttpMode.Http, sessionId: nextSessionId };
		}

		if (this._mode.value === HttpMode.Unknown &&
			// We care about 4xx errors...
			res.status >= 400 && res.status < 500
			// ...except for 401 and 403, which are auth errors
			&& res.status !== 401 && res.status !== 403
		) {
			this._log(LogLevel.Info, `${res.status} status sending message to ${this._launch.uri}, will attempt to fall back to legacy SSE`);
			this._sseFallbackWithMessage(message);
			return;
		}

		if (res.status >= 300) {
			// "When a client receives HTTP 404 in response to a request containing an Mcp-Session-Id, it MUST start a new session by sending a new InitializeRequest without a session ID attached"
			// Though this says only 404, some servers send 400s as well, including their example
			// https://github.com/modelcontextprotocol/typescript-sdk/issues/389
			const retryWithSessionId = this._mode.value === HttpMode.Http && !!this._mode.sessionId && (res.status === 400 || res.status === 404);

			this._proxy.$onDidChangeState(this._id, {
				state: McpConnectionState.Kind.Error,
				message: `${res.status} status sending message to ${this._launch.uri}: ${await this._getErrText(res)}` + (retryWithSessionId ? `; will retry with new session ID` : ''),
				shouldRetry: retryWithSessionId,
			});
			return;
		}

		if (this._mode.value === HttpMode.Unknown) {
			this._mode = { value: HttpMode.Http, sessionId: undefined };
		}
		if (wasUnknown) {
			this._attachStreamableBackchannel();
		}

		await this._handleSuccessfulStreamableHttp(res, message);
	}

	private async _sseFallbackWithMessage(message: string) {
		const endpoint = await this._attachSSE();
		if (endpoint) {
			this._mode = { value: HttpMode.SSE, endpoint };
			await this._sendLegacySSE(endpoint, message);
		}
	}

	private async _populateAuthMetadata(mcpUrl: string, originalResponse: CommonResponse): Promise<void> {
		// If there is a resource_metadata challenge, use that to get the oauth server. This is done in 2 steps.
		// First, extract the resource_metada challenge from the WWW-Authenticate header (if available)
		let resourceMetadataChallenge: string | undefined;
		if (originalResponse.headers.has('WWW-Authenticate')) {
			const authHeader = originalResponse.headers.get('WWW-Authenticate')!;
			const challenges = parseWWWAuthenticateHeader(authHeader);
			for (const challenge of challenges) {
				if (challenge.scheme === 'Bearer' && challenge.params['resource_metadata']) {
					this._log(LogLevel.Debug, `Found resource_metadata challenge in WWW-Authenticate header: ${challenge.params['resource_metadata']}`);
					resourceMetadataChallenge = challenge.params['resource_metadata'];
					break;
				}
			}
		}
		// Second, fetch the resource metadata either from the challenge URL or from well-known URIs
		let serverMetadataUrl: string | undefined;
		let scopesSupported: string[] | undefined;
		let resource: IAuthorizationProtectedResourceMetadata | undefined;
		try {
			const resourceMetadata = await fetchResourceMetadata(mcpUrl, resourceMetadataChallenge, {
				sameOriginHeaders: {
					...Object.fromEntries(this._launch.headers),
					'MCP-Protocol-Version': MCP.LATEST_PROTOCOL_VERSION
				},
				fetch: (url, init) => this._fetch(url, init)
			});
			// TODO:@TylerLeonhardt support multiple authorization servers
			// Consider using one that has an auth provider first, over the dynamic flow
			serverMetadataUrl = resourceMetadata.authorization_servers?.[0];
			this._log(LogLevel.Debug, `Using auth server metadata url: ${serverMetadataUrl}`);
			scopesSupported = resourceMetadata.scopes_supported;
			resource = resourceMetadata;
		} catch (e) {
			this._log(LogLevel.Debug, `Could not fetch resource metadata: ${String(e)}`);
		}

		const baseUrl = new URL(originalResponse.url).origin;

		// If we are not given a resource_metadata, see if the well-known server metadata is available
		// on the base url.
		let addtionalHeaders: Record<string, string> = {};
		if (!serverMetadataUrl) {
			serverMetadataUrl = baseUrl;
			// Maintain the launch headers when talking to the MCP origin.
			addtionalHeaders = {
				...Object.fromEntries(this._launch.headers)
			};
		}
		try {
			const serverMetadataResponse = await this._getAuthorizationServerMetadata(serverMetadataUrl, addtionalHeaders);
			this._log(LogLevel.Info, 'Populated auth metadata');
			this._authMetadata = {
				authorizationServer: URI.parse(serverMetadataUrl),
				serverMetadata: serverMetadataResponse,
				resourceMetadata: resource
			};
			return;
		} catch (e) {
			this._log(LogLevel.Warning, `Error populating auth server metadata for ${serverMetadataUrl}: ${String(e)}`);
		}

		// If there's no well-known server metadata, then use the default values based off of the url.
		const defaultMetadata = getDefaultMetadataForUrl(new URL(baseUrl));
		defaultMetadata.scopes_supported = scopesSupported ?? defaultMetadata.scopes_supported ?? [];
		this._authMetadata = {
			authorizationServer: URI.parse(baseUrl),
			serverMetadata: defaultMetadata,
			resourceMetadata: resource
		};
		this._log(LogLevel.Info, 'Using default auth metadata');
	}

	private async _getAuthorizationServerMetadata(authorizationServer: string, addtionalHeaders: Record<string, string>): Promise<IAuthorizationServerMetadata> {
		// For the oauth server metadata discovery path, we _INSERT_
		// the well known path after the origin and before the path.
		// https://datatracker.ietf.org/doc/html/rfc8414#section-3
		const authorizationServerUrl = new URL(authorizationServer);
		const extraPath = authorizationServerUrl.pathname === '/' ? '' : authorizationServerUrl.pathname;
		const pathToFetch = new URL(AUTH_SERVER_METADATA_DISCOVERY_PATH, authorizationServer).toString() + extraPath;
		this._log(LogLevel.Debug, `Fetching auth server metadata url with path insertion: ${pathToFetch} ...`);
		let authServerMetadataResponse = await this._fetch(pathToFetch, {
			method: 'GET',
			headers: {
				...addtionalHeaders,
				'Accept': 'application/json',
				'MCP-Protocol-Version': MCP.LATEST_PROTOCOL_VERSION,
			}
		});
		if (authServerMetadataResponse.status !== 200) {
			// Try fetching the OpenID Connect Discovery with path insertion.
			// For issuer URLs with path components, this inserts the well-known path
			// after the origin and before the path.
			const openidPathInsertionUrl = new URL(OPENID_CONNECT_DISCOVERY_PATH, authorizationServer).toString() + extraPath;
			this._log(LogLevel.Debug, `Fetching fallback openid connect discovery url with path insertion: ${openidPathInsertionUrl} ...`);
			authServerMetadataResponse = await this._fetch(openidPathInsertionUrl, {
				method: 'GET',
				headers: {
					...addtionalHeaders,
					'Accept': 'application/json',
					'MCP-Protocol-Version': MCP.LATEST_PROTOCOL_VERSION
				}
			});
			if (authServerMetadataResponse.status !== 200) {
				// Try fetching the other discovery URL. For the openid metadata discovery
				// path, we _ADD_ the well known path after the existing path.
				// https://datatracker.ietf.org/doc/html/rfc8414#section-3
				const openidPathAdditionUrl = URI.joinPath(URI.parse(authorizationServer), OPENID_CONNECT_DISCOVERY_PATH).toString(true);
				this._log(LogLevel.Debug, `Fetching fallback openid connect discovery url with path addition: ${openidPathAdditionUrl} ...`);
				authServerMetadataResponse = await this._fetch(openidPathAdditionUrl, {
					method: 'GET',
					headers: {
						...addtionalHeaders,
						'Accept': 'application/json',
						'MCP-Protocol-Version': MCP.LATEST_PROTOCOL_VERSION
					}
				});
				if (authServerMetadataResponse.status !== 200) {
					throw new Error(`Failed to fetch authorization server metadata: ${authServerMetadataResponse.status} ${await this._getErrText(authServerMetadataResponse)}`);
				}
			}
		}
		const body = await authServerMetadataResponse.json();
		if (isAuthorizationServerMetadata(body)) {
			return body;
		}
		throw new Error(`Invalid authorization server metadata: ${JSON.stringify(body)}`);
	}

	private async _handleSuccessfulStreamableHttp(res: CommonResponse, message: string) {
		if (res.status === 202) {
			return; // no body
		}

		const contentType = res.headers.get('Content-Type')?.toLowerCase() || '';
		if (contentType.startsWith('text/event-stream')) {
			const parser = new SSEParser(event => {
				if (event.type === 'message') {
					this._proxy.$onDidReceiveMessage(this._id, event.data);
				} else if (event.type === 'endpoint') {
					// An SSE server that didn't correctly return a 4xx status when we POSTed
					this._log(LogLevel.Warning, `Received SSE endpoint from a POST to ${this._launch.uri}, will fall back to legacy SSE`);
					this._sseFallbackWithMessage(message);
					throw new CancellationError(); // just to end the SSE stream
				}
			});

			try {
				await this._doSSE(parser, res);
			} catch (err) {
				this._log(LogLevel.Warning, `Error reading SSE stream: ${String(err)}`);
			}
		} else if (contentType.startsWith('application/json')) {
			this._proxy.$onDidReceiveMessage(this._id, await res.text());
		} else {
			const responseBody = await res.text();
			if (isJSON(responseBody)) { // try to read as JSON even if the server didn't set the content type
				this._proxy.$onDidReceiveMessage(this._id, responseBody);
			} else {
				this._log(LogLevel.Warning, `Unexpected ${res.status} response for request: ${responseBody}`);
			}
		}
	}

	/**
	 * Attaches the SSE backchannel that streamable HTTP servers can use
	 * for async notifications. This is a "MAY" support, so if the server gives
	 * us a 4xx code, we'll stop trying to connect..
	 */
	private async _attachStreamableBackchannel() {
		let lastEventId: string | undefined;
		for (let retry = 0; !this._store.isDisposed; retry++) {
			await timeout(Math.min(retry * 1000, 30_000), this._cts.token);

			let res: CommonResponse;
			try {
				const headers: Record<string, string> = {
					...Object.fromEntries(this._launch.headers),
					'Accept': 'text/event-stream',
				};
				await this._addAuthHeader(headers);

				if (this._mode.value === HttpMode.Http && this._mode.sessionId !== undefined) {
					headers['Mcp-Session-Id'] = this._mode.sessionId;
				}
				if (lastEventId) {
					headers['Last-Event-ID'] = lastEventId;
				}

				res = await this._fetchWithAuthRetry(
					this._launch.uri.toString(true),
					{
						method: 'GET',
						headers,
					},
					headers
				);
			} catch (e) {
				this._log(LogLevel.Info, `Error connecting to ${this._launch.uri} for async notifications, will retry`);
				continue;
			}

			if (res.status >= 400) {
				this._log(LogLevel.Debug, `${res.status} status connecting to ${this._launch.uri} for async notifications; they will be disabled: ${await this._getErrText(res)}`);
				return;
			}

			// Only reset the retry counter if we definitely get an event stream to avoid
			// spamming servers that (incorrectly) don't return one from this endpoint.
			if (res.headers.get('content-type')?.toLowerCase().includes('text/event-stream')) {
				retry = 0;
			}

			const parser = new SSEParser(event => {
				if (event.type === 'message') {
					this._proxy.$onDidReceiveMessage(this._id, event.data);
				}
				if (event.id) {
					lastEventId = event.id;
				}
			});

			try {
				await this._doSSE(parser, res);
			} catch (e) {
				this._log(LogLevel.Info, `Error reading from async stream, we will reconnect: ${e}`);
			}
		}
	}

	/**
	 * Starts a legacy SSE attachment, where the SSE response is the session lifetime.
	 * Unlike `_attachStreamableBackchannel`, this fails the server if it disconnects.
	 */
	private async _attachSSE(): Promise<string | undefined> {
		const postEndpoint = new DeferredPromise<string>();
		const headers: Record<string, string> = {
			...Object.fromEntries(this._launch.headers),
			'Accept': 'text/event-stream',
		};
		await this._addAuthHeader(headers);

		let res: CommonResponse;
		try {
			res = await this._fetchWithAuthRetry(
				this._launch.uri.toString(true),
				{
					method: 'GET',
					headers,
				},
				headers
			);
			if (res.status >= 300) {
				this._proxy.$onDidChangeState(this._id, { state: McpConnectionState.Kind.Error, message: `${res.status} status connecting to ${this._launch.uri} as SSE: ${await this._getErrText(res)}` });
				return;
			}
		} catch (e) {
			this._proxy.$onDidChangeState(this._id, { state: McpConnectionState.Kind.Error, message: `Error connecting to ${this._launch.uri} as SSE: ${e}` });
			return;
		}

		const parser = new SSEParser(event => {
			if (event.type === 'message') {
				this._proxy.$onDidReceiveMessage(this._id, event.data);
			} else if (event.type === 'endpoint') {
				postEndpoint.complete(new URL(event.data, this._launch.uri.toString(true)).toString());
			}
		});

		this._register(toDisposable(() => postEndpoint.cancel()));
		this._doSSE(parser, res).catch(err => {
			this._proxy.$onDidChangeState(this._id, { state: McpConnectionState.Kind.Error, message: `Error reading SSE stream: ${String(err)}` });
		});

		return postEndpoint.p;
	}

	/**
	 * Sends a legacy SSE message to the server. The response is always empty and
	 * is otherwise received in {@link _attachSSE}'s loop.
	 */
	private async _sendLegacySSE(url: string, message: string) {
		const asBytes = new TextEncoder().encode(message) as Uint8Array<ArrayBuffer>;
		const headers: Record<string, string> = {
			...Object.fromEntries(this._launch.headers),
			'Content-Type': 'application/json',
			'Content-Length': String(asBytes.length),
		};
		await this._addAuthHeader(headers);
		const res = await this._fetch(url, {
			method: 'POST',
			headers,
			body: asBytes,
		});

		if (res.status >= 300) {
			this._log(LogLevel.Warning, `${res.status} status sending message to ${this._postEndpoint}: ${await this._getErrText(res)}`);
		}
	}

	/** Generic handle to pipe a response into an SSE parser. */
	private async _doSSE(parser: SSEParser, res: CommonResponse) {
		if (!res.body) {
			return;
		}

		const reader = res.body.getReader();
		let chunk: ReadableStreamReadResult<Uint8Array>;
		do {
			try {
				chunk = await raceCancellationError(reader.read(), this._cts.token);
			} catch (err) {
				reader.cancel();
				if (this._store.isDisposed) {
					return;
				} else {
					throw err;
				}
			}

			if (chunk.value) {
				parser.feed(chunk.value);
			}
		} while (!chunk.done);
	}

	private async _addAuthHeader(headers: Record<string, string>) {
		if (this._authMetadata) {
			try {
				const token = await this._proxy.$getTokenFromServerMetadata(this._id, this._authMetadata.authorizationServer, this._authMetadata.serverMetadata, this._authMetadata.resourceMetadata, this._errorOnUserInteraction);
				if (token) {
					headers['Authorization'] = `Bearer ${token}`;
				}
			} catch (e) {
				if (UserInteractionRequiredError.is(e)) {
					this._proxy.$onDidChangeState(this._id, { state: McpConnectionState.Kind.Stopped, reason: 'needs-user-interaction' });
					throw new CancellationError();
				}
				this._log(LogLevel.Warning, `Error getting token from server metadata: ${String(e)}`);
			}
		}
		return headers;
	}

	private _log(level: LogLevel, message: string) {
		if (!this._store.isDisposed) {
			this._proxy.$onDidPublishLog(this._id, level, message);
		}
	}

	private async _getErrText(res: CommonResponse) {
		try {
			return await res.text();
		} catch {
			return res.statusText;
		}
	}

	/**
	 * Helper method to perform fetch with 401 authentication retry logic.
	 * If the initial request returns 401 and we don't have auth metadata,
	 * it will populate the auth metadata and retry once.
	 */
	private async _fetchWithAuthRetry(mcpUrl: string, init: MinimalRequestInit, headers: Record<string, string>): Promise<CommonResponse> {
		const doFetch = () => this._fetch(mcpUrl, init);

		let res = await doFetch();
		if (res.status === 401) {
			if (!this._authMetadata) {
				await this._populateAuthMetadata(mcpUrl, res);
				await this._addAuthHeader(headers);
				if (headers['Authorization']) {
					// Update the headers in the init object
					init.headers = headers;
					res = await doFetch();
				}
			}
		}
		return res;
	}

	private async _fetch(url: string, init: MinimalRequestInit): Promise<CommonResponse> {
		if (canLog(this._logService.getLevel(), LogLevel.Trace)) {
			const traceObj: any = { ...init, headers: { ...init.headers } };
			if (traceObj.body) {
				traceObj.body = new TextDecoder().decode(traceObj.body);
			}
			if (traceObj.headers?.Authorization) {
				traceObj.headers.Authorization = '***'; // don't log the auth header
			}
			this._log(LogLevel.Trace, `Fetching ${url} with options: ${JSON.stringify(traceObj)}`);
		}

		let currentUrl = url;
		let response!: CommonResponse;
		for (let redirectCount = 0; redirectCount < MAX_FOLLOW_REDIRECTS; redirectCount++) {
			response = await this._fetchInternal(currentUrl, {
				...init,
				signal: this._abortCtrl.signal,
				redirect: 'manual'
			});

			// Check for redirect status codes (301, 302, 303, 307, 308)
			if (!REDIRECT_STATUS_CODES.includes(response.status)) {
				break;
			}

			const location = response.headers.get('location');
			if (!location) {
				break;
			}

			const nextUrl = new URL(location, currentUrl).toString();
			this._log(LogLevel.Trace, `Redirect (${response.status}) from ${currentUrl} to ${nextUrl}`);
			currentUrl = nextUrl;
			// Per fetch spec, for 303 always use GET, keep method unless original was POST and 301/302, then GET.
			if (response.status === 303 || ((response.status === 301 || response.status === 302) && init.method === 'POST')) {
				init.method = 'GET';
				delete init.body;
			}
		}

		if (canLog(this._logService.getLevel(), LogLevel.Trace)) {
			const headers: Record<string, string> = {};
			response.headers.forEach((value, key) => { headers[key] = value; });
			this._log(LogLevel.Trace, `Fetched ${currentUrl}: ${JSON.stringify({
				status: response.status,
				headers: headers,
			})}`);
		}

		return response;
	}

	protected _fetchInternal(url: string, init?: CommonRequestInit): Promise<CommonResponse> {
		return fetch(url, init);
	}
}

interface MinimalRequestInit {
	method: string;
	headers: Record<string, string>;
	body?: Uint8Array<ArrayBuffer>;
}

export interface CommonRequestInit extends MinimalRequestInit {
	signal?: AbortSignal;
	redirect?: RequestRedirect;
}

export interface CommonResponse {
	status: number;
	statusText: string;
	headers: Headers;
	body?: ReadableStream | null;
	url: string;
	json(): Promise<any>;
	text(): Promise<string>;
}

function isJSON(str: string): boolean {
	try {
		JSON.parse(str);
		return true;
	} catch (e) {
		return false;
	}
}
