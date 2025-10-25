/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as DOM from '../../../../../../base/browser/dom.js';
import { renderLabelWithIcons } from '../../../../../../base/browser/ui/iconLabel/iconLabels.js';
import { Disposable } from '../../../../../../base/common/lifecycle.js';
import { localize } from '../../../../../../nls.js';
import { ThemeIcon } from '../../../../../../base/common/themables.js';
import { ICellViewModel, INotebookEditorDelegate } from '../../notebookBrowser.js';
import { errorStateIcon, executingStateIcon, pendingStateIcon, successStateIcon } from '../../notebookIcons.js';
import { NotebookCellExecutionState, NotebookCellInternalMetadata } from '../../../common/notebookCommon.js';
import { INotebookCellExecution, INotebookExecutionStateService, NotebookExecutionType } from '../../../common/notebookExecutionStateService.js';

interface IExecutionItem {
	text: string;
	tooltip?: string;
}

export class CollapsedCodeCellExecutionIcon extends Disposable {
	private _visible = false;

	constructor(
		_notebookEditor: INotebookEditorDelegate,
		private readonly _cell: ICellViewModel,
		private readonly _element: HTMLElement,
		@INotebookExecutionStateService private _executionStateService: INotebookExecutionStateService,
	) {
		super();

		this._update();
		this._register(this._executionStateService.onDidChangeExecution(e => {
			if (e.type === NotebookExecutionType.cell && e.affectsCell(this._cell.uri)) {
				this._update();
			}
		}));
		this._register(this._cell.model.onDidChangeInternalMetadata(() => this._update()));
	}

	setVisibility(visible: boolean): void {
		this._visible = visible;
		this._update();
	}

	private _update() {
		if (!this._visible) {
			return;
		}

		const runState = this._executionStateService.getCellExecution(this._cell.uri);
		const item = this._getItemForState(runState, this._cell.model.internalMetadata);
		if (item) {
			this._element.style.display = '';
			DOM.reset(this._element, ...renderLabelWithIcons(item.text));
			this._element.title = item.tooltip ?? '';
		} else {
			this._element.style.display = 'none';
			DOM.reset(this._element);
		}
	}

	private _getItemForState(runState: INotebookCellExecution | undefined, internalMetadata: NotebookCellInternalMetadata): IExecutionItem | undefined {
		const state = runState?.state;
		const { lastRunSuccess } = internalMetadata;
		if (!state && lastRunSuccess) {
			return {
				text: `$(${successStateIcon.id})`,
				tooltip: localize('notebook.cell.status.success', "Success"),
			};
		} else if (!state && lastRunSuccess === false) {
			return {
				text: `$(${errorStateIcon.id})`,
				tooltip: localize('notebook.cell.status.failure', "Failure"),
			};
		} else if (state === NotebookCellExecutionState.Pending || state === NotebookCellExecutionState.Unconfirmed) {
			return {
				text: `$(${pendingStateIcon.id})`,
				tooltip: localize('notebook.cell.status.pending', "Pending"),
			};
		} else if (state === NotebookCellExecutionState.Executing) {
			const icon = ThemeIcon.modify(executingStateIcon, 'spin');
			return {
				text: `$(${icon.id})`,
				tooltip: localize('notebook.cell.status.executing', "Executing"),
			};
		}

		return;
	}
}
