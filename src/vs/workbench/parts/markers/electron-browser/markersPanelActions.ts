/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Delayer } from 'vs/base/common/async';
import * as DOM from 'vs/base/browser/dom';
import { TPromise } from 'vs/base/common/winjs.base';
import { Action, IAction } from 'vs/base/common/actions';
import { InputBox } from 'vs/base/browser/ui/inputbox/inputBox';
import { KeyCode } from 'vs/base/common/keyCodes';
import { IKeyboardEvent } from 'vs/base/browser/keyboardEvent';
import { IContextViewService } from 'vs/platform/contextview/browser/contextView';
import { TogglePanelAction } from 'vs/workbench/browser/panel';
import Messages from 'vs/workbench/parts/markers/electron-browser/messages';
import Constants from 'vs/workbench/parts/markers/electron-browser/constants';
import { IPartService } from 'vs/workbench/services/part/common/partService';
import { IPanelService } from 'vs/workbench/services/panel/common/panelService';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { CollapseAllAction as TreeCollapseAction } from 'vs/base/parts/tree/browser/treeDefaults';
import * as Tree from 'vs/base/parts/tree/browser/tree';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { attachInputBoxStyler, attachStylerCallback } from 'vs/platform/theme/common/styler';
import { IMarkersWorkbenchService } from 'vs/workbench/parts/markers/electron-browser/markers';
import { Event, Emitter } from 'vs/base/common/event';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import { HistoryNavigator } from 'vs/base/common/history';
import { BaseActionItem } from 'vs/base/browser/ui/actionbar/actionbar';
import { badgeBackground, contrastBorder } from 'vs/platform/theme/common/colorRegistry';
import { localize } from '../../../../nls';

export class ToggleMarkersPanelAction extends TogglePanelAction {

	public static readonly ID = 'workbench.actions.view.problems';
	public static readonly LABEL = Messages.MARKERS_PANEL_TOGGLE_LABEL;

	constructor(id: string, label: string,
		@IPartService partService: IPartService,
		@IPanelService panelService: IPanelService,
		@IMarkersWorkbenchService markersWorkbenchService: IMarkersWorkbenchService
	) {
		super(id, label, Constants.MARKERS_PANEL_ID, panelService, partService);
		this.enabled = markersWorkbenchService.markersModel.hasFilteredResources();
	}
}

export class ShowProblemsPanelAction extends Action {

	public static readonly ID = 'workbench.action.problems.focus';
	public static readonly LABEL = Messages.MARKERS_PANEL_SHOW_LABEL;

	constructor(id: string, label: string,
		@IPanelService private panelService: IPanelService
	) {
		super(id, label);
	}

	public run(): TPromise<any> {
		return this.panelService.openPanel(Constants.MARKERS_PANEL_ID, true);
	}
}

export class CollapseAllAction extends TreeCollapseAction {

	constructor(viewer: Tree.ITree, enabled: boolean) {
		super(viewer, enabled);
	}
}

export class FilterByFilesExcludeAction extends Action {

	public static readonly ID: string = 'workbench.actions.problems.useFilesExclude';

	private readonly _onDidCheck: Emitter<boolean> = new Emitter<boolean>();
	readonly onDidCheck: Event<boolean> = this._onDidCheck.event;

	private toDispose: IDisposable[] = [];

	constructor(checked: boolean) {
		super(FilterByFilesExcludeAction.ID, checked ? Messages.MARKERS_PANEL_ACTION_TOOLTIP_DO_NOT_USE_FILES_EXCLUDE : Messages.MARKERS_PANEL_ACTION_TOOLTIP_USE_FILES_EXCLUDE, 'markers-panel-action-files-exclude', true);
		this.toDispose.push(this._onDidCheck);
		this.checked = checked;
	}

	public run(): TPromise<any> {
		this.checked = !this.checked;
		this.tooltip = this.checked ? Messages.MARKERS_PANEL_ACTION_TOOLTIP_DO_NOT_USE_FILES_EXCLUDE : Messages.MARKERS_PANEL_ACTION_TOOLTIP_USE_FILES_EXCLUDE;
		this._onDidCheck.fire(this.checked);
		return TPromise.as(null);
	}

	dispose(): void {
		this.toDispose = dispose(this.toDispose);
		super.dispose();
	}
}

export class FilterAction extends Action {

	public static readonly ID: string = 'workbench.actions.problems.filter';

	constructor() {
		super(FilterAction.ID, Messages.MARKERS_PANEL_ACTION_TOOLTIP_FILTER, 'markers-panel-action-filter', true);
	}

}


export class FilterInputActionItem extends BaseActionItem {

	private _toDispose: IDisposable[] = [];

	private readonly _onDidChange: Emitter<void> = this._register(new Emitter<void>());
	readonly onDidChange: Event<void> = this._onDidChange.event;

	private delayedFilterUpdate: Delayer<void>;
	private container: HTMLElement;
	private filterInputBox: InputBox;
	private filterHistory: HistoryNavigator<string>;
	private filterBadge: HTMLInputElement;

	constructor(
		private filterText: string,
		filterHistory: string[],
		action: IAction,
		@IContextViewService private contextViewService: IContextViewService,
		@IThemeService private themeService: IThemeService,
		@IMarkersWorkbenchService private markersWorkbenchService: IMarkersWorkbenchService,
		@ITelemetryService private telemetryService: ITelemetryService
	) {
		super(null, action);
		this.delayedFilterUpdate = new Delayer<void>(500);
		this.filterHistory = new HistoryNavigator<string>(filterHistory);
	}

	render(container: HTMLElement): void {
		this.container = container;
		DOM.addClass(this.container, 'markers-panel-action-filter');
		this.createInput(this.container);
		this.createBadge(this.container);
	}

	getFilterText(): string {
		return this.filterText;
	}

	getFilterHistory(): string[] {
		return this.filterHistory.getHistory();
	}

	toggleLayout(small: boolean) {
		if (this.container) {
			DOM.toggleClass(this.container, 'small', small);
			DOM.toggleClass(this.filterBadge, 'small', small);
		}
	}

	private createInput(container: HTMLElement): void {
		this.filterInputBox = new InputBox(container, this.contextViewService, {
			placeholder: Messages.MARKERS_PANEL_FILTER_PLACEHOLDER,
			ariaLabel: Messages.MARKERS_PANEL_FILTER_ARIA_LABEL
		});
		this._register(attachInputBoxStyler(this.filterInputBox, this.themeService));
		this.filterInputBox.value = this.filterText;
		this._register(this.filterInputBox.onDidChange(filter => this.delayedFilterUpdate.trigger(() => this.onDidInputChange())));
		this._register(DOM.addStandardDisposableListener(this.filterInputBox.inputElement, 'keydown', (keyboardEvent) => this.onInputKeyDown(keyboardEvent, this.filterInputBox)));
		this._register(DOM.addStandardDisposableListener(container, 'keydown', this.handleKeyboardEvent));
		this._register(DOM.addStandardDisposableListener(container, 'keyup', this.handleKeyboardEvent));
	}

	private createBadge(container: HTMLElement): void {
		this.filterBadge = DOM.append(container, DOM.$('.markers-panel-filter-badge'));
		this._register(attachStylerCallback(this.themeService, { badgeBackground, contrastBorder }, colors => {
			const background = colors.badgeBackground ? colors.badgeBackground.toString() : null;
			const border = colors.contrastBorder ? colors.contrastBorder.toString() : null;

			this.filterBadge.style.backgroundColor = background;

			this.filterBadge.style.borderWidth = border ? '1px' : null;
			this.filterBadge.style.borderStyle = border ? 'solid' : null;
			this.filterBadge.style.borderColor = border;
		}));
		this._register(this.markersWorkbenchService.onDidChange(() => this.updateBadge()));
	}

	private onDidInputChange() {
		this.filterText = this.filterInputBox.value;
		if (this.filterText && this.filterText !== this.filterHistory.current()) {
			this.filterHistory.add(this.getFilterText());
		}
		this._onDidChange.fire();
		this.reportFilteringUsed();
	}

	private updateBadge(): void {
		const { total, filtered } = this.markersWorkbenchService.markersModel.stats();
		DOM.toggleClass(this.filterBadge, 'hidden', total === filtered);
		this.filterBadge.textContent = localize('showing filtered problems', "Showing {0} of {1}", filtered, total);
		this.filterInputBox.inputElement.style.paddingRight = DOM.getTotalWidth(this.filterBadge) + 'px';
	}

	// Action toolbar is swallowing some keys for action items which should not be for an input box
	private handleKeyboardEvent(e: IKeyboardEvent) {
		switch (e.keyCode) {
			case KeyCode.Space:
			case KeyCode.LeftArrow:
			case KeyCode.RightArrow:
			case KeyCode.Escape:
				e.stopPropagation();
				break;
		}
	}

	private showNextFilter() {
		let next = this.filterHistory.next();
		if (next) {
			this.filterInputBox.value = next;
		}
	}

	private showPreviousFilter() {
		let previous = this.filterHistory.previous();
		if (this.filterInputBox.value) {
			this.filterHistory.addIfNotPresent(this.filterInputBox.value);
		}
		if (previous) {
			this.filterInputBox.value = previous;
		}
	}

	private onInputKeyDown(keyboardEvent: IKeyboardEvent, filterInputBox: InputBox) {
		let handled = false;
		switch (keyboardEvent.keyCode) {
			case KeyCode.Escape:
				filterInputBox.value = '';
				handled = true;
				break;
			case KeyCode.UpArrow:
				this.showPreviousFilter();
				handled = true;
				break;
			case KeyCode.DownArrow:
				this.showNextFilter();
				handled = true;
				break;
		}
		if (handled) {
			keyboardEvent.stopPropagation();
			keyboardEvent.preventDefault();
		}
	}

	private reportFilteringUsed(): void {
		let data = {};
		data['errors'] = this.markersWorkbenchService.markersModel.filterOptions.filterErrors;
		data['warnings'] = this.markersWorkbenchService.markersModel.filterOptions.filterWarnings;
		data['infos'] = this.markersWorkbenchService.markersModel.filterOptions.filterInfos;
		/* __GDPR__
			"problems.filter" : {
				"errors" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
				"warnings": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
				"infos": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true }
			}
		*/
		this.telemetryService.publicLog('problems.filter', data);
	}

	private _register<T extends IDisposable>(t: T): T {
		this._toDispose.push(t);
		return t;
	}
}