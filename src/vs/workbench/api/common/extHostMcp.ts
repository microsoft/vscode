/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { DeferredPromise, raceCancellationError, Sequencer, timeout } from '../../../base/common/async.js';
import { CancellationToken, CancellationTokenSource } from '../../../base/common/cancellation.js';
import { Disposable, DisposableMap, DisposableStore, IDisposable, toDisposable } from '../../../base/common/lifecycle.js';
import { SSEParser } from '../../../base/common/sseParser.js';
import { ExtensionIdentifier, IExtensionDescription } from '../../../platform/extensions/common/extensions.js';
import { createDecorator } from '../../../platform/instantiation/common/instantiation.js';
import { LogLevel } from '../../../platform/log/common/log.js';
import { StorageScope } from '../../../platform/storage/common/storage.js';
import { extensionPrefixedIdentifier, McpCollectionDefinition, McpConnectionState, McpServerDefinition, McpServerLaunch, McpServerTransportHTTP, McpServerTransportType } from '../../contrib/mcp/common/mcpTypes.js';
import { ExtHostMcpShape, MainContext, MainThreadMcpShape } from './extHost.protocol.js';
import { IExtHostRpcService } from './extHostRpcService.js';
import * as Convert from './extHostTypeConverters.js';

export const IExtHostMpcService = createDecorator<IExtHostMpcService>('IExtHostMpcService');

export interface IExtHostMpcService extends ExtHostMcpShape {
	registerMcpConfigurationProvider(extension: IExtensionDescription, id: string, provider: vscode.McpServerDefinitionProvider): IDisposable;
}

export class ExtHostMcpService extends Disposable implements IExtHostMpcService {
	protected _proxy: MainThreadMcpShape;
	private readonly _initialProviderPromises = new Set<Promise<void>>();
	private readonly _sseEventSources = this._register(new DisposableMap<number, McpHTTPHandle>());
	private readonly _unresolvedMcpServers = new Map</* collectionId */ string, {
		provider: vscode.McpServerDefinitionProvider;
		servers: vscode.McpServerDefinition[];
	}>();

	constructor(
		@IExtHostRpcService extHostRpc: IExtHostRpcService,
	) {
		super();
		this._proxy = extHostRpc.getProxy(MainContext.MainThreadMcp);
	}

	$startMcp(id: number, launch: McpServerLaunch.Serialized): void {
		this._startMcp(id, McpServerLaunch.fromSerialized(launch));
	}

	protected _startMcp(id: number, launch: McpServerLaunch): void {
		if (launch.type === McpServerTransportType.HTTP) {
			this._sseEventSources.set(id, new McpHTTPHandle(id, launch, this._proxy));
			return;
		}

		throw new Error('not implemented');
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

		const metadata = extension.contributes?.modelContextServerCollections?.find(m => m.id === id);
		if (!metadata) {
			throw new Error(`MCP configuration providers must be registered in the contributes.modelContextServerCollections array within your package.json, but "${id}" was not`);
		}

		const mcp: McpCollectionDefinition.FromExtHost = {
			id: extensionPrefixedIdentifier(extension.identifier, id),
			isTrustedByDefault: true,
			label: metadata?.label ?? extension.displayName ?? extension.name,
			scope: StorageScope.WORKSPACE,
			canResolveLaunch: typeof provider.resolveMcpServerDefinition === 'function',
			extensionId: extension.identifier.value,
		};

		const update = async () => {
			const list = await provider.provideMcpServerDefinitions(CancellationToken.None);
			this._unresolvedMcpServers.set(mcp.id, { servers: list ?? [], provider });

			const servers: McpServerDefinition.Serialized[] = [];
			for (const item of list ?? []) {
				servers.push({
					id: ExtensionIdentifier.toKey(extension.identifier),
					label: item.label,
					cacheNonce: item.version,
					launch: Convert.McpServerDefinition.from(item)
				});
			}

			this._proxy.$upsertMcpCollection(mcp, servers);
		};

		store.add(toDisposable(() => {
			this._unresolvedMcpServers.delete(mcp.id);
			this._proxy.$deleteMcpCollection(mcp.id);
		}));

		if (provider.onDidChangeServerDefinitions) {
			store.add(provider.onDidChangeServerDefinitions(update));
		}
		// todo@connor4312: proposed API back-compat
		if ((provider as any).onDidChange) {
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

/**
 * Implementation of both MCP HTTP Streaming as well as legacy SSE.
 *
 * The first request will POST to the endpoint, assuming HTTP streaming. If the
 * server is legacy SSE, it should return some 4xx status in that case,
 * and we'll automatically fall back to SSE and res
 */
class McpHTTPHandle extends Disposable {
	private readonly _requestSequencer = new Sequencer();
	private readonly _postEndpoint = new DeferredPromise<{ url: string; transport: McpServerTransportHTTP }>();
	private _mode: HttpModeT = { value: HttpMode.Unknown };
	private readonly _cts = new CancellationTokenSource();
	private readonly _abortCtrl = new AbortController();

	constructor(
		private readonly _id: number,
		private readonly _launch: McpServerTransportHTTP,
		private readonly _proxy: MainThreadMcpShape
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
			await this._requestSequencer.queue(() => {
				if (this._mode.value === HttpMode.SSE) {
					return this._sendLegacySSE(this._mode.endpoint, message);
				} else {
					return this._sendStreamableHttp(message, this._mode.value === HttpMode.Http ? this._mode.sessionId : undefined);
				}
			});
		} catch (err) {
			const msg = `Error sending message to ${this._launch.uri}: ${String(err)}`;
			this._proxy.$onDidChangeState(this._id, { state: McpConnectionState.Kind.Error, message: msg });
		}
	}

	/**
	 * Sends a streamable-HTTP request.
	 * 1. Posts to the endpoint
	 * 2. Updates internal state as needed. Falls back to SSE if appropriate.
	 * 3. If the response body is empty, JSON, or a JSON stream, handle it appropriately.
	 */
	private async _sendStreamableHttp(message: string, sessionId: string | undefined) {
		const asBytes = new TextEncoder().encode(message);
		const headers: Record<string, string> = {
			...Object.fromEntries(this._launch.headers),
			'Content-Type': 'application/json',
			'Content-Length': String(asBytes.length),
			Accept: 'text/event-stream, application/json',
		};
		if (sessionId) {
			headers['Mcp-Session-Id'] = sessionId;
		}

		const res = await fetch(this._launch.uri.toString(true), {
			method: 'POST',
			signal: this._abortCtrl.signal,
			headers,
			body: asBytes,
		});

		const wasUnknown = this._mode.value === HttpMode.Unknown;

		// Mcp-Session-Id is the strongest signal that we're in streamable HTTP mode
		const nextSessionId = res.headers.get('Mcp-Session-Id');
		if (nextSessionId) {
			this._mode = { value: HttpMode.Http, sessionId: nextSessionId };
		}

		if (this._mode.value === HttpMode.Unknown && res.status >= 400 && res.status < 500) {
			this._log(LogLevel.Info, `${res.status} status sending message to ${this._launch.uri}, will attempt to fall back to legacy SSE`);
			const endpoint = await this._attachSSE();
			if (endpoint) {
				this._mode = { value: HttpMode.SSE, endpoint };
				await this._sendLegacySSE(endpoint, message);
			}
			return;
		}

		if (res.status >= 300) {
			this._log(LogLevel.Warning, `${res.status} status sending message to ${this._launch.uri}: ${await this._getErrText(res)}`);
			return;
		}

		if (this._mode.value === HttpMode.Unknown) {
			this._mode = { value: HttpMode.Http, sessionId: undefined };
		}
		if (wasUnknown) {
			this._attachStreamableBackchannel();
		}

		// Not awaited, we don't need to block the sequencer while we read the response
		this._handleSuccessfulStreamableHttp(res);
	}

	private async _handleSuccessfulStreamableHttp(res: Response) {
		if (res.status === 202) {
			return; // no body
		}

		switch (res.headers.get('Content-Type')?.toLowerCase()) {
			case 'text/event-stream': {
				const parser = new SSEParser(event => {
					if (event.type === 'message') {
						this._proxy.$onDidReceiveMessage(this._id, event.data);
					}
				});

				try {
					await this._doSSE(parser, res);
				} catch (err) {
					this._log(LogLevel.Warning, `Error reading SSE stream: ${String(err)}`);
				}
				break;
			}
			case 'application/json':
				this._proxy.$onDidReceiveMessage(this._id, await res.text());
				break;
			default: {
				const responseBody = await res.text();
				if (isJSON(responseBody)) { // try to read as JSON even if the server didn't set the content type
					this._proxy.$onDidReceiveMessage(this._id, responseBody);
				} else {
					this._log(LogLevel.Warning, `Unexpected ${res.status} response for request: ${responseBody}`);
				}
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

			let res: Response;
			try {
				const headers: Record<string, string> = {
					...Object.fromEntries(this._launch.headers),
					'Accept': 'text/event-stream',
				};

				if (this._mode.value === HttpMode.Http && this._mode.sessionId !== undefined) {
					headers['Mcp-Session-Id'] = this._mode.sessionId;
				}
				if (lastEventId) {
					headers['Last-Event-ID'] = lastEventId;
				}

				res = await fetch(this._launch.uri.toString(true), {
					method: 'GET',
					signal: this._abortCtrl.signal,
					headers,
				});
			} catch (e) {
				this._log(LogLevel.Info, `Error connecting to ${this._launch.uri} for async notifications, will retry`);
				continue;
			}

			if (res.status >= 400) {
				this._log(LogLevel.Debug, `${res.status} status connecting to ${this._launch.uri} for async notifications; they will be disabled: ${await this._getErrText(res)}`);
				return;
			}

			retry = 0;

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

		let res: Response;
		try {
			res = await fetch(this._launch.uri.toString(true), {
				method: 'GET',
				signal: this._abortCtrl.signal,
				headers: {
					...Object.fromEntries(this._launch.headers),
					'Accept': 'text/event-stream',
				},
			});
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
		const asBytes = new TextEncoder().encode(message);
		const res = await fetch(url, {
			method: 'POST',
			signal: this._abortCtrl.signal,
			headers: {
				...Object.fromEntries(this._launch.headers),
				'Content-Type': 'application/json',
				'Content-Length': String(asBytes.length),
			},
			body: asBytes,
		});

		if (res.status >= 300) {
			this._log(LogLevel.Warning, `${res.status} status sending message to ${this._postEndpoint}: ${await this._getErrText(res)}`);
		}
	}

	/** Generic handle to pipe a response into an SSE parser. */
	private async _doSSE(parser: SSEParser, res: Response) {
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

	private _log(level: LogLevel, message: string) {
		if (!this._store.isDisposed) {
			this._proxy.$onDidPublishLog(this._id, level, message);
		}
	}

	private async _getErrText(res: Response) {
		try {
			return await res.text();
		} catch {
			return res.statusText;
		}
	}
}

function isJSON(str: string): boolean {
	try {
		JSON.parse(str);
		return true;
	} catch (e) {
		return false;
	}
}
