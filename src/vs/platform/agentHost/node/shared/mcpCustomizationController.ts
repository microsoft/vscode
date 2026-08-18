/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { derived, observableValue, transaction, type IObservable, type ITransaction } from '../../../../base/common/observable.js';
import { URI } from '../../../../base/common/uri.js';
import { AgentSession } from '../../common/agent.js';
import { ActionType } from '../../common/state/protocol/common/actions.js';
import { isCustomizationEnabled } from '../../common/customizationEnablement.js';
import { CustomizationType, McpServerStatus, type AhpMcpUiHostCapabilities, type Customization, type CustomizationEnablement, type McpServerCustomization, type McpServerState } from '../../common/state/protocol/channels-session/state.js';
import { DEFAULT_MCP_APP, DEFAULT_MCP_APP_CAPABILITIES } from '../../common/state/protocol/mcpAppDefaults.js';
import { parseChatUri } from '../../common/state/sessionState.js';
import type { SessionAction } from '../../common/state/sessionActions.js';
import { AgentHostStateManager, IAgentHostStateManager } from '../agentHostStateManager.js';

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
	/** Explicit runtime enablement when the SDK distinguishes disabled from stopped. */
	readonly enabled?: boolean;
}

/**
 * Runtime fields of an MCP server customization that this controller
 * owns — the high-frequency `state`/`channel` pair. Consumers overlay
 * these onto their published customizations (keyed by customization id)
 * so a wholesale customization republish preserves live MCP status
 * rather than resetting it to the `Stopped` default baked into
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
 * Options for {@link McpCustomizationController}.
 */
export interface IMcpCustomizationControllerOptions {
	/** Concrete chat URI used for MCP App routing. */
	readonly chatUri: URI;
	/** Emits a {@link SessionAction} into the session's action stream. */
	readonly emit: (action: SessionAction) => void;
	/** Returns durable plugin source URIs for plugin-provided MCP servers. */
	readonly pluginMcpServerSources?: () => ReadonlyMap<string, string> | undefined;
	/** Resolves the scoped enablement to publish for a temporarily top-level server. */
	readonly resolveEnablement?: (server: McpServerCustomization, owningPluginUri: string | undefined) => readonly CustomizationEnablement[] | undefined;
	/**
	 * MCP App capabilities to advertise on every ready server. Defaults
	 * to {@link DEFAULT_MCP_APP_CAPABILITIES}.
	 */
	readonly capabilities?: AhpMcpUiHostCapabilities;
}

interface ILiveEntry {
	readonly serverName: string;
	readonly state: McpServerState;
	readonly enabled: boolean;
	/** Top-level customization id (when no child match was found). */
	readonly topLevelId?: string;
}

export function buildMcpTopLevelCustomizationId(providerId: string, sessionId: string, serverName: string): string {
	return `mcp-top-level:${providerId}:${sessionId}:${serverName}`;
}

export function buildMcpChannel(chatUri: URI, serverName: string): string {
	const providerId = getMcpChannelProviderId(chatUri);
	return `mcp://${providerId}/${encodeURIComponent(chatUri.toString())}/${encodeURIComponent(serverName)}`;
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

	private readonly _chatUri: URI;
	private readonly _providerId: string;
	private readonly _sessionId: string;
	private readonly _sessionUri: URI;

	/** Per-server live entries, keyed by server name. */
	private readonly _live = observableValue<ReadonlyMap<string, ILiveEntry>>(this, new Map());

	/**
	 * Snapshot of every live server's runtime {@link IMcpServerRuntimeState},
	 * keyed by the customization id under which it is published (the
	 * minted top-level id, or the plugin-derived child id resolved from session
	 * state). Derived from {@link _live}. Callers mirror
	 * this into their own published customizations so a wholesale republish
	 * preserves live MCP status. Servers whose child id cannot currently be
	 * resolved are omitted.
	 */
	readonly runtimeStates: IObservable<ReadonlyMap<string, IMcpServerRuntimeState>>;

	constructor(
		private readonly _options: IMcpCustomizationControllerOptions,
		@IAgentHostStateManager private readonly _stateManager: AgentHostStateManager,
	) {
		super();
		this._chatUri = this._options.chatUri;
		const chat = parseChatUri(this._chatUri);
		if (!chat) {
			throw new Error(`Malformed AHP chat URI: ${this._chatUri.toString()}`);
		}
		this._sessionUri = URI.parse(chat.session);
		this._providerId = AgentSession.provider(this._sessionUri) ?? '';
		this._sessionId = AgentSession.id(this._sessionUri);
		if (!this._providerId || !this._sessionId) {
			throw new Error(`Malformed Agent Host session URI: ${chat.session}`);
		}
		this.runtimeStates = derived(this, reader => {
			const out = new Map<string, IMcpServerRuntimeState>();
			for (const entry of this._live.read(reader).values()) {
				const id = entry.topLevelId ?? this._resolveChildId(entry.serverName);
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
			out.push(this._buildTopLevel(entry.topLevelId, entry.serverName, entry.state, entry.enabled));
		}
		return out;
	}

	get pluginMcpServerSources(): ReadonlyMap<string, string> | undefined {
		return this._options.pluginMcpServerSources?.();
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
	 * entries return the child id published in session state for that server.
	 * Used by providers to tag
	 * {@link ToolCallMcpContributor.customizationId | tool-call contributors}
	 * so clients can correlate MCP tool calls with the originating
	 * server customization.
	 */
	customizationIdForServer(serverName: string): string | undefined {
		const live = this._live.get().get(serverName);
		if (live?.topLevelId !== undefined) {
			return live.topLevelId;
		}
		const published = this._findPublishedMcpCustomization(serverName);
		return published?.topLevelId ?? published?.childId;
	}

	/** Returns the live server name associated with a customization id. */
	serverNameForCustomizationId(id: string): string | undefined {
		for (const entry of this._live.get().values()) {
			const entryId = entry.topLevelId ?? this._resolveChildId(entry.serverName);
			if (entryId === id) {
				return entry.serverName;
			}
		}
		return undefined;
	}

	/** Returns the last live state recorded for the MCP server named `serverName`. */
	stateForServer(serverName: string): McpServerState | undefined {
		return this._live.get().get(serverName)?.state;
	}

	/** Snapshot used by providers to reconcile desired and observed enablement. */
	serverEnablement(): readonly { readonly serverName: string; readonly customizationId: string; readonly enabled: boolean }[] {
		const result: { serverName: string; customizationId: string; enabled: boolean }[] = [];
		for (const entry of this._live.get().values()) {
			const customizationId = entry.topLevelId ?? this._resolveChildId(entry.serverName);
			if (customizationId !== undefined) {
				result.push({ serverName: entry.serverName, customizationId, enabled: entry.enabled });
			}
		}
		return result;
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
		const enabled = server.enabled ?? previous?.enabled ?? true;
		// Once promoted to a top-level entry, stay top-level for the
		// session — flipping back to a child mid-stream would orphan the
		// previously-published top-level id.
		let topLevelId = previous?.topLevelId;
		if (topLevelId === undefined) {
			const published = this._findPublishedMcpCustomization(server.name);
			const childId = published?.childId;
			if (childId !== undefined) {
				this._setLiveEntry(server.name, { serverName: server.name, state, enabled, topLevelId: undefined }, tx);
				this._options.emit({
					type: ActionType.SessionMcpServerStateChanged,
					id: childId,
					state,
					channel: this._buildChannel(server.name, state),
				});
				return;
			}
			topLevelId = published?.topLevelId ?? this._mintTopLevelId(server.name);
		}
		this._setLiveEntry(server.name, { serverName: server.name, state, enabled, topLevelId }, tx);
		this._options.emit({
			type: ActionType.SessionCustomizationUpdated,
			customization: this._buildTopLevel(topLevelId, server.name, state, enabled),
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
		const childId = this._resolveChildId(serverName);
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
		return buildMcpTopLevelCustomizationId(this._providerId, this._sessionId, serverName);
	}

	private _resolveChildId(serverName: string): string | undefined {
		return this._findPublishedMcpCustomization(serverName)?.childId;
	}

	private _findPublishedMcpCustomization(serverName: string): { readonly topLevelId?: string; readonly childId?: string } | undefined {
		const customizations = this._stateManager.getSessionState(this._sessionUri.toString())?.customizations ?? [];
		const topLevel = customizations.find(customization => customization.type === CustomizationType.McpServer && customization.name === serverName);
		if (topLevel?.type === CustomizationType.McpServer) {
			return { topLevelId: topLevel.id };
		}
		const childId = findMcpChildId(customizations, serverName);
		return childId === undefined ? undefined : { childId };
	}

	private _buildChannel(serverName: string, state: McpServerState): string | undefined {
		if (state.kind !== McpServerStatus.Ready) {
			return undefined;
		}
		return buildMcpChannel(this._chatUri, serverName);
	}

	private _buildTopLevel(id: string, serverName: string, state: McpServerState, enabled: boolean): McpServerCustomization {
		const channel = this._buildChannel(serverName, state);
		const owningPluginUri = this.pluginMcpServerSources?.get(serverName);
		// Per AHP spec, `mcpApp` is a static capability declaration —
		// "SHOULD be present whenever the server can host Apps". We
		// proxy every MCP server uniformly, so advertise the host's
		// capability set regardless of runtime `state`. Clients gate
		// rendering on `state.kind === Ready` + `channel` themselves.
		const mcpApp = this._options.capabilities
			? { capabilities: this._options.capabilities }
			: DEFAULT_MCP_APP;
		const existing = getMcpServerCustomizations(this._stateManager.getSessionState(this._sessionUri.toString())?.customizations ?? [])
			.find(customization => customization.id === id);
		const customization: McpServerCustomization = {
			type: CustomizationType.McpServer,
			id,
			uri: this._mintTopLevelId(serverName),
			name: serverName,
			state,
			channel,
			mcpApp,
		};
		const enablement = this._options.resolveEnablement?.(customization, owningPluginUri) ?? existing?.enablement;
		return enablement?.length ? { ...customization, enablement: [...enablement] } : customization;
	}
}

/**
 * Convenience helper: given a flat list of {@link Customization}
 * entries, returns the id of the first MCP child customization whose
 * name matches `serverName`.
 */
export function findMcpChildId(customizations: readonly Customization[], serverName: string): string | undefined {
	return getMcpServerCustomizations(customizations).find(server => server.name === serverName)?.id;
}

export function getMcpServerCustomizations(customizations: readonly Customization[]): readonly McpServerCustomization[] {
	const result: McpServerCustomization[] = [];
	for (const top of customizations) {
		if (top.type === CustomizationType.McpServer) {
			result.push(top);
		} else {
			for (const child of top.children ?? []) {
				if (child.type === CustomizationType.McpServer) {
					result.push(child);
				}
			}
		}
	}
	return result;
}

/**
 * Every MCP server with its effective enabled value, after applying the
 * container gate. The gate is applied here, at the point of use — a child's
 * own stored decisions are never overwritten, so re-enabling a container
 * restores each child to the user's chosen value.
 */
export function getEffectiveMcpServerCustomizations(
	customizations: readonly Customization[],
): readonly { readonly server: McpServerCustomization; readonly enabled: boolean }[] {
	const result: { server: McpServerCustomization; enabled: boolean }[] = [];
	for (const customization of customizations) {
		if (customization.type === CustomizationType.McpServer) {
			result.push({ server: customization, enabled: isCustomizationEnabled(customization) });
			continue;
		}
		const containerEnabled = customization.type === CustomizationType.Plugin
			? isCustomizationEnabled(customization)
			: customization.enabled;
		for (const child of customization.children ?? []) {
			if (child.type === CustomizationType.McpServer) {
				result.push({ server: child, enabled: containerEnabled && isCustomizationEnabled(child) });
			}
		}
	}
	return result;
}

export function applyMcpServerEnablement(customizations: readonly Customization[], desired: readonly Customization[]): readonly Customization[] {
	const desiredById = new Map(getEffectiveMcpServerCustomizations(desired).map(({ server }) => [server.id, server.enablement]));
	return customizations.map(customization => {
		if (customization.type === CustomizationType.McpServer) {
			return applyMcpEnablement(customization, desiredById);
		}
		let changed = false;
		const children = customization.children?.map(child => {
			const next = child.type === CustomizationType.McpServer ? applyMcpEnablement(child, desiredById) : child;
			changed ||= next !== child;
			return next;
		});
		return changed ? { ...customization, children } : customization;
	});
}

function applyMcpEnablement(customization: McpServerCustomization, desiredById: ReadonlyMap<string, readonly CustomizationEnablement[] | undefined>): McpServerCustomization {
	if (!desiredById.has(customization.id)) {
		return customization;
	}
	const enablement = desiredById.get(customization.id);
	if (enablement === undefined) {
		return customization;
	}
	if (enablement?.length) {
		return { ...customization, enablement: [...enablement] };
	}
	const { enablement: _enablement, ...withoutEnablement } = customization;
	return withoutEnablement;
}

export function findMcpServerName(customizations: readonly Customization[], id: string): string | undefined {
	return getMcpServerCustomizations(customizations).find(server => server.id === id)?.name;
}

/**
 * Parsed `mcp://<providerId>/<chatUri>/<serverName>` URI as minted by
 * {@link McpCustomizationController}. The path segments are
 * URL-decoded.
 */
export interface IMcpChannelRoute {
	readonly providerId: string;
	readonly chatUri: URI;
	readonly serverName: string;
}

function getMcpChannelProviderId(chatUri: URI): string {
	const chat = parseChatUri(chatUri);
	if (!chat) {
		throw new Error(`Malformed AHP chat URI: ${chatUri.toString()}`);
	}
	const providerId = AgentSession.provider(chat.session);
	if (!providerId) {
		throw new Error(`Malformed Agent Host session URI: ${chat.session}`);
	}
	return providerId;
}

/**
 * Decodes a channel URI string into a {@link IMcpChannelRoute}, or
 * returns `undefined` when the URI is not an `mcp://` channel or the
 * path is malformed.
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
	const segments = tail.split('/');
	if (segments.length !== 2 || !segments[0] || !segments[1]) {
		return undefined;
	}
	let chatUri: URI;
	let serverName: string;
	try {
		chatUri = URI.parse(decodeURIComponent(segments[0]));
		serverName = decodeURIComponent(segments[1]);
	} catch {
		return undefined;
	}
	if (!providerId || !serverName) {
		return undefined;
	}
	let routedProviderId: string;
	try {
		routedProviderId = getMcpChannelProviderId(chatUri);
	} catch {
		return undefined;
	}
	if (routedProviderId !== providerId) {
		return undefined;
	}
	return { providerId, chatUri, serverName };
}
