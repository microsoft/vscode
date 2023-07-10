/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as DOM from 'vs/base/browser/dom';
import { DomScrollableElement } from 'vs/base/browser/ui/scrollbar/scrollableElement';
import { Disposable } from 'vs/base/common/lifecycle';
import { NotebookOptions } from 'vs/workbench/contrib/notebook/browser/notebookOptions';


export class NotebookEditorStickyScroll extends Disposable {
	private _stickyScrollScrollableElement!: DomScrollableElement;
	private _stickyScrollContainer!: HTMLElement;
	private _stickyScrollContent!: StickyScrollContent;
	private _dimension: DOM.Dimension | null = null;

	constructor(
		readonly notebookOptions: NotebookOptions,
		readonly domNode: HTMLElement,
	) {
		super();

		this._buildBody();
		this._registerNotebookStickyScroll();
	}

	private _buildBody() {

		this._stickyScrollContainer = document.createElement('div');
		this._stickyScrollContainer.classList.add('notebook-sticky-scroll-container');

		this._stickyScrollScrollableElement = new DomScrollableElement(this._stickyScrollContainer, {});

		this._stickyScrollContainer.style.width = '100%';
		this._stickyScrollContainer.style.height = '22px';
		this._stickyScrollContainer.style.fontFamily = 'var(--notebook-cell-input-preview-font-family)';
		this._stickyScrollContent = new StickyScrollContent(this.notebookOptions);

		DOM.append(this._stickyScrollContainer, this._stickyScrollContent.domNode);
		DOM.append(this.domNode, this._stickyScrollContainer);

		this.domNode.style.display = 'flex';

		this._register(this._stickyScrollScrollableElement);
		this._stickyScrollContent.updateContent();
	}

	private _registerNotebookStickyScroll() {
		console.log(this._dimension);
	}

	layout(dimension: DOM.Dimension) {
		this._dimension = dimension;
		this.domNode.style.display = 'flex';
	}
}


class StickyScrollContent extends Disposable {
	private _stickyScrollContent: HTMLElement;
	get domNode() {
		return this._stickyScrollContent;
	}

	constructor(
		readonly notebookOptions: NotebookOptions,
	) {
		super();

		this._stickyScrollContent = document.createElement('div');
		this._stickyScrollContent.classList.add('notebook-sticky-scroll-content');
		this._stickyScrollContent.style.marginLeft = '12px';
	}

	updateContent() {
		this._stickyScrollContent.innerText = 'content';

		// src\vs\workbench\contrib\notebook\browser\contrib\cellStatusBar\notebookVisibleCellObserver.ts
	}
}
