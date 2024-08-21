/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as DOM from 'vs/base/browser/dom';
import { IWorkbenchUIElementFactory, type IResourceLabel } from 'vs/editor/browser/widget/multiDiffEditor/workbenchUIElementFactory';
import { IStorageService } from 'vs/platform/storage/common/storage';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { IEditorOpenContext } from 'vs/workbench/common/editor';
import { IEditorGroup } from 'vs/workbench/services/editor/common/editorGroupsService';
import { CancellationToken, CancellationTokenSource } from 'vs/base/common/cancellation';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { INotebookEditorWorkerService } from 'vs/workbench/contrib/notebook/common/services/notebookWorkerService';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IEditorOptions as ICodeEditorOptions } from 'vs/editor/common/config/editorOptions';
import { BareFontInfo, FontInfo } from 'vs/editor/common/config/fontInfo';
import { PixelRatio } from 'vs/base/browser/pixelRatio';
import { DisposableStore } from 'vs/base/common/lifecycle';
import { EditorPane } from 'vs/workbench/browser/parts/editor/editorPane';
import { INotebookDiffEditorModel, NOTEBOOK_MULTI_DIFF_EDITOR_ID } from 'vs/workbench/contrib/notebook/common/notebookCommon';
import { FontMeasurements } from 'vs/editor/browser/config/fontMeasurements';
import { NotebookOptions } from 'vs/workbench/contrib/notebook/browser/notebookOptions';
import { INotebookService } from 'vs/workbench/contrib/notebook/common/notebookService';
import { NotebookMultiDiffEditorInput, NotebookMultiDiffEditorWidgetInput } from 'vs/workbench/contrib/notebook/browser/diff/notebookMultiDiffEditorInput';
import { MultiDiffEditorWidget } from 'vs/editor/browser/widget/multiDiffEditor/multiDiffEditorWidget';
import { ResourceLabel } from 'vs/workbench/browser/labels';
import type { IMultiDiffEditorOptions } from 'vs/editor/browser/widget/multiDiffEditor/multiDiffEditorWidgetImpl';
import { INotebookDocumentService } from 'vs/workbench/services/notebook/common/notebookDocumentService';
import { localize } from 'vs/nls';
import { Schemas } from 'vs/base/common/network';
import { getIconClassesForLanguageId } from 'vs/editor/common/services/getIconClasses';
import { NotebookDiffViewModel } from 'vs/workbench/contrib/notebook/browser/diff/notebookDiffViewModel';
import { NotebookDiffEditorEventDispatcher } from 'vs/workbench/contrib/notebook/browser/diff/eventDispatcher';

export class NotebookMultiTextDiffEditor extends EditorPane {
	private _multiDiffEditorWidget?: MultiDiffEditorWidget;
	static readonly ID: string = NOTEBOOK_MULTI_DIFF_EDITOR_ID;
	private _fontInfo: FontInfo | undefined;
	protected _scopeContextKeyService!: IContextKeyService;
	private readonly modelSpecificResources = this._register(new DisposableStore());
	private _model?: INotebookDiffEditorModel;
	private viewModel?: NotebookDiffViewModel;
	get textModel() {
		return this._model?.modified.notebook;
	}
	private _notebookOptions: NotebookOptions;
	get notebookOptions() {
		return this._notebookOptions;
	}

	constructor(
		group: IEditorGroup,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IThemeService themeService: IThemeService,
		// @IContextKeyService private readonly _parentContextKeyService: IContextKeyService,
		@INotebookEditorWorkerService private readonly notebookEditorWorkerService: INotebookEditorWorkerService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@ITelemetryService telemetryService: ITelemetryService,
		@IStorageService storageService: IStorageService,
		@INotebookService private readonly notebookService: INotebookService,
	) {
		super(NotebookMultiTextDiffEditor.ID, group, telemetryService, themeService, storageService);
		this._notebookOptions = instantiationService.createInstance(NotebookOptions, this.window, false, undefined);
		this._register(this._notebookOptions);
	}

	private get fontInfo() {
		if (!this._fontInfo) {
			this._fontInfo = this.createFontInfo();
		}

		return this._fontInfo;
	}
	override layout(dimension: DOM.Dimension, position?: DOM.IDomPosition): void {
		this._multiDiffEditorWidget!.layout(dimension);
	}

	private createFontInfo() {
		const editorOptions = this.configurationService.getValue<ICodeEditorOptions>('editor');
		return FontMeasurements.readFontInfo(this.window, BareFontInfo.createFromRawSettings(editorOptions, PixelRatio.getInstance(this.window).value));
	}

	protected createEditor(parent: HTMLElement): void {
		this._multiDiffEditorWidget = this._register(this.instantiationService.createInstance(
			MultiDiffEditorWidget,
			parent,
			this.instantiationService.createInstance(WorkbenchUIElementFactory),
		));

		this._register(this._multiDiffEditorWidget.onDidChangeActiveControl(() => {
			this._onDidChangeControl.fire();
		}));
	}
	override async setInput(input: NotebookMultiDiffEditorInput, options: IMultiDiffEditorOptions | undefined, context: IEditorOpenContext, token: CancellationToken): Promise<void> {
		super.setInput(input, options, context, token);
		const model = await input.resolve();
		if (this._model !== model) {
			this._detachModel();
			this._model = model;
		}
		const eventDispatcher = this.modelSpecificResources.add(new NotebookDiffEditorEventDispatcher());
		this.viewModel = this.modelSpecificResources.add(new NotebookDiffViewModel(model, this.notebookEditorWorkerService, this.instantiationService, this.configurationService, eventDispatcher, this.notebookService, undefined, true));
		await this.viewModel.computeDiff(this.modelSpecificResources.add(new CancellationTokenSource()).token);

		const widgetInput = this.modelSpecificResources.add(NotebookMultiDiffEditorWidgetInput.createInput(this.viewModel, this.instantiationService));
		const widgetViewModel = this.modelSpecificResources.add(await widgetInput.getViewModel());
		this._multiDiffEditorWidget!.setViewModel(widgetViewModel);

		// const viewState = this.loadEditorViewState(input, context);
		// if (viewState) {
		// 	this._multiDiffEditorWidget!.setViewState(viewState);
		// }
		this._applyOptions(options);

	}
	private _applyOptions(options: IMultiDiffEditorOptions | undefined): void {
		// const viewState = options?.viewState;
		// if (!viewState || !viewState.revealData) {
		// 	return;
		// }
		// this._multiDiffEditorWidget?.reveal(viewState.revealData.resource, {
		// 	range: viewState.revealData.range ? Range.lift(viewState.revealData.range) : undefined,
		// 	highlight: true
		// });
	}

	private _detachModel() {
		this.viewModel = undefined;
		this.modelSpecificResources.clear();
	}
	_generateFontFamily(): string {
		return this.fontInfo.fontFamily ?? `"SF Mono", Monaco, Menlo, Consolas, "Ubuntu Mono", "Liberation Mono", "DejaVu Sans Mono", "Courier New", monospace`;
	}
	override setOptions(options: IMultiDiffEditorOptions | undefined): void {
		super.setOptions(options);
		// const selections = options?.cellSelections ? cellRangesToIndexes(options.cellSelections) : undefined;
		// if (selections) {
		// 	// this._list.setFocus(selections);
		// }
		this._applyOptions(options);
	}

	override getControl() {
		return this._multiDiffEditorWidget!.getActiveControl();
	}

	override focus(): void {
		super.focus();

		this._multiDiffEditorWidget?.getActiveControl()?.focus();
	}

	override hasFocus(): boolean {
		return this._multiDiffEditorWidget?.getActiveControl()?.hasTextFocus() || super.hasFocus();
	}

	override clearInput(): void {
		super.clearInput();
		this._multiDiffEditorWidget!.setViewModel(undefined);
		this.modelSpecificResources.clear();
		this.viewModel = undefined;
	}
}


class WorkbenchUIElementFactory implements IWorkbenchUIElementFactory {
	constructor(
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@INotebookDocumentService private readonly notebookDocumentService: INotebookDocumentService,
		@INotebookService private readonly notebookService: INotebookService
	) { }

	createResourceLabel(element: HTMLElement): IResourceLabel {
		const label = this._instantiationService.createInstance(ResourceLabel, element, {});
		const that = this;
		return {
			setUri(uri, options = {}) {
				if (!uri) {
					label.element.clear();
				} else {
					let name = '';
					let description = '';
					let extraClasses: string[] | undefined = undefined;

					if (uri.scheme === Schemas.vscodeNotebookCell) {
						const notebookDocument = uri.scheme === Schemas.vscodeNotebookCell ? that.notebookDocumentService.getNotebook(uri) : undefined;
						const cellIndex = Schemas.vscodeNotebookCell ? that.notebookDocumentService.getNotebook(uri)?.getCellIndex(uri) : undefined;
						if (notebookDocument && cellIndex !== undefined) {
							name = localize('notebookCellLabel', "Cell {0}", `${cellIndex + 1}`);
							const nb = notebookDocument ? that.notebookService.getNotebookTextModel(notebookDocument?.uri) : undefined;
							const cellLanguage = nb && cellIndex !== undefined ? nb.cells[cellIndex].language : undefined;
							extraClasses = cellLanguage ? getIconClassesForLanguageId(cellLanguage) : undefined;
						}
					} else if (uri.scheme === Schemas.vscodeNotebookCellMetadata || uri.scheme === Schemas.vscodeNotebookCellMetadataDiff) {
						description = localize('notebookCellMetadataLabel', "Metadata");
					} else if (uri.scheme === Schemas.vscodeNotebookCellOutput || uri.scheme === Schemas.vscodeNotebookCellOutputDiff) {
						description = localize('notebookCellOutputLabel', "Output");
					}

					label.element.setResource({ name, description }, { strikethrough: options.strikethrough, forceLabel: true, hideIcon: !extraClasses, extraClasses });
				}
			},
			dispose() {
				label.dispose();
			}
		};
	}
}
