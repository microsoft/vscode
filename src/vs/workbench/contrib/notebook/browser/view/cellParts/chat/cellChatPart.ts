/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Lazy } from 'vs/base/common/lazy';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ICellViewModel, INotebookEditorDelegate } from 'vs/workbench/contrib/notebook/browser/notebookBrowser';
import { CellContentPart } from 'vs/workbench/contrib/notebook/browser/view/cellPart';
import { NotebookCellChatController } from 'vs/workbench/contrib/notebook/browser/view/cellParts/chat/cellChatController';
import { CellChatWidget } from 'vs/workbench/contrib/notebook/browser/view/cellParts/chat/cellChatWidget';

export class CellChatPart extends CellContentPart {
	private _controller: NotebookCellChatController | undefined;

	get activeCell() {
		return this.currentCell;
	}

	private _widget: Lazy<CellChatWidget>;

	constructor(
		private readonly _notebookEditor: INotebookEditorDelegate,
		partContainer: HTMLElement,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
	) {
		super();

		this._widget = new Lazy(() => this._instantiationService.createInstance(CellChatWidget, this._notebookEditor, partContainer));
	}

	getWidget() {
		return this._widget.value;
	}

	override didRenderCell(element: ICellViewModel): void {
		this._controller?.dispose();
		this._controller = this._instantiationService.createInstance(NotebookCellChatController, this._notebookEditor, this, element);

		super.didRenderCell(element);
	}

	override unrenderCell(element: ICellViewModel): void {
		this._controller?.dispose();
		this._controller = undefined;
		super.unrenderCell(element);
	}

	override updateInternalLayoutNow(element: ICellViewModel): void {
		this._controller?.layout();
	}

	override dispose() {
		this._controller?.dispose();
		this._controller = undefined;
		super.dispose();
	}
}

