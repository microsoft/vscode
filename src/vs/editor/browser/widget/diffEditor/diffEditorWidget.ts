/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { $, h } from 'vs/base/browser/dom';
import { IBoundarySashes } from 'vs/base/browser/ui/sash/sash';
import { findLast } from 'vs/base/common/arraysFind';
import { onUnexpectedError } from 'vs/base/common/errors';
import { Event } from 'vs/base/common/event';
import { toDisposable } from 'vs/base/common/lifecycle';
import { IObservable, autorun, autorunWithStore, derived, derivedWithStore, disposableObservableValue, recomputeInitiallyAndOnChange, observableValue, transaction } from 'vs/base/common/observable';
import 'vs/css!./style';
import { IEditorConstructionOptions } from 'vs/editor/browser/config/editorConfiguration';
import { ICodeEditor, IDiffEditor, IDiffEditorConstructionOptions, IMouseTargetViewZone } from 'vs/editor/browser/editorBrowser';
import { EditorExtensionsRegistry, IDiffEditorContributionDescription } from 'vs/editor/browser/editorExtensions';
import { ICodeEditorService } from 'vs/editor/browser/services/codeEditorService';
import { CodeEditorWidget, ICodeEditorWidgetOptions } from 'vs/editor/browser/widget/codeEditorWidget';
import { AccessibleDiffViewer } from 'vs/editor/browser/widget/diffEditor/accessibleDiffViewer';
import { DiffEditorDecorations } from 'vs/editor/browser/widget/diffEditor/diffEditorDecorations';
import { DiffEditorSash } from 'vs/editor/browser/widget/diffEditor/diffEditorSash';
import { HideUnchangedRegionsFeature } from 'vs/editor/browser/widget/diffEditor/hideUnchangedRegionsFeature';
import { ViewZoneManager } from 'vs/editor/browser/widget/diffEditor/lineAlignment';
import { MovedBlocksLinesPart } from 'vs/editor/browser/widget/diffEditor/movedBlocksLines';
import { OverviewRulerPart } from 'vs/editor/browser/widget/diffEditor/overviewRulerPart';
import { CSSStyle, ObservableElementSizeObserver, applyStyle, readHotReloadableExport } from 'vs/editor/browser/widget/diffEditor/utils';
import { IDiffEditorOptions } from 'vs/editor/common/config/editorOptions';
import { IDimension } from 'vs/editor/common/core/dimension';
import { Position } from 'vs/editor/common/core/position';
import { Range } from 'vs/editor/common/core/range';
import { CursorChangeReason } from 'vs/editor/common/cursorEvents';
import { IDiffComputationResult, ILineChange } from 'vs/editor/common/diff/legacyLinesDiffComputer';
import { DetailedLineRangeMapping } from 'vs/editor/common/diff/rangeMapping';
import { EditorType, IDiffEditorModel, IDiffEditorViewModel, IDiffEditorViewState } from 'vs/editor/common/editorCommon';
import { EditorContextKeys } from 'vs/editor/common/editorContextKeys';
import { IIdentifiedSingleEditOperation } from 'vs/editor/common/model';
import { LengthObj } from 'vs/editor/common/model/bracketPairsTextModelPart/bracketPairsTree/length';
import { AudioCue, IAudioCueService } from 'vs/platform/audioCues/browser/audioCueService';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ServiceCollection } from 'vs/platform/instantiation/common/serviceCollection';
import { IEditorProgressService } from 'vs/platform/progress/common/progress';
import './colors';
import { DelegatingEditor } from './delegatingEditorImpl';
import { DiffEditorEditors } from './diffEditorEditors';
import { DiffEditorOptions } from './diffEditorOptions';
import { DiffEditorViewModel, DiffMapping, DiffState } from './diffEditorViewModel';

export interface IDiffCodeEditorWidgetOptions {
	originalEditor?: ICodeEditorWidgetOptions;
	modifiedEditor?: ICodeEditorWidgetOptions;
}

export class DiffEditorWidget extends DelegatingEditor implements IDiffEditor {
	public static ENTIRE_DIFF_OVERVIEW_WIDTH = OverviewRulerPart.ENTIRE_DIFF_OVERVIEW_WIDTH;

	private readonly elements = h('div.monaco-diff-editor.side-by-side', { style: { position: 'relative', height: '100%' } }, [
		h('div.noModificationsOverlay@overlay', { style: { position: 'absolute', height: '100%', visibility: 'hidden', } }, [$('span', {}, 'No Changes')]),
		h('div.editor.original@original', { style: { position: 'absolute', height: '100%' } }),
		h('div.editor.modified@modified', { style: { position: 'absolute', height: '100%' } }),
		h('div.accessibleDiffViewer@accessibleDiffViewer', { style: { position: 'absolute', height: '100%' } }),
	]);
	private readonly _diffModel = this._register(disposableObservableValue<DiffEditorViewModel | undefined>('diffModel', undefined));
	public readonly onDidChangeModel = Event.fromObservableLight(this._diffModel);

	public get onDidContentSizeChange() { return this._editors.onDidContentSizeChange; }

	private readonly _contextKeyService = this._register(this._parentContextKeyService.createScoped(this._domElement));
	private readonly _instantiationService = this._parentInstantiationService.createChild(
		new ServiceCollection([IContextKeyService, this._contextKeyService])
	);
	private readonly _rootSizeObserver: ObservableElementSizeObserver;

	private readonly _sash: IObservable<DiffEditorSash | undefined>;
	private readonly _boundarySashes = observableValue<IBoundarySashes | undefined>(this, undefined);

	private unchangedRangesFeature!: HideUnchangedRegionsFeature;

	private _accessibleDiffViewerShouldBeVisible = observableValue(this, false);
	private _accessibleDiffViewerVisible = derived(this, reader =>
		this._options.onlyShowAccessibleDiffViewer.read(reader)
			? true
			: this._accessibleDiffViewerShouldBeVisible.read(reader)
	);
	private _accessibleDiffViewer!: AccessibleDiffViewer;
	private readonly _options: DiffEditorOptions;
	private readonly _editors: DiffEditorEditors;

	private readonly movedBlocksLinesPart = observableValue<MovedBlocksLinesPart | undefined>(this, undefined);

	public get collapseUnchangedRegions() { return this._options.hideUnchangedRegions.get(); }

	constructor(
		private readonly _domElement: HTMLElement,
		options: Readonly<IDiffEditorConstructionOptions>,
		codeEditorWidgetOptions: IDiffCodeEditorWidgetOptions,
		@IContextKeyService private readonly _parentContextKeyService: IContextKeyService,
		@IInstantiationService private readonly _parentInstantiationService: IInstantiationService,
		@ICodeEditorService codeEditorService: ICodeEditorService,
		@IAudioCueService private readonly _audioCueService: IAudioCueService,
		@IEditorProgressService private readonly _editorProgressService: IEditorProgressService,
	) {
		super();
		codeEditorService.willCreateDiffEditor();

		this._contextKeyService.createKey('isInDiffEditor', true);

		this._domElement.appendChild(this.elements.root);
		this._register(toDisposable(() => this._domElement.removeChild(this.elements.root)));

		this._rootSizeObserver = this._register(new ObservableElementSizeObserver(this.elements.root, options.dimension));
		this._rootSizeObserver.setAutomaticLayout(options.automaticLayout ?? false);

		this._options = new DiffEditorOptions(options, this._rootSizeObserver.width);

		this._contextKeyService.createKey(EditorContextKeys.isEmbeddedDiffEditor.key, false);
		const isEmbeddedDiffEditorKey = EditorContextKeys.isEmbeddedDiffEditor.bindTo(this._contextKeyService);
		this._register(autorun(reader => {
			/** @description update isEmbeddedDiffEditorKey */
			isEmbeddedDiffEditorKey.set(this._options.isInEmbeddedEditor.read(reader));
		}));

		const comparingMovedCodeKey = EditorContextKeys.comparingMovedCode.bindTo(this._contextKeyService);
		this._register(autorun(reader => {
			/** @description update comparingMovedCodeKey */
			comparingMovedCodeKey.set(!!this._diffModel.read(reader)?.movedTextToCompare.read(reader));
		}));

		const diffEditorRenderSideBySideInlineBreakpointReachedContextKeyValue = EditorContextKeys.diffEditorRenderSideBySideInlineBreakpointReached.bindTo(this._contextKeyService);
		this._register(autorun(reader => {
			/** @description update accessibleDiffViewerVisible context key */
			diffEditorRenderSideBySideInlineBreakpointReachedContextKeyValue.set(this._options.couldShowInlineViewBecauseOfSize.read(reader));
		}));

		this._editors = this._register(this._instantiationService.createInstance(
			DiffEditorEditors,
			this.elements.original,
			this.elements.modified,
			this._options,
			codeEditorWidgetOptions,
			(i, c, o, o2) => this._createInnerEditor(i, c, o, o2)
		));

		this._sash = derivedWithStore(this, (reader, store) => {
			const showSash = this._options.renderSideBySide.read(reader);
			this.elements.root.classList.toggle('side-by-side', showSash);
			if (!showSash) { return undefined; }
			const result = store.add(new DiffEditorSash(
				this._options,
				this.elements.root,
				{
					height: this._rootSizeObserver.height,
					width: this._rootSizeObserver.width.map((w, reader) => w - (this._options.renderOverviewRuler.read(reader) ? OverviewRulerPart.ENTIRE_DIFF_OVERVIEW_WIDTH : 0)),
				}
			));
			store.add(autorun(reader => {
				/** @description setBoundarySashes */
				const boundarySashes = this._boundarySashes.read(reader);
				if (boundarySashes) {
					result.setBoundarySashes(boundarySashes);
				}
			}));
			return result;
		});
		this._register(recomputeInitiallyAndOnChange(this._sash));

		this._register(autorunWithStore((reader, store) => {
			/** @description UnchangedRangesFeature */
			this.unchangedRangesFeature = store.add(
				this._instantiationService.createInstance(readHotReloadableExport(HideUnchangedRegionsFeature, reader), this._editors, this._diffModel, this._options)
			);
		}));

		this._register(autorunWithStore((reader, store) => {
			/** @description DiffEditorDecorations */
			store.add(new (readHotReloadableExport(DiffEditorDecorations, reader))(this._editors, this._diffModel, this._options));
		}));
		this._register(autorunWithStore((reader, store) => {
			/** @description ViewZoneManager */
			store.add(this._instantiationService.createInstance(
				readHotReloadableExport(ViewZoneManager, reader),
				this._editors,
				this._diffModel,
				this._options,
				this,
				() => this.unchangedRangesFeature.isUpdatingViewZones,
			));
		}));

		this._register(autorunWithStore((reader, store) => {
			/** @description OverviewRulerPart */
			store.add(this._instantiationService.createInstance(
				readHotReloadableExport(OverviewRulerPart, reader),
				this._editors,
				this.elements.root,
				this._diffModel,
				this._rootSizeObserver.width,
				this._rootSizeObserver.height,
				this._layoutInfo.map(i => i.modifiedEditor),
				this._options,
			));
		}));

		this._register(autorunWithStore((reader, store) => {
			/** @description _accessibleDiffViewer */
			this._accessibleDiffViewer = store.add(this._register(this._instantiationService.createInstance(
				readHotReloadableExport(AccessibleDiffViewer, reader),
				this.elements.accessibleDiffViewer,
				this._accessibleDiffViewerVisible,
				(visible, tx) => this._accessibleDiffViewerShouldBeVisible.set(visible, tx),
				this._options.onlyShowAccessibleDiffViewer.map(v => !v),
				this._rootSizeObserver.width,
				this._rootSizeObserver.height,
				this._diffModel.map((m, r) => m?.diff.read(r)?.mappings.map(m => m.lineRangeMapping)),
				this._editors,
			)));
		}));
		const visibility = this._accessibleDiffViewerVisible.map<CSSStyle['visibility']>(v => v ? 'hidden' : 'visible');
		this._register(applyStyle(this.elements.modified, { visibility }));
		this._register(applyStyle(this.elements.original, { visibility }));

		this._createDiffEditorContributions();

		codeEditorService.addDiffEditor(this);

		this._register(recomputeInitiallyAndOnChange(this._layoutInfo));

		this._register(autorunWithStore((reader, store) => {
			this.movedBlocksLinesPart.set(store.add(new (readHotReloadableExport(MovedBlocksLinesPart, reader))(
				this.elements.root,
				this._diffModel,
				this._layoutInfo.map(i => i.originalEditor),
				this._layoutInfo.map(i => i.modifiedEditor),
				this._editors,
			)), undefined);
		}));

		this._register(applyStyle(this.elements.overlay, {
			width: this._layoutInfo.map((i, r) => i.originalEditor.width + (this._options.renderSideBySide.read(r) ? 0 : i.modifiedEditor.width)),
			visibility: derived(reader => /** @description visibility */(this._options.hideUnchangedRegions.read(reader) && this._diffModel.read(reader)?.diff.read(reader)?.mappings.length === 0)
				? 'visible' : 'hidden'
			),
		}));

		// Revert change when an arrow is clicked.
		this._register(this._editors.modified.onMouseDown(event => {
			if (!event.event.rightButton && event.target.position && event.target.element?.className.includes('arrow-revert-change')) {
				const lineNumber = event.target.position.lineNumber;
				const viewZone = event.target as IMouseTargetViewZone | undefined;

				const model = this._diffModel.get();
				if (!model) { return; }
				const diffs = model.diff.get()?.mappings;
				if (!diffs) { return; }
				const diff = diffs.find(d =>
					viewZone?.detail.afterLineNumber === d.lineRangeMapping.modified.startLineNumber - 1 ||
					d.lineRangeMapping.modified.startLineNumber === lineNumber
				);
				if (!diff) { return; }
				this.revert(diff.lineRangeMapping);

				event.event.stopPropagation();
			}
		}));

		this._register(Event.runAndSubscribe(this._editors.modified.onDidChangeCursorPosition, (e) => {
			if (e?.reason === CursorChangeReason.Explicit) {
				const diff = this._diffModel.get()?.diff.get()?.mappings.find(m => m.lineRangeMapping.modified.contains(e.position.lineNumber));
				if (diff?.lineRangeMapping.modified.isEmpty) {
					this._audioCueService.playAudioCue(AudioCue.diffLineDeleted, { source: 'diffEditor.cursorPositionChanged' });
				} else if (diff?.lineRangeMapping.original.isEmpty) {
					this._audioCueService.playAudioCue(AudioCue.diffLineInserted, { source: 'diffEditor.cursorPositionChanged' });
				} else if (diff) {
					this._audioCueService.playAudioCue(AudioCue.diffLineModified, { source: 'diffEditor.cursorPositionChanged' });
				}
			}
		}));

		const isDiffUpToDate = this._diffModel.map((m, reader) => m?.isDiffUpToDate.read(reader));
		this._register(autorunWithStore((reader, store) => {
			if (isDiffUpToDate.read(reader) === false) {
				const r = this._editorProgressService.show(true, 1000);
				store.add(toDisposable(() => r.done()));
			}
		}));
	}

	public getViewWidth(): number {
		return this._rootSizeObserver.width.get();
	}

	public getContentHeight() {
		return this._editors.modified.getContentHeight();
	}

	protected _createInnerEditor(instantiationService: IInstantiationService, container: HTMLElement, options: Readonly<IEditorConstructionOptions>, editorWidgetOptions: ICodeEditorWidgetOptions): CodeEditorWidget {
		const editor = instantiationService.createInstance(CodeEditorWidget, container, options, editorWidgetOptions);
		return editor;
	}

	private readonly _layoutInfo = derived(this, reader => {
		const width = this._rootSizeObserver.width.read(reader);
		const height = this._rootSizeObserver.height.read(reader);
		const sashLeft = this._sash.read(reader)?.sashLeft.read(reader);

		const originalWidth = sashLeft ?? Math.max(5, this._editors.original.getLayoutInfo().decorationsLeft);
		const modifiedWidth = width - originalWidth - (this._options.renderOverviewRuler.read(reader) ? OverviewRulerPart.ENTIRE_DIFF_OVERVIEW_WIDTH : 0);

		const movedBlocksLinesWidth = this.movedBlocksLinesPart.read(reader)?.width.read(reader) ?? 0;
		const originalWidthWithoutMovedBlockLines = originalWidth - movedBlocksLinesWidth;
		this.elements.original.style.width = originalWidthWithoutMovedBlockLines + 'px';
		this.elements.original.style.left = '0px';

		this.elements.modified.style.width = modifiedWidth + 'px';
		this.elements.modified.style.left = originalWidth + 'px';

		this._editors.original.layout({ width: originalWidthWithoutMovedBlockLines, height });
		this._editors.modified.layout({ width: modifiedWidth, height });

		return {
			modifiedEditor: this._editors.modified.getLayoutInfo(),
			originalEditor: this._editors.original.getLayoutInfo(),
		};
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

	protected override get _targetEditor(): CodeEditorWidget { return this._editors.modified; }

	override getEditorType(): string { return EditorType.IDiffEditor; }

	override onVisible(): void {
		// TODO: Only compute diffs when diff editor is visible
		this._editors.original.onVisible();
		this._editors.modified.onVisible();
	}

	override onHide(): void {
		this._editors.original.onHide();
		this._editors.modified.onHide();
	}

	override layout(dimension?: IDimension | undefined): void { this._rootSizeObserver.observe(dimension); }

	override hasTextFocus(): boolean { return this._editors.original.hasTextFocus() || this._editors.modified.hasTextFocus(); }

	public override saveViewState(): IDiffEditorViewState {
		const originalViewState = this._editors.original.saveViewState();
		const modifiedViewState = this._editors.modified.saveViewState();
		return {
			original: originalViewState,
			modified: modifiedViewState,
			modelState: this._diffModel.get()?.serializeState(),
		};
	}

	public override restoreViewState(s: IDiffEditorViewState): void {
		if (s && s.original && s.modified) {
			const diffEditorState = s as IDiffEditorViewState;
			this._editors.original.restoreViewState(diffEditorState.original);
			this._editors.modified.restoreViewState(diffEditorState.modified);
			if (diffEditorState.modelState) {
				this._diffModel.get()?.restoreSerializedState(diffEditorState.modelState as any);
			}
		}
	}

	public createViewModel(model: IDiffEditorModel): IDiffEditorViewModel {
		return this._instantiationService.createInstance(DiffEditorViewModel, model, this._options, this);
	}

	override getModel(): IDiffEditorModel | null { return this._diffModel.get()?.model ?? null; }

	override setModel(model: IDiffEditorModel | null | IDiffEditorViewModel): void {
		if (!model && this._diffModel.get()) {
			// Transitioning from a model to no-model
			this._accessibleDiffViewer.close();
		}

		const vm = model ? ('model' in model) ? model : this.createViewModel(model) : undefined;
		this._editors.original.setModel(vm ? vm.model.original : null);
		this._editors.modified.setModel(vm ? vm.model.modified : null);
		transaction(tx => {
			this._diffModel.set(vm as (DiffEditorViewModel | undefined), tx);
		});
	}

	/**
	 * @param changedOptions Only has values for top-level options that have actually changed.
	 */
	override updateOptions(changedOptions: IDiffEditorOptions): void {
		this._options.updateOptions(changedOptions);
	}

	getContainerDomNode(): HTMLElement { return this._domElement; }
	getOriginalEditor(): ICodeEditor { return this._editors.original; }
	getModifiedEditor(): ICodeEditor { return this._editors.modified; }

	setBoundarySashes(sashes: IBoundarySashes): void {
		this._boundarySashes.set(sashes, undefined);
	}

	private readonly _diffValue = this._diffModel.map((m, r) => m?.diff.read(r));
	readonly onDidUpdateDiff: Event<void> = Event.fromObservableLight(this._diffValue);

	get ignoreTrimWhitespace(): boolean { return this._options.ignoreTrimWhitespace.get(); }

	get maxComputationTime(): number { return this._options.maxComputationTimeMs.get(); }

	get renderSideBySide(): boolean { return this._options.renderSideBySide.get(); }

	/**
	 * @deprecated Use `this.getDiffComputationResult().changes2` instead.
	 */
	getLineChanges(): ILineChange[] | null {
		const diffState = this._diffModel.get()?.diff.get();
		if (!diffState) { return null; }
		return toLineChanges(diffState);
	}

	getDiffComputationResult(): IDiffComputationResult | null {
		const diffState = this._diffModel.get()?.diff.get();
		if (!diffState) { return null; }

		return {
			changes: this.getLineChanges()!,
			changes2: diffState.mappings.map(m => m.lineRangeMapping),
			identical: diffState.identical,
			quitEarly: diffState.quitEarly,
		};
	}

	revert(diff: DetailedLineRangeMapping): void {
		const model = this._diffModel.get()?.model;
		if (!model) { return; }

		const changes: IIdentifiedSingleEditOperation[] = diff.innerChanges
			? diff.innerChanges.map<IIdentifiedSingleEditOperation>(c => ({
				range: c.modifiedRange,
				text: model.original.getValueInRange(c.originalRange)
			}))
			: [
				{
					range: diff.modified.toExclusiveRange(),
					text: model.original.getValueInRange(diff.original.toExclusiveRange())
				}
			];

		this._editors.modified.executeEdits('diffEditor', changes);
	}

	private _goTo(diff: DiffMapping): void {
		this._editors.modified.setPosition(new Position(diff.lineRangeMapping.modified.startLineNumber, 1));
		this._editors.modified.revealRangeInCenter(diff.lineRangeMapping.modified.toExclusiveRange());
	}

	goToDiff(target: 'previous' | 'next'): void {
		const diffs = this._diffModel.get()?.diff.get()?.mappings;
		if (!diffs || diffs.length === 0) {
			return;
		}

		const curLineNumber = this._editors.modified.getPosition()!.lineNumber;

		let diff: DiffMapping | undefined;
		if (target === 'next') {
			diff = diffs.find(d => d.lineRangeMapping.modified.startLineNumber > curLineNumber) ?? diffs[0];
		} else {
			diff = findLast(diffs, d => d.lineRangeMapping.modified.startLineNumber < curLineNumber) ?? diffs[diffs.length - 1];
		}
		this._goTo(diff);

		if (diff.lineRangeMapping.modified.isEmpty) {
			this._audioCueService.playAudioCue(AudioCue.diffLineDeleted, { source: 'diffEditor.goToDiff' });
		} else if (diff.lineRangeMapping.original.isEmpty) {
			this._audioCueService.playAudioCue(AudioCue.diffLineInserted, { source: 'diffEditor.goToDiff' });
		} else if (diff) {
			this._audioCueService.playAudioCue(AudioCue.diffLineModified, { source: 'diffEditor.goToDiff' });
		}
	}

	revealFirstDiff(): void {
		const diffModel = this._diffModel.get();
		if (!diffModel) {
			return;
		}
		// wait for the diff computation to finish
		this.waitForDiff().then(() => {
			const diffs = diffModel.diff.get()?.mappings;
			if (!diffs || diffs.length === 0) {
				return;
			}
			this._goTo(diffs[0]);
		});
	}

	accessibleDiffViewerNext(): void { this._accessibleDiffViewer.next(); }

	accessibleDiffViewerPrev(): void { this._accessibleDiffViewer.prev(); }

	async waitForDiff(): Promise<void> {
		const diffModel = this._diffModel.get();
		if (!diffModel) { return; }
		await diffModel.waitForDiff();
	}

	mapToOtherSide(): { destination: CodeEditorWidget; destinationSelection: Range | undefined } {
		const isModifiedFocus = this._editors.modified.hasWidgetFocus();
		const source = isModifiedFocus ? this._editors.modified : this._editors.original;
		const destination = isModifiedFocus ? this._editors.original : this._editors.modified;

		let destinationSelection: Range | undefined;

		const sourceSelection = source.getSelection();
		if (sourceSelection) {
			const mappings = this._diffModel.get()?.diff.get()?.mappings.map(m => isModifiedFocus ? m.lineRangeMapping.flip() : m.lineRangeMapping);
			if (mappings) {
				const newRange1 = translatePosition(sourceSelection.getStartPosition(), mappings);
				const newRange2 = translatePosition(sourceSelection.getEndPosition(), mappings);
				destinationSelection = Range.plusRange(newRange1, newRange2);
			}
		}
		return { destination, destinationSelection };
	}

	switchSide(): void {
		const { destination, destinationSelection } = this.mapToOtherSide();
		destination.focus();
		if (destinationSelection) {
			destination.setSelection(destinationSelection);
		}
	}

	exitCompareMove(): void {
		const model = this._diffModel.get();
		if (!model) { return; }
		model.movedTextToCompare.set(undefined, undefined);
	}

	collapseAllUnchangedRegions(): void {
		const unchangedRegions = this._diffModel.get()?.unchangedRegions.get();
		if (!unchangedRegions) { return; }
		transaction(tx => {
			for (const region of unchangedRegions) {
				region.collapseAll(tx);
			}
		});
	}

	showAllUnchangedRegions(): void {
		const unchangedRegions = this._diffModel.get()?.unchangedRegions.get();
		if (!unchangedRegions) { return; }
		transaction(tx => {
			for (const region of unchangedRegions) {
				region.showAll(tx);
			}
		});
	}
}

function translatePosition(posInOriginal: Position, mappings: DetailedLineRangeMapping[]): Range {
	const mapping = findLast(mappings, m => m.original.startLineNumber <= posInOriginal.lineNumber);
	if (!mapping) {
		// No changes before the position
		return Range.fromPositions(posInOriginal);
	}

	if (mapping.original.endLineNumberExclusive <= posInOriginal.lineNumber) {
		const newLineNumber = posInOriginal.lineNumber - mapping.original.endLineNumberExclusive + mapping.modified.endLineNumberExclusive;
		return Range.fromPositions(new Position(newLineNumber, posInOriginal.column));
	}

	if (!mapping.innerChanges) {
		// Only for legacy algorithm
		return Range.fromPositions(new Position(mapping.modified.startLineNumber, 1));
	}

	const innerMapping = findLast(mapping.innerChanges, m => m.originalRange.getStartPosition().isBeforeOrEqual(posInOriginal));
	if (!innerMapping) {
		const newLineNumber = posInOriginal.lineNumber - mapping.original.startLineNumber + mapping.modified.startLineNumber;
		return Range.fromPositions(new Position(newLineNumber, posInOriginal.column));
	}

	if (innerMapping.originalRange.containsPosition(posInOriginal)) {
		return innerMapping.modifiedRange;
	} else {
		const l = lengthBetweenPositions(innerMapping.originalRange.getEndPosition(), posInOriginal);
		return Range.fromPositions(addLength(innerMapping.modifiedRange.getEndPosition(), l));
	}
}

function lengthBetweenPositions(position1: Position, position2: Position): LengthObj {
	if (position1.lineNumber === position2.lineNumber) {
		return new LengthObj(0, position2.column - position1.column);
	} else {
		return new LengthObj(position2.lineNumber - position1.lineNumber, position2.column - 1);
	}
}

function addLength(position: Position, length: LengthObj): Position {
	if (length.lineCount === 0) {
		return new Position(position.lineNumber, position.column + length.columnCount);
	} else {
		return new Position(position.lineNumber + length.lineCount, length.columnCount + 1);
	}
}

function toLineChanges(state: DiffState): ILineChange[] {
	return state.mappings.map(x => {
		const m = x.lineRangeMapping;
		let originalStartLineNumber: number;
		let originalEndLineNumber: number;
		let modifiedStartLineNumber: number;
		let modifiedEndLineNumber: number;
		let innerChanges = m.innerChanges;

		if (m.original.isEmpty) {
			// Insertion
			originalStartLineNumber = m.original.startLineNumber - 1;
			originalEndLineNumber = 0;
			innerChanges = undefined;
		} else {
			originalStartLineNumber = m.original.startLineNumber;
			originalEndLineNumber = m.original.endLineNumberExclusive - 1;
		}

		if (m.modified.isEmpty) {
			// Deletion
			modifiedStartLineNumber = m.modified.startLineNumber - 1;
			modifiedEndLineNumber = 0;
			innerChanges = undefined;
		} else {
			modifiedStartLineNumber = m.modified.startLineNumber;
			modifiedEndLineNumber = m.modified.endLineNumberExclusive - 1;
		}

		return {
			originalStartLineNumber,
			originalEndLineNumber,
			modifiedStartLineNumber,
			modifiedEndLineNumber,
			charChanges: innerChanges?.map(m => ({
				originalStartLineNumber: m.originalRange.startLineNumber,
				originalStartColumn: m.originalRange.startColumn,
				originalEndLineNumber: m.originalRange.endLineNumber,
				originalEndColumn: m.originalRange.endColumn,
				modifiedStartLineNumber: m.modifiedRange.startLineNumber,
				modifiedStartColumn: m.modifiedRange.startColumn,
				modifiedEndLineNumber: m.modifiedRange.endLineNumber,
				modifiedEndColumn: m.modifiedRange.endColumn,
			}))
		};
	});
}
