/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { VerticalRevealType, IConfigurationChangedEvent, IViewConfigurationChangedEvent } from 'vs/editor/common/editorCommon';
import { Position } from 'vs/editor/common/core/position';
import { Range } from 'vs/editor/common/core/range';
import { Selection } from 'vs/editor/common/core/selection';
import { ScrollEvent } from 'vs/base/common/scrollable';

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
	ScrollRequestEvent: 'scrollRequestEvent',
	ViewScrollChanged: 'scrollChanged',
	ViewFocusChanged: 'focusChanged',
	ZonesChanged: 'viewZonesChanged',
	ConfigurationChanged: 'viewConfigurationChanged'
};

export const enum ViewEventType {
	ModelFlushedEvent = 1,
	LinesDeletedEvent = 2,
	LinesInsertedEvent = 3,
	LineChangedEvent = 4,
	TokensChangedEvent = 5,
	DecorationsChangedEvent = 6,
	CursorPositionChangedEvent = 7,
	CursorSelectionChangedEvent = 8,
	RevealRangeEvent = 9,
	LineMappingChangedEvent = 10,
	ScrollRequestEvent = 11,
	ViewScrollChanged = 12,
	ViewFocusChanged = 13,
	ZonesChanged = 14,
	ConfigurationChanged = 15
}

export interface IViewEvent {
	readonly type: ViewEventType;
}

export class ViewDecorationsChangedEvent implements IViewEvent {
	_viewDecorationsChangedEventBrand: void;

	public readonly type = ViewEventType.DecorationsChangedEvent;

	constructor() {
		// Nothing to do
	}
}

export class ViewLinesDeletedEvent implements IViewEvent {
	_viewLinesDeletedEventBrand: void;

	public readonly type = ViewEventType.LinesDeletedEvent;

	/**
	 * At what line the deletion began (inclusive).
	 */
	public readonly fromLineNumber: number;
	/**
	 * At what line the deletion stopped (inclusive).
	 */
	public readonly toLineNumber: number;

	constructor(fromLineNumber: number, toLineNumber: number) {
		this.fromLineNumber = fromLineNumber;
		this.toLineNumber = toLineNumber;
	}
}

export class ViewLineChangedEvent implements IViewEvent {
	_viewLineChangedEventBrand: void;

	public readonly type = ViewEventType.LineChangedEvent;

	/**
	 * The line that has changed.
	 */
	public readonly lineNumber: number;

	constructor(lineNumber: number) {
		this.lineNumber = lineNumber;
	}
}

export class ViewLinesInsertedEvent implements IViewEvent {
	_viewLinesInsertedEventBrand: void;

	public readonly type = ViewEventType.LinesInsertedEvent;

	/**
	 * Before what line did the insertion begin
	 */
	public readonly fromLineNumber: number;
	/**
	 * `toLineNumber` - `fromLineNumber` + 1 denotes the number of lines that were inserted
	 */
	public readonly toLineNumber: number;

	constructor(fromLineNumber: number, toLineNumber: number) {
		this.fromLineNumber = fromLineNumber;
		this.toLineNumber = toLineNumber;
	}
}

export class ViewTokensChangedEvent implements IViewEvent {
	_viewTokensChangedEventBrand: void;

	public readonly type = ViewEventType.TokensChangedEvent;

	public readonly ranges: {
		/**
		 * Start line number of range
		 */
		readonly fromLineNumber: number;
		/**
		 * End line number of range
		 */
		readonly toLineNumber: number;
	}[];

	constructor(ranges: { fromLineNumber: number; toLineNumber: number; }[]) {
		this.ranges = ranges;
	}
}

export class ViewCursorPositionChangedEvent implements IViewEvent {
	_viewCursorPositionChangedEventBrand: void;

	public readonly type = ViewEventType.CursorPositionChangedEvent;

	/**
	 * Primary cursor's position.
	 */
	public readonly position: Position;
	/**
	 * Secondary cursors' position.
	 */
	public readonly secondaryPositions: Position[];
	/**
	 * Is the primary cursor in the editable range?
	 */
	public readonly isInEditableRange: boolean;

	constructor(position: Position, secondaryPositions: Position[], isInEditableRange: boolean) {
		this.position = position;
		this.secondaryPositions = secondaryPositions;
		this.isInEditableRange = isInEditableRange;
	}
}

export class ViewCursorSelectionChangedEvent implements IViewEvent {
	_viewCursorSelectionChangedEventBrand: void;

	public readonly type = ViewEventType.CursorSelectionChangedEvent;

	/**
	 * The primary selection.
	 */
	public readonly selection: Selection;
	/**
	 * The secondary selections.
	 */
	public readonly secondarySelections: Selection[];

	constructor(selection: Selection, secondarySelections: Selection[]) {
		this.selection = selection;
		this.secondarySelections = secondarySelections;
	}
}

export class ViewRevealRangeEvent implements IViewEvent {
	_viewRevealRangeEventBrand: void;

	public readonly type = ViewEventType.RevealRangeEvent;

	/**
	 * Range to be reavealed.
	 */
	public readonly range: Range;

	public readonly verticalType: VerticalRevealType;
	/**
	 * If true: there should be a horizontal & vertical revealing
	 * If false: there should be just a vertical revealing
	 */
	public readonly revealHorizontal: boolean;
	/**
	 * If true: cursor is revealed if outside viewport
	 */
	public readonly revealCursor: boolean;

	constructor(range: Range, verticalType: VerticalRevealType, revealHorizontal: boolean, revealCursor: boolean) {
		this.range = range;
		this.verticalType = verticalType;
		this.revealHorizontal = revealHorizontal;
		this.revealCursor = revealCursor;
	}
}

export class ViewScrollRequestEvent implements IViewEvent {
	_viewScrollRequestEventBrand: void;

	public readonly type = ViewEventType.ScrollRequestEvent;

	public readonly deltaLines: number;
	public readonly revealCursor: boolean;

	constructor(deltaLines: number, revealCursor: boolean) {
		this.deltaLines = deltaLines;
		this.revealCursor = revealCursor;
	}
}

export class ViewLineMappingChangedEvents implements IViewEvent {
	_viewLineMappingChangedEventBrand: void;

	public readonly type = ViewEventType.LineMappingChangedEvent;

	constructor() {
		// Nothing to do
	}
}

export class ViewModelFlushedEvent implements IViewEvent {
	_viewModelFlushedEventBrand: void;

	public readonly type = ViewEventType.ModelFlushedEvent;

	constructor() {
		// Nothing to do
	}
}

export class ViewConfigurationChangedEvent implements IViewEvent {
	_viewConfigurationChangedEventBrand: void;

	public readonly type = ViewEventType.ConfigurationChanged;

	public readonly lineHeight: boolean;
	public readonly readOnly: boolean;
	public readonly layoutInfo: boolean;
	public readonly fontInfo: boolean;
	public readonly viewInfo: IViewConfigurationChangedEvent;
	public readonly wrappingInfo: boolean;

	constructor(source: IConfigurationChangedEvent) {
		this.lineHeight = source.lineHeight;
		this.readOnly = source.readOnly;
		this.layoutInfo = source.layoutInfo;
		this.fontInfo = source.fontInfo;
		this.viewInfo = source.viewInfo;
		this.wrappingInfo = source.wrappingInfo;
	}
}

export class ViewScrollChangedEvent implements IViewEvent {
	_viewScrollChangedEventBrand: void;

	public readonly type = ViewEventType.ViewScrollChanged;

	public readonly scrollWidth: number;
	public readonly scrollLeft: number;
	public readonly scrollHeight: number;
	public readonly scrollTop: number;

	public readonly scrollWidthChanged: boolean;
	public readonly scrollLeftChanged: boolean;
	public readonly scrollHeightChanged: boolean;
	public readonly scrollTopChanged: boolean;

	constructor(source: ScrollEvent) {
		this.scrollWidth = source.scrollWidth;
		this.scrollLeft = source.scrollLeft;
		this.scrollHeight = source.scrollHeight;
		this.scrollTop = source.scrollTop;

		this.scrollWidthChanged = source.scrollWidthChanged;
		this.scrollLeftChanged = source.scrollLeftChanged;
		this.scrollHeightChanged = source.scrollHeightChanged;
		this.scrollTopChanged = source.scrollTopChanged;
	}
}

export class ViewZonesChangedEvent implements IViewEvent {
	_viewZonesChangedEventBrand: void;

	public readonly type = ViewEventType.ZonesChanged;

	constructor() {
		// Nothing to do
	}
}

export class ViewFocusChangedEvent implements IViewEvent {
	_viewFocusChangedEventBrand: void;

	public readonly type = ViewEventType.ViewFocusChanged;

	public readonly isFocused: boolean;

	constructor(isFocused: boolean) {
		this.isFocused = isFocused;
	}
}
