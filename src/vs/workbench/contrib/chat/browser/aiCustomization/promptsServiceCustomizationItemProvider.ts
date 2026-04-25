/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { Event } from '../../../../../base/common/event.js';
import { ResourceMap, ResourceSet } from '../../../../../base/common/map.js';
import { OS } from '../../../../../base/common/platform.js';
import { basename, dirname, isEqualOrParent } from '../../../../../base/common/resources.js';
import { localize } from '../../../../../nls.js';
import { ExtensionIdentifier } from '../../../../../platform/extensions/common/extensions.js';
import { IProductService } from '../../../../../platform/product/common/productService.js';
import { IAICustomizationWorkspaceService, applyStorageSourceFilter } from '../../common/aiCustomizationWorkspaceService.js';
import { HookType, HOOK_METADATA } from '../../common/promptSyntax/hookTypes.js';
import { formatHookCommandLabel } from '../../common/promptSyntax/hookSchema.js';
import { PromptsType } from '../../common/promptSyntax/promptTypes.js';
import { IPromptsService, PromptsStorage } from '../../common/promptSyntax/service/promptsService.js';
import { ICustomizationItem, ICustomizationItemProvider, IHarnessDescriptor, matchesInstructionFileFilter, matchesWorkspaceSubpath } from '../../common/customizationHarnessService.js';
import { BUILTIN_STORAGE } from './aiCustomizationManagement.js';
import { getFriendlyName, isChatExtensionItem } from './aiCustomizationItemSource.js';

/**
 * Adapts the rich promptsService model to the same provider-shaped items
 * contributed by external customization providers.
 */
export class PromptsServiceCustomizationItemProvider implements ICustomizationItemProvider {

	readonly onDidChange: Event<void>;

	constructor(
		private readonly getActiveDescriptor: () => IHarnessDescriptor,
		private readonly promptsService: IPromptsService,
		private readonly workspaceService: IAICustomizationWorkspaceService,
		private readonly productService: IProductService,
	) {
		this.onDidChange = Event.any(
			this.promptsService.onDidChangeCustomAgents,
			this.promptsService.onDidChangeSlashCommands,
			this.promptsService.onDidChangeSkills,
			this.promptsService.onDidChangeHooks,
			this.promptsService.onDidChangeInstructions,
		);
	}

	async provideChatSessionCustomizations(token: CancellationToken): Promise<ICustomizationItem[]> {
		const itemSets = await Promise.all([
			this.provideCustomizations(PromptsType.agent, token),
			this.provideCustomizations(PromptsType.skill, token),
			this.provideCustomizations(PromptsType.instructions, token),
			this.provideCustomizations(PromptsType.hook, token),
			this.provideCustomizations(PromptsType.prompt, token),
		]);
		return itemSets.flat();
	}

	private async provideCustomizations(promptType: PromptsType, token: CancellationToken = CancellationToken.None): Promise<ICustomizationItem[]> {
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
					storage: agent.source.storage,
					enabled: !disabledUris.has(agent.uri),
					extensionId: agent.source.storage === PromptsStorage.extension ? agent.source.extensionId.value : undefined,
					pluginUri: agent.source.storage === PromptsStorage.plugin ? agent.source.pluginUri : undefined
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
			const uiIntegrations = this.workspaceService.getSkillUIIntegrations();
			const seenUris = new ResourceSet();
			for (const skill of skills || []) {
				const skillName = skill.name || basename(dirname(skill.uri)) || basename(skill.uri);
				seenUris.add(skill.uri);
				const skillFolderName = basename(dirname(skill.uri));
				const uiTooltip = uiIntegrations.get(skillFolderName);
				items.push({
					uri: skill.uri,
					type: promptType,
					name: skillName,
					description: skill.description,
					storage: skill.storage,
					enabled: true,
					badge: uiTooltip ? localize('uiIntegrationBadge', "UI Integration") : undefined,
					badgeTooltip: uiTooltip,
					extensionId: skill.extension?.identifier.value,
					pluginUri: skill.pluginUri
				});
			}
			if (disabledUris.size > 0) {
				for (const file of allSkillFiles) {
					if (!seenUris.has(file.uri) && disabledUris.has(file.uri)) {
						const disabledName = file.name || basename(dirname(file.uri)) || basename(file.uri);
						const disabledFolderName = basename(dirname(file.uri));
						const uiTooltip = uiIntegrations.get(disabledFolderName);
						items.push({
							uri: file.uri,
							type: promptType,
							name: disabledName,
							description: file.description,
							storage: file.storage,
							enabled: false,
							badge: uiTooltip ? localize('uiIntegrationBadge', "UI Integration") : undefined,
							badgeTooltip: uiTooltip,
							extensionId: file.extension?.identifier.value,
							pluginUri: file.pluginUri
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
					storage: command.storage,
					enabled: !disabledUris.has(command.uri),
					extensionId: command.extension?.identifier.value,
					pluginUri: command.pluginUri
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

		return this.applyLocalFilters(this.applyBuiltinGroupKeys(items, extensionInfoByUri), promptType);
	}

	private async fetchPromptServiceHooks(items: ICustomizationItem[], disabledUris: ResourceSet, promptType: PromptsType): Promise<void> {
		const hookFiles = await this.promptsService.listPromptFiles(PromptsType.hook, CancellationToken.None);

		// Non-plugin hooks: return raw file items — expansion into individual
		// hook entries is handled by ProviderCustomizationItemSource.fetchItemsFromProvider().
		// Plugin hooks: add directly as-is since they're pre-expanded by
		// plugin manifests and must NOT be re-parsed by expandHookFileItems.
		for (const f of hookFiles) {
			items.push({
				uri: f.uri,
				type: promptType,
				name: f.name || getFriendlyName(basename(f.uri)),
				storage: f.storage,
				enabled: !disabledUris.has(f.uri),
				extensionId: f.extension?.identifier.value,
				pluginUri: f.pluginUri
			});
		}

		// Agent-embedded hooks (not in sessions window).
		const agents = !this.workspaceService.isSessionsWindow ? await this.promptsService.getCustomAgents(CancellationToken.None) : [];
		for (const agent of agents) {
			if (!agent.hooks) {
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
						storage: agent.source.storage,
						groupKey: 'agents',
						enabled: !disabledUris.has(agent.uri),
						extensionId: agent.source.storage === PromptsStorage.extension ? agent.source.extensionId.value : undefined,
						pluginUri: agent.source.storage === PromptsStorage.plugin ? agent.source.pluginUri : undefined
					});
				}
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
				storage,
				groupKey: 'agent-instructions',
				enabled: !disabledUris.has(file.uri),
				extensionId: undefined,
				pluginUri: undefined
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
					storage,
					groupKey: 'context-instructions',
					enabled: !disabledUris.has(uri),
					extensionId: extension?.identifier.value,
					pluginUri
				});
			} else {
				items.push({
					uri,
					type: promptType,
					name: friendlyName,
					description,
					storage,
					groupKey: 'on-demand-instructions',
					enabled: !disabledUris.has(uri),
					extensionId: extension?.identifier.value,
					pluginUri
				});
			}
		}
	}

	private applyBuiltinGroupKeys(items: ICustomizationItem[], extensionInfoByUri: ResourceMap<{ id: ExtensionIdentifier; displayName?: string }>): ICustomizationItem[] {
		return items.map(item => {
			if (item.storage !== PromptsStorage.extension) {
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

	private applyLocalFilters(groupedItems: ICustomizationItem[], promptType: PromptsType): ICustomizationItem[] {
		const filter = this.workspaceService.getStorageSourceFilter(promptType);
		const withStorage = groupedItems.filter((item): item is ICustomizationItem & { readonly storage: PromptsStorage } => item.storage !== undefined);
		const withoutStorage = groupedItems.filter(item => item.storage === undefined);
		let items = [...applyStorageSourceFilter(withStorage, filter), ...withoutStorage];

		const descriptor = this.getActiveDescriptor();
		const subpaths = descriptor.workspaceSubpaths;
		const instrFilter = descriptor.instructionFileFilter;

		if (subpaths) {
			const projectRoot = this.workspaceService.getActiveProjectRoot();
			items = items.filter(item => {
				if (item.storage !== PromptsStorage.local || !projectRoot || !isEqualOrParent(item.uri, projectRoot)) {
					return true;
				}
				if (matchesWorkspaceSubpath(item.uri.path, subpaths)) {
					return true;
				}
				// Keep instruction files matching the harness's native patterns
				if (instrFilter && promptType === PromptsType.instructions && matchesInstructionFileFilter(item.uri.path, instrFilter)) {
					return true;
				}
				// Keep agent instruction files (AGENTS.md, CLAUDE.md, copilot-instructions.md)
				if (item.groupKey === 'agent-instructions') {
					return true;
				}
				return false;
			});
		}

		if (instrFilter && promptType === PromptsType.instructions) {
			items = items.filter(item => matchesInstructionFileFilter(item.uri.path, instrFilter));
		}

		return items;
	}

}
