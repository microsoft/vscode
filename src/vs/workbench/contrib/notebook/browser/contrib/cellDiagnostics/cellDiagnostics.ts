/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from 'vs/base/common/lifecycle';
import { IMarkerData, IMarkerService } from 'vs/platform/markers/common/markers';
import { IRange } from 'vs/editor/common/core/range';
import { ICellExecutionError, ICellExecutionStateChangedEvent, IExecutionStateChangedEvent, INotebookExecutionStateService, NotebookExecutionType } from 'vs/workbench/contrib/notebook/common/notebookExecutionStateService';
import { IInlineChatService } from 'vs/workbench/contrib/inlineChat/common/inlineChat';
import { Iterable } from 'vs/base/common/iterator';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { NotebookSetting } from 'vs/workbench/contrib/notebook/common/notebookCommon';
import { CodeCellViewModel } from 'vs/workbench/contrib/notebook/browser/viewModel/codeCellViewModel';
import { Emitter, Event } from 'vs/base/common/event';


export class CellDiagnostics extends Disposable {

	private readonly _onDidDiagnosticsChange = new Emitter<void>();
	readonly onDidDiagnosticsChange: Event<void> = this._onDidDiagnosticsChange.event;

	static ID: string = 'workbench.notebook.cellDiagnostics';

	private enabled = false;
	private listening = false;
	private errorDetails: ICellExecutionError | undefined = undefined;
	public get ErrorDetails() {
		return this.errorDetails;
	}

	constructor(
		private readonly cell: CodeCellViewModel,
		@INotebookExecutionStateService private readonly notebookExecutionStateService: INotebookExecutionStateService,
		@IMarkerService private readonly markerService: IMarkerService,
		@IInlineChatService private readonly inlineChatService: IInlineChatService,
		@IConfigurationService private readonly configurationService: IConfigurationService
	) {
		super();

		if (cell.viewType !== 'interactive') {
			this.updateEnabled();

			this._register(inlineChatService.onDidChangeProviders(() => this.updateEnabled()));
			this._register(configurationService.onDidChangeConfiguration((e) => {
				if (e.affectsConfiguration(NotebookSetting.cellFailureDiagnostics)) {
					this.updateEnabled();
				}
			}));
		}
	}

	private updateEnabled() {
		const settingEnabled = this.configurationService.getValue(NotebookSetting.cellFailureDiagnostics);
		if (this.enabled && (!settingEnabled || Iterable.isEmpty(this.inlineChatService.getAllProvider()))) {
			this.enabled = false;
			this.clear();
		} else if (!this.enabled && settingEnabled && !Iterable.isEmpty(this.inlineChatService.getAllProvider())) {
			this.enabled = true;
			if (!this.listening) {
				this.listening = true;
				this._register(this.notebookExecutionStateService.onDidChangeExecution((e) => this.handleChangeExecutionState(e)));
			}
		}
	}

	private handleChangeExecutionState(e: ICellExecutionStateChangedEvent | IExecutionStateChangedEvent) {
		if (this.enabled && e.type === NotebookExecutionType.cell && e.affectsCell(this.cell.uri)) {
			if (!!e.changed) {
				// cell is running
				this.clear();
			} else {
				this.setDiagnostics();
			}
		}
	}

	public clear() {
		if (this.ErrorDetails) {
			this.markerService.changeOne(CellDiagnostics.ID, this.cell.uri, []);
			this.errorDetails = undefined;
			this._onDidDiagnosticsChange.fire();
		}
	}

	private setDiagnostics() {
		const metadata = this.cell.model.internalMetadata;
		if (!metadata.lastRunSuccess && metadata?.error?.location) {
			const marker = this.createMarkerData(metadata.error.message, metadata.error.location);
			this.markerService.changeOne(CellDiagnostics.ID, this.cell.uri, [marker]);
			this.errorDetails = metadata.error;
			this._onDidDiagnosticsChange.fire();
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
		this.clear();
	}

}
