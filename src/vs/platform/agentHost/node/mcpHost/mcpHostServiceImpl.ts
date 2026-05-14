/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import {
	IJsonRpcNotification,
	IJsonRpcRequest,
	JsonRpcMessage,
	isJsonRpcErrorResponse,
	isJsonRpcSuccessResponse,
} from '../../../../base/common/jsonRpcProtocol.js';
import { Disposable, IDisposable } from '../../../../base/common/lifecycle.js';
import { ResourceMap } from '../../../../base/common/map.js';
import { equals } from '../../../../base/common/objects.js';
import { IObservable, observableValue } from '../../../../base/common/observable.js';
import { URI } from '../../../../base/common/uri.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { IMcpServerDefinition } from '../../../agentPlugins/common/pluginParsers.js';
import { ILogService, ILogger } from '../../../log/common/log.js';
import { McpServerType } from '../../../mcp/common/mcpPlatformTypes.js';
import {
	IMcpHostService,
	IMcpHostUpstreamDelegate,
	IMcpServerHandle,
	IMcpUiToolMeta,
} from '../../common/mcpHost/mcpHostService.js';
import { buildMcpServerUri } from '../../common/state/mcpServerUri.js';
import { JsonRpcErrorCodes } from '../../common/state/protocol/errors.js';
import { McpMethodCallParams, McpMethodCallResult, McpNotificationParams } from '../../common/state/protocol/commands.js';
import {
	AhpMcpUiHostCapabilities,
	McpServerStatus,
	McpServerStatusKind,
	McpServerSummary,
} from '../../common/state/protocol/state.js';
import { ProtocolError } from '../../common/state/sessionProtocol.js';
import { AgentHostStateManager } from '../agentHostStateManager.js';
import { McpHttpUpstream } from './mcpHttpUpstream.js';
import { McpAppsInitializeInjector } from './mcpInitializeInjector.js';
import { McpStdioUpstream } from './mcpStdioUpstream.js';
import { IMcpProxy, IMcpProxyFactory, IMcpProxyOptions } from './mcpProxy.js';
import type { IUpstreamRequestOutcome } from './mcpProxyRoute.js';
import { IMcpUpstream } from './mcpUpstream.js';

/** Internal state of an {@link Entry} — disposed entries refuse new mutations. */
const enum EntryLifecycle {
	Live = 0,
	Disposed = 1,
}

/**
 * Per-`(session, server)` entry. Owns the upstream + proxy and exposes
 * the {@link IMcpServerHandle} surface back to {@link McpHostServiceImpl}.
 */
class Entry extends Disposable implements IMcpServerHandle {

	private readonly _summary;
	public readonly summary: IObservable<McpServerSummary>;

	private readonly _endpoint;
	public readonly endpoint: IObservable<URI | undefined>;

	private _proxy: IMcpProxy | undefined;
	private _lifecycle: EntryLifecycle = EntryLifecycle.Live;

	constructor(
		public readonly session: URI,
		public readonly definition: IMcpServerDefinition,
		public readonly resource: URI,
		initialStatus: McpServerStatus,
		private readonly _logService: ILogService,
	) {
		super();
		this._summary = observableValue<McpServerSummary>(this, {
			resource: resource.toString(),
			label: definition.name,
			status: initialStatus,
		});
		this.summary = this._summary;
		this._endpoint = observableValue<URI | undefined>(this, undefined);
		this.endpoint = this._endpoint;
	}

	public get isDisposed(): boolean {
		return this._lifecycle === EntryLifecycle.Disposed;
	}

	public override dispose(): void {
		this._lifecycle = EntryLifecycle.Disposed;
		super.dispose();
	}

	public registerUpstream(upstream: IMcpUpstream): void {
		this._register(upstream);
	}

	public setProxy(proxy: IMcpProxy): void {
		this._proxy = this._register(proxy);
		this._endpoint.set(proxy.endpoint, undefined);
		this._logService.info(`[McpHostService] proxy ready for '${this.resource.toString()}' → ${proxy.endpoint?.toString() ?? '<no endpoint>'}`);
	}

	public setStatus(status: McpServerStatus): void {
		const current = this._summary.get();
		if (current.status === status) {
			return;
		}
		this._summary.set({ ...current, status }, undefined);
	}

	public async authenticate(resource: string, token: string): Promise<boolean> {
		if (!this._proxy) {
			return false;
		}
		return this._proxy.authenticate(resource, token);
	}

	public async callMethod(params: McpMethodCallParams): Promise<McpMethodCallResult> {
		const proxy = this._proxy;
		if (!proxy) {
			throw new ProtocolError(JsonRpcErrorCodes.InternalError, 'MCP server is not yet ready');
		}
		const request: IJsonRpcRequest = {
			jsonrpc: '2.0',
			id: generateUuid(),
			method: params.method,
			params: params.params,
		};
		const response: JsonRpcMessage | undefined = await proxy.sendClientMessage(request);
		if (!response) {
			throw new ProtocolError(JsonRpcErrorCodes.InternalError, 'Upstream MCP server returned no response');
		}
		if (isJsonRpcSuccessResponse(response)) {
			return { result: response.result };
		}
		if (isJsonRpcErrorResponse(response)) {
			throw new ProtocolError(response.error.code, response.error.message, response.error.data);
		}
		throw new ProtocolError(JsonRpcErrorCodes.InternalError, 'Upstream MCP server returned an invalid JSON-RPC message');
	}

	public notify(params: McpNotificationParams): void {
		const proxy = this._proxy;
		if (!proxy) {
			this._logService.warn(`[McpHostService] notify dropped for '${this.resource.toString()}': proxy not ready`);
			return;
		}
		const notification: IJsonRpcNotification = {
			jsonrpc: '2.0',
			method: params.method,
			params: params.params,
		};
		void proxy.sendClientMessage(notification);
	}

	public getToolUiMeta(toolName: string): IMcpUiToolMeta | undefined {
		return this._proxy?.getToolUiMeta(toolName);
	}

	public getUiHostCapabilities(): AhpMcpUiHostCapabilities {
		return this._proxy?.getUiHostCapabilities() ?? {};
	}
}

/**
 * Real {@link IMcpHostService} implementation backed by
 * {@link IMcpProxyFactory}.
 *
 * Holds one {@link Entry} per registered `(session, server)` pair.
 * Entries are keyed by their `mcp:/...` resource URI in a
 * {@link ResourceMap}; that mapping is the ground truth for
 * {@link getServer}, {@link callMethod}, {@link notify}, and
 * {@link setSessionServers} diffing.
 */
export class McpHostServiceImpl extends Disposable implements IMcpHostService {

	public readonly _serviceBrand: undefined;

	private _upstreamDelegate: IMcpHostUpstreamDelegate | undefined;

	/** All live entries, keyed by resource URI. */
	private readonly _entries = new ResourceMap<Entry>();

	/** Sessions → set of resource URI strings registered for that session. */
	private readonly _bySession = new ResourceMap<Set<string>>();

	constructor(
		private readonly _stateManager: AgentHostStateManager,
		private readonly _proxyFactory: IMcpProxyFactory,
		@ILogService private readonly _logService: ILogService,
	) {
		super();
	}

	public override dispose(): void {
		for (const entry of this._entries.values()) {
			entry.dispose();
		}
		this._entries.clear();
		this._bySession.clear();
		super.dispose();
	}

	public setSessionServers(session: URI, servers: readonly IMcpServerDefinition[]): readonly IMcpServerHandle[] {
		const desired = new Map<string, IMcpServerDefinition>();
		for (const def of servers) {
			desired.set(def.name, def);
		}

		const previousResources = this._bySession.get(session) ?? new Set<string>();
		const nextResources = new Set<string>();
		const result: IMcpServerHandle[] = [];

		// Compute: removed = previous \ desired (by serverId), reconfigured = previous & desired with different config.
		// We compare by serverId derived from the existing entry's definition.
		const previousByServerId = new Map<string, Entry>();
		for (const resourceString of previousResources) {
			const entry = this._entries.get(URI.parse(resourceString));
			if (entry) {
				previousByServerId.set(entry.definition.name, entry);
			}
		}

		// Process additions, reconfigurations, and unchanged.
		for (const def of servers) {
			const existing = previousByServerId.get(def.name);
			if (existing && equals(existing.definition.configuration, def.configuration)) {
				// Unchanged — reuse.
				nextResources.add(existing.resource.toString());
				result.push(existing);
				continue;
			}
			if (existing) {
				// Reconfigured — remove the old entry first.
				this._removeEntry(session, existing);
			}
			// Added or reconfigured — mint a fresh entry.
			const entry = this._addEntry(session, def);
			nextResources.add(entry.resource.toString());
			result.push(entry);
		}

		// Process removals (servers in previous but not in desired).
		for (const [serverId, entry] of previousByServerId) {
			if (!desired.has(serverId) && !nextResources.has(entry.resource.toString())) {
				this._removeEntry(session, entry);
			}
		}

		if (nextResources.size === 0) {
			this._bySession.delete(session);
		} else {
			this._bySession.set(session, nextResources);
		}

		return result;
	}

	public getServer(resource: URI): IMcpServerHandle | undefined {
		return this._entries.get(resource);
	}

	public getServerSummaries(session: URI): readonly McpServerSummary[] {
		const resources = this._bySession.get(session);
		if (!resources) {
			return [];
		}
		const result: McpServerSummary[] = [];
		for (const resourceString of resources) {
			const entry = this._entries.get(URI.parse(resourceString));
			if (entry) {
				result.push(entry.summary.get());
			}
		}
		return result;
	}

	public async callMethod(params: McpMethodCallParams): Promise<McpMethodCallResult> {
		const resource = URI.parse(params.server);
		const entry = this._entries.get(resource);
		if (!entry) {
			throw new ProtocolError(JsonRpcErrorCodes.InvalidParams, `Unknown MCP server: ${params.server}`);
		}
		return entry.callMethod(params);
	}

	public notify(params: McpNotificationParams): void {
		const resource = URI.parse(params.server);
		const entry = this._entries.get(resource);
		if (!entry) {
			this._logService.warn(`[McpHostService] notify dropped for unknown server '${params.server}'`);
			return;
		}
		entry.notify(params);
	}

	public setUpstreamDelegate(delegate: IMcpHostUpstreamDelegate): IDisposable {
		if (this._upstreamDelegate) {
			this._logService.warn('[McpHostService] setUpstreamDelegate replacing existing delegate');
		}
		this._upstreamDelegate = delegate;
		return {
			dispose: () => {
				if (this._upstreamDelegate === delegate) {
					this._upstreamDelegate = undefined;
				}
			},
		};
	}

	// ---- Internals ---------------------------------------------------------

	private _addEntry(session: URI, def: IMcpServerDefinition): Entry {
		const resource = buildMcpServerUri(session, def.name);
		const initialStatus: McpServerStatus = { kind: McpServerStatusKind.Starting };
		const entry = new Entry(session, def, resource, initialStatus, this._logService);
		this._entries.set(resource, entry);

		if (this._hasSessionState(session)) {
			// Dispatch `mcp/serverAdded` synchronously BEFORE kicking off the
			// async proxy creation so the AHP client sees the `Starting` server
			// immediately.
			this._stateManager.createMcpServer(session.toString(), {
				resource: resource.toString(),
				label: def.name,
				status: initialStatus,
			});
		}

		// Async proxy creation — don't await; the caller of
		// setSessionServers should not block on transport startup.
		void this._createProxyFor(entry);

		return entry;
	}

	private _removeEntry(session: URI, entry: Entry): void {
		this._entries.delete(entry.resource);
		const resources = this._bySession.get(session);
		if (resources) {
			resources.delete(entry.resource.toString());
		}
		// Dispatch `mcp/serverRemoved` BEFORE disposing — entry.dispose() is silent.
		if (this._hasSessionState(session)) {
			this._stateManager.removeMcpServer(session.toString(), entry.resource.toString());
		}
		entry.dispose();
	}

	private async _createProxyFor(entry: Entry): Promise<void> {
		let upstream: IMcpUpstream;
		try {
			upstream = this._createUpstream(entry.definition, this._logService);
		} catch (err) {
			this._reportProxyCreateError(entry, err);
			return;
		}
		if (entry.isDisposed) {
			upstream.dispose();
			return;
		}
		entry.registerUpstream(upstream);

		const options: IMcpProxyOptions = {
			resource: entry.resource,
			upstream,
			// Always inject the MCP Apps capability when the SDK initializes
			// the upstream. Servers that don't speak Apps simply ignore the
			// extension entry. Per-tool-call gating now happens via
			// `_meta.uiHostCapabilities` on tool call states; the AHP host
			// remains a transparent forwarder for `mcpMethodCall` /
			// `mcpNotification` traffic.
			initializeInjector: new McpAppsInitializeInjector(),
			onUpstreamRequest: (method, params) => this._onUpstreamRequest(entry, method, params),
			onUpstreamNotification: (method, params) => this._onUpstreamNotification(entry, method, params),
			onAuthRequired: status => this._onProxyStatusChange(entry, status),
			onStateChange: status => this._onProxyStatusChange(entry, status),
			logger: this._logService,
		};

		let proxy: IMcpProxy;
		try {
			proxy = await this._proxyFactory.create(options);
		} catch (err) {
			this._reportProxyCreateError(entry, err);
			return;
		}

		// The entry could have been disposed while we were awaiting the
		// proxy. If so, dispose the proxy we just created and bail.
		if (entry.isDisposed) {
			proxy.dispose();
			return;
		}

		entry.setProxy(proxy);

		// Drive initial discovery. Status emissions from the proxy's
		// autorun handle the rest.
		try {
			await upstream.start();
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			this._logService.warn(`[McpHostService] upstream.start() failed for '${entry.resource.toString()}': ${message}`);
		}
	}

	/**
	 * Override seam for tests — swaps the real stdio/HTTP upstream
	 * factories for a stub. Production callers go through the default
	 * implementation below.
	 */
	protected _createUpstream(def: IMcpServerDefinition, logger: ILogger): IMcpUpstream {
		const config = def.configuration;
		if (config.type === McpServerType.LOCAL) {
			return new McpStdioUpstream({ config, logger });
		}
		return new McpHttpUpstream({ config, logger });
	}

	private async _onUpstreamRequest(entry: Entry, method: string, params: unknown): Promise<IUpstreamRequestOutcome> {
		const delegate = this._upstreamDelegate;
		if (!delegate) {
			return {
				error: {
					code: JsonRpcErrorCodes.MethodNotFound,
					message: `No AHP client is listening for upstream MCP requests on '${entry.resource.toString()}'`,
				},
			};
		}
		try {
			const response = await delegate.handleUpstreamRequest({ server: entry.resource, method, params });
			return response.error ? { error: response.error } : { result: response.result };
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			this._logService.warn(`[McpHostService] upstream request handler threw for method '${method}' on '${entry.resource.toString()}': ${message}`);
			return { error: { code: JsonRpcErrorCodes.InternalError, message } };
		}
	}

	private _onUpstreamNotification(entry: Entry, method: string, params: unknown): void {
		const delegate = this._upstreamDelegate;
		if (!delegate) {
			return;
		}
		try {
			delegate.handleUpstreamNotification({ server: entry.resource, method, params });
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			this._logService.warn(`[McpHostService] upstream notification handler threw for method '${method}' on '${entry.resource.toString()}': ${message}`);
		}
	}

	private _onProxyStatusChange(entry: Entry, status: McpServerStatus): void {
		entry.setStatus(status);
		if (this._hasSessionState(entry.session)) {
			this._stateManager.setMcpServerStatus(entry.session.toString(), entry.resource.toString(), status);
		}
	}

	private _reportProxyCreateError(entry: Entry, err: unknown): void {
		const message = err instanceof Error ? err.message : String(err);
		this._logService.warn(`[McpHostService] failed to create proxy for '${entry.resource.toString()}': ${message}`);
		const status: McpServerStatus = {
			kind: McpServerStatusKind.Error,
			error: { errorType: 'proxyCreateFailed', message },
		};
		entry.setStatus(status);
		if (this._hasSessionState(entry.session)) {
			this._stateManager.setMcpServerStatus(entry.session.toString(), entry.resource.toString(), status);
		}
	}

	private _hasSessionState(session: URI): boolean {
		return this._stateManager.getSessionState(session.toString()) !== undefined;
	}
}
