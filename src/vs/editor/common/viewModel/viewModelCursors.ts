/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {Range} from 'vs/editor/common/core/range';
import {Selection} from 'vs/editor/common/core/selection';
import EditorCommon = require('vs/editor/common/editorCommon');

export interface IConverter {
	validateViewPosition(viewLineNumber:number, viewColumn:number, modelPosition:EditorCommon.IEditorPosition): EditorCommon.IEditorPosition;
	validateViewSelection(viewSelection:EditorCommon.IEditorSelection, modelSelection:EditorCommon.IEditorSelection): EditorCommon.IEditorSelection;
	convertModelSelectionToViewSelection(modelSelection:EditorCommon.IEditorSelection): EditorCommon.IEditorSelection;
	convertModelRangeToViewRange(modelRange:EditorCommon.IRange): EditorCommon.IEditorRange;
}

export class ViewModelCursors {

	private configuration:EditorCommon.IConfiguration;
	private converter:IConverter;

	private lastCursorPositionChangedEvent:EditorCommon.ICursorPositionChangedEvent;
	private lastCursorSelectionChangedEvent:EditorCommon.ICursorSelectionChangedEvent;

	constructor(configuration:EditorCommon.IConfiguration, converter:IConverter) {
		this.configuration = configuration;
		this.converter = converter;
		this.lastCursorPositionChangedEvent = null;
		this.lastCursorSelectionChangedEvent = null;
	}

	public getSelections(): EditorCommon.IEditorSelection[] {
		if (this.lastCursorSelectionChangedEvent) {
			var selections:EditorCommon.IEditorSelection[] = [];
			selections.push(this.converter.convertModelSelectionToViewSelection(this.lastCursorSelectionChangedEvent.selection));
			for (var i = 0, len = this.lastCursorSelectionChangedEvent.secondarySelections.length; i < len; i++) {
				selections.push(this.converter.convertModelSelectionToViewSelection(this.lastCursorSelectionChangedEvent.secondarySelections[i]));
			}
			return selections;
		} else {
			return [new Selection(1, 1, 1, 1)];
		}
	}

	public onCursorPositionChanged(e:EditorCommon.ICursorPositionChangedEvent, emit:(eventType:string, payload:any)=>void): void {
		this.lastCursorPositionChangedEvent = e;

		var position = this.converter.validateViewPosition(e.viewPosition.lineNumber, e.viewPosition.column, e.position),
			stopRenderingLineAfter = this.configuration.editor.stopRenderingLineAfter;

		// Limit position to be somewhere where it can actually be rendered
		if (stopRenderingLineAfter !== -1 && position.column > stopRenderingLineAfter) {
			position = position.clone();
			position.column = stopRenderingLineAfter;
		}
		var secondaryPositions: EditorCommon.IEditorPosition[] = [];
		for (var i = 0, len = e.secondaryPositions.length; i < len; i++) {
			secondaryPositions[i] = this.converter.validateViewPosition(e.secondaryViewPositions[i].lineNumber, e.secondaryViewPositions[i].column, e.secondaryPositions[i]);
			// Limit position to be somewhere where it can actually be rendered
			if (stopRenderingLineAfter !== -1 && secondaryPositions[i].column > stopRenderingLineAfter) {
				secondaryPositions[i] = secondaryPositions[i].clone();
				secondaryPositions[i].column = stopRenderingLineAfter;
			}
		}

		var newEvent:EditorCommon.IViewCursorPositionChangedEvent = {
			position: position,
			secondaryPositions: secondaryPositions,
			isInEditableRange: e.isInEditableRange
		};
		emit(EditorCommon.ViewEventNames.CursorPositionChangedEvent, newEvent);
	}

	public onCursorSelectionChanged(e:EditorCommon.ICursorSelectionChangedEvent, emit:(eventType:string, payload:any)=>void): void {
		this.lastCursorSelectionChangedEvent = e;

		let selection = this.converter.validateViewSelection(e.viewSelection, e.selection);
		let secondarySelections: EditorCommon.IEditorSelection[] = [];
		for (let i = 0, len = e.secondarySelections.length; i < len; i++) {
			secondarySelections[i] = this.converter.validateViewSelection(e.secondaryViewSelections[i], e.secondarySelections[i]);
		}

		let newEvent:EditorCommon.IViewCursorSelectionChangedEvent = {
			selection: selection,
			secondarySelections: secondarySelections
		};
		emit(EditorCommon.ViewEventNames.CursorSelectionChangedEvent, newEvent);
	}

	public onCursorRevealRange(e:EditorCommon.ICursorRevealRangeEvent, emit:(eventType:string, payload:any)=>void): void {
		var viewRange:EditorCommon.IEditorRange = null;
		if (e.viewRange) {
			var viewStartRange = this.converter.validateViewPosition(e.viewRange.startLineNumber, e.viewRange.startColumn, e.range.getStartPosition());
			var viewEndRange = this.converter.validateViewPosition(e.viewRange.endLineNumber, e.viewRange.endColumn, e.range.getEndPosition());
			viewRange = new Range(viewStartRange.lineNumber, viewStartRange.column, viewEndRange.lineNumber, viewEndRange.column);
		} else {
			viewRange = this.converter.convertModelRangeToViewRange(e.range);
		}

		var newEvent:EditorCommon.IViewRevealRangeEvent = {
			range: viewRange,
			verticalType: e.verticalType,
			revealHorizontal: e.revealHorizontal
		};
		emit(EditorCommon.ViewEventNames.RevealRangeEvent, newEvent);
	}

	public onCursorScrollRequest(e:EditorCommon.ICursorScrollRequestEvent, emit:(eventType:string, payload:any)=>void): void {
		var newEvent:EditorCommon.IViewScrollRequestEvent = {
			deltaLines: e.deltaLines
		};
		emit(EditorCommon.ViewEventNames.ScrollRequestEvent, newEvent);
	}

	public onLineMappingChanged(emit:(eventType:string, payload:any)=>void): void {
		if (this.lastCursorPositionChangedEvent) {
			this.onCursorPositionChanged(this.lastCursorPositionChangedEvent, emit);
		}
		if (this.lastCursorSelectionChangedEvent) {
			this.onCursorSelectionChanged(this.lastCursorSelectionChangedEvent, emit);
		}
	}

}