/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ContentHoverComputerOptions } from './contentHoverComputer.js';
import { HoverAnchor, IHoverPart } from './hoverTypes.js';

export class ContentHoverResult {

	constructor(
		public readonly hoverParts: IHoverPart[],
		public readonly isComplete: boolean,
		public readonly options: ContentHoverComputerOptions
	) { }

	public filter(anchor: HoverAnchor): ContentHoverResult {
		const filteredHoverParts = this.hoverParts.filter((m) => m.isValidForHoverAnchor(anchor));
		if (filteredHoverParts.length === this.hoverParts.length) {
			return this;
		}
		return new FilteredContentHoverResult(this, filteredHoverParts, this.isComplete, this.options);
	}
}

export class FilteredContentHoverResult extends ContentHoverResult {

	constructor(
		private readonly original: ContentHoverResult,
		messages: IHoverPart[],
		isComplete: boolean,
		options: ContentHoverComputerOptions
	) {
		super(messages, isComplete, options);
	}

	public override filter(anchor: HoverAnchor): ContentHoverResult {
		return this.original.filter(anchor);
	}
}
