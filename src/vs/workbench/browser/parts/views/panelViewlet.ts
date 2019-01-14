/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./media/panelviewlet';
import * as nls from 'vs/nls';
import { Event, Emitter } from 'vs/base/common/event';
import { ColorIdentifier } from 'vs/platform/theme/common/colorRegistry';
import { attachStyler, IColorMapping } from 'vs/platform/theme/common/styler';
import { SIDE_BAR_DRAG_AND_DROP_BACKGROUND, SIDE_BAR_SECTION_HEADER_FOREGROUND, SIDE_BAR_SECTION_HEADER_BACKGROUND, SIDE_BAR_SECTION_HEADER_BORDER } from 'vs/workbench/common/theme';
import { append, $, trackFocus, toggleClass, EventType, isAncestor, Dimension, addDisposableListener } from 'vs/base/browser/dom';
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
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IPartService } from 'vs/workbench/services/part/common/partService';
import { StandardMouseEvent } from 'vs/base/browser/mouseEvent';
import { IView } from 'vs/workbench/common/views';
import { IStorageService } from 'vs/platform/storage/common/storage';

export interface IPanelColors extends IColorMapping {
	dropBackground?: ColorIdentifier;
	headerForeground?: ColorIdentifier;
	headerBackground?: ColorIdentifier;
	headerBorder?: ColorIdentifier;
}

export interface IViewletPanelOptions extends IPanelOptions {
	actionRunner?: IActionRunner;
	id: string;
	title: string;
}

export abstract class ViewletPanel extends Panel implements IView {

	private static AlwaysShowActionsConfig = 'workbench.view.alwaysShowHeaderActions';

	private _onDidFocus = new Emitter<void>();
	readonly onDidFocus: Event<void> = this._onDidFocus.event;

	private _onDidBlur = new Emitter<void>();
	readonly onDidBlur: Event<void> = this._onDidBlur.event;

	private _onDidChangeBodyVisibility = new Emitter<boolean>();
	readonly onDidChangeBodyVisibility: Event<boolean> = this._onDidChangeBodyVisibility.event;

	protected _onDidChangeTitleArea = new Emitter<void>();
	readonly onDidChangeTitleArea: Event<void> = this._onDidChangeTitleArea.event;

	private _isVisible: boolean = false;
	readonly id: string;
	readonly title: string;

	protected actionRunner?: IActionRunner;
	protected toolbar: ToolBar;
	private headerContainer: HTMLElement;

	constructor(
		options: IViewletPanelOptions,
		@IKeybindingService protected keybindingService: IKeybindingService,
		@IContextMenuService protected contextMenuService: IContextMenuService,
		@IConfigurationService protected readonly configurationService: IConfigurationService
	) {
		super(options);

		this.id = options.id;
		this.title = options.title;
		this.actionRunner = options.actionRunner;

		this.disposables.push(this._onDidFocus, this._onDidBlur, this._onDidChangeBodyVisibility, this._onDidChangeTitleArea);
	}

	setVisible(visible: boolean): void {
		if (this._isVisible !== visible) {
			this._isVisible = visible;

			if (this.isExpanded()) {
				this._onDidChangeBodyVisibility.fire(visible);
			}
		}
	}

	isVisible(): boolean {
		return this._isVisible;
	}

	isBodyVisible(): boolean {
		return this._isVisible && this.isExpanded();
	}

	setExpanded(expanded: boolean): boolean {
		const changed = super.setExpanded(expanded);
		if (changed) {
			this._onDidChangeBodyVisibility.fire(expanded);
		}

		return changed;
	}

	render(): void {
		super.render();

		const focusTracker = trackFocus(this.element);
		this.disposables.push(focusTracker);
		this.disposables.push(focusTracker.onDidFocus(() => this._onDidFocus.fire()));
		this.disposables.push(focusTracker.onDidBlur(() => this._onDidBlur.fire()));
	}

	protected renderHeader(container: HTMLElement): void {
		this.headerContainer = container;

		this.renderHeaderTitle(container, this.title);

		const actions = append(container, $('.actions'));
		this.toolbar = new ToolBar(actions, this.contextMenuService, {
			orientation: ActionsOrientation.HORIZONTAL,
			actionItemProvider: action => this.getActionItem(action),
			ariaLabel: nls.localize('viewToolbarAriaLabel', "{0} actions", this.title),
			getKeyBinding: action => this.keybindingService.lookupKeybinding(action.id) || undefined,
			actionRunner: this.actionRunner
		});

		this.disposables.push(this.toolbar);
		this.setActions();

		const onDidRelevantConfigurationChange = Event.filter(this.configurationService.onDidChangeConfiguration, e => e.affectsConfiguration(ViewletPanel.AlwaysShowActionsConfig));
		onDidRelevantConfigurationChange(this.updateActionsVisibility, this, this.disposables);
		this.updateActionsVisibility();
	}

	protected renderHeaderTitle(container: HTMLElement, title: string): void {
		append(container, $('h3.title', undefined, title));
	}

	focus(): void {
		if (this.element) {
			this.element.focus();
			this._onDidFocus.fire();
		}
	}

	private setActions(): void {
		this.toolbar.setActions(prepareActions(this.getActions()), prepareActions(this.getSecondaryActions()))();
		this.toolbar.context = this.getActionsContext();
	}

	private updateActionsVisibility(): void {
		const shouldAlwaysShowActions = this.configurationService.getValue<boolean>('workbench.view.alwaysShowHeaderActions');
		toggleClass(this.headerContainer, 'actions-always-visible', shouldAlwaysShowActions);
	}

	protected updateActions(): void {
		this.setActions();
		this._onDidChangeTitleArea.fire();
	}

	getActions(): IAction[] {
		return [];
	}

	getSecondaryActions(): IAction[] {
		return [];
	}

	getActionItem(action: IAction): IActionItem | null {
		return null;
	}

	getActionsContext(): any {
		return undefined;
	}

	getOptimalWidth(): number {
		return 0;
	}

	saveState(): void {
		// Subclasses to implement for saving state
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

	private lastFocusedPanel: ViewletPanel | undefined;
	private panelItems: IViewletPanelItem[] = [];
	private panelview: PanelView;

	get onDidSashChange(): Event<number> {
		return this.panelview.onDidSashChange;
	}

	protected get panels(): ViewletPanel[] {
		return this.panelItems.map(i => i.panel);
	}

	protected get length(): number {
		return this.panelItems.length;
	}

	constructor(
		id: string,
		private options: IViewsViewletOptions,
		@IConfigurationService configurationService: IConfigurationService,
		@IPartService partService: IPartService,
		@IContextMenuService protected contextMenuService: IContextMenuService,
		@ITelemetryService telemetryService: ITelemetryService,
		@IThemeService themeService: IThemeService,
		@IStorageService storageService: IStorageService
	) {
		super(id, configurationService, partService, telemetryService, themeService, storageService);
	}

	create(parent: HTMLElement): void {
		super.create(parent);
		this.panelview = this._register(new PanelView(parent, this.options));
		this._register(this.panelview.onDidDrop(({ from, to }) => this.movePanel(from as ViewletPanel, to as ViewletPanel)));
		this._register(addDisposableListener(parent, EventType.CONTEXT_MENU, (e: MouseEvent) => this.showContextMenu(new StandardMouseEvent(e))));
	}

	private showContextMenu(event: StandardMouseEvent): void {
		for (const panelItem of this.panelItems) {
			// Do not show context menu if target is coming from inside panel views
			if (isAncestor(event.target, panelItem.panel.element)) {
				return;
			}
		}

		event.stopPropagation();
		event.preventDefault();

		let anchor: { x: number, y: number } = { x: event.posx, y: event.posy };
		this.contextMenuService.showContextMenu({
			getAnchor: () => anchor,
			getActions: () => this.getContextMenuActions()
		});
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

	getActionItem(action: IAction): IActionItem | null {
		if (this.isSingleView()) {
			return this.panelItems[0].panel.getActionItem(action);
		}

		return super.getActionItem(action);
	}

	focus(): void {
		super.focus();

		if (this.lastFocusedPanel) {
			this.lastFocusedPanel.focus();
		} else if (this.panelItems.length > 0) {
			for (const { panel } of this.panelItems) {
				if (panel.isExpanded()) {
					panel.focus();
					return;
				}
			}
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

	addPanels(panels: { panel: ViewletPanel, size: number, index?: number }[]): void {
		const wasSingleView = this.isSingleView();

		for (const { panel, size, index } of panels) {
			this.addPanel(panel, size, index);
		}

		this.updateViewHeaders();
		if (this.isSingleView() !== wasSingleView) {
			this.updateTitleArea();
		}
	}

	private addPanel(panel: ViewletPanel, size: number, index = this.panelItems.length - 1): void {
		const disposables: IDisposable[] = [];
		const onDidFocus = panel.onDidFocus(() => this.lastFocusedPanel = panel, null, disposables);
		const onDidChangeTitleArea = panel.onDidChangeTitleArea(() => {
			if (this.isSingleView()) {
				this.updateTitleArea();
			}
		}, null, disposables);
		const onDidChange = panel.onDidChange(() => {
			if (panel === this.lastFocusedPanel && !panel.isExpanded()) {
				this.lastFocusedPanel = undefined;
			}
		}, null, disposables);

		const panelStyler = attachStyler<IPanelColors>(this.themeService, {
			headerForeground: SIDE_BAR_SECTION_HEADER_FOREGROUND,
			headerBackground: SIDE_BAR_SECTION_HEADER_BACKGROUND,
			headerBorder: SIDE_BAR_SECTION_HEADER_BORDER,
			dropBackground: SIDE_BAR_DRAG_AND_DROP_BACKGROUND
		}, panel);
		const disposable = combinedDisposable([onDidFocus, onDidChangeTitleArea, panelStyler, onDidChange]);
		const panelItem: IViewletPanelItem = { panel, disposable };

		this.panelItems.splice(index, 0, panelItem);
		this.panelview.addPanel(panel, size, index);
	}

	removePanels(panels: ViewletPanel[]): void {
		const wasSingleView = this.isSingleView();

		panels.forEach(panel => this.removePanel(panel));

		this.updateViewHeaders();
		if (wasSingleView !== this.isSingleView()) {
			this.updateTitleArea();
		}
	}

	private removePanel(panel: ViewletPanel): void {
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
