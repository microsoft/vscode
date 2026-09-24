/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

const BRANCH_PICKER_RESULT_LIMIT = 25;

export function filterBranchPickerItems<T extends { readonly value: string }>(items: readonly T[], query?: string): readonly T[] {
	const normalizedQuery = query?.toLowerCase();
	return (normalizedQuery ? items.filter(item => item.value.toLowerCase().includes(normalizedQuery)) : items)
		.slice(0, BRANCH_PICKER_RESULT_LIMIT);
}
