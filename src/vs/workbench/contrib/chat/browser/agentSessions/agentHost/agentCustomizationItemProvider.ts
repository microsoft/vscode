/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { Disposable } from '../../../../../../base/common/lifecycle.js';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { ResourceMap } from '../../../../../../base/common/map.js';
import { extname } from '../../../../../../base/common/path.js';
import { joinPath } from '../../../../../../base/common/resources.js';
import { URI } from '../../../../../../base/common/uri.js';
import { CustomizationStatus, type SessionCustomization, type AgentInfo, type CustomizationRef, type RootState } from '../../../../../../platform/agentHost/common/state/sessionState.js';
import { ILogService } from '../../../../../../platform/log/common/log.js';
import { ICustomizationItem, ICustomizationItemAction, ICustomizationItemProvider } from '../../../common/customizationHarnessService.js';
import { PromptsStorage } from '../../../common/promptSyntax/service/promptsService.js';
import { SYNCED_CUSTOMIZATION_SCHEME } from '../../../../../services/agentHost/common/agentHostFileSystemService.js';
import { IFileService } from '../../../../../../platform/files/common/files.js';
import { type IAgentConnection } from '../../../../../../platform/agentHost/common/agentService.js';
import { ActionType } from '../../../../../../platform/agentHost/common/state/sessionActions.js';
import { getAgentHostConfiguredCustomizations } from '../../../../../../platform/agentHost/common/agentHostCustomizationConfig.js';
import { toAgentHostUri } from '../../../../../../platform/agentHost/common/agentHostUri.js';
import { SKILL_FILENAME } from '../../../common/promptSyntax/config/promptFileLocations.js';
import { PromptFileParser } from '../../../common/promptSyntax/promptFileParser.js';
import { PromptsType } from '../../../common/promptSyntax/promptTypes.js';


const REMOTE_HOST_GROUP = 'remote-host';
const REMOTE_CLIENT_GROUP = 'remote-client';


export class AgentCustomizationItemProvider extends Disposable implements ICustomizationItemProvider {
	private readonly _onDidChange = this._register(new Emitter<void>());
	readonly onDidChange: Event<void> = this._onDidChange.event;

	private _agentCustomizations: readonly CustomizationRef[];
	private _sessionCustomizations: readonly SessionCustomization[] | undefined;

	/** Cache: pluginUri → last expansion (keyed by nonce so we re-fetch on content change). */
	private readonly _expansionCache = new ResourceMap<{ nonce: string | undefined; children: readonly ICustomizationItem[] }>();

	constructor(
		private readonly _agentInfo: AgentInfo,
		connection: IAgentConnection,
		private readonly _connectionAuthority: string,
		private readonly _fileService: IFileService,
		private readonly _logService: ILogService,
		private readonly _getItemActions?: (customization: CustomizationRef, clientId: string | undefined) => ICustomizationItemAction[] | undefined,
	) {
		super();
		const rootStateSubscription = connection.rootState;
		this._agentCustomizations = this._readRootCustomizations(rootStateSubscription.value) ?? this._agentInfo.customizations ?? [];

		this._register(rootStateSubscription.onDidChange(rootState => {
			const next = this._readRootCustomizations(rootState) ?? this._readAgentCustomizations(rootState) ?? this._agentCustomizations;
			if (next !== this._agentCustomizations) {
				this._agentCustomizations = next;
				this._onDidChange.fire();
			}
		}));

		this._register(connection.onDidAction(envelope => {
			if (envelope.action.type === ActionType.SessionCustomizationsChanged) {
				const customizations = envelope.action.customizations;
				if (customizations !== this._sessionCustomizations) {
					this._sessionCustomizations = customizations;
					this._onDidChange.fire();
				}
			}
		}));
	}


	private _readRootCustomizations(rootState: RootState | Error | undefined): readonly CustomizationRef[] | undefined {
		if (!rootState || rootState instanceof Error || !rootState.config) {
			return undefined;
		}

		return getAgentHostConfiguredCustomizations(rootState.config?.values);
	}

	private _readAgentCustomizations(rootState: RootState | Error | undefined): readonly CustomizationRef[] | undefined {
		if (!rootState || rootState instanceof Error) {
			return undefined;
		}

		return rootState.agents.find(agent => agent.provider === this._agentInfo.provider)?.customizations;
	}

	private toRemoteUri(customization: CustomizationRef): URI {
		const original = URI.parse(customization.uri);
		// The synthetic synced-customization bundle lives in the client's
		// in-memory filesystem. Don't wrap it as an agent-host:// URI —
		// the server doesn't have this scheme registered, so wrapping it
		// would make expansion (and any direct read) fail.
		if (original.scheme === SYNCED_CUSTOMIZATION_SCHEME) {
			return original;
		}
		return toAgentHostUri(original, this._connectionAuthority);
	}

	private toBadge(customization: CustomizationRef, fromClient: boolean): { badge?: string; badgeTooltip?: string; groupKey?: string } {
		if (fromClient) {
			return {
				groupKey: REMOTE_CLIENT_GROUP,
			};
		}

		return {
			groupKey: REMOTE_HOST_GROUP,
		};
	}

	private toItem(customization: CustomizationRef, sessionCustomization?: SessionCustomization): ICustomizationItem {
		const clientId = sessionCustomization?.clientId; // set if the configuration came from the client
		const badge = this.toBadge(customization, clientId !== undefined);
		const uri = this.toRemoteUri(customization);
		return {
			itemKey: customizationItemKey(customization, clientId),
			uri: uri,
			type: 'plugin',
			name: customization.displayName,
			description: customization.description,
			storage: PromptsStorage.plugin,
			status: toStatusString(sessionCustomization?.status),
			statusMessage: sessionCustomization?.statusMessage,
			enabled: sessionCustomization?.enabled ?? true,
			badge: badge.badge,
			badgeTooltip: badge.badgeTooltip,
			groupKey: badge.groupKey,
			extensionId: undefined,
			pluginUri: uri,
			userInvocable: undefined,
			actions: this._getItemActions?.(customization, clientId),
		};
	}

	async provideChatSessionCustomizations(token: CancellationToken): Promise<ICustomizationItem[]> {
		const items = new Map<string, ICustomizationItem>();

		// Build parent plugin items keyed by customization ref
		type PluginMeta = { item: ICustomizationItem; nonce: string | undefined; status: ReturnType<typeof toStatusString>; statusMessage: string | undefined; enabled: boolean | undefined; childGroupKey: string; isBundleItem: boolean };
		const plugins: PluginMeta[] = [];

		for (const customization of this._agentCustomizations) {
			const item = this.toItem(customization);
			items.set(customizationItemKey(customization, undefined), item);
			plugins.push({ item, nonce: customization.nonce, status: undefined, statusMessage: undefined, enabled: undefined, childGroupKey: REMOTE_HOST_GROUP, isBundleItem: false });
		}

		for (const sessionCustomization of this._sessionCustomizations ?? []) {
			const isBundleItem = isSyntheticBundle(sessionCustomization.customization);
			const isClientSynced = sessionCustomization.clientId !== undefined;
			const childGroupKey = isClientSynced ? REMOTE_CLIENT_GROUP : REMOTE_HOST_GROUP;

			// Always show session customizations as distinct plugin entries —
			// client-synced items appear in the "Local" group, host-owned in
			// the "Remote" group. The synthetic bundle is an implementation
			// detail and is not shown as a standalone entry, but is still
			// expanded below so individual user files appear in per-type tabs.
			let item: ICustomizationItem;
			if (!isBundleItem) {
				item = this.toItem(sessionCustomization.customization, sessionCustomization);
				items.set(customizationItemKey(sessionCustomization.customization, sessionCustomization.clientId), item);
			} else {
				// create a dummy parent item for the synthetic bundle, it does not go into the items map, just need it to expand.
				item = { uri: this.toRemoteUri(sessionCustomization.customization), type: 'plugin', name: '', storage: PromptsStorage.plugin, groupKey: childGroupKey, extensionId: undefined, pluginUri: undefined };
			}

			// Always expand plugin contents so individual files are visible.
			plugins.push({
				item,
				nonce: sessionCustomization.customization.nonce,
				status: toStatusString(sessionCustomization.status),
				statusMessage: sessionCustomization.statusMessage,
				enabled: sessionCustomization.enabled,
				childGroupKey,
				isBundleItem,
			});
		}

		// Expand each plugin directory in parallel to discover individual
		// skills, agents, instructions, and prompts inside.
		const expansions = await Promise.all(plugins.map(p => this._expandPluginContents(p.item.uri, p.nonce, p.childGroupKey, p.isBundleItem, token)));
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
	 *
	 * Cached by `(uri, nonce)`; a different nonce invalidates the entry.
	 */
	private async _expandPluginContents(pluginUri: URI, nonce: string | undefined, groupKey: string, isBundleItem: boolean, token: CancellationToken): Promise<readonly ICustomizationItem[]> {
		const cached = this._expansionCache.get(pluginUri);
		if (cached && cached.nonce === nonce) {
			return cached.children;
		}

		// pluginUri is already an agent-host:// URI (from toRemoteUri),
		// so use it directly as the filesystem root.
		const fsRoot = pluginUri;
		const children: ICustomizationItem[] = [];
		try {
			if (!await this._fileService.canHandleResource(fsRoot)) {
				return [];
			}
			if (token.isCancellationRequested) {
				return [];
			}

			const dirNames = ['agents', 'skills', 'commands', 'rules'] as const;
			const subdirs = dirNames.map(name => ({ name, resource: URI.joinPath(fsRoot, name) }));
			const stats = await this._fileService.resolveAll(subdirs.map(s => ({ resource: s.resource })));

			if (token.isCancellationRequested) {
				return [];
			}

			for (let i = 0; i < subdirs.length; i++) {
				const stat = stats[i];
				if (!stat.success || !stat.stat?.isDirectory || !stat.stat.children) {
					continue;
				}
				const promptType = promptsTypeForPluginDir(subdirs[i].name);
				if (!promptType) {
					continue;
				}
				children.push(...await this._collectFromTypeDir(stat.stat.children, pluginUri, promptType, groupKey, isBundleItem, token));
			}
			children.sort((a, b) => `${a.type}:${a.name}`.localeCompare(`${b.type}:${b.name}`));
		} catch (err) {
			this._logService.trace(`[AgentCustomizationItemProvider] Failed to expand plugin ${pluginUri.toString()}: ${err}`);
			return [];
		}

		this._expansionCache.set(pluginUri, { nonce, children });
		return children;
	}

	/**
	 * Emits one {@link ICustomizationItem} per child of a per-type
	 * sub-folder. Skills are conventionally folders containing
	 * `SKILL.md`, and synced bundles may preserve per-skill
	 * subdirectories; flat skill files can still appear for legacy
	 * bundles, so both layouts are accepted.
	 *
	 * For skills, the `SKILL.md` frontmatter is read so that the item's
	 * description (and a frontmatter-supplied name, when present) can be
	 * surfaced — without it the UI would only show the folder name with
	 * no description.
	 */
	private async _collectFromTypeDir(entries: readonly { name: string; resource: URI; isDirectory: boolean }[], pluginUri: URI, promptType: PromptsType, groupKey: string, isBundleItem: boolean, token: CancellationToken): Promise<ICustomizationItem[]> {
		type Entry = { name: string; resource: URI; isDirectory: boolean };
		const eligible: Entry[] = [];
		for (const child of entries) {
			// Skip dotfiles (e.g. .DS_Store)
			if (child.name.startsWith('.')) {
				continue;
			}
			if (promptType !== PromptsType.skill && child.isDirectory) {
				continue;
			}
			eligible.push(child);
		}

		const skillMetadata = promptType === PromptsType.skill
			? await Promise.all(eligible.map(child => this._readSkillMetadata(child, token)))
			: undefined;
		if (token.isCancellationRequested) {
			return [];
		}

		const items: ICustomizationItem[] = [];
		for (let i = 0; i < eligible.length; i++) {
			const child = eligible[i];
			let displayName: string;
			let description: string | undefined;
			let uri = child.resource;
			let userInvocable: boolean | undefined;
			if (promptType === PromptsType.skill) {
				const meta = skillMetadata![i];
				// For folder-style skills the canonical resource for the skill
				// is its `SKILL.md`; downstream code (slash-command resolution,
				// chat input decorations) calls `parseNew(item.uri)` and would
				// otherwise try to read the directory as a file. If we couldn't
				// read `SKILL.md`, skip the entry rather than emit a URI that
				// will fail to parse downstream.
				if (child.isDirectory) {
					if (!meta) {
						continue;
					}
					uri = joinPath(child.resource, SKILL_FILENAME);
				}
				const fallbackName = child.isDirectory ? child.name : stripPromptFileExtensions(child.name);
				displayName = meta?.name ?? fallbackName;
				description = meta?.description;
				userInvocable = meta?.userInvocable;
			} else {
				displayName = stripPromptFileExtensions(child.name);
			}
			items.push({
				uri,
				type: promptType,
				name: displayName,
				description,
				storage: PromptsStorage.plugin,
				groupKey,
				extensionId: undefined,
				pluginUri: isBundleItem ? undefined : pluginUri,
				userInvocable
			} satisfies ICustomizationItem);
		}
		return items;
	}

	/**
	 * Reads `SKILL.md` for a skill entry and returns its frontmatter
	 * `name` / `description`. Returns `undefined` when the file cannot
	 * be read or parsed — the caller falls back to the folder name and
	 * leaves the description empty.
	 */
	private async _readSkillMetadata(entry: { name: string; resource: URI; isDirectory: boolean }, token: CancellationToken): Promise<{ name: string | undefined; description: string | undefined; userInvocable: boolean | undefined } | undefined> {
		const skillFileUri = entry.isDirectory ? joinPath(entry.resource, SKILL_FILENAME) : entry.resource;
		try {
			const content = await this._fileService.readFile(skillFileUri);
			if (token.isCancellationRequested) {
				return undefined;
			}
			const parsed = new PromptFileParser().parse(skillFileUri, content.value.toString());
			return { name: parsed.header?.name, description: parsed.header?.description, userInvocable: parsed.header?.userInvocable };
		} catch (err) {
			this._logService.trace(`[RemoteAgentCustomizationItemProvider] Failed to read skill metadata ${skillFileUri.toString()}: ${err}`);
			return undefined;
		}
	}
}

function toStatusString(status: CustomizationStatus | undefined): 'loading' | 'loaded' | 'degraded' | 'error' | undefined {
	switch (status) {
		case CustomizationStatus.Loading: return 'loading';
		case CustomizationStatus.Loaded: return 'loaded';
		case CustomizationStatus.Degraded: return 'degraded';
		case CustomizationStatus.Error: return 'error';
		default: return undefined;
	}
}

function customizationKey(customization: CustomizationRef): string {
	return customization.uri;
}

function customizationItemKey(customization: CustomizationRef, clientId: string | undefined): string {
	return clientId !== undefined
		? `${customizationKey(customization)}::${clientId}`
		: customizationKey(customization);
}

/**
 * Returns `true` for the synthetic "VS Code Synced Data" bundle plugin,
 * which is an implementation detail of the customization sync pipeline
 * and should not be surfaced as a standalone item in the UI.
 */
function isSyntheticBundle(customization: CustomizationRef): boolean {
	try {
		return URI.parse(customization.uri).scheme === SYNCED_CUSTOMIZATION_SCHEME;
	} catch {
		return false;
	}
}

/**
 * Maps a plugin sub-directory name to the {@link PromptsType}
 * its files represent. Returns `undefined` for unknown directories.
 */
function promptsTypeForPluginDir(dir: string): PromptsType | undefined {
	switch (dir) {
		case 'rules': return PromptsType.instructions;
		case 'commands': return PromptsType.prompt;
		case 'agents': return PromptsType.agent;
		case 'skills': return PromptsType.skill;
		default: return undefined;
	}
}

/**
 * Strips conventional prompt file extensions so we can show `foo`
 * for `foo.prompt.md`, `foo.instructions.md`, etc.
 */
function stripPromptFileExtensions(filename: string): string {
	const ext = extname(filename);
	if (!ext) {
		return filename;
	}
	const stem = filename.slice(0, -ext.length);
	const dotInStem = stem.lastIndexOf('.');
	return dotInStem > 0 ? stem.slice(0, dotInStem) : stem;
}
