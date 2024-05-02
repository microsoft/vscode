/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, IDisposable } from 'vs/base/common/lifecycle';
import { IMarkerData, IMarkerService } from 'vs/platform/markers/common/markers';
import { IRange } from 'vs/editor/common/core/range';
import { ICellExecutionStateChangedEvent, IExecutionStateChangedEvent, INotebookExecutionStateService, NotebookExecutionType } from 'vs/workbench/contrib/notebook/common/notebookExecutionStateService';
import { IInlineChatService } from 'vs/workbench/contrib/inlineChat/common/inlineChat';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { CellKind, NotebookSetting } from 'vs/workbench/contrib/notebook/common/notebookCommon';
import { INotebookEditor, INotebookEditorContribution } from 'vs/workbench/contrib/notebook/browser/notebookBrowser';
import { registerNotebookContribution } from 'vs/workbench/contrib/notebook/browser/notebookEditorExtensions';
import { INotebookCellDiagnosticsService } from 'vs/workbench/contrib/notebook/common/notebookCellDiagnosticsService';
import { Iterable } from 'vs/base/common/iterator';


export class CellDiagnostics extends Disposable implements INotebookEditorContribution {

	static ID: string = 'workbench.notebook.cellDiagnostics';

	private enabled = false;
	private listening = false;
	private cellHandles: Set<number> = new Set();
	private cellDisposables: Map<number, IDisposable[]> = new Map();


	constructor(
		private readonly notebookEditor: INotebookEditor,
		@INotebookCellDiagnosticsService private readonly notebookCellDiagnosticsService: INotebookCellDiagnosticsService,
		@INotebookExecutionStateService private readonly notebookExecutionStateService: INotebookExecutionStateService,
		@IMarkerService private readonly markerService: IMarkerService,
		@IInlineChatService private readonly inlineChatService: IInlineChatService,
		@IConfigurationService private readonly configurationService: IConfigurationService
	) {
		super();

		this.updateEnabled();

		this._register(inlineChatService.onDidChangeProviders(() => this.updateEnabled()));
		this._register(configurationService.onDidChangeConfiguration((e) => {
			if (e.affectsConfiguration(NotebookSetting.cellFailureDiagnostics)) {
				this.updateEnabled();
			}
		}));
	}

	private updateEnabled() {
		const settingEnabled = this.configurationService.getValue(NotebookSetting.cellFailureDiagnostics);
		if (this.enabled && (!settingEnabled || Iterable.isEmpty(this.inlineChatService.getAllProvider()))) {
			this.enabled = false;
			this.clearAll();
		} else if (!this.enabled && settingEnabled && !Iterable.isEmpty(this.inlineChatService.getAllProvider())) {
			this.enabled = true;
			if (!this.listening) {
				this.listening = true;
				this._register(this.notebookExecutionStateService.onDidChangeExecution((e) => this.handleChangeExecutionState(e)));
			}
		}
	}

	private handleChangeExecutionState(e: ICellExecutionStateChangedEvent | IExecutionStateChangedEvent) {
		const notebookUri = this.notebookEditor.textModel?.uri;
		if (this.enabled && e.type === NotebookExecutionType.cell && notebookUri && e.affectsNotebook(notebookUri)) {
			if (!!e.changed) {
				// cell is running
				this.clear(e.cellHandle);
			} else {
				this.setDiagnostics(e.cellHandle);
			}
		}
	}

	private clearAll() {
		for (const handle of this.cellHandles) {
			this.clear(handle);
		}
	}

	public clear(cellHandle: number) {
		if (this.cellHandles.delete(cellHandle)) {
			const cellUri = this.notebookEditor.getCellByHandle(cellHandle)?.uri;
			if (cellUri) {
				this.markerService.changeOne(CellDiagnostics.ID, cellUri, []);
			}
		}

		for (const disposable of this.cellDisposables.get(cellHandle) || []) {
			disposable.dispose();
		}
		this.cellDisposables.delete(cellHandle);
	}

	private setDiagnostics(cellHandle: number) {
		if (this.cellHandles.has(cellHandle)) {
			return;
		}

		const cell = this.notebookEditor.getCellByHandle(cellHandle);
		if (!cell || cell.cellKind !== CellKind.Code) {
			return;
		}

		const metadata = cell.model.internalMetadata;
		if (!metadata.lastRunSuccess && metadata?.error?.location) {
			const disposables: IDisposable[] = [];
			const marker = this.createMarkerData(metadata.error.message, metadata.error.location);
			this.markerService.changeOne(CellDiagnostics.ID, cell.uri, [marker]);
			this.cellHandles.add(cellHandle);
			disposables.push(this.notebookCellDiagnosticsService.registerCellExecutionError(cell.uri, metadata.error));
			disposables.push(cell.model.onDidChangeOutputs(() => {
				if (cell.model.outputs.length === 0) {
					this.clear(cellHandle);
				}
			}));

			disposables.push(cell.model.onDidChangeContent(() => {
				this.clear(cellHandle);
			}));
			this.cellDisposables.set(cellHandle, disposables);
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
