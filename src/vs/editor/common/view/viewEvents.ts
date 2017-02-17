/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { VerticalRevealType } from 'vs/editor/common/editorCommon';
import { Position } from 'vs/editor/common/core/position';
import { Range } from 'vs/editor/common/core/range';
import { Selection } from 'vs/editor/common/core/selection';

export const ViewEventNames = {
	ModelFlushedEvent: 'modelFlushedEvent',
	LinesDeletedEvent: 'linesDeletedEvent',
	LinesInsertedEvent: 'linesInsertedEvent',
	LineChangedEvent: 'lineChangedEvent',
	TokensChangedEvent: 'tokensChangedEvent',
	DecorationsChangedEvent: 'decorationsChangedEvent',
	CursorPositionChangedEvent: 'cursorPositionChangedEvent',
	CursorSelectionChangedEvent: 'cursorSelectionChangedEvent',
	RevealRangeEvent: 'revealRangeEvent',
	LineMappingChangedEvent: 'lineMappingChangedEvent',
	ScrollRequestEvent: 'scrollRequestEvent'
};

export interface IViewDecorationsChangedEvent {
	_viewDecorationsChangedEventBrand: void;
}

export interface IViewLinesDeletedEvent {
	_viewLinesDeletedEventBrand: void;

	/**
	 * At what line the deletion began (inclusive).
	 */
	readonly fromLineNumber: number;
	/**
	 * At what line the deletion stopped (inclusive).
	 */
	readonly toLineNumber: number;
}

export interface IViewLineChangedEvent {
	_viewLineChangedEventBrand: void;

	/**
	 * The line that has changed.
	 */
	readonly lineNumber: number;
}

export interface IViewLinesInsertedEvent {
	_viewLinesInsertedEventBrand: void;

	/**
	 * Before what line did the insertion begin
	 */
	readonly fromLineNumber: number;
	/**
	 * `toLineNumber` - `fromLineNumber` + 1 denotes the number of lines that were inserted
	 */
	readonly toLineNumber: number;
}

export interface IViewTokensChangedEvent {
	_viewTokensChangedEventBrand: void;

	readonly ranges: {
		/**
		 * Start line number of range
		 */
		readonly fromLineNumber: number;
		/**
		 * End line number of range
		 */
		readonly toLineNumber: number;
	}[];
}

export interface IViewCursorPositionChangedEvent {
	_viewCursorPositionChangedEventBrand: void;

	/**
	 * Primary cursor's position.
	 */
	readonly position: Position;
	/**
	 * Secondary cursors' position.
	 */
	readonly secondaryPositions: Position[];
	/**
	 * Is the primary cursor in the editable range?
	 */
	readonly isInEditableRange: boolean;
}

export interface IViewCursorSelectionChangedEvent {
	_viewCursorSelectionChangedEventBrand: void;

	/**
	 * The primary selection.
	 */
	readonly selection: Selection;
	/**
	 * The secondary selections.
	 */
	readonly secondarySelections: Selection[];
}

export interface IViewRevealRangeEvent {
	_viewRevealRangeEventBrand: void;

	/**
	 * Range to be reavealed.
	 */
	readonly range: Range;

	readonly verticalType: VerticalRevealType;
	/**
	 * If true: there should be a horizontal & vertical revealing
	 * If false: there should be just a vertical revealing
	 */
	readonly revealHorizontal: boolean;
	/**
	 * If true: cursor is revealed if outside viewport
	 */
	readonly revealCursor: boolean;
}

export interface IViewScrollRequestEvent {
	_viewScrollRequestEventBrand: void;

	readonly deltaLines: number;
	readonly revealCursor: boolean;
}
