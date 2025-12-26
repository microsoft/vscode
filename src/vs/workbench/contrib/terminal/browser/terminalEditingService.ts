/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IEditableData } from '../../../common/views.js';
import { IViewsService } from '../../../services/views/common/viewsService.js';
import { ITerminalEditingService, ITerminalInstance } from './terminal.js';
import { TERMINAL_VIEW_ID } from '../common/terminal.js';
import { TerminalViewPane } from './terminalView.js';

export class TerminalEditingService implements ITerminalEditingService {
	readonly _serviceBrand: undefined;

	private _editable: { instance: ITerminalInstance; data: IEditableData } | undefined;
	private _editingTerminal: ITerminalInstance | undefined;

	constructor(
		@IViewsService private readonly _viewsService: IViewsService
	) {
	}

	getEditableData(instance: ITerminalInstance): IEditableData | undefined {
		return this._editable && this._editable.instance === instance ? this._editable.data : undefined;
	}

	setEditable(instance: ITerminalInstance, data: IEditableData | null): void {
		if (!data) {
			this._editable = undefined;
		} else {
			this._editable = { instance: instance, data };
		}
		const pane = this._viewsService.getActiveViewWithId<TerminalViewPane>(TERMINAL_VIEW_ID);
		const isEditing = this.isEditable(instance);
		pane?.terminalTabbedView?.setEditable(isEditing);
	}

	isEditable(instance: ITerminalInstance | undefined): boolean {
		return !!this._editable && (this._editable.instance === instance || !instance);
	}

	getEditingTerminal(): ITerminalInstance | undefined {
		return this._editingTerminal;
	}

	setEditingTerminal(instance: ITerminalInstance | undefined): void {
		this._editingTerminal = instance;
	}
}
