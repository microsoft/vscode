/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { Event } from '../../../../../base/common/event.js';
import { IMatch } from '../../../../../base/common/filters.js';
import { parse as parseJSONC } from '../../../../../base/common/json.js';
import { ResourceMap } from '../../../../../base/common/map.js';
import { Schemas } from '../../../../../base/common/network.js';
import { OS } from '../../../../../base/common/platform.js';
import { basename, isEqualOrParent } from '../../../../../base/common/resources.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { URI } from '../../../../../base/common/uri.js';
import { localize } from '../../../../../nls.js';
import { ExtensionIdentifier } from '../../../../../platform/extensions/common/extensions.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { ILabelService } from '../../../../../platform/label/common/label.js';
import { IProductService } from '../../../../../platform/product/common/productService.js';
import { IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';
import { IPathService } from '../../../../services/path/common/pathService.js';
import { IAICustomizationWorkspaceService } from '../../common/aiCustomizationWorkspaceService.js';
import { ICustomizationSyncProvider, ICustomizationItem, ICustomizationItemProvider } from '../../common/customizationHarnessService.js';
import { IAgentPluginService } from '../../common/plugins/agentPluginService.js';
import { parseHooksFromFile } from '../../common/promptSyntax/hookCompatibility.js';
import { formatHookCommandLabel } from '../../common/promptSyntax/hookSchema.js';
import { HOOK_METADATA } from '../../common/promptSyntax/hookTypes.js';
import { PromptsType } from '../../common/promptSyntax/promptTypes.js';
import { IPromptsService, PromptsStorage } from '../../common/promptSyntax/service/promptsService.js';
import { storageToIcon } from './aiCustomizationIcons.js';
import { BUILTIN_STORAGE } from './aiCustomizationManagement.js';
import { extractExtensionIdFromPath } from './aiCustomizationListWidgetUtils.js';

// #region Interfaces

/**
 * Represents an AI customization item in the list widget.
 */
export interface IAICustomizationListItem {
	readonly id: string;
	readonly uri: URI;
	readonly name: string;
	readonly filename: string;
	readonly description?: string;
	/** Storage origin. Set by core when items come from promptsService; omitted for external provider items. */
	readonly storage?: PromptsStorage;
	readonly promptType: PromptsType;
	readonly disabled: boolean;
	/** When set, overrides `storage` for display grouping purposes. */
	readonly groupKey?: string;
	/** URI of the parent plugin, when this item comes from an installed plugin. */
	readonly pluginUri?: URI;
	/** When set, overrides the formatted name for display. */
	readonly displayName?: string;
	/** When set, shows a small inline badge next to the item name. */
	readonly badge?: string;
	/** Tooltip shown when hovering the badge. */
	readonly badgeTooltip?: string;
	/** When set, overrides the default prompt-type icon. */
	readonly typeIcon?: ThemeIcon;
	/** True when item comes from the default chat extension (grouped under Built-in). */
	readonly isBuiltin?: boolean;
	/** Display name of the contributing extension (for non-built-in extension items). */
	readonly extensionLabel?: string;
	/** Server-reported loading/sync status for remote customizations. */
	readonly status?: 'loading' | 'loaded' | 'degraded' | 'error';
	/** Human-readable status detail (e.g. error message or warning). */
	readonly statusMessage?: string;
	/** When true, this item can be selected for syncing to a remote harness. */
	readonly syncable?: boolean;
	/** When true, this syncable item is currently selected for syncing. */
	readonly synced?: boolean;
	nameMatches?: IMatch[];
	descriptionMatches?: IMatch[];
}

/**
 * Browser-internal item source consumed by the list widget.
 *
 * Item sources fetch provider-shaped customization rows, normalize them into
 * the browser-only list item shape, and add view-only overlays such as sync state.
 */
export interface IAICustomizationItemSource {
	readonly onDidChange: Event<void>;
	fetchItems(promptType: PromptsType): Promise<IAICustomizationListItem[]>;
}

// #endregion

// #region Utilities

/**
 * Returns true if the given extension identifier matches the default
 * chat extension (e.g. GitHub Copilot Chat). Used to group items from
 * the chat extension under "Built-in" instead of "Extensions".
 */
export function isChatExtensionItem(extensionId: ExtensionIdentifier, productService: IProductService): boolean {
	const chatExtensionId = productService.defaultChatAgent?.chatExtensionId;
	return !!chatExtensionId && ExtensionIdentifier.equals(extensionId, chatExtensionId);
}

/**
 * Derives a friendly name from a filename by removing extension suffixes.
 */
export function getFriendlyName(filename: string): string {
	let name = filename
		.replace(/\.instructions\.md$/i, '')
		.replace(/\.prompt\.md$/i, '')
		.replace(/\.agent\.md$/i, '')
		.replace(/\.md$/i, '');

	name = name
		.replace(/[-_]/g, ' ')
		.replace(/\b\w/g, c => c.toUpperCase());

	return name || filename;
}

/**
 * Expands hook file items into individual hook entries by parsing hook
 * definitions from the file content. Falls back to the original item
 * when parsing fails.
 */
export async function expandHookFileItems(
	hookFileItems: readonly ICustomizationItem[],
	workspaceService: IAICustomizationWorkspaceService,
	fileService: IFileService,
	pathService: IPathService,
): Promise<ICustomizationItem[]> {
	const items: ICustomizationItem[] = [];
	const activeRoot = workspaceService.getActiveProjectRoot();
	const userHomeUri = await pathService.userHome();
	const userHome = userHomeUri.scheme === Schemas.file ? userHomeUri.fsPath : userHomeUri.path;

	for (const item of hookFileItems) {
		let parsedHooks = false;
		try {
			const content = await fileService.readFile(item.uri);
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
			// Parse failed — fall through to show raw file.
		}

		if (!parsedHooks) {
			items.push(item);
		}
	}

	return items;
}

// #endregion

// #region Normalizer

/**
 * Converts provider-shaped customization rows into the rich list model used by the management UI.
 */
export class AICustomizationItemNormalizer {
	constructor(
		private readonly workspaceContextService: IWorkspaceContextService,
		private readonly workspaceService: IAICustomizationWorkspaceService,
		private readonly labelService: ILabelService,
		private readonly agentPluginService: IAgentPluginService,
		private readonly productService: IProductService,
	) { }

	normalizeItems(items: readonly ICustomizationItem[], promptType: PromptsType): IAICustomizationListItem[] {
		const uriUseCounts = new ResourceMap<number>();
		return items
			.filter(item => item.type === promptType)
			.map(item => this.normalizeItem(item, promptType, uriUseCounts))
			.sort((a, b) => a.name.localeCompare(b.name));
	}

	normalizeItem(item: ICustomizationItem, promptType: PromptsType, uriUseCounts = new ResourceMap<number>()): IAICustomizationListItem {
		const { storage, groupKey, isBuiltin, extensionLabel } = this.resolveSource(item);
		const seenCount = uriUseCounts.get(item.uri) ?? 0;
		uriUseCounts.set(item.uri, seenCount + 1);
		const duplicateSuffix = seenCount === 0 ? '' : `#${seenCount}`;
		const isWorkspaceItem = storage === PromptsStorage.local;

		return {
			id: `${item.uri.toString()}${duplicateSuffix}`,
			uri: item.uri,
			name: item.name,
			filename: item.uri.scheme === Schemas.file
				? this.labelService.getUriLabel(item.uri, { relative: isWorkspaceItem })
				: basename(item.uri),
			description: item.description,
			storage,
			promptType,
			disabled: item.enabled === false,
			groupKey,
			pluginUri: storage === PromptsStorage.plugin ? this.findPluginUri(item.uri) : undefined,
			displayName: item.name,
			badge: item.badge,
			badgeTooltip: item.badgeTooltip,
			typeIcon: promptType === PromptsType.instructions && storage ? storageToIcon(storage) : undefined,
			isBuiltin,
			extensionLabel,
			status: item.status,
			statusMessage: item.statusMessage,
		};
	}

	private resolveSource(item: ICustomizationItem): { storage?: PromptsStorage; groupKey?: string; isBuiltin?: boolean; extensionLabel?: string } {
		const inferred = this.inferStorageAndGroup(item.uri);

		// Use provider-supplied storage when available; otherwise fall back to URI inference.
		const storage = item.storage ?? inferred.storage;
		const extensionLabel = inferred.extensionLabel;

		if (!item.groupKey) {
			return { ...inferred, storage };
		}

		switch (item.groupKey) {
			case BUILTIN_STORAGE:
				return { storage: PromptsStorage.extension, groupKey: BUILTIN_STORAGE, isBuiltin: true, extensionLabel };
			default:
				return { storage, groupKey: item.groupKey, extensionLabel };
		}
	}

	private inferStorageAndGroup(uri: URI): { storage?: PromptsStorage; groupKey?: string; isBuiltin?: boolean; extensionLabel?: string } {
		if (uri.scheme !== Schemas.file) {
			return { storage: PromptsStorage.extension, groupKey: BUILTIN_STORAGE, isBuiltin: true };
		}

		const activeProjectRoot = this.workspaceService.getActiveProjectRoot();
		if (activeProjectRoot && isEqualOrParent(uri, activeProjectRoot)) {
			return { storage: PromptsStorage.local };
		}

		for (const folder of this.workspaceContextService.getWorkspace().folders) {
			if (isEqualOrParent(uri, folder.uri)) {
				return { storage: PromptsStorage.local };
			}
		}

		for (const plugin of this.agentPluginService.plugins.get()) {
			if (isEqualOrParent(uri, plugin.uri)) {
				return { storage: PromptsStorage.plugin };
			}
		}

		const extensionId = extractExtensionIdFromPath(uri.path);
		if (extensionId) {
			const extensionIdentifier = new ExtensionIdentifier(extensionId);
			if (isChatExtensionItem(extensionIdentifier, this.productService)) {
				return { storage: PromptsStorage.extension, groupKey: BUILTIN_STORAGE, isBuiltin: true };
			}
			return { storage: PromptsStorage.extension, extensionLabel: extensionIdentifier.value };
		}

		return { storage: PromptsStorage.user };
	}

	private findPluginUri(itemUri: URI): URI | undefined {
		for (const plugin of this.agentPluginService.plugins.get()) {
			if (isEqualOrParent(itemUri, plugin.uri)) {
				return plugin.uri;
			}
		}
		return undefined;
	}
}

// #endregion

// #region Item Source

/**
 * Unified item source that fetches items from a provider (extension-contributed
 * or the promptsService adapter), normalizes them into list items, and optionally
 * blends in local syncable items when a sync provider is present.
 */
export class ProviderCustomizationItemSource implements IAICustomizationItemSource {

	readonly onDidChange: Event<void>;

	constructor(
		private readonly itemProvider: ICustomizationItemProvider | undefined,
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

	private async fetchItemsFromProvider(provider: ICustomizationItemProvider, promptType: PromptsType): Promise<IAICustomizationListItem[]> {
		const allItems = await provider.provideChatSessionCustomizations(CancellationToken.None);
		if (!allItems) {
			return [];
		}

		let providerItems: readonly ICustomizationItem[] = promptType === PromptsType.hook
			? await expandHookFileItems(
				allItems.filter(item => item.type === PromptsType.hook),
				this.workspaceService, this.fileService, this.pathService,
			)
			: allItems.filter(item => item.type === promptType);

		if (promptType === PromptsType.skill) {
			providerItems = await this.addSkillDescriptionFallbacks(providerItems);
		}

		return this.itemNormalizer.normalizeItems(providerItems, promptType);
	}

	private async addSkillDescriptionFallbacks(items: readonly ICustomizationItem[]): Promise<readonly ICustomizationItem[]> {
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

	private async fetchLocalSyncableItems(promptType: PromptsType, syncProvider: ICustomizationSyncProvider): Promise<IAICustomizationListItem[]> {
		const files = await this.promptsService.listPromptFiles(promptType, CancellationToken.None);
		if (!files.length) {
			return [];
		}

		const providerItems: ICustomizationItem[] = files
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

// #endregion
