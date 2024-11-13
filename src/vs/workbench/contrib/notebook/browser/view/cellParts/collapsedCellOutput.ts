/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as DOM from '../../../../../../base/browser/dom.js';
import { Codicon } from '../../../../../../base/common/codicons.js';
import { autorun } from '../../../../../../base/common/observable.js';
import { ThemeIcon } from '../../../../../../base/common/themables.js';
import { localize } from '../../../../../../nls.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { IKeybindingService } from '../../../../../../platform/keybinding/common/keybinding.js';
import { NotebookSetting } from '../../../common/notebookCommon.js';
import { ICellExecutionError, ICellExecutionStateChangedEvent } from '../../../common/notebookExecutionStateService.js';
import { EXPAND_CELL_OUTPUT_COMMAND_ID, ICellViewModel, INotebookEditor } from '../../notebookBrowser.js';
import { CodeCellViewModel } from '../../viewModel/codeCellViewModel.js';
import { CellContentPart } from '../cellPart.js';

const $ = DOM.$;

export class CollapsedCellOutput extends CellContentPart {

	private errorContainer: HTMLElement;
	private errorLabel: HTMLElement;
	private errorMessage: HTMLElement;
	private collapsedForError = false;

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

		this.errorContainer = DOM.append(cellOutputCollapseContainer, $('.minimal-error-container'));
		this.errorLabel = DOM.append(this.errorContainer, $('span.cell-error-label', {
			style: 'font-weight: bold; color: var(--vscode-editorError-foreground);'
		}));
		this.errorMessage = DOM.append(this.errorContainer, $('span.error-message'));

		this.errorContainer.style.display = 'none';

		DOM.hide(cellOutputCollapseContainer);

		this._register(DOM.addDisposableListener(expandIcon, DOM.EventType.CLICK, () => this.expand()));
		this._register(DOM.addDisposableListener(cellOutputCollapseContainer, DOM.EventType.DBLCLICK, () => this.expand()));


		this._register(configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(NotebookSetting.minimalErrorRendering)) { this.updateError(); }
		}));
	}

	private updateError(error?: ICellExecutionError) {
		if (this.currentCell instanceof CodeCellViewModel) {
			error = error ?? this.currentCell.excecutionError.get();
			if (error && this.configurationService.getValue(NotebookSetting.minimalErrorRendering)) {
				this.errorContainer.style.display = 'block';
				const split = error.message.split(':');
				this.errorLabel.textContent = split[0] + ': ';
				this.errorMessage.textContent = split[1];
			} else {
				this.errorContainer.style.display = 'none';
				this.errorLabel.textContent = '';
				this.errorMessage.textContent = '';
			}
		}
	}

	override didRenderCell(element: ICellViewModel): void {
		if (this.currentCell instanceof CodeCellViewModel) {
			autorun((reader) => this.updateError(
				reader.readObservable((this.currentCell as CodeCellViewModel).excecutionError)));
		}
	}

	override updateForExecutionState(element: ICellViewModel, e: ICellExecutionStateChangedEvent): void {
		if (e.changed === undefined && this.configurationService.getValue(NotebookSetting.minimalErrorRendering)) {
			this.updateError();

			if (!element.isOutputCollapsed) {
				element.isOutputCollapsed = true;
				this.collapsedForError = true;
			}
		} else if (this.collapsedForError) {
			element.isOutputCollapsed = false;
			this.collapsedForError = false;
		}
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
