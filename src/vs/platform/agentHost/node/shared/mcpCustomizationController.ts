/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { derived, observableValue, transaction, type IObservable, type ITransaction } from '../../../../base/common/observable.js';
import { ActionType } from '../../common/state/protocol/common/actions.js';
import { CustomizationType, McpServerStatus, type AhpMcpUiHostCapabilities, type Customization, type McpServerCustomization, type McpServerState } from '../../common/state/protocol/channels-session/state.js';
import { DEFAULT_MCP_APP, DEFAULT_MCP_APP_CAPABILITIES } from '../../common/state/protocol/mcpAppDefaults.js';
import type { SessionAction } from '../../common/state/sessionActions.js';

/**
 * SDK-neutral description of a single MCP server, as the controller's
 * caller sees it. Each provider adapts its own SDK events into this
 * shape (Copilot, Claude, Codex, …) and feeds them to
 * {@link McpCustomizationController}.
 */
export interface ISdkMcpServer {
	/** Server name (used both as the customization name and the channel suffix). */
	readonly name: string;
	/** Current lifecycle state. */
	readonly state: McpServerState;
}

/**
 * Runtime fields of an MCP server customization that this controller
 * owns — the high-frequency `state`/`channel` pair. Consumers overlay
 * these onto their published customizations (keyed by customization id)
 * so a wholesale customization republish preserves live MCP status
 * rather than resetting it to the `Starting` default baked into
 * `makeMcpServerCustomization`.
 */
export type IMcpServerRuntimeState = Pick<McpServerCustomization, 'state' | 'channel'>;

/**
 * Re-export so existing imports of `DEFAULT_MCP_APP_CAPABILITIES` from
 * the controller keep working — the canonical home is now
 * `agentHost/common/state/protocol/mcpAppDefaults.ts`.
 */
export { DEFAULT_MCP_APP_CAPABILITIES, DEFAULT_MCP_APP };

/**
 * Lookup callback the controller uses to find an existing child MCP
 * customization id by server name. The agent's plugin layer publishes
 * MCP customizations with provider-defined ids
 * (e.g. `pluginParsers.makeMcpServerCustomization` uses
 * `buildChildId(definitionUri, 'mcp=' + encodeURIComponent(name))`), so
 * we resolve them by name at action-dispatch time rather than trying to
 * reconstruct the id.
 *
 * Returns `undefined` when no existing entry matches — in that case the
 * controller surfaces a bare top-level customization for the server.
 */
export type IMcpChildIdResolver = (serverName: string) => string | undefined;

/**
 * Options for {@link McpCustomizationController}.
 */
export interface IMcpCustomizationControllerOptions {
	/** Provider id (e.g. `'copilotcli'`). Used as the channel URI authority. */
	readonly providerId: string;
	/** Session id (the raw id, not the full URI). Used as the channel path segment. */
	readonly sessionId: string;
	/**
	 * Resolves an existing child customization id for a given server
	 * name. See {@link IMcpChildIdResolver}.
	 */
	readonly resolveChildId: IMcpChildIdResolver;
	/** Emits a {@link SessionAction} into the session's action stream. */
	readonly emit: (action: SessionAction) => void;
	/**
	 * MCP App capabilities to advertise on every ready server. Defaults
	 * to {@link DEFAULT_MCP_APP_CAPABILITIES}.
	 */
	readonly capabilities?: AhpMcpUiHostCapabilities;
}

interface ILiveEntry {
	readonly serverName: string;
	readonly state: McpServerState;
	/** Top-level customization id (when no child match was found). */
	readonly topLevelId?: string;
}

/**
 * Translates a stream of SDK-reported MCP server states into AHP
 * customization actions:
 *
 *  - For servers backed by an existing child customization (plugin- or
 *    directory-derived), the controller emits
 *    {@link ActionType.SessionMcpServerStateChanged} keyed on the
 *    resolved child id. The reducer narrowly updates `state` and
 *    `channel` on the matching child.
 *  - For servers with no matching child (typically globally-configured
 *    MCP servers the SDK reports), the controller emits a full
 *    {@link ActionType.SessionCustomizationUpdated} carrying a bare
 *    top-level {@link McpServerCustomization}. The same id is reused
 *    across updates, so the reducer's upsert keeps in-place.
 *
 * The controller is SDK-agnostic: providers translate their own events
 * into {@link ISdkMcpServer} and call {@link applyAll} / {@link applyOne}.
 * If a provider reports a coarse {@link McpServerStatus.Starting} update
 * after a richer {@link McpServerStatus.AuthRequired} state, the controller
 * preserves the auth-required state until a definitive
 * {@link McpServerStatus.Ready}, {@link McpServerStatus.Error}, or
 * {@link McpServerStatus.Stopped} update arrives.
 */
export class McpCustomizationController extends Disposable {

	/** Per-server live entries, keyed by server name. */
	private readonly _live = observableValue<ReadonlyMap<string, ILiveEntry>>(this, new Map());

	/**
	 * Snapshot of every live server's runtime {@link IMcpServerRuntimeState},
	 * keyed by the customization id under which it is published (the
	 * minted top-level id, or the plugin-derived child id resolved via
	 * {@link IMcpChildIdResolver}). Derived from {@link _live}. Callers mirror
	 * this into their own published customizations so a wholesale republish
	 * preserves live MCP status. Servers whose child id cannot currently be
	 * resolved are omitted.
	 */
	readonly runtimeStates: IObservable<ReadonlyMap<string, IMcpServerRuntimeState>>;

	constructor(private readonly _options: IMcpCustomizationControllerOptions) {
		super();
		this.runtimeStates = derived(this, reader => {
			const out = new Map<string, IMcpServerRuntimeState>();
			for (const entry of this._live.read(reader).values()) {
				const id = entry.topLevelId ?? this._options.resolveChildId(entry.serverName);
				if (id === undefined) {
					continue;
				}
				out.set(id, { state: entry.state, channel: this._buildChannel(entry.serverName, entry.state) });
			}
			return out;
		});
	}

	/** Snapshot for inclusion in `getSessionCustomizations()` results. */
	topLevelCustomizations(): readonly McpServerCustomization[] {
		const out: McpServerCustomization[] = [];
		for (const entry of this._live.get().values()) {
			if (entry.topLevelId === undefined) {
				continue;
			}
			out.push(this._buildTopLevel(entry.topLevelId, entry.serverName, entry.state));
		}
		return out;
	}

	/**
	 * Names of MCP servers currently in {@link McpServerStatus.Ready},
	 * paired with their channel URI. Used by providers to drive
	 * polling-based notification streams (e.g. re-fetch `tools/list`
	 * after a refresh hint and fire
	 * `notifications/tools/list_changed` if the result changed).
	 */
	readyChannels(): readonly { readonly serverName: string; readonly channel: string }[] {
		const out: { serverName: string; channel: string }[] = [];
		for (const entry of this._live.get().values()) {
			if (entry.state.kind !== McpServerStatus.Ready) {
				continue;
			}
			const channel = this._buildChannel(entry.serverName, entry.state);
			if (channel !== undefined) {
				out.push({ serverName: entry.serverName, channel });
			}
		}
		return out;
	}

	/**
	 * Returns the customization id currently associated with the MCP
	 * server named `serverName`, or `undefined` when no customization
	 * exists. Top-level entries return the minted top-level id; child
	 * entries return whatever {@link IMcpChildIdResolver} resolves to
	 * for that server. Used by providers to tag
	 * {@link ToolCallMcpContributor.customizationId | tool-call contributors}
	 * so clients can correlate MCP tool calls with the originating
	 * server customization.
	 */
	customizationIdForServer(serverName: string): string | undefined {
		const live = this._live.get().get(serverName);
		if (live?.topLevelId !== undefined) {
			return live.topLevelId;
		}
		return this._options.resolveChildId(serverName);
	}

	/**
	 * Returns the `mcp://` AHP channel URI currently advertised for the
	 * MCP server named `serverName`, or `undefined` when the server is
	 * not in {@link McpServerStatus.Ready}. Used by providers to attach
	 * the channel to MCP App `_meta.ui` so clients can route App
	 * sub-RPCs (tools/call, resources/read, sampling/createMessage)
	 * back through {@link IAgentHostService.handleMcpRequest}.
	 */
	channelForServer(serverName: string): string | undefined {
		const live = this._live.get().get(serverName);
		if (!live || live.state.kind !== McpServerStatus.Ready) {
			return undefined;
		}
		return this._buildChannel(serverName, live.state);
	}

	/**
	 * Replaces the live inventory with `servers`. Servers no longer
	 * present are removed; new servers and changed servers are upserted.
	 * Batched in a single transaction so {@link runtimeStates} observers
	 * see one coalesced update.
	 */
	applyAll(servers: readonly ISdkMcpServer[]): void {
		transaction(tx => {
			const seen = new Set<string>();
			for (const server of servers) {
				seen.add(server.name);
				this._applyOne(server, tx);
			}
			for (const name of [...this._live.get().keys()]) {
				if (!seen.has(name)) {
					this._remove(name, tx);
				}
			}
		});
	}

	/** Upserts a single server. */
	applyOne(server: ISdkMcpServer): void {
		transaction(tx => this._applyOne(server, tx));
	}

	private _applyOne(server: ISdkMcpServer, tx: ITransaction): void {
		const previous = this._live.get().get(server.name);
		const state = this._stateForUpdate(previous?.state, server.state);
		// Once promoted to a top-level entry, stay top-level for the
		// session — flipping back to a child mid-stream would orphan the
		// previously-published top-level id.
		let topLevelId = previous?.topLevelId;
		if (topLevelId === undefined) {
			const childId = this._options.resolveChildId(server.name);
			if (childId !== undefined) {
				this._setLiveEntry(server.name, { serverName: server.name, state, topLevelId: undefined }, tx);
				this._options.emit({
					type: ActionType.SessionMcpServerStateChanged,
					id: childId,
					state,
					channel: this._buildChannel(server.name, state),
				});
				return;
			}
			topLevelId = this._mintTopLevelId(server.name);
		}
		this._setLiveEntry(server.name, { serverName: server.name, state, topLevelId }, tx);
		this._options.emit({
			type: ActionType.SessionCustomizationUpdated,
			customization: this._buildTopLevel(topLevelId, server.name, state),
		});
	}

	/**
	 * Removes a server from the live inventory. For top-level entries
	 * (bare servers with no plugin-derived child) emits
	 * {@link ActionType.SessionCustomizationRemoved} so the entry is
	 * dropped from session state, not just from the in-memory live
	 * inventory.
	 *
	 * For child entries we emit a final {@link ActionType.SessionMcpServerStateChanged}
	 * carrying {@link McpServerStatus.Stopped} so the UI sees the
	 * server settle into a terminal state; the plugin layer owns the
	 * actual removal of the child container.
	 */
	remove(serverName: string): void {
		transaction(tx => this._remove(serverName, tx));
	}

	private _remove(serverName: string, tx: ITransaction): void {
		const entry = this._live.get().get(serverName);
		if (!entry) {
			return;
		}
		this._deleteLiveEntry(serverName, tx);
		if (entry.topLevelId !== undefined) {
			this._options.emit({
				type: ActionType.SessionCustomizationRemoved,
				id: entry.topLevelId,
			});
			return;
		}
		const childId = this._options.resolveChildId(serverName);
		if (childId === undefined) {
			return;
		}
		this._options.emit({
			type: ActionType.SessionMcpServerStateChanged,
			id: childId,
			state: { kind: McpServerStatus.Stopped },
		});
	}

	// ---- internals ---------------------------------------------------------

	/** Immutable upsert into the {@link _live} observable. */
	private _setLiveEntry(serverName: string, entry: ILiveEntry, tx: ITransaction): void {
		const next = new Map(this._live.get());
		next.set(serverName, entry);
		this._live.set(next, tx);
	}

	/** Immutable delete from the {@link _live} observable. */
	private _deleteLiveEntry(serverName: string, tx: ITransaction): void {
		const current = this._live.get();
		if (!current.has(serverName)) {
			return;
		}
		const next = new Map(current);
		next.delete(serverName);
		this._live.set(next, tx);
	}

	private _stateForUpdate(previous: McpServerState | undefined, next: McpServerState): McpServerState {
		if (previous?.kind === McpServerStatus.AuthRequired && next.kind === McpServerStatus.Starting) {
			return previous;
		}
		return next;
	}

	private _mintTopLevelId(serverName: string): string {
		return `mcp-top-level:${this._options.providerId}:${this._options.sessionId}:${serverName}`;
	}

	private _buildChannel(serverName: string, state: McpServerState): string | undefined {
		if (state.kind !== McpServerStatus.Ready) {
			return undefined;
		}
		return `mcp://${this._options.providerId}/${encodeURIComponent(this._options.sessionId)}/${encodeURIComponent(serverName)}`;
	}

	private _buildTopLevel(id: string, serverName: string, state: McpServerState): McpServerCustomization {
		const channel = this._buildChannel(serverName, state);
		// Per AHP spec, `mcpApp` is a static capability declaration —
		// "SHOULD be present whenever the server can host Apps". We
		// proxy every MCP server uniformly, so advertise the host's
		// capability set regardless of runtime `state`. Clients gate
		// rendering on `state.kind === Ready` + `channel` themselves.
		const mcpApp = this._options.capabilities
			? { capabilities: this._options.capabilities }
			: DEFAULT_MCP_APP;
		return {
			type: CustomizationType.McpServer,
			id,
			uri: this._mintTopLevelId(serverName),
			name: serverName,
			enabled: true,
			state,
			channel,
			mcpApp,
		};
	}
}

/**
 * Convenience helper: given a flat list of {@link Customization}
 * entries, returns the id of the first MCP child customization whose
 * name matches `serverName`. Used by providers to wire up
 * {@link IMcpCustomizationControllerOptions.resolveChildId} without
 * each provider having to walk the customization tree itself.
 */
export function findMcpChildId(customizations: readonly Customization[], serverName: string): string | undefined {
	for (const top of customizations) {
		if (top.type === CustomizationType.McpServer) {
			if (top.name === serverName) {
				return top.id;
			}
			continue;
		}
		const children = top.children;
		if (!children) {
			continue;
		}
		for (const child of children) {
			if (child.type === CustomizationType.McpServer && child.name === serverName) {
				return child.id;
			}
		}
	}
	return undefined;
}

/**
 * Parsed `mcp://<providerId>/<sessionId>/<serverName>` URI as minted by
 * {@link McpCustomizationController}. The path segments are
 * URL-decoded.
 */
export interface IMcpChannelRoute {
	readonly providerId: string;
	readonly sessionId: string;
	readonly serverName: string;
}

/**
 * Decodes a channel URI string into a {@link IMcpChannelRoute}, or
 * returns `undefined` when the URI is not an `mcp://` channel or the
 * path is malformed. Intentionally uses string parsing rather than
 * `URI.parse` so the helper stays usable from layers (e.g. agentService
 * test fixtures) without a full URI dependency.
 */
export function parseMcpChannelUri(uri: string): IMcpChannelRoute | undefined {
	const prefix = 'mcp://';
	if (!uri.startsWith(prefix)) {
		return undefined;
	}
	const rest = uri.slice(prefix.length);
	const slash = rest.indexOf('/');
	if (slash <= 0) {
		return undefined;
	}
	const providerId = rest.slice(0, slash);
	const tail = rest.slice(slash + 1);
	const sep = tail.indexOf('/');
	if (sep <= 0 || sep === tail.length - 1) {
		return undefined;
	}
	let sessionId: string;
	let serverName: string;
	try {
		// `decodeURIComponent` throws `URIError` on malformed percent
		// escapes (e.g. a lone `%`). Treat any decode failure as a
		// malformed channel rather than letting it escape — the caller
		// translates `undefined` into a clean `Method not found`.
		sessionId = decodeURIComponent(tail.slice(0, sep));
		serverName = decodeURIComponent(tail.slice(sep + 1));
	} catch {
		return undefined;
	}
	if (!providerId || !sessionId || !serverName) {
		return undefined;
	}
	return { providerId, sessionId, serverName };
}
