/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Minimal async-tree surface used when focusing/selecting a search result.
 */
export interface ISearchTreeSelectionTarget<T> {
	hasNode(element: T): boolean;
	getFocus(): readonly T[];
	getSelection(): readonly T[];
	setSelection(elements: T[], browserEvent?: UIEvent): void;
	setFocus(elements: T[], browserEvent?: UIEvent): void;
}

/** Select/focus only when the async tree has materialized `element` (#328427). */
export function selectSearchTreeElementIfPresent<T>(
	tree: ISearchTreeSelectionTarget<T>,
	element: T,
	browserEvent?: UIEvent
): boolean {
	if (!tree.hasNode(element)) {
		return false;
	}
	if (!tree.getFocus().includes(element) || !tree.getSelection().includes(element)) {
		tree.setSelection([element], browserEvent);
		tree.setFocus([element], browserEvent);
	}
	return true;
}
