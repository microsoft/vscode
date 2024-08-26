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
import { CellUri, INotebookDiffEditorModel, NOTEBOOK_MULTI_DIFF_EDITOR_ID } from 'vs/workbench/contrib/notebook/common/notebookCommon';
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
import { NOTEBOOK_DIFF_CELLS_COLLAPSED, NOTEBOOK_DIFF_HAS_UNCHANGED_CELLS, NOTEBOOK_DIFF_UNCHANGED_CELLS_HIDDEN } from 'vs/workbench/contrib/notebook/browser/diff/notebookDiffEditorBrowser';
import type { DocumentDiffItemViewModel, MultiDiffEditorViewModel } from 'vs/editor/browser/widget/multiDiffEditor/multiDiffEditorViewModel';
import type { URI } from 'vs/base/common/uri';
import { type IDiffElementViewModelBase } from 'vs/workbench/contrib/notebook/browser/diff/diffElementViewModel';
import { autorun, transaction } from 'vs/base/common/observable';

export class NotebookMultiTextDiffEditor extends EditorPane {
	private _multiDiffEditorWidget?: MultiDiffEditorWidget;
	static readonly ID: string = NOTEBOOK_MULTI_DIFF_EDITOR_ID;
	private _fontInfo: FontInfo | undefined;
	protected _scopeContextKeyService!: IContextKeyService;
	private readonly modelSpecificResources = this._register(new DisposableStore());
	private _model?: INotebookDiffEditorModel;
	private viewModel?: NotebookDiffViewModel;
	private widgetViewModel?: MultiDiffEditorViewModel;
	get textModel() {
		return this._model?.modified.notebook;
	}
	private _notebookOptions: NotebookOptions;
	get notebookOptions() {
		return this._notebookOptions;
	}
	private readonly ctxAllCollapsed = this._parentContextKeyService.createKey<boolean>(NOTEBOOK_DIFF_CELLS_COLLAPSED.key, false);
	private readonly ctxHasUnchangedCells = this._parentContextKeyService.createKey<boolean>(NOTEBOOK_DIFF_HAS_UNCHANGED_CELLS.key, false);
	private readonly ctxHiddenUnchangedCells = this._parentContextKeyService.createKey<boolean>(NOTEBOOK_DIFF_UNCHANGED_CELLS_HIDDEN.key, true);

	constructor(
		group: IEditorGroup,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IThemeService themeService: IThemeService,
		@IContextKeyService private readonly _parentContextKeyService: IContextKeyService,
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
		this.ctxHasUnchangedCells.set(this.viewModel.hasUnchangedCells);
		this.ctxHasUnchangedCells.set(this.viewModel.hasUnchangedCells);

		const widgetInput = this.modelSpecificResources.add(NotebookMultiDiffEditorWidgetInput.createInput(this.viewModel, this.instantiationService));
		this.widgetViewModel = this.modelSpecificResources.add(await widgetInput.getViewModel());

		const itemsWeHaveSeen = new WeakSet<DocumentDiffItemViewModel>();
		this.modelSpecificResources.add(autorun(reader => {
			/** @description NotebookDiffEditor => Collapse unmodified items */
			if (!this.widgetViewModel || !this.viewModel) {
				return;
			}
			const items = this.widgetViewModel.items.read(reader);
			const diffItems = this.viewModel.value;
			if (items.length !== diffItems.length) {
				return;
			}

			// If cell has not changed, but metadata or output has changed, then collapse the cell & keep output/metadata expanded.
			// Similarly if the cell has changed, but the metadata or output has not, then expand the cell, but collapse output/metadata.
			transaction((tx) => {
				items.forEach(item => {
					// We do not want to mess with UI state if users change it, hence no need to collapse again.
					if (itemsWeHaveSeen.has(item)) {
						return;
					}
					itemsWeHaveSeen.add(item);
					const diffItem = diffItems.find(d => d.modifiedUri?.toString() === item.modifiedUri?.toString() && d.originalUri?.toString() === item.originalUri?.toString());
					if (diffItem && diffItem.type === 'unchanged') {
						item.collapsed.set(true, tx);
					}
				});
			});
		}));


		this._multiDiffEditorWidget!.setViewModel(this.widgetViewModel);
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
		this.widgetViewModel = undefined;
	}

	public expandAll() {
		if (this.widgetViewModel) {
			this.widgetViewModel.expandAll();
			this.ctxAllCollapsed.set(false);
		}
	}
	public collapseAll() {
		if (this.widgetViewModel) {
			this.widgetViewModel.collapseAll();
			this.ctxAllCollapsed.set(true);
		}
	}

	public hideUnchanged() {
		if (this.viewModel) {
			this.viewModel.includeUnchanged = false;
			this.ctxHiddenUnchangedCells.set(true);
		}
	}

	public showUnchanged() {
		if (this.viewModel) {
			this.viewModel.includeUnchanged = true;
			this.ctxHiddenUnchangedCells.set(false);
		}
	}

	public getDiffElementViewModel(uri: URI): IDiffElementViewModelBase | undefined {
		if (uri.scheme === Schemas.vscodeNotebookCellOutput || uri.scheme === Schemas.vscodeNotebookCellOutputDiff ||
			uri.scheme === Schemas.vscodeNotebookCellMetadata || uri.scheme === Schemas.vscodeNotebookCellMetadataDiff
		) {
			const data = CellUri.parseCellPropertyUri(uri, uri.scheme);
			if (data) {
				uri = CellUri.generate(data.notebook, data.handle);
			}
		}
		return this.viewModel?.items.find(c => {
			switch (c.type) {
				case 'delete':
					return c.original?.uri.toString() === uri.toString();
				case 'insert':
					return c.modified?.uri.toString() === uri.toString();
				case 'modified':
				case 'unchanged':
					return c.modified?.uri.toString() === uri.toString() || c.original?.uri.toString() === uri.toString();
				default:
					return;
			}
		});
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
