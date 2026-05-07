/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { ResourceMap } from '../../../../base/common/map.js';
import { extname } from '../../../../base/common/path.js';
import { basename, joinPath } from '../../../../base/common/resources.js';
import { SKILL_FILENAME } from '../../../../workbench/contrib/chat/common/promptSyntax/config/promptFileLocations.js';
import { PromptFileParser } from '../../../../workbench/contrib/chat/common/promptSyntax/promptFileParser.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { URI } from '../../../../base/common/uri.js';
import { localize } from '../../../../nls.js';
import { AgentHostConfigKey, getAgentHostConfiguredCustomizations } from '../../../../platform/agentHost/common/agentHostCustomizationConfig.js';
import { agentHostUri } from '../../../../platform/agentHost/common/agentHostFileSystemProvider.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { AGENT_HOST_SCHEME, fromAgentHostUri, toAgentHostUri } from '../../../../platform/agentHost/common/agentHostUri.js';
import type { IAgentConnection } from '../../../../platform/agentHost/common/agentService.js';
import { ActionType } from '../../../../platform/agentHost/common/state/sessionActions.js';
import { type AgentInfo, type CustomizationRef, type RootState, type SessionCustomization, CustomizationStatus } from '../../../../platform/agentHost/common/state/sessionState.js';
import { IFileDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { AICustomizationManagementSection, IAICustomizationWorkspaceService, type IStorageSourceFilter } from '../../../../workbench/contrib/chat/common/aiCustomizationWorkspaceService.js';
import { type IHarnessDescriptor, type ICustomizationItem, type ICustomizationItemAction, type ICustomizationItemProvider } from '../../../../workbench/contrib/chat/common/customizationHarnessService.js';
import { PromptsType } from '../../../../workbench/contrib/chat/common/promptSyntax/promptTypes.js';
import { PromptsStorage } from '../../../../workbench/contrib/chat/common/promptSyntax/service/promptsService.js';
import { BUILTIN_STORAGE } from '../../chat/common/builtinPromptsStorage.js';
import { AgentCustomizationSyncProvider } from '../../../../workbench/contrib/chat/browser/agentSessions/agentHost/agentCustomizationSyncProvider.js';
import { SYNCED_CUSTOMIZATION_SCHEME } from '../../../../workbench/services/agentHost/common/agentHostFileSystemService.js';

export { AgentCustomizationSyncProvider as RemoteAgentSyncProvider } from '../../../../workbench/contrib/chat/browser/agentSessions/agentHost/agentCustomizationSyncProvider.js';

const REMOTE_HOST_GROUP = 'remote-host';
const REMOTE_CLIENT_GROUP = 'remote-client';

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

interface IExpandedPlugin {
	readonly nonce: string | undefined;
	readonly children: readonly ICustomizationItem[];
}

/**
 * Maps a {@link CustomizationStatus} enum value to the string literal
 * expected by {@link ICustomizationItem.status}.
 */
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
 * Owns the client-side UI commands for configuring plugins on a remote
 * agent host. The actual source of truth lives in the host's root config.
 */
export class RemoteAgentPluginController extends Disposable {
	readonly pluginActions: readonly ICustomizationItemAction[];

	constructor(
		private readonly _hostLabel: string,
		private readonly _connectionAuthority: string,
		private readonly _connection: IAgentConnection,
		@IFileDialogService private readonly _fileDialogService: IFileDialogService,
		@INotificationService private readonly _notificationService: INotificationService,
		@IAICustomizationWorkspaceService _workspaceService: IAICustomizationWorkspaceService,
	) {
		super();

		this.pluginActions = [
			{
				id: 'remoteAgentHost.addPlugin',
				label: localize('remoteAgentHost.addPlugin', "Add Remote Plugin"),
				tooltip: localize('remoteAgentHost.addPluginTooltip', "Add a plugin folder that already exists on this remote agent host."),
				icon: Codicon.remote,
				run: () => this.addConfiguredPlugin(),
			},
		];
	}

	async removeConfiguredPlugin(customizationToRemove: CustomizationRef): Promise<void> {
		const updated = this.getConfiguredCustomizations().filter(customization => customizationKey(customization) !== customizationKey(customizationToRemove));
		this.dispatchCustomizations(updated);
	}

	private getConfiguredCustomizations(): readonly CustomizationRef[] {
		const rootState = this._connection.rootState.value;
		if (!rootState || rootState instanceof Error) {
			return [];
		}

		return getAgentHostConfiguredCustomizations(rootState.config?.values);
	}

	private dispatchCustomizations(customizations: readonly CustomizationRef[]): void {
		this._connection.dispatch({
			type: ActionType.RootConfigChanged,
			config: {
				[AgentHostConfigKey.Customizations]: [...customizations],
			},
		});
	}

	private async pickRemotePluginFolder(title: string): Promise<URI | undefined> {
		try {
			const selected = await this._fileDialogService.showOpenDialog({
				canSelectFiles: false,
				canSelectFolders: true,
				canSelectMany: false,
				title,
				availableFileSystems: [AGENT_HOST_SCHEME],
				defaultUri: agentHostUri(this._connectionAuthority, '/'),
			});
			return selected?.[0];
		} catch {
			return undefined;
		}
	}

	private async addConfiguredPlugin(): Promise<void> {
		const selected = await this.pickRemotePluginFolder(localize('remoteAgentHost.selectPluginFolder', "Select Plugin Folder on {0}", this._hostLabel));
		if (!selected) {
			return;
		}

		const original = fromAgentHostUri(selected);
		const newCustomization: CustomizationRef = {
			uri: original.toString(),
			displayName: basename(original) || original.path,
		};

		const current = this.getConfiguredCustomizations();
		const nextKey = customizationKey(newCustomization);
		if (current.some(customization => customizationKey(customization) === nextKey)) {
			this._notificationService.info(localize(
				'remoteAgentHost.pluginAlreadyConfigured',
				"'{0}' is already configured on {1}.",
				newCustomization.displayName,
				this._hostLabel,
			));
			return;
		}

		this.dispatchCustomizations([...current, newCustomization]);
	}
}

/**
 * Provider that exposes a remote agent's configured plugins as
 * {@link ICustomizationItem} entries for the plugin management widget.
 *
 * Each plugin is also **expanded** into its individual customization
 * files (agents, skills, instructions, prompts) by reading the plugin
 * directory through the agent-host filesystem provider. The expanded
 * children appear in per-type sections (Skills, Agents, etc.) while
 * the parent plugin item appears in the Plugins section.
 */
export class RemoteAgentCustomizationItemProvider extends Disposable implements ICustomizationItemProvider {
	private readonly _onDidChange = this._register(new Emitter<void>());
	readonly onDidChange: Event<void> = this._onDidChange.event;

	private _agentCustomizations: readonly CustomizationRef[];
	private _sessionCustomizations: readonly SessionCustomization[] | undefined;

	/** Cache: pluginUri → last expansion (keyed by nonce so we re-fetch on content change). */
	private readonly _expansionCache = new ResourceMap<IExpandedPlugin>();

	constructor(
		private readonly _agentInfo: AgentInfo,
		private readonly _connection: IAgentConnection,
		private readonly _connectionAuthority: string,
		private readonly _controller: RemoteAgentPluginController,
		private readonly _fileService: IFileService,
		private readonly _logService: ILogService,
	) {
		super();
		this._agentCustomizations = this._readRootCustomizations(this._connection.rootState.value) ?? _agentInfo.customizations ?? [];

		this._register(this._connection.rootState.onDidChange(rootState => {
			const next = this._readRootCustomizations(rootState) ?? this._readAgentCustomizations(rootState) ?? this._agentCustomizations;
			if (next !== this._agentCustomizations) {
				this._agentCustomizations = next;
				this._onDidChange.fire();
			}
		}));

		this._register(this._connection.onDidAction(envelope => {
			if (envelope.action.type === ActionType.SessionCustomizationsChanged) {
				const customizations = (envelope.action as { customizations?: SessionCustomization[] }).customizations;
				if (customizations && customizations !== this._sessionCustomizations) {
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

	private toBadge(customization: CustomizationRef, clientId: string | undefined): { badge?: string; badgeTooltip?: string; groupKey?: string } {
		if (clientId !== undefined) {
			return {
				groupKey: REMOTE_CLIENT_GROUP,
			};
		}

		return {
			groupKey: REMOTE_HOST_GROUP,
		};
	}

	private toItem(customization: CustomizationRef, sessionCustomization: SessionCustomization | undefined): ICustomizationItem {
		const clientId = sessionCustomization?.clientId;
		const badge = this.toBadge(customization, clientId);
		const actions = clientId !== undefined
			? undefined
			: <const>[{
				id: 'remoteAgentHost.removeConfiguredPlugin',
				label: localize('remoteAgentHost.removeConfiguredPlugin', "Remove from Remote Host"),
				icon: Codicon.trash,
				run: () => this._controller.removeConfiguredPlugin(customization),
			}];

		return {
			itemKey: customizationItemKey(customization, clientId),
			uri: this.toRemoteUri(customization),
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
			pluginUri: undefined,
			userInvocable: undefined,
			actions,
		};
	}

	async provideChatSessionCustomizations(token: CancellationToken): Promise<ICustomizationItem[]> {
		const items = new Map<string, ICustomizationItem>();

		// Build parent plugin items keyed by customization ref
		type PluginMeta = { item: ICustomizationItem; nonce: string | undefined; status: ReturnType<typeof toStatusString>; statusMessage: string | undefined; enabled: boolean | undefined; childGroupKey?: string };
		const plugins: PluginMeta[] = [];

		for (const customization of this._agentCustomizations) {
			const item = this.toItem(customization, undefined);
			items.set(customizationItemKey(customization, undefined), item);
			plugins.push({ item, nonce: customization.nonce, status: undefined, statusMessage: undefined, enabled: undefined, childGroupKey: REMOTE_HOST_GROUP });
		}

		for (const sessionCustomization of this._sessionCustomizations ?? []) {
			const isBundleItem = isSyntheticBundle(sessionCustomization.customization);
			const isClientSynced = sessionCustomization.clientId !== undefined;

			// Always show session customizations as distinct plugin entries —
			// client-synced items appear in the "Local" group, host-owned in
			// the "Remote" group. The synthetic bundle is an implementation
			// detail and is not shown as a standalone entry, but is still
			// expanded below so individual user files appear in per-type tabs.
			if (!isBundleItem) {
				const item = this.toItem(sessionCustomization.customization, sessionCustomization);
				items.set(
					customizationItemKey(sessionCustomization.customization, sessionCustomization.clientId),
					item,
				);
			}

			// Always expand plugin contents so individual files are visible.
			const childGroupKey = isClientSynced ? REMOTE_CLIENT_GROUP : REMOTE_HOST_GROUP;
			plugins.push({
				item: isBundleItem
					? { uri: this.toRemoteUri(sessionCustomization.customization), type: 'plugin', name: '', storage: PromptsStorage.plugin, groupKey: childGroupKey, extensionId: undefined, pluginUri: undefined, userInvocable: undefined }
					: this.toItem(sessionCustomization.customization, sessionCustomization),
				nonce: sessionCustomization.customization.nonce,
				status: toStatusString(sessionCustomization.status),
				statusMessage: sessionCustomization.statusMessage,
				enabled: sessionCustomization.enabled,
				childGroupKey,
			});
		}

		// Expand each plugin directory in parallel to discover individual
		// skills, agents, instructions, and prompts inside.
		const expansions = await Promise.all(plugins.map(p => this._expandPluginContents(p.item.uri, p.nonce, p.childGroupKey ?? REMOTE_HOST_GROUP, token)));
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
	private async _expandPluginContents(pluginUri: URI, nonce: string | undefined, groupKey: string, token: CancellationToken): Promise<readonly ICustomizationItem[]> {
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
				children.push(...await this._collectFromTypeDir(stat.stat.children, promptType, groupKey, token));
			}
			children.sort((a, b) => `${a.type}:${a.name}`.localeCompare(`${b.type}:${b.name}`));
		} catch (err) {
			this._logService.trace(`[RemoteAgentCustomizationItemProvider] Failed to expand plugin ${pluginUri.toString()}: ${err}`);
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
	private async _collectFromTypeDir(entries: readonly { name: string; resource: URI; isDirectory: boolean }[], promptType: PromptsType, groupKey: string, token: CancellationToken): Promise<ICustomizationItem[]> {
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
				pluginUri: undefined,
				userInvocable: true
			});
		}
		return items;
	}

	/**
	 * Reads `SKILL.md` for a skill entry and returns its frontmatter
	 * `name` / `description`. Returns `undefined` when the file cannot
	 * be read or parsed — the caller falls back to the folder name and
	 * leaves the description empty.
	 */
	private async _readSkillMetadata(entry: { name: string; resource: URI; isDirectory: boolean }, token: CancellationToken): Promise<{ name: string | undefined; description: string | undefined } | undefined> {
		const skillFileUri = entry.isDirectory ? joinPath(entry.resource, SKILL_FILENAME) : entry.resource;
		try {
			const content = await this._fileService.readFile(skillFileUri);
			if (token.isCancellationRequested) {
				return undefined;
			}
			const parsed = new PromptFileParser().parse(skillFileUri, content.value.toString());
			return { name: parsed.header?.name, description: parsed.header?.description };
		} catch (err) {
			this._logService.trace(`[RemoteAgentCustomizationItemProvider] Failed to read skill metadata ${skillFileUri.toString()}: ${err}`);
			return undefined;
		}
	}
}

/**
 * Creates a {@link IHarnessDescriptor} for a remote agent discovered via
 * the agent host protocol.
 */
export function createRemoteAgentHarnessDescriptor(
	harnessId: string,
	displayName: string,
	controller: RemoteAgentPluginController,
	itemProvider: RemoteAgentCustomizationItemProvider,
	syncProvider: AgentCustomizationSyncProvider,
): IHarnessDescriptor {
	const allSources = [PromptsStorage.local, PromptsStorage.user, PromptsStorage.plugin, BUILTIN_STORAGE];
	const filter: IStorageSourceFilter = { sources: allSources };

	return {
		id: harnessId,
		label: displayName,
		icon: ThemeIcon.fromId(Codicon.remote.id),
		hiddenSections: [
			AICustomizationManagementSection.Models,
			AICustomizationManagementSection.McpServers,
		],
		hideGenerateButton: true,
		getStorageSourceFilter(_type: PromptsType): IStorageSourceFilter {
			return filter;
		},
		itemProvider,
		syncProvider,
		pluginActions: controller.pluginActions,
	};
}
