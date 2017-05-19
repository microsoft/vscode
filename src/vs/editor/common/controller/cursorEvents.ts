/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { Position } from 'vs/editor/common/core/position';
import { Selection } from 'vs/editor/common/core/selection';

/**
 * @internal
 */
export const CursorEventType = {
	CursorPositionChanged: 'positionChanged',
	CursorSelectionChanged: 'selectionChanged',
};

/**
 * Describes the reason the cursor has changed its position.
 */
export enum CursorChangeReason {
	/**
	 * Unknown or not set.
	 */
	NotSet = 0,
	/**
	 * A `model.setValue()` was called.
	 */
	ContentFlush = 1,
	/**
	 * The `model` has been changed outside of this cursor and the cursor recovers its position from associated markers.
	 */
	RecoverFromMarkers = 2,
	/**
	 * There was an explicit user gesture.
	 */
	Explicit = 3,
	/**
	 * There was a Paste.
	 */
	Paste = 4,
	/**
	 * There was an Undo.
	 */
	Undo = 5,
	/**
	 * There was a Redo.
	 */
	Redo = 6,
}
/**
 * An event describing that the cursor position has changed.
 */
export interface ICursorPositionChangedEvent {
	/**
	 * Primary cursor's position.
	 */
	readonly position: Position;
	/**
	 * Primary cursor's view position
	 */
	readonly viewPosition: Position;
	/**
	 * Secondary cursors' position.
	 */
	readonly secondaryPositions: Position[];
	/**
	 * Secondary cursors' view position.
	 */
	readonly secondaryViewPositions: Position[];
	/**
	 * Reason.
	 */
	readonly reason: CursorChangeReason;
	/**
	 * Source of the call that caused the event.
	 */
	readonly source: string;
	/**
	 * Is the primary cursor in the editable range?
	 */
	readonly isInEditableRange: boolean;
}
/**
 * An event describing that the cursor selection has changed.
 */
export interface ICursorSelectionChangedEvent {
	/**
	 * The primary selection.
	 */
	readonly selection: Selection;
	/**
	 * The primary selection in view coordinates.
	 */
	readonly viewSelection: Selection;
	/**
	 * The secondary selections.
	 */
	readonly secondarySelections: Selection[];
	/**
	 * The secondary selections in view coordinates.
	 */
	readonly secondaryViewSelections: Selection[];
	/**
	 * Source of the call that caused the event.
	 */
	readonly source: string;
	/**
	 * Reason.
	 */
	readonly reason: CursorChangeReason;
}
