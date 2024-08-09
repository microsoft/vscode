/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { HoverAnchor, IHoverPart } from 'vs/editor/contrib/hover/browser/hoverTypes';

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
