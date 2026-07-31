/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Minimal async-tree surface used when focusing/selecting a search result.
 */
export interface ISearchTreeSelectionTarget {
	hasNode(element: unknown): boolean;
	getFocus(): readonly unknown[];
	getSelection(): readonly unknown[];
	setSelection(elements: unknown[], browserEvent?: UIEvent): void;
	setFocus(elements: unknown[], browserEvent?: UIEvent): void;
}

/** Select/focus only when the async tree has materialized `element` (#328427). */
export function selectSearchTreeElementIfPresent(
	tree: ISearchTreeSelectionTarget,
	element: unknown,
	browserEvent?: UIEvent
): boolean {
	if (!tree.hasNode(element)) {
		return false;
	}
	if (!tree.getFocus().includes(element) || !tree.getSelection().includes(element)) {
		tree.setSelection([element], browserEvent);
		tree.setFocus([element]);
	}
	return true;
}
