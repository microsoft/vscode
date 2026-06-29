/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { Disposable } from '../../../../../../base/common/lifecycle.js';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { ResourceMap } from '../../../../../../base/common/map.js';
import { URI } from '../../../../../../base/common/uri.js';
import { CustomizationLoadStatus, CustomizationType, type ChildCustomization, type ClientPluginCustomization, type Customization, type CustomizationLoadState, type DirectoryCustomization, PluginCustomization } from '../../../../../../platform/agentHost/common/state/sessionState.js';
import { ILogService } from '../../../../../../platform/log/common/log.js';
import { ICustomizationItem, ICustomizationItemAction, ICustomizationItemProvider, ICustomizationSourceFolder } from '../../../common/customizationHarnessService.js';
import { SYNCED_CUSTOMIZATION_SCHEME } from '../../../../../services/agentHost/common/agentHostFileSystemService.js';
import { IFileService } from '../../../../../../platform/files/common/files.js';
import { toAgentHostUri } from '../../../../../../platform/agentHost/common/agentHostUri.js';
import { readAgentCustomizationMeta } from '../../../../../../platform/agentHost/common/meta/agentCustomizationMeta.js';
import { AICustomizationSource, AICustomizationSources } from '../../../common/aiCustomizationWorkspaceService.js';
import { PromptsType, Target } from '../../../common/promptSyntax/promptTypes.js';
import { AgentCustomizationContentExpander } from './agentCustomizationContentExpander.js';
import { IAgentHostCustomizationService } from './agentHostCustomizationService.js';
import { IAgentSource, ICustomAgent, PromptsStorage } from '../../../common/promptSyntax/service/promptsService.js';
import { getChatSessionType } from '../../../common/model/chatUri.js';
import { localize } from '../../../../../../nls.js';


const REMOTE_HOST_GROUP = 'remote-host';
const REMOTE_CLIENT_GROUP = 'remote-client';


type PluginMeta = { item: ICustomizationItem; nonce: string | undefined; status: ReturnType<typeof toStatusString>; statusMessage: string | undefined; enabled: boolean | undefined; childGroupKey: string; isBundleItem: boolean; pluginLabel: string | undefined };


export class AgentCustomizationItemProvider extends Disposable implements ICustomizationItemProvider {
	private readonly _onDidChange = this._register(new Emitter<void>());
	readonly onDidChange: Event<void> = this._onDidChange.event;

	/** Cache: pluginUri → last expansion (keyed by nonce and label so we re-fetch on content or display-name changes). */
	private readonly _expansionCache = new ResourceMap<{ nonce: string | undefined; pluginLabel: string | undefined; children: readonly ICustomizationItem[] }>();
	private readonly _contentExpander: AgentCustomizationContentExpander;

	constructor(
		private readonly _connectionAuthority: string,
		private readonly _getItemActions: ((customization: PluginCustomization, clientId: string | undefined) => ICustomizationItemAction[] | undefined) | undefined,
		@IFileService private readonly _fileService: IFileService,
		@ILogService private readonly _logService: ILogService,
		@IAgentHostCustomizationService private readonly _customAgentsService: IAgentHostCustomizationService,
	) {
		super();
		this._contentExpander = new AgentCustomizationContentExpander(this._fileService, this._logService);

		this._register(this._customAgentsService.onDidChangeCustomizations(() => {
			this._onDidChange.fire();
		}));
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

	private toBadge(customization: PluginCustomization, fromClient: boolean): { badge?: string; badgeTooltip?: string; groupKey?: string } {
		if (fromClient) {
			return {
				groupKey: REMOTE_CLIENT_GROUP,
			};
		}

		return {
			groupKey: REMOTE_HOST_GROUP,
		};
	}

	private toItem(customization: PluginCustomization, source: AICustomizationSource): ICustomizationItem {
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

	private toDirectoryItems(customization: DirectoryCustomization, source: AICustomizationSource, isRemote: boolean): ICustomizationItem[] {
		const items: ICustomizationItem[] = [];
		for (const child of customization.children ?? []) {
			const item = this.toDirectoryChildItem(child, source, isRemote);
			if (item) {
				items.push(item);
			}
		}
		return items;
	}

	private toDirectoryChildItem(child: ChildCustomization, source: AICustomizationSource, isRemote: boolean): ICustomizationItem | undefined {
		const type = toPromptsType(child.type);
		if (!type) {
			return undefined;
		}
		let userInvocable: boolean | undefined = undefined;
		if (child.type === CustomizationType.Agent) {
			userInvocable = readAgentCustomizationMeta(child).userInvocable !== false;
		}
		let groupKey = isRemote ? REMOTE_CLIENT_GROUP : undefined;
		let badge: string | undefined = undefined;
		let badgeTooltip: string | undefined = undefined;
		if (!groupKey && child.type === CustomizationType.Rule) {
			const pattern = child.globs?.[0];
			if (child.globs && child.globs.length > 0) {
				groupKey = 'context-instructions';
				badge = pattern === '**'
					? localize('alwaysAdded', 'always added')
					: pattern;
				badgeTooltip = pattern === '**'
					? localize('alwaysIncluded', 'This instruction is automatically included in every interaction.')
					: localize('contextInstructions', 'This instruction is automatically included when files matching \'{0}\' are in context.', pattern);
			} else if (child.alwaysApply) {
				groupKey = 'agent-instructions';
			} else {
				groupKey = 'on-demand-instructions';
			}
		}

		return {
			itemKey: child.id,
			uri: this.toRemoteUri(child.uri),
			type,
			name: child.name,
			description: getChildDescription(child),
			source,
			groupKey,
			badge,
			badgeTooltip,
			extensionId: undefined,
			pluginUri: undefined,
			userInvocable,
		};
	}

	async provideSourceFolders(sessionResource: URI, type: PromptsType, _token: CancellationToken): Promise<readonly ICustomizationSourceFolder[]> {
		const workingDirectory = this._customAgentsService.getWorkingDirectory(sessionResource);

		const folders: ICustomizationSourceFolder[] = [];
		for (const customization of this._customAgentsService.getCustomizations(sessionResource)) {
			if (!isDirectoryCustomization(customization) || !customization.writable) {
				continue;
			}
			if (toPromptsType(customization.contents) !== type) {
				continue;
			}
			const source = workingDirectory && customization.uri.startsWith(workingDirectory + '/') ? AICustomizationSources.local : AICustomizationSources.user;
			folders.push({
				uri: this.toRemoteUri(customization.uri),
				label: customization.name,
				source,
			});
		}
		return folders;
	}

	async provideCustomAgents(sessionResource: URI): Promise<readonly ICustomAgent[]> {
		const agents = this._customAgentsService.getCustomAgents(sessionResource);
		const sessionTypes = [getChatSessionType(sessionResource)];
		return agents.map(agent => ({
			id: agent.uri,
			uri: this.toRemoteUri(agent.uri),
			name: agent.name,
			description: agent.description,
			sessionTypes: sessionTypes,
			enabled: true,
			// fill default/empty values for all other properties they will not be used by the UI
			// when making a request, all that's needed is the agent id.
			source: { storage: PromptsStorage.local } satisfies IAgentSource,
			tools: undefined,
			agents: undefined,
			argumentHint: undefined,
			handOffs: undefined,
			hooks: undefined,
			model: undefined,
			agentInstructions: { content: '', toolReferences: [] },
			visibility: {
				agentInvocable: true,
				userInvocable: readAgentCustomizationMeta(agent).userInvocable !== false
			},
			target: Target.Undefined
		} satisfies ICustomAgent));

	}

	async provideChatSessionCustomizations(sessionResource: URI, token: CancellationToken): Promise<ICustomizationItem[]> {
		const items = new Map<string, ICustomizationItem>();

		// Build parent plugin items keyed by customization ref
		const plugins: PluginMeta[] = [];
		const expandPromises: Promise<readonly ICustomizationItem[]>[] = [];


		const customizations = this._customAgentsService.getCustomizations(sessionResource);

		const directoryCustomizations = [];
		for (const sessionCustomization of customizations) {
			if (isDirectoryCustomization(sessionCustomization)) {
				directoryCustomizations.push(sessionCustomization);
			} else if (sessionCustomization.type === CustomizationType.McpServer) {
				// Bare MCP server entries aren't shown as plugin items in this view.
				continue;
			} else {
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
					isBundleItem,
					pluginLabel: isBundleItem ? undefined : item.name,
				} satisfies PluginMeta;
				plugins.push(pluginMeta);
				expandPromises.push(this._expandPluginContents(pluginMeta, token));
			}
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

		const workingDirectory = this._customAgentsService.getWorkingDirectory(sessionResource);

		for (const sessionCustomization of directoryCustomizations) {
			const source = workingDirectory && isParentOrEqual(workingDirectory, sessionCustomization.uri) ? AICustomizationSources.local : AICustomizationSources.user;
			const isRemote = sessionCustomization.clientId !== undefined;
			for (const child of this.toDirectoryItems(sessionCustomization, source, isRemote)) {
				items.set(child.itemKey ?? child.uri.toString(), {
					...child,
					status: toStatusString(sessionCustomization.load),
					statusMessage: toStatusMessage(sessionCustomization.load),
					enabled: sessionCustomization.enabled,
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
		if (cached && cached.nonce === plugin.nonce && cached.pluginLabel === plugin.pluginLabel) {
			return cached.children;
		}
		const children = await this._contentExpander.expandPluginContents(plugin.item.uri, plugin.childGroupKey, plugin.isBundleItem, plugin.item.source, plugin.pluginLabel, token);
		this._expansionCache.set(plugin.item.uri, { nonce: plugin.nonce, pluginLabel: plugin.pluginLabel, children });
		return children;
	}
}
function isParentOrEqual(folderURI: string, childURI: string): boolean {
	return childURI === folderURI || childURI.startsWith(folderURI + '/');
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

function isDirectoryCustomization(customization: Customization): customization is DirectoryCustomization {
	return customization.type === CustomizationType.Directory;
}

function toPromptsType(type: ChildCustomization['type']): PromptsType | undefined {
	switch (type) {
		case CustomizationType.Agent:
			return PromptsType.agent;
		case CustomizationType.Skill:
			return PromptsType.skill;
		case CustomizationType.Rule:
			return PromptsType.instructions;
		case CustomizationType.Prompt:
			return PromptsType.prompt;
		case CustomizationType.Hook:
			return PromptsType.hook;
		default:
			return undefined;
	}
}

function getChildDescription(child: ChildCustomization): string | undefined {
	switch (child.type) {
		case CustomizationType.Agent:
		case CustomizationType.Skill:
		case CustomizationType.Prompt:
		case CustomizationType.Rule:
			return child.description;
		default:
			return undefined;
	}
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
