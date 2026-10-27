/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $, getActiveElement, isHTMLElement } from '../../../base/browser/dom.js';
import { ISerializableView, IViewSize, LayoutPriority } from '../../../base/browser/ui/grid/grid.js';
import { Emitter } from '../../../base/common/event.js';
import { Disposable } from '../../../base/common/lifecycle.js';

/** What shows in the column of its own at the right of the side pane stacked above the Sessions Part, such as the Session Activity Bar. */
export interface IStackedSidePaneColumn {
	/** Shown in the column. */
	readonly element: HTMLElement;
	/** The fixed width of the column. */
	readonly width: number;
	/** The column was laid out at `height`. */
	layout(height: number): void;
	/** Takes {@link element} back, before the column leaves the grid. */
	release(): void;
}

/** The type of {@link StackedSidePaneColumnView} in the serialized workbench grid. */
export const STACKED_SIDE_PANE_COLUMN_VIEW_TYPE = 'agentsStackedSidePaneColumn';

/** Moves `element` into `parent`; the element in it that had the focus gets it back. */
export function moveKeepingFocus(element: HTMLElement, parent: HTMLElement): void {
	if (element.parentElement === parent) {
		return;
	}
	const focused = getActiveElement();
	const hadFocus = isHTMLElement(focused) && element.contains(focused) ? focused : undefined;
	parent.appendChild(element);
	hadFocus?.focus();
}

/**
 * A view of the workbench grid of its own, at the right of the side pane stacked above the Sessions Part and of the
 * Sessions Part, the full height of both: the column {@link IStackedSidePaneColumn} shows in. A fixed width, so it has no sash.
 */
export class StackedSidePaneColumnView extends Disposable implements ISerializableView {

	readonly element = $('.agents-stacked-side-pane-column');

	private _width = 0;
	get minimumWidth(): number { return this._width; }
	get maximumWidth(): number { return this._width; }
	readonly minimumHeight = 0;
	readonly maximumHeight = Number.POSITIVE_INFINITY;
	readonly priority = LayoutPriority.Low;

	private readonly _onDidChange = this._register(new Emitter<IViewSize | undefined>());
	readonly onDidChange = this._onDidChange.event;

	private _column: IStackedSidePaneColumn | undefined;
	private _height = 0;

	get column(): IStackedSidePaneColumn | undefined {
		return this._column;
	}

	setColumn(column: IStackedSidePaneColumn | undefined): void {
		this._column = column;
		if (!column) {
			return;
		}
		moveKeepingFocus(column.element, this.element);
		if (column.width !== this._width) {
			this._width = column.width;
			this._onDidChange.fire(undefined);
		}
		column.layout(this._height);
	}

	layout(_width: number, height: number): void {
		this._height = height;
		this._column?.layout(height);
	}

	toJSON(): object {
		return { type: STACKED_SIDE_PANE_COLUMN_VIEW_TYPE };
	}
}
