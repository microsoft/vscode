/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./media/paneviewlet';
import * as nls from 'vs/nls';
import { Event, Emitter } from 'vs/base/common/event';
import { ColorIdentifier } from 'vs/platform/theme/common/colorRegistry';
import { attachStyler, IColorMapping } from 'vs/platform/theme/common/styler';
import { SIDE_BAR_DRAG_AND_DROP_BACKGROUND, SIDE_BAR_SECTION_HEADER_FOREGROUND, SIDE_BAR_SECTION_HEADER_BACKGROUND, SIDE_BAR_SECTION_HEADER_BORDER } from 'vs/workbench/common/theme';
import { append, $, trackFocus, toggleClass, EventType, isAncestor, Dimension, addDisposableListener } from 'vs/base/browser/dom';
import { IDisposable, combinedDisposable } from 'vs/base/common/lifecycle';
import { firstIndex } from 'vs/base/common/arrays';
import { IAction, IActionRunner } from 'vs/base/common/actions';
import { IActionViewItem, ActionsOrientation } from 'vs/base/browser/ui/actionbar/actionbar';
import { Registry } from 'vs/platform/registry/common/platform';
import { prepareActions } from 'vs/workbench/browser/actions';
import { Viewlet, ViewletRegistry, Extensions } from 'vs/workbench/browser/viewlet';
import { ToolBar } from 'vs/base/browser/ui/toolbar/toolbar';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { PaneView, IPaneViewOptions, IPaneOptions, Pane } from 'vs/base/browser/ui/splitview/paneview';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IWorkbenchLayoutService } from 'vs/workbench/services/layout/browser/layoutService';
import { StandardMouseEvent } from 'vs/base/browser/mouseEvent';
import { IView, FocusedViewContext } from 'vs/workbench/common/views';
import { IStorageService } from 'vs/platform/storage/common/storage';
import { IContextKey, IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { assertIsDefined } from 'vs/base/common/types';

export interface IPaneColors extends IColorMapping {
	dropBackground?: ColorIdentifier;
	headerForeground?: ColorIdentifier;
	headerBackground?: ColorIdentifier;
	headerBorder?: ColorIdentifier;
}

export interface IViewletPaneOptions extends IPaneOptions {
	actionRunner?: IActionRunner;
	id: string;
	title: string;
	showActionsAlways?: boolean;
}

export abstract class ViewletPane extends Pane implements IView {

	private static readonly AlwaysShowActionsConfig = 'workbench.view.alwaysShowHeaderActions';

	private _onDidFocus = this._register(new Emitter<void>());
	readonly onDidFocus: Event<void> = this._onDidFocus.event;

	private _onDidBlur = this._register(new Emitter<void>());
	readonly onDidBlur: Event<void> = this._onDidBlur.event;

	private _onDidChangeBodyVisibility = this._register(new Emitter<boolean>());
	readonly onDidChangeBodyVisibility: Event<boolean> = this._onDidChangeBodyVisibility.event;

	protected _onDidChangeTitleArea = this._register(new Emitter<void>());
	readonly onDidChangeTitleArea: Event<void> = this._onDidChangeTitleArea.event;

	private focusedViewContextKey: IContextKey<string>;

	private _isVisible: boolean = false;
	readonly id: string;
	title: string;

	protected actionRunner?: IActionRunner;
	protected toolbar?: ToolBar;
	private readonly showActionsAlways: boolean = false;
	private headerContainer?: HTMLElement;
	private titleContainer?: HTMLElement;
	protected twistiesContainer?: HTMLElement;

	constructor(
		options: IViewletPaneOptions,
		@IKeybindingService protected keybindingService: IKeybindingService,
		@IContextMenuService protected contextMenuService: IContextMenuService,
		@IConfigurationService protected readonly configurationService: IConfigurationService,
		@IContextKeyService contextKeyService: IContextKeyService
	) {
		super(options);

		this.id = options.id;
		this.title = options.title;
		this.actionRunner = options.actionRunner;
		this.showActionsAlways = !!options.showActionsAlways;
		this.focusedViewContextKey = FocusedViewContext.bindTo(contextKeyService);
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
		this._register(focusTracker);
		this._register(focusTracker.onDidFocus(() => {
			this.focusedViewContextKey.set(this.id);
			this._onDidFocus.fire();
		}));
		this._register(focusTracker.onDidBlur(() => {
			this.focusedViewContextKey.reset();
			this._onDidBlur.fire();
		}));
	}

	protected renderHeader(container: HTMLElement): void {
		this.headerContainer = container;

		this.renderTwisties(container);

		this.renderHeaderTitle(container, this.title);

		const actions = append(container, $('.actions'));
		toggleClass(actions, 'show', this.showActionsAlways);
		this.toolbar = new ToolBar(actions, this.contextMenuService, {
			orientation: ActionsOrientation.HORIZONTAL,
			actionViewItemProvider: action => this.getActionViewItem(action),
			ariaLabel: nls.localize('viewToolbarAriaLabel', "{0} actions", this.title),
			getKeyBinding: action => this.keybindingService.lookupKeybinding(action.id),
			actionRunner: this.actionRunner
		});

		this._register(this.toolbar);
		this.setActions();

		const onDidRelevantConfigurationChange = Event.filter(this.configurationService.onDidChangeConfiguration, e => e.affectsConfiguration(ViewletPane.AlwaysShowActionsConfig));
		this._register(onDidRelevantConfigurationChange(this.updateActionsVisibility, this));
		this.updateActionsVisibility();
	}

	protected renderTwisties(container: HTMLElement): void {
		this.twistiesContainer = append(container, $('.twisties.codicon.codicon-chevron-right'));
	}

	protected renderHeaderTitle(container: HTMLElement, title: string): void {
		this.titleContainer = append(container, $('h3.title', undefined, title));
	}

	protected updateTitle(title: string): void {
		if (this.titleContainer) {
			this.titleContainer.textContent = title;
		}
		this.title = title;
		this._onDidChangeTitleArea.fire();
	}

	focus(): void {
		if (this.element) {
			this.element.focus();
			this._onDidFocus.fire();
		}
	}

	private setActions(): void {
		if (this.toolbar) {
			this.toolbar.setActions(prepareActions(this.getActions()), prepareActions(this.getSecondaryActions()))();
			this.toolbar.context = this.getActionsContext();
		}
	}

	private updateActionsVisibility(): void {
		if (!this.headerContainer) {
			return;
		}
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

	getActionViewItem(action: IAction): IActionViewItem | undefined {
		return undefined;
	}

	getActionsContext(): unknown {
		return undefined;
	}

	getOptimalWidth(): number {
		return 0;
	}

	saveState(): void {
		// Subclasses to implement for saving state
	}
}

export interface IViewsViewletOptions extends IPaneViewOptions {
	showHeaderInTitleWhenSingleView: boolean;
}

interface IViewletPaneItem {
	pane: ViewletPane;
	disposable: IDisposable;
}

export class PaneViewlet extends Viewlet {

	private lastFocusedPane: ViewletPane | undefined;
	private paneItems: IViewletPaneItem[] = [];
	private paneview?: PaneView;

	get onDidSashChange(): Event<number> {
		return assertIsDefined(this.paneview).onDidSashChange;
	}

	protected get panes(): ViewletPane[] {
		return this.paneItems.map(i => i.pane);
	}

	protected get length(): number {
		return this.paneItems.length;
	}

	constructor(
		id: string,
		private options: IViewsViewletOptions,
		@IConfigurationService configurationService: IConfigurationService,
		@IWorkbenchLayoutService layoutService: IWorkbenchLayoutService,
		@IContextMenuService protected contextMenuService: IContextMenuService,
		@ITelemetryService telemetryService: ITelemetryService,
		@IThemeService themeService: IThemeService,
		@IStorageService storageService: IStorageService
	) {
		super(id, configurationService, layoutService, telemetryService, themeService, storageService);
	}

	create(parent: HTMLElement): void {
		super.create(parent);
		this.paneview = this._register(new PaneView(parent, this.options));
		this._register(this.paneview.onDidDrop(({ from, to }) => this.movePane(from as ViewletPane, to as ViewletPane)));
		this._register(addDisposableListener(parent, EventType.CONTEXT_MENU, (e: MouseEvent) => this.showContextMenu(new StandardMouseEvent(e))));
	}

	private showContextMenu(event: StandardMouseEvent): void {
		for (const paneItem of this.paneItems) {
			// Do not show context menu if target is coming from inside pane views
			if (isAncestor(event.target, paneItem.pane.element)) {
				return;
			}
		}

		event.stopPropagation();
		event.preventDefault();

		let anchor: { x: number, y: number; } = { x: event.posx, y: event.posy };
		this.contextMenuService.showContextMenu({
			getAnchor: () => anchor,
			getActions: () => this.getContextMenuActions()
		});
	}

	getTitle(): string {
		let title = Registry.as<ViewletRegistry>(Extensions.Viewlets).getViewlet(this.getId()).name;

		if (this.isSingleView()) {
			const paneItemTitle = this.paneItems[0].pane.title;
			title = paneItemTitle ? `${title}: ${paneItemTitle}` : title;
		}

		return title;
	}

	getActions(): IAction[] {
		if (this.isSingleView()) {
			return this.paneItems[0].pane.getActions();
		}

		return [];
	}

	getSecondaryActions(): IAction[] {
		if (this.isSingleView()) {
			return this.paneItems[0].pane.getSecondaryActions();
		}

		return [];
	}

	getActionViewItem(action: IAction): IActionViewItem | undefined {
		if (this.isSingleView()) {
			return this.paneItems[0].pane.getActionViewItem(action);
		}

		return super.getActionViewItem(action);
	}

	focus(): void {
		super.focus();

		if (this.lastFocusedPane) {
			this.lastFocusedPane.focus();
		} else if (this.paneItems.length > 0) {
			for (const { pane: pane } of this.paneItems) {
				if (pane.isExpanded()) {
					pane.focus();
					return;
				}
			}
		}
	}

	layout(dimension: Dimension): void {
		if (this.paneview) {
			this.paneview.layout(dimension.height, dimension.width);
		}
	}

	getOptimalWidth(): number {
		const sizes = this.paneItems
			.map(paneItem => paneItem.pane.getOptimalWidth() || 0);

		return Math.max(...sizes);
	}

	addPanes(panes: { pane: ViewletPane, size: number, index?: number; }[]): void {
		const wasSingleView = this.isSingleView();

		for (const { pane: pane, size, index } of panes) {
			this.addPane(pane, size, index);
		}

		this.updateViewHeaders();
		if (this.isSingleView() !== wasSingleView) {
			this.updateTitleArea();
		}
	}

	private addPane(pane: ViewletPane, size: number, index = this.paneItems.length - 1): void {
		const onDidFocus = pane.onDidFocus(() => this.lastFocusedPane = pane);
		const onDidChangeTitleArea = pane.onDidChangeTitleArea(() => {
			if (this.isSingleView()) {
				this.updateTitleArea();
			}
		});
		const onDidChange = pane.onDidChange(() => {
			if (pane === this.lastFocusedPane && !pane.isExpanded()) {
				this.lastFocusedPane = undefined;
			}
		});

		const paneStyler = attachStyler<IPaneColors>(this.themeService, {
			headerForeground: SIDE_BAR_SECTION_HEADER_FOREGROUND,
			headerBackground: SIDE_BAR_SECTION_HEADER_BACKGROUND,
			headerBorder: SIDE_BAR_SECTION_HEADER_BORDER,
			dropBackground: SIDE_BAR_DRAG_AND_DROP_BACKGROUND
		}, pane);
		const disposable = combinedDisposable(onDidFocus, onDidChangeTitleArea, paneStyler, onDidChange);
		const paneItem: IViewletPaneItem = { pane: pane, disposable };

		this.paneItems.splice(index, 0, paneItem);
		assertIsDefined(this.paneview).addPane(pane, size, index);
	}

	removePanes(panes: ViewletPane[]): void {
		const wasSingleView = this.isSingleView();

		panes.forEach(pane => this.removePane(pane));

		this.updateViewHeaders();
		if (wasSingleView !== this.isSingleView()) {
			this.updateTitleArea();
		}
	}

	private removePane(pane: ViewletPane): void {
		const index = firstIndex(this.paneItems, i => i.pane === pane);

		if (index === -1) {
			return;
		}

		if (this.lastFocusedPane === pane) {
			this.lastFocusedPane = undefined;
		}

		assertIsDefined(this.paneview).removePane(pane);
		const [paneItem] = this.paneItems.splice(index, 1);
		paneItem.disposable.dispose();

	}

	movePane(from: ViewletPane, to: ViewletPane): void {
		const fromIndex = firstIndex(this.paneItems, item => item.pane === from);
		const toIndex = firstIndex(this.paneItems, item => item.pane === to);

		if (fromIndex < 0 || fromIndex >= this.paneItems.length) {
			return;
		}

		if (toIndex < 0 || toIndex >= this.paneItems.length) {
			return;
		}

		const [paneItem] = this.paneItems.splice(fromIndex, 1);
		this.paneItems.splice(toIndex, 0, paneItem);

		assertIsDefined(this.paneview).movePane(from, to);
	}

	resizePane(pane: ViewletPane, size: number): void {
		assertIsDefined(this.paneview).resizePane(pane, size);
	}

	getPaneSize(pane: ViewletPane): number {
		return assertIsDefined(this.paneview).getPaneSize(pane);
	}

	protected updateViewHeaders(): void {
		if (this.isSingleView()) {
			this.paneItems[0].pane.setExpanded(true);
			this.paneItems[0].pane.headerVisible = false;
		} else {
			this.paneItems.forEach(i => i.pane.headerVisible = true);
		}
	}

	protected isSingleView(): boolean {
		return this.options.showHeaderInTitleWhenSingleView && this.paneItems.length === 1;
	}

	dispose(): void {
		super.dispose();
		this.paneItems.forEach(i => i.disposable.dispose());
		if (this.paneview) {
			this.paneview.dispose();
		}
	}
}
