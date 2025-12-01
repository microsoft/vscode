/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { DeferredPromise, raceCancellationError, Sequencer, timeout } from '../../../base/common/async.js';
import { CancellationToken, CancellationTokenSource } from '../../../base/common/cancellation.js';
import { CancellationError } from '../../../base/common/errors.js';
import { Disposable, DisposableMap, DisposableStore, IDisposable, toDisposable } from '../../../base/common/lifecycle.js';
import { AUTH_SCOPE_SEPARATOR, fetchAuthorizationServerMetadata, fetchResourceMetadata, getDefaultMetadataForUrl, IAuthorizationProtectedResourceMetadata, IAuthorizationServerMetadata, parseWWWAuthenticateHeader, scopesMatch } from '../../../base/common/oauth.js';
import { SSEParser } from '../../../base/common/sseParser.js';
import { URI, UriComponents } from '../../../base/common/uri.js';
import { vArray, vNumber, vObj, vObjAny, vOptionalProp, vString } from '../../../base/common/validation.js';
import { ConfigurationTarget } from '../../../platform/configuration/common/configuration.js';
import { ExtensionIdentifier, IExtensionDescription } from '../../../platform/extensions/common/extensions.js';
import { createDecorator } from '../../../platform/instantiation/common/instantiation.js';
import { canLog, ILogService, LogLevel } from '../../../platform/log/common/log.js';
import product from '../../../platform/product/common/product.js';
import { StorageScope } from '../../../platform/storage/common/storage.js';
import { extensionPrefixedIdentifier, McpCollectionDefinition, McpConnectionState, McpServerDefinition, McpServerLaunch, McpServerStaticMetadata, McpServerStaticToolAvailability, McpServerTransportHTTP, McpServerTransportType, UserInteractionRequiredError } from '../../contrib/mcp/common/mcpTypes.js';
import { MCP } from '../../contrib/mcp/common/modelContextProtocol.js';
import { checkProposedApiEnabled, isProposedApiEnabled } from '../../services/extensions/common/extensions.js';
import { ExtHostMcpShape, IMcpAuthenticationDetails, IStartMcpOptions, MainContext, MainThreadMcpShape } from './extHost.protocol.js';
import { IExtHostInitDataService } from './extHostInitDataService.js';
import { IExtHostRpcService } from './extHostRpcService.js';
import * as Convert from './extHostTypeConverters.js';
import { McpHttpServerDefinition, McpStdioServerDefinition, McpToolAvailability } from './extHostTypes.js';
import { IExtHostVariableResolverProvider } from './extHostVariableResolverService.js';
import { IExtHostWorkspace } from './extHostWorkspace.js';

export const IExtHostMpcService = createDecorator<IExtHostMpcService>('IExtHostMpcService');

export interface IExtHostMpcService extends ExtHostMcpShape {
	registerMcpConfigurationProvider(extension: IExtensionDescription, id: string, provider: vscode.McpServerDefinitionProvider): IDisposable;
}

const serverDataValidation = vObj({
	label: vString(),
	version: vOptionalProp(vString()),
	metadata: vOptionalProp(vObj({
		capabilities: vOptionalProp(vObjAny()),
		serverInfo: vOptionalProp(vObjAny()),
		tools: vOptionalProp(vArray(vObj({
			availability: vNumber(),
			definition: vObjAny(),
		}))),
	})),
	authentication: vOptionalProp(vObj({
		providerId: vString(),
		scopes: vArray(vString()),
	}))
});

// Can be validated with:
// declare const _serverDataValidationTest: vscode.McpStdioServerDefinition | vscode.McpHttpServerDefinition;
// const _serverDataValidationProd: ValidatorType<typeof serverDataValidation> = _serverDataValidationTest;

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
		this._sseEventSources.get(id)
			?.close()
			.then(() => this._didClose(id));
	}

	private _didClose(id: number) {
		this._sseEventSources.deleteAndDispose(id);
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

				serverDataValidation.validateOrThrow(item);
				if ((item as vscode.McpHttpServerDefinition2).authentication) {
					checkProposedApiEnabled(extension, 'mcpToolDefinitions');
				}

				let staticMetadata: McpServerStaticMetadata | undefined;
				const castAs2 = item as McpStdioServerDefinition | McpHttpServerDefinition;
				if (isProposedApiEnabled(extension, 'mcpToolDefinitions') && castAs2.metadata) {
					staticMetadata = {
						capabilities: castAs2.metadata.capabilities as MCP.ServerCapabilities,
						instructions: castAs2.metadata.instructions,
						serverInfo: castAs2.metadata.serverInfo as MCP.Implementation,
						tools: castAs2.metadata.tools?.map(t => ({
							availability: t.availability === McpToolAvailability.Dynamic ? McpServerStaticToolAvailability.Dynamic : McpServerStaticToolAvailability.Initial,
							definition: t.definition as MCP.Tool,
						})),
					};
				}

				servers.push({
					id,
					label: item.label,
					cacheNonce: item.version || '$$NONE',
					staticMetadata,
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
	private _authMetadata?: AuthMetadata;
	private _didSendClose = false;

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

	async close() {
		if (this._mode.value === HttpMode.Http && this._mode.sessionId && !this._didSendClose) {
			this._didSendClose = true;
			try {
				await this._closeSession(this._mode.sessionId);
			} catch {
				// ignored -- already logged
			}
		}

		this._proxy.$onDidChangeState(this._id, { state: McpConnectionState.Kind.Stopped });
	}

	private async _closeSession(sessionId: string) {
		const headers: Record<string, string> = {
			...Object.fromEntries(this._launch.headers),
			'Mcp-Session-Id': sessionId,
		};

		await this._addAuthHeader(headers);

		// no fetch with retry here -- don't try to auth if we get an auth failure
		await this._fetch(
			this._launch.uri.toString(true),
			{
				method: 'DELETE',
				headers,
			},
		);
	}

	private _send(message: string) {
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
			// ...except for auth errors
			&& !isAuthStatusCode(res.status)
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
		let canReconnectAt: number | undefined;
		for (let retry = 0; !this._store.isDisposed; retry++) {
			if (canReconnectAt !== undefined) {
				await timeout(Math.max(0, canReconnectAt - Date.now()), this._cts.token);
				canReconnectAt = undefined;
			} else {
				await timeout(Math.min(retry * 1000, 30_000), this._cts.token);
			}

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
				if (event.retry) {
					canReconnectAt = Date.now() + event.retry;
				}
				if (event.type === 'message' && event.data) {
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

	private async _addAuthHeader(headers: Record<string, string>, forceNewRegistration?: boolean) {
		if (this._authMetadata) {
			try {
				const authDetails: IMcpAuthenticationDetails = {
					authorizationServer: this._authMetadata.authorizationServer.toJSON(),
					authorizationServerMetadata: this._authMetadata.serverMetadata,
					resourceMetadata: this._authMetadata.resourceMetadata,
					scopes: this._authMetadata.scopes
				};
				const token = await this._proxy.$getTokenFromServerMetadata(
					this._id,
					authDetails,
					{
						errorOnUserInteraction: this._errorOnUserInteraction,
						forceNewRegistration
					});
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
		if (this._launch.authentication) {
			try {
				this._log(LogLevel.Debug, `Using provided authentication config: providerId=${this._launch.authentication.providerId}, scopes=${this._launch.authentication.scopes.join(', ')}`);
				const token = await this._proxy.$getTokenForProviderId(
					this._id,
					this._launch.authentication.providerId,
					this._launch.authentication.scopes,
					{
						errorOnUserInteraction: this._errorOnUserInteraction,
						forceNewRegistration
					}
				);
				if (token) {
					headers['Authorization'] = `Bearer ${token}`;
					this._log(LogLevel.Info, 'Successfully obtained token from provided authentication config');
				}
			} catch (e) {
				if (UserInteractionRequiredError.is(e)) {
					this._proxy.$onDidChangeState(this._id, { state: McpConnectionState.Kind.Stopped, reason: 'needs-user-interaction' });
					throw new CancellationError();
				}
				this._log(LogLevel.Warning, `Error getting token from provided authentication config: ${String(e)}`);
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
	 * Helper method to perform fetch with authentication retry logic.
	 * If the initial request returns an auth error and we don't have auth metadata,
	 * it will populate the auth metadata and retry once.
	 * If we already have auth metadata, check if the scopes changed and update them.
	 */
	private async _fetchWithAuthRetry(mcpUrl: string, init: MinimalRequestInit, headers: Record<string, string>): Promise<CommonResponse> {
		const doFetch = () => this._fetch(mcpUrl, init);

		let res = await doFetch();
		if (isAuthStatusCode(res.status)) {
			if (!this._authMetadata) {
				this._authMetadata = await createAuthMetadata(mcpUrl, res, {
					launchHeaders: this._launch.headers,
					fetch: (url, init) => this._fetch(url, init as MinimalRequestInit),
					log: (level, message) => this._log(level, message)
				});
				await this._addAuthHeader(headers);
				if (headers['Authorization']) {
					// Update the headers in the init object
					init.headers = headers;
					res = await doFetch();
				}
			} else {
				// We have auth metadata, but got an auth error. Check if the scopes changed.
				if (this._authMetadata.update(res)) {
					await this._addAuthHeader(headers);
					if (headers['Authorization']) {
						// Update the headers in the init object
						init.headers = headers;
						res = await doFetch();
					}
				}
			}
		}
		// If we have an Authorization header and still get an auth error, we should retry with a new auth registration
		if (headers['Authorization'] && isAuthStatusCode(res.status)) {
			const errorText = await this._getErrText(res);
			this._log(LogLevel.Debug, `Received ${res.status} status with Authorization header, retrying with new auth registration. Error details: ${errorText || 'no additional details'}`);
			await this._addAuthHeader(headers, true);
			res = await doFetch();
		}
		return res;
	}

	private async _fetch(url: string, init: MinimalRequestInit): Promise<CommonResponse> {
		init.headers['user-agent'] = `${product.nameLong}/${product.version}`;

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

function isAuthStatusCode(status: number): boolean {
	return status === 401 || status === 403;
}


//#region AuthMetadata

/**
 * Logger callback type for AuthMetadata operations.
 */
export type AuthMetadataLogger = (level: LogLevel, message: string) => void;

/**
 * Interface for authentication metadata that can be updated when scopes change.
 */
export interface IAuthMetadata {
	readonly authorizationServer: URI;
	readonly serverMetadata: IAuthorizationServerMetadata;
	readonly resourceMetadata: IAuthorizationProtectedResourceMetadata | undefined;
	readonly scopes: string[] | undefined;

	/**
	 * Updates the scopes based on the WWW-Authenticate header in the response.
	 * @param response The HTTP response containing potential scope challenges
	 * @returns true if scopes were updated, false otherwise
	 */
	update(response: CommonResponse): boolean;
}

/**
 * Concrete implementation of IAuthMetadata that manages OAuth authentication metadata.
 * Consumers should use {@link createAuthMetadata} to create instances.
 */
class AuthMetadata implements IAuthMetadata {
	private _scopes: string[] | undefined;

	constructor(
		public readonly authorizationServer: URI,
		public readonly serverMetadata: IAuthorizationServerMetadata,
		public readonly resourceMetadata: IAuthorizationProtectedResourceMetadata | undefined,
		scopes: string[] | undefined,
		private readonly _log: AuthMetadataLogger,
	) {
		this._scopes = scopes;
	}

	get scopes(): string[] | undefined {
		return this._scopes;
	}

	update(response: CommonResponse): boolean {
		const scopesChallenge = this._parseScopesFromResponse(response);
		if (!scopesMatch(scopesChallenge, this._scopes)) {
			this._log(LogLevel.Debug, `Scopes changed from ${JSON.stringify(this._scopes)} to ${JSON.stringify(scopesChallenge)}, updating`);
			this._scopes = scopesChallenge;
			return true;
		}
		return false;
	}

	private _parseScopesFromResponse(response: CommonResponse): string[] | undefined {
		if (!response.headers.has('WWW-Authenticate')) {
			return undefined;
		}

		const authHeader = response.headers.get('WWW-Authenticate')!;
		const challenges = parseWWWAuthenticateHeader(authHeader);
		for (const challenge of challenges) {
			if (challenge.scheme === 'Bearer' && challenge.params['scope']) {
				const scopes = challenge.params['scope'].split(AUTH_SCOPE_SEPARATOR).filter(s => s.trim().length);
				if (scopes.length) {
					this._log(LogLevel.Debug, `Found scope challenge in WWW-Authenticate header: ${challenge.params['scope']}`);
					return scopes;
				}
			}
		}
		return undefined;
	}
}

/**
 * Options for creating AuthMetadata.
 */
export interface ICreateAuthMetadataOptions {
	/** Headers to include when fetching metadata from the same origin as the MCP server */
	launchHeaders: Iterable<readonly [string, string]>;
	/** Fetch function to use for HTTP requests */
	fetch: (url: string, init: MinimalRequestInit) => Promise<CommonResponse>;
	/** Logger function for diagnostic output */
	log: AuthMetadataLogger;
}

/**
 * Creates an AuthMetadata instance by discovering OAuth metadata from the server.
 *
 * This function:
 * 1. Parses the WWW-Authenticate header for resource_metadata and scope challenges
 * 2. Fetches OAuth protected resource metadata from well-known URIs or the challenge URL
 * 3. Fetches authorization server metadata
 * 4. Falls back to default metadata if discovery fails
 *
 * @param mcpUrl The MCP server URL
 * @param originalResponse The original HTTP response that triggered auth (typically 401/403)
 * @param options Configuration options including headers, fetch function, and logger
 * @returns A new AuthMetadata instance
 */
export async function createAuthMetadata(
	mcpUrl: string,
	originalResponse: CommonResponse,
	options: ICreateAuthMetadataOptions
): Promise<AuthMetadata> {
	const { launchHeaders, fetch, log } = options;

	// Parse the WWW-Authenticate header for resource_metadata and scope challenges
	const { resourceMetadataChallenge, scopesChallenge: scopesChallengeFromHeader } = parseWWWAuthenticateHeaderForChallenges(originalResponse, log);

	// Fetch the resource metadata either from the challenge URL or from well-known URIs
	let serverMetadataUrl: string | undefined;
	let resource: IAuthorizationProtectedResourceMetadata | undefined;
	let scopesChallenge = scopesChallengeFromHeader;

	try {
		const resourceMetadata = await fetchResourceMetadata(mcpUrl, resourceMetadataChallenge, {
			sameOriginHeaders: {
				...Object.fromEntries(launchHeaders),
				'MCP-Protocol-Version': MCP.LATEST_PROTOCOL_VERSION
			},
			fetch: (url, init) => fetch(url, init as MinimalRequestInit)
		});
		// TODO:@TylerLeonhardt support multiple authorization servers
		// Consider using one that has an auth provider first, over the dynamic flow
		serverMetadataUrl = resourceMetadata.authorization_servers?.[0];
		log(LogLevel.Debug, `Using auth server metadata url: ${serverMetadataUrl}`);
		scopesChallenge ??= resourceMetadata.scopes_supported;
		resource = resourceMetadata;
	} catch (e) {
		log(LogLevel.Warning, `Could not fetch resource metadata: ${String(e)}`);
	}

	const baseUrl = new URL(originalResponse.url).origin;

	// If we are not given a resource_metadata, see if the well-known server metadata is available
	// on the base url.
	let additionalHeaders: Record<string, string> = {};
	if (!serverMetadataUrl) {
		serverMetadataUrl = baseUrl;
		// Maintain the launch headers when talking to the MCP origin.
		additionalHeaders = {
			...Object.fromEntries(launchHeaders),
			'MCP-Protocol-Version': MCP.LATEST_PROTOCOL_VERSION
		};
	}

	try {
		log(LogLevel.Debug, `Fetching auth server metadata for: ${serverMetadataUrl} ...`);
		const serverMetadataResponse = await fetchAuthorizationServerMetadata(serverMetadataUrl, {
			additionalHeaders,
			fetch: (url, init) => fetch(url, init as MinimalRequestInit)
		});
		log(LogLevel.Info, 'Populated auth metadata');
		return new AuthMetadata(
			URI.parse(serverMetadataUrl),
			serverMetadataResponse,
			resource,
			scopesChallenge,
			log
		);
	} catch (e) {
		log(LogLevel.Warning, `Error populating auth server metadata for ${serverMetadataUrl}: ${String(e)}`);
	}

	// If there's no well-known server metadata, then use the default values based off of the url.
	const defaultMetadata = getDefaultMetadataForUrl(new URL(baseUrl));
	log(LogLevel.Info, 'Using default auth metadata');
	return new AuthMetadata(
		URI.parse(baseUrl),
		defaultMetadata,
		resource,
		scopesChallenge,
		log
	);
}

/**
 * Parses the WWW-Authenticate header for resource_metadata and scope challenges.
 */
function parseWWWAuthenticateHeaderForChallenges(
	response: CommonResponse,
	log: AuthMetadataLogger
): { resourceMetadataChallenge: string | undefined; scopesChallenge: string[] | undefined } {
	let resourceMetadataChallenge: string | undefined;
	let scopesChallenge: string[] | undefined;

	if (response.headers.has('WWW-Authenticate')) {
		const authHeader = response.headers.get('WWW-Authenticate')!;
		const challenges = parseWWWAuthenticateHeader(authHeader);
		for (const challenge of challenges) {
			if (challenge.scheme === 'Bearer') {
				if (!resourceMetadataChallenge && challenge.params['resource_metadata']) {
					resourceMetadataChallenge = challenge.params['resource_metadata'];
					log(LogLevel.Debug, `Found resource_metadata challenge in WWW-Authenticate header: ${resourceMetadataChallenge}`);
				}
				if (!scopesChallenge && challenge.params['scope']) {
					const scopes = challenge.params['scope'].split(AUTH_SCOPE_SEPARATOR).filter(s => s.trim().length);
					if (scopes.length) {
						log(LogLevel.Debug, `Found scope challenge in WWW-Authenticate header: ${challenge.params['scope']}`);
						scopesChallenge = scopes;
					}
				}
				if (resourceMetadataChallenge && scopesChallenge) {
					break;
				}
			}
		}
	}
	return { resourceMetadataChallenge, scopesChallenge };
}

//#endregion
