/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { INotebookCellDiagnosticsService } from 'vs/workbench/contrib/notebook/common/notebookCellDiagnosticsService';
import { Emitter, Event } from 'vs/base/common/event';
import { URI } from 'vs/base/common/uri';
import { ICellExecutionError } from 'vs/workbench/contrib/notebook/common/notebookExecutionStateService';
import { toDisposable } from 'vs/base/common/lifecycle';

export class NotebookCellDiagnosticsService implements INotebookCellDiagnosticsService {
	_serviceBrand: undefined;

	private readonly _onDidDiagnosticsChange = new Emitter<void>();
	readonly onDidDiagnosticsChange: Event<void> = this._onDidDiagnosticsChange.event;

	private readonly _diagnostics = new Map<string, ICellExecutionError>();

	public registerCellExecutionError(cellUri: URI, diagnostics: ICellExecutionError) {
		this._diagnostics.set(cellUri.toString(), diagnostics);

		this._onDidDiagnosticsChange.fire();
		return toDisposable(() => {
			this._diagnostics.delete(cellUri.toString());
			this._onDidDiagnosticsChange.fire();
		});
	}

	public getCellExecutionError(cellUri: URI): ICellExecutionError | undefined {
		return this._diagnostics.get(cellUri.toString());
	}

}
