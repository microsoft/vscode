/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { Event } from '../../../../../base/common/event.js';
import { parse as parseJSONC } from '../../../../../base/common/json.js';
import { ResourceMap, ResourceSet } from '../../../../../base/common/map.js';
import { Schemas } from '../../../../../base/common/network.js';
import { OS } from '../../../../../base/common/platform.js';
import { basename, dirname, isEqualOrParent } from '../../../../../base/common/resources.js';
import { localize } from '../../../../../nls.js';
import { ExtensionIdentifier } from '../../../../../platform/extensions/common/extensions.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { IProductService } from '../../../../../platform/product/common/productService.js';
import { IPathService } from '../../../../services/path/common/pathService.js';
import { IAICustomizationWorkspaceService, applyStorageSourceFilter } from '../../common/aiCustomizationWorkspaceService.js';
import { HookType, HOOK_METADATA } from '../../common/promptSyntax/hookTypes.js';
import { parseHooksFromFile } from '../../common/promptSyntax/hookCompatibility.js';
import { formatHookCommandLabel } from '../../common/promptSyntax/hookSchema.js';
import { PromptsType } from '../../common/promptSyntax/promptTypes.js';
import { IPromptsService, PromptsStorage } from '../../common/promptSyntax/service/promptsService.js';
import { IExternalCustomizationItem, IExternalCustomizationItemProvider, IHarnessDescriptor, matchesInstructionFileFilter, matchesWorkspaceSubpath } from '../../common/customizationHarnessService.js';
import { BUILTIN_STORAGE } from './aiCustomizationManagement.js';
import { getFriendlyName } from './aiCustomizationItemSourceUtils.js';

interface IPromptsServiceCustomizationItem extends IExternalCustomizationItem {
	readonly storage?: PromptsStorage;
}

/**
 * Adapts the rich promptsService model to the same provider-shaped items
 * contributed by external customization providers.
 */
export class PromptsServiceCustomizationItemProvider implements IExternalCustomizationItemProvider {

	readonly onDidChange: Event<void>;

	constructor(
		private readonly getActiveDescriptor: () => IHarnessDescriptor,
		private readonly promptsService: IPromptsService,
		private readonly workspaceService: IAICustomizationWorkspaceService,
		private readonly fileService: IFileService,
		private readonly pathService: IPathService,
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

	async provideChatSessionCustomizations(token: CancellationToken): Promise<IExternalCustomizationItem[]> {
		const itemSets = await Promise.all([
			this.provideCustomizations(PromptsType.agent, token),
			this.provideCustomizations(PromptsType.skill, token),
			this.provideCustomizations(PromptsType.instructions, token),
			this.provideCustomizations(PromptsType.hook, token),
			this.provideCustomizations(PromptsType.prompt, token),
		]);
		return itemSets.flat();
	}

	async provideCustomizations(promptType: PromptsType, token: CancellationToken = CancellationToken.None): Promise<IExternalCustomizationItem[]> {
		const items: IPromptsServiceCustomizationItem[] = [];
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

		return this.toProviderItems(this.applyLocalFilters(this.applyBuiltinGroupKeys(items, extensionInfoByUri), promptType));
	}

	private async fetchPromptServiceHooks(items: IPromptsServiceCustomizationItem[], disabledUris: ResourceSet, promptType: PromptsType): Promise<void> {
		const hookFiles = await this.promptsService.listPromptFiles(PromptsType.hook, CancellationToken.None);
		const activeRoot = this.workspaceService.getActiveProjectRoot();
		const userHomeUri = await this.pathService.userHome();
		const userHome = userHomeUri.scheme === Schemas.file ? userHomeUri.fsPath : userHomeUri.path;

		for (const hookFile of hookFiles) {
			if (hookFile.storage === PromptsStorage.plugin) {
				items.push({
					uri: hookFile.uri,
					type: promptType,
					name: hookFile.name || getFriendlyName(basename(hookFile.uri)),
					storage: hookFile.storage,
					enabled: !disabledUris.has(hookFile.uri),
				});
				continue;
			}

			let parsedHooks = false;
			try {
				const content = await this.fileService.readFile(hookFile.uri);
				const json = parseJSONC(content.value.toString());
				const { hooks } = parseHooksFromFile(hookFile.uri, json, activeRoot, userHome);

				if (hooks.size > 0) {
					parsedHooks = true;
					for (const [hookType, entry] of hooks) {
						const hookMeta = HOOK_METADATA[hookType];
						for (let i = 0; i < entry.hooks.length; i++) {
							const hook = entry.hooks[i];
							const cmdLabel = formatHookCommandLabel(hook, OS);
							const truncatedCmd = cmdLabel.length > 60 ? cmdLabel.substring(0, 57) + '...' : cmdLabel;
							items.push({
								uri: hookFile.uri,
								type: promptType,
								name: hookMeta?.label ?? entry.originalId,
								description: truncatedCmd || localize('hookUnset', "(unset)"),
								storage: hookFile.storage,
								enabled: !disabledUris.has(hookFile.uri),
							});
						}
					}
				}
			} catch {
				// Parse failed - fall through to show raw file.
			}

			if (!parsedHooks) {
				items.push({
					uri: hookFile.uri,
					type: promptType,
					name: hookFile.name || getFriendlyName(basename(hookFile.uri)),
					storage: hookFile.storage,
					enabled: !disabledUris.has(hookFile.uri),
				});
			}
		}

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
					});
				}
			}
		}
	}

	private async fetchPromptServiceInstructions(items: IPromptsServiceCustomizationItem[], extensionInfoByUri: ResourceMap<{ id: ExtensionIdentifier; displayName?: string }>, disabledUris: ResourceSet, promptType: PromptsType): Promise<void> {
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
			});
		}

		for (const { uri, pattern, name, description, storage } of instructionFiles) {
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
				});
			}
		}
	}

	private applyBuiltinGroupKeys(items: IPromptsServiceCustomizationItem[], extensionInfoByUri: ResourceMap<{ id: ExtensionIdentifier; displayName?: string }>): IPromptsServiceCustomizationItem[] {
		return items.map(item => {
			if (item.storage !== PromptsStorage.extension) {
				return item;
			}
			const extInfo = extensionInfoByUri.get(item.uri);
			if (!extInfo) {
				return item;
			}
			const isBuiltin = this.isChatExtensionItem(extInfo.id);
			if (isBuiltin) {
				return {
					...item,
					groupKey: item.groupKey ?? BUILTIN_STORAGE,
				};
			}
			return item;
		});
	}

	private applyLocalFilters(groupedItems: IPromptsServiceCustomizationItem[], promptType: PromptsType): IPromptsServiceCustomizationItem[] {
		const filter = this.workspaceService.getStorageSourceFilter(promptType);
		const withStorage = groupedItems.filter((item): item is IPromptsServiceCustomizationItem & { readonly storage: PromptsStorage } => item.storage !== undefined);
		const withoutStorage = groupedItems.filter(item => item.storage === undefined);
		const items = [...applyStorageSourceFilter(withStorage, filter), ...withoutStorage];

		const descriptor = this.getActiveDescriptor();
		const subpaths = descriptor.workspaceSubpaths;
		const instrFilter = descriptor.instructionFileFilter;
		if (subpaths) {
			const projectRoot = this.workspaceService.getActiveProjectRoot();
			for (let i = items.length - 1; i >= 0; i--) {
				const item = items[i];
				if (item.storage === PromptsStorage.local && projectRoot && isEqualOrParent(item.uri, projectRoot)) {
					if (!matchesWorkspaceSubpath(item.uri.path, subpaths)) {
						if (instrFilter && promptType === PromptsType.instructions && matchesInstructionFileFilter(item.uri.path, instrFilter)) {
							continue;
						}
						if (item.groupKey === 'agent-instructions') {
							continue;
						}
						items.splice(i, 1);
					}
				}
			}
		}

		if (instrFilter && promptType === PromptsType.instructions) {
			for (let i = items.length - 1; i >= 0; i--) {
				if (!matchesInstructionFileFilter(items[i].uri.path, instrFilter)) {
					items.splice(i, 1);
				}
			}
		}

		return items;
	}

	private toProviderItems(items: readonly IPromptsServiceCustomizationItem[]): IExternalCustomizationItem[] {
		return items.map(({ storage, ...item }) => ({
			...item,
			groupKey: item.groupKey ?? storage,
		}));
	}

	private isChatExtensionItem(extensionId: ExtensionIdentifier): boolean {
		const chatExtensionId = this.productService.defaultChatAgent?.chatExtensionId;
		return !!chatExtensionId && ExtensionIdentifier.equals(extensionId, chatExtensionId);
	}

}
