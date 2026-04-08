/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ResourceMap } from '../../../../../base/common/map.js';
import { Schemas } from '../../../../../base/common/network.js';
import { basename, isEqualOrParent } from '../../../../../base/common/resources.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { URI } from '../../../../../base/common/uri.js';
import { ExtensionIdentifier } from '../../../../../platform/extensions/common/extensions.js';
import { ILabelService } from '../../../../../platform/label/common/label.js';
import { IProductService } from '../../../../../platform/product/common/productService.js';
import { IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';
import { IAICustomizationWorkspaceService } from '../../common/aiCustomizationWorkspaceService.js';
import { IAgentPluginService } from '../../common/plugins/agentPluginService.js';
import { PromptsType } from '../../common/promptSyntax/promptTypes.js';
import { PromptsStorage } from '../../common/promptSyntax/service/promptsService.js';
import { IExternalCustomizationItem } from '../../common/customizationHarnessService.js';
import { BUILTIN_STORAGE } from './aiCustomizationManagement.js';
import { extensionIcon, instructionsIcon, pluginIcon, userIcon, workspaceIcon } from './aiCustomizationIcons.js';
import { IAICustomizationListItem } from './aiCustomizationListItem.js';
import { extractExtensionIdFromPath } from './aiCustomizationListWidgetUtils.js';

/**
 * Returns the icon for a given storage type.
 */
export function storageToIcon(storage: PromptsStorage): ThemeIcon {
	switch (storage) {
		case PromptsStorage.local: return workspaceIcon;
		case PromptsStorage.user: return userIcon;
		case PromptsStorage.extension: return extensionIcon;
		case PromptsStorage.plugin: return pluginIcon;
		default: return instructionsIcon;
	}
}

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

	normalizeItems(items: readonly IExternalCustomizationItem[], promptType: PromptsType): IAICustomizationListItem[] {
		const uriUseCounts = new ResourceMap<number>();
		return items
			.filter(item => item.type === promptType)
			.map(item => this.normalizeItem(item, promptType, uriUseCounts))
			.sort((a, b) => a.name.localeCompare(b.name));
	}

	normalizeItem(item: IExternalCustomizationItem, promptType: PromptsType, uriUseCounts = new ResourceMap<number>()): IAICustomizationListItem {
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

	private resolveSource(item: IExternalCustomizationItem): { storage?: PromptsStorage; groupKey?: string; isBuiltin?: boolean; extensionLabel?: string } {
		const inferred = this.inferStorageAndGroup(item.uri);
		if (!item.groupKey) {
			return inferred;
		}

		switch (item.groupKey) {
			case PromptsStorage.local:
			case PromptsStorage.user:
			case PromptsStorage.extension:
			case PromptsStorage.plugin:
				return { ...inferred, storage: item.groupKey };
			case BUILTIN_STORAGE:
				return { ...inferred, storage: PromptsStorage.extension, groupKey: BUILTIN_STORAGE, isBuiltin: true };
			default:
				return { ...inferred, groupKey: item.groupKey };
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
			if (this.isChatExtensionItem(extensionIdentifier)) {
				return { storage: PromptsStorage.extension, groupKey: BUILTIN_STORAGE, isBuiltin: true };
			}
			return { storage: PromptsStorage.extension, extensionLabel: extensionIdentifier.value };
		}

		return { storage: PromptsStorage.user };
	}

	private isChatExtensionItem(extensionId: ExtensionIdentifier): boolean {
		const chatExtensionId = this.productService.defaultChatAgent?.chatExtensionId;
		return !!chatExtensionId && ExtensionIdentifier.equals(extensionId, chatExtensionId);
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
