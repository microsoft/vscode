/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as editorCommon from 'vs/editor/common/editorCommon';
import { Position } from 'vs/editor/common/core/position';

export class ViewModelCursors {

	private readonly configuration: editorCommon.IConfiguration;

	private lastCursorPositionChangedEvent: editorCommon.ICursorPositionChangedEvent;
	private lastCursorSelectionChangedEvent: editorCommon.ICursorSelectionChangedEvent;

	constructor(configuration: editorCommon.IConfiguration) {
		this.configuration = configuration;
		this.lastCursorPositionChangedEvent = null;
		this.lastCursorSelectionChangedEvent = null;
	}

	/**
	 * Limit position to be somewhere where it can actually be rendered
	 */
	private static _toPositionThatCanBeRendered(position: Position, stopRenderingLineAfter: number) {
		// Limit position to be somewhere where it can actually be rendered
		if (stopRenderingLineAfter !== -1 && position.column > stopRenderingLineAfter) {
			position = new Position(position.lineNumber, stopRenderingLineAfter);
		}
		return position;
	}

	public onCursorPositionChanged(e: editorCommon.ICursorPositionChangedEvent, emit: (eventType: string, payload: any) => void): void {
		this.lastCursorPositionChangedEvent = e;

		const stopRenderingLineAfter = this.configuration.editor.viewInfo.stopRenderingLineAfter;

		let position = ViewModelCursors._toPositionThatCanBeRendered(e.viewPosition, stopRenderingLineAfter);
		let secondaryPositions: Position[] = [];
		for (let i = 0, len = e.secondaryPositions.length; i < len; i++) {
			secondaryPositions[i] = ViewModelCursors._toPositionThatCanBeRendered(e.secondaryViewPositions[i], stopRenderingLineAfter);
		}

		let newEvent: editorCommon.IViewCursorPositionChangedEvent = {
			position: position,
			secondaryPositions: secondaryPositions,
			isInEditableRange: e.isInEditableRange
		};
		emit(editorCommon.ViewEventNames.CursorPositionChangedEvent, newEvent);
	}

	public onCursorSelectionChanged(e: editorCommon.ICursorSelectionChangedEvent, emit: (eventType: string, payload: any) => void): void {
		this.lastCursorSelectionChangedEvent = e;

		let newEvent: editorCommon.IViewCursorSelectionChangedEvent = {
			selection: e.viewSelection,
			secondarySelections: e.secondaryViewSelections
		};
		emit(editorCommon.ViewEventNames.CursorSelectionChangedEvent, newEvent);
	}

	public onCursorRevealRange(e: editorCommon.ICursorRevealRangeEvent, emit: (eventType: string, payload: any) => void): void {
		let newEvent: editorCommon.IViewRevealRangeEvent = {
			range: e.viewRange,
			verticalType: e.verticalType,
			revealHorizontal: e.revealHorizontal,
			revealCursor: e.revealCursor
		};
		emit(editorCommon.ViewEventNames.RevealRangeEvent, newEvent);
	}

	public onCursorScrollRequest(e: editorCommon.ICursorScrollRequestEvent, emit: (eventType: string, payload: any) => void): void {
		let newEvent: editorCommon.IViewScrollRequestEvent = {
			deltaLines: e.deltaLines,
			revealCursor: e.revealCursor
		};
		emit(editorCommon.ViewEventNames.ScrollRequestEvent, newEvent);
	}

	public onLineMappingChanged(emit: (eventType: string, payload: any) => void): void {
		if (this.lastCursorPositionChangedEvent) {
			this.onCursorPositionChanged(this.lastCursorPositionChangedEvent, emit);
		}
		if (this.lastCursorSelectionChangedEvent) {
			this.onCursorSelectionChanged(this.lastCursorSelectionChangedEvent, emit);
		}
	}
}
