/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { raceCancellation, raceTimeout } from '../../../../../../base/common/async.js';
import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { isCancellationError } from '../../../../../../base/common/errors.js';
import { Disposable } from '../../../../../../base/common/lifecycle.js';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { ResourceMap } from '../../../../../../base/common/map.js';
import { shorten } from '../../../../../../base/common/labels.js';
import { Schemas } from '../../../../../../base/common/network.js';
import { autorun, type IObservable } from '../../../../../../base/common/observable.js';
import { URI } from '../../../../../../base/common/uri.js';
import { basename, dirname, extUri, extUriBiasedIgnorePathCase, isEqual } from '../../../../../../base/common/resources.js';
import { getCustomizationDisabledReason, isCustomizationEnabled, type CustomizationDisabledReason } from '../../../../../../platform/agentHost/common/customizationEnablement.js';
import { hasReadableCustomizationContent, isAgentBuiltinCustomizationUri } from '../../../../../../platform/agentHost/common/agentHostCustomizationUri.js';
import { CustomizationLoadStatus, CustomizationType, type AgentCustomization, type ChildCustomization, type ClientPluginCustomization, type Customization, type CustomizationLoadState, type DirectoryCustomization, PluginCustomization } from '../../../../../../platform/agentHost/common/state/sessionState.js';
import { ILogService } from '../../../../../../platform/log/common/log.js';
import { ILabelService } from '../../../../../../platform/label/common/label.js';
import { ExtensionIdentifier } from '../../../../../../platform/extensions/common/extensions.js';
import { type CustomizationSourceFolderReadiness, ICustomizationItem, ICustomizationItemAction, ICustomizationItemProvider, ICustomizationSourceFolder, type IAgentFileToolInventoryEntry } from '../../../common/customizationHarnessService.js';
import { SYNCED_CUSTOMIZATION_SCHEME } from '../../../../../services/agentHost/common/agentHostFileSystemService.js';
import { IFileService } from '../../../../../../platform/files/common/files.js';
import { toAgentHostUri } from '../../../../../../platform/agentHost/common/agentHostUri.js';
import { readAgentCustomizationMeta } from '../../../../../../platform/agentHost/common/meta/agentCustomizationMeta.js';
import { readCustomizationDiscoveryMeta } from '../../../../../../platform/agentHost/common/meta/customizationDiscoveryMeta.js';
import { AICustomizationSource, AICustomizationSources } from '../../../common/aiCustomizationWorkspaceService.js';
import { PromptsType, Target } from '../../../common/promptSyntax/promptTypes.js';
import { getAgentHookMetadata } from '../../../common/promptSyntax/hookTypes.js';
import { AgentCustomizationContentExpander } from './agentCustomizationContentExpander.js';
import { IAgentHostCustomizationService } from './agentHostCustomizationService.js';
import { type ISyncedCustomizationOrigin } from './syncedCustomizationBundler.js';
import { IAgentSource, ICustomAgent, IPromptPath, IPromptsService, PromptsStorage as PromptStorage } from '../../../common/promptSyntax/service/promptsService.js';
import { getChatSessionType } from '../../../common/model/chatUri.js';
import { ChatModeKind } from '../../../common/constants.js';
import { localize } from '../../../../../../nls.js';
import { getAgentHostPluginEnablementActions } from '../../agentPluginActions.js';


const REMOTE_HOST_GROUP = 'remote-host';
const REMOTE_CLIENT_GROUP = 'remote-client';
const SOURCE_FOLDER_CUSTOMIZATION_READINESS_TIMEOUT_MS = 2000;


type PluginMeta = { item: ICustomizationItem; nonce: string | undefined; status: ReturnType<typeof toStatusString>; statusMessage: string | undefined; enabled: boolean | undefined; disabledReason: CustomizationDisabledReason | undefined; childGroupKey: string; isBundleItem: boolean; pluginLabel: string | undefined };


export class AgentCustomizationItemProvider extends Disposable implements ICustomizationItemProvider {
	private readonly _onDidChange = this._register(new Emitter<void>());
	readonly onDidChange: Event<void> = this._onDidChange.event;

	/** Cache: pluginUri → last expansion (keyed by nonce and label so we re-fetch on content or display-name changes). */
	private readonly _expansionCache = new ResourceMap<{ nonce: string | undefined; pluginLabel: string | undefined; children: readonly ICustomizationItem[] }>();
	private readonly _sourceFolderReadiness = new ResourceMap<{
		readonly bounded: Promise<boolean | undefined>;
		status: CustomizationSourceFolderReadiness;
	}>();
	private readonly _contentExpander: AgentCustomizationContentExpander;
	protected readonly _sourceFolderReadinessTimeoutMs: number = SOURCE_FOLDER_CUSTOMIZATION_READINESS_TIMEOUT_MS;
	private _draftCustomAgents: IObservable<readonly AgentCustomization[]> | undefined;
	private _draftCustomizations: IObservable<readonly ClientPluginCustomization[]> | undefined;

	constructor(
		private readonly _connectionAuthority: string,
		private readonly _getItemActions: ((customization: PluginCustomization, clientId: string | undefined) => ICustomizationItemAction[] | undefined) | undefined,
		private readonly _resolveSyncedOrigin: ((syncedUri: URI) => ISyncedCustomizationOrigin | undefined) | undefined,
		@IFileService private readonly _fileService: IFileService,
		@ILogService private readonly _logService: ILogService,
		@IAgentHostCustomizationService private readonly _customAgentsService: IAgentHostCustomizationService,
		@IPromptsService private readonly _promptsService: IPromptsService,
		@ILabelService private readonly _labelService: ILabelService,
	) {
		super();
		this._contentExpander = new AgentCustomizationContentExpander(this._fileService, this._logService);

		this._register(this._customAgentsService.onDidChangeCustomizations(() => {
			this._onDidChange.fire();
		}));
		this._register(this._promptsService.onDidChangeSkills(() => {
			this._onDidChange.fire();
		}));
	}

	setDraftCustomAgents(customAgents: IObservable<readonly AgentCustomization[]>): void {
		this._draftCustomAgents = customAgents;
		this._register(autorun(reader => {
			customAgents.read(reader);
			this._onDidChange.fire();
		}));
	}

	setDraftCustomizations(customizations: IObservable<readonly ClientPluginCustomization[]>): void {
		this._draftCustomizations = customizations;
		this._register(autorun(reader => {
			customizations.read(reader);
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

	private toItem(sessionResource: URI, customization: PluginCustomization, source: AICustomizationSource): ICustomizationItem {
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
			enabled: isCustomizationEnabled(customization),
			disabledReason: getCustomizationDisabledReason(customization),
			badge: badge.badge,
			badgeTooltip: badge.badgeTooltip,
			groupKey: badge.groupKey,
			extensionId: undefined,
			pluginUri: uri,
			userInvocable: undefined,
			actions: [
				...(clientId === undefined ? getAgentHostPluginEnablementActions(this._customAgentsService, undefined, sessionResource, customization, this._customAgentsService.getWorkingDirectories(sessionResource).length > 0) : []),
				...(this._getItemActions?.(customization, clientId) ?? []),
			],
		};
	}

	private toDirectoryItems(customization: DirectoryCustomization, source: AICustomizationSource, isRemote: boolean, workingDirectories: readonly string[]): ICustomizationItem[] {
		const items: ICustomizationItem[] = [];
		if (!customization.children?.length && customization.contents === CustomizationType.Hook
			&& !hasReadableCustomizationContent(URI.parse(customization.uri))
			&& (customization.load?.kind === CustomizationLoadStatus.Error || customization.load?.kind === CustomizationLoadStatus.Degraded)) {
			items.push({
				itemKey: customization.id, uri: this.toRemoteUri(customization.uri), type: PromptsType.hook,
				name: customization.name, source, description: customization.load.message,
				extensionId: undefined, pluginUri: undefined,
			});
		}
		for (const child of customization.children ?? []) {
			const item = this.toDirectoryChildItem(child, getDirectoryChildSource(workingDirectories, child.uri, source), isRemote);
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
		const discovery = readCustomizationDiscoveryMeta(child);
		if (discovery) {
			source = discovery.source === 'plugin' ? AICustomizationSources.plugin
				: discovery.source === 'repository' ? AICustomizationSources.local : AICustomizationSources.user;
		}
		const hookMetadata = discovery?.hookType ? getAgentHookMetadata(Target.GitHubCopilot, discovery.hookType) : undefined;
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
			name: hookMetadata?.label ?? child.name,
			description: discovery?.hookType
				? discovery.sourceLabel
					? localize('discoveredHookSource', "{0} — Source file unavailable", discovery.sourceLabel)
					: localize('discoveredHookSourceUnavailable', "Source file unavailable")
				: getChildDescription(child),
			enabled: child.type === CustomizationType.McpServer ? isCustomizationEnabled(child) : child.enabled,
			source,
			groupKey,
			badge,
			badgeTooltip,
			extensionId: undefined,
			pluginUri: undefined,
			userInvocable,
		};
	}

	async provideSourceFolders(sessionResource: URI, type: PromptsType, token: CancellationToken): Promise<readonly ICustomizationSourceFolder[]> {
		// One-shot callers (the migration hint) must not read the empty
		// placeholder a still-loading session reports, or they conclude there is
		// nothing to migrate.
		let readinessEntry = this._sourceFolderReadiness.get(sessionResource);
		if (!readinessEntry || readinessEntry.status === 'unavailable') {
			const readiness = this._customAgentsService.whenCustomizationsReady(sessionResource);
			const entry = {
				bounded: raceTimeout(readiness, this._sourceFolderReadinessTimeoutMs),
				status: 'loading' as CustomizationSourceFolderReadiness,
			};
			readinessEntry = entry;
			this._sourceFolderReadiness.set(sessionResource, entry);
			void readiness.then(
				ready => entry.status = ready ? 'ready' : 'unavailable',
				() => entry.status = 'unavailable',
			);
		}
		const ready = await raceCancellation(readinessEntry.bounded, token);
		if (ready !== undefined) {
			readinessEntry.status = ready ? 'ready' : 'unavailable';
		}
		const workingDirectories = this._customAgentsService.getWorkingDirectories(sessionResource);
		const clientWorkingDirectories = this._customAgentsService.getClientWorkingDirectoryUris(sessionResource);

		const folders: ICustomizationSourceFolder[] = [];
		for (const customization of this._customAgentsService.getCustomizations(sessionResource)) {
			if (!isDirectoryCustomization(customization) || !customization.writable) {
				continue;
			}
			if (toPromptsType(customization.contents) !== type) {
				continue;
			}
			const source = isUnderAnyRoot(workingDirectories, customization.uri) ? AICustomizationSources.local : AICustomizationSources.user;
			const workspaceFolderIndex = workingDirectories.findIndex(root => isParentOrEqual(root, customization.uri));
			folders.push({
				uri: this.toRemoteUri(customization.uri),
				label: customization.name,
				source,
				destinationGroupId: dirname(this.toRemoteUri(customization.uri)).toString(),
				workspaceGroupId: clientWorkingDirectories[workspaceFolderIndex]?.toString(),
			});
		}
		return folders;
	}

	getSourceFolderReadiness(sessionResource: URI): CustomizationSourceFolderReadiness {
		return this._sourceFolderReadiness.get(sessionResource)?.status ?? 'loading';
	}

	getWorkspaceGroupId(sessionResource: URI, resource: URI): string | undefined {
		return this._customAgentsService.getClientWorkingDirectoryUris(sessionResource)
			.find(root => extUriBiasedIgnorePathCase.isEqualOrParent(resource, root))
			?.toString();
	}

	async provideCustomAgents(sessionResource: URI, token: CancellationToken): Promise<readonly ICustomAgent[]> {
		await this._customAgentsService.whenCustomizationsReady(sessionResource, token);
		if (token.isCancellationRequested) {
			return [];
		}

		const agents = this.getCustomAgents(sessionResource);
		const sourceLabels = await this.getAgentSourceLabels(sessionResource, agents, token);
		if (token.isCancellationRequested) {
			return [];
		}
		const sessionTypes = [getChatSessionType(sessionResource)];
		return agents.map((agent, index) => {
			const isAsk = readAgentCustomizationMeta(agent)['vscode.chatMode'] === 'ask';
			return {
				id: agent.uri,
				kind: isAsk ? ChatModeKind.Ask : undefined,
				uri: this.toRemoteUri(agent.uri),
				name: agent.name,
				description: agent.description,
				sessionTypes: sessionTypes,
				enabled: true,
				// fill default/empty values for all other properties they will not be used by the UI
				// when making a request, all that's needed is the agent id.
				source: {
					storage: isAsk ? PromptStorage.builtIn : PromptStorage.local,
					...(sourceLabels[index] !== undefined ? { label: sourceLabels[index] } : {}),
				} satisfies IAgentSource,
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
			} satisfies ICustomAgent;
		});

	}

	async provideAgentFileTools(sessionResource: URI, token: CancellationToken): Promise<readonly IAgentFileToolInventoryEntry[] | undefined> {
		if (token.isCancellationRequested) {
			return undefined;
		}
		return this._customAgentsService.getAgentFileToolInventory?.(sessionResource);
	}

	async provideChatSessionCustomizations(sessionResource: URI, token: CancellationToken): Promise<ICustomizationItem[]> {
		const items = new Map<string, ICustomizationItem>();
		const workingDirectories = this._customAgentsService.getWorkingDirectories(sessionResource);

		// Build parent plugin items keyed by customization ref
		const plugins: PluginMeta[] = [];
		const expandPromises: Promise<readonly ICustomizationItem[]>[] = [];

		const customizations = this.getCustomizations(sessionResource);

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
					item = this.toItem(sessionResource, sessionCustomization, AICustomizationSources.plugin);
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
					enabled: isCustomizationEnabled(sessionCustomization),
					disabledReason: getCustomizationDisabledReason(sessionCustomization),
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
				// Files flattened into the synthetic bundle lost their original
				// provenance; recover it (extension/plugin/built-in and source
				// location) so the item reflects where it actually came from.
				const enriched = p.isBundleItem ? this._applySyncedOrigin(child) : child;
				// Children inherit the parent plugin's status/enabled state.
				items.set(enriched.uri.toString(), {
					...enriched,
					status: p.status,
					statusMessage: p.statusMessage,
					enabled: p.enabled,
					disabledReason: p.disabledReason,
				});
			}
		}

		for (const sessionCustomization of directoryCustomizations) {
			const source = isAgentBuiltinCustomizationUri(URI.parse(sessionCustomization.uri))
				? AICustomizationSources.builtin
				: isUnderAnyRoot(workingDirectories, sessionCustomization.uri) ? AICustomizationSources.local : AICustomizationSources.user;
			const isRemote = sessionCustomization.clientId !== undefined;
			for (const child of this.toDirectoryItems(sessionCustomization, source, isRemote, workingDirectories)) {
				items.set(child.itemKey ?? child.uri.toString(), {
					...child,
					status: toStatusString(sessionCustomization.load),
					statusMessage: toStatusMessage(sessionCustomization.load),
					enabled: sessionCustomization.enabled && child.enabled !== false,
				});
			}
		}

		const disabledBuiltinSkills = this._promptsService.getDisabledPromptFiles(PromptsType.skill);
		const builtinSkills = await this._promptsService.listPromptFilesForStorage(PromptsType.skill, PromptStorage.builtIn, token);
		if (token.isCancellationRequested) {
			return [];
		}
		for (const skill of builtinSkills) {
			if (!disabledBuiltinSkills.has(skill.uri)) {
				continue;
			}
			const key = skill.uri.toString();
			const existing = items.get(key);
			items.set(key, {
				...existing,
				uri: skill.uri,
				type: PromptsType.skill,
				name: skill.name ?? existing?.name ?? basename(dirname(skill.uri)),
				description: skill.description ?? existing?.description,
				source: AICustomizationSources.builtin,
				extensionId: undefined,
				pluginUri: undefined,
				enabled: false,
				userInvocable: true,
			});
		}
		return [...items.values()];
	}

	private getCustomAgents(sessionResource: URI): readonly AgentCustomization[] {
		const sessionAgents = this._customAgentsService.getCustomAgents(sessionResource);
		return sessionAgents.length > 0 ? sessionAgents : this._draftCustomAgents?.get() ?? [];
	}

	private async getAgentSourceLabels(sessionResource: URI, agents: readonly AgentCustomization[], token: CancellationToken): Promise<readonly (string | undefined)[]> {
		let extensionFiles: readonly IPromptPath[] = [];
		try {
			extensionFiles = await this._promptsService.listPromptFilesForStorage(PromptsType.agent, PromptStorage.extension, token);
		} catch (error) {
			if (isCancellationError(error)) {
				throw error;
			}
			this._logService.warn('[AgentCustomizationItemProvider] Failed to resolve extension source labels', error);
		}
		const extensionLabels = new Map<string, string>();
		const extensionIdsByUri = new ResourceMap<string>();
		for (const file of extensionFiles) {
			if (file.storage === PromptStorage.extension) {
				const id = file.extension.identifier.value;
				extensionLabels.set(ExtensionIdentifier.toKey(id), file.extension.displayName || file.extension.name);
				extensionIdsByUri.set(file.uri, id);
			}
		}
		const origins = new Map(agents.map(agent => {
			const sourceUri = readAgentCustomizationMeta(agent)['vscode.sourceUri'];
			const origin = sourceUri !== undefined ? this._resolveSyncedOrigin?.(URI.parse(sourceUri)) : undefined;
			return [agent, origin ?? this._resolveSyncedOrigin?.(this.toRemoteUri(agent.uri))] as const;
		}));
		const containers = this.getCustomizations(sessionResource).filter((candidate): candidate is PluginCustomization | DirectoryCustomization =>
			candidate.type !== CustomizationType.McpServer
			&& (candidate.type === CustomizationType.Plugin ? isCustomizationEnabled(candidate) : candidate.enabled));
		const roots = this._customAgentsService.getWorkingDirectories(sessionResource);
		const drafts = this._draftCustomAgents?.get() ?? [];
		const labels = agents.map(agent => {
			if (readAgentCustomizationMeta(agent)['vscode.chatMode'] === 'ask') {
				return undefined;
			}
			const uri = URI.parse(agent.uri);
			const published = containers.find(candidate => candidate.children?.some(child => child.type === CustomizationType.Agent && isEqual(URI.parse(child.uri), uri)));
			const isDraft = drafts.some(candidate => isEqual(URI.parse(candidate.uri), uri));
			const origin = origins.get(agent);
			const extensionId = (origin?.source === AICustomizationSources.extension ? origin.extensionId : undefined)
				?? (isDraft ? extensionIdsByUri.get(uri) : undefined);
			const extensionLabel = extensionId
				? localize('agentSource.extension', "Extension: {0}", extensionLabels.get(ExtensionIdentifier.toKey(extensionId)) ?? extensionId)
				: undefined;
			const draftContainers = !published && isDraft
				? containers.filter(candidate => candidate.type === CustomizationType.Plugin && extUri.isEqualOrParent(uri, URI.parse(candidate.uri)))
				: [];
			const container = published ?? (draftContainers.length === 1 ? draftContainers[0] : undefined);
			if (container?.type === CustomizationType.Plugin) {
				return isSyntheticBundle(container)
					? extensionLabel ?? localize('agentSource.vscode', "VS Code")
					: localize('agentSource.plugin', "Plugin: {0}", container.name);
			}
			if (container?.type === CustomizationType.Directory) {
				if (isAgentBuiltinCustomizationUri(URI.parse(container.uri))) {
					return localize('agentSource.builtin', "Built-In");
				}
				return isUnderAnyRoot(roots, agent.uri)
					? localize('agentSource.workspace', "Workspace")
					: localize('agentSource.folder', "Folder: {0}", container.name);
			}
			return isDraft
				? extensionLabel ?? localize('agentSource.vscode', "VS Code")
				: localize('agentSource.host', "Agent Host");
		});
		const getSourceUri = (agent: AgentCustomization): URI => {
			return origins.get(agent)?.uri ?? this.toRemoteUri(agent.uri);
		};
		return labels.map((label, index) => {
			if (label === undefined) {
				return undefined;
			}
			const agent = agents[index];
			const siblings = agents.filter((other, otherIndex) => otherIndex !== index && other.name === agent.name && labels[otherIndex] === label);
			if (siblings.length === 0) {
				return label;
			}
			const filename = basename(getSourceUri(agent));
			let location = filename;
			if (!filename || siblings.some(other => basename(getSourceUri(other)) === filename)) {
				const locations = [agent, ...siblings].map(other => this._labelService.getUriLabel(getSourceUri(other)));
				location = shorten(locations, locations.some(path => path.includes('\\')) ? '\\' : '/')[0];
			}
			return localize('agentSource.location', "{0} ({1})", label, location);
		});
	}

	private getCustomizations(sessionResource: URI): readonly Customization[] {
		const sessionCustomizations = this._customAgentsService.getCustomizations(sessionResource);
		const draftCustomizations = this._draftCustomizations?.get() ?? [];
		if (draftCustomizations.length === 0) {
			return sessionCustomizations;
		}

		const sessionKeys = new Set(sessionCustomizations.map(customization => `${customization.type}:${customization.uri}`));
		return [
			...sessionCustomizations,
			...draftCustomizations.filter(customization => !sessionKeys.has(`${customization.type}:${customization.uri}`)),
		];
	}

	/**
	 * Rewrites a bundle child item to reflect the original source location of
	 * the flattened file, when it can be recovered from the synthetic bundle's
	 * reverse map. The synced (in-memory) URI is replaced with the real local
	 * URI so the item points at its true origin, and the source/extension/plugin
	 * metadata is restored. Returns the item unchanged when no origin is known.
	 */
	private _applySyncedOrigin(child: ICustomizationItem): ICustomizationItem {
		const origin = this._resolveSyncedOrigin?.(child.uri);
		if (!origin) {
			return child;
		}
		return {
			...child,
			uri: origin.uri,
			source: origin.source,
			extensionId: origin.extensionId,
			pluginUri: origin.pluginUri,
			groupKey: origin.source === AICustomizationSources.user ? child.groupKey : undefined,
		};
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
	try {
		return extUriBiasedIgnorePathCase.isEqualOrParent(URI.parse(childURI), URI.parse(folderURI));
	} catch {
		return childURI === folderURI || childURI.startsWith(folderURI + '/');
	}
}

/** True when `childURI` is contained by (or equal to) any of the workspace roots. */
function isUnderAnyRoot(roots: readonly string[], childURI: string): boolean {
	return roots.some(root => isParentOrEqual(root, childURI));
}

function getDirectoryChildSource(roots: readonly string[], childURI: string, fallback: AICustomizationSource): AICustomizationSource {
	try {
		if (URI.parse(childURI).scheme !== Schemas.file) {
			return fallback;
		}
	} catch {
		return fallback;
	}
	return isUnderAnyRoot(roots, childURI) ? AICustomizationSources.local : AICustomizationSources.user;
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
