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
var NotebookStickyScroll_1;
import * as DOM from '../../../../../base/browser/dom.js';
import { EventType as TouchEventType } from '../../../../../base/browser/touch.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { StandardMouseEvent } from '../../../../../base/browser/mouseEvent.js';
import { Emitter } from '../../../../../base/common/event.js';
import { Disposable, DisposableStore } from '../../../../../base/common/lifecycle.js';
import { MenuId } from '../../../../../platform/actions/common/actions.js';
import { IContextMenuService } from '../../../../../platform/contextview/browser/contextView.js';
import { CellKind } from '../../common/notebookCommon.js';
import { Delayer } from '../../../../../base/common/async.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { foldingCollapsedIcon, foldingExpandedIcon } from '../../../../../editor/contrib/folding/browser/foldingDecorations.js';
import { FoldingController } from '../controller/foldingController.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { INotebookCellOutlineDataSourceFactory } from '../viewModel/notebookOutlineDataSourceFactory.js';
export class NotebookStickyLine extends Disposable {
    constructor(element, foldingIcon, header, entry, notebookEditor) {
        super();
        this.element = element;
        this.foldingIcon = foldingIcon;
        this.header = header;
        this.entry = entry;
        this.notebookEditor = notebookEditor;
        // click the header to focus the cell
        this._register(DOM.addDisposableListener(this.header, DOM.EventType.CLICK || TouchEventType.Tap, () => {
            this.focusCell();
        }));
        // click the folding icon to fold the range covered by the header
        this._register(DOM.addDisposableListener(this.foldingIcon.domNode, DOM.EventType.CLICK || TouchEventType.Tap, () => {
            if (this.entry.cell.cellKind === CellKind.Markup) {
                const currentFoldingState = this.entry.cell.foldingState;
                this.toggleFoldRange(currentFoldingState);
            }
        }));
    }
    toggleFoldRange(currentState) {
        const foldingController = this.notebookEditor.getContribution(FoldingController.id);
        const index = this.entry.index;
        const headerLevel = this.entry.level;
        const newFoldingState = (currentState === 2 /* CellFoldingState.Collapsed */) ? 1 /* CellFoldingState.Expanded */ : 2 /* CellFoldingState.Collapsed */;
        foldingController.setFoldingStateDown(index, newFoldingState, headerLevel);
        this.focusCell();
    }
    focusCell() {
        this.notebookEditor.focusNotebookCell(this.entry.cell, 'container');
        const cellScrollTop = this.notebookEditor.getAbsoluteTopOfElement(this.entry.cell);
        const parentCount = NotebookStickyLine.getParentCount(this.entry);
        // 1.1 addresses visible cell padding, to make sure we don't focus md cell and also render its sticky line
        this.notebookEditor.setScrollTop(cellScrollTop - (parentCount + 1.1) * 22);
    }
    static getParentCount(entry) {
        let count = 0;
        while (entry.parent) {
            count++;
            entry = entry.parent;
        }
        return count;
    }
}
class StickyFoldingIcon {
    constructor(isCollapsed, dimension) {
        this.isCollapsed = isCollapsed;
        this.dimension = dimension;
        this.domNode = document.createElement('div');
        this.domNode.style.width = `${dimension}px`;
        this.domNode.style.height = `${dimension}px`;
        this.domNode.className = ThemeIcon.asClassName(isCollapsed ? foldingCollapsedIcon : foldingExpandedIcon);
    }
    setVisible(visible) {
        this.domNode.style.cursor = visible ? 'pointer' : 'default';
        this.domNode.style.opacity = visible ? '1' : '0';
    }
}
let NotebookStickyScroll = NotebookStickyScroll_1 = class NotebookStickyScroll extends Disposable {
    getDomNode() {
        return this.domNode;
    }
    getCurrentStickyHeight() {
        let height = 0;
        this.currentStickyLines.forEach((value) => {
            if (value.rendered) {
                height += 22;
            }
        });
        return height;
    }
    setCurrentStickyLines(newStickyLines) {
        this.currentStickyLines = newStickyLines;
    }
    compareStickyLineMaps(mapA, mapB) {
        if (mapA.size !== mapB.size) {
            return false;
        }
        for (const [key, value] of mapA) {
            const otherValue = mapB.get(key);
            if (!otherValue || value.rendered !== otherValue.rendered) {
                return false;
            }
        }
        return true;
    }
    constructor(domNode, notebookEditor, notebookCellList, layoutFn, _contextMenuService, instantiationService) {
        super();
        this.domNode = domNode;
        this.notebookEditor = notebookEditor;
        this.notebookCellList = notebookCellList;
        this.layoutFn = layoutFn;
        this._contextMenuService = _contextMenuService;
        this.instantiationService = instantiationService;
        this._disposables = new DisposableStore();
        this.currentStickyLines = new Map();
        this._onDidChangeNotebookStickyScroll = this._register(new Emitter());
        this.onDidChangeNotebookStickyScroll = this._onDidChangeNotebookStickyScroll.event;
        this._layoutDisposableStore = this._register(new DisposableStore());
        if (this.notebookEditor.notebookOptions.getDisplayOptions().stickyScrollEnabled) {
            this.init().catch(console.error);
        }
        this._register(this.notebookEditor.notebookOptions.onDidChangeOptions((e) => {
            if (e.stickyScrollEnabled || e.stickyScrollMode) {
                this.updateConfig(e);
            }
        }));
        this._register(DOM.addDisposableListener(this.domNode, DOM.EventType.CONTEXT_MENU, async (event) => {
            this.onContextMenu(event);
        }));
        // Forward wheel events to the notebook editor to enable scrolling when hovering over sticky scroll
        this._register(DOM.addDisposableListener(this.domNode, DOM.EventType.WHEEL, (event) => {
            this.notebookCellList.triggerScrollFromMouseWheelEvent(event);
        }));
    }
    onContextMenu(e) {
        const event = new StandardMouseEvent(DOM.getWindow(this.domNode), e);
        const selectedElement = event.target.parentElement;
        const selectedOutlineEntry = Array.from(this.currentStickyLines.values()).find(entry => entry.line.element.contains(selectedElement))?.line.entry;
        if (!selectedOutlineEntry) {
            return;
        }
        const args = {
            outlineEntry: selectedOutlineEntry,
            notebookEditor: this.notebookEditor,
        };
        this._contextMenuService.showContextMenu({
            menuId: MenuId.NotebookStickyScrollContext,
            getAnchor: () => event,
            menuActionOptions: { shouldForwardArgs: true, arg: args, renderShortTitle: true },
        });
    }
    updateConfig(e) {
        if (e.stickyScrollEnabled) {
            if (this.notebookEditor.notebookOptions.getDisplayOptions().stickyScrollEnabled) {
                this.init().catch(console.error);
            }
            else {
                this._disposables.clear();
                this.notebookCellOutlineReference?.dispose();
                this.disposeCurrentStickyLines();
                DOM.clearNode(this.domNode);
                this.updateDisplay();
            }
        }
        else if (e.stickyScrollMode && this.notebookEditor.notebookOptions.getDisplayOptions().stickyScrollEnabled && this.notebookCellOutlineReference?.object) {
            this.updateContent(computeContent(this.notebookEditor, this.notebookCellList, this.notebookCellOutlineReference?.object?.entries, this.getCurrentStickyHeight()));
        }
    }
    async init() {
        const { object: notebookCellOutline } = this.notebookCellOutlineReference = this.instantiationService.invokeFunction((accessor) => accessor.get(INotebookCellOutlineDataSourceFactory).getOrCreate(this.notebookEditor));
        this._register(this.notebookCellOutlineReference);
        // Ensure symbols are computed first
        await notebookCellOutline.computeFullSymbols(CancellationToken.None);
        // Initial content update
        const computed = computeContent(this.notebookEditor, this.notebookCellList, notebookCellOutline.entries, this.getCurrentStickyHeight());
        this.updateContent(computed);
        // Set up outline change listener
        this._disposables.add(notebookCellOutline.onDidChange(() => {
            const computed = computeContent(this.notebookEditor, this.notebookCellList, notebookCellOutline.entries, this.getCurrentStickyHeight());
            if (!this.compareStickyLineMaps(computed, this.currentStickyLines)) {
                this.updateContent(computed);
            }
            else {
                // if we don't end up updating the content, we need to avoid leaking the map
                this.disposeStickyLineMap(computed);
            }
        }));
        // Handle view model changes
        this._disposables.add(this.notebookEditor.onDidAttachViewModel(async () => {
            // ensure recompute symbols when view model changes -- could be missed if outline is closed
            await notebookCellOutline.computeFullSymbols(CancellationToken.None);
            const computed = computeContent(this.notebookEditor, this.notebookCellList, notebookCellOutline.entries, this.getCurrentStickyHeight());
            this.updateContent(computed);
        }));
        this._disposables.add(this.notebookEditor.onDidScroll(() => {
            const d = new Delayer(100);
            d.trigger(() => {
                d.dispose();
                const computed = computeContent(this.notebookEditor, this.notebookCellList, notebookCellOutline.entries, this.getCurrentStickyHeight());
                if (!this.compareStickyLineMaps(computed, this.currentStickyLines)) {
                    this.updateContent(computed);
                }
                else {
                    // if we don't end up updating the content, we need to avoid leaking the map
                    this.disposeStickyLineMap(computed);
                }
            });
        }));
    }
    // Add helper method to dispose a map of sticky lines
    disposeStickyLineMap(map) {
        map.forEach(value => {
            if (value.line) {
                value.line.dispose();
            }
        });
    }
    // take in an cell index, and get the corresponding outline entry
    static getVisibleOutlineEntry(visibleIndex, notebookOutlineEntries) {
        let left = 0;
        let right = notebookOutlineEntries.length - 1;
        while (left <= right) {
            const mid = Math.floor((left + right) / 2);
            if (notebookOutlineEntries[mid].index === visibleIndex) {
                // Exact match found
                const rootEntry = notebookOutlineEntries[mid];
                const flatList = [];
                rootEntry.asFlatList(flatList);
                return flatList.find(entry => entry.index === visibleIndex);
            }
            else if (notebookOutlineEntries[mid].index < visibleIndex) {
                left = mid + 1;
            }
            else {
                right = mid - 1;
            }
        }
        // No exact match found - get the closest smaller entry
        if (right >= 0) {
            const rootEntry = notebookOutlineEntries[right];
            const flatList = [];
            rootEntry.asFlatList(flatList);
            return flatList.find(entry => entry.index === visibleIndex);
        }
        return undefined;
    }
    updateContent(newMap) {
        DOM.clearNode(this.domNode);
        this.disposeCurrentStickyLines();
        this.renderStickyLines(newMap, this.domNode);
        const oldStickyHeight = this.getCurrentStickyHeight();
        this.setCurrentStickyLines(newMap);
        // (+) = sticky height increased
        // (-) = sticky height decreased
        const sizeDelta = this.getCurrentStickyHeight() - oldStickyHeight;
        if (sizeDelta !== 0) {
            this._onDidChangeNotebookStickyScroll.fire(sizeDelta);
            const d = this._layoutDisposableStore.add(DOM.scheduleAtNextAnimationFrame(DOM.getWindow(this.getDomNode()), () => {
                this.layoutFn(sizeDelta);
                this.updateDisplay();
                this._layoutDisposableStore.delete(d);
            }));
        }
        else {
            this.updateDisplay();
        }
    }
    updateDisplay() {
        const hasSticky = this.getCurrentStickyHeight() > 0;
        if (!hasSticky) {
            this.domNode.style.display = 'none';
        }
        else {
            this.domNode.style.display = 'block';
        }
    }
    static computeStickyHeight(entry) {
        let height = 0;
        if (entry.cell.cellKind === CellKind.Markup && entry.level < 7) {
            height += 22;
        }
        while (entry.parent) {
            height += 22;
            entry = entry.parent;
        }
        return height;
    }
    static checkCollapsedStickyLines(entry, numLinesToRender, notebookEditor) {
        let currentEntry = entry;
        const newMap = new Map();
        const elementsToRender = [];
        while (currentEntry) {
            if (currentEntry.level >= 7) {
                // level 7+ represents a non-header entry, which we don't want to render
                currentEntry = currentEntry.parent;
                continue;
            }
            const lineToRender = NotebookStickyScroll_1.createStickyElement(currentEntry, notebookEditor);
            newMap.set(currentEntry, { line: lineToRender, rendered: false });
            elementsToRender.unshift(lineToRender);
            currentEntry = currentEntry.parent;
        }
        // iterate over elements to render, and append to container
        // break when we reach numLinesToRender
        for (let i = 0; i < elementsToRender.length; i++) {
            if (i >= numLinesToRender) {
                break;
            }
            newMap.set(elementsToRender[i].entry, { line: elementsToRender[i], rendered: true });
        }
        return newMap;
    }
    renderStickyLines(stickyMap, containerElement) {
        const reversedEntries = Array.from(stickyMap.entries()).reverse();
        for (const [, value] of reversedEntries) {
            if (!value.rendered) {
                continue;
            }
            containerElement.append(value.line.element);
        }
    }
    static createStickyElement(entry, notebookEditor) {
        const stickyElement = document.createElement('div');
        stickyElement.classList.add('notebook-sticky-scroll-element');
        const indentMode = notebookEditor.notebookOptions.getLayoutConfiguration().stickyScrollMode;
        if (indentMode === 'indented') {
            stickyElement.style.paddingLeft = NotebookStickyLine.getParentCount(entry) * 10 + 'px';
        }
        let isCollapsed = false;
        if (entry.cell.cellKind === CellKind.Markup) {
            isCollapsed = entry.cell.foldingState === 2 /* CellFoldingState.Collapsed */;
        }
        const stickyFoldingIcon = new StickyFoldingIcon(isCollapsed, 16);
        stickyFoldingIcon.domNode.classList.add('notebook-sticky-scroll-folding-icon');
        stickyFoldingIcon.setVisible(true);
        const stickyHeader = document.createElement('div');
        stickyHeader.classList.add('notebook-sticky-scroll-header');
        stickyHeader.innerText = entry.label;
        stickyElement.append(stickyFoldingIcon.domNode, stickyHeader);
        return new NotebookStickyLine(stickyElement, stickyFoldingIcon, stickyHeader, entry, notebookEditor);
    }
    disposeCurrentStickyLines() {
        this.currentStickyLines.forEach((value) => {
            value.line.dispose();
        });
    }
    dispose() {
        this._disposables.dispose();
        this.disposeCurrentStickyLines();
        this.notebookCellOutlineReference?.dispose();
        super.dispose();
    }
};
NotebookStickyScroll = NotebookStickyScroll_1 = __decorate([
    __param(4, IContextMenuService),
    __param(5, IInstantiationService)
], NotebookStickyScroll);
export { NotebookStickyScroll };
export function computeContent(notebookEditor, notebookCellList, notebookOutlineEntries, renderedStickyHeight) {
    // get data about the cell list within viewport ----------------------------------------------------------------------------------------
    const editorScrollTop = notebookEditor.scrollTop - renderedStickyHeight;
    const visibleRange = notebookEditor.visibleRanges[0];
    if (!visibleRange) {
        return new Map();
    }
    // edge case for cell 0 in the notebook is a header ------------------------------------------------------------------------------------
    if (visibleRange.start === 0) {
        const firstCell = notebookEditor.cellAt(0);
        const firstCellEntry = NotebookStickyScroll.getVisibleOutlineEntry(0, notebookOutlineEntries);
        if (firstCell && firstCellEntry && firstCell.cellKind === CellKind.Markup && firstCellEntry.level < 7) {
            if (notebookEditor.scrollTop > 22) {
                const newMap = NotebookStickyScroll.checkCollapsedStickyLines(firstCellEntry, 100, notebookEditor);
                return newMap;
            }
        }
    }
    // iterate over cells in viewport ------------------------------------------------------------------------------------------------------
    let cell;
    let cellEntry;
    const startIndex = visibleRange.start - 1; // -1 to account for cells hidden "under" sticky lines.
    for (let currentIndex = startIndex; currentIndex < visibleRange.end; currentIndex++) {
        // store data for current cell, and next cell
        cell = notebookEditor.cellAt(currentIndex);
        if (!cell) {
            return new Map();
        }
        cellEntry = NotebookStickyScroll.getVisibleOutlineEntry(currentIndex, notebookOutlineEntries);
        if (!cellEntry) {
            continue;
        }
        const nextCell = notebookEditor.cellAt(currentIndex + 1);
        if (!nextCell) {
            const sectionBottom = notebookEditor.getLayoutInfo().scrollHeight;
            const linesToRender = Math.floor((sectionBottom) / 22);
            const newMap = NotebookStickyScroll.checkCollapsedStickyLines(cellEntry, linesToRender, notebookEditor);
            return newMap;
        }
        const nextCellEntry = NotebookStickyScroll.getVisibleOutlineEntry(currentIndex + 1, notebookOutlineEntries);
        if (!nextCellEntry) {
            continue;
        }
        // check next cell, if markdown with non level 7 entry, that means this is the end of the section (new header) ---------------------
        if (nextCell.cellKind === CellKind.Markup && nextCellEntry.level < 7) {
            const sectionBottom = notebookCellList.getCellViewScrollTop(nextCell);
            const currentSectionStickyHeight = NotebookStickyScroll.computeStickyHeight(cellEntry);
            const nextSectionStickyHeight = NotebookStickyScroll.computeStickyHeight(nextCellEntry);
            // case: we can render the all sticky lines for the current section ------------------------------------------------------------
            if (editorScrollTop + currentSectionStickyHeight < sectionBottom) {
                const linesToRender = Math.floor((sectionBottom - editorScrollTop) / 22);
                const newMap = NotebookStickyScroll.checkCollapsedStickyLines(cellEntry, linesToRender, notebookEditor);
                return newMap;
            }
            // case: next section is the same size or bigger, render next entry -----------------------------------------------------------
            else if (nextSectionStickyHeight >= currentSectionStickyHeight) {
                const newMap = NotebookStickyScroll.checkCollapsedStickyLines(nextCellEntry, 100, notebookEditor);
                return newMap;
            }
            // case: next section is the smaller, shrink until next section height is greater than the available space ---------------------
            else if (nextSectionStickyHeight < currentSectionStickyHeight) {
                const availableSpace = sectionBottom - editorScrollTop;
                if (availableSpace >= nextSectionStickyHeight) {
                    const linesToRender = Math.floor((availableSpace) / 22);
                    const newMap = NotebookStickyScroll.checkCollapsedStickyLines(cellEntry, linesToRender, notebookEditor);
                    return newMap;
                }
                else {
                    const newMap = NotebookStickyScroll.checkCollapsedStickyLines(nextCellEntry, 100, notebookEditor);
                    return newMap;
                }
            }
        }
    } // visible range loop close
    // case: all visible cells were non-header cells, so render any headers relevant to their section --------------------------------------
    const sectionBottom = notebookEditor.getLayoutInfo().scrollHeight;
    const linesToRender = Math.floor((sectionBottom - editorScrollTop) / 22);
    const newMap = NotebookStickyScroll.checkCollapsedStickyLines(cellEntry, linesToRender, notebookEditor);
    return newMap;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibm90ZWJvb2tFZGl0b3JTdGlja3lTY3JvbGwuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9ub3RlYm9vay9icm93c2VyL3ZpZXdQYXJ0cy9ub3RlYm9va0VkaXRvclN0aWNreVNjcm9sbC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxLQUFLLEdBQUcsTUFBTSxvQ0FBb0MsQ0FBQztBQUMxRCxPQUFPLEVBQUUsU0FBUyxJQUFJLGNBQWMsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBQ25GLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLDRDQUE0QyxDQUFDO0FBQy9FLE9BQU8sRUFBb0Isa0JBQWtCLEVBQUUsTUFBTSwyQ0FBMkMsQ0FBQztBQUNqRyxPQUFPLEVBQUUsT0FBTyxFQUFTLE1BQU0scUNBQXFDLENBQUM7QUFDckUsT0FBTyxFQUFFLFVBQVUsRUFBRSxlQUFlLEVBQW1CLE1BQU0seUNBQXlDLENBQUM7QUFDdkcsT0FBTyxFQUFFLE1BQU0sRUFBRSxNQUFNLG1EQUFtRCxDQUFDO0FBQzNFLE9BQU8sRUFBRSxtQkFBbUIsRUFBRSxNQUFNLDREQUE0RCxDQUFDO0FBS2pHLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxnQ0FBZ0MsQ0FBQztBQUMxRCxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0scUNBQXFDLENBQUM7QUFDOUQsT0FBTyxFQUFFLFNBQVMsRUFBRSxNQUFNLHlDQUF5QyxDQUFDO0FBQ3BFLE9BQU8sRUFBRSxvQkFBb0IsRUFBRSxtQkFBbUIsRUFBRSxNQUFNLHFFQUFxRSxDQUFDO0FBRWhJLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLG9DQUFvQyxDQUFDO0FBR3ZFLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLCtEQUErRCxDQUFDO0FBQ3RHLE9BQU8s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