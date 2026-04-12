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
import { createTrustedTypesPolicy } from '../../../../../../base/browser/trustedTypes.js';
import { Disposable, DisposableStore, dispose, toDisposable } from '../../../../../../base/common/lifecycle.js';
import { splitLines } from '../../../../../../base/common/strings.js';
import { ILanguageService } from '../../../../../../editor/common/languages/language.js';
import { tokenizeToString } from '../../../../../../editor/common/languages/textToHtmlTokenizer.js';
import { DefaultLineHeight } from '../diffElementViewModel.js';
import { NotebookOverviewRulerLane } from '../../notebookBrowser.js';
import * as DOM from '../../../../../../base/browser/dom.js';
import { MenuWorkbenchToolBar } from '../../../../../../platform/actions/browser/toolbar.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { ServiceCollection } from '../../../../../../platform/instantiation/common/serviceCollection.js';
import { IContextKeyService } from '../../../../../../platform/contextkey/common/contextkey.js';
import { overviewRulerDeletedForeground } from '../../../../scm/common/quickDiff.js';
const ttPolicy = createTrustedTypesPolicy('notebookRenderer', { createHTML: value => value });
let NotebookDeletedCellDecorator = class NotebookDeletedCellDecorator extends Disposable {
    constructor(_notebookEditor, toolbar, languageService, instantiationService) {
        super();
        this._notebookEditor = _notebookEditor;
        this.toolbar = toolbar;
        this.languageService = languageService;
        this.instantiationService = instantiationService;
        this.zoneRemover = this._register(new DisposableStore());
        this.createdViewZones = new Map();
        this.deletedCellInfos = new Map();
    }
    getTop(deletedIndex) {
        const info = this.deletedCellInfos.get(deletedIndex);
        if (!info) {
            return;
        }
        if (info.previousIndex === -1) {
            // deleted cell is before the first real cell
            return 0;
        }
        const cells = this._notebookEditor.getCellsInRange({ start: info.previousIndex, end: info.previousIndex + 1 });
        if (!cells.length) {
            return this._notebookEditor.getLayoutInfo().height + info.offset;
        }
        const cell = cells[0];
        const cellHeight = this._notebookEditor.getHeightOfElement(cell);
        const top = this._notebookEditor.getAbsoluteTopOfElement(cell);
        return top + cellHeight + info.offset;
    }
    reveal(deletedIndex) {
        const top = this.getTop(deletedIndex);
        if (typeof top === 'number') {
            this._notebookEditor.focusContainer();
            this._notebookEditor.revealOffsetInCenterIfOutsideViewport(top);
            const info = this.deletedCellInfos.get(deletedIndex);
            if (info) {
                const prevIndex = info.previousIndex === -1 ? 0 : info.previousIndex;
                this._notebookEditor.setFocus({ start: prevIndex, end: prevIndex });
                this._notebookEditor.setSelections([{ start: prevIndex, end: prevIndex }]);
            }
        }
    }
    apply(diffInfo, original) {
        this.clear();
        let currentIndex = -1;
        const deletedCellsToRender = { cells: [], index: 0 };
        diffInfo.forEach(diff => {
            if (diff.type === 'delete') {
                const deletedCell = original.cells[diff.originalCellIndex];
                if (deletedCell) {
                    deletedCellsToRender.cells.push({ cell: deletedCell, originalIndex: diff.originalCellIndex, previousIndex: currentIndex });
                    deletedCellsToRender.index = currentIndex;
                }
            }
            else {
                if (deletedCellsToRender.cells.length) {
                    this._createWidget(deletedCellsToRender.index + 1, deletedCellsToRender.cells);
                    deletedCellsToRender.cells.length = 0;
                }
                currentIndex = diff.modifiedCellIndex;
            }
        });
        if (deletedCellsToRender.cells.length) {
            this._createWidget(deletedCellsToRender.index + 1, deletedCellsToRender.cells);
        }
    }
    clear() {
        this.deletedCellInfos.clear();
        this.zoneRemover.clear();
    }
    _createWidget(index, cells) {
        this._createWidgetImpl(index, cells);
    }
    async _createWidgetImpl(index, cells) {
        const rootContainer = document.createElement('div');
        const widgets = [];
        const heights = await Promise.all(cells.map(async (cell) => {
            const widget = new NotebookDeletedCellWidget(this._notebookEditor, this.toolbar, cell.cell.getValue(), cell.cell.language, rootContainer, cell.originalIndex, this.languageService, this.instantiationService);
            widgets.push(widget);
            const height = await widget.render();
            this.deletedCellInfos.set(cell.originalIndex, { height, previousIndex: cell.previousIndex, offset: 0 });
            return height;
        }));
        Array.from(this.deletedCellInfos.keys()).sort((a, b) => a - b).forEach((originalIndex) => {
            const previousDeletedCell = this.deletedCellInfos.get(originalIndex - 1);
            if (previousDeletedCell) {
                const deletedCell = this.deletedCellInfos.get(originalIndex);
                if (deletedCell) {
                    deletedCell.offset = previousDeletedCell.height + previousDeletedCell.offset;
                }
            }
        });
        const totalHeight = heights.reduce((prev, curr) => prev + curr, 0);
        this._notebookEditor.changeViewZones(accessor => {
            const notebookViewZone = {
                afterModelPosition: index,
                heightInPx: totalHeight + 4,
                domNode: rootContainer
            };
            const id = accessor.addZone(notebookViewZone);
            accessor.layoutZone(id);
            this.createdViewZones.set(index, id);
            const deletedCellOverviewRulereDecorationIds = this._notebookEditor.deltaCellDecorations([], [{
                    viewZoneId: id,
                    options: {
                        overviewRuler: {
                            color: overviewRulerDeletedForeground,
                            position: NotebookOverviewRulerLane.Center,
                        }
                    }
                }]);
            this.zoneRemover.add(toDisposable(() => {
                if (this.createdViewZones.get(index) === id) {
                    this.createdViewZones.delete(index);
                }
                if (!this._notebookEditor.isDisposed) {
                    this._notebookEditor.changeViewZones(accessor => {
                        accessor.removeZone(id);
                        dispose(widgets);
                    });
                    this._notebookEditor.deltaCellDecorations(deletedCellOverviewRulereDecorationIds, []);
                }
            }));
        });
    }
};
NotebookDeletedCellDecorator = __decorate([
    __param(2, ILanguageService),
    __param(3, IInstantiationService)
], NotebookDeletedCellDecorator);
export { NotebookDeletedCellDecorator };
let NotebookDeletedCellWidget = class NotebookDeletedCellWidget extends Disposable {
    // private readonly toolbar: HTMLElement;
    constructor(_notebookEditor, _toolbarOptions, code, language, container, _originalIndex, languageService, instantiationService) {
        super();
        this._notebookEditor = _notebookEditor;
        this._toolbarOptions = _toolbarOptions;
        this.code = code;
        this.language = language;
        this._originalIndex = _originalIndex;
        this.languageService = languageService;
        this.instantiationService = instantiationService;
        this.container = DOM.append(container, document.createElement('div'));
        this._register(toDisposable(() => {
            container.removeChild(this.container);
        }));
    }
    async render() {
        const code = this.code;
        const languageId = this.language;
        const codeHtml = await tokenizeToString(this.languageService, code, languageId);
        // const colorMap = this.getDefaultColorMap();
        const fontInfo = this._notebookEditor.getBaseCellEditorOptions(languageId).value;
        const fontFamilyVar = '--notebook-editor-font-family';
        const fontSizeVar = '--notebook-editor-font-size';
        const fontWeightVar = '--notebook-editor-font-weight';
        // If we have any editors, then use left layout of one of those.
        const editor = this._notebookEditor.codeEditors.map(c => c[1]).find(c => c);
        const layoutInfo = editor?.getOptions().get(165 /* EditorOption.layoutInfo */);
        const style = ``
            + `font-family: var(${fontFamilyVar});`
            + `font-weight: var(${fontWeightVar});`
            + `font-size: var(${fontSizeVar});`
            + fontInfo.lineHeight ? `line-height: ${fontInfo.lineHeight}px;` : ''
            + layoutInfo?.contentLeft ? `margin-left: ${layoutInfo}px;` : ''
            + `white-space: pre;`;
        const rootContainer = this.container;
        rootContainer.classList.add('code-cell-row');
        if (this._toolbarOptions) {
            const toolbar = document.createElement('div');
            toolbar.className = this._toolbarOptions.className;
            rootContainer.appendChild(toolbar);
            const scopedInstaService = this._register(this.instantiationService.createChild(new ServiceCollection([IContextKeyService, this._notebookEditor.scopedContextKeyService])));
            const toolbarWidget = scopedInstaService.createInstance(MenuWorkbenchToolBar, toolbar, this._toolbarOptions.menuId, {
                telemetrySource: this._toolbarOptions.telemetrySource,
                hiddenItemStrategy: -1 /* HiddenItemStrategy.NoHide */,
                toolbarOptions: { primaryGroup: () => true },
                menuOptions: {
                    renderShortTitle: true,
                    arg: this._toolbarOptions.argFactory(this._originalIndex),
                },
                actionViewItemProvider: this._toolbarOptions.actionViewItemProvider
            });
            this._store.add(toolbarWidget);
            toolbar.style.position = 'absolute';
            toolbar.style.right = '40px';
            toolbar.style.zIndex = '10';
            toolbar.classList.add('hover'); // Show by default
        }
        const container = DOM.append(rootContainer, DOM.$('.cell-inner-container'));
        container.style.position = 'relative'; // Add this line
        const focusIndicatorLeft = DOM.append(container, DOM.$('.cell-focus-indicator.cell-focus-indicator-side.cell-focus-indicator-left'));
        const cellContainer = DOM.append(container, DOM.$('.cell.code'));
        DOM.append(focusIndicatorLeft, DOM.$('div.execution-count-label'));
        const editorPart = DOM.append(cellContainer, DOM.$('.cell-editor-part'));
        let editorContainer = DOM.append(editorPart, DOM.$('.cell-editor-container'));
        editorContainer = DOM.append(editorContainer, DOM.$('.code', { style }));
        if (fontInfo.fontFamily) {
            editorContainer.style.setProperty(fontFamilyVar, fontInfo.fontFamily);
        }
        if (fontInfo.fontSize) {
            editorContainer.style.setProperty(fontSizeVar, `${fontInfo.fontSize}px`);
        }
        if (fontInfo.fontWeight) {
            editorContainer.style.setProperty(fontWeightVar, fontInfo.fontWeight);
        }
        editorContainer.innerHTML = (ttPolicy?.createHTML(codeHtml) || codeHtml);
        const lineCount = splitLines(code).length;
        const height = (lineCount * (fontInfo.lineHeight || DefaultLineHeight)) + 12 + 12; // We have 12px top and bottom in generated code HTML;
        const totalHeight = height + 16 + 16;
        return totalHeight;
    }
};
NotebookDeletedCellWidget = __decorate([
    __param(6, ILanguageService),
    __param(7, IInstantiationService)
], NotebookDeletedCellWidget);
export { NotebookDeletedCellWidget };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibm90ZWJvb2tEZWxldGVkQ2VsbERlY29yYXRvci5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL25vdGVib29rL2Jyb3dzZXIvZGlmZi9pbmxpbmVEaWZmL25vdGVib29rRGVsZXRlZENlbGxEZWNvcmF0b3IudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxFQUFFLHdCQUF3QixFQUFFLE1BQU0sZ0RBQWdELENBQUM7QUFDMUYsT0FBTyxFQUFFLFVBQVUsRUFBRSxlQUFlLEVBQUUsT0FBTyxFQUFFLFlBQVksRUFBRSxNQUFNLDRDQUE0QyxDQUFDO0FBQ2hILE9BQU8sRUFBRSxVQUFVLEVBQUUsTUFBTSwwQ0FBMEMsQ0FBQztBQUV0RSxPQUFPLEVBQUUsZ0JBQWdCLEVBQUUsTUFBTSx1REFBdUQsQ0FBQztBQUN6RixPQUFPLEVBQUUsZ0JBQWdCLEVBQUUsTUFBTSxrRUFBa0UsQ0FBQztBQUdwRyxPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSw0QkFBNEIsQ0FBQztBQUUvRCxPQUFPLEVBQW1CLHlCQUF5QixFQUFFLE1BQU0sMEJBQTBCLENBQUM7QUFDdEYsT0FBTyxLQUFLLEdBQUcsTUFBTSx1Q0FBdUMsQ0FBQztBQUM3RCxPQUFPLEVBQUUsb0JBQW9CLEVBQXNCLE1BQU0sdURBQXVELENBQUM7QUFFakgsT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0sa0VBQWtFLENBQUM7QUFDekcsT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0sc0VBQXNFLENBQUM7QUFDekcsT0FBTyxFQUFFLGtCQUFrQixFQUFFLE1BQU0sNERBQTRELENBQUM7QUFDaEcsT0FBTyxFQUFFLDhCQUE4QixFQUFFLE1BQU0scUNBQXFDLENBQUM7QUFHckYsTUFBTSxRQUFRLEdBQUcsd0JBQXdCLENBQUMsa0JBQWtC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