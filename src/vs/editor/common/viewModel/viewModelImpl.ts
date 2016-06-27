/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {EmitterEvent, EventEmitter, IEventEmitter} from 'vs/base/common/eventEmitter';
import {IDisposable, dispose} from 'vs/base/common/lifecycle';
import * as strings from 'vs/base/common/strings';
import {Position} from 'vs/editor/common/core/position';
import {Range} from 'vs/editor/common/core/range';
import {Selection} from 'vs/editor/common/core/selection';
import * as editorCommon from 'vs/editor/common/editorCommon';
import {ViewModelCursors} from 'vs/editor/common/viewModel/viewModelCursors';
import {ViewModelDecorations} from 'vs/editor/common/viewModel/viewModelDecorations';
import {IDecorationsViewportData, IViewModel} from 'vs/editor/common/viewModel/viewModel';
import {ViewLineTokens} from 'vs/editor/common/core/viewLineToken';

export interface ILinesCollection {
	setTabSize(newTabSize:number, emit:(evenType:string, payload:any)=>void): boolean;
	setWrappingColumn(newWrappingColumn:number, columnsForFullWidthChar:number, emit:(evenType:string, payload:any)=>void): boolean;
	setWrappingIndent(newWrappingIndent:editorCommon.WrappingIndent, emit:(evenType:string, payload:any)=>void): boolean;

	onModelFlushed(versionId:number, emit:(evenType:string, payload:any)=>void): void;
	onModelLinesDeleted(versionId:number, fromLineNumber:number, toLineNumber:number, emit:(evenType:string, payload:any)=>void): void;
	onModelLinesInserted(versionId:number, fromLineNumber:number, toLineNumber:number, text:string[], emit:(evenType:string, payload:any)=>void): void;
	onModelLineChanged(versionId:number, lineNumber:number, newText:string, emit:(evenType:string, payload:any)=>void): boolean;
	getOutputLineCount(): number;
	getOutputLineContent(outputLineNumber:number): string;
	getOutputIndentGuide(outputLineNumber:number): number;
	getOutputLineMinColumn(outputLineNumber:number): number;
	getOutputLineMaxColumn(outputLineNumber:number): number;
	getOutputLineTokens(outputLineNumber:number): ViewLineTokens;
	convertOutputPositionToInputPosition(viewLineNumber:number, viewColumn:number): Position;
	convertInputPositionToOutputPosition(inputLineNumber:number, inputColumn:number): Position;
	setHiddenAreas(ranges:editorCommon.IRange[], emit:(evenType:string, payload:any)=>void): void;
	inputPositionIsVisible(inputLineNumber:number, inputColumn:number): boolean;
	dispose(): void;
}

export class ViewModel extends EventEmitter implements IViewModel {

	private editorId:number;
	private configuration:editorCommon.IConfiguration;
	private model:editorCommon.IModel;

	private listenersToRemove:IDisposable[];
	private _toDispose: IDisposable[];
	private lines:ILinesCollection;
	private decorations:ViewModelDecorations;
	private cursors:ViewModelCursors;

	private getCurrentCenteredModelRange:()=>Range;

	constructor(lines:ILinesCollection, editorId:number, configuration:editorCommon.IConfiguration, model:editorCommon.IModel, getCurrentCenteredModelRange:()=>Range) {
		super();
		this.lines = lines;

		this.editorId = editorId;
		this.configuration = configuration;
		this.model = model;

		this.getCurrentCenteredModelRange = getCurrentCenteredModelRange;

		this.decorations = new ViewModelDecorations(this.editorId, this.configuration, {
			convertModelRangeToViewRange: (modelRange:editorCommon.IRange, isWholeLine:boolean) => {
				if (isWholeLine) {
					return this.convertWholeLineModelRangeToViewRange(modelRange);
				}
				return this.convertModelRangeToViewRange(modelRange);
			}
		});
		this.decorations.reset(this.model);

		this.cursors = new ViewModelCursors(this.configuration, this);

		this.listenersToRemove = [];
		this._toDispose = [];
		this.listenersToRemove.push(this.model.addBulkListener((events:EmitterEvent[]) => this.onEvents(events)));
		this._toDispose.push(this.configuration.onDidChange((e) => {
			this.onEvents([new EmitterEvent(editorCommon.EventType.ConfigurationChanged, e)]);
		}));
	}

	public setHiddenAreas(ranges:editorCommon.IRange[]): void {
		this.deferredEmit(() => {
			let lineMappingChanged = this.lines.setHiddenAreas(ranges, (eventType:string, payload:any) => this.emit(eventType, payload));
			if (lineMappingChanged) {
				this.emit(editorCommon.ViewEventNames.LineMappingChangedEvent);
				this.decorations.onLineMappingChanged((eventType:string, payload:any) => this.emit(eventType, payload));
				this.cursors.onLineMappingChanged((eventType:string, payload:any) => this.emit(eventType, payload));
			}
		});
	}

	public dispose(): void {
		this.listenersToRemove = dispose(this.listenersToRemove);
		this._toDispose = dispose(this._toDispose);
		this.decorations.dispose();
		this.decorations = null;
		this.lines.dispose();
		this.lines = null;
		this.configuration = null;
		this.model = null;
	}

	private _onTabSizeChange(newTabSize:number): boolean {
		var lineMappingChanged = this.lines.setTabSize(newTabSize, (eventType:string, payload:any) => this.emit(eventType, payload));
		if (lineMappingChanged) {
			this.emit(editorCommon.ViewEventNames.LineMappingChangedEvent);
			this.decorations.onLineMappingChanged((eventType:string, payload:any) => this.emit(eventType, payload));
			this.cursors.onLineMappingChanged((eventType: string, payload: any) => this.emit(eventType, payload));
		}
		return lineMappingChanged;
	}

	private _onWrappingIndentChange(newWrappingIndent:editorCommon.WrappingIndent): boolean {
		var lineMappingChanged = this.lines.setWrappingIndent(newWrappingIndent, (eventType:string, payload:any) => this.emit(eventType, payload));
		if (lineMappingChanged) {
			this.emit(editorCommon.ViewEventNames.LineMappingChangedEvent);
			this.decorations.onLineMappingChanged((eventType:string, payload:any) => this.emit(eventType, payload));
			this.cursors.onLineMappingChanged((eventType: string, payload: any) => this.emit(eventType, payload));
		}
		return lineMappingChanged;
	}

	private _restoreCenteredModelRange(range:Range): void {
		// modelLine -> viewLine
		var newCenteredViewRange = this.convertModelRangeToViewRange(range);

		// Send a reveal event to restore the centered content
		var restoreRevealEvent:editorCommon.IViewRevealRangeEvent = {
			range: newCenteredViewRange,
			verticalType: editorCommon.VerticalRevealType.Center,
			revealHorizontal: false
		};
		this.emit(editorCommon.ViewEventNames.RevealRangeEvent, restoreRevealEvent);
	}

	private _onWrappingColumnChange(newWrappingColumn:number, columnsForFullWidthChar:number): boolean {
		let lineMappingChanged = this.lines.setWrappingColumn(newWrappingColumn, columnsForFullWidthChar, (eventType:string, payload:any) => this.emit(eventType, payload));
		if (lineMappingChanged) {
			this.emit(editorCommon.ViewEventNames.LineMappingChangedEvent);
			this.decorations.onLineMappingChanged((eventType:string, payload:any) => this.emit(eventType, payload));
			this.cursors.onLineMappingChanged((eventType: string, payload: any) => this.emit(eventType, payload));
		}
		return lineMappingChanged;
	}

	public addEventSource(eventSource:IEventEmitter): void {
		this.listenersToRemove.push(eventSource.addBulkListener2((events:EmitterEvent[]) => this.onEvents(events)));
	}

	private onEvents(events:EmitterEvent[]): void {
		this.deferredEmit(() => {

			let hasContentChange = events.some((e) => e.getType() === editorCommon.EventType.ModelRawContentChanged),
				previousCenteredModelRange:Range;
			if (!hasContentChange) {
				// We can only convert the current centered view range to the current centered model range if the model has no changes.
				previousCenteredModelRange = this.getCurrentCenteredModelRange();
			}

			let i:number,
				len:number,
				e: EmitterEvent,
				data:any,
				modelContentChangedEvent:editorCommon.IModelContentChangedEvent,
				hadOtherModelChange = false,
				hadModelLineChangeThatChangedLineMapping = false,
				revealPreviousCenteredModelRange = false;

			for (i = 0, len = events.length; i < len; i++) {
				e = events[i];
				data = e.getData();

				switch (e.getType()) {

					case editorCommon.EventType.ModelRawContentChanged:
						modelContentChangedEvent = <editorCommon.IModelContentChangedEvent>data;

						switch (modelContentChangedEvent.changeType) {
							case editorCommon.EventType.ModelRawContentChangedFlush:
								this.onModelFlushed(<editorCommon.IModelContentChangedFlushEvent>modelContentChangedEvent);
								hadOtherModelChange = true;
								break;

							case editorCommon.EventType.ModelRawContentChangedLinesDeleted:
								this.onModelLinesDeleted(<editorCommon.IModelContentChangedLinesDeletedEvent>modelContentChangedEvent);
								hadOtherModelChange = true;
								break;

							case editorCommon.EventType.ModelRawContentChangedLinesInserted:
								this.onModelLinesInserted(<editorCommon.IModelContentChangedLinesInsertedEvent>modelContentChangedEvent);
								hadOtherModelChange = true;
								break;

							case editorCommon.EventType.ModelRawContentChangedLineChanged:
								hadModelLineChangeThatChangedLineMapping = this.onModelLineChanged(<editorCommon.IModelContentChangedLineChangedEvent>modelContentChangedEvent);
								break;

							default:
								console.info('ViewModel received unknown event: ');
								console.info(e);
						}
						break;

					case editorCommon.EventType.ModelTokensChanged:
						this.onModelTokensChanged(<editorCommon.IModelTokensChangedEvent>data);
						break;

					case editorCommon.EventType.ModelModeChanged:
						// That's ok, a model tokens changed event will follow shortly
						break;

					case editorCommon.EventType.ModelModeSupportChanged:
						// That's ok, no work to do
						break;

					case editorCommon.EventType.ModelContentChanged2:
						// Ignore
						break;

					case editorCommon.EventType.ModelOptionsChanged:
						// A tab size change causes a line mapping changed event => all view parts will repaint OK, no further event needed here
						let prevLineCount = this.lines.getOutputLineCount();
						let tabSizeChanged = this._onTabSizeChange(this.model.getOptions().tabSize);
						let newLineCount = this.lines.getOutputLineCount();
						if (tabSizeChanged && prevLineCount !== newLineCount) {
							revealPreviousCenteredModelRange = true;
						}

						break;

					case editorCommon.EventType.ModelDecorationsChanged:
						this.onModelDecorationsChanged(<editorCommon.IModelDecorationsChangedEvent>data);
						break;

					case editorCommon.EventType.ModelDispose:
						// Ignore, since the editor will take care of this and destroy the view shortly
						break;

					case editorCommon.EventType.CursorPositionChanged:
						this.onCursorPositionChanged(<editorCommon.ICursorPositionChangedEvent>data);
						break;

					case editorCommon.EventType.CursorSelectionChanged:
						this.onCursorSelectionChanged(<editorCommon.ICursorSelectionChangedEvent>data);
						break;

					case editorCommon.EventType.CursorRevealRange:
						this.onCursorRevealRange(<editorCommon.ICursorRevealRangeEvent>data);
						break;

					case editorCommon.EventType.CursorScrollRequest:
						this.onCursorScrollRequest(<editorCommon.ICursorScrollRequestEvent>data);
						break;

					case editorCommon.EventType.ConfigurationChanged:
						revealPreviousCenteredModelRange = this._onWrappingIndentChange(this.configuration.editor.wrappingInfo.wrappingIndent) || revealPreviousCenteredModelRange;
						revealPreviousCenteredModelRange = this._onWrappingColumnChange(this.configuration.editor.wrappingInfo.wrappingColumn, this.configuration.editor.fontInfo.typicalFullwidthCharacterWidth / this.configuration.editor.fontInfo.typicalHalfwidthCharacterWidth) || revealPreviousCenteredModelRange;
						if ((<editorCommon.IConfigurationChangedEvent>data).readOnly) {
							// Must read again all decorations due to readOnly filtering
							this.decorations.reset(this.model);
							var decorationsChangedEvent:editorCommon.IViewDecorationsChangedEvent = {
								inlineDecorationsChanged: false
							};
							this.emit(editorCommon.ViewEventNames.DecorationsChangedEvent, decorationsChangedEvent);
						}
						this.emit(e.getType(), <editorCommon.IConfigurationChangedEvent>data);
						break;

					default:
						console.info('View received unknown event: ');
						console.info(e);
				}
			}

			if (!hadOtherModelChange && hadModelLineChangeThatChangedLineMapping) {
				this.emit(editorCommon.ViewEventNames.LineMappingChangedEvent);
				this.decorations.onLineMappingChanged((eventType:string, payload:any) => this.emit(eventType, payload));
				this.cursors.onLineMappingChanged((eventType: string, payload: any) => this.emit(eventType, payload));
			}

			if (revealPreviousCenteredModelRange && previousCenteredModelRange) {
				this._restoreCenteredModelRange(previousCenteredModelRange);
			}
		});
	}

	// --- begin inbound event conversion
	private onModelFlushed(e:editorCommon.IModelContentChangedFlushEvent): void {
		this.lines.onModelFlushed(e.versionId, (eventType:string, payload:any) => this.emit(eventType, payload));
		this.decorations.reset(this.model);
	}
	private onModelDecorationsChanged(e:editorCommon.IModelDecorationsChangedEvent): void {
		this.decorations.onModelDecorationsChanged(e, (eventType:string, payload:any) => this.emit(eventType, payload));
	}
	private onModelLinesDeleted(e:editorCommon.IModelContentChangedLinesDeletedEvent): void {
		this.lines.onModelLinesDeleted(e.versionId, e.fromLineNumber, e.toLineNumber, (eventType:string, payload:any) => this.emit(eventType, payload));
	}
	private onModelTokensChanged(e:editorCommon.IModelTokensChangedEvent): void {
		var viewStartLineNumber = this.convertModelPositionToViewPosition(e.fromLineNumber, 1).lineNumber;
		var viewEndLineNumber = this.convertModelPositionToViewPosition(e.toLineNumber, this.model.getLineMaxColumn(e.toLineNumber)).lineNumber;

		var e:editorCommon.IViewTokensChangedEvent = {
			fromLineNumber: viewStartLineNumber,
			toLineNumber: viewEndLineNumber
		};
		this.emit(editorCommon.ViewEventNames.TokensChangedEvent, e);
	}
	private onModelLineChanged(e:editorCommon.IModelContentChangedLineChangedEvent): boolean {
		var lineMappingChanged = this.lines.onModelLineChanged(e.versionId, e.lineNumber, e.detail, (eventType:string, payload:any) => this.emit(eventType, payload));
		return lineMappingChanged;
	}
	private onModelLinesInserted(e:editorCommon.IModelContentChangedLinesInsertedEvent): void {
		this.lines.onModelLinesInserted(e.versionId, e.fromLineNumber, e.toLineNumber, e.detail.split('\n'), (eventType:string, payload:any) => this.emit(eventType, payload));
	}

	public validateViewRange(viewStartLineNumber:number, viewStartColumn:number, viewEndLineNumber:number, viewEndColumn:number, modelRange:Range): Range {
		var validViewStart = this.validateViewPosition(viewStartColumn, viewStartColumn, modelRange.getStartPosition());
		var validViewEnd = this.validateViewPosition(viewEndLineNumber, viewEndColumn, modelRange.getEndPosition());
		return new Range(validViewStart.lineNumber, validViewStart.column, validViewEnd.lineNumber, validViewEnd.column);
	}

	public validateViewPosition(viewLineNumber:number, viewColumn:number, modelPosition:Position): Position {
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

	public validateViewSelection(viewSelection:Selection, modelSelection:Selection): Selection {
		let modelSelectionStart = new Position(modelSelection.selectionStartLineNumber, modelSelection.selectionStartColumn);
		let modelPosition = new Position(modelSelection.positionLineNumber, modelSelection.positionColumn);

		let viewSelectionStart = this.validateViewPosition(viewSelection.selectionStartLineNumber, viewSelection.selectionStartColumn, modelSelectionStart);
		let viewPosition = this.validateViewPosition(viewSelection.positionLineNumber, viewSelection.positionColumn, modelPosition);

		return new Selection(viewSelectionStart.lineNumber, viewSelectionStart.column, viewPosition.lineNumber, viewPosition.column);
	}

	private onCursorPositionChanged(e:editorCommon.ICursorPositionChangedEvent): void {
		this.cursors.onCursorPositionChanged(e, (eventType:string, payload:any) => this.emit(eventType, payload));
	}
	private onCursorSelectionChanged(e:editorCommon.ICursorSelectionChangedEvent): void {
		this.cursors.onCursorSelectionChanged(e, (eventType:string, payload:any) => this.emit(eventType, payload));
	}
	private onCursorRevealRange(e:editorCommon.ICursorRevealRangeEvent): void {
		this.cursors.onCursorRevealRange(e, (eventType:string, payload:any) => this.emit(eventType, payload));
	}
	private onCursorScrollRequest(e:editorCommon.ICursorScrollRequestEvent): void {
		this.cursors.onCursorScrollRequest(e, (eventType:string, payload:any) => this.emit(eventType, payload));
	}
	// --- end inbound event conversion

	public getTabSize(): number {
		return this.model.getOptions().tabSize;
	}

	public getLineCount(): number {
		return this.lines.getOutputLineCount();
	}

	public getLineContent(lineNumber:number): string {
		return this.lines.getOutputLineContent(lineNumber);
	}

	public getLineIndentGuide(lineNumber:number): number {
		return this.lines.getOutputIndentGuide(lineNumber);
	}

	public getLineMinColumn(lineNumber:number): number {
		return this.lines.getOutputLineMinColumn(lineNumber);
	}

	public getLineMaxColumn(lineNumber:number): number {
		return this.lines.getOutputLineMaxColumn(lineNumber);
	}

	public getLineFirstNonWhitespaceColumn(lineNumber: number): number {
		var result = strings.firstNonWhitespaceIndex(this.getLineContent(lineNumber));
		if (result === -1) {
			return 0;
		}
		return result + 1;
	}

	public getLineLastNonWhitespaceColumn(lineNumber: number): number {
		var result = strings.lastNonWhitespaceIndex(this.getLineContent(lineNumber));
		if (result === -1) {
			return 0;
		}
		return result + 2;
	}

	public getLineTokens(lineNumber:number): ViewLineTokens {
		return this.lines.getOutputLineTokens(lineNumber);
	}

	public getLineRenderLineNumber(viewLineNumber:number): string {
		var modelPosition = this.convertViewPositionToModelPosition(viewLineNumber, 1);
		if (modelPosition.column !== 1) {
			return '';
		}
		var modelLineNumber = modelPosition.lineNumber;

		if (typeof this.configuration.editor.viewInfo.lineNumbers === 'function') {
			return this.configuration.editor.viewInfo.lineNumbers(modelLineNumber);
		}

		return modelLineNumber.toString();
	}

	public getDecorationsViewportData(startLineNumber:number, endLineNumber:number): IDecorationsViewportData {
		return this.decorations.getDecorationsViewportData(startLineNumber, endLineNumber);
	}

	public getAllDecorations(): editorCommon.IModelDecoration[] {
		return this.decorations.getAllDecorations();
	}

	public getEOL(): string {
		return this.model.getEOL();
	}

	public getValueInRange(range:editorCommon.IRange, eol:editorCommon.EndOfLinePreference): string {
		var modelRange = this.convertViewRangeToModelRange(range);
		return this.model.getValueInRange(modelRange, eol);
	}

	public getSelections(): Selection[] {
		return this.cursors.getSelections();
	}

	// View -> Model conversion and related methods

	public convertViewPositionToModelPosition(viewLineNumber:number, viewColumn:number): Position {
		return this.lines.convertOutputPositionToInputPosition(viewLineNumber, viewColumn);
	}

	public convertViewRangeToModelRange(viewRange:editorCommon.IRange): Range {
		var start = this.convertViewPositionToModelPosition(viewRange.startLineNumber, viewRange.startColumn);
		var end = this.convertViewPositionToModelPosition(viewRange.endLineNumber, viewRange.endColumn);
		return new Range(start.lineNumber, start.column, end.lineNumber, end.column);
	}

	public convertViewSelectionToModelSelection(viewSelection:editorCommon.ISelection): Selection {
		let selectionStart = this.convertViewPositionToModelPosition(viewSelection.selectionStartLineNumber, viewSelection.selectionStartColumn);
		let position = this.convertViewPositionToModelPosition(viewSelection.positionLineNumber, viewSelection.positionColumn);
		return new Selection(selectionStart.lineNumber, selectionStart.column, position.lineNumber, position.column);
	}

	// Model -> View conversion and related methods

	public getModelLineContent(modelLineNumber:number): string {
		return this.model.getLineContent(modelLineNumber);
	}

	public getModelLineMaxColumn(modelLineNumber:number): number {
		return this.model.getLineMaxColumn(modelLineNumber);
	}

	public validateModelPosition(position:editorCommon.IPosition): Position {
		return this.model.validatePosition(position);
	}

	public convertModelPositionToViewPosition(modelLineNumber:number, modelColumn:number): Position {
		return this.lines.convertInputPositionToOutputPosition(modelLineNumber, modelColumn);
	}

	public convertModelRangeToViewRange(modelRange:editorCommon.IRange): Range {
		var start = this.convertModelPositionToViewPosition(modelRange.startLineNumber, modelRange.startColumn);
		var end = this.convertModelPositionToViewPosition(modelRange.endLineNumber, modelRange.endColumn);
		return new Range(start.lineNumber, start.column, end.lineNumber, end.column);
	}

	public convertWholeLineModelRangeToViewRange(modelRange:editorCommon.IRange): Range {
		var start = this.convertModelPositionToViewPosition(modelRange.startLineNumber, 1);
		var end = this.convertModelPositionToViewPosition(modelRange.endLineNumber, this.model.getLineMaxColumn(modelRange.endLineNumber));
		return new Range(start.lineNumber, start.column, end.lineNumber, end.column);
	}

	public convertModelSelectionToViewSelection(modelSelection:Selection): Selection {
		var selectionStart = this.convertModelPositionToViewPosition(modelSelection.selectionStartLineNumber, modelSelection.selectionStartColumn);
		var position = this.convertModelPositionToViewPosition(modelSelection.positionLineNumber, modelSelection.positionColumn);
		return new Selection(selectionStart.lineNumber, selectionStart.column, position.lineNumber, position.column);
	}

	public modelPositionIsVisible(position:editorCommon.IPosition): boolean {
		return this.lines.inputPositionIsVisible(position.lineNumber, position.column);
	}

}