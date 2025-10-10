/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, IDisposable, toDisposable } from '../../../../../../base/common/lifecycle.js';
import { IMarkerData, IMarkerService } from '../../../../../../platform/markers/common/markers.js';
import { IRange } from '../../../../../../editor/common/core/range.js';
import { ICellExecutionStateChangedEvent, IExecutionStateChangedEvent, INotebookExecutionStateService, NotebookExecutionType } from '../../../common/notebookExecutionStateService.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { CellKind, NotebookSetting } from '../../../common/notebookCommon.js';
import { INotebookEditor, INotebookEditorContribution } from '../../notebookBrowser.js';
import { registerNotebookContribution } from '../../notebookEditorExtensions.js';
import { CodeCellViewModel } from '../../viewModel/codeCellViewModel.js';
import { Event } from '../../../../../../base/common/event.js';
import { IChatAgentService } from '../../../../chat/common/chatAgents.js';
import { ChatAgentLocation } from '../../../../chat/common/constants.js';
import { autorun } from '../../../../../../base/common/observable.js';

export class CellDiagnostics extends Disposable implements INotebookEditorContribution {

	static ID: string = 'workbench.notebook.cellDiagnostics';

	private enabled = false;
	private listening = false;
	private diagnosticsByHandle: Map<number, IDisposable[]> = new Map();

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

	private hasNotebookAgent(): boolean {
		const agents = this.chatAgentService.getAgents();
		return !!agents.find(agent => agent.locations.includes(ChatAgentLocation.Notebook));
	}

	private updateEnabled() {
		const settingEnabled = this.configurationService.getValue(NotebookSetting.cellFailureDiagnostics);
		if (this.enabled && (!settingEnabled || !this.hasNotebookAgent())) {
			this.enabled = false;
			this.clearAll();
		} else if (!this.enabled && settingEnabled && this.hasNotebookAgent()) {
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
		const disposables = this.diagnosticsByHandle.get(cellHandle);
		if (disposables) {
			for (const disposable of disposables) {
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
			const errorLabel = metadata.error.name ? `${metadata.error.name}: ${metadata.error.message}` : metadata.error.message;
			const marker = this.createMarkerData(errorLabel, metadata.error.location);
			this.markerService.changeOne(CellDiagnostics.ID, cell.uri, [marker]);
			disposables.push(toDisposable(() => this.markerService.changeOne(CellDiagnostics.ID, cell.uri, [])));
			cell.executionErrorDiagnostic.set(metadata.error, undefined);
			disposables.push(toDisposable(() => cell.executionErrorDiagnostic.set(undefined, undefined)));
			disposables.push(autorun((r) => {
				if (!cell.executionErrorDiagnostic.read(r)) {
					this.clear(cellHandle);
				}
			}));
			disposables.push(cell.model.onDidChangeOutputs(() => {
				if (cell.model.outputs.length === 0) {
					this.clear(cellHandle);
				}
			}));
			disposables.push(cell.model.onDidChangeContent(() => {
				this.clear(cellHandle);
			}));
			this.diagnosticsByHandle.set(cellHandle, disposables);
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
