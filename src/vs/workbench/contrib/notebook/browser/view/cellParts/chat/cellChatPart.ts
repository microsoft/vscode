/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ICellViewModel, INotebookEditorDelegate } from 'vs/workbench/contrib/notebook/browser/notebookBrowser';
import { CellContentPart } from 'vs/workbench/contrib/notebook/browser/view/cellPart';
import { NotebookCellChatController } from 'vs/workbench/contrib/notebook/browser/view/cellParts/chat/cellChatController';

import 'vs/workbench/contrib/notebook/browser/view/cellParts/chat/cellChatActions';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { NotebookSetting } from 'vs/workbench/contrib/notebook/common/notebookCommon';

export class CellChatPart extends CellContentPart {
	private _controller: NotebookCellChatController | undefined;

	get activeCell() {
		return this.currentCell;
	}

	constructor(
		private readonly _notebookEditor: INotebookEditorDelegate,
		private readonly _partContainer: HTMLElement,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
	) {
		super();
	}

	override didRenderCell(element: ICellViewModel): void {
		this._controller?.dispose();
		const enabled = this._configurationService.getValue<boolean>(NotebookSetting.cellChat);
		if (enabled) {
			this._controller = this._instantiationService.createInstance(NotebookCellChatController, this._notebookEditor, this, element, this._partContainer);
		}

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

