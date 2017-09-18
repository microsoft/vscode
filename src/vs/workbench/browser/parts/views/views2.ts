/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import { TPromise } from 'vs/base/common/winjs.base';
import Event, { Emitter } from 'vs/base/common/event';
import { attachStyler } from 'vs/platform/theme/common/styler';
import { Dimension, Builder } from 'vs/base/browser/builder';
import { append, $ } from 'vs/base/browser/dom';
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
import { SIDE_BAR_DRAG_AND_DROP_BACKGROUND } from 'vs/workbench/common/theme';
import { PanelView, IPanelOptions, Panel } from 'vs/base/browser/ui/splitview/panelview';

export interface IViewletPanelOptions extends IPanelOptions {
	actionRunner?: IActionRunner;
}

export abstract class ViewletPanel extends Panel {

	private _onDidFocus = new Emitter<void>();
	readonly onDidFocus: Event<void> = this._onDidFocus.event;

	private actionRunner: IActionRunner;
	private toolbar: ToolBar;

	constructor(
		readonly name: string,
		initialSize: number,
		options: IViewletPanelOptions,
		protected keybindingService: IKeybindingService,
		protected contextMenuService: IContextMenuService
	) {
		super(options);

		this.actionRunner = options.actionRunner;
	}

	render(container: HTMLElement): void {
		super.render(container);

		const title = append(this.header, $('div.title'));
		title.textContent = this.name;

		const actions = append(this.header, $('div.actions'));
		this.toolbar = new ToolBar(actions, this.contextMenuService, {
			orientation: ActionsOrientation.HORIZONTAL,
			actionItemProvider: action => this.getActionItem(action),
			ariaLabel: nls.localize('viewToolbarAriaLabel', "{0} actions", this.name),
			getKeyBinding: action => this.keybindingService.lookupKeybinding(action.id),
			actionRunner: this.actionRunner
		});

		this.disposables.push(this.toolbar);
		this.updateActions();
	}

	focus(): void {
		super.focus();
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

export interface IViewsViewletOptions {
	showHeaderInTitleWhenSingleView: boolean;
}

const SplitViewThemeMapping = {
	dropBackground: SIDE_BAR_DRAG_AND_DROP_BACKGROUND
};

interface IViewletPanelItem {
	panel: ViewletPanel;
	disposable: IDisposable;
}

export class PanelViewlet extends Viewlet {

	protected lastFocusedPanel: ViewletPanel | undefined;
	private panelItems: IViewletPanelItem[] = [];
	private panelview: PanelView;

	protected get isSingleView(): boolean {
		return this.options.showHeaderInTitleWhenSingleView && this.panelItems.length === 1;
	}

	protected get length(): number {
		return this.panelItems.length;
	}

	constructor(
		id: string,
		private options: Partial<IViewsViewletOptions>,
		@ITelemetryService telemetryService: ITelemetryService,
		@IThemeService themeService: IThemeService
	) {
		super(id, telemetryService, themeService);
	}

	async create(parent: Builder): TPromise<void> {
		super.create(parent);

		const container = parent.getHTMLElement();
		this.panelview = this._register(new PanelView(container));
		this._register(attachStyler(this.themeService, SplitViewThemeMapping, this.panelview));
		// this._register(this.panelview.onFocus(view => this.lastFocusedView = view));
	}

	getTitle(): string {
		let title = Registry.as<ViewletRegistry>(Extensions.Viewlets).getViewlet(this.getId()).name;

		if (this.isSingleView) {
			title += ': ' + this.panelItems[0].panel.name;
		}

		return title;
	}

	getActions(): IAction[] {
		if (this.isSingleView) {
			return this.panelItems[0].panel.getActions();
		}

		return [];
	}

	getSecondaryActions(): IAction[] {
		if (this.isSingleView) {
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

	addView(panel: ViewletPanel, index = this.panelItems.length - 1): void {
		const disposables: IDisposable[] = [];
		const onDidFocus = panel.onDidFocus(() => this.lastFocusedPanel = panel, null, disposables);
		const disposable = combinedDisposable([onDidFocus]);
		const panelItem: IViewletPanelItem = { panel, disposable };

		this.panelItems.splice(index, 0, panelItem);
		this.panelview.addPanel(panel, 200, index);

		this.updateViewHeaders();
		this.updateTitleArea();
	}

	removeView(panel: ViewletPanel): void {
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

	private updateViewHeaders(): void {
		if (this.isSingleView) {
			this.panelItems[0].panel.headerVisible = false;
		} else {
			this.panelItems.forEach(i => i.panel.headerVisible = true);
		}
	}

	dispose(): void {
		super.dispose();
		this.panelItems.forEach(i => i.disposable.dispose());
		this.panelview.dispose();
	}
}