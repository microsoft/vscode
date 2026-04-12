/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
import * as DOM from '../../../../../base/browser/dom.js';
import { Disposable, DisposableStore } from '../../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../../base/common/network.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { getFormattedOutputJSON, outputEqual, OUTPUT_EDITOR_HEIGHT_MAGIC, PropertyFoldingState, SideBySideDiffElementViewModel, NotebookDocumentMetadataViewModel } from './diffElementViewModel.js';
import { DiffSide, DIFF_CELL_MARGIN, NOTEBOOK_DIFF_CELL_INPUT, NOTEBOOK_DIFF_CELL_PROPERTY, NOTEBOOK_DIFF_CELL_PROPERTY_EXPANDED, NOTEBOOK_DIFF_CELL_IGNORE_WHITESPACE, NOTEBOOK_DIFF_METADATA } from './notebookDiffEditorBrowser.js';
import { CodeEditorWidget } from '../../../../../editor/browser/widget/codeEditor/codeEditorWidget.js';
import { IModelService } from '../../../../../editor/common/services/model.js';
import { ILanguageService } from '../../../../../editor/common/languages/language.js';
import { CellUri } from '../../common/notebookCommon.js';
import { IContextMenuService } from '../../../../../platform/contextview/browser/contextView.js';
import { IMenuService, MenuId, MenuItemAction } from '../../../../../platform/actions/common/actions.js';
import { IKeybindingService } from '../../../../../platform/keybinding/common/keybinding.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { getFlatActionBarActions } from '../../../../../platform/actions/browser/menuEntryActionViewItem.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { CodiconActionViewItem } from '../view/cellParts/cellActionView.js';
import { collapsedIcon, expandedIcon } from '../notebookIcons.js';
import { OutputContainer } from './diffElementOutputs.js';
import { EditorExtensionsRegistry } from '../../../../../editor/browser/editorExtensions.js';
import { ContextMenuController } from '../../../../../editor/contrib/contextmenu/browser/contextmenu.js';
import { SnippetController2 } from '../../../../../editor/contrib/snippet/browser/snippetController2.js';
import { SuggestController } from '../../../../../editor/contrib/suggest/browser/suggestController.js';
import { MenuPreventer } from '../../../codeEditor/browser/menuPreventer.js';
import { SelectionClipboardContributionID } from '../../../codeEditor/browser/selectionClipboard.js';
import { TabCompletionController } from '../../../snippets/browser/tabCompletion.js';
import { renderIcon, renderLabelWithIcons } from '../../../../../base/browser/ui/iconLabel/iconLabels.js';
import { ITextModelService } from '../../../../../editor/common/services/resolverService.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IThemeService } from '../../../../../platform/theme/common/themeService.js';
import { WorkbenchToolBar } from '../../../../../platform/actions/browser/toolbar.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { fixedDiffEditorOptions, fixedEditorOptions, getEditorPadding } from './diffCellEditorOptions.js';
import { IAccessibilityService } from '../../../../../platform/accessibility/common/accessibility.js';
import { DiffEditorWidget } from '../../../../../editor/browser/widget/diffEditor/diffEditorWidget.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { localize } from '../../../../../nls.js';
import { Emitter } from '../../../../../base/common/event.js';
import { ITextResourceConfigurationService } from '../../../../../editor/common/services/textResourceConfiguration.js';
import { getFormattedMetadataJSON } from '../../common/model/notebookCellTextModel.js';
import { getUnchangedRegionSettings } from './unchangedEditorRegions.js';
export function getOptimizedNestedCodeEditorWidgetOptions() {
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
    constructor(placeholder, templateData) {
        super();
        templateData.body.classList.remove('left', 'right', 'full');
        const text = (placeholder.hiddenCells.length === 1) ?
            localize('hiddenCell', '{0} hidden cell', placeholder.hiddenCells.length) :
            localize('hiddenCells', '{0} hidden cells', placeholder.hiddenCells.length);
        templateData.placeholder.innerText = text;
        this._register(DOM.addDisposableListener(templateData.placeholder, 'dblclick', (e) => {
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
let PropertyHeader = class PropertyHeader extends Disposable {
    constructor(cell, propertyHeaderContainer, notebookEditor, accessor, contextMenuService, keybindingService, commandService, notificationService, menuService, contextKeyService, themeService, telemetryService, accessibilityService) {
        super();
        this.cell = cell;
        this.propertyHeaderContainer = propertyHeaderContainer;
        this.notebookEditor = notebookEditor;
        this.accessor = accessor;
        this.contextMenuService = contextMenuService;
        this.keybindingService = keybindingService;
        this.commandService = commandService;
        this.notificationService = notificationService;
        this.menuService = menuService;
        this.contextKeyService = contextKeyService;
        this.themeService = themeService;
        this.telemetryService = telemetryService;
        this.accessibilityService = accessibilityService;
    }
    buildHeader() {
        this._foldingIndicator = DOM.append(this.propertyHeaderContainer, DOM.$('.property-folding-indicator'));
        this._foldingIndicator.classList.add(this.accessor.prefix);
        const metadataStatus = DOM.append(this.propertyHeaderContainer, DOM.$('div.property-status'));
        this._statusSpan = DOM.append(metadataStatus, DOM.$('span'));
        this._description = DOM.append(metadataStatus, DOM.$('span.property-description'));
        const cellToolbarContainer = DOM.append(this.propertyHeaderContainer, DOM.$('div.property-toolbar'));
        this._toolbar = this._register(new WorkbenchToolBar(cellToolbarContainer, {
            actionViewItemProvider: (action, options) => {
                if (action instanceof MenuItemAction) {
                    const item = new CodiconActionViewItem(action, { hoverDelegate: options.hoverDelegate }, this.keybindingService, this.notificationService, this.contextKeyService, this.themeService, this.contextMenuService, this.accessibilityService);
                    return item;
                }
                return undefined;
            }
        }, this.menuService, this.contextKeyService, this.contextMenuService, this.keybindingService, this.commandService, this.telemetryService));
        this._toolbar.context = this.cell;
        const scopedContextKeyService = this.contextKeyService.createScoped(cellToolbarContainer);
        this._register(scopedContextKeyService);
        this._propertyChanged = NOTEBOOK_DIFF_CELL_PROPERTY.bindTo(scopedContextKeyService);
        this._propertyExpanded = NOTEBOOK_DIFF_CELL_PROPERTY_EXPANDED.bindTo(scopedContextKeyService);
        this._menu = this._register(this.menuService.createMenu(this.accessor.menuId, scopedContextKeyService));
        this._register(this._menu.onDidChange(() => this.updateMenu()));
        this._register(this.notebookEditor.onMouseUp(e => {
            if (!e.event.target || e.target !== this.cell) {
                return;
            }
            const target = e.event.target;
            if (target === this.propertyHeaderContainer ||
                target === this._foldingIndicator || this._foldingIndicator.contains(target) ||
                target === metadataStatus || metadataStatus.contains(target)) {
                const oldFoldingState = this.accessor.getFoldingState();
                this.accessor.updateFoldingState(oldFoldingState === PropertyFoldingState.Expanded ? PropertyFoldingState.Collapsed : PropertyFoldingState.Expanded);
                this._updateFoldingIcon();
                this.accessor.updateInfoRendering(this.cell.renderOutput);
            }
        }));
        this.refresh();
        this.accessor.updateInfoRendering(this.cell.renderOutput);
    }
    refresh() {
        this.updateMenu();
        this._updateFoldingIcon();
        const metadataChanged = this.accessor.checkIfModified();
        if (this._propertyChanged) {
            this._propertyChanged.set(!!metadataChanged);
        }
        if (metadataChanged) {
            this._statusSpan.textContent = this.accessor.changedLabel;
            this._statusSpan.style.fontWeight = 'bold';
            if (metadataChanged.reason) {
                this._description.textContent = metadataChanged.reason;
            }
            this.propertyHeaderContainer.classList.add('modified');
        }
        else {
            this._statusSpan.textContent = this.accessor.unChangedLabel;
            this._statusSpan.style.fontWeight = 'normal';
            this._description.textContent = '';
            this.propertyHeaderContainer.classList.remove('modified');
        }
    }
    updateMenu() {
        const metadataChanged = this.accessor.checkIfModified();
        if (metadataChanged) {
            const actions = getFlatActionBarActions(this._menu.getActions({ shouldForwardArgs: true }));
            this._toolbar.setActions(actions);
        }
        else {
            this._toolbar.setActions([]);
        }
    }
    _updateFoldingIcon() {
        if (this.accessor.getFoldingState() === PropertyFoldingState.Collapsed) {
            DOM.reset(this._foldingIndicator, renderIcon(collapsedIcon));
            this._propertyExpanded?.set(false);
        }
        else {
            DOM.reset(this._foldingIndicator, renderIcon(expandedIcon));
            this._propertyExpanded?.set(true);
        }
    }
};
PropertyHeader = __decorate([
    __param(4, IContextMenuService),
    __param(5, IKeybindingService),
    __param(6, ICommandService),
    __param(7, INotificationService),
    __param(8, IMenuService),
    __param(9, IContextKeyService),
    __param(10, IThemeService),
    __param(11, ITelemetryService),
    __param(12, IAccessibilityService)
], PropertyHeader);
let NotebookDocumentMetadataElement = class NotebookDocumentMetadataElement extends Disposable {
    constructor(notebookEditor, viewModel, templateData, instantiationService, textModelService, menuService, contextKeyService, textConfigurationService, configurationService) {
        super();
        this.notebookEditor = notebookEditor;
        this.viewModel = viewModel;
        this.templateData = templateData;
        this.instantiationService = instantiationService;
        this.textModelService = textModelService;
        this.menuService = menuService;
        this.contextKeyService = contextKeyService;
        this.textConfigurationService = textConfigurationService;
        this.configurationService = configurationService;
        this._editor = templateData.sourceEditor;
        this._cellHeaderContainer = this.templateData.cellHeaderContainer;
        this._editorContainer = this.templateData.editorContainer;
        this._diffEditorContainer = this.templateData.diffEditorContainer;
        this._editorViewStateChanged = false;
        // init
        this._register(viewModel.onDidLayoutChange(e => {
            this.layout(e);
            this.updateBorders();
        }));
        this.buildBody();
        this.updateBorders();
    }
    buildBody() {
        const body = this.templateData.body;
        body.classList.remove('full');
        body.classList.add('full');
        this.updateSourceEditor();
        if (this.viewModel instanceof NotebookDocumentMetadataViewModel) {
            this._register(this.viewModel.modifiedMetadata.onDidChange(e => {
                this._cellHeader.refresh();
            }));
        }
    }
    layoutNotebookCell() {
        this.notebookEditor.layoutNotebookCell(this.viewModel, this.viewModel.layoutInfo.totalHeight);
    }
    updateBorders() {
        this.templateData.leftBorder.style.height = `${this.viewModel.layoutInfo.totalHeight - 32}px`;
        this.templateData.rightBorder.style.height = `${this.viewModel.layoutInfo.totalHeight - 32}px`;
        this.templateData.bottomBorder.style.top = `${this.viewModel.layoutInfo.totalHeight - 32}px`;
    }
    updateSourceEditor() {
        this._cellHeaderContainer.style.display = 'flex';
        this._cellHeaderContainer.innerText = '';
        this._editorContainer.classList.add('diff');
        const updateSourceEditor = () => {
            if (this.viewModel.cellFoldingState === PropertyFoldingState.Collapsed) {
                this._editorContainer.style.display = 'none';
                this.viewModel.editorHeight = 0;
                return;
            }
            const lineHeight = this.notebookEditor.getLayoutInfo().fontInfo.lineHeight || 17;
            const editorHeight = this.viewModel.layoutInfo.editorHeight !== 0 ? this.viewModel.layoutInfo.editorHeight : this.viewModel.computeInputEditorHeight(lineHeight);
            this._editorContainer.style.height = `${editorHeight}px`;
            this._editorContainer.style.display = 'block';
            const contentHeight = this._editor.getContentHeight();
            if (contentHeight >= 0) {
                this.viewModel.editorHeight = contentHeight;
            }
            return editorHeight;
        };
        const renderSourceEditor = () => {
            const editorHeight = updateSourceEditor();
            if (!editorHeight) {
                return;
            }
            // If there is only 1 line, then ensure we have the necessary padding to display the button for whitespaces.
            // E.g. assume we have a cell with 1 line and we add some whitespace,
            // Then diff editor displays the button `Show Whitespace Differences`, however with 12 paddings on the top, the
            // button can get cut off.
            const lineCount = this.viewModel.modifiedMetadata.textBuffer.getLineCount();
            const options = {
                padding: getEditorPadding(lineCount)
            };
            const unchangedRegions = this._register(getUnchangedRegionSettings(this.configurationService));
            if (unchangedRegions.options.enabled) {
                options.hideUnchangedRegions = unchangedRegions.options;
            }
            this._editor.updateOptions(options);
            this._register(unchangedRegions.onDidChangeEnablement(() => {
                options.hideUnchangedRegions = unchangedRegions.options;
                this._editor.updateOptions(options);
            }));
            this._editor.layout({
                width: this.notebookEditor.getLayoutInfo().width - 2 * DIFF_CELL_MARGIN,
                height: editorHeight
            });
            this._register(this._editor.onDidContentSizeChange((e) => {
                if (this.viewModel.cellFoldingState === PropertyFoldingState.Expanded && e.contentHeightChanged && this.viewModel.layoutInfo.editorHeight !== e.contentHeight) {
                    this.viewModel.editorHeight = e.contentHeight;
                }
            }));
            this._initializeSourceDiffEditor();
        };
        this._cellHeader = this._register(this.instantiationService.createInstance(PropertyHeader, this.viewModel, this._cellHeaderContainer, this.notebookEditor, {
            updateInfoRendering: () => renderSourceEditor(),
            checkIfModified: () => {
                return this.viewModel.originalMetadata.getHash() !== this.viewModel.modifiedMetadata.getHash() ? { reason: undefined } : false;
            },
            getFoldingState: () => this.viewModel.cellFoldingState,
            updateFoldingState: (state) => this.viewModel.cellFoldingState = state,
            unChangedLabel: 'Notebook Metadata',
            changedLabel: 'Notebook Metadata changed',
            prefix: 'metadata',
            menuId: MenuId.NotebookDiffDocumentMetadata
        }));
        this._cellHeader.buildHeader();
        renderSourceEditor();
        const scopedContextKeyService = this.contextKeyService.createScoped(this.templateData.inputToolbarContainer);
        this._register(scopedContextKeyService);
        const inputChanged = NOTEBOOK_DIFF_METADATA.bindTo(scopedContextKeyService);
        inputChanged.set(this.viewModel.originalMetadata.getHash() !== this.viewModel.modifiedMetadata.getHash());
        this._toolbar = this.templateData.toolbar;
        this._toolbar.context = this.viewModel;
        const refreshToolbar = () => {
            const hasChanges = this.viewModel.originalMetadata.getHash() !== this.viewModel.modifiedMetadata.getHash();
            inputChanged.set(hasChanges);
            if (hasChanges) {
                const menu = this.menuService.getMenuActions(MenuId.NotebookDiffDocumentMetadata, scopedContextKeyService, { shouldForwardArgs: true });
                const actions = getFlatActionBarActions(menu);
                this._toolbar.setActions(actions);
            }
            else {
                this._toolbar.setActions([]);
            }
        };
        this._register(this.viewModel.modifiedMetadata.onDidChange(() => {
            refreshToolbar();
        }));
        refreshToolbar();
    }
    async _initializeSourceDiffEditor() {
        const [originalRef, modifiedRef] = await Promise.all([
            this.textModelService.createModelReference(this.viewModel.originalMetadata.uri),
            this.textModelService.createModelReference(this.viewModel.modifiedMetadata.uri)
        ]);
        if (this._store.isDisposed) {
            originalRef.dispose();
            modifiedRef.dispose();
            return;
        }
        this._register(originalRef);
        this._register(modifiedRef);
        const vm = this._register(this._editor.createViewModel({
            original: originalRef.object.textEditorModel,
            modified: modifiedRef.object.textEditorModel,
        }));
        // Reduces flicker (compute this before setting the model)
        // Else when the model is set, the height of the editor will be x, after diff is computed, then height will be y.
        // & that results in flicker.
        await vm.waitForDiff();
        this._editor.setModel(vm);
        const handleViewStateChange = () => {
            this._editorViewStateChanged = true;
        };
        const handleScrollChange = (e) => {
            if (e.scrollTopChanged || e.scrollLeftChanged) {
                this._editorViewStateChanged = true;
            }
        };
        this.updateEditorOptionsForWhitespace();
        this._register(this._editor.getOriginalEditor().onDidChangeCursorSelection(handleViewStateChange));
        this._register(this._editor.getOriginalEditor().onDidScrollChange(handleScrollChange));
        this._register(this._editor.getModifiedEditor().onDidChangeCursorSelection(handleViewStateChange));
        this._register(this._editor.getModifiedEditor().onDidScrollChange(handleScrollChange));
        const editorViewState = this.viewModel.getSourceEditorViewState();
        if (editorViewState) {
            this._editor.restoreViewState(editorViewState);
        }
        const contentHeight = this._editor.getContentHeight();
        this.viewModel.editorHeight = contentHeight;
    }
    updateEditorOptionsForWhitespace() {
        const editor = this._editor;
        const uri = editor.getModel()?.modified.uri || editor.getModel()?.original.uri;
        if (!uri) {
            return;
        }
        const ignoreTrimWhitespace = this.textConfigurationService.getValue(uri, 'diffEditor.ignoreTrimWhitespace');
        editor.updateOptions({ ignoreTrimWhitespace });
        this._register(this.textConfigurationService.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration(uri, 'diffEditor') &&
                e.affectedKeys.has('diffEditor.ignoreTrimWhitespace')) {
                const ignoreTrimWhitespace = this.textConfigurationService.getValue(uri, 'diffEditor.ignoreTrimWhitespace');
                editor.updateOptions({ ignoreTrimWhitespace });
            }
        }));
    }
    layout(state) {
        DOM.scheduleAtNextAnimationFrame(DOM.getWindow(this._diffEditorContainer), () => {
            if (state.editorHeight) {
                this._editorContainer.style.height = `${this.viewModel.layoutInfo.editorHeight}px`;
                this._editor.layout({
                    width: this._editor.getViewWidth(),
                    height: this.viewModel.layoutInfo.editorHeight
                });
            }
            if (state.outerWidth) {
                this._editorContainer.style.height = `${this.viewModel.layoutInfo.editorHeight}px`;
                this._editor.layout();
            }
            this.layoutNotebookCell();
        });
    }
    dispose() {
        this._editor.setModel(null);
        if (this._editorViewStateChanged) {
            this.viewModel.saveSpirceEditorViewState(this._editor.saveViewState());
        }
        super.dispose();
    }
};
NotebookDocumentMetadataElement = __decorate([
    __param(3, IInstantiationService),
    __param(4, ITextModelService),
    __param(5, IMenuService),
    __param(6, IContextKeyService),
    __param(7, ITextResourceConfigurationService),
    __param(8, IConfigurationService)
], NotebookDocumentMetadataElement);
export { NotebookDocumentMetadataElement };
class AbstractElementRenderer extends Disposable {
    constructor(notebookEditor, cell, templateData, style, instantiationService, languageService, modelService, textModelService, contextMenuService, keybindingService, notificationService, menuService, contextKeyService, configurationService, textConfigurationService) {
        super();
        this.notebookEditor = notebookEditor;
        this.cell = cell;
        this.templateData = templateData;
        this.style = style;
        this.instantiationService = instantiationService;
        this.languageService = languageService;
        this.modelService = modelService;
        this.textModelService = textModelService;
        this.contextMenuService = contextMenuService;
        this.keybindingService = keybindingService;
        this.notificationService = notificationService;
        this.menuService = menuService;
        this.contextKeyService = contextKeyService;
        this.configurationService = configurationService;
        this.textConfigurationService = textConfigurationService;
        this._metadataLocalDisposable = this._register(new DisposableStore());
        this._outputLocalDisposable = this._register(new DisposableStore());
        this._ignoreMetadata = false;
        this._ignoreOutputs = false;
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
    buildBody() {
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
        }
        else {
            this._buildMetadata();
        }
        this._ignoreOutputs = this.configurationService.getValue('notebook.diff.ignoreOutputs') || !!(this.notebookEditor.textModel?.transientOptions.transientOutputs);
        if (this._ignoreOutputs) {
            this._disposeOutput();
        }
        else {
            this._buildOutput();
        }
        this._register(this.configurationService.onDidChangeConfiguration(e => {
            let metadataLayoutChange = false;
            let outputLayoutChange = false;
            if (e.affectsConfiguration('notebook.diff.ignoreMetadata')) {
                const newValue = this.configurationService.getValue('notebook.diff.ignoreMetadata');
                if (newValue !== undefined && this._ignoreMetadata !== newValue) {
                    this._ignoreMetadata = newValue;
                    this._metadataLocalDisposable.clear();
                    if (this.configurationService.getValue('notebook.diff.ignoreMetadata')) {
                        this._disposeMetadata();
                    }
                    else {
                        this.cell.metadataStatusHeight = 25;
                        this._buildMetadata();
                        this.updateMetadataRendering();
                        metadataLayoutChange = true;
                    }
                }
            }
            if (e.affectsConfiguration('notebook.diff.ignoreOutputs')) {
                const newValue = this.configurationService.getValue('notebook.diff.ignoreOutputs');
                if (newValue !== undefined && this._ignoreOutputs !== (newValue || this.notebookEditor.textModel?.transientOptions.transientOutputs)) {
                    this._ignoreOutputs = newValue || !!(this.notebookEditor.textModel?.transientOptions.transientOutputs);
                    this._outputLocalDisposable.clear();
                    if (this._ignoreOutputs) {
                        this._disposeOutput();
                        this.cell.layoutChange();
                    }
                    else {
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
            }
            else {
                this.cell.metadataHeight = this._metadataEditor.getContentHeight();
            }
        }
        else {
            // we should collapse the metadata editor
            this._metadataInfoContainer.style.display = 'none';
            // this._metadataEditorDisposeStore.clear();
            this.cell.metadataHeight = 0;
        }
    }
    updateOutputRendering(renderRichOutput) {
        if (this.cell.outputFoldingState === PropertyFoldingState.Expanded) {
            this._outputInfoContainer.style.display = 'block';
            if (renderRichOutput) {
                this._hideOutputsRaw();
                this._buildOutputRendererContainer();
                this._showOutputsRenderer();
                this._showOutputsEmptyView();
            }
            else {
                this._hideOutputsRenderer();
                this._buildOutputRawContainer();
                this._showOutputsRaw();
            }
        }
        else {
            this._outputInfoContainer.style.display = 'none';
            this._hideOutputsRaw();
            this._hideOutputsRenderer();
            this._hideOutputsEmptyView();
        }
    }
    _buildOutputRawContainer() {
        if (!this._outputEditorContainer) {
            this._outputEditorContainer = DOM.append(this._outputInfoContainer, DOM.$('.output-editor-container'));
            this._buildOutputEditor();
        }
    }
    _showOutputsRaw() {
        if (this._outputEditorContainer) {
            this._outputEditorContainer.style.display = 'block';
            this.cell.rawOutputHeight = this._outputEditor.getContentHeight();
        }
    }
    _showOutputsEmptyView() {
        this.cell.layoutChange();
    }
    _hideOutputsRaw() {
        if (this._outputEditorContainer) {
            this._outputEditorContainer.style.display = 'none';
            this.cell.rawOutputHeight = 0;
        }
    }
    _hideOutputsEmptyView() {
        this.cell.layoutChange();
    }
    _applySanitizedMetadataChanges(currentMetadata, newMetadata) {
        const result = {};
        try {
            const newMetadataObj = JSON.parse(newMetadata);
            const keys = new Set([...Object.keys(newMetadataObj)]);
            for (const key of keys) {
                switch (key) {
                    case 'inputCollapsed':
                    case 'outputCollapsed':
                        // boolean
                        if (typeof newMetadataObj[key] === 'boolean') {
                            result[key] = newMetadataObj[key];
                        }
                        else {
                            result[key] = currentMetadata[key];
                        }
                        break;
                    default:
                        result[key] = newMetadataObj[key];
                        break;
                }
            }
            const index = this.notebookEditor.textModel.cells.indexOf(this.cell.modified.textModel);
            if (index < 0) {
                return;
            }
            this.notebookEditor.textModel.applyEdits([
                { editType: 3 /* CellEditType.Metadata */, index, metadata: result }
            ], true, undefined, () => undefined, undefined, true);
        }
        catch {
        }
    }
    async _buildMetadataEditor() {
        this._metadataEditorDisposeStore.clear();
        if (this.cell instanceof SideBySideDiffElementViewModel) {
            this._metadataEditor = this.instantiationService.createInstance(DiffEditorWidget, this._metadataEditorContainer, {
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
            const unchangedRegions = this._register(getUnchangedRegionSettings(this.configurationService));
            if (unchangedRegions.options.enabled) {
                this._metadataEditor.updateOptions({ hideUnchangedRegions: unchangedRegions.options });
            }
            this._metadataEditorDisposeStore.add(unchangedRegions.onDidChangeEnablement(() => {
                if (this._metadataEditor) {
                    this._metadataEditor.updateOptions({ hideUnchangedRegions: unchangedRegions.options });
                }
            }));
            this.layout({ metadataHeight: true });
            this._metadataEditorDisposeStore.add(this._metadataEditor);
            this._metadataEditorContainer?.classList.add('diff');
            const [originalMetadataModel, modifiedMetadataModel] = await Promise.all([
                this.textModelService.createModelReference(CellUri.generateCellPropertyUri(this.cell.originalDocument.uri, this.cell.original.handle, Schemas.vscodeNotebookCellMetadata)),
                this.textModelService.createModelReference(CellUri.generateCellPropertyUri(this.cell.modifiedDocument.uri, this.cell.modified.handle, Schemas.vscodeNotebookCellMetadata))
            ]);
            if (this._isDisposed) {
                originalMetadataModel.dispose();
                modifiedMetadataModel.dispose();
                return;
            }
            this._metadataEditorDisposeStore.add(originalMetadataModel);
            this._metadataEditorDisposeStore.add(modifiedMetadataModel);
            const vm = this._metadataEditor.createViewModel({
                original: originalMetadataModel.object.textEditorModel,
                modified: modifiedMetadataModel.object.textEditorModel
            });
            this._metadataEditor.setModel(vm);
            // Reduces flicker (compute this before setting the model)
            // Else when the model is set, the height of the editor will be x, after diff is computed, then height will be y.
            // & that results in flicker.
            await vm.waitForDiff();
            if (this._isDisposed) {
                return;
            }
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
                this._applySanitizedMetadataChanges(this.cell.modified.metadata, value);
                this._metadataHeader.refresh();
                respondingToContentChange = false;
            }));
            this._metadataEditorDisposeStore.add(this.cell.modified.textModel.onDidChangeMetadata(() => {
                if (respondingToContentChange) {
                    return;
                }
                const modifiedMetadataSource = getFormattedMetadataJSON(this.notebookEditor.textModel?.transientOptions.transientCellMetadata, this.cell.modified?.metadata || {}, this.cell.modified?.language, true);
                modifiedMetadataModel.object.textEditorModel.setValue(modifiedMetadataSource);
            }));
            return;
        }
        else {
            this._metadataEditor = this.instantiationService.createInstance(CodeEditorWidget, this._metadataEditorContainer, {
                ...fixedEditorOptions,
                dimension: {
                    width: this.cell.getComputedCellContainerWidth(this.notebookEditor.getLayoutInfo(), false, true),
                    height: this.cell.layoutInfo.metadataHeight
                },
                overflowWidgetsDomNode: this.notebookEditor.getOverflowContainerDomNode(),
                readOnly: false,
                allowVariableLineHeights: false
            }, {});
            this.layout({ metadataHeight: true });
            this._metadataEditorDisposeStore.add(this._metadataEditor);
            const mode = this.languageService.createById('jsonc');
            const originalMetadataSource = getFormattedMetadataJSON(this.notebookEditor.textModel?.transientOptions.transientCellMetadata, this.cell.type === 'insert'
                ? this.cell.modified.metadata || {}
                : this.cell.original.metadata || {}, undefined, true);
            const uri = this.cell.type === 'insert'
                ? this.cell.modified.uri
                : this.cell.original.uri;
            const handle = this.cell.type === 'insert'
                ? this.cell.modified.handle
                : this.cell.original.handle;
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
    _buildOutputEditor() {
        this._outputEditorDisposeStore.clear();
        if ((this.cell.type === 'modified' || this.cell.type === 'unchanged') && !this.notebookEditor.textModel.transientOptions.transientOutputs) {
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
                this._outputEditor = this.instantiationService.createInstance(DiffEditorWidget, this._outputEditorContainer, {
                    ...fixedDiffEditorOptions,
                    overflowWidgetsDomNode: this.notebookEditor.getOverflowContainerDomNode(),
                    readOnly: true,
                    ignoreTrimWhitespace: false,
                    automaticLayout: false,
                    dimension: {
                        height: Math.min(OUTPUT_EDITOR_HEIGHT_MAGIC, this.cell.layoutInfo.rawOutputHeight || lineHeight * lineCount),
                        width: this.cell.getComputedCellContainerWidth(this.notebookEditor.getLayoutInfo(), false, true)
                    },
                    accessibilityVerbose: this.configurationService.getValue("accessibility.verbosity.diffEditor" /* AccessibilityVerbositySettingId.DiffEditor */) ?? false
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
                this._outputEditor.restoreViewState(this.cell.getOutputEditorViewState());
                this.cell.rawOutputHeight = this._outputEditor.getContentHeight();
                this._outputEditorDisposeStore.add(this._outputEditor.onDidContentSizeChange((e) => {
                    if (e.contentHeightChanged && this.cell.outputFoldingState === PropertyFoldingState.Expanded) {
                        this.cell.rawOutputHeight = e.contentHeight;
                    }
                }));
                this._outputEditorDisposeStore.add(this.cell.modified.textModel.onDidChangeOutputs(() => {
                    const modifiedOutputsSource = getFormattedOutputJSON(this.cell.modified?.outputs || []);
                    modifiedModel.setValue(modifiedOutputsSource);
                    this._outputHeader.refresh();
                }));
                return;
            }
        }
        this._outputEditor = this.instantiationService.createInstance(CodeEditorWidget, this._outputEditorContainer, {
            ...fixedEditorOptions,
            dimension: {
                width: Math.min(OUTPUT_EDITOR_HEIGHT_MAGIC, this.cell.getComputedCellContainerWidth(this.notebookEditor.getLayoutInfo(), false, this.cell.type === 'unchanged' || this.cell.type === 'modified') - 32),
                height: this.cell.layoutInfo.rawOutputHeight
            },
            overflowWidgetsDomNode: this.notebookEditor.getOverflowContainerDomNode(),
            allowVariableLineHeights: false
        }, {});
        this._outputEditorDisposeStore.add(this._outputEditor);
        const mode = this.languageService.createById('json');
        const originaloutputSource = getFormattedOutputJSON(this.notebookEditor.textModel.transientOptions.transientOutputs
            ? []
            : this.cell.type === 'insert'
                ? this.cell.modified?.outputs || []
                : this.cell.original?.outputs || []);
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
    layoutNotebookCell() {
        this.notebookEditor.layoutNotebookCell(this.cell, this.cell.layoutInfo.totalHeight);
    }
    updateBorders() {
        this.templateData.leftBorder.style.height = `${this.cell.layoutInfo.totalHeight - 32}px`;
        this.templateData.rightBorder.style.height = `${this.cell.layoutInfo.totalHeight - 32}px`;
        this.templateData.bottomBorder.style.top = `${this.cell.layoutInfo.totalHeight - 32}px`;
    }
    dispose() {
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
}
class SingleSideDiffElement extends AbstractElementRenderer {
    constructor(notebookEditor, cell, templateData, style, instantiationService, languageService, modelService, textModelService, contextMenuService, keybindingService, notificationService, menuService, contextKeyService, configurationService, textConfigurationService) {
        super(notebookEditor, cell, templateData, style, instantiationService, languageService, modelService, textModelService, contextMenuService, keybindingService, notificationService, menuService, contextKeyService, configurationService, textConfigurationService);
        this.cell = cell;
        this.templateData = templateData;
        this.updateBorders();
    }
    init() {
        this._diagonalFill = this.templateData.diagonalFill;
    }
    buildBody() {
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
        }
        else {
            this._buildMetadata();
        }
        if (this.configurationService.getValue('notebook.diff.ignoreOutputs') || this.notebookEditor.textModel?.transientOptions.transientOutputs) {
            this._disposeOutput();
        }
        else {
            this._buildOutput();
        }
        this._register(this.configurationService.onDidChangeConfiguration(e => {
            let metadataLayoutChange = false;
            let outputLayoutChange = false;
            if (e.affectsConfiguration('notebook.diff.ignoreMetadata')) {
                this._metadataLocalDisposable.clear();
                if (this.configurationService.getValue('notebook.diff.ignoreMetadata')) {
                    this._disposeMetadata();
                }
                else {
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
                }
                else {
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
    updateSourceEditor() {
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
            const lineHeight = this.notebookEditor.getLayoutInfo().fontInfo.lineHeight || 17;
            const editorHeight = this.cell.computeInputEditorHeight(lineHeight);
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
            this._editor.layout({
                width: (this.notebookEditor.getLayoutInfo().width - 2 * DIFF_CELL_MARGIN) / 2 - 18,
                height: editorHeight
            });
            this._editor.updateOptions({ readOnly: this.readonly });
            this.cell.editorHeight = editorHeight;
            this._register(this._editor.onDidContentSizeChange((e) => {
                if (this.cell.cellFoldingState === PropertyFoldingState.Expanded && e.contentHeightChanged && this.cell.layoutInfo.editorHeight !== e.contentHeight) {
                    this.cell.editorHeight = e.contentHeight;
                }
            }));
            this._initializeSourceDiffEditor(this.nestedCellViewModel);
        };
        this._cellHeader = this._register(this.instantiationService.createInstance(PropertyHeader, this.cell, this._cellHeaderContainer, this.notebookEditor, {
            updateInfoRendering: () => renderSourceEditor(),
            checkIfModified: () => ({ reason: undefined }),
            getFoldingState: () => this.cell.cellFoldingState,
            updateFoldingState: (state) => this.cell.cellFoldingState = state,
            unChangedLabel: 'Input',
            changedLabel: 'Input',
            prefix: 'input',
            menuId: MenuId.NotebookDiffCellInputTitle
        }));
        this._cellHeader.buildHeader();
        renderSourceEditor();
        this._initializeSourceDiffEditor(this.nestedCellViewModel);
    }
    calculateDiagonalFillHeight() {
        return this.cell.layoutInfo.cellStatusHeight + this.cell.layoutInfo.editorHeight + this.cell.layoutInfo.editorMargin + this.cell.layoutInfo.metadataStatusHeight + this.cell.layoutInfo.metadataHeight + this.cell.layoutInfo.outputTotalHeight + this.cell.layoutInfo.outputStatusHeight;
    }
    async _initializeSourceDiffEditor(modifiedCell) {
        const modifiedRef = await this.textModelService.createModelReference(modifiedCell.uri);
        if (this._isDisposed) {
            return;
        }
        const modifiedTextModel = modifiedRef.object.textEditorModel;
        this._register(modifiedRef);
        this._editor.setModel(modifiedTextModel);
        const editorViewState = this.cell.getSourceEditorViewState();
        if (editorViewState) {
            this._editor.restoreViewState(editorViewState);
        }
        const contentHeight = this._editor.getContentHeight();
        this.cell.editorHeight = contentHeight;
        const height = `${this.calculateDiagonalFillHeight()}px`;
        if (this._diagonalFill.style.height !== height) {
            this._diagonalFill.style.height = height;
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
        this._metadataHeader = this.instantiationService.createInstance(PropertyHeader, this.cell, this._metadataHeaderContainer, this.notebookEditor, {
            updateInfoRendering: this.updateMetadataRendering.bind(this),
            checkIfModified: () => {
                return this.cell.checkMetadataIfModified();
            },
            getFoldingState: () => {
                return this.cell.metadataFoldingState;
            },
            updateFoldingState: (state) => {
                this.cell.metadataFoldingState = state;
            },
            unChangedLabel: 'Metadata',
            changedLabel: 'Metadata changed',
            prefix: 'metadata',
            menuId: MenuId.NotebookDiffCellMetadataTitle
        });
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
        this._outputHeader = this.instantiationService.createInstance(PropertyHeader, this.cell, this._outputHeaderContainer, this.notebookEditor, {
            updateInfoRendering: this.updateOutputRendering.bind(this),
            checkIfModified: () => {
                return this.cell.checkIfOutputsModified();
            },
            getFoldingState: () => {
                return this.cell.outputFoldingState;
            },
            updateFoldingState: (state) => {
                this.cell.outputFoldingState = state;
            },
            unChangedLabel: 'Outputs',
            changedLabel: 'Outputs changed',
            prefix: 'output',
            menuId: MenuId.NotebookDiffCellOutputsTitle
        });
        this._outputLocalDisposable.add(this._outputHeader);
        this._outputHeader.buildHeader();
    }
    _disposeOutput() {
        this._hideOutputsRaw();
        this._hideOutputsRenderer();
        this._hideOutputsEmptyView();
        this.cell.rawOutputHeight = 0;
        this.cell.outputMetadataHeight = 0;
        this.cell.outputStatusHeight = 0;
        this.templateData.outputHeaderContainer.style.display = 'none';
        this.templateData.outputInfoContainer.style.display = 'none';
        this._outputViewContainer = undefined;
    }
}
let DeletedElement = class DeletedElement extends SingleSideDiffElement {
    constructor(notebookEditor, cell, templateData, languageService, modelService, textModelService, instantiationService, contextMenuService, keybindingService, notificationService, menuService, contextKeyService, configurationService, textConfigurationService) {
        super(notebookEditor, cell, templateData, 'left', instantiationService, languageService, modelService, textModelService, contextMenuService, keybindingService, notificationService, menuService, contextKeyService, configurationService, textConfigurationService);
    }
    get nestedCellViewModel() {
        return this.cell.original;
    }
    get readonly() {
        return true;
    }
    styleContainer(container) {
        container.classList.remove('inserted');
        container.classList.add('removed');
    }
    layout(state) {
        DOM.scheduleAtNextAnimationFrame(DOM.getWindow(this._diffEditorContainer), () => {
            if ((state.editorHeight || state.outerWidth) && this._editor) {
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
            if (!this.cell.original?.outputs.length) {
                this._outputEmptyElement.style.display = 'block';
            }
            else {
                this._outputEmptyElement.style.display = 'none';
            }
            this.cell.layoutChange();
            this._outputLeftView = this.instantiationService.createInstance(OutputContainer, this.notebookEditor, this.notebookEditor.textModel, this.cell, this.cell.original, DiffSide.Original, this._outputViewContainer);
            this._register(this._outputLeftView);
            this._outputLeftView.render();
            const removedOutputRenderListener = this.notebookEditor.onDidDynamicOutputRendered(e => {
                if (e.cell.uri.toString() === this.cell.original.uri.toString()) {
                    this.notebookEditor.deltaCellOutputContainerClassNames(DiffSide.Original, this.cell.original.id, ['nb-cellDeleted'], []);
                    removedOutputRenderListener.dispose();
                }
            });
            this._register(removedOutputRenderListener);
        }
        this._outputViewContainer.style.display = 'block';
    }
    _decorate() {
        this.notebookEditor.deltaCellOutputContainerClassNames(DiffSide.Original, this.cell.original.id, ['nb-cellDeleted'], []);
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
    dispose() {
        if (this._editor) {
            this.cell.saveSpirceEditorViewState(this._editor.saveViewState());
        }
        super.dispose();
    }
};
DeletedElement = __decorate([
    __param(3, ILanguageService),
    __param(4, IModelService),
    __param(5, ITextModelService),
    __param(6, IInstantiationService),
    __param(7, IContextMenuService),
    __param(8, IKeybindingService),
    __param(9, INotificationService),
    __param(10, IMenuService),
    __param(11, IContextKeyService),
    __param(12, IConfigurationService),
    __param(13, ITextResourceConfigurationService)
], DeletedElement);
export { DeletedElement };
let InsertElement = class InsertElement extends SingleSideDiffElement {
    constructor(notebookEditor, cell, templateData, instantiationService, languageService, modelService, textModelService, contextMenuService, keybindingService, notificationService, menuService, contextKeyService, configurationService, textConfigurationService) {
        super(notebookEditor, cell, templateData, 'right', instantiationService, languageService, modelService, textModelService, contextMenuService, keybindingService, notificationService, menuService, contextKeyService, configurationService, textConfigurationService);
    }
    get nestedCellViewModel() {
        return this.cell.modified;
    }
    get readonly() {
        return false;
    }
    styleContainer(container) {
        container.classList.remove('removed');
        container.classList.add('inserted');
    }
    _buildOutputRendererContainer() {
        if (!this._outputViewContainer) {
            this._outputViewContainer = DOM.append(this._outputInfoContainer, DOM.$('.output-view-container'));
            this._outputEmptyElement = DOM.append(this._outputViewContainer, DOM.$('.output-empty-view'));
            this._outputEmptyElement.innerText = 'No outputs to render';
            if (!this.cell.modified?.outputs.length) {
                this._outputEmptyElement.style.display = 'block';
            }
            else {
                this._outputEmptyElement.style.display = 'none';
            }
            this.cell.layoutChange();
            this._outputRightView = this.instantiationService.createInstance(OutputContainer, this.notebookEditor, this.notebookEditor.textModel, this.cell, this.cell.modified, DiffSide.Modified, this._outputViewContainer);
            this._register(this._outputRightView);
            this._outputRightView.render();
            const insertOutputRenderListener = this.notebookEditor.onDidDynamicOutputRendered(e => {
                if (e.cell.uri.toString() === this.cell.modified.uri.toString()) {
                    this.notebookEditor.deltaCellOutputContainerClassNames(DiffSide.Modified, this.cell.modified.id, ['nb-cellAdded'], []);
                    insertOutputRenderListener.dispose();
                }
            });
            this._register(insertOutputRenderListener);
        }
        this._outputViewContainer.style.display = 'block';
    }
    _decorate() {
        this.notebookEditor.deltaCellOutputContainerClassNames(DiffSide.Modified, this.cell.modified.id, ['nb-cellAdded'], []);
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
    layout(state) {
        DOM.scheduleAtNextAnimationFrame(DOM.getWindow(this._diffEditorContainer), () => {
            if ((state.editorHeight || state.outerWidth) && this._editor) {
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
    dispose() {
        if (this._editor) {
            this.cell.saveSpirceEditorViewState(this._editor.saveViewState());
        }
        super.dispose();
    }
};
InsertElement = __decorate([
    __param(3, IInstantiationService),
    __param(4, ILanguageService),
    __param(5, IModelService),
    __param(6, ITextModelService),
    __param(7, IContextMenuService),
    __param(8, IKeybindingService),
    __param(9, INotificationService),
    __param(10, IMenuService),
    __param(11, IContextKeyService),
    __param(12, IConfigurationService),
    __param(13, ITextResourceConfigurationService)
], InsertElement);
export { InsertElement };
let ModifiedElement = class ModifiedElement extends AbstractElementRenderer {
    constructor(notebookEditor, cell, templateData, instantiationService, languageService, modelService, textModelService, contextMenuService, keybindingService, notificationService, menuService, contextKeyService, configurationService, textConfigurationService) {
        super(notebookEditor, cell, templateData, 'full', instantiationService, languageService, modelService, textModelService, contextMenuService, keybindingService, notificationService, menuService, contextKeyService, configurationService, textConfigurationService);
        this.cell = cell;
        this.templateData = templateData;
        this._editorViewStateChanged = false;
        this.updateBorders();
    }
    init() { }
    styleContainer(container) {
        container.classList.remove('inserted', 'removed');
    }
    buildBody() {
        super.buildBody();
        if (this.cell.displayIconToHideUnmodifiedCells) {
            this._register(this.templateData.marginOverlay.onAction(() => this.cell.hideUnchangedCells()));
            this.templateData.marginOverlay.show();
        }
        else {
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
        this._metadataHeader = this.instantiationService.createInstance(PropertyHeader, this.cell, this._metadataHeaderContainer, this.notebookEditor, {
            updateInfoRendering: this.updateMetadataRendering.bind(this),
            checkIfModified: () => {
                return this.cell.checkMetadataIfModified();
            },
            getFoldingState: () => {
                return this.cell.metadataFoldingState;
            },
            updateFoldingState: (state) => {
                this.cell.metadataFoldingState = state;
            },
            unChangedLabel: 'Metadata',
            changedLabel: 'Metadata changed',
            prefix: 'metadata',
            menuId: MenuId.NotebookDiffCellMetadataTitle
        });
        this._metadataLocalDisposable.add(this._metadataHeader);
        this._metadataHeader.buildHeader();
    }
    _disposeOutput() {
        this._hideOutputsRaw();
        this._hideOutputsRenderer();
        this._hideOutputsEmptyView();
        this.cell.rawOutputHeight = 0;
        this.cell.outputMetadataHeight = 0;
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
        }
        else {
            this._outputInfoContainer.classList.remove('modified');
        }
        this._outputHeader = this.instantiationService.createInstance(PropertyHeader, this.cell, this._outputHeaderContainer, this.notebookEditor, {
            updateInfoRendering: this.updateOutputRendering.bind(this),
            checkIfModified: () => {
                return this.cell.checkIfOutputsModified();
            },
            getFoldingState: () => {
                return this.cell.outputFoldingState;
            },
            updateFoldingState: (state) => {
                this.cell.outputFoldingState = state;
            },
            unChangedLabel: 'Outputs',
            changedLabel: 'Outputs changed',
            prefix: 'output',
            menuId: MenuId.NotebookDiffCellOutputsTitle
        });
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
            }
            else {
                this._outputEmptyElement.style.display = 'none';
            }
            this.cell.layoutChange();
            this._register(this.cell.modified.textModel.onDidChangeOutputs(() => {
                // currently we only allow outputs change to the modified cell
                if (!this.cell.checkIfOutputsModified() && this.cell.modified.outputs.length === 0) {
                    this._outputEmptyElement.style.display = 'block';
                }
                else {
                    this._outputEmptyElement.style.display = 'none';
                }
                this._decorate();
            }));
            this._outputLeftContainer = DOM.append(this._outputViewContainer, DOM.$('.output-view-container-left'));
            this._outputRightContainer = DOM.append(this._outputViewContainer, DOM.$('.output-view-container-right'));
            this._outputMetadataContainer = DOM.append(this._outputViewContainer, DOM.$('.output-view-container-metadata'));
            const outputModified = this.cell.checkIfOutputsModified();
            const outputMetadataChangeOnly = outputModified
                && outputModified.kind === 1 /* OutputComparison.Metadata */
                && this.cell.original.outputs.length === 1
                && this.cell.modified.outputs.length === 1
                && outputEqual(this.cell.original.outputs[0], this.cell.modified.outputs[0]) === 1 /* OutputComparison.Metadata */;
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
            this._outputLeftView = this.instantiationService.createInstance(OutputContainer, this.notebookEditor, this.notebookEditor.textModel, this.cell, this.cell.original, DiffSide.Original, this._outputLeftContainer);
            this._outputLeftView.render();
            this._register(this._outputLeftView);
            this._outputRightView = this.instantiationService.createInstance(OutputContainer, this.notebookEditor, this.notebookEditor.textModel, this.cell, this.cell.modified, DiffSide.Modified, this._outputRightContainer);
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
        }
        else {
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
    updateSourceEditor() {
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
            const editorHeight = this.cell.layoutInfo.editorHeight !== 0 ? this.cell.layoutInfo.editorHeight : this.cell.computeInputEditorHeight(lineHeight);
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
            const options = {
                padding: getEditorPadding(lineCount)
            };
            const unchangedRegions = this._register(getUnchangedRegionSettings(this.configurationService));
            if (unchangedRegions.options.enabled) {
                options.hideUnchangedRegions = unchangedRegions.options;
            }
            this._editor.updateOptions(options);
            this._register(unchangedRegions.onDidChangeEnablement(() => {
                options.hideUnchangedRegions = unchangedRegions.options;
                this._editor?.updateOptions(options);
            }));
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
        this._cellHeader = this._register(this.instantiationService.createInstance(PropertyHeader, this.cell, this._cellHeaderContainer, this.notebookEditor, {
            updateInfoRendering: () => renderSourceEditor(),
            checkIfModified: () => {
                return this.cell.modified?.textModel.getTextBufferHash() !== this.cell.original?.textModel.getTextBufferHash() ? { reason: undefined } : false;
            },
            getFoldingState: () => this.cell.cellFoldingState,
            updateFoldingState: (state) => this.cell.cellFoldingState = state,
            unChangedLabel: 'Input',
            changedLabel: 'Input changed',
            prefix: 'input',
            menuId: MenuId.NotebookDiffCellInputTitle
        }));
        this._cellHeader.buildHeader();
        renderSourceEditor();
        const scopedContextKeyService = this.contextKeyService.createScoped(this.templateData.inputToolbarContainer);
        this._register(scopedContextKeyService);
        const inputChanged = NOTEBOOK_DIFF_CELL_INPUT.bindTo(scopedContextKeyService);
        inputChanged.set(this.cell.modified.textModel.getTextBufferHash() !== this.cell.original.textModel.getTextBufferHash());
        const ignoreWhitespace = NOTEBOOK_DIFF_CELL_IGNORE_WHITESPACE.bindTo(scopedContextKeyService);
        const ignore = this.textConfigurationService.getValue(this.cell.modified.uri, 'diffEditor.ignoreTrimWhitespace');
        ignoreWhitespace.set(ignore);
        this._toolbar = this.templateData.toolbar;
        this._toolbar.context = this.cell;
        const refreshToolbar = () => {
            const ignore = this.textConfigurationService.getValue(this.cell.modified.uri, 'diffEditor.ignoreTrimWhitespace');
            ignoreWhitespace.set(ignore);
            const hasChanges = this.cell.modified.textModel.getTextBufferHash() !== this.cell.original.textModel.getTextBufferHash();
            inputChanged.set(hasChanges);
            if (hasChanges) {
                const menu = this.menuService.getMenuActions(MenuId.NotebookDiffCellInputTitle, scopedContextKeyService, { shouldForwardArgs: true });
                const actions = getFlatActionBarActions(menu);
                this._toolbar.setActions(actions);
            }
            else {
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
    async _initializeSourceDiffEditor() {
        const [originalRef, modifiedRef] = await Promise.all([
            this.textModelService.createModelReference(this.cell.original.uri),
            this.textModelService.createModelReference(this.cell.modified.uri)
        ]);
        this._register(originalRef);
        this._register(modifiedRef);
        if (this._isDisposed) {
            originalRef.dispose();
            modifiedRef.dispose();
            return;
        }
        const vm = this._register(this._editor.createViewModel({
            original: originalRef.object.textEditorModel,
            modified: modifiedRef.object.textEditorModel,
        }));
        // Reduces flicker (compute this before setting the model)
        // Else when the model is set, the height of the editor will be x, after diff is computed, then height will be y.
        // & that results in flicker.
        await vm.waitForDiff();
        this._editor.setModel(vm);
        const handleViewStateChange = () => {
            this._editorViewStateChanged = true;
        };
        const handleScrollChange = (e) => {
            if (e.scrollTopChanged || e.scrollLeftChanged) {
                this._editorViewStateChanged = true;
            }
        };
        this.updateEditorOptionsForWhitespace();
        this._register(this._editor.getOriginalEditor().onDidChangeCursorSelection(handleViewStateChange));
        this._register(this._editor.getOriginalEditor().onDidScrollChange(handleScrollChange));
        this._register(this._editor.getModifiedEditor().onDidChangeCursorSelection(handleViewStateChange));
        this._register(this._editor.getModifiedEditor().onDidScrollChange(handleScrollChange));
        const editorViewState = this.cell.getSourceEditorViewState();
        if (editorViewState) {
            this._editor.restoreViewState(editorViewState);
        }
        const contentHeight = this._editor.getContentHeight();
        this.cell.editorHeight = contentHeight;
    }
    updateEditorOptionsForWhitespace() {
        const editor = this._editor;
        if (!editor) {
            return;
        }
        const uri = editor.getModel()?.modified.uri || editor.getModel()?.original.uri;
        if (!uri) {
            return;
        }
        const ignoreTrimWhitespace = this.textConfigurationService.getValue(uri, 'diffEditor.ignoreTrimWhitespace');
        editor.updateOptions({ ignoreTrimWhitespace });
        this._register(this.textConfigurationService.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration(uri, 'diffEditor') &&
                e.affectedKeys.has('diffEditor.ignoreTrimWhitespace')) {
                const ignoreTrimWhitespace = this.textConfigurationService.getValue(uri, 'diffEditor.ignoreTrimWhitespace');
                editor.updateOptions({ ignoreTrimWhitespace });
            }
        }));
    }
    layout(state) {
        DOM.scheduleAtNextAnimationFrame(DOM.getWindow(this._diffEditorContainer), () => {
            if (state.editorHeight && this._editor) {
                this._editorContainer.style.height = `${this.cell.layoutInfo.editorHeight}px`;
                this._editor.layout({
                    width: this._editor.getViewWidth(),
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
    dispose() {
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
};
ModifiedElement = __decorate([
    __param(3, IInstantiationService),
    __param(4, ILanguageService),
    __param(5, IModelService),
    __param(6, ITextModelService),
    __param(7, IContextMenuService),
    __param(8, IKeybindingService),
    __param(9, INotificationService),
    __param(10, IMenuService),
    __param(11, IContextKeyService),
    __param(12, IConfigurationService),
    __param(13, ITextResourceConfigurationService)
], ModifiedElement);
export { ModifiedElement };
export class CollapsedCellOverlayWidget extends Disposable {
    constructor(container) {
        super();
        this.container = container;
        this._nodes = DOM.h('div.diff-hidden-cells', [
            DOM.h('div.center@content', { style: { display: 'flex' } }, [
                DOM.$('a', {
                    title: localize('showUnchangedCells', 'Show Unchanged Cells'),
                    role: 'button',
                    onclick: () => { this._action.fire(); }
                }, ...renderLabelWithIcons('$(unfold)'))
            ]),
        ]);
        this._action = this._register(new Emitter());
        this.onAction = this._action.event;
        this._nodes.root.style.display = 'none';
        container.appendChild(this._nodes.root);
    }
    show() {
        this._nodes.root.style.display = 'block';
    }
    hide() {
        this._nodes.root.style.display = 'none';
    }
    dispose() {
        this.hide();
        this.container.removeChild(this._nodes.root);
        DOM.reset(this._nodes.root);
        super.dispose();
    }
}
export class UnchangedCellOverlayWidget extends Disposable {
    constructor(container) {
        super();
        this.container = container;
        this._nodes = DOM.h('div.diff-hidden-cells', [
            DOM.h('div.center@content', { style: { display: 'flex' } }, [
                DOM.$('a', {
                    title: localize('hideUnchangedCells', 'Hide Unchanged Cells'),
                    role: 'button',
                    onclick: () => { this._action.fire(); }
                }, ...renderLabelWithIcons('$(fold)')),
            ]),
        ]);
        this._action = this._register(new Emitter());
        this.onAction = this._action.event;
        this._nodes.root.style.display = 'none';
        container.appendChild(this._nodes.root);
    }
    show() {
        this._nodes.root.style.display = 'block';
    }
    hide() {
        this._nodes.root.style.display = 'none';
    }
    dispose() {
        this.hide();
        this.container.removeChild(this._nodes.root);
        DOM.reset(this._nodes.root);
        super.dispose();
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZGlmZkNvbXBvbmVudHMuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9ub3RlYm9vay9icm93c2VyL2RpZmYvZGlmZkNvbXBvbmVudHMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxLQUFLLEdBQUcsTUFBTSxvQ0FBb0MsQ0FBQztBQUMxRCxPQUFPLEVBQUUsVUFBVSxFQUFFLGVBQWUsRUFBRSxNQUFNLHlDQUF5QyxDQUFDO0FBQ3RGLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSx1Q0FBdUMsQ0FBQztBQUNoRSxPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSwrREFBK0QsQ0FBQztBQUN0RyxPQUFPLEVBQWdDLHNCQUFzQixFQUFvQixXQUFXLEVBQUUsMEJBQTBCLEVBQUUsb0JBQW9CLEVBQUUsOEJBQThCLEVBQThGLGlDQUFpQyxFQUFFLE1BQU0sMkJBQTJCLENBQUM7QUFDalYsT0FBTyxFQUFzRSxRQUFRLEVBQUUsZ0JBQWdCLEVBQTJCLHdCQUF3QixFQUFFLDJCQUEyQixFQUFFLG9DQUFvQyxFQUE2RCxvQ0FBb0MsRUFBNkMsc0JBQXNCLEVBQUUsTUFBTSxnQ0FBZ0MsQ0FBQztBQUMxYSxPQUFPLEVBQUUsZ0JBQWdCLEVBQTRCLE1BQU0scUVBQXFFLENBQUM7QUFDakksT0FBTyxFQUFFLGFBQWEsRUFBRSxNQUFNLGdEQUFnRCxDQUFDO0FBQy9FLE9BQU8sRUFBRSxnQkFBZ0IsRUFBRSxNQUFNLG9EQUFvRCxDQUFDO0FBQ3RGLE9BQU8sRUFBZ0IsT0FBTyxFQUF3QixNQUFNLGdDQUFnQyxDQUFDO0FBRTdGLE9BQU8sRUFBRSxtQkFBbUIsRUFBRSxNQUFNLDREQUE0RCxDQUFDO0FBQ2pHLE9BQU8sRUFBUyxZQUFZLEVBQUUsTUFBTSxFQUFFLGNBQWMsRUFBRSxNQUFNLG1EQUFt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