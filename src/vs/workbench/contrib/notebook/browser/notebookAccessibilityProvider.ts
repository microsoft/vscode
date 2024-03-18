/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AriaLableChangedEvent, IListAccessibilityProvider } from 'vs/base/browser/ui/list/listWidget';
import { Emitter } from 'vs/base/common/event';
import { DisposableStore } from 'vs/base/common/lifecycle';
import * as nls from 'vs/nls';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { AccessibilityVerbositySettingId } from 'vs/workbench/contrib/accessibility/browser/accessibilityConfiguration';
import { AccessibilityCommandId } from 'vs/workbench/contrib/accessibility/common/accessibilityCommands';
import { CellViewModel, NotebookViewModel } from 'vs/workbench/contrib/notebook/browser/viewModel/notebookViewModelImpl';
import { CellKind, NotebookCellExecutionState } from 'vs/workbench/contrib/notebook/common/notebookCommon';
import { INotebookExecutionStateService } from 'vs/workbench/contrib/notebook/common/notebookExecutionStateService';

export class NotebookAccessibilityProvider implements IListAccessibilityProvider<CellViewModel> {
	private readonly _onDidAriaLabelChange = new Emitter<AriaLableChangedEvent<CellViewModel>>();
	readonly onDidAriaLabelChange = this._onDidAriaLabelChange.event;

	constructor(
		private readonly notebookExecutionStateService: INotebookExecutionStateService,
		private readonly viewModel: () => NotebookViewModel | undefined,
		private readonly keybindingService: IKeybindingService,
		private readonly configurationService: IConfigurationService
	) {

	}


	getAriaLabel(element: CellViewModel, disposables: DisposableStore) {
		const viewModel = this.viewModel();
		if (!viewModel) {
			return '';
		}
		const index = viewModel.getCellIndex(element);

		disposables?.add(this.notebookExecutionStateService.onDidChangeExecution(e => {
			if ('affectsCell' in e && e.affectsCell(element.uri)) {
				this._onDidAriaLabelChange.fire({ element, label: this.getLabel(index, element) });
			}
		}));

		if (index >= 0) {
			return this.getLabel(index, element);
		}

		return '';
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
}
