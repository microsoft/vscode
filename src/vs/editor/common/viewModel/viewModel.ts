/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {IEventEmitter} from 'vs/base/common/eventEmitter';
import {IModelDecoration, IRange, IEditorRange, EndOfLinePreference, IEditorSelection, IPosition, IEditorPosition} from 'vs/editor/common/editorCommon';
import {ViewLineTokens} from 'vs/editor/common/core/viewLineToken';

export interface IDecorationsViewportData {
	decorations: IModelDecoration[];
	inlineDecorations: IModelDecoration[][];
}

export interface IViewModel extends IEventEmitter {

	getTabSize(): number;

	getLineCount(): number;
	getLineContent(lineNumber:number): string;
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

	getSelections(): IEditorSelection[];

	convertViewPositionToModelPosition(viewLineNumber:number, viewColumn:number): IEditorPosition;
	convertViewRangeToModelRange(viewRange:IRange): IEditorRange;

	getModelLineContent(lineNumber:number): string;
	getModelLineMaxColumn(modelLineNumber:number): number;
	validateModelPosition(position:IPosition): IEditorPosition;
	convertModelPositionToViewPosition(modelLineNumber:number, modelColumn:number): IEditorPosition;
	convertModelSelectionToViewSelection(modelSelection:IEditorSelection): IEditorSelection;
	modelPositionIsVisible(position:IPosition): boolean;
}
