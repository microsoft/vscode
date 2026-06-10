/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { Event } from '../../../../../base/common/event.js';
import { IMatch } from '../../../../../base/common/filters.js';
import { Disposable, IDisposable } from '../../../../../base/common/lifecycle.js';
import { parse as parseJSONC } from '../../../../../base/common/json.js';
import { ResourceMap } from '../../../../../base/common/map.js';
import { Schemas } from '../../../../../base/common/network.js';
import { OS } from '../../../../../base/common/platform.js';
import { basename, dirname } from '../../../../../base/common/resources.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { URI } from '../../../../../base/common/uri.js';
import { localize } from '../../../../../nls.js';
import { ExtensionIdentifier } from '../../../../../platform/extensions/common/extensions.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { ILabelService } from '../../../../../platform/label/common/label.js';
import { IProductService } from '../../../../../platform/product/common/productService.js';
import { IPathService } from '../../../../services/path/common/pathService.js';
import { AICustomizationSources, IAICustomizationWorkspaceService } from '../../common/aiCustomizationWorkspaceService.js';
import { ICustomizationItem, ICustomizationItemProvider } from '../../common/customizationHarnessService.js';
import { parseHooksFromFile } from '../../common/promptSyntax/hookCompatibility.js';
import { formatHookCommandLabel } from '../../common/promptSyntax/hookSchema.js';
import { HOOK_METADATA } from '../../common/promptSyntax/hookTypes.js';
import { PromptsType } from '../../common/promptSyntax/promptTypes.js';
import { IPromptsService, PromptsStorage } from '../../common/promptSyntax/service/promptsService.js';
import { sourceToIcon } from './aiCustomizationIcons.js';
import { type AICustomizationSource, BUILTIN_STORAGE } from './aiCustomizationManagement.js';

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
	/** Storage or provider origin. All items, including those from external providers, must provide a source. */
	readonly source: AICustomizationSource;
	readonly promptType: PromptsType;
	readonly disabled: boolean;
	/** When set, overrides `source` for display grouping purposes. */
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
	readonly extensionId?: string;
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
export interface IAICustomizationItemSource extends IDisposable {
	readonly sessionResource: URI;
	readonly onDidAICustomizationItemsChange: Event<void>;
	fetchProviderItems(): Promise<readonly ICustomizationItem[]>;
	fetchAICustomizationItems(promptType: PromptsType): Promise<IAICustomizationListItem[]>;
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
							source: item.source,
							extensionId: item.extensionId,
							pluginUri: item.pluginUri,
							userInvocable: item.userInvocable,
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
		private readonly labelService: ILabelService,
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
		const { source, groupKey, isBuiltin, extensionId, pluginUri } = this.inferStorageAndGroup(item);
		const seenCount = uriUseCounts.get(item.uri) ?? 0;
		uriUseCounts.set(item.uri, seenCount + 1);
		const duplicateSuffix = seenCount === 0 ? '' : `#${seenCount}`;
		const isWorkspaceItem = source === AICustomizationSources.local;

		return {
			id: `${item.uri.toString()}${duplicateSuffix}`,
			uri: item.uri,
			name: item.name,
			filename: item.uri.scheme === Schemas.file
				? this.labelService.getUriLabel(item.uri, { relative: isWorkspaceItem })
				: basename(item.uri),
			description: item.description,
			source,
			promptType,
			disabled: item.enabled === false,
			groupKey,
			pluginUri,
			displayName: item.name,
			badge: item.badge,
			badgeTooltip: item.badgeTooltip,
			typeIcon: promptType === PromptsType.instructions && source ? sourceToIcon(source) : undefined,
			isBuiltin,
			extensionId,
			status: item.status,
			statusMessage: item.statusMessage,
		};
	}

	private inferStorageAndGroup(item: ICustomizationItem): { source: AICustomizationSource; groupKey?: string; isBuiltin?: boolean; extensionId?: string; pluginUri?: URI } {
		const groupKey = item.groupKey;
		const hasBuiltinStorage = item.source === AICustomizationSources.builtin;
		const isBuiltin = groupKey === BUILTIN_STORAGE || hasBuiltinStorage;

		if (hasBuiltinStorage) {
			return { source: AICustomizationSources.builtin, groupKey: groupKey ?? BUILTIN_STORAGE, isBuiltin: true, extensionId: item.extensionId };
		}
		if (item.source === AICustomizationSources.plugin) {
			return { source: AICustomizationSources.plugin, pluginUri: item.pluginUri, groupKey, isBuiltin };
		}
		if (item.source === AICustomizationSources.extension) {
			if (item.extensionId) {
				const extensionIdentifier = new ExtensionIdentifier(item.extensionId);
				if (isChatExtensionItem(extensionIdentifier, this.productService)) {
					return { source: AICustomizationSources.extension, groupKey: BUILTIN_STORAGE, isBuiltin: true, extensionId: item.extensionId };
				}
			}
			return { source: AICustomizationSources.extension, extensionId: item.extensionId, groupKey, isBuiltin };
		}
		return { source: item.source, groupKey, isBuiltin, pluginUri: item.pluginUri, extensionId: item.extensionId };
	}
}

// #endregion

/**
 * Item source backed by a session-scoped customization item provider.
 */
export class ItemProviderItemSource extends Disposable implements IAICustomizationItemSource {

	readonly onDidAICustomizationItemsChange: Event<void>;
	private cachedPromise: Promise<readonly ICustomizationItem[] | undefined> | undefined;

	constructor(
		readonly sessionResource: URI,
		private readonly itemProvider: ICustomizationItemProvider,
		private readonly promptsService: IPromptsService,
		private readonly workspaceService: IAICustomizationWorkspaceService,
		private readonly fileService: IFileService,
		private readonly pathService: IPathService,
		private readonly itemNormalizer: AICustomizationItemNormalizer,
	) {
		super();
		this.onDidAICustomizationItemsChange = Event.any(
			this.itemProvider.onDidChange,
			this.promptsService.onDidChangeSkills
		);

		// Invalidate cache when provider or skills change
		this._register(this.onDidAICustomizationItemsChange(() => {
			this.cachedPromise = undefined;
		}));
	}

	async fetchProviderItems(): Promise<readonly ICustomizationItem[]> {
		if (!this.cachedPromise) {
			this.cachedPromise = this.itemProvider.provideChatSessionCustomizations(this.sessionResource, CancellationToken.None);
		}
		const cached = this.cachedPromise;
		const allItems = await cached;
		if (cached !== this.cachedPromise || !allItems) {
			return [];
		}
		return allItems;
	}

	async fetchAICustomizationItems(promptType: PromptsType): Promise<IAICustomizationListItem[]> {
		const allItems = await this.fetchProviderItems();

		let providerItems: readonly ICustomizationItem[];
		if (promptType === PromptsType.hook) {
			const hookItems = allItems.filter(item => item.type === PromptsType.hook);
			// Plugin hooks are pre-expanded by plugin manifests — skip re-expansion.
			const toExpand = hookItems.filter(item => item.source !== AICustomizationSources.plugin);
			const preExpanded = hookItems.filter(item => item.source === AICustomizationSources.plugin);
			const expanded = await expandHookFileItems(
				toExpand, this.workspaceService, this.fileService, this.pathService,
			);
			providerItems = [...expanded, ...preExpanded];
		} else {
			providerItems = allItems.filter(item => item.type === promptType);
		}

		if (promptType === PromptsType.skill) {
			providerItems = await this.addSkillDescriptionFallbacks(providerItems);
		}

		const normalized = this.itemNormalizer.normalizeItems(providerItems, promptType);
		if (promptType === PromptsType.skill) {
			return this.mergeBuiltinSkills(normalized, promptType);
		}
		return normalized;
	}

	/**
	 * Merges built-in skills (bundled with the app under `vs/sessions/skills/`)
	 * into the provider's items. The provider may re-discover the bundled
	 * copies when scanning disk — those duplicates are dropped (deduped by
	 * URI) and replaced with the authoritative built-in entry tagged
	 * `groupKey: BUILTIN_STORAGE` so the UI renders them in the "Built-in"
	 * group. User-authored overrides (different URI, same name) are preserved.
	 *
	 * A workbench that uses the base `PromptsService` will throw on
	 * `BUILTIN_STORAGE` — we catch and return the items unchanged in that case.
	 */
	private async mergeBuiltinSkills(items: readonly IAICustomizationListItem[], promptType: PromptsType): Promise<IAICustomizationListItem[]> {
		let builtinPaths: readonly { uri: URI; name?: string; description?: string }[] = [];
		try {
			builtinPaths = await this.promptsService.listPromptFilesForStorage(PromptsType.skill, BUILTIN_STORAGE as unknown as PromptsStorage, CancellationToken.None);
		} catch {
			return [...items];
		}
		if (builtinPaths.length === 0) {
			return [...items];
		}

		const builtinUris = new ResourceMap<typeof builtinPaths[number]>();
		for (const p of builtinPaths) {
			builtinUris.set(p.uri, p);
		}

		// Drop provider items that are the same URI as a built-in (the provider
		// re-discovered the bundled copy by scanning disk).
		const deduped = items.filter(item => !builtinUris.has(item.uri));

		const uiIntegrations = this.workspaceService.getSkillUIIntegrations();
		const uiIntegrationBadge = localize('uiIntegrationBadge', "UI Integration");

		// Collect names of user/workspace skills so we can hide the built-in
		// copy once the user has added an override at either level.
		const overriddenNames = new Set<string>();
		for (const item of deduped) {
			if (item.source === AICustomizationSources.local || item.source === AICustomizationSources.user) {
				if (item.name) {
					overriddenNames.add(item.name);
				}
			}
		}

		// Append authoritative built-in entries (excluding any that have been
		// overridden by a workspace or user copy with the same name).
		const uriUseCounts = new ResourceMap<number>();
		for (const item of deduped) {
			uriUseCounts.set(item.uri, (uriUseCounts.get(item.uri) ?? 0) + 1);
		}
		const appended: IAICustomizationListItem[] = [];
		const disabledPromptFiles = this.promptsService.getDisabledPromptFiles(PromptsType.skill);
		for (const p of builtinPaths) {
			const name = p.name ?? basename(p.uri);
			if (overriddenNames.has(name)) {
				continue;
			}
			const folderName = basename(dirname(p.uri));
			const uiTooltip = uiIntegrations.get(folderName);
			const builtinItem: ICustomizationItem = {
				uri: p.uri,
				type: PromptsType.skill,
				name,
				description: p.description,
				source: AICustomizationSources.builtin,
				groupKey: BUILTIN_STORAGE,
				enabled: !disabledPromptFiles.has(p.uri),
				badge: uiTooltip ? uiIntegrationBadge : undefined,
				badgeTooltip: uiTooltip,
				extensionId: undefined,
				pluginUri: undefined,
				userInvocable: true,
			};
			appended.push(this.itemNormalizer.normalizeItem(builtinItem, promptType, uriUseCounts));
		}

		return [...deduped, ...appended];
	}

	private async addSkillDescriptionFallbacks(items: readonly ICustomizationItem[]): Promise<readonly ICustomizationItem[]> {
		const descriptionsByUri = new Map<string, string>();
		const skills = await this.promptsService.findAgentSkills(CancellationToken.None);
		for (const skill of skills ?? []) {
			if (skill.description) {
				descriptionsByUri.set(skill.uri.toString(), skill.description);
			}
		}

		return items.map(item => item.description ? item : { ...item, description: descriptionsByUri.get(item.uri.toString()) });
	}
}

export class PureItemProviderItemSource extends Disposable implements IAICustomizationItemSource {

	readonly onDidAICustomizationItemsChange: Event<void>;
	// Caches the raw, unfiltered items returned by the provider so each
	// `fetchAICustomizationItems` call can apply its own `promptType` filter.
	// Previously the cache stored items already filtered/normalized for the
	// first requested `promptType`, which caused every subsequent section
	// (Instructions, Skills, …) to see an empty list whenever the Agents tab
	// was loaded first.
	private cachedPromise: Promise<readonly ICustomizationItem[] | undefined> | undefined;

	constructor(
		readonly sessionResource: URI,
		private readonly itemProvider: ICustomizationItemProvider,
		private readonly itemNormalizer: AICustomizationItemNormalizer,
	) {
		super();
		this.onDidAICustomizationItemsChange = this.itemProvider.onDidChange;

		// Invalidate cache when the provider changes
		this._register(this.itemProvider.onDidChange(() => {
			this.cachedPromise = undefined;
		}));
	}

	async fetchProviderItems(): Promise<readonly ICustomizationItem[]> {
		if (!this.cachedPromise) {
			const promise = this.itemProvider.provideChatSessionCustomizations(this.sessionResource, CancellationToken.None);
			this.cachedPromise = promise;
			promise.catch(() => {
				if (this.cachedPromise === promise) {
					this.cachedPromise = undefined;
				}
			});
		}
		const cached = this.cachedPromise;
		const allItems = await cached;
		if (cached !== this.cachedPromise || !allItems) {
			return [];
		}
		return allItems;
	}

	async fetchAICustomizationItems(promptType: PromptsType): Promise<IAICustomizationListItem[]> {
		const allItems = await this.fetchProviderItems();
		return this.itemNormalizer.normalizeItems(allItems, promptType);
	}


}



// #endregion
