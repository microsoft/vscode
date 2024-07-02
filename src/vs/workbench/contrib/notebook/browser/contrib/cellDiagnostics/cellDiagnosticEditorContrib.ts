/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, IDisposable, toDisposable } from 'vs/base/common/lifecycle';
import { IMarkerData, IMarkerService } from 'vs/platform/markers/common/markers';
import { IRange } from 'vs/editor/common/core/range';
import { ICellExecutionError, ICellExecutionStateChangedEvent, IExecutionStateChangedEvent, INotebookExecutionStateService, NotebookExecutionType } from 'vs/workbench/contrib/notebook/common/notebookExecutionStateService';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { CellKind, NotebookSetting } from 'vs/workbench/contrib/notebook/common/notebookCommon';
import { INotebookEditor, INotebookEditorContribution } from 'vs/workbench/contrib/notebook/browser/notebookBrowser';
import { registerNotebookContribution } from 'vs/workbench/contrib/notebook/browser/notebookEditorExtensions';
import { Iterable } from 'vs/base/common/iterator';
import { CodeCellViewModel } from 'vs/workbench/contrib/notebook/browser/viewModel/codeCellViewModel';
import { URI } from 'vs/base/common/uri';
import { Event } from 'vs/base/common/event';
import { IChatAgentService } from 'vs/workbench/contrib/chat/common/chatAgents';

type CellDiagnostic = {
	cellUri: URI;
	error: ICellExecutionError;
	disposables: IDisposable[];
};

export class CellDiagnostics extends Disposable implements INotebookEditorContribution {

	static ID: string = 'workbench.notebook.cellDiagnostics';

	private enabled = false;
	private listening = false;
	private diagnosticsByHandle: Map<number, CellDiagnostic> = new Map();

	constructor(
		private readonly notebookEditor: INotebookEditor,
		@INotebookExecutionStateService private readonly notebookExecutionStateService: INotebookExecutionStateService,
		@IMarkerService private readonly markerService: IMarkerService,
		@IChatAgentService private readonly chatAgentService: IChatAgentService,
		@IConfigurationService private readonly configurationService: IConfigurationService
	) {
		super();

		this.updateEnabled();

		this._register(chatAgentService.onDidChangeAgents(() => this.updateEnabled()));
		this._register(configurationService.onDidChangeConfiguration((e) => {
			if (e.affectsConfiguration(NotebookSetting.cellFailureDiagnostics)) {
				this.updateEnabled();
			}
		}));
	}

	private updateEnabled() {
		const settingEnabled = this.configurationService.getValue(NotebookSetting.cellFailureDiagnostics);
		if (this.enabled && (!settingEnabled || Iterable.isEmpty(this.chatAgentService.getAgents()))) {
			this.enabled = false;
			this.clearAll();
		} else if (!this.enabled && settingEnabled && !Iterable.isEmpty(this.chatAgentService.getAgents())) {
			this.enabled = true;
			if (!this.listening) {
				this.listening = true;
				this._register(Event.accumulate<ICellExecutionStateChangedEvent | IExecutionStateChangedEvent>(
					this.notebookExecutionStateService.onDidChangeExecution, 200
				)((e) => this.handleChangeExecutionState(e)));
			}
		}
	}



	private handleChangeExecutionState(changes: (ICellExecutionStateChangedEvent | IExecutionStateChangedEvent)[]) {
		if (!this.enabled) {
			return;
		}

		const handled = new Set<number>();
		for (const e of changes.reverse()) {

			const notebookUri = this.notebookEditor.textModel?.uri;
			if (e.type === NotebookExecutionType.cell && notebookUri && e.affectsNotebook(notebookUri) && !handled.has(e.cellHandle)) {
				handled.add(e.cellHandle);
				if (!!e.changed) {
					// cell is running
					this.clear(e.cellHandle);
				} else {
					this.setDiagnostics(e.cellHandle);
				}
			}
		}
	}

	private clearAll() {
		for (const handle of this.diagnosticsByHandle.keys()) {
			this.clear(handle);
		}
	}

	public clear(cellHandle: number) {
		const diagnostic = this.diagnosticsByHandle.get(cellHandle);
		if (diagnostic) {
			for (const disposable of diagnostic.disposables) {
				disposable.dispose();
			}
			this.diagnosticsByHandle.delete(cellHandle);
		}
	}

	private setDiagnostics(cellHandle: number) {
		if (this.diagnosticsByHandle.has(cellHandle)) {
			// multiple diagnostics per cell not supported for now
			return;
		}

		const cell = this.notebookEditor.getCellByHandle(cellHandle);
		if (!cell || cell.cellKind !== CellKind.Code) {
			return;
		}

		const metadata = cell.model.internalMetadata;
		if (cell instanceof CodeCellViewModel && !metadata.lastRunSuccess && metadata?.error?.location) {
			const disposables: IDisposable[] = [];
			const marker = this.createMarkerData(metadata.error.message, metadata.error.location);
			this.markerService.changeOne(CellDiagnostics.ID, cell.uri, [marker]);
			disposables.push(toDisposable(() => this.markerService.changeOne(CellDiagnostics.ID, cell.uri, [])));
			cell.excecutionError.set(metadata.error, undefined);
			disposables.push(toDisposable(() => cell.excecutionError.set(undefined, undefined)));
			disposables.push(cell.model.onDidChangeOutputs(() => {
				if (cell.model.outputs.length === 0) {
					this.clear(cellHandle);
				}
			}));
			disposables.push(cell.model.onDidChangeContent(() => {
				this.clear(cellHandle);
			}));
			this.diagnosticsByHandle.set(cellHandle, { cellUri: cell.uri, error: metadata.error, disposables });
		}
	}

	private createMarkerData(message: string, location: IRange): IMarkerData {
		return {
			severity: 8,
			message: message,
			startLineNumber: location.startLineNumber + 1,
			startColumn: location.startColumn + 1,
			endLineNumber: location.endLineNumber + 1,
			endColumn: location.endColumn + 1,
			source: 'Cell Execution Error'
		};
	}

	override dispose() {
		super.dispose();
		this.clearAll();
	}

}

registerNotebookContribution(CellDiagnostics.ID, CellDiagnostics);
