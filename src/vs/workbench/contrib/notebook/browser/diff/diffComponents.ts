/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as DOM from 'vs/base/browser/dom';
import { Disposable, DisposableStore } from 'vs/base/common/lifecycle';
import { Schemas } from 'vs/base/common/network';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { DiffElementCellViewModelBase, getFormattedMetadataJSON, getFormattedOutputJSON, OutputComparison, outputEqual, OUTPUT_EDITOR_HEIGHT_MAGIC, PropertyFoldingState, SideBySideDiffElementViewModel, SingleSideDiffElementViewModel, DiffElementPlaceholderViewModel } from 'vs/workbench/contrib/notebook/browser/diff/diffElementViewModel';
import { CellDiffSideBySideRenderTemplate, CellDiffSingleSideRenderTemplate, DiffSide, DIFF_CELL_MARGIN, INotebookTextDiffEditor, NOTEBOOK_DIFF_CELL_INPUT, NOTEBOOK_DIFF_CELL_PROPERTY, NOTEBOOK_DIFF_CELL_PROPERTY_EXPANDED, CellDiffPlaceholderRenderTemplate, IDiffCellMarginOverlay, NOTEBOOK_DIFF_CELL_IGNORE_WHITESPACE } from 'vs/workbench/contrib/notebook/browser/diff/notebookDiffEditorBrowser';
import { CodeEditorWidget, ICodeEditorWidgetOptions } from 'vs/editor/browser/widget/codeEditor/codeEditorWidget';
import { IModelService } from 'vs/editor/common/services/model';
import { ILanguageService } from 'vs/editor/common/languages/language';
import { CellEditType, CellUri, NotebookCellMetadata } from 'vs/workbench/contrib/notebook/common/notebookCommon';
import { ToolBar } from 'vs/base/browser/ui/toolbar/toolbar';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { IMenu, IMenuService, MenuId, MenuItemAction } from 'vs/platform/actions/common/actions';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { INotificationService } from 'vs/platform/notification/common/notification';
import { IAction } from 'vs/base/common/actions';
import { createAndFillInActionBarActions } from 'vs/platform/actions/browser/menuEntryActionViewItem';
import { IContextKey, IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { CodiconActionViewItem } from 'vs/workbench/contrib/notebook/browser/view/cellParts/cellActionView';
import { collapsedIcon, expandedIcon } from 'vs/workbench/contrib/notebook/browser/notebookIcons';
import { OutputContainer } from 'vs/workbench/contrib/notebook/browser/diff/diffElementOutputs';
import { EditorExtensionsRegistry } from 'vs/editor/browser/editorExtensions';
import { ContextMenuController } from 'vs/editor/contrib/contextmenu/browser/contextmenu';
import { SnippetController2 } from 'vs/editor/contrib/snippet/browser/snippetController2';
import { SuggestController } from 'vs/editor/contrib/suggest/browser/suggestController';
import { MenuPreventer } from 'vs/workbench/contrib/codeEditor/browser/menuPreventer';
import { SelectionClipboardContributionID } from 'vs/workbench/contrib/codeEditor/browser/selectionClipboard';
import { TabCompletionController } from 'vs/workbench/contrib/snippets/browser/tabCompletion';
import { renderIcon, renderLabelWithIcons } from 'vs/base/browser/ui/iconLabel/iconLabels';
import * as editorCommon from 'vs/editor/common/editorCommon';
import { ITextModelService } from 'vs/editor/common/services/resolverService';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { WorkbenchToolBar } from 'vs/platform/actions/browser/toolbar';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { fixedDiffEditorOptions, fixedEditorOptions, fixedEditorPadding, fixedEditorPaddingSingleLineCells } from 'vs/workbench/contrib/notebook/browser/diff/diffCellEditorOptions';
import { AccessibilityVerbositySettingId } from 'vs/workbench/contrib/accessibility/browser/accessibilityConfiguration';
import { IAccessibilityService } from 'vs/platform/accessibility/common/accessibility';
import { DiffEditorWidget } from 'vs/editor/browser/widget/diffEditor/diffEditorWidget';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { DiffNestedCellViewModel } from 'vs/workbench/contrib/notebook/browser/diff/diffNestedCellViewModel';
import { localize } from 'vs/nls';
import { Emitter } from 'vs/base/common/event';
import { ITextResourceConfigurationService } from 'vs/editor/common/services/textResourceConfiguration';

export function getOptimizedNestedCodeEditorWidgetOptions(): ICodeEditorWidgetOptions {
	return {
		isSimpleWidget: false,
		contributions: EditorExtensionsRegistry.getSomeEditorContributions([
			MenuPreventer.ID,
			SelectionClipboardContributionID,
			ContextMenuController.ID,
			SuggestController.ID,
			SnippetController2.ID,
			TabCompletionController.ID,
		])
	};
}

export class CellDiffPlaceholderElement extends Disposable {
	constructor(
		placeholder: DiffElementPlaceholderViewModel,
		templateData: CellDiffPlaceholderRenderTemplate,
	) {
		super();
		templateData.body.classList.remove('left', 'right', 'full');
		const text = (placeholder.hiddenCells.length === 1) ?
			localize('hiddenCell', '{0} hidden cell', placeholder.hiddenCells.length) :
			localize('hiddenCells', '{0} hidden cells', placeholder.hiddenCells.length);
		templateData.placeholder.innerText = text;

		this._register(DOM.addDisposableListener(templateData.placeholder, 'dblclick', (e: MouseEvent) => {
			if (e.button !== 0) {
				return;
			}
			e.preventDefault();
			placeholder.showHiddenCells();
		}));
		this._register(templateData.marginOverlay.onAction(() => placeholder.showHiddenCells()));
		templateData.marginOverlay.show();
	}
}

class PropertyHeader extends Disposable {
	protected _foldingIndicator!: HTMLElement;
	protected _statusSpan!: HTMLElement;
	protected _description!: HTMLElement;
	protected _toolbar!: WorkbenchToolBar;
	protected _menu!: IMenu;
	protected _propertyExpanded?: IContextKey<boolean>;

	constructor(
		readonly cell: DiffElementCellViewModelBase,
		readonly propertyHeaderContainer: HTMLElement,
		readonly notebookEditor: INotebookTextDiffEditor,
		readonly accessor: {
			updateInfoRendering: (renderOutput: boolean) => void;
			checkIfModified: (cell: DiffElementCellViewModelBase) => false | { reason: string | undefined };
			getFoldingState: (cell: DiffElementCellViewModelBase) => PropertyFoldingState;
			updateFoldingState: (cell: DiffElementCellViewModelBase, newState: PropertyFoldingState) => void;
			unChangedLabel: string;
			changedLabel: string;
			prefix: string;
			menuId: MenuId;
		},
		@IContextMenuService private readonly contextMenuService: IContextMenuService,
		@IKeybindingService private readonly keybindingService: IKeybindingService,
		@ICommandService private readonly commandService: ICommandService,
		@INotificationService private readonly notificationService: INotificationService,
		@IMenuService private readonly menuService: IMenuService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@IThemeService private readonly themeService: IThemeService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
		@IAccessibilityService private readonly accessibilityService: IAccessibilityService
	) {
		super();
	}

	buildHeader(): void {
		const metadataChanged = this.accessor.checkIfModified(this.cell);
		this._foldingIndicator = DOM.append(this.propertyHeaderContainer, DOM.$('.property-folding-indicator'));
		this._foldingIndicator.classList.add(this.accessor.prefix);
		this._updateFoldingIcon();
		const metadataStatus = DOM.append(this.propertyHeaderContainer, DOM.$('div.property-status'));

		this._statusSpan = DOM.append(metadataStatus, DOM.$('span'));
		this._description = DOM.append(metadataStatus, DOM.$('span.property-description'));

		if (metadataChanged) {
			this._statusSpan.textContent = this.accessor.changedLabel;
			this._statusSpan.style.fontWeight = 'bold';
			if (metadataChanged.reason) {
				this._description.textContent = metadataChanged.reason;
			}
			this.propertyHeaderContainer.classList.add('modified');
		} else {
			this._statusSpan.textContent = this.accessor.unChangedLabel;
			this._description.textContent = '';
			this.propertyHeaderContainer.classList.remove('modified');
		}

		const cellToolbarContainer = DOM.append(this.propertyHeaderContainer, DOM.$('div.property-toolbar'));
		this._toolbar = new WorkbenchToolBar(cellToolbarContainer, {
			actionViewItemProvider: (action, options) => {
				if (action instanceof MenuItemAction) {
					const item = new CodiconActionViewItem(action, { hoverDelegate: options.hoverDelegate }, this.keybindingService, this.notificationService, this.contextKeyService, this.themeService, this.contextMenuService, this.accessibilityService);
					return item;
				}

				return undefined;
			}
		}, this.menuService, this.contextKeyService, this.contextMenuService, this.keybindingService, this.commandService, this.telemetryService);
		this._register(this._toolbar);
		this._toolbar.context = {
			cell: this.cell
		};

		const scopedContextKeyService = this.contextKeyService.createScoped(cellToolbarContainer);
		this._register(scopedContextKeyService);
		const propertyChanged = NOTEBOOK_DIFF_CELL_PROPERTY.bindTo(scopedContextKeyService);
		propertyChanged.set(!!metadataChanged);
		this._propertyExpanded = NOTEBOOK_DIFF_CELL_PROPERTY_EXPANDED.bindTo(scopedContextKeyService);

		this._menu = this.menuService.createMenu(this.accessor.menuId, scopedContextKeyService);
		this._register(this._menu);

		const actions: IAction[] = [];
		createAndFillInActionBarActions(this._menu, { shouldForwardArgs: true }, actions);
		this._toolbar.setActions(actions);

		this._register(this._menu.onDidChange(() => {
			const actions: IAction[] = [];
			createAndFillInActionBarActions(this._menu, { shouldForwardArgs: true }, actions);
			this._toolbar.setActions(actions);
		}));

		this._register(this.notebookEditor.onMouseUp(e => {
			if (!e.event.target) {
				return;
			}

			const target = e.event.target as HTMLElement;

			if (target === this.propertyHeaderContainer ||
				target === this._foldingIndicator || this._foldingIndicator.contains(target) ||
				target === metadataStatus || metadataStatus.contains(target)
			) {
				const cellViewModel = e.target;

				if (cellViewModel === this.cell) {
					const oldFoldingState = this.accessor.getFoldingState(this.cell);
					this.accessor.updateFoldingState(this.cell, oldFoldingState === PropertyFoldingState.Expanded ? PropertyFoldingState.Collapsed : PropertyFoldingState.Expanded);
					this._updateFoldingIcon();
					this.accessor.updateInfoRendering(this.cell.renderOutput);
				}
			}

			return;
		}));

		this._updateFoldingIcon();
		this.accessor.updateInfoRendering(this.cell.renderOutput);
	}

	refresh() {
		const metadataChanged = this.accessor.checkIfModified(this.cell);
		if (metadataChanged) {
			this._statusSpan.textContent = this.accessor.changedLabel;
			this._statusSpan.style.fontWeight = 'bold';
			if (metadataChanged.reason) {
				this._description.textContent = metadataChanged.reason;
			}
			this.propertyHeaderContainer.classList.add('modified');
			const actions: IAction[] = [];
			createAndFillInActionBarActions(this._menu, undefined, actions);
			this._toolbar.setActions(actions);
		} else {
			this._statusSpan.textContent = this.accessor.unChangedLabel;
			this._statusSpan.style.fontWeight = 'normal';
			this._description.textContent = '';
			this.propertyHeaderContainer.classList.remove('modified');
			this._toolbar.setActions([]);
		}
	}

	private _updateFoldingIcon() {
		if (this.accessor.getFoldingState(this.cell) === PropertyFoldingState.Collapsed) {
			DOM.reset(this._foldingIndicator, renderIcon(collapsedIcon));
			this._propertyExpanded?.set(false);
		} else {
			DOM.reset(this._foldingIndicator, renderIcon(expandedIcon));
			this._propertyExpanded?.set(true);
		}

	}
}

interface IDiffElementLayoutState {
	outerWidth?: boolean;
	editorHeight?: boolean;
	metadataEditor?: boolean;
	metadataHeight?: boolean;
	outputTotalHeight?: boolean;
}

abstract class AbstractElementRenderer extends Disposable {
	protected readonly _metadataLocalDisposable = this._register(new DisposableStore());
	protected readonly _outputLocalDisposable = this._register(new DisposableStore());
	protected _ignoreMetadata: boolean = false;
	protected _ignoreOutputs: boolean = false;
	protected _cellHeaderContainer!: HTMLElement;
	protected _editorContainer!: HTMLElement;
	protected _cellHeader!: PropertyHeader;
	protected _metadataHeaderContainer!: HTMLElement;
	protected _metadataHeader!: PropertyHeader;
	protected _metadataInfoContainer!: HTMLElement;
	protected _metadataEditorContainer?: HTMLElement;
	protected readonly _metadataEditorDisposeStore!: DisposableStore;
	protected _metadataEditor?: CodeEditorWidget | DiffEditorWidget;

	protected _outputHeaderContainer!: HTMLElement;
	protected _outputHeader!: PropertyHeader;
	protected _outputInfoContainer!: HTMLElement;
	protected _outputEditorContainer?: HTMLElement;
	protected _outputViewContainer?: HTMLElement;
	protected _outputLeftContainer?: HTMLElement;
	protected _outputRightContainer?: HTMLElement;
	protected _outputMetadataContainer?: HTMLElement;
	protected _outputEmptyElement?: HTMLElement;
	protected _outputLeftView?: OutputContainer;
	protected _outputRightView?: OutputContainer;
	protected readonly _outputEditorDisposeStore!: DisposableStore;
	protected _outputEditor?: CodeEditorWidget | DiffEditorWidget;
	protected _outputMetadataEditor?: DiffEditorWidget;

	protected _diffEditorContainer!: HTMLElement;
	protected _diagonalFill?: HTMLElement;
	protected _isDisposed: boolean;

	constructor(
		readonly notebookEditor: INotebookTextDiffEditor,
		readonly cell: DiffElementCellViewModelBase,
		readonly templateData: CellDiffSingleSideRenderTemplate | CellDiffSideBySideRenderTemplate,
		readonly style: 'left' | 'right' | 'full',
		protected readonly instantiationService: IInstantiationService,
		protected readonly languageService: ILanguageService,
		protected readonly modelService: IModelService,
		protected readonly textModelService: ITextModelService,
		protected readonly contextMenuService: IContextMenuService,
		protected readonly keybindingService: IKeybindingService,
		protected readonly notificationService: INotificationService,
		protected readonly menuService: IMenuService,
		protected readonly contextKeyService: IContextKeyService,
		protected readonly configurationService: IConfigurationService,
		protected readonly textConfigurationService: ITextResourceConfigurationService
	) {
		super();
		// init
		this._isDisposed = false;
		this._metadataEditorDisposeStore = this._register(new DisposableStore());
		this._outputEditorDisposeStore = this._register(new DisposableStore());
		this._register(cell.onDidLayoutChange(e => {
			this.layout(e);
		}));
		this._register(cell.onDidLayoutChange(e => this.updateBorders()));
		this.init();
		this.buildBody();

		this._register(cell.onDidStateChange(() => {
			this.updateOutputRendering(this.cell.renderOutput);
		}));
	}

	abstract init(): void;
	abstract styleContainer(container: HTMLElement): void;
	abstract _buildOutput(): void;
	abstract _disposeOutput(): void;
	abstract _buildMetadata(): void;
	abstract _disposeMetadata(): void;

	buildBody(): void {
		const body = this.templateData.body;
		this._diffEditorContainer = this.templateData.diffEditorContainer;
		body.classList.remove('left', 'right', 'full');
		switch (this.style) {
			case 'left':
				body.classList.add('left');
				break;
			case 'right':
				body.classList.add('right');
				break;
			default:
				body.classList.add('full');
				break;
		}

		this.styleContainer(this._diffEditorContainer);
		this.updateSourceEditor();
		if (this.cell.modified) {
			this._register(this.cell.modified.textModel.onDidChangeContent(() => this._cellHeader.refresh()));
		}

		this._ignoreMetadata = this.configurationService.getValue('notebook.diff.ignoreMetadata');
		if (this._ignoreMetadata) {
			this._disposeMetadata();
		} else {
			this._buildMetadata();
		}

		this._ignoreOutputs = this.configurationService.getValue<boolean>('notebook.diff.ignoreOutputs') || !!(this.notebookEditor.textModel?.transientOptions.transientOutputs);
		if (this._ignoreOutputs) {
			this._disposeOutput();
		} else {
			this._buildOutput();
		}

		this._register(this.configurationService.onDidChangeConfiguration(e => {
			let metadataLayoutChange = false;
			let outputLayoutChange = false;
			if (e.affectsConfiguration('notebook.diff.ignoreMetadata')) {
				const newValue = this.configurationService.getValue<boolean>('notebook.diff.ignoreMetadata');

				if (newValue !== undefined && this._ignoreMetadata !== newValue) {
					this._ignoreMetadata = newValue;

					this._metadataLocalDisposable.clear();
					if (this.configurationService.getValue('notebook.diff.ignoreMetadata')) {
						this._disposeMetadata();
					} else {
						this.cell.metadataStatusHeight = 25;
						this._buildMetadata();
						this.updateMetadataRendering();
						metadataLayoutChange = true;
					}
				}
			}

			if (e.affectsConfiguration('notebook.diff.ignoreOutputs')) {
				const newValue = this.configurationService.getValue<boolean>('notebook.diff.ignoreOutputs');

				if (newValue !== undefined && this._ignoreOutputs !== (newValue || this.notebookEditor.textModel?.transientOptions.transientOutputs)) {
					this._ignoreOutputs = newValue || !!(this.notebookEditor.textModel?.transientOptions.transientOutputs);

					this._outputLocalDisposable.clear();
					if (this._ignoreOutputs) {
						this._disposeOutput();
					} else {
						this.cell.outputStatusHeight = 25;
						this._buildOutput();
						outputLayoutChange = true;
					}
				}
			}

			if (metadataLayoutChange || outputLayoutChange) {
				this.layout({ metadataHeight: metadataLayoutChange, outputTotalHeight: outputLayoutChange });
			}
		}));
	}

	updateMetadataRendering() {
		if (this.cell.metadataFoldingState === PropertyFoldingState.Expanded) {
			// we should expand the metadata editor
			this._metadataInfoContainer.style.display = 'block';

			if (!this._metadataEditorContainer || !this._metadataEditor) {
				// create editor
				this._metadataEditorContainer = DOM.append(this._metadataInfoContainer, DOM.$('.metadata-editor-container'));
				this._buildMetadataEditor();
			} else {
				this.cell.metadataHeight = this._metadataEditor.getContentHeight();
			}
		} else {
			// we should collapse the metadata editor
			this._metadataInfoContainer.style.display = 'none';
			// this._metadataEditorDisposeStore.clear();
			this.cell.metadataHeight = 0;
		}
	}

	updateOutputRendering(renderRichOutput: boolean) {
		if (this.cell.outputFoldingState === PropertyFoldingState.Expanded) {
			this._outputInfoContainer.style.display = 'block';
			if (renderRichOutput) {
				this._hideOutputsRaw();
				this._buildOutputRendererContainer();
				this._showOutputsRenderer();
				this._showOutputsEmptyView();
			} else {
				this._hideOutputsRenderer();
				this._buildOutputRawContainer();
				this._showOutputsRaw();
			}
		} else {
			this._outputInfoContainer.style.display = 'none';

			this._hideOutputsRaw();
			this._hideOutputsRenderer();
			this._hideOutputsEmptyView();
		}
	}

	private _buildOutputRawContainer() {
		if (!this._outputEditorContainer) {
			this._outputEditorContainer = DOM.append(this._outputInfoContainer, DOM.$('.output-editor-container'));
			this._buildOutputEditor();
		}
	}

	private _showOutputsRaw() {
		if (this._outputEditorContainer) {
			this._outputEditorContainer.style.display = 'block';
			this.cell.rawOutputHeight = this._outputEditor!.getContentHeight();
		}
	}

	private _showOutputsEmptyView() {
		this.cell.layoutChange();
	}

	protected _hideOutputsRaw() {
		if (this._outputEditorContainer) {
			this._outputEditorContainer.style.display = 'none';
			this.cell.rawOutputHeight = 0;
		}
	}

	protected _hideOutputsEmptyView() {
		this.cell.layoutChange();
	}

	abstract _buildOutputRendererContainer(): void;
	abstract _hideOutputsRenderer(): void;
	abstract _showOutputsRenderer(): void;

	private _applySanitizedMetadataChanges(currentMetadata: NotebookCellMetadata, newMetadata: any) {
		const result: { [key: string]: any } = {};
		try {
			const newMetadataObj = JSON.parse(newMetadata);
			const keys = new Set([...Object.keys(newMetadataObj)]);
			for (const key of keys) {
				switch (key as keyof NotebookCellMetadata) {
					case 'inputCollapsed':
					case 'outputCollapsed':
						// boolean
						if (typeof newMetadataObj[key] === 'boolean') {
							result[key] = newMetadataObj[key];
						} else {
							result[key] = currentMetadata[key as keyof NotebookCellMetadata];
						}
						break;

					default:
						result[key] = newMetadataObj[key];
						break;
				}
			}

			const index = this.notebookEditor.textModel!.cells.indexOf(this.cell.modified!.textModel);

			if (index < 0) {
				return;
			}

			this.notebookEditor.textModel!.applyEdits([
				{ editType: CellEditType.Metadata, index, metadata: result }
			], true, undefined, () => undefined, undefined, true);
		} catch {
		}
	}

	private async _buildMetadataEditor() {
		this._metadataEditorDisposeStore.clear();

		if (this.cell instanceof SideBySideDiffElementViewModel) {
			this._metadataEditor = this.instantiationService.createInstance(DiffEditorWidget, this._metadataEditorContainer!, {
				...fixedDiffEditorOptions,
				overflowWidgetsDomNode: this.notebookEditor.getOverflowContainerDomNode(),
				readOnly: false,
				originalEditable: false,
				ignoreTrimWhitespace: false,
				automaticLayout: false,
				dimension: {
					height: this.cell.layoutInfo.metadataHeight,
					width: this.cell.getComputedCellContainerWidth(this.notebookEditor.getLayoutInfo(), true, true)
				}
			}, {
				originalEditor: getOptimizedNestedCodeEditorWidgetOptions(),
				modifiedEditor: getOptimizedNestedCodeEditorWidgetOptions()
			});

			this.layout({ metadataHeight: true });
			this._metadataEditorDisposeStore.add(this._metadataEditor);

			this._metadataEditorContainer?.classList.add('diff');

			const originalMetadataModel = await this.textModelService.createModelReference(CellUri.generateCellPropertyUri(this.cell.originalDocument.uri, this.cell.original.handle, Schemas.vscodeNotebookCellMetadata));
			const modifiedMetadataModel = await this.textModelService.createModelReference(CellUri.generateCellPropertyUri(this.cell.modifiedDocument.uri, this.cell.modified.handle, Schemas.vscodeNotebookCellMetadata));
			this._metadataEditor.setModel({
				original: originalMetadataModel.object.textEditorModel,
				modified: modifiedMetadataModel.object.textEditorModel
			});

			this._metadataEditorDisposeStore.add(originalMetadataModel);
			this._metadataEditorDisposeStore.add(modifiedMetadataModel);

			this.cell.metadataHeight = this._metadataEditor.getContentHeight();

			this._metadataEditorDisposeStore.add(this._metadataEditor.onDidContentSizeChange((e) => {
				if (e.contentHeightChanged && this.cell.metadataFoldingState === PropertyFoldingState.Expanded) {
					this.cell.metadataHeight = e.contentHeight;
				}
			}));

			let respondingToContentChange = false;

			this._metadataEditorDisposeStore.add(modifiedMetadataModel.object.textEditorModel.onDidChangeContent(() => {
				respondingToContentChange = true;
				const value = modifiedMetadataModel.object.textEditorModel.getValue();
				this._applySanitizedMetadataChanges(this.cell.modified!.metadata, value);
				this._metadataHeader.refresh();
				respondingToContentChange = false;
			}));

			this._metadataEditorDisposeStore.add(this.cell.modified.textModel.onDidChangeMetadata(() => {
				if (respondingToContentChange) {
					return;
				}

				const modifiedMetadataSource = getFormattedMetadataJSON(this.notebookEditor.textModel!, this.cell.modified?.metadata || {}, this.cell.modified?.language);
				modifiedMetadataModel.object.textEditorModel.setValue(modifiedMetadataSource);
			}));

			return;
		} else {
			this._metadataEditor = this.instantiationService.createInstance(CodeEditorWidget, this._metadataEditorContainer!, {
				...fixedEditorOptions,
				dimension: {
					width: this.cell.getComputedCellContainerWidth(this.notebookEditor.getLayoutInfo(), false, true),
					height: this.cell.layoutInfo.metadataHeight
				},
				overflowWidgetsDomNode: this.notebookEditor.getOverflowContainerDomNode(),
				readOnly: false
			}, {});
			this.layout({ metadataHeight: true });
			this._metadataEditorDisposeStore.add(this._metadataEditor);

			const mode = this.languageService.createById('jsonc');
			const originalMetadataSource = getFormattedMetadataJSON(this.notebookEditor.textModel!,
				this.cell.type === 'insert'
					? this.cell.modified!.metadata || {}
					: this.cell.original!.metadata || {});
			const uri = this.cell.type === 'insert'
				? this.cell.modified!.uri
				: this.cell.original!.uri;
			const handle = this.cell.type === 'insert'
				? this.cell.modified!.handle
				: this.cell.original!.handle;

			const modelUri = CellUri.generateCellPropertyUri(uri, handle, Schemas.vscodeNotebookCellMetadata);
			const metadataModel = this.modelService.createModel(originalMetadataSource, mode, modelUri, false);
			this._metadataEditor.setModel(metadataModel);
			this._metadataEditorDisposeStore.add(metadataModel);

			this.cell.metadataHeight = this._metadataEditor.getContentHeight();

			this._metadataEditorDisposeStore.add(this._metadataEditor.onDidContentSizeChange((e) => {
				if (e.contentHeightChanged && this.cell.metadataFoldingState === PropertyFoldingState.Expanded) {
					this.cell.metadataHeight = e.contentHeight;
				}
			}));
		}
	}

	private _buildOutputEditor() {
		this._outputEditorDisposeStore.clear();

		if ((this.cell.type === 'modified' || this.cell.type === 'unchanged') && !this.notebookEditor.textModel!.transientOptions.transientOutputs) {
			const originalOutputsSource = getFormattedOutputJSON(this.cell.original?.outputs || []);
			const modifiedOutputsSource = getFormattedOutputJSON(this.cell.modified?.outputs || []);
			if (originalOutputsSource !== modifiedOutputsSource) {
				const mode = this.languageService.createById('json');
				const originalModel = this.modelService.createModel(originalOutputsSource, mode, undefined, true);
				const modifiedModel = this.modelService.createModel(modifiedOutputsSource, mode, undefined, true);
				this._outputEditorDisposeStore.add(originalModel);
				this._outputEditorDisposeStore.add(modifiedModel);

				const lineHeight = this.notebookEditor.getLayoutInfo().fontInfo.lineHeight || 17;
				const lineCount = Math.max(originalModel.getLineCount(), modifiedModel.getLineCount());
				this._outputEditor = this.instantiationService.createInstance(DiffEditorWidget, this._outputEditorContainer!, {
					...fixedDiffEditorOptions,
					overflowWidgetsDomNode: this.notebookEditor.getOverflowContainerDomNode(),
					readOnly: true,
					ignoreTrimWhitespace: false,
					automaticLayout: false,
					dimension: {
						height: Math.min(OUTPUT_EDITOR_HEIGHT_MAGIC, this.cell.layoutInfo.rawOutputHeight || lineHeight * lineCount),
						width: this.cell.getComputedCellContainerWidth(this.notebookEditor.getLayoutInfo(), false, true)
					},
					accessibilityVerbose: this.configurationService.getValue<boolean>(AccessibilityVerbositySettingId.DiffEditor) ?? false
				}, {
					originalEditor: getOptimizedNestedCodeEditorWidgetOptions(),
					modifiedEditor: getOptimizedNestedCodeEditorWidgetOptions()
				});
				this._outputEditorDisposeStore.add(this._outputEditor);

				this._outputEditorContainer?.classList.add('diff');

				this._outputEditor.setModel({
					original: originalModel,
					modified: modifiedModel
				});
				this._outputEditor.restoreViewState(this.cell.getOutputEditorViewState() as editorCommon.IDiffEditorViewState);

				this.cell.rawOutputHeight = this._outputEditor.getContentHeight();

				this._outputEditorDisposeStore.add(this._outputEditor.onDidContentSizeChange((e) => {
					if (e.contentHeightChanged && this.cell.outputFoldingState === PropertyFoldingState.Expanded) {
						this.cell.rawOutputHeight = e.contentHeight;
					}
				}));

				this._outputEditorDisposeStore.add(this.cell.modified!.textModel.onDidChangeOutputs(() => {
					const modifiedOutputsSource = getFormattedOutputJSON(this.cell.modified?.outputs || []);
					modifiedModel.setValue(modifiedOutputsSource);
					this._outputHeader.refresh();
				}));

				return;
			}
		}

		this._outputEditor = this.instantiationService.createInstance(CodeEditorWidget, this._outputEditorContainer!, {
			...fixedEditorOptions,
			dimension: {
				width: Math.min(OUTPUT_EDITOR_HEIGHT_MAGIC, this.cell.getComputedCellContainerWidth(this.notebookEditor.getLayoutInfo(), false, this.cell.type === 'unchanged' || this.cell.type === 'modified') - 32),
				height: this.cell.layoutInfo.rawOutputHeight
			},
			overflowWidgetsDomNode: this.notebookEditor.getOverflowContainerDomNode()
		}, {});
		this._outputEditorDisposeStore.add(this._outputEditor);

		const mode = this.languageService.createById('json');
		const originaloutputSource = getFormattedOutputJSON(
			this.notebookEditor.textModel!.transientOptions.transientOutputs
				? []
				: this.cell.type === 'insert'
					? this.cell.modified!.outputs || []
					: this.cell.original!.outputs || []);
		const outputModel = this.modelService.createModel(originaloutputSource, mode, undefined, true);
		this._outputEditorDisposeStore.add(outputModel);
		this._outputEditor.setModel(outputModel);
		this._outputEditor.restoreViewState(this.cell.getOutputEditorViewState());

		this.cell.rawOutputHeight = this._outputEditor.getContentHeight();

		this._outputEditorDisposeStore.add(this._outputEditor.onDidContentSizeChange((e) => {
			if (e.contentHeightChanged && this.cell.outputFoldingState === PropertyFoldingState.Expanded) {
				this.cell.rawOutputHeight = e.contentHeight;
			}
		}));
	}

	protected layoutNotebookCell() {
		this.notebookEditor.layoutNotebookCell(
			this.cell,
			this.cell.layoutInfo.totalHeight
		);
	}

	updateBorders() {
		this.templateData.leftBorder.style.height = `${this.cell.layoutInfo.totalHeight - 32}px`;
		this.templateData.rightBorder.style.height = `${this.cell.layoutInfo.totalHeight - 32}px`;
		this.templateData.bottomBorder.style.top = `${this.cell.layoutInfo.totalHeight - 32}px`;
	}

	override dispose() {
		if (this._outputEditor) {
			this.cell.saveOutputEditorViewState(this._outputEditor.saveViewState());
		}

		if (this._metadataEditor) {
			this.cell.saveMetadataEditorViewState(this._metadataEditor.saveViewState());
		}

		this._metadataEditorDisposeStore.dispose();
		this._outputEditorDisposeStore.dispose();

		this._isDisposed = true;
		super.dispose();
	}

	abstract updateSourceEditor(): void;
	abstract layout(state: IDiffElementLayoutState): void;
}

abstract class SingleSideDiffElement extends AbstractElementRenderer {
	protected _editor!: CodeEditorWidget;
	override readonly cell: SingleSideDiffElementViewModel;
	override readonly templateData: CellDiffSingleSideRenderTemplate;
	abstract get nestedCellViewModel(): DiffNestedCellViewModel;
	abstract get readonly(): boolean;
	constructor(
		notebookEditor: INotebookTextDiffEditor,
		cell: SingleSideDiffElementViewModel,
		templateData: CellDiffSingleSideRenderTemplate,
		style: 'left' | 'right' | 'full',
		instantiationService: IInstantiationService,
		languageService: ILanguageService,
		modelService: IModelService,
		textModelService: ITextModelService,
		contextMenuService: IContextMenuService,
		keybindingService: IKeybindingService,
		notificationService: INotificationService,
		menuService: IMenuService,
		contextKeyService: IContextKeyService,
		configurationService: IConfigurationService,
		textConfigurationService: ITextResourceConfigurationService
	) {
		super(
			notebookEditor,
			cell,
			templateData,
			style,
			instantiationService,
			languageService,
			modelService,
			textModelService,
			contextMenuService,
			keybindingService,
			notificationService,
			menuService,
			contextKeyService,
			configurationService,
			textConfigurationService
		);
		this.cell = cell;
		this.templateData = templateData;

		this.updateBorders();
	}

	init() {
		this._diagonalFill = this.templateData.diagonalFill;
	}

	override buildBody() {
		const body = this.templateData.body;
		this._diffEditorContainer = this.templateData.diffEditorContainer;
		body.classList.remove('left', 'right', 'full');
		switch (this.style) {
			case 'left':
				body.classList.add('left');
				break;
			case 'right':
				body.classList.add('right');
				break;
			default:
				body.classList.add('full');
				break;
		}

		this.styleContainer(this._diffEditorContainer);
		this.updateSourceEditor();

		if (this.configurationService.getValue('notebook.diff.ignoreMetadata')) {
			this._disposeMetadata();
		} else {
			this._buildMetadata();
		}

		if (this.configurationService.getValue('notebook.diff.ignoreOutputs') || this.notebookEditor.textModel?.transientOptions.transientOutputs) {
			this._disposeOutput();
		} else {
			this._buildOutput();
		}

		this._register(this.configurationService.onDidChangeConfiguration(e => {
			let metadataLayoutChange = false;
			let outputLayoutChange = false;
			if (e.affectsConfiguration('notebook.diff.ignoreMetadata')) {
				this._metadataLocalDisposable.clear();
				if (this.configurationService.getValue('notebook.diff.ignoreMetadata')) {
					this._disposeMetadata();
				} else {
					this.cell.metadataStatusHeight = 25;
					this._buildMetadata();
					this.updateMetadataRendering();
					metadataLayoutChange = true;
				}
			}

			if (e.affectsConfiguration('notebook.diff.ignoreOutputs')) {
				this._outputLocalDisposable.clear();
				if (this.configurationService.getValue('notebook.diff.ignoreOutputs') || this.notebookEditor.textModel?.transientOptions.transientOutputs) {
					this._disposeOutput();
				} else {
					this.cell.outputStatusHeight = 25;
					this._buildOutput();
					outputLayoutChange = true;
				}
			}

			if (metadataLayoutChange || outputLayoutChange) {
				this.layout({ metadataHeight: metadataLayoutChange, outputTotalHeight: outputLayoutChange });
			}
		}));
	}

	override updateSourceEditor(): void {
		this._cellHeaderContainer = this.templateData.cellHeaderContainer;
		this._cellHeaderContainer.style.display = 'flex';
		this._cellHeaderContainer.innerText = '';
		this._editorContainer = this.templateData.editorContainer;
		this._editorContainer.classList.add('diff');

		const renderSourceEditor = () => {
			if (this.cell.cellFoldingState === PropertyFoldingState.Collapsed) {
				this._editorContainer.style.display = 'none';
				this.cell.editorHeight = 0;
				return;
			}

			const lineCount = this.nestedCellViewModel.textModel.textBuffer.getLineCount();
			const lineHeight = this.notebookEditor.getLayoutInfo().fontInfo.lineHeight || 17;
			const editorHeight = lineCount * lineHeight + fixedEditorPadding.top + fixedEditorPadding.bottom;

			this._editorContainer.style.height = `${editorHeight}px`;
			this._editorContainer.style.display = 'block';

			if (this._editor) {
				const contentHeight = this._editor.getContentHeight();
				if (contentHeight >= 0) {
					this.cell.editorHeight = contentHeight;
				}
				return;
			}

			this._editor = this.templateData.sourceEditor;
			this._editor.layout(
				{
					width: (this.notebookEditor.getLayoutInfo().width - 2 * DIFF_CELL_MARGIN) / 2 - 18,
					height: editorHeight
				}
			);
			this._editor.updateOptions({ readOnly: this.readonly });
			this.cell.editorHeight = editorHeight;

			this._register(this._editor.onDidContentSizeChange((e) => {
				if (this.cell.cellFoldingState === PropertyFoldingState.Expanded && e.contentHeightChanged && this.cell.layoutInfo.editorHeight !== e.contentHeight) {
					this.cell.editorHeight = e.contentHeight;
				}
			}));
			this._initializeSourceDiffEditor(this.nestedCellViewModel);
		};

		this._cellHeader = this._register(this.instantiationService.createInstance(
			PropertyHeader,
			this.cell,
			this._cellHeaderContainer,
			this.notebookEditor,
			{
				updateInfoRendering: () => renderSourceEditor(),
				checkIfModified: (_) => ({ reason: undefined }),
				getFoldingState: (cell) => cell.cellFoldingState,
				updateFoldingState: (cell, state) => cell.cellFoldingState = state,
				unChangedLabel: 'Input',
				changedLabel: 'Input',
				prefix: 'input',
				menuId: MenuId.NotebookDiffCellInputTitle
			}
		));
		this._cellHeader.buildHeader();
		renderSourceEditor();

		this._initializeSourceDiffEditor(this.nestedCellViewModel);
	}
	protected calculateDiagonalFillHeight() {
		return this.cell.layoutInfo.cellStatusHeight + this.cell.layoutInfo.editorHeight + this.cell.layoutInfo.editorMargin + this.cell.layoutInfo.metadataStatusHeight + this.cell.layoutInfo.metadataHeight + this.cell.layoutInfo.outputTotalHeight + this.cell.layoutInfo.outputStatusHeight;
	}

	private async _initializeSourceDiffEditor(modifiedCell: DiffNestedCellViewModel) {
		const modifiedRef = await this.textModelService.createModelReference(modifiedCell.uri);

		if (this._isDisposed) {
			return;
		}

		const modifiedTextModel = modifiedRef.object.textEditorModel;
		this._register(modifiedRef);

		this._editor!.setModel(modifiedTextModel);

		const editorViewState = this.cell.getSourceEditorViewState() as editorCommon.IDiffEditorViewState | null;
		if (editorViewState) {
			this._editor!.restoreViewState(editorViewState);
		}

		const contentHeight = this._editor!.getContentHeight();
		this.cell.editorHeight = contentHeight;
		const height = `${this.calculateDiagonalFillHeight()}px`;
		if (this._diagonalFill!.style.height !== height) {
			this._diagonalFill!.style.height = height;
		}
	}

	_disposeMetadata() {
		this.cell.metadataStatusHeight = 0;
		this.cell.metadataHeight = 0;
		this.templateData.cellHeaderContainer.style.display = 'none';
		this.templateData.metadataHeaderContainer.style.display = 'none';
		this.templateData.metadataInfoContainer.style.display = 'none';
		this._metadataEditor = undefined;
	}

	_buildMetadata() {
		this._metadataHeaderContainer = this.templateData.metadataHeaderContainer;
		this._metadataInfoContainer = this.templateData.metadataInfoContainer;
		this._metadataHeaderContainer.style.display = 'flex';
		this._metadataInfoContainer.style.display = 'block';
		this._metadataHeaderContainer.innerText = '';
		this._metadataInfoContainer.innerText = '';

		this._metadataHeader = this.instantiationService.createInstance(
			PropertyHeader,
			this.cell,
			this._metadataHeaderContainer,
			this.notebookEditor,
			{
				updateInfoRendering: this.updateMetadataRendering.bind(this),
				checkIfModified: (cell) => {
					return cell.checkMetadataIfModified();
				},
				getFoldingState: (cell) => {
					return cell.metadataFoldingState;
				},
				updateFoldingState: (cell, state) => {
					cell.metadataFoldingState = state;
				},
				unChangedLabel: 'Metadata',
				changedLabel: 'Metadata changed',
				prefix: 'metadata',
				menuId: MenuId.NotebookDiffCellMetadataTitle
			}
		);
		this._metadataLocalDisposable.add(this._metadataHeader);
		this._metadataHeader.buildHeader();
	}

	_buildOutput() {
		this.templateData.outputHeaderContainer.style.display = 'flex';
		this.templateData.outputInfoContainer.style.display = 'block';

		this._outputHeaderContainer = this.templateData.outputHeaderContainer;
		this._outputInfoContainer = this.templateData.outputInfoContainer;

		this._outputHeaderContainer.innerText = '';
		this._outputInfoContainer.innerText = '';

		this._outputHeader = this.instantiationService.createInstance(
			PropertyHeader,
			this.cell,
			this._outputHeaderContainer,
			this.notebookEditor,
			{
				updateInfoRendering: this.updateOutputRendering.bind(this),
				checkIfModified: (cell) => {
					return cell.checkIfOutputsModified();
				},
				getFoldingState: (cell) => {
					return cell.outputFoldingState;
				},
				updateFoldingState: (cell, state) => {
					cell.outputFoldingState = state;
				},
				unChangedLabel: 'Outputs',
				changedLabel: 'Outputs changed',
				prefix: 'output',
				menuId: MenuId.NotebookDiffCellOutputsTitle
			}
		);
		this._outputLocalDisposable.add(this._outputHeader);
		this._outputHeader.buildHeader();
	}

	_disposeOutput() {
		this._hideOutputsRaw();
		this._hideOutputsRenderer();
		this._hideOutputsEmptyView();

		this.cell.rawOutputHeight = 0;
		this.cell.outputStatusHeight = 0;
		this.templateData.outputHeaderContainer.style.display = 'none';
		this.templateData.outputInfoContainer.style.display = 'none';
		this._outputViewContainer = undefined;
	}
}
export class DeletedElement extends SingleSideDiffElement {
	constructor(
		notebookEditor: INotebookTextDiffEditor,
		cell: SingleSideDiffElementViewModel,
		templateData: CellDiffSingleSideRenderTemplate,
		@ILanguageService languageService: ILanguageService,
		@IModelService modelService: IModelService,
		@ITextModelService textModelService: ITextModelService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IKeybindingService keybindingService: IKeybindingService,
		@INotificationService notificationService: INotificationService,
		@IMenuService menuService: IMenuService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IConfigurationService configurationService: IConfigurationService,
		@ITextResourceConfigurationService textConfigurationService: ITextResourceConfigurationService,
	) {
		super(notebookEditor, cell, templateData, 'left', instantiationService, languageService, modelService, textModelService, contextMenuService, keybindingService, notificationService, menuService, contextKeyService, configurationService, textConfigurationService);
	}

	get nestedCellViewModel() {
		return this.cell.original!;
	}
	get readonly() {
		return true;
	}

	styleContainer(container: HTMLElement) {
		container.classList.remove('inserted');
		container.classList.add('removed');
	}

	layout(state: IDiffElementLayoutState) {
		DOM.scheduleAtNextAnimationFrame(DOM.getWindow(this._diffEditorContainer), () => {
			if (state.editorHeight || state.outerWidth) {
				this._editorContainer.style.height = `${this.cell.layoutInfo.editorHeight}px`;
				this._editor.layout({
					width: this.cell.getComputedCellContainerWidth(this.notebookEditor.getLayoutInfo(), false, false),
					height: this.cell.layoutInfo.editorHeight
				});
			}

			if (state.outerWidth && this._editor) {
				this._editorContainer.style.height = `${this.cell.layoutInfo.editorHeight}px`;
				this._editor.layout();
			}

			if (state.metadataHeight || state.outerWidth) {
				this._metadataEditor?.layout({
					width: this.cell.getComputedCellContainerWidth(this.notebookEditor.getLayoutInfo(), false, false),
					height: this.cell.layoutInfo.metadataHeight
				});
			}

			if (state.outputTotalHeight || state.outerWidth) {
				this._outputEditor?.layout({
					width: this.cell.getComputedCellContainerWidth(this.notebookEditor.getLayoutInfo(), false, false),
					height: this.cell.layoutInfo.outputTotalHeight
				});
			}

			if (this._diagonalFill) {
				this._diagonalFill.style.height = `${this.calculateDiagonalFillHeight()}px`;
			}

			this.layoutNotebookCell();
		});
	}


	_buildOutputRendererContainer() {
		if (!this._outputViewContainer) {
			this._outputViewContainer = DOM.append(this._outputInfoContainer, DOM.$('.output-view-container'));
			this._outputEmptyElement = DOM.append(this._outputViewContainer, DOM.$('.output-empty-view'));
			const span = DOM.append(this._outputEmptyElement, DOM.$('span'));
			span.innerText = 'No outputs to render';

			if (this.cell.original!.outputs.length === 0) {
				this._outputEmptyElement.style.display = 'block';
			} else {
				this._outputEmptyElement.style.display = 'none';
			}

			this.cell.layoutChange();

			this._outputLeftView = this.instantiationService.createInstance(OutputContainer, this.notebookEditor, this.notebookEditor.textModel!, this.cell, this.cell.original!, DiffSide.Original, this._outputViewContainer);
			this._register(this._outputLeftView);
			this._outputLeftView.render();

			const removedOutputRenderListener = this.notebookEditor.onDidDynamicOutputRendered(e => {
				if (e.cell.uri.toString() === this.cell.original!.uri.toString()) {
					this.notebookEditor.deltaCellOutputContainerClassNames(DiffSide.Original, this.cell.original!.id, ['nb-cellDeleted'], []);
					removedOutputRenderListener.dispose();
				}
			});

			this._register(removedOutputRenderListener);
		}

		this._outputViewContainer.style.display = 'block';
	}

	_decorate() {
		this.notebookEditor.deltaCellOutputContainerClassNames(DiffSide.Original, this.cell.original!.id, ['nb-cellDeleted'], []);
	}

	_showOutputsRenderer() {
		if (this._outputViewContainer) {
			this._outputViewContainer.style.display = 'block';

			this._outputLeftView?.showOutputs();
			this._decorate();
		}
	}

	_hideOutputsRenderer() {
		if (this._outputViewContainer) {
			this._outputViewContainer.style.display = 'none';

			this._outputLeftView?.hideOutputs();
		}
	}

	override dispose() {
		if (this._editor) {
			this.cell.saveSpirceEditorViewState(this._editor.saveViewState());
		}

		super.dispose();
	}
}

export class InsertElement extends SingleSideDiffElement {
	constructor(
		notebookEditor: INotebookTextDiffEditor,
		cell: SingleSideDiffElementViewModel,
		templateData: CellDiffSingleSideRenderTemplate,
		@IInstantiationService instantiationService: IInstantiationService,
		@ILanguageService languageService: ILanguageService,
		@IModelService modelService: IModelService,
		@ITextModelService textModelService: ITextModelService,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IKeybindingService keybindingService: IKeybindingService,
		@INotificationService notificationService: INotificationService,
		@IMenuService menuService: IMenuService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IConfigurationService configurationService: IConfigurationService,
		@ITextResourceConfigurationService textConfigurationService: ITextResourceConfigurationService,
	) {
		super(notebookEditor, cell, templateData, 'right', instantiationService, languageService, modelService, textModelService, contextMenuService, keybindingService, notificationService, menuService, contextKeyService, configurationService, textConfigurationService);
	}
	get nestedCellViewModel() {
		return this.cell.modified!;
	}
	get readonly() {
		return false;
	}

	styleContainer(container: HTMLElement): void {
		container.classList.remove('removed');
		container.classList.add('inserted');
	}

	_buildOutputRendererContainer() {
		if (!this._outputViewContainer) {
			this._outputViewContainer = DOM.append(this._outputInfoContainer, DOM.$('.output-view-container'));
			this._outputEmptyElement = DOM.append(this._outputViewContainer, DOM.$('.output-empty-view'));
			this._outputEmptyElement.innerText = 'No outputs to render';

			if (this.cell.modified!.outputs.length === 0) {
				this._outputEmptyElement.style.display = 'block';
			} else {
				this._outputEmptyElement.style.display = 'none';
			}

			this.cell.layoutChange();

			this._outputRightView = this.instantiationService.createInstance(OutputContainer, this.notebookEditor, this.notebookEditor.textModel!, this.cell, this.cell.modified!, DiffSide.Modified, this._outputViewContainer);
			this._register(this._outputRightView);
			this._outputRightView.render();

			const insertOutputRenderListener = this.notebookEditor.onDidDynamicOutputRendered(e => {
				if (e.cell.uri.toString() === this.cell.modified!.uri.toString()) {
					this.notebookEditor.deltaCellOutputContainerClassNames(DiffSide.Modified, this.cell.modified!.id, ['nb-cellAdded'], []);
					insertOutputRenderListener.dispose();
				}
			});
			this._register(insertOutputRenderListener);
		}

		this._outputViewContainer.style.display = 'block';
	}

	_decorate() {
		this.notebookEditor.deltaCellOutputContainerClassNames(DiffSide.Modified, this.cell.modified!.id, ['nb-cellAdded'], []);
	}

	_showOutputsRenderer() {
		if (this._outputViewContainer) {
			this._outputViewContainer.style.display = 'block';
			this._outputRightView?.showOutputs();
			this._decorate();
		}
	}

	_hideOutputsRenderer() {
		if (this._outputViewContainer) {
			this._outputViewContainer.style.display = 'none';
			this._outputRightView?.hideOutputs();
		}
	}

	layout(state: IDiffElementLayoutState) {
		DOM.scheduleAtNextAnimationFrame(DOM.getWindow(this._diffEditorContainer), () => {
			if (state.editorHeight || state.outerWidth) {
				this._editorContainer.style.height = `${this.cell.layoutInfo.editorHeight}px`;
				this._editor.layout({
					width: this.cell.getComputedCellContainerWidth(this.notebookEditor.getLayoutInfo(), false, false),
					height: this.cell.layoutInfo.editorHeight
				});
			}

			if (state.outerWidth && this._editor) {
				this._editorContainer.style.height = `${this.cell.layoutInfo.editorHeight}px`;
				this._editor.layout();
			}

			if (state.metadataHeight || state.outerWidth) {
				this._metadataEditor?.layout({
					width: this.cell.getComputedCellContainerWidth(this.notebookEditor.getLayoutInfo(), false, true),
					height: this.cell.layoutInfo.metadataHeight
				});
			}

			if (state.outputTotalHeight || state.outerWidth) {
				this._outputEditor?.layout({
					width: this.cell.getComputedCellContainerWidth(this.notebookEditor.getLayoutInfo(), false, false),
					height: this.cell.layoutInfo.outputTotalHeight
				});
			}

			this.layoutNotebookCell();

			if (this._diagonalFill) {
				this._diagonalFill.style.height = `${this.calculateDiagonalFillHeight()}px`;
			}
		});
	}

	override dispose() {
		if (this._editor) {
			this.cell.saveSpirceEditorViewState(this._editor.saveViewState());
		}

		super.dispose();
	}
}

export class ModifiedElement extends AbstractElementRenderer {
	private _editor?: DiffEditorWidget;
	private _editorViewStateChanged: boolean;
	protected _toolbar!: ToolBar;
	protected _menu!: IMenu;

	override readonly cell: SideBySideDiffElementViewModel;
	override readonly templateData: CellDiffSideBySideRenderTemplate;

	constructor(
		notebookEditor: INotebookTextDiffEditor,
		cell: SideBySideDiffElementViewModel,
		templateData: CellDiffSideBySideRenderTemplate,
		@IInstantiationService instantiationService: IInstantiationService,
		@ILanguageService languageService: ILanguageService,
		@IModelService modelService: IModelService,
		@ITextModelService textModelService: ITextModelService,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IKeybindingService keybindingService: IKeybindingService,
		@INotificationService notificationService: INotificationService,
		@IMenuService menuService: IMenuService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IConfigurationService configurationService: IConfigurationService,
		@ITextResourceConfigurationService textConfigurationService: ITextResourceConfigurationService,
	) {
		super(notebookEditor, cell, templateData, 'full', instantiationService, languageService, modelService, textModelService, contextMenuService, keybindingService, notificationService, menuService, contextKeyService, configurationService, textConfigurationService);
		this.cell = cell;
		this.templateData = templateData;
		this._editorViewStateChanged = false;

		this.updateBorders();
	}

	init() { }
	styleContainer(container: HTMLElement): void {
		container.classList.remove('inserted', 'removed');
	}

	override buildBody(): void {
		super.buildBody();
		if (this.cell.displayIconToHideUnmodifiedCells) {
			this._register(this.templateData.marginOverlay.onAction(() => this.cell.hideUnchangedCells()));
			this.templateData.marginOverlay.show();
		} else {
			this.templateData.marginOverlay.hide();
		}
	}
	_disposeMetadata() {
		this.cell.metadataStatusHeight = 0;
		this.cell.metadataHeight = 0;
		this.templateData.metadataHeaderContainer.style.display = 'none';
		this.templateData.metadataInfoContainer.style.display = 'none';
		this._metadataEditor = undefined;
	}

	_buildMetadata() {
		this._metadataHeaderContainer = this.templateData.metadataHeaderContainer;
		this._metadataInfoContainer = this.templateData.metadataInfoContainer;
		this._metadataHeaderContainer.style.display = 'flex';
		this._metadataInfoContainer.style.display = 'block';

		this._metadataHeaderContainer.innerText = '';
		this._metadataInfoContainer.innerText = '';

		this._metadataHeader = this.instantiationService.createInstance(
			PropertyHeader,
			this.cell,
			this._metadataHeaderContainer,
			this.notebookEditor,
			{
				updateInfoRendering: this.updateMetadataRendering.bind(this),
				checkIfModified: (cell) => {
					return cell.checkMetadataIfModified();
				},
				getFoldingState: (cell) => {
					return cell.metadataFoldingState;
				},
				updateFoldingState: (cell, state) => {
					cell.metadataFoldingState = state;
				},
				unChangedLabel: 'Metadata',
				changedLabel: 'Metadata changed',
				prefix: 'metadata',
				menuId: MenuId.NotebookDiffCellMetadataTitle
			}
		);
		this._metadataLocalDisposable.add(this._metadataHeader);
		this._metadataHeader.buildHeader();
	}

	_disposeOutput() {
		this._hideOutputsRaw();
		this._hideOutputsRenderer();
		this._hideOutputsEmptyView();

		this.cell.rawOutputHeight = 0;
		this.cell.outputStatusHeight = 0;
		this.templateData.outputHeaderContainer.style.display = 'none';
		this.templateData.outputInfoContainer.style.display = 'none';
		this._outputViewContainer = undefined;
	}

	_buildOutput() {
		this.templateData.outputHeaderContainer.style.display = 'flex';
		this.templateData.outputInfoContainer.style.display = 'block';

		this._outputHeaderContainer = this.templateData.outputHeaderContainer;
		this._outputInfoContainer = this.templateData.outputInfoContainer;
		this._outputHeaderContainer.innerText = '';
		this._outputInfoContainer.innerText = '';

		if (this.cell.checkIfOutputsModified()) {
			this._outputInfoContainer.classList.add('modified');
		} else {
			this._outputInfoContainer.classList.remove('modified');
		}

		this._outputHeader = this.instantiationService.createInstance(
			PropertyHeader,
			this.cell,
			this._outputHeaderContainer,
			this.notebookEditor,
			{
				updateInfoRendering: this.updateOutputRendering.bind(this),
				checkIfModified: (cell) => {
					return cell.checkIfOutputsModified();
				},
				getFoldingState: (cell) => {
					return cell.outputFoldingState;
				},
				updateFoldingState: (cell, state) => {
					cell.outputFoldingState = state;
				},
				unChangedLabel: 'Outputs',
				changedLabel: 'Outputs changed',
				prefix: 'output',
				menuId: MenuId.NotebookDiffCellOutputsTitle
			}
		);
		this._outputLocalDisposable.add(this._outputHeader);
		this._outputHeader.buildHeader();
	}

	_buildOutputRendererContainer() {
		if (!this._outputViewContainer) {
			this._outputViewContainer = DOM.append(this._outputInfoContainer, DOM.$('.output-view-container'));
			this._outputEmptyElement = DOM.append(this._outputViewContainer, DOM.$('.output-empty-view'));
			this._outputEmptyElement.innerText = 'No outputs to render';

			if (!this.cell.checkIfOutputsModified() && this.cell.modified.outputs.length === 0) {
				this._outputEmptyElement.style.display = 'block';
			} else {
				this._outputEmptyElement.style.display = 'none';
			}

			this.cell.layoutChange();

			this._register(this.cell.modified.textModel.onDidChangeOutputs(() => {
				// currently we only allow outputs change to the modified cell
				if (!this.cell.checkIfOutputsModified() && this.cell.modified.outputs.length === 0) {
					this._outputEmptyElement!.style.display = 'block';
				} else {
					this._outputEmptyElement!.style.display = 'none';
				}
				this._decorate();
			}));

			this._outputLeftContainer = DOM.append(this._outputViewContainer, DOM.$('.output-view-container-left'));
			this._outputRightContainer = DOM.append(this._outputViewContainer, DOM.$('.output-view-container-right'));
			this._outputMetadataContainer = DOM.append(this._outputViewContainer, DOM.$('.output-view-container-metadata'));

			const outputModified = this.cell.checkIfOutputsModified();
			const outputMetadataChangeOnly = outputModified
				&& outputModified.kind === OutputComparison.Metadata
				&& this.cell.original.outputs.length === 1
				&& this.cell.modified.outputs.length === 1
				&& outputEqual(this.cell.original.outputs[0], this.cell.modified.outputs[0]) === OutputComparison.Metadata;

			if (outputModified && !outputMetadataChangeOnly) {
				const originalOutputRenderListener = this.notebookEditor.onDidDynamicOutputRendered(e => {
					if (e.cell.uri.toString() === this.cell.original.uri.toString() && this.cell.checkIfOutputsModified()) {
						this.notebookEditor.deltaCellOutputContainerClassNames(DiffSide.Original, this.cell.original.id, ['nb-cellDeleted'], []);
						originalOutputRenderListener.dispose();
					}
				});

				const modifiedOutputRenderListener = this.notebookEditor.onDidDynamicOutputRendered(e => {
					if (e.cell.uri.toString() === this.cell.modified.uri.toString() && this.cell.checkIfOutputsModified()) {
						this.notebookEditor.deltaCellOutputContainerClassNames(DiffSide.Modified, this.cell.modified.id, ['nb-cellAdded'], []);
						modifiedOutputRenderListener.dispose();
					}
				});

				this._register(originalOutputRenderListener);
				this._register(modifiedOutputRenderListener);
			}

			// We should use the original text model here
			this._outputLeftView = this.instantiationService.createInstance(OutputContainer, this.notebookEditor, this.notebookEditor.textModel!, this.cell, this.cell.original, DiffSide.Original, this._outputLeftContainer);
			this._outputLeftView.render();
			this._register(this._outputLeftView);
			this._outputRightView = this.instantiationService.createInstance(OutputContainer, this.notebookEditor, this.notebookEditor.textModel!, this.cell, this.cell.modified, DiffSide.Modified, this._outputRightContainer);
			this._outputRightView.render();
			this._register(this._outputRightView);

			if (outputModified && !outputMetadataChangeOnly) {
				this._decorate();
			}

			if (outputMetadataChangeOnly) {

				this._outputMetadataContainer.style.top = `${this.cell.layoutInfo.rawOutputHeight}px`;
				// single output, metadata change, let's render a diff editor for metadata
				this._outputMetadataEditor = this.instantiationService.createInstance(DiffEditorWidget, this._outputMetadataContainer, {
					...fixedDiffEditorOptions,
					overflowWidgetsDomNode: this.notebookEditor.getOverflowContainerDomNode(),
					readOnly: true,
					ignoreTrimWhitespace: false,
					automaticLayout: false,
					dimension: {
						height: OUTPUT_EDITOR_HEIGHT_MAGIC,
						width: this.cell.getComputedCellContainerWidth(this.notebookEditor.getLayoutInfo(), false, true)
					}
				}, {
					originalEditor: getOptimizedNestedCodeEditorWidgetOptions(),
					modifiedEditor: getOptimizedNestedCodeEditorWidgetOptions()
				});

				this._register(this._outputMetadataEditor);
				const originalOutputMetadataSource = JSON.stringify(this.cell.original.outputs[0].metadata ?? {}, undefined, '\t');
				const modifiedOutputMetadataSource = JSON.stringify(this.cell.modified.outputs[0].metadata ?? {}, undefined, '\t');

				const mode = this.languageService.createById('json');
				const originalModel = this.modelService.createModel(originalOutputMetadataSource, mode, undefined, true);
				const modifiedModel = this.modelService.createModel(modifiedOutputMetadataSource, mode, undefined, true);

				this._outputMetadataEditor.setModel({
					original: originalModel,
					modified: modifiedModel
				});

				this.cell.outputMetadataHeight = this._outputMetadataEditor.getContentHeight();

				this._register(this._outputMetadataEditor.onDidContentSizeChange((e) => {
					this.cell.outputMetadataHeight = e.contentHeight;
				}));
			}
		}

		this._outputViewContainer.style.display = 'block';
	}

	_decorate() {
		if (this.cell.checkIfOutputsModified()) {
			this.notebookEditor.deltaCellOutputContainerClassNames(DiffSide.Original, this.cell.original.id, ['nb-cellDeleted'], []);
			this.notebookEditor.deltaCellOutputContainerClassNames(DiffSide.Modified, this.cell.modified.id, ['nb-cellAdded'], []);
		} else {
			this.notebookEditor.deltaCellOutputContainerClassNames(DiffSide.Original, this.cell.original.id, [], ['nb-cellDeleted']);
			this.notebookEditor.deltaCellOutputContainerClassNames(DiffSide.Modified, this.cell.modified.id, [], ['nb-cellAdded']);
		}
	}

	_showOutputsRenderer() {
		if (this._outputViewContainer) {
			this._outputViewContainer.style.display = 'block';

			this._outputLeftView?.showOutputs();
			this._outputRightView?.showOutputs();
			this._outputMetadataEditor?.layout({
				width: this._editor?.getViewWidth() || this.cell.getComputedCellContainerWidth(this.notebookEditor.getLayoutInfo(), false, true),
				height: this.cell.layoutInfo.outputMetadataHeight
			});

			this._decorate();
		}
	}

	_hideOutputsRenderer() {
		if (this._outputViewContainer) {
			this._outputViewContainer.style.display = 'none';

			this._outputLeftView?.hideOutputs();
			this._outputRightView?.hideOutputs();
		}
	}

	updateSourceEditor(): void {
		this._cellHeaderContainer = this.templateData.cellHeaderContainer;
		this._cellHeaderContainer.style.display = 'flex';
		this._cellHeaderContainer.innerText = '';
		const modifiedCell = this.cell.modified;
		this._editorContainer = this.templateData.editorContainer;
		this._editorContainer.classList.add('diff');

		const renderSourceEditor = () => {
			if (this.cell.cellFoldingState === PropertyFoldingState.Collapsed) {
				this._editorContainer.style.display = 'none';
				this.cell.editorHeight = 0;
				return;
			}

			const lineCount = modifiedCell.textModel.textBuffer.getLineCount();
			const lineHeight = this.notebookEditor.getLayoutInfo().fontInfo.lineHeight || 17;
			const editorHeight = this.cell.layoutInfo.editorHeight !== 0 ? this.cell.layoutInfo.editorHeight : (lineCount * lineHeight) + fixedEditorPadding.top + fixedEditorPadding.bottom;

			this._editorContainer.style.height = `${editorHeight}px`;
			this._editorContainer.style.display = 'block';

			if (this._editor) {
				const contentHeight = this._editor.getContentHeight();
				if (contentHeight >= 0) {
					this.cell.editorHeight = contentHeight;
				}
				return;
			}

			this._editor = this.templateData.sourceEditor;
			// If there is only 1 line, then ensure we have the necessary padding to display the button for whitespaces.
			// E.g. assume we have a cell with 1 line and we add some whitespace,
			// Then diff editor displays the button `Show Whitespace Differences`, however with 12 paddings on the top, the
			// button can get cut off.
			if (lineCount === 1) {
				this._editor.updateOptions({
					padding: fixedEditorPaddingSingleLineCells
				});
			}
			this._editor.layout({
				width: this.notebookEditor.getLayoutInfo().width - 2 * DIFF_CELL_MARGIN,
				height: editorHeight
			});
			this._register(this._editor.onDidContentSizeChange((e) => {
				if (this.cell.cellFoldingState === PropertyFoldingState.Expanded && e.contentHeightChanged && this.cell.layoutInfo.editorHeight !== e.contentHeight) {
					this.cell.editorHeight = e.contentHeight;
				}
			}));
			this._initializeSourceDiffEditor();
		};

		this._cellHeader = this._register(this.instantiationService.createInstance(
			PropertyHeader,
			this.cell,
			this._cellHeaderContainer,
			this.notebookEditor,
			{
				updateInfoRendering: () => renderSourceEditor(),
				checkIfModified: (cell) => {
					return cell.modified?.textModel.getValue() !== cell.original?.textModel.getValue() ? { reason: undefined } : false;
				},
				getFoldingState: (cell) => cell.cellFoldingState,
				updateFoldingState: (cell, state) => cell.cellFoldingState = state,
				unChangedLabel: 'Input',
				changedLabel: 'Input changed',
				prefix: 'input',
				menuId: MenuId.NotebookDiffCellInputTitle
			}
		));
		this._cellHeader.buildHeader();
		renderSourceEditor();

		const scopedContextKeyService = this.contextKeyService.createScoped(this.templateData.inputToolbarContainer);
		this._register(scopedContextKeyService);
		const inputChanged = NOTEBOOK_DIFF_CELL_INPUT.bindTo(scopedContextKeyService);
		inputChanged.set(this.cell.modified.textModel.getValue() !== this.cell.original.textModel.getValue());

		const ignoreWhitespace = NOTEBOOK_DIFF_CELL_IGNORE_WHITESPACE.bindTo(scopedContextKeyService);
		const ignore = this.textConfigurationService.getValue<boolean>(this.cell.modified.uri, 'diffEditor.ignoreTrimWhitespace');
		ignoreWhitespace.set(ignore);

		this._toolbar = this.templateData.toolbar;

		this._toolbar.context = {
			cell: this.cell
		};

		const refreshToolbar = () => {
			const ignore = this.textConfigurationService.getValue<boolean>(this.cell.modified.uri, 'diffEditor.ignoreTrimWhitespace');
			ignoreWhitespace.set(ignore);
			const hasChanges = this.cell.modified.textModel.getValue() !== this.cell.original.textModel.getValue();
			inputChanged.set(hasChanges);

			if (hasChanges) {
				const actions: IAction[] = [];
				const menu = this.menuService.getMenuActions(MenuId.NotebookDiffCellInputTitle, scopedContextKeyService, { shouldForwardArgs: true });
				createAndFillInActionBarActions(menu, actions);
				this._toolbar.setActions(actions);
			} else {
				this._toolbar.setActions([]);
			}
		};

		this._register(this.cell.modified.textModel.onDidChangeContent(() => refreshToolbar()));
		this._register(this.textConfigurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(this.cell.modified.uri, 'diffEditor') &&
				e.affectedKeys.has('diffEditor.ignoreTrimWhitespace')) {
				refreshToolbar();
			}
		}));
		refreshToolbar();
	}

	private async _initializeSourceDiffEditor() {
		const originalCell = this.cell.original;
		const modifiedCell = this.cell.modified;

		const originalRef = await this.textModelService.createModelReference(originalCell.uri);
		const modifiedRef = await this.textModelService.createModelReference(modifiedCell.uri);

		if (this._isDisposed) {
			return;
		}

		const textModel = originalRef.object.textEditorModel;
		const modifiedTextModel = modifiedRef.object.textEditorModel;
		this._register(originalRef);
		this._register(modifiedRef);

		this._editor!.setModel({
			original: textModel,
			modified: modifiedTextModel,
		});

		const handleViewStateChange = () => {
			this._editorViewStateChanged = true;
		};

		const handleScrollChange = (e: editorCommon.IScrollEvent) => {
			if (e.scrollTopChanged || e.scrollLeftChanged) {
				this._editorViewStateChanged = true;
			}
		};

		this.updateEditorOptionsForWhitespace();
		this._register(this._editor!.getOriginalEditor().onDidChangeCursorSelection(handleViewStateChange));
		this._register(this._editor!.getOriginalEditor().onDidScrollChange(handleScrollChange));
		this._register(this._editor!.getModifiedEditor().onDidChangeCursorSelection(handleViewStateChange));
		this._register(this._editor!.getModifiedEditor().onDidScrollChange(handleScrollChange));

		const editorViewState = this.cell.getSourceEditorViewState() as editorCommon.IDiffEditorViewState | null;
		if (editorViewState) {
			this._editor!.restoreViewState(editorViewState);
		}

		const contentHeight = this._editor!.getContentHeight();
		this.cell.editorHeight = contentHeight;
	}
	private updateEditorOptionsForWhitespace() {
		const editor = this._editor;
		if (!editor) {
			return;
		}
		const uri = editor.getModel()?.modified.uri || editor.getModel()?.original.uri;
		if (!uri) {
			return;
		}
		const ignoreTrimWhitespace = this.textConfigurationService.getValue<boolean>(uri, 'diffEditor.ignoreTrimWhitespace');
		editor.updateOptions({ ignoreTrimWhitespace });

		this._register(this.textConfigurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(uri, 'diffEditor') &&
				e.affectedKeys.has('diffEditor.ignoreTrimWhitespace')) {
				const ignoreTrimWhitespace = this.textConfigurationService.getValue<boolean>(uri, 'diffEditor.ignoreTrimWhitespace');
				editor.updateOptions({ ignoreTrimWhitespace });
			}
		}));
	}
	layout(state: IDiffElementLayoutState) {
		DOM.scheduleAtNextAnimationFrame(DOM.getWindow(this._diffEditorContainer), () => {
			if (state.editorHeight && this._editor) {
				this._editorContainer.style.height = `${this.cell.layoutInfo.editorHeight}px`;
				this._editor.layout({
					width: this._editor!.getViewWidth(),
					height: this.cell.layoutInfo.editorHeight
				});
			}

			if (state.outerWidth && this._editor) {
				this._editorContainer.style.height = `${this.cell.layoutInfo.editorHeight}px`;
				this._editor.layout();
			}

			if (state.metadataHeight || state.outerWidth) {
				if (this._metadataEditorContainer) {
					this._metadataEditorContainer.style.height = `${this.cell.layoutInfo.metadataHeight}px`;
					this._metadataEditor?.layout({
						width: this._editor?.getViewWidth() || this.cell.getComputedCellContainerWidth(this.notebookEditor.getLayoutInfo(), false, true),
						height: this.cell.layoutInfo.metadataHeight
					});
				}
			}

			if (state.outputTotalHeight || state.outerWidth) {
				if (this._outputEditorContainer) {
					this._outputEditorContainer.style.height = `${this.cell.layoutInfo.outputTotalHeight}px`;
					this._outputEditor?.layout({
						width: this._editor?.getViewWidth() || this.cell.getComputedCellContainerWidth(this.notebookEditor.getLayoutInfo(), false, true),
						height: this.cell.layoutInfo.outputTotalHeight
					});
				}

				if (this._outputMetadataContainer) {
					this._outputMetadataContainer.style.height = `${this.cell.layoutInfo.outputMetadataHeight}px`;
					this._outputMetadataContainer.style.top = `${this.cell.layoutInfo.outputTotalHeight - this.cell.layoutInfo.outputMetadataHeight}px`;
					this._outputMetadataEditor?.layout({
						width: this._editor?.getViewWidth() || this.cell.getComputedCellContainerWidth(this.notebookEditor.getLayoutInfo(), false, true),
						height: this.cell.layoutInfo.outputMetadataHeight
					});
				}
			}

			this.layoutNotebookCell();
		});
	}

	override dispose() {
		// The editor isn't disposed yet, it can be re-used.
		// However the model can be disposed before the editor & that causes issues.
		if (this._editor) {
			this._editor.setModel(null);
		}

		if (this._editor && this._editorViewStateChanged) {
			this.cell.saveSpirceEditorViewState(this._editor.saveViewState());
		}

		super.dispose();
	}
}


export class CollapsedCellOverlayWidget extends Disposable implements IDiffCellMarginOverlay {
	private readonly _nodes = DOM.h('div.diff-hidden-cells', [
		DOM.h('div.center@content', { style: { display: 'flex' } }, [
			DOM.$('a', {
				title: localize('showUnchangedCells', 'Show Unchanged Cells'),
				role: 'button',
				onclick: () => { this._action.fire(); }
			},
				...renderLabelWithIcons('$(unfold)'))]
		),
	]);

	private readonly _action = this._register(new Emitter<void>());
	public readonly onAction = this._action.event;
	constructor(
		private readonly container: HTMLElement
	) {
		super();

		this._nodes.root.style.display = 'none';
		container.appendChild(this._nodes.root);
	}

	public show() {
		this._nodes.root.style.display = 'block';
	}

	public hide() {
		this._nodes.root.style.display = 'none';
	}

	public override dispose() {
		this.hide();
		this.container.removeChild(this._nodes.root);
		DOM.reset(this._nodes.root);
		super.dispose();
	}
}

export class UnchangedCellOverlayWidget extends Disposable implements IDiffCellMarginOverlay {
	private readonly _nodes = DOM.h('div.diff-hidden-cells', [
		DOM.h('div.center@content', { style: { display: 'flex' } }, [
			DOM.$('a', {
				title: localize('hideUnchangedCells', 'Hide Unchanged Cells'),
				role: 'button',
				onclick: () => { this._action.fire(); }
			},
				...renderLabelWithIcons('$(fold)')
			),
		]
		),
	]);

	private readonly _action = this._register(new Emitter<void>());
	public readonly onAction = this._action.event;
	constructor(
		private readonly container: HTMLElement
	) {
		super();

		this._nodes.root.style.display = 'none';
		container.appendChild(this._nodes.root);
	}

	public show() {
		this._nodes.root.style.display = 'block';
	}

	public hide() {
		this._nodes.root.style.display = 'none';
	}
	public override dispose() {
		this.hide();
		this.container.removeChild(this._nodes.root);
		DOM.reset(this._nodes.root);
		super.dispose();
	}
}
