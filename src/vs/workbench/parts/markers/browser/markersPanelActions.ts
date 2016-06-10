/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Delayer } from 'vs/base/common/async';
import * as DOM from 'vs/base/browser/dom';
import * as lifecycle from 'vs/base/common/lifecycle';
import { IAction, Action } from 'vs/base/common/actions';
import { BaseActionItem } from 'vs/base/browser/ui/actionbar/actionbar';
import { InputBox } from 'vs/base/browser/ui/inputbox/inputBox';
import { CommonKeybindings } from 'vs/base/common/keyCodes';
import {IKeyboardEvent} from 'vs/base/browser/keyboardEvent';
import {IContextViewService} from 'vs/platform/contextview/browser/contextView';
import { TogglePanelAction } from 'vs/workbench/browser/panel';
import Messages from 'vs/workbench/parts/markers/common/messages';
import Constants from 'vs/workbench/parts/markers/common/constants';
import { FilterOptions } from 'vs/workbench/parts/markers/common/markersModel';
import { MarkersPanel } from 'vs/workbench/parts/markers/browser/markersPanel';
import { IPartService } from 'vs/workbench/services/part/common/partService';
import { IPanelService } from 'vs/workbench/services/panel/common/panelService';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import {IWorkbenchEditorService} from 'vs/workbench/services/editor/common/editorService';

export class ToggleProblemsPanelAction extends TogglePanelAction {

	public static ID:string = 'workbench.action.markers.panel.toggle';

	constructor(id: string, label: string,
		@IPartService private partService: IPartService,
		@IPanelService panelService: IPanelService,
		@IWorkbenchEditorService editorService: IWorkbenchEditorService,
		@ITelemetryService private telemetryService: ITelemetryService
	) {
		super(id, label, Constants.MARKERS_PANEL_ID, panelService, editorService);
	}
}

export class FilterAction extends Action {

	constructor(private markersPanel: MarkersPanel) {
		super('workbench.markers.panel.action.filter', Messages.MARKERS_PANEL_ACTION_TOOLTIP_FILTER, 'markers-panel-action-filter', true);
	}

}

export class FilterInputBoxActionItem extends BaseActionItem {

	protected toDispose: lifecycle.IDisposable[];

	private delayer: Delayer<void>;

	constructor(private markersPanel: MarkersPanel, action: IAction,
			@IContextViewService private contextViewService: IContextViewService,
			@ITelemetryService private telemetryService: ITelemetryService) {
		super(markersPanel, action);
		this.toDispose = [];
		this.delayer= new Delayer<void>(2000);
	}

	public render(container: HTMLElement): void {
		DOM.addClass(container, 'markers-panel-action-filter');
		let filterInputBox = new InputBox(container, this.contextViewService, {
			placeholder: Messages.MARKERS_PANEL_FILTER_PLACEHOLDER,
			ariaLabel: Messages.MARKERS_PANEL_FILTER_PLACEHOLDER
		});
		filterInputBox.value= this.markersPanel.markersModel.filterOptions.completeFilter;
		this.toDispose.push(filterInputBox.onDidChange((filter: string) => {
			this.markersPanel.markersModel.update(new FilterOptions(filter));
			this.markersPanel.refreshPanel();
			this.delayer.trigger(this.reportFilteringUsed.bind(this));
		}));
		this.toDispose.push(DOM.addStandardDisposableListener(container, 'keydown', this.handleKeyboardEvent));
		this.toDispose.push(DOM.addStandardDisposableListener(container, 'keyup', this.handleKeyboardEvent));
	}

	private reportFilteringUsed(): void {
		// Report only filtering is used, do not use the input from the user
		// this.telemetryService.publicLog('problems.filtered');
	}

	public dispose(): void {
		this.toDispose = lifecycle.dispose(this.toDispose);
		super.dispose();
	}

	// Action toolbar is swallowing some keys for action items which should not be for an input box
	private handleKeyboardEvent(e: IKeyboardEvent) {
		switch (e.keyCode) {
			case CommonKeybindings.SPACE:
			case CommonKeybindings.LEFT_ARROW:
			case CommonKeybindings.RIGHT_ARROW:
				e.stopPropagation();
				break;
		}
	}
}