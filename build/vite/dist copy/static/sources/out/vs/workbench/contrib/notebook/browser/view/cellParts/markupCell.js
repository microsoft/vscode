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
import * as DOM from '../../../../../../base/browser/dom.js';
import * as domSanitize from '../../../../../../base/browser/domSanitize.js';
import { renderIcon } from '../../../../../../base/browser/ui/iconLabel/iconLabels.js';
import { disposableTimeout, raceCancellation } from '../../../../../../base/common/async.js';
import { CancellationTokenSource } from '../../../../../../base/common/cancellation.js';
import { Codicon } from '../../../../../../base/common/codicons.js';
import { ThemeIcon } from '../../../../../../base/common/themables.js';
import { Disposable, DisposableStore, MutableDisposable, toDisposable } from '../../../../../../base/common/lifecycle.js';
import { CodeEditorWidget } from '../../../../../../editor/browser/widget/codeEditor/codeEditorWidget.js';
import { EditorContextKeys } from '../../../../../../editor/common/editorContextKeys.js';
import { ILanguageService } from '../../../../../../editor/common/languages/language.js';
import { tokenizeToStringSync } from '../../../../../../editor/common/languages/textToHtmlTokenizer.js';
import { localize } from '../../../../../../nls.js';
import { IAccessibilityService } from '../../../../../../platform/accessibility/common/accessibility.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { IContextKeyService } from '../../../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { ServiceCollection } from '../../../../../../platform/instantiation/common/serviceCollection.js';
import { IKeybindingService } from '../../../../../../platform/keybinding/common/keybinding.js';
import { CellEditState, CellFocusMode, EXPAND_CELL_INPUT_COMMAND_ID } from '../../notebookBrowser.js';
import { collapsedIcon, expandedIcon } from '../../notebookIcons.js';
import { CellEditorOptions } from './cellEditorOptions.js';
import { collapsedCellTTPolicy } from '../notebookRenderingCommon.js';
import { WordHighlighterContribution } from '../../../../../../editor/contrib/wordHighlighter/browser/wordHighlighter.js';
let MarkupCell = class MarkupCell extends Disposable {
    constructor(notebookEditor, viewCell, templateData, renderedEditors, accessibilityService, contextKeyService, instantiationService, languageService, configurationService, keybindingService) {
        super();
        this.notebookEditor = notebookEditor;
        this.viewCell = viewCell;
        this.templateData = templateData;
        this.renderedEditors = renderedEditors;
        this.accessibilityService = accessibilityService;
        this.contextKeyService = contextKeyService;
        this.instantiationService = instantiationService;
        this.languageService = languageService;
        this.configurationService = configurationService;
        this.keybindingService = keybindingService;
        this.editor = null;
        this.localDisposables = this._register(new DisposableStore());
        this.focusSwitchDisposable = this._register(new MutableDisposable());
        this.editorDisposables = this._register(new DisposableStore());
        this._isDisposed = false;
        this.constructDOM();
        this.editorPart = templateData.editorPart;
        this.cellEditorOptions = this._register(new CellEditorOptions(this.notebookEditor.getBaseCellEditorOptions(viewCell.language), this.notebookEditor.notebookOptions, this.configurationService));
        this.cellEditorOptions.setLineNumbers(this.viewCell.lineNumbers);
        this.editorOptions = this.cellEditorOptions.getValue(this.viewCell.internalMetadata, this.viewCell.uri);
        this._register(toDisposable(() => renderedEditors.delete(this.viewCell)));
        this.registerListeners();
        // update for init state
        this.templateData.cellParts.scheduleRenderCell(this.viewCell);
        this._register(toDisposable(() => {
            this.templateData.cellParts.unrenderCell(this.viewCell);
        }));
        this._register(this.accessibilityService.onDidChangeScreenReaderOptimized(() => {
            this.viewUpdate();
        }));
        this.updateForHover();
        this.updateForFocusModeChange();
        this.foldingState = viewCell.foldingState;
        this.layoutFoldingIndicator();
        this.updateFoldingIconShowClass();
        // the markdown preview's height might already be updated after the renderer calls `element.getHeight()`
        if (this.viewCell.layoutInfo.totalHeight > 0) {
            this.relayoutCell();
        }
        this.viewUpdate();
        this.layoutCellParts();
        this._register(this.viewCell.onDidChangeLayout(() => {
            this.layoutCellParts();
        }));
    }
    layoutCellParts() {
        this.templateData.cellParts.updateInternalLayoutNow(this.viewCell);
    }
    constructDOM() {
        // Create an element that is only used to announce markup cell content to screen readers
        const id = `aria-markup-cell-${this.viewCell.id}`;
        this.markdownAccessibilityContainer = this.templateData.cellContainer;
        this.markdownAccessibilityContainer.id = id;
        // Hide the element from non-screen readers
        this.markdownAccessibilityContainer.style.height = '1px';
        this.markdownAccessibilityContainer.style.overflow = 'hidden';
        this.markdownAccessibilityContainer.style.position = 'absolute';
        this.markdownAccessibilityContainer.style.top = '100000px';
        this.markdownAccessibilityContainer.style.left = '10000px';
        this.markdownAccessibilityContainer.ariaHidden = 'false';
        this.templateData.rootContainer.setAttribute('aria-describedby', id);
        this.templateData.container.classList.toggle('webview-backed-markdown-cell', true);
    }
    registerListeners() {
        this._register(this.viewCell.onDidChangeState(e => {
            this.templateData.cellParts.updateState(this.viewCell, e);
        }));
        this._register(this.viewCell.model.onDidChangeMetadata(() => {
            this.viewUpdate();
        }));
        this._register(this.viewCell.onDidChangeState((e) => {
            if (e.editStateChanged || e.contentChanged) {
                this.viewUpdate();
            }
            if (e.focusModeChanged) {
                this.updateForFocusModeChange();
            }
            if (e.foldingStateChanged) {
                const foldingState = this.viewCell.foldingState;
                if (foldingState !== this.foldingState) {
                    this.foldingState = foldingState;
                    this.layoutFoldingIndicator();
                }
            }
            if (e.cellIsHoveredChanged) {
                this.updateForHover();
            }
            if (e.inputCollapsedChanged) {
                this.updateCollapsedState();
                this.viewUpdate();
            }
            if (e.cellLineNumberChanged) {
                this.cellEditorOptions.setLineNumbers(this.viewCell.lineNumbers);
            }
        }));
        this._register(this.notebookEditor.notebookOptions.onDidChangeOptions(e => {
            if (e.showFoldingControls) {
                this.updateFoldingIconShowClass();
            }
        }));
        this._register(this.viewCell.onDidChangeLayout((e) => {
            const layoutInfo = this.editor?.getLayoutInfo();
            if (e.outerWidth && this.viewCell.getEditState() === CellEditState.Editing && layoutInfo && layoutInfo.width !== this.viewCell.layoutInfo.editorWidth) {
                this.onCellEditorWidthChange();
            }
        }));
        this._register(this.cellEditorOptions.onDidChange(() => this.updateMarkupCellOptions()));
    }
    updateMarkupCellOptions() {
        this.updateEditorOptions(this.cellEditorOptions.getUpdatedValue(this.viewCell.internalMetadata, this.viewCell.uri));
        if (this.editor) {
            this.editor.updateOptions(this.cellEditorOptions.getUpdatedValue(this.viewCell.internalMetadata, this.viewCell.uri));
            const cts = new CancellationTokenSource();
            this._register({ dispose() { cts.dispose(true); } });
            raceCancellation(this.viewCell.resolveTextModel(), cts.token).then(model => {
                if (this._isDisposed) {
                    return;
                }
                if (model) {
                    model.updateOptions({
                        indentSize: this.cellEditorOptions.indentSize,
                        tabSize: this.cellEditorOptions.tabSize,
                        insertSpaces: this.cellEditorOptions.insertSpaces,
                    });
                }
            });
        }
    }
    updateCollapsedState() {
        if (this.viewCell.isInputCollapsed) {
            this.notebookEditor.hideMarkupPreviews([this.viewCell]);
        }
        else {
            this.notebookEditor.unhideMarkupPreviews([this.viewCell]);
        }
    }
    updateForHover() {
        this.templateData.container.classList.toggle('markdown-cell-hover', this.viewCell.cellIsHovered);
    }
    updateForFocusModeChange() {
        if (this.viewCell.focusMode === CellFocusMode.Editor) {
            this.focusEditorIfNeeded();
        }
        this.templateData.container.classList.toggle('cell-editor-focus', this.viewCell.focusMode === CellFocusMode.Editor);
    }
    dispose() {
        this._isDisposed = true;
        // move focus back to the cell list otherwise the focus goes to body
        if (this.notebookEditor.getActiveCell() === this.viewCell && this.viewCell.focusMode === CellFocusMode.Editor && (this.notebookEditor.hasEditorFocus() || this.notebookEditor.getDomNode().ownerDocument.activeElement === this.notebookEditor.getDomNode().ownerDocument.body)) {
            this.notebookEditor.focusContainer();
        }
        this.viewCell.detachTextEditor();
        super.dispose();
    }
    updateFoldingIconShowClass() {
        const showFoldingIcon = this.notebookEditor.notebookOptions.getDisplayOptions().showFoldingControls;
        this.templateData.foldingIndicator.classList.remove('mouseover', 'always');
        this.templateData.foldingIndicator.classList.add(showFoldingIcon);
    }
    viewUpdate() {
        if (this.viewCell.isInputCollapsed) {
            this.viewUpdateCollapsed();
        }
        else if (this.viewCell.getEditState() === CellEditState.Editing) {
            this.viewUpdateEditing();
        }
        else {
            this.viewUpdatePreview();
        }
    }
    viewUpdateCollapsed() {
        DOM.show(this.templateData.cellInputCollapsedContainer);
        DOM.hide(this.editorPart);
        this.templateData.cellInputCollapsedContainer.innerText = '';
        const markdownIcon = DOM.append(this.templateData.cellInputCollapsedContainer, DOM.$('span'));
        markdownIcon.classList.add(...ThemeIcon.asClassNameArray(Codicon.markdown));
        const element = DOM.$('div');
        element.classList.add('cell-collapse-preview');
        const richEditorText = this.getRichText(this.viewCell.textBuffer, this.viewCell.language);
        element.innerText = richEditorText;
        element.innerHTML = (collapsedCellTTPolicy?.createHTML(richEditorText) ?? richEditorText);
        this.templateData.cellInputCollapsedContainer.appendChild(element);
        const expandIcon = DOM.append(element, DOM.$('span.expandInputIcon'));
        expandIcon.classList.add(...ThemeIcon.asClassNameArray(Codicon.more));
        const keybinding = this.keybindingService.lookupKeybinding(EXPAND_CELL_INPUT_COMMAND_ID);
        if (keybinding) {
            element.title = localize('cellExpandInputButtonLabelWithDoubleClick', "Double-click to expand cell input ({0})", keybinding.getLabel());
            expandIcon.title = localize('cellExpandInputButtonLabel', "Expand Cell Input ({0})", keybinding.getLabel());
        }
        this.markdownAccessibilityContainer.ariaHidden = 'true';
        this.templateData.container.classList.toggle('input-collapsed', true);
        this.viewCell.renderedMarkdownHeight = 0;
        this.viewCell.layoutChange({});
    }
    getRichText(buffer, language) {
        return tokenizeToStringSync(this.languageService, buffer.getLineContent(1), language);
    }
    viewUpdateEditing() {
        // switch to editing mode
        let editorHeight;
        DOM.show(this.editorPart);
        this.markdownAccessibilityContainer.ariaHidden = 'true';
        DOM.hide(this.templateData.cellInputCollapsedContainer);
        this.notebookEditor.hideMarkupPreviews([this.viewCell]);
        this.templateData.container.classList.toggle('input-collapsed', false);
        this.templateData.container.classList.toggle('markdown-cell-edit-mode', true);
        if (this.editor && this.editor.hasModel()) {
            editorHeight = this.editor.getContentHeight();
            // not first time, we don't need to create editor
            this.viewCell.attachTextEditor(this.editor);
            this.focusEditorIfNeeded();
            this.bindEditorListeners(this.editor);
            this.editor.layout({
                width: this.viewCell.layoutInfo.editorWidth,
                height: editorHeight
            });
        }
        else {
            this.editorDisposables.clear();
            const width = this.notebookEditor.notebookOptions.computeMarkdownCellEditorWidth(this.notebookEditor.getLayoutInfo().width);
            const lineNum = this.viewCell.lineCount;
            const lineHeight = this.viewCell.layoutInfo.fontInfo?.lineHeight || 17;
            const editorPadding = this.notebookEditor.notebookOptions.computeEditorPadding(this.viewCell.internalMetadata, this.viewCell.uri);
            editorHeight = Math.max(lineNum, 1) * lineHeight + editorPadding.top + editorPadding.bottom;
            this.templateData.editorContainer.innerText = '';
            // create a special context key service that set the inCompositeEditor-contextkey
            const editorContextKeyService = this.contextKeyService.createScoped(this.templateData.editorPart);
            EditorContextKeys.inCompositeEditor.bindTo(editorContextKeyService).set(true);
            const editorInstaService = this.editorDisposables.add(this.instantiationService.createChild(new ServiceCollection([IContextKeyService, editorContextKeyService])));
            this.editorDisposables.add(editorContextKeyService);
            this.editor = this.editorDisposables.add(editorInstaService.createInstance(CodeEditorWidget, this.templateData.editorContainer, {
                ...this.editorOptions,
                dimension: {
                    width: width,
                    height: editorHeight
                },
                allowVariableLineHeights: false,
                // overflowWidgetsDomNode: this.notebookEditor.getOverflowContainerDomNode()
            }, {
                contributions: this.notebookEditor.creationOptions.cellEditorContributions
            }));
            this.templateData.currentEditor = this.editor;
            this.editorDisposables.add(this.editor.onDidBlurEditorWidget(() => {
                if (this.editor) {
                    WordHighlighterContribution.get(this.editor)?.stopHighlighting();
                }
            }));
            this.editorDisposables.add(this.editor.onDidFocusEditorWidget(() => {
                if (this.editor) {
                    WordHighlighterContribution.get(this.editor)?.restoreViewState(true);
                }
            }));
            const cts = new CancellationTokenSource();
            this.editorDisposables.add({ dispose() { cts.dispose(true); } });
            raceCancellation(this.viewCell.resolveTextModel(), cts.token).then(model => {
                if (!model) {
                    return;
                }
                this.editor.setModel(model);
                model.updateOptions({
                    indentSize: this.cellEditorOptions.indentSize,
                    tabSize: this.cellEditorOptions.tabSize,
                    insertSpaces: this.cellEditorOptions.insertSpaces,
                });
                const realContentHeight = this.editor.getContentHeight();
                if (realContentHeight !== editorHeight) {
                    this.editor.layout({
                        width: width,
                        height: realContentHeight
                    });
                    editorHeight = realContentHeight;
                }
                this.viewCell.attachTextEditor(this.editor);
                if (this.viewCell.getEditState() === CellEditState.Editing) {
                    this.focusEditorIfNeeded();
                }
                this.bindEditorListeners(this.editor);
                this.viewCell.editorHeight = editorHeight;
            });
        }
        this.viewCell.editorHeight = editorHeight;
        this.focusEditorIfNeeded();
        this.renderedEditors.set(this.viewCell, this.editor);
    }
    viewUpdatePreview() {
        this.viewCell.detachTextEditor();
        DOM.hide(this.editorPart);
        DOM.hide(this.templateData.cellInputCollapsedContainer);
        this.markdownAccessibilityContainer.ariaHidden = 'false';
        this.templateData.container.classList.toggle('input-collapsed', false);
        this.templateData.container.classList.toggle('markdown-cell-edit-mode', false);
        this.renderedEditors.delete(this.viewCell);
        this.markdownAccessibilityContainer.innerText = '';
        if (this.viewCell.renderedHtml) {
            if (this.accessibilityService.isScreenReaderOptimized()) {
                domSanitize.safeSetInnerHtml(this.markdownAccessibilityContainer, this.viewCell.renderedHtml);
            }
            else {
                DOM.clearNode(this.markdownAccessibilityContainer);
            }
        }
        this.notebookEditor.createMarkupPreview(this.viewCell);
    }
    focusEditorIfNeeded() {
        if (this.viewCell.focusMode === CellFocusMode.Editor &&
            (this.notebookEditor.hasEditorFocus() || this.notebookEditor.getDomNode().ownerDocument.activeElement === this.notebookEditor.getDomNode().ownerDocument.body)) { // Don't steal focus from other workbench parts, but if body has focus, we can take it
            if (!this.editor) {
                return;
            }
            this.editor.focus();
            const primarySelection = this.editor.getSelection();
            if (!primarySelection) {
                return;
            }
            this.notebookEditor.revealRangeInViewAsync(this.viewCell, primarySelection);
        }
    }
    layoutEditor(dimension) {
        this.editor?.layout(dimension);
    }
    onCellEditorWidthChange() {
        const realContentHeight = this.editor.getContentHeight();
        this.layoutEditor({
            width: this.viewCell.layoutInfo.editorWidth,
            height: realContentHeight
        });
        // LET the content size observer to handle it
        // this.viewCell.editorHeight = realContentHeight;
        // this.relayoutCell();
    }
    relayoutCell() {
        this.notebookEditor.layoutNotebookCell(this.viewCell, this.viewCell.layoutInfo.totalHeight);
        this.layoutFoldingIndicator();
    }
    updateEditorOptions(newValue) {
        this.editorOptions = newValue;
        this.editor?.updateOptions(this.editorOptions);
    }
    layoutFoldingIndicator() {
        switch (this.foldingState) {
            case 0 /* CellFoldingState.None */:
                this.templateData.foldingIndicator.style.display = 'none';
                this.templateData.foldingIndicator.innerText = '';
                break;
            case 2 /* CellFoldingState.Collapsed */:
                this.templateData.foldingIndicator.style.display = '';
                DOM.reset(this.templateData.foldingIndicator, renderIcon(collapsedIcon));
                break;
            case 1 /* CellFoldingState.Expanded */:
                this.templateData.foldingIndicator.style.display = '';
                DOM.reset(this.templateData.foldingIndicator, renderIcon(expandedIcon));
                break;
            default:
                break;
        }
    }
    bindEditorListeners(editor) {
        this.localDisposables.clear();
        this.focusSwitchDisposable.clear();
        this.localDisposables.add(editor.onDidContentSizeChange(e => {
            if (e.contentHeightChanged) {
                this.onCellEditorHeightChange(editor, e.contentHeight);
            }
        }));
        this.localDisposables.add(editor.onDidChangeCursorSelection((e) => {
            if (e.source === 'restoreState') {
                // do not reveal the cell into view if this selection change was caused by restoring editors...
                return;
            }
            const selections = editor.getSelections();
            if (selections?.length) {
                const contentHeight = editor.getContentHeight();
                const layoutContentHeight = this.viewCell.layoutInfo.editorHeight;
                if (contentHeight !== layoutContentHeight) {
                    this.onCellEditorHeightChange(editor, contentHeight);
                }
                const lastSelection = selections[selections.length - 1];
                this.notebookEditor.revealRangeInViewAsync(this.viewCell, lastSelection);
            }
        }));
        const updateFocusMode = () => this.viewCell.focusMode = editor.hasWidgetFocus() ? CellFocusMode.Editor : CellFocusMode.Container;
        this.localDisposables.add(editor.onDidFocusEditorWidget(() => {
            updateFocusMode();
        }));
        this.localDisposables.add(editor.onDidBlurEditorWidget(() => {
            // this is for a special case:
            // users click the status bar empty space, which we will then focus the editor
            // so we don't want to update the focus state too eagerly
            if (this.templateData.container.ownerDocument.activeElement?.contains(this.templateData.container)) {
                this.focusSwitchDisposable.value = disposableTimeout(() => updateFocusMode(), 300);
            }
            else {
                updateFocusMode();
            }
        }));
        updateFocusMode();
    }
    onCellEditorHeightChange(editor, newHeight) {
        const viewLayout = editor.getLayoutInfo();
        this.viewCell.editorHeight = newHeight;
        editor.layout({
            width: viewLayout.width,
            height: newHeight
        });
    }
};
MarkupCell = __decorate([
    __param(4, IAccessibilityService),
    __param(5, IContextKeyService),
    __param(6, IInstantiationService),
    __param(7, ILanguageService),
    __param(8, IConfigurationService),
    __param(9, IKeybindingService)
], MarkupCell);
export { MarkupCell };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWFya3VwQ2VsbC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL25vdGVib29rL2Jyb3dzZXIvdmlldy9jZWxsUGFydHMvbWFya3VwQ2VsbC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7OztBQUVoRyxPQUFPLEtBQUssR0FBRyxNQUFNLHVDQUF1QyxDQUFDO0FBQzdELE9BQU8sS0FBSyxXQUFXLE1BQU0sK0NBQStDLENBQUM7QUFDN0UsT0FBTyxFQUFFLFVBQVUsRUFBRSxNQUFNLDJEQUEyRCxDQUFDO0FBQ3ZGLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxnQkFBZ0IsRUFBRSxNQUFNLHdDQUF3QyxDQUFDO0FBQzdGLE9BQU8sRUFBRSx1QkFBdUIsRUFBRSxNQUFNLCtDQUErQyxDQUFDO0FBQ3hGLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSwyQ0FBMkMsQ0FBQztBQUNwRSxPQUFPLEVBQUUsU0FBUyxFQUFFLE1BQU0sNENBQTRDLENBQUM7QUFDdkUsT0FBTyxFQUFFLFVBQVUsRUFBRSxlQUFlLEVBQUUsaUJBQWlCLEVBQUUsWUFBWSxFQUFFLE1BQU0sNENBQTRDLENBQUM7QUFFMUgsT0FBTyxFQUFFLGdCQUFnQixFQUFFLE1BQU0sd0VBQXdFLENBQUM7QUFFMUcsT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0sc0RBQXNELENBQUM7QUFDekYsT0FBTyxFQUFFLGdCQUFnQixFQUFFLE1BQU0sdURBQXVELENBQUM7QUFDekYsT0FBTyxFQUFFLG9CQUFvQixFQUFFLE1BQU0sa0VBQWtFLENBQUM7QUFFeEcsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLDBCQUEwQixDQUFDO0FBQ3BELE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLGtFQUFrRSxDQUFDO0FBQ3pHLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFN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