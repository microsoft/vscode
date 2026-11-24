/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { Event } from '../../../../../base/common/event.js';
import { ResourceMap, ResourceSet } from '../../../../../base/common/map.js';
import { OS } from '../../../../../base/common/platform.js';
import { URI } from '../../../../../base/common/uri.js';
import { basename, dirname, extname, isEqual, joinPath } from '../../../../../base/common/resources.js';
import { localize } from '../../../../../nls.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { ExtensionIdentifier } from '../../../../../platform/extensions/common/extensions.js';
import { FileOperationEvent, IFileService } from '../../../../../platform/files/common/files.js';
import { IProductService } from '../../../../../platform/product/common/productService.js';
import { IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';
import { IAICustomizationWorkspaceService, AICustomizationSources } from '../../common/aiCustomizationWorkspaceService.js';
import { HookType, HOOK_METADATA } from '../../common/promptSyntax/hookTypes.js';
import { formatHookCommandLabel } from '../../common/promptSyntax/hookSchema.js';
import { PromptsType, getSourceDescription } from '../../common/promptSyntax/promptTypes.js';
import { ICustomAgent, IPromptsService, matchesSessionType, PromptsStorage } from '../../common/promptSyntax/service/promptsService.js';
import { ICustomizationItem, ICustomizationItemProvider, ICustomizationSourceFolder } from '../../common/customizationHarnessService.js';
import { BUILTIN_STORAGE } from './aiCustomizationManagement.js';
import { getFriendlyName, isChatExtensionItem } from './aiCustomizationItemSource.js';
import { getChatSessionType } from '../../common/model/chatUri.js';
import { PromptsConfig } from '../../common/promptSyntax/config/config.js';
import { HOOKS_SOURCE_FOLDER } from '../../common/promptSyntax/config/promptFileLocations.js';
import { findRepositoryRoot } from '../../common/promptSyntax/utils/repositoryRoot.js';
import { listHookFiles } from '../promptSyntax/hookUtils.js';
import { IPathService } from '../../../../services/path/common/pathService.js';

/**
 * Adapts the rich promptsService model to the same provider-shaped items
 * contributed by external customization providers.
 */
export class PromptsServiceCustomizationItemProvider implements ICustomizationItemProvider {

	readonly onDidChange: Event<void>;

	constructor(
		@IPromptsService private readonly promptsService: IPromptsService,
		@IAICustomizationWorkspaceService private readonly workspaceService: IAICustomizationWorkspaceService,
		@IProductService private readonly productService: IProductService,
		@IWorkspaceContextService private readonly workspaceContextService: IWorkspaceContextService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IFileService private readonly fileService: IFileService,
		@IPathService private readonly pathService: IPathService,
	) {
		this.onDidChange = Event.any(
			// Hook files at the repository root aren't watched by the prompts service when Local
			// doesn't read parent repositories, so refresh when one is written through VS Code.
			Event.filter(this.fileService.onDidRunOperation, e => isRepositoryHookFileOperation(e)),
			this.promptsService.onDidChangeCustomAgents,
			this.promptsService.onDidChangeSlashCommands,
			this.promptsService.onDidChangeSkills,
			this.promptsService.onDidChangeHooks,
			this.promptsService.onDidChangeInstructions,
			this.promptsService.onDidChangeAgentInstructions,
		);
	}

	async provideChatSessionCustomizations(_sessionResource: URI, token: CancellationToken): Promise<ICustomizationItem[]> {
		const itemSets = await Promise.all([
			this.provideCustomizations(PromptsType.agent, token),
			this.provideCustomizations(PromptsType.skill, token),
			this.provideCustomizations(PromptsType.instructions, token),
			this.provideCustomizations(PromptsType.hook, token),
			this.provideCustomizations(PromptsType.prompt, token),
		]);
		return itemSets.flat();
	}

	async provideCustomAgents(sessionResource: URI, token: CancellationToken): Promise<readonly ICustomAgent[]> {
		const sessionType = getChatSessionType(sessionResource);
		const agents = await this.promptsService.getCustomAgents(token);
		return agents.filter(agent => matchesSessionType(agent.sessionTypes, sessionType));
	}

	async provideSourceFolders(_sessionResource: URI, type: PromptsType, _token: CancellationToken): Promise<readonly ICustomizationSourceFolder[]> {
		const folders = await this.promptsService.getSourceFolders(type);
		return folders.map(folder => ({
			uri: folder.uri,
			// Prefer the source-specific description (e.g. "Global (only used by
			// Copilot agents)") over the generic "User Data" label so personal
			// folders like ~/.copilot/skills read naturally. Only folders that
			// carry a source (currently skills) use this; others fall back.
			label: (folder.source !== undefined ? getSourceDescription(folder.source) : undefined) ?? this.promptsService.getPromptLocationLabel(folder),
			source: folder.storage,
			destinationGroupId: dirname(folder.uri).toString(),
			workspaceGroupId: this.getWorkspaceGroupId(_sessionResource, folder.uri),
		}));
	}

	getWorkspaceGroupId(_sessionResource: URI, resource: URI): string | undefined {
		return this.workspaceContextService.getWorkspaceFolder(resource)?.uri.toString();
	}

	private async provideCustomizations(promptType: PromptsType, token: CancellationToken = CancellationToken.None): Promise<readonly ICustomizationItem[]> {
		const items: ICustomizationItem[] = [];
		const disabledUris = this.promptsService.getDisabledPromptFiles(promptType);
		const extensionInfoByUri = new ResourceMap<{ id: ExtensionIdentifier; displayName?: string }>();

		if (promptType === PromptsType.agent) {
			const agents = await this.promptsService.getCustomAgents(token);
			const allAgentFiles = await this.promptsService.listPromptFiles(PromptsType.agent, token);
			for (const file of allAgentFiles) {
				if (file.extension) {
					extensionInfoByUri.set(file.uri, { id: file.extension.identifier, displayName: file.extension.displayName });
				}
			}
			for (const agent of agents) {
				items.push({
					uri: agent.uri,
					type: promptType,
					name: agent.name,
					description: agent.description,
					source: agent.source.storage,
					enabled: agent.enabled,
					extensionId: agent.source.storage === PromptsStorage.extension ? agent.source.extensionId.value : undefined,
					pluginUri: agent.source.storage === PromptsStorage.plugin ? agent.source.pluginUri : undefined,
					userInvocable: agent.visibility.userInvocable
				});
				if (agent.source.storage === PromptsStorage.extension && !extensionInfoByUri.has(agent.uri)) {
					extensionInfoByUri.set(agent.uri, { id: agent.source.extensionId });
				}
			}
		} else if (promptType === PromptsType.skill) {
			const skills = await this.promptsService.findAgentSkills(token);
			const allSkillFiles = await this.promptsService.listPromptFiles(PromptsType.skill, token);
			for (const file of allSkillFiles) {
				if (file.extension) {
					extensionInfoByUri.set(file.uri, { id: file.extension.identifier, displayName: file.extension.displayName });
				}
			}
			const seenUris = new ResourceSet();
			for (const skill of skills || []) {
				const skillName = skill.name || basename(dirname(skill.uri)) || basename(skill.uri);
				seenUris.add(skill.uri);
				items.push({
					uri: skill.uri,
					type: promptType,
					name: skillName,
					description: skill.description,
					source: skill.storage,
					enabled: true,
					extensionId: skill.extension?.identifier.value,
					pluginUri: skill.pluginUri,
					pluginLabel: skill.pluginLabel,
					userInvocable: skill.userInvocable
				});
			}
			if (disabledUris.size > 0) {
				for (const file of allSkillFiles) {
					if (!seenUris.has(file.uri) && disabledUris.has(file.uri)) {
						const disabledName = file.name || basename(dirname(file.uri)) || basename(file.uri);
						items.push({
							uri: file.uri,
							type: promptType,
							name: disabledName,
							description: file.description,
							source: file.storage,
							enabled: false,
							extensionId: file.extension?.identifier.value,
							pluginUri: file.pluginUri,
							pluginLabel: file.pluginLabel,
							userInvocable: false
						});
					}
				}
			}
		} else if (promptType === PromptsType.prompt) {
			const commands = await this.promptsService.getPromptSlashCommands(token);
			for (const command of commands) {
				if (command.type === PromptsType.skill) {
					continue;
				}
				items.push({
					uri: command.uri,
					type: promptType,
					name: command.name,
					description: command.description,
					source: command.storage,
					enabled: !disabledUris.has(command.uri),
					extensionId: command.extension?.identifier.value,
					pluginUri: command.pluginUri,
					pluginLabel: command.pluginLabel,
					userInvocable: command.userInvocable
				});
				if (command.extension) {
					extensionInfoByUri.set(command.uri, { id: command.extension.identifier, displayName: command.extension.displayName });
				}
			}
		} else if (promptType === PromptsType.hook) {
			await this.fetchPromptServiceHooks(items, disabledUris, promptType);
		} else {
			await this.fetchPromptServiceInstructions(items, extensionInfoByUri, disabledUris, promptType);
		}

		return this.applyBuiltinGroupKeys(items, extensionInfoByUri);
	}

	private async fetchPromptServiceHooks(items: ICustomizationItem[], disabledUris: ResourceSet, promptType: PromptsType): Promise<void> {
		const hookFiles = await this.promptsService.listPromptFiles(PromptsType.hook, CancellationToken.None);
		const listedHookFiles = new ResourceSet(hookFiles.map(f => f.uri));

		// Non-plugin hooks: return raw file items — expansion into individual
		// hook entries is handled by ItemProviderItemSource.fetchItems().
		// Plugin hooks: add directly as-is since they're pre-expanded by
		// plugin manifests and must NOT be re-parsed by expandHookFileItems.
		for (const f of hookFiles) {
			items.push({
				uri: f.uri,
				type: promptType,
				name: f.name || getFriendlyName(basename(f.uri)),
				source: f.storage,
				enabled: !disabledUris.has(f.uri),
				extensionId: f.extension?.identifier.value,
				pluginUri: f.pluginUri,
				userInvocable: undefined
			});
		}

		await this.fetchRepositoryRootHooks(items, listedHookFiles, promptType);

		// Agent-embedded hooks (not in sessions window).
		const agents = !this.workspaceService.isSessionsWindow ? await this.promptsService.getCustomAgents(CancellationToken.None) : [];
		for (const agent of agents) {
			if (!agent.hooks || !agent.enabled) {
				continue;
			}
			for (const hookType of Object.values(HookType)) {
				const hookCommands = agent.hooks[hookType];
				if (!hookCommands || hookCommands.length === 0) {
					continue;
				}
				const hookMeta = HOOK_METADATA[hookType];
				for (let i = 0; i < hookCommands.length; i++) {
					const hook = hookCommands[i];
					const cmdLabel = formatHookCommandLabel(hook, OS);
					const truncatedCmd = cmdLabel.length > 60 ? cmdLabel.substring(0, 57) + '...' : cmdLabel;
					items.push({
						uri: agent.uri,
						type: promptType,
						name: hookMeta?.label ?? hookType,
						description: `${agent.name}: ${truncatedCmd || localize('hookUnset', "(unset)")}`,
						source: agent.source.storage,
						groupKey: 'agents',
						enabled: !disabledUris.has(agent.uri),
						extensionId: agent.source.storage === PromptsStorage.extension ? agent.source.extensionId.value : undefined,
						pluginUri: agent.source.storage === PromptsStorage.plugin ? agent.source.pluginUri : undefined,
						userInvocable: undefined
					});
				}
			}
		}
	}

	/**
	 * Lists hook files in `.github/hooks` at the root of the git repository that contains a
	 * workspace folder, when Local doesn't read hooks from there. New Hook creates hooks at the
	 * repository root for Copilot, so they must stay manageable here even though Local won't run them.
	 */
	private async fetchRepositoryRootHooks(items: ICustomizationItem[], listedHookFiles: ResourceSet, promptType: PromptsType): Promise<void> {
		if (this.configurationService.getValue<boolean>(PromptsConfig.USE_CUSTOMIZATIONS_IN_PARENT_REPOS)) {
			return;
		}
		const message = localize('hookRepositoryRootNotRunning', "Local agents only run hooks from the open folder. Turn on the {0} setting to run hooks from the repository root.", PromptsConfig.USE_CUSTOMIZATIONS_IN_PARENT_REPOS);
		const visitedRoots = new ResourceSet();
		const userHome = await this.pathService.userHome();
		for (const folder of this.workspaceContextService.getWorkspace().folders) {
			const gitRoot = await findRepositoryRoot(this.fileService, folder.uri, userHome);
			if (!gitRoot || isEqual(gitRoot, folder.uri) || this.workspaceContextService.getWorkspaceFolder(gitRoot) || visitedRoots.has(gitRoot)) {
				continue;
			}
			visitedRoots.add(gitRoot);
			for (const uri of await listHookFiles(this.fileService, joinPath(gitRoot, HOOKS_SOURCE_FOLDER))) {
				if (listedHookFiles.has(uri)) {
					continue;
				}
				listedHookFiles.add(uri);
				items.push({
					uri,
					type: promptType,
					name: getFriendlyName(basename(uri)),
					source: PromptsStorage.local,
					enabled: false,
					status: 'degraded',
					statusMessage: message,
					badge: localize('customizationWontRun', "Won't run"),
					badgeTooltip: message,
					extensionId: undefined,
					pluginUri: undefined,
					userInvocable: undefined
				});
			}
		}
	}

	private async fetchPromptServiceInstructions(items: ICustomizationItem[], extensionInfoByUri: ResourceMap<{ id: ExtensionIdentifier; displayName?: string }>, disabledUris: ResourceSet, promptType: PromptsType): Promise<void> {
		const instructionFiles = await this.promptsService.getInstructionFiles(CancellationToken.None);
		for (const file of instructionFiles) {
			if (file.extension) {
				extensionInfoByUri.set(file.uri, { id: file.extension.identifier, displayName: file.extension.displayName });
			}
		}
		const agentInstructionFiles = await this.promptsService.listAgentInstructions(CancellationToken.None, undefined);
		const agentInstructionUris = new ResourceSet(agentInstructionFiles.map(f => f.uri));

		for (const file of agentInstructionFiles) {
			const storage = PromptsStorage.local;
			const filename = basename(file.uri);
			items.push({
				uri: file.uri,
				type: promptType,
				name: filename,
				source: storage,
				groupKey: 'agent-instructions',
				enabled: !disabledUris.has(file.uri),
				extensionId: undefined,
				pluginUri: undefined,
				userInvocable: undefined
			});
		}

		for (const { uri, pattern, name, description, storage, extension, pluginUri } of instructionFiles) {
			if (agentInstructionUris.has(uri)) {
				continue;
			}

			const friendlyName = getFriendlyName(name);

			if (pattern !== undefined) {
				const badge = pattern === '**'
					? localize('alwaysAdded', "always added")
					: pattern;
				const badgeTooltip = pattern === '**'
					? localize('alwaysAddedTooltip', "This instruction is automatically included in every interaction.")
					: localize('onContextTooltip', "This instruction is automatically included when files matching '{0}' are in context.", pattern);
				items.push({
					uri,
					type: promptType,
					name: friendlyName,
					badge,
					badgeTooltip,
					description,
					source: storage,
					groupKey: 'context-instructions',
					enabled: !disabledUris.has(uri),
					extensionId: extension?.identifier.value,
					pluginUri,
					userInvocable: undefined
				});
			} else {
				items.push({
					uri,
					type: promptType,
					name: friendlyName,
					description,
					source: storage,
					groupKey: 'on-demand-instructions',
					enabled: !disabledUris.has(uri),
					extensionId: extension?.identifier.value,
					pluginUri,
					userInvocable: undefined
				});
			}
		}
	}

	private applyBuiltinGroupKeys(items: ICustomizationItem[], extensionInfoByUri: ResourceMap<{ id: ExtensionIdentifier; displayName?: string }>): ICustomizationItem[] {
		return items.map(item => {
			if (item.source !== AICustomizationSources.extension) {
				return item;
			}
			const extInfo = extensionInfoByUri.get(item.uri);
			if (!extInfo) {
				return item;
			}
			if (isChatExtensionItem(extInfo.id, this.productService)) {
				return {
					...item,
					groupKey: item.groupKey ?? BUILTIN_STORAGE,
				};
			}
			return {
				...item,
				extensionLabel: extInfo.displayName || extInfo.id.value,
			};
		});
	}

}

function isRepositoryHookFileOperation(e: FileOperationEvent): boolean {
	const resource = e.target?.resource ?? e.resource;
	const hooksFolder = dirname(resource);
	return extname(resource).toLowerCase() === '.json' && basename(hooksFolder) === 'hooks' && basename(dirname(hooksFolder)) === '.github';
}
