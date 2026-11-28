/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { raceCancellation, raceTimeout } from '../../../../../../base/common/async.js';
import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { isCancellationError } from '../../../../../../base/common/errors.js';
import { Disposable } from '../../../../../../base/common/lifecycle.js';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { ResourceMap, ResourceSet } from '../../../../../../base/common/map.js';
import { shorten } from '../../../../../../base/common/labels.js';
import { Schemas } from '../../../../../../base/common/network.js';
import { autorun, type IObservable } from '../../../../../../base/common/observable.js';
import { URI } from '../../../../../../base/common/uri.js';
import { basename, dirname, extUri, extUriBiasedIgnorePathCase, isEqual } from '../../../../../../base/common/resources.js';
import { getCustomizationDisabledReason, getSkillCustomizations, isCustomizationEnabled, type CustomizationDisabledReason } from '../../../../../../platform/agentHost/common/customizationEnablement.js';
import { getMcpSkillNamePrefix, hasReadableCustomizationContent, isAgentBuiltinCustomizationUri } from '../../../../../../platform/agentHost/common/agentHostCustomizationUri.js';
import { CustomizationLoadStatus, CustomizationType, type AgentCustomization, type ChildCustomization, type ClientPluginCustomization, type Customization, type CustomizationLoadState, type DirectoryCustomization, PluginCustomization } from '../../../../../../platform/agentHost/common/state/sessionState.js';
import { ILogService } from '../../../../../../platform/log/common/log.js';
import { ILabelService } from '../../../../../../platform/label/common/label.js';
import { ExtensionIdentifier } from '../../../../../../platform/extensions/common/extensions.js';
import { type CustomizationSourceFolderReadiness, ICustomizationItem, ICustomizationItemAction, ICustomizationItemProvider, ICustomizationSectionNotice, ICustomizationSourceFolder, type IAgentFileToolInventoryEntry } from '../../../common/customizationHarnessService.js';
import { SYNCED_CUSTOMIZATION_SCHEME } from '../../../../../services/agentHost/common/agentHostFileSystemService.js';
import { IFileService } from '../../../../../../platform/files/common/files.js';
import { type IAgentConnection } from '../../../../../../platform/agentHost/common/agentService.js';
import { getAgentHostCustomizationSource, getAgentHostCustomizationUri } from '../../../common/agentHostSessionCustomizations.js';
import { readMcpServerDisplayName, readMcpServerSource } from '../../../../../../platform/agentHost/common/meta/mcpCustomizationMeta.js';
import { readAgentCustomizationMeta, readCustomizationSourceUri } from '../../../../../../platform/agentHost/common/meta/agentCustomizationMeta.js';
import { readCustomizationDiscoveryMeta } from '../../../../../../platform/agentHost/common/meta/customizationDiscoveryMeta.js';
import { readSkillArgumentHint } from '../../../../../../platform/agentHost/common/meta/skillCustomizationMeta.js';
import { readRuntimePluginEnablement } from '../../../../../../platform/agentHost/common/meta/pluginEnablementMeta.js';
import { readCustomizationOrganizationMeta } from '../../../../../../platform/agentHost/common/meta/customizationOrganizationMeta.js';
import { readCustomizationTeamProvided } from '../../../../../../platform/agentHost/common/meta/customizationTeamMeta.js';
import { AICustomizationScope, AICustomizationScopes, AICustomizationSource, AICustomizationSources } from '../../../common/aiCustomizationWorkspaceService.js';
import { PromptFileSource, PromptsType, Target } from '../../../common/promptSyntax/promptTypes.js';
import { getAgentHookMetadata } from '../../../common/promptSyntax/hookTypes.js';
import { PromptFileParser } from '../../../common/promptSyntax/promptFileParser.js';
import { getHookSourceFormat, HookSourceFormat } from '../../../common/promptSyntax/hookCompatibility.js';
import { AgentCustomizationContentExpander } from './agentCustomizationContentExpander.js';
import { IAgentHostCustomizationService } from './agentHostCustomizationService.js';
import { type ISyncedCustomizationOrigin } from './syncedCustomizationBundler.js';
import { IAgentSource, ICustomAgent, IExtensionPromptPath, IPromptsService, PromptsStorage as PromptStorage } from '../../../common/promptSyntax/service/promptsService.js';
import { IChatExtensionCustomizationsService } from '../../../common/promptSyntax/service/chatExtensionCustomizationsService.js';
import { IAgenticSkillsService } from '../../../common/promptSyntax/service/agenticSkillsService.js';
import { getChatSessionType } from '../../../common/model/chatUri.js';
import { ChatModeKind } from '../../../common/constants.js';
import { localize } from '../../../../../../nls.js';
import { getAgentHostPluginEnablementActions } from '../../agentPluginActions.js';
import { CUSTOM_AGENT_HOOK_ITEM_KEY_PREFIX, type ICustomizationHookItem, type ICustomizationSkillItem } from '../../aiCustomization/aiCustomizationItemSource.js';
import { getMcpCustomizationSource } from '../../aiCustomization/mcpCustomizationSource.js';


const REMOTE_HOST_GROUP = 'remote-host';
const REMOTE_CLIENT_GROUP = 'remote-client';
const SOURCE_FOLDER_CUSTOMIZATION_READINESS_TIMEOUT_MS = 2000;
const SYNCED_FROM_CLIENT = 'syncedFromClient' as const;


type PluginMeta = { item: ICustomizationItem; nonce: string | undefined; status: ReturnType<typeof toStatusString>; statusMessage: string | undefined; enabled: boolean | undefined; disabledReason: CustomizationDisabledReason | undefined; delivery: typeof SYNCED_FROM_CLIENT | undefined; isBundleItem: boolean; isDraft: boolean; pluginLabel: string | undefined };


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
	private _listsCustomAgentHooks = false;
	/** The client's workspace folders, set when this provider lists the local hook files that its agent host won't run. */
	private _hooksNotRunningWorkspaceFolders: (() => readonly URI[]) | undefined;
	private _draftCustomizations: IObservable<readonly ClientPluginCustomization[]> | undefined;

	constructor(
		private readonly _connection: Pick<IAgentConnection, 'clientId' | 'resourceUris'>,
		private readonly _getItemActions: ((customization: PluginCustomization, clientId: string | undefined) => ICustomizationItemAction[] | undefined) | undefined,
		private readonly _resolveSyncedOrigin: ((syncedUri: URI) => ISyncedCustomizationOrigin | undefined) | undefined,
		@IFileService private readonly _fileService: IFileService,
		@ILogService private readonly _logService: ILogService,
		@IAgentHostCustomizationService private readonly _customAgentsService: IAgentHostCustomizationService,
		@IPromptsService private readonly _promptsService: IPromptsService,
		@IChatExtensionCustomizationsService private readonly _extensionCustomizations: IChatExtensionCustomizationsService,
		@IAgenticSkillsService private readonly _agenticSkills: IAgenticSkillsService,
		@ILabelService private readonly _labelService: ILabelService,
	) {
		super();
		this._contentExpander = new AgentCustomizationContentExpander(this._fileService, this._logService);

		this._register(this._customAgentsService.onDidChangeCustomizations(() => {
			this._onDidChange.fire();
		}));
		this._register(this._agenticSkills.onDidChange(() => {
			this._onDidChange.fire();
		}));
	}

	/** Lists the hooks declared in custom agent files, for agent hosts whose runtime runs them. */
	setListsCustomAgentHooks(lists: boolean): void {
		this._listsCustomAgentHooks = lists;
		this._onDidChange.fire();
	}

	/**
	 * Lists the hook files that VS Code's own harness runs and this agent host doesn't. Only for the local Copilot agent
	 * host, which shares the client's file system and reads hooks from the same kind of files.
	 */
	listHooksNotRunning(workspaceFolders: () => readonly URI[]): void {
		this._hooksNotRunningWorkspaceFolders = workspaceFolders;
		this._register(this._promptsService.onDidChangeHooks(() => this._onDidChange.fire()));
		this._onDidChange.fire();
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
		return getAgentHostCustomizationUri(URI.parse(customizationUri), this._connection)!;
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

	private toItem(sessionResource: URI, customization: PluginCustomization, source: AICustomizationSource, uri: URI): ICustomizationItem {
		const clientId = customization.clientId; // set if the configuration came from the client
		const runtime = readRuntimePluginEnablement(customization);
		return {
			itemKey: customizationItemKey(customization, clientId),
			uri: uri,
			type: 'plugin',
			name: customization.name,
			description: undefined,
			source,
			scope: AICustomizationScopes.fromSource(getAgentHostCustomizationSource(customization) ?? source),
			delivery: clientId !== undefined ? SYNCED_FROM_CLIENT : undefined,
			status: toStatusString(customization.load),
			statusMessage: toStatusMessage(customization.load) ?? (runtime && runtime.effectiveEnabled === undefined && customization.load?.kind === CustomizationLoadStatus.Loading
				? localize('pluginWaitingForSessionStart', "Waiting for Session Start")
				: undefined),
			enabled: runtime && runtime.effectiveEnabled === undefined ? undefined : isCustomizationEnabled(customization),
			disabledReason: getCustomizationDisabledReason(customization),
			// A plugin the runtime installed states what the organization requires with its activation.
			organizationControl: readCustomizationOrganizationMeta(customization)
				?? (runtime?.managedDesiredEnabled !== undefined ? { requiredEnabled: runtime.managedDesiredEnabled } : undefined),
			...(readCustomizationTeamProvided(customization) ? { teamProvided: true } : {}),
			extensionId: undefined,
			pluginUri: uri,
			userInvocable: undefined,
			actions: [
				...(clientId === undefined ? getAgentHostPluginEnablementActions(this._customAgentsService, undefined, sessionResource, customization, this._customAgentsService.getWorkingDirectories(sessionResource).length > 0) : []),
				...(this._getItemActions?.(customization, clientId) ?? []),
			],
		};
	}

	private toDirectoryItems(customization: DirectoryCustomization, source: AICustomizationSource, scope: AICustomizationScope | undefined, isRemote: boolean, workingDirectories: readonly string[]): ICustomizationItem[] {
		const items: ICustomizationItem[] = [];
		if (!customization.children?.length && customization.contents === CustomizationType.Hook && customization.enabled === false
			&& !hasReadableCustomizationContent(URI.parse(customization.uri))
			&& customization.load?.kind === CustomizationLoadStatus.Degraded) {
			// A disabled, degraded directory without hooks still explains why hooks won't run, such as hooks being turned off.
			// Other directories without hooks that report a problem are shown as section notices instead.
			items.push({
				itemKey: customization.id, uri: this.toRemoteUri(customization.uri), type: PromptsType.hook,
				name: customization.name, source, description: customization.load.message,
				extensionId: undefined, pluginUri: undefined,
				enabled: false, status: 'degraded', statusMessage: customization.load.message, badge: localize('customizationWontRun', "Won't run"), badgeTooltip: customization.load.message,
			});
		}
		// A disabled directory that reports a degraded load explains why its disabled children won't run.
		const notRunningMessage = customization.enabled === false && customization.load?.kind === CustomizationLoadStatus.Degraded ? customization.load.message : undefined;
		for (const child of customization.children ?? []) {
			const childSource = scope !== undefined || source === AICustomizationSources.builtin ? source : getDirectoryChildSource(workingDirectories, child.uri, source);
			const item = this.toDirectoryChildItem(child, childSource, scope, isRemote);
			if (item) {
				items.push(notRunningMessage && child.type === CustomizationType.Hook && child.enabled === false ? {
					...item,
					status: 'degraded',
					statusMessage: notRunningMessage,
					badge: localize('customizationWontRun', "Won't run"),
					badgeTooltip: notRunningMessage,
				} : item);
			}
		}
		return items;
	}

	private toDirectoryChildItem(child: ChildCustomization, source: AICustomizationSource, scope: AICustomizationScope | undefined, isRemote: boolean): ICustomizationHookItem | undefined {
		const type = toPromptsType(child.type);
		if (!type) {
			return undefined;
		}
		const discovery = readCustomizationDiscoveryMeta(child);
		if (discovery) {
			source = getAgentHostCustomizationSource(child) ?? AICustomizationSources.user;
			scope = AICustomizationScopes.fromSource(source);
		}
		const hookMetadata = discovery?.hookType ? getAgentHookMetadata(Target.GitHubCopilot, discovery.hookType) : undefined;
		let userInvocable: boolean | undefined = undefined;
		if (child.type === CustomizationType.Agent) {
			userInvocable = readAgentCustomizationMeta(child).userInvocable !== false;
		} else if (child.type === CustomizationType.Skill) {
			userInvocable = child.disableUserInvocation !== true;
		}
		let groupKey: string | undefined;
		let badge: string | undefined = undefined;
		let badgeTooltip: string | undefined = undefined;
		if (child.type === CustomizationType.Rule) {
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

		const uri = this.toRemoteUri(child.uri);
		let description = getChildDescription(child);
		if (discovery?.hookType) {
			description = hasReadableCustomizationContent(uri) ? discovery.sourceLabel
				: discovery.sourceLabel
					? localize('discoveredHookSource', "{0} — Source file unavailable", discovery.sourceLabel)
					: localize('discoveredHookSourceUnavailable', "Source file unavailable");
		}

		return {
			itemKey: child.id,
			uri,
			type,
			name: hookMetadata?.label ?? child.name,
			description,
			argumentHint: child.type === CustomizationType.Skill ? readSkillArgumentHint(child) : undefined,
			...(child.type === CustomizationType.Hook && discovery?.hookType ? { isHookAction: true } : {}),
			enabled: child.type === CustomizationType.McpServer ? isCustomizationEnabled(child) : child.enabled,
			source,
			scope,
			origin: source === AICustomizationSources.builtin ? { kind: 'harness' } : undefined,
			// Hooks from managed policy can't be disabled by the user.
			organizationControl: child.type === CustomizationType.Hook && discovery?.source === 'policy' ? (child.enabled === false ? {} : { requiredEnabled: true }) : undefined,
			delivery: isRemote ? SYNCED_FROM_CLIENT : undefined,
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
			const roots = workingDirectories;
			const source = getAgentHostCustomizationSource(customization)
				?? (isUnderAnyRoot(roots, customization.uri) ? AICustomizationSources.local : AICustomizationSources.user);
			const workspaceFolderIndex = roots.findIndex(root => isParentOrEqual(root, customization.uri));
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
		const sources = await this.getAgentSources(sessionResource, agents, token);
		if (token.isCancellationRequested) {
			return [];
		}
		const sessionTypes = [getChatSessionType(sessionResource)];
		const drafts = this._draftCustomAgents?.get() ?? [];
		return agents.map((agent, index) => {
			const meta = readAgentCustomizationMeta(agent);
			const isAsk = meta['vscode.chatMode'] === 'ask';
			const uri = drafts.includes(agent) ? URI.parse(agent.uri) : this.toRemoteUri(agent.uri);
			return {
				id: uri.toString(),
				kind: isAsk ? ChatModeKind.Ask : undefined,
				uri,
				sourceUri: sources[index].sourceUri,
				name: agent.name,
				description: agent.description,
				sessionTypes: sessionTypes,
				enabled: true,
				// fill default/empty values for all other properties they will not be used by the UI
				// when making a request, all that's needed is the agent id.
				source: sources[index].source,
				tools: undefined,
				agents: undefined,
				argumentHint: meta['vscode.argumentHint'],
				welcomeMessage: meta['vscode.welcomeMessage'],
				handOffs: undefined,
				hooks: undefined,
				model: meta['vscode.models'] ?? (agent.model ? [agent.model] : undefined),
				reasoningEffort: meta['vscode.reasoningEffort'],
				modelPolicy: meta['vscode.modelPolicy'],
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
		await this._customAgentsService.whenCustomizationsReady(sessionResource, token);
		if (token.isCancellationRequested) {
			return undefined;
		}
		return this._customAgentsService.getAgentFileToolInventory?.(sessionResource);
	}

	async provideSectionNotices(sessionResource: URI, type: PromptsType): Promise<readonly ICustomizationSectionNotice[]> {
		if (type !== PromptsType.hook) {
			return [];
		}
		const notices: ICustomizationSectionNotice[] = [];
		for (const customization of this._customAgentsService.getCustomizations(sessionResource)) {
			// A hook directory with no files of its own that failed to load reports problems with the section's hooks,
			// such as files that could not be loaded, rather than with an item.
			// Disabled directories without hooks explain why hooks won't run and are listed as rows instead.
			if (isDirectoryCustomization(customization) && customization.contents === CustomizationType.Hook && !customization.children?.length
				&& customization.enabled !== false && !hasReadableCustomizationContent(URI.parse(customization.uri))
				&& (customization.load?.kind === CustomizationLoadStatus.Error || customization.load?.kind === CustomizationLoadStatus.Degraded)) {
				notices.push({
					severity: customization.load.kind === CustomizationLoadStatus.Error ? 'error' : 'warning',
					title: customization.name,
					message: customization.load.message,
				});
			}
		}
		return notices;
	}

	async provideChatSessionCustomizations(sessionResource: URI, token: CancellationToken): Promise<ICustomizationItem[]> {
		const items = new Map<string, ICustomizationSkillItem>();
		const workingDirectories = this._customAgentsService.getWorkingDirectories(sessionResource);

		// Build parent plugin items keyed by customization ref
		const plugins: PluginMeta[] = [];
		const expandPromises: Promise<readonly ICustomizationItem[]>[] = [];

		const snapshot = this._customAgentsService.getCustomizations(sessionResource);
		const draftPlugins = new Set(this.getDraftCustomizations(snapshot));
		const customizations = await this._customAgentsService.resolveRuntimePluginEnablement?.(sessionResource, snapshot) ?? snapshot;
		if (token.isCancellationRequested) {
			return [];
		}

		const directoryCustomizations = [];
		for (const sessionCustomization of [...customizations, ...draftPlugins]) {
			if (isDirectoryCustomization(sessionCustomization)) {
				directoryCustomizations.push(sessionCustomization);
			} else if (sessionCustomization.type === CustomizationType.McpServer) {
				// Bare MCP server entries aren't shown as plugin items in this view.
				continue;
			} else {
				const pluginUri = getAgentHostCustomizationUri(URI.parse(sessionCustomization.uri), this._connection, sessionCustomization);
				const isBundleItem = isSyntheticBundle(sessionCustomization);
				const isClientSynced = sessionCustomization.clientId !== undefined;
				const delivery = isClientSynced ? SYNCED_FROM_CLIENT : undefined;

				// Always show session customizations as distinct plugin entries.
				// The synthetic bundle is an implementation detail and is not
				// shown as a standalone entry, but is still expanded below so
				// individual user files appear in per-type tabs.
				let item: ICustomizationItem;
				if (!isBundleItem) {
					item = this.toItem(sessionResource, sessionCustomization, AICustomizationSources.plugin, pluginUri ?? URI.parse(sessionCustomization.uri));
					items.set(customizationItemKey(sessionCustomization, sessionCustomization.clientId), item);
				} else {
					// create a dummy parent item for the synthetic bundle, it does not go into the items map, just need it to expand.
					item = { uri: pluginUri ?? URI.parse(sessionCustomization.uri), type: 'plugin', source: AICustomizationSources.plugin, name: '', delivery, extensionId: undefined, pluginUri: undefined } satisfies ICustomizationItem;
				}
				const pluginMeta = {
					item,
					nonce: (sessionCustomization as ClientPluginCustomization).nonce,
					status: toStatusString(sessionCustomization.load),
					statusMessage: toStatusMessage(sessionCustomization.load),
					enabled: isCustomizationEnabled(sessionCustomization),
					disabledReason: getCustomizationDisabledReason(sessionCustomization),
					delivery,
					isBundleItem,
					isDraft: draftPlugins.has(sessionCustomization),
					pluginLabel: isBundleItem ? undefined : item.name,
				} satisfies PluginMeta;
				plugins.push(pluginMeta);
				expandPromises.push(sessionCustomization.children !== undefined
					? Promise.resolve(this.toPluginChildItems(pluginMeta, sessionCustomization))
					: pluginUri && pluginMeta.isDraft ? this._expandPluginContents(pluginMeta, token) : Promise.resolve([]));
			}
		}

		// Resolve published children and scan only unpublished draft plugin directories.
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
				const enriched = p.isBundleItem && p.isDraft ? this._applySyncedOrigin(child) : child;
				const key = enriched.type === PromptsType.hook && enriched.itemKey ? enriched.itemKey : enriched.uri.toString();
				// Ambient and session bundles can have different IDs but contain the same source file.
				if (p.isBundleItem && p.isDraft && items.has(key)) {
					continue;
				}
				// Children inherit the parent plugin's status/enabled state.
				items.set(key, {
					...enriched,
					scope: p.isBundleItem ? enriched.scope : p.item.scope,
					status: p.status,
					statusMessage: p.statusMessage,
					enabled: p.enabled === false || enriched.enabled === false ? false : p.enabled,
					disabledReason: p.disabledReason,
				});
			}
		}

		for (const sessionCustomization of directoryCustomizations) {
			const discoveredSource = getAgentHostCustomizationSource(sessionCustomization);
			const scope = discoveredSource !== undefined ? AICustomizationScopes.fromSource(discoveredSource) : undefined;
			const source = discoveredSource ?? (isAgentBuiltinCustomizationUri(URI.parse(sessionCustomization.uri))
				? AICustomizationSources.builtin
				: isUnderAnyRoot(workingDirectories, sessionCustomization.uri) ? AICustomizationSources.local : AICustomizationSources.user);
			const isRemote = sessionCustomization.clientId !== undefined;
			for (const child of this.toDirectoryItems(sessionCustomization, source, scope, isRemote, workingDirectories)) {
				items.set(child.itemKey ?? child.uri.toString(), {
					...child,
					status: toStatusString(sessionCustomization.load),
					statusMessage: toStatusMessage(sessionCustomization.load),
					enabled: sessionCustomization.enabled && child.enabled !== false,
				});
			}
		}

		let hostConfiguredMcpServers: ReadonlySet<string> | undefined;
		for (const { skill, container, containerEnabled } of getSkillCustomizations(customizations)) {
			if (container.type !== CustomizationType.McpServer || !containerEnabled) {
				continue;
			}
			const plugin = customizations.find((customization): customization is PluginCustomization =>
				customization.type === CustomizationType.Plugin && customization.children?.includes(container) === true);
			const source = readMcpServerSource(container);
			if (!plugin && source === undefined) {
				hostConfiguredMcpServers ??= new Set(this._customAgentsService.getMcpServers(sessionResource).filter(server => server.hostConfiguration !== undefined).map(server => server.name));
			}
			const customizationSource = plugin ? AICustomizationSources.plugin : getMcpCustomizationSource(source, hostConfiguredMcpServers?.has(container.name));
			const scope = AICustomizationScopes.fromSource(
				(plugin ? getAgentHostCustomizationSource(plugin) : undefined)
				?? customizationSource);
			const groupKey = plugin ? this.toBadge(plugin, plugin.clientId !== undefined).groupKey : customizationSource;
			items.set(skill.id, {
				itemKey: skill.id,
				uri: getAgentHostCustomizationUri(URI.parse(skill.uri), this._connection)!,
				type: PromptsType.skill,
				name: skill.name,
				description: skill.description,
				argumentHint: readSkillArgumentHint(skill),
				// MCP resource content stays read-only regardless of its server's configuration scope.
				source: AICustomizationSources.plugin,
				scope,
				groupKey,
				skillBundle: {
					id: container.id,
					name: localize('mcpSkillBundleName', "Skills from {0}", readMcpServerDisplayName(container) ?? container.name),
					description: localize('mcpSkillBundleDescription', "MCP Server"),
					namePrefix: getMcpSkillNamePrefix(container.name),
				},
				enabled: skill.enabled !== false,
				userInvocable: skill.disableUserInvocation !== true,
				extensionId: undefined,
				pluginUri: undefined,
			});
		}

		const disabledBuiltinSkills = this._agenticSkills.getDisabledSkills();
		const builtinSkills = await this._agenticSkills.getSkills(token);
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
				origin: { kind: 'vscode' },
				extensionId: undefined,
				pluginUri: undefined,
				enabled: false,
				userInvocable: true,
			});
		}
		for (const item of this._listsCustomAgentHooks ? await this.getCustomAgentHooks([...items.values()]) : []) {
			items.set(item.itemKey ?? item.uri.toString(), item);
		}
		for (const item of await this.getHooksNotRunning(sessionResource, directoryCustomizations, [...items.values()], token)) {
			items.set(item.itemKey ?? item.uri.toString(), item);
		}
		if (token.isCancellationRequested) {
			return [];
		}
		return [...items.values()];
	}

	/**
	 * Hooks declared in the `hooks` header of custom agent files. VS Code sends them with the agent, and they run
	 * only while that agent is selected.
	 */
	private async getCustomAgentHooks(items: readonly ICustomizationItem[]): Promise<ICustomizationHookItem[]> {
		// The host lists agent files whose hooks the session leaves out, as in an untrusted folder, as hooks that won't run. A session
		// leaves out the hooks of every custom agent when any of its folders is untrusted or hooks are turned off, including agents the
		// host could not list, so the host also publishes a row with the reason when hooks are turned off.
		const notRunningItems = items.filter(item => item.type === PromptsType.hook && item.enabled === false && item.status === 'degraded');
		const notRunning = new ResourceSet(notRunningItems.map(item => item.uri));
		const notRunningMessage = notRunningItems[0]?.statusMessage;
		const agents = items.filter(item => item.type === PromptsType.agent && hasReadableCustomizationContent(item.uri) && !notRunning.has(item.uri));
		const hooks = await Promise.all(agents.map(async agent => {
			let content: string;
			try {
				content = (await this._fileService.readFile(agent.uri)).value.toString();
			} catch {
				return [];
			}
			const header = new PromptFileParser().parse(agent.uri, content).header?.hooksRaw;
			return (header?.properties ?? []).flatMap(({ key, value }) => value.type !== 'sequence' ? [] : value.items.map((_, index): ICustomizationHookItem => ({
				itemKey: `${CUSTOM_AGENT_HOOK_ITEM_KEY_PREFIX}${agent.uri.toString()}#${key.value}/${index}`,
				uri: agent.uri,
				type: PromptsType.hook,
				name: getAgentHookMetadata(Target.GitHubCopilot, key.value)?.label ?? key.value,
				description: localize('customAgentHookDescription', "Runs while {0} is active", agent.name),
				isHookAction: true,
				enabled: agent.enabled,
				source: agent.source,
				scope: agent.scope,
				origin: agent.origin,
				delivery: agent.delivery,
				extensionId: agent.extensionId,
				extensionLabel: agent.extensionLabel,
				pluginUri: agent.pluginUri,
				pluginLabel: agent.pluginLabel,
				...(notRunningMessage ? { status: 'degraded', statusMessage: notRunningMessage, badge: localize('customizationWontRun', "Won't run"), badgeTooltip: notRunningMessage } : {}),
			})));
		}));
		return hooks.flat();
	}

	/**
	 * Hook files that VS Code's own harness runs and this agent host doesn't, found by comparing files rather than
	 * by knowing the host's rules.
	 */
	private async getHooksNotRunning(sessionResource: URI, directories: readonly DirectoryCustomization[], items: readonly ICustomizationItem[], token: CancellationToken): Promise<ICustomizationItem[]> {
		const workspaceFolders = this._hooksNotRunningWorkspaceFolders?.();
		// Without the host's complete hook inventory, supported files would wrongly look unsupported. Disabled degraded
		// directories only list files that won't run, such as those of untrusted folders.
		const hookDirectories = directories.filter(directory => directory.contents === CustomizationType.Hook && directory.enabled !== false);
		if (!workspaceFolders || hookDirectories.length === 0 || hookDirectories.some(directory => directory.load !== undefined && directory.load.kind !== CustomizationLoadStatus.Loaded)) {
			return [];
		}
		let files;
		try {
			files = (await this._promptsService.getDiscoveryInfo(PromptsType.hook, token)).files;
		} catch (error) {
			if (isCancellationError(error)) {
				throw error;
			}
			this._logService.warn('[AgentCustomizationItemProvider] Failed to discover local hook files', error);
			return [];
		}
		const sessionRoots = this._customAgentsService.getClientWorkingDirectoryUris(sessionResource);
		const isUnder = (uri: URI, roots: readonly URI[]) => roots.some(root => extUriBiasedIgnorePathCase.isEqualOrParent(uri, root));
		// A workspace file belongs to this session when it is in one of the session's folders, or in a configured
		// location outside every workspace folder. Files of another workspace folder, such as the repository of a
		// worktree session, are not this session's.
		const belongsToSession = (uri: URI, source: PromptFileSource | undefined) => isUnder(uri, sessionRoots)
			|| source === PromptFileSource.ConfigWorkspace && !isUnder(uri, workspaceFolders);
		const toHostFile = (uri: URI) => this._connection.resourceUris.toAgentHost(uri).with({ fragment: '' });
		const hostFiles = new ResourceSet(items.filter(item => item.type === PromptsType.hook).map(item => toHostFile(item.uri)), uri => extUriBiasedIgnorePathCase.getComparisonKey(uri));
		const result: ICustomizationItem[] = [];
		for (const { status, promptPath } of files) {
			// Claude Code hook files are out of scope here, and plugin and extension hooks are listed with their plugin.
			if (status !== 'loaded' || (promptPath.storage !== PromptStorage.local && promptPath.storage !== PromptStorage.user)
				|| getHookSourceFormat(promptPath.uri) === HookSourceFormat.Claude
				|| promptPath.source === PromptFileSource.ClaudeWorkspace || promptPath.source === PromptFileSource.ClaudeWorkspaceLocal || promptPath.source === PromptFileSource.ClaudePersonal
				|| promptPath.storage === PromptStorage.local && !belongsToSession(promptPath.uri, promptPath.source)
				|| hostFiles.has(toHostFile(promptPath.uri))) {
				continue;
			}
			const reason = promptPath.source === PromptFileSource.ConfigWorkspace || promptPath.source === PromptFileSource.ConfigPersonal
				? localize('hookFromConfiguredLocationNotRunning', "Copilot doesn't read hooks from folders added in {0}. Move the file to .github/hooks or ~/.copilot/hooks, and check that its scripts work with Copilot.", 'chat.hookFilesLocations')
				: localize('hookFromUnsupportedLocationNotRunning', "Copilot doesn't read hooks from this location. Move the file to .github/hooks or ~/.copilot/hooks, and check that its scripts work with Copilot.");
			result.push({
				itemKey: `hook-not-running:${promptPath.uri.toString()}`,
				uri: promptPath.uri,
				type: PromptsType.hook,
				name: basename(promptPath.uri),
				source: promptPath.storage === PromptStorage.local ? AICustomizationSources.local : AICustomizationSources.user,
				enabled: false,
				status: 'degraded',
				statusMessage: reason,
				badge: localize('customizationWontRun', "Won't run"),
				badgeTooltip: reason,
				extensionId: undefined,
				pluginUri: undefined,
			});
		}
		return result;
	}

	private getCustomAgents(sessionResource: URI): readonly AgentCustomization[] {
		const sessionAgents = this._customAgentsService.getCustomAgents(sessionResource);
		return sessionAgents.length > 0 ? sessionAgents : this._draftCustomAgents?.get() ?? [];
	}

	private async getAgentSources(sessionResource: URI, agents: readonly AgentCustomization[], token: CancellationToken): Promise<readonly { readonly source: IAgentSource; readonly sourceUri: URI | undefined }[]> {
		let extensionFiles: readonly IExtensionPromptPath[] = [];
		try {
			extensionFiles = await this._extensionCustomizations.getExtensionPromptFiles(PromptsType.agent, token);
		} catch (error) {
			if (isCancellationError(error)) {
				throw error;
			}
			this._logService.warn('[AgentCustomizationItemProvider] Failed to resolve extension source labels', error);
		}
		const extensionLabels = new Map<string, string>();
		const extensionIdsByUri = new ResourceMap<string>();
		for (const file of extensionFiles) {
			const id = file.extension.identifier.value;
			extensionLabels.set(ExtensionIdentifier.toKey(id), file.extension.displayName || file.extension.name);
			extensionIdsByUri.set(file.uri, id);
		}
		const sessionCustomizations = this._customAgentsService.getCustomizations(sessionResource);
		const containers = [...sessionCustomizations, ...this.getDraftCustomizations(sessionCustomizations)].filter((candidate): candidate is PluginCustomization | DirectoryCustomization =>
			candidate.type !== CustomizationType.McpServer
			&& (candidate.type === CustomizationType.Plugin ? isCustomizationEnabled(candidate) : candidate.enabled));
		const drafts = this._draftCustomAgents?.get() ?? [];
		const agentUris = new Map(agents.map(agent => [agent, drafts.includes(agent) ? URI.parse(agent.uri) : this.toRemoteUri(agent.uri)]));
		const origins = new Map(agents.map(agent => {
			const sourceUri = readAgentCustomizationMeta(agent)['vscode.sourceUri'];
			const container = containers.find(container => container.type === CustomizationType.Plugin && container.children?.some(child => child.uri === agent.uri));
			const clientSource = sourceUri !== undefined && container?.type === CustomizationType.Plugin && container.clientId === this._connection.clientId
				? getAgentHostCustomizationUri(URI.parse(sourceUri), this._connection, container) : undefined;
			const origin = clientSource ? this._resolveSyncedOrigin?.(clientSource) : undefined;
			return [agent, origin ?? this._resolveSyncedOrigin?.(agentUris.get(agent)!)] as const;
		}));
		const extensionIds = new Map(agents.map(agent => [agent,
			(origins.get(agent)?.source === AICustomizationSources.extension ? origins.get(agent)?.extensionId : undefined)
			?? (drafts.includes(agent) ? extensionIdsByUri.get(URI.parse(agent.uri)) : undefined),
		]));
		const roots = this._customAgentsService.getWorkingDirectories(sessionResource);
		const labels = agents.map(agent => {
			if (readAgentCustomizationMeta(agent)['vscode.chatMode'] === 'ask') {
				return undefined;
			}
			const uri = URI.parse(agent.uri);
			const published = containers.find(candidate => candidate.children?.some(child => child.type === CustomizationType.Agent && isEqual(URI.parse(child.uri), uri)));
			const isDraft = drafts.some(candidate => isEqual(URI.parse(candidate.uri), uri));
			const extensionId = extensionIds.get(agent);
			const extensionLabel = extensionId
				? localize('agentSource.extension', "Extension: {0}", extensionLabels.get(ExtensionIdentifier.toKey(extensionId)) ?? origins.get(agent)?.extensionLabel ?? extensionId)
				: undefined;
			const draftContainers = !published && isDraft
				? containers.filter(candidate => {
					if (candidate.type !== CustomizationType.Plugin) {
						return false;
					}
					const pluginUri = getAgentHostCustomizationUri(URI.parse(candidate.uri), this._connection, candidate);
					return pluginUri && extUri.isEqualOrParent(uri, pluginUri);
				})
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
			return origins.get(agent)?.uri ?? agentUris.get(agent)!;
		};
		const disambiguatedLabels = labels.map((label, index) => {
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
		return agents.map((agent, index) => {
			const extensionId = extensionIds.get(agent);
			const source: IAgentSource = extensionId
				? { storage: PromptStorage.extension, extensionId: new ExtensionIdentifier(extensionId) }
				: { storage: readAgentCustomizationMeta(agent)['vscode.chatMode'] === 'ask' ? PromptStorage.builtIn : PromptStorage.local };
			return { source: { ...source, label: disambiguatedLabels[index] }, sourceUri: origins.get(agent)?.uri };
		});
	}

	private getDraftCustomizations(sessionCustomizations: readonly Customization[]): readonly PluginCustomization[] {
		const draftCustomizations = this._draftCustomizations?.get() ?? [];
		if (draftCustomizations.length === 0) {
			return [];
		}

		const sessionKeys = new Set(sessionCustomizations.filter(customization => customization.type === CustomizationType.Plugin && customization.clientId === this._connection.clientId).map(customization => `${customization.type}:${customization.id}`));
		return draftCustomizations.filter(customization => !sessionKeys.has(`${customization.type}:${customization.id}`)).map(customization => ({ ...customization, clientId: this._connection.clientId }));
	}

	private toPluginChildItems(plugin: PluginMeta, customization: PluginCustomization): ICustomizationItem[] {
		const items: ICustomizationItem[] = [];
		for (const child of customization.children ?? []) {
			if (!toPromptsType(child.type)) {
				continue;
			}
			const item = this.toDirectoryChildItem(child, plugin.item.source, plugin.isBundleItem ? undefined : plugin.item.scope, plugin.delivery !== undefined);
			if (!item) {
				continue;
			}
			const isOwnBundle = plugin.isBundleItem && customization.clientId === this._connection.clientId;
			const source = isOwnBundle ? readCustomizationSourceUri(child) : undefined;
			const sourceUri = source ? getAgentHostCustomizationUri(URI.parse(source), this._connection, customization) : undefined;
			const enriched = isOwnBundle ? this._applySyncedOrigin(item, sourceUri) : item;
			items.push({
				...enriched,
				itemKey: enriched.itemKey ?? child.id,
				scope: plugin.isBundleItem ? enriched.scope : plugin.item.scope,
				status: plugin.status,
				statusMessage: plugin.statusMessage,
				enabled: plugin.enabled !== false && item.enabled !== false,
				disabledReason: plugin.disabledReason,
				delivery: plugin.delivery,
				pluginUri: plugin.isBundleItem ? undefined : plugin.item.uri,
				pluginLabel: plugin.isBundleItem ? undefined : plugin.pluginLabel,
			});
		}
		return items;
	}

	/**
	 * Rewrites a bundle child item to reflect the original source location of
	 * the flattened file, when it can be recovered from the synthetic bundle's
	 * reverse map. The synced (in-memory) URI is replaced with the real local
	 * URI so the item points at its true origin, and the source/extension/plugin
	 * metadata is restored. Returns the item unchanged when no origin is known.
	 */
	private _applySyncedOrigin(child: ICustomizationItem, syncedUri = child.uri): ICustomizationItem {
		const origin = this._resolveSyncedOrigin?.(syncedUri);
		if (!origin) {
			return child;
		}
		return {
			...child,
			uri: origin.uri,
			source: origin.source,
			scope: origin.source === AICustomizationSources.extension ? undefined : AICustomizationScopes.fromSource(origin.source),
			extensionId: origin.extensionId,
			extensionLabel: origin.extensionLabel,
			pluginUri: origin.pluginUri,
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
		const children = await this._contentExpander.expandPluginContents(plugin.item.uri, plugin.delivery, plugin.isBundleItem, plugin.item.source, plugin.pluginLabel, token);
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
