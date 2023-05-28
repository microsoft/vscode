/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { h } from 'vs/base/browser/dom';
import { IBoundarySashes } from 'vs/base/browser/ui/sash/sash';
import { findLast } from 'vs/base/common/arrays';
import { onUnexpectedError } from 'vs/base/common/errors';
import { Emitter, Event } from 'vs/base/common/event';
import { IObservable, ISettableObservable, derived, keepAlive, observableValue, waitForState } from 'vs/base/common/observable';
import { Constants } from 'vs/base/common/uint';
import 'vs/css!./style';
import { IEditorConstructionOptions } from 'vs/editor/browser/config/editorConfiguration';
import { ICodeEditor, IDiffEditor, IDiffEditorConstructionOptions, IDiffLineInformation } from 'vs/editor/browser/editorBrowser';
import { EditorExtensionsRegistry, IDiffEditorContributionDescription } from 'vs/editor/browser/editorExtensions';
import { ICodeEditorService } from 'vs/editor/browser/services/codeEditorService';
import { CodeEditorWidget, ICodeEditorWidgetOptions } from 'vs/editor/browser/widget/codeEditorWidget';
import { IDiffCodeEditorWidgetOptions } from 'vs/editor/browser/widget/diffEditorWidget';
import { diffAddDecoration, diffDeleteDecoration, diffFullLineAddDecoration, diffFullLineDeleteDecoration } from 'vs/editor/browser/widget/diffEditorWidget2/decorations';
import { DiffEditorSash } from 'vs/editor/browser/widget/diffEditorWidget2/diffEditorSash';
import { ViewZoneAlignment } from 'vs/editor/browser/widget/diffEditorWidget2/lineAlignment';
import { OverviewRulerPart } from 'vs/editor/browser/widget/diffEditorWidget2/overviewRulerPart';
import { UnchangedRangesFeature } from 'vs/editor/browser/widget/diffEditorWidget2/unchangedRanges';
import { ObservableElementSizeObserver, applyObservableDecorations } from 'vs/editor/browser/widget/diffEditorWidget2/utils';
import { WorkerBasedDocumentDiffProvider } from 'vs/editor/browser/widget/workerBasedDocumentDiffProvider';
import { EditorOptions, IDiffEditorOptions, ValidDiffEditorBaseOptions, clampedFloat, clampedInt, boolean as validateBooleanOption, stringSet as validateStringSetOption } from 'vs/editor/common/config/editorOptions';
import { IDimension } from 'vs/editor/common/core/dimension';
import { Position } from 'vs/editor/common/core/position';
import { LineRangeMapping } from 'vs/editor/common/diff/linesDiffComputer';
import { IDiffComputationResult, ILineChange } from 'vs/editor/common/diff/smartLinesDiffComputer';
import { EditorType, IContentSizeChangedEvent, IDiffEditorModel, IDiffEditorViewState } from 'vs/editor/common/editorCommon';
import { IModelDeltaDecoration } from 'vs/editor/common/model';
import { localize } from 'vs/nls';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ServiceCollection } from 'vs/platform/instantiation/common/serviceCollection';
import { DelegatingEditor } from './delegatingEditorImpl';
import { DiffModel } from './diffModel';

const diffEditorDefaultOptions: ValidDiffEditorBaseOptions = {
	enableSplitViewResizing: true,
	splitViewDefaultRatio: 0.5,
	renderSideBySide: true,
	renderMarginRevertIcon: true,
	maxComputationTime: 5000,
	maxFileSize: 50,
	ignoreTrimWhitespace: true,
	renderIndicators: true,
	originalEditable: false,
	diffCodeLens: false,
	renderOverviewRuler: true,
	diffWordWrap: 'inherit',
	diffAlgorithm: 'advanced',
	accessibilityVerbose: false,
	experimental: {
		collapseUnchangedRegions: false,
	}
};

export class DiffEditorWidget2 extends DelegatingEditor implements IDiffEditor {
	private readonly elements = h('div.monaco-diff-editor.side-by-side', { style: { position: 'relative', height: '100%' } }, [
		h('div.editor.original@original', { style: { position: 'absolute', height: '100%' } }),
		h('div.editor.modified@modified', { style: { position: 'absolute', height: '100%' } }),
	]);
	private readonly _model = observableValue<IDiffEditorModel | null>('diffEditorModel', null);
	public readonly onDidChangeModel = Event.fromObservableLight(this._model);
	private readonly _diffModel = observableValue<DiffModel | null>('diffModel', null);
	private readonly _onDidContentSizeChange = this._register(new Emitter<IContentSizeChangedEvent>());
	public readonly onDidContentSizeChange = this._onDidContentSizeChange.event;
	private readonly _modifiedEditor: CodeEditorWidget;
	private readonly _originalEditor: CodeEditorWidget;
	private readonly _contextKeyService = this._register(this._parentContextKeyService.createScoped(this._domElement));
	private readonly _instantiationService = this._parentInstantiationService.createChild(
		new ServiceCollection([IContextKeyService, this._contextKeyService])
	);
	private readonly _rootSizeObserver: ObservableElementSizeObserver;
	private readonly _options: ISettableObservable<ValidDiffEditorBaseOptions>;
	private _isHandlingScrollEvent = false;
	private readonly _sash: DiffEditorSash;
	private readonly _renderOverviewRuler: IObservable<boolean>;

	constructor(
		private readonly _domElement: HTMLElement,
		options: Readonly<IDiffEditorConstructionOptions>,
		codeEditorWidgetOptions: IDiffCodeEditorWidgetOptions,
		@IContextKeyService private readonly _parentContextKeyService: IContextKeyService,
		@IInstantiationService private readonly _parentInstantiationService: IInstantiationService,
		@ICodeEditorService codeEditorService: ICodeEditorService,
	) {
		super();

		codeEditorService.willCreateDiffEditor();

		this._contextKeyService.createKey('isInDiffEditor', true);
		this._contextKeyService.createKey('diffEditorVersion', 2);
		this._contextKeyService.createKey('isInEmbeddedDiffEditor',
			typeof options.isInEmbeddedEditor !== 'undefined' ? options.isInEmbeddedEditor : false
		);

		this._options = observableValue<ValidDiffEditorBaseOptions>('options', validateDiffEditorOptions(options || {}, diffEditorDefaultOptions));

		this._domElement.appendChild(this.elements.root);

		this._rootSizeObserver = this._register(new ObservableElementSizeObserver(this.elements.root, options.dimension));
		this._rootSizeObserver.setAutomaticLayout(options.automaticLayout ?? false);

		this._originalEditor = this._createLeftHandSideEditor(options, codeEditorWidgetOptions.originalEditor || {});
		this._modifiedEditor = this._createRightHandSideEditor(options, codeEditorWidgetOptions.modifiedEditor || {});

		this._register(applyObservableDecorations(this._originalEditor, this._decorations.map(d => d?.originalDecorations || [])));
		this._register(applyObservableDecorations(this._modifiedEditor, this._decorations.map(d => d?.modifiedDecorations || [])));

		this._renderOverviewRuler = this._options.map(o => o.renderOverviewRuler);
		this._sash = this._register(new DiffEditorSash(
			this._options.map(o => o.enableSplitViewResizing),
			this._options.map(o => o.splitViewDefaultRatio),
			this.elements.root,
			{
				height: this._rootSizeObserver.height,
				width: this._rootSizeObserver.width.map((w, reader) => w - (this._renderOverviewRuler.read(reader) ? OverviewRulerPart.ENTIRE_DIFF_OVERVIEW_WIDTH : 0)),
			}
		));

		this._register(new UnchangedRangesFeature(this._originalEditor, this._modifiedEditor, this._diffModel));
		this._register(new ViewZoneAlignment(this._originalEditor, this._modifiedEditor, this._diffModel));


		this._register(this._instantiationService.createInstance(OverviewRulerPart,
			this._originalEditor,
			this._modifiedEditor,
			this.elements.root,
			this._diffModel,
			this._rootSizeObserver.width,
			this._rootSizeObserver.height,
			this._layoutInfo.map(i => i.modifiedEditor),
			this._renderOverviewRuler,
		));

		this._createDiffEditorContributions();

		codeEditorService.addDiffEditor(this);

		this._register(keepAlive(this._layoutInfo, true));
	}

	private readonly _layoutInfo = derived('modifiedEditorLayoutInfo', (reader) => {
		const width = this._rootSizeObserver.width.read(reader);
		const height = this._rootSizeObserver.height.read(reader);
		const sashLeft = this._sash.sashLeft.read(reader);

		this.elements.original.style.width = sashLeft + 'px';
		this.elements.original.style.left = '0px';

		this.elements.modified.style.width = (width - sashLeft) + 'px';
		this.elements.modified.style.left = sashLeft + 'px';

		this._originalEditor.layout({ width: sashLeft, height: height });
		this._modifiedEditor.layout({
			width: width - sashLeft -
				(this._renderOverviewRuler.read(reader) ? OverviewRulerPart.ENTIRE_DIFF_OVERVIEW_WIDTH : 0),
			height
		});

		return { modifiedEditor: this._modifiedEditor.getLayoutInfo() };
	});

	private readonly _decorations = derived('decorations', (reader) => {
		const diff = this._diffModel.read(reader)?.diff.read(reader);
		if (!diff) {
			return null;
		}

		const originalDecorations: IModelDeltaDecoration[] = [];
		const modifiedDecorations: IModelDeltaDecoration[] = [];
		for (const c of diff.changes) {
			const fullRangeOriginal = c.originalRange.toInclusiveRange();
			if (fullRangeOriginal) {
				originalDecorations.push({ range: fullRangeOriginal, options: diffFullLineDeleteDecoration });
			}
			const fullRangeModified = c.modifiedRange.toInclusiveRange();
			if (fullRangeModified) {
				modifiedDecorations.push({ range: fullRangeModified, options: diffFullLineAddDecoration });
			}

			for (const i of c.innerChanges || []) {
				originalDecorations.push({ range: i.originalRange, options: diffDeleteDecoration });
				modifiedDecorations.push({ range: i.modifiedRange, options: diffAddDecoration });
			}
		}
		return { originalDecorations, modifiedDecorations };
	});

	private _createDiffEditorContributions() {
		const contributions: IDiffEditorContributionDescription[] = EditorExtensionsRegistry.getDiffEditorContributions();
		for (const desc of contributions) {
			try {
				this._register(this._instantiationService.createInstance(desc.ctor, this));
			} catch (err) {
				onUnexpectedError(err);
			}
		}
	}

	private _createLeftHandSideEditor(options: Readonly<IDiffEditorConstructionOptions>, codeEditorWidgetOptions: ICodeEditorWidgetOptions): CodeEditorWidget {
		const editor = this._createInnerEditor(this._instantiationService, this.elements.original, this._adjustOptionsForLeftHandSide(options), codeEditorWidgetOptions);
		const isInDiffLeftEditorKey = this._contextKeyService.createKey<boolean>('isInDiffLeftEditor', editor.hasWidgetFocus());
		this._register(editor.onDidFocusEditorWidget(() => isInDiffLeftEditorKey.set(true)));
		this._register(editor.onDidBlurEditorWidget(() => isInDiffLeftEditorKey.set(false)));
		return editor;
	}

	private _createRightHandSideEditor(options: Readonly<IDiffEditorConstructionOptions>, codeEditorWidgetOptions: ICodeEditorWidgetOptions): CodeEditorWidget {
		const editor = this._createInnerEditor(this._instantiationService, this.elements.modified, this._adjustOptionsForRightHandSide(options), codeEditorWidgetOptions);
		const isInDiffRightEditorKey = this._contextKeyService.createKey<boolean>('isInDiffRightEditor', editor.hasWidgetFocus());
		this._register(editor.onDidFocusEditorWidget(() => isInDiffRightEditorKey.set(true)));
		this._register(editor.onDidBlurEditorWidget(() => isInDiffRightEditorKey.set(false)));

		// Revert change when an arrow is clicked.
		/*TODO
		this._register(editor.onMouseDown(event => {
			if (!event.event.rightButton && event.target.position && event.target.element?.className.includes('arrow-revert-change')) {
				const lineNumber = event.target.position.lineNumber;
				const viewZone = event.target as editorBrowser.IMouseTargetViewZone | undefined;
				const change = this._diffComputationResult?.changes.find(c =>
					// delete change
					viewZone?.detail.afterLineNumber === c.modifiedStartLineNumber ||
					// other changes
					(c.modifiedEndLineNumber > 0 && c.modifiedStartLineNumber === lineNumber));
				if (change) {
					this.revertChange(change);
				}
				event.event.stopPropagation();
				this._updateDecorations();
				return;
			}
		}));*/

		return editor;
	}

	protected _createInnerEditor(instantiationService: IInstantiationService, container: HTMLElement, options: Readonly<IEditorConstructionOptions>, editorWidgetOptions: ICodeEditorWidgetOptions): CodeEditorWidget {
		const editor = instantiationService.createInstance(CodeEditorWidget, container, options, editorWidgetOptions);

		this._register(editor.onDidContentSizeChange(e => {
			const width = this._originalEditor.getContentWidth() + this._modifiedEditor.getContentWidth() + OverviewRulerPart.ENTIRE_DIFF_OVERVIEW_WIDTH;
			const height = Math.max(this._modifiedEditor.getContentHeight(), this._originalEditor.getContentHeight());

			this._onDidContentSizeChange.fire({
				contentHeight: height,
				contentWidth: width,
				contentHeightChanged: e.contentHeightChanged,
				contentWidthChanged: e.contentWidthChanged
			});
		}));

		this._register(editor.onDidScrollChange((e) => {
			if (this._isHandlingScrollEvent) {
				return;
			}
			if (!e.scrollTopChanged && !e.scrollLeftChanged && !e.scrollHeightChanged) {
				return;
			}
			this._isHandlingScrollEvent = true;
			try {
				const otherEditor = editor === this._originalEditor ? this._modifiedEditor : this._originalEditor;
				otherEditor.setScrollPosition({
					scrollLeft: e.scrollLeft,
					scrollTop: e.scrollTop
				});
			} finally {
				this._isHandlingScrollEvent = false;
			}
		}));

		return editor;
	}

	private _adjustOptionsForLeftHandSide(options: Readonly<IDiffEditorConstructionOptions>): IEditorConstructionOptions {
		const result = this._adjustOptionsForSubEditor(options);
		if (!options.renderSideBySide) {
			// never wrap hidden editor
			result.wordWrapOverride1 = 'off';
			result.wordWrapOverride2 = 'off';
		} else {
			result.wordWrapOverride1 = this._options.get().diffWordWrap;
		}
		if (options.originalAriaLabel) {
			result.ariaLabel = options.originalAriaLabel;
		}
		result.ariaLabel = this._updateAriaLabel(result.ariaLabel);
		result.readOnly = !options.originalEditable;
		result.dropIntoEditor = { enabled: !result.readOnly };
		result.extraEditorClassName = 'original-in-monaco-diff-editor';
		return result;
	}

	private _adjustOptionsForRightHandSide(options: Readonly<IDiffEditorConstructionOptions>): IEditorConstructionOptions {
		const result = this._adjustOptionsForSubEditor(options);
		if (options.modifiedAriaLabel) {
			result.ariaLabel = options.modifiedAriaLabel;
		}
		result.ariaLabel = this._updateAriaLabel(result.ariaLabel);
		result.wordWrapOverride1 = this._options.get().diffWordWrap;
		result.revealHorizontalRightPadding = EditorOptions.revealHorizontalRightPadding.defaultValue + OverviewRulerPart.ENTIRE_DIFF_OVERVIEW_WIDTH;
		result.scrollbar!.verticalHasArrows = false;
		result.extraEditorClassName = 'modified-in-monaco-diff-editor';
		return result;
	}

	private _adjustOptionsForSubEditor(options: Readonly<IDiffEditorConstructionOptions>): IEditorConstructionOptions {
		const clonedOptions = {
			...options,
			dimension: {
				height: 0,
				width: 0
			},
		};
		clonedOptions.inDiffEditor = true;
		clonedOptions.automaticLayout = false;
		// Clone scrollbar options before changing them
		clonedOptions.scrollbar = { ...(clonedOptions.scrollbar || {}) };
		clonedOptions.scrollbar.vertical = 'visible';
		clonedOptions.folding = false;
		clonedOptions.codeLens = this._options.get().diffCodeLens;
		clonedOptions.fixedOverflowWidgets = true;
		// clonedOptions.lineDecorationsWidth = '2ch';
		// Clone minimap options before changing them
		clonedOptions.minimap = { ...(clonedOptions.minimap || {}) };
		clonedOptions.minimap.enabled = false;
		return clonedOptions;
	}

	private _updateAriaLabel(ariaLabel: string | undefined): string | undefined {
		const ariaNavigationTip = localize('diff-aria-navigation-tip', ' use Shift + F7 to navigate changes');
		if (this._options.get().accessibilityVerbose) {
			return ariaLabel + ariaNavigationTip;
		} else if (ariaLabel) {
			return ariaLabel.replaceAll(ariaNavigationTip, '');
		}
		return undefined;
	}

	protected override get _targetEditor(): CodeEditorWidget { return this._modifiedEditor; }

	override getEditorType(): string { return EditorType.IDiffEditor; }

	override onVisible(): void {
		// TODO: Only compute diffs when diff editor is visible
		this._originalEditor.onVisible();
		this._modifiedEditor.onVisible();
	}

	override onHide(): void {
		this._originalEditor.onHide();
		this._modifiedEditor.onHide();
	}

	override layout(dimension?: IDimension | undefined): void {
		this._rootSizeObserver.observe(dimension);
	}

	override hasTextFocus(): boolean {
		return this._originalEditor.hasTextFocus() || this._modifiedEditor.hasTextFocus();
	}

	override saveViewState(): IDiffEditorViewState | null {
		return null;
		//throw new Error('Method not implemented.');
	}

	override restoreViewState(state: IDiffEditorViewState | null): void {
		//throw new Error('Method not implemented.');
	}

	override getModel(): IDiffEditorModel | null { return this._model.get(); }

	override setModel(model: IDiffEditorModel | null): void {
		this._originalEditor.setModel(model ? model.original : null);
		this._modifiedEditor.setModel(model ? model.modified : null);

		this._model.set(model, undefined);

		this._diffModel.set(model ? new DiffModel(
			model,
			this._options.map(o => o.ignoreTrimWhitespace),
			this._options.map(o => o.maxComputationTime),
			this._options.map(o => o.experimental.collapseUnchangedRegions!),
			this._instantiationService.createInstance(WorkerBasedDocumentDiffProvider, this._options.get())
		) : null, undefined);
	}

	override updateOptions(_newOptions: IDiffEditorOptions): void {
		const newOptions = validateDiffEditorOptions(_newOptions, this._options.get());
		this._options.set(newOptions, undefined);

		this._modifiedEditor.updateOptions(this._adjustOptionsForRightHandSide(_newOptions));
		this._originalEditor.updateOptions(this._adjustOptionsForLeftHandSide(_newOptions));
	}

	getContainerDomNode(): HTMLElement { return this._domElement; }
	getOriginalEditor(): ICodeEditor { return this._originalEditor; }
	getModifiedEditor(): ICodeEditor { return this._modifiedEditor; }

	setBoundarySashes(sashes: IBoundarySashes): void {
		this._sash.setBoundarySashes(sashes);
	}

	readonly onDidUpdateDiff: Event<void> = e => {
		return { dispose: () => { } };
	};

	get ignoreTrimWhitespace(): boolean {
		return this._options.get().ignoreTrimWhitespace;
	}

	get maxComputationTime(): number {
		return this._options.get().maxComputationTime;
	}

	get renderSideBySide(): boolean {
		return this._options.get().renderSideBySide;
	}

	getLineChanges(): ILineChange[] | null {
		return null;
		//throw new Error('Method not implemented.');
	}
	getDiffComputationResult(): IDiffComputationResult | null {
		return null;
		//throw new Error('Method not implemented.');
	}
	getDiffLineInformationForOriginal(lineNumber: number): IDiffLineInformation | null {
		return null;
		//throw new Error('Method not implemented.');
	}
	getDiffLineInformationForModified(lineNumber: number): IDiffLineInformation | null {
		return null;
		//throw new Error('Method not implemented.');
	}

	private _goTo(diff: LineRangeMapping): void {
		this._modifiedEditor.setPosition(new Position(diff.modifiedRange.startLineNumber, 1));
		this._modifiedEditor.revealRangeInCenter(diff.modifiedRange.toExclusiveRange());
	}

	goToDiff(target: 'previous' | 'next'): void {
		const diffs = this._diffModel.get()?.diff.get()?.changes;
		if (!diffs || diffs.length === 0) {
			return;
		}

		const curLineNumber = this._modifiedEditor.getPosition()!.lineNumber;

		let diff: LineRangeMapping | undefined;
		if (target === 'next') {
			diff = diffs.find(d => d.modifiedRange.startLineNumber > curLineNumber) ?? diffs[0];
		} else {
			diff = findLast(diffs, d => d.modifiedRange.startLineNumber < curLineNumber) ?? diffs[diffs.length - 1];
		}
		this._goTo(diff);
	}

	revealFirstDiff(): void {
		const diffModel = this._diffModel.get();
		if (!diffModel) {
			return;
		}
		// wait for the diff computation to finish
		waitForState(diffModel.isDiffUpToDate, s => s).then(() => {
			const diffs = diffModel.diff.get()?.changes;
			if (!diffs || diffs.length === 0) {
				return;
			}
			this._goTo(diffs[0]);
		});
	}
}

function validateDiffEditorOptions(options: Readonly<IDiffEditorOptions>, defaults: ValidDiffEditorBaseOptions): ValidDiffEditorBaseOptions {
	return {
		enableSplitViewResizing: validateBooleanOption(options.enableSplitViewResizing, defaults.enableSplitViewResizing),
		splitViewDefaultRatio: clampedFloat(options.splitViewDefaultRatio, 0.5, 0.1, 0.9),
		renderSideBySide: validateBooleanOption(options.renderSideBySide, defaults.renderSideBySide),
		renderMarginRevertIcon: validateBooleanOption(options.renderMarginRevertIcon, defaults.renderMarginRevertIcon),
		maxComputationTime: clampedInt(options.maxComputationTime, defaults.maxComputationTime, 0, Constants.MAX_SAFE_SMALL_INTEGER),
		maxFileSize: clampedInt(options.maxFileSize, defaults.maxFileSize, 0, Constants.MAX_SAFE_SMALL_INTEGER),
		ignoreTrimWhitespace: validateBooleanOption(options.ignoreTrimWhitespace, defaults.ignoreTrimWhitespace),
		renderIndicators: validateBooleanOption(options.renderIndicators, defaults.renderIndicators),
		originalEditable: validateBooleanOption(options.originalEditable, defaults.originalEditable),
		diffCodeLens: validateBooleanOption(options.diffCodeLens, defaults.diffCodeLens),
		renderOverviewRuler: validateBooleanOption(options.renderOverviewRuler, defaults.renderOverviewRuler),
		diffWordWrap: validateStringSetOption<'off' | 'on' | 'inherit'>(options.diffWordWrap, defaults.diffWordWrap, ['off', 'on', 'inherit']),
		diffAlgorithm: validateStringSetOption(options.diffAlgorithm, defaults.diffAlgorithm, ['legacy', 'advanced'], { 'smart': 'legacy', 'experimental': 'advanced' }),
		accessibilityVerbose: validateBooleanOption(options.accessibilityVerbose, defaults.accessibilityVerbose),
		experimental: {
			collapseUnchangedRegions: validateBooleanOption(options.experimental?.collapseUnchangedRegions, defaults.experimental.collapseUnchangedRegions!),
		},
	};
}
