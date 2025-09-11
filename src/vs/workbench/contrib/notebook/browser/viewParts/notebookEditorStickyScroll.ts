/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as DOM from '../../../../../base/browser/dom.js';
import { EventType as TouchEventType } from '../../../../../base/browser/touch.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { IMouseWheelEvent, StandardMouseEvent } from '../../../../../base/browser/mouseEvent.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { Disposable, DisposableStore, type IReference } from '../../../../../base/common/lifecycle.js';
import { MenuId } from '../../../../../platform/actions/common/actions.js';
import { IContextMenuService } from '../../../../../platform/contextview/browser/contextView.js';
import { CellFoldingState, INotebookEditor } from '../notebookBrowser.js';
import { INotebookCellList } from '../view/notebookRenderingCommon.js';
import { OutlineEntry } from '../viewModel/OutlineEntry.js';
import { NotebookCellOutlineDataSource } from '../viewModel/notebookOutlineDataSource.js';
import { CellKind } from '../../common/notebookCommon.js';
import { Delayer } from '../../../../../base/common/async.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { foldingCollapsedIcon, foldingExpandedIcon } from '../../../../../editor/contrib/folding/browser/foldingDecorations.js';
import { MarkupCellViewModel } from '../viewModel/markupCellViewModel.js';
import { FoldingController } from '../controller/foldingController.js';
import { NotebookOptionsChangeEvent } from '../notebookOptions.js';
import { NotebookOutlineEntryArgs } from '../controller/sectionActions.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { INotebookCellOutlineDataSourceFactory } from '../viewModel/notebookOutlineDataSourceFactory.js';

export class NotebookStickyLine extends Disposable {
	constructor(
		public readonly element: HTMLElement,
		public readonly foldingIcon: StickyFoldingIcon,
		public readonly header: HTMLElement,
		public readonly entry: OutlineEntry,
		public readonly notebookEditor: INotebookEditor,
	) {
		super();
		// click the header to focus the cell
		this._register(DOM.addDisposableListener(this.header, DOM.EventType.CLICK || TouchEventType.Tap, () => {
			this.focusCell();
		}));

		// click the folding icon to fold the range covered by the header
		this._register(DOM.addDisposableListener(this.foldingIcon.domNode, DOM.EventType.CLICK || TouchEventType.Tap, () => {
			if (this.entry.cell.cellKind === CellKind.Markup) {
				const currentFoldingState = (this.entry.cell as MarkupCellViewModel).foldingState;
				this.toggleFoldRange(currentFoldingState);
			}
		}));
	}

	private toggleFoldRange(currentState: CellFoldingState) {
		const foldingController = this.notebookEditor.getContribution<FoldingController>(FoldingController.id);

		const index = this.entry.index;
		const headerLevel = this.entry.level;
		const newFoldingState = (currentState === CellFoldingState.Collapsed) ? CellFoldingState.Expanded : CellFoldingState.Collapsed;

		foldingController.setFoldingStateDown(index, newFoldingState, headerLevel);
		this.focusCell();
	}

	private focusCell() {
		this.notebookEditor.focusNotebookCell(this.entry.cell, 'container');
		const cellScrollTop = this.notebookEditor.getAbsoluteTopOfElement(this.entry.cell);
		const parentCount = NotebookStickyLine.getParentCount(this.entry);
		// 1.1 addresses visible cell padding, to make sure we don't focus md cell and also render its sticky line
		this.notebookEditor.setScrollTop(cellScrollTop - (parentCount + 1.1) * 22);
	}

	static getParentCount(entry: OutlineEntry) {
		let count = 0;
		while (entry.parent) {
			count++;
			entry = entry.parent;
		}
		return count;
	}
}

class StickyFoldingIcon {

	public domNode: HTMLElement;

	constructor(
		public isCollapsed: boolean,
		public dimension: number
	) {
		this.domNode = document.createElement('div');
		this.domNode.style.width = `${dimension}px`;
		this.domNode.style.height = `${dimension}px`;
		this.domNode.className = ThemeIcon.asClassName(isCollapsed ? foldingCollapsedIcon : foldingExpandedIcon);
	}

	public setVisible(visible: boolean) {
		this.domNode.style.cursor = visible ? 'pointer' : 'default';
		this.domNode.style.opacity = visible ? '1' : '0';
	}
}

export class NotebookStickyScroll extends Disposable {
	private readonly _disposables = new DisposableStore();
	private currentStickyLines = new Map<OutlineEntry, { line: NotebookStickyLine; rendered: boolean }>();

	private readonly _onDidChangeNotebookStickyScroll = this._register(new Emitter<number>());
	readonly onDidChangeNotebookStickyScroll: Event<number> = this._onDidChangeNotebookStickyScroll.event;
	private notebookCellOutlineReference?: IReference<NotebookCellOutlineDataSource>;

	private readonly _layoutDisposableStore = this._register(new DisposableStore());

	getDomNode(): HTMLElement {
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

	private setCurrentStickyLines(newStickyLines: Map<OutlineEntry, { line: NotebookStickyLine; rendered: boolean }>) {
		this.currentStickyLines = newStickyLines;
	}

	private compareStickyLineMaps(mapA: Map<OutlineEntry, { line: NotebookStickyLine; rendered: boolean }>, mapB: Map<OutlineEntry, { line: NotebookStickyLine; rendered: boolean }>): boolean {
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

	constructor(
		private readonly domNode: HTMLElement,
		private readonly notebookEditor: INotebookEditor,
		private readonly notebookCellList: INotebookCellList,
		private readonly layoutFn: (delta: number) => void,
		@IContextMenuService private readonly _contextMenuService: IContextMenuService,
		@IInstantiationService private readonly instantiationService: IInstantiationService
	) {
		super();

		if (this.notebookEditor.notebookOptions.getDisplayOptions().stickyScrollEnabled) {
			this.init().catch(console.error);
		}

		this._register(this.notebookEditor.notebookOptions.onDidChangeOptions((e) => {
			if (e.stickyScrollEnabled || e.stickyScrollMode) {
				this.updateConfig(e);
			}
		}));

		this._register(DOM.addDisposableListener(this.domNode, DOM.EventType.CONTEXT_MENU, async (event: MouseEvent) => {
			this.onContextMenu(event);
		}));

		// Forward wheel events to the notebook editor to enable scrolling when hovering over sticky scroll
		this._register(DOM.addDisposableListener(this.domNode, DOM.EventType.WHEEL, (event: WheelEvent) => {
			this.notebookCellList.triggerScrollFromMouseWheelEvent(event as any as IMouseWheelEvent);
		}));
	}

	private onContextMenu(e: MouseEvent) {
		const event = new StandardMouseEvent(DOM.getWindow(this.domNode), e);

		const selectedElement = event.target.parentElement;
		const selectedOutlineEntry = Array.from(this.currentStickyLines.values()).find(entry => entry.line.element.contains(selectedElement))?.line.entry;
		if (!selectedOutlineEntry) {
			return;
		}

		const args: NotebookOutlineEntryArgs = {
			outlineEntry: selectedOutlineEntry,
			notebookEditor: this.notebookEditor,
		};

		this._contextMenuService.showContextMenu({
			menuId: MenuId.NotebookStickyScrollContext,
			getAnchor: () => event,
			menuActionOptions: { shouldForwardArgs: true, arg: args },
		});
	}

	private updateConfig(e: NotebookOptionsChangeEvent) {
		if (e.stickyScrollEnabled) {
			if (this.notebookEditor.notebookOptions.getDisplayOptions().stickyScrollEnabled) {
				this.init().catch(console.error);
			} else {
				this._disposables.clear();
				this.notebookCellOutlineReference?.dispose();
				this.disposeCurrentStickyLines();
				DOM.clearNode(this.domNode);
				this.updateDisplay();
			}
		} else if (e.stickyScrollMode && this.notebookEditor.notebookOptions.getDisplayOptions().stickyScrollEnabled && this.notebookCellOutlineReference?.object) {
			this.updateContent(computeContent(this.notebookEditor, this.notebookCellList, this.notebookCellOutlineReference?.object?.entries, this.getCurrentStickyHeight()));
		}
	}

	private async init() {
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
			} else {
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
				} else {
					// if we don't end up updating the content, we need to avoid leaking the map
					this.disposeStickyLineMap(computed);
				}
			});
		}));
	}

	// Add helper method to dispose a map of sticky lines
	private disposeStickyLineMap(map: Map<OutlineEntry, { line: NotebookStickyLine; rendered: boolean }>) {
		map.forEach(value => {
			if (value.line) {
				value.line.dispose();
			}
		});
	}

	// take in an cell index, and get the corresponding outline entry
	static getVisibleOutlineEntry(visibleIndex: number, notebookOutlineEntries: OutlineEntry[]): OutlineEntry | undefined {
		let left = 0;
		let right = notebookOutlineEntries.length - 1;

		while (left <= right) {
			const mid = Math.floor((left + right) / 2);
			if (notebookOutlineEntries[mid].index === visibleIndex) {
				// Exact match found
				const rootEntry = notebookOutlineEntries[mid];
				const flatList: OutlineEntry[] = [];
				rootEntry.asFlatList(flatList);
				return flatList.find(entry => entry.index === visibleIndex);
			} else if (notebookOutlineEntries[mid].index < visibleIndex) {
				left = mid + 1;
			} else {
				right = mid - 1;
			}
		}

		// No exact match found - get the closest smaller entry
		if (right >= 0) {
			const rootEntry = notebookOutlineEntries[right];
			const flatList: OutlineEntry[] = [];
			rootEntry.asFlatList(flatList);
			return flatList.find(entry => entry.index === visibleIndex);
		}

		return undefined;
	}

	private updateContent(newMap: Map<OutlineEntry, { line: NotebookStickyLine; rendered: boolean }>) {
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
		} else {
			this.updateDisplay();
		}
	}

	private updateDisplay() {
		const hasSticky = this.getCurrentStickyHeight() > 0;
		if (!hasSticky) {
			this.domNode.style.display = 'none';
		} else {
			this.domNode.style.display = 'block';
		}
	}

	static computeStickyHeight(entry: OutlineEntry) {
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

	static checkCollapsedStickyLines(entry: OutlineEntry | undefined, numLinesToRender: number, notebookEditor: INotebookEditor) {
		let currentEntry = entry;
		const newMap = new Map<OutlineEntry, { line: NotebookStickyLine; rendered: boolean }>();

		const elementsToRender = [];
		while (currentEntry) {
			if (currentEntry.level >= 7) {
				// level 7+ represents a non-header entry, which we don't want to render
				currentEntry = currentEntry.parent;
				continue;
			}
			const lineToRender = NotebookStickyScroll.createStickyElement(currentEntry, notebookEditor);
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

	private renderStickyLines(stickyMap: Map<OutlineEntry, { line: NotebookStickyLine; rendered: boolean }>, containerElement: HTMLElement) {
		const reversedEntries = Array.from(stickyMap.entries()).reverse();
		for (const [, value] of reversedEntries) {
			if (!value.rendered) {
				continue;
			}
			containerElement.append(value.line.element);
		}
	}

	static createStickyElement(entry: OutlineEntry, notebookEditor: INotebookEditor) {
		const stickyElement = document.createElement('div');
		stickyElement.classList.add('notebook-sticky-scroll-element');

		const indentMode = notebookEditor.notebookOptions.getLayoutConfiguration().stickyScrollMode;
		if (indentMode === 'indented') {
			stickyElement.style.paddingLeft = NotebookStickyLine.getParentCount(entry) * 10 + 'px';
		}

		let isCollapsed = false;
		if (entry.cell.cellKind === CellKind.Markup) {
			isCollapsed = (entry.cell as MarkupCellViewModel).foldingState === CellFoldingState.Collapsed;
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

	private disposeCurrentStickyLines() {
		this.currentStickyLines.forEach((value) => {
			value.line.dispose();
		});
	}

	override dispose() {
		this._disposables.dispose();
		this.disposeCurrentStickyLines();
		this.notebookCellOutlineReference?.dispose();
		super.dispose();
	}
}

export function computeContent(notebookEditor: INotebookEditor, notebookCellList: INotebookCellList, notebookOutlineEntries: OutlineEntry[], renderedStickyHeight: number): Map<OutlineEntry, { line: NotebookStickyLine; rendered: boolean }> {
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
				} else {
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
