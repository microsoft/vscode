/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from 'vs/base/common/event';
import { Range } from 'vs/editor/common/core/range';

export interface IBracketPairs {
	/**
	 * Gets all bracket pairs that intersect the given position.
	 * The result is sorted by the start position.
	 */
	getBracketPairsInRange(range: Range): BracketPairInfo[];

	/**
	 * Gets all bracket pairs that intersect the given position.
	 * The result is sorted by the start position.
	 */
	getBracketPairsInRangeWithMinIndentation(range: Range): BracketPairWithMinIndentationInfo[];

	getBracketsInRange(range: Range): BracketInfo[];

	onDidChange: Event<void>;
}

export class BracketInfo {
	constructor(
		public readonly range: Range,
		/** 0-based level */
		public readonly nestingLevel: number,
		public readonly isInvalid: boolean,
	) { }
}

export class BracketPairInfo {
	constructor(
		public readonly range: Range,
		public readonly openingBracketRange: Range,
		public readonly closingBracketRange: Range | undefined,
		/**
		 * 0-based
		*/
		public readonly nestingLevel: number,
	) { }
}

export class BracketPairWithMinIndentationInfo extends BracketPairInfo {
	constructor(
		range: Range,
		openingBracketRange: Range,
		closingBracketRange: Range | undefined,
		/**
		 * 0-based
		*/
		nestingLevel: number,
		/**
		 * -1 if not requested, otherwise the size of the minimum indentation in the bracket pair in terms of visible columns.
		*/
		public readonly minVisibleColumnIndentation: number,
	) {
		super(range, openingBracketRange, closingBracketRange, nestingLevel);
	}
}
