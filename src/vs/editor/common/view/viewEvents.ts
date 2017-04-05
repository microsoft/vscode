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

export const enum ViewEventType {
	ViewConfigurationChanged = 1,
	ViewCursorPositionChanged = 2,
	ViewCursorSelectionChanged = 3,
	ViewDecorationsChanged = 4,
	ViewFlushed = 5,
	ViewFocusChanged = 6,
	ViewLineMappingChanged = 7,
	ViewLinesChanged = 8,
	ViewLinesDeleted = 9,
	ViewLinesInserted = 10,
	ViewRevealRangeRequest = 11,
	ViewScrollChanged = 12,
	ViewScrollRequest = 13,
	ViewTokensChanged = 14,
	ViewTokensColorsChanged = 15,
	ViewZonesChanged = 16,
}

export class ViewConfigurationChangedEvent {

	public readonly type = ViewEventType.ViewConfigurationChanged;

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

export class ViewCursorPositionChangedEvent {

	public readonly type = ViewEventType.ViewCursorPositionChanged;

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

export class ViewCursorSelectionChangedEvent {

	public readonly type = ViewEventType.ViewCursorSelectionChanged;

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

export class ViewDecorationsChangedEvent {

	public readonly type = ViewEventType.ViewDecorationsChanged;

	constructor() {
		// Nothing to do
	}
}

export class ViewFlushedEvent {

	public readonly type = ViewEventType.ViewFlushed;

	constructor() {
		// Nothing to do
	}
}

export class ViewFocusChangedEvent {

	public readonly type = ViewEventType.ViewFocusChanged;

	public readonly isFocused: boolean;

	constructor(isFocused: boolean) {
		this.isFocused = isFocused;
	}
}

export class ViewLineMappingChangedEvent {

	public readonly type = ViewEventType.ViewLineMappingChanged;

	constructor() {
		// Nothing to do
	}
}

export class ViewLinesChangedEvent {

	public readonly type = ViewEventType.ViewLinesChanged;

	/**
	 * The first line that has changed.
	 */
	public readonly fromLineNumber: number;
	/**
	 * The last line that has changed.
	 */
	public readonly toLineNumber: number;

	constructor(fromLineNumber: number, toLineNumber: number) {
		this.fromLineNumber = fromLineNumber;
		this.toLineNumber = toLineNumber;
	}
}

export class ViewLinesDeletedEvent {

	public readonly type = ViewEventType.ViewLinesDeleted;

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

export class ViewLinesInsertedEvent {

	public readonly type = ViewEventType.ViewLinesInserted;

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

export class ViewRevealRangeRequestEvent {

	public readonly type = ViewEventType.ViewRevealRangeRequest;

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

export class ViewScrollChangedEvent {

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

export class ViewScrollRequestEvent {

	public readonly type = ViewEventType.ViewScrollRequest;

	public readonly deltaLines: number;
	public readonly revealCursor: boolean;

	constructor(deltaLines: number, revealCursor: boolean) {
		this.deltaLines = deltaLines;
		this.revealCursor = revealCursor;
	}
}

export class ViewTokensChangedEvent {

	public readonly type = ViewEventType.ViewTokensChanged;

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

export class ViewTokensColorsChangedEvent {

	public readonly type = ViewEventType.ViewTokensColorsChanged;

	constructor() {
		// Nothing to do
	}
}

export class ViewZonesChangedEvent {

	public readonly type = ViewEventType.ViewZonesChanged;

	constructor() {
		// Nothing to do
	}
}

export type ViewEvent = (
	ViewConfigurationChangedEvent
	| ViewCursorPositionChangedEvent
	| ViewCursorSelectionChangedEvent
	| ViewDecorationsChangedEvent
	| ViewFlushedEvent
	| ViewFocusChangedEvent
	| ViewLinesChangedEvent
	| ViewLineMappingChangedEvent
	| ViewLinesDeletedEvent
	| ViewLinesInsertedEvent
	| ViewRevealRangeRequestEvent
	| ViewScrollChangedEvent
	| ViewScrollRequestEvent
	| ViewTokensChangedEvent
	| ViewTokensColorsChangedEvent
	| ViewZonesChangedEvent
);
