/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./media/mergeEditor';
import * as nls from 'vs/nls';
import * as dom from 'vs/base/browser/dom';
import { FastDomNode, createFastDomNode } from 'vs/base/browser/fastDomNode';
import { ISashEvent, IVerticalSashLayoutProvider, Sash, SashState, Orientation } from 'vs/base/browser/ui/sash/sash';
import { RunOnceScheduler } from 'vs/base/common/async';
import { Color } from 'vs/base/common/color';
import { Emitter, Event } from 'vs/base/common/event';
import { Disposable } from 'vs/base/common/lifecycle';
import { URI } from 'vs/base/common/uri';
import { StableEditorScrollState } from 'vs/editor/browser/stableEditorScroll';
import * as editorBrowser from 'vs/editor/browser/editorBrowser';
import { IMergeEditorConstructionOptions, MergeEditorState, IMergeEditor } from 'vs/editor/browser/mergeEditorBrowser';
import { ICodeEditorService } from 'vs/editor/browser/services/codeEditorService';
import { CodeEditorWidget, ICodeEditorWidgetOptions } from './codeEditorWidget';
import { IMergeEditorOptions, EditorOption, stringSet as validateStringSetOption, boolean as validateBooleanOption, ValidMergeEditorBaseOptions, clampedInt } from 'vs/editor/common/config/editorOptions';
import { IPosition, Position } from 'vs/editor/common/core/position';
import { IRange, Range } from 'vs/editor/common/core/range';
import { ISelection, Selection } from 'vs/editor/common/core/selection';
import * as editorCommon from 'vs/editor/common/editorCommon';
import { IModelDecorationsChangeAccessor, IModelDeltaDecoration, ITextModel, IIdentifiedSingleEditOperation } from 'vs/editor/common/model';
import { ModelDecorationOptions } from 'vs/editor/common/model/textModel';
import { IChange, ILineChange } from 'vs/editor/common/diff/diffComputer';
import { IMergeComputationResult, IMerge, MergeRegion, ResolvingAction } from 'vs/editor/common/merge/mergeComputer';
import { IEditorWorkerService } from 'vs/editor/common/services/editorWorker';
import { OverviewRulerZone } from 'vs/editor/common/viewModel/overviewZoneManager';
import { IEditorWhitespace, IViewModel } from 'vs/editor/common/viewModel';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ServiceCollection } from 'vs/platform/instantiation/common/serviceCollection';
import { INotificationService } from 'vs/platform/notification/common/notification';
import { defaultInsertColor, defaultRemoveColor, mergeBorder, mergeConflict, diffInserted, diffInsertedOutline, diffRemoved, diffRemovedOutline, scrollbarShadow, scrollbarSliderBackground, scrollbarSliderHoverBackground, scrollbarSliderActiveBackground, diffDiagonalFill } from 'vs/platform/theme/common/colorRegistry';
import { IColorTheme, IThemeService, getThemeTypeSelector, registerThemingParticipant, ThemeIcon } from 'vs/platform/theme/common/themeService';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { IClipboardService } from 'vs/platform/clipboard/common/clipboardService';
import { Constants } from 'vs/base/common/uint';
import { IEditorProgressService, IProgressRunner } from 'vs/platform/progress/common/progress';
import { ElementSizeObserver } from 'vs/editor/browser/config/elementSizeObserver';
import { Codicon } from 'vs/base/common/codicons';
import { registerIcon } from 'vs/platform/theme/common/iconRegistry';
import { IEditorConstructionOptions } from 'vs/editor/browser/config/editorConfiguration';
import { IDimension } from 'vs/editor/common/core/dimension';
import { ColorScheme } from 'vs/platform/theme/common/theme';
import { IModelContentChangedEvent } from 'vs/editor/common/textModelEvents';


export interface IMergeCodeEditorWidgetOptions {
	currentEditor?: ICodeEditorWidgetOptions;
	outputEditor?: ICodeEditorWidgetOptions;
	incomingEditor?: ICodeEditorWidgetOptions;
}

interface IEditorDiffDecorations {
	decorations: IModelDeltaDecoration[];
	overviewZones: OverviewRulerZone[];
}

interface IEditorDiffDecorationsWithZones extends IEditorDiffDecorations {
	zones: IMyViewZone[];
}

interface IEditorsMergeDecorationsWithZones {
	current: IEditorDiffDecorationsWithZones;
	output: IEditorDiffDecorationsWithZones;
	incoming: IEditorDiffDecorationsWithZones;
}

interface IEditorsZones {
	current: IMyViewZone[];
	output: IMyViewZone[];
	incoming: IMyViewZone[];
}

class VisualEditorState {
	private _zones: string[];
	private _zonesMap: { [zoneId: string]: boolean };
	private _decorations: string[];

	constructor() {
		this._zones = [];
		this._zonesMap = {};
		this._decorations = [];
	}

	public getForeignViewZones(allViewZones: IEditorWhitespace[]): IEditorWhitespace[] {
		return allViewZones.filter((z) => !this._zonesMap[String(z.id)]);
	}

	public clean(editor: CodeEditorWidget): void {
		// (1) View zones
		if (this._zones.length > 0) {
			editor.changeViewZones((viewChangeAccessor: editorBrowser.IViewZoneChangeAccessor) => {
				for (const zoneId of this._zones) {
					viewChangeAccessor.removeZone(zoneId);
				}
			});
		}
		this._zones = [];
		this._zonesMap = {};

		// (2) Model decorations
		this._decorations = editor.deltaDecorations(this._decorations, []);
	}

	public apply(editor: CodeEditorWidget, overviewRuler: editorBrowser.IOverviewRuler | null, newDecorations: IEditorDiffDecorationsWithZones, restoreScrollState: boolean): void {

		const scrollState = restoreScrollState ? StableEditorScrollState.capture(editor) : null;

		// view zones
		editor.changeViewZones((viewChangeAccessor: editorBrowser.IViewZoneChangeAccessor) => {
			for (const zoneId of this._zones) {
				viewChangeAccessor.removeZone(zoneId);
			}
			this._zones = [];
			this._zonesMap = {};
			for (let i = 0, length = newDecorations.zones.length; i < length; i++) {
				const viewZone = <editorBrowser.IViewZone>newDecorations.zones[i];
				viewZone.suppressMouseDown = true;
				const zoneId = viewChangeAccessor.addZone(viewZone);
				this._zones.push(zoneId);
				this._zonesMap[String(zoneId)] = true;
			}
		});

		if (scrollState) {
			scrollState.restore(editor);
		}

		// decorations
		this._decorations = editor.deltaDecorations(this._decorations, newDecorations.decorations);

		// overview ruler
		if (overviewRuler) {
			overviewRuler.setZones(newDecorations.overviewZones);
		}
	}
}

let DIFF_EDITOR_ID = 0;


const diffInsertIcon = registerIcon('diff-insert', Codicon.add, nls.localize('diffInsertIcon', 'Line decoration for inserts in the diff editor.'));
const diffRemoveIcon = registerIcon('diff-remove', Codicon.remove, nls.localize('diffRemoveIcon', 'Line decoration for removals in the diff editor.'));

export class MergeEditorWidget extends Disposable implements IMergeEditor {

	private static readonly ONE_OVERVIEW_WIDTH = 15;
	public static readonly ENTIRE_DIFF_OVERVIEW_WIDTH = 45;
	private static readonly UPDATE_DIFF_DECORATIONS_DELAY = 200; // ms

	private readonly _onDidDispose: Emitter<void> = this._register(new Emitter<void>());
	public readonly onDidDispose: Event<void> = this._onDidDispose.event;

	private readonly _onDidUpdateDiff: Emitter<void> = this._register(new Emitter<void>());
	public readonly onDidUpdateDiff: Event<void> = this._onDidUpdateDiff.event;

	private readonly _onDidContentSizeChange: Emitter<editorCommon.IContentSizeChangedEvent> = this._register(new Emitter<editorCommon.IContentSizeChangedEvent>());
	public readonly onDidContentSizeChange: Event<editorCommon.IContentSizeChangedEvent> = this._onDidContentSizeChange.event;

	private readonly _id: number;
	private _state: MergeEditorState;
	private _modelState: editorCommon.IMergeEditorModelState;
	private _updatingMergeProgress: IProgressRunner | null;

	private readonly _domElement: HTMLElement;
	protected readonly _containerDomElement: HTMLElement;
	private readonly _overviewDomElement: HTMLElement;
	private readonly _overviewViewportDomElement: FastDomNode<HTMLElement>;

	private readonly _elementSizeObserver: ElementSizeObserver;

	private _bannerHeight?: number;

	// A hidden text model that saves the common ancestor version.
	private _commonAncestorModel: ITextModel | null;

	private readonly _currentEditor: CodeEditorWidget;
	private readonly _currentDomNode: HTMLElement;
	private readonly _currentEditorState: VisualEditorState;
	private _currentOverviewRuler: editorBrowser.IOverviewRuler | null;

	private readonly _outputEditor: CodeEditorWidget;
	private readonly _outputDomNode: HTMLElement;
	private readonly _outputEditorState: VisualEditorState;
	private _outputOverviewRuler: editorBrowser.IOverviewRuler | null;

	private readonly _incomingEditor: CodeEditorWidget;
	private readonly _incomingDomNode: HTMLElement;
	private readonly _incomingEditorState: VisualEditorState;
	private _incomingOverviewRuler: editorBrowser.IOverviewRuler | null;

	private _currentlyChangingViewZones: boolean;
	private _beginUpdateDecorationsTimeout: number;
	private _mergeComputationToken: number;
	private _mergeComputationResult: IMergeComputationResult | null;

	private _isVisible: boolean;
	private _isHandlingScrollEvent: boolean;

	private _options: ValidMergeEditorBaseOptions;

	private _strategy!: MergeEditorWidgetStyle;

	private readonly _updateDecorationsRunner: RunOnceScheduler;

	private readonly _editorWorkerService: IEditorWorkerService;
	private readonly _contextKeyService: IContextKeyService;
	private readonly _instantiationService: IInstantiationService;
	private readonly _codeEditorService: ICodeEditorService;
	private readonly _themeService: IThemeService;
	private readonly _notificationService: INotificationService;

	constructor(
		domElement: HTMLElement,
		options: Readonly<IMergeEditorConstructionOptions>,
		codeEditorWidgetOptions: IMergeCodeEditorWidgetOptions,
		@IClipboardService clipboardService: IClipboardService,
		@IEditorWorkerService editorWorkerService: IEditorWorkerService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IInstantiationService instantiationService: IInstantiationService,
		@ICodeEditorService codeEditorService: ICodeEditorService,
		@IThemeService themeService: IThemeService,
		@INotificationService notificationService: INotificationService,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IEditorProgressService private readonly _editorProgressService: IEditorProgressService
	) {
		super();

		this._editorWorkerService = editorWorkerService;
		this._codeEditorService = codeEditorService;
		this._contextKeyService = this._register(contextKeyService.createScoped(domElement));
		this._instantiationService = instantiationService.createChild(new ServiceCollection([IContextKeyService, this._contextKeyService]));
		this._contextKeyService.createKey('isInMergeEditor', true);
		this._themeService = themeService;
		this._notificationService = notificationService;

		this._id = (++DIFF_EDITOR_ID);
		this._state = MergeEditorState.Idle;
		this._modelState = { resolvedRegions: [] };
		this._updatingMergeProgress = null;

		this._domElement = domElement;
		options = options || {};

		this._options = validateMergeEditorOptions(options, {
			enableSplitViewResizing: true,
			maxComputationTime: 5000,
			maxFileSize: 50,
			ignoreTrimWhitespace: true,
			renderIndicators: true,
			// TODO: Code lens
			// TODO: layouts
			renderOverviewRuler: true,
			mergeWordWrap: 'inherit'
		});

		if (typeof options.isInEmbeddedEditor !== 'undefined') {
			this._contextKeyService.createKey('isInEmbeddedMergeEditor', options.isInEmbeddedEditor);
		} else {
			this._contextKeyService.createKey('isInEmbeddedMergeEditor', false);
		}

		this._updateDecorationsRunner = this._register(new RunOnceScheduler(() => this._updateDecorations(), 0));

		this._containerDomElement = document.createElement('div');
		this._containerDomElement.className = MergeEditorWidget._getClassName(this._themeService.getColorTheme());
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

		this._register(dom.addStandardDisposableListener(this._overviewDomElement, dom.EventType.POINTER_DOWN, (e) => {
			this._outputEditor.delegateVerticalScrollbarPointerDown(e);
		}));
		if (this._options.renderOverviewRuler) {
			this._containerDomElement.appendChild(this._overviewDomElement);
		}

		// Create left side
		this._currentDomNode = document.createElement('div');
		this._currentDomNode.className = 'editor original';
		this._currentDomNode.style.position = 'absolute';
		this._currentDomNode.style.height = '100%';
		this._containerDomElement.appendChild(this._currentDomNode);

		// Create center
		this._outputDomNode = document.createElement('div');
		this._outputDomNode.className = 'editor modified';
		this._outputDomNode.style.position = 'absolute';
		this._outputDomNode.style.height = '100%';
		this._containerDomElement.appendChild(this._outputDomNode);

		// Create right side
		this._incomingDomNode = document.createElement('div');
		this._incomingDomNode.className = 'editor original';
		this._incomingDomNode.style.position = 'absolute';
		this._incomingDomNode.style.height = '100%';
		this._containerDomElement.appendChild(this._incomingDomNode);

		this._beginUpdateDecorationsTimeout = -1;
		this._currentlyChangingViewZones = false;
		this._mergeComputationToken = 0;

		this._currentEditorState = new VisualEditorState();
		this._outputEditorState = new VisualEditorState();
		this._incomingEditorState = new VisualEditorState();

		this._isVisible = true;
		this._isHandlingScrollEvent = false;

		this._elementSizeObserver = this._register(new ElementSizeObserver(this._containerDomElement, options.dimension));
		this._register(this._elementSizeObserver.onDidChange(() => this._onDidContainerSizeChanged()));
		if (options.automaticLayout) {
			this._elementSizeObserver.startObserving();
		}

		this._commonAncestorModel = null;
		this._mergeComputationResult = null;

		this._currentEditor = this._createSubEditor(this._currentDomNode, options, codeEditorWidgetOptions.currentEditor || {});
		this._outputEditor = this._createSubEditor(this._outputDomNode, options, codeEditorWidgetOptions.outputEditor || {});
		this._incomingEditor = this._createSubEditor(this._incomingDomNode, options, codeEditorWidgetOptions.incomingEditor || {});

		this._register(
			this._outputEditor.onDidChangeModelContent(
				e => this._updateConflictRegions(e)));

		this._currentOverviewRuler = null;
		this._outputOverviewRuler = null;
		this._incomingOverviewRuler = null;

		/* TODO review pane
		this._reviewPane = instantiationService.createInstance(DiffReview, this);
		this._containerDomElement.appendChild(this._reviewPane.domNode.domNode);
		this._containerDomElement.appendChild(this._reviewPane.shadow.domNode);
		this._containerDomElement.appendChild(this._reviewPane.actionBarContainer.domNode);
		*/

		this._setStrategy(new MergeEditorWidgetThreeColumn(this._createDataSource(), this._options.enableSplitViewResizing));

		this._register(themeService.onDidColorThemeChange(t => {
			if (this._strategy && this._strategy.applyColors(t)) {
				this._updateDecorationsRunner.schedule();
			}
			this._containerDomElement.className = MergeEditorWidget._getClassName(this._themeService.getColorTheme());
		}));

		/* TODO: contributions
		const contributions: IDiffEditorContributionDescription[] = EditorExtensionsRegistry.getDiffEditorContributions();
		for (const desc of contributions) {
			try {
				this._register(instantiationService.createInstance(desc.ctor, this));
			} catch (err: AnyDuringUnknownInCatchMigration) {
				onUnexpectedError(err);
			}
		}
		*/

		this._codeEditorService.addMergeEditor(this);
	}

	public get ignoreTrimWhitespace(): boolean {
		return this._options.ignoreTrimWhitespace;
	}

	public get maxComputationTime(): number {
		return this._options.maxComputationTime;
	}

	public getContentHeight(): number {
		return this._outputEditor.getContentHeight();
	}

	public getViewWidth(): number {
		return this._elementSizeObserver.getWidth();
	}

	private _setState(newState: MergeEditorState): void {
		if (this._state === newState) {
			return;
		}
		this._state = newState;

		if (this._updatingMergeProgress) {
			this._updatingMergeProgress.done();
			this._updatingMergeProgress = null;
		}

		if (this._state === MergeEditorState.ComputingDiff) {
			this._updatingMergeProgress = this._editorProgressService.show(true, 1000);
		}
	}

	public hasWidgetFocus(): boolean {
		return dom.isAncestor(document.activeElement, this._domElement);
	}

	private _updateConflictRegions(event: IModelContentChangedEvent) {
		const outputModel = this._outputEditor.getModel();
		if (this._mergeComputationResult && outputModel) {
			if (event.isUndoing) {
				// check if we need to revert conflict state of a region
				let lastResolve = this._modelState.resolvedRegions.length > 0 ? this._modelState.resolvedRegions[this._modelState.resolvedRegions.length - 1] : null;
				while (lastResolve && lastResolve.versionId > outputModel.getAlternativeVersionId()) {
					// reverted to a state before the last resolve
					this._modelState.resolvedRegions.pop();
					this._mergeComputationResult.initialRegions[lastResolve.index].hasConflict = (lastResolve.lastState === editorCommon.ConflictState.Unresolved);
					this._mergeComputationResult.initialRegions[lastResolve.index].state.conflict = lastResolve.lastState;
					lastResolve = this._modelState.resolvedRegions.length > 0 ? this._modelState.resolvedRegions[this._modelState.resolvedRegions.length - 1] : null;
				}
			} else {
				const outputChanges = this._mergeComputationResult.outputDiff.changes;
				// check if an existing conflict region needs to be marked as resolved
				for (const [index, merge] of this._mergeComputationResult.initialRegions.entries()) {
					if (merge.state.conflict !== editorCommon.ConflictState.Resolved) {
						for (const change of event.changes) {
							let appliedChangeLength = 0;
							if (merge.state.conflict === editorCommon.ConflictState.AppliedLeft) {
								appliedChangeLength = Math.max(merge.currentEndLineNumber - merge.currentStartLineNumber, 0);
							} else if (merge.state.conflict === editorCommon.ConflictState.AppliedRight) {
								appliedChangeLength = Math.max(merge.incomingEndLineNumber - merge.incomingStartLineNumber, 0);
							}

							let regionStart = getEquivalentLineForOriginalLineNumber(outputChanges, merge.outputStartLineNumber);
							let regionEnd = getEquivalentLineForOriginalLineNumber(outputChanges, merge.outputEndLineNumber);

							if (appliedChangeLength > 0 && regionEnd === 0) {
								regionEnd = regionStart + appliedChangeLength + 1;
							} else if (appliedChangeLength > 0) {
								regionStart = regionEnd - appliedChangeLength;
							}

							const changeStart = change.range.startLineNumber;
							// checks if the change is an insert change
							const changeEnd = change.rangeLength === 0 && change.text.startsWith('\n') ? 0 : change.range.endLineNumber;

							if (rangeOverlap(regionStart, regionEnd, changeStart, changeEnd)) {
								// overlap => resolve conflict
								merge.hasConflict = false;
								this._modelState.resolvedRegions.push({ index, versionId: outputModel.getAlternativeVersionId(), lastState: merge.state.conflict });
								// Transit region state, omitting arrow-triggered actions.
								if (merge.state.action === undefined) {
									// If there's no ongoing accepting action, it's a manual edit.
									merge.state.conflict = editorCommon.ConflictState.Resolved;
								}
								break;
							}
						}
					}
				}
			}
		}
	}

	private static _getClassName(theme: IColorTheme): string {
		let result = 'monaco-merge-editor monaco-editor-background ';
		result += getThemeTypeSelector(theme.type);
		return result;
	}

	private _recreateOverviewRulers(): void {
		if (!this._options.renderOverviewRuler) {
			return;
		}

		if (this._currentOverviewRuler) {
			this._overviewDomElement.removeChild(this._currentOverviewRuler.getDomNode());
			this._currentOverviewRuler.dispose();
		}
		if (this._currentEditor.hasModel()) {
			this._currentOverviewRuler = this._currentEditor.createOverviewRuler('current mergeOverviewRuler')!;
			this._overviewDomElement.appendChild(this._currentOverviewRuler.getDomNode());
		}

		if (this._outputOverviewRuler) {
			this._overviewDomElement.removeChild(this._outputOverviewRuler.getDomNode());
			this._outputOverviewRuler.dispose();
		}
		if (this._outputEditor.hasModel()) {
			this._outputOverviewRuler = this._outputEditor.createOverviewRuler('output mergeOverviewRuler')!;
			this._overviewDomElement.appendChild(this._outputOverviewRuler.getDomNode());
		}

		if (this._incomingOverviewRuler) {
			this._overviewDomElement.removeChild(this._incomingOverviewRuler.getDomNode());
			this._incomingOverviewRuler.dispose();
		}
		if (this._incomingEditor.hasModel()) {
			this._incomingOverviewRuler = this._incomingEditor.createOverviewRuler('incoming mergeOverviewRuler')!;
			this._overviewDomElement.appendChild(this._incomingOverviewRuler.getDomNode());
		}

		this._layoutOverviewRulers();
	}

	private _createSubEditor(container: HTMLElement, options: Readonly<IMergeEditorConstructionOptions>, codeEditorWidgetOptions: ICodeEditorWidgetOptions): CodeEditorWidget {
		const editor = this._createInnerEditor(this._instantiationService, container, this._adjustOptionsForSubEditor(options), codeEditorWidgetOptions);

		this._register(editor.onDidScrollChange((e) => {
			if (this._isHandlingScrollEvent) {
				return;
			}
			if (!e.scrollTopChanged && !e.scrollLeftChanged && !e.scrollHeightChanged) {
				return;
			}
			this._isHandlingScrollEvent = true;
			if (this._currentEditor !== editor) {
				this._currentEditor.setScrollPosition({
					scrollLeft: e.scrollLeft,
					scrollTop: e.scrollTop
				});
			}
			if (this._outputEditor !== editor) {
				this._outputEditor.setScrollPosition({
					scrollLeft: e.scrollLeft,
					scrollTop: e.scrollTop
				});
			}
			if (this._incomingEditor !== editor) {
				this._incomingEditor.setScrollPosition({
					scrollLeft: e.scrollLeft,
					scrollTop: e.scrollTop
				});
			}
			this._isHandlingScrollEvent = false;

			this._layoutOverviewViewport();
		}));

		this._register(editor.onDidChangeViewZones(() => {
			this._onViewZonesChanged();
		}));

		this._register(editor.onDidChangeConfiguration((e) => {
			if (!editor.getModel()) {
				return;
			}
			if (e.hasChanged(EditorOption.fontInfo)) {
				this._updateDecorationsRunner.schedule();
			}
			if (e.hasChanged(EditorOption.wrappingInfo)) {
				this._updateDecorationsRunner.cancel();
				this._updateDecorations();
			}
		}));

		this._register(editor.onDidChangeHiddenAreas(() => {
			this._updateDecorationsRunner.cancel();
			this._updateDecorations();
		}));

		this._register(editor.onDidChangeModelContent(() => {
			if (this._isVisible) {
				this._beginUpdateDecorationsSoon();
			}
		}));

		this._register(editor.onDidChangeModelOptions((e) => {
			if (e.tabSize) {
				this._updateDecorationsRunner.schedule();
			}
		}));

		const isInMergeRightEditorKey = this._contextKeyService.createKey<boolean>('isInMergeEditor', editor.hasWidgetFocus());
		this._register(editor.onDidFocusEditorWidget(() => isInMergeRightEditorKey.set(true)));
		this._register(editor.onDidBlurEditorWidget(() => isInMergeRightEditorKey.set(false)));

		this._register(editor.onDidContentSizeChange(e => {
			const width = this._currentEditor.getContentWidth() + this._outputEditor.getContentWidth() + this._incomingEditor.getContentWidth() + MergeEditorWidget.ENTIRE_DIFF_OVERVIEW_WIDTH;
			const height = Math.max(this._currentEditor.getContentHeight(), this._outputEditor.getContentHeight(), this._incomingEditor.getContentHeight());

			this._onDidContentSizeChange.fire({
				contentHeight: height,
				contentWidth: width,
				contentHeightChanged: e.contentHeightChanged,
				contentWidthChanged: e.contentWidthChanged
			});
		}));

		this._register(editor.onMouseDown(e => this._handleMouseClick(editor, e)));

		return editor;
	}

	private _handleMouseClick(editor: CodeEditorWidget, event: editorBrowser.IEditorMouseEvent) {
		if (!event.event.rightButton && event.target.position && event.target.element?.className.includes('codicon')) {
			console.log(`handling event: `);
			console.log(event);
			const lineNumber = event.target.position.lineNumber;
			const decorationRange = Range.fromPositions({ lineNumber: lineNumber - 1, column: 0 }, event.target.position);
			const modelDecorations = editor.getModel()?.getDecorationsInRange(decorationRange) ?? [];
			for (const { options, range } of modelDecorations) {
				if (options.glyphMarginClassName?.includes('arrow-accept-left')) {
					const merge = this._mergeComputationResult?.merges.find(m => m.hasConflict && m.currentChanges && m.outputStartLineNumber === range.startLineNumber);
					if (merge) {
						merge.state.action = ResolvingAction.AcceptingLeft;
						// Apply changes in reversed order so line numbers stay valid.
						for (const change of [...merge.currentChanges].reverse()) {
							this.applyChangeInOutput(this._currentEditor.getModel()!, change);
						}
						this._outputEditor.pushUndoStop();
						// Transit the state and mark action complete.
						merge.state.conflict = merge.state.conflict === editorCommon.ConflictState.Unresolved ? editorCommon.ConflictState.AppliedLeft : editorCommon.ConflictState.AppliedBoth;
						merge.state.action = undefined;
					}
					event.event.stopPropagation();
					this._updateDecorations();
					return;
				} else if (options.glyphMarginClassName?.includes('arrow-accept-right')) {
					const merge = this._mergeComputationResult?.merges.find(m => m.hasConflict && m.incomingChanges && m.incomingStartLineNumber === range.startLineNumber);
					if (merge) {
						merge.state.action = ResolvingAction.AcceptingRight;
						// Apply changes in reversed order so line numbers stay valid.
						for (const change of [...merge.incomingChanges].reverse()) {
							this.applyChangeInOutput(this._incomingEditor.getModel()!, change);
						}
						this._outputEditor.pushUndoStop();
						// Transit the state and mark action complete.
						merge.state.conflict = merge.state.conflict === editorCommon.ConflictState.Unresolved ? editorCommon.ConflictState.AppliedRight : editorCommon.ConflictState.AppliedBoth;
						merge.state.action = undefined;
					}
					event.event.stopPropagation();
					this._updateDecorations();
					return;
				} else if (options.glyphMarginClassName?.includes('arrow-add-left-after-right')) {
					const merge = this._mergeComputationResult?.merges.find(
						m => m.currentChanges && m.outputStartLineNumber === range.startLineNumber);
					if (merge) {
						merge.state.action = ResolvingAction.AcceptingLeft;
						const offset = Math.max(merge.incomingEndLineNumber - merge.incomingStartLineNumber + 1, 0);
						// Apply changes in reversed order so line numbers stay valid.
						for (const change of [...merge.currentChanges].reverse()) {
							this.applyChangeInOutput(this._currentEditor.getModel()!, change, /* skipUndo= */ false, offset);
						}
						this._outputEditor.pushUndoStop();
						// Transit the state and mark action complete.
						merge.state.conflict = merge.state.conflict === editorCommon.ConflictState.Unresolved ? editorCommon.ConflictState.AppliedLeft : editorCommon.ConflictState.AppliedBoth;
						merge.state.action = undefined;
					}
					event.event.stopPropagation();
					this._updateDecorations();
					return;
				} else if (options.glyphMarginClassName?.includes('arrow-add-right-after-left')) {
					const merge = this._mergeComputationResult?.merges.find(
						m => m.incomingChanges && m.incomingStartLineNumber === range.startLineNumber);
					if (merge) {
						merge.state.action = ResolvingAction.AcceptingRight;
						const offset = Math.max(merge.currentEndLineNumber - merge.currentStartLineNumber + 1, 0);
						// Apply changes in reversed order so line numbers stay valid.
						for (const change of [...merge.incomingChanges].reverse()) {
							this.applyChangeInOutput(this._incomingEditor.getModel()!, change, /* skipUndo= */ false, offset);
						}
						this._outputEditor.pushUndoStop();
						// Transit the state and mark action complete.
						merge.state.conflict = merge.state.conflict === editorCommon.ConflictState.Unresolved ? editorCommon.ConflictState.AppliedRight : editorCommon.ConflictState.AppliedBoth;
						merge.state.action = undefined;
					}
					event.event.stopPropagation();
					this._updateDecorations();
					return;
				}
			}
		}

	}

	protected _createInnerEditor(instantiationService: IInstantiationService, container: HTMLElement, options: Readonly<IEditorConstructionOptions>, editorWidgetOptions: ICodeEditorWidgetOptions): CodeEditorWidget {
		return instantiationService.createInstance(CodeEditorWidget, container, options, editorWidgetOptions);
	}

	public override dispose(): void {
		this._codeEditorService.removeMergeEditor(this);

		if (this._beginUpdateDecorationsTimeout !== -1) {
			window.clearTimeout(this._beginUpdateDecorationsTimeout);
			this._beginUpdateDecorationsTimeout = -1;
		}

		this._cleanViewZonesAndDecorations();

		if (this._currentOverviewRuler) {
			this._overviewDomElement.removeChild(this._currentOverviewRuler.getDomNode());
			this._currentOverviewRuler.dispose();
		}
		if (this._outputOverviewRuler) {
			this._overviewDomElement.removeChild(this._outputOverviewRuler.getDomNode());
			this._outputOverviewRuler.dispose();
		}
		if (this._incomingOverviewRuler) {
			this._overviewDomElement.removeChild(this._incomingOverviewRuler.getDomNode());
			this._incomingOverviewRuler.dispose();
		}
		this._overviewDomElement.removeChild(this._overviewViewportDomElement.domNode);
		if (this._options.renderOverviewRuler) {
			this._containerDomElement.removeChild(this._overviewDomElement);
		}

		this._containerDomElement.removeChild(this._currentDomNode);
		this._currentEditor.dispose();

		this._containerDomElement.removeChild(this._outputDomNode);
		this._outputEditor.dispose();

		this._containerDomElement.removeChild(this._incomingDomNode);
		this._incomingEditor.dispose();

		this._strategy.dispose();

		this._domElement.removeChild(this._containerDomElement);

		this._onDidDispose.fire();

		super.dispose();
	}

	//------------ begin IMergeEditor methods

	public getId(): string {
		return this.getEditorType() + ':' + this._id;
	}

	public getEditorType(): string {
		return editorCommon.EditorType.IMergeEditor;
	}

	public getCurrentLineChanges(): ILineChange[] | null {
		if (!this._mergeComputationResult) {
			return null;
		}
		return this._mergeComputationResult.currentDiff.changes;
	}

	public getIncomingLineChanges(): ILineChange[] | null {
		if (!this._mergeComputationResult) {
			return null;
		}
		return this._mergeComputationResult.incomingDiff.changes;
	}

	public getOutputLineChanges(): ILineChange[] | null {
		if (!this._mergeComputationResult) {
			return null;
		}
		return this._mergeComputationResult.outputDiff.changes;
	}

	public getMergeComputationResult(): IMergeComputationResult | null {
		return this._mergeComputationResult;
	}

	public getCurrentEditor(): editorBrowser.ICodeEditor {
		return this._currentEditor;
	}

	public getOutputEditor(): editorBrowser.ICodeEditor {
		return this._outputEditor;
	}

	public getIncomingEditor(): editorBrowser.ICodeEditor {
		return this._incomingEditor;
	}

	public updateOptions(_newOptions: Readonly<IMergeEditorOptions>): void {
		const newOptions = validateMergeEditorOptions(_newOptions, this._options);
		const changed = changedMergeEditorOptions(this._options, newOptions);
		this._options = newOptions;

		const beginUpdateDecorations = (changed.ignoreTrimWhitespace || changed.renderIndicators);
		const beginUpdateDecorationsSoon = (this._isVisible && (changed.maxComputationTime || changed.maxFileSize));

		if (beginUpdateDecorations) {
			this._beginUpdateDecorations();
		} else if (beginUpdateDecorationsSoon) {
			this._beginUpdateDecorationsSoon();
		}

		this._currentEditor.updateOptions(this._adjustOptionsForSubEditor(_newOptions));
		this._outputEditor.updateOptions(this._adjustOptionsForSubEditor(_newOptions));
		this._incomingEditor.updateOptions(this._adjustOptionsForSubEditor(_newOptions));

		// enableSplitViewResizing
		this._strategy.setEnableSplitViewResizing(this._options.enableSplitViewResizing);

		// renderThreeColumn
		// TODO: add more view modes
		this._setStrategy(new MergeEditorWidgetThreeColumn(this._createDataSource(), this._options.enableSplitViewResizing));
		this._containerDomElement.className = MergeEditorWidget._getClassName(this._themeService.getColorTheme());

		// renderOverviewRuler
		if (changed.renderOverviewRuler) {
			if (this._options.renderOverviewRuler) {
				this._containerDomElement.appendChild(this._overviewDomElement);
			} else {
				this._containerDomElement.removeChild(this._overviewDomElement);
			}
		}
	}

	public getModel(): editorCommon.IMergeEditorModel {
		return {
			commonAncestor: this._commonAncestorModel!,
			current: this._currentEditor.getModel()!,
			output: this._outputEditor.getModel()!,
			incoming: this._incomingEditor.getModel()!,
			state: this._modelState,
		};
	}

	public setModel(model: editorCommon.IMergeEditorModel | null): void {
		// Guard us against partial null model
		if (model && (!model.current || !model.output || !model.incoming || !model.commonAncestor)) {
			throw new Error('MergeEditorWidget.setModel: all models must be defined!');
		}

		// Inherit previous merge progress saved in the model.
		if (model) {
			this._modelState = model.state;
		}

		// Remove all view zones & decorations
		this._cleanViewZonesAndDecorations();

		// Update code editor models
		this._commonAncestorModel = model?.commonAncestor ?? null;
		this._currentEditor.setModel(model ? model.current : null);
		this._outputEditor.setModel(model ? model.output : null);
		this._incomingEditor.setModel(model ? model.incoming : null);
		this._updateDecorationsRunner.cancel();

		// this.originalEditor.onDidChangeModelOptions

		if (model) {
			this._currentEditor.setScrollTop(0);
			this._outputEditor.setScrollTop(0);
			this._incomingEditor.setScrollTop(0);
		}

		// Disable any merge computations that will come in
		this._mergeComputationResult = null;
		this._mergeComputationToken++;
		this._setState(MergeEditorState.Idle);

		if (model) {
			this._recreateOverviewRulers();

			// Repolulate the banners.
			if (this._modelState.currentEditorBanner && this._modelState.outputEditorBanner && this._modelState.incomingEditorBanner && this._modelState.bannerHeight) {
				this.updateBanner(this._modelState.currentEditorBanner, this._modelState.outputEditorBanner, this._modelState.incomingEditorBanner, this._modelState.bannerHeight);
			}

			// Begin comparing
			this._beginUpdateDecorations();
		}

		this._layoutOverviewViewport();
	}

	public getDomNode(): HTMLElement {
		return this._domElement;
	}

	public getVisibleColumnFromPosition(position: IPosition): number {
		return this._outputEditor.getVisibleColumnFromPosition(position);
	}

	public getStatusbarColumn(position: IPosition): number {
		return this._outputEditor.getStatusbarColumn(position);
	}

	public getPosition(): Position | null {
		return this._outputEditor.getPosition();
	}

	public setPosition(position: IPosition): void {
		this._outputEditor.setPosition(position);
	}

	public revealLine(lineNumber: number, scrollType: editorCommon.ScrollType = editorCommon.ScrollType.Smooth): void {
		this._outputEditor.revealLine(lineNumber, scrollType);
	}

	public revealLineInCenter(lineNumber: number, scrollType: editorCommon.ScrollType = editorCommon.ScrollType.Smooth): void {
		this._outputEditor.revealLineInCenter(lineNumber, scrollType);
	}

	public revealLineInCenterIfOutsideViewport(lineNumber: number, scrollType: editorCommon.ScrollType = editorCommon.ScrollType.Smooth): void {
		this._outputEditor.revealLineInCenterIfOutsideViewport(lineNumber, scrollType);
	}

	public revealLineNearTop(lineNumber: number, scrollType: editorCommon.ScrollType = editorCommon.ScrollType.Smooth): void {
		this._outputEditor.revealLineNearTop(lineNumber, scrollType);
	}

	public revealPosition(position: IPosition, scrollType: editorCommon.ScrollType = editorCommon.ScrollType.Smooth): void {
		this._outputEditor.revealPosition(position, scrollType);
	}

	public revealPositionInCenter(position: IPosition, scrollType: editorCommon.ScrollType = editorCommon.ScrollType.Smooth): void {
		this._outputEditor.revealPositionInCenter(position, scrollType);
	}

	public revealPositionInCenterIfOutsideViewport(position: IPosition, scrollType: editorCommon.ScrollType = editorCommon.ScrollType.Smooth): void {
		this._outputEditor.revealPositionInCenterIfOutsideViewport(position, scrollType);
	}

	public revealPositionNearTop(position: IPosition, scrollType: editorCommon.ScrollType = editorCommon.ScrollType.Smooth): void {
		this._outputEditor.revealPositionNearTop(position, scrollType);
	}

	public getSelection(): Selection | null {
		return this._outputEditor.getSelection();
	}

	public getSelections(): Selection[] | null {
		return this._outputEditor.getSelections();
	}

	public setSelection(range: IRange): void;
	public setSelection(editorRange: Range): void;
	public setSelection(selection: ISelection): void;
	public setSelection(editorSelection: Selection): void;
	public setSelection(something: any): void {
		this._outputEditor.setSelection(something);
	}

	public setSelections(ranges: readonly ISelection[]): void {
		this._outputEditor.setSelections(ranges);
	}

	public revealLines(startLineNumber: number, endLineNumber: number, scrollType: editorCommon.ScrollType = editorCommon.ScrollType.Smooth): void {
		this._outputEditor.revealLines(startLineNumber, endLineNumber, scrollType);
	}

	public revealLinesInCenter(startLineNumber: number, endLineNumber: number, scrollType: editorCommon.ScrollType = editorCommon.ScrollType.Smooth): void {
		this._outputEditor.revealLinesInCenter(startLineNumber, endLineNumber, scrollType);
	}

	public revealLinesInCenterIfOutsideViewport(startLineNumber: number, endLineNumber: number, scrollType: editorCommon.ScrollType = editorCommon.ScrollType.Smooth): void {
		this._outputEditor.revealLinesInCenterIfOutsideViewport(startLineNumber, endLineNumber, scrollType);
	}

	public revealLinesNearTop(startLineNumber: number, endLineNumber: number, scrollType: editorCommon.ScrollType = editorCommon.ScrollType.Smooth): void {
		this._outputEditor.revealLinesNearTop(startLineNumber, endLineNumber, scrollType);
	}

	public revealRange(range: IRange, scrollType: editorCommon.ScrollType = editorCommon.ScrollType.Smooth, revealVerticalInCenter: boolean = false, revealHorizontal: boolean = true): void {
		this._outputEditor.revealRange(range, scrollType, revealVerticalInCenter, revealHorizontal);
	}

	public revealRangeInCenter(range: IRange, scrollType: editorCommon.ScrollType = editorCommon.ScrollType.Smooth): void {
		this._outputEditor.revealRangeInCenter(range, scrollType);
	}

	public revealRangeInCenterIfOutsideViewport(range: IRange, scrollType: editorCommon.ScrollType = editorCommon.ScrollType.Smooth): void {
		this._outputEditor.revealRangeInCenterIfOutsideViewport(range, scrollType);
	}

	public revealRangeNearTop(range: IRange, scrollType: editorCommon.ScrollType = editorCommon.ScrollType.Smooth): void {
		this._outputEditor.revealRangeNearTop(range, scrollType);
	}

	public revealRangeNearTopIfOutsideViewport(range: IRange, scrollType: editorCommon.ScrollType = editorCommon.ScrollType.Smooth): void {
		this._outputEditor.revealRangeNearTopIfOutsideViewport(range, scrollType);
	}

	public revealRangeAtTop(range: IRange, scrollType: editorCommon.ScrollType = editorCommon.ScrollType.Smooth): void {
		this._outputEditor.revealRangeAtTop(range, scrollType);
	}

	public getSupportedActions(): editorCommon.IEditorAction[] {
		return this._outputEditor.getSupportedActions();
	}

	public saveViewState(): editorCommon.IMergeEditorViewState {
		const currentViewState = this._currentEditor.saveViewState();
		const outputViewState = this._outputEditor.saveViewState();
		const incomingViewState = this._incomingEditor.saveViewState();
		return {
			current: currentViewState,
			output: outputViewState,
			incoming: incomingViewState
		};
	}

	public restoreViewState(s: editorCommon.IMergeEditorViewState): void {
		if (s && s.current && s.output && s.incoming) {
			const mergeEditorState = <editorCommon.IMergeEditorViewState>s;
			this._currentEditor.restoreViewState(mergeEditorState.current);
			this._outputEditor.restoreViewState(mergeEditorState.output);
			this._incomingEditor.restoreViewState(mergeEditorState.incoming);
		}
	}

	public layout(dimension?: IDimension): void {
		this._elementSizeObserver.observe(dimension);
	}

	public focus(): void {
		this._outputEditor.focus();
	}

	public hasTextFocus(): boolean {
		return this._currentEditor.hasTextFocus() || this._outputEditor.hasTextFocus() || this._incomingEditor.hasTextFocus();
	}

	public onVisible(): void {
		this._isVisible = true;
		this._currentEditor.onVisible();
		this._outputEditor.onVisible();
		this._incomingEditor.onVisible();
		// Begin comparing
		this._beginUpdateDecorations();
	}

	public onHide(): void {
		this._isVisible = false;
		this._currentEditor.onHide();
		this._outputEditor.onHide();
		this._incomingEditor.onHide();
		// Remove all view zones & decorations
		this._cleanViewZonesAndDecorations();
	}

	public trigger(source: string | null | undefined, handlerId: string, payload: any): void {
		this._outputEditor.trigger(source, handlerId, payload);
	}

	public changeDecorations(callback: (changeAccessor: IModelDecorationsChangeAccessor) => any): any {
		return this._outputEditor.changeDecorations(callback);
	}

	updateBanner(currentBanner: HTMLElement, outputBanner: HTMLElement, incomingBanner: HTMLElement, height = 18): void {
		this._currentEditor.setBanner(currentBanner, height);
		this._outputEditor.setBanner(outputBanner, height);
		this._incomingEditor.setBanner(incomingBanner, height);
		this._bannerHeight = height;

		// Update the model state, so that the banner remains when switching tabs.
		this._modelState.currentEditorBanner = currentBanner;
		this._modelState.outputEditorBanner = outputBanner;
		this._modelState.incomingEditorBanner = incomingBanner;
		this._modelState.bannerHeight = height;

		this._layoutOverviewRulers();
	}

	public createDecorationsCollection(): editorCommon.IEditorDecorationsCollection {
		return this._outputEditor.createDecorationsCollection();
	}

	//------------ end IMergeEditor methods



	//------------ begin layouting methods

	private _onDidContainerSizeChanged(): void {
		this._doLayout();
	}

	private _getReviewHeight(): number {
		// TODO: review panel
		return 0;
	}

	private _getBannerHeight(): number {
		return this._bannerHeight ?? 0;
	}

	private _layoutOverviewRulers(): void {
		if (!this._options.renderOverviewRuler) {
			return;
		}

		if (!this._currentOverviewRuler || !this._outputOverviewRuler || !this._incomingOverviewRuler) {
			return;
		}
		const height = this._elementSizeObserver.getHeight();
		const reviewHeight = this._getReviewHeight();
		const bannerHeight = this._getBannerHeight();

		const freeSpace = MergeEditorWidget.ENTIRE_DIFF_OVERVIEW_WIDTH - (3 * MergeEditorWidget.ONE_OVERVIEW_WIDTH);
		const layoutInfo = this._outputEditor.getLayoutInfo();
		if (layoutInfo) {
			this._currentOverviewRuler.setLayout({
				top: bannerHeight,
				width: MergeEditorWidget.ONE_OVERVIEW_WIDTH,
				right: freeSpace + 2 * MergeEditorWidget.ONE_OVERVIEW_WIDTH,
				height: (height - reviewHeight - bannerHeight)
			});
			this._outputOverviewRuler.setLayout({
				top: bannerHeight,
				width: MergeEditorWidget.ONE_OVERVIEW_WIDTH,
				right: freeSpace + MergeEditorWidget.ONE_OVERVIEW_WIDTH,
				height: (height - reviewHeight - bannerHeight)
			});
			this._incomingOverviewRuler.setLayout({
				top: bannerHeight,
				right: 0,
				width: MergeEditorWidget.ONE_OVERVIEW_WIDTH,
				height: (height - reviewHeight - bannerHeight)
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
		this._beginUpdateDecorationsTimeout = window.setTimeout(() => this._beginUpdateDecorations(), MergeEditorWidget.UPDATE_DIFF_DECORATIONS_DELAY);
	}

	private _lastCurrentWarning: URI | null = null;
	private _lastOutputWarning: URI | null = null;
	private _lastIncomingWarning: URI | null = null;

	private static _equals(a: URI | null, b: URI | null): boolean {
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
		const commonAncestorModel = this._commonAncestorModel;
		const currentModel = this._currentEditor.getModel();
		const outputModel = this._outputEditor.getModel();
		const incomingModel = this._incomingEditor.getModel();
		if (!currentModel || !outputModel || !incomingModel || !commonAncestorModel) {
			return;
		}

		// Prevent old merge requests to come if a new request has been initiated
		// The best method would be to call cancel on the Promise, but this is not
		// yet supported, so using tokens for now.
		this._mergeComputationToken++;
		const currentToken = this._mergeComputationToken;

		const mergeLimit = this._options.maxFileSize * 1024 * 1024; // MB
		const canSyncModelForMerge = (model: ITextModel): boolean => {
			const bufferTextLength = model.getValueLength();
			return (mergeLimit === 0 || bufferTextLength <= mergeLimit);
		};

		if (!canSyncModelForMerge(currentModel) || !canSyncModelForMerge(outputModel) || !canSyncModelForMerge(incomingModel)) {
			if (
				!MergeEditorWidget._equals(currentModel.uri, this._lastCurrentWarning)
				|| !MergeEditorWidget._equals(outputModel.uri, this._lastOutputWarning)
				|| !MergeEditorWidget._equals(incomingModel.uri, this._lastIncomingWarning)
			) {
				this._lastCurrentWarning = currentModel.uri;
				this._lastOutputWarning = outputModel.uri;
				this._lastIncomingWarning = incomingModel.uri;
				this._notificationService.warn(nls.localize("merge.tooLarge", "Cannot compare files because one file is too large."));
			}
			return;
		}

		this._setState(MergeEditorState.ComputingDiff);

		if (!this._mergeComputationResult) {
			// No merge computation. Needs to compute the initial diffs of current and incoming branches with respect to the common ancestor.
			const currentDiffPromise = this._editorWorkerService.computeDiff(commonAncestorModel.uri, currentModel.uri, this._options.ignoreTrimWhitespace, this._options.maxComputationTime);
			const incomingDiffPromise = this._editorWorkerService.computeDiff(commonAncestorModel.uri, incomingModel.uri, this._options.ignoreTrimWhitespace, this._options.maxComputationTime);
			const outputDiffPromise = this._editorWorkerService.computeDiff(commonAncestorModel.uri, outputModel.uri, this._options.ignoreTrimWhitespace, this._options.maxComputationTime);
			Promise.all([currentDiffPromise, incomingDiffPromise, outputDiffPromise]).then(([currentDiff, incomingDiff, outputDiff]) => {
				if (!currentDiff || !incomingDiff || !outputDiff) {
					this._mergeComputationResult = null;
				} else {
					const initialRegions = mergeInitialChanges(currentDiff.changes, incomingDiff.changes, currentModel, incomingModel);
					if (this._modelState.initialized) {
						// Inherit previously resolved regions, if the model was initialized before the current widget's life cycle.
						for (const region of this._modelState.resolvedRegions) {
							initialRegions[region.index].hasConflict = false;
						}
					}
					const merges = mergeDynamicChanges(initialRegions, outputDiff.changes, currentDiff.changes, incomingDiff.changes);
					this._mergeComputationResult = { currentDiff, incomingDiff, initialRegions, outputDiff, merges };
					if (!this._modelState.initialized) {
						// Only apply non conflicting changes if the model is being initialized in the current widget's life cycle.
						this.applyAllNonConflictChanges(initialRegions);
						this._modelState.initialized = true;
					}
				}
				this._setState(MergeEditorState.DiffComputed);
				this._updateDecorationsRunner.schedule();
				this._onDidUpdateDiff.fire();
			}, (error) => {
				if (currentToken === this._mergeComputationToken
					&& outputModel === this._outputEditor.getModel()
					&& currentModel === this._currentEditor.getModel()
					&& incomingModel === this._incomingEditor.getModel()
				) {
					// TODO: handle errors
					console.log('Fail to compute initial diff, will retry later.');
					this._setState(MergeEditorState.DiffComputed);
					this._mergeComputationResult = null;
					this._updateDecorationsRunner.schedule();
				}
			});
		} else {
			// Initial computations were done. Needs only to merge with the output diff result.
			this._editorWorkerService.computeDiff(commonAncestorModel.uri, outputModel.uri, this._options.ignoreTrimWhitespace, this._options.maxComputationTime)
				.then(outputDiff => {
					if (currentToken === this._mergeComputationToken
						&& outputModel === this._outputEditor.getModel()
						&& currentModel === this._currentEditor.getModel()
						&& incomingModel === this._incomingEditor.getModel()
					) {
						// If output diff was successfully produced, merge it with previous merge computation result.
						if (outputDiff && this._mergeComputationResult) {
							const merges = mergeDynamicChanges(this._mergeComputationResult.initialRegions, outputDiff.changes, this._mergeComputationResult.currentDiff.changes, this._mergeComputationResult.incomingDiff.changes);
							this._mergeComputationResult.outputDiff = outputDiff;
							this._mergeComputationResult.merges = merges;
						}
						this._setState(MergeEditorState.DiffComputed);
						this._updateDecorationsRunner.schedule();
						this._onDidUpdateDiff.fire();
					}
				}, (error) => {
					// TODO: handle errors
					console.log('Fail to compute output diff, will retry later.');
					if (currentToken === this._mergeComputationToken
						&& outputModel === this._outputEditor.getModel()
						&& currentModel === this._currentEditor.getModel()
						&& incomingModel === this._incomingEditor.getModel()
					) {
						this._setState(MergeEditorState.DiffComputed);
						this._updateDecorationsRunner.schedule();
					}
				});
		}
	}

	private _cleanViewZonesAndDecorations(): void {
		this._currentEditorState.clean(this._currentEditor);
		this._outputEditorState.clean(this._outputEditor);
		this._incomingEditorState.clean(this._incomingEditor);
	}

	private _updateDecorations(): void {
		if (!this._currentEditor.getModel() || !this._outputEditor.getModel() || !this._incomingEditor.getModel()) {
			return;
		}

		const merges = this._mergeComputationResult?.merges ?? [];

		const foreignCurrent = this._currentEditorState.getForeignViewZones(this._currentEditor.getWhitespaces());
		const foreignOutput = this._outputEditorState.getForeignViewZones(this._outputEditor.getWhitespaces());
		const foreignIncoming = this._incomingEditorState.getForeignViewZones(this._incomingEditor.getWhitespaces());

		const mergeDecorations = this._strategy.getEditorsMergeDecorations(merges, this._options.ignoreTrimWhitespace, this._options.renderIndicators, foreignCurrent, foreignOutput, foreignIncoming);

		try {
			this._currentlyChangingViewZones = true;
			this._currentEditorState.apply(this._currentEditor, this._currentOverviewRuler, mergeDecorations.current, /* restoreScrollState= */ false);
			this._incomingEditorState.apply(this._incomingEditor, this._incomingOverviewRuler, mergeDecorations.incoming, /* restoreScrollState= */ false);
			this._outputEditorState.apply(this._outputEditor, this._outputOverviewRuler, mergeDecorations.output, /* restoreScrollState= */ true);
		} finally {
			this._currentlyChangingViewZones = false;
		}
	}

	private _adjustOptionsForSubEditor(options: Readonly<IMergeEditorConstructionOptions>): IEditorConstructionOptions {
		const clonedOptions = { ...options };
		clonedOptions.inMergeEditor = true;
		clonedOptions.automaticLayout = false;
		// Clone scrollbar options before changing them
		clonedOptions.scrollbar = { ...(clonedOptions.scrollbar || {}) };
		clonedOptions.scrollbar.vertical = 'visible';
		clonedOptions.folding = false;
		clonedOptions.fixedOverflowWidgets = true;
		// clonedOptions.lineDecorationsWidth = '2ch';
		// Clone minimap options before changing them
		clonedOptions.minimap = { ...(clonedOptions.minimap || {}) };
		clonedOptions.minimap.enabled = false;
		return clonedOptions;
	}

	/* TODO: adjust options
	private _adjustOptionsForLeftHandSide(options: Readonly<editorBrowser.IDiffEditorConstructionOptions>): IEditorConstructionOptions {
		const result = this._adjustOptionsForSubEditor(options);
		if (!this._options.renderSideBySide) {
			// never wrap hidden editor
			result.wordWrapOverride1 = 'off';
		} else {
			result.wordWrapOverride1 = this._options.diffWordWrap;
		}
		if (options.originalAriaLabel) {
			result.ariaLabel = options.originalAriaLabel;
		}
		result.readOnly = !this._options.originalEditable;
		result.extraEditorClassName = 'original-in-monaco-diff-editor';
		return {
			...result,
			dimension: {
				height: 0,
				width: 0
			}
		};
	}

	private _adjustOptionsForRightHandSide(options: Readonly<editorBrowser.IDiffEditorConstructionOptions>): IEditorConstructionOptions {
		const result = this._adjustOptionsForSubEditor(options);
		if (options.modifiedAriaLabel) {
			result.ariaLabel = options.modifiedAriaLabel;
		}

		result.wordWrapOverride1 = this._options.diffWordWrap;
		result.revealHorizontalRightPadding = EditorOptions.revealHorizontalRightPadding.defaultValue + DiffEditorWidget.ENTIRE_DIFF_OVERVIEW_WIDTH;
		result.scrollbar!.verticalHasArrows = false;
		result.extraEditorClassName = 'modified-in-monaco-diff-editor';
		return {
			...result,
			dimension: {
				height: 0,
				width: 0
			}
		};
	}
	*/

	public doLayout(): void {
		this._elementSizeObserver.observe();
		this._doLayout();
	}

	private _doLayout(): void {
		const width = this._elementSizeObserver.getWidth();
		const height = this._elementSizeObserver.getHeight();
		const reviewHeight = this._getReviewHeight();

		const [leftSplitPoint, rightSplitPoint] = this._strategy.layout();

		this._currentDomNode.style.width = leftSplitPoint + 'px';
		this._currentDomNode.style.left = '0px';

		this._outputDomNode.style.width = (rightSplitPoint - leftSplitPoint) + 'px';
		this._outputDomNode.style.left = leftSplitPoint + 'px';

		this._incomingDomNode.style.width = (width - rightSplitPoint) + 'px';
		this._incomingDomNode.style.left = rightSplitPoint + 'px';

		this._overviewDomElement.style.top = '0px';
		this._overviewDomElement.style.height = (height - reviewHeight) + 'px';
		this._overviewDomElement.style.width = MergeEditorWidget.ENTIRE_DIFF_OVERVIEW_WIDTH + 'px';
		this._overviewDomElement.style.left = (width - MergeEditorWidget.ENTIRE_DIFF_OVERVIEW_WIDTH) + 'px';
		this._overviewViewportDomElement.setWidth(MergeEditorWidget.ENTIRE_DIFF_OVERVIEW_WIDTH);
		this._overviewViewportDomElement.setHeight(30);

		this._currentEditor.layout({ width: leftSplitPoint, height: (height - reviewHeight) });
		this._outputEditor.layout({ width: rightSplitPoint - leftSplitPoint, height: (height - reviewHeight) });
		this._incomingEditor.layout({ width: width - rightSplitPoint - (this._options.renderOverviewRuler ? MergeEditorWidget.ENTIRE_DIFF_OVERVIEW_WIDTH : 0), height: (height - reviewHeight) });

		if (this._currentOverviewRuler || this._outputOverviewRuler || this._incomingOverviewRuler) {
			this._layoutOverviewRulers();
		}

		this._layoutOverviewViewport();
	}

	private _layoutOverviewViewport(): void {
		const layout = this._computeOverviewViewport();
		if (!layout) {
			this._overviewViewportDomElement.setTop(0);
			this._overviewViewportDomElement.setHeight(0);
		} else {
			this._overviewViewportDomElement.setTop(layout.top);
			this._overviewViewportDomElement.setHeight(layout.height);
		}
	}

	private _computeOverviewViewport(): { height: number; top: number } | null {
		const layoutInfo = this._outputEditor.getLayoutInfo();
		if (!layoutInfo) {
			return null;
		}

		const scrollTop = this._outputEditor.getScrollTop();
		const scrollHeight = this._outputEditor.getScrollHeight();

		const computedAvailableSize = Math.max(0, layoutInfo.height);
		const computedRepresentableSize = Math.max(0, computedAvailableSize - 2 * 0);
		const computedRatio = scrollHeight > 0 ? (computedRepresentableSize / scrollHeight) : 0;

		const computedSliderSize = Math.max(0, Math.floor(layoutInfo.height * computedRatio));
		const computedSliderPosition = Math.floor(scrollTop * computedRatio);

		return {
			height: computedSliderSize,
			top: computedSliderPosition
		};
	}

	private _createDataSource(): IDataSource {
		return {
			getWidth: () => {
				return this._elementSizeObserver.getWidth();
			},

			getHeight: () => {
				return (this._elementSizeObserver.getHeight() - this._getReviewHeight());
			},

			getOptions: () => {
				return {
					renderOverviewRuler: this._options.renderOverviewRuler
				};
			},

			getContainerDomNode: () => {
				return this._containerDomElement;
			},

			relayoutEditors: () => {
				this._doLayout();
			},

			getCurrentEditor: () => {
				return this._currentEditor;
			},

			getOutputEditor: () => {
				return this._outputEditor;
			},

			getIncomingEditor: () => {
				return this._incomingEditor;
			}
		};
	}

	private _setStrategy(newStrategy: MergeEditorWidgetStyle): void {
		if (this._strategy) {
			this._strategy.dispose();
		}

		this._strategy = newStrategy;
		newStrategy.applyColors(this._themeService.getColorTheme());

		if (this._mergeComputationResult) {
			this._updateDecorations();
		}

		// Just do a layout, the strategy might need it
		this._doLayout();
	}

	applyAllNonConflictChanges(regions: IMerge[]) {
		const current = this._currentEditor.getModel();
		const incoming = this._incomingEditor.getModel();

		if (!current || !incoming) {
			return;
		}

		// apply backwardsly, so that line numbers won't interfere
		for (const region of [...regions].reverse()) {
			if (region.hasConflict) {
				// skip conflict
				continue;
			}
			if (region.currentChanges.length > 0) {
				for (const change of region.currentChanges) {
					this.applyChangeInOutput(current, change, /* skipUndo= */ true);
				}
			} else {
				for (const change of region.incomingChanges) {
					this.applyChangeInOutput(incoming, change, /* skipUndo= */ true);
				}
			}
		}
	}

	/**
	 * Takes a change from common ancestor to modified version (current or
	 * incoming branch), apply the change to output editor.
	 */
	applyChangeInOutput(modified: ITextModel, change: IChange, skipUndo: boolean = false, lineOffset: number = 0) {
		const outputDiff = this._mergeComputationResult?.outputDiff;
		const outputEditor = this._outputEditor;
		const outputModel = this._outputEditor.getModel();
		if (!outputDiff || !this._commonAncestorModel || !outputModel) {
			return;
		}
		const eol = outputModel.getEOL();

		const applyEdit = (edits: IIdentifiedSingleEditOperation[]) => {
			if (skipUndo) {
				// use model.applyEdits to skip the undo stack
				outputModel.applyEdits(edits);
			} else {
				outputEditor.executeEdits('mergeEditor', edits);
			}
		};

		// insert
		if (change.originalEndLineNumber === 0 || lineOffset > 0) {
			// If the change was an insert, it's identified by the line above.
			// Therefore it is not captured by getEquivalentLineForOriginalLineNumber;
			// But if the change was not an insert, it's identified by the start line.
			// Which will be considered in getEquivalentLineForOriginalLineNumber.
			// An offset is in this case not necessary.
			lineOffset = change.originalEndLineNumber === 0 ? lineOffset : 0;
			const outputStart = getEquivalentLineForOriginalLineNumber(outputDiff.changes, change.originalStartLineNumber) + lineOffset;
			const insertAt = outputStart > 0 ? new Position(outputStart, outputModel.getLineMaxColumn(outputStart)) : new Position(1, 1);
			const text = modified.getValueInRange(new Range(
				change.modifiedStartLineNumber,
				1,
				change.modifiedEndLineNumber,
				modified.getLineMaxColumn(change.modifiedEndLineNumber)));
			applyEdit([{
				range: Range.fromPositions(insertAt, insertAt),
				text: outputStart > 0 ? eol + text : text + eol,
			}]);
			return;
		}

		// delete
		if (change.modifiedEndLineNumber === 0) {
			let outputStart = getEquivalentLineForOriginalLineNumber(outputDiff.changes, change.originalStartLineNumber);
			let startColumn = 1;
			let outputEnd = getEquivalentLineForOriginalLineNumber(outputDiff.changes, change.originalEndLineNumber);
			let endColumn = outputModel.getLineMaxColumn(outputEnd);
			if (outputStart > 1) {
				outputStart = outputStart - 1;
				startColumn = outputModel.getLineMaxColumn(outputStart);
			} else if (outputEnd < outputModel.getLineCount()) {
				outputEnd = outputEnd + 1;
				endColumn = 1;
			}
			applyEdit([{
				range: new Range(outputStart, startColumn, outputEnd, endColumn),
				text: '',
			}]);
			return;
		}

		// modified
		const outputStart = getEquivalentLineForOriginalLineNumber(outputDiff.changes, change.originalStartLineNumber);
		const outputEnd = getEquivalentLineForOriginalLineNumber(outputDiff.changes, change.originalEndLineNumber);
		const text = modified.getValueInRange(new Range(
			change.modifiedStartLineNumber,
			1,
			change.modifiedEndLineNumber,
			modified.getLineMaxColumn(change.modifiedEndLineNumber),
		));
		applyEdit([{
			range: new Range(outputStart, 1, outputEnd, outputModel.getLineMaxColumn(outputEnd)),
			text,
		}]);
		return;
	}
}

interface IDataSource {
	getWidth(): number;
	getHeight(): number;
	getOptions(): { renderOverviewRuler: boolean };
	getContainerDomNode(): HTMLElement;
	relayoutEditors(): void;

	getCurrentEditor(): CodeEditorWidget;
	getOutputEditor(): CodeEditorWidget;
	getIncomingEditor(): CodeEditorWidget;
}

abstract class MergeEditorWidgetStyle extends Disposable {

	protected _dataSource: IDataSource;
	protected _insertColor: Color | null;
	protected _removeColor: Color | null;
	protected _conflictColor: Color | null;

	constructor(dataSource: IDataSource) {
		super();
		this._dataSource = dataSource;
		this._insertColor = null;
		this._removeColor = null;
		this._conflictColor = null;
	}

	public applyColors(theme: IColorTheme): boolean {
		const newInsertColor = (theme.getColor(diffInserted) || defaultInsertColor).transparent(2);
		const newRemoveColor = (theme.getColor(diffRemoved) || defaultRemoveColor).transparent(2);
		const newConflictColor = (theme.getColor(mergeConflict) || defaultRemoveColor).transparent(2);
		const hasChanges = !newInsertColor.equals(this._insertColor) || !newRemoveColor.equals(this._removeColor) || !newConflictColor.equals(this._conflictColor);
		this._insertColor = newInsertColor;
		this._removeColor = newRemoveColor;
		this._conflictColor = newConflictColor;
		return hasChanges;
	}

	public getEditorsMergeDecorations(merges: IMerge[], ignoreTrimWhitespace: boolean, renderIndicators: boolean, currentWhitespaces: IEditorWhitespace[], outputWhitespaces: IEditorWhitespace[], incomingWhitespaces: IEditorWhitespace[]): IEditorsMergeDecorationsWithZones {
		// Get view zones
		currentWhitespaces = currentWhitespaces.sort((a, b) => {
			return a.afterLineNumber - b.afterLineNumber;
		});
		outputWhitespaces = outputWhitespaces.sort((a, b) => {
			return a.afterLineNumber - b.afterLineNumber;
		});
		incomingWhitespaces = incomingWhitespaces.sort((a, b) => {
			return a.afterLineNumber - b.afterLineNumber;
		});
		const zones = this._getViewZones(merges, currentWhitespaces, outputWhitespaces, incomingWhitespaces, renderIndicators);

		// Get decorations & overview ruler zones
		const currentDecorations = this._getCurrentEditorDecorations(merges, ignoreTrimWhitespace, renderIndicators);
		const outputDecorations = this._getOutputEditorDecorations(merges, ignoreTrimWhitespace, renderIndicators);
		const incomingDecorations = this._getIncomingEditorDecorations(merges, ignoreTrimWhitespace, renderIndicators);

		return {
			current: {
				decorations: currentDecorations.decorations,
				overviewZones: currentDecorations.overviewZones,
				zones: zones.current
			},
			output: {
				decorations: outputDecorations.decorations,
				overviewZones: outputDecorations.overviewZones,
				zones: zones.output
			},
			incoming: {
				decorations: incomingDecorations.decorations,
				overviewZones: incomingDecorations.overviewZones,
				zones: zones.incoming
			}
		};
	}

	protected abstract _getViewZones(merges: IMerge[], currentForeignVZ: IEditorWhitespace[], outputForeignVZ: IEditorWhitespace[], incomingForeignVZ: IEditorWhitespace[], renderIndicators: boolean): IEditorsZones;
	protected abstract _getCurrentEditorDecorations(merges: IMerge[], ignoreTrimWhitespace: boolean, renderIndicators: boolean): IEditorDiffDecorations;
	protected abstract _getOutputEditorDecorations(merges: IMerge[], ignoreTrimWhitespace: boolean, renderIndicators: boolean): IEditorDiffDecorations;
	protected abstract _getIncomingEditorDecorations(merges: IMerge[], ignoreTrimWhitespace: boolean, renderIndicators: boolean): IEditorDiffDecorations;

	public abstract setEnableSplitViewResizing(enableSplitViewResizing: boolean): void;
	public abstract layout(): number[];
}

interface IMyViewZone {
	shouldNotShrink?: boolean;
	afterLineNumber: number;
	afterColumn?: number;
	heightInLines: number;
	minWidthInPx?: number;
	domNode: HTMLElement | null;
	marginDomNode?: HTMLElement | null;
}

class ForeignViewZonesIterator {

	private _index: number;
	private readonly _source: IEditorWhitespace[];
	public current: IEditorWhitespace | null;

	constructor(source: IEditorWhitespace[]) {
		this._source = source;
		this._index = -1;
		this.current = null;
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

	constructor(
		private readonly _merges: IMerge[],
		private readonly _currentForeignVZ: IEditorWhitespace[],
		private readonly _outputForeignVZ: IEditorWhitespace[],
		private readonly _incomingForeignVZ: IEditorWhitespace[],
		protected readonly _currentEditor: CodeEditorWidget,
		protected readonly _outputEditor: CodeEditorWidget,
		protected readonly _incomingEditor: CodeEditorWidget,
	) {
	}

	private static _getViewLineCount(editor: CodeEditorWidget, startLineNumber: number, endLineNumber: number): number {
		const model = editor.getModel();
		const viewModel = editor._getViewModel();
		if (model && viewModel) {
			const viewRange = getViewRange(model, viewModel, startLineNumber, endLineNumber);
			return (viewRange.endLineNumber - viewRange.startLineNumber + 1);
		}

		return (endLineNumber - startLineNumber + 1);
	}

	public getViewZones(): IEditorsZones {
		const currentLineHeight = this._currentEditor.getOption(EditorOption.lineHeight);
		const outputLineHeight = this._outputEditor.getOption(EditorOption.lineHeight);
		const incomingLineHeight = this._incomingEditor.getOption(EditorOption.lineHeight);

		const result: { current: IMyViewZone[]; output: IMyViewZone[]; incoming: IMyViewZone[] } = {
			current: [],
			output: [],
			incoming: []
		};

		let mergeCurrentLength: number = 0;
		let mergeOutputLength: number = 0;
		let mergeIncomingLength: number = 0;
		let currentEquivalentLineNumber: number = 0;
		let outputEquivalentLineNumber: number = 0;
		let incomingEquivalentLineNumber: number = 0;
		let currentEndEquivalentLineNumber: number = 0;
		let outputEndEquivalentLineNumber: number = 0;
		let incomingEndEquivalentLineNumber: number = 0;

		const sortMyViewZones = (a: IMyViewZone, b: IMyViewZone) => {
			return a.afterLineNumber - b.afterLineNumber;
		};

		const addAndCombineIfPossible = (destination: IMyViewZone[], item: IMyViewZone) => {
			if (item.domNode === null && destination.length > 0) {
				const lastItem = destination[destination.length - 1];
				if (lastItem.afterLineNumber === item.afterLineNumber && lastItem.domNode === null) {
					lastItem.heightInLines += item.heightInLines;
					return;
				}
			}
			destination.push(item);
		};

		const addAndMaxIfPossible = (destination: IMyViewZone[], item: IMyViewZone) => {
			if (item.domNode === null && destination.length > 0) {
				const lastItem = destination[destination.length - 1];
				if (lastItem.afterLineNumber === item.afterLineNumber && lastItem.domNode === null) {
					lastItem.heightInLines = Math.max(item.heightInLines, lastItem.heightInLines);
					return;
				}
			}
			destination.push(item);
		};

		const currentForeignVZ = new ForeignViewZonesIterator(this._currentForeignVZ);
		const outputForeignVZ = new ForeignViewZonesIterator(this._outputForeignVZ);
		const incomingForeignVZ = new ForeignViewZonesIterator(this._incomingForeignVZ);

		// In order to include foreign view zones after the last merge, the for loop will iterate once more after the end of the `merges` array
		for (let i = 0, length = this._merges.length; i <= length; i++) {
			const merge = (i < length ? this._merges[i] : null);
			if (merge !== null) {
				// Get the line *before* the region.
				currentEquivalentLineNumber = merge.currentStartLineNumber + (merge.currentEndLineNumber > 0 ? -1 : 0);
				incomingEquivalentLineNumber = merge.incomingStartLineNumber + (merge.incomingEndLineNumber > 0 ? -1 : 0);
				outputEquivalentLineNumber = merge.outputStartLineNumber + (merge.outputEndLineNumber > 0 ? -1 : 0);

				// Get the length of the regions.
				mergeCurrentLength = (merge.currentEndLineNumber > 0 ? ViewZonesComputer._getViewLineCount(this._currentEditor, merge.currentStartLineNumber, merge.currentEndLineNumber) : 0);
				mergeIncomingLength = (merge.incomingEndLineNumber > 0 ? ViewZonesComputer._getViewLineCount(this._incomingEditor, merge.incomingStartLineNumber, merge.incomingEndLineNumber) : 0);
				mergeOutputLength = (merge.outputEndLineNumber > 0 ? ViewZonesComputer._getViewLineCount(this._outputEditor, merge.outputStartLineNumber, merge.outputEndLineNumber) : 0);

				// Get the end line of the region.
				currentEndEquivalentLineNumber = Math.max(merge.currentStartLineNumber, merge.currentEndLineNumber);
				incomingEndEquivalentLineNumber = Math.max(merge.incomingStartLineNumber, merge.incomingEndLineNumber);
				outputEndEquivalentLineNumber = Math.max(merge.outputStartLineNumber, merge.outputEndLineNumber);
			} else {
				// Increase to very large value to get the producing tests of foreign view zones running
				currentEquivalentLineNumber += 10000000 + mergeCurrentLength;
				incomingEquivalentLineNumber += 10000000 + mergeIncomingLength;
				outputEquivalentLineNumber += 10000000 + mergeOutputLength;
				currentEndEquivalentLineNumber = currentEquivalentLineNumber;
				incomingEndEquivalentLineNumber = incomingEquivalentLineNumber;
				outputEndEquivalentLineNumber = outputEquivalentLineNumber;
			}

			// Each step produces view zones, and after producing them, we try to cancel them out, to avoid empty-empty view zone cases
			let stepCurrent: IMyViewZone[] = [];
			let stepIncoming: IMyViewZone[] = [];
			let stepOutput: IMyViewZone[] = [];

			// ---------------------------- PRODUCE VIEW ZONES

			/*
			// [PRODUCE] View zones due to line mapping differences (equal lines but wrapped differently)
			// TODO: support line wrapping
			if (hasWrapping) {
				let count: number;
				if (lineChange) {
					if (lineChange.originalEndLineNumber > 0) {
						count = lineChange.originalStartLineNumber - lastOriginalLineNumber;
					} else {
						count = lineChange.modifiedStartLineNumber - lastModifiedLineNumber;
					}
				} else {
					count = originalModel.getLineCount() - lastOriginalLineNumber;
				}

				for (let i = 0; i < count; i++) {
					const originalLineNumber = lastOriginalLineNumber + i;
					const modifiedLineNumber = lastModifiedLineNumber + i;

					const originalViewLineCount = originalCoordinatesConverter.getModelLineViewLineCount(originalLineNumber);
					const modifiedViewLineCount = modifiedCoordinatesConverter.getModelLineViewLineCount(modifiedLineNumber);

					if (originalViewLineCount < modifiedViewLineCount) {
						stepOriginal.push({
							afterLineNumber: originalLineNumber,
							heightInLines: modifiedViewLineCount - originalViewLineCount,
							domNode: null,
							marginDomNode: null
						});
					} else if (originalViewLineCount > modifiedViewLineCount) {
						stepModified.push({
							afterLineNumber: modifiedLineNumber,
							heightInLines: originalViewLineCount - modifiedViewLineCount,
							domNode: null,
							marginDomNode: null
						});
					}
				}
				if (lineChange) {
					lastOriginalLineNumber = (lineChange.originalEndLineNumber > 0 ? lineChange.originalEndLineNumber : lineChange.originalStartLineNumber) + 1;
					lastModifiedLineNumber = (lineChange.modifiedEndLineNumber > 0 ? lineChange.modifiedEndLineNumber : lineChange.modifiedStartLineNumber) + 1;
				}
			}

			*/

			// [PRODUCE] View zone(s) due to foreign view zone(s) in middle
			while (outputForeignVZ.current && outputForeignVZ.current.afterLineNumber <= outputEndEquivalentLineNumber) {
				// Start of the view zones.
				let currentVZLineNumber: number;
				let incomingVZLineNumber: number;
				if (outputForeignVZ.current.afterLineNumber <= outputEquivalentLineNumber) {
					// If the view zone is before the current region.
					currentVZLineNumber = currentEquivalentLineNumber - outputEquivalentLineNumber + outputForeignVZ.current.afterLineNumber;
					incomingVZLineNumber = incomingEquivalentLineNumber - outputEquivalentLineNumber + outputForeignVZ.current.afterLineNumber;
				} else {
					// If the view zone is inside the current region.
					currentVZLineNumber = currentEndEquivalentLineNumber;
					incomingVZLineNumber = incomingEndEquivalentLineNumber;
				}

				let marginDomNode: HTMLDivElement | null = null;
				if (merge && merge.outputStartLineNumber <= outputForeignVZ.current.afterLineNumber && outputForeignVZ.current.afterLineNumber <= merge.outputEndLineNumber) {
					marginDomNode = this._createOriginalMarginDomNodeForModifiedForeignViewZoneInAddedRegion();
				}

				stepCurrent.push({
					afterLineNumber: currentVZLineNumber,
					heightInLines: outputForeignVZ.current.height / currentLineHeight,
					domNode: null,
					marginDomNode
				});
				stepIncoming.push({
					afterLineNumber: incomingVZLineNumber,
					heightInLines: outputForeignVZ.current.height / incomingLineHeight,
					domNode: null,
					marginDomNode
				});
				outputForeignVZ.advance();
			}

			// [PRODUCE] View zone(s) due to foreign view zone(s) on the left side
			while (currentForeignVZ.current && currentForeignVZ.current.afterLineNumber <= currentEndEquivalentLineNumber) {
				let outputVZLineNumber: number;
				let incomingVZLineNumber: number;
				if (currentForeignVZ.current.afterLineNumber <= currentEquivalentLineNumber) {
					outputVZLineNumber = outputEquivalentLineNumber - currentEquivalentLineNumber + currentForeignVZ.current.afterLineNumber;
					incomingVZLineNumber = incomingEquivalentLineNumber - currentEquivalentLineNumber + currentForeignVZ.current.afterLineNumber;
				} else {
					outputVZLineNumber = outputEndEquivalentLineNumber;
					incomingVZLineNumber = incomingEndEquivalentLineNumber;
				}
				stepOutput.push({
					afterLineNumber: outputVZLineNumber,
					heightInLines: currentForeignVZ.current.height / outputLineHeight,
					domNode: null
				});
				stepIncoming.push({
					afterLineNumber: incomingVZLineNumber,
					heightInLines: currentForeignVZ.current.height / incomingLineHeight,
					domNode: null
				});
				currentForeignVZ.advance();
			}

			// [PRODUCE] View zone(s) due to foreign view zone(s) on the right side
			while (incomingForeignVZ.current && incomingForeignVZ.current.afterLineNumber <= incomingEndEquivalentLineNumber) {
				let outputVZLineNumber: number;
				let currentVZLineNumber: number;
				if (incomingForeignVZ.current.afterLineNumber <= incomingEquivalentLineNumber) {
					outputVZLineNumber = outputEquivalentLineNumber - currentEquivalentLineNumber + incomingForeignVZ.current.afterLineNumber;
					currentVZLineNumber = currentEquivalentLineNumber - currentEquivalentLineNumber + incomingForeignVZ.current.afterLineNumber;
				} else {
					outputVZLineNumber = outputEndEquivalentLineNumber;
					currentVZLineNumber = currentEndEquivalentLineNumber;
				}
				stepOutput.push({
					afterLineNumber: outputVZLineNumber,
					heightInLines: incomingForeignVZ.current.height / outputLineHeight,
					domNode: null
				});
				stepCurrent.push({
					afterLineNumber: currentVZLineNumber,
					heightInLines: incomingForeignVZ.current.height / currentLineHeight,
					domNode: null
				});
				incomingForeignVZ.advance();
			}

			if (merge !== null) {
				const rCurrent = this._produceCurrentFromMerge(merge, mergeCurrentLength, mergeOutputLength, mergeIncomingLength);
				const rOutput = this._produceOutputFromMerge(merge, mergeCurrentLength, mergeOutputLength, mergeIncomingLength);
				const rIncoming = this._produceIncomingFromMerge(merge, mergeCurrentLength, mergeOutputLength, mergeIncomingLength);
				if (rCurrent) {
					addAndMaxIfPossible(stepCurrent, rCurrent);
				}
				if (rOutput) {
					addAndMaxIfPossible(stepOutput, rOutput);
				}
				if (rIncoming) {
					addAndMaxIfPossible(stepIncoming, rIncoming);
				}
			}

			// ---------------------------- END PRODUCE VIEW ZONES


			// ---------------------------- EMIT MINIMAL VIEW ZONES

			// [CANCEL & EMIT] Try to cancel view zones out
			let stepCurrentIndex = 0;
			let stepIncomingIndex = 0;
			let stepOutputIndex = 0;

			stepCurrent = stepCurrent.sort(sortMyViewZones);
			stepIncoming = stepIncoming.sort(sortMyViewZones);
			stepOutput = stepOutput.sort(sortMyViewZones);

			while (stepCurrentIndex < stepCurrent.length && stepIncomingIndex < stepIncoming.length && stepOutputIndex < stepOutput.length) {
				const current = stepCurrent[stepCurrentIndex];
				const incoming = stepIncoming[stepIncomingIndex];
				const output = stepOutput[stepOutputIndex];

				const currentDelta = current.afterLineNumber - currentEquivalentLineNumber;
				const incomingDelta = incoming.afterLineNumber - incomingEquivalentLineNumber;
				const outputDelta = output.afterLineNumber - outputEquivalentLineNumber;

				if (currentDelta < incomingDelta && currentDelta < outputDelta) {
					addAndCombineIfPossible(result.current, current);
					stepCurrentIndex++;
				} else if (incomingDelta < currentDelta && incomingDelta < outputDelta) {
					addAndCombineIfPossible(result.incoming, incoming);
					stepIncomingIndex++;
				} else if (outputDelta < currentDelta && outputDelta < incomingDelta) {
					addAndCombineIfPossible(result.output, output);
					stepOutputIndex++;
				} else if (current.shouldNotShrink) {
					addAndCombineIfPossible(result.current, current);
					stepCurrentIndex++;
				} else if (incoming.shouldNotShrink) {
					addAndCombineIfPossible(result.incoming, incoming);
					stepIncomingIndex++;
				} else if (output.shouldNotShrink) {
					addAndCombineIfPossible(result.output, output);
					stepOutputIndex++;
				} else {
					// There's at least one max delta
					if (current.heightInLines >= incoming.heightInLines && current.heightInLines >= output.heightInLines) {
						// only keep the current view zone
						current.heightInLines -= Math.max(incoming.heightInLines, output.heightInLines);
						stepIncomingIndex++;
						stepOutputIndex++;
					} else if (incoming.heightInLines >= output.heightInLines && incoming.heightInLines >= current.heightInLines) {
						// only keep the incoming view zone
						incoming.heightInLines -= Math.max(current.heightInLines, output.heightInLines);
						stepCurrentIndex++;
						stepOutputIndex++;
					} else {
						// only keep the output view zone
						output.heightInLines -= Math.max(current.heightInLines, incoming.heightInLines);
						stepCurrentIndex++;
						stepIncomingIndex++;
					}
				}
			}

			// [EMIT] Remaining current view zones
			while (stepCurrentIndex < stepCurrent.length) {
				addAndCombineIfPossible(result.current, stepCurrent[stepCurrentIndex]);
				stepCurrentIndex++;
			}

			// [EMIT] Remaining incoming view zones
			while (stepIncomingIndex < stepIncoming.length) {
				addAndCombineIfPossible(result.incoming, stepIncoming[stepIncomingIndex]);
				stepIncomingIndex++;
			}

			// [EMIT] Remaining output view zones
			while (stepOutputIndex < stepOutput.length) {
				addAndCombineIfPossible(result.output, stepOutput[stepOutputIndex]);
				stepOutputIndex++;
			}

			// ---------------------------- END EMIT MINIMAL VIEW ZONES
		}

		return {
			current: ViewZonesComputer._ensureDomNodes(result.current),
			incoming: ViewZonesComputer._ensureDomNodes(result.incoming),
			output: ViewZonesComputer._ensureDomNodes(result.output),
		};
	}

	private static _ensureDomNodes(zones: IMyViewZone[]): IMyViewZone[] {
		return zones.map((z) => {
			if (!z.domNode) {
				z.domNode = createFakeLinesDiv();
			}
			return z;
		});
	}

	protected abstract _createOriginalMarginDomNodeForModifiedForeignViewZoneInAddedRegion(): HTMLDivElement | null;

	protected abstract _produceCurrentFromMerge(merge: IMerge, mergeCurrentLength: number, mergeOutputLength: number, mergeIncomingLength: number): IMyViewZone | null;

	protected abstract _produceIncomingFromMerge(merge: IMerge, mergeCurrentLength: number, mergeOutputLength: number, mergeIncomingLength: number): IMyViewZone | null;

	protected abstract _produceOutputFromMerge(merge: IMerge, mergeCurrentLength: number, mergeOutputLength: number, mergeIncomingLength: number): IMyViewZone | null;
}

function createDecoration(startLineNumber: number, startColumn: number, endLineNumber: number, endColumn: number, options: ModelDecorationOptions) {
	return {
		range: new Range(startLineNumber, startColumn, endLineNumber, endColumn),
		options: options
	};
}

const DECORATIONS = {

	charDelete: ModelDecorationOptions.register({
		description: 'merge-editor-char-delete',
		className: 'char-delete'
	}),
	charDeleteWholeLine: ModelDecorationOptions.register({
		description: 'merge-editor-char-delete-whole-line',
		className: 'char-delete',
		isWholeLine: true
	}),

	charInsert: ModelDecorationOptions.register({
		description: 'merge-editor-char-insert',
		className: 'char-insert'
	}),
	charInsertWholeLine: ModelDecorationOptions.register({
		description: 'merge-editor-char-insert-whole-line',
		className: 'char-insert',
		isWholeLine: true
	}),

	charConflict: ModelDecorationOptions.register({
		description: 'merge-editor-char-conflict',
		className: 'char-conflict'
	}),
	charConflictWholeLine: ModelDecorationOptions.register({
		description: 'merge-editor-char-conflict-whole-line',
		className: 'char-conflict',
		isWholeLine: true
	}),

	lineInsert: ModelDecorationOptions.register({
		description: 'merge-editor-line-insert',
		className: 'line-insert',
		marginClassName: 'line-insert',
		isWholeLine: true
	}),
	lineInsertWithSign: ModelDecorationOptions.register({
		description: 'merge-editor-line-insert-with-sign',
		className: 'line-insert',
		linesDecorationsClassName: 'insert-sign ' + ThemeIcon.asClassName(diffInsertIcon),
		marginClassName: 'line-insert',
		isWholeLine: true
	}),

	lineDelete: ModelDecorationOptions.register({
		description: 'merge-editor-line-delete',
		className: 'line-delete',
		marginClassName: 'line-delete',
		isWholeLine: true
	}),
	lineDeleteWithSign: ModelDecorationOptions.register({
		description: 'merge-editor-line-delete-with-sign',
		className: 'line-delete',
		linesDecorationsClassName: 'delete-sign ' + ThemeIcon.asClassName(diffRemoveIcon),
		marginClassName: 'line-delete',
		isWholeLine: true

	}),
	lineDeleteMargin: ModelDecorationOptions.register({
		description: 'merge-editor-line-delete-margin',
		marginClassName: 'line-delete',
	}),

	lineConflict: ModelDecorationOptions.register({
		description: 'merge-editor-line-conflict',
		className: 'line-conflict',
		marginClassName: 'line-conflict',
		isWholeLine: true
	}),
	nextLineConflict: ModelDecorationOptions.register({
		description: 'merge-editor-next-line-conflict',
		className: 'line-conflict next-line',
		marginClassName: 'line-conflict next-line',
		isWholeLine: true
	}),

	lineConflictAcceptLeft: ModelDecorationOptions.register({
		description: 'merge-editor-next-line-conflict-accept-left',
		glyphMarginClassName: 'arrow-accept-left ' + ThemeIcon.asClassName(Codicon.arrowRight),
	}),
	nextLineConflictAcceptLeft: ModelDecorationOptions.register({
		description: 'merge-editor-next-line-conflict-accept-left',
		glyphMarginClassName: 'arrow-accept-left next-line ' + ThemeIcon.asClassName(Codicon.arrowRight),
	}),
	lineConflictAddLeftAfterRight: ModelDecorationOptions.register({
		description: 'merge-editor-next-line-conflict-add-left-after-right',
		glyphMarginClassName: 'arrow-add-left-after-right ' + ThemeIcon.asClassName(Codicon.arrowRight),
	}),

	lineConflictAcceptRight: ModelDecorationOptions.register({
		description: 'merge-editor-line-conflict-accept-right',
		glyphMarginClassName: 'arrow-accept-right ' + ThemeIcon.asClassName(Codicon.arrowLeft),
	}),
	nextLineConflictAcceptRight: ModelDecorationOptions.register({
		description: 'merge-editor-next-line-conflict-accept-right',
		glyphMarginClassName: 'arrow-accept-right next-line ' + ThemeIcon.asClassName(Codicon.arrowLeft),
	}),
	lineConflictAddRightAfterLeft: ModelDecorationOptions.register({
		description: 'merge-editor-line-conflict-add-right-after-left',
		glyphMarginClassName: 'arrow-add-right-after-left ' + ThemeIcon.asClassName(Codicon.arrowLeft),
	}),
};

class MergeEditorWidgetThreeColumn extends MergeEditorWidgetStyle implements IVerticalSashLayoutProvider {

	static readonly MINIMUM_EDITOR_WIDTH = 100;

	private _disableSash: boolean;
	private readonly _sash: Sash;
	private _sashRatio: number | null;
	private _leftSashPosition: number | null;
	private _rightSashPosition: number | null;
	private _startSashPosition: number | null;

	constructor(dataSource: IDataSource, enableSplitViewResizing: boolean) {
		super(dataSource);

		this._disableSash = (enableSplitViewResizing === false);
		this._sashRatio = null;
		this._leftSashPosition = null;
		this._rightSashPosition = null;
		this._startSashPosition = null;
		this._sash = this._register(new Sash(this._dataSource.getContainerDomNode(), this, { orientation: Orientation.VERTICAL }));

		if (this._disableSash) {
			this._sash.state = SashState.Disabled;
		}

		this._sash.onDidStart(() => this._onSashDragStart());
		this._sash.onDidChange((e: ISashEvent) => this._onSashDrag(e));
		this._sash.onDidEnd(() => this._onSashDragEnd());
		this._sash.onDidReset(() => this._onSashReset());

		document.documentElement.style.setProperty(
			'--merge-editor-line-height',
			`${this._dataSource.getCurrentEditor().getOption(EditorOption.lineHeight)}px`);
	}

	public setEnableSplitViewResizing(enableSplitViewResizing: boolean): void {
		const newDisableSash = (enableSplitViewResizing === false);
		if (this._disableSash !== newDisableSash) {
			this._disableSash = newDisableSash;
			this._sash.state = this._disableSash ? SashState.Disabled : SashState.Enabled;
		}
	}

	public layout(sashRatio: number | null = this._sashRatio): number[] {
		const w = this._dataSource.getWidth();
		const contentWidth = w - (this._dataSource.getOptions().renderOverviewRuler ? MergeEditorWidget.ENTIRE_DIFF_OVERVIEW_WIDTH : 0);

		let leftSashPosition = Math.floor((sashRatio || (1 / 3)) * contentWidth);
		let rightSashPosition = Math.floor((1 - (sashRatio || (1 / 3))) * contentWidth);
		const oneThirdPoint = Math.floor(contentWidth / 3);
		const twoThirdPoint = Math.floor(2 * contentWidth / 3);

		leftSashPosition = this._disableSash ? oneThirdPoint : leftSashPosition || oneThirdPoint;
		rightSashPosition = this._disableSash ? twoThirdPoint : rightSashPosition || twoThirdPoint;

		if (contentWidth > MergeEditorWidgetThreeColumn.MINIMUM_EDITOR_WIDTH * 3) {
			// Give left editor enough space
			if (leftSashPosition < MergeEditorWidgetThreeColumn.MINIMUM_EDITOR_WIDTH) {
				leftSashPosition = MergeEditorWidgetThreeColumn.MINIMUM_EDITOR_WIDTH;
			}

			// Give right editor enough space
			if (rightSashPosition > contentWidth - MergeEditorWidgetThreeColumn.MINIMUM_EDITOR_WIDTH) {
				leftSashPosition = contentWidth - MergeEditorWidgetThreeColumn.MINIMUM_EDITOR_WIDTH;
			}

			// Prevent left editor from taking too much
			if (leftSashPosition > contentWidth - (2 * MergeEditorWidgetThreeColumn.MINIMUM_EDITOR_WIDTH)) {
				leftSashPosition = contentWidth - (2 * MergeEditorWidgetThreeColumn.MINIMUM_EDITOR_WIDTH);
			}

			// Prevent right editor from taking too much
			if (rightSashPosition < 2 * MergeEditorWidgetThreeColumn.MINIMUM_EDITOR_WIDTH) {
				rightSashPosition = 2 * MergeEditorWidgetThreeColumn.MINIMUM_EDITOR_WIDTH;
			}
		} else {
			// Space is limited
			leftSashPosition = oneThirdPoint;
			rightSashPosition = twoThirdPoint;
		}

		if (this._leftSashPosition !== leftSashPosition || this._rightSashPosition !== rightSashPosition) {
			this._leftSashPosition = leftSashPosition;
			this._rightSashPosition = rightSashPosition;
			this._sash.layout();
		}

		return [this._leftSashPosition, this._rightSashPosition];
	}

	private _onSashDragStart(): void {
		this._startSashPosition = this._leftSashPosition!;
	}

	private _onSashDrag(e: ISashEvent): void {
		const w = this._dataSource.getWidth();
		const contentWidth = w - (this._dataSource.getOptions().renderOverviewRuler ? MergeEditorWidget.ENTIRE_DIFF_OVERVIEW_WIDTH : 0);
		const [leftSashPosition] = this.layout((this._startSashPosition! + (e.currentX - e.startX)) / contentWidth);

		this._sashRatio = leftSashPosition / contentWidth;

		this._dataSource.relayoutEditors();
	}

	private _onSashDragEnd(): void {
		this._sash.layout();
	}

	private _onSashReset(): void {
		this._sashRatio = 0.5;
		this._dataSource.relayoutEditors();
		this._sash.layout();
	}

	public getVerticalSashTop(sash: Sash): number {
		return 0;
	}

	public getVerticalSashLeft(sash: Sash): number {
		return this._leftSashPosition!;
	}

	public getVerticalSashHeight(sash: Sash): number {
		return this._dataSource.getHeight();
	}

	protected _getViewZones(merges: IMerge[], currentForeignVZ: IEditorWhitespace[], outputForeignVZ: IEditorWhitespace[], incomingForeignVZ: IEditorWhitespace[]): IEditorsZones {
		const currentEditor = this._dataSource.getCurrentEditor();
		const outputEditor = this._dataSource.getOutputEditor();
		const incomingEditor = this._dataSource.getIncomingEditor();
		const c = new ThreeColumnViewZonesComputer(merges, currentForeignVZ, outputForeignVZ, incomingForeignVZ, currentEditor, outputEditor, incomingEditor);
		return c.getViewZones();
	}

	protected _getCurrentEditorDecorations(merges: MergeRegion[], ignoreTrimWhitespace: boolean, renderIndicators: boolean): IEditorDiffDecorations {
		return this._getEditorDecorations(this._dataSource.getCurrentEditor(), merges, (merge) => merge.currentChanges, (merge) => merge.currentStartLineNumber, (merge) => merge.currentEndLineNumber, ignoreTrimWhitespace, renderIndicators);
	}

	protected _getOutputEditorDecorations(merges: MergeRegion[], ignoreTrimWhitespace: boolean, renderIndicators: boolean): IEditorDiffDecorations {
		return this._getEditorDecorations(this._dataSource.getOutputEditor(), merges, (merge) => merge.outputChanges, (merge) => merge.outputStartLineNumber, (merge) => merge.outputEndLineNumber, ignoreTrimWhitespace, renderIndicators);
	}

	protected _getIncomingEditorDecorations(merges: MergeRegion[], ignoreTrimWhitespace: boolean, renderIndicators: boolean): IEditorDiffDecorations {
		return this._getEditorDecorations(this._dataSource.getIncomingEditor(), merges, (merge) => merge.incomingChanges, (merge) => merge.incomingStartLineNumber, (merge) => merge.incomingEndLineNumber, ignoreTrimWhitespace, renderIndicators);
	}

	private _getEditorDecorations(
		editor: CodeEditorWidget,
		merges: MergeRegion[],
		extractChanges: (merge: IMerge) => ILineChange[],
		extractStart: (merge: IMerge) => number,
		extractEnd: (merge: IMerge) => number,
		ignoreTrimWhitespace: boolean,
		renderIndicators: boolean): IEditorDiffDecorations {
		const overviewZoneInsertColor = String(this._insertColor);
		const overviewZoneConflictColor = String(this._conflictColor);

		const result: IEditorDiffDecorations = {
			decorations: [],
			overviewZones: []
		};

		const model = editor.getModel()!;
		const viewModel = editor._getViewModel()!;

		for (const merge of merges) {

			const regionStart = extractStart(merge);
			const regionEnd = extractEnd(merge);

			if (merge.hasConflict) {
				result.decorations.push({
					range: new Range(regionStart, 1, Math.max(regionStart, regionEnd), Constants.MAX_SAFE_SMALL_INTEGER),
					options: regionEnd > 0 ? DECORATIONS.lineConflict : DECORATIONS.nextLineConflict,
				});
				const viewRange = getViewRange(model, viewModel, regionStart, Math.max(regionStart, regionEnd));
				result.overviewZones.push(new OverviewRulerZone(viewRange.startLineNumber, viewRange.endLineNumber, viewRange.endLineNumber - viewRange.startLineNumber, overviewZoneConflictColor));
			}

			// arrows
			if (merge.state.conflict !== editorCommon.ConflictState.Resolved) {
				if (editor === this._dataSource.getOutputEditor()
					&& (merge.state.conflict === editorCommon.ConflictState.Unresolved
						|| (merge.state.conflict === editorCommon.ConflictState.AppliedRight && merge.currentChanges.every(isChangeOrInsert)))) {
					const decoration = merge.state.conflict === editorCommon.ConflictState.AppliedRight
						? DECORATIONS.lineConflictAddLeftAfterRight
						: regionEnd > 0 ? DECORATIONS.lineConflictAcceptLeft
							: DECORATIONS.nextLineConflictAcceptLeft;
					result.decorations.push({
						range: new Range(regionStart, 1, regionStart, 1),
						options: decoration,
					});
				} else if (editor === this._dataSource.getIncomingEditor()
					&& (merge.state.conflict === editorCommon.ConflictState.Unresolved
						|| (merge.state.conflict === editorCommon.ConflictState.AppliedLeft && merge.incomingChanges.every(isChangeOrInsert)))) {
					const decoration = merge.state.conflict === editorCommon.ConflictState.AppliedLeft
						? DECORATIONS.lineConflictAddRightAfterLeft
						: regionEnd > 0 ? DECORATIONS.lineConflictAcceptRight
							: DECORATIONS.nextLineConflictAcceptRight;
					result.decorations.push({
						range: new Range(regionStart, 1, regionStart, 1),
						options: decoration,
					});
				}
			}

			for (const lineChange of extractChanges(merge)) {

				if (lineChange && isChangeOrInsert(lineChange)) {

					if (!merge.hasConflict) {
						result.decorations.push({
							range: new Range(lineChange.modifiedStartLineNumber, 1, lineChange.modifiedEndLineNumber, Constants.MAX_SAFE_SMALL_INTEGER),
							options: (renderIndicators ? DECORATIONS.lineInsertWithSign : DECORATIONS.lineInsert)
						});
					}

					if (!isChangeOrDelete(lineChange) || !lineChange.charChanges) {
						result.decorations.push(createDecoration(lineChange.modifiedStartLineNumber, 1, lineChange.modifiedEndLineNumber, Constants.MAX_SAFE_SMALL_INTEGER, merge.hasConflict ? DECORATIONS.charConflictWholeLine : DECORATIONS.charInsertWholeLine));
					}

					const viewRange = getViewRange(model, viewModel, lineChange.modifiedStartLineNumber, lineChange.modifiedEndLineNumber);
					result.overviewZones.push(new OverviewRulerZone(viewRange.startLineNumber, viewRange.endLineNumber, viewRange.endLineNumber - viewRange.startLineNumber, overviewZoneInsertColor));

					if (lineChange.charChanges) {
						for (const charChange of lineChange.charChanges) {
							if (isChangeOrInsert(charChange)) {
								if (ignoreTrimWhitespace) {
									for (let lineNumber = charChange.modifiedStartLineNumber; lineNumber <= charChange.modifiedEndLineNumber; lineNumber++) {
										let startColumn: number;
										let endColumn: number;
										if (lineNumber === charChange.modifiedStartLineNumber) {
											startColumn = charChange.modifiedStartColumn;
										} else {
											startColumn = model.getLineFirstNonWhitespaceColumn(lineNumber);
										}
										if (lineNumber === charChange.modifiedEndLineNumber) {
											endColumn = charChange.modifiedEndColumn;
										} else {
											endColumn = model.getLineLastNonWhitespaceColumn(lineNumber);
										}
										result.decorations.push(createDecoration(lineNumber, startColumn, lineNumber, endColumn, merge.hasConflict ? DECORATIONS.charConflict : DECORATIONS.charInsert));
									}
								} else {
									result.decorations.push(createDecoration(charChange.modifiedStartLineNumber, charChange.modifiedStartColumn, charChange.modifiedEndLineNumber, charChange.modifiedEndColumn, merge.hasConflict ? DECORATIONS.charConflict : DECORATIONS.charInsert));
								}
							}
						}
					}
				}
			}
		}
		return result;
	}
}

class ThreeColumnViewZonesComputer extends ViewZonesComputer {

	constructor(
		merges: IMerge[],
		currentForeignVZ: IEditorWhitespace[],
		outputForeignVZ: IEditorWhitespace[],
		incomingForeignVZ: IEditorWhitespace[],
		currentEditor: CodeEditorWidget,
		outputEditor: CodeEditorWidget,
		incomingEditor: CodeEditorWidget,
	) {
		super(merges, currentForeignVZ, outputForeignVZ, incomingForeignVZ, currentEditor, outputEditor, incomingEditor);
	}

	protected _createOriginalMarginDomNodeForModifiedForeignViewZoneInAddedRegion(): HTMLDivElement | null {
		return null;
	}

	protected _produceCurrentFromMerge(merge: IMerge, mergeCurrentLength: number, mergeOutputLength: number, mergeIncomingLength: number): IMyViewZone | null {
		if (Math.max(mergeOutputLength, mergeIncomingLength) > mergeCurrentLength) {
			return {
				afterLineNumber: Math.max(merge.currentStartLineNumber, merge.currentEndLineNumber),
				heightInLines: Math.max(mergeOutputLength, mergeIncomingLength) - mergeCurrentLength,
				domNode: null
			};
		}
		return null;
	}

	protected _produceIncomingFromMerge(merge: IMerge, mergeCurrentLength: number, mergeOutputLength: number, mergeIncomingLength: number): IMyViewZone | null {
		if (Math.max(mergeOutputLength, mergeCurrentLength) > mergeIncomingLength) {
			return {
				afterLineNumber: Math.max(merge.incomingStartLineNumber, merge.incomingEndLineNumber),
				heightInLines: Math.max(mergeOutputLength, mergeCurrentLength) - mergeIncomingLength,
				domNode: null
			};
		}
		return null;
	}

	protected _produceOutputFromMerge(merge: IMerge, mergeCurrentLength: number, mergeOutputLength: number, mergeIncomingLength: number): IMyViewZone | null {
		if (Math.max(mergeIncomingLength, mergeCurrentLength) > mergeOutputLength) {
			return {
				afterLineNumber: Math.max(merge.outputStartLineNumber, merge.outputEndLineNumber),
				heightInLines: Math.max(mergeIncomingLength, mergeCurrentLength) - mergeOutputLength,
				domNode: null
			};
		}
		return null;
	}
}

function getLineChangeAtOrBeforeLineNumber(lineChanges: ILineChange[], lineNumber: number, startLineNumberExtractor: (lineChange: ILineChange) => number): ILineChange | null {
	if (lineChanges.length === 0 || lineNumber < startLineNumberExtractor(lineChanges[0])) {
		// There are no changes or `lineNumber` is before the first change
		return null;
	}

	let min = 0;
	let max = lineChanges.length - 1;
	while (min < max) {
		const mid = Math.floor((min + max) / 2);
		const midStart = startLineNumberExtractor(lineChanges[mid]);
		const midEnd = (mid + 1 <= max ? startLineNumberExtractor(lineChanges[mid + 1]) : Constants.MAX_SAFE_SMALL_INTEGER);

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
	return lineChanges[min];
}

function getEquivalentLineForOriginalLineNumber(lineChanges: ILineChange[], lineNumber: number): number {
	const lineChange = getLineChangeAtOrBeforeLineNumber(lineChanges, lineNumber, (lineChange) => lineChange.originalStartLineNumber);

	if (!lineChange) {
		return lineNumber;
	}

	const originalEquivalentLineNumber = lineChange.originalStartLineNumber + (lineChange.originalEndLineNumber > 0 ? -1 : 0);
	const modifiedEquivalentLineNumber = lineChange.modifiedStartLineNumber + (lineChange.modifiedEndLineNumber > 0 ? -1 : 0);
	const lineChangeOriginalLength = (lineChange.originalEndLineNumber > 0 ? (lineChange.originalEndLineNumber - lineChange.originalStartLineNumber + 1) : 0);
	const lineChangeModifiedLength = (lineChange.modifiedEndLineNumber > 0 ? (lineChange.modifiedEndLineNumber - lineChange.modifiedStartLineNumber + 1) : 0);


	const delta = lineNumber - originalEquivalentLineNumber;

	if (delta <= lineChangeOriginalLength) {
		return modifiedEquivalentLineNumber + Math.min(delta, lineChangeModifiedLength);
	}

	return modifiedEquivalentLineNumber + lineChangeModifiedLength - lineChangeOriginalLength + delta;
}

function addAndCombineRegionIfPossible(regions: MergeRegion[], item: MergeRegion): void {
	if (regions.length > 0) {
		const lastItem = regions[regions.length - 1];
		if (rangeOverlap(lastItem.outputStartLineNumber, lastItem.outputEndLineNumber, item.outputStartLineNumber, item.outputEndLineNumber) ||
			rangeOverlap(lastItem.incomingStartLineNumber, lastItem.incomingEndLineNumber, item.incomingStartLineNumber, item.incomingEndLineNumber) ||
			rangeOverlap(lastItem.currentStartLineNumber, lastItem.currentEndLineNumber, item.currentStartLineNumber, item.currentEndLineNumber)) {
			if (lastItem.outputEndLineNumber !== 0) {
				lastItem.outputEndLineNumber = Math.max(lastItem.outputEndLineNumber, item.outputEndLineNumber);
			} else if (item.outputStartLineNumber > lastItem.outputStartLineNumber) {
				// delete change may be extended to a modify change
				lastItem.outputStartLineNumber = lastItem.outputStartLineNumber + 1;
				lastItem.outputEndLineNumber = Math.max(lastItem.outputEndLineNumber, item.outputEndLineNumber);
			}
			if (lastItem.currentEndLineNumber !== 0) {
				lastItem.currentEndLineNumber = Math.max(lastItem.currentEndLineNumber, item.currentEndLineNumber);
			} else if (item.currentStartLineNumber > lastItem.currentStartLineNumber) {
				lastItem.currentStartLineNumber = lastItem.currentStartLineNumber + 1;
				lastItem.currentEndLineNumber = Math.max(lastItem.currentEndLineNumber, item.currentEndLineNumber);
			}
			if (lastItem.incomingEndLineNumber !== 0) {
				lastItem.incomingEndLineNumber = Math.max(lastItem.incomingEndLineNumber, item.incomingEndLineNumber);
			} else if (item.incomingStartLineNumber > lastItem.incomingStartLineNumber) {
				lastItem.incomingStartLineNumber = lastItem.incomingStartLineNumber + 1;
				lastItem.incomingEndLineNumber = Math.max(lastItem.incomingEndLineNumber, item.incomingEndLineNumber);
			}
			lastItem.currentChanges.push(...item.currentChanges);
			lastItem.outputChanges.push(...item.outputChanges);
			lastItem.incomingChanges.push(...item.incomingChanges);
			lastItem.hasConflict = item.hasConflict && lastItem.hasConflict;
			return;
		}
	}
	regions.push(item);
}

/**
 * Checks if two ranges overlap.
 *
 * Ranges should be defined in the same version. If a range has end = 0, it will
 * be treated as overlapping if the other change intersects with its start and
 * start+1 line.
 */
function rangeOverlap(start: number, end: number, otherStart: number, otherEnd: number): boolean {
	if (end === 0 && otherEnd === 0) {
		return start === otherStart;
	} else if (end === 0) {
		return otherStart <= start + 1 && otherEnd >= start;
	} else if (otherEnd === 0) {
		return start <= otherStart + 1 && end >= otherStart;
	}

	if (start > otherEnd) {
		return false;
	}

	if (otherStart > end) {
		return false;
	}

	return true;
}

function validateMergeWordWrap(value: 'off' | 'on' | 'inherit' | undefined, defaultValue: 'off' | 'on' | 'inherit'): 'off' | 'on' | 'inherit' {
	return validateStringSetOption<'off' | 'on' | 'inherit'>(value, defaultValue, ['off', 'on', 'inherit']);
}

function isChangeOrInsert(lineChange: IChange): boolean {
	return lineChange.modifiedEndLineNumber > 0;
}

function isChangeOrDelete(lineChange: IChange): boolean {
	return lineChange.originalEndLineNumber > 0;
}

function createFakeLinesDiv(): HTMLElement {
	const r = document.createElement('div');
	r.className = 'diagonal-fill';
	return r;
}


function regionHasConflict(region: IMerge, currentModel: ITextModel | undefined, incomingModel: ITextModel | undefined): boolean {
	if (region.currentChanges.length === 0 || region.incomingChanges.length === 0) {
		return false;
	}
	if (region.currentChanges.length !== region.incomingChanges.length) {
		return true;
	}
	if (!currentModel || !incomingModel) {
		// If the content can't be accessed for identity check, set conflicting.
		return true;
	}

	for (let index = 0; index < region.currentChanges.length; index++) {
		const currentChange = region.currentChanges[index];
		const incomingChange = region.incomingChanges[index];

		const currentDelta = currentChange.modifiedEndLineNumber > 0 ?
			currentChange.modifiedEndLineNumber - currentChange.modifiedStartLineNumber : 0;
		const incomingDelta = incomingChange.modifiedEndLineNumber > 0 ?
			incomingChange.modifiedEndLineNumber - incomingChange.modifiedStartLineNumber : 0;

		if (currentChange.originalStartLineNumber !== incomingChange.originalStartLineNumber
			|| currentChange.originalEndLineNumber !== incomingChange.originalEndLineNumber
			|| currentDelta !== incomingDelta) {
			return true;
		}

		if (getChangeContentInModel(currentChange, currentModel) !== getChangeContentInModel(incomingChange, incomingModel)) {
			return true;
		}
	}
	return false;
}

function getChangeContentInModel(change: ILineChange, model: ITextModel): string {
	const startLineNumber = change.modifiedStartLineNumber;
	const endLineNumber = change.modifiedEndLineNumber;
	if (endLineNumber > 0) {
		const startColumn = change.charChanges?.[0].modifiedStartColumn ?? 0;
		const endColumn = change.charChanges?.[change.charChanges.length - 1].modifiedEndColumn ?? model.getLineMaxColumn(endLineNumber);
		return model.getValueInRange({ startLineNumber, endLineNumber, startColumn, endColumn });
	}
	return '';
}

/**
 * Merges initial changes in current branch and incoming branch.
 *
 * This function intends to convert 2-version based changes (common ancestor to
 * current OR incoming branch) into 3-version merges (common ancestor, current
 * branch, AND incoming branch). If there's overlapping changes, they are
 * combined together and marked as conflicting.
 */
function mergeInitialChanges(currentChanges: ILineChange[], incomingChanges: ILineChange[], currentModel: ITextModel | undefined, incomingModel: ITextModel | undefined): MergeRegion[] {
	let currentIndex = 0;
	let incomingIndex = 0;

	const result: MergeRegion[] = [];

	while (currentIndex < currentChanges.length && incomingIndex < incomingChanges.length) {
		const current = currentChanges[currentIndex];
		const incoming = incomingChanges[incomingIndex];

		if (!rangeOverlap(current.originalStartLineNumber, current.originalEndLineNumber, incoming.originalStartLineNumber, incoming.originalEndLineNumber)) {
			// No overlap: map the lines to the other version
			if (current.originalStartLineNumber < incoming.originalStartLineNumber) {
				addAndCombineRegionIfPossible(result, {
					currentStartLineNumber: current.modifiedStartLineNumber,
					currentEndLineNumber: current.modifiedEndLineNumber,
					outputStartLineNumber: current.originalStartLineNumber,
					outputEndLineNumber: current.originalEndLineNumber,
					incomingStartLineNumber: getEquivalentLineForOriginalLineNumber(incomingChanges, current.originalStartLineNumber),
					incomingEndLineNumber: getEquivalentLineForOriginalLineNumber(incomingChanges, current.originalEndLineNumber),
					hasConflict: false,
					currentChanges: [current],
					outputChanges: [],
					incomingChanges: [],
					state: { conflict: editorCommon.ConflictState.Resolved },
				});
				currentIndex++;
			} else {
				addAndCombineRegionIfPossible(result, {
					currentStartLineNumber: getEquivalentLineForOriginalLineNumber(currentChanges, incoming.originalStartLineNumber),
					currentEndLineNumber: getEquivalentLineForOriginalLineNumber(currentChanges, incoming.originalEndLineNumber),
					outputStartLineNumber: incoming.originalStartLineNumber,
					outputEndLineNumber: incoming.originalEndLineNumber,
					incomingStartLineNumber: incoming.modifiedStartLineNumber,
					incomingEndLineNumber: incoming.modifiedEndLineNumber,
					hasConflict: false,
					currentChanges: [],
					outputChanges: [],
					incomingChanges: [incoming],
					state: { conflict: editorCommon.ConflictState.Resolved },
				});
				incomingIndex++;
			}
		} else {
			let currentStart = current.modifiedStartLineNumber;
			let currentEnd = current.modifiedEndLineNumber;
			let incomingStart = incoming.modifiedStartLineNumber;
			let incomingEnd = incoming.modifiedEndLineNumber;
			if (current.originalEndLineNumber > 0 && ((current.originalStartLineNumber < incoming.originalStartLineNumber) || (current.originalStartLineNumber === incoming.originalStartLineNumber && incoming.originalEndLineNumber === 0))) {
				// Current change is not an insert: try expanding the region
				if (incomingEnd === 0) {
					// Incoming change is a delete: transform to a modified region, reset the end line
					incomingEnd = incomingStart;
				}
				incomingStart = Math.min(incomingStart, getEquivalentLineForOriginalLineNumber(incomingChanges, current.originalStartLineNumber));
			}
			if (current.originalEndLineNumber > 0 && current.originalEndLineNumber > incoming.originalEndLineNumber) {
				if (incomingEnd === 0) {
					// Incoming change is a delete: transform to a modified region, reset the start line
					incomingStart = incomingStart + 1;
				}
				incomingEnd = Math.max(incomingEnd, getEquivalentLineForOriginalLineNumber(incomingChanges, current.originalEndLineNumber));
			}
			if (incoming.originalEndLineNumber > 0 && ((incoming.originalStartLineNumber < current.originalStartLineNumber) || (incoming.originalStartLineNumber === current.originalStartLineNumber && current.originalEndLineNumber === 0))) {
				if (currentEnd === 0) {
					currentEnd = currentStart;
				}
				currentStart = Math.min(currentStart, getEquivalentLineForOriginalLineNumber(currentChanges, incoming.originalStartLineNumber));
			}
			if (incoming.originalEndLineNumber > 0 && incoming.originalEndLineNumber > current.originalEndLineNumber) {
				if (currentEnd === 0) {
					currentStart = currentStart + 1;
				}
				currentEnd = Math.max(currentEnd, getEquivalentLineForOriginalLineNumber(currentChanges, incoming.originalEndLineNumber));
			}
			currentIndex++;
			incomingIndex++;
			// insert change's start line number is not accurate, so skip those
			const outputStart = current.originalEndLineNumber === 0 ? incoming.originalStartLineNumber
				: (incoming.originalEndLineNumber === 0 ? current.originalStartLineNumber
					: Math.min(current.originalStartLineNumber, incoming.originalStartLineNumber));
			const outputEnd = current.originalEndLineNumber === 0 ? incoming.originalEndLineNumber
				: Math.max(current.originalEndLineNumber, incoming.originalEndLineNumber);
			addAndCombineRegionIfPossible(result, {
				currentStartLineNumber: currentStart,
				currentEndLineNumber: currentEnd,
				outputStartLineNumber: outputStart,
				outputEndLineNumber: outputEnd,
				incomingStartLineNumber: incomingStart,
				incomingEndLineNumber: incomingEnd,
				hasConflict: true,
				currentChanges: [current],
				outputChanges: [],
				incomingChanges: [incoming],
				state: { conflict: editorCommon.ConflictState.Unresolved },
			});
		}
	}


	while (currentIndex < currentChanges.length) {
		const current = currentChanges[currentIndex];
		addAndCombineRegionIfPossible(result, {
			currentStartLineNumber: current.modifiedStartLineNumber,
			currentEndLineNumber: current.modifiedEndLineNumber,
			outputStartLineNumber: current.originalStartLineNumber,
			outputEndLineNumber: current.originalEndLineNumber,
			incomingStartLineNumber: getEquivalentLineForOriginalLineNumber(incomingChanges, current.originalStartLineNumber),
			incomingEndLineNumber: getEquivalentLineForOriginalLineNumber(incomingChanges, current.originalEndLineNumber),
			hasConflict: false,
			currentChanges: [current],
			outputChanges: [],
			incomingChanges: [],
			state: { conflict: editorCommon.ConflictState.Resolved },
		});
		currentIndex++;
	}

	while (incomingIndex < incomingChanges.length) {
		const incoming = incomingChanges[incomingIndex];
		addAndCombineRegionIfPossible(result, {
			currentStartLineNumber: getEquivalentLineForOriginalLineNumber(currentChanges, incoming.originalStartLineNumber),
			currentEndLineNumber: getEquivalentLineForOriginalLineNumber(currentChanges, incoming.originalEndLineNumber),
			outputStartLineNumber: incoming.originalStartLineNumber,
			outputEndLineNumber: incoming.originalEndLineNumber,
			incomingStartLineNumber: incoming.modifiedStartLineNumber,
			incomingEndLineNumber: incoming.modifiedEndLineNumber,
			hasConflict: false,
			currentChanges: [],
			outputChanges: [],
			incomingChanges: [incoming],
			state: { conflict: editorCommon.ConflictState.Resolved },
		});
		incomingIndex++;
	}

	// Detects conflicts in initial regions.
	for (const region of result) {
		region.hasConflict = regionHasConflict(region, currentModel, incomingModel);
		region.state.conflict = region.hasConflict ? editorCommon.ConflictState.Unresolved : editorCommon.ConflictState.Resolved;
	}

	return result;
}

/**
 * Merges output diff computation result with existing initial regions.
 *
 * This function
 *   1) converts 2-version based output editor diff (common ancestor
 *   to output editor) into 3-version merges (output editor, current
 *   branch, and incoming branch).
 *   2) converts initial 3-version merges (common ancestor, current branch, and
 *   incoming branch) to different 3-version merges of output editor, current
 *   branch, and incoming branch.
 *   3) combines the above two results in a single array. If there's overlaps,
 *   they are combined together into one merge item.
 */
function mergeDynamicChanges(initialRegions: MergeRegion[], outputChanges: ILineChange[], currentChanges: ILineChange[], incomingChanges: ILineChange[]) {

	let mergeIndex = 0;
	let changeIndex = 0;

	const result: MergeRegion[] = [];

	while (mergeIndex < initialRegions.length && changeIndex < outputChanges.length) {
		const merge = initialRegions[mergeIndex];
		const change = outputChanges[changeIndex];

		if (!rangeOverlap(merge.outputStartLineNumber, merge.outputEndLineNumber, change.originalStartLineNumber, change.originalEndLineNumber)) {
			if (merge.outputStartLineNumber < change.originalStartLineNumber) {
				// No overlap: map the region to the output version
				addAndCombineRegionIfPossible(result, {
					currentStartLineNumber: merge.currentStartLineNumber,
					currentEndLineNumber: merge.currentEndLineNumber,
					outputStartLineNumber: getEquivalentLineForOriginalLineNumber(outputChanges, merge.outputStartLineNumber),
					outputEndLineNumber: getEquivalentLineForOriginalLineNumber(outputChanges, merge.outputEndLineNumber),
					incomingStartLineNumber: merge.incomingStartLineNumber,
					incomingEndLineNumber: merge.incomingEndLineNumber,
					hasConflict: merge.hasConflict,
					currentChanges: [...merge.currentChanges],
					outputChanges: [],
					incomingChanges: [...merge.incomingChanges],
					state: merge.state,
				});
				mergeIndex++;
			} else {
				// No overlap: turn the output change into a region
				addAndCombineRegionIfPossible(result, {
					currentStartLineNumber: getEquivalentLineForOriginalLineNumber(currentChanges, change.originalStartLineNumber),
					currentEndLineNumber: getEquivalentLineForOriginalLineNumber(currentChanges, change.originalEndLineNumber),
					outputStartLineNumber: change.modifiedStartLineNumber,
					outputEndLineNumber: change.modifiedEndLineNumber,
					incomingStartLineNumber: getEquivalentLineForOriginalLineNumber(incomingChanges, change.originalStartLineNumber),
					incomingEndLineNumber: getEquivalentLineForOriginalLineNumber(incomingChanges, change.originalEndLineNumber),
					hasConflict: false,
					currentChanges: [],
					outputChanges: [change],
					incomingChanges: [],
					state: { conflict: editorCommon.ConflictState.Resolved },
				});
				changeIndex++;
			}
		} else {
			let currentStart = merge.currentStartLineNumber;
			let currentEnd = merge.currentEndLineNumber;
			let outputStart = change.modifiedStartLineNumber;
			let outputEnd = change.modifiedEndLineNumber;
			let incomingStart = merge.incomingStartLineNumber;
			let incomingEnd = merge.incomingEndLineNumber;
			if (merge.outputEndLineNumber > 0 && ((merge.outputStartLineNumber < change.originalStartLineNumber) || (merge.outputStartLineNumber === change.originalStartLineNumber && change.originalEndLineNumber === 0))) {
				// Static region is not an insert: try expanding the output change
				if (outputEnd === 0) {
					// Output change is a delete: transform to a modified region, reset the end line
					outputEnd = outputStart;
				}
				outputStart = Math.min(outputStart, getEquivalentLineForOriginalLineNumber(outputChanges, merge.outputStartLineNumber));
			}
			if (merge.outputEndLineNumber > 0 && merge.outputEndLineNumber > change.originalEndLineNumber) {
				if (outputEnd === 0) {
					// Output change is a delete: transform to a modified region, reset the start line
					outputStart = outputStart + 1;
				}
				outputEnd = Math.max(outputEnd, getEquivalentLineForOriginalLineNumber(outputChanges, merge.outputEndLineNumber));
			}
			if (change.originalEndLineNumber > 0 && ((change.originalStartLineNumber < merge.outputStartLineNumber) || (change.originalStartLineNumber === merge.outputStartLineNumber && merge.outputEndLineNumber === 0))) {
				// Output change is not an insert: try expanding the static region
				if (currentEnd === 0) {
					// Current change is a delete: transform to a modified region, reset the end line
					currentEnd = currentStart;
				}
				currentStart = Math.min(currentStart, getEquivalentLineForOriginalLineNumber(currentChanges, change.originalStartLineNumber));
				if (incomingEnd === 0) {
					// Incoming change is a delete: transform to a modified region, reset the end line
					incomingEnd = incomingStart;
				}
				incomingStart = Math.min(incomingStart, getEquivalentLineForOriginalLineNumber(incomingChanges, change.originalStartLineNumber));
			}
			if (change.originalEndLineNumber > 0 && change.originalEndLineNumber > merge.outputEndLineNumber) {
				if (currentEnd === 0) {
					currentStart = currentStart + 1;
				}
				currentEnd = Math.max(currentEnd, getEquivalentLineForOriginalLineNumber(currentChanges, change.originalEndLineNumber));
				if (incomingEnd === 0) {
					incomingStart = incomingStart + 1;
				}
				incomingEnd = Math.max(incomingEnd, getEquivalentLineForOriginalLineNumber(incomingChanges, change.originalEndLineNumber));
			}
			addAndCombineRegionIfPossible(result, {
				currentStartLineNumber: currentStart,
				currentEndLineNumber: currentEnd,
				outputStartLineNumber: outputStart,
				outputEndLineNumber: outputEnd,
				incomingStartLineNumber: incomingStart,
				incomingEndLineNumber: incomingEnd,
				hasConflict: merge.hasConflict, // do not change conflict state, let change event handler do the job
				currentChanges: [...merge.currentChanges],
				outputChanges: [change],
				incomingChanges: [...merge.incomingChanges],
				state: merge.state,
			});
			mergeIndex++;
			changeIndex++;
		}
	}


	while (mergeIndex < initialRegions.length) {
		const merge = initialRegions[mergeIndex];
		addAndCombineRegionIfPossible(result, {
			currentStartLineNumber: merge.currentStartLineNumber,
			currentEndLineNumber: merge.currentEndLineNumber,
			outputStartLineNumber: getEquivalentLineForOriginalLineNumber(outputChanges, merge.outputStartLineNumber),
			outputEndLineNumber: getEquivalentLineForOriginalLineNumber(outputChanges, merge.outputEndLineNumber),
			incomingStartLineNumber: merge.incomingStartLineNumber,
			incomingEndLineNumber: merge.incomingEndLineNumber,
			hasConflict: merge.hasConflict,
			currentChanges: [...merge.currentChanges],
			outputChanges: [],
			incomingChanges: [...merge.incomingChanges],
			state: merge.state,
		});
		mergeIndex++;
	}

	while (changeIndex < outputChanges.length) {
		const change = outputChanges[changeIndex];
		addAndCombineRegionIfPossible(result, {
			currentStartLineNumber: getEquivalentLineForOriginalLineNumber(currentChanges, change.originalStartLineNumber),
			currentEndLineNumber: getEquivalentLineForOriginalLineNumber(currentChanges, change.originalEndLineNumber),
			outputStartLineNumber: change.modifiedStartLineNumber,
			outputEndLineNumber: change.modifiedEndLineNumber,
			incomingStartLineNumber: getEquivalentLineForOriginalLineNumber(incomingChanges, change.originalStartLineNumber),
			incomingEndLineNumber: getEquivalentLineForOriginalLineNumber(incomingChanges, change.originalEndLineNumber),
			hasConflict: false,
			currentChanges: [],
			outputChanges: [change],
			incomingChanges: [],
			state: { conflict: editorCommon.ConflictState.Resolved },
		});
		changeIndex++;
	}

	return result;
}

function getViewRange(model: ITextModel, viewModel: IViewModel, startLineNumber: number, endLineNumber: number): Range {
	const lineCount = model.getLineCount();
	startLineNumber = Math.min(lineCount, Math.max(1, startLineNumber));
	endLineNumber = Math.min(lineCount, Math.max(1, endLineNumber));
	return viewModel.coordinatesConverter.convertModelRangeToViewRange(new Range(
		startLineNumber, model.getLineMinColumn(startLineNumber),
		endLineNumber, model.getLineMaxColumn(endLineNumber)
	));
}

function validateMergeEditorOptions(options: Readonly<IMergeEditorOptions>, defaults: ValidMergeEditorBaseOptions): ValidMergeEditorBaseOptions {
	return {
		enableSplitViewResizing: validateBooleanOption(options.enableSplitViewResizing, defaults.enableSplitViewResizing),
		maxComputationTime: clampedInt(options.maxComputationTime, defaults.maxComputationTime, 0, Constants.MAX_SAFE_SMALL_INTEGER),
		maxFileSize: clampedInt(options.maxFileSize, defaults.maxFileSize, 0, Constants.MAX_SAFE_SMALL_INTEGER),
		ignoreTrimWhitespace: validateBooleanOption(options.ignoreTrimWhitespace, defaults.ignoreTrimWhitespace),
		renderIndicators: validateBooleanOption(options.renderIndicators, defaults.renderIndicators),
		renderOverviewRuler: validateBooleanOption(options.renderOverviewRuler, defaults.renderOverviewRuler),
		mergeWordWrap: validateMergeWordWrap(options.mergeWordWrap, defaults.mergeWordWrap),
	};
}

function changedMergeEditorOptions(a: ValidMergeEditorBaseOptions, b: ValidMergeEditorBaseOptions) {
	return {
		enableSplitViewResizing: (a.enableSplitViewResizing !== b.enableSplitViewResizing),
		maxComputationTime: (a.maxComputationTime !== b.maxComputationTime),
		maxFileSize: (a.maxFileSize !== b.maxFileSize),
		ignoreTrimWhitespace: (a.ignoreTrimWhitespace !== b.ignoreTrimWhitespace),
		renderIndicators: (a.renderIndicators !== b.renderIndicators),
		renderOverviewRuler: (a.renderOverviewRuler !== b.renderOverviewRuler),
		mergeWordWrap: (a.mergeWordWrap !== b.mergeWordWrap),
	};
}

registerThemingParticipant((theme, collector) => {
	const added = theme.getColor(diffInserted);
	if (added) {
		collector.addRule(`.monaco-editor .line-insert, .monaco-editor .char-insert { background-color: ${added}; }`);
		collector.addRule(`.monaco-merge-editor .line-insert, .monaco-merge-editor .char-insert { background-color: ${added}; }`);
		collector.addRule(`.monaco-editor .inline-added-margin-view-zone { background-color: ${added}; }`);
	}

	const removed = theme.getColor(diffRemoved);
	if (removed) {
		collector.addRule(`.monaco-editor .line-delete, .monaco-editor .char-delete { background-color: ${removed}; }`);
		collector.addRule(`.monaco-merge-editor .line-delete, .monaco-merge-editor .char-delete { background-color: ${removed}; }`);
		collector.addRule(`.monaco-editor .inline-deleted-margin-view-zone { background-color: ${removed}; }`);
	}

	const conflict = theme.getColor(mergeConflict);
	if (conflict) {
		collector.addRule(`.monaco-editor .line-conflict, .monaco-editor .char-conflict { background-color: ${conflict}; }`);
		collector.addRule(`.monaco-merge-editor .line-conflict, .monaco-merge-editor .char-conflict { background-color: ${conflict}; }`);
		collector.addRule(`.monaco-editor .inline-conflict-margin-view-zone { background-color: ${conflict}; }`);
	}

	const addedOutline = theme.getColor(diffInsertedOutline);
	if (addedOutline) {
		collector.addRule(`.monaco-editor .line-insert, .monaco-editor .char-insert { border: 1px ${(theme.type === ColorScheme.HIGH_CONTRAST_DARK || theme.type === ColorScheme.HIGH_CONTRAST_LIGHT) ? 'dashed' : 'solid'} ${addedOutline}; }`);
	}

	const removedOutline = theme.getColor(diffRemovedOutline);
	if (removedOutline) {
		collector.addRule(`.monaco-editor .line-delete, .monaco-editor .char-delete { border: 1px ${(theme.type === ColorScheme.HIGH_CONTRAST_DARK || theme.type === ColorScheme.HIGH_CONTRAST_LIGHT) ? 'dashed' : 'solid'} ${removedOutline}; }`);
	}

	const shadow = theme.getColor(scrollbarShadow);
	if (shadow) {
		collector.addRule(`.monaco-merge-editor.side-by-side .editor.modified { box-shadow: -6px 0 5px -5px ${shadow}; }`);
	}

	const border = theme.getColor(mergeBorder);
	if (border) {
		collector.addRule(`.monaco-merge-editor.side-by-side .editor.modified { border-left: 1px solid ${border}; }`);
	}

	const scrollbarSliderBackgroundColor = theme.getColor(scrollbarSliderBackground);
	if (scrollbarSliderBackgroundColor) {
		collector.addRule(`
			.monaco-merge-editor .mergeViewport {
				background: ${scrollbarSliderBackgroundColor};
			}
		`);
	}

	const scrollbarSliderHoverBackgroundColor = theme.getColor(scrollbarSliderHoverBackground);
	if (scrollbarSliderHoverBackgroundColor) {
		collector.addRule(`
			.monaco-merge-editor .mergeViewport:hover {
				background: ${scrollbarSliderHoverBackgroundColor};
			}
		`);
	}

	const scrollbarSliderActiveBackgroundColor = theme.getColor(scrollbarSliderActiveBackground);
	if (scrollbarSliderActiveBackgroundColor) {
		collector.addRule(`
			.monaco-merge-editor .mergeViewport:active {
				background: ${scrollbarSliderActiveBackgroundColor};
			}
		`);
	}

	const mergeDiagonalFillColor = theme.getColor(diffDiagonalFill);
	collector.addRule(`
	.monaco-editor .diagonal-fill {
		background-image: linear-gradient(
			-45deg,
			${mergeDiagonalFillColor} 12.5%,
			#0000 12.5%, #0000 50%,
			${mergeDiagonalFillColor} 50%, ${mergeDiagonalFillColor} 62.5%,
			#0000 62.5%, #0000 100%
		);
		background-size: 8px 8px;
	}
	`);
});

export const TEST_ONLY = { mergeInitialChanges, mergeDynamicChanges, rangeOverlap };
