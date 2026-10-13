/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { NotebookCell, workspace } from 'vscode';
import { Emitter } from '../../../util/vs/base/common/event';
import { IDisposable } from '../../../util/vs/base/common/lifecycle';

export enum NotebookCellExecutionState {
	/**
	 * The cell is idle.
	 */
	Idle = 1,
	/**
	 * The cell is currently executing.
	 */
	Executing = 2
}

/**
 * An event describing a cell execution state change.
 */
export interface NotebookCellExecutionStateChangeEvent {
	/**
	 * The {@link NotebookCell cell} for which the execution state has changed.
	 */
	readonly cell: NotebookCell;
	/**
	 * The new execution state of the cell.
	 */
	readonly state: NotebookCellExecutionState;
}


export class NotebookExecutionServiceImpl implements IDisposable {
	private readonly _onDidChangeNotebookCellExecutionStateEmitter = new Emitter<NotebookCellExecutionStateChangeEvent>();
	readonly onDidChangeNotebookCellExecutionState = this._onDidChangeNotebookCellExecutionStateEmitter.event;

	private _disposables: IDisposable[] = [];
	// track cell in execution
	private _cellExecution = new WeakMap<NotebookCell, boolean>();

	constructor() {
		this._disposables.push(workspace.onDidChangeNotebookDocument(e => {
			for (const cellChange of e.cellChanges) {
				if (cellChange.executionSummary) {
					const executionSummary = cellChange.executionSummary;

					if (executionSummary.success === undefined) {
						// in execution
						if (!this._cellExecution.has(cellChange.cell)) {
							this._cellExecution.set(cellChange.cell, true);
							this._onDidChangeNotebookCellExecutionStateEmitter.fire({ cell: cellChange.cell, state: NotebookCellExecutionState.Executing });
						}
					} else {
						// finished execution
						this._cellExecution.delete(cellChange.cell);
						this._onDidChangeNotebookCellExecutionStateEmitter.fire({ cell: cellChange.cell, state: NotebookCellExecutionState.Idle });
					}
				}
			}
		}));
	}

	dispose() {
		this._disposables.forEach(d => d.dispose());
	}
}
