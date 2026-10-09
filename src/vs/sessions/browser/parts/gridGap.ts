/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isHTMLElement } from '../../../base/browser/dom.js';
import { Direction, Grid, GridNode, IView, isGridBranchNode } from '../../../base/browser/ui/grid/grid.js';

export const GRID_GAP_SASH_CLASS = 'agents-grid-gap-sash';

/** Insets that expose a shared visual gap along the interior edges of a grid view. */
export interface IGridEdgeInsets {
	readonly top: number;
	readonly right: number;
	readonly bottom: number;
	readonly left: number;
}

export const NO_GRID_EDGE_INSETS: IGridEdgeInsets = { top: 0, right: 0, bottom: 0, left: 0 };

/** Splits a shared gap between each view and its adjacent grid neighbors. */
export function getGridEdgeInsets<T extends IView>(grid: Grid<T>, view: T, gap: number): IGridEdgeInsets {
	if (gap <= 0) {
		return NO_GRID_EDGE_INSETS;
	}
	const before = Math.floor(gap / 2);
	const after = gap - before;
	return {
		top: grid.getNeighborViews(view, Direction.Up, false).length > 0 ? before : 0,
		right: grid.getNeighborViews(view, Direction.Right, false).length > 0 ? after : 0,
		bottom: grid.getNeighborViews(view, Direction.Down, false).length > 0 ? after : 0,
		left: grid.getNeighborViews(view, Direction.Left, false).length > 0 ? before : 0,
	};
}

function getDirectChild(element: Element, className: string): HTMLElement | undefined {
	for (const child of element.children) {
		if (isHTMLElement(child) && child.classList.contains(className)) {
			return child;
		}
	}
	return undefined;
}

/** Marks only the gap sashes owned by this grid, excluding grids nested inside its leaves. */
export function updateGridGapSashes<T extends IView>(grid: Grid<T>, enabled: boolean): void {
	const visit = (element: HTMLElement, node: GridNode<T>): void => {
		if (!isGridBranchNode(node)) {
			return;
		}
		const splitView = getDirectChild(element, 'monaco-split-view2');
		const sashContainer = splitView && getDirectChild(splitView, 'sash-container');
		const scrollable = splitView && getDirectChild(splitView, 'monaco-scrollable-element');
		const viewContainer = scrollable && getDirectChild(scrollable, 'split-view-container');
		if (!splitView || !sashContainer || !viewContainer) {
			return;
		}

		const positionProperty = splitView.classList.contains('horizontal') ? 'left' : 'top';
		const sashes = Array.from(sashContainer.children)
			.filter((child): child is HTMLElement => isHTMLElement(child) && child.classList.contains('monaco-sash'))
			.map((sash, index) => ({ sash, index, position: Number.parseFloat(sash.style[positionProperty]) }))
			.sort((first, second) => {
				if (Number.isNaN(first.position) || Number.isNaN(second.position)) {
					return first.index - second.index;
				}
				return first.position - second.position;
			})
			.map(({ sash }) => sash);
		const views = Array.from(viewContainer.children)
			.filter((child): child is HTMLElement => isHTMLElement(child) && child.classList.contains('split-view-view'));

		for (const sash of sashes) {
			sash.classList.toggle(GRID_GAP_SASH_CLASS, enabled);
		}
		for (let index = 0; index < node.children.length; index++) {
			const childElement = views[index]?.firstElementChild;
			if (isHTMLElement(childElement) && childElement.classList.contains('monaco-grid-branch-node')) {
				visit(childElement, node.children[index]);
			}
		}
	};

	const root = getDirectChild(grid.element, 'monaco-grid-branch-node');
	if (root) {
		visit(root, grid.getViews());
	}
}
