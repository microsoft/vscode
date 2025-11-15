/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Dimension, reset } from '../../../../../base/browser/dom.js';
import { Grid, GridNodeDescriptor, IView, SerializableGrid } from '../../../../../base/browser/ui/grid/grid.js';
import { Orientation } from '../../../../../base/browser/ui/splitview/splitview.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { Color } from '../../../../../base/common/color.js';
import { BugIndicatingError, onUnexpectedError } from '../../../../../base/common/errors.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { Disposable, DisposableStore, IDisposable, MutableDisposable, thenIfNotDisposed, toDisposable } from '../../../../../base/common/lifecycle.js';
import { autorun, autorunWithStore, IObservable, IReader, observableValue, transaction } from '../../../../../base/common/observable.js';
import { basename, isEqual } from '../../../../../base/common/resources.js';
import { isDefined } from '../../../../../base/common/types.js';
import { URI } from '../../../../../base/common/uri.js';
import './media/mergeEditor.css';
import { ICodeEditor, IViewZoneChangeAccessor } from '../../../../../editor/browser/editorBrowser.js';
import { ICodeEditorService } from '../../../../../editor/browser/services/codeEditorService.js';
import { IEditorOptions as ICodeEditorOptions } from '../../../../../editor/common/config/editorOptions.js';
import { ICodeEditorViewState, ScrollType } from '../../../../../editor/common/editorCommon.js';
import { ITextModel } from '../../../../../editor/common/model.js';
import { ITextResourceConfigurationService } from '../../../../../editor/common/services/textResourceConfiguration.js';
import { localize } from '../../../../../nls.js';
import { IContextKey, IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { IEditorOptions, ITextEditorOptions, ITextResourceEditorInput } from '../../../../../platform/editor/common/editor.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { IThemeService } from '../../../../../platform/theme/common/themeService.js';
import { AbstractTextEditor } from '../../../../browser/parts/editor/textEditor.js';
import { DEFAULT_EDITOR_ASSOCIATION, EditorInputWithOptions, IEditorOpenContext, IResourceMergeEditorInput } from '../../../../common/editor.js';
import { EditorInput } from '../../../../common/editor/editorInput.js';
import { applyTextEditorOptions } from '../../../../common/editor/editorOptions.js';
import { readTransientState, writeTransientState } from '../../../codeEditor/browser/toggleWordWrap.js';
import { MergeEditorInput } from '../mergeEditorInput.js';
import { IMergeEditorInputModel } from '../mergeEditorInputModel.js';
import { MergeEditorModel } from '../model/mergeEditorModel.js';
import { deepMerge, PersistentStore } from '../utils.js';
import { BaseCodeEditorView } from './editors/baseCodeEditorView.js';
import { ScrollSynchronizer } from './scrollSynchronizer.js';
import { MergeEditorViewModel } from './viewModel.js';
import { ViewZoneComputer } from './viewZones.js';
import { ctxIsMergeEditor, ctxMergeBaseUri, ctxMergeEditorLayout, ctxMergeEditorShowBase, ctxMergeEditorShowBaseAtTop, ctxMergeEditorShowNonConflictingChanges, ctxMergeResultUri, MergeEditorLayoutKind } from '../../common/mergeEditor.js';
import { settingsSashBorder } from '../../../preferences/common/settingsEditorColorRegistry.js';
import { IEditorGroup, IEditorGroupsService } from '../../../../services/editor/common/editorGroupsService.js';
import { IEditorResolverService, MergeEditorInputFactoryFunction, RegisteredEditorPriority } from '../../../../services/editor/common/editorResolverService.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import './colors.js';
import { InputCodeEditorView } from './editors/inputCodeEditorView.js';
import { ResultCodeEditorView } from './editors/resultCodeEditorView.js';

export class MergeEditor extends AbstractTextEditor<IMergeEditorViewState> {

	static readonly ID = 'mergeEditor';

	private readonly _sessionDisposables;
	private readonly _viewModel;

	public get viewModel(): IObservable<MergeEditorViewModel | undefined> {
		return this._viewModel;
	}

	private rootHtmlElement: HTMLElement | undefined;
	private readonly _grid;
	private readonly input1View;
	private readonly baseView;
	private readonly baseViewOptions;
	private readonly input2View;

	private readonly inputResultView;
	private readonly _layoutMode;
	private readonly _layoutModeObs;
	private readonly _ctxIsMergeEditor: IContextKey<boolean>;
	private readonly _ctxUsesColumnLayout: IContextKey<string>;
	private readonly _ctxShowBase: IContextKey<boolean>;
	private readonly _ctxShowBaseAtTop;
	private readonly _ctxResultUri: IContextKey<string>;
	private readonly _ctxBaseUri: IContextKey<string>;
	private readonly _ctxShowNonConflictingChanges: IContextKey<boolean>;
	private readonly _inputModel;
	public get inputModel(): IObservable<IMergeEditorInputModel | undefined> {
		return this._inputModel;
	}
	public get model(): MergeEditorModel | undefined {
		return this.inputModel.get()?.model;
	}

	private readonly viewZoneComputer;

	private readonly scrollSynchronizer;

	constructor(
		group: IEditorGroup,
		@IInstantiationService instantiation: IInstantiationService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@ITelemetryService telemetryService: ITelemetryService,
		@IStorageService storageService: IStorageService,
		@IThemeService themeService: IThemeService,
		@ITextResourceConfigurationService textResourceConfigurationService: ITextResourceConfigurationService,
		@IEditorService editorService: IEditorService,
		@IEditorGroupsService editorGroupService: IEditorGroupsService,
		@IFileService fileService: IFileService,
		@ICodeEditorService private readonly _codeEditorService: ICodeEditorService
	) {
		super(MergeEditor.ID, group, telemetryService, instantiation, storageService, textResourceConfigurationService, themeService, editorService, editorGroupService, fileService);
		this._sessionDisposables = new DisposableStore();
		this._viewModel = observableValue<MergeEditorViewModel | undefined>(this, undefined);
		this._grid = this._register(new MutableDisposable<Grid<IView>>());
		this.input1View = this._register(this.instantiationService.createInstance(InputCodeEditorView, 1, this._viewModel));
		this.baseView = observableValue<BaseCodeEditorView | undefined>(this, undefined);
		this.baseViewOptions = observableValue<Readonly<ICodeEditorOptions> | undefined>(this, undefined);
		this.input2View = this._register(this.instantiationService.createInstance(InputCodeEditorView, 2, this._viewModel));
		this.inputResultView = this._register(this.instantiationService.createInstance(ResultCodeEditorView, this._viewModel));
		this._layoutMode = this.instantiationService.createInstance(MergeEditorLayoutStore);
		this._layoutModeObs = observableValue(this, this._layoutMode.value);
		this._ctxIsMergeEditor = ctxIsMergeEditor.bindTo(this.contextKeyService);
		this._ctxUsesColumnLayout = ctxMergeEditorLayout.bindTo(this.contextKeyService);
		this._ctxShowBase = ctxMergeEditorShowBase.bindTo(this.contextKeyService);
		this._ctxShowBaseAtTop = ctxMergeEditorShowBaseAtTop.bindTo(this.contextKeyService);
		this._ctxResultUri = ctxMergeResultUri.bindTo(this.contextKeyService);
		this._ctxBaseUri = ctxMergeBaseUri.bindTo(this.contextKeyService);
		this._ctxShowNonConflictingChanges = ctxMergeEditorShowNonConflictingChanges.bindTo(this.contextKeyService);
		this._inputModel = observableValue<IMergeEditorInputModel | undefined>(this, undefined);
		this.viewZoneComputer = new ViewZoneComputer(
			this.input1View.editor,
			this.input2View.editor,
			this.inputResultView.editor,
		);
		this.scrollSynchronizer = this._register(new ScrollSynchronizer(this._viewModel, this.input1View, this.input2View, this.baseView, this.inputResultView, this._layoutModeObs));
		this._onDidChangeSizeConstraints = new Emitter<void>();
		this.onDidChangeSizeConstraints = this._onDidChangeSizeConstraints.event;
		this.baseViewDisposables = this._register(new DisposableStore());
		this.showNonConflictingChangesStore = this.instantiationService.createInstance(PersistentStore<boolean>, 'mergeEditor/showNonConflictingChanges');
		this.showNonConflictingChanges = observableValue(this, this.showNonConflictingChangesStore.get() ?? false);
	}

	override dispose(): void {
		this._sessionDisposables.dispose();
		this._ctxIsMergeEditor.reset();
		this._ctxUsesColumnLayout.reset();
		this._ctxShowNonConflictingChanges.reset();
		super.dispose();
	}

	// #region layout constraints

	private readonly _onDidChangeSizeConstraints;
	override readonly onDidChangeSizeConstraints: Event<void>;

	override get minimumWidth() {
		return this._layoutMode.value.kind === 'mixed'
			? this.input1View.view.minimumWidth + this.input2View.view.minimumWidth
			: this.input1View.view.minimumWidth + this.input2View.view.minimumWidth + this.inputResultView.view.minimumWidth;
	}

	// #endregion

	override getTitle(): string {
		if (this.input) {
			return this.input.getName();
		}

		return localize('mergeEditor', "Text Merge Editor");
	}

	protected createEditorControl(parent: HTMLElement, initialOptions: ICodeEditorOptions): void {
		this.rootHtmlElement = parent;
		parent.classList.add('merge-editor');
		this.applyLayout(this._layoutMode.value);
		this.applyOptions(initialOptions);
	}

	protected updateEditorControlOptions(options: ICodeEditorOptions): void {
		this.applyOptions(options);
	}

	private applyOptions(options: ICodeEditorOptions): void {
		const inputOptions: ICodeEditorOptions = deepMerge<ICodeEditorOptions>(options, {
			minimap: { enabled: false },
			glyphMargin: false,
			lineNumbersMinChars: 2
		});

		const readOnlyInputOptions: ICodeEditorOptions = deepMerge<ICodeEditorOptions>(inputOptions, {
			readOnly: true,
			readOnlyMessage: undefined
		});

		this.input1View.updateOptions(readOnlyInputOptions);
		this.input2View.updateOptions(readOnlyInputOptions);
		this.baseViewOptions.set({ ...this.input2View.editor.getRawOptions() }, undefined);
		this.inputResultView.updateOptions(inputOptions);
	}

	protected getMainControl(): ICodeEditor | undefined {
		return this.inputResultView.editor;
	}

	layout(dimension: Dimension): void {
		this._grid.value?.layout(dimension.width, dimension.height);
	}

	override async setInput(input: EditorInput, options: IEditorOptions | undefined, context: IEditorOpenContext, token: CancellationToken): Promise<void> {
		if (!(input instanceof MergeEditorInput)) {
			throw new BugIndicatingError('ONLY MergeEditorInput is supported');
		}
		await super.setInput(input, options, context, token);

		this._sessionDisposables.clear();
		transaction(tx => {
			this._viewModel.set(undefined, tx);
			this._inputModel.set(undefined, tx);
		});

		const inputModel = await input.resolve();
		const model = inputModel.model;

		const viewModel = this.instantiationService.createInstance(
			MergeEditorViewModel,
			model,
			this.input1View,
			this.input2View,
			this.inputResultView,
			this.baseView,
			this.showNonConflictingChanges,
		);

		model.telemetry.reportMergeEditorOpened({
			combinableConflictCount: model.combinableConflictCount,
			conflictCount: model.conflictCount,

			baseTop: this._layoutModeObs.get().showBaseAtTop,
			baseVisible: this._layoutModeObs.get().showBase,
			isColumnView: this._layoutModeObs.get().kind === 'columns',
		});

		transaction(tx => {
			this._viewModel.set(viewModel, tx);
			this._inputModel.set(inputModel, tx);
		});
		this._sessionDisposables.add(viewModel);

		// Track focus changes to update the editor name
		this._sessionDisposables.add(autorun(reader => {
			/** @description Update focused editor name based on focus */
			const focusedType = viewModel.focusedEditorType.read(reader);

			if (!(input instanceof MergeEditorInput)) {
				return;
			}

			input.updateFocusedEditor(focusedType || 'result');
		}));

		// Set/unset context keys based on input
		this._ctxResultUri.set(inputModel.resultUri.toString());
		this._ctxBaseUri.set(model.base.uri.toString());
		this._sessionDisposables.add(toDisposable(() => {
			this._ctxBaseUri.reset();
			this._ctxResultUri.reset();
		}));

		const viewZoneRegistrationStore = new DisposableStore();
		this._sessionDisposables.add(viewZoneRegistrationStore);
		// Set the view zones before restoring view state!
		// Otherwise scrolling will be off
		this._sessionDisposables.add(autorunWithStore((reader) => {
			/** @description update alignment view zones */
			const baseView = this.baseView.read(reader);

			const resultScrollTop = this.inputResultView.editor.getScrollTop();
			this.scrollSynchronizer.stopSync();

			viewZoneRegistrationStore.clear();

			this.inputResultView.editor.changeViewZones(resultViewZoneAccessor => {
				const layout = this._layoutModeObs.read(reader);
				const shouldAlignResult = layout.kind === 'columns';
				const shouldAlignBase = layout.kind === 'mixed' && !layout.showBaseAtTop;

				this.input1View.editor.changeViewZones(input1ViewZoneAccessor => {
					this.input2View.editor.changeViewZones(input2ViewZoneAccessor => {
						if (baseView) {
							baseView.editor.changeViewZones(baseViewZoneAccessor => {
								viewZoneRegistrationStore.add(this.setViewZones(reader,
									viewModel,
									this.input1View.editor,
									input1ViewZoneAccessor,
									this.input2View.editor,
									input2ViewZoneAccessor,
									baseView.editor,
									baseViewZoneAccessor,
									shouldAlignBase,
									this.inputResultView.editor,
									resultViewZoneAccessor,
									shouldAlignResult
								));
							});
						} else {
							viewZoneRegistrationStore.add(this.setViewZones(reader,
								viewModel,
								this.input1View.editor,
								input1ViewZoneAccessor,
								this.input2View.editor,
								input2ViewZoneAccessor,
								undefined,
								undefined,
								false,
								this.inputResultView.editor,
								resultViewZoneAccessor,
								shouldAlignResult
							));
						}
					});
				});
			});

			this.inputResultView.editor.setScrollTop(resultScrollTop, ScrollType.Smooth);

			this.scrollSynchronizer.startSync();
			this.scrollSynchronizer.updateScrolling();
		}));

		const viewState = this.loadEditorViewState(input, context);
		if (viewState) {
			this._applyViewState(viewState);
		} else {
			this._sessionDisposables.add(thenIfNotDisposed(model.onInitialized, () => {
				const firstConflict = model.modifiedBaseRanges.get().find(r => r.isConflicting);
				if (!firstConflict) {
					return;
				}
				this.input1View.editor.revealLineInCenter(firstConflict.input1Range.startLineNumber);
				transaction(tx => {
					/** @description setActiveModifiedBaseRange */
					viewModel.setActiveModifiedBaseRange(firstConflict, tx);
				});
			}));
		}

		// word wrap special case - sync transient state from result model to input[1|2] models
		const mirrorWordWrapTransientState = (candidate: ITextModel) => {
			const candidateState = readTransientState(candidate, this._codeEditorService);

			writeTransientState(model.input2.textModel, candidateState, this._codeEditorService);
			writeTransientState(model.input1.textModel, candidateState, this._codeEditorService);
			writeTransientState(model.resultTextModel, candidateState, this._codeEditorService);

			const baseTextModel = this.baseView.get()?.editor.getModel();
			if (baseTextModel) {
				writeTransientState(baseTextModel, candidateState, this._codeEditorService);
			}
		};
		this._sessionDisposables.add(this._codeEditorService.onDidChangeTransientModelProperty(candidate => {
			mirrorWordWrapTransientState(candidate);
		}));
		mirrorWordWrapTransientState(this.inputResultView.editor.getModel()!);

		// detect when base, input1, and input2 become empty and replace THIS editor with its result editor
		// TODO@jrieken@hediet this needs a better/cleaner solution
		// https://github.com/microsoft/vscode/issues/155940
		const that = this;
		this._sessionDisposables.add(new class {

			private readonly _disposable = new DisposableStore();

			constructor() {
				for (const model of this.baseInput1Input2()) {
					this._disposable.add(model.onDidChangeContent(() => this._checkBaseInput1Input2AllEmpty()));
				}
			}

			dispose() {
				this._disposable.dispose();
			}

			private *baseInput1Input2() {
				yield model.base;
				yield model.input1.textModel;
				yield model.input2.textModel;
			}

			private _checkBaseInput1Input2AllEmpty() {
				for (const model of this.baseInput1Input2()) {
					if (model.getValueLength() > 0) {
						return;
					}
				}
				// all empty -> replace this editor with a normal editor for result
				that.editorService.replaceEditors(
					[{ editor: input, replacement: { resource: input.result, options: { preserveFocus: true } }, forceReplaceDirty: true }],
					that.group
				);
			}
		});
	}

	private setViewZones(
		reader: IReader,
		viewModel: MergeEditorViewModel,
		input1Editor: ICodeEditor,
		input1ViewZoneAccessor: IViewZoneChangeAccessor,
		input2Editor: ICodeEditor,
		input2ViewZoneAccessor: IViewZoneChangeAccessor,
		baseEditor: ICodeEditor | undefined,
		baseViewZoneAccessor: IViewZoneChangeAccessor | undefined,
		shouldAlignBase: boolean,
		resultEditor: ICodeEditor,
		resultViewZoneAccessor: IViewZoneChangeAccessor,
		shouldAlignResult: boolean,
	): IDisposable {
		const input1ViewZoneIds: string[] = [];
		const input2ViewZoneIds: string[] = [];
		const baseViewZoneIds: string[] = [];
		const resultViewZoneIds: string[] = [];

		const viewZones = this.viewZoneComputer.computeViewZones(reader, viewModel, {
			codeLensesVisible: true,
			showNonConflictingChanges: this.showNonConflictingChanges.read(reader),
			shouldAlignBase,
			shouldAlignResult,
		});

		const disposableStore = new DisposableStore();

		if (baseViewZoneAccessor) {
			for (const v of viewZones.baseViewZones) {
				v.create(baseViewZoneAccessor, baseViewZoneIds, disposableStore);
			}
		}

		for (const v of viewZones.resultViewZones) {
			v.create(resultViewZoneAccessor, resultViewZoneIds, disposableStore);
		}

		for (const v of viewZones.input1ViewZones) {
			v.create(input1ViewZoneAccessor, input1ViewZoneIds, disposableStore);
		}

		for (const v of viewZones.input2ViewZones) {
			v.create(input2ViewZoneAccessor, input2ViewZoneIds, disposableStore);
		}

		disposableStore.add({
			dispose: () => {
				input1Editor.changeViewZones(a => {
					for (const zone of input1ViewZoneIds) {
						a.removeZone(zone);
					}
				});
				input2Editor.changeViewZones(a => {
					for (const zone of input2ViewZoneIds) {
						a.removeZone(zone);
					}
				});
				baseEditor?.changeViewZones(a => {
					for (const zone of baseViewZoneIds) {
						a.removeZone(zone);
					}
				});
				resultEditor.changeViewZones(a => {
					for (const zone of resultViewZoneIds) {
						a.removeZone(zone);
					}
				});
			}
		});

		return disposableStore;
	}

	override setOptions(options: ITextEditorOptions | undefined): void {
		super.setOptions(options);

		if (options) {
			applyTextEditorOptions(options, this.inputResultView.editor, ScrollType.Smooth);
		}
	}

	override clearInput(): void {
		super.clearInput();

		this._sessionDisposables.clear();

		for (const { editor } of [this.input1View, this.input2View, this.inputResultView]) {
			editor.setModel(null);
		}
	}

	override focus(): void {
		super.focus();

		(this.getControl() ?? this.inputResultView.editor).focus();
	}

	override hasFocus(): boolean {
		for (const { editor } of [this.input1View, this.input2View, this.inputResultView]) {
			if (editor.hasTextFocus()) {
				return true;
			}
		}
		return super.hasFocus();
	}

	protected override setEditorVisible(visible: boolean): void {
		super.setEditorVisible(visible);

		for (const { editor } of [this.input1View, this.input2View, this.inputResultView]) {
			if (visible) {
				editor.onVisible();
			} else {
				editor.onHide();
			}
		}

		this._ctxIsMergeEditor.set(visible);
	}

	// ---- interact with "outside world" via`getControl`, `scopedContextKeyService`: we only expose the result-editor keep the others internal

	override getControl(): ICodeEditor | undefined {
		return this.inputResultView.editor;
	}

	override get scopedContextKeyService(): IContextKeyService | undefined {
		const control = this.getControl();
		return control?.invokeWithinContext(accessor => accessor.get(IContextKeyService));
	}

	// --- layout

	public toggleBase(): void {
		this.setLayout({
			...this._layoutMode.value,
			showBase: !this._layoutMode.value.showBase
		});
	}

	public toggleShowBaseTop(): void {
		const showBaseTop = this._layoutMode.value.showBase && this._layoutMode.value.showBaseAtTop;
		this.setLayout({
			...this._layoutMode.value,
			showBaseAtTop: true,
			showBase: !showBaseTop,
		});
	}

	public toggleShowBaseCenter(): void {
		const showBaseCenter = this._layoutMode.value.showBase && !this._layoutMode.value.showBaseAtTop;
		this.setLayout({
			...this._layoutMode.value,
			showBaseAtTop: false,
			showBase: !showBaseCenter,
		});
	}

	public setLayoutKind(kind: MergeEditorLayoutKind): void {
		this.setLayout({
			...this._layoutMode.value,
			kind
		});
	}

	public setLayout(newLayout: IMergeEditorLayout): void {
		const value = this._layoutMode.value;
		if (JSON.stringify(value) === JSON.stringify(newLayout)) {
			return;
		}
		this.model?.telemetry.reportLayoutChange({
			baseTop: newLayout.showBaseAtTop,
			baseVisible: newLayout.showBase,
			isColumnView: newLayout.kind === 'columns',
		});
		this.applyLayout(newLayout);
	}

	private readonly baseViewDisposables;

	private applyLayout(layout: IMergeEditorLayout): void {
		transaction(tx => {
			/** @description applyLayout */

			if (layout.showBase && !this.baseView.get()) {
				this.baseViewDisposables.clear();
				const baseView = this.baseViewDisposables.add(
					this.instantiationService.createInstance(
						BaseCodeEditorView,
						this.viewModel
					)
				);
				this.baseViewDisposables.add(autorun(reader => {
					/** @description Update base view options */
					const options = this.baseViewOptions.read(reader);
					if (options) {
						baseView.updateOptions(options);
					}
				}));
				this.baseView.set(baseView, tx);
			} else if (!layout.showBase && this.baseView.get()) {
				this.baseView.set(undefined, tx);
				this.baseViewDisposables.clear();
			}

			if (layout.kind === 'mixed') {
				this.setGrid([
					layout.showBaseAtTop && layout.showBase ? {
						size: 38,
						data: this.baseView.get()!.view
					} : undefined,
					{
						size: 38,
						groups: [
							{ data: this.input1View.view },
							!layout.showBaseAtTop && layout.showBase ? { data: this.baseView.get()!.view } : undefined,
							{ data: this.input2View.view }
						].filter(isDefined)
					},
					{
						size: 62,
						data: this.inputResultView.view
					},
				].filter(isDefined));
			} else if (layout.kind === 'columns') {
				this.setGrid([
					layout.showBase ? {
						size: 40,
						data: this.baseView.get()!.view
					} : undefined,
					{
						size: 60,
						groups: [{ data: this.input1View.view }, { data: this.inputResultView.view }, { data: this.input2View.view }]
					},
				].filter(isDefined));
			}

			this._layoutMode.value = layout;
			this._ctxUsesColumnLayout.set(layout.kind);
			this._ctxShowBase.set(layout.showBase);
			this._ctxShowBaseAtTop.set(layout.showBaseAtTop);
			this._onDidChangeSizeConstraints.fire();
			this._layoutModeObs.set(layout, tx);
		});
	}

	private setGrid(descriptor: GridNodeDescriptor<any>[]) {
		let width = -1;
		let height = -1;
		if (this._grid.value) {
			width = this._grid.value.width;
			height = this._grid.value.height;
		}
		this._grid.value = SerializableGrid.from<any>({
			orientation: Orientation.VERTICAL,
			size: 100,
			groups: descriptor,
		}, {
			styles: { separatorBorder: this.theme.getColor(settingsSashBorder) ?? Color.transparent },
			proportionalLayout: true
		});

		reset(this.rootHtmlElement!, this._grid.value.element);
		// Only call layout after the elements have been added to the DOM,
		// so that they have a defined size.
		if (width !== -1) {
			this._grid.value.layout(width, height);
		}
	}

	private _applyViewState(state: IMergeEditorViewState | undefined) {
		if (!state) {
			return;
		}
		this.inputResultView.editor.restoreViewState(state);
		if (state.input1State) {
			this.input1View.editor.restoreViewState(state.input1State);
		}
		if (state.input2State) {
			this.input2View.editor.restoreViewState(state.input2State);
		}
		if (state.focusIndex >= 0) {
			[this.input1View.editor, this.input2View.editor, this.inputResultView.editor][state.focusIndex].focus();
		}
	}

	protected computeEditorViewState(resource: URI): IMergeEditorViewState | undefined {
		if (!isEqual(this.inputModel.get()?.resultUri, resource)) {
			return undefined;
		}
		const result = this.inputResultView.editor.saveViewState();
		if (!result) {
			return undefined;
		}
		const input1State = this.input1View.editor.saveViewState() ?? undefined;
		const input2State = this.input2View.editor.saveViewState() ?? undefined;
		const focusIndex = [this.input1View.editor, this.input2View.editor, this.inputResultView.editor].findIndex(editor => editor.hasWidgetFocus());
		return { ...result, input1State, input2State, focusIndex };
	}


	protected tracksEditorViewState(input: EditorInput): boolean {
		return input instanceof MergeEditorInput;
	}

	private readonly showNonConflictingChangesStore;
	private readonly showNonConflictingChanges;

	public toggleShowNonConflictingChanges(): void {
		this.showNonConflictingChanges.set(!this.showNonConflictingChanges.get(), undefined);
		this.showNonConflictingChangesStore.set(this.showNonConflictingChanges.get());
		this._ctxShowNonConflictingChanges.set(this.showNonConflictingChanges.get());
	}
}

export interface IMergeEditorLayout {
	readonly kind: MergeEditorLayoutKind;
	readonly showBase: boolean;
	readonly showBaseAtTop: boolean;
}

// TODO use PersistentStore
class MergeEditorLayoutStore {
	private static readonly _key = 'mergeEditor/layout';
	private _value: IMergeEditorLayout = { kind: 'mixed', showBase: false, showBaseAtTop: true };

	constructor(@IStorageService private _storageService: IStorageService) {
		const value = _storageService.get(MergeEditorLayoutStore._key, StorageScope.PROFILE, 'mixed');

		if (value === 'mixed' || value === 'columns') {
			this._value = { kind: value, showBase: false, showBaseAtTop: true };
		} else if (value) {
			try {
				this._value = JSON.parse(value);
			} catch (e) {
				onUnexpectedError(e);
			}
		}
	}

	get value() {
		return this._value;
	}

	set value(value: IMergeEditorLayout) {
		if (this._value !== value) {
			this._value = value;
			this._storageService.store(MergeEditorLayoutStore._key, JSON.stringify(this._value), StorageScope.PROFILE, StorageTarget.USER);
		}
	}
}

export class MergeEditorOpenHandlerContribution extends Disposable {

	constructor(
		@IEditorService private readonly _editorService: IEditorService,
		@ICodeEditorService codeEditorService: ICodeEditorService,
	) {
		super();
		this._store.add(codeEditorService.registerCodeEditorOpenHandler(this.openCodeEditorFromMergeEditor.bind(this)));
	}

	private async openCodeEditorFromMergeEditor(input: ITextResourceEditorInput, _source: ICodeEditor | null, sideBySide?: boolean | undefined): Promise<ICodeEditor | null> {
		const activePane = this._editorService.activeEditorPane;
		if (!sideBySide
			&& input.options
			&& activePane instanceof MergeEditor
			&& activePane.getControl()
			&& activePane.input instanceof MergeEditorInput
			&& isEqual(input.resource, activePane.input.result)
		) {
			// Special: stay inside the merge editor when it is active and when the input
			// targets the result editor of the merge editor.
			const targetEditor = <ICodeEditor>activePane.getControl()!;
			applyTextEditorOptions(input.options, targetEditor, ScrollType.Smooth);
			return targetEditor;
		}

		// cannot handle this
		return null;
	}
}

export class MergeEditorResolverContribution extends Disposable {

	static readonly ID = 'workbench.contrib.mergeEditorResolver';

	constructor(
		@IEditorResolverService editorResolverService: IEditorResolverService,
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		super();

		const mergeEditorInputFactory: MergeEditorInputFactoryFunction = (mergeEditor: IResourceMergeEditorInput): EditorInputWithOptions => {
			return {
				editor: instantiationService.createInstance(
					MergeEditorInput,
					mergeEditor.base.resource,
					{
						uri: mergeEditor.input1.resource,
						title: mergeEditor.input1.label ?? basename(mergeEditor.input1.resource),
						description: mergeEditor.input1.description ?? '',
						detail: mergeEditor.input1.detail
					},
					{
						uri: mergeEditor.input2.resource,
						title: mergeEditor.input2.label ?? basename(mergeEditor.input2.resource),
						description: mergeEditor.input2.description ?? '',
						detail: mergeEditor.input2.detail
					},
					mergeEditor.result.resource
				)
			};
		};

		this._register(editorResolverService.registerEditor(
			`*`,
			{
				id: DEFAULT_EDITOR_ASSOCIATION.id,
				label: DEFAULT_EDITOR_ASSOCIATION.displayName,
				detail: DEFAULT_EDITOR_ASSOCIATION.providerDisplayName,
				priority: RegisteredEditorPriority.builtin
			},
			{},
			{
				createMergeEditorInput: mergeEditorInputFactory
			}
		));
	}
}

type IMergeEditorViewState = ICodeEditorViewState & {
	readonly input1State?: ICodeEditorViewState;
	readonly input2State?: ICodeEditorViewState;
	readonly focusIndex: number;
};
