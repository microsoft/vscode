/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as DOM from 'vs/base/browser/dom';
import { DomScrollableElement } from 'vs/base/browser/ui/scrollbar/scrollableElement';
import { Disposable, DisposableStore } from 'vs/base/common/lifecycle';
import { NotebookVisibleCellObserver } from 'vs/workbench/contrib/notebook/browser/contrib/cellStatusBar/notebookVisibleCellObserver';
import { INotebookEditor } from 'vs/workbench/contrib/notebook/browser/notebookBrowser';
import { getMarkdownHeadersInCell } from 'vs/workbench/contrib/notebook/browser/viewModel/foldingModel';
import { OutlineEntry } from 'vs/workbench/contrib/notebook/browser/contrib/outline/notebookOutline';
import { CellKind } from 'vs/workbench/contrib/notebook/common/notebookCommon';


export class NotebookEditorStickyScroll extends Disposable {
	private _stickyScrollScrollableElement!: DomScrollableElement;
	private _stickyScrollContainer!: HTMLElement;
	private _stickyScrollContent!: StickyScrollContent;
	private _dimension: DOM.Dimension | null = null;
	private readonly _disposables = new DisposableStore();


	constructor(
		private readonly domNode: HTMLElement,
		private readonly notebookEditor: INotebookEditor,
	) {
		super();
		this._buildBody(this.notebookEditor);
	}


	private _buildBody(nbEditor: INotebookEditor) {

		this._stickyScrollContainer = document.createElement('div');
		this._stickyScrollContainer.classList.add('notebook-sticky-scroll-container');

		this._stickyScrollScrollableElement = new DomScrollableElement(this._stickyScrollContainer, {});

		this._stickyScrollContainer.style.width = '100%';
		this._stickyScrollContainer.style.height = '22px';
		this._stickyScrollContainer.style.fontFamily = 'var(--notebook-cell-input-preview-font-family)';


		this._stickyScrollContent = new StickyScrollContent(nbEditor);
		DOM.append(this._stickyScrollContainer, this._stickyScrollContent.domNode);
		DOM.append(this.domNode, this._stickyScrollContainer);
		this._register(this._stickyScrollScrollableElement);
		this._stickyScrollContent.updateContent();

		this._registerNotebookStickyScroll();
	}

	private _registerNotebookStickyScroll() {
		console.log(this._dimension);
	}

	layout(dimension: DOM.Dimension) {
		this._dimension = dimension;
		this.domNode.style.display = 'flex';
	}

	override dispose() {
		this._disposables.dispose();
		super.dispose();
	}
}


class StickyScrollContent extends Disposable {
	private readonly _stickyScrollContent: HTMLElement;
	private readonly _observer: NotebookVisibleCellObserver;

	get domNode() {
		return this._stickyScrollContent;
	}

	constructor(
		private readonly notebookEditor: INotebookEditor,
	) {
		super();

		this._stickyScrollContent = document.createElement('div');
		this._stickyScrollContent.classList.add('notebook-sticky-scroll-content');
		this._stickyScrollContent.style.marginLeft = '12px';

		// next two lines are from src\vs\workbench\contrib\interactive\browser\interactive.contribution.ts
		this._observer = this._register(new NotebookVisibleCellObserver(this.notebookEditor));
		this._register(this._observer.onDidChangeVisibleCells(this.updateContent, this));
		this.updateContent();
	}

	updateContent() {
		const visibleCells = this._observer.visibleCells;
		const entries: OutlineEntry[] = [];

		for (const cell of visibleCells) {
			if (cell.cellKind !== CellKind.Markup) {
				continue;
			}
			let hasHeader = false;
			for (const { depth, text } of getMarkdownHeadersInCell(cell.getText())) {
				hasHeader = true;
				entries.push(new OutlineEntry(entries.length, depth, cell, text, false, false));
			}

			if (!hasHeader) {
				// no markdown syntax headers, try to find html tags
				const match = cell.getText().match(/<h([1-6]).*>(.*)<\/h\1>/i);
				if (match) {
					hasHeader = true;
					const level = parseInt(match[1]);
					const text = match[2].trim();
					entries.push(new OutlineEntry(entries.length, level, cell, text, false, false));
				}
			}

			if (!hasHeader) {
				// no html headers either, ignore
				return;
			}

			this._stickyScrollContent.innerText = '#'.repeat(entries[0].level) + ' ' + entries[0].label;
		}
	}
}
