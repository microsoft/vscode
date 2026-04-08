/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../../../base/common/event.js';
import { IMatch } from '../../../../../base/common/filters.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { URI } from '../../../../../base/common/uri.js';
import { PromptsType } from '../../common/promptSyntax/promptTypes.js';
import { PromptsStorage } from '../../common/promptSyntax/service/promptsService.js';

/**
 * Represents an AI customization item in the list.
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
 * this browser-only list item shape, and add view-only overlays such as sync state.
 */
export interface IAICustomizationItemSource {
	readonly onDidChange: Event<void>;
	fetchItems(promptType: PromptsType): Promise<IAICustomizationListItem[]>;
}
