/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IPosition } from './core/position.js';

export interface IGuidesTextModelPart {
	/**
	 * @internal
	 */
	getActiveIndentGuide(lineNumber: number, minLineNumber: number, maxLineNumber: number): IActiveIndentGuideInfo;

	/**
	 * @internal
	 */
	getLinesIndentGuides(startLineNumber: number, endLineNumber: number): number[];

	/**
	 * Requests the the indent guides for the given range of lines.
	 * `result[i]` will contain the indent guides of the `startLineNumber + i`th line.
	 * @internal
	 */
	getLinesBracketGuides(startLineNumber: number, endLineNumber: number, activePosition: IPosition | null, options: BracketGuideOptions): IndentGuide[][];
}

export interface IActiveIndentGuideInfo {
	startLineNumber: number;
	endLineNumber: number;
	indent: number;
}

export enum HorizontalGuidesState {
	Disabled,
	EnabledForActive,
	Enabled
}

export interface BracketGuideOptions {
	includeInactive: boolean;
	horizontalGuides: HorizontalGuidesState;
	highlightActive: boolean;
}

export class IndentGuide {
	constructor(
		public readonly visibleColumn: number | -1,
		public readonly column: number | -1,
		public readonly className: string,
		/**
		 * If set, this indent guide is a horizontal guide (no vertical part).
		 * It starts at visibleColumn and continues until endColumn.
		*/
		public readonly horizontalLine: IndentGuideHorizontalLine | null,
		/**
		 * If set (!= -1), only show this guide for wrapped lines that don't contain this model column, but are after it.
		*/
		public readonly forWrappedLinesAfterColumn: number | -1,
		public readonly forWrappedLinesBeforeOrAtColumn: number | -1
	) {
		if ((visibleColumn !== -1) === (column !== -1)) {
			throw new Error();
		}
	}
}

export class IndentGuideHorizontalLine {
	constructor(
		public readonly top: boolean,
		public readonly endColumn: number,
	) { }
}
