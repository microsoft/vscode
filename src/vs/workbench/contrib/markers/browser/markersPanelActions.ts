/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Delayer } from 'vs/base/common/async';
import * as DOM from 'vs/base/browser/dom';
import { Action, IActionChangeEvent, IAction } from 'vs/base/common/actions';
import { HistoryInputBox } from 'vs/base/browser/ui/inputbox/inputBox';
import { KeyCode } from 'vs/base/common/keyCodes';
import { StandardKeyboardEvent } from 'vs/base/browser/keyboardEvent';
import { IContextViewService, IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { TogglePanelAction } from 'vs/workbench/browser/panel';
import Messages from 'vs/workbench/contrib/markers/browser/messages';
import Constants from 'vs/workbench/contrib/markers/browser/constants';
import { IWorkbenchLayoutService } from 'vs/workbench/services/layout/browser/layoutService';
import { IPanelService } from 'vs/workbench/services/panel/common/panelService';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { attachInputBoxStyler, attachStylerCallback, attachCheckboxStyler } from 'vs/platform/theme/common/styler';
import { IMarkersWorkbenchService } from 'vs/workbench/contrib/markers/browser/markers';
import { toDisposable } from 'vs/base/common/lifecycle';
import { BaseActionViewItem, ActionViewItem } from 'vs/base/browser/ui/actionbar/actionbar';
import { badgeBackground, badgeForeground, contrastBorder } from 'vs/platform/theme/common/colorRegistry';
import { localize } from 'vs/nls';
import { Checkbox } from 'vs/base/browser/ui/checkbox/checkbox';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ContextScopedHistoryInputBox } from 'vs/platform/browser/contextScopedHistoryWidget';
import { Marker } from 'vs/workbench/contrib/markers/browser/markersModel';
import { IContextKey, IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { Event, Emitter } from 'vs/base/common/event';
import { FilterOptions } from 'vs/workbench/contrib/markers/browser/markersFilterOptions';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';

export class ToggleMarkersPanelAction extends TogglePanelAction {

	public static readonly ID = 'workbench.actions.view.problems';
	public static readonly LABEL = Messages.MARKERS_PANEL_TOGGLE_LABEL;

	constructor(id: string, label: string,
		@IWorkbenchLayoutService layoutService: IWorkbenchLayoutService,
		@IPanelService panelService: IPanelService,
		@IMarkersWorkbenchService markersWorkbenchService: IMarkersWorkbenchService
	) {
		super(id, label, Constants.MARKERS_PANEL_ID, panelService, layoutService);
	}
}

export class ShowProblemsPanelAction extends Action {

	public static readonly ID = 'workbench.action.problems.focus';
	public static readonly LABEL = Messages.MARKERS_PANEL_SHOW_LABEL;

	constructor(id: string, label: string,
		@IPanelService private readonly panelService: IPanelService
	) {
		super(id, label);
	}

	public run(): Promise<any> {
		this.panelService.openPanel(Constants.MARKERS_PANEL_ID, true);
		return Promise.resolve();
	}
}

export interface IMarkersFilterActionChangeEvent extends IActionChangeEvent {
	filterText?: boolean;
	useFilesExclude?: boolean;
	showWarnings?: boolean;
	showErrors?: boolean;
	showInfos?: boolean;
}

export interface IMarkersFilterActionOptions {
	filterText: string;
	filterHistory: string[];
	useFilesExclude: boolean;
}

export class MarkersFilterAction extends Action {

	public static readonly ID: string = 'workbench.actions.problems.filter';

	private readonly _onFocus: Emitter<void> = this._register(new Emitter<void>());
	readonly onFocus: Event<void> = this._onFocus.event;

	constructor(options: IMarkersFilterActionOptions) {
		super(MarkersFilterAction.ID, Messages.MARKERS_PANEL_ACTION_TOOLTIP_FILTER, 'markers-panel-action-filter', true);
		this._filterText = options.filterText;
		this._useFilesExclude = options.useFilesExclude;
		this.filterHistory = options.filterHistory;
	}

	private _filterText: string;
	get filterText(): string {
		return this._filterText;
	}
	set filterText(filterText: string) {
		if (this._filterText !== filterText) {
			this._filterText = filterText;
			this._onDidChange.fire(<IMarkersFilterActionChangeEvent>{ filterText: true });
		}
	}

	filterHistory: string[];

	private _useFilesExclude: boolean;
	get useFilesExclude(): boolean {
		return this._useFilesExclude;
	}
	set useFilesExclude(filesExclude: boolean) {
		if (this._useFilesExclude !== filesExclude) {
			this._useFilesExclude = filesExclude;
			this._onDidChange.fire(<IMarkersFilterActionChangeEvent>{ useFilesExclude: true });
		}
	}

	private _showWarnings: boolean = true;
	get showWarnings(): boolean {
		return this._showWarnings;
	}
	set showWarnings(showWarnings: boolean) {
		if (this._showWarnings !== showWarnings) {
			this._showWarnings = showWarnings;
			this._onDidChange.fire(<IMarkersFilterActionChangeEvent>{ showWarnings: true });
		}
	}

	private _showErrors: boolean = true;
	get showErrors(): boolean {
		return this._showErrors;
	}
	set showErrors(showErrors: boolean) {
		if (this._showErrors !== showErrors) {
			this._showErrors = showErrors;
			this._onDidChange.fire(<IMarkersFilterActionChangeEvent>{ showErrors: true });
		}
	}

	private _showInfos: boolean = true;
	get showInfos(): boolean {
		return this._showInfos;
	}
	set showInfos(showInfos: boolean) {
		if (this._showInfos !== showInfos) {
			this._showInfos = showInfos;
			this._onDidChange.fire(<IMarkersFilterActionChangeEvent>{ showInfos: true });
    }
	}

	focus(): void {
		this._onFocus.fire();
	}

	layout(width: number): void {
		if (width > 600) {
			this.class = 'markers-panel-action-filter grow';
		} else if (width < 400) {
			this.class = 'markers-panel-action-filter small';
		} else {
			this.class = 'markers-panel-action-filter';
		}
	}
}

export interface IMarkerFilterController {
	onDidFilter: Event<void>;
	getFilterOptions(): FilterOptions;
	getFilterStats(): { total: number, filtered: number };
}

export class MarkersFilterActionViewItem extends BaseActionViewItem {

	private delayedFilterUpdate: Delayer<void>;
	private container: HTMLElement | null = null;
	private filterInputBox: HistoryInputBox | null = null;
	private filterBadge: HTMLElement | null = null;
	private focusContextKey: IContextKey<boolean>;

	constructor(
		readonly action: MarkersFilterAction,
		private filterController: IMarkerFilterController,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IContextViewService private readonly contextViewService: IContextViewService,
		@IThemeService private readonly themeService: IThemeService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
		@IContextKeyService contextKeyService: IContextKeyService
	) {
		super(null, action);
		this.focusContextKey = Constants.MarkerPanelFilterFocusContextKey.bindTo(contextKeyService);
		this.delayedFilterUpdate = new Delayer<void>(200);
		this._register(toDisposable(() => this.delayedFilterUpdate.cancel()));
		this._register(action.onFocus(() => this.focus()));
	}

	render(container: HTMLElement): void {
		this.container = container;
		DOM.addClass(this.container, 'markers-panel-action-filter-container');

		this.element = DOM.append(this.container, DOM.$(''));
		this.element.className = this.action.class || '';
		this.createInput(this.element);
		this.createControls(this.element);

		this.adjustInputBox();
	}

	focus(): void {
		if (this.filterInputBox) {
			this.filterInputBox.focus();
		}
	}

	private createInput(container: HTMLElement): void {
		this.filterInputBox = this._register(this.instantiationService.createInstance(ContextScopedHistoryInputBox, container, this.contextViewService, {
			placeholder: Messages.MARKERS_PANEL_FILTER_PLACEHOLDER,
			ariaLabel: Messages.MARKERS_PANEL_FILTER_ARIA_LABEL,
			history: this.action.filterHistory
		}));
		this.filterInputBox.inputElement.setAttribute('aria-labelledby', 'markers-panel-arialabel');
		this._register(attachInputBoxStyler(this.filterInputBox, this.themeService));
		this.filterInputBox.value = this.action.filterText;
		this._register(this.filterInputBox.onDidChange(filter => this.delayedFilterUpdate.trigger(() => this.onDidInputChange(this.filterInputBox!))));
		this._register(this.action.onDidChange((event: IMarkersFilterActionChangeEvent) => {
			if (event.filterText) {
				this.filterInputBox!.value = this.action.filterText;
			}
		}));
		this._register(DOM.addStandardDisposableListener(this.filterInputBox.inputElement, DOM.EventType.KEY_DOWN, (e: any) => this.onInputKeyDown(e, this.filterInputBox!)));
		this._register(DOM.addStandardDisposableListener(container, DOM.EventType.KEY_DOWN, this.handleKeyboardEvent));
		this._register(DOM.addStandardDisposableListener(container, DOM.EventType.KEY_UP, this.handleKeyboardEvent));

		const focusTracker = this._register(DOM.trackFocus(this.filterInputBox.inputElement));
		this._register(focusTracker.onDidFocus(() => this.focusContextKey.set(true)));
		this._register(focusTracker.onDidBlur(() => this.focusContextKey.set(false)));
		this._register(toDisposable(() => this.focusContextKey.reset()));
	}

	private createControls(container: HTMLElement): void {
		const controlsContainer = DOM.append(container, DOM.$('.markers-panel-filter-controls'));
		this.createBadge(controlsContainer);
		this.createFilesExcludeCheckbox(controlsContainer);
		this.createErrorsCheckbox(controlsContainer);
		this.createWarningsCheckbox(controlsContainer);
		this.createInfosCheckbox(controlsContainer);
	}

	private createBadge(container: HTMLElement): void {
		const filterBadge = this.filterBadge = DOM.append(container, DOM.$('.markers-panel-filter-badge'));
		this._register(attachStylerCallback(this.themeService, { badgeBackground, badgeForeground, contrastBorder }, colors => {
			const background = colors.badgeBackground ? colors.badgeBackground.toString() : '';
			const foreground = colors.badgeForeground ? colors.badgeForeground.toString() : '';
			const border = colors.contrastBorder ? colors.contrastBorder.toString() : '';

			filterBadge.style.backgroundColor = background;

			filterBadge.style.borderWidth = border ? '1px' : '';
			filterBadge.style.borderStyle = border ? 'solid' : '';
			filterBadge.style.borderColor = border;
			filterBadge.style.color = foreground;
		}));
		this.updateBadge();
		this._register(this.filterController.onDidFilter(() => this.updateBadge()));
	}

	private createFilesExcludeCheckbox(container: HTMLElement): void {
		const filesExcludeFilter = this._register(new Checkbox({
			actionClassName: 'codicon codicon-exclude',
			title: this.action.useFilesExclude ? Messages.MARKERS_PANEL_ACTION_TOOLTIP_DO_NOT_USE_FILES_EXCLUDE : Messages.MARKERS_PANEL_ACTION_TOOLTIP_USE_FILES_EXCLUDE,
			isChecked: this.action.useFilesExclude
		}));
		this._register(filesExcludeFilter.onChange(() => {
			filesExcludeFilter.domNode.title = filesExcludeFilter.checked ? Messages.MARKERS_PANEL_ACTION_TOOLTIP_DO_NOT_USE_FILES_EXCLUDE : Messages.MARKERS_PANEL_ACTION_TOOLTIP_USE_FILES_EXCLUDE;
			this.action.useFilesExclude = filesExcludeFilter.checked;
			this.focus();
		}));
		this._register(this.action.onDidChange((event: IMarkersFilterActionChangeEvent) => {
			if (event.useFilesExclude) {
				filesExcludeFilter.checked = this.action.useFilesExclude;
			}
		}));

		this._register(attachCheckboxStyler(filesExcludeFilter, this.themeService));
		container.appendChild(filesExcludeFilter.domNode);
	}

	private createWarningsCheckbox(container: HTMLElement): void {
		const warningsFilter = this._register(new Checkbox({
			actionClassName: 'codicon codicon-warning',
			title: this.action.showWarnings ? Messages.MARKERS_PANEL_ACTION_TOOLTIP_DO_NOT_SHOW_WARNINGS : Messages.MARKERS_PANEL_ACTION_TOOLTIP_SHOW_WARNINGS,
			isChecked: this.action.showWarnings
		}));
		this._register(warningsFilter.onChange(() => {
			warningsFilter.domNode.title = warningsFilter.checked ? Messages.MARKERS_PANEL_ACTION_TOOLTIP_DO_NOT_SHOW_WARNINGS : Messages.MARKERS_PANEL_ACTION_TOOLTIP_SHOW_WARNINGS;
			this.action.showWarnings = warningsFilter.checked;
			this.focus();
		}));
		this._register(this.action.onDidChange((event: IMarkersFilterActionChangeEvent) => {
			if (event.showWarnings) {
				warningsFilter.checked = this.action.showWarnings;
			}
		}));

		this._register(attachCheckboxStyler(warningsFilter, this.themeService));
		container.appendChild(warningsFilter.domNode);
	}

	private createErrorsCheckbox(container: HTMLElement): void {
		const errorsFilter = this._register(new Checkbox({
			actionClassName: 'codicon codicon-error',
			title: this.action.showErrors ? Messages.MARKERS_PANEL_ACTION_TOOLTIP_DO_NOT_SHOW_ERRORS : Messages.MARKERS_PANEL_ACTION_TOOLTIP_SHOW_ERRORS,
			isChecked: this.action.showErrors
		}));
		this._register(errorsFilter.onChange(() => {
			errorsFilter.domNode.title = errorsFilter.checked ? Messages.MARKERS_PANEL_ACTION_TOOLTIP_DO_NOT_SHOW_ERRORS : Messages.MARKERS_PANEL_ACTION_TOOLTIP_SHOW_ERRORS;
			this.action.showErrors = errorsFilter.checked;
			this.focus();
		}));
		this._register(this.action.onDidChange((event: IMarkersFilterActionChangeEvent) => {
			if (event.showErrors) {
				errorsFilter.checked = this.action.showErrors;
			}
		}));

		this._register(attachCheckboxStyler(errorsFilter, this.themeService));
		container.appendChild(errorsFilter.domNode);
	}

	private createInfosCheckbox(container: HTMLElement): void {
		const infosFilter = this._register(new Checkbox({
			actionClassName: 'codicon codicon-info',
			title: this.action.showInfos ? Messages.MARKERS_PANEL_ACTION_TOOLTIP_DO_NOT_SHOW_INFOS : Messages.MARKERS_PANEL_ACTION_TOOLTIP_SHOW_INFOS,
			isChecked: this.action.showInfos
		}));
		this._register(infosFilter.onChange(() => {
			infosFilter.domNode.title = infosFilter.checked ? Messages.MARKERS_PANEL_ACTION_TOOLTIP_DO_NOT_SHOW_INFOS : Messages.MARKERS_PANEL_ACTION_TOOLTIP_SHOW_INFOS;
			this.action.showInfos = infosFilter.checked;
			this.focus();
		}));
		this._register(this.action.onDidChange((event: IMarkersFilterActionChangeEvent) => {
			if (event.showInfos) {
				infosFilter.checked = this.action.showInfos;
			}
		}));

		this._register(attachCheckboxStyler(infosFilter, this.themeService));
		container.appendChild(infosFilter.domNode);
	}

	private onDidInputChange(inputbox: HistoryInputBox) {
		inputbox.addToHistory();
		this.action.filterText = inputbox.value;
		this.action.filterHistory = inputbox.getHistory();
		this.reportFilteringUsed();
	}

	private updateBadge(): void {
		if (this.filterBadge) {
			const { total, filtered } = this.filterController.getFilterStats();
			DOM.toggleClass(this.filterBadge, 'hidden', total === filtered || filtered === 0);
			this.filterBadge.textContent = localize('showing filtered problems', "Showing {0} of {1}", filtered, total);
			this.adjustInputBox();
		}
	}

	private adjustInputBox(): void {
		if (this.element && this.filterInputBox && this.filterBadge) {
			this.filterInputBox.inputElement.style.paddingRight = DOM.hasClass(this.element, 'small') || DOM.hasClass(this.filterBadge, 'hidden') ? '25px' : '150px';
		}
	}

	// Action toolbar is swallowing some keys for action items which should not be for an input box
	private handleKeyboardEvent(event: StandardKeyboardEvent) {
		if (event.equals(KeyCode.Space)
			|| event.equals(KeyCode.LeftArrow)
			|| event.equals(KeyCode.RightArrow)
			|| event.equals(KeyCode.Escape)
		) {
			event.stopPropagation();
		}
	}

	private onInputKeyDown(event: StandardKeyboardEvent, filterInputBox: HistoryInputBox) {
		let handled = false;
		if (event.equals(KeyCode.Escape)) {
			filterInputBox.value = '';
			handled = true;
		}
		if (handled) {
			event.stopPropagation();
			event.preventDefault();
		}
	}

	private reportFilteringUsed(): void {
		const filterOptions = this.filterController.getFilterOptions();
		const data = {
			errors: filterOptions._showErrors,
			warnings: filterOptions._showWarnings,
			infos: filterOptions._showInfos,
		};
		/* __GDPR__
			"problems.filter" : {
				"errors" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
				"warnings": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
				"infos": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true }
			}
		*/
		this.telemetryService.publicLog('problems.filter', data);
	}

	protected updateClass(): void {
		if (this.element && this.container) {
			this.element.className = this.action.class || '';
			DOM.toggleClass(this.container, 'grow', DOM.hasClass(this.element, 'grow'));
			this.adjustInputBox();
		}
	}
}

export class QuickFixAction extends Action {

	public static readonly ID: string = 'workbench.actions.problems.quickfix';
	private static readonly CLASS: string = 'markers-panel-action-quickfix codicon-lightbulb';
	private static readonly AUTO_FIX_CLASS: string = QuickFixAction.CLASS + ' autofixable';

	private readonly _onShowQuickFixes = this._register(new Emitter<void>());
	readonly onShowQuickFixes: Event<void> = this._onShowQuickFixes.event;

	private _quickFixes: IAction[] = [];
	get quickFixes(): IAction[] {
		return this._quickFixes;
	}
	set quickFixes(quickFixes: IAction[]) {
		this._quickFixes = quickFixes;
		this.enabled = this._quickFixes.length > 0;
	}

	autoFixable(autofixable: boolean) {
		this.class = autofixable ? QuickFixAction.AUTO_FIX_CLASS : QuickFixAction.CLASS;
	}

	constructor(
		readonly marker: Marker,
	) {
		super(QuickFixAction.ID, Messages.MARKERS_PANEL_ACTION_TOOLTIP_QUICKFIX, QuickFixAction.CLASS, false);
	}

	run(): Promise<void> {
		this._onShowQuickFixes.fire();
		return Promise.resolve();
	}
}

export class QuickFixActionViewItem extends ActionViewItem {

	constructor(action: QuickFixAction,
		@IContextMenuService private readonly contextMenuService: IContextMenuService,
	) {
		super(null, action, { icon: true, label: false });
	}

	public onClick(event: DOM.EventLike): void {
		DOM.EventHelper.stop(event, true);
		this.showQuickFixes();
	}

	public showQuickFixes(): void {
		if (!this.element) {
			return;
		}
		if (!this.isEnabled()) {
			return;
		}
		const elementPosition = DOM.getDomNodePagePosition(this.element);
		const quickFixes = (<QuickFixAction>this.getAction()).quickFixes;
		if (quickFixes.length) {
			this.contextMenuService.showContextMenu({
				getAnchor: () => ({ x: elementPosition.left + 10, y: elementPosition.top + elementPosition.height + 4 }),
				getActions: () => quickFixes
			});
		}
	}
}
