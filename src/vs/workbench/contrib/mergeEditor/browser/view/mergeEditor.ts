/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $, Dimension, reset } from 'vs/base/browser/dom';
import { Direction, Grid, IView, SerializableGrid } from 'vs/base/browser/ui/grid/grid';
import { Orientation, Sizing } from 'vs/base/browser/ui/splitview/splitview';
import { IAction } from 'vs/base/common/actions';
import { CancellationToken } from 'vs/base/common/cancellation';
import { Color } from 'vs/base/common/color';
import { BugIndicatingError } from 'vs/base/common/errors';
import { DisposableStore, MutableDisposable } from 'vs/base/common/lifecycle';
import { isEqual } from 'vs/base/common/resources';
import { URI } from 'vs/base/common/uri';
import 'vs/css!./media/mergeEditor';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { CodeEditorWidget } from 'vs/editor/browser/widget/codeEditorWidget';
import { IEditorOptions as ICodeEditorOptions } from 'vs/editor/common/config/editorOptions';
import { ICodeEditorViewState, ScrollType } from 'vs/editor/common/editorCommon';
import { ITextResourceConfigurationService } from 'vs/editor/common/services/textResourceConfiguration';
import { localize } from 'vs/nls';
import { createAndFillInActionBarActions } from 'vs/platform/actions/browser/menuEntryActionViewItem';
import { IMenuService, MenuId } from 'vs/platform/actions/common/actions';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IContextKey, IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IEditorOptions, ITextEditorOptions } from 'vs/platform/editor/common/editor';
import { IFileService } from 'vs/platform/files/common/files';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ILabelService } from 'vs/platform/label/common/label';
import { IStorageService, StorageScope, StorageTarget } from 'vs/platform/storage/common/storage';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { FloatingClickWidget } from 'vs/workbench/browser/codeeditor';
import { AbstractTextEditor } from 'vs/workbench/browser/parts/editor/textEditor';
import { EditorInputWithOptions, EditorResourceAccessor, IEditorOpenContext } from 'vs/workbench/common/editor';
import { EditorInput } from 'vs/workbench/common/editor/editorInput';
import { applyTextEditorOptions } from 'vs/workbench/common/editor/editorOptions';
import { autorunWithStore, IObservable } from 'vs/workbench/contrib/audioCues/browser/observable';
import { MergeEditorInput } from 'vs/workbench/contrib/mergeEditor/browser/mergeEditorInput';
import { DocumentMapping, getOppositeDirection, MappingDirection } from 'vs/workbench/contrib/mergeEditor/browser/model/mapping';
import { MergeEditorModel } from 'vs/workbench/contrib/mergeEditor/browser/model/mergeEditorModel';
import { deepMerge, ReentrancyBarrier, thenIfNotDisposed } from 'vs/workbench/contrib/mergeEditor/browser/utils';
import { MergeEditorViewModel } from 'vs/workbench/contrib/mergeEditor/browser/view/viewModel';
import { ctxBaseResourceScheme, ctxIsMergeEditor, ctxMergeEditorLayout, MergeEditorLayoutTypes } from 'vs/workbench/contrib/mergeEditor/common/mergeEditor';
import { settingsSashBorder } from 'vs/workbench/contrib/preferences/common/settingsEditorColorRegistry';
import { IEditorGroup, IEditorGroupsService } from 'vs/workbench/services/editor/common/editorGroupsService';
import { IEditorResolverService, RegisteredEditorPriority } from 'vs/workbench/services/editor/common/editorResolverService';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import './colors';
import { InputCodeEditorView } from './editors/inputCodeEditorView';
import { ResultCodeEditorView } from './editors/resultCodeEditorView';

class MergeEditorLayout {

	private static readonly _key = 'mergeEditor/layout';
	private _value: MergeEditorLayoutTypes = 'mixed';


	constructor(@IStorageService private _storageService: IStorageService) {
		const value = _storageService.get(MergeEditorLayout._key, StorageScope.PROFILE, 'mixed');
		if (value === 'mixed' || value === 'columns') {
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

export class MergeEditor extends AbstractTextEditor<IMergeEditorViewState> {

	static readonly ID = 'mergeEditor';

	private readonly _sessionDisposables = new DisposableStore();

	private _grid!: Grid<IView>;


	private readonly input1View = this._register(this.instantiation.createInstance(InputCodeEditorView, 1));
	private readonly input2View = this._register(this.instantiation.createInstance(InputCodeEditorView, 2));
	private readonly inputResultView = this._register(this.instantiation.createInstance(ResultCodeEditorView));

	private readonly _layoutMode: MergeEditorLayout;
	private readonly _ctxIsMergeEditor: IContextKey<boolean>;
	private readonly _ctxUsesColumnLayout: IContextKey<string>;
	private readonly _ctxBaseResourceScheme: IContextKey<string>;

	private _model: MergeEditorModel | undefined;
	public get model(): MergeEditorModel | undefined { return this._model; }

	private get inputsWritable(): boolean {
		return !!this._configurationService.getValue<boolean>('mergeEditor.writableInputs');
	}

	constructor(
		@IInstantiationService private readonly instantiation: IInstantiationService,
		@ILabelService private readonly _labelService: ILabelService,
		@IMenuService private readonly _menuService: IMenuService,
		@IContextKeyService private readonly _contextKeyService: IContextKeyService,
		@ITelemetryService telemetryService: ITelemetryService,
		@IStorageService storageService: IStorageService,
		@IThemeService themeService: IThemeService,
		@ITextResourceConfigurationService textResourceConfigurationService: ITextResourceConfigurationService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IEditorService editorService: IEditorService,
		@IEditorGroupsService editorGroupService: IEditorGroupsService,
		@IFileService fileService: IFileService,
		@IEditorResolverService private readonly _editorResolverService: IEditorResolverService,
	) {
		super(MergeEditor.ID, telemetryService, instantiation, storageService, textResourceConfigurationService, themeService, editorService, editorGroupService, fileService);

		this._ctxIsMergeEditor = ctxIsMergeEditor.bindTo(_contextKeyService);
		this._ctxUsesColumnLayout = ctxMergeEditorLayout.bindTo(_contextKeyService);
		this._ctxBaseResourceScheme = ctxBaseResourceScheme.bindTo(_contextKeyService);

		this._layoutMode = instantiation.createInstance(MergeEditorLayout);
		this._ctxUsesColumnLayout.set(this._layoutMode.value);

		const reentrancyBarrier = new ReentrancyBarrier();

		this._store.add(
			this.input1View.editor.onDidScrollChange(
				reentrancyBarrier.makeExclusive((c) => {
					if (c.scrollTopChanged) {
						const mapping = this.model?.input1ResultMapping.get();
						synchronizeScrolling(this.input1View.editor, this.inputResultView.editor, mapping, MappingDirection.input);
						this.input2View.editor.setScrollTop(c.scrollTop, ScrollType.Immediate);
					}
					if (c.scrollLeftChanged) {
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
						synchronizeScrolling(this.input2View.editor, this.inputResultView.editor, mapping, MappingDirection.input);
						this.input1View.editor.setScrollTop(c.scrollTop, ScrollType.Immediate);
					}
					if (c.scrollLeftChanged) {
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
						const mapping1 = this.model?.input1ResultMapping.get();
						synchronizeScrolling(this.inputResultView.editor, this.input1View.editor, mapping1, MappingDirection.output);
						const mapping2 = this.model?.input2ResultMapping.get();
						synchronizeScrolling(this.inputResultView.editor, this.input2View.editor, mapping2, MappingDirection.output);
					}
					if (c.scrollLeftChanged) {
						this.input1View.editor.setScrollLeft(c.scrollLeft, ScrollType.Immediate);
						this.input2View.editor.setScrollLeft(c.scrollLeft, ScrollType.Immediate);
					}
				})
			)
		);


		// TODO@jrieken make this proper: add menu id and allow extensions to contribute
		const toolbarMenu = this._menuService.createMenu(MenuId.MergeToolbar, this._contextKeyService);
		const toolbarMenuDisposables = new DisposableStore();
		const toolbarMenuRender = () => {
			toolbarMenuDisposables.clear();

			const actions: IAction[] = [];
			createAndFillInActionBarActions(toolbarMenu, { renderShortTitle: true, shouldForwardArgs: true }, actions);
			if (actions.length > 0) {
				const [first] = actions;
				const acceptBtn = this.instantiation.createInstance(FloatingClickWidget, this.inputResultView.editor, first.label, first.id);
				toolbarMenuDisposables.add(acceptBtn.onClick(() => first.run(this.inputResultView.editor.getModel()?.uri)));
				toolbarMenuDisposables.add(acceptBtn);
				acceptBtn.render();
			}
		};
		this._store.add(toolbarMenu);
		this._store.add(toolbarMenuDisposables);
		this._store.add(toolbarMenu.onDidChange(toolbarMenuRender));
		toolbarMenuRender();
	}

	public get viewModel(): IObservable<MergeEditorViewModel | undefined> {
		return this.input1View.viewModel;
	}

	override dispose(): void {
		this._sessionDisposables.dispose();
		this._ctxIsMergeEditor.reset();
		super.dispose();
	}

	override getTitle(): string {
		if (this.input) {
			return this.input.getName();
		}

		return localize('mergeEditor', "Text Merge Editor");
	}

	protected createEditorControl(parent: HTMLElement, initialOptions: ICodeEditorOptions): void {
		parent.classList.add('merge-editor');

		this._grid = SerializableGrid.from<any /*TODO@jrieken*/>({
			orientation: Orientation.VERTICAL,
			size: 100,
			groups: [
				{
					size: 38,
					groups: [{
						data: this.input1View.view
					}, {
						data: this.input2View.view
					}]
				},
				{
					size: 62,
					data: this.inputResultView.view
				},
			]
		}, {
			styles: { separatorBorder: this.theme.getColor(settingsSashBorder) ?? Color.transparent },
			proportionalLayout: true
		});

		reset(parent, this._grid.element);
		this._register(this._grid);

		if (this._layoutMode.value === 'columns') {
			this._grid.moveView(this.inputResultView.view, Sizing.Distribute, this.input1View.view, Direction.Right);
		}

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
		this.inputResultView.updateOptions(options);
	}

	protected getMainControl(): ICodeEditor | undefined {
		return this.inputResultView.editor;
	}

	layout(dimension: Dimension): void {
		this._grid.layout(dimension.width, dimension.height);
	}

	override async setInput(input: EditorInput, options: IEditorOptions | undefined, context: IEditorOpenContext, token: CancellationToken): Promise<void> {
		if (!(input instanceof MergeEditorInput)) {
			throw new BugIndicatingError('ONLY MergeEditorInput is supported');
		}
		await super.setInput(input, options, context, token);

		this._sessionDisposables.clear();
		this._toggleEditorOverwrite(true);

		const model = await input.resolve();
		this._model = model;

		const viewModel = new MergeEditorViewModel(model, this.input1View, this.input2View, this.inputResultView);

		this.input1View.setModel(viewModel, model.input1, model.input1Title || localize('input1', 'Input 1'), model.input1Detail, model.input1Description);
		this.input2View.setModel(viewModel, model.input2, model.input2Title || localize('input2', 'Input 2',), model.input2Detail, model.input2Description);
		this.inputResultView.setModel(viewModel, model.result, localize('result', 'Result',), this._labelService.getUriLabel(model.result.uri, { relative: true }), undefined);
		this._ctxBaseResourceScheme.set(model.base.uri.scheme);

		const viewState = this.loadEditorViewState(input, context);
		this._applyViewState(viewState);

		this._sessionDisposables.add(thenIfNotDisposed(model.onInitialized, () => {
			const firstConflict = model.modifiedBaseRanges.get().find(r => r.isConflicting);
			if (!firstConflict) {
				return;
			}

			this.input1View.editor.revealLineInCenter(firstConflict.input1Range.startLineNumber);
		}));


		this._sessionDisposables.add(autorunWithStore((reader, store) => {
			const input1ViewZoneIds: string[] = [];
			const input2ViewZoneIds: string[] = [];
			for (const m of model.modifiedBaseRanges.read(reader)) {
				const max = Math.max(m.input1Range.lineCount, m.input2Range.lineCount, 1);

				this.input1View.editor.changeViewZones(a => {
					input1ViewZoneIds.push(a.addZone({
						afterLineNumber: m.input1Range.endLineNumberExclusive - 1,
						heightInLines: max - m.input1Range.lineCount,
						domNode: $('div.diagonal-fill'),
					}));
				});

				this.input2View.editor.changeViewZones(a => {
					input2ViewZoneIds.push(a.addZone({
						afterLineNumber: m.input2Range.endLineNumberExclusive - 1,
						heightInLines: max - m.input2Range.lineCount,
						domNode: $('div.diagonal-fill'),
					}));
				});
			}

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
				}
			});
		}, 'update alignment view zones'));
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
		this._toggleEditorOverwrite(false);

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
		this._toggleEditorOverwrite(visible);
	}

	private readonly _editorOverrideHandle = this._store.add(new MutableDisposable());

	private _toggleEditorOverwrite(haveIt: boolean) {
		if (!haveIt) {
			this._editorOverrideHandle.clear();
			return;
		}
		// this is RATHER UGLY. I dynamically register an editor for THIS (editor,input) so that
		// navigating within the merge editor works, e.g navigating from the outline or breakcrumps
		// or revealing a definition, reference etc
		// TODO@jrieken @bpasero @lramos15
		const input = this.input;
		if (input instanceof MergeEditorInput) {
			this._editorOverrideHandle.value = this._editorResolverService.registerEditor(
				`${input.result.scheme}:${input.result.fsPath}`,
				{
					id: `${this.getId()}/fake`,
					label: this.input?.getName()!,
					priority: RegisteredEditorPriority.exclusive
				},
				{},
				(candidate): EditorInputWithOptions => {
					const resource = EditorResourceAccessor.getCanonicalUri(candidate);
					if (!isEqual(resource, this.model?.result.uri)) {
						throw new Error(`Expected to be called WITH ${input.result.toString()}`);
					}
					return { editor: input };
				}
			);
		}
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
		if (newValue === 'mixed') {
			this._grid.moveView(this.inputResultView.view, this._grid.height * .62, this.input1View.view, Direction.Down);
			this._grid.moveView(this.input2View.view, Sizing.Distribute, this.input1View.view, Direction.Right);
		} else {
			this._grid.moveView(this.inputResultView.view, Sizing.Distribute, this.input1View.view, Direction.Right);
		}
		this._layoutMode.value = newValue;
		this._ctxUsesColumnLayout.set(newValue);
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
		if (!isEqual(this.model?.result.uri, resource)) {
			// TODO@bpasero Why not check `input#resource` and don't ask me for "forgein" resources?
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

type IMergeEditorViewState = ICodeEditorViewState & {
	readonly input1State?: ICodeEditorViewState;
	readonly input2State?: ICodeEditorViewState;
	readonly focusIndex: number;
};


function synchronizeScrolling(scrollingEditor: CodeEditorWidget, targetEditor: CodeEditorWidget, mapping: DocumentMapping | undefined, source: MappingDirection) {
	if (!mapping) {
		return;
	}

	const visibleRanges = scrollingEditor.getVisibleRanges();
	if (visibleRanges.length === 0) {
		return;
	}
	const topLineNumber = visibleRanges[0].startLineNumber - 1;

	const result = mapping.getMappingContaining(topLineNumber, source);
	const sourceRange = result.getRange(source);
	const targetRange = result.getRange(getOppositeDirection(source));

	const resultStartTopPx = targetEditor.getTopForLineNumber(targetRange.startLineNumber);
	const resultEndPx = targetEditor.getTopForLineNumber(targetRange.endLineNumberExclusive);

	const sourceStartTopPx = scrollingEditor.getTopForLineNumber(sourceRange.startLineNumber);
	const sourceEndPx = scrollingEditor.getTopForLineNumber(sourceRange.endLineNumberExclusive);

	const factor = Math.min((scrollingEditor.getScrollTop() - sourceStartTopPx) / (sourceEndPx - sourceStartTopPx), 1);
	const resultScrollPosition = resultStartTopPx + (resultEndPx - resultStartTopPx) * factor;

	targetEditor.setScrollTop(resultScrollPosition, ScrollType.Immediate);
}
