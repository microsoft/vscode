/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as DOM from '../../../../../../base/browser/dom.js';
import { Codicon } from '../../../../../../base/common/codicons.js';
import { ThemeIcon } from '../../../../../../base/common/themables.js';
import { localize } from '../../../../../../nls.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { IKeybindingService } from '../../../../../../platform/keybinding/common/keybinding.js';
import { NotebookSetting } from '../../../common/notebookCommon.js';
import { ICellExecutionStateChangedEvent } from '../../../common/notebookExecutionStateService.js';
import { EXPAND_CELL_OUTPUT_COMMAND_ID, ICellViewModel, INotebookEditor } from '../../notebookBrowser.js';
import { CodeCellViewModel } from '../../viewModel/codeCellViewModel.js';
import { CellContentPart } from '../cellPart.js';

const $ = DOM.$;

export class CollapsedCellOutput extends CellContentPart {

	private errorContainer: HTMLElement;

	constructor(
		private readonly notebookEditor: INotebookEditor,
		cellOutputCollapseContainer: HTMLElement,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IKeybindingService keybindingService: IKeybindingService
	) {
		super();

		const placeholder = DOM.append(cellOutputCollapseContainer, $('span.expandOutputPlaceholder')) as HTMLElement;
		placeholder.textContent = localize('cellOutputsCollapsedMsg', "Outputs are collapsed");
		const expandIcon = DOM.append(cellOutputCollapseContainer, $('span.expandOutputIcon'));
		expandIcon.classList.add(...ThemeIcon.asClassNameArray(Codicon.more));

		const keybinding = keybindingService.lookupKeybinding(EXPAND_CELL_OUTPUT_COMMAND_ID);
		if (keybinding) {
			placeholder.title = localize('cellExpandOutputButtonLabelWithDoubleClick', "Double-click to expand cell output ({0})", keybinding.getLabel());
			cellOutputCollapseContainer.title = localize('cellExpandOutputButtonLabel', "Expand Cell Output (${0})", keybinding.getLabel());
		}

		DOM.hide(cellOutputCollapseContainer);

		this._register(DOM.addDisposableListener(expandIcon, DOM.EventType.CLICK, () => this.expand()));
		this._register(DOM.addDisposableListener(cellOutputCollapseContainer, DOM.EventType.DBLCLICK, () => this.expand()));

		this.errorContainer = DOM.append(cellOutputCollapseContainer, $('.minimal-error-container'));

		this._register(configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(NotebookSetting.minimalErrorRendering)) { this.updateError(); }
		}));
	}

	private updateError() {
		if (this.currentCell instanceof CodeCellViewModel) {
			const error = this.currentCell.excecutionError.get();
			if (error && this.configurationService.getValue(NotebookSetting.minimalErrorRendering)) {
				const message = DOM.append(this.errorContainer, $('div.error-message'));
				message.textContent = error.message;
			} else {
				this.errorContainer.innerHTML = '';
			}
		}
	}

	override didRenderCell(element: ICellViewModel): void {
		this.updateError();
	}

	override updateForExecutionState(element: ICellViewModel, e: ICellExecutionStateChangedEvent): void {
		this.updateError();
	}

	private expand() {
		if (!this.currentCell) {
			return;
		}

		if (!this.currentCell) {
			return;
		}

		const textModel = this.notebookEditor.textModel!;
		const index = textModel.cells.indexOf(this.currentCell.model);

		if (index < 0) {
			return;
		}

		this.currentCell.isOutputCollapsed = !this.currentCell.isOutputCollapsed;
	}
}
