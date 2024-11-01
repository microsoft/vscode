/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as DOM from '../../../../../../base/browser/dom.js';
import { Codicon } from '../../../../../../base/common/codicons.js';
import { ThemeIcon } from '../../../../../../base/common/themables.js';
import { localize } from '../../../../../../nls.js';
import { IKeybindingService } from '../../../../../../platform/keybinding/common/keybinding.js';
import { EXPAND_CELL_OUTPUT_COMMAND_ID, INotebookEditor } from '../../notebookBrowser.js';
import { CellContentPart } from '../cellPart.js';

const $ = DOM.$;

export class CollapsedCellOutput extends CellContentPart {
	constructor(
		private readonly notebookEditor: INotebookEditor,
		cellOutputCollapseContainer: HTMLElement,
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
