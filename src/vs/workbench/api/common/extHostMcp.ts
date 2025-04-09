/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type * as ES from '@c4312/eventsource-umd';
import * as vscode from 'vscode';
import { importAMDNodeModule } from '../../../amdX.js';
import { DeferredPromise, Sequencer } from '../../../base/common/async.js';
import { CancellationToken } from '../../../base/common/cancellation.js';
import { Lazy } from '../../../base/common/lazy.js';
import { Disposable, DisposableMap, DisposableStore, IDisposable, toDisposable } from '../../../base/common/lifecycle.js';
import { ExtensionIdentifier, IExtensionDescription } from '../../../platform/extensions/common/extensions.js';
import { createDecorator } from '../../../platform/instantiation/common/instantiation.js';
import { StorageScope } from '../../../platform/storage/common/storage.js';
import { extensionPrefixedIdentifier, McpCollectionDefinition, McpConnectionState, McpServerDefinition, McpServerLaunch, McpServerTransportSSE, McpServerTransportType } from '../../contrib/mcp/common/mcpTypes.js';
import { ExtHostMcpShape, MainContext, MainThreadMcpShape } from './extHost.protocol.js';
import { IExtHostRpcService } from './extHostRpcService.js';
import { LogLevel } from '../../../platform/log/common/log.js';

export const IExtHostMpcService = createDecorator<IExtHostMpcService>('IExtHostMpcService');

export interface IExtHostMpcService extends ExtHostMcpShape {
	registerMcpConfigurationProvider(extension: IExtensionDescription, id: string, provider: vscode.McpConfigurationProvider): IDisposable;
}

export class ExtHostMcpService extends Disposable implements IExtHostMpcService {
	protected _proxy: MainThreadMcpShape;
	private readonly _initialProviderPromises = new Set<Promise<void>>();
	private readonly _sseEventSources = this._register(new DisposableMap<number, McpSSEHandle>());
	private readonly _eventSource = new Lazy(async () => {
		const es = await importAMDNodeModule<typeof ES>('@c4312/eventsource-umd', 'dist/index.umd.js');
		return es.EventSource;
	});

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
		if (launch.type === McpServerTransportType.SSE) {
			this._sseEventSources.set(id, new McpSSEHandle(this._eventSource.value, id, launch, this._proxy));
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

	/** {@link vscode.lm.registerMcpConfigurationProvider} */
	public registerMcpConfigurationProvider(extension: IExtensionDescription, id: string, provider: vscode.McpConfigurationProvider): IDisposable {
		const store = new DisposableStore();

		const metadata = extension.contributes?.modelContextServerCollections?.find(m => m.id === id);
		if (!metadata) {
			throw new Error(`MCP configuration providers must be registered in the contributes.modelContextServerCollections array within your package.json, but "${id}" was not`);
		}

		const mcp: McpCollectionDefinition.FromExtHost = {
			id: extensionPrefixedIdentifier(extension.identifier, id),
			isTrustedByDefault: true,
			label: metadata?.label ?? extension.displayName ?? extension.name,
			scope: StorageScope.WORKSPACE
		};

		const update = async () => {

			const list = await provider.provideMcpServerDefinitions(CancellationToken.None);

			function isSSEConfig(candidate: vscode.McpServerDefinition): candidate is vscode.McpSSEServerDefinition {
				return !!(candidate as vscode.McpSSEServerDefinition).uri;
			}

			const servers: McpServerDefinition[] = [];

			for (const item of list ?? []) {
				servers.push({
					id: ExtensionIdentifier.toKey(extension.identifier),
					label: item.label,
					launch: isSSEConfig(item)
						? {
							type: McpServerTransportType.SSE,
							uri: item.uri,
							headers: item.headers,
						}
						: {
							type: McpServerTransportType.Stdio,
							cwd: item.cwd,
							args: item.args,
							command: item.command,
							env: item.env,
							envFile: undefined,
						}
				});
			}

			this._proxy.$upsertMcpCollection(mcp, servers);
		};

		store.add(toDisposable(() => {
			this._proxy.$deleteMcpCollection(mcp.id);
		}));

		if (provider.onDidChange) {
			store.add(provider.onDidChange(update));
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

class McpSSEHandle extends Disposable {
	private readonly _requestSequencer = new Sequencer();
	private readonly _postEndpoint = new DeferredPromise<string>();
	constructor(
		eventSourceCtor: Promise<typeof ES.EventSource>,
		private readonly _id: number,
		launch: McpServerTransportSSE,
		private readonly _proxy: MainThreadMcpShape
	) {
		super();
		eventSourceCtor.then(EventSourceCtor => this._attach(EventSourceCtor, launch));
	}

	private _attach(EventSourceCtor: typeof ES.EventSource, launch: McpServerTransportSSE) {
		if (this._store.isDisposed) {
			return;
		}

		const eventSource = new EventSourceCtor(launch.uri.toString(), {
			// recommended way to do things https://github.com/EventSource/eventsource?tab=readme-ov-file#setting-http-request-headers
			fetch: (input, init) =>
				fetch(input, {
					...init,
					headers: {
						...Object.fromEntries(launch.headers),
						...init?.headers,
					},
				}).then(async res => {
					// we get more details on failure at this point, so handle it explicitly:
					if (res.status >= 300) {
						this._proxy.$onDidChangeState(this._id, { state: McpConnectionState.Kind.Error, message: `${res.status} status connecting to ${launch.uri}: ${await this._getErrText(res)}` });
						eventSource.close();
					}
					return res;
				}, err => {
					this._proxy.$onDidChangeState(this._id, { state: McpConnectionState.Kind.Error, message: `Error connecting to ${launch.uri}: ${String(err)}` });

					eventSource.close();
					return Promise.reject(err);
				})
		});

		this._register(toDisposable(() => eventSource.close()));

		// https://github.com/modelcontextprotocol/typescript-sdk/blob/0fa2397174eba309b54575294d56754c52b13a65/src/server/sse.ts#L52
		eventSource.addEventListener('endpoint', e => {
			this._postEndpoint.complete(new URL(e.data, launch.uri.toString()).toString());
		});

		// https://github.com/modelcontextprotocol/typescript-sdk/blob/0fa2397174eba309b54575294d56754c52b13a65/src/server/sse.ts#L133
		eventSource.addEventListener('message', e => {
			this._proxy.$onDidReceiveMessage(this._id, e.data);
		});

		eventSource.addEventListener('open', () => {
			this._proxy.$onDidChangeState(this._id, { state: McpConnectionState.Kind.Running });
		});

		eventSource.addEventListener('error', (err) => {
			this._postEndpoint.cancel();
			this._proxy.$onDidChangeState(this._id, {
				state: McpConnectionState.Kind.Error,
				message: `Error connecting to ${launch.uri}: ${err.code || 0} ${err.message || JSON.stringify(err)}`,
			});
			eventSource.close();
		});
	}

	async send(message: string) {
		// only the sending of the request needs to be sequenced
		try {
			const res = await this._requestSequencer.queue(async () => {
				const endpoint = await this._postEndpoint.p;
				const asBytes = new TextEncoder().encode(message);

				return fetch(endpoint, {
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
						'Content-Length': String(asBytes.length),
					},
					body: asBytes,
				});
			});

			if (res.status >= 300) {
				this._proxy.$onDidPublishLog(this._id, LogLevel.Warning, `${res.status} status sending message to ${this._postEndpoint}: ${await this._getErrText(res)}`);
			}
		} catch (err) {
			// ignored
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
