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
var CellDiffPlaceholderRenderer_1, NotebookDocumentMetadataDiffRenderer_1, CellDiffSingleSideRenderer_1, CellDiffSideBySideRenderer_1;
import './notebookDiff.css';
import * as DOM from '../../../../../base/browser/dom.js';
import * as domStylesheets from '../../../../../base/browser/domStylesheets.js';
import { isMonacoEditor, MouseController } from '../../../../../base/browser/ui/list/listWidget.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { IKeybindingService } from '../../../../../platform/keybinding/common/keybinding.js';
import { IListService, WorkbenchList } from '../../../../../platform/list/browser/listService.js';
import { IThemeService } from '../../../../../platform/theme/common/themeService.js';
import { DIFF_CELL_MARGIN } from './notebookDiffEditorBrowser.js';
import { CellDiffPlaceholderElement, CollapsedCellOverlayWidget, DeletedElement, getOptimizedNestedCodeEditorWidgetOptions, InsertElement, ModifiedElement, NotebookDocumentMetadataElement, UnchangedCellOverlayWidget } from './diffComponents.js';
import { CodeEditorWidget } from '../../../../../editor/browser/widget/codeEditor/codeEditorWidget.js';
import { DiffEditorWidget } from '../../../../../editor/browser/widget/diffEditor/diffEditorWidget.js';
import { IMenuService, MenuItemAction } from '../../../../../platform/actions/common/actions.js';
import { IContextMenuService } from '../../../../../platform/contextview/browser/contextView.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { CodiconActionViewItem } from '../view/cellParts/cellActionView.js';
import { createBareFontInfoFromRawSettings } from '../../../../../editor/common/config/fontInfoFromSettings.js';
import { PixelRatio } from '../../../../../base/browser/pixelRatio.js';
import { WorkbenchToolBar } from '../../../../../platform/actions/browser/toolbar.js';
import { fixedDiffEditorOptions, fixedEditorOptions } from './diffCellEditorOptions.js';
import { IAccessibilityService } from '../../../../../platform/accessibility/common/accessibility.js';
import { localize } from '../../../../../nls.js';
import { EditorExtensionsRegistry } from '../../../../../editor/browser/editorExtensions.js';
let NotebookCellTextDiffListDelegate = class NotebookCellTextDiffListDelegate {
    constructor(targetWindow, configurationService) {
        this.configurationService = configurationService;
        const editorOptions = this.configurationService.getValue('editor');
        this.lineHeight = createBareFontInfoFromRawSettings(editorOptions, PixelRatio.getInstance(targetWindow).value).lineHeight;
    }
    getHeight(element) {
        return element.getHeight(this.lineHeight);
    }
    hasDynamicHeight(element) {
        return false;
    }
    getTemplateId(element) {
        switch (element.type) {
            case 'delete':
            case 'insert':
                return CellDiffSingleSideRenderer.TEMPLATE_ID;
            case 'modified':
            case 'unchanged':
                return CellDiffSideBySideRenderer.TEMPLATE_ID;
            case 'placeholder':
                return CellDiffPlaceholderRenderer.TEMPLATE_ID;
            case 'modifiedMetadata':
            case 'unchangedMetadata':
                return NotebookDocumentMetadataDiffRenderer.TEMPLATE_ID;
        }
    }
};
NotebookCellTextDiffListDelegate = __decorate([
    __param(1, IConfigurationService)
], NotebookCellTextDiffListDelegate);
export { NotebookCellTextDiffListDelegate };
let CellDiffPlaceholderRenderer = class CellDiffPlaceholderRenderer {
    static { CellDiffPlaceholderRenderer_1 = this; }
    static { this.TEMPLATE_ID = 'cell_diff_placeholder'; }
    constructor(notebookEditor, instantiationService) {
        this.notebookEditor = notebookEditor;
        this.instantiationService = instantiationService;
    }
    get templateId() {
        return CellDiffPlaceholderRenderer_1.TEMPLATE_ID;
    }
    renderTemplate(container) {
        const body = DOM.$('.cell-placeholder-body');
        DOM.append(container, body);
        const elementDisposables = new DisposableStore();
        const marginOverlay = new CollapsedCellOverlayWidget(body);
        const contents = DOM.append(body, DOM.$('.contents'));
        const placeholder = DOM.append(contents, DOM.$('span.text', { title: localize('notebook.diff.hiddenCells.expandAll', 'Double click to show') }));
        return {
            body,
            container,
            placeholder,
            marginOverlay,
            elementDisposables
        };
    }
    renderElement(element, index, templateData) {
        templateData.body.classList.remove('left', 'right', 'full');
        templateData.elementDisposables.add(this.instantiationService.createInstance(CellDiffPlaceholderElement, element, templateData));
    }
    disposeTemplate(templateData) {
        templateData.container.innerText = '';
    }
    disposeElement(element, index, templateData) {
        templateData.elementDisposables.clear();
    }
};
CellDiffPlaceholderRenderer = CellDiffPlaceholderRenderer_1 = __decorate([
    __param(1, IInstantiationService)
], CellDiffPlaceholderRenderer);
export { CellDiffPlaceholderRenderer };
let NotebookDocumentMetadataDiffRenderer = class NotebookDocumentMetadataDiffRenderer {
    static { NotebookDocumentMetadataDiffRenderer_1 = this; }
    static { this.TEMPLATE_ID = 'notebook_metadata_diff_side_by_side'; }
    constructor(notebookEditor, instantiationService, contextMenuService, keybindingService, menuService, contextKeyService, notificationService, themeService, accessibilityService) {
        this.notebookEditor = notebookEditor;
        this.instantiationService = instantiationService;
        this.contextMenuService = contextMenuService;
        this.keybindingService = keybindingService;
        this.menuService = menuService;
        this.contextKeyService = contextKeyService;
        this.notificationService = notificationService;
        this.themeService = themeService;
        this.accessibilityService = accessibilityService;
    }
    get templateId() {
        return NotebookDocumentMetadataDiffRenderer_1.TEMPLATE_ID;
    }
    renderTemplate(container) {
        const body = DOM.$('.cell-body');
        DOM.append(container, body);
        const diffEditorContainer = DOM.$('.cell-diff-editor-container');
        DOM.append(body, diffEditorContainer);
        const cellHeaderContainer = DOM.append(diffEditorContainer, DOM.$('.input-header-container'));
        const sourceContainer = DOM.append(diffEditorContainer, DOM.$('.source-container'));
        const { editor, editorContainer } = this._buildSourceEditor(sourceContainer);
        const inputToolbarContainer = DOM.append(sourceContainer, DOM.$('.editor-input-toolbar-container'));
        const cellToolbarContainer = DOM.append(inputToolbarContainer, DOM.$('div.property-toolbar'));
        const toolbar = this.instantiationService.createInstance(WorkbenchToolBar, cellToolbarContainer, {
            actionViewItemProvider: (action, options) => {
                if (action instanceof MenuItemAction) {
                    const item = new CodiconActionViewItem(action, { hoverDelegate: options.hoverDelegate }, this.keybindingService, this.notificationService, this.contextKeyService, this.themeService, this.contextMenuService, this.accessibilityService);
                    return item;
                }
                return undefined;
            },
            highlightToggledItems: true
        });
        const borderContainer = DOM.append(body, DOM.$('.border-container'));
        const leftBorder = DOM.append(borderContainer, DOM.$('.left-border'));
        const rightBorder = DOM.append(borderContainer, DOM.$('.right-border'));
        const topBorder = DOM.append(borderContainer, DOM.$('.top-border'));
        const bottomBorder = DOM.append(borderContainer, DOM.$('.bottom-border'));
        const marginOverlay = new UnchangedCellOverlayWidget(body);
        const elementDisposables = new DisposableStore();
        return {
            body,
            container,
            diffEditorContainer,
            cellHeaderContainer,
            sourceEditor: editor,
            editorContainer,
            inputToolbarContainer,
            toolbar,
            leftBorder,
            rightBorder,
            topBorder,
            bottomBorder,
            marginOverlay,
            elementDisposables
        };
    }
    _buildSourceEditor(sourceContainer) {
        return buildDiffEditorWidget(this.instantiationService, this.notebookEditor, sourceContainer, { readOnly: true });
    }
    renderElement(element, index, templateData) {
        templateData.body.classList.remove('full');
        templateData.elementDisposables.add(this.instantiationService.createInstance(NotebookDocumentMetadataElement, this.notebookEditor, element, templateData));
    }
    disposeTemplate(templateData) {
        templateData.container.innerText = '';
        templateData.sourceEditor.dispose();
        templateData.toolbar?.dispose();
        templateData.elementDisposables.dispose();
    }
    disposeElement(element, index, templateData) {
        if (templateData.toolbar) {
            templateData.toolbar.context = undefined;
        }
        templateData.elementDisposables.clear();
    }
};
NotebookDocumentMetadataDiffRenderer = NotebookDocumentMetadataDiffRenderer_1 = __decorate([
    __param(1, IInstantiationService),
    __param(2, IContextMenuService),
    __param(3, IKeybindingService),
    __param(4, IMenuService),
    __param(5, IContextKeyService),
    __param(6, INotificationService),
    __param(7, IThemeService),
    __param(8, IAccessibilityService)
], NotebookDocumentMetadataDiffRenderer);
export { NotebookDocumentMetadataDiffRenderer };
let CellDiffSingleSideRenderer = class CellDiffSingleSideRenderer {
    static { CellDiffSingleSideRenderer_1 = this; }
    static { this.TEMPLATE_ID = 'cell_diff_single'; }
    constructor(notebookEditor, instantiationService) {
        this.notebookEditor = notebookEditor;
        this.instantiationService = instantiationService;
    }
    get templateId() {
        return CellDiffSingleSideRenderer_1.TEMPLATE_ID;
    }
    renderTemplate(container) {
        const body = DOM.$('.cell-body');
        DOM.append(container, body);
        const diffEditorContainer = DOM.$('.cell-diff-editor-container');
        DOM.append(body, diffEditorContainer);
        const diagonalFill = DOM.append(body, DOM.$('.diagonal-fill'));
        const cellHeaderContainer = DOM.append(diffEditorContainer, DOM.$('.input-header-container'));
        const sourceContainer = DOM.append(diffEditorContainer, DOM.$('.source-container'));
        const { editor, editorContainer } = this._buildSourceEditor(sourceContainer);
        const metadataHeaderContainer = DOM.append(diffEditorContainer, DOM.$('.metadata-header-container'));
        const metadataInfoContainer = DOM.append(diffEditorContainer, DOM.$('.metadata-info-container'));
        const outputHeaderContainer = DOM.append(diffEditorContainer, DOM.$('.output-header-container'));
        const outputInfoContainer = DOM.append(diffEditorContainer, DOM.$('.output-info-container'));
        const borderContainer = DOM.append(body, DOM.$('.border-container'));
        const leftBorder = DOM.append(borderContainer, DOM.$('.left-border'));
        const rightBorder = DOM.append(borderContainer, DOM.$('.right-border'));
        const topBorder = DOM.append(borderContainer, DOM.$('.top-border'));
        const bottomBorder = DOM.append(borderContainer, DOM.$('.bottom-border'));
        return {
            body,
            container,
            editorContainer,
            diffEditorContainer,
            diagonalFill,
            cellHeaderContainer,
            sourceEditor: editor,
            metadataHeaderContainer,
            metadataInfoContainer,
            outputHeaderContainer,
            outputInfoContainer,
            leftBorder,
            rightBorder,
            topBorder,
            bottomBorder,
            elementDisposables: new DisposableStore()
        };
    }
    _buildSourceEditor(sourceContainer) {
        return buildSourceEditor(this.instantiationService, this.notebookEditor, sourceContainer);
    }
    renderElement(element, index, templateData) {
        templateData.body.classList.remove('left', 'right', 'full');
        switch (element.type) {
            case 'delete':
                templateData.elementDisposables.add(this.instantiationService.createInstance(DeletedElement, this.notebookEditor, element, templateData));
                return;
            case 'insert':
                templateData.elementDisposables.add(this.instantiationService.createInstance(InsertElement, this.notebookEditor, element, templateData));
                return;
            default:
                break;
        }
    }
    disposeTemplate(templateData) {
        templateData.container.innerText = '';
        templateData.sourceEditor.dispose();
        templateData.elementDisposables.dispose();
    }
    disposeElement(element, index, templateData) {
        templateData.elementDisposables.clear();
    }
};
CellDiffSingleSideRenderer = CellDiffSingleSideRenderer_1 = __decorate([
    __param(1, IInstantiationService)
], CellDiffSingleSideRenderer);
export { CellDiffSingleSideRenderer };
let CellDiffSideBySideRenderer = class CellDiffSideBySideRenderer {
    static { CellDiffSideBySideRenderer_1 = this; }
    static { this.TEMPLATE_ID = 'cell_diff_side_by_side'; }
    constructor(notebookEditor, instantiationService, contextMenuService, keybindingService, menuService, contextKeyService, notificationService, themeService, accessibilityService) {
        this.notebookEditor = notebookEditor;
        this.instantiationService = instantiationService;
        this.contextMenuService = contextMenuService;
        this.keybindingService = keybindingService;
        this.menuService = menuService;
        this.contextKeyService = contextKeyService;
        this.notificationService = notificationService;
        this.themeService = themeService;
        this.accessibilityService = accessibilityService;
    }
    get templateId() {
        return CellDiffSideBySideRenderer_1.TEMPLATE_ID;
    }
    renderTemplate(container) {
        const body = DOM.$('.cell-body');
        DOM.append(container, body);
        const diffEditorContainer = DOM.$('.cell-diff-editor-container');
        DOM.append(body, diffEditorContainer);
        const cellHeaderContainer = DOM.append(diffEditorContainer, DOM.$('.input-header-container'));
        const sourceContainer = DOM.append(diffEditorContainer, DOM.$('.source-container'));
        const { editor, editorContainer } = this._buildSourceEditor(sourceContainer);
        const inputToolbarContainer = DOM.append(sourceContainer, DOM.$('.editor-input-toolbar-container'));
        const cellToolbarContainer = DOM.append(inputToolbarContainer, DOM.$('div.property-toolbar'));
        const toolbar = this.instantiationService.createInstance(WorkbenchToolBar, cellToolbarContainer, {
            actionViewItemProvider: (action, options) => {
                if (action instanceof MenuItemAction) {
                    const item = new CodiconActionViewItem(action, { hoverDelegate: options.hoverDelegate }, this.keybindingService, this.notificationService, this.contextKeyService, this.themeService, this.contextMenuService, this.accessibilityService);
                    return item;
                }
                return undefined;
            },
            highlightToggledItems: true
        });
        const metadataHeaderContainer = DOM.append(diffEditorContainer, DOM.$('.metadata-header-container'));
        const metadataInfoContainer = DOM.append(diffEditorContainer, DOM.$('.metadata-info-container'));
        const outputHeaderContainer = DOM.append(diffEditorContainer, DOM.$('.output-header-container'));
        const outputInfoContainer = DOM.append(diffEditorContainer, DOM.$('.output-info-container'));
        const borderContainer = DOM.append(body, DOM.$('.border-container'));
        const leftBorder = DOM.append(borderContainer, DOM.$('.left-border'));
        const rightBorder = DOM.append(borderContainer, DOM.$('.right-border'));
        const topBorder = DOM.append(borderContainer, DOM.$('.top-border'));
        const bottomBorder = DOM.append(borderContainer, DOM.$('.bottom-border'));
        const marginOverlay = new UnchangedCellOverlayWidget(body);
        const elementDisposables = new DisposableStore();
        return {
            body,
            container,
            diffEditorContainer,
            cellHeaderContainer,
            sourceEditor: editor,
            editorContainer,
            inputToolbarContainer,
            toolbar,
            metadataHeaderContainer,
            metadataInfoContainer,
            outputHeaderContainer,
            outputInfoContainer,
            leftBorder,
            rightBorder,
            topBorder,
            bottomBorder,
            marginOverlay,
            elementDisposables
        };
    }
    _buildSourceEditor(sourceContainer) {
        return buildDiffEditorWidget(this.instantiationService, this.notebookEditor, sourceContainer);
    }
    renderElement(element, index, templateData) {
        templateData.body.classList.remove('left', 'right', 'full');
        switch (element.type) {
            case 'unchanged':
                templateData.elementDisposables.add(this.instantiationService.createInstance(ModifiedElement, this.notebookEditor, element, templateData));
                return;
            case 'modified':
                templateData.elementDisposables.add(this.instantiationService.createInstance(ModifiedElement, this.notebookEditor, element, templateData));
                return;
            default:
                break;
        }
    }
    disposeTemplate(templateData) {
        templateData.container.innerText = '';
        templateData.sourceEditor.dispose();
        templateData.toolbar?.dispose();
        templateData.elementDisposables.dispose();
    }
    disposeElement(element, index, templateData) {
        if (templateData.toolbar) {
            templateData.toolbar.context = undefined;
        }
        templateData.elementDisposables.clear();
    }
};
CellDiffSideBySideRenderer = CellDiffSideBySideRenderer_1 = __decorate([
    __param(1, IInstantiationService),
    __param(2, IContextMenuService),
    __param(3, IKeybindingService),
    __param(4, IMenuService),
    __param(5, IContextKeyService),
    __param(6, INotificationService),
    __param(7, IThemeService),
    __param(8, IAccessibilityService)
], CellDiffSideBySideRenderer);
export { CellDiffSideBySideRenderer };
export class NotebookMouseController extends MouseController {
    onViewPointer(e) {
        if (isMonacoEditor(e.browserEvent.target)) {
            const focus = typeof e.index === 'undefined' ? [] : [e.index];
            this.list.setFocus(focus, e.browserEvent);
        }
        else {
            super.onViewPointer(e);
        }
    }
}
let NotebookTextDiffList = class NotebookTextDiffList extends WorkbenchList {
    get rowsContainer() {
        return this.view.containerDomNode;
    }
    constructor(listUser, container, delegate, renderers, contextKeyService, options, listService, configurationService, instantiationService) {
        super(listUser, container, delegate, renderers, options, contextKeyService, listService, configurationService, instantiationService);
    }
    createMouseController(options) {
        return new NotebookMouseController(this);
    }
    getCellViewScrollTop(element) {
        const index = this.indexOf(element);
        // if (index === undefined || index < 0 || index >= this.length) {
        // 	this._getViewIndexUpperBound(element);
        // 	throw new ListError(this.listUser, `Invalid index ${index}`);
        // }
        return this.view.elementTop(index);
    }
    getScrollHeight() {
        return this.view.scrollHeight;
    }
    triggerScrollFromMouseWheelEvent(browserEvent) {
        this.view.delegateScrollFromMouseWheelEvent(browserEvent);
    }
    delegateVerticalScrollbarPointerDown(browserEvent) {
        this.view.delegateVerticalScrollbarPointerDown(browserEvent);
    }
    clear() {
        super.splice(0, this.length);
    }
    updateElementHeight2(element, size) {
        const viewIndex = this.indexOf(element);
        const focused = this.getFocus();
        this.view.updateElementHeight(viewIndex, size, focused.length ? focused[0] : null);
    }
    style(styles) {
        const selectorSuffix = this.view.domId;
        if (!this.styleElement) {
            this.styleElement = domStylesheets.createStyleSheet(this.view.domNode);
        }
        const suffix = selectorSuffix && `.${selectorSuffix}`;
        const content = [];
        if (styles.listBackground) {
            content.push(`.monaco-list${suffix} > div.monaco-scrollable-element > .monaco-list-rows { background: ${styles.listBackground}; }`);
        }
        if (styles.listFocusBackground) {
            content.push(`.monaco-list${suffix}:focus > div.monaco-scrollable-element > .monaco-list-rows > .monaco-list-row.focused { background-color: ${styles.listFocusBackground}; }`);
            content.push(`.monaco-list${suffix}:focus > div.monaco-scrollable-element > .monaco-list-rows > .monaco-list-row.focused:hover { background-color: ${styles.listFocusBackground}; }`); // overwrite :hover style in this case!
        }
        if (styles.listFocusForeground) {
            content.push(`.monaco-list${suffix}:focus > div.monaco-scrollable-element > .monaco-list-rows > .monaco-list-row.focused { color: ${styles.listFocusForeground}; }`);
        }
        if (styles.listActiveSelectionBackground) {
            content.push(`.monaco-list${suffix}:focus > div.monaco-scrollable-element > .monaco-list-rows > .monaco-list-row.selected { background-color: ${styles.listActiveSelectionBackground}; }`);
            content.push(`.monaco-list${suffix}:focus > div.monaco-scrollable-element > .monaco-list-rows > .monaco-list-row.selected:hover { background-color: ${styles.listActiveSelectionBackground}; }`); // overwrite :hover style in this case!
        }
        if (styles.listActiveSelectionForeground) {
            content.push(`.monaco-list${suffix}:focus > div.monaco-scrollable-element > .monaco-list-rows > .monaco-list-row.selected { color: ${styles.listActiveSelectionForeground}; }`);
        }
        if (styles.listFocusAndSelectionBackground) {
            content.push(`
				.monaco-drag-image${suffix},
				.monaco-list${suffix}:focus > div.monaco-scrollable-element > .monaco-list-rows > .monaco-list-row.selected.focused { background-color: ${styles.listFocusAndSelectionBackground}; }
			`);
        }
        if (styles.listFocusAndSelectionForeground) {
            content.push(`
				.monaco-drag-image${suffix},
				.monaco-list${suffix}:focus > div.monaco-scrollable-element > .monaco-list-rows > .monaco-list-row.selected.focused { color: ${styles.listFocusAndSelectionForeground}; }
			`);
        }
        if (styles.listInactiveFocusBackground) {
            content.push(`.monaco-list${suffix} > div.monaco-scrollable-element > .monaco-list-rows > .monaco-list-row.focused { background-color:  ${styles.listInactiveFocusBackground}; }`);
            content.push(`.monaco-list${suffix} > div.monaco-scrollable-element > .monaco-list-rows > .monaco-list-row.focused:hover { background-color:  ${styles.listInactiveFocusBackground}; }`); // overwrite :hover style in this case!
        }
        if (styles.listInactiveSelectionBackground) {
            content.push(`.monaco-list${suffix} > div.monaco-scrollable-element > .monaco-list-rows > .monaco-list-row.selected { background-color:  ${styles.listInactiveSelectionBackground}; }`);
            content.push(`.monaco-list${suffix} > div.monaco-scrollable-element > .monaco-list-rows > .monaco-list-row.selected:hover { background-color:  ${styles.listInactiveSelectionBackground}; }`); // overwrite :hover style in this case!
        }
        if (styles.listInactiveSelectionForeground) {
            content.push(`.monaco-list${suffix} > div.monaco-scrollable-element > .monaco-list-rows > .monaco-list-row.selected { color: ${styles.listInactiveSelectionForeground}; }`);
        }
        if (styles.listHoverBackground) {
            content.push(`.monaco-list${suffix}:not(.drop-target) > div.monaco-scrollable-element > .monaco-list-rows > .monaco-list-row:hover:not(.selected):not(.focused) { background-color:  ${styles.listHoverBackground}; }`);
        }
        if (styles.listHoverForeground) {
            content.push(`.monaco-list${suffix} > div.monaco-scrollable-element > .monaco-list-rows > .monaco-list-row:hover:not(.selected):not(.focused) { color:  ${styles.listHoverForeground}; }`);
        }
        if (styles.listSelectionOutline) {
            content.push(`.monaco-list${suffix} > div.monaco-scrollable-element > .monaco-list-rows > .monaco-list-row.selected { outline: 1px dotted ${styles.listSelectionOutline}; outline-offset: -1px; }`);
        }
        if (styles.listFocusOutline) {
            content.push(`
				.monaco-drag-image${suffix},
				.monaco-list${suffix}:focus > div.monaco-scrollable-element > .monaco-list-rows > .monaco-list-row.focused { outline: 1px solid ${styles.listFocusOutline}; outline-offset: -1px; }
			`);
        }
        if (styles.listInactiveFocusOutline) {
            content.push(`.monaco-list${suffix} > div.monaco-scrollable-element > .monaco-list-rows > .monaco-list-row.focused { outline: 1px dotted ${styles.listInactiveFocusOutline}; outline-offset: -1px; }`);
        }
        if (styles.listHoverOutline) {
            content.push(`.monaco-list${suffix} > div.monaco-scrollable-element > .monaco-list-rows > .monaco-list-row:hover { outline: 1px dashed ${styles.listHoverOutline}; outline-offset: -1px; }`);
        }
        if (styles.listDropOverBackground) {
            content.push(`
				.monaco-list${suffix}.drop-target,
				.monaco-list${suffix} > div.monaco-scrollable-element > .monaco-list-rows.drop-target,
				.monaco-list${suffix} > div.monaco-scrollable-element > .monaco-list-row.drop-target { background-color: ${styles.listDropOverBackground} !important; color: inherit !important; }
			`);
        }
        const newStyles = content.join('\n');
        if (newStyles !== this.styleElement.textContent) {
            this.styleElement.textContent = newStyles;
        }
    }
};
NotebookTextDiffList = __decorate([
    __param(6, IListService),
    __param(7, IConfigurationService),
    __param(8, IInstantiationService)
], NotebookTextDiffList);
export { NotebookTextDiffList };
function buildDiffEditorWidget(instantiationService, notebookEditor, sourceContainer, options = {}) {
    const editorContainer = DOM.append(sourceContainer, DOM.$('.editor-container'));
    const editor = instantiationService.createInstance(DiffEditorWidget, editorContainer, {
        ...fixedDiffEditorOptions,
        overflowWidgetsDomNode: notebookEditor.getOverflowContainerDomNode(),
        originalEditable: false,
        ignoreTrimWhitespace: false,
        automaticLayout: false,
        dimension: {
            height: 0,
            width: 0
        },
        renderSideBySide: true,
        useInlineViewWhenSpaceIsLimited: false,
        ...options
    }, {
        originalEditor: getOptimizedNestedCodeEditorWidgetOptions(),
        modifiedEditor: getOptimizedNestedCodeEditorWidgetOptions()
    });
    return {
        editor,
        editorContainer
    };
}
function buildSourceEditor(instantiationService, notebookEditor, sourceContainer, options = {}) {
    const editorContainer = DOM.append(sourceContainer, DOM.$('.editor-container'));
    const skipContributions = [
        'editor.contrib.emptyTextEditorHint'
    ];
    const editor = instantiationService.createInstance(CodeEditorWidget, editorContainer, {
        ...fixedEditorOptions,
        glyphMargin: false,
        dimension: {
            width: (notebookEditor.getLayoutInfo().width - 2 * DIFF_CELL_MARGIN) / 2 - 18,
            height: 0
        },
        automaticLayout: false,
        overflowWidgetsDomNode: notebookEditor.getOverflowContainerDomNode(),
        allowVariableLineHeights: false,
        readOnly: true,
    }, {
        contributions: EditorExtensionsRegistry.getEditorContributions().filter(c => skipContributions.indexOf(c.id) === -1)
    });
    return { editor, editorContainer };
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibm90ZWJvb2tEaWZmTGlzdC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL25vdGVib29rL2Jyb3dzZXIvZGlmZi9ub3RlYm9va0RpZmZMaXN0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7OztBQUVoRyxPQUFPLG9CQUFvQixDQUFDO0FBRTVCLE9BQU8sS0FBSyxHQUFHLE1BQU0sb0NBQW9DLENBQUM7QUFDMUQsT0FBTyxLQUFLLGNBQWMsTUFBTSwrQ0FBK0MsQ0FBQztBQUNoRixPQUFPLEVBQTZCLGNBQWMsRUFBb0IsZUFBZSxFQUFFLE1BQU0sbURBQW1ELENBQUM7QUFDakosT0FBTyxFQUFFLGVBQWUsRUFBZSxNQUFNLHlDQUF5QyxDQUFDO0FBQ3ZGLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLCtEQUErRCxDQUFDO0FBQ3RHLE9BQU8sRUFBRSxrQkFBa0IsRUFBRSxNQUFNLHlEQUF5RCxDQUFDO0FBQzdGLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLCtEQUErRCxDQUFDO0FBQ3RHLE9BQU8sRUFBRSxrQkFBa0IsRUFBRSxNQUFNLHlEQUF5RCxDQUFDO0FBQzdGLE9BQU8sRUFBRSxZQUFZLEVBQXlCLGFBQWEsRUFBRSxNQUFNLHFEQUFxRCxDQUFDO0FBQ3pILE9BQU8sRUFBRSxhQUFhLEVBQUUsTUFBTSxzREFBc0QsQ0FBQztBQUVyRixPQUFPLEVBQXlHLGdCQUFnQixFQUFzRSxNQUFNLGdDQUFnQyxDQUFDO0FBQzdPLE9BQU8sRUFBRSwwQkFBMEIsRUFBRSwwQkFBMEIsRUFBRSxjQUFjLEVBQUUseUNBQXlDLEVBQUUsYUFBYSxFQUFFLGVBQWUsRUFBRSwrQkFBK0IsRUFBRSwwQkFBMEIsRUFBRSxNQUFNLHFCQUFxQixDQUFDO0FBQ3JQLE9BQU8sRUFBRSxnQkFBZ0IsRUFBRSxNQUFNLHFF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