/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { HoverAnchor, IHoverPart } from './hoverTypes.js';

export class HoverResult<U> {

	constructor(
		public readonly anchor: HoverAnchor,
		public readonly hoverParts: IHoverPart[],
		public readonly isComplete: boolean,
		public readonly options: U
	) { }

	public filter(anchor: HoverAnchor): HoverResult<U> {
		const filteredHoverParts = this.hoverParts.filter((m) => m.isValidForHoverAnchor(anchor));
		if (filteredHoverParts.length === this.hoverParts.length) {
			return this;
		}
		return new FilteredHoverResult(this, this.anchor, filteredHoverParts, this.isComplete, this.options);
	}
}

export class FilteredHoverResult<U> extends HoverResult<U> {

	constructor(
		private readonly original: HoverResult<U>,
		anchor: HoverAnchor,
		messages: IHoverPart[],
		isComplete: boolean,
		options: U
	) {
		super(anchor, messages, isComplete, options);
	}

	public override filter(anchor: HoverAnchor): HoverResult<U> {
		return this.original.filter(anchor);
	}
}
