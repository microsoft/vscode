/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {IEventEmitter} from 'vs/base/common/eventEmitter';
import {IModelDecoration, IRange, EndOfLinePreference, IPosition} from 'vs/editor/common/editorCommon';
import {ViewLineTokens} from 'vs/editor/common/core/viewLineToken';
import {Position} from 'vs/editor/common/core/position';
import {Range} from 'vs/editor/common/core/range';
import {Selection} from 'vs/editor/common/core/selection';

export interface IDecorationsViewportData {
	decorations: IModelDecoration[];
	/**
	 * inline decorations grouped by each line in the viewport
	 */
	inlineDecorations: InlineDecoration[][];
}

export interface IViewModel extends IEventEmitter {

	getTabSize(): number;

	getLineCount(): number;
	getLineContent(lineNumber:number): string;
	getLineIndentGuide(lineNumber:number): number;
	getLineMinColumn(lineNumber:number): number;
	getLineMaxColumn(lineNumber:number): number;
	getLineFirstNonWhitespaceColumn(lineNumber:number): number;
	getLineLastNonWhitespaceColumn(lineNumber:number): number;
	getLineTokens(lineNumber:number): ViewLineTokens;
	getDecorationsViewportData(startLineNumber:number, endLineNumber:number): IDecorationsViewportData;
	getLineRenderLineNumber(lineNumber:number): string;
	getAllDecorations(): IModelDecoration[];
	getEOL(): string;
	getValueInRange(range:IRange, eol:EndOfLinePreference): string;

	getSelections(): Selection[];

	convertViewPositionToModelPosition(viewLineNumber:number, viewColumn:number): Position;
	convertViewRangeToModelRange(viewRange:IRange): Range;

	getModelLineContent(lineNumber:number): string;
	getModelLineMaxColumn(modelLineNumber:number): number;
	validateModelPosition(position:IPosition): Position;
	convertModelPositionToViewPosition(modelLineNumber:number, modelColumn:number): Position;
	convertModelSelectionToViewSelection(modelSelection:Selection): Selection;
	modelPositionIsVisible(position:IPosition): boolean;
}

export class InlineDecoration {
	_inlineDecorationBrand: void;

	range: Range;
	inlineClassName: string;

	constructor(range:Range, inlineClassName:string) {
		this.range = range;
		this.inlineClassName = inlineClassName;
	}
}
