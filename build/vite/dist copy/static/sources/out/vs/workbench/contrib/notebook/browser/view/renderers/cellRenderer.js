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
var MarkupCellRenderer_1, CodeCellRenderer_1;
import { PixelRatio } from '../../../../../../base/browser/pixelRatio.js';
import * as DOM from '../../../../../../base/browser/dom.js';
import { FastDomNode } from '../../../../../../base/browser/fastDomNode.js';
import { Disposable, DisposableStore } from '../../../../../../base/common/lifecycle.js';
import { CodeEditorWidget } from '../../../../../../editor/browser/widget/codeEditor/codeEditorWidget.js';
import { createBareFontInfoFromRawSettings } from '../../../../../../editor/common/config/fontInfoFromSettings.js';
import { EditorContextKeys } from '../../../../../../editor/common/editorContextKeys.js';
import { PLAINTEXT_LANGUAGE_ID } from '../../../../../../editor/common/languages/modesRegistry.js';
import { localize } from '../../../../../../nls.js';
import { IMenuService } from '../../../../../../platform/actions/common/actions.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { IContextKeyService } from '../../../../../../platform/contextkey/common/contextkey.js';
import { IContextMenuService } from '../../../../../../platform/contextview/browser/contextView.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { ServiceCollection } from '../../../../../../platform/instantiation/common/serviceCollection.js';
import { IKeybindingService } from '../../../../../../platform/keybinding/common/keybinding.js';
import { INotificationService } from '../../../../../../platform/notification/common/notification.js';
import { CellPartsCollection } from '../cellPart.js';
import { CellChatPart } from '../cellParts/chat/cellChatPart.js';
import { CellComments } from '../cellParts/cellComments.js';
import { CellContextKeyPart } from '../cellParts/cellContextKeys.js';
import { CellDecorations } from '../cellParts/cellDecorations.js';
import { CellDragAndDropPart } from '../cellParts/cellDnd.js';
import { CodeCellDragImageRenderer } from '../cellParts/cellDragRenderer.js';
import { CellEditorOptions } from '../cellParts/cellEditorOptions.js';
import { CellExecutionPart } from '../cellParts/cellExecution.js';
import { CellFocusPart } from '../cellParts/cellFocus.js';
import { CellFocusIndicator } from '../cellParts/cellFocusIndicator.js';
import { CellProgressBar } from '../cellParts/cellProgressBar.js';
import { CellEditorStatusBar } from '../cellParts/cellStatusPart.js';
import { BetweenCellToolbar, CellTitleToolbarPart } from '../cellParts/cellToolbars.js';
import { CodeCell } from '../cellParts/codeCell.js';
import { RunToolbar } from '../cellParts/codeCellRunToolbar.js';
import { CollapsedCellInput } from '../cellParts/collapsedCellInput.js';
import { CollapsedCellOutput } from '../cellParts/collapsedCellOutput.js';
import { FoldedCellHint } from '../cellParts/foldedCellHint.js';
import { MarkupCell } from '../cellParts/markupCell.js';
import { CellKind } from '../../../common/notebookCommon.js';
import { INotebookExecutionStateService } from '../../../common/notebookExecutionStateService.js';
const $ = DOM.$;
let NotebookCellListDelegate = class NotebookCellListDelegate extends Disposable {
    constructor(targetWindow, configurationService) {
        super();
        this.configurationService = configurationService;
        const editorOptions = this.configurationService.getValue('editor');
        this.lineHeight = createBareFontInfoFromRawSettings(editorOptions, PixelRatio.getInstance(targetWindow).value).lineHeight;
    }
    getHeight(element) {
        return element.getHeight(this.lineHeight);
    }
    getDynamicHeight(element) {
        return element.getDynamicHeight();
    }
    getTemplateId(element) {
        if (element.cellKind === CellKind.Markup) {
            return MarkupCellRenderer.TEMPLATE_ID;
        }
        else {
            return CodeCellRenderer.TEMPLATE_ID;
        }
    }
};
NotebookCellListDelegate = __decorate([
    __param(1, IConfigurationService)
], NotebookCellListDelegate);
export { NotebookCellListDelegate };
class AbstractCellRenderer extends Disposable {
    constructor(instantiationService, notebookEditor, contextMenuService, menuService, configurationService, keybindingService, notificationService, contextKeyServiceProvider, language, dndController) {
        super();
        this.instantiationService = instantiationService;
        this.notebookEditor = notebookEditor;
        this.contextMenuService = contextMenuService;
        this.menuService = menuService;
        this.keybindingService = keybindingService;
        this.notificationService = notificationService;
        this.contextKeyServiceProvider = contextKeyServiceProvider;
        this.dndController = dndController;
        this.editorOptions = this._register(new CellEditorOptions(this.notebookEditor.getBaseCellEditorOptions(language), this.notebookEditor.notebookOptions, configurationService));
    }
    dispose() {
        super.dispose();
        this.dndController = undefined;
    }
}
let MarkupCellRenderer = class MarkupCellRenderer extends AbstractCellRenderer {
    static { MarkupCellRenderer_1 = this; }
    static { this.TEMPLATE_ID = 'markdown_cell'; }
    constructor(notebookEditor, dndController, renderedEditors, contextKeyServiceProvider, configurationService, instantiationService, contextMenuService, menuService, keybindingService, notificationService, notebookExecutionStateService) {
        super(instantiationService, notebookEditor, contextMenuService, menuService, configurationService, keybindingService, notificationService, contextKeyServiceProvider, 'markdown', dndController);
        this.renderedEditors = renderedEditors;
        this._notebookExecutionStateService = notebookExecutionStateService;
    }
    get templateId() {
        return MarkupCellRenderer_1.TEMPLATE_ID;
    }
    renderTemplate(rootContainer) {
        rootContainer.classList.add('markdown-cell-row');
        const container = DOM.append(rootContainer, DOM.$('.cell-inner-container'));
        const templateDisposables = new DisposableStore();
        const contextKeyService = templateDisposables.add(this.contextKeyServiceProvider(container));
        const decorationContainer = DOM.append(rootContainer, $('.cell-decoration'));
        const titleToolbarContainer = DOM.append(container, $('.cell-title-toolbar'));
        const focusIndicatorTop = new FastDomNode(DOM.append(container, $('.cell-focus-indicator.cell-focus-indicator-top')));
        const focusIndicatorLeft = new FastDomNode(DOM.append(container, DOM.$('.cell-focus-indicator.cell-focus-indicator-side.cell-focus-indicator-left')));
        const foldingIndicator = DOM.append(focusIndicatorLeft.domNode, DOM.$('.notebook-folding-indicator'));
        const focusIndicatorRight = new FastDomNode(DOM.append(container, DOM.$('.cell-focus-indicator.cell-focus-indicator-side.cell-focus-indicator-right')));
        const codeInnerContent = DOM.append(container, $('.cell.code'));
        const editorPart = DOM.append(codeInnerContent, $('.cell-editor-part'));
        const cellChatPart = DOM.append(editorPart, $('.cell-chat-part'));
        const cellInputCollapsedContainer = DOM.append(codeInnerContent, $('.input-collapse-container'));
        cellInputCollapsedContainer.style.display = 'none';
        const editorContainer = DOM.append(editorPart, $('.cell-editor-container'));
        editorPart.style.display = 'none';
        const cellCommentPartContainer = DOM.append(container, $('.cell-comment-container'));
        const innerContent = DOM.append(container, $('.cell.markdown'));
        const bottomCellContainer = DOM.append(container, $('.cell-bottom-toolbar-container'));
        const scopedInstaService = templateDisposables.add(this.instantiationService.createChild(new ServiceCollection([IContextKeyService, contextKeyService])));
        const rootClassDelegate = {
            toggle: (className, force) => container.classList.toggle(className, force)
        };
        const titleToolbar = templateDisposables.add(scopedInstaService.createInstance(CellTitleToolbarPart, titleToolbarContainer, rootClassDelegate, this.notebookEditor.creationOptions.menuIds.cellTitleToolbar, this.notebookEditor.creationOptions.menuIds.cellDeleteToolbar, this.notebookEditor));
        const focusIndicatorBottom = new FastDomNode(DOM.append(container, $('.cell-focus-indicator.cell-focus-indicator-bottom')));
        const cellParts = new CellPartsCollection(DOM.getWindow(rootContainer), [
            templateDisposables.add(scopedInstaService.createInstance(CellChatPart, this.notebookEditor, cellChatPart)),
            templateDisposables.add(scopedInstaService.createInstance(CellEditorStatusBar, this.notebookEditor, container, editorPart, undefined)),
            templateDisposables.add(new CellFocusIndicator(this.notebookEditor, titleToolbar, focusIndicatorTop, focusIndicatorLeft, focusIndicatorRight, focusIndicatorBottom)),
            templateDisposables.add(new FoldedCellHint(this.notebookEditor, DOM.append(container, $('.notebook-folded-hint')), this._notebookExecutionStateService)),
            templateDisposables.add(new CellDecorations(this.notebookEditor, rootContainer, decorationContainer)),
            templateDisposables.add(scopedInstaService.createInstance(CellComments, this.notebookEditor, cellCommentPartContainer)),
            templateDisposables.add(new CollapsedCellInput(this.notebookEditor, cellInputCollapsedContainer)),
            templateDisposables.add(new CellFocusPart(container, undefined, this.notebookEditor)),
            templateDisposables.add(new CellDragAndDropPart(container)),
            templateDisposables.add(scopedInstaService.createInstance(CellContextKeyPart, this.notebookEditor)),
        ], [
            titleToolbar,
            templateDisposables.add(scopedInstaService.createInstance(BetweenCellToolbar, this.notebookEditor, titleToolbarContainer, bottomCellContainer))
        ]);
        templateDisposables.add(cellParts);
        const templateData = {
            rootContainer,
            cellInputCollapsedContainer,
            instantiationService: scopedInstaService,
            container,
            cellContainer: innerContent,
            editorPart,
            editorContainer,
            foldingIndicator,
            templateDisposables,
            elementDisposables: templateDisposables.add(new DisposableStore()),
            cellParts,
            toJSON: () => { return {}; }
        };
        return templateData;
    }
    renderElement(element, index, templateData, details) {
        if (!this.notebookEditor.hasModel()) {
            throw new Error('The notebook editor is not attached with view model yet.');
        }
        templateData.currentRenderedCell = element;
        templateData.currentEditor = undefined;
        templateData.editorPart.style.display = 'none';
        templateData.cellContainer.innerText = '';
        if (details?.height === undefined) {
            return;
        }
        templateData.elementDisposables.add(templateData.instantiationService.createInstance(MarkupCell, this.notebookEditor, element, templateData, this.renderedEditors));
    }
    disposeTemplate(templateData) {
        templateData.templateDisposables.dispose();
    }
    disposeElement(_element, _index, templateData) {
        templateData.elementDisposables.clear();
    }
};
MarkupCellRenderer = MarkupCellRenderer_1 = __decorate([
    __param(4, IConfigurationService),
    __param(5, IInstantiationService),
    __param(6, IContextMenuService),
    __param(7, IMenuService),
    __param(8, IKeybindingService),
    __param(9, INotificationService),
    __param(10, INotebookExecutionStateService)
], MarkupCellRenderer);
export { MarkupCellRenderer };
let CodeCellRenderer = class CodeCellRenderer extends AbstractCellRenderer {
    static { CodeCellRenderer_1 = this; }
    static { this.TEMPLATE_ID = 'code_cell'; }
    constructor(notebookEditor, renderedEditors, editorPool, dndController, contextKeyServiceProvider, configurationService, contextMenuService, menuService, instantiationService, keybindingService, notificationService) {
        super(instantiationService, notebookEditor, contextMenuService, menuService, configurationService, keybindingService, notificationService, contextKeyServiceProvider, PLAINTEXT_LANGUAGE_ID, dndController);
        this.renderedEditors = renderedEditors;
        this.editorPool = editorPool;
    }
    get templateId() {
        return CodeCellRenderer_1.TEMPLATE_ID;
    }
    renderTemplate(rootContainer) {
        rootContainer.classList.add('code-cell-row');
        const container = DOM.append(rootContainer, DOM.$('.cell-inner-container'));
        const templateDisposables = new DisposableStore();
        const contextKeyService = templateDisposables.add(this.contextKeyServiceProvider(container));
        const decorationContainer = DOM.append(rootContainer, $('.cell-decoration'));
        const focusIndicatorTop = new FastDomNode(DOM.append(container, $('.cell-focus-indicator.cell-focus-indicator-top')));
        const titleToolbarContainer = DOM.append(container, $('.cell-title-toolbar'));
        // This is also the drag handle
        const focusIndicatorLeft = new FastDomNode(DOM.append(container, DOM.$('.cell-focus-indicator.cell-focus-indicator-side.cell-focus-indicator-left')));
        const cellChatPart = DOM.append(container, $('.cell-chat-part'));
        const cellContainer = DOM.append(container, $('.cell.code'));
        const runButtonContainer = DOM.append(cellContainer, $('.run-button-container'));
        const cellInputCollapsedContainer = DOM.append(cellContainer, $('.input-collapse-container'));
        cellInputCollapsedContainer.style.display = 'none';
        const executionOrderLabel = DOM.append(focusIndicatorLeft.domNode, $('div.execution-count-label'));
        executionOrderLabel.title = localize('cellExecutionOrderCountLabel', 'Execution Order');
        const editorPart = DOM.append(cellContainer, $('.cell-editor-part'));
        const editorContainer = DOM.append(editorPart, $('.cell-editor-container'));
        const cellCommentPartContainer = DOM.append(container, $('.cell-comment-container'));
        // create a special context key service that set the inCompositeEditor-contextkey
        const editorContextKeyService = templateDisposables.add(this.contextKeyServiceProvider(editorPart));
        const editorInstaService = templateDisposables.add(this.instantiationService.createChild(new ServiceCollection([IContextKeyService, editorContextKeyService])));
        EditorContextKeys.inCompositeEditor.bindTo(editorContextKeyService).set(true);
        const editor = editorInstaService.createInstance(CodeEditorWidget, editorContainer, {
            ...this.editorOptions.getDefaultValue(),
            allowVariableLineHeights: false,
            dimension: {
                width: 0,
                height: 0
            },
            scrollbar: {
                vertical: 'hidden',
                horizontal: 'auto',
                handleMouseWheel: false,
                useShadows: false,
            },
        }, {
            contributions: this.notebookEditor.creationOptions.cellEditorContributions
        });
        templateDisposables.add(editor);
        const outputContainer = new FastDomNode(DOM.append(container, $('.output')));
        const cellOutputCollapsedContainer = DOM.append(outputContainer.domNode, $('.output-collapse-container'));
        const outputShowMoreContainer = new FastDomNode(DOM.append(container, $('.output-show-more-container')));
        const focusIndicatorRight = new FastDomNode(DOM.append(container, DOM.$('.cell-focus-indicator.cell-focus-indicator-side.cell-focus-indicator-right')));
        const focusSinkElement = DOM.append(container, $('.cell-editor-focus-sink'));
        focusSinkElement.setAttribute('tabindex', '0');
        const bottomCellToolbarContainer = DOM.append(container, $('.cell-bottom-toolbar-container'));
        const focusIndicatorBottom = new FastDomNode(DOM.append(container, $('.cell-focus-indicator.cell-focus-indicator-bottom')));
        const scopedInstaService = templateDisposables.add(this.instantiationService.createChild(new ServiceCollection([IContextKeyService, contextKeyService])));
        const rootClassDelegate = {
            toggle: (className, force) => container.classList.toggle(className, force)
        };
        const titleToolbar = templateDisposables.add(scopedInstaService.createInstance(CellTitleToolbarPart, titleToolbarContainer, rootClassDelegate, this.notebookEditor.creationOptions.menuIds.cellTitleToolbar, this.notebookEditor.creationOptions.menuIds.cellDeleteToolbar, this.notebookEditor));
        const focusIndicatorPart = templateDisposables.add(new CellFocusIndicator(this.notebookEditor, titleToolbar, focusIndicatorTop, focusIndicatorLeft, focusIndicatorRight, focusIndicatorBottom));
        const contentParts = [
            focusIndicatorPart,
            templateDisposables.add(scopedInstaService.createInstance(CellChatPart, this.notebookEditor, cellChatPart)),
            templateDisposables.add(scopedInstaService.createInstance(CellEditorStatusBar, this.notebookEditor, container, editorPart, editor)),
            templateDisposables.add(scopedInstaService.createInstance(CellProgressBar, editorPart, cellInputCollapsedContainer)),
            templateDisposables.add(new CellDecorations(this.notebookEditor, rootContainer, decorationContainer)),
            templateDisposables.add(scopedInstaService.createInstance(CellComments, this.notebookEditor, cellCommentPartContainer)),
            templateDisposables.add(scopedInstaService.createInstance(CellExecutionPart, this.notebookEditor, executionOrderLabel)),
            templateDisposables.add(scopedInstaService.createInstance(CollapsedCellOutput, this.notebookEditor, cellOutputCollapsedContainer)),
            templateDisposables.add(new CollapsedCellInput(this.notebookEditor, cellInputCollapsedContainer)),
            templateDisposables.add(new CellFocusPart(container, focusSinkElement, this.notebookEditor)),
            templateDisposables.add(new CellDragAndDropPart(container)),
            templateDisposables.add(scopedInstaService.createInstance(CellContextKeyPart, this.notebookEditor)),
        ];
        const { cellExecutePrimary, cellExecuteToolbar } = this.notebookEditor.creationOptions.menuIds;
        if (cellExecutePrimary && cellExecuteToolbar) {
            contentParts.push(templateDisposables.add(scopedInstaService.createInstance(RunToolbar, this.notebookEditor, contextKeyService, container, runButtonContainer, cellExecutePrimary, cellExecuteToolbar)));
        }
        const cellParts = new CellPartsCollection(DOM.getWindow(rootContainer), contentParts, [
            titleToolbar,
            templateDisposables.add(scopedInstaService.createInstance(BetweenCellToolbar, this.notebookEditor, titleToolbarContainer, bottomCellToolbarContainer))
        ]);
        templateDisposables.add(cellParts);
        const templateData = {
            rootContainer,
            editorPart,
            cellInputCollapsedContainer,
            cellOutputCollapsedContainer,
            instantiationService: scopedInstaService,
            container,
            cellContainer,
            focusSinkElement,
            outputContainer,
            outputShowMoreContainer,
            editor,
            templateDisposables,
            elementDisposables: templateDisposables.add(new DisposableStore()),
            cellParts,
            toJSON: () => { return {}; }
        };
        // focusIndicatorLeft covers the left margin area
        // code/outputFocusIndicator need to be registered as drag handlers so their click handlers don't take over
        const dragHandles = [focusIndicatorLeft.domNode, focusIndicatorPart.codeFocusIndicator.domNode, focusIndicatorPart.outputFocusIndicator.domNode];
        this.dndController?.registerDragHandle(templateData, rootContainer, dragHandles, () => new CodeCellDragImageRenderer().getDragImage(templateData, templateData.editor, 'code'));
        return templateData;
    }
    renderElement(element, index, templateData, details) {
        if (!this.notebookEditor.hasModel()) {
            throw new Error('The notebook editor is not attached with view model yet.');
        }
        templateData.currentRenderedCell = element;
        if (details?.height === undefined) {
            return;
        }
        templateData.outputContainer.domNode.innerText = '';
        templateData.outputContainer.domNode.appendChild(templateData.cellOutputCollapsedContainer);
        templateData.elementDisposables.add(templateData.instantiationService.createInstance(CodeCell, this.notebookEditor, element, templateData, this.editorPool));
        this.renderedEditors.set(element, templateData.editor);
    }
    disposeTemplate(templateData) {
        templateData.templateDisposables.dispose();
    }
    disposeElement(element, index, templateData) {
        templateData.elementDisposables.clear();
        this.renderedEditors.delete(element);
    }
};
CodeCellRenderer = CodeCellRenderer_1 = __decorate([
    __param(5, IConfigurationService),
    __param(6, IContextMenuService),
    __param(7, IMenuService),
    __param(8, IInstantiationService),
    __param(9, IKeybindingService),
    __param(10, INotificationService)
], CodeCellRenderer);
export { CodeCellRenderer };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2VsbFJlbmRlcmVyLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvbm90ZWJvb2svYnJvd3Nlci92aWV3L3JlbmRlcmVycy9jZWxsUmVuZGVyZXIudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7O0FBRWhHLE9BQU8sRUFBRSxVQUFVLEVBQUUsTUFBTSw4Q0FBOEMsQ0FBQztBQUMxRSxPQUFPLEtBQUssR0FBRyxNQUFNLHVDQUF1QyxDQUFDO0FBQzdELE9BQU8sRUFBRSxXQUFXLEVBQUUsTUFBTSwrQ0FBK0MsQ0FBQztBQUU1RSxPQUFPLEVBQUUsVUFBVSxFQUFFLGVBQWUsRUFBRSxNQUFNLDRDQUE0QyxDQUFDO0FBRXpGLE9BQU8sRUFBRSxnQkFBZ0IsRUFBRSxNQUFNLHdFQUF3RSxDQUFDO0FBRTFHLE9BQU8sRUFBRSxpQ0FBaUMsRUFBRSxNQUFNLGdFQUFnRSxDQUFDO0FBQ25ILE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLHNEQUFzRCxDQUFDO0FBQ3pGLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLDREQUE0RCxDQUFDO0FBQ25HLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSwwQkFBMEIsQ0FBQztBQUNwRCxPQUFPLEVBQUUsWUFBWSxFQUFFLE1BQU0sc0RBQXNELENBQUM7QUFDcEYsT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0sa0VBQWtFLENBQUM7QUFDekcsT0FBTyxFQUFFLGtCQUFrQixFQUE0QixNQUFNLDREQUE0RCxDQUFDO0FBQzFILE9BQU8sRUFBRSxtQkFBbUIsRUFBRSxNQUFNLCtEQUErRCxDQUFDO0FBQ3BHLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLGtFQUFrRSxDQUFDO0FBQ3pHLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLHNFQUFzRSxDQUFDO0FBQ3pHLE9B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