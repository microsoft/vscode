/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./media/panelviewlet';
import * as nls from 'vs/nls';
import { TPromise } from 'vs/base/common/winjs.base';
import Event, { Emitter } from 'vs/base/common/event';
import { ColorIdentifier, contrastBorder } from 'vs/platform/theme/common/colorRegistry';
import { attachStyler, IColorMapping, IThemable } from 'vs/platform/theme/common/styler';
import { SIDE_BAR_DRAG_AND_DROP_BACKGROUND, SIDE_BAR_SECTION_HEADER_FOREGROUND, SIDE_BAR_SECTION_HEADER_BACKGROUND } from 'vs/workbench/common/theme';
import { Dimension, Builder } from 'vs/base/browser/builder';
import { append, $, trackFocus } from 'vs/base/browser/dom';
import { IDisposable, combinedDisposable } from 'vs/base/common/lifecycle';
import { firstIndex } from 'vs/base/common/arrays';
import { IAction, IActionRunner } from 'vs/base/common/actions';
import { IActionItem, ActionsOrientation } from 'vs/base/browser/ui/actionbar/actionbar';
import { Registry } from 'vs/platform/registry/common/platform';
import { prepareActions } from 'vs/workbench/browser/actions';
import { Viewlet, ViewletRegistry, Extensions } from 'vs/workbench/browser/viewlet';
import { ToolBar } from 'vs/base/browser/ui/toolbar/toolbar';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { PanelView, IPanelViewOptions, IPanelOptions, Panel } from 'vs/base/browser/ui/splitview/panelview';

export interface IPanelColors extends IColorMapping {
	dropBackground?: ColorIdentifier;
	headerForeground?: ColorIdentifier;
	headerBackground?: ColorIdentifier;
	headerHighContrastBorder?: ColorIdentifier;
}

export function attachPanelStyler(widget: IThemable, themeService: IThemeService) {
	return attachStyler<IPanelColors>(themeService, {
		headerForeground: SIDE_BAR_SECTION_HEADER_FOREGROUND,
		headerBackground: SIDE_BAR_SECTION_HEADER_BACKGROUND,
		headerHighContrastBorder: contrastBorder,
		dropBackground: SIDE_BAR_DRAG_AND_DROP_BACKGROUND
	}, widget);
}

export interface IViewletPanelOptions extends IPanelOptions {
	actionRunner?: IActionRunner;
}

export abstract class ViewletPanel extends Panel {

	private _onDidFocus = new Emitter<void>();
	readonly onDidFocus: Event<void> = this._onDidFocus.event;

	protected actionRunner: IActionRunner;
	protected toolbar: ToolBar;

	constructor(
		readonly title: string,
		options: IViewletPanelOptions,
		@IKeybindingService protected keybindingService: IKeybindingService,
		@IContextMenuService protected contextMenuService: IContextMenuService
	) {
		super(options);

		this.actionRunner = options.actionRunner;
	}

	render(container: HTMLElement): void {
		super.render(container);

		const focusTracker = trackFocus(container);
		this.disposables.push(focusTracker);
		this.disposables.push(focusTracker.onDidFocus(() => this._onDidFocus.fire()));
	}

	protected renderHeader(container: HTMLElement): void {
		this.renderHeaderTitle(container);

		const actions = append(container, $('.actions'));
		this.toolbar = new ToolBar(actions, this.contextMenuService, {
			orientation: ActionsOrientation.HORIZONTAL,
			actionItemProvider: action => this.getActionItem(action),
			ariaLabel: nls.localize('viewToolbarAriaLabel', "{0} actions", this.title),
			getKeyBinding: action => this.keybindingService.lookupKeybinding(action.id),
			actionRunner: this.actionRunner
		});

		this.disposables.push(this.toolbar);
		this.updateActions();
	}

	protected renderHeaderTitle(container: HTMLElement): void {
		append(container, $('.title', null, this.title));
	}

	focus(): void {
		this._onDidFocus.fire();
	}

	protected updateActions(): void {
		this.toolbar.setActions(prepareActions(this.getActions()), prepareActions(this.getSecondaryActions()))();
		this.toolbar.context = this.getActionsContext();
	}

	getActions(): IAction[] {
		return [];
	}

	getSecondaryActions(): IAction[] {
		return [];
	}

	getActionItem(action: IAction): IActionItem {
		return null;
	}

	getActionsContext(): any {
		return undefined;
	}

	getOptimalWidth(): number {
		return 0;
	}
}

export interface IViewsViewletOptions extends IPanelViewOptions {
	showHeaderInTitleWhenSingleView: boolean;
}

interface IViewletPanelItem {
	panel: ViewletPanel;
	disposable: IDisposable;
}

export class PanelViewlet extends Viewlet {

	protected lastFocusedPanel: ViewletPanel | undefined;
	private panelItems: IViewletPanelItem[] = [];
	private panelview: PanelView;

	get onDidSashChange(): Event<void> {
		return this.panelview.onDidSashChange;
	}

	protected get length(): number {
		return this.panelItems.length;
	}

	constructor(
		id: string,
		private options: IViewsViewletOptions,
		@ITelemetryService telemetryService: ITelemetryService,
		@IThemeService themeService: IThemeService
	) {
		super(id, telemetryService, themeService);
	}

	async create(parent: Builder): TPromise<void> {
		super.create(parent);

		const container = parent.getHTMLElement();
		this.panelview = this._register(new PanelView(container, this.options));
		this.panelview.onDidDrop(({ from, to }) => this.movePanel(from as ViewletPanel, to as ViewletPanel));
	}

	getTitle(): string {
		let title = Registry.as<ViewletRegistry>(Extensions.Viewlets).getViewlet(this.getId()).name;

		if (this.isSingleView()) {
			title += ': ' + this.panelItems[0].panel.title;
		}

		return title;
	}

	getActions(): IAction[] {
		if (this.isSingleView()) {
			return this.panelItems[0].panel.getActions();
		}

		return [];
	}

	getSecondaryActions(): IAction[] {
		if (this.isSingleView()) {
			return this.panelItems[0].panel.getSecondaryActions();
		}

		return [];
	}

	focus(): void {
		super.focus();

		if (this.lastFocusedPanel) {
			this.lastFocusedPanel.focus();
		} else if (this.panelItems.length > 0) {
			this.panelItems[0].panel.focus();
		}
	}

	layout(dimension: Dimension): void {
		this.panelview.layout(dimension.height);
	}

	getOptimalWidth(): number {
		const sizes = this.panelItems
			.map(panelItem => panelItem.panel.getOptimalWidth() || 0);

		return Math.max(...sizes);
	}

	addPanel(panel: ViewletPanel, size: number, index = this.panelItems.length - 1): void {
		const disposables: IDisposable[] = [];
		const onDidFocus = panel.onDidFocus(() => this.lastFocusedPanel = panel, null, disposables);
		const styler = attachPanelStyler(panel, this.themeService);
		const disposable = combinedDisposable([onDidFocus, styler]);
		const panelItem: IViewletPanelItem = { panel, disposable };

		this.panelItems.splice(index, 0, panelItem);
		this.panelview.addPanel(panel, size, index);

		this.updateViewHeaders();
		this.updateTitleArea();
	}

	removePanel(panel: ViewletPanel): void {
		const index = firstIndex(this.panelItems, i => i.panel === panel);

		if (index === -1) {
			return;
		}

		if (this.lastFocusedPanel === panel) {
			this.lastFocusedPanel = undefined;
		}

		this.panelview.removePanel(panel);
		const [panelItem] = this.panelItems.splice(index, 1);
		panelItem.disposable.dispose();

		this.updateViewHeaders();
		this.updateTitleArea();
	}

	movePanel(from: ViewletPanel, to: ViewletPanel): void {
		const fromIndex = firstIndex(this.panelItems, item => item.panel === from);
		const toIndex = firstIndex(this.panelItems, item => item.panel === to);

		if (fromIndex < 0 || fromIndex >= this.panelItems.length) {
			return;
		}

		if (toIndex < 0 || toIndex >= this.panelItems.length) {
			return;
		}

		const [panelItem] = this.panelItems.splice(fromIndex, 1);
		this.panelItems.splice(toIndex, 0, panelItem);

		this.panelview.movePanel(from, to);
	}

	resizePanel(panel: ViewletPanel, size: number): void {
		this.panelview.resizePanel(panel, size);
	}

	getPanelSize(panel: ViewletPanel): number {
		return this.panelview.getPanelSize(panel);
	}

	protected updateViewHeaders(): void {
		if (this.isSingleView()) {
			this.panelItems[0].panel.setExpanded(true);
			this.panelItems[0].panel.headerVisible = false;
		} else {
			this.panelItems.forEach(i => i.panel.headerVisible = true);
		}
	}

	protected isSingleView(): boolean {
		return this.options.showHeaderInTitleWhenSingleView && this.panelItems.length === 1;
	}

	dispose(): void {
		super.dispose();
		this.panelItems.forEach(i => i.disposable.dispose());
		this.panelview.dispose();
	}
}