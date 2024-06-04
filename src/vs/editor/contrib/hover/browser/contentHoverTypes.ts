/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DisposableStore } from 'vs/base/common/lifecycle';
import { Position } from 'vs/editor/common/core/position';
import { HoverStartSource } from 'vs/editor/contrib/hover/browser/hoverOperation';
import { HoverAnchor, IEditorHoverColorPickerWidget, IHoverPart } from 'vs/editor/contrib/hover/browser/hoverTypes';

export class HoverResult {

	constructor(
		public readonly anchor: HoverAnchor,
		public readonly hoverParts: IHoverPart[],
		public readonly isComplete: boolean
	) { }

	public filter(anchor: HoverAnchor): HoverResult {
		const filteredHoverParts = this.hoverParts.filter((m) => m.isValidForHoverAnchor(anchor));
		if (filteredHoverParts.length === this.hoverParts.length) {
			return this;
		}
		return new FilteredHoverResult(this, this.anchor, filteredHoverParts, this.isComplete);
	}
}

export class FilteredHoverResult extends HoverResult {

	constructor(
		private readonly original: HoverResult,
		anchor: HoverAnchor,
		messages: IHoverPart[],
		isComplete: boolean
	) {
		super(anchor, messages, isComplete);
	}

	public override filter(anchor: HoverAnchor): HoverResult {
		return this.original.filter(anchor);
	}
}

export class ContentHoverVisibleData {

	public closestMouseDistance: number | undefined = undefined;

	constructor(
		public initialMousePosX: number | undefined,
		public initialMousePosY: number | undefined,
		public readonly colorPicker: IEditorHoverColorPickerWidget | null,
		public readonly showAtPosition: Position,
		public readonly showAtSecondaryPosition: Position,
		public readonly preferAbove: boolean,
		public readonly stoleFocus: boolean,
		public readonly source: HoverStartSource,
		public readonly isBeforeContent: boolean,
		public readonly disposables: DisposableStore
	) { }
}
