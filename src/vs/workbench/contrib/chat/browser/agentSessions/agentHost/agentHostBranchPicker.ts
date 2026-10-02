/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

const BRANCH_PICKER_RESULT_LIMIT = 25;

/**
 * Returns the branch picker items whose value contains `query` (case-insensitive),
 * keeping at most `limit` results.
 */
export function filterBranchPickerItems<T extends { readonly value: string }>(items: readonly T[], query?: string, limit = BRANCH_PICKER_RESULT_LIMIT): readonly T[] {
	const normalizedQuery = query?.toLowerCase();
	return (normalizedQuery ? items.filter(item => item.value.toLowerCase().includes(normalizedQuery)) : items)
		.slice(0, limit);
}
