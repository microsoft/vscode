/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CallbackIterable } from '../../base/common/arrays.js';
import { Event } from '../../base/common/event.js';
import { IPosition } from './core/position.js';
import { IRange, Range } from './core/range.js';
import { ClosingBracketKind, OpeningBracketKind } from './languages/supports/languageBracketsConfiguration.js';
import { PairAstNode } from './model/bracketPairsTextModelPart/bracketPairsTree/ast.js';

export interface IBracketPairsTextModelPart {
	/**
	 * Is fired when bracket pairs change, either due to a text or a settings change.
	*/
	onDidChange: Event<void>;

	/**
	 * Gets all bracket pairs that intersect the given position.
	 * The result is sorted by the start position.
	 */
	getBracketPairsInRange(range: IRange): CallbackIterable<BracketPairInfo>;

	/**
	 * Gets all bracket pairs that intersect the given position.
	 * The result is sorted by the start position.
	 */
	getBracketPairsInRangeWithMinIndentation(range: IRange): CallbackIterable<BracketPairWithMinIndentationInfo>;

	getBracketsInRange(range: IRange, onlyColorizedBrackets?: boolean): CallbackIterable<BracketInfo>;

	/**
	 * Find the matching bracket of `request` up, counting brackets.
	 * @param request The bracket we're searching for
	 * @param position The position at which to start the search.
	 * @return The range of the matching bracket, or null if the bracket match was not found.
	 */
	findMatchingBracketUp(bracket: string, position: IPosition, maxDuration?: number): Range | null;

	/**
	 * Find the first bracket in the model before `position`.
	 * @param position The position at which to start the search.
	 * @return The info for the first bracket before `position`, or null if there are no more brackets before `positions`.
	 */
	findPrevBracket(position: IPosition): IFoundBracket | null;

	/**
	 * Find the first bracket in the model after `position`.
	 * @param position The position at which to start the search.
	 * @return The info for the first bracket after `position`, or null if there are no more brackets after `positions`.
	 */
	findNextBracket(position: IPosition): IFoundBracket | null;

	/**
	 * Find the enclosing brackets that contain `position`.
	 * @param position The position at which to start the search.
	 */
	findEnclosingBrackets(position: IPosition, maxDuration?: number): [Range, Range] | null;

	/**
	 * Given a `position`, if the position is on top or near a bracket,
	 * find the matching bracket of that bracket and return the ranges of both brackets.
	 * @param position The position at which to look for a bracket.
	 */
	matchBracket(position: IPosition, maxDuration?: number): [Range, Range] | null;
}

export interface IFoundBracket {
	range: Range;
	bracketInfo: OpeningBracketKind | ClosingBracketKind;
}

export class BracketInfo {
	constructor(
		public readonly range: Range,
		/** 0-based level */
		public readonly nestingLevel: number,
		public readonly nestingLevelOfEqualBracketType: number,
		public readonly isInvalid: boolean,
	) { }
}

export class BracketPairInfo {
	constructor(
		public readonly range: Range,
		public readonly openingBracketRange: Range,
		public readonly closingBracketRange: Range | undefined,
		/** 0-based */
		public readonly nestingLevel: number,
		public readonly nestingLevelOfEqualBracketType: number,
		private readonly bracketPairNode: PairAstNode,

	) {
	}

	public get openingBracketInfo(): OpeningBracketKind {
		return this.bracketPairNode.openingBracket.bracketInfo as OpeningBracketKind;
	}

	public get closingBracketInfo(): ClosingBracketKind | undefined {
		return this.bracketPairNode.closingBracket?.bracketInfo as ClosingBracketKind | undefined;
	}
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
		nestingLevelOfEqualBracketType: number,
		bracketPairNode: PairAstNode,
		/**
		 * -1 if not requested, otherwise the size of the minimum indentation in the bracket pair in terms of visible columns.
		*/
		public readonly minVisibleColumnIndentation: number,
	) {
		super(range, openingBracketRange, closingBracketRange, nestingLevel, nestingLevelOfEqualBracketType, bracketPairNode);
	}
}
