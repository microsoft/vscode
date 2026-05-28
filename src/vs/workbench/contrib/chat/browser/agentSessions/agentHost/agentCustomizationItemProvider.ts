/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { Disposable } from '../../../../../../base/common/lifecycle.js';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { ResourceMap } from '../../../../../../base/common/map.js';
import { URI } from '../../../../../../base/common/uri.js';
import { CustomizationLoadStatus, CustomizationType, StateComponents, type AgentInfo, type ClientPluginCustomization, type Customization, type CustomizationLoadState, type RootState } from '../../../../../../platform/agentHost/common/state/sessionState.js';
import { ILogService } from '../../../../../../platform/log/common/log.js';
import { ICustomizationAgentRef, ICustomizationItem, ICustomizationItemAction, ICustomizationItemProvider } from '../../../common/customizationHarnessService.js';
import { SYNCED_CUSTOMIZATION_SCHEME } from '../../../../../services/agentHost/common/agentHostFileSystemService.js';
import { IFileService } from '../../../../../../platform/files/common/files.js';
import { AgentSession, type IAgentConnection } from '../../../../../../platform/agentHost/common/agentService.js';
import { ActionType } from '../../../../../../platform/agentHost/common/state/sessionActions.js';
import { getAgentHostConfiguredCustomizations } from '../../../../../../platform/agentHost/common/agentHostCustomizationConfig.js';
import { toAgentHostUri } from '../../../../../../platform/agentHost/common/agentHostUri.js';
import { AICustomizationSource, AICustomizationSources } from '../../../common/aiCustomizationWorkspaceService.js';
import { AgentCustomizationContentExpander } from './agentCustomizationContentExpander.js';


const REMOTE_HOST_GROUP = 'remote-host';
const REMOTE_CLIENT_GROUP = 'remote-client';


type PluginMeta = { item: ICustomizationItem; nonce: string | undefined; status: ReturnType<typeof toStatusString>; statusMessage: string | undefined; enabled: boolean | undefined; childGroupKey: string; isBundleItem: boolean };


export class AgentCustomizationItemProvider extends Disposable implements ICustomizationItemProvider {
	private readonly _onDidChange = this._register(new Emitter<void>());
	readonly onDidChange: Event<void> = this._onDidChange.event;

	private _agentCustomizations: readonly Customization[];

	/** Cache: pluginUri → last expansion (keyed by nonce so we re-fetch on content change). */
	private readonly _expansionCache = new ResourceMap<{ nonce: string | undefined; children: readonly ICustomizationItem[] }>();
	private readonly _contentExpander: AgentCustomizationContentExpander;

	constructor(
		private readonly _agentInfo: AgentInfo,
		private readonly _connection: IAgentConnection,
		private readonly _connectionAuthority: string,
		private readonly _fileService: IFileService,
		private readonly _logService: ILogService,
		private readonly _getItemActions?: (customization: Customization, clientId: string | undefined) => ICustomizationItemAction[] | undefined,
	) {
		super();
		this._contentExpander = new AgentCustomizationContentExpander(this._fileService, this._logService);
		const rootStateSubscription = this._connection.rootState;
		this._agentCustomizations = this._readRootCustomizations(rootStateSubscription.value) ?? this._agentInfo.customizations ?? [];

		this._register(rootStateSubscription.onDidChange(rootState => {
			const next = this._readRootCustomizations(rootState) ?? this._readAgentCustomizations(rootState) ?? this._agentCustomizations;
			if (next !== this._agentCustomizations) {
				this._agentCustomizations = next;
				this._onDidChange.fire();
			}
		}));

		this._register(this._connection.onDidAction(envelope => {
			if (envelope.action.type === ActionType.SessionCustomizationsChanged || envelope.action.type === ActionType.SessionCustomizationUpdated) {
				this._onDidChange.fire();
			}
		}));
	}


	private _readRootCustomizations(rootState: RootState | Error | undefined): readonly Customization[] | undefined {
		if (!rootState || rootState instanceof Error || !rootState.config) {
			return undefined;
		}

		return getAgentHostConfiguredCustomizations(rootState.config?.values);
	}

	private _readAgentCustomizations(rootState: RootState | Error | undefined): readonly Customization[] | undefined {
		if (!rootState || rootState instanceof Error) {
			return undefined;
		}

		return rootState.agents.find(agent => agent.provider === this._agentInfo.provider)?.customizations;
	}

	private toRemoteUri(customizationUri: string): URI {
		const original = URI.parse(customizationUri);
		// The synthetic synced-customization bundle lives in the client's
		// in-memory filesystem. Don't wrap it as an agent-host:// URI —
		// the server doesn't have this scheme registered, so wrapping it
		// would make expansion (and any direct read) fail.
		if (original.scheme === SYNCED_CUSTOMIZATION_SCHEME) {
			return original;
		}
		return toAgentHostUri(original, this._connectionAuthority);
	}

	private toBadge(customization: Customization, fromClient: boolean): { badge?: string; badgeTooltip?: string; groupKey?: string } {
		if (fromClient) {
			return {
				groupKey: REMOTE_CLIENT_GROUP,
			};
		}

		return {
			groupKey: REMOTE_HOST_GROUP,
		};
	}

	private toItem(customization: Customization, source: AICustomizationSource): ICustomizationItem {
		const clientId = customization.clientId; // set if the configuration came from the client
		const badge = this.toBadge(customization, clientId !== undefined);
		const uri = this.toRemoteUri(customization.uri);
		return {
			itemKey: customizationItemKey(customization, clientId),
			uri: uri,
			type: 'plugin',
			name: customization.name,
			description: undefined,
			source,
			status: toStatusString(customization.load),
			statusMessage: toStatusMessage(customization.load),
			enabled: customization.enabled,
			badge: badge.badge,
			badgeTooltip: badge.badgeTooltip,
			groupKey: badge.groupKey,
			extensionId: undefined,
			pluginUri: uri,
			userInvocable: undefined,
			actions: this._getItemActions?.(customization, clientId),
		};
	}
	private _resolveSessionUri(sessionResource: URI): URI {
		const rawId = sessionResource.path.substring(1);
		return AgentSession.uri(this._agentInfo.provider, rawId);
	}

	private getSessionCustomizations(sessionResource: URI): readonly Customization[] {
		const sessionUri = this._resolveSessionUri(sessionResource);
		const sessionState = this._connection.getSubscriptionUnmanaged(StateComponents.Session, sessionUri)?.value;
		return sessionState && !(sessionState instanceof Error) ? sessionState.customizations ?? [] : [];
	}

	async provideCustomAgents(sessionResource: URI): Promise<readonly ICustomizationAgentRef[]> {
		const sessionCustomizations = this.getSessionCustomizations(sessionResource);
		const agents = sessionCustomizations.flatMap(c => c.children?.filter(child => child.type === CustomizationType.Agent) ?? []);
		return agents.map(agent => ({
			uri: this.toRemoteUri(agent.uri),
			name: agent.name,
			description: agent.description,
		}));
	}

	async provideChatSessionCustomizations(sessionResource: URI, token: CancellationToken): Promise<ICustomizationItem[]> {
		const items = new Map<string, ICustomizationItem>();

		// Build parent plugin items keyed by customization ref
		const plugins: PluginMeta[] = [];
		const expandPromises: Promise<readonly ICustomizationItem[]>[] = [];

		for (const customization of this._agentCustomizations) {
			const item = this.toItem(customization, AICustomizationSources.plugin);
			items.set(customizationItemKey(customization, undefined), item);
			const pluginMeta = {
				item,
				nonce: (customization as ClientPluginCustomization).nonce,
				status: undefined,
				statusMessage: undefined,
				enabled: undefined,
				childGroupKey: REMOTE_HOST_GROUP,
				isBundleItem: isSyntheticBundle(customization)
			} satisfies PluginMeta;
			plugins.push(pluginMeta);
			expandPromises.push(this._expandPluginContents(pluginMeta, token));
		}
		for (const sessionCustomization of this.getSessionCustomizations(sessionResource)) {
			const isBundleItem = isSyntheticBundle(sessionCustomization);
			const isClientSynced = sessionCustomization.clientId !== undefined;
			const childGroupKey = isClientSynced ? REMOTE_CLIENT_GROUP : REMOTE_HOST_GROUP;

			// Always show session customizations as distinct plugin entries —
			// client-synced items appear in the "Local" group, host-owned in
			// the "Remote" group. The synthetic bundle is an implementation
			// detail and is not shown as a standalone entry, but is still
			// expanded below so individual user files appear in per-type tabs.
			let item: ICustomizationItem;
			if (!isBundleItem) {
				item = this.toItem(sessionCustomization, AICustomizationSources.plugin);
				items.set(customizationItemKey(sessionCustomization, sessionCustomization.clientId), item);
			} else {
				// create a dummy parent item for the synthetic bundle, it does not go into the items map, just need it to expand.
				item = { uri: this.toRemoteUri(sessionCustomization.uri), type: 'plugin', source: AICustomizationSources.plugin, name: '', groupKey: childGroupKey, extensionId: undefined, pluginUri: undefined } satisfies ICustomizationItem;
			}
			const pluginMeta = {
				item,
				nonce: (sessionCustomization as ClientPluginCustomization).nonce,
				status: toStatusString(sessionCustomization.load),
				statusMessage: toStatusMessage(sessionCustomization.load),
				enabled: sessionCustomization.enabled,
				childGroupKey,
				isBundleItem
			} satisfies PluginMeta;
			plugins.push(pluginMeta);
			expandPromises.push(this._expandPluginContents(pluginMeta, token));
		}

		// Expand each plugin directory in parallel to discover individual skills, agents, instructions, and prompts inside.
		const expansions = await Promise.all(expandPromises);

		if (token.isCancellationRequested) {
			return [];
		}

		for (let i = 0; i < plugins.length; i++) {
			const p = plugins[i];
			for (const child of expansions[i]) {
				// Children inherit the parent plugin's status/enabled state.
				items.set(`${p.item.itemKey ?? p.item.uri.toString()}::${child.type}::${child.name}`, {
					...child,
					status: p.status,
					statusMessage: p.statusMessage,
					enabled: p.enabled,
				});
			}
		}

		return [...items.values()];
	}

	/**
	 * Reads a plugin's directory contents through the agent-host
	 * filesystem provider and returns one {@link ICustomizationItem} per
	 * supported file (agents/skills/instructions/prompts).
	 */
	private async _expandPluginContents(plugin: PluginMeta, token: CancellationToken): Promise<readonly ICustomizationItem[]> {
		const cached = this._expansionCache.get(plugin.item.uri);
		if (cached && cached.nonce === plugin.nonce) {
			return cached.children;
		}
		const children = await this._contentExpander.expandPluginContents(plugin.item.uri, plugin.childGroupKey, plugin.isBundleItem, plugin.item.source, token);
		this._expansionCache.set(plugin.item.uri, { nonce: plugin.nonce, children });
		return children;
	}
}

function toStatusString(load: CustomizationLoadState | undefined): 'loading' | 'loaded' | 'degraded' | 'error' | undefined {
	return load?.kind;
}

function toStatusMessage(load: CustomizationLoadState | undefined): string | undefined {
	if (load?.kind === CustomizationLoadStatus.Degraded || load?.kind === CustomizationLoadStatus.Error) {
		return load.message;
	}
	return undefined;
}

function customizationKey(customization: Customization): string {
	return customization.id;
}

function customizationItemKey(customization: Customization, clientId: string | undefined): string {
	return clientId !== undefined
		? `${customizationKey(customization)}::${clientId}`
		: customizationKey(customization);
}

/**
 * Returns `true` for the synthetic "VS Code Synced Data" bundle plugin,
 * which is an implementation detail of the customization sync pipeline
 * and should not be surfaced as a standalone item in the UI.
 */
function isSyntheticBundle(customization: Customization): boolean {
	try {
		return URI.parse(customization.uri).scheme === SYNCED_CUSTOMIZATION_SCHEME;
	} catch {
		return false;
	}
}

