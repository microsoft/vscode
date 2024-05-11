/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IListAccessibilityProvider } from 'vs/base/browser/ui/list/listWidget';
import { Event, Emitter } from 'vs/base/common/event';
import { Disposable } from 'vs/base/common/lifecycle';
import { observableFromEvent } from 'vs/base/common/observable';
import * as nls from 'vs/nls';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { AccessibilityVerbositySettingId } from 'vs/workbench/contrib/accessibility/browser/accessibilityConfiguration';
import { AccessibilityCommandId } from 'vs/workbench/contrib/accessibility/common/accessibilityCommands';
import { CellViewModel, NotebookViewModel } from 'vs/workbench/contrib/notebook/browser/viewModel/notebookViewModelImpl';
import { CellKind, NotebookCellExecutionState } from 'vs/workbench/contrib/notebook/common/notebookCommon';
import { ICellExecutionStateChangedEvent, IExecutionStateChangedEvent, INotebookExecutionStateService, NotebookExecutionType } from 'vs/workbench/contrib/notebook/common/notebookExecutionStateService';

export class NotebookAccessibilityProvider extends Disposable implements IListAccessibilityProvider<CellViewModel> {
	private readonly _onDidAriaLabelChange = new Emitter<CellViewModel>();
	private readonly onDidAriaLabelChange = this._onDidAriaLabelChange.event;

	constructor(
		private readonly notebookExecutionStateService: INotebookExecutionStateService,
		private readonly viewModel: () => NotebookViewModel | undefined,
		private readonly keybindingService: IKeybindingService,
		private readonly configurationService: IConfigurationService
	) {
		super();
		this._register(Event.debounce<ICellExecutionStateChangedEvent | IExecutionStateChangedEvent, number[]>(
			this.notebookExecutionStateService.onDidChangeExecution,
			(last: number[] | undefined, e: ICellExecutionStateChangedEvent | IExecutionStateChangedEvent) => this.mergeEvents(last, e),
			100
		)((cellHandles: number[]) => {
			const viewModel = this.viewModel();
			if (viewModel) {
				for (const handle of cellHandles) {
					const cellModel = viewModel.getCellByHandle(handle);
					if (cellModel) {
						this._onDidAriaLabelChange.fire(cellModel as CellViewModel);
					}
				}
			}
		}, this));
	}

	getAriaLabel(element: CellViewModel) {
		const event = Event.filter(this.onDidAriaLabelChange, e => e === element);
		return observableFromEvent(event, () => {
			const viewModel = this.viewModel();
			if (!viewModel) {
				return '';
			}
			const index = viewModel.getCellIndex(element);

			if (index >= 0) {
				return this.getLabel(index, element);
			}

			return '';
		});
	}

	private getLabel(index: number, element: CellViewModel) {
		const executionState = this.notebookExecutionStateService.getCellExecution(element.uri)?.state;
		const executionLabel =
			executionState === NotebookCellExecutionState.Executing
				? ', executing'
				: executionState === NotebookCellExecutionState.Pending
					? ', pending'
					: '';
		return `Cell ${index}, ${element.cellKind === CellKind.Markup ? 'markdown' : 'code'} cell${executionLabel}`;
	}

	getWidgetAriaLabel() {
		const keybinding = this.keybindingService.lookupKeybinding(AccessibilityCommandId.OpenAccessibilityHelp)?.getLabel();

		if (this.configurationService.getValue(AccessibilityVerbositySettingId.Notebook)) {
			return keybinding
				? nls.localize('notebookTreeAriaLabelHelp', "Notebook\nUse {0} for accessibility help", keybinding)
				: nls.localize('notebookTreeAriaLabelHelpNoKb', "Notebook\nRun the Open Accessibility Help command for more information", keybinding);
		}
		return nls.localize('notebookTreeAriaLabel', "Notebook");
	}

	private mergeEvents(last: number[] | undefined, e: ICellExecutionStateChangedEvent | IExecutionStateChangedEvent): number[] {
		const viewModel = this.viewModel();
		const result = last || [];
		if (viewModel && e.type === NotebookExecutionType.cell && e.affectsNotebook(viewModel.uri)) {
			if (result.indexOf(e.cellHandle) < 0) {
				result.push(e.cellHandle);
			}
		}
		return result;
	}
}
