/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as DOM from '../../../../../base/browser/dom.js';
import { IWorkbenchUIElementFactory, type IResourceLabel } from '../../../../../editor/browser/widget/multiDiffEditor/workbenchUIElementFactory.js';
import { IStorageService } from '../../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { IThemeService } from '../../../../../platform/theme/common/themeService.js';
import { IEditorOpenContext } from '../../../../common/editor.js';
import { IEditorGroup } from '../../../../services/editor/common/editorGroupsService.js';
import { CancellationToken, CancellationTokenSource } from '../../../../../base/common/cancellation.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { INotebookEditorWorkerService } from '../../common/services/notebookWorkerService.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IEditorOptions as ICodeEditorOptions } from '../../../../../editor/common/config/editorOptions.js';
import { BareFontInfo, FontInfo } from '../../../../../editor/common/config/fontInfo.js';
import { PixelRatio } from '../../../../../base/browser/pixelRatio.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { EditorPane } from '../../../../browser/parts/editor/editorPane.js';
import { CellUri, INotebookDiffEditorModel, NOTEBOOK_MULTI_DIFF_EDITOR_ID } from '../../common/notebookCommon.js';
import { FontMeasurements } from '../../../../../editor/browser/config/fontMeasurements.js';
import { NotebookOptions } from '../notebookOptions.js';
import { INotebookService } from '../../common/notebookService.js';
import { NotebookMultiDiffEditorInput, NotebookMultiDiffEditorWidgetInput } from './notebookMultiDiffEditorInput.js';
import { MultiDiffEditorWidget } from '../../../../../editor/browser/widget/multiDiffEditor/multiDiffEditorWidget.js';
import { ResourceLabel } from '../../../../browser/labels.js';
import type { IMultiDiffEditorOptions } from '../../../../../editor/browser/widget/multiDiffEditor/multiDiffEditorWidgetImpl.js';
import { INotebookDocumentService } from '../../../../services/notebook/common/notebookDocumentService.js';
import { localize } from '../../../../../nls.js';
import { Schemas } from '../../../../../base/common/network.js';
import { getIconClassesForLanguageId } from '../../../../../editor/common/services/getIconClasses.js';
import { NotebookDiffViewModel } from './notebookDiffViewModel.js';
import { NotebookDiffEditorEventDispatcher } from './eventDispatcher.js';
import { NOTEBOOK_DIFF_CELLS_COLLAPSED, NOTEBOOK_DIFF_HAS_UNCHANGED_CELLS, NOTEBOOK_DIFF_UNCHANGED_CELLS_HIDDEN } from './notebookDiffEditorBrowser.js';
import type { DocumentDiffItemViewModel, MultiDiffEditorViewModel } from '../../../../../editor/browser/widget/multiDiffEditor/multiDiffEditorViewModel.js';
import type { URI } from '../../../../../base/common/uri.js';
import { type IDiffElementViewModelBase } from './diffElementViewModel.js';
import { autorun, transaction } from '../../../../../base/common/observable.js';
import { DiffEditorHeightCalculatorService } from './editorHeightCalculator.js';

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
		const diffEditorHeightCalculator = this.instantiationService.createInstance(DiffEditorHeightCalculatorService, this.fontInfo.lineHeight);
		this.viewModel = this.modelSpecificResources.add(new NotebookDiffViewModel(model, this.notebookEditorWorkerService, this.configurationService, eventDispatcher, this.notebookService, diffEditorHeightCalculator, undefined, true));
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
		if (uri.scheme === Schemas.vscodeNotebookMetadata) {
			return this.viewModel?.items.find(item =>
				item.type === 'modifiedMetadata' ||
				item.type === 'unchangedMetadata'
			);
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
