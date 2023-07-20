/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as DOM from 'vs/base/browser/dom';
import { Disposable, DisposableStore } from 'vs/base/common/lifecycle';
import { INotebookEditor } from 'vs/workbench/contrib/notebook/browser/notebookBrowser';
import { INotebookCellList } from 'vs/workbench/contrib/notebook/browser/view/notebookRenderingCommon';
import { NotebookCellOutlineProvider, OutlineEntry } from 'vs/workbench/contrib/notebook/browser/viewModel/notebookOutlineProvider';
import { CellKind } from 'vs/workbench/contrib/notebook/common/notebookCommon';


export class NotebookEditorStickyScroll extends Disposable {
	private readonly _disposables = new DisposableStore();

	constructor(
		private readonly domNode: HTMLElement,
		private readonly notebookEditor: INotebookEditor,
		private readonly notebookOutline: NotebookCellOutlineProvider,
		private readonly notebookCellList: INotebookCellList
	) {
		super();

		if (this.notebookEditor.notebookOptions.getLayoutConfiguration().stickyScroll) {
			this.init();
		}

		this._register(this.notebookEditor.notebookOptions.onDidChangeOptions((e) => {
			if (e.stickyScroll) {
				this.updateConfig();
			}
			if (e.globalToolbar) {
				this.setTop();
			}
		}));
	}

	private updateConfig() {
		if (this.notebookEditor.notebookOptions.getLayoutConfiguration().stickyScroll) {
			this.init();
		} else {
			this._disposables.clear();
			DOM.clearNode(this.domNode);
			this.updateDisplay();
		}
	}

	private setTop() {
		if (this.notebookEditor.notebookOptions.getLayoutConfiguration().globalToolbar) {
			this.domNode.style.top = '26px';
		} else {
			this.domNode.style.top = '0px';
		}
	}

	private init() {
		this.notebookOutline.init();
		this.initializeContent();

		this._disposables.add(this.notebookOutline.onDidChange(() => {
			this.updateContent();
		}));

		this._disposables.add(this.notebookEditor.onDidAttachViewModel(() => {
			this.notebookOutline.init();
			this.initializeContent();
		}));

		this._disposables.add(this.notebookEditor.onDidScroll(() => {
			this.updateContent();
		}));
	}

	private getVisibleOutlineEntry(visibleIndex: number): OutlineEntry | undefined {
		let left = 0;
		let right = this.notebookOutline.entries.length - 1;
		let bucket = -1;

		while (left <= right) {
			const mid = Math.floor((left + right) / 2);
			if (this.notebookOutline.entries[mid].index < visibleIndex) {
				bucket = mid;
				left = mid + 1;
			} else {
				right = mid - 1;
			}
		}

		if (bucket !== -1) {
			const rootEntry = this.notebookOutline.entries[bucket];
			const flatList: OutlineEntry[] = [];
			rootEntry.asFlatList(flatList);
			return flatList.find(entry => entry.index === visibleIndex);
		}
		return undefined;
	}

	private initializeContent() {

		// find last code cell of section, store bottom scroll position in sectionBottom
		const visibleRange = this.notebookEditor.visibleRanges[0];
		if (!visibleRange) {
			return;
		}

		DOM.clearNode(this.domNode);
		const editorScrollTop = this.notebookEditor.scrollTop;

		let trackedEntry = undefined;
		let sectionBottom = 0;
		for (let i = visibleRange.start; i < visibleRange.end; i++) {
			if (i === 0) { // don't show headers when you're viewing the top cell
				return;
			}
			const cell = this.notebookEditor.cellAt(i);
			if (!cell) {
				return;
			}
			if (cell.cellKind === CellKind.Markup) {
				continue;
			}

			// if we are here, the cell is a code cell.
			// check next cell, if markdown, that means this is the end of the section
			const nextCell = this.notebookEditor.cellAt(i + 1);
			if (nextCell) {
				if (nextCell.cellKind === CellKind.Markup) {
					// this is the end of the section
					// store the bottom scroll position of this cell
					sectionBottom = this.notebookCellList.getCellViewScrollBottom(cell);
					// compute sticky scroll height
					const entry = this.getVisibleOutlineEntry(i);
					if (!entry) {
						return;
					}
					// using 22 instead of stickyscrollheight, as we don't necessarily render each line. 22 starts rendering sticky when we have space for at least 1 of them
					const newStickyHeight = this.computeStickyHeight(entry!);
					if (editorScrollTop + newStickyHeight < sectionBottom) {
						trackedEntry = entry;
						break;
					} else {
						// if (editorScrollTop + stickyScrollHeight > sectionBottom), then continue to next section
						continue;
					}
				}
			} else {
				// there is no next cell, so use the bottom of the editor as the sectionBottom, using scrolltop + height
				sectionBottom = this.notebookEditor.scrollTop + this.notebookEditor.getLayoutInfo().scrollHeight;
				trackedEntry = this.getVisibleOutlineEntry(i);
				break;
			}
		} // cell loop close

		// -------------------------------------------------------------------------------------
		// we now know the cell which the sticky is determined by, and the sectionBottom value to determine how many sticky lines to render
		// compute the space available for sticky lines, and render sticky lines

		const linesToRender = Math.floor((sectionBottom - editorScrollTop) / 22);
		this.renderStickyLines(trackedEntry?.parent, this.domNode, linesToRender);
		this.updateDisplay();
	}


	private updateContent() {
		// find first code cell in visible range. this marks the start of the first section
		// find the last code cell in the first section of the visible range, store the bottom scroll position in a const sectionBottom
		// compute sticky scroll height, and check if editorScrolltop + stickyScrollHeight < sectionBottom // ? maybe use 22 instead of stickyscrollheight, as we don't necessarily render each line
		// if that condition is true, break out of the loop with that cell as the tracked cell
		// if that condition is false, continue to next cell

		DOM.clearNode(this.domNode);
		const editorScrollTop = this.notebookEditor.scrollTop;

		// find last code cell of section, store bottom scroll position in sectionBottom
		const visibleRange = this.notebookEditor.visibleRanges[0];
		if (!visibleRange) {
			return;
		}

		let trackedEntry = undefined;
		let sectionBottom = 0;
		for (let i = visibleRange.start; i < visibleRange.end; i++) {
			if (i === 0) { // don't show headers when you're viewing the top cell
				this.updateDisplay();
				return;
			}
			const cell = this.notebookEditor.cellAt(i);
			if (!cell) {
				return;
			}
			if (cell.cellKind === CellKind.Markup) {
				continue;
			}

			// if we are here, the cell is a code cell.
			// check next cell, if markdown, that means this is the end of the section
			const nextCell = this.notebookEditor.cellAt(i + 1);
			if (nextCell) {
				if (nextCell.cellKind === CellKind.Markup) {
					// this is the end of the section
					// store the bottom scroll position of this cell
					sectionBottom = this.notebookCellList.getCellViewScrollBottom(cell);
					// compute sticky scroll height
					const entry = this.getVisibleOutlineEntry(i);
					if (!entry) {
						return;
					}
					// check if we can render this section of sticky
					const currentSectionStickyHeight = this.computeStickyHeight(entry!);
					if (editorScrollTop + currentSectionStickyHeight < sectionBottom) {
						const linesToRender = Math.floor((sectionBottom - editorScrollTop) / 22);
						this.renderStickyLines(entry?.parent, this.domNode, linesToRender);
						break;
					}

					let nextSectionEntry = undefined;
					for (let j = 1; j < visibleRange.end - i; j++) {
						// find next code cell after this one
						const cellCheck = this.notebookEditor.cellAt(i + j);
						if (cellCheck && cellCheck.cellKind === CellKind.Code) {
							nextSectionEntry = this.getVisibleOutlineEntry(i + j);
							break;
						}
					}
					const nextSectionStickyHeight = this.computeStickyHeight(nextSectionEntry!);

					// this block of logic cleans transitions between two sections that share a parent.
					// if the current section and the next section share a parent, then we can render the next section's sticky lines to avoid pop-in between
					if (entry?.parent?.parent === nextSectionEntry?.parent) {
						const linesToRender = Math.floor((sectionBottom - editorScrollTop) / 22) + 1;
						this.renderStickyLines(nextSectionEntry?.parent, this.domNode, linesToRender);
						break;
					} else if (Math.abs(currentSectionStickyHeight - nextSectionStickyHeight) > 22) { // only shrink sticky
						const linesToRender = Math.floor((sectionBottom - editorScrollTop) / 22);
						this.renderStickyLines(entry?.parent, this.domNode, linesToRender);
						break;
					}
				}
			} else {
				// there is no next cell, so use the bottom of the editor as the sectionBottom, using scrolltop + height
				sectionBottom = this.notebookEditor.scrollTop + this.notebookEditor.getLayoutInfo().scrollHeight;
				trackedEntry = this.getVisibleOutlineEntry(i);
				const linesToRender = Math.floor((sectionBottom - editorScrollTop) / 22);
				this.renderStickyLines(trackedEntry?.parent, this.domNode, linesToRender);
				break;
			}
		} // cell loop close
		this.updateDisplay();
	}

	private updateDisplay() {
		const hasChildren = this.domNode.hasChildNodes();
		if (!hasChildren) {
			this.domNode.style.display = 'none';
		} else {
			this.domNode.style.display = 'block';
		}
		this.setTop();
	}

	private computeStickyHeight(entry: OutlineEntry) {
		let height = 0;
		while (entry.parent) {
			height += 22;
			entry = entry.parent;
		}
		return height;
	}

	private renderStickyLines(entry: OutlineEntry | undefined, containerElement: HTMLElement, linesToRender: number) {
		const partial = false;
		if (!entry) {
			return;
		}
		if (entry.parent) {
			this.renderStickyLines(entry.parent, containerElement, linesToRender);
		}

		const numStickyLines = containerElement.children.length;
		if (numStickyLines >= linesToRender) {
			return;
		}

		DOM.append(containerElement, this.createStickyElement(entry, partial));
	}

	private createStickyElement(entry: OutlineEntry, partial: boolean) {
		const stickyLine = document.createElement('div');
		stickyLine.classList.add('notebook-sticky-scroll-line');
		stickyLine.innerText = '#'.repeat(entry.level) + ' ' + entry.label;

		// todo: partial line rendering for animater
		if (partial) {
			// const partialHeight = Math.floor(remainder * 22);
			// stickyLine.style.height = `${partialHeight}px`;
		}

		return stickyLine;
	}

	override dispose() {
		this._disposables.dispose();
		super.dispose();
	}
}
