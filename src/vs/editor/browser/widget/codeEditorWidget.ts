/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import 'vs/css!./media/editor';
import 'vs/editor/common/view/editorColorRegistry'; // initialze editor theming partcicpants
import 'vs/css!./media/tokens';
import { onUnexpectedError } from 'vs/base/common/errors';
import { TPromise } from 'vs/base/common/winjs.base';
import { IEventEmitter } from 'vs/base/common/eventEmitter';
import * as browser from 'vs/base/browser/browser';
import * as dom from 'vs/base/browser/dom';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { CommonCodeEditor } from 'vs/editor/common/commonCodeEditor';
import { CommonEditorConfiguration } from 'vs/editor/common/config/commonEditorConfig';
import { Range } from 'vs/editor/common/core/range';
import { Selection } from 'vs/editor/common/core/selection';
import * as editorCommon from 'vs/editor/common/editorCommon';
import { EditorAction } from 'vs/editor/common/editorCommonExtensions';
import { ICodeEditorService } from 'vs/editor/common/services/codeEditorService';
import { Configuration } from 'vs/editor/browser/config/configuration';
import * as editorBrowser from 'vs/editor/browser/editorBrowser';
import { Colorizer } from 'vs/editor/browser/standalone/colorizer';
import { View } from 'vs/editor/browser/view/viewImpl';
import { Disposable } from 'vs/base/common/lifecycle';
import Event, { Emitter, fromEventEmitter } from 'vs/base/common/event';
import { IKeyboardEvent } from 'vs/base/browser/keyboardEvent';
import { InternalEditorAction } from 'vs/editor/common/editorAction';

export abstract class CodeEditorWidget extends CommonCodeEditor implements editorBrowser.ICodeEditor {

	public readonly onMouseUp: Event<editorBrowser.IEditorMouseEvent> = fromEventEmitter(this, editorCommon.EventType.MouseUp);
	public readonly onMouseDown: Event<editorBrowser.IEditorMouseEvent> = fromEventEmitter(this, editorCommon.EventType.MouseDown);
	public readonly onMouseDrag: Event<editorBrowser.IEditorMouseEvent> = fromEventEmitter(this, editorCommon.EventType.MouseDrag);
	public readonly onMouseDrop: Event<editorBrowser.IEditorMouseEvent> = fromEventEmitter(this, editorCommon.EventType.MouseDrop);
	public readonly onContextMenu: Event<editorBrowser.IEditorMouseEvent> = fromEventEmitter(this, editorCommon.EventType.ContextMenu);
	public readonly onMouseMove: Event<editorBrowser.IEditorMouseEvent> = fromEventEmitter(this, editorCommon.EventType.MouseMove);
	public readonly onMouseLeave: Event<editorBrowser.IEditorMouseEvent> = fromEventEmitter(this, editorCommon.EventType.MouseLeave);
	public readonly onKeyUp: Event<IKeyboardEvent> = fromEventEmitter(this, editorCommon.EventType.KeyUp);
	public readonly onKeyDown: Event<IKeyboardEvent> = fromEventEmitter(this, editorCommon.EventType.KeyDown);
	public readonly onDidLayoutChange: Event<editorCommon.EditorLayoutInfo> = fromEventEmitter(this, editorCommon.EventType.EditorLayout);
	public readonly onDidScrollChange: Event<editorCommon.IScrollEvent> = fromEventEmitter(this, 'scroll');

	private _codeEditorService: ICodeEditorService;
	private _commandService: ICommandService;

	protected domElement: HTMLElement;
	private _focusTracker: CodeEditorWidgetFocusTracker;

	_configuration: Configuration;

	private contentWidgets: { [key: string]: editorBrowser.IContentWidgetData; };
	private overlayWidgets: { [key: string]: editorBrowser.IOverlayWidgetData; };

	_view: editorBrowser.IView;

	constructor(
		domElement: HTMLElement,
		options: editorCommon.IEditorOptions,
		@IInstantiationService instantiationService: IInstantiationService,
		@ICodeEditorService codeEditorService: ICodeEditorService,
		@ICommandService commandService: ICommandService,
		@IContextKeyService contextKeyService: IContextKeyService
	) {
		super(domElement, options, instantiationService, contextKeyService);
		this._codeEditorService = codeEditorService;
		this._commandService = commandService;

		this._focusTracker = new CodeEditorWidgetFocusTracker(domElement);
		this._focusTracker.onChage(() => {
			let hasFocus = this._focusTracker.hasFocus();

			if (hasFocus) {
				this.emit(editorCommon.EventType.EditorFocus, {});
			} else {
				this.emit(editorCommon.EventType.EditorBlur, {});
			}
		});

		this.contentWidgets = {};
		this.overlayWidgets = {};

		let contributions = this._getContributions();
		for (let i = 0, len = contributions.length; i < len; i++) {
			let ctor = contributions[i];
			try {
				let contribution = this._instantiationService.createInstance(ctor, this);
				this._contributions[contribution.getId()] = contribution;
			} catch (err) {
				onUnexpectedError(err);
			}
		}

		this._getActions().forEach((action) => {
			const internalAction = new InternalEditorAction(
				action.id,
				action.label,
				action.alias,
				action.precondition,
				(): void | TPromise<void> => {
					return this._instantiationService.invokeFunction((accessor) => {
						return action.runEditorCommand(accessor, this, null);
					});
				},
				this._contextKeyService
			);
			this._actions[internalAction.id] = internalAction;
		});

		this._codeEditorService.addCodeEditor(this);
	}

	protected abstract _getContributions(): editorBrowser.IEditorContributionCtor[];
	protected abstract _getActions(): EditorAction[];

	protected _createConfiguration(options: editorCommon.ICodeEditorWidgetCreationOptions): CommonEditorConfiguration {
		return new Configuration(options, this.domElement);
	}

	public dispose(): void {
		this._codeEditorService.removeCodeEditor(this);

		this.contentWidgets = {};
		this.overlayWidgets = {};

		this._focusTracker.dispose();
		super.dispose();
	}

	public updateOptions(newOptions: editorCommon.IEditorOptions): void {
		let oldTheme = this._configuration.editor.viewInfo.theme;
		super.updateOptions(newOptions);
		let newTheme = this._configuration.editor.viewInfo.theme;

		if (oldTheme !== newTheme) {
			this.render();
		}
	}

	public colorizeModelLine(lineNumber: number, model: editorCommon.IModel = this.model): string {
		if (!model) {
			return '';
		}
		let content = model.getLineContent(lineNumber);
		model.forceTokenization(lineNumber);
		let tokens = model.getLineTokens(lineNumber);
		let inflatedTokens = tokens.inflate();
		let tabSize = model.getOptions().tabSize;
		return Colorizer.colorizeLine(content, model.mightContainRTL(), inflatedTokens, tabSize);
	}
	public getView(): editorBrowser.IView {
		return this._view;
	}

	public getDomNode(): HTMLElement {
		if (!this.hasView) {
			return null;
		}
		return this._view.domNode.domNode;
	}

	public getCenteredRangeInViewport(): Range {
		if (!this.hasView) {
			return null;
		}
		return this.viewModel.getCenteredRangeInViewport();
	}

	protected _getCompletelyVisibleViewRange(): Range {
		if (!this.hasView) {
			return null;
		}
		return this._view.getCodeEditorHelper().getCompletelyVisibleViewRange();
	}

	public getCompletelyVisibleLinesRangeInViewport(): Range {
		const viewRange = this._getCompletelyVisibleViewRange();
		return this.viewModel.coordinatesConverter.convertViewRangeToModelRange(viewRange);
	}

	public getScrollWidth(): number {
		if (!this.hasView) {
			return -1;
		}
		return this._view.getCodeEditorHelper().getScrollWidth();
	}
	public getScrollLeft(): number {
		if (!this.hasView) {
			return -1;
		}
		return this._view.getCodeEditorHelper().getScrollLeft();
	}

	public getScrollHeight(): number {
		if (!this.hasView) {
			return -1;
		}
		return this._view.getCodeEditorHelper().getScrollHeight();
	}
	public getScrollTop(): number {
		if (!this.hasView) {
			return -1;
		}
		return this._view.getCodeEditorHelper().getScrollTop();
	}

	public setScrollLeft(newScrollLeft: number): void {
		if (!this.hasView) {
			return;
		}
		if (typeof newScrollLeft !== 'number') {
			throw new Error('Invalid arguments');
		}
		this._view.getCodeEditorHelper().setScrollPosition({
			scrollLeft: newScrollLeft
		});
	}
	public setScrollTop(newScrollTop: number): void {
		if (!this.hasView) {
			return;
		}
		if (typeof newScrollTop !== 'number') {
			throw new Error('Invalid arguments');
		}
		this._view.getCodeEditorHelper().setScrollPosition({
			scrollTop: newScrollTop
		});
	}
	public setScrollPosition(position: editorCommon.INewScrollPosition): void {
		if (!this.hasView) {
			return;
		}
		this._view.getCodeEditorHelper().setScrollPosition(position);
	}

	public delegateVerticalScrollbarMouseDown(browserEvent: MouseEvent): void {
		if (!this.hasView) {
			return;
		}
		this._view.getCodeEditorHelper().delegateVerticalScrollbarMouseDown(browserEvent);
	}

	public saveViewState(): editorCommon.ICodeEditorViewState {
		if (!this.cursor || !this.hasView) {
			return null;
		}
		let contributionsState: { [key: string]: any } = {};

		let keys = Object.keys(this._contributions);
		for (let i = 0, len = keys.length; i < len; i++) {
			let id = keys[i];
			let contribution = this._contributions[id];
			if (typeof contribution.saveViewState === 'function') {
				contributionsState[id] = contribution.saveViewState();
			}
		}

		let cursorState = this.cursor.saveState();
		let viewState = this._view.saveState();
		return {
			cursorState: cursorState,
			viewState: viewState,
			contributionsState: contributionsState
		};
	}

	public restoreViewState(s: editorCommon.ICodeEditorViewState): void {
		if (!this.cursor || !this.hasView) {
			return;
		}
		if (s && s.cursorState && s.viewState) {
			let codeEditorState = <editorCommon.ICodeEditorViewState>s;
			let cursorState = <any>codeEditorState.cursorState;
			if (Array.isArray(cursorState)) {
				this.cursor.restoreState(<editorCommon.ICursorState[]>cursorState);
			} else {
				// Backwards compatibility
				this.cursor.restoreState([<editorCommon.ICursorState>cursorState]);
			}
			this._view.restoreState(codeEditorState.viewState);

			let contributionsState = s.contributionsState || {};
			let keys = Object.keys(this._contributions);
			for (let i = 0, len = keys.length; i < len; i++) {
				let id = keys[i];
				let contribution = this._contributions[id];
				if (typeof contribution.restoreViewState === 'function') {
					contribution.restoreViewState(contributionsState[id]);
				}
			}
		}
	}

	public layout(dimension?: editorCommon.IDimension): void {
		this._configuration.observeReferenceElement(dimension);
		this.render();
	}

	public focus(): void {
		if (!this.hasView) {
			return;
		}
		this._view.focus();
	}

	public isFocused(): boolean {
		return this.hasView && this._view.isFocused();
	}

	public hasWidgetFocus(): boolean {
		return this._focusTracker && this._focusTracker.hasFocus();
	}

	public addContentWidget(widget: editorBrowser.IContentWidget): void {
		let widgetData: editorBrowser.IContentWidgetData = {
			widget: widget,
			position: widget.getPosition()
		};

		if (this.contentWidgets.hasOwnProperty(widget.getId())) {
			console.warn('Overwriting a content widget with the same id.');
		}

		this.contentWidgets[widget.getId()] = widgetData;

		if (this.hasView) {
			this._view.addContentWidget(widgetData);
		}
	}

	public layoutContentWidget(widget: editorBrowser.IContentWidget): void {
		let widgetId = widget.getId();
		if (this.contentWidgets.hasOwnProperty(widgetId)) {
			let widgetData = this.contentWidgets[widgetId];
			widgetData.position = widget.getPosition();
			if (this.hasView) {
				this._view.layoutContentWidget(widgetData);
			}
		}
	}

	public removeContentWidget(widget: editorBrowser.IContentWidget): void {
		let widgetId = widget.getId();
		if (this.contentWidgets.hasOwnProperty(widgetId)) {
			let widgetData = this.contentWidgets[widgetId];
			delete this.contentWidgets[widgetId];
			if (this.hasView) {
				this._view.removeContentWidget(widgetData);
			}
		}
	}

	public addOverlayWidget(widget: editorBrowser.IOverlayWidget): void {
		let widgetData: editorBrowser.IOverlayWidgetData = {
			widget: widget,
			position: widget.getPosition()
		};

		if (this.overlayWidgets.hasOwnProperty(widget.getId())) {
			console.warn('Overwriting an overlay widget with the same id.');
		}

		this.overlayWidgets[widget.getId()] = widgetData;

		if (this.hasView) {
			this._view.addOverlayWidget(widgetData);
		}
	}

	public layoutOverlayWidget(widget: editorBrowser.IOverlayWidget): void {
		let widgetId = widget.getId();
		if (this.overlayWidgets.hasOwnProperty(widgetId)) {
			let widgetData = this.overlayWidgets[widgetId];
			widgetData.position = widget.getPosition();
			if (this.hasView) {
				this._view.layoutOverlayWidget(widgetData);
			}
		}
	}

	public removeOverlayWidget(widget: editorBrowser.IOverlayWidget): void {
		let widgetId = widget.getId();
		if (this.overlayWidgets.hasOwnProperty(widgetId)) {
			let widgetData = this.overlayWidgets[widgetId];
			delete this.overlayWidgets[widgetId];
			if (this.hasView) {
				this._view.removeOverlayWidget(widgetData);
			}
		}
	}

	public changeViewZones(callback: (accessor: editorBrowser.IViewZoneChangeAccessor) => void): void {
		if (!this.hasView) {
			return;
		}
		let hasChanges = this._view.change(callback);
		if (hasChanges) {
			this.emit(editorCommon.EventType.ViewZonesChanged);
		}
	}

	public getWhitespaces(): editorCommon.IEditorWhitespace[] {
		if (!this.hasView) {
			return [];
		}
		return this._view.getWhitespaces();
	}

	public getTopForLineNumber(lineNumber: number): number {
		if (!this.hasView) {
			return -1;
		}
		return this._view.getCodeEditorHelper().getVerticalOffsetForPosition(lineNumber, 1);
	}

	public getTopForPosition(lineNumber: number, column: number): number {
		if (!this.hasView) {
			return -1;
		}
		return this._view.getCodeEditorHelper().getVerticalOffsetForPosition(lineNumber, column);
	}

	public getTargetAtClientPoint(clientX: number, clientY: number): editorBrowser.IMouseTarget {
		if (!this.hasView) {
			return null;
		}
		return this._view.getCodeEditorHelper().getTargetAtClientPoint(clientX, clientY);
	}

	public getScrolledVisiblePosition(rawPosition: editorCommon.IPosition): { top: number; left: number; height: number; } {
		if (!this.hasView) {
			return null;
		}

		let position = this.model.validatePosition(rawPosition);
		let helper = this._view.getCodeEditorHelper();
		let layoutInfo = this._configuration.editor.layoutInfo;

		let top = helper.getVerticalOffsetForPosition(position.lineNumber, position.column) - helper.getScrollTop();
		let left = helper.getOffsetForColumn(position.lineNumber, position.column) + layoutInfo.glyphMarginWidth + layoutInfo.lineNumbersWidth + layoutInfo.decorationsWidth - helper.getScrollLeft();

		return {
			top: top,
			left: left,
			height: this._configuration.editor.lineHeight
		};
	}

	public getOffsetForColumn(lineNumber: number, column: number): number {
		if (!this.hasView) {
			return -1;
		}
		return this._view.getCodeEditorHelper().getOffsetForColumn(lineNumber, column);
	}

	public render(): void {
		if (!this.hasView) {
			return;
		}
		this._view.render(true, false);
	}

	public setHiddenAreas(ranges: editorCommon.IRange[]): void {
		if (this.viewModel) {
			this.viewModel.setHiddenAreas(ranges);
		}
	}

	public setAriaActiveDescendant(id: string): void {
		if (!this.hasView) {
			return;
		}
		this._view.setAriaActiveDescendant(id);
	}

	public applyFontInfo(target: HTMLElement): void {
		Configuration.applyFontInfoSlow(target, this._configuration.editor.fontInfo);
	}

	_attachModel(model: editorCommon.IModel): void {
		this._view = null;

		super._attachModel(model);

		if (this._view) {
			this.domElement.appendChild(this._view.domNode.domNode);

			let keys = Object.keys(this.contentWidgets);
			for (let i = 0, len = keys.length; i < len; i++) {
				let widgetId = keys[i];
				this._view.addContentWidget(this.contentWidgets[widgetId]);
			}

			keys = Object.keys(this.overlayWidgets);
			for (let i = 0, len = keys.length; i < len; i++) {
				let widgetId = keys[i];
				this._view.addOverlayWidget(this.overlayWidgets[widgetId]);
			}

			this._view.render(false, true);
			this.hasView = true;
		}
	}

	protected _enableEmptySelectionClipboard(): boolean {
		return browser.enableEmptySelectionClipboard;
	}

	protected _createView(): void {
		this._view = new View(
			this._commandService,
			this._configuration,
			this.viewModel,
			(source: string, handlerId: string, payload: any) => {
				if (!this.cursor) {
					return;
				}
				this.cursor.trigger(source, handlerId, payload);
			}
		);
	}

	protected _getViewInternalEventBus(): IEventEmitter {
		return this._view.getInternalEventBus();
	}

	protected _detachModel(): editorCommon.IModel {
		let removeDomNode: HTMLElement = null;

		if (this._view) {
			this._view.dispose();
			removeDomNode = this._view.domNode.domNode;
			this._view = null;
		}

		let result = super._detachModel();

		if (removeDomNode) {
			this.domElement.removeChild(removeDomNode);
		}

		return result;
	}

	// BEGIN decorations

	protected _registerDecorationType(key: string, options: editorCommon.IDecorationRenderOptions, parentTypeKey?: string): void {
		this._codeEditorService.registerDecorationType(key, options, parentTypeKey);
	}

	protected _removeDecorationType(key: string): void {
		this._codeEditorService.removeDecorationType(key);
	}

	protected _resolveDecorationOptions(typeKey: string, writable: boolean): editorCommon.IModelDecorationOptions {
		return this._codeEditorService.resolveDecorationOptions(typeKey, writable);
	}

	// END decorations
}

class CodeEditorWidgetFocusTracker extends Disposable {

	private _hasFocus: boolean;
	private _domFocusTracker: dom.IFocusTracker;

	private _onChange: Emitter<void> = this._register(new Emitter<void>());
	public onChage: Event<void> = this._onChange.event;

	constructor(domElement: HTMLElement) {
		super();

		this._hasFocus = false;
		this._domFocusTracker = this._register(dom.trackFocus(domElement));

		this._domFocusTracker.addFocusListener(() => {
			this._hasFocus = true;
			this._onChange.fire(void 0);
		});
		this._domFocusTracker.addBlurListener(() => {
			this._hasFocus = false;
			this._onChange.fire(void 0);
		});
	}

	public hasFocus(): boolean {
		return this._hasFocus;
	}
}

class OverlayWidget2 implements editorBrowser.IOverlayWidget {

	private _id: string;
	private _position: editorBrowser.IOverlayWidgetPosition;
	private _domNode: HTMLElement;

	constructor(id: string, position: editorBrowser.IOverlayWidgetPosition) {
		this._id = id;
		this._position = position;
		this._domNode = document.createElement('div');
		this._domNode.className = this._id.replace(/\./g, '-').replace(/[^a-z0-9\-]/, '');
	}

	public getId(): string {
		return this._id;
	}

	public getDomNode(): HTMLElement {
		return this._domNode;
	}

	public getPosition(): editorBrowser.IOverlayWidgetPosition {
		return this._position;
	}
}

export enum EditCursorState {
	EndOfLastEditOperation = 0
}

class SingleEditOperation {

	range: Range;
	text: string;
	forceMoveMarkers: boolean;

	constructor(source: editorCommon.ISingleEditOperation) {
		this.range = new Range(source.range.startLineNumber, source.range.startColumn, source.range.endLineNumber, source.range.endColumn);
		this.text = source.text;
		this.forceMoveMarkers = source.forceMoveMarkers || false;
	}

}

export class CommandRunner implements editorCommon.ICommand {

	private _ops: SingleEditOperation[];
	private _editCursorState: EditCursorState;

	constructor(ops: editorCommon.ISingleEditOperation[], editCursorState: EditCursorState) {
		this._ops = ops.map(op => new SingleEditOperation(op));
		this._editCursorState = editCursorState;
	}

	public getEditOperations(model: editorCommon.ITokenizedModel, builder: editorCommon.IEditOperationBuilder): void {
		if (this._ops.length === 0) {
			return;
		}

		// Sort them in ascending order by range starts
		this._ops.sort((o1, o2) => {
			return Range.compareRangesUsingStarts(o1.range, o2.range);
		});

		// Merge operations that touch each other
		let resultOps: editorCommon.ISingleEditOperation[] = [];
		let previousOp = this._ops[0];
		for (let i = 1; i < this._ops.length; i++) {
			if (previousOp.range.endLineNumber === this._ops[i].range.startLineNumber && previousOp.range.endColumn === this._ops[i].range.startColumn) {
				// These operations are one after another and can be merged
				previousOp.range = Range.plusRange(previousOp.range, this._ops[i].range);
				previousOp.text = previousOp.text + this._ops[i].text;
			} else {
				resultOps.push(previousOp);
				previousOp = this._ops[i];
			}
		}
		resultOps.push(previousOp);

		for (let i = 0; i < resultOps.length; i++) {
			builder.addEditOperation(Range.lift(resultOps[i].range), resultOps[i].text);
		}
	}

	public computeCursorState(model: editorCommon.ITokenizedModel, helper: editorCommon.ICursorStateComputerData): Selection {
		let inverseEditOperations = helper.getInverseEditOperations();
		let srcRange = inverseEditOperations[inverseEditOperations.length - 1].range;
		return new Selection(
			srcRange.endLineNumber,
			srcRange.endColumn,
			srcRange.endLineNumber,
			srcRange.endColumn
		);
	}
}
