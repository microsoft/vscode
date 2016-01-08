/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import 'vs/css!./media/editor';
import 'vs/css!./media/tokens';
import 'vs/css!./media/default-theme';

import * as EditorCommon from 'vs/editor/common/editorCommon';
import * as Browser from 'vs/base/browser/browser';
import {colorizeLine} from 'vs/editor/browser/standalone/colorizer';
import {TPromise} from 'vs/base/common/winjs.base';
import {onUnexpectedError} from 'vs/base/common/errors';
import * as DOM from 'vs/base/browser/dom';
import {IEventEmitter} from 'vs/base/common/eventEmitter';
import {Configuration} from 'vs/editor/browser/config/configuration';
import * as EditorBrowser from 'vs/editor/browser/editorBrowser';
import {View} from 'vs/editor/browser/view/viewImpl';
import {EditorBrowserRegistry} from 'vs/editor/browser/editorBrowserExtensions';
import {CommonEditorRegistry} from 'vs/editor/common/editorCommonExtensions';
import {IActionProvider} from 'vs/base/common/actions';
import {ICodeEditorService} from 'vs/editor/common/services/codeEditorService';
import {Range} from 'vs/editor/common/core/range';
import {Position} from 'vs/editor/common/core/position';
import {Selection} from 'vs/editor/common/core/selection';
import {IInstantiationService} from 'vs/platform/instantiation/common/instantiation';
import {ITelemetryService} from 'vs/platform/telemetry/common/telemetry';
import {IKeybindingService} from 'vs/platform/keybinding/common/keybindingService';
import {CommonCodeEditor} from 'vs/editor/common/commonCodeEditor';
import {CommonEditorConfiguration, IIndentationGuesser} from 'vs/editor/common/config/commonEditorConfig';

export class CodeEditorWidget extends CommonCodeEditor implements IActionProvider, EditorBrowser.ICodeEditor {

	protected domElement:HTMLElement;
	private focusTracker:DOM.IFocusTracker;

	_configuration:Configuration;

	private contentWidgets:{ [key:string]:EditorBrowser.IContentWidgetData; };
	private overlayWidgets:{ [key:string]:EditorBrowser.IOverlayWidgetData; };

	_view:EditorBrowser.IView;

	constructor(
		domElement:HTMLElement,
		options:EditorCommon.ICodeEditorWidgetCreationOptions,
		@IInstantiationService instantiationService: IInstantiationService,
		@ICodeEditorService codeEditorService: ICodeEditorService,
		@IKeybindingService keybindingService: IKeybindingService,
		@ITelemetryService telemetryService: ITelemetryService
	) {
		this.domElement = domElement;

		super(domElement, options, instantiationService, codeEditorService, keybindingService, telemetryService);

		// track focus of the domElement and all its anchestors
		this.focusTracker = DOM.trackFocus(this.domElement);
		this.focusTracker.addFocusListener(() => {
			if (this.forcedWidgetFocusCount === 0) {
				this._editorFocusContextKey.set(true);
				this.emit(EditorCommon.EventType.EditorFocus, {});
			}
		});
		this.focusTracker.addBlurListener(() => {
			if (this.forcedWidgetFocusCount === 0) {
				this._editorFocusContextKey.reset();
				this.emit(EditorCommon.EventType.EditorBlur, {});
			}
		});

		this.contentWidgets = {};
		this.overlayWidgets = {};

		var contributionDescriptors = [].concat(EditorBrowserRegistry.getEditorContributions()).concat(CommonEditorRegistry.getEditorContributions());
		for (var i = 0, len = contributionDescriptors.length; i < len; i++) {
			try {
				var contribution = contributionDescriptors[i].createInstance(this._instantiationService, this);
				this.contributions[contribution.getId()] = contribution;
			} catch (err) {
				console.error('Could not instantiate contribution ' + contribution.getId());
				onUnexpectedError(err);
			}
		}
	}

	protected _createConfiguration(options:EditorCommon.ICodeEditorWidgetCreationOptions, indentationGuesser:IIndentationGuesser): CommonEditorConfiguration {
		return new Configuration(options, this.domElement, indentationGuesser);
	}

	public dispose(): void {
		this.contentWidgets = {};
		this.overlayWidgets = {};

		this.focusTracker.dispose();
		super.dispose();
	}

	public colorizeModelLine(lineNumber:number, model:EditorCommon.IModel = this.model): string {
		if (!model) {
			return '';
		}
		var content = model.getLineContent(lineNumber);
		var tokens = model.getLineTokens(lineNumber, false);
		var inflatedTokens = EditorCommon.LineTokensBinaryEncoding.inflateArr(tokens.getBinaryEncodedTokensMap(), tokens.getBinaryEncodedTokens());
		var indent = this._configuration.getIndentationOptions();
		return colorizeLine(content, inflatedTokens, indent.tabSize);
	}
	public getView(): EditorBrowser.IView {
		return this._view;
	}

	public getDomNode(): HTMLElement {
		if (!this.hasView) {
			return null;
		}
		return this._view.domNode;
	}

	public getCenteredRangeInViewport(): EditorCommon.IEditorRange {
		if (!this.hasView) {
			return null;
		}
		return this._view.getCenteredRangeInViewport();
	}

	public setScrollTop(newScrollTop:number): void {
		if (!this.hasView) {
			return;
		}
		if (typeof newScrollTop !== 'number') {
			throw new Error('Invalid arguments');
		}
		this._view.getCodeEditorHelper().setScrollTop(newScrollTop);
	}

	public getScrollTop(): number {
		if (!this.hasView) {
			return -1;
		}
		return this._view.getCodeEditorHelper().getScrollTop();
	}

	public delegateVerticalScrollbarMouseDown(browserEvent:MouseEvent): void {
		if (!this.hasView) {
			return;
		}
		this._view.getCodeEditorHelper().delegateVerticalScrollbarMouseDown(browserEvent);
	}

	public setScrollLeft(newScrollLeft:number): void {
		if (!this.hasView) {
			return;
		}
		if (typeof newScrollLeft !== 'number') {
			throw new Error('Invalid arguments');
		}
		this._view.getCodeEditorHelper().setScrollLeft(newScrollLeft);
	}

	public getScrollLeft(): number {
		if (!this.hasView) {
			return -1;
		}
		return this._view.getCodeEditorHelper().getScrollLeft();
	}

	public getScrollWidth(): number {
		if (!this.hasView) {
			return -1;
		}
		return this._view.getCodeEditorHelper().getScrollWidth();
	}

	public getScrollHeight(): number {
		if (!this.hasView) {
			return -1;
		}
		return this._view.getCodeEditorHelper().getScrollHeight();
	}

	public saveViewState(): EditorCommon.ICodeEditorViewState {
		if (!this.cursor || !this.hasView) {
			return null;
		}
		var cursorState = this.cursor.saveState();
		var viewState = this._view.saveState();
		return {
			cursorState: cursorState,
			viewState: viewState
		};
	}

	public restoreViewState(state:EditorCommon.IEditorViewState): void {
		if (!this.cursor || !this.hasView) {
			return;
		}
		var s = <any>state;
		if (s && s.cursorState && s.viewState) {
			var codeEditorState = <EditorCommon.ICodeEditorViewState>s;
			var cursorState = <any>codeEditorState.cursorState;
			if (Array.isArray(cursorState)) {
				this.cursor.restoreState(<EditorCommon.ICursorState[]>cursorState);
			} else {
				// Backwards compatibility
				this.cursor.restoreState([<EditorCommon.ICursorState>cursorState]);
			}
			this._view.restoreState(codeEditorState.viewState);
		}
	}

	public layout(dimension?:EditorCommon.IDimension): void {
		this._configuration.observeReferenceElement(dimension);
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

	public addContentWidget(widget: EditorBrowser.IContentWidget): void {
		var widgetData: EditorBrowser.IContentWidgetData = {
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

	public layoutContentWidget(widget: EditorBrowser.IContentWidget): void {
		var widgetId = widget.getId();
		if (this.contentWidgets.hasOwnProperty(widgetId)) {
			var widgetData = this.contentWidgets[widgetId];
			widgetData.position = widget.getPosition();
			if (this.hasView) {
				this._view.layoutContentWidget(widgetData);
			}
		}
	}

	public removeContentWidget(widget: EditorBrowser.IContentWidget): void {
		var widgetId = widget.getId();
		if (this.contentWidgets.hasOwnProperty(widgetId)) {
			var widgetData = this.contentWidgets[widgetId];
			delete this.contentWidgets[widgetId];
			if (this.hasView) {
				this._view.removeContentWidget(widgetData);
			}
		}
	}

	public addOverlayWidget(widget: EditorBrowser.IOverlayWidget): void {
		var widgetData: EditorBrowser.IOverlayWidgetData = {
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

	public layoutOverlayWidget(widget: EditorBrowser.IOverlayWidget): void {
		var widgetId = widget.getId();
		if (this.overlayWidgets.hasOwnProperty(widgetId)) {
			var widgetData = this.overlayWidgets[widgetId];
			widgetData.position = widget.getPosition();
			if (this.hasView) {
				this._view.layoutOverlayWidget(widgetData);
			}
		}
	}

	public removeOverlayWidget(widget: EditorBrowser.IOverlayWidget): void {
		var widgetId = widget.getId();
		if (this.overlayWidgets.hasOwnProperty(widgetId)) {
			var widgetData = this.overlayWidgets[widgetId];
			delete this.overlayWidgets[widgetId];
			if (this.hasView) {
				this._view.removeOverlayWidget(widgetData);
			}
		}
	}

	public changeViewZones(callback:(accessor:EditorBrowser.IViewZoneChangeAccessor)=>void): void {
		if (!this.hasView) {
//			console.warn('Cannot change view zones on editor that is not attached to a model, since there is no view.');
			return;
		}
		var hasChanges = this._view.change(callback);
		if (hasChanges) {
			this.emit(EditorCommon.EventType.ViewZonesChanged);
		}
	}

	public getWhitespaces(): EditorCommon.IEditorWhitespace[] {
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

	public getScrolledVisiblePosition(rawPosition:EditorCommon.IPosition): { top:number; left:number; height:number; } {
		if (!this.hasView) {
			return null;
		}

		var position = this.model.validatePosition(rawPosition);
		var helper = this._view.getCodeEditorHelper();
		var layoutInfo = this._configuration.editor.layoutInfo;

		var top = helper.getVerticalOffsetForPosition(position.lineNumber, position.column) - helper.getScrollTop();
		var left = helper.getOffsetForColumn(position.lineNumber, position.column) + layoutInfo.glyphMarginWidth + layoutInfo.lineNumbersWidth + layoutInfo.decorationsWidth - helper.getScrollLeft();

		return {
			top: top,
			left: left,
			height: this._configuration.editor.lineHeight
		};
	}

	public getOffsetForColumn(lineNumber:number, column:number): number {
		if (!this.hasView) {
			return -1;
		}
		return this._view.getCodeEditorHelper().getOffsetForColumn(lineNumber, column);
	}

	_attachModel(model:EditorCommon.IModel): void {
		this._view = null;

		super._attachModel(model);

		if (this._view) {
			this.domElement.appendChild(this._view.domNode);

			this._view.renderOnce(() => {

				var widgetId:string;
				for (widgetId in this.contentWidgets) {
					if (this.contentWidgets.hasOwnProperty(widgetId)) {
						this._view.addContentWidget(this.contentWidgets[widgetId]);
					}
				}

				for (widgetId in this.overlayWidgets) {
					if (this.overlayWidgets.hasOwnProperty(widgetId)) {
						this._view.addOverlayWidget(this.overlayWidgets[widgetId]);
					}
				}

				this._view.render();
				this.hasView = true;
			});
		}
	}

	protected _enableEmptySelectionClipboard(): boolean {
		return Browser.enableEmptySelectionClipboard;
	}

	protected _createView(): void {
		this._view = new View(
			this.id,
			this._configuration,
			this.viewModel,
			this._keybindingService
		);
	}

	protected _getViewInternalEventBus(): IEventEmitter {
		return this._view.getInternalEventBus();
	}

	protected _detachModel(): EditorCommon.IModel {
		var removeDomNode:HTMLElement = null;

		if (this._view) {
			this._view.dispose();
			removeDomNode = this._view.domNode;
			this._view = null;
		}

		let result = super._detachModel();

		if (removeDomNode) {
			this.domElement.removeChild(removeDomNode);
		}

		return result;
	}
}

class OverlayWidget2 implements EditorBrowser.IOverlayWidget {

	private _id: string;
	private _position: EditorBrowser.IOverlayWidgetPosition;
	private _domNode: HTMLElement;

	constructor(id:string, position:EditorBrowser.IOverlayWidgetPosition) {
		this._id = id;
		this._position = position;
		this._domNode = document.createElement('div');
		this._domNode.className = this._id.replace(/\./g, '-').replace(/[^a-z0-9\-]/,'');
	}

	public getId(): string {
		return this._id;
	}

	public getDomNode(): HTMLElement {
		return this._domNode;
	}

	public getPosition(): EditorBrowser.IOverlayWidgetPosition {
		return this._position;
	}
}

export enum EditCursorState {
	EndOfLastEditOperation = 0
}

export class CommandRunner implements EditorCommon.ICommand {

	private _ops: EditorCommon.ISingleEditOperation[];
	private _editCursorState: EditCursorState;

	constructor(ops: EditorCommon.ISingleEditOperation[], editCursorState: EditCursorState) {
		this._ops = ops;
		this._editCursorState = editCursorState;
	}

	public getEditOperations(model: EditorCommon.ITokenizedModel, builder: EditorCommon.IEditOperationBuilder): void {
		if (this._ops.length === 0) {
			return;
		}

		// Sort them in ascending order by range starts
		this._ops.sort((o1, o2) => {
			return Range.compareRangesUsingStarts(o1.range, o2.range);
		});

		// Merge operations that touch each other
		var resultOps:EditorCommon.ISingleEditOperation[] = [];
		var previousOp = this._ops[0];
		for (var i = 1; i < this._ops.length; i++) {
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

		for (var i = 0; i < resultOps.length; i++) {
			builder.addEditOperation(Range.lift(resultOps[i].range), resultOps[i].text);
		}
	}

	public computeCursorState(model: EditorCommon.ITokenizedModel, helper: EditorCommon.ICursorStateComputerData): EditorCommon.IEditorSelection {
		var inverseEditOperations = helper.getInverseEditOperations();
		var srcRange = inverseEditOperations[inverseEditOperations.length - 1].range;
		return Selection.createSelection(
			srcRange.endLineNumber,
			srcRange.endColumn,
			srcRange.endLineNumber,
			srcRange.endColumn
		);
	}
}
