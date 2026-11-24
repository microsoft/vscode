/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../../../base/common/codicons.js';
import { AnchorPosition } from '../../../../../../base/common/layout.js';
import { localize } from '../../../../../../nls.js';
import { ActionListItemKind, IActionListItem, IActionListOptions } from '../../../../../../platform/actionWidget/browser/actionList.js';

/**
 * Maximum number of branch rows a branch picker dropdown shows before it scrolls.
 */
export const BRANCH_PICKER_MAX_VISIBLE_ITEMS = 10;

/**
 * Returns the branch picker items whose value contains `query` (case-insensitive).
 */
export function filterBranchPickerItems<T extends { readonly value: string }>(items: readonly T[], query?: string, limit = Number.POSITIVE_INFINITY): readonly T[] {
	const normalizedQuery = query?.toLowerCase();
	return (normalizedQuery ? items.filter(item => item.value.toLowerCase().includes(normalizedQuery)) : items)
		.slice(0, limit);
}

export function ensureSelectedBranchPickerItem<T extends { readonly value: string; readonly label: string; readonly description?: string }>(items: readonly T[], currentValue: unknown, query?: string): readonly (T | { readonly value: string; readonly label: string; readonly description: undefined })[] {
	const normalizedQuery = query?.toLowerCase();
	return typeof currentValue === 'string'
		&& (!normalizedQuery || currentValue.toLowerCase().includes(normalizedQuery))
		&& !items.some(item => item.value === currentValue)
		? [{ value: currentValue, label: currentValue, description: undefined }, ...items]
		: items;
}

/** The item of a branch row. Its id is its value, so a picker can focus the row by value. */
export interface IBranchPickerItem {
	readonly id: string;
	readonly value: string;
	readonly label: string;
}

/** A branch row: the Git branch icon and `label`, which defaults to `value`. */
export function createBranchPickerActionItem(value: string, label = value): IActionListItem<IBranchPickerItem> {
	return {
		kind: ActionListItemKind.Action,
		label,
		group: { title: '', icon: Codicon.gitBranch },
		item: { id: value, value, label },
	};
}

/** A branch pinned above the remaining branches. */
export interface IPinnedBranch {
	readonly name: string | undefined;
	/** Remote-tracking branches are listed even when missing from the results. */
	readonly isRemote: boolean;
}

/** Pinned branches listed together under a labeled separator. */
export interface IPinnedBranchGroup {
	readonly label: string;
	readonly branches: readonly IPinnedBranch[];
}

/**
 * Removes the pinned branches from `actionItems` and returns them grouped, each
 * group after the first under a separator labeled with its name, followed by a
 * separator labeled "Branches" before the remaining branches. Every branch
 * carries its group name as its group title so screen readers, which skip
 * separators, announce it, including in the first group; the remaining
 * branches are updated in place. A branch is pinned once, in its first group;
 * missing remote-tracking branches are created when they match `query`.
 */
export function takePinnedBranchItems<T extends { readonly value: string }>(actionItems: IActionListItem<T>[], groups: readonly IPinnedBranchGroup[], query: string | undefined): IActionListItem<T | IBranchPickerItem>[] {
	const withGroupTitle = <I>(item: IActionListItem<I>, title: string): IActionListItem<I> => ({ ...item, group: { ...item.group, title } });
	const pinnedItems: IActionListItem<T | IBranchPickerItem>[] = [];
	const pinnedNames = new Set<string>();
	for (const group of groups) {
		const groupItems: IActionListItem<T | IBranchPickerItem>[] = [];
		for (const { name, isRemote } of group.branches) {
			if (!name || pinnedNames.has(name)) {
				continue;
			}
			const index = actionItems.findIndex(item => item.item?.value === name);
			const item: IActionListItem<T | IBranchPickerItem> | undefined = index >= 0
				? actionItems.splice(index, 1)[0]
				: isRemote && (!query || name.toLowerCase().includes(query))
					? createBranchPickerActionItem(name)
					: undefined;
			if (item) {
				pinnedNames.add(name);
				groupItems.push(withGroupTitle(item, group.label));
			}
		}
		if (groupItems.length > 0) {
			// The first group needs no separator above it.
			if (pinnedItems.length > 0) {
				pinnedItems.push({ kind: ActionListItemKind.Separator, label: group.label });
			}
			pinnedItems.push(...groupItems);
		}
	}
	if (pinnedItems.length > 0 && actionItems.length > 0) {
		const remainingLabel = localize('agentHostSessionConfig.otherBranchesGroup', "Branches");
		pinnedItems.push({ kind: ActionListItemKind.Separator, label: remainingLabel });
		for (let i = 0; i < actionItems.length; i++) {
			actionItems[i] = withGroupTitle(actionItems[i], remainingLabel);
		}
	}
	return pinnedItems;
}

/** The list options of a branch picker, which shows a filter only when it lists more than {@link BRANCH_PICKER_MAX_VISIBLE_ITEMS} branches. */
export function getBranchPickerListOptions(branchCount: number, filterPlaceholder: string): IActionListOptions {
	return {
		...(branchCount > BRANCH_PICKER_MAX_VISIBLE_ITEMS ? { showFilter: true, filterPlaceholder } : {}),
		minWidth: 255,
		anchorPosition: AnchorPosition.BELOW,
		maxVisibleItems: BRANCH_PICKER_MAX_VISIBLE_ITEMS,
	};
}
