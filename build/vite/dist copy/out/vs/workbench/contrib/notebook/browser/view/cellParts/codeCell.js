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
// allow-any-unicode-comment-file
import { localize } from '../../../../../../nls.js';
import * as DOM from '../../../../../../base/browser/dom.js';
import { raceCancellation } from '../../../../../../base/common/async.js';
import { CancellationTokenSource } from '../../../../../../base/common/cancellation.js';
import { Codicon } from '../../../../../../base/common/codicons.js';
import { Event } from '../../../../../../base/common/event.js';
import { Disposable, toDisposable } from '../../../../../../base/common/lifecycle.js';
import { clamp } from '../../../../../../base/common/numbers.js';
import * as strings from '../../../../../../base/common/strings.js';
import { ThemeIcon } from '../../../../../../base/common/themables.js';
import { ILanguageService } from '../../../../../../editor/common/languages/language.js';
import { tokenizeToStringSync } from '../../../../../../editor/common/languages/textToHtmlTokenizer.js';
import { CodeActionController } from '../../../../../../editor/contrib/codeAction/browser/codeActionController.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { IKeybindingService } from '../../../../../../platform/keybinding/common/keybinding.js';
import { INotebookExecutionStateService } from '../../../common/notebookExecutionStateService.js';
import { CellFocusMode, EXPAND_CELL_INPUT_COMMAND_ID } from '../../notebookBrowser.js';
import { outputDisplayLimit } from '../../viewModel/codeCellViewModel.js';
import { collapsedCellTTPolicy } from '../notebookRenderingCommon.js';
import { CellEditorOptions } from './cellEditorOptions.js';
import { CellOutputContainer } from './cellOutput.js';
import { CollapsedCodeCellExecutionIcon } from './codeCellExecutionIcon.js';
import { INotebookLoggingService } from '../../../common/notebookLoggingService.js';
let CodeCell = class CodeCell extends Disposable {
    constructor(notebookEditor, viewCell, templateData, editorPool, instantiationService, keybindingService, languageService, configurationService, notebookExecutionStateService, notebookLogService) {
        super();
        this.notebookEditor = notebookEditor;
        this.viewCell = viewCell;
        this.templateData = templateData;
        this.editorPool = editorPool;
        this.instantiationService = instantiationService;
        this.keybindingService = keybindingService;
        this.languageService = languageService;
        this.configurationService = configurationService;
        this._isDisposed = false;
        this._useNewApproachForEditorLayout = true;
        this._pointerDownInEditor = false;
        this._pointerDraggingInEditor = false;
        const cellIndex = this.notebookEditor.getCellIndex(this.viewCell);
        const debugPrefix = `[Cell ${cellIndex}]`;
        const debug = this._debug = (output) => {
            notebookLogService.debug('CellLayout', `${debugPrefix} ${output}`);
        };
        this._cellEditorOptions = this._register(new CellEditorOptions(this.notebookEditor.getBaseCellEditorOptions(viewCell.language), this.notebookEditor.notebookOptions, this.configurationService));
        this._outputContainerRenderer = this.instantiationService.createInstance(CellOutputContainer, notebookEditor, viewCell, templateData, { limit: outputDisplayLimit });
        this.cellParts = this._register(templateData.cellParts.concatContentPart([this._cellEditorOptions, this._outputContainerRenderer], DOM.getWindow(notebookEditor.getDomNode())));
        const initialEditorDimension = { height: this.calculateInitEditorHeight(), width: this.viewCell.layoutInfo.editorWidth };
        this._cellLayout = new CodeCellLayout(this._useNewApproachForEditorLayout, notebookEditor, viewCell, templateData, { debug }, initialEditorDimension);
        this.initializeEditor(initialEditorDimension);
        this._renderedInputCollapseState = false; // editor is always expanded initially
        this.registerNotebookEditorListeners();
        this.registerViewCellLayoutChange();
        this.registerCellEditorEventListeners();
        this.registerMouseListener();
        this._register(Event.any(this.viewCell.onDidStartExecution, this.viewCell.onDidStopExecution)((e) => {
            this.cellParts.updateForExecutionState(this.viewCell, e);
        }));
        this._register(this.viewCell.onDidChangeState(e => {
            this.cellParts.updateState(this.viewCell, e);
            if (e.outputIsHoveredChanged) {
                this.updateForOutputHover();
            }
            if (e.outputIsFocusedChanged) {
                this.updateForOutputFocus();
            }
            if (e.metadataChanged || e.internalMetadataChanged) {
                this.updateEditorOptions();
            }
            if (e.inputCollapsedChanged || e.outputCollapsedChanged) {
                this.viewCell.pauseLayout();
                const updated = this.updateForCollapseState();
                this.viewCell.resumeLayout();
                if (updated) {
                    this.relayoutCell();
                }
            }
            if (e.focusModeChanged) {
                this.updateEditorForFocusModeChange(true);
            }
        }));
        this.updateEditorOptions();
        this.updateEditorForFocusModeChange(false);
        this.updateForOutputHover();
        this.updateForOutputFocus();
        this.cellParts.scheduleRenderCell(this.viewCell);
        this._register(toDisposable(() => {
            this.cellParts.unrenderCell(this.viewCell);
        }));
        // Render Outputs
        this.viewCell.editorHeight = initialEditorDimension.height;
        this._outputContainerRenderer.render();
        this._renderedOutputCollapseState = false; // the output is always rendered initially
        // Need to do this after the intial renderOutput
        this.initialViewUpdateExpanded();
        this._register(this.viewCell.onLayoutInfoRead(() => {
            this.cellParts.prepareLayout();
        }));
        const executionItemElement = DOM.append(this.templateData.cellInputCollapsedContainer, DOM.$('.collapsed-execution-icon'));
        this._register(toDisposable(() => {
            executionItemElement.remove();
        }));
        this._collapsedExecutionIcon = this._register(this.instantiationService.createInstance(CollapsedCodeCellExecutionIcon, this.notebookEditor, this.viewCell, executionItemElement));
        this.updateForCollapseState();
        this._register(Event.runAndSubscribe(viewCell.onDidChangeOutputs, this.updateForOutputs.bind(this)));
        this._register(Event.runAndSubscribe(viewCell.onDidChangeLayout, this.updateForLayout.bind(this)));
        this._cellEditorOptions.setLineNumbers(this.viewCell.lineNumbers);
        templateData.editor.updateOptions(this._cellEditorOptions.getUpdatedValue(this.viewCell.internalMetadata, this.viewCell.uri));
    }
    updateCodeCellOptions(templateData) {
        templateData.editor.updateOptions(this._cellEditorOptions.getUpdatedValue(this.viewCell.internalMetadata, this.viewCell.uri));
        const cts = new CancellationTokenSource();
        this._register({ dispose() { cts.dispose(true); } });
        raceCancellation(this.viewCell.resolveTextModel(), cts.token).then(model => {
            if (this._isDisposed) {
                return;
            }
            if (model) {
                model.updateOptions({
                    indentSize: this._cellEditorOptions.indentSize,
                    tabSize: this._cellEditorOptions.tabSize,
                    insertSpaces: this._cellEditorOptions.insertSpaces,
                });
            }
        });
    }
    updateForLayout() {
        this._pendingLayout?.dispose();
        this._pendingLayout = DOM.modify(DOM.getWindow(this.notebookEditor.getDomNode()), () => {
            this.cellParts.updateInternalLayoutNow(this.viewCell);
        });
    }
    updateForOutputHover() {
        this.templateData.container.classList.toggle('cell-output-hover', this.viewCell.outputIsHovered);
    }
    updateForOutputFocus() {
        this.templateData.container.classList.toggle('cell-output-focus', this.viewCell.outputIsFocused);
    }
    calculateInitEditorHeight() {
        const lineNum = this.viewCell.lineCount;
        const lineHeight = this.viewCell.layoutInfo.fontInfo?.lineHeight || 17;
        const editorPadding = this.notebookEditor.notebookOptions.computeEditorPadding(this.viewCell.internalMetadata, this.viewCell.uri);
        const editorHeight = this.viewCell.layoutInfo.editorHeight === 0
            ? lineNum * lineHeight + editorPadding.top + editorPadding.bottom
            : this.viewCell.layoutInfo.editorHeight;
        return editorHeight;
    }
    initializeEditor(dimension) {
        this._debug(`Initialize Editor ${dimension.height} x ${dimension.width}, Scroll Top = ${this.notebookEditor.scrollTop}`);
        this._cellLayout.layoutEditor('init');
        this.layoutEditor(dimension);
        const cts = new CancellationTokenSource();
        this._register({ dispose() { cts.dispose(true); } });
        raceCancellation(this.viewCell.resolveTextModel(), cts.token).then(model => {
            if (this._isDisposed || model?.isDisposed()) {
                return;
            }
            if (model && this.templateData.editor) {
                this._reigsterModelListeners(model);
                // set model can trigger view update, which can lead to dispose of this cell
                this.templateData.editor.setModel(model);
                if (this._isDisposed) {
                    return;
                }
                model.updateOptions({
                    indentSize: this._cellEditorOptions.indentSize,
                    tabSize: this._cellEditorOptions.tabSize,
                    insertSpaces: this._cellEditorOptions.insertSpaces,
                });
                this.viewCell.attachTextEditor(this.templateData.editor, this.viewCell.layoutInfo.estimatedHasHorizontalScrolling);
                const focusEditorIfNeeded = () => {
                    if (this.notebookEditor.getActiveCell() === this.viewCell &&
                        this.viewCell.focusMode === CellFocusMode.Editor &&
                        (this.notebookEditor.hasEditorFocus() || this.notebookEditor.getDomNode().ownerDocument.activeElement === this.notebookEditor.getDomNode().ownerDocument.body)) // Don't steal focus from other workbench parts, but if body has focus, we can take it
                     {
                        this.templateData.editor.focus();
                    }
                };
                focusEditorIfNeeded();
                const realContentHeight = this.templateData.editor.getContentHeight();
                if (realContentHeight !== dimension.height) {
                    this.onCellEditorHeightChange('onDidResolveTextModel');
                }
                if (this._isDisposed) {
                    return;
                }
                focusEditorIfNeeded();
            }
            this._register(this._cellEditorOptions.onDidChange(() => this.updateCodeCellOptions(this.templateData)));
        });
    }
    updateForOutputs() {
        DOM.setVisibility(this.viewCell.outputsViewModels.length > 0, this.templateData.focusSinkElement);
    }
    updateEditorOptions() {
        const editor = this.templateData.editor;
        if (!editor) {
            return;
        }
        const isReadonly = this.notebookEditor.isReadOnly;
        const padding = this.notebookEditor.notebookOptions.computeEditorPadding(this.viewCell.internalMetadata, this.viewCell.uri);
        const options = editor.getOptions();
        if (options.get(104 /* EditorOption.readOnly */) !== isReadonly || options.get(96 /* EditorOption.padding */) !== padding) {
            editor.updateOptions({
                readOnly: this.notebookEditor.isReadOnly, padding: this.notebookEditor.notebookOptions.computeEditorPadding(this.viewCell.internalMetadata, this.viewCell.uri)
            });
        }
    }
    registerNotebookEditorListeners() {
        this._register(this.notebookEditor.onDidScroll(() => {
            this.adjustEditorPosition();
            this._cellLayout.layoutEditor('nbDidScroll');
        }));
        this._register(this.notebookEditor.onDidChangeLayout(() => {
            this.adjustEditorPosition();
            this.onCellWidthChange('nbLayoutChange');
        }));
    }
    adjustEditorPosition() {
        if (this._useNewApproachForEditorLayout) {
            return;
        }
        const extraOffset = -6 /** distance to the top of the cell editor, which is 6px under the focus indicator */ - 1 /** border */;
        const min = 0;
        const scrollTop = this.notebookEditor.scrollTop;
        const elementTop = this.notebookEditor.getAbsoluteTopOfElement(this.viewCell);
        const diff = scrollTop - elementTop + extraOffset;
        const notebookEditorLayout = this.notebookEditor.getLayoutInfo();
        // we should stop adjusting the top when users are viewing the bottom of the cell editor
        const editorMaxHeight = notebookEditorLayout.height
            - notebookEditorLayout.stickyHeight
            - 26 /** notebook toolbar */;
        const maxTop = this.viewCell.layoutInfo.editorHeight
            // + this.viewCell.layoutInfo.statusBarHeight
            - editorMaxHeight;
        const top = maxTop > 20 ?
            clamp(min, diff, maxTop) :
            min;
        this.templateData.editorPart.style.top = `${top}px`;
        // scroll the editor with top
        this.templateData.editor.setScrollTop(top);
    }
    registerViewCellLayoutChange() {
        this._register(this.viewCell.onDidChangeLayout((e) => {
            if (e.outerWidth !== undefined) {
                const layoutInfo = this.templateData.editor.getLayoutInfo();
                if (layoutInfo.width !== this.viewCell.layoutInfo.editorWidth) {
                    this.onCellWidthChange('viewCellLayoutChange');
                    this.adjustEditorPosition();
                }
            }
        }));
    }
    registerCellEditorEventListeners() {
        this._register(this.templateData.editor.onDidContentSizeChange((e) => {
            if (e.contentHeightChanged) {
                if (this.viewCell.layoutInfo.editorHeight !== e.contentHeight) {
                    this.onCellEditorHeightChange(`onDidContentSizeChange`);
                    this.adjustEditorPosition();
                }
            }
        }));
        if (this._useNewApproachForEditorLayout) {
            this._register(this.templateData.editor.onDidScrollChange(e => {
                // Option 4: Gate scroll-driven reactions during active drag-selection
                if (this._pointerDownInEditor || this._pointerDraggingInEditor) {
                    return;
                }
                if (this._cellLayout.editorVisibility === 'Invisible' || !this.templateData.editor.hasTextFocus()) {
                    return;
                }
                if (this._cellLayout._lastChangedEditorScrolltop === e.scrollTop || this._cellLayout.isUpdatingLayout) {
                    return;
                }
                const scrollTop = this.notebookEditor.scrollTop;
                const diff = e.scrollTop - (this._cellLayout._lastChangedEditorScrolltop ?? 0);
                if (this._cellLayout.editorVisibility === 'Full (Small Viewport)' && typeof this._cellLayout._lastChangedEditorScrolltop === 'number') {
                    this._debug(`Scroll Change (1) = ${e.scrollTop} changed by ${diff} (notebook scrollTop: ${scrollTop}, setEditorScrollTop: ${e.scrollTop})`);
                    // this.templateData.editor.setScrollTop(e.scrollTop);
                }
                else if (this._cellLayout.editorVisibility === 'Bottom Clipped' && typeof this._cellLayout._lastChangedEditorScrolltop === 'number') {
                    this._debug(`Scroll Change (2) = ${e.scrollTop} changed by ${diff} (notebook scrollTop: ${scrollTop}, setNotebookScrollTop: ${scrollTop + e.scrollTop})`);
                    this.notebookEditor.setScrollTop(scrollTop + e.scrollTop);
                }
                else if (this._cellLayout.editorVisibility === 'Top Clipped' && typeof this._cellLayout._lastChangedEditorScrolltop === 'number') {
                    const newScrollTop = scrollTop + diff - 1;
                    this._debug(`Scroll Change (3) = ${e.scrollTop} changed by ${diff} (notebook scrollTop: ${scrollTop}, setNotebookScrollTop?: ${newScrollTop})`);
                    if (scrollTop !== newScrollTop) {
                        this.notebookEditor.setScrollTop(newScrollTop);
                    }
                }
                else {
                    this._debug(`Scroll Change (4) = ${e.scrollTop} changed by ${diff} (notebook scrollTop: ${scrollTop})`);
                    this._cellLayout._lastChangedEditorScrolltop = undefined;
                }
            }));
        }
        this._register(this.templateData.editor.onDidChangeCursorSelection((e) => {
            if (
            // do not reveal the cell into view if this selection change was caused by restoring editors
            e.source === 'restoreState' || e.oldModelVersionId === 0
                // nor if the text editor is not actually focused (e.g. inline chat is focused and modifying the cell content)
                || !this.templateData.editor.hasTextFocus()) {
                return;
            }
            // Option 3: Avoid relayouts during active pointer drag to prevent stuck selection mode
            if ((this._pointerDownInEditor || this._pointerDraggingInEditor) && this._useNewApproachForEditorLayout) {
                return;
            }
            const selections = this.templateData.editor.getSelections();
            if (selections?.length) {
                const contentHeight = this.templateData.editor.getContentHeight();
                const layoutContentHeight = this.viewCell.layoutInfo.editorHeight;
                if (contentHeight !== layoutContentHeight) {
                    if (!this._useNewApproachForEditorLayout) {
                        this._debug(`onDidChangeCursorSelection`);
                        this.onCellEditorHeightChange('onDidChangeCursorSelection');
                    }
                    if (this._isDisposed) {
                        return;
                    }
                }
                const lastSelection = selections[selections.length - 1];
                this.notebookEditor.revealRangeInViewAsync(this.viewCell, lastSelection);
            }
        }));
        this._register(this.templateData.editor.onDidBlurEditorWidget(() => {
            CodeActionController.get(this.templateData.editor)?.hideLightBulbWidget();
        }));
    }
    _reigsterModelListeners(model) {
        this._register(model.onDidChangeTokens(() => {
            if (this.viewCell.isInputCollapsed && this._inputCollapseElement) {
                // flush the collapsed input with the latest tokens
                const content = this._getRichTextFromLineTokens(model);
                this._inputCollapseElement.innerHTML = (collapsedCellTTPolicy?.createHTML(content) ?? content);
                this._attachInputExpandButton(this._inputCollapseElement);
            }
        }));
    }
    registerMouseListener() {
        // Pointer-state handling in notebook cell editors has a couple of easy-to-regress edge cases:
        // 1) Holding the left mouse button while wheel/trackpad scrolling should scroll as usual.
        //    We therefore only treat the interaction as an "active drag selection" after actual pointer movement.
        // 2) "Stuck selection mode" can occur if we miss the corresponding mouseup (e.g. releasing outside the window,
        //    focus loss, or ESC cancelling Monaco selection/drag). When this happens, leaving any of our drag/pointer
        //    flags set will incorrectly gate scroll/layout syncing and make the editor feel stuck.
        //    To avoid that, we reset state on multiple cancellation paths and also self-heal on mousemove.
        const resetPointerState = () => {
            this._pointerDownInEditor = false;
            this._pointerDraggingInEditor = false;
            this._cellLayout.setPointerDown(false);
        };
        this._register(this.templateData.editor.onMouseDown(e => {
            // prevent default on right mouse click, otherwise it will trigger unexpected focus changes
            // the catch is, it means we don't allow customization of right button mouse down handlers other than the built in ones.
            if (e.event.rightButton) {
                e.event.preventDefault();
            }
            if (this._useNewApproachForEditorLayout) {
                // Track pointer-down and pointer-drag separately.
                // Holding the left button while wheel/trackpad scrolling should behave like normal scrolling.
                if (e.event.leftButton) {
                    this._pointerDownInEditor = true;
                    this._pointerDraggingInEditor = false;
                    this._cellLayout.setPointerDown(false);
                }
            }
        }));
        if (this._useNewApproachForEditorLayout) {
            this._register(this.templateData.editor.onMouseMove(e => {
                if (!this._pointerDownInEditor) {
                    return;
                }
                // Self-heal: if we missed a mouseup (e.g. focus loss), clear the drag state as soon as we can observe it.
                if (!e.event.leftButton) {
                    resetPointerState();
                    return;
                }
                if (!this._pointerDraggingInEditor) {
                    // Only consider it a drag-selection once the pointer actually moves with the left button down.
                    this._pointerDraggingInEditor = true;
                    this._cellLayout.setPointerDown(true);
                }
            }));
        }
        if (this._useNewApproachForEditorLayout) {
            // Ensure we reset pointer-down even if mouseup lands outside the editor
            const win = DOM.getWindow(this.notebookEditor.getDomNode());
            this._register(DOM.addDisposableListener(win, 'mouseup', resetPointerState));
            this._register(DOM.addDisposableListener(win, 'pointerup', resetPointerState));
            this._register(DOM.addDisposableListener(win, 'pointercancel', resetPointerState));
            this._register(DOM.addDisposableListener(win, 'blur', resetPointerState));
            this._register(DOM.addDisposableListener(win, 'keydown', e => {
                if (e.key === 'Escape' && (this._pointerDownInEditor || this._pointerDraggingInEditor)) {
                    resetPointerState();
                }
            }));
        }
    }
    shouldPreserveEditor() {
        // The DOM focus needs to be adjusted:
        // when a cell editor should be focused
        // the document active element is inside the notebook editor or the document body (cell editor being disposed previously)
        return this.notebookEditor.getActiveCell() === this.viewCell
            && this.viewCell.focusMode === CellFocusMode.Editor
            && (this.notebookEditor.hasEditorFocus() || this.notebookEditor.getDomNode().ownerDocument.activeElement === this.notebookEditor.getDomNode().ownerDocument.body);
    }
    updateEditorForFocusModeChange(sync) {
        if (this.shouldPreserveEditor()) {
            if (sync) {
                this.templateData.editor.focus();
            }
            else {
                this._register(DOM.runAtThisOrScheduleAtNextAnimationFrame(DOM.getWindow(this.templateData.container), () => {
                    this.templateData.editor.focus();
                }));
            }
        }
        this.templateData.container.classList.toggle('cell-editor-focus', this.viewCell.focusMode === CellFocusMode.Editor);
        this.templateData.container.classList.toggle('cell-output-focus', this.viewCell.focusMode === CellFocusMode.Output);
    }
    updateForCollapseState() {
        if (this.viewCell.isOutputCollapsed === this._renderedOutputCollapseState &&
            this.viewCell.isInputCollapsed === this._renderedInputCollapseState) {
            return false;
        }
        this.viewCell.layoutChange({ editorHeight: true });
        if (this.viewCell.isInputCollapsed) {
            this._collapseInput();
        }
        else {
            this._showInput();
        }
        if (this.viewCell.isOutputCollapsed) {
            this._collapseOutput();
        }
        else {
            this._showOutput(false);
        }
        this.relayoutCell();
        this._renderedOutputCollapseState = this.viewCell.isOutputCollapsed;
        this._renderedInputCollapseState = this.viewCell.isInputCollapsed;
        return true;
    }
    _collapseInput() {
        // hide the editor and execution label, keep the run button
        DOM.hide(this.templateData.editorPart);
        this.templateData.container.classList.toggle('input-collapsed', true);
        // remove input preview
        this._removeInputCollapsePreview();
        this._collapsedExecutionIcon.setVisibility(true);
        // update preview
        const richEditorText = this.templateData.editor.hasModel() ? this._getRichTextFromLineTokens(this.templateData.editor.getModel()) : this._getRichText(this.viewCell.textBuffer, this.viewCell.language);
        const element = DOM.$('div.cell-collapse-preview');
        element.innerHTML = (collapsedCellTTPolicy?.createHTML(richEditorText) ?? richEditorText);
        this._inputCollapseElement = element;
        this.templateData.cellInputCollapsedContainer.appendChild(element);
        this._attachInputExpandButton(element);
        DOM.show(this.templateData.cellInputCollapsedContainer);
    }
    _attachInputExpandButton(element) {
        const expandIcon = DOM.$('span.expandInputIcon');
        const keybinding = this.keybindingService.lookupKeybinding(EXPAND_CELL_INPUT_COMMAND_ID);
        if (keybinding) {
            element.title = localize('cellExpandInputButtonLabelWithDoubleClick', "Double-click to expand cell input ({0})", keybinding.getLabel());
            expandIcon.title = localize('cellExpandInputButtonLabel', "Expand Cell Input ({0})", keybinding.getLabel());
        }
        expandIcon.classList.add(...ThemeIcon.asClassNameArray(Codicon.more));
        element.appendChild(expandIcon);
    }
    _showInput() {
        this._collapsedExecutionIcon.setVisibility(false);
        DOM.show(this.templateData.editorPart);
        DOM.hide(this.templateData.cellInputCollapsedContainer);
    }
    _getRichText(buffer, language) {
        return tokenizeToStringSync(this.languageService, buffer.getLineContent(1), language);
    }
    _getRichTextFromLineTokens(model) {
        let result = `<div class="monaco-tokenized-source">`;
        const firstLineTokens = model.tokenization.getLineTokens(1);
        const viewLineTokens = firstLineTokens.inflate();
        const line = model.getLineContent(1);
        let startOffset = 0;
        for (let j = 0, lenJ = viewLineTokens.getCount(); j < lenJ; j++) {
            const type = viewLineTokens.getClassName(j);
            const endIndex = viewLineTokens.getEndOffset(j);
            result += `<span class="${type}">${strings.escape(line.substring(startOffset, endIndex))}</span>`;
            startOffset = endIndex;
        }
        result += `</div>`;
        return result;
    }
    _removeInputCollapsePreview() {
        const children = this.templateData.cellInputCollapsedContainer.children;
        const elements = [];
        for (let i = 0; i < children.length; i++) {
            if (children[i].classList.contains('cell-collapse-preview')) {
                elements.push(children[i]);
            }
        }
        elements.forEach(element => {
            element.remove();
        });
    }
    _updateOutputInnerContainer(hide) {
        const children = this.templateData.outputContainer.domNode.children;
        for (let i = 0; i < children.length; i++) {
            if (children[i].classList.contains('output-inner-container')) {
                DOM.setVisibility(!hide, children[i]);
            }
        }
    }
    _collapseOutput() {
        this.templateData.container.classList.toggle('output-collapsed', true);
        DOM.show(this.templateData.cellOutputCollapsedContainer);
        this._updateOutputInnerContainer(true);
        this._outputContainerRenderer.viewUpdateHideOuputs();
    }
    _showOutput(initRendering) {
        this.templateData.container.classList.toggle('output-collapsed', false);
        DOM.hide(this.templateData.cellOutputCollapsedContainer);
        this._updateOutputInnerContainer(false);
        this._outputContainerRenderer.viewUpdateShowOutputs(initRendering);
    }
    initialViewUpdateExpanded() {
        this.templateData.container.classList.toggle('input-collapsed', false);
        DOM.show(this.templateData.editorPart);
        DOM.hide(this.templateData.cellInputCollapsedContainer);
        this.templateData.container.classList.toggle('output-collapsed', false);
        this._showOutput(true);
    }
    layoutEditor(dimension) {
        if (this._useNewApproachForEditorLayout) {
            return;
        }
        const editorLayout = this.notebookEditor.getLayoutInfo();
        const maxHeight = Math.min(editorLayout.height
            - editorLayout.stickyHeight
            - 26 /** notebook toolbar */, dimension.height);
        this._debug(`Layout Editor: Width = ${dimension.width}, Height = ${maxHeight} (Requested: ${dimension.height}, Editor Layout Height: ${editorLayout.height}, Sticky: ${editorLayout.stickyHeight})`);
        this.templateData.editor.layout({
            width: dimension.width,
            height: maxHeight
        }, true);
    }
    onCellWidthChange(dbgReasonForChange) {
        this._debug(`Cell Editor Width Change, ${dbgReasonForChange}, Content Height = ${this.templateData.editor.getContentHeight()}`);
        const height = this.templateData.editor.getContentHeight();
        if (this.templateData.editor.hasModel()) {
            this._debug(`**** Updating Cell Editor Height (1), ContentHeight: ${height}, CodeCellLayoutInfo.EditorWidth ${this.viewCell.layoutInfo.editorWidth}, EditorLayoutInfo ${this.templateData.editor.getLayoutInfo().height} ****`);
            this.viewCell.editorHeight = height;
            this.relayoutCell();
            this.layoutEditor({
                width: this.viewCell.layoutInfo.editorWidth,
                height
            });
        }
        else {
            this._debug(`Cell Editor Width Change without model, return (1), ContentHeight: ${height}, CodeCellLayoutInfo.EditorWidth ${this.viewCell.layoutInfo.editorWidth}, EditorLayoutInfo ${this.templateData.editor.getLayoutInfo().height}`);
        }
        this._cellLayout.layoutEditor(dbgReasonForChange);
    }
    onCellEditorHeightChange(dbgReasonForChange) {
        const height = this.templateData.editor.getContentHeight();
        if (!this.templateData.editor.hasModel()) {
            this._debug(`Cell Editor Height Change without model, return (2), ContentHeight: ${height}, CodeCellLayoutInfo.EditorWidth ${this.viewCell.layoutInfo.editorWidth}, EditorLayoutInfo ${this.templateData.editor.getLayoutInfo()}`);
        }
        this._debug(`Cell Editor Height Change (${dbgReasonForChange}): ${height}`);
        this._debug(`**** Updating Cell Editor Height (2), ContentHeight: ${height}, CodeCellLayoutInfo.EditorWidth ${this.viewCell.layoutInfo.editorWidth}, EditorLayoutInfo ${this.templateData.editor.getLayoutInfo().height} ****`);
        const viewLayout = this.templateData.editor.getLayoutInfo();
        this.viewCell.editorHeight = height;
        this.relayoutCell();
        this.layoutEditor({
            width: viewLayout.width,
            height
        });
        this._cellLayout.layoutEditor(dbgReasonForChange);
    }
    relayoutCell() {
        this.notebookEditor.layoutNotebookCell(this.viewCell, this.viewCell.layoutInfo.totalHeight);
    }
    dispose() {
        this._isDisposed = true;
        // move focus back to the cell list otherwise the focus goes to body
        if (this.shouldPreserveEditor()) {
            // now the focus is on the monaco editor for the cell but detached from the rows.
            this.editorPool.preserveFocusedEditor(this.viewCell);
        }
        this.viewCell.detachTextEditor();
        this._removeInputCollapsePreview();
        this._outputContainerRenderer.dispose();
        this._pendingLayout?.dispose();
        super.dispose();
    }
};
CodeCell = __decorate([
    __param(4, IInstantiationService),
    __param(5, IKeybindingService),
    __param(6, ILanguageService),
    __param(7, IConfigurationService),
    __param(8, INotebookExecutionStateService),
    __param(9, INotebookLoggingService)
], CodeCell);
export { CodeCell };
export class CodeCellLayout {
    get editorVisibility() {
        return this._editorVisibility;
    }
    get isUpdatingLayout() {
        return this._isUpdatingLayout;
    }
    constructor(_enabled, notebookEditor, viewCell, templateData, _logService, _initialEditorDimension) {
        this._enabled = _enabled;
        this.notebookEditor = notebookEditor;
        this.viewCell = viewCell;
        this.templateData = templateData;
        this._logService = _logService;
        this._initialEditorDimension = _initialEditorDimension;
        this._initialized = false;
        this._pointerDown = false;
    }
    setPointerDown(isDown) {
        this._pointerDown = isDown;
    }
    /**
     * Dynamically lays out the code cell's Monaco editor to simulate a "sticky" run/exec area while
     * constraining the visible editor height to the notebook viewport. It adjusts two things:
     *  - The absolute `top` offset of the editor part inside the cell (so the run / execution order
     *    area remains visible for a limited vertical travel band ~45px).
     *  - The editor's layout height plus the editor's internal scroll position (`editorScrollTop`) to
     *    crop content when the cell is partially visible (top or bottom clipped) or when content is
     *    taller than the viewport.
     *
     * Additional invariants:
     *  - Content height stability: once the layout has been initialized, scroll-driven re-layouts can
     *    observe transient Monaco content heights that reflect the current clipped layout (rather than
     *    the full input height). To keep the notebook list layout stable (avoiding overlapping cells
     *    while navigating/scrolling), we store the actual content height in `_establishedContentHeight`
     *    and reuse it for scroll-driven relayouts. This prevents the editor from shrinking back to its
     *    initial height after content has been added (e.g., pasting text) or when Monaco reports a
     *    transient smaller content height while the cell is clipped.
     *
     *    We refresh `_establishedContentHeight` when the editor's content size changes
     *    (`onDidContentSizeChange`) and also when width/layout changes can affect wrapping-driven height
     *    (`viewCellLayoutChange`/`nbLayoutChange`).
     *  - Pointer-drag gating: while the user is holding the mouse button down in the editor (drag
     *    selection or potential drag selection), we avoid programmatic `editor.setScrollTop(...)` updates
     *    to prevent selection/scroll feedback loops and "stuck selection" behavior.
     *
     * ---------------------------------------------------------------------------
     * SECTION 1. OVERALL NOTEBOOK VIEW (EACH CELL HAS AN 18px GAP ABOVE IT)
     * Legend:
     *   GAP (between cells & before first cell) ............. 18px
     *   CELL PADDING (top & bottom inside cell) ............. 6px
     *   STATUS BAR HEIGHT (typical) ......................... 22px
     *   LINE HEIGHT (logic clamp) ........................... 21px
     *   BORDER/OUTLINE HEIGHT (visual conceal adjustment) ... 1px
     *   EDITOR_HEIGHT (example visible editor) .............. 200px (capped by viewport)
     *   EDITOR_CONTENT_HEIGHT (example full content) ........ 380px (e.g. 50 lines)
     *   extraOffset = -(CELL_PADDING + BORDER_HEIGHT) ....... -7
     *
     *   (The list ensures the editor's laid out height never exceeds viewport height.)
     *
     *   ┌────────────────────────────── Notebook Viewport (scrolling container) ────────────────────────────┐
     *   │ (scrollTop)                                                                                       │
     *   │                                                                                                   │
     *   │  18px GAP (top spacing before first cell)                                                         │
     *   │  ▼                                                                                                │
     *   │  ┌──────── Cell A Outer Container ────────────────────────────────────────────────────────────┐   │
     *   │  │ ▲ 6px top padding                                                                          │   │
     *   │  │ │                                                                                          │   │
     *   │  │ │  ┌─ Execution Order / Run Column (~45px vertical travel band)─┐  ┌─ Editor Part ───────┐ │   │
     *   │  │ │  │ (Run button, execution # label)                            │  │ Visible Lines ...   │ │   │
     *   │  │ │  │                                                            │  │                     │ │   │
     *   │  │ │  │                                                            │  │ EDITOR_HEIGHT=200px │ │   │
     *   │  │ │  │                                                            │  │ (Content=380px)     │ │   │
     *   │  │ │  └────────────────────────────────────────────────────────────┘  └─────────────────────┘ │   │
     *   │  │ │                                                                                          │   │
     *   │  │ │  ┌─ Status Bar (22px) ─────────────────────────────────────────────────────────────────┐ │   │
     *   │  │ │  │ language | indent | selection info | kernel/status bits ...                         │ │   │
     *   │  │ │  └─────────────────────────────────────────────────────────────────────────────────────┘ │   │
     *   │  │ │                                                                                          │   │
     *   │  │ ▼ 6px bottom padding                                                                       │   │
     *   │  └────────────────────────────────────────────────────────────────────────────────────────────┘   │
     *   │  18px GAP                                                                                         │
     *   │  ┌──────── Cell B Outer Container ────────────────────────────────────────────────────────────┐   │
     *   │  │ (same structure as Cell A)                                                                 │   │
     *   │  └────────────────────────────────────────────────────────────────────────────────────────────┘   │
     *   │                                                                                                   │
     *   │ (scrollBottom)                                                                                    │
     *   └───────────────────────────────────────────────────────────────────────────────────────────────────┘
     *
     * SECTION 2. SINGLE CELL STRUCTURE (VERTICAL LAYERS)
     *
     *   Inter-Cell GAP (18px)
     *   ┌─────────────────────────────── Cell Wrapper (<li>) ──────────────────────────────┐
     *   │ ┌──────────────────────────── .cell-inner-container ───────────────────────────┐ │
     *   │ │ 6px top padding                                                              │ │
     *   │ │                                                                              │ │
     *   │ │ ┌─ Left Gutter (Run / Exec / Focus Border) ─┬──────── Editor Part ─────────┐ │ │
     *   │ │ │  Sticky vertical travel (~45px allowance) │  (Monaco surface)            │ │ │
     *   │ │ │                                         │  Visible height 200px          │ │ │
     *   │ │ │                                         │  Content height 380px          │ │ │
     *   │ │ └─────────────────────────────────────────┴────────────────────────────────┘ │ │
     *   │ │                                                                              │ │
     *   │ │ ┌─ Status Bar (22px) ──────────────────────────────────────────────────────┐ │ │
     *   │ │ │ language | indent | selection | kernel | state                           │ │ │
     *   │ │ └──────────────────────────────────────────────────────────────────────────┘ │ │
     *   │ │ 6px bottom padding                                                           │ │
     *   │ └──────────────────────────────────────────────────────────────────────────────┘ │
     *   │ (Outputs region begins at outputContainerOffset below input area)                │
     *   └──────────────────────────────────────────────────────────────────────────────────┘
     */
    layoutEditor(reason) {
        if (!this._enabled) {
            return;
        }
        const element = this.templateData.editorPart;
        if (this.viewCell.isInputCollapsed) {
            element.style.top = '';
            return;
        }
        const LINE_HEIGHT = this.notebookEditor.getLayoutInfo().fontInfo.lineHeight; // 21;
        const CELL_TOP_MARGIN = this.viewCell.layoutInfo.topMargin;
        const CELL_OUTLINE_WIDTH = this.viewCell.layoutInfo.outlineWidth; // 1 extra px for border (we don't want to be able to see the cell border when scrolling up);
        const STATUSBAR_HEIGHT = this.viewCell.layoutInfo.statusBarHeight;
        const editor = this.templateData.editor;
        const editorLayout = this.templateData.editor.getLayoutInfo();
        // If we've already initialized once, we should use the viewCell layout info for editor width.
        // E.g. when resizing VS Code window or notebook editor (horizontal space changes).
        const editorWidth = this._initialized && (reason === 'nbLayoutChange' || reason === 'viewCellLayoutChange') ? this.viewCell.layoutInfo.editorWidth : editorLayout.width;
        const editorHeight = this.viewCell.layoutInfo.editorHeight;
        const scrollTop = this.notebookEditor.scrollTop;
        const elementTop = this.notebookEditor.getAbsoluteTopOfElement(this.viewCell);
        const elementBottom = this.notebookEditor.getAbsoluteBottomOfElement(this.viewCell);
        const elementHeight = this.notebookEditor.getHeightOfElement(this.viewCell);
        let editorContentHeight;
        const isInit = !this._initialized && reason === 'init';
        if (isInit) {
            // CONTENT HEIGHT SELECTION (INIT)
            // -------------------------------
            // Editors are pooled and may be re-attached to different cells as the user scrolls.
            // At the moment a pooled editor is first attached to a new cell, Monaco can still
            // report the previous cell's `getContentHeight()` (for example a tall multi-line
            // cell) even though the new cell only contains a single line. If we trusted that
            // stale value here, the very first layout of the new cell would render with an
            // oversized editor and visually overlap the next cell.
            //
            // To avoid this, the initial layout ignores `getContentHeight()` entirely and uses
            // the notebook's own notion of the editor height for this cell
            // (`_initialEditorDimension.height`). This value is derived from the cell model
            // (line count + padding) and is stable across editor reuse. Once the model has
            // been resolved and Monaco reports a real content height, subsequent layout
            // reasons (`onDidContentSizeChange`, `viewCellLayoutChange`, `nbLayoutChange`)
            // will refresh `_establishedContentHeight` in the normal way.
            editorContentHeight = this._initialEditorDimension.height;
            this._establishedContentHeight = editorContentHeight;
        }
        else {
            // CONTENT HEIGHT SELECTION (NON-INIT)
            // -----------------------------------
            // For all non-init reasons, we rely on Monaco's `getContentHeight()` together with
            // `_establishedContentHeight` to keep the notebook list layout stable while
            // scrolling and resizing:
            //  - `onDidContentSizeChange` / `viewCellLayoutChange` / `nbLayoutChange` update
            //    `_establishedContentHeight` to the latest full content height.
            //  - `nbDidScroll` reuses `_establishedContentHeight` so that transient, smaller
            //    values reported while the editor itself is clipped do not shrink the row
            //    height (which would otherwise cause overlapping cells).
            const gotContentHeight = editor.getContentHeight();
            // If we've already calculated the editor content height once before and the contents haven't changed, use that.
            const fallbackEditorContentHeight = gotContentHeight === -1 ? Math.max(editor.getLayoutInfo().height, this._initialEditorDimension.height) : gotContentHeight;
            const shouldRefreshContentHeight = !this._initialized || reason === 'onDidContentSizeChange' || reason === 'viewCellLayoutChange' || reason === 'nbLayoutChange';
            if (shouldRefreshContentHeight) {
                // Update the established content height when content changes, during initialization,
                // or when width/layout changes can affect wrapping-driven height.
                editorContentHeight = fallbackEditorContentHeight;
                this._establishedContentHeight = editorContentHeight;
            }
            else {
                // Reuse the previously established content height to avoid transient Monaco content height changes during scroll
                editorContentHeight = this._establishedContentHeight ?? fallbackEditorContentHeight;
            }
        }
        const editorBottom = elementTop + this.viewCell.layoutInfo.outputContainerOffset;
        const scrollBottom = this.notebookEditor.scrollBottom;
        // When loading, scrollBottom -scrollTop === 0;
        const viewportHeight = scrollBottom - scrollTop === 0 ? this.notebookEditor.getLayoutInfo().height : scrollBottom - scrollTop;
        const outputContainerOffset = this.viewCell.layoutInfo.outputContainerOffset;
        const scrollDirection = typeof this._previousScrollBottom === 'number' ? (scrollBottom < this._previousScrollBottom ? 'up' : 'down') : 'down';
        this._previousScrollBottom = scrollBottom;
        let top = Math.max(0, scrollTop - elementTop - CELL_TOP_MARGIN - CELL_OUTLINE_WIDTH);
        const possibleEditorHeight = editorHeight - top;
        if (possibleEditorHeight < LINE_HEIGHT) {
            top = top - (LINE_HEIGHT - possibleEditorHeight) - CELL_OUTLINE_WIDTH;
        }
        let height = editorContentHeight;
        let editorScrollTop = 0;
        if (scrollTop <= (elementTop + CELL_TOP_MARGIN)) {
            const minimumEditorHeight = LINE_HEIGHT + this.notebookEditor.notebookOptions.getLayoutConfiguration().editorTopPadding;
            if (scrollBottom >= editorBottom) {
                height = clamp(editorContentHeight, minimumEditorHeight, editorContentHeight);
                this._editorVisibility = 'Full';
            }
            else {
                height = clamp(scrollBottom - (elementTop + CELL_TOP_MARGIN) - STATUSBAR_HEIGHT, minimumEditorHeight, editorContentHeight) + (2 * CELL_OUTLINE_WIDTH); // We don't want bottom border to be visible.;
                this._editorVisibility = 'Bottom Clipped';
                editorScrollTop = 0;
            }
        }
        else {
            if (viewportHeight <= editorContentHeight && scrollBottom <= editorBottom) {
                const minimumEditorHeight = LINE_HEIGHT + this.notebookEditor.notebookOptions.getLayoutConfiguration().editorTopPadding;
                height = clamp(viewportHeight - STATUSBAR_HEIGHT, minimumEditorHeight, editorContentHeight - STATUSBAR_HEIGHT) + (2 * CELL_OUTLINE_WIDTH); // We don't want bottom border to be visible.
                this._editorVisibility = 'Full (Small Viewport)';
                editorScrollTop = top;
            }
            else {
                const minimumEditorHeight = LINE_HEIGHT;
                height = clamp(editorContentHeight - (scrollTop - (elementTop + CELL_TOP_MARGIN)), minimumEditorHeight, editorContentHeight);
                // Check if the cell is visible.
                if (scrollTop > editorBottom) {
                    this._editorVisibility = 'Invisible';
                }
                else {
                    this._editorVisibility = 'Top Clipped';
                }
                editorScrollTop = editorContentHeight - height;
            }
        }
        this._logService.debug(`${reason} (${this._editorVisibility}, ${this._initialized})`);
        this._logService.debug(`=> Editor Top = ${top}px (editHeight = ${editorHeight}, editContentHeight: ${editorContentHeight})`);
        this._logService.debug(`=> eleTop = ${elementTop}, eleBottom = ${elementBottom}, eleHeight = ${elementHeight}`);
        this._logService.debug(`=> scrollTop = ${scrollTop}, top = ${top}`);
        this._logService.debug(`=> cellTopMargin = ${CELL_TOP_MARGIN}, cellBottomMargin = ${this.viewCell.layoutInfo.topMargin}, cellOutline = ${CELL_OUTLINE_WIDTH}`);
        this._logService.debug(`=> scrollBottom: ${scrollBottom}, editBottom: ${editorBottom}, viewport: ${viewportHeight}, scroll: ${scrollDirection}, contOffset: ${outputContainerOffset})`);
        this._logService.debug(`=> Editor Height = ${height}px, Width: ${editorWidth}px, Initial Width: ${this._initialEditorDimension.width}, EditorScrollTop = ${editorScrollTop}px, StatusbarHeight = ${STATUSBAR_HEIGHT}, lineHeight = ${this.notebookEditor.getLayoutInfo().fontInfo.lineHeight}`);
        try {
            this._isUpdatingLayout = true;
            element.style.top = `${top}px`;
            editor.layout({
                width: this._initialized ? editorWidth : this._initialEditorDimension.width,
                height
            }, true);
            // Option 3: Avoid programmatic scrollTop changes while user is actively dragging selection
            if (!this._pointerDown && editorScrollTop >= 0) {
                this._lastChangedEditorScrolltop = editorScrollTop;
                editor.setScrollTop(editorScrollTop);
            }
        }
        finally {
            this._initialized = true;
            this._isUpdatingLayout = false;
            this._logService.debug('Updated Editor Layout');
        }
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29kZUNlbGwuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9ub3RlYm9vay9icm93c2VyL3ZpZXcvY2VsbFBhcnRzL2NvZGVDZWxsLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7O0FBRWhHLGlDQUFpQztBQUVqQyxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sMEJBQTBCLENBQUM7QUFDcEQsT0FBTyxLQUFLLEdBQUcsTUFBTSx1Q0FBdUMsQ0FBQztBQUM3RCxPQUFPLEVBQUUsZ0JBQWdCLEVBQUUsTUFBTSx3Q0FBd0MsQ0FBQztBQUMxRSxPQUFPLEVBQUUsdUJBQXVCLEVBQUUsTUFBTSwrQ0FBK0MsQ0FBQztBQUN4RixPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0sMkNBQTJDLENBQUM7QUFDcEUsT0FBTyxFQUFFLEtBQUssRUFBRSxNQUFNLHdDQUF3QyxDQUFDO0FBQy9ELE9BQU8sRUFBRSxVQUFVLEVBQWUsWUFBWSxFQUFFLE1BQU0sNENBQTRDLENBQUM7QUFDbkcsT0FBTyxFQUFFLEtBQUssRUFBRSxNQUFNLDBDQUEwQyxDQUFDO0FBQ2pFLE9BQU8sS0FBSyxPQUFPLE1BQU0sMENBQTBDLENBQUM7QUFDcEUsT0FBTyxFQUFFLFNBQVMsRUFBRSxNQUFNLDRDQUE0QyxDQUFDO0FBR3ZFLE9BQU8sRUFBRSxnQkFBZ0IsRUFBRSxNQUFNLHVEQUF1RCxDQUFDO0FBQ3pGLE9BQU8sRUFBRSxvQkFBb0IsRUFBRSxNQUFNLGtFQUFrRSxDQUFDO0FBRXhHLE9BQU8sRUFBRSxvQkFBb0IsRUFBRSxNQUFNLDZFQUE2RSxDQUFDO0FBQ25ILE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLGtFQUFrRSxDQUFDO0FBQ3pHLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLGtFQUFrRSxDQUFDO0FBQ3pHLE9BQU8sRUFB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