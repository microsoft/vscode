/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {EventEmitter, IEventEmitter, EmitterEvent, IEmitterEvent, ListenerUnbind} from 'vs/base/common/eventEmitter';
import Strings = require('vs/base/common/strings');
import {Selection} from 'vs/editor/common/core/selection';
import {Range} from 'vs/editor/common/core/range';
import {ViewModelDecorations} from 'vs/editor/common/viewModel/viewModelDecorations';
import {ViewModelCursors} from 'vs/editor/common/viewModel/viewModelCursors';
import {IDisposable, disposeAll} from 'vs/base/common/lifecycle';
import {Position} from 'vs/editor/common/core/position';
import EditorCommon = require('vs/editor/common/editorCommon');

export interface ILinesCollection {
	setTabSize(newTabSize:number, emit:(evenType:string, payload:any)=>void): boolean;
	setWrappingColumn(newWrappingColumn:number, columnsForFullWidthChar:number, emit:(evenType:string, payload:any)=>void): boolean;
	setWrappingIndent(newWrappingIndent:EditorCommon.WrappingIndent, emit:(evenType:string, payload:any)=>void): boolean;

	onModelFlushed(versionId:number, emit:(evenType:string, payload:any)=>void): void;
	onModelLinesDeleted(versionId:number, fromLineNumber:number, toLineNumber:number, emit:(evenType:string, payload:any)=>void): void;
	onModelLinesInserted(versionId:number, fromLineNumber:number, toLineNumber:number, text:string[], emit:(evenType:string, payload:any)=>void): void;
	onModelLineChanged(versionId:number, lineNumber:number, newText:string, emit:(evenType:string, payload:any)=>void): boolean;
	getOutputLineCount(): number;
	getOutputLineContent(outputLineNumber:number): string;
	getOutputLineMinColumn(outputLineNumber:number): number;
	getOutputLineMaxColumn(outputLineNumber:number): number;
	getOutputLineTokens(outputLineNumber:number, inaccurateTokensAcceptable:boolean): EditorCommon.IViewLineTokens;
	convertOutputPositionToInputPosition(viewLineNumber:number, viewColumn:number): EditorCommon.IEditorPosition;
	convertInputPositionToOutputPosition(inputLineNumber:number, inputColumn:number): EditorCommon.IEditorPosition;
	setHiddenAreas(ranges:EditorCommon.IRange[], emit:(evenType:string, payload:any)=>void): void;
	dispose(): void;
}

export class ViewModel extends EventEmitter implements EditorCommon.IViewModel {

	private editorId:number;
	private configuration:EditorCommon.IConfiguration;
	private model:EditorCommon.IModel;

	private listenersToRemove:ListenerUnbind[];
	private _toDispose: IDisposable[];
	private lines:ILinesCollection;
	private decorations:ViewModelDecorations;
	private cursors:ViewModelCursors;
	private shouldForceTokenization:boolean;

	private getCurrentCenteredModelRange:()=>EditorCommon.IEditorRange;

	constructor(lines:ILinesCollection, editorId:number, configuration:EditorCommon.IConfiguration, model:EditorCommon.IModel, getCurrentCenteredModelRange:()=>EditorCommon.IEditorRange) {
		super();
		this.lines = lines;

		this.editorId = editorId;
		this.configuration = configuration;
		this.model = model;

		this.getCurrentCenteredModelRange = getCurrentCenteredModelRange;

		this.decorations = new ViewModelDecorations(this.editorId, this.configuration, {
			convertModelRangeToViewRange: (modelRange:EditorCommon.IRange, isWholeLine:boolean) => {
				if (isWholeLine) {
					return this.convertWholeLineModelRangeToViewRange(modelRange);
				}
				return this.convertModelRangeToViewRange(modelRange);
			}
		});
		this.decorations.reset(this.model);

		this.cursors = new ViewModelCursors(this.configuration, this);
		this._updateShouldForceTokenization();

		this.listenersToRemove = [];
		this._toDispose = [];
		this.listenersToRemove.push(this.model.addBulkListener((events:IEmitterEvent[]) => this.onEvents(events)));
		this._toDispose.push(this.configuration.onDidChange((e) => {
			this.onEvents([new EmitterEvent(EditorCommon.EventType.ConfigurationChanged, e)]);
		}));
	}

	public setHiddenAreas(ranges:EditorCommon.IRange[]): void {
		this.deferredEmit(() => {
			this.lines.setHiddenAreas(ranges, (eventType:string, payload:any) => this.emit(eventType, payload));
			this.decorations.onLineMappingChanged((eventType:string, payload:any) => this.emit(eventType, payload));
			this.cursors.onLineMappingChanged((eventType:string, payload:any) => this.emit(eventType, payload));
		});
	}

	public dispose(): void {
		this.listenersToRemove.forEach((element) => {
			element();
		});
		this._toDispose = disposeAll(this._toDispose);
		this.listenersToRemove = [];
		this.decorations.dispose();
		this.decorations = null;
		this.lines.dispose();
		this.lines = null;
		this.configuration = null;
		this.model = null;
	}

	private _updateShouldForceTokenization(): void {
		this.shouldForceTokenization = (this.lines.getOutputLineCount() <= this.configuration.editor.forcedTokenizationBoundary);
	}

	private _onTabSizeChange(newTabSize:number): boolean {
		var lineMappingChanged = this.lines.setTabSize(newTabSize, (eventType:string, payload:any) => this.emit(eventType, payload));
		if (lineMappingChanged) {
			this.emit(EditorCommon.ViewEventNames.LineMappingChangedEvent);
			this.decorations.onLineMappingChanged((eventType:string, payload:any) => this.emit(eventType, payload));
			this.cursors.onLineMappingChanged((eventType: string, payload: any) => this.emit(eventType, payload));
			this._updateShouldForceTokenization();
		}
		return lineMappingChanged;
	}

	private _onWrappingIndentChange(newWrappingIndent:string): boolean {
		var lineMappingChanged = this.lines.setWrappingIndent(EditorCommon.wrappingIndentFromString(newWrappingIndent), (eventType:string, payload:any) => this.emit(eventType, payload));
		if (lineMappingChanged) {
			this.emit(EditorCommon.ViewEventNames.LineMappingChangedEvent);
			this.decorations.onLineMappingChanged((eventType:string, payload:any) => this.emit(eventType, payload));
			this.cursors.onLineMappingChanged((eventType: string, payload: any) => this.emit(eventType, payload));
			this._updateShouldForceTokenization();
		}
		return lineMappingChanged;
	}

	private _restoreCenteredModelRange(range:EditorCommon.IEditorRange): void {
		// modelLine -> viewLine
		var newCenteredViewRange = this.convertModelRangeToViewRange(range);

		// Send a reveal event to restore the centered content
		var restoreRevealEvent:EditorCommon.IViewRevealRangeEvent = {
			range: newCenteredViewRange,
			verticalType: EditorCommon.VerticalRevealType.Center,
			revealHorizontal: false
		};
		this.emit(EditorCommon.ViewEventNames.RevealRangeEvent, restoreRevealEvent);
	}

	private _onWrappingColumnChange(newWrappingColumn:number, columnsForFullWidthChar:number): boolean {
		let lineMappingChanged = this.lines.setWrappingColumn(newWrappingColumn, columnsForFullWidthChar, (eventType:string, payload:any) => this.emit(eventType, payload));
		if (lineMappingChanged) {
			this.emit(EditorCommon.ViewEventNames.LineMappingChangedEvent);
			this.decorations.onLineMappingChanged((eventType:string, payload:any) => this.emit(eventType, payload));
			this.cursors.onLineMappingChanged((eventType: string, payload: any) => this.emit(eventType, payload));
			this._updateShouldForceTokenization();
		}
		return lineMappingChanged;
	}

	public addEventSource(eventSource:IEventEmitter): void {
		this.listenersToRemove.push(eventSource.addBulkListener((events:IEmitterEvent[]) => this.onEvents(events)));
	}

	private onEvents(events:IEmitterEvent[]): void {
		this.deferredEmit(() => {

			let hasContentChange = events.some((e) => e.getType() === EditorCommon.EventType.ModelContentChanged),
				previousCenteredModelRange:EditorCommon.IEditorRange;
			if (!hasContentChange) {
				// We can only convert the current centered view range to the current centered model range if the model has no changes.
				previousCenteredModelRange = this.getCurrentCenteredModelRange();
			}

			let i:number,
				len:number,
				e: IEmitterEvent,
				data:any,
				shouldUpdateForceTokenization = false,
				modelContentChangedEvent:EditorCommon.IModelContentChangedEvent,
				hadOtherModelChange = false,
				hadModelLineChangeThatChangedLineMapping = false,
				revealPreviousCenteredModelRange = false;

			for (i = 0, len = events.length; i < len; i++) {
				e = events[i];
				data = e.getData();

				switch (e.getType()) {

					case EditorCommon.EventType.ModelContentChanged:
						modelContentChangedEvent = <EditorCommon.IModelContentChangedEvent>data;

						switch (modelContentChangedEvent.changeType) {
							case EditorCommon.EventType.ModelContentChangedFlush:
								this.onModelFlushed(<EditorCommon.IModelContentChangedFlushEvent>modelContentChangedEvent);
								hadOtherModelChange = true;
								break;

							case EditorCommon.EventType.ModelContentChangedLinesDeleted:
								this.onModelLinesDeleted(<EditorCommon.IModelContentChangedLinesDeletedEvent>modelContentChangedEvent);
								hadOtherModelChange = true;
								break;

							case EditorCommon.EventType.ModelContentChangedLinesInserted:
								this.onModelLinesInserted(<EditorCommon.IModelContentChangedLinesInsertedEvent>modelContentChangedEvent);
								hadOtherModelChange = true;
								break;

							case EditorCommon.EventType.ModelContentChangedLineChanged:
								hadModelLineChangeThatChangedLineMapping = this.onModelLineChanged(<EditorCommon.IModelContentChangedLineChangedEvent>modelContentChangedEvent);
								break;

							default:
								console.info('ViewModel received unknown event: ');
								console.info(e);
						}
						shouldUpdateForceTokenization = true;
						break;

					case EditorCommon.EventType.ModelTokensChanged:
						this.onModelTokensChanged(<EditorCommon.IModelTokensChangedEvent>data);
						break;

					case EditorCommon.EventType.ModelModeChanged:
						// That's ok, a model tokens changed event will follow shortly
						break;

					case EditorCommon.EventType.ModelModeSupportChanged:
						// That's ok, no work to do
						break;

					case EditorCommon.EventType.ModelContentChanged2:
						// Ignore
						break;

					case EditorCommon.EventType.ModelDecorationsChanged:
						this.onModelDecorationsChanged(<EditorCommon.IModelDecorationsChangedEvent>data);
						break;

					case EditorCommon.EventType.ModelDispose:
						// Ignore, since the editor will take care of this and destroy the view shortly
						break;

					case EditorCommon.EventType.CursorPositionChanged:
						this.onCursorPositionChanged(<EditorCommon.ICursorPositionChangedEvent>data);
						break;

					case EditorCommon.EventType.CursorSelectionChanged:
						this.onCursorSelectionChanged(<EditorCommon.ICursorSelectionChangedEvent>data);
						break;

					case EditorCommon.EventType.CursorRevealRange:
						this.onCursorRevealRange(<EditorCommon.ICursorRevealRangeEvent>data);
						break;

					case EditorCommon.EventType.CursorScrollRequest:
						this.onCursorScrollRequest(<EditorCommon.ICursorScrollRequestEvent>data);
						break;

					case EditorCommon.EventType.ConfigurationChanged:
						revealPreviousCenteredModelRange = this._onTabSizeChange(this.configuration.getIndentationOptions().tabSize) || revealPreviousCenteredModelRange;
						revealPreviousCenteredModelRange = this._onWrappingIndentChange(this.configuration.editor.wrappingIndent) || revealPreviousCenteredModelRange;
						revealPreviousCenteredModelRange = this._onWrappingColumnChange(this.configuration.editor.wrappingInfo.wrappingColumn, this.configuration.editor.typicalFullwidthCharacterWidth / this.configuration.editor.typicalHalfwidthCharacterWidth) || revealPreviousCenteredModelRange;
						if ((<EditorCommon.IConfigurationChangedEvent>data).readOnly) {
							// Must read again all decorations due to readOnly filtering
							this.decorations.reset(this.model);
							var decorationsChangedEvent:EditorCommon.IViewDecorationsChangedEvent = {
								inlineDecorationsChanged: false
							};
							this.emit(EditorCommon.ViewEventNames.DecorationsChangedEvent, decorationsChangedEvent);
						}
						this.emit(e.getType(), <EditorCommon.IConfigurationChangedEvent>data);
						break;

					default:
						console.info('View received unknown event: ');
						console.info(e);
				}
			}

			if (shouldUpdateForceTokenization) {
				this._updateShouldForceTokenization();
			}

			if (!hadOtherModelChange && hadModelLineChangeThatChangedLineMapping) {
				this.emit(EditorCommon.ViewEventNames.LineMappingChangedEvent);
				this.decorations.onLineMappingChanged((eventType:string, payload:any) => this.emit(eventType, payload));
				this.cursors.onLineMappingChanged((eventType: string, payload: any) => this.emit(eventType, payload));
				this._updateShouldForceTokenization();
			}

			if (revealPreviousCenteredModelRange && previousCenteredModelRange) {
				this._restoreCenteredModelRange(previousCenteredModelRange);
			}
		});
	}

	// --- begin inbound event conversion
	private onModelFlushed(e:EditorCommon.IModelContentChangedFlushEvent): void {
		this.lines.onModelFlushed(e.versionId, (eventType:string, payload:any) => this.emit(eventType, payload));
		this.decorations.reset(this.model);
	}
	private onModelDecorationsChanged(e:EditorCommon.IModelDecorationsChangedEvent): void {
		this.decorations.onModelDecorationsChanged(e, (eventType:string, payload:any) => this.emit(eventType, payload));
	}
	private onModelLinesDeleted(e:EditorCommon.IModelContentChangedLinesDeletedEvent): void {
		this.lines.onModelLinesDeleted(e.versionId, e.fromLineNumber, e.toLineNumber, (eventType:string, payload:any) => this.emit(eventType, payload));
	}
	private onModelTokensChanged(e:EditorCommon.IModelTokensChangedEvent): void {
		var viewStartLineNumber = this.convertModelPositionToViewPosition(e.fromLineNumber, 1).lineNumber;
		var viewEndLineNumber = this.convertModelPositionToViewPosition(e.toLineNumber, this.model.getLineMaxColumn(e.toLineNumber)).lineNumber;

		var e:EditorCommon.IViewTokensChangedEvent = {
			fromLineNumber: viewStartLineNumber,
			toLineNumber: viewEndLineNumber
		};
		this.emit(EditorCommon.ViewEventNames.TokensChangedEvent, e);
	}
	private onModelLineChanged(e:EditorCommon.IModelContentChangedLineChangedEvent): boolean {
		var lineMappingChanged = this.lines.onModelLineChanged(e.versionId, e.lineNumber, e.detail, (eventType:string, payload:any) => this.emit(eventType, payload));
		return lineMappingChanged;
	}
	private onModelLinesInserted(e:EditorCommon.IModelContentChangedLinesInsertedEvent): void {
		this.lines.onModelLinesInserted(e.versionId, e.fromLineNumber, e.toLineNumber, e.detail.split('\n'), (eventType:string, payload:any) => this.emit(eventType, payload));
	}

	public validateViewRange(viewStartLineNumber:number, viewStartColumn:number, viewEndLineNumber:number, viewEndColumn:number, modelRange:EditorCommon.IEditorRange): EditorCommon.IEditorRange {
		var validViewStart = this.validateViewPosition(viewStartColumn, viewStartColumn, modelRange.getStartPosition());
		var validViewEnd = this.validateViewPosition(viewEndLineNumber, viewEndColumn, modelRange.getEndPosition());
		return new Range(validViewStart.lineNumber, validViewStart.column, validViewEnd.lineNumber, validViewEnd.column);
	}

	public validateViewPosition(viewLineNumber:number, viewColumn:number, modelPosition:EditorCommon.IEditorPosition): EditorCommon.IEditorPosition {
		if (viewLineNumber < 1) {
			viewLineNumber = 1;
		}
		var lineCount = this.getLineCount();
		if (viewLineNumber > lineCount) {
			viewLineNumber = lineCount;
		}
		var viewMinColumn = this.getLineMinColumn(viewLineNumber);
		var viewMaxColumn = this.getLineMaxColumn(viewLineNumber);
		if (viewColumn < viewMinColumn) {
			viewColumn = viewMinColumn;
		}
		if (viewColumn > viewMaxColumn) {
			viewColumn = viewMaxColumn;
		}
		var computedModelPosition = this.convertViewPositionToModelPosition(viewLineNumber, viewColumn);
		if (computedModelPosition.equals(modelPosition)) {
			return new Position(viewLineNumber, viewColumn);
		}
		return this.convertModelPositionToViewPosition(modelPosition.lineNumber, modelPosition.column);
	}

	public validateViewSelection(viewSelection:EditorCommon.IEditorSelection, modelSelection:EditorCommon.IEditorSelection): EditorCommon.IEditorSelection {
		let modelSelectionStart = new Position(modelSelection.selectionStartLineNumber, modelSelection.selectionStartColumn);
		let modelPosition = new Position(modelSelection.positionLineNumber, modelSelection.positionColumn);

		let viewSelectionStart = this.validateViewPosition(viewSelection.selectionStartLineNumber, viewSelection.selectionStartColumn, modelSelectionStart);
		let viewPosition = this.validateViewPosition(viewSelection.positionLineNumber, viewSelection.positionColumn, modelPosition);

		return new Selection(viewSelectionStart.lineNumber, viewSelectionStart.column, viewPosition.lineNumber, viewPosition.column);
	}

	private onCursorPositionChanged(e:EditorCommon.ICursorPositionChangedEvent): void {
		this.cursors.onCursorPositionChanged(e, (eventType:string, payload:any) => this.emit(eventType, payload));
	}
	private onCursorSelectionChanged(e:EditorCommon.ICursorSelectionChangedEvent): void {
		this.cursors.onCursorSelectionChanged(e, (eventType:string, payload:any) => this.emit(eventType, payload));
	}
	private onCursorRevealRange(e:EditorCommon.ICursorRevealRangeEvent): void {
		this.cursors.onCursorRevealRange(e, (eventType:string, payload:any) => this.emit(eventType, payload));
	}
	private onCursorScrollRequest(e:EditorCommon.ICursorScrollRequestEvent): void {
		this.cursors.onCursorScrollRequest(e, (eventType:string, payload:any) => this.emit(eventType, payload));
	}
	// --- end inbound event conversion

	public getLineCount(): number {
		return this.lines.getOutputLineCount();
	}

	public getLineContent(lineNumber:number): string {
		return this.lines.getOutputLineContent(lineNumber);
	}

	public getLineMinColumn(lineNumber:number): number {
		return this.lines.getOutputLineMinColumn(lineNumber);
	}

	public getLineMaxColumn(lineNumber:number): number {
		return this.lines.getOutputLineMaxColumn(lineNumber);
	}

	public getLineFirstNonWhitespaceColumn(lineNumber: number): number {
		var result = Strings.firstNonWhitespaceIndex(this.getLineContent(lineNumber));
		if (result === -1) {
			return 0;
		}
		return result + 1;
	}

	public getLineLastNonWhitespaceColumn(lineNumber: number): number {
		var result = Strings.lastNonWhitespaceIndex(this.getLineContent(lineNumber));
		if (result === -1) {
			return 0;
		}
		return result + 2;
	}

	public getLineTokens(lineNumber:number): EditorCommon.IViewLineTokens {
		return this.lines.getOutputLineTokens(lineNumber, !this.shouldForceTokenization);
	}

	public getLineRenderLineNumber(viewLineNumber:number): string {
		var modelPosition = this.convertViewPositionToModelPosition(viewLineNumber, 1);
		if (modelPosition.column !== 1) {
			return '';
		}
		var modelLineNumber = modelPosition.lineNumber;

		if (typeof this.configuration.editor.lineNumbers === 'function') {
			return this.configuration.editor.lineNumbers(modelLineNumber);
		}

		return modelLineNumber.toString();
	}

	public getDecorationsResolver(startLineNumber:number, endLineNumber:number): EditorCommon.IViewModelDecorationsResolver {
		return this.decorations.getDecorationsResolver(startLineNumber, endLineNumber);
	}

	public getAllDecorations(): EditorCommon.IModelDecoration[] {
		return this.decorations.getAllDecorations();
	}

	public getEOL(): string {
		return this.model.getEOL();
	}

	public getValueInRange(range:EditorCommon.IRange, eol:EditorCommon.EndOfLinePreference): string {
		var modelRange = this.convertViewRangeToModelRange(range);
		return this.model.getValueInRange(modelRange, eol);
	}

	public getModelLineContent(modelLineNumber:number): string {
		return this.model.getLineContent(modelLineNumber);
	}

	public getSelections(): EditorCommon.IEditorSelection[] {
		return this.cursors.getSelections();
	}

	public getModelLineMaxColumn(modelLineNumber:number): number {
		return this.model.getLineMaxColumn(modelLineNumber);
	}

	public validateModelPosition(position:EditorCommon.IPosition): EditorCommon.IEditorPosition {
		return this.model.validatePosition(position);
	}

	public convertViewPositionToModelPosition(viewLineNumber:number, viewColumn:number): EditorCommon.IEditorPosition {
		return this.lines.convertOutputPositionToInputPosition(viewLineNumber, viewColumn);
	}

	public convertViewRangeToModelRange(viewRange:EditorCommon.IRange): EditorCommon.IEditorRange {
		var start = this.convertViewPositionToModelPosition(viewRange.startLineNumber, viewRange.startColumn);
		var end = this.convertViewPositionToModelPosition(viewRange.endLineNumber, viewRange.endColumn);
		return new Range(start.lineNumber, start.column, end.lineNumber, end.column);
	}

	public convertModelPositionToViewPosition(modelLineNumber:number, modelColumn:number): EditorCommon.IEditorPosition {
		return this.lines.convertInputPositionToOutputPosition(modelLineNumber, modelColumn);
	}

	public convertModelSelectionToViewSelection(modelSelection:EditorCommon.IEditorSelection): EditorCommon.IEditorSelection {
		var selectionStart = this.convertModelPositionToViewPosition(modelSelection.selectionStartLineNumber, modelSelection.selectionStartColumn);
		var position = this.convertModelPositionToViewPosition(modelSelection.positionLineNumber, modelSelection.positionColumn);
		return new Selection(selectionStart.lineNumber, selectionStart.column, position.lineNumber, position.column);
	}

	public convertModelRangeToViewRange(modelRange:EditorCommon.IRange): EditorCommon.IEditorRange {
		var start = this.convertModelPositionToViewPosition(modelRange.startLineNumber, modelRange.startColumn);
		var end = this.convertModelPositionToViewPosition(modelRange.endLineNumber, modelRange.endColumn);
		return new Range(start.lineNumber, start.column, end.lineNumber, end.column);
	}

	public convertWholeLineModelRangeToViewRange(modelRange:EditorCommon.IRange): EditorCommon.IEditorRange {
		var start = this.convertModelPositionToViewPosition(modelRange.startLineNumber, 1);
		var end = this.convertModelPositionToViewPosition(modelRange.endLineNumber, this.model.getLineMaxColumn(modelRange.endLineNumber));
		return new Range(start.lineNumber, start.column, end.lineNumber, end.column);
	}

}