/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IPosition } from 'vs/editor/common/core/position';

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
	includeInactive: boolean,
	horizontalGuides: HorizontalGuidesState,
	highlightActive: boolean,
}

export class IndentGuide {
	constructor(
		public readonly visibleColumn: number,
		public readonly className: string,
		/**
		 * If set, this indent guide is a horizontal guide (no vertical part).
		 * It starts at visibleColumn and continues until endColumn.
		*/
		public readonly horizontalLine: IndentGuideHorizontalLine | null,
	) { }
}

export class IndentGuideHorizontalLine {
	constructor(
		public readonly top: boolean,
		public readonly endColumn: number,
	) { }
}
