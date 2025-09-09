/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 Posit Software, PBC. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

import { getDurationString } from '../../../../base/common/date.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { localize } from '../../../../nls.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IStatusbarEntryAccessor, IStatusbarService, StatusbarAlignment } from '../../../services/statusbar/browser/statusbar.js';
import { INotebookExecutionService } from '../../notebook/common/notebookExecutionService.js';

export const NOTEBOOK_EXPERIMENTAL_SHOW_EXECUTION_INFO_KEY = 'notebook.experimental.showExecutionInfo';

/**
 * A status bar entry that displays information about the current notebook execution,
 * such as the total duration and number of cells executed.
 */
export class NotebookExecutionStatus extends Disposable {
	/** The ID of the status bar entry. */
	public static readonly ID = 'status.notebook.executionInfo';

	/** The name of the status bar entry. */
	public static readonly NAME = localize('status.notebook.executionInfo.name', 'Execution Info');

	/** Accessor for the status bar entry. */
	public readonly entry: IStatusbarEntryAccessor;

	constructor(
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@INotebookExecutionService private readonly _notebookExecutionService: INotebookExecutionService,
		@IStatusbarService private readonly _statusbarService: IStatusbarService,
	) {
		super();

		// Add the status bar entry.
		this.entry = this._register(this._statusbarService.addEntry({
			ariaLabel: '',
			name: NotebookExecutionStatus.NAME,
			text: '',
		}, NotebookExecutionStatus.ID, StatusbarAlignment.RIGHT));

		// Update the visibility when the configuration changes.
		this._register(this._configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(NOTEBOOK_EXPERIMENTAL_SHOW_EXECUTION_INFO_KEY)) {
				this.updateVisibility();
			}
		}));

		// Update the visibility initially.
		this.updateVisibility();

		// Update the text when an execution starts.
		this._register(this._notebookExecutionService.onDidStartNotebookCellsExecution(e => {
			const cellCountString = this.getCellCountString(e.cellHandles.length);
			const text = localize('status.notebook.executionInfo.startExecution', 'Executing {0}', cellCountString);
			this.entry.update({
				ariaLabel: text,
				name: NotebookExecutionStatus.NAME,
				text,
			});
		}));

		// Update the text when an execution ends.
		this._register(this._notebookExecutionService.onDidEndNotebookCellsExecution(e => {
			const cellCountString = this.getCellCountString(e.cellHandles.length);
			const durationString = getDurationString(e.duration, false);
			const text = localize('status.notebook.executionInfo.endExecution', 'Executed {0} in {1}', cellCountString, durationString);
			this.entry.update({
				ariaLabel: text,
				name: NotebookExecutionStatus.NAME,
				text,
			});
		}));
	}

	/**
	 * Update the visibility of the status bar entry based on the user's configuration.
	 */
	private updateVisibility(): void {
		const visible = this._configurationService.getValue<boolean>(NOTEBOOK_EXPERIMENTAL_SHOW_EXECUTION_INFO_KEY);
		this._statusbarService.updateEntryVisibility(NotebookExecutionStatus.ID, visible);
	}

	/**
	 * Format a cell count for display.
	 */
	private getCellCountString(cellCount: number): string {
		if (cellCount === 1) {
			return localize('status.notebook.executionInfo.cell', '1 cell');
		} else {
			return localize('status.notebook.executionInfo.cells', '{0} cells', cellCount);
		}
	}
}

