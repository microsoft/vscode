/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from 'vs/base/common/lifecycle';
import { IMarkerData, IMarkerService } from 'vs/platform/markers/common/markers';
import { IWorkbenchContribution } from 'vs/workbench/common/contributions';
import { ICellViewModel } from 'vs/workbench/contrib/notebook/browser/notebookBrowser';
import { IRange } from 'vs/editor/common/core/range';
import { ICellExecutionError, ICellExecutionStateChangedEvent, IExecutionStateChangedEvent, INotebookExecutionStateService, NotebookExecutionType } from 'vs/workbench/contrib/notebook/common/notebookExecutionStateService';
import { IInlineChatService } from 'vs/workbench/contrib/inlineChat/common/inlineChat';
import { Iterable } from 'vs/base/common/iterator';


export class CellDiagnostics extends Disposable implements IWorkbenchContribution {

	static ID: string = 'workbench.notebook.cellDiagnostics';

	private enabled = false;
	private listening = false;
	private errorDetails: ICellExecutionError | undefined = undefined;
	public get ErrorDetails() {
		return this.errorDetails;
	}

	constructor(
		private readonly cell: ICellViewModel,
		@INotebookExecutionStateService private readonly notebookExecutionStateService: INotebookExecutionStateService,
		@IMarkerService private readonly markerService: IMarkerService,
		@IInlineChatService private readonly inlineChatService: IInlineChatService
	) {
		super();

		if (!Iterable.isEmpty(inlineChatService.getAllProvider())) {
			this.enabled = this.listening = true;
			this._register(notebookExecutionStateService.onDidChangeExecution((e) => this.handleChangeExecutionState(e)));
			this._register(cell.model.onDidChangeOutputs(() => this.handleOutputsChange));
		}

		this._register(inlineChatService.onDidChangeProviders(() => this.handleChangedChatProviders()));
	}

	private handleChangedChatProviders() {
		if (this.enabled && Iterable.isEmpty(this.inlineChatService.getAllProvider())) {
			this.enabled = false;
			this.clearDiagnostics();
		} else if (!this.enabled && !Iterable.isEmpty(this.inlineChatService.getAllProvider())) {
			this.enabled = true;
			if (!this.listening) {
				this.listening = true;
				this._register(this.notebookExecutionStateService.onDidChangeExecution((e) => this.handleChangeExecutionState(e)));
				this._register(this.cell.model.onDidChangeOutputs(() => this.handleOutputsChange));
			}
		}
	}

	private handleChangeExecutionState(e: ICellExecutionStateChangedEvent | IExecutionStateChangedEvent) {
		if (this.enabled && e.type === NotebookExecutionType.cell && e.affectsCell(this.cell.uri)) {
			if (!!e.changed) {
				// cell is running
				this.clearDiagnostics();
			} else {
				this.setDiagnostics();
			}
		}
	}

	private handleOutputsChange() {
		if (this.enabled && this.cell.outputsViewModels.length === 0) {
			this.clearDiagnostics();
		}
	}

	private clearDiagnostics() {
		this.markerService.changeOne(CellDiagnostics.ID, this.cell.uri, []);
		this.errorDetails = undefined;
	}

	private setDiagnostics() {
		const metadata = this.cell.model.internalMetadata;
		if (!metadata.lastRunSuccess && metadata?.error?.location) {
			const marker = this.createMarkerData(metadata.error.message, metadata.error.location);
			this.markerService.changeOne(CellDiagnostics.ID, this.cell.uri, [marker]);
			this.errorDetails = metadata.error;
		}
	}

	private createMarkerData(message: string, location: IRange): IMarkerData {
		return {
			severity: 8,
			message: message,
			...location,
			source: 'Cell Execution Error'
		};
	}

}
