/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import 'vs/css!./media/editor';
import 'vs/css!./media/tokens';
import { onUnexpectedError } from 'vs/base/common/errors';
import { TPromise } from 'vs/base/common/winjs.base';
import * as dom from 'vs/base/browser/dom';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { CommonCodeEditor } from 'vs/editor/common/commonCodeEditor';
import { CommonEditorConfiguration } from 'vs/editor/common/config/commonEditorConfig';
import { Range, IRange } from 'vs/editor/common/core/range';
import * as editorCommon from 'vs/editor/common/editorCommon';
import { EditorAction } from 'vs/editor/common/editorCommonExtensions';
import { ICodeEditorService } from 'vs/editor/common/services/codeEditorService';
import { Configuration } from 'vs/editor/browser/config/configuration';
import * as editorBrowser from 'vs/editor/browser/editorBrowser';
import { View, IOverlayWidgetData, IContentWidgetData } from 'vs/editor/browser/view/viewImpl';
import { Disposable, IDisposable } from 'vs/base/common/lifecycle';
import Event, { Emitter } from 'vs/base/common/event';
import { IKeyboardEvent } from 'vs/base/browser/keyboardEvent';
import { InternalEditorAction } from 'vs/editor/common/editorAction';
import { IEditorOptions } from 'vs/editor/common/config/editorOptions';
import { IPosition } from 'vs/editor/common/core/position';
import { IEditorWhitespace } from 'vs/editor/common/viewLayout/whitespaceComputer';
import { CoreEditorCommand } from 'vs/editor/common/controller/coreCommands';
import { IThemeService, registerThemingParticipant } from 'vs/platform/theme/common/themeService';
import { editorErrorForeground, editorErrorBorder, editorWarningForeground, editorWarningBorder } from 'vs/editor/common/view/editorColorRegistry';
import { Color } from 'vs/base/common/color';
import { IMouseEvent } from 'vs/base/browser/mouseEvent';

export abstract class CodeEditorWidget extends CommonCodeEditor implements editorBrowser.ICodeEditor {

	private readonly _onMouseUp: Emitter<editorBrowser.IEditorMouseEvent> = this._register(new Emitter<editorBrowser.IEditorMouseEvent>());
	public readonly onMouseUp: Event<editorBrowser.IEditorMouseEvent> = this._onMouseUp.event;

	private readonly _onMouseDown: Emitter<editorBrowser.IEditorMouseEvent> = this._register(new Emitter<editorBrowser.IEditorMouseEvent>());
	public readonly onMouseDown: Event<editorBrowser.IEditorMouseEvent> = this._onMouseDown.event;

	private readonly _onMouseDrag: Emitter<editorBrowser.IEditorMouseEvent> = this._register(new Emitter<editorBrowser.IEditorMouseEvent>());
	public readonly onMouseDrag: Event<editorBrowser.IEditorMouseEvent> = this._onMouseDrag.event;

	private readonly _onMouseDrop: Emitter<editorBrowser.IEditorMouseEvent> = this._register(new Emitter<editorBrowser.IEditorMouseEvent>());
	public readonly onMouseDrop: Event<editorBrowser.IEditorMouseEvent> = this._onMouseDrop.event;

	private readonly _onContextMenu: Emitter<editorBrowser.IEditorMouseEvent> = this._register(new Emitter<editorBrowser.IEditorMouseEvent>());
	public readonly onContextMenu: Event<editorBrowser.IEditorMouseEvent> = this._onContextMenu.event;

	private readonly _onMouseMove: Emitter<editorBrowser.IEditorMouseEvent> = this._register(new Emitter<editorBrowser.IEditorMouseEvent>());
	public readonly onMouseMove: Event<editorBrowser.IEditorMouseEvent> = this._onMouseMove.event;

	private readonly _onMouseLeave: Emitter<editorBrowser.IEditorMouseEvent> = this._register(new Emitter<editorBrowser.IEditorMouseEvent>());
	public readonly onMouseLeave: Event<editorBrowser.IEditorMouseEvent> = this._onMouseLeave.event;

	private readonly _onKeyUp: Emitter<IKeyboardEvent> = this._register(new Emitter<IKeyboardEvent>());
	public readonly onKeyUp: Event<IKeyboardEvent> = this._onKeyUp.event;

	private readonly _onKeyDown: Emitter<IKeyboardEvent> = this._register(new Emitter<IKeyboardEvent>());
	public readonly onKeyDown: Event<IKeyboardEvent> = this._onKeyDown.event;

	private readonly _onDidScrollChange: Emitter<editorCommon.IScrollEvent> = this._register(new Emitter<editorCommon.IScrollEvent>());
	public readonly onDidScrollChange: Event<editorCommon.IScrollEvent> = this._onDidScrollChange.event;

	private readonly _onDidChangeViewZones: Emitter<void> = this._register(new Emitter<void>());
	public readonly onDidChangeViewZones: Event<void> = this._onDidChangeViewZones.event;

	private _codeEditorService: ICodeEditorService;
	private _commandService: ICommandService;
	private _themeService: IThemeService;

	protected domElement: HTMLElement;
	private _focusTracker: CodeEditorWidgetFocusTracker;

	_configuration: Configuration;

	private contentWidgets: { [key: string]: IContentWidgetData; };
	private overlayWidgets: { [key: string]: IOverlayWidgetData; };

	_view: View;

	constructor(
		domElement: HTMLElement,
		options: IEditorOptions,
		@IInstantiationService instantiationService: IInstantiationService,
		@ICodeEditorService codeEditorService: ICodeEditorService,
		@ICommandService commandService: ICommandService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IThemeService themeService: IThemeService
	) {
		super(domElement, options, instantiationService, contextKeyService);
		this._codeEditorService = codeEditorService;
		this._commandService = commandService;
		this._themeService = themeService;

		this._focusTracker = new CodeEditorWidgetFocusTracker(domElement);
		this._focusTracker.onChange(() => {
			let hasFocus = this._focusTracker.hasFocus();

			if (hasFocus) {
				this._onDidFocusEditor.fire();
			} else {
				this._onDidBlurEditor.fire();
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

	protected _createConfiguration(options: IEditorOptions): CommonEditorConfiguration {
		return new Configuration(options, this.domElement);
	}

	public dispose(): void {
		this._codeEditorService.removeCodeEditor(this);

		this.contentWidgets = {};
		this.overlayWidgets = {};

		this._focusTracker.dispose();
		super.dispose();
	}

	public createOverviewRuler(cssClassName: string, minimumHeight: number, maximumHeight: number): editorBrowser.IOverviewRuler {
		return this._view.createOverviewRuler(cssClassName, minimumHeight, maximumHeight);
	}

	public getDomNode(): HTMLElement {
		if (!this.hasView) {
			return null;
		}
		return this._view.domNode.domNode;
	}

	public getCompletelyVisibleLinesRangeInViewport(): Range {
		if (!this.hasView) {
			return null;
		}
		const viewRange = this.viewModel.getCompletelyVisibleViewRange();
		return this.viewModel.coordinatesConverter.convertViewRangeToModelRange(viewRange);
	}

	public delegateVerticalScrollbarMouseDown(browserEvent: IMouseEvent): void {
		if (!this.hasView) {
			return;
		}
		this._view.delegateVerticalScrollbarMouseDown(browserEvent);
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
		let widgetData: IContentWidgetData = {
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
		let widgetData: IOverlayWidgetData = {
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
			this._onDidChangeViewZones.fire();
		}
	}

	public getWhitespaces(): IEditorWhitespace[] {
		if (!this.hasView) {
			return [];
		}
		return this.viewModel.viewLayout.getWhitespaces();
	}

	private _getVerticalOffsetForPosition(modelLineNumber: number, modelColumn: number): number {
		let modelPosition = this.model.validatePosition({
			lineNumber: modelLineNumber,
			column: modelColumn
		});
		let viewPosition = this.viewModel.coordinatesConverter.convertModelPositionToViewPosition(modelPosition);
		return this.viewModel.viewLayout.getVerticalOffsetForLineNumber(viewPosition.lineNumber);
	}

	public getTopForLineNumber(lineNumber: number): number {
		if (!this.hasView) {
			return -1;
		}
		return this._getVerticalOffsetForPosition(lineNumber, 1);
	}

	public getTopForPosition(lineNumber: number, column: number): number {
		if (!this.hasView) {
			return -1;
		}
		return this._getVerticalOffsetForPosition(lineNumber, column);
	}

	public getTargetAtClientPoint(clientX: number, clientY: number): editorBrowser.IMouseTarget {
		if (!this.hasView) {
			return null;
		}
		return this._view.getTargetAtClientPoint(clientX, clientY);
	}

	public getScrolledVisiblePosition(rawPosition: IPosition): { top: number; left: number; height: number; } {
		if (!this.hasView) {
			return null;
		}

		let position = this.model.validatePosition(rawPosition);
		let layoutInfo = this._configuration.editor.layoutInfo;

		let top = this._getVerticalOffsetForPosition(position.lineNumber, position.column) - this.getScrollTop();
		let left = this._view.getOffsetForColumn(position.lineNumber, position.column) + layoutInfo.glyphMarginWidth + layoutInfo.lineNumbersWidth + layoutInfo.decorationsWidth - this.getScrollLeft();

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
		return this._view.getOffsetForColumn(lineNumber, column);
	}

	public render(): void {
		if (!this.hasView) {
			return;
		}
		this._view.render(true, false);
	}

	public setHiddenAreas(ranges: IRange[]): void {
		if (this.viewModel) {
			this.viewModel.setHiddenAreas(ranges.map(r => Range.lift(r)));
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

	protected _scheduleAtNextAnimationFrame(callback: () => void): IDisposable {
		return dom.scheduleAtNextAnimationFrame(callback);
	}

	protected _createView(): void {
		this._view = new View(
			this._commandService,
			this._configuration,
			this._themeService,
			this.viewModel,
			this.cursor,
			(editorCommand: CoreEditorCommand, args: any) => {
				if (!this.cursor) {
					return;
				}
				editorCommand.runCoreEditorCommand(this.cursor, args);
			}
		);

		const viewEventBus = this._view.getInternalEventBus();

		viewEventBus.onDidGainFocus = () => {
			this._onDidFocusEditorText.fire();
			// In IE, the focus is not synchronous, so we give it a little help
			this._onDidFocusEditor.fire();
		};

		viewEventBus.onDidScroll = (e) => this._onDidScrollChange.fire(e);
		viewEventBus.onDidLoseFocus = () => this._onDidBlurEditorText.fire();
		viewEventBus.onContextMenu = (e) => this._onContextMenu.fire(e);
		viewEventBus.onMouseDown = (e) => this._onMouseDown.fire(e);
		viewEventBus.onMouseUp = (e) => this._onMouseUp.fire(e);
		viewEventBus.onMouseDrag = (e) => this._onMouseDrag.fire(e);
		viewEventBus.onMouseDrop = (e) => this._onMouseDrop.fire(e);
		viewEventBus.onKeyUp = (e) => this._onKeyUp.fire(e);
		viewEventBus.onMouseMove = (e) => this._onMouseMove.fire(e);
		viewEventBus.onMouseLeave = (e) => this._onMouseLeave.fire(e);
		viewEventBus.onKeyDown = (e) => this._onKeyDown.fire(e);
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
	public onChange: Event<void> = this._onChange.event;

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

const squigglyStart = encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' height='3' width='6'><g fill='`);
const squigglyEnd = encodeURIComponent(`'><polygon points='5.5,0 2.5,3 1.1,3 4.1,0'/><polygon points='4,0 6,2 6,0.6 5.4,0'/><polygon points='0,2 1,3 2.4,3 0,0.6'/></g></svg>`);

function getSquigglySVGData(color: Color) {
	return squigglyStart + encodeURIComponent(color.toString()) + squigglyEnd;
}

registerThemingParticipant((theme, collector) => {
	let errorBorderColor = theme.getColor(editorErrorBorder);
	if (errorBorderColor) {
		collector.addRule(`.monaco-editor .redsquiggly { border-bottom: 4px double ${errorBorderColor}; }`);
	}
	let errorForeground = theme.getColor(editorErrorForeground);
	if (errorForeground) {
		collector.addRule(`.monaco-editor .redsquiggly { background: url("data:image/svg+xml,${getSquigglySVGData(errorForeground)}") repeat-x bottom left; }`);
	}

	let warningBorderColor = theme.getColor(editorWarningBorder);
	if (warningBorderColor) {
		collector.addRule(`.monaco-editor .greensquiggly { border-bottom: 4px double ${warningBorderColor}; }`);
	}
	let warningForeground = theme.getColor(editorWarningForeground);
	if (warningForeground) {
		collector.addRule(`.monaco-editor .greensquiggly { background: url("data:image/svg+xml;utf8,${getSquigglySVGData(warningForeground)}") repeat-x bottom left; }`);
	}
});