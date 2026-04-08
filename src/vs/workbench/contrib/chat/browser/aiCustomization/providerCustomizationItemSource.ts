/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { Event } from '../../../../../base/common/event.js';
import { parse as parseJSONC } from '../../../../../base/common/json.js';
import { Schemas } from '../../../../../base/common/network.js';
import { OS } from '../../../../../base/common/platform.js';
import { basename } from '../../../../../base/common/resources.js';
import { localize } from '../../../../../nls.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { IPathService } from '../../../../services/path/common/pathService.js';
import { IAICustomizationWorkspaceService } from '../../common/aiCustomizationWorkspaceService.js';
import { HOOK_METADATA } from '../../common/promptSyntax/hookTypes.js';
import { parseHooksFromFile } from '../../common/promptSyntax/hookCompatibility.js';
import { formatHookCommandLabel } from '../../common/promptSyntax/hookSchema.js';
import { PromptsType } from '../../common/promptSyntax/promptTypes.js';
import { IPromptsService, PromptsStorage } from '../../common/promptSyntax/service/promptsService.js';
import { ICustomizationSyncProvider, IExternalCustomizationItem, IExternalCustomizationItemProvider } from '../../common/customizationHarnessService.js';
import { AICustomizationItemNormalizer } from './aiCustomizationItemNormalizer.js';
import { IAICustomizationItemSource, IAICustomizationListItem } from './aiCustomizationListItem.js';
import { getFriendlyName } from './aiCustomizationItemSourceUtils.js';

interface ITypeScopedCustomizationItemProvider extends IExternalCustomizationItemProvider {
	provideCustomizations(promptType: PromptsType, token: CancellationToken): Promise<IExternalCustomizationItem[] | undefined>;
}

function isTypeScopedCustomizationItemProvider(provider: IExternalCustomizationItemProvider): provider is ITypeScopedCustomizationItemProvider {
	return typeof (provider as Partial<ITypeScopedCustomizationItemProvider>).provideCustomizations === 'function';
}

export class ProviderCustomizationItemSource implements IAICustomizationItemSource {

	readonly onDidChange: Event<void>;

	constructor(
		private readonly itemProvider: IExternalCustomizationItemProvider | undefined,
		private readonly syncProvider: ICustomizationSyncProvider | undefined,
		private readonly promptsService: IPromptsService,
		private readonly workspaceService: IAICustomizationWorkspaceService,
		private readonly fileService: IFileService,
		private readonly pathService: IPathService,
		private readonly itemNormalizer: AICustomizationItemNormalizer,
	) {
		const onDidChangeSyncableCustomizations = this.syncProvider
			? Event.any(
				this.promptsService.onDidChangeCustomAgents,
				this.promptsService.onDidChangeSlashCommands,
				this.promptsService.onDidChangeSkills,
				this.promptsService.onDidChangeHooks,
				this.promptsService.onDidChangeInstructions,
			)
			: Event.None;

		this.onDidChange = Event.any(
			this.itemProvider?.onDidChange ?? Event.None,
			this.syncProvider?.onDidChange ?? Event.None,
			onDidChangeSyncableCustomizations,
		);
	}

	async fetchItems(promptType: PromptsType): Promise<IAICustomizationListItem[]> {
		const remoteItems = this.itemProvider
			? await this.fetchItemsFromProvider(this.itemProvider, promptType)
			: [];
		if (!this.syncProvider) {
			return remoteItems;
		}
		const localItems = await this.fetchLocalSyncableItems(promptType, this.syncProvider);
		return [...remoteItems, ...localItems];
	}

	private async fetchItemsFromProvider(provider: IExternalCustomizationItemProvider, promptType: PromptsType): Promise<IAICustomizationListItem[]> {
		let providerItems: readonly IExternalCustomizationItem[];
		if (isTypeScopedCustomizationItemProvider(provider)) {
			providerItems = await provider.provideCustomizations(promptType, CancellationToken.None) ?? [];
		} else {
			const allItems = await provider.provideChatSessionCustomizations(CancellationToken.None);
			if (!allItems) {
				return [];
			}
			providerItems = promptType === PromptsType.hook
				? await this.expandProviderHookItems(allItems)
				: allItems.filter(item => item.type === promptType);
		}

		if (promptType === PromptsType.skill) {
			providerItems = await this.addSkillDescriptionFallbacks(providerItems);
		}

		return this.itemNormalizer.normalizeItems(providerItems, promptType);
	}

	private async addSkillDescriptionFallbacks(items: readonly IExternalCustomizationItem[]): Promise<readonly IExternalCustomizationItem[]> {
		const descriptionsByUri = new Map<string, string>();
		const skills = await this.promptsService.findAgentSkills(CancellationToken.None);
		for (const skill of skills ?? []) {
			if (skill.description) {
				descriptionsByUri.set(skill.uri.toString(), skill.description);
			}
		}

		return items.map(item => item.description
			? item
			: { ...item, description: descriptionsByUri.get(item.uri.toString()) });
	}

	private async expandProviderHookItems(allItems: readonly IExternalCustomizationItem[]): Promise<IExternalCustomizationItem[]> {
		const hookFileItems = allItems.filter(item => item.type === PromptsType.hook);
		const items: IExternalCustomizationItem[] = [];
		const activeRoot = this.workspaceService.getActiveProjectRoot();
		const userHomeUri = await this.pathService.userHome();
		const userHome = userHomeUri.scheme === Schemas.file ? userHomeUri.fsPath : userHomeUri.path;

		for (const item of hookFileItems) {
			let parsedHooks = false;
			try {
				const content = await this.fileService.readFile(item.uri);
				const json = parseJSONC(content.value.toString());
				const { hooks } = parseHooksFromFile(item.uri, json, activeRoot, userHome);

				if (hooks.size > 0) {
					parsedHooks = true;
					for (const [hookType, entry] of hooks) {
						const hookMeta = HOOK_METADATA[hookType];
						for (let i = 0; i < entry.hooks.length; i++) {
							const hook = entry.hooks[i];
							const cmdLabel = formatHookCommandLabel(hook, OS);
							const truncatedCmd = cmdLabel.length > 60 ? cmdLabel.substring(0, 57) + '...' : cmdLabel;
							items.push({
								uri: item.uri,
								type: PromptsType.hook,
								name: hookMeta?.label ?? entry.originalId,
								description: truncatedCmd || localize('hookUnset', "(unset)"),
								enabled: item.enabled,
								groupKey: item.groupKey,
							});
						}
					}
				}
			} catch {
				// Parse failed - fall through to show raw file.
			}

			if (!parsedHooks) {
				items.push(item);
			}
		}

		return items;
	}

	private async fetchLocalSyncableItems(promptType: PromptsType, syncProvider: ICustomizationSyncProvider): Promise<IAICustomizationListItem[]> {
		const files = await this.promptsService.listPromptFiles(promptType, CancellationToken.None);
		if (!files.length) {
			return [];
		}

		const providerItems: IExternalCustomizationItem[] = files
			.filter(file => file.storage === PromptsStorage.local || file.storage === PromptsStorage.user)
			.map(file => ({
				uri: file.uri,
				type: promptType,
				name: getFriendlyName(basename(file.uri)),
				groupKey: 'sync-local',
				enabled: true,
			}));

		return this.itemNormalizer.normalizeItems(providerItems, promptType)
			.map(item => ({
				...item,
				id: `sync-${item.id}`,
				syncable: true,
				synced: syncProvider.isSelected(item.uri),
			}));
	}
}
