/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { NotebookCellTextModel } from 'vs/workbench/contrib/notebook/common/model/notebookCellTextModel';
import { NotebookDiffEditorEventDispatcher } from 'vs/workbench/contrib/notebook/browser/viewModel/eventDispatcher';
import { Emitter } from 'vs/base/common/event';
import { Disposable } from 'vs/base/common/lifecycle';
import { CellDiffViewModelLayoutChangeEvent } from 'vs/workbench/contrib/notebook/browser/diff/common';

export enum MetadataFoldingState {
	Expanded,
	Collapsed
}

export class CellDiffViewModel extends Disposable {
	public foldingState: MetadataFoldingState;
	private _layoutInfoEmitter = new Emitter<CellDiffViewModelLayoutChangeEvent>();

	onDidLayoutChange = this._layoutInfoEmitter.event;

	constructor(
		readonly original: NotebookCellTextModel | undefined,
		readonly modified: NotebookCellTextModel | undefined,
		readonly type: 'unchanged' | 'insert' | 'delete' | 'modified',
		readonly editorEventDispatcher: NotebookDiffEditorEventDispatcher
	) {
		super();
		this.foldingState = MetadataFoldingState.Collapsed;

		this._register(this.editorEventDispatcher.onDidChangeLayout(e => {
			this._layoutInfoEmitter.fire({ outerWidth: e.value.width });
		}));
	}
}
