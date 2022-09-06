/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $, Dimension, reset } from 'vs/base/browser/dom';
import { Grid, GridNodeDescriptor, IView, SerializableGrid } from 'vs/base/browser/ui/grid/grid';
import { Orientation } from 'vs/base/browser/ui/splitview/splitview';
import { compareBy } from 'vs/base/common/arrays';
import { assertFn } from 'vs/base/common/assert';
import { CancellationToken } from 'vs/base/common/cancellation';
import { Color } from 'vs/base/common/color';
import { BugIndicatingError } from 'vs/base/common/errors';
import { Emitter, Event } from 'vs/base/common/event';
import { Disposable, DisposableStore, MutableDisposable, toDisposable } from 'vs/base/common/lifecycle';
import { autorun, autorunWithStore, IObservable, IReader, observableValue } from 'vs/base/common/observable';
import { basename, isEqual } from 'vs/base/common/resources';
import { URI } from 'vs/base/common/uri';
import 'vs/css!./media/mergeEditor';
import { ICodeEditor, IViewZoneChangeAccessor } from 'vs/editor/browser/editorBrowser';
import { ICodeEditorService } from 'vs/editor/browser/services/codeEditorService';
import { CodeEditorWidget } from 'vs/editor/browser/widget/codeEditorWidget';
import { IEditorOptions as ICodeEditorOptions } from 'vs/editor/common/config/editorOptions';
import { Position } from 'vs/editor/common/core/position';
import { Range } from 'vs/editor/common/core/range';
import { ICodeEditorViewState, ScrollType } from 'vs/editor/common/editorCommon';
import { LengthObj } from 'vs/editor/common/model/bracketPairsTextModelPart/bracketPairsTree/length';
import { ITextResourceConfigurationService } from 'vs/editor/common/services/textResourceConfiguration';
import { localize } from 'vs/nls';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IContextKey, IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IEditorOptions, ITextEditorOptions, ITextResourceEditorInput } from 'vs/platform/editor/common/editor';
import { IFileService } from 'vs/platform/files/common/files';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IStorageService, StorageScope, StorageTarget } from 'vs/platform/storage/common/storage';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { AbstractTextEditor } from 'vs/workbench/browser/parts/editor/textEditor';
import { DEFAULT_EDITOR_ASSOCIATION, EditorInputWithOptions, IEditorOpenContext, IResourceMergeEditorInput } from 'vs/workbench/common/editor';
import { EditorInput } from 'vs/workbench/common/editor/editorInput';
import { applyTextEditorOptions } from 'vs/workbench/common/editor/editorOptions';
import { readTransientState, writeTransientState } from 'vs/workbench/contrib/codeEditor/browser/toggleWordWrap';
import { MergeEditorInput } from 'vs/workbench/contrib/mergeEditor/browser/mergeEditorInput';
import { DocumentLineRangeMap, RangeMapping } from 'vs/workbench/contrib/mergeEditor/browser/model/mapping';
import { MergeEditorModel } from 'vs/workbench/contrib/mergeEditor/browser/model/mergeEditorModel';
import { ModifiedBaseRange } from 'vs/workbench/contrib/mergeEditor/browser/model/modifiedBaseRange';
import { addLength, lengthBetweenPositions, lengthOfRange } from 'vs/workbench/contrib/mergeEditor/browser/model/rangeUtils';
import { deepMerge, ReentrancyBarrier, thenIfNotDisposed } from 'vs/workbench/contrib/mergeEditor/browser/utils';
import { BaseCodeEditorView } from 'vs/workbench/contrib/mergeEditor/browser/view/editors/baseCodeEditorView';
import { MergeEditorViewModel } from 'vs/workbench/contrib/mergeEditor/browser/view/viewModel';
import { ctxIsMergeEditor, ctxMergeBaseUri, ctxMergeEditorLayout, ctxMergeResultUri, MergeEditorLayoutTypes } from 'vs/workbench/contrib/mergeEditor/common/mergeEditor';
import { settingsSashBorder } from 'vs/workbench/contrib/preferences/common/settingsEditorColorRegistry';
import { IEditorGroup, IEditorGroupsService } from 'vs/workbench/services/editor/common/editorGroupsService';
import { IEditorResolverService, MergeEditorInputFactoryFunction, RegisteredEditorPriority } from 'vs/workbench/services/editor/common/editorResolverService';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import './colors';
import { InputCodeEditorView } from './editors/inputCodeEditorView';
import { ResultCodeEditorView } from './editors/resultCodeEditorView';

export class MergeEditor extends AbstractTextEditor<IMergeEditorViewState> {

	static readonly ID = 'mergeEditor';

	private readonly _sessionDisposables = new DisposableStore();
	private readonly _viewModel = observableValue<MergeEditorViewModel | undefined>('viewModel', undefined);

	public get viewModel(): IObservable<MergeEditorViewModel | undefined> {
		return this._viewModel;
	}

	private rootHtmlElement: HTMLElement | undefined;
	private readonly _grid = this._register(new MutableDisposable<Grid<IView>>());
	private readonly input1View = this._register(this.instantiationService.createInstance(InputCodeEditorView, 1, this._viewModel));
	private readonly baseView = observableValue<BaseCodeEditorView | undefined>('baseView', undefined);
	private readonly baseViewOptions = observableValue<Readonly<ICodeEditorOptions> | undefined>('baseViewOptions', undefined);
	private readonly input2View = this._register(this.instantiationService.createInstance(InputCodeEditorView, 2, this._viewModel));

	private readonly inputResultView = this._register(this.instantiationService.createInstance(ResultCodeEditorView, this._viewModel));
	private readonly _layoutMode: MergeEditorLayout;
	private readonly _ctxIsMergeEditor: IContextKey<boolean>;
	private readonly _ctxUsesColumnLayout: IContextKey<string>;
	private readonly _ctxResultUri: IContextKey<string>;

	private readonly _ctxBaseUri: IContextKey<string>;

	public get model(): MergeEditorModel | undefined { return this._viewModel.get()?.model; }

	private get inputsWritable(): boolean {
		return !!this._configurationService.getValue<boolean>('mergeEditor.writableInputs');
	}

	constructor(
		@IInstantiationService instantiation: IInstantiationService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@ITelemetryService telemetryService: ITelemetryService,
		@IStorageService storageService: IStorageService,
		@IThemeService themeService: IThemeService,
		@ITextResourceConfigurationService textResourceConfigurationService: ITextResourceConfigurationService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IEditorService editorService: IEditorService,
		@IEditorGroupsService editorGroupService: IEditorGroupsService,
		@IFileService fileService: IFileService,
		@ICodeEditorService private readonly _codeEditorService: ICodeEditorService,
	) {
		super(MergeEditor.ID, telemetryService, instantiation, storageService, textResourceConfigurationService, themeService, editorService, editorGroupService, fileService);

		this._ctxIsMergeEditor = ctxIsMergeEditor.bindTo(contextKeyService);
		this._ctxUsesColumnLayout = ctxMergeEditorLayout.bindTo(contextKeyService);
		this._ctxBaseUri = ctxMergeBaseUri.bindTo(contextKeyService);
		this._ctxResultUri = ctxMergeResultUri.bindTo(contextKeyService);

		this._layoutMode = instantiation.createInstance(MergeEditorLayout);
		this._ctxUsesColumnLayout.set(this._layoutMode.value);

		const reentrancyBarrier = new ReentrancyBarrier();

		this._store.add(
			this.input1View.editor.onDidScrollChange(
				reentrancyBarrier.makeExclusive((c) => {
					if (c.scrollTopChanged) {
						const mapping = this.model?.input1ResultMapping.get();
						synchronizeScrolling(this.input1View.editor, this.inputResultView.editor, mapping);
						this.input2View.editor.setScrollTop(c.scrollTop, ScrollType.Immediate);

						this.baseView.get()?.editor.setScrollTop(c.scrollTop, ScrollType.Immediate);
						//const baseMapping = this.model ? new DocumentMapping(this.model.input1LinesDiffs.get(), -1) : undefined;
						//synchronizeScrolling(this.input1View.editor, this.baseView.editor, baseMapping, MappingDirection.output);
					}
					if (c.scrollLeftChanged) {
						this.baseView.get()?.editor.setScrollLeft(c.scrollLeft, ScrollType.Immediate);
						this.input2View.editor.setScrollLeft(c.scrollLeft, ScrollType.Immediate);
						this.inputResultView.editor.setScrollLeft(c.scrollLeft, ScrollType.Immediate);
					}
				})
			)
		);
		this._store.add(
			this.input2View.editor.onDidScrollChange(
				reentrancyBarrier.makeExclusive((c) => {
					if (c.scrollTopChanged) {
						const mapping = this.model?.input2ResultMapping.get();
						synchronizeScrolling(this.input2View.editor, this.inputResultView.editor, mapping);
						this.input1View.editor.setScrollTop(c.scrollTop, ScrollType.Immediate);

						this.baseView.get()?.editor.setScrollTop(c.scrollTop, ScrollType.Immediate);
						//const baseMapping = this.model ? new DocumentMapping(this.model.input2LinesDiffs.get(), -1) : undefined;
						//synchronizeScrolling(this.input2View.editor, this.baseView.editor, baseMapping, MappingDirection.output);
					}
					if (c.scrollLeftChanged) {
						this.baseView.get()?.editor.setScrollLeft(c.scrollLeft, ScrollType.Immediate);
						this.input1View.editor.setScrollLeft(c.scrollLeft, ScrollType.Immediate);
						this.inputResultView.editor.setScrollLeft(c.scrollLeft, ScrollType.Immediate);
					}
				})
			)
		);
		this._store.add(
			this.inputResultView.editor.onDidScrollChange(
				reentrancyBarrier.makeExclusive((c) => {
					if (c.scrollTopChanged) {
						const mapping1 = this.model?.resultInput1Mapping.get();
						synchronizeScrolling(this.inputResultView.editor, this.input1View.editor, mapping1);
						const mapping2 = this.model?.resultInput2Mapping.get();
						synchronizeScrolling(this.inputResultView.editor, this.input2View.editor, mapping2);

						const baseMapping = this.model?.resultBaseMapping.get();
						const baseView = this.baseView.get();
						if (baseView) {
							synchronizeScrolling(this.inputResultView.editor, baseView.editor, baseMapping);
						}
					}
					if (c.scrollLeftChanged) {
						this.baseView.get()?.editor?.setScrollLeft(c.scrollLeft, ScrollType.Immediate);
						this.input1View.editor.setScrollLeft(c.scrollLeft, ScrollType.Immediate);
						this.input2View.editor.setScrollLeft(c.scrollLeft, ScrollType.Immediate);
					}
				})
			)
		);

		this._store.add(
			autorunWithStore((reader, store) => {
				const baseView = this.baseView.read(reader);
				if (baseView) {
					store.add(autorun('Update base view options', reader => {
						const options = this.baseViewOptions.read(reader);
						if (options) {
							baseView.updateOptions(options);
						}
					}));

					store.add(baseView.editor.onDidScrollChange(
						reentrancyBarrier.makeExclusive((c) => {
							if (c.scrollTopChanged) {
								this.input1View.editor.setScrollTop(c.scrollTop, ScrollType.Immediate);
								this.input2View.editor.setScrollTop(c.scrollTop, ScrollType.Immediate);

								// const mapping1 = this.model ? new DocumentMapping(this.model.input1LinesDiffs.get(), -1) : undefined;
								// synchronizeScrolling(this.baseView.editor, this.input1View.editor, mapping1, MappingDirection.input);
								// const mapping2 = this.model ? new DocumentMapping(this.model.input2LinesDiffs.get(), -1) : undefined;
								// synchronizeScrolling(this.baseView.editor, this.input2View.editor, mapping2, MappingDirection.input);

								const baseMapping = this.model?.baseResultMapping.get();
								synchronizeScrolling(baseView.editor, this.inputResultView.editor, baseMapping);
							}
							if (c.scrollLeftChanged) {
								this.inputResultView.editor.setScrollLeft(c.scrollLeft, ScrollType.Immediate);
								this.input1View.editor.setScrollLeft(c.scrollLeft, ScrollType.Immediate);
								this.input2View.editor.setScrollLeft(c.scrollLeft, ScrollType.Immediate);
							}
						})
					));
				}
			}, 'set baseViewEditor.onDidScrollChange')

		);
	}

	override dispose(): void {
		this._sessionDisposables.dispose();
		this._ctxIsMergeEditor.reset();
		this._ctxUsesColumnLayout.reset();
		super.dispose();
	}

	// #region layout constraints

	private readonly _onDidChangeSizeConstraints = new Emitter<void>();
	override readonly onDidChangeSizeConstraints: Event<void> = this._onDidChangeSizeConstraints.event;

	override get minimumWidth() {
		return this._layoutMode.value === 'mixed'
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
			lineNumbersMinChars: 2,
			readOnly: !this.inputsWritable
		});

		this.input1View.updateOptions(inputOptions);
		this.input2View.updateOptions(inputOptions);
		this.baseViewOptions.set(inputOptions, undefined);
		this.inputResultView.updateOptions(options);
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

		const model = await input.resolve();

		const viewModel = new MergeEditorViewModel(model, this.input1View, this.input2View, this.inputResultView, this.baseView);
		this._viewModel.set(viewModel, undefined);

		// Set/unset context keys based on input
		this._ctxResultUri.set(model.resultTextModel.uri.toString());
		this._ctxBaseUri.set(model.base.uri.toString());
		this._sessionDisposables.add(toDisposable(() => {
			this._ctxBaseUri.reset();
			this._ctxResultUri.reset();
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
			}));
		}


		this._sessionDisposables.add(autorunWithStore((reader, store) => {
			const input1ViewZoneIds: string[] = [];
			const input2ViewZoneIds: string[] = [];
			const baseViewZoneIds: string[] = [];
			const baseView = this.baseView.read(reader);

			this.input1View.editor.changeViewZones(input1ViewZoneAccessor => {
				this.input2View.editor.changeViewZones(input2ViewZoneAccessor => {
					if (baseView) {
						baseView.editor.changeViewZones(baseViewZoneAccessor => {
							setViewZones(reader, input1ViewZoneIds, input1ViewZoneAccessor, input2ViewZoneIds, input2ViewZoneAccessor, baseViewZoneIds, baseViewZoneAccessor);
						});
					} else {
						setViewZones(reader, input1ViewZoneIds, input1ViewZoneAccessor, input2ViewZoneIds, input2ViewZoneAccessor, baseViewZoneIds, undefined);
					}
				});
			});

			store.add({
				dispose: () => {
					this.input1View.editor.changeViewZones(a => {
						for (const zone of input1ViewZoneIds) {
							a.removeZone(zone);
						}
					});
					this.input2View.editor.changeViewZones(a => {
						for (const zone of input2ViewZoneIds) {
							a.removeZone(zone);
						}
					});
					this.baseView.get()?.editor.changeViewZones(a => {
						for (const zone of baseViewZoneIds) {
							a.removeZone(zone);
						}
					});
				}
			});
		}, 'update alignment view zones'));

		// word wrap special case - sync transient state from result model to input[1|2] models
		const mirrorWordWrapTransientState = () => {
			const state = readTransientState(model.resultTextModel, this._codeEditorService);
			writeTransientState(model.input2.textModel, state, this._codeEditorService);
			writeTransientState(model.input1.textModel, state, this._codeEditorService);
		};
		this._sessionDisposables.add(this._codeEditorService.onDidChangeTransientModelProperty(candidate => {
			if (candidate === this.inputResultView.editor.getModel()) {
				mirrorWordWrapTransientState();
			}
		}));
		mirrorWordWrapTransientState();

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
					[{ editor: input, replacement: { resource: input.result }, forceReplaceDirty: true }],
					that.group ?? that.editorGroupService.activeGroup
				);
			}
		});

		function setViewZones(
			reader: IReader,
			input1ViewZoneIds: string[],
			input1ViewZoneAccessor: IViewZoneChangeAccessor,
			input2ViewZoneIds: string[],
			input2ViewZoneAccessor: IViewZoneChangeAccessor,
			baseViewZoneIds: string[],
			baseViewZoneAccessor: IViewZoneChangeAccessor | undefined
		) {
			let input1LinesAdded = 0;
			let input2LinesAdded = 0;
			let baseLinesAdded = 0;

			for (const m of model.modifiedBaseRanges.read(reader)) {
				const alignedLines: [number | undefined, number, number | undefined][] =
					getAlignedLines(m);

				for (const [input1Line, baseLine, input2Line] of alignedLines) {
					if (!baseViewZoneAccessor && (input1Line === undefined || input2Line === undefined)) {
						continue;
					}

					const input1Line_ =
						input1Line !== undefined ? input1Line + input1LinesAdded : -1;
					const input2Line_ =
						input2Line !== undefined ? input2Line + input2LinesAdded : -1;
					const baseLine_ = baseLine + baseLinesAdded;

					const max = Math.max(baseViewZoneAccessor ? baseLine_ : 0, input1Line_, input2Line_, 1);

					if (input1Line !== undefined) {
						const diffInput1 = max - input1Line_;
						if (diffInput1 > 0) {
							input1ViewZoneIds.push(
								input1ViewZoneAccessor.addZone({
									afterLineNumber: input1Line - 1,
									heightInLines: diffInput1,
									domNode: $('div.diagonal-fill'),
								})
							);
							input1LinesAdded += diffInput1;
						}
					}

					if (input2Line !== undefined) {
						const diffInput2 = max - input2Line_;
						if (diffInput2 > 0) {
							input2ViewZoneIds.push(
								input2ViewZoneAccessor.addZone({
									afterLineNumber: input2Line - 1,
									heightInLines: diffInput2,
									domNode: $('div.diagonal-fill'),
								})
							);
							input2LinesAdded += diffInput2;
						}
					}

					if (baseViewZoneAccessor) {
						const diffBase = max - baseLine_;
						if (diffBase > 0) {
							baseViewZoneIds.push(
								baseViewZoneAccessor.addZone({
									afterLineNumber: baseLine - 1,
									heightInLines: diffBase,
									domNode: $('div.diagonal-fill'),
								})
							);
							baseLinesAdded += diffBase;
						}
					}
				}
			}
		}
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

	protected override setEditorVisible(visible: boolean, group: IEditorGroup | undefined): void {
		super.setEditorVisible(visible, group);

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

	setLayout(newValue: MergeEditorLayoutTypes): void {
		const value = this._layoutMode.value;
		if (value === newValue) {
			return;
		}
		this.applyLayout(newValue);
		this._layoutMode.value = newValue;
		this._ctxUsesColumnLayout.set(newValue);
		this._onDidChangeSizeConstraints.fire();
	}

	applyLayout(layout: MergeEditorLayoutTypes): void {
		const setBaseViewState = (enabled: boolean) => {
			if (enabled && !this.baseView.get()) {
				this.baseView.set(this.instantiationService.createInstance(BaseCodeEditorView, this.viewModel), undefined);
			} else if (!enabled && this.baseView.get()) {
				this.baseView.get()!.dispose();
				this.baseView.set(undefined, undefined);
			}
		};

		if (layout === 'mixed') {
			setBaseViewState(false);
			this.setGrid([
				{
					size: 38,
					groups: [{ data: this.input1View.view }, { data: this.input2View.view }]
				},
				{
					size: 62,
					data: this.inputResultView.view
				},
			]);
		} else if (layout === 'columns') {
			setBaseViewState(false);
			this.setGrid([
				{
					groups: [{ data: this.input1View.view }, { data: this.inputResultView.view }, { data: this.input2View.view }]
				},
			]);
		} else if (layout === 'mixedWithBaseColumns') {
			setBaseViewState(true);

			this.setGrid([
				{
					size: 38,
					groups: [{ data: this.input1View.view }, { data: this.baseView.get()!.view }, { data: this.input2View.view }]
				},
				{
					size: 62,
					data: this.inputResultView.view
				}
			]);
		} else if (layout === 'mixedWithBase') {
			setBaseViewState(true);

			this.setGrid([
				{
					size: 38,
					data: this.baseView.get()!.view
				},
				{
					size: 38,
					groups: [{ data: this.input1View.view }, { data: this.input2View.view }]
				},
				{
					size: 62,
					data: this.inputResultView.view
				}
			]);
		}
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
		if (width !== -1) {
			this._grid.value.layout(width, height);
		}
		reset(this.rootHtmlElement!, this._grid.value.element);
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
		if (!isEqual(this.model?.resultTextModel.uri, resource)) {
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
}

class MergeEditorLayout {

	private static readonly _key = 'mergeEditor/layout';
	private _value: MergeEditorLayoutTypes = 'mixed';


	constructor(@IStorageService private _storageService: IStorageService) {
		const value = _storageService.get(MergeEditorLayout._key, StorageScope.PROFILE, 'mixed');
		if (value === 'mixed' || value === 'columns' || value === 'mixedWithBase') {
			this._value = value;
		} else {
			this._value = 'mixed';
		}
	}

	get value() {
		return this._value;
	}

	set value(value) {
		if (this._value !== value) {
			this._value = value;
			this._storageService.store(MergeEditorLayout._key, this._value, StorageScope.PROFILE, StorageTarget.USER);
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

function toEqualRangeMappings(diffs: RangeMapping[], inputRange: Range, outputRange: Range): RangeMapping[] {
	const result: RangeMapping[] = [];

	let equalRangeInputStart = inputRange.getStartPosition();
	let equalRangeOutputStart = outputRange.getStartPosition();

	for (const d of diffs) {
		const equalRangeMapping = new RangeMapping(
			Range.fromPositions(equalRangeInputStart, d.inputRange.getStartPosition()),
			Range.fromPositions(equalRangeOutputStart, d.outputRange.getStartPosition())
		);
		assertFn(() =>
			lengthOfRange(equalRangeMapping.inputRange).equals(
				lengthOfRange(equalRangeMapping.outputRange)
			)
		);
		if (!equalRangeMapping.inputRange.isEmpty()) {
			result.push(equalRangeMapping);
		}

		equalRangeInputStart = d.inputRange.getEndPosition();
		equalRangeOutputStart = d.outputRange.getEndPosition();
	}

	const equalRangeMapping = new RangeMapping(
		Range.fromPositions(equalRangeInputStart, inputRange.getEndPosition()),
		Range.fromPositions(equalRangeOutputStart, outputRange.getEndPosition())
	);
	assertFn(() =>
		lengthOfRange(equalRangeMapping.inputRange).equals(
			lengthOfRange(equalRangeMapping.outputRange)
		)
	);
	if (!equalRangeMapping.inputRange.isEmpty()) {
		result.push(equalRangeMapping);
	}

	return result;
}

interface CommonRangeMapping {
	output1Pos: Position | undefined;
	output2Pos: Position | undefined;
	inputPos: Position;
	length: LengthObj;
}

/**
 * It is `result[i][0].inputRange.equals(result[i][1].inputRange)`.
*/
function splitUpCommonEqualRangeMappings(
	equalRangeMappings1: RangeMapping[],
	equalRangeMappings2: RangeMapping[]
): CommonRangeMapping[] {
	const result: CommonRangeMapping[] = [];

	const events: { input: 0 | 1; start: boolean; inputPos: Position; outputPos: Position }[] = [];
	for (const [input, rangeMappings] of [[0, equalRangeMappings1], [1, equalRangeMappings2]] as const) {
		for (const rangeMapping of rangeMappings) {
			events.push({
				input: input,
				start: true,
				inputPos: rangeMapping.inputRange.getStartPosition(),
				outputPos: rangeMapping.outputRange.getStartPosition()
			});
			events.push({
				input: input,
				start: false,
				inputPos: rangeMapping.inputRange.getEndPosition(),
				outputPos: rangeMapping.outputRange.getEndPosition()
			});
		}
	}

	events.sort(compareBy((m) => m.inputPos, Position.compare));

	const starts: [Position | undefined, Position | undefined] = [undefined, undefined];
	let lastInputPos: Position | undefined;

	for (const event of events) {
		if (lastInputPos && starts.some(s => !!s)) {
			const length = lengthBetweenPositions(lastInputPos, event.inputPos);
			if (!length.isZero()) {
				result.push({
					inputPos: lastInputPos,
					length,
					output1Pos: starts[0],
					output2Pos: starts[1]
				});
				if (starts[0]) {
					starts[0] = addLength(starts[0], length);
				}
				if (starts[1]) {
					starts[1] = addLength(starts[1], length);
				}
			}
		}

		starts[event.input] = event.start ? event.outputPos : undefined;
		lastInputPos = event.inputPos;
	}

	return result;
}

type LineAlignment = [input1Line: number | undefined, baseLine: number, input2Line: number | undefined];

function getAlignedLines(m: ModifiedBaseRange): LineAlignment[] {

	const equalRanges1 = toEqualRangeMappings(m.input1Diffs.flatMap(d => d.rangeMappings), m.baseRange.toRange(), m.input1Range.toRange());
	const equalRanges2 = toEqualRangeMappings(m.input2Diffs.flatMap(d => d.rangeMappings), m.baseRange.toRange(), m.input2Range.toRange());

	const commonRanges = splitUpCommonEqualRangeMappings(equalRanges1, equalRanges2);

	let result: LineAlignment[] = [];
	result.push([m.input1Range.startLineNumber - 1, m.baseRange.startLineNumber - 1, m.input2Range.startLineNumber - 1]);

	function isFullSync(lineAlignment: LineAlignment) {
		return lineAlignment.every((i) => i !== undefined);
	}

	// One base line has either up to one full sync or up to two half syncs.

	for (const m of commonRanges) {
		const lineAlignment: LineAlignment = [m.output1Pos?.lineNumber, m.inputPos.lineNumber, m.output2Pos?.lineNumber];
		const alignmentIsFullSync = isFullSync(lineAlignment);

		let shouldAdd = true;
		if (alignmentIsFullSync) {
			const isNewFullSyncAlignment = !result.some(r => isFullSync(r) && r.some((v, idx) => v !== undefined && v === lineAlignment[idx]));
			if (isNewFullSyncAlignment) {
				// Remove half syncs
				result = result.filter(r => !r.some((v, idx) => v !== undefined && v === lineAlignment[idx]));
			}
			shouldAdd = isNewFullSyncAlignment;
		} else {
			const isNew = !result.some(r => r.some((v, idx) => v !== undefined && v === lineAlignment[idx]));
			shouldAdd = isNew;
		}

		if (shouldAdd) {
			result.push(lineAlignment);
		} else {
			if (m.length.isGreaterThan(new LengthObj(1, 0))) {
				result.push([
					m.output1Pos ? m.output1Pos.lineNumber + 1 : undefined,
					m.inputPos.lineNumber + 1,
					m.output2Pos ? m.output2Pos.lineNumber + 1 : undefined
				]);
			}
		}
	}

	result.push([m.input1Range.endLineNumberExclusive, m.baseRange.endLineNumberExclusive, m.input2Range.endLineNumberExclusive]);
	/*
		assertFn(() =>
			checkAdjacentItems(result.map(r => r[0]).filter(isDefined), (a, b) => a < b)
			&& checkAdjacentItems(result.map(r => r[1]).filter(isDefined), (a, b) => a <= b)
			&& checkAdjacentItems(result.map(r => r[2]).filter(isDefined), (a, b) => a < b)
			&& result.every(alignment => alignment.filter(isDefined).length >= 2)
		);
	*/
	return result;
}

function synchronizeScrolling(scrollingEditor: CodeEditorWidget, targetEditor: CodeEditorWidget, mapping: DocumentLineRangeMap | undefined) {
	if (!mapping) {
		return;
	}

	const visibleRanges = scrollingEditor.getVisibleRanges();
	if (visibleRanges.length === 0) {
		return;
	}
	const topLineNumber = visibleRanges[0].startLineNumber - 1;

	const result = mapping.project(topLineNumber);
	const sourceRange = result.inputRange;
	const targetRange = result.outputRange;

	const resultStartTopPx = targetEditor.getTopForLineNumber(targetRange.startLineNumber);
	const resultEndPx = targetEditor.getTopForLineNumber(targetRange.endLineNumberExclusive);

	const sourceStartTopPx = scrollingEditor.getTopForLineNumber(sourceRange.startLineNumber);
	const sourceEndPx = scrollingEditor.getTopForLineNumber(sourceRange.endLineNumberExclusive);

	const factor = Math.min((scrollingEditor.getScrollTop() - sourceStartTopPx) / (sourceEndPx - sourceStartTopPx), 1);
	const resultScrollPosition = resultStartTopPx + (resultEndPx - resultStartTopPx) * factor;

	targetEditor.setScrollTop(resultScrollPosition, ScrollType.Immediate);
}
