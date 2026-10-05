/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

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
