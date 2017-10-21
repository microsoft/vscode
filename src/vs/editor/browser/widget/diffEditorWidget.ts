/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/css!./media/diffEditor';
import * as nls from 'vs/nls';
import { RunOnceScheduler } from 'vs/base/common/async';
import { Disposable } from 'vs/base/common/lifecycle';
import * as objects from 'vs/base/common/objects';
import * as dom from 'vs/base/browser/dom';
import Severity from 'vs/base/common/severity';
import { FastDomNode, createFastDomNode } from 'vs/base/browser/fastDomNode';
import { ISashEvent, IVerticalSashLayoutProvider, Sash } from 'vs/base/browser/ui/sash/sash';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { ICodeEditorService } from 'vs/editor/common/services/codeEditorService';
import { Range, IRange } from 'vs/editor/common/core/range';
import * as editorCommon from 'vs/editor/common/editorCommon';
import { IEditorWorkerService } from 'vs/editor/common/services/editorWorkerService';
import { LineDecoration } from 'vs/editor/common/viewLayout/lineDecorations';
import { renderViewLine, RenderLineInput } from 'vs/editor/common/viewLayout/viewLineRenderer';
import * as editorBrowser from 'vs/editor/browser/editorBrowser';
import { CodeEditor } from 'vs/editor/browser/codeEditor';
import { ViewLineToken } from 'vs/editor/common/core/viewLineToken';
import { Configuration } from 'vs/editor/browser/config/configuration';
import { Position, IPosition } from 'vs/editor/common/core/position';
import { Selection, ISelection } from 'vs/editor/common/core/selection';
import { InlineDecoration } from 'vs/editor/common/viewModel/viewModel';
import { ServiceCollection } from 'vs/platform/instantiation/common/serviceCollection';
import { ColorId, MetadataConsts, FontStyle } from 'vs/editor/common/modes';
import Event, { Emitter } from 'vs/base/common/event';
import * as editorOptions from 'vs/editor/common/config/editorOptions';
import { registerThemingParticipant, IThemeService, ITheme, getThemeTypeSelector } from 'vs/platform/theme/common/themeService';
import { scrollbarShadow, diffInserted, diffRemoved, defaultInsertColor, defaultRemoveColor, diffInsertedOutline, diffRemovedOutline } from 'vs/platform/theme/common/colorRegistry';
import { Color } from 'vs/base/common/color';
import { OverviewRulerZone } from 'vs/editor/common/view/overviewZoneManager';
import { IEditorWhitespace } from 'vs/editor/common/viewLayout/whitespaceComputer';
import { ModelDecorationOptions } from 'vs/editor/common/model/textModelWithDecorations';
import { DiffReview } from 'vs/editor/browser/widget/diffReview';
import URI from 'vs/base/common/uri';
import { IMessageService } from 'vs/platform/message/common/message';
import { IStringBuilder, createStringBuilder } from 'vs/editor/common/core/stringBuilder';

interface IEditorDiffDecorations {
	decorations: editorCommon.IModelDeltaDecoration[];
	overviewZones: OverviewRulerZone[];
}

interface IEditorDiffDecorationsWithZones extends IEditorDiffDecorations {
	zones: editorBrowser.IViewZone[];
}

interface IEditorsDiffDecorationsWithZones {
	original: IEditorDiffDecorationsWithZones;
	modified: IEditorDiffDecorationsWithZones;
}

interface IEditorsZones {
	original: editorBrowser.IViewZone[];
	modified: editorBrowser.IViewZone[];
}

interface IDiffEditorWidgetStyle {
	getEditorsDiffDecorations(lineChanges: editorCommon.ILineChange[], ignoreTrimWhitespace: boolean, renderIndicators: boolean, originalWhitespaces: IEditorWhitespace[], modifiedWhitespaces: IEditorWhitespace[], originalEditor: editorBrowser.ICodeEditor, modifiedEditor: editorBrowser.ICodeEditor): IEditorsDiffDecorationsWithZones;
	setEnableSplitViewResizing(enableSplitViewResizing: boolean): void;
	applyColors(theme: ITheme): boolean;
	layout(): number;
	dispose(): void;
}

class VisualEditorState {
	private _zones: number[];
	private _zonesMap: { [zoneId: string]: boolean; };
	private _decorations: string[];

	constructor() {
		this._zones = [];
		this._zonesMap = {};
		this._decorations = [];
	}

	public getForeignViewZones(allViewZones: IEditorWhitespace[]): IEditorWhitespace[] {
		return allViewZones.filter((z) => !this._zonesMap[String(z.id)]);
	}

	public clean(editor: CodeEditor): void {
		// (1) View zones
		if (this._zones.length > 0) {
			editor.changeViewZones((viewChangeAccessor: editorBrowser.IViewZoneChangeAccessor) => {
				for (let i = 0, length = this._zones.length; i < length; i++) {
					viewChangeAccessor.removeZone(this._zones[i]);
				}
			});
		}
		this._zones = [];
		this._zonesMap = {};

		// (2) Model decorations
		if (this._decorations.length > 0) {
			editor.changeDecorations((changeAccessor: editorCommon.IModelDecorationsChangeAccessor) => {
				changeAccessor.deltaDecorations(this._decorations, []);
			});
		}
		this._decorations = [];
	}

	public apply(editor: CodeEditor, overviewRuler: editorBrowser.IOverviewRuler, newDecorations: IEditorDiffDecorationsWithZones): void {
		// view zones
		editor.changeViewZones((viewChangeAccessor: editorBrowser.IViewZoneChangeAccessor) => {
			for (let i = 0, length = this._zones.length; i < length; i++) {
				viewChangeAccessor.removeZone(this._zones[i]);
			}
			this._zones = [];
			this._zonesMap = {};
			for (let i = 0, length = newDecorations.zones.length; i < length; i++) {
				newDecorations.zones[i].suppressMouseDown = true;
				let zoneId = viewChangeAccessor.addZone(newDecorations.zones[i]);
				this._zones.push(zoneId);
				this._zonesMap[String(zoneId)] = true;
			}
		});

		// decorations
		this._decorations = editor.deltaDecorations(this._decorations, newDecorations.decorations);

		// overview ruler
		if (overviewRuler) {
			overviewRuler.setZones(newDecorations.overviewZones);
		}
	}
}

let DIFF_EDITOR_ID = 0;

export class DiffEditorWidget extends Disposable implements editorBrowser.IDiffEditor {

	private static ONE_OVERVIEW_WIDTH = 15;
	public static ENTIRE_DIFF_OVERVIEW_WIDTH = 30;
	private static UPDATE_DIFF_DECORATIONS_DELAY = 200; // ms

	private readonly _onDidDispose: Emitter<void> = this._register(new Emitter<void>());
	public readonly onDidDispose: Event<void> = this._onDidDispose.event;

	private readonly _onDidUpdateDiff: Emitter<void> = this._register(new Emitter<void>());
	public readonly onDidUpdateDiff: Event<void> = this._onDidUpdateDiff.event;

	private readonly id: number;

	private _domElement: HTMLElement;
	protected readonly _containerDomElement: HTMLElement;
	private readonly _overviewDomElement: HTMLElement;
	private readonly _overviewViewportDomElement: FastDomNode<HTMLElement>;

	private _width: number;
	private _height: number;
	private _reviewHeight: number;
	private readonly _measureDomElementToken: number;

	private originalEditor: CodeEditor;
	private _originalDomNode: HTMLElement;
	private _originalEditorState: VisualEditorState;
	private _originalOverviewRuler: editorBrowser.IOverviewRuler;

	private modifiedEditor: CodeEditor;
	private _modifiedDomNode: HTMLElement;
	private _modifiedEditorState: VisualEditorState;
	private _modifiedOverviewRuler: editorBrowser.IOverviewRuler;

	private _currentlyChangingViewZones: boolean;
	private _beginUpdateDecorationsTimeout: number;
	private _diffComputationToken: number;
	private _lineChanges: editorCommon.ILineChange[];

	private _isVisible: boolean;
	private _isHandlingScrollEvent: boolean;

	private _ignoreTrimWhitespace: boolean;
	private _originalIsEditable: boolean;

	private _renderSideBySide: boolean;
	private _renderIndicators: boolean;
	private _enableSplitViewResizing: boolean;
	private _strategy: IDiffEditorWidgetStyle;

	private _updateDecorationsRunner: RunOnceScheduler;

	private _editorWorkerService: IEditorWorkerService;
	protected _contextKeyService: IContextKeyService;
	private _codeEditorService: ICodeEditorService;
	private _themeService: IThemeService;
	private readonly _messageService: IMessageService;

	private _reviewPane: DiffReview;

	constructor(
		domElement: HTMLElement,
		options: editorOptions.IDiffEditorOptions,
		@IEditorWorkerService editorWorkerService: IEditorWorkerService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IInstantiationService instantiationService: IInstantiationService,
		@ICodeEditorService codeEditorService: ICodeEditorService,
		@IThemeService themeService: IThemeService,
		@IMessageService messageService: IMessageService
	) {
		super();

		this._editorWorkerService = editorWorkerService;
		this._codeEditorService = codeEditorService;
		this._contextKeyService = contextKeyService.createScoped(domElement);
		this._contextKeyService.createKey('isInDiffEditor', true);
		this._themeService = themeService;
		this._messageService = messageService;

		this.id = (++DIFF_EDITOR_ID);

		this._domElement = domElement;
		options = options || {};

		// renderSideBySide
		this._renderSideBySide = true;
		if (typeof options.renderSideBySide !== 'undefined') {
			this._renderSideBySide = options.renderSideBySide;
		}

		// ignoreTrimWhitespace
		this._ignoreTrimWhitespace = true;
		if (typeof options.ignoreTrimWhitespace !== 'undefined') {
			this._ignoreTrimWhitespace = options.ignoreTrimWhitespace;
		}

		// renderIndicators
		this._renderIndicators = true;
		if (typeof options.renderIndicators !== 'undefined') {
			this._renderIndicators = options.renderIndicators;
		}

		this._originalIsEditable = false;
		if (typeof options.originalEditable !== 'undefined') {
			this._originalIsEditable = Boolean(options.originalEditable);
		}

		this._updateDecorationsRunner = this._register(new RunOnceScheduler(() => this._updateDecorations(), 0));

		this._containerDomElement = document.createElement('div');
		this._containerDomElement.className = DiffEditorWidget._getClassName(this._themeService.getTheme(), this._renderSideBySide);
		this._containerDomElement.style.position = 'relative';
		this._containerDomElement.style.height = '100%';
		this._domElement.appendChild(this._containerDomElement);

		this._overviewViewportDomElement = createFastDomNode(document.createElement('div'));
		this._overviewViewportDomElement.setClassName('diffViewport');
		this._overviewViewportDomElement.setPosition('absolute');

		this._overviewDomElement = document.createElement('div');
		this._overviewDomElement.className = 'diffOverview';
		this._overviewDomElement.style.position = 'absolute';

		this._overviewDomElement.appendChild(this._overviewViewportDomElement.domNode);

		this._register(dom.addStandardDisposableListener(this._overviewDomElement, 'mousedown', (e) => {
			this.modifiedEditor.delegateVerticalScrollbarMouseDown(e);
		}));
		this._containerDomElement.appendChild(this._overviewDomElement);

		this._createLeftHandSide();
		this._createRightHandSide();

		this._beginUpdateDecorationsTimeout = -1;
		this._currentlyChangingViewZones = false;
		this._diffComputationToken = 0;

		this._originalEditorState = new VisualEditorState();
		this._modifiedEditorState = new VisualEditorState();

		this._isVisible = true;
		this._isHandlingScrollEvent = false;

		this._width = 0;
		this._height = 0;
		this._reviewHeight = 0;

		this._lineChanges = null;

		const services = new ServiceCollection();
		services.set(IContextKeyService, this._contextKeyService);

		const scopedInstantiationService = instantiationService.createChild(services);

		this._createLeftHandSideEditor(options, scopedInstantiationService);
		this._createRightHandSideEditor(options, scopedInstantiationService);

		this._reviewPane = new DiffReview(this);
		this._containerDomElement.appendChild(this._reviewPane.domNode.domNode);
		this._containerDomElement.appendChild(this._reviewPane.shadow.domNode);
		this._containerDomElement.appendChild(this._reviewPane.actionBarContainer.domNode);

		if (options.automaticLayout) {
			this._measureDomElementToken = window.setInterval(() => this._measureDomElement(false), 100);
		}

		// enableSplitViewResizing
		this._enableSplitViewResizing = true;
		if (typeof options.enableSplitViewResizing !== 'undefined') {
			this._enableSplitViewResizing = options.enableSplitViewResizing;
		}

		if (this._renderSideBySide) {
			this._setStrategy(new DiffEdtorWidgetSideBySide(this._createDataSource(), this._enableSplitViewResizing));
		} else {
			this._setStrategy(new DiffEdtorWidgetInline(this._createDataSource(), this._enableSplitViewResizing));
		}

		this._codeEditorService.addDiffEditor(this);

		this._register(themeService.onThemeChange(t => {
			if (this._strategy && this._strategy.applyColors(t)) {
				this._updateDecorationsRunner.schedule();
			}
			this._containerDomElement.className = DiffEditorWidget._getClassName(this._themeService.getTheme(), this._renderSideBySide);
		}));
	}

	public get ignoreTrimWhitespace(): boolean {
		return this._ignoreTrimWhitespace;
	}

	public get renderSideBySide(): boolean {
		return this._renderSideBySide;
	}

	public get renderIndicators(): boolean {
		return this._renderIndicators;
	}

	public hasWidgetFocus(): boolean {
		return dom.isAncestor(document.activeElement, this._domElement);
	}

	public diffReviewNext(): void {
		this._reviewPane.next();
	}

	public diffReviewPrev(): void {
		this._reviewPane.prev();
	}

	private static _getClassName(theme: ITheme, renderSideBySide: boolean): string {
		let result = 'monaco-diff-editor monaco-editor-background ';
		if (renderSideBySide) {
			result += 'side-by-side ';
		}
		result += getThemeTypeSelector(theme.type);
		return result;
	}

	private _recreateOverviewRulers(): void {
		if (this._originalOverviewRuler) {
			this._overviewDomElement.removeChild(this._originalOverviewRuler.getDomNode());
			this._originalOverviewRuler.dispose();
		}
		this._originalOverviewRuler = this.originalEditor.createOverviewRuler('original diffOverviewRuler', 4, Number.MAX_VALUE);
		this._overviewDomElement.appendChild(this._originalOverviewRuler.getDomNode());

		if (this._modifiedOverviewRuler) {
			this._overviewDomElement.removeChild(this._modifiedOverviewRuler.getDomNode());
			this._modifiedOverviewRuler.dispose();
		}
		this._modifiedOverviewRuler = this.modifiedEditor.createOverviewRuler('modified diffOverviewRuler', 4, Number.MAX_VALUE);
		this._overviewDomElement.appendChild(this._modifiedOverviewRuler.getDomNode());

		this._layoutOverviewRulers();
	}

	private _createLeftHandSide(): void {
		this._originalDomNode = document.createElement('div');
		this._originalDomNode.className = 'editor original';
		this._originalDomNode.style.position = 'absolute';
		this._originalDomNode.style.height = '100%';
		this._containerDomElement.appendChild(this._originalDomNode);
	}

	private _createRightHandSide(): void {
		this._modifiedDomNode = document.createElement('div');
		this._modifiedDomNode.className = 'editor modified';
		this._modifiedDomNode.style.position = 'absolute';
		this._modifiedDomNode.style.height = '100%';
		this._containerDomElement.appendChild(this._modifiedDomNode);
	}

	private _createLeftHandSideEditor(options: editorOptions.IDiffEditorOptions, instantiationService: IInstantiationService): void {
		this.originalEditor = this._createInnerEditor(instantiationService, this._originalDomNode, this._adjustOptionsForLeftHandSide(options, this._originalIsEditable));

		this._register(this.originalEditor.onDidScrollChange((e) => {
			if (this._isHandlingScrollEvent) {
				return;
			}
			if (!e.scrollTopChanged && !e.scrollLeftChanged && !e.scrollHeightChanged) {
				return;
			}
			this._isHandlingScrollEvent = true;
			this.modifiedEditor.setScrollPosition({
				scrollLeft: e.scrollLeft,
				scrollTop: e.scrollTop
			});
			this._isHandlingScrollEvent = false;

			this._layoutOverviewViewport();
		}));

		this._register(this.originalEditor.onDidChangeViewZones(() => {
			this._onViewZonesChanged();
		}));

		this._register(this.originalEditor.onDidChangeModelContent(() => {
			if (this._isVisible) {
				this._beginUpdateDecorationsSoon();
			}
		}));
	}

	private _createRightHandSideEditor(options: editorOptions.IDiffEditorOptions, instantiationService: IInstantiationService): void {
		this.modifiedEditor = this._createInnerEditor(instantiationService, this._modifiedDomNode, this._adjustOptionsForRightHandSide(options));

		this._register(this.modifiedEditor.onDidScrollChange((e) => {
			if (this._isHandlingScrollEvent) {
				return;
			}
			if (!e.scrollTopChanged && !e.scrollLeftChanged && !e.scrollHeightChanged) {
				return;
			}
			this._isHandlingScrollEvent = true;
			this.originalEditor.setScrollPosition({
				scrollLeft: e.scrollLeft,
				scrollTop: e.scrollTop
			});
			this._isHandlingScrollEvent = false;

			this._layoutOverviewViewport();
		}));

		this._register(this.modifiedEditor.onDidChangeViewZones(() => {
			this._onViewZonesChanged();
		}));

		this._register(this.modifiedEditor.onDidChangeConfiguration((e) => {
			if (e.fontInfo && this.modifiedEditor.getModel()) {
				this._onViewZonesChanged();
			}
		}));

		this._register(this.modifiedEditor.onDidChangeModelContent(() => {
			if (this._isVisible) {
				this._beginUpdateDecorationsSoon();
			}
		}));
	}

	protected _createInnerEditor(instantiationService: IInstantiationService, container: HTMLElement, options: editorOptions.IEditorOptions): CodeEditor {
		return instantiationService.createInstance(CodeEditor, container, options);
	}

	public destroy(): void {
		this.dispose();
	}

	public dispose(): void {
		this._codeEditorService.removeDiffEditor(this);

		window.clearInterval(this._measureDomElementToken);

		this._cleanViewZonesAndDecorations();

		this._originalOverviewRuler.dispose();
		this._modifiedOverviewRuler.dispose();

		this.originalEditor.dispose();
		this.modifiedEditor.dispose();

		this._strategy.dispose();

		this._reviewPane.dispose();

		this._onDidDispose.fire();

		super.dispose();
	}

	//------------ begin IDiffEditor methods

	public getId(): string {
		return this.getEditorType() + ':' + this.id;
	}

	public getEditorType(): string {
		return editorCommon.EditorType.IDiffEditor;
	}

	public getLineChanges(): editorCommon.ILineChange[] {
		return this._lineChanges;
	}

	public getOriginalEditor(): editorBrowser.ICodeEditor {
		return this.originalEditor;
	}

	public getModifiedEditor(): editorBrowser.ICodeEditor {
		return this.modifiedEditor;
	}

	public updateOptions(newOptions: editorOptions.IDiffEditorOptions): void {

		// Handle side by side
		let renderSideBySideChanged = false;
		if (typeof newOptions.renderSideBySide !== 'undefined') {
			if (this._renderSideBySide !== newOptions.renderSideBySide) {
				this._renderSideBySide = newOptions.renderSideBySide;
				renderSideBySideChanged = true;
			}
		}

		let beginUpdateDecorations = false;

		if (typeof newOptions.ignoreTrimWhitespace !== 'undefined') {
			if (this._ignoreTrimWhitespace !== newOptions.ignoreTrimWhitespace) {
				this._ignoreTrimWhitespace = newOptions.ignoreTrimWhitespace;
				// Begin comparing
				beginUpdateDecorations = true;
			}
		}

		if (typeof newOptions.renderIndicators !== 'undefined') {
			if (this._renderIndicators !== newOptions.renderIndicators) {
				this._renderIndicators = newOptions.renderIndicators;
				beginUpdateDecorations = true;
			}
		}

		if (beginUpdateDecorations) {
			this._beginUpdateDecorations();
		}

		if (typeof newOptions.originalEditable !== 'undefined') {
			this._originalIsEditable = Boolean(newOptions.originalEditable);
		}

		this.modifiedEditor.updateOptions(this._adjustOptionsForRightHandSide(newOptions));
		this.originalEditor.updateOptions(this._adjustOptionsForLeftHandSide(newOptions, this._originalIsEditable));

		// enableSplitViewResizing
		if (typeof newOptions.enableSplitViewResizing !== 'undefined') {
			this._enableSplitViewResizing = newOptions.enableSplitViewResizing;
		}
		this._strategy.setEnableSplitViewResizing(this._enableSplitViewResizing);

		// renderSideBySide
		if (renderSideBySideChanged) {
			if (this._renderSideBySide) {
				this._setStrategy(new DiffEdtorWidgetSideBySide(this._createDataSource(), this._enableSplitViewResizing, ));
			} else {
				this._setStrategy(new DiffEdtorWidgetInline(this._createDataSource(), this._enableSplitViewResizing));
			}
			// Update class name
			this._containerDomElement.className = DiffEditorWidget._getClassName(this._themeService.getTheme(), this._renderSideBySide);
		}
	}

	public getValue(options: { preserveBOM: boolean; lineEnding: string; } = null): string {
		return this.modifiedEditor.getValue(options);
	}

	public getModel(): editorCommon.IDiffEditorModel {
		return {
			original: this.originalEditor.getModel(),
			modified: this.modifiedEditor.getModel()
		};
	}

	public setModel(model: editorCommon.IDiffEditorModel): void {
		// Guard us against partial null model
		if (model && (!model.original || !model.modified)) {
			throw new Error(!model.original ? 'DiffEditorWidget.setModel: Original model is null' : 'DiffEditorWidget.setModel: Modified model is null');
		}

		// Remove all view zones & decorations
		this._cleanViewZonesAndDecorations();

		// Update code editor models
		this.originalEditor.setModel(model ? model.original : null);
		this.modifiedEditor.setModel(model ? model.modified : null);
		this._updateDecorationsRunner.cancel();

		if (model) {
			this.originalEditor.setScrollTop(0);
			this.modifiedEditor.setScrollTop(0);
		}

		// Disable any diff computations that will come in
		this._lineChanges = null;
		this._diffComputationToken++;

		if (model) {
			this._recreateOverviewRulers();

			// Begin comparing
			this._beginUpdateDecorations();
		} else {
			this._lineChanges = null;
		}

		this._layoutOverviewViewport();
	}

	public getDomNode(): HTMLElement {
		return this._domElement;
	}

	public getVisibleColumnFromPosition(position: IPosition): number {
		return this.modifiedEditor.getVisibleColumnFromPosition(position);
	}

	public getPosition(): Position {
		return this.modifiedEditor.getPosition();
	}

	public setPosition(position: IPosition): void {
		this.modifiedEditor.setPosition(position);
	}

	public revealLine(lineNumber: number, scrollType: editorCommon.ScrollType = editorCommon.ScrollType.Smooth): void {
		this.modifiedEditor.revealLine(lineNumber, scrollType);
	}

	public revealLineInCenter(lineNumber: number, scrollType: editorCommon.ScrollType = editorCommon.ScrollType.Smooth): void {
		this.modifiedEditor.revealLineInCenter(lineNumber, scrollType);
	}

	public revealLineInCenterIfOutsideViewport(lineNumber: number, scrollType: editorCommon.ScrollType = editorCommon.ScrollType.Smooth): void {
		this.modifiedEditor.revealLineInCenterIfOutsideViewport(lineNumber, scrollType);
	}

	public revealPosition(position: IPosition, scrollType: editorCommon.ScrollType = editorCommon.ScrollType.Smooth): void {
		this.modifiedEditor.revealPosition(position, scrollType);
	}

	public revealPositionInCenter(position: IPosition, scrollType: editorCommon.ScrollType = editorCommon.ScrollType.Smooth): void {
		this.modifiedEditor.revealPositionInCenter(position, scrollType);
	}

	public revealPositionInCenterIfOutsideViewport(position: IPosition, scrollType: editorCommon.ScrollType = editorCommon.ScrollType.Smooth): void {
		this.modifiedEditor.revealPositionInCenterIfOutsideViewport(position, scrollType);
	}

	public getSelection(): Selection {
		return this.modifiedEditor.getSelection();
	}

	public getSelections(): Selection[] {
		return this.modifiedEditor.getSelections();
	}

	public setSelection(range: IRange): void;
	public setSelection(editorRange: Range): void;
	public setSelection(selection: ISelection): void;
	public setSelection(editorSelection: Selection): void;
	public setSelection(something: any): void {
		this.modifiedEditor.setSelection(something);
	}

	public setSelections(ranges: ISelection[]): void {
		this.modifiedEditor.setSelections(ranges);
	}

	public revealLines(startLineNumber: number, endLineNumber: number, scrollType: editorCommon.ScrollType = editorCommon.ScrollType.Smooth): void {
		this.modifiedEditor.revealLines(startLineNumber, endLineNumber, scrollType);
	}

	public revealLinesInCenter(startLineNumber: number, endLineNumber: number, scrollType: editorCommon.ScrollType = editorCommon.ScrollType.Smooth): void {
		this.modifiedEditor.revealLinesInCenter(startLineNumber, endLineNumber, scrollType);
	}

	public revealLinesInCenterIfOutsideViewport(startLineNumber: number, endLineNumber: number, scrollType: editorCommon.ScrollType = editorCommon.ScrollType.Smooth): void {
		this.modifiedEditor.revealLinesInCenterIfOutsideViewport(startLineNumber, endLineNumber, scrollType);
	}

	public revealRange(range: IRange, scrollType: editorCommon.ScrollType = editorCommon.ScrollType.Smooth, revealVerticalInCenter: boolean = false, revealHorizontal: boolean = true): void {
		this.modifiedEditor.revealRange(range, scrollType, revealVerticalInCenter, revealHorizontal);
	}

	public revealRangeInCenter(range: IRange, scrollType: editorCommon.ScrollType = editorCommon.ScrollType.Smooth): void {
		this.modifiedEditor.revealRangeInCenter(range, scrollType);
	}

	public revealRangeInCenterIfOutsideViewport(range: IRange, scrollType: editorCommon.ScrollType = editorCommon.ScrollType.Smooth): void {
		this.modifiedEditor.revealRangeInCenterIfOutsideViewport(range, scrollType);
	}

	public revealRangeAtTop(range: IRange, scrollType: editorCommon.ScrollType = editorCommon.ScrollType.Smooth): void {
		this.modifiedEditor.revealRangeAtTop(range, scrollType);
	}

	public getActions(): editorCommon.IEditorAction[] {
		return this.modifiedEditor.getActions();
	}

	public getSupportedActions(): editorCommon.IEditorAction[] {
		return this.modifiedEditor.getSupportedActions();
	}

	public getAction(id: string): editorCommon.IEditorAction {
		return this.modifiedEditor.getAction(id);
	}

	public saveViewState(): editorCommon.IDiffEditorViewState {
		let originalViewState = this.originalEditor.saveViewState();
		let modifiedViewState = this.modifiedEditor.saveViewState();
		return {
			original: originalViewState,
			modified: modifiedViewState
		};
	}

	public restoreViewState(s: editorCommon.IDiffEditorViewState): void {
		if (s.original && s.original) {
			let diffEditorState = <editorCommon.IDiffEditorViewState>s;
			this.originalEditor.restoreViewState(diffEditorState.original);
			this.modifiedEditor.restoreViewState(diffEditorState.modified);
		}
	}

	public layout(dimension?: editorCommon.IDimension): void {
		this._measureDomElement(false, dimension);
	}

	public focus(): void {
		this.modifiedEditor.focus();
	}

	public isFocused(): boolean {
		return this.originalEditor.isFocused() || this.modifiedEditor.isFocused();
	}

	public onVisible(): void {
		this._isVisible = true;
		this.originalEditor.onVisible();
		this.modifiedEditor.onVisible();
		// Begin comparing
		this._beginUpdateDecorations();
	}

	public onHide(): void {
		this._isVisible = false;
		this.originalEditor.onHide();
		this.modifiedEditor.onHide();
		// Remove all view zones & decorations
		this._cleanViewZonesAndDecorations();
	}

	public trigger(source: string, handlerId: string, payload: any): void {
		this.modifiedEditor.trigger(source, handlerId, payload);
	}

	public changeDecorations(callback: (changeAccessor: editorCommon.IModelDecorationsChangeAccessor) => any): any {
		return this.modifiedEditor.changeDecorations(callback);
	}

	//------------ end IDiffEditor methods



	//------------ begin layouting methods

	private _measureDomElement(forceDoLayoutCall: boolean, dimensions?: editorCommon.IDimension): void {
		dimensions = dimensions || {
			width: this._containerDomElement.clientWidth,
			height: this._containerDomElement.clientHeight
		};

		if (dimensions.width <= 0) {
			this._width = 0;
			this._height = 0;
			this._reviewHeight = 0;
			return;
		}

		if (!forceDoLayoutCall && dimensions.width === this._width && dimensions.height === this._height) {
			// Nothing has changed
			return;
		}

		this._width = dimensions.width;
		this._height = dimensions.height;
		this._reviewHeight = this._reviewPane.isVisible() ? this._height : 0;

		this._doLayout();
	}

	private _layoutOverviewRulers(): void {
		let freeSpace = DiffEditorWidget.ENTIRE_DIFF_OVERVIEW_WIDTH - 2 * DiffEditorWidget.ONE_OVERVIEW_WIDTH;
		let layoutInfo = this.modifiedEditor.getLayoutInfo();
		if (layoutInfo) {
			this._originalOverviewRuler.setLayout({
				top: 0,
				width: DiffEditorWidget.ONE_OVERVIEW_WIDTH,
				right: freeSpace + DiffEditorWidget.ONE_OVERVIEW_WIDTH,
				height: (this._height - this._reviewHeight)
			});
			this._modifiedOverviewRuler.setLayout({
				top: 0,
				right: 0,
				width: DiffEditorWidget.ONE_OVERVIEW_WIDTH,
				height: (this._height - this._reviewHeight)
			});
		}
	}

	//------------ end layouting methods

	private _onViewZonesChanged(): void {
		if (this._currentlyChangingViewZones) {
			return;
		}
		this._updateDecorationsRunner.schedule();
	}

	private _beginUpdateDecorationsSoon(): void {
		// Clear previous timeout if necessary
		if (this._beginUpdateDecorationsTimeout !== -1) {
			window.clearTimeout(this._beginUpdateDecorationsTimeout);
			this._beginUpdateDecorationsTimeout = -1;
		}
		this._beginUpdateDecorationsTimeout = window.setTimeout(() => this._beginUpdateDecorations(), DiffEditorWidget.UPDATE_DIFF_DECORATIONS_DELAY);
	}

	private _lastOriginalWarning: URI = null;
	private _lastModifiedWarning: URI = null;

	private static _equals(a: URI, b: URI): boolean {
		if (!a && !b) {
			return true;
		}
		if (!a || !b) {
			return false;
		}
		return (a.toString() === b.toString());
	}

	private _beginUpdateDecorations(): void {
		this._beginUpdateDecorationsTimeout = -1;
		const currentOriginalModel = this.originalEditor.getModel();
		const currentModifiedModel = this.modifiedEditor.getModel();
		if (!currentOriginalModel || !currentModifiedModel) {
			return;
		}

		// Prevent old diff requests to come if a new request has been initiated
		// The best method would be to call cancel on the Promise, but this is not
		// yet supported, so using tokens for now.
		this._diffComputationToken++;
		let currentToken = this._diffComputationToken;

		if (!this._editorWorkerService.canComputeDiff(currentOriginalModel.uri, currentModifiedModel.uri)) {
			if (
				!DiffEditorWidget._equals(currentOriginalModel.uri, this._lastOriginalWarning)
				|| !DiffEditorWidget._equals(currentModifiedModel.uri, this._lastModifiedWarning)
			) {
				this._lastOriginalWarning = currentOriginalModel.uri;
				this._lastModifiedWarning = currentModifiedModel.uri;
				this._messageService.show(Severity.Warning, nls.localize("diff.tooLarge", "Cannot compare files because one file is too large."));
			}
			return;
		}

		this._editorWorkerService.computeDiff(currentOriginalModel.uri, currentModifiedModel.uri, this._ignoreTrimWhitespace).then((result) => {
			if (currentToken === this._diffComputationToken
				&& currentOriginalModel === this.originalEditor.getModel()
				&& currentModifiedModel === this.modifiedEditor.getModel()
			) {
				this._lineChanges = result;
				this._updateDecorationsRunner.schedule();
				this._onDidUpdateDiff.fire();
			}
		}, (error) => {
			if (currentToken === this._diffComputationToken
				&& currentOriginalModel === this.originalEditor.getModel()
				&& currentModifiedModel === this.modifiedEditor.getModel()
			) {
				this._lineChanges = null;
				this._updateDecorationsRunner.schedule();
			}
		});
	}

	private _cleanViewZonesAndDecorations(): void {
		this._originalEditorState.clean(this.originalEditor);
		this._modifiedEditorState.clean(this.modifiedEditor);
	}

	private _updateDecorations(): void {
		if (!this.originalEditor.getModel() || !this.modifiedEditor.getModel()) {
			return;
		}
		let lineChanges = this._lineChanges || [];

		let foreignOriginal = this._originalEditorState.getForeignViewZones(this.originalEditor.getWhitespaces());
		let foreignModified = this._modifiedEditorState.getForeignViewZones(this.modifiedEditor.getWhitespaces());

		let diffDecorations = this._strategy.getEditorsDiffDecorations(lineChanges, this._ignoreTrimWhitespace, this._renderIndicators, foreignOriginal, foreignModified, this.originalEditor, this.modifiedEditor);

		try {
			this._currentlyChangingViewZones = true;
			this._originalEditorState.apply(this.originalEditor, this._originalOverviewRuler, diffDecorations.original);
			this._modifiedEditorState.apply(this.modifiedEditor, this._modifiedOverviewRuler, diffDecorations.modified);
		} finally {
			this._currentlyChangingViewZones = false;
		}
	}

	private _adjustOptionsForSubEditor(options: editorOptions.IDiffEditorOptions): editorOptions.IDiffEditorOptions {
		let clonedOptions: editorOptions.IDiffEditorOptions = objects.clone(options || {});
		clonedOptions.inDiffEditor = true;
		clonedOptions.wordWrap = 'off';
		clonedOptions.wordWrapMinified = false;
		clonedOptions.automaticLayout = false;
		clonedOptions.scrollbar = clonedOptions.scrollbar || {};
		clonedOptions.scrollbar.vertical = 'visible';
		clonedOptions.folding = false;
		clonedOptions.codeLens = false;
		clonedOptions.fixedOverflowWidgets = true;
		clonedOptions.lineDecorationsWidth = '2ch';
		if (!clonedOptions.minimap) {
			clonedOptions.minimap = {};
		}
		clonedOptions.minimap.enabled = false;
		return clonedOptions;
	}

	private _adjustOptionsForLeftHandSide(options: editorOptions.IDiffEditorOptions, isEditable: boolean): editorOptions.IEditorOptions {
		let result = this._adjustOptionsForSubEditor(options);
		result.readOnly = !isEditable;
		result.overviewRulerLanes = 1;
		result.extraEditorClassName = 'original-in-monaco-diff-editor';
		return result;
	}

	private _adjustOptionsForRightHandSide(options: editorOptions.IDiffEditorOptions): editorOptions.IEditorOptions {
		let result = this._adjustOptionsForSubEditor(options);
		result.revealHorizontalRightPadding = editorOptions.EDITOR_DEFAULTS.viewInfo.revealHorizontalRightPadding + DiffEditorWidget.ENTIRE_DIFF_OVERVIEW_WIDTH;
		result.scrollbar.verticalHasArrows = false;
		result.extraEditorClassName = 'modified-in-monaco-diff-editor';
		return result;
	}

	public doLayout(): void {
		this._measureDomElement(true);
	}

	private _doLayout(): void {
		let splitPoint = this._strategy.layout();

		this._originalDomNode.style.width = splitPoint + 'px';
		this._originalDomNode.style.left = '0px';

		this._modifiedDomNode.style.width = (this._width - splitPoint) + 'px';
		this._modifiedDomNode.style.left = splitPoint + 'px';

		this._overviewDomElement.style.top = '0px';
		this._overviewDomElement.style.height = (this._height - this._reviewHeight) + 'px';
		this._overviewDomElement.style.width = DiffEditorWidget.ENTIRE_DIFF_OVERVIEW_WIDTH + 'px';
		this._overviewDomElement.style.left = (this._width - DiffEditorWidget.ENTIRE_DIFF_OVERVIEW_WIDTH) + 'px';
		this._overviewViewportDomElement.setWidth(DiffEditorWidget.ENTIRE_DIFF_OVERVIEW_WIDTH);
		this._overviewViewportDomElement.setHeight(30);

		this.originalEditor.layout({ width: splitPoint, height: (this._height - this._reviewHeight) });
		this.modifiedEditor.layout({ width: this._width - splitPoint - DiffEditorWidget.ENTIRE_DIFF_OVERVIEW_WIDTH, height: (this._height - this._reviewHeight) });

		if (this._originalOverviewRuler || this._modifiedOverviewRuler) {
			this._layoutOverviewRulers();
		}

		this._reviewPane.layout(this._height - this._reviewHeight, this._width, this._reviewHeight);

		this._layoutOverviewViewport();
	}

	private _layoutOverviewViewport(): void {
		let layout = this._computeOverviewViewport();
		if (!layout) {
			this._overviewViewportDomElement.setTop(0);
			this._overviewViewportDomElement.setHeight(0);
		} else {
			this._overviewViewportDomElement.setTop(layout.top);
			this._overviewViewportDomElement.setHeight(layout.height);
		}
	}

	private _computeOverviewViewport(): { height: number; top: number; } {
		let layoutInfo = this.modifiedEditor.getLayoutInfo();
		if (!layoutInfo) {
			return null;
		}

		let scrollTop = this.modifiedEditor.getScrollTop();
		let scrollHeight = this.modifiedEditor.getScrollHeight();

		let computedAvailableSize = Math.max(0, layoutInfo.contentHeight);
		let computedRepresentableSize = Math.max(0, computedAvailableSize - 2 * 0);
		let computedRatio = scrollHeight > 0 ? (computedRepresentableSize / scrollHeight) : 0;

		let computedSliderSize = Math.max(0, Math.floor(layoutInfo.contentHeight * computedRatio));
		let computedSliderPosition = Math.floor(scrollTop * computedRatio);

		return {
			height: computedSliderSize,
			top: computedSliderPosition
		};
	}

	private _createDataSource(): IDataSource {
		return {
			getWidth: () => {
				return this._width;
			},

			getHeight: () => {
				return (this._height - this._reviewHeight);
			},

			getContainerDomNode: () => {
				return this._containerDomElement;
			},

			relayoutEditors: () => {
				this._doLayout();
			},

			getOriginalEditor: () => {
				return this.originalEditor;
			},

			getModifiedEditor: () => {
				return this.modifiedEditor;
			}
		};
	}

	private _setStrategy(newStrategy: IDiffEditorWidgetStyle): void {
		if (this._strategy) {
			this._strategy.dispose();
		}

		this._strategy = newStrategy;
		newStrategy.applyColors(this._themeService.getTheme());

		if (this._lineChanges) {
			this._updateDecorations();
		}

		// Just do a layout, the strategy might need it
		this._measureDomElement(true);
	}

	private _getLineChangeAtOrBeforeLineNumber(lineNumber: number, startLineNumberExtractor: (lineChange: editorCommon.ILineChange) => number): editorCommon.ILineChange {
		if (this._lineChanges.length === 0 || lineNumber < startLineNumberExtractor(this._lineChanges[0])) {
			// There are no changes or `lineNumber` is before the first change
			return null;
		}

		let min = 0, max = this._lineChanges.length - 1;
		while (min < max) {
			let mid = Math.floor((min + max) / 2);
			let midStart = startLineNumberExtractor(this._lineChanges[mid]);
			let midEnd = (mid + 1 <= max ? startLineNumberExtractor(this._lineChanges[mid + 1]) : Number.MAX_VALUE);

			if (lineNumber < midStart) {
				max = mid - 1;
			} else if (lineNumber >= midEnd) {
				min = mid + 1;
			} else {
				// HIT!
				min = mid;
				max = mid;
			}
		}
		return this._lineChanges[min];
	}

	private _getEquivalentLineForOriginalLineNumber(lineNumber: number): number {
		let lineChange = this._getLineChangeAtOrBeforeLineNumber(lineNumber, (lineChange) => lineChange.originalStartLineNumber);

		if (!lineChange) {
			return lineNumber;
		}

		let originalEquivalentLineNumber = lineChange.originalStartLineNumber + (lineChange.originalEndLineNumber > 0 ? -1 : 0);
		let modifiedEquivalentLineNumber = lineChange.modifiedStartLineNumber + (lineChange.modifiedEndLineNumber > 0 ? -1 : 0);
		let lineChangeOriginalLength = (lineChange.originalEndLineNumber > 0 ? (lineChange.originalEndLineNumber - lineChange.originalStartLineNumber + 1) : 0);
		let lineChangeModifiedLength = (lineChange.modifiedEndLineNumber > 0 ? (lineChange.modifiedEndLineNumber - lineChange.modifiedStartLineNumber + 1) : 0);


		let delta = lineNumber - originalEquivalentLineNumber;

		if (delta <= lineChangeOriginalLength) {
			return modifiedEquivalentLineNumber + Math.min(delta, lineChangeModifiedLength);
		}

		return modifiedEquivalentLineNumber + lineChangeModifiedLength - lineChangeOriginalLength + delta;
	}

	private _getEquivalentLineForModifiedLineNumber(lineNumber: number): number {
		let lineChange = this._getLineChangeAtOrBeforeLineNumber(lineNumber, (lineChange) => lineChange.modifiedStartLineNumber);

		if (!lineChange) {
			return lineNumber;
		}

		let originalEquivalentLineNumber = lineChange.originalStartLineNumber + (lineChange.originalEndLineNumber > 0 ? -1 : 0);
		let modifiedEquivalentLineNumber = lineChange.modifiedStartLineNumber + (lineChange.modifiedEndLineNumber > 0 ? -1 : 0);
		let lineChangeOriginalLength = (lineChange.originalEndLineNumber > 0 ? (lineChange.originalEndLineNumber - lineChange.originalStartLineNumber + 1) : 0);
		let lineChangeModifiedLength = (lineChange.modifiedEndLineNumber > 0 ? (lineChange.modifiedEndLineNumber - lineChange.modifiedStartLineNumber + 1) : 0);


		let delta = lineNumber - modifiedEquivalentLineNumber;

		if (delta <= lineChangeModifiedLength) {
			return originalEquivalentLineNumber + Math.min(delta, lineChangeOriginalLength);
		}

		return originalEquivalentLineNumber + lineChangeOriginalLength - lineChangeModifiedLength + delta;
	}

	public getDiffLineInformationForOriginal(lineNumber: number): editorCommon.IDiffLineInformation {
		if (!this._lineChanges) {
			// Cannot answer that which I don't know
			return null;
		}
		return {
			equivalentLineNumber: this._getEquivalentLineForOriginalLineNumber(lineNumber)
		};
	}

	public getDiffLineInformationForModified(lineNumber: number): editorCommon.IDiffLineInformation {
		if (!this._lineChanges) {
			// Cannot answer that which I don't know
			return null;
		}
		return {
			equivalentLineNumber: this._getEquivalentLineForModifiedLineNumber(lineNumber)
		};
	}
}

interface IDataSource {
	getWidth(): number;
	getHeight(): number;
	getContainerDomNode(): HTMLElement;
	relayoutEditors(): void;

	getOriginalEditor(): editorBrowser.ICodeEditor;
	getModifiedEditor(): editorBrowser.ICodeEditor;
}

class DiffEditorWidgetStyle extends Disposable {

	_dataSource: IDataSource;
	_insertColor: Color;
	_removeColor: Color;

	constructor(dataSource: IDataSource) {
		super();
		this._dataSource = dataSource;
	}

	public applyColors(theme: ITheme): boolean {
		let newInsertColor = (theme.getColor(diffInserted) || defaultInsertColor).transparent(2);
		let newRemoveColor = (theme.getColor(diffRemoved) || defaultRemoveColor).transparent(2);
		let hasChanges = !newInsertColor.equals(this._insertColor) || !newRemoveColor.equals(this._removeColor);
		this._insertColor = newInsertColor;
		this._removeColor = newRemoveColor;
		return hasChanges;
	}

	public getEditorsDiffDecorations(lineChanges: editorCommon.ILineChange[], ignoreTrimWhitespace: boolean, renderIndicators: boolean, originalWhitespaces: IEditorWhitespace[], modifiedWhitespaces: IEditorWhitespace[], originalEditor: editorBrowser.ICodeEditor, modifiedEditor: editorBrowser.ICodeEditor): IEditorsDiffDecorationsWithZones {
		// Get view zones
		modifiedWhitespaces = modifiedWhitespaces.sort((a, b) => {
			return a.afterLineNumber - b.afterLineNumber;
		});
		originalWhitespaces = originalWhitespaces.sort((a, b) => {
			return a.afterLineNumber - b.afterLineNumber;
		});
		let zones = this._getViewZones(lineChanges, originalWhitespaces, modifiedWhitespaces, originalEditor, modifiedEditor, renderIndicators);

		// Get decorations & overview ruler zones
		let originalDecorations = this._getOriginalEditorDecorations(lineChanges, ignoreTrimWhitespace, renderIndicators, originalEditor, modifiedEditor);
		let modifiedDecorations = this._getModifiedEditorDecorations(lineChanges, ignoreTrimWhitespace, renderIndicators, originalEditor, modifiedEditor);

		return {
			original: {
				decorations: originalDecorations.decorations,
				overviewZones: originalDecorations.overviewZones,
				zones: zones.original
			},
			modified: {
				decorations: modifiedDecorations.decorations,
				overviewZones: modifiedDecorations.overviewZones,
				zones: zones.modified
			}
		};
	}

	_getViewZones(lineChanges: editorCommon.ILineChange[], originalForeignVZ: IEditorWhitespace[], modifiedForeignVZ: IEditorWhitespace[], originalEditor: editorBrowser.ICodeEditor, modifiedEditor: editorBrowser.ICodeEditor, renderIndicators: boolean): IEditorsZones {
		return null;
	}

	_getOriginalEditorDecorations(lineChanges: editorCommon.ILineChange[], ignoreTrimWhitespace: boolean, renderIndicators: boolean, originalEditor: editorBrowser.ICodeEditor, modifiedEditor: editorBrowser.ICodeEditor): IEditorDiffDecorations {
		return null;
	}

	_getModifiedEditorDecorations(lineChanges: editorCommon.ILineChange[], ignoreTrimWhitespace: boolean, renderIndicators: boolean, originalEditor: editorBrowser.ICodeEditor, modifiedEditor: editorBrowser.ICodeEditor): IEditorDiffDecorations {
		return null;
	}
}

interface IMyViewZone extends editorBrowser.IViewZone {
	shouldNotShrink?: boolean;
}

class ForeignViewZonesIterator {

	private _index: number;
	private _source: IEditorWhitespace[];
	public current: IEditorWhitespace;

	constructor(source: IEditorWhitespace[]) {
		this._source = source;
		this._index = -1;
		this.advance();
	}

	public advance(): void {
		this._index++;
		if (this._index < this._source.length) {
			this.current = this._source[this._index];
		} else {
			this.current = null;
		}
	}
}

abstract class ViewZonesComputer {

	private lineChanges: editorCommon.ILineChange[];
	private originalForeignVZ: IEditorWhitespace[];
	private modifiedForeignVZ: IEditorWhitespace[];

	constructor(lineChanges: editorCommon.ILineChange[], originalForeignVZ: IEditorWhitespace[], modifiedForeignVZ: IEditorWhitespace[]) {
		this.lineChanges = lineChanges;
		this.originalForeignVZ = originalForeignVZ;
		this.modifiedForeignVZ = modifiedForeignVZ;
	}

	public getViewZones(): IEditorsZones {
		let result: IEditorsZones = {
			original: [],
			modified: []
		};

		let lineChangeModifiedLength: number = 0;
		let lineChangeOriginalLength: number = 0;
		let originalEquivalentLineNumber: number = 0;
		let modifiedEquivalentLineNumber: number = 0;
		let originalEndEquivalentLineNumber: number = 0;
		let modifiedEndEquivalentLineNumber: number = 0;

		let sortMyViewZones = (a: IMyViewZone, b: IMyViewZone) => {
			return a.afterLineNumber - b.afterLineNumber;
		};

		let addAndCombineIfPossible = (destination: editorBrowser.IViewZone[], item: IMyViewZone) => {
			if (item.domNode === null && destination.length > 0) {
				let lastItem = destination[destination.length - 1];
				if (lastItem.afterLineNumber === item.afterLineNumber && lastItem.domNode === null) {
					lastItem.heightInLines += item.heightInLines;
					return;
				}
			}
			destination.push(item);
		};

		let modifiedForeignVZ = new ForeignViewZonesIterator(this.modifiedForeignVZ);
		let originalForeignVZ = new ForeignViewZonesIterator(this.originalForeignVZ);

		// In order to include foreign view zones after the last line change, the for loop will iterate once more after the end of the `lineChanges` array
		for (let i = 0, length = this.lineChanges.length; i <= length; i++) {
			let lineChange = (i < length ? this.lineChanges[i] : null);

			if (lineChange !== null) {
				originalEquivalentLineNumber = lineChange.originalStartLineNumber + (lineChange.originalEndLineNumber > 0 ? -1 : 0);
				modifiedEquivalentLineNumber = lineChange.modifiedStartLineNumber + (lineChange.modifiedEndLineNumber > 0 ? -1 : 0);
				lineChangeOriginalLength = (lineChange.originalEndLineNumber > 0 ? (lineChange.originalEndLineNumber - lineChange.originalStartLineNumber + 1) : 0);
				lineChangeModifiedLength = (lineChange.modifiedEndLineNumber > 0 ? (lineChange.modifiedEndLineNumber - lineChange.modifiedStartLineNumber + 1) : 0);
				originalEndEquivalentLineNumber = Math.max(lineChange.originalStartLineNumber, lineChange.originalEndLineNumber);
				modifiedEndEquivalentLineNumber = Math.max(lineChange.modifiedStartLineNumber, lineChange.modifiedEndLineNumber);
			} else {
				// Increase to very large value to get the producing tests of foreign view zones running
				originalEquivalentLineNumber += 10000000 + lineChangeOriginalLength;
				modifiedEquivalentLineNumber += 10000000 + lineChangeModifiedLength;
				originalEndEquivalentLineNumber = originalEquivalentLineNumber;
				modifiedEndEquivalentLineNumber = modifiedEquivalentLineNumber;
			}

			// Each step produces view zones, and after producing them, we try to cancel them out, to avoid empty-empty view zone cases
			let stepOriginal: IMyViewZone[] = [];
			let stepModified: IMyViewZone[] = [];

			// ---------------------------- PRODUCE VIEW ZONES

			// [PRODUCE] View zone(s) in original-side due to foreign view zone(s) in modified-side
			while (modifiedForeignVZ.current && modifiedForeignVZ.current.afterLineNumber <= modifiedEndEquivalentLineNumber) {
				let viewZoneLineNumber: number;
				if (modifiedForeignVZ.current.afterLineNumber <= modifiedEquivalentLineNumber) {
					viewZoneLineNumber = originalEquivalentLineNumber - modifiedEquivalentLineNumber + modifiedForeignVZ.current.afterLineNumber;
				} else {
					viewZoneLineNumber = originalEndEquivalentLineNumber;
				}
				stepOriginal.push({
					afterLineNumber: viewZoneLineNumber,
					heightInLines: modifiedForeignVZ.current.heightInLines,
					domNode: null
				});
				modifiedForeignVZ.advance();
			}

			// [PRODUCE] View zone(s) in modified-side due to foreign view zone(s) in original-side
			while (originalForeignVZ.current && originalForeignVZ.current.afterLineNumber <= originalEndEquivalentLineNumber) {
				let viewZoneLineNumber: number;
				if (originalForeignVZ.current.afterLineNumber <= originalEquivalentLineNumber) {
					viewZoneLineNumber = modifiedEquivalentLineNumber - originalEquivalentLineNumber + originalForeignVZ.current.afterLineNumber;
				} else {
					viewZoneLineNumber = modifiedEndEquivalentLineNumber;
				}
				stepModified.push({
					afterLineNumber: viewZoneLineNumber,
					heightInLines: originalForeignVZ.current.heightInLines,
					domNode: null
				});
				originalForeignVZ.advance();
			}

			if (lineChange !== null && isChangeOrInsert(lineChange)) {
				let r = this._produceOriginalFromDiff(lineChange, lineChangeOriginalLength, lineChangeModifiedLength);
				if (r) {
					stepOriginal.push(r);
				}
			}

			if (lineChange !== null && isChangeOrDelete(lineChange)) {
				let r = this._produceModifiedFromDiff(lineChange, lineChangeOriginalLength, lineChangeModifiedLength);
				if (r) {
					stepModified.push(r);
				}
			}

			// ---------------------------- END PRODUCE VIEW ZONES


			// ---------------------------- EMIT MINIMAL VIEW ZONES

			// [CANCEL & EMIT] Try to cancel view zones out
			let stepOriginalIndex = 0;
			let stepModifiedIndex = 0;

			stepOriginal = stepOriginal.sort(sortMyViewZones);
			stepModified = stepModified.sort(sortMyViewZones);

			while (stepOriginalIndex < stepOriginal.length && stepModifiedIndex < stepModified.length) {
				let original = stepOriginal[stepOriginalIndex];
				let modified = stepModified[stepModifiedIndex];

				let originalDelta = original.afterLineNumber - originalEquivalentLineNumber;
				let modifiedDelta = modified.afterLineNumber - modifiedEquivalentLineNumber;

				if (originalDelta < modifiedDelta) {
					addAndCombineIfPossible(result.original, original);
					stepOriginalIndex++;
				} else if (modifiedDelta < originalDelta) {
					addAndCombineIfPossible(result.modified, modified);
					stepModifiedIndex++;
				} else if (original.shouldNotShrink) {
					addAndCombineIfPossible(result.original, original);
					stepOriginalIndex++;
				} else if (modified.shouldNotShrink) {
					addAndCombineIfPossible(result.modified, modified);
					stepModifiedIndex++;
				} else {
					if (original.heightInLines >= modified.heightInLines) {
						// modified view zone gets removed
						original.heightInLines -= modified.heightInLines;
						stepModifiedIndex++;
					} else {
						// original view zone gets removed
						modified.heightInLines -= original.heightInLines;
						stepOriginalIndex++;
					}
				}
			}

			// [EMIT] Remaining original view zones
			while (stepOriginalIndex < stepOriginal.length) {
				addAndCombineIfPossible(result.original, stepOriginal[stepOriginalIndex]);
				stepOriginalIndex++;
			}

			// [EMIT] Remaining modified view zones
			while (stepModifiedIndex < stepModified.length) {
				addAndCombineIfPossible(result.modified, stepModified[stepModifiedIndex]);
				stepModifiedIndex++;
			}

			// ---------------------------- END EMIT MINIMAL VIEW ZONES
		}

		let ensureDomNode = (z: IMyViewZone) => {
			if (!z.domNode) {
				z.domNode = createFakeLinesDiv();
			}
		};

		result.original.forEach(ensureDomNode);
		result.modified.forEach(ensureDomNode);

		return result;
	}

	protected abstract _produceOriginalFromDiff(lineChange: editorCommon.ILineChange, lineChangeOriginalLength: number, lineChangeModifiedLength: number): IMyViewZone;

	protected abstract _produceModifiedFromDiff(lineChange: editorCommon.ILineChange, lineChangeOriginalLength: number, lineChangeModifiedLength: number): IMyViewZone;
}

function createDecoration(startLineNumber: number, startColumn: number, endLineNumber: number, endColumn: number, options: ModelDecorationOptions) {
	return {
		range: new Range(startLineNumber, startColumn, endLineNumber, endColumn),
		options: options
	};
}

const DECORATIONS = {

	charDelete: ModelDecorationOptions.register({
		className: 'char-delete'
	}),
	charDeleteWholeLine: ModelDecorationOptions.register({
		className: 'char-delete',
		isWholeLine: true
	}),

	charInsert: ModelDecorationOptions.register({
		className: 'char-insert'
	}),
	charInsertWholeLine: ModelDecorationOptions.register({
		className: 'char-insert',
		isWholeLine: true
	}),

	lineInsert: ModelDecorationOptions.register({
		className: 'line-insert',
		marginClassName: 'line-insert',
		isWholeLine: true
	}),
	lineInsertWithSign: ModelDecorationOptions.register({
		className: 'line-insert',
		linesDecorationsClassName: 'insert-sign',
		marginClassName: 'line-insert',
		isWholeLine: true
	}),

	lineDelete: ModelDecorationOptions.register({
		className: 'line-delete',
		marginClassName: 'line-delete',
		isWholeLine: true
	}),
	lineDeleteWithSign: ModelDecorationOptions.register({
		className: 'line-delete',
		linesDecorationsClassName: 'delete-sign',
		marginClassName: 'line-delete',
		isWholeLine: true

	}),
	lineDeleteMargin: ModelDecorationOptions.register({
		marginClassName: 'line-delete',
	})

};

class DiffEdtorWidgetSideBySide extends DiffEditorWidgetStyle implements IDiffEditorWidgetStyle, IVerticalSashLayoutProvider {

	static MINIMUM_EDITOR_WIDTH = 100;

	private _disableSash: boolean;
	private _sash: Sash;
	private _sashRatio: number;
	private _sashPosition: number;
	private _startSashPosition: number;

	constructor(dataSource: IDataSource, enableSplitViewResizing: boolean) {
		super(dataSource);

		this._disableSash = (enableSplitViewResizing === false);
		this._sashRatio = null;
		this._sashPosition = null;
		this._sash = this._register(new Sash(this._dataSource.getContainerDomNode(), this));

		if (this._disableSash) {
			this._sash.disable();
		}

		this._sash.addListener('start', () => this.onSashDragStart());
		this._sash.addListener('change', (e: ISashEvent) => this.onSashDrag(e));
		this._sash.addListener('end', () => this.onSashDragEnd());
		this._sash.addListener('reset', () => this.onSashReset());
	}

	public dispose(): void {
		super.dispose();
	}

	public setEnableSplitViewResizing(enableSplitViewResizing: boolean): void {
		let newDisableSash = (enableSplitViewResizing === false);
		if (this._disableSash !== newDisableSash) {
			this._disableSash = newDisableSash;

			if (this._disableSash) {
				this._sash.disable();
			} else {
				this._sash.enable();
			}
		}
	}

	public layout(sashRatio: number = this._sashRatio): number {
		let w = this._dataSource.getWidth();
		let contentWidth = w - DiffEditorWidget.ENTIRE_DIFF_OVERVIEW_WIDTH;

		let sashPosition = Math.floor((sashRatio || 0.5) * contentWidth);
		let midPoint = Math.floor(0.5 * contentWidth);

		sashPosition = this._disableSash ? midPoint : sashPosition || midPoint;

		if (contentWidth > DiffEdtorWidgetSideBySide.MINIMUM_EDITOR_WIDTH * 2) {
			if (sashPosition < DiffEdtorWidgetSideBySide.MINIMUM_EDITOR_WIDTH) {
				sashPosition = DiffEdtorWidgetSideBySide.MINIMUM_EDITOR_WIDTH;
			}

			if (sashPosition > contentWidth - DiffEdtorWidgetSideBySide.MINIMUM_EDITOR_WIDTH) {
				sashPosition = contentWidth - DiffEdtorWidgetSideBySide.MINIMUM_EDITOR_WIDTH;
			}
		} else {
			sashPosition = midPoint;
		}

		if (this._sashPosition !== sashPosition) {
			this._sashPosition = sashPosition;
			this._sash.layout();
		}

		return this._sashPosition;
	}

	private onSashDragStart(): void {
		this._startSashPosition = this._sashPosition;
	}

	private onSashDrag(e: ISashEvent): void {
		let w = this._dataSource.getWidth();
		let contentWidth = w - DiffEditorWidget.ENTIRE_DIFF_OVERVIEW_WIDTH;
		let sashPosition = this.layout((this._startSashPosition + (e.currentX - e.startX)) / contentWidth);

		this._sashRatio = sashPosition / contentWidth;

		this._dataSource.relayoutEditors();
	}

	private onSashDragEnd(): void {
		this._sash.layout();
	}

	private onSashReset(): void {
		this._sashRatio = 0.5;
		this._dataSource.relayoutEditors();
		this._sash.layout();
	}

	public getVerticalSashTop(sash: Sash): number {
		return 0;
	}

	public getVerticalSashLeft(sash: Sash): number {
		return this._sashPosition;
	}

	public getVerticalSashHeight(sash: Sash): number {
		return this._dataSource.getHeight();
	}

	_getViewZones(lineChanges: editorCommon.ILineChange[], originalForeignVZ: IEditorWhitespace[], modifiedForeignVZ: IEditorWhitespace[], originalEditor: editorBrowser.ICodeEditor, modifiedEditor: editorBrowser.ICodeEditor): IEditorsZones {
		let c = new SideBySideViewZonesComputer(lineChanges, originalForeignVZ, modifiedForeignVZ);
		return c.getViewZones();
	}

	_getOriginalEditorDecorations(lineChanges: editorCommon.ILineChange[], ignoreTrimWhitespace: boolean, renderIndicators: boolean, originalEditor: editorBrowser.ICodeEditor, modifiedEditor: editorBrowser.ICodeEditor): IEditorDiffDecorations {

		let result: IEditorDiffDecorations = {
			decorations: [],
			overviewZones: []
		};

		let originalModel = originalEditor.getModel();

		for (let i = 0, length = lineChanges.length; i < length; i++) {
			let lineChange = lineChanges[i];

			if (isChangeOrDelete(lineChange)) {
				result.decorations.push({
					range: new Range(lineChange.originalStartLineNumber, 1, lineChange.originalEndLineNumber, Number.MAX_VALUE),
					options: (renderIndicators ? DECORATIONS.lineDeleteWithSign : DECORATIONS.lineDelete)
				});
				if (!isChangeOrInsert(lineChange) || !lineChange.charChanges) {
					result.decorations.push(createDecoration(lineChange.originalStartLineNumber, 1, lineChange.originalEndLineNumber, Number.MAX_VALUE, DECORATIONS.charDeleteWholeLine));
				}

				let color = this._removeColor.toString();

				result.overviewZones.push(new OverviewRulerZone(
					lineChange.originalStartLineNumber,
					lineChange.originalEndLineNumber,
					editorCommon.OverviewRulerLane.Full,
					0,
					color,
					color,
					color
				));

				if (lineChange.charChanges) {
					for (let j = 0, lengthJ = lineChange.charChanges.length; j < lengthJ; j++) {
						let charChange = lineChange.charChanges[j];
						if (isChangeOrDelete(charChange)) {
							if (ignoreTrimWhitespace) {
								for (let lineNumber = charChange.originalStartLineNumber; lineNumber <= charChange.originalEndLineNumber; lineNumber++) {
									let startColumn: number;
									let endColumn: number;
									if (lineNumber === charChange.originalStartLineNumber) {
										startColumn = charChange.originalStartColumn;
									} else {
										startColumn = originalModel.getLineFirstNonWhitespaceColumn(lineNumber);
									}
									if (lineNumber === charChange.originalEndLineNumber) {
										endColumn = charChange.originalEndColumn;
									} else {
										endColumn = originalModel.getLineLastNonWhitespaceColumn(lineNumber);
									}
									result.decorations.push(createDecoration(lineNumber, startColumn, lineNumber, endColumn, DECORATIONS.charDelete));
								}
							} else {
								result.decorations.push(createDecoration(charChange.originalStartLineNumber, charChange.originalStartColumn, charChange.originalEndLineNumber, charChange.originalEndColumn, DECORATIONS.charDelete));
							}
						}
					}
				}
			}
		}

		return result;
	}

	_getModifiedEditorDecorations(lineChanges: editorCommon.ILineChange[], ignoreTrimWhitespace: boolean, renderIndicators: boolean, originalEditor: editorBrowser.ICodeEditor, modifiedEditor: editorBrowser.ICodeEditor): IEditorDiffDecorations {

		let result: IEditorDiffDecorations = {
			decorations: [],
			overviewZones: []
		};

		let modifiedModel = modifiedEditor.getModel();

		for (let i = 0, length = lineChanges.length; i < length; i++) {
			let lineChange = lineChanges[i];

			if (isChangeOrInsert(lineChange)) {

				result.decorations.push({
					range: new Range(lineChange.modifiedStartLineNumber, 1, lineChange.modifiedEndLineNumber, Number.MAX_VALUE),
					options: (renderIndicators ? DECORATIONS.lineInsertWithSign : DECORATIONS.lineInsert)
				});
				if (!isChangeOrDelete(lineChange) || !lineChange.charChanges) {
					result.decorations.push(createDecoration(lineChange.modifiedStartLineNumber, 1, lineChange.modifiedEndLineNumber, Number.MAX_VALUE, DECORATIONS.charInsertWholeLine));
				}
				let color = this._insertColor.toString();
				result.overviewZones.push(new OverviewRulerZone(
					lineChange.modifiedStartLineNumber,
					lineChange.modifiedEndLineNumber,
					editorCommon.OverviewRulerLane.Full,
					0,
					color,
					color,
					color
				));

				if (lineChange.charChanges) {
					for (let j = 0, lengthJ = lineChange.charChanges.length; j < lengthJ; j++) {
						let charChange = lineChange.charChanges[j];
						if (isChangeOrInsert(charChange)) {
							if (ignoreTrimWhitespace) {
								for (let lineNumber = charChange.modifiedStartLineNumber; lineNumber <= charChange.modifiedEndLineNumber; lineNumber++) {
									let startColumn: number;
									let endColumn: number;
									if (lineNumber === charChange.modifiedStartLineNumber) {
										startColumn = charChange.modifiedStartColumn;
									} else {
										startColumn = modifiedModel.getLineFirstNonWhitespaceColumn(lineNumber);
									}
									if (lineNumber === charChange.modifiedEndLineNumber) {
										endColumn = charChange.modifiedEndColumn;
									} else {
										endColumn = modifiedModel.getLineLastNonWhitespaceColumn(lineNumber);
									}
									result.decorations.push(createDecoration(lineNumber, startColumn, lineNumber, endColumn, DECORATIONS.charInsert));
								}
							} else {
								result.decorations.push(createDecoration(charChange.modifiedStartLineNumber, charChange.modifiedStartColumn, charChange.modifiedEndLineNumber, charChange.modifiedEndColumn, DECORATIONS.charInsert));
							}
						}
					}
				}

			}
		}
		return result;
	}
}

class SideBySideViewZonesComputer extends ViewZonesComputer {

	constructor(lineChanges: editorCommon.ILineChange[], originalForeignVZ: IEditorWhitespace[], modifiedForeignVZ: IEditorWhitespace[]) {
		super(lineChanges, originalForeignVZ, modifiedForeignVZ);
	}

	_produceOriginalFromDiff(lineChange: editorCommon.ILineChange, lineChangeOriginalLength: number, lineChangeModifiedLength: number): IMyViewZone {
		if (lineChangeModifiedLength > lineChangeOriginalLength) {
			return {
				afterLineNumber: Math.max(lineChange.originalStartLineNumber, lineChange.originalEndLineNumber),
				heightInLines: (lineChangeModifiedLength - lineChangeOriginalLength),
				domNode: null
			};
		}
		return null;
	}

	_produceModifiedFromDiff(lineChange: editorCommon.ILineChange, lineChangeOriginalLength: number, lineChangeModifiedLength: number): IMyViewZone {
		if (lineChangeOriginalLength > lineChangeModifiedLength) {
			return {
				afterLineNumber: Math.max(lineChange.modifiedStartLineNumber, lineChange.modifiedEndLineNumber),
				heightInLines: (lineChangeOriginalLength - lineChangeModifiedLength),
				domNode: null
			};
		}
		return null;
	}
}

class DiffEdtorWidgetInline extends DiffEditorWidgetStyle implements IDiffEditorWidgetStyle {

	private decorationsLeft: number;

	constructor(dataSource: IDataSource, enableSplitViewResizing: boolean) {
		super(dataSource);

		this.decorationsLeft = dataSource.getOriginalEditor().getLayoutInfo().decorationsLeft;

		this._register(dataSource.getOriginalEditor().onDidLayoutChange((layoutInfo: editorOptions.EditorLayoutInfo) => {
			if (this.decorationsLeft !== layoutInfo.decorationsLeft) {
				this.decorationsLeft = layoutInfo.decorationsLeft;
				dataSource.relayoutEditors();
			}
		}));
	}

	public dispose(): void {
		super.dispose();
	}

	public setEnableSplitViewResizing(enableSplitViewResizing: boolean): void {
		// Nothing to do..
	}

	_getViewZones(lineChanges: editorCommon.ILineChange[], originalForeignVZ: IEditorWhitespace[], modifiedForeignVZ: IEditorWhitespace[], originalEditor: editorBrowser.ICodeEditor, modifiedEditor: editorBrowser.ICodeEditor, renderIndicators: boolean): IEditorsZones {
		let computer = new InlineViewZonesComputer(lineChanges, originalForeignVZ, modifiedForeignVZ, originalEditor, modifiedEditor, renderIndicators);
		return computer.getViewZones();
	}

	_getOriginalEditorDecorations(lineChanges: editorCommon.ILineChange[], ignoreTrimWhitespace: boolean, renderIndicators: boolean, originalEditor: editorBrowser.ICodeEditor, modifiedEditor: editorBrowser.ICodeEditor): IEditorDiffDecorations {
		let result: IEditorDiffDecorations = {
			decorations: [],
			overviewZones: []
		};

		for (let i = 0, length = lineChanges.length; i < length; i++) {
			let lineChange = lineChanges[i];

			// Add overview zones in the overview ruler
			if (isChangeOrDelete(lineChange)) {
				result.decorations.push({
					range: new Range(lineChange.originalStartLineNumber, 1, lineChange.originalEndLineNumber, Number.MAX_VALUE),
					options: DECORATIONS.lineDeleteMargin
				});

				let color = this._removeColor.toString();
				result.overviewZones.push(new OverviewRulerZone(
					lineChange.originalStartLineNumber,
					lineChange.originalEndLineNumber,
					editorCommon.OverviewRulerLane.Full,
					0,
					color,
					color,
					color
				));
			}
		}

		return result;
	}

	_getModifiedEditorDecorations(lineChanges: editorCommon.ILineChange[], ignoreTrimWhitespace: boolean, renderIndicators: boolean, originalEditor: editorBrowser.ICodeEditor, modifiedEditor: editorBrowser.ICodeEditor): IEditorDiffDecorations {

		let result: IEditorDiffDecorations = {
			decorations: [],
			overviewZones: []
		};

		let modifiedModel = modifiedEditor.getModel();

		for (let i = 0, length = lineChanges.length; i < length; i++) {
			let lineChange = lineChanges[i];

			// Add decorations & overview zones
			if (isChangeOrInsert(lineChange)) {
				result.decorations.push({
					range: new Range(lineChange.modifiedStartLineNumber, 1, lineChange.modifiedEndLineNumber, Number.MAX_VALUE),
					options: (renderIndicators ? DECORATIONS.lineInsertWithSign : DECORATIONS.lineInsert)
				});

				let color = this._insertColor.toString();
				result.overviewZones.push(new OverviewRulerZone(
					lineChange.modifiedStartLineNumber,
					lineChange.modifiedEndLineNumber,
					editorCommon.OverviewRulerLane.Full,
					0,
					color,
					color,
					color
				));

				if (lineChange.charChanges) {
					for (let j = 0, lengthJ = lineChange.charChanges.length; j < lengthJ; j++) {
						let charChange = lineChange.charChanges[j];
						if (isChangeOrInsert(charChange)) {
							if (ignoreTrimWhitespace) {
								for (let lineNumber = charChange.modifiedStartLineNumber; lineNumber <= charChange.modifiedEndLineNumber; lineNumber++) {
									let startColumn: number;
									let endColumn: number;
									if (lineNumber === charChange.modifiedStartLineNumber) {
										startColumn = charChange.modifiedStartColumn;
									} else {
										startColumn = modifiedModel.getLineFirstNonWhitespaceColumn(lineNumber);
									}
									if (lineNumber === charChange.modifiedEndLineNumber) {
										endColumn = charChange.modifiedEndColumn;
									} else {
										endColumn = modifiedModel.getLineLastNonWhitespaceColumn(lineNumber);
									}
									result.decorations.push(createDecoration(lineNumber, startColumn, lineNumber, endColumn, DECORATIONS.charInsert));
								}
							} else {
								result.decorations.push(createDecoration(charChange.modifiedStartLineNumber, charChange.modifiedStartColumn, charChange.modifiedEndLineNumber, charChange.modifiedEndColumn, DECORATIONS.charInsert));
							}
						}
					}
				} else {
					result.decorations.push(createDecoration(lineChange.modifiedStartLineNumber, 1, lineChange.modifiedEndLineNumber, Number.MAX_VALUE, DECORATIONS.charInsertWholeLine));
				}
			}
		}

		return result;
	}

	public layout(): number {
		// An editor should not be smaller than 5px
		return Math.max(5, this.decorationsLeft);
	}

}

class InlineViewZonesComputer extends ViewZonesComputer {

	private originalModel: editorCommon.IModel;
	private modifiedEditorConfiguration: editorOptions.InternalEditorOptions;
	private modifiedEditorTabSize: number;
	private renderIndicators: boolean;

	constructor(lineChanges: editorCommon.ILineChange[], originalForeignVZ: IEditorWhitespace[], modifiedForeignVZ: IEditorWhitespace[], originalEditor: editorBrowser.ICodeEditor, modifiedEditor: editorBrowser.ICodeEditor, renderIndicators: boolean) {
		super(lineChanges, originalForeignVZ, modifiedForeignVZ);
		this.originalModel = originalEditor.getModel();
		this.modifiedEditorConfiguration = modifiedEditor.getConfiguration();
		this.modifiedEditorTabSize = modifiedEditor.getModel().getOptions().tabSize;
		this.renderIndicators = renderIndicators;
	}

	_produceOriginalFromDiff(lineChange: editorCommon.ILineChange, lineChangeOriginalLength: number, lineChangeModifiedLength: number): IMyViewZone {
		let marginDomNode = document.createElement('div');
		marginDomNode.className = 'inline-added-margin-view-zone';
		Configuration.applyFontInfoSlow(marginDomNode, this.modifiedEditorConfiguration.fontInfo);

		return {
			afterLineNumber: Math.max(lineChange.originalStartLineNumber, lineChange.originalEndLineNumber),
			heightInLines: lineChangeModifiedLength,
			domNode: document.createElement('div'),
			marginDomNode: marginDomNode
		};
	}

	_produceModifiedFromDiff(lineChange: editorCommon.ILineChange, lineChangeOriginalLength: number, lineChangeModifiedLength: number): IMyViewZone {
		let decorations: InlineDecoration[] = [];
		if (lineChange.charChanges) {
			for (let j = 0, lengthJ = lineChange.charChanges.length; j < lengthJ; j++) {
				let charChange = lineChange.charChanges[j];
				if (isChangeOrDelete(charChange)) {
					decorations.push(new InlineDecoration(
						new Range(charChange.originalStartLineNumber, charChange.originalStartColumn, charChange.originalEndLineNumber, charChange.originalEndColumn),
						'char-delete',
						false
					));
				}
			}
		}

		let sb = createStringBuilder(10000);
		let marginHTML: string[] = [];
		let lineDecorationsWidth = this.modifiedEditorConfiguration.layoutInfo.decorationsWidth;
		let lineHeight = this.modifiedEditorConfiguration.lineHeight;
		for (let lineNumber = lineChange.originalStartLineNumber; lineNumber <= lineChange.originalEndLineNumber; lineNumber++) {
			this.renderOriginalLine(lineNumber - lineChange.originalStartLineNumber, this.originalModel, this.modifiedEditorConfiguration, this.modifiedEditorTabSize, lineNumber, decorations, sb);

			if (this.renderIndicators) {
				let index = lineNumber - lineChange.originalStartLineNumber;
				marginHTML = marginHTML.concat([
					`<div class="delete-sign" style="position:absolute;top:${index * lineHeight}px;width:${lineDecorationsWidth}px;height:${lineHeight}px;right:0;"></div>`
				]);
			}
		}

		let domNode = document.createElement('div');
		domNode.className = 'view-lines line-delete';
		domNode.innerHTML = sb.build();
		Configuration.applyFontInfoSlow(domNode, this.modifiedEditorConfiguration.fontInfo);

		let marginDomNode = document.createElement('div');
		marginDomNode.className = 'inline-deleted-margin-view-zone';
		marginDomNode.innerHTML = marginHTML.join('');
		Configuration.applyFontInfoSlow(marginDomNode, this.modifiedEditorConfiguration.fontInfo);

		return {
			shouldNotShrink: true,
			afterLineNumber: (lineChange.modifiedEndLineNumber === 0 ? lineChange.modifiedStartLineNumber : lineChange.modifiedStartLineNumber - 1),
			heightInLines: lineChangeOriginalLength,
			domNode: domNode,
			marginDomNode: marginDomNode
		};
	}

	private renderOriginalLine(count: number, originalModel: editorCommon.IModel, config: editorOptions.InternalEditorOptions, tabSize: number, lineNumber: number, decorations: InlineDecoration[], sb: IStringBuilder): void {
		let lineContent = originalModel.getLineContent(lineNumber);

		let actualDecorations = LineDecoration.filter(decorations, lineNumber, 1, lineContent.length + 1);

		const defaultMetadata = (
			(FontStyle.None << MetadataConsts.FONT_STYLE_OFFSET)
			| (ColorId.DefaultForeground << MetadataConsts.FOREGROUND_OFFSET)
			| (ColorId.DefaultBackground << MetadataConsts.BACKGROUND_OFFSET)
		) >>> 0;

		sb.appendASCIIString('<div class="view-line');
		if (decorations.length === 0) {
			// No char changes
			sb.appendASCIIString(' char-delete');
		}
		sb.appendASCIIString('" style="top:');
		sb.appendASCIIString(String(count * config.lineHeight));
		sb.appendASCIIString('px;width:1000000px;">');

		renderViewLine(new RenderLineInput(
			(config.fontInfo.isMonospace && !config.viewInfo.disableMonospaceOptimizations),
			lineContent,
			originalModel.mightContainRTL(),
			0,
			[new ViewLineToken(lineContent.length, defaultMetadata)],
			actualDecorations,
			tabSize,
			config.fontInfo.spaceWidth,
			config.viewInfo.stopRenderingLineAfter,
			config.viewInfo.renderWhitespace,
			config.viewInfo.renderControlCharacters,
			config.viewInfo.fontLigatures
		), sb);

		sb.appendASCIIString('</div>');
	}
}

function isChangeOrInsert(lineChange: editorCommon.IChange): boolean {
	return lineChange.modifiedEndLineNumber > 0;
}

function isChangeOrDelete(lineChange: editorCommon.IChange): boolean {
	return lineChange.originalEndLineNumber > 0;
}

function createFakeLinesDiv(): HTMLElement {
	let r = document.createElement('div');
	r.className = 'diagonal-fill';
	return r;
}

registerThemingParticipant((theme, collector) => {
	let added = theme.getColor(diffInserted);
	if (added) {
		collector.addRule(`.monaco-editor .line-insert, .monaco-editor .char-insert { background-color: ${added}; }`);
		collector.addRule(`.monaco-diff-editor .line-insert, .monaco-diff-editor .char-insert { background-color: ${added}; }`);
		collector.addRule(`.monaco-editor .inline-added-margin-view-zone { background-color: ${added}; }`);
	}
	let removed = theme.getColor(diffRemoved);
	if (removed) {
		collector.addRule(`.monaco-editor .line-delete, .monaco-editor .char-delete { background-color: ${removed}; }`);
		collector.addRule(`.monaco-diff-editor .line-delete, .monaco-diff-editor .char-delete { background-color: ${removed}; }`);
		collector.addRule(`.monaco-editor .inline-deleted-margin-view-zone { background-color: ${removed}; }`);
	}
	let addedOutline = theme.getColor(diffInsertedOutline);
	if (addedOutline) {
		collector.addRule(`.monaco-editor .line-insert, .monaco-editor .char-insert { border: 1px dashed ${addedOutline}; }`);
	}
	let removedOutline = theme.getColor(diffRemovedOutline);
	if (removedOutline) {
		collector.addRule(`.monaco-editor .line-delete, .monaco-editor .char-delete { border: 1px dashed ${removedOutline}; }`);
	}
	let shadow = theme.getColor(scrollbarShadow);
	if (shadow) {
		collector.addRule(`.monaco-diff-editor.side-by-side .editor.modified { box-shadow: -6px 0 5px -5px ${shadow}; }`);
	}
});