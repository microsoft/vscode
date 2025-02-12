/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IListAccessibilityProvider } from '../../../../base/browser/ui/list/listWidget.js';
import { Event, Emitter } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { observableFromEvent } from '../../../../base/common/observable.js';
import * as nls from '../../../../nls.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { AccessibilityVerbositySettingId } from '../../accessibility/browser/accessibilityConfiguration.js';
import { AccessibilityCommandId } from '../../accessibility/common/accessibilityCommands.js';
import { CellViewModel, NotebookViewModel } from './viewModel/notebookViewModelImpl.js';
import { CellKind, NotebookCellExecutionState } from '../common/notebookCommon.js';
import { ICellExecutionStateChangedEvent, IExecutionStateChangedEvent, INotebookExecutionStateService, NotebookExecutionType } from '../common/notebookExecutionStateService.js';
import { getAllOutputsText } from './viewModel/cellOutputTextHelper.js';
import { IAccessibilityService } from '../../../../platform/accessibility/common/accessibility.js';
import { alert } from '../../../../base/browser/ui/aria/aria.js';

type executionUpdate = { cellHandle: number; state: NotebookCellExecutionState | undefined };

export class NotebookAccessibilityProvider extends Disposable implements IListAccessibilityProvider<CellViewModel> {
	private readonly _onDidAriaLabelChange = new Emitter<CellViewModel>();
	private readonly onDidAriaLabelChange = this._onDidAriaLabelChange.event;

	constructor(
		private readonly viewModel: () => NotebookViewModel | undefined,
		private readonly isReplHistory: boolean,
		@INotebookExecutionStateService private readonly notebookExecutionStateService: INotebookExecutionStateService,
		@IKeybindingService private readonly keybindingService: IKeybindingService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IAccessibilityService private readonly accessibilityService: IAccessibilityService
	) {
		super();
		this._register(Event.debounce<ICellExecutionStateChangedEvent | IExecutionStateChangedEvent, executionUpdate[]>(
			this.notebookExecutionStateService.onDidChangeExecution,
			(last: executionUpdate[] | undefined, e: ICellExecutionStateChangedEvent | IExecutionStateChangedEvent) => this.mergeEvents(last, e),
			100
		)((updates: executionUpdate[]) => {
			if (!updates.length) {
				return;
			}
			const viewModel = this.viewModel();
			if (viewModel) {
				for (const update of updates) {
					const cellModel = viewModel.getCellByHandle(update.cellHandle);
					if (cellModel) {
						this._onDidAriaLabelChange.fire(cellModel as CellViewModel);
					}
				}

				const lastUpdate = updates[updates.length - 1];
				if (this.shouldReadCellOutputs(lastUpdate.state)) {
					const cell = viewModel.getCellByHandle(lastUpdate.cellHandle);
					if (cell && cell.outputsViewModels.length) {
						const text = getAllOutputsText(viewModel.notebookDocument, cell, true);
						alert(text);
					}
				}
			}
		}, this));
	}

	private shouldReadCellOutputs(state: NotebookCellExecutionState | undefined): boolean {
		return state === undefined // execution completed
			&& this.isReplHistory
			&& this.accessibilityService.isScreenReaderOptimized()
			&& this.configurationService.getValue<boolean>('accessibility.replEditor.readLastExecutionOutput');
	}

	get verbositySettingId() {
		return this.isReplHistory ?
			AccessibilityVerbositySettingId.ReplEditor :
			AccessibilityVerbositySettingId.Notebook;
	}

	getAriaLabel(element: CellViewModel) {
		const event = Event.filter(this.onDidAriaLabelChange, e => e === element);
		return observableFromEvent(this, event, () => {
			const viewModel = this.viewModel();
			if (!viewModel) {
				return '';
			}
			const index = viewModel.getCellIndex(element);

			if (index >= 0) {
				return this.getLabel(element);
			}

			return '';
		});
	}

	private createItemLabel(executionLabel: string, cellKind: CellKind) {
		return this.isReplHistory ?
			`cell${executionLabel}` :
			`${cellKind === CellKind.Markup ? 'markdown' : 'code'} cell${executionLabel}`;
	}

	private getLabel(element: CellViewModel) {
		const executionState = this.notebookExecutionStateService.getCellExecution(element.uri)?.state;
		const executionLabel =
			executionState === NotebookCellExecutionState.Executing
				? ', executing'
				: executionState === NotebookCellExecutionState.Pending
					? ', pending'
					: '';

		return this.createItemLabel(executionLabel, element.cellKind);
	}

	private get widgetAriaLabelName() {
		return this.isReplHistory ?
			nls.localize('replHistoryTreeAriaLabel', "REPL Editor History") :
			nls.localize('notebookTreeAriaLabel', "Notebook");
	}

	getWidgetAriaLabel() {
		const keybinding = this.keybindingService.lookupKeybinding(AccessibilityCommandId.OpenAccessibilityHelp)?.getLabel();

		if (this.configurationService.getValue(this.verbositySettingId)) {
			return keybinding
				? nls.localize('notebookTreeAriaLabelHelp', "{0}\nUse {1} for accessibility help", this.widgetAriaLabelName, keybinding)
				: nls.localize('notebookTreeAriaLabelHelpNoKb', "{0}\nRun the Open Accessibility Help command for more information", this.widgetAriaLabelName);
		}
		return this.widgetAriaLabelName;
	}

	private mergeEvents(last: executionUpdate[] | undefined, e: ICellExecutionStateChangedEvent | IExecutionStateChangedEvent): executionUpdate[] {
		const viewModel = this.viewModel();
		const result = last || [];
		if (viewModel && e.type === NotebookExecutionType.cell && e.affectsNotebook(viewModel.uri)) {
			const index = result.findIndex(update => update.cellHandle === e.cellHandle);
			if (index >= 0) {
				result.splice(index, 1);
			}
			result.push({ cellHandle: e.cellHandle, state: e.changed?.state });
		}
		return result;
	}
}
