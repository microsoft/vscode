/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { CodeEditorWidget } from '../codeEditor/codeEditorWidget.js';
import { IEditorOptions } from '../../../common/config/editorOptions.js';
import { IDimension } from '../../../common/core/dimension.js';
import { IPosition, Position } from '../../../common/core/position.js';
import { IRange, Range } from '../../../common/core/range.js';
import { ISelection, Selection } from '../../../common/core/selection.js';
import { IDiffEditorViewModel, IEditor, IEditorAction, IEditorDecorationsCollection, IEditorModel, IEditorViewState, ScrollType } from '../../../common/editorCommon.js';
import { IModelDecorationsChangeAccessor, IModelDeltaDecoration } from '../../../common/model.js';

export abstract class DelegatingEditor extends Disposable implements IEditor {
	private static idCounter = 0;
	private readonly _id = ++DelegatingEditor.idCounter;

	private readonly _onDidDispose = this._register(new Emitter<void>());
	public readonly onDidDispose = this._onDidDispose.event;

	protected abstract get _targetEditor(): CodeEditorWidget;

	getId(): string { return this.getEditorType() + ':v2:' + this._id; }

	abstract getEditorType(): string;
	abstract updateOptions(newOptions: IEditorOptions): void;
	abstract onVisible(): void;
	abstract onHide(): void;
	abstract layout(dimension?: IDimension | undefined): void;
	abstract hasTextFocus(): boolean;
	abstract saveViewState(): IEditorViewState | null;
	abstract restoreViewState(state: IEditorViewState | null): void;
	abstract getModel(): IEditorModel | null;
	abstract setModel(model: IEditorModel | null | IDiffEditorViewModel): void;

	// #region editorBrowser.IDiffEditor: Delegating to modified Editor

	public getVisibleColumnFromPosition(position: IPosition): number {
		return this._targetEditor.getVisibleColumnFromPosition(position);
	}

	public getStatusbarColumn(position: IPosition): number {
		return this._targetEditor.getStatusbarColumn(position);
	}

	public getPosition(): Position | null {
		return this._targetEditor.getPosition();
	}

	public setPosition(position: IPosition, source: string = 'api'): void {
		this._targetEditor.setPosition(position, source);
	}

	public revealLine(lineNumber: number, scrollType: ScrollType = ScrollType.Smooth): void {
		this._targetEditor.revealLine(lineNumber, scrollType);
	}

	public revealLineInCenter(lineNumber: number, scrollType: ScrollType = ScrollType.Smooth): void {
		this._targetEditor.revealLineInCenter(lineNumber, scrollType);
	}

	public revealLineInCenterIfOutsideViewport(lineNumber: number, scrollType: ScrollType = ScrollType.Smooth): void {
		this._targetEditor.revealLineInCenterIfOutsideViewport(lineNumber, scrollType);
	}

	public revealLineNearTop(lineNumber: number, scrollType: ScrollType = ScrollType.Smooth): void {
		this._targetEditor.revealLineNearTop(lineNumber, scrollType);
	}

	public revealPosition(position: IPosition, scrollType: ScrollType = ScrollType.Smooth): void {
		this._targetEditor.revealPosition(position, scrollType);
	}

	public revealPositionInCenter(position: IPosition, scrollType: ScrollType = ScrollType.Smooth): void {
		this._targetEditor.revealPositionInCenter(position, scrollType);
	}

	public revealPositionInCenterIfOutsideViewport(position: IPosition, scrollType: ScrollType = ScrollType.Smooth): void {
		this._targetEditor.revealPositionInCenterIfOutsideViewport(position, scrollType);
	}

	public revealPositionNearTop(position: IPosition, scrollType: ScrollType = ScrollType.Smooth): void {
		this._targetEditor.revealPositionNearTop(position, scrollType);
	}

	public getSelection(): Selection | null {
		return this._targetEditor.getSelection();
	}

	public getSelections(): Selection[] | null {
		return this._targetEditor.getSelections();
	}

	public setSelection(range: IRange, source?: string): void;
	public setSelection(editorRange: Range, source?: string): void;
	public setSelection(selection: ISelection, source?: string): void;
	public setSelection(editorSelection: Selection, source?: string): void;
	public setSelection(something: any, source: string = 'api'): void {
		this._targetEditor.setSelection(something, source);
	}

	public setSelections(ranges: readonly ISelection[], source: string = 'api'): void {
		this._targetEditor.setSelections(ranges, source);
	}

	public revealLines(startLineNumber: number, endLineNumber: number, scrollType: ScrollType = ScrollType.Smooth): void {
		this._targetEditor.revealLines(startLineNumber, endLineNumber, scrollType);
	}

	public revealLinesInCenter(startLineNumber: number, endLineNumber: number, scrollType: ScrollType = ScrollType.Smooth): void {
		this._targetEditor.revealLinesInCenter(startLineNumber, endLineNumber, scrollType);
	}

	public revealLinesInCenterIfOutsideViewport(startLineNumber: number, endLineNumber: number, scrollType: ScrollType = ScrollType.Smooth): void {
		this._targetEditor.revealLinesInCenterIfOutsideViewport(startLineNumber, endLineNumber, scrollType);
	}

	public revealLinesNearTop(startLineNumber: number, endLineNumber: number, scrollType: ScrollType = ScrollType.Smooth): void {
		this._targetEditor.revealLinesNearTop(startLineNumber, endLineNumber, scrollType);
	}

	public revealRange(range: IRange, scrollType: ScrollType = ScrollType.Smooth, revealVerticalInCenter: boolean = false, revealHorizontal: boolean = true): void {
		this._targetEditor.revealRange(range, scrollType, revealVerticalInCenter, revealHorizontal);
	}

	public revealRangeInCenter(range: IRange, scrollType: ScrollType = ScrollType.Smooth): void {
		this._targetEditor.revealRangeInCenter(range, scrollType);
	}

	public revealRangeInCenterIfOutsideViewport(range: IRange, scrollType: ScrollType = ScrollType.Smooth): void {
		this._targetEditor.revealRangeInCenterIfOutsideViewport(range, scrollType);
	}

	public revealRangeNearTop(range: IRange, scrollType: ScrollType = ScrollType.Smooth): void {
		this._targetEditor.revealRangeNearTop(range, scrollType);
	}

	public revealRangeNearTopIfOutsideViewport(range: IRange, scrollType: ScrollType = ScrollType.Smooth): void {
		this._targetEditor.revealRangeNearTopIfOutsideViewport(range, scrollType);
	}

	public revealRangeAtTop(range: IRange, scrollType: ScrollType = ScrollType.Smooth): void {
		this._targetEditor.revealRangeAtTop(range, scrollType);
	}

	public getSupportedActions(): IEditorAction[] {
		return this._targetEditor.getSupportedActions();
	}

	public focus(): void {
		this._targetEditor.focus();
	}

	public trigger(source: string | null | undefined, handlerId: string, payload: any): void {
		this._targetEditor.trigger(source, handlerId, payload);
	}

	public createDecorationsCollection(decorations?: IModelDeltaDecoration[]): IEditorDecorationsCollection {
		return this._targetEditor.createDecorationsCollection(decorations);
	}

	public changeDecorations(callback: (changeAccessor: IModelDecorationsChangeAccessor) => any): any {
		return this._targetEditor.changeDecorations(callback);
	}

	// #endregion
}
