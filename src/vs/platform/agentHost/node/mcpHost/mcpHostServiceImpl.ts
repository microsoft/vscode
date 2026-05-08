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
import { Disposable } from '../../../../base/common/lifecycle.js';
import { ResourceMap } from '../../../../base/common/map.js';
import { equals } from '../../../../base/common/objects.js';
import { IObservable, observableValue } from '../../../../base/common/observable.js';
import { URI } from '../../../../base/common/uri.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { IMcpServerDefinition } from '../../../agentPlugins/common/pluginParsers.js';
import { ILogService, ILogger } from '../../../log/common/log.js';
import { McpServerType } from '../../../mcp/common/mcpPlatformTypes.js';
import {
	IMcpClientContext,
	IMcpHostService,
	IMcpServerHandle,
} from '../../common/mcpHost/mcpHostService.js';
import { buildMcpServerUri } from '../../common/state/mcpServerUri.js';
import { JsonRpcErrorCodes } from '../../common/state/protocol/errors.js';
import { McpMessageParams, McpMessageResult, ServerMcpCapabilities } from '../../common/state/protocol/commands.js';
import {
	McpRpcCallResponse,
	McpRpcMessage,
	McpRpcMessageKind,
	McpServerStatus,
	McpServerStatusKind,
	McpServerSummary,
} from '../../common/state/protocol/state.js';
import { ProtocolError } from '../../common/state/sessionProtocol.js';
import { AgentHostStateManager } from '../agentHostStateManager.js';
import { McpHttpUpstream } from './mcpHttpUpstream.js';
import { McpStdioUpstream } from './mcpStdioUpstream.js';
import { IMcpProxy, IMcpProxyFactory, IMcpProxyOptions } from './mcpProxy.js';
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
	/**
	 * Host-minted messageIds for outstanding upstream→client requests.
	 * Used as a sanity check before forwarding the client's response to
	 * the proxy. The proxy maintains the authoritative
	 * `messageId → JSON-RPC id` mapping.
	 */
	private readonly _pendingMessageIds = new Set<string>();

	constructor(
		public readonly session: URI,
		public readonly definition: IMcpServerDefinition,
		public readonly resource: URI,
		initialStatus: McpServerStatus,
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
	}

	public setStatus(status: McpServerStatus): void {
		const current = this._summary.get();
		if (current.status === status) {
			return;
		}
		this._summary.set({ ...current, status }, undefined);
	}

	public addMessageId(id: string): void {
		this._pendingMessageIds.add(id);
	}

	public hasMessageId(id: string): boolean {
		return this._pendingMessageIds.has(id);
	}

	public removeMessageId(id: string): void {
		this._pendingMessageIds.delete(id);
	}

	public async authenticate(resource: string, token: string): Promise<boolean> {
		if (!this._proxy) {
			return false;
		}
		return this._proxy.authenticate(resource, token);
	}

	public async sendMessage(params: McpMessageParams, _client: IMcpClientContext): Promise<McpMessageResult> {
		const proxy = this._proxy;
		if (!proxy) {
			throw new ProtocolError(JsonRpcErrorCodes.InternalError, 'MCP server is not yet ready');
		}
		if (params.notification) {
			const notification: IJsonRpcNotification = {
				jsonrpc: '2.0',
				method: params.method,
				params: params.params,
			};
			await proxy.sendClientMessage(notification);
			return {};
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

	public deliverResponse(messageId: string, response: McpRpcCallResponse): void {
		this._proxy?.deliverClientResponse(messageId, response);
	}
}

/**
 * Real {@link IMcpHostService} implementation backed by
 * {@link IMcpProxyFactory}.
 *
 * Holds one {@link Entry} per registered `(session, server)` pair.
 * Entries are keyed by their `mcp:/...` resource URI in a
 * {@link ResourceMap}; that mapping is the ground truth for
 * {@link getServer}, {@link sendMessage}, {@link deliverResponse}, and
 * {@link setSessionServers} diffing.
 */
export class McpHostServiceImpl extends Disposable implements IMcpHostService {

	public readonly _serviceBrand: undefined;

	public readonly serverCapabilities: ServerMcpCapabilities = {
		message: true,
		perServerSubscriptions: true,
	};

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

	public async sendMessage(params: McpMessageParams, client: IMcpClientContext): Promise<McpMessageResult> {
		const resource = URI.parse(params.server);
		const entry = this._entries.get(resource);
		if (!entry) {
			throw new ProtocolError(JsonRpcErrorCodes.InvalidParams, `Unknown MCP server: ${params.server}`);
		}
		if (params.method.startsWith('ui/') && !client.capabilities?.mcp?.apps) {
			throw new ProtocolError(JsonRpcErrorCodes.MethodNotFound, 'ui/* methods require capabilities.mcp.apps to be advertised');
		}
		return entry.sendMessage(params, client);
	}

	public deliverResponse(mcpServer: URI, messageId: string, response: McpRpcCallResponse): void {
		const entry = this._entries.get(mcpServer);
		if (!entry) {
			this._logService.warn(`[McpHostService] deliverResponse for unknown server '${mcpServer.toString()}' — dropping`);
			return;
		}
		if (!entry.hasMessageId(messageId)) {
			this._logService.warn(`[McpHostService] deliverResponse for unknown messageId '${messageId}' on server '${mcpServer.toString()}' — dropping`);
			return;
		}
		entry.deliverResponse(messageId, response);
		entry.removeMessageId(messageId);
		this._stateManager.mcpMessageRemoved(entry.resource.toString(), messageId);
	}

	// ---- Internals ---------------------------------------------------------

	private _addEntry(session: URI, def: IMcpServerDefinition): Entry {
		const resource = buildMcpServerUri(session, def.name);
		const initialStatus: McpServerStatus = { kind: McpServerStatusKind.Starting };
		const entry = new Entry(session, def, resource, initialStatus);
		this._entries.set(resource, entry);

		// Dispatch `mcp/serverAdded` synchronously BEFORE kicking off the
		// async proxy creation so the AHP client sees the `Starting` server
		// immediately.
		this._stateManager.createMcpServer(session.toString(), {
			resource: resource.toString(),
			label: def.name,
			status: initialStatus,
		});

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
		this._stateManager.removeMcpServer(session.toString(), entry.resource.toString());
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
			// Phase 5 wires McpAppsInitializeInjector based on per-call client capabilities.
			initializeInjector: undefined,
			onUpstreamMessage: msg => this._onUpstreamMessage(entry, msg),
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

	private _onUpstreamMessage(entry: Entry, msg: McpRpcMessage): string {
		// NOTE: We mint a fresh UUID for every upstream-originated
		// message. The proxy stores `messageId → JSON-RPC id` internally,
		// so the host service does not need to know the original
		// JSON-RPC id to route responses back.
		const messageId = generateUuid();
		this._stateManager.mcpMessageReceived(entry.resource.toString(), messageId, msg);

		if (msg.kind === McpRpcMessageKind.Call) {
			entry.addMessageId(messageId);
		} else {
			// Notifications have no response phase. Remove immediately so
			// clients don't see sticky entries.
			//
			// TODO: Phase 5 may want sticky notifications for MCP Apps so
			// late-subscribing clients see them. Revisit when wiring up
			// MCP Apps.
			this._stateManager.mcpMessageRemoved(entry.resource.toString(), messageId);
		}
		return messageId;
	}

	private _onProxyStatusChange(entry: Entry, status: McpServerStatus): void {
		entry.setStatus(status);
		this._stateManager.setMcpServerStatus(entry.session.toString(), entry.resource.toString(), status);
	}

	private _reportProxyCreateError(entry: Entry, err: unknown): void {
		const message = err instanceof Error ? err.message : String(err);
		this._logService.warn(`[McpHostService] failed to create proxy for '${entry.resource.toString()}': ${message}`);
		const status: McpServerStatus = {
			kind: McpServerStatusKind.Error,
			error: { errorType: 'proxyCreateFailed', message },
		};
		entry.setStatus(status);
		this._stateManager.setMcpServerStatus(entry.session.toString(), entry.resource.toString(), status);
	}
}
