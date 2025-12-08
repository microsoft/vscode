/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./media/paneviewlet';
import * as nls from 'vs/nls';
import { Event, Emitter } from 'vs/base/common/event';
import { asCssVariable, foreground } from 'vs/platform/theme/common/colorRegistry';
import { PANEL_BACKGROUND, SIDE_BAR_BACKGROUND } from 'vs/workbench/common/theme';
import { after, append, $, trackFocus, EventType, addDisposableListener, createCSSRule, asCSSUrl, Dimension, reset, asCssValueWithDefault } from 'vs/base/browser/dom';
import { IDisposable, Disposable, DisposableStore } from 'vs/base/common/lifecycle';
import { Action, IAction, IActionRunner } from 'vs/base/common/actions';
import { ActionsOrientation, IActionViewItem, prepareActions } from 'vs/base/browser/ui/actionbar/actionbar';
import { Registry } from 'vs/platform/registry/common/platform';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { ThemeIcon } from 'vs/base/common/themables';
import { IPaneOptions, Pane, IPaneStyles } from 'vs/base/browser/ui/splitview/paneview';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { Extensions as ViewContainerExtensions, IView, IViewDescriptorService, ViewContainerLocation, IViewsRegistry, IViewContentDescriptor, defaultViewIcon, IViewsService, ViewContainerLocationToString } from 'vs/workbench/common/views';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { assertIsDefined } from 'vs/base/common/types';
import { IInstantiationService, ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { MenuId, Action2, IAction2Options, SubmenuItemAction } from 'vs/platform/actions/common/actions';
import { createActionViewItem } from 'vs/platform/actions/browser/menuEntryActionViewItem';
import { parseLinkedText } from 'vs/base/common/linkedText';
import { IOpenerService } from 'vs/platform/opener/common/opener';
import { Button } from 'vs/base/browser/ui/button/button';
import { Link } from 'vs/platform/opener/browser/link';
import { Orientation } from 'vs/base/browser/ui/sash/sash';
import { ProgressBar } from 'vs/base/browser/ui/progressbar/progressbar';
import { AbstractProgressScope, ScopedProgressIndicator } from 'vs/workbench/services/progress/browser/progressIndicator';
import { IProgressIndicator } from 'vs/platform/progress/common/progress';
import { DomScrollableElement } from 'vs/base/browser/ui/scrollbar/scrollableElement';
import { ScrollbarVisibility } from 'vs/base/common/scrollable';
import { URI } from 'vs/base/common/uri';
import { registerIcon } from 'vs/platform/theme/common/iconRegistry';
import { Codicon } from 'vs/base/common/codicons';
import { CompositeMenuActions } from 'vs/workbench/browser/actions';
import { IDropdownMenuActionViewItemOptions } from 'vs/base/browser/ui/dropdown/dropdownActionViewItem';
import { WorkbenchToolBar } from 'vs/platform/actions/browser/toolbar';
import { FilterWidget, IFilterWidgetOptions } from 'vs/workbench/browser/parts/views/viewFilter';
import { BaseActionViewItem } from 'vs/base/browser/ui/actionbar/actionViewItems';
import { ServiceCollection } from 'vs/platform/instantiation/common/serviceCollection';
import { defaultButtonStyles, defaultProgressBarStyles } from 'vs/platform/theme/browser/defaultStyles';

export enum ViewPaneShowActions {
	/** Show the actions when the view is hovered. This is the default behavior. */
	Default,

	/** Always shows the actions when the view is expanded */
	WhenExpanded,

	/** Always shows the actions */
	Always,
}

export interface IViewPaneOptions extends IPaneOptions {
	readonly id: string;
	readonly showActions?: ViewPaneShowActions;
	readonly titleMenuId?: MenuId;
	readonly donotForwardArgs?: boolean;
}

export interface IFilterViewPaneOptions extends IViewPaneOptions {
	filterOptions: IFilterWidgetOptions;
}

export const VIEWPANE_FILTER_ACTION = new Action('viewpane.action.filter');

type WelcomeActionClassification = {
	owner: 'joaomoreno';
	viewId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The view ID in which the welcome view button was clicked.' };
	uri: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The URI of the command ran by the result of clicking the button.' };
	comment: 'This is used to know when users click on the welcome view buttons.';
};

const viewPaneContainerExpandedIcon = registerIcon('view-pane-container-expanded', Codicon.chevronDown, nls.localize('viewPaneContainerExpandedIcon', 'Icon for an expanded view pane container.'));
const viewPaneContainerCollapsedIcon = registerIcon('view-pane-container-collapsed', Codicon.chevronRight, nls.localize('viewPaneContainerCollapsedIcon', 'Icon for a collapsed view pane container.'));

const viewsRegistry = Registry.as<IViewsRegistry>(ViewContainerExtensions.ViewsRegistry);

interface IItem {
	readonly descriptor: IViewContentDescriptor;
	visible: boolean;
}

class ViewWelcomeController {

	private _onDidChange = new Emitter<void>();
	readonly onDidChange = this._onDidChange.event;

	private defaultItem: IItem | undefined;
	private items: IItem[] = [];
	get contents(): IViewContentDescriptor[] {
		const visibleItems = this.items.filter(v => v.visible);

		if (visibleItems.length === 0 && this.defaultItem) {
			return [this.defaultItem.descriptor];
		}

		return visibleItems.map(v => v.descriptor);
	}

	private disposables = new DisposableStore();

	constructor(
		private id: string,
		@IContextKeyService private contextKeyService: IContextKeyService,
	) {
		contextKeyService.onDidChangeContext(this.onDidChangeContext, this, this.disposables);
		Event.filter(viewsRegistry.onDidChangeViewWelcomeContent, id => id === this.id)(this.onDidChangeViewWelcomeContent, this, this.disposables);
		this.onDidChangeViewWelcomeContent();
	}

	private onDidChangeViewWelcomeContent(): void {
		const descriptors = viewsRegistry.getViewWelcomeContent(this.id);

		this.items = [];

		for (const descriptor of descriptors) {
			if (descriptor.when === 'default') {
				this.defaultItem = { descriptor, visible: true };
			} else {
				const visible = descriptor.when ? this.contextKeyService.contextMatchesRules(descriptor.when) : true;
				this.items.push({ descriptor, visible });
			}
		}

		this._onDidChange.fire();
	}

	private onDidChangeContext(): void {
		let didChange = false;

		for (const item of this.items) {
			if (!item.descriptor.when || item.descriptor.when === 'default') {
				continue;
			}

			const visible = this.contextKeyService.contextMatchesRules(item.descriptor.when);

			if (item.visible === visible) {
				continue;
			}

			item.visible = visible;
			didChange = true;
		}

		if (didChange) {
			this._onDidChange.fire();
		}
	}

	dispose(): void {
		this.disposables.dispose();
	}
}

export abstract class ViewPane extends Pane implements IView {

	private static readonly AlwaysShowActionsConfig = 'workbench.view.alwaysShowHeaderActions';

	private _onDidFocus = this._register(new Emitter<void>());
	readonly onDidFocus: Event<void> = this._onDidFocus.event;

	private _onDidBlur = this._register(new Emitter<void>());
	readonly onDidBlur: Event<void> = this._onDidBlur.event;

	private _onDidChangeBodyVisibility = this._register(new Emitter<boolean>());
	readonly onDidChangeBodyVisibility: Event<boolean> = this._onDidChangeBodyVisibility.event;

	protected _onDidChangeTitleArea = this._register(new Emitter<void>());
	readonly onDidChangeTitleArea: Event<void> = this._onDidChangeTitleArea.event;

	protected _onDidChangeViewWelcomeState = this._register(new Emitter<void>());
	readonly onDidChangeViewWelcomeState: Event<void> = this._onDidChangeViewWelcomeState.event;

	private _isVisible: boolean = false;
	readonly id: string;

	private _title: string;
	public get title(): string {
		return this._title;
	}

	private _titleDescription: string | undefined;
	public get titleDescription(): string | undefined {
		return this._titleDescription;
	}

	readonly menuActions: CompositeMenuActions;

	private progressBar!: ProgressBar;
	private progressIndicator!: IProgressIndicator;

	private toolbar?: WorkbenchToolBar;
	private readonly showActions: ViewPaneShowActions;
	private headerContainer?: HTMLElement;
	private titleContainer?: HTMLElement;
	private titleDescriptionContainer?: HTMLElement;
	private iconContainer?: HTMLElement;
	protected twistiesContainer?: HTMLElement;

	private bodyContainer!: HTMLElement;
	private viewWelcomeContainer!: HTMLElement;
	private viewWelcomeDisposable: IDisposable = Disposable.None;
	private viewWelcomeController: ViewWelcomeController;

	protected readonly scopedContextKeyService: IContextKeyService;

	constructor(
		options: IViewPaneOptions,
		@IKeybindingService protected keybindingService: IKeybindingService,
		@IContextMenuService protected contextMenuService: IContextMenuService,
		@IConfigurationService protected readonly configurationService: IConfigurationService,
		@IContextKeyService protected contextKeyService: IContextKeyService,
		@IViewDescriptorService protected viewDescriptorService: IViewDescriptorService,
		@IInstantiationService protected instantiationService: IInstantiationService,
		@IOpenerService protected openerService: IOpenerService,
		@IThemeService protected themeService: IThemeService,
		@ITelemetryService protected telemetryService: ITelemetryService,
	) {
		super({ ...options, ...{ orientation: viewDescriptorService.getViewLocationById(options.id) === ViewContainerLocation.Panel ? Orientation.HORIZONTAL : Orientation.VERTICAL } });

		this.id = options.id;
		this._title = options.title;
		this._titleDescription = options.titleDescription;
		this.showActions = options.showActions ?? ViewPaneShowActions.Default;

		this.scopedContextKeyService = this._register(contextKeyService.createScoped(this.element));
		this.scopedContextKeyService.createKey('view', this.id);
		const viewLocationKey = this.scopedContextKeyService.createKey('viewLocation', ViewContainerLocationToString(viewDescriptorService.getViewLocationById(this.id)!));
		this._register(Event.filter(viewDescriptorService.onDidChangeLocation, e => e.views.some(view => view.id === this.id))(() => viewLocationKey.set(ViewContainerLocationToString(viewDescriptorService.getViewLocationById(this.id)!))));

		this.menuActions = this._register(this.instantiationService.createChild(new ServiceCollection([IContextKeyService, this.scopedContextKeyService])).createInstance(CompositeMenuActions, options.titleMenuId ?? MenuId.ViewTitle, MenuId.ViewTitleContext, { shouldForwardArgs: !options.donotForwardArgs }));
		this._register(this.menuActions.onDidChange(() => this.updateActions()));

		this.viewWelcomeController = new ViewWelcomeController(this.id, contextKeyService);
	}

	override get headerVisible(): boolean {
		return super.headerVisible;
	}

	override set headerVisible(visible: boolean) {
		super.headerVisible = visible;
		this.element.classList.toggle('merged-header', !visible);
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

	override setExpanded(expanded: boolean): boolean {
		const changed = super.setExpanded(expanded);
		if (changed) {
			this._onDidChangeBodyVisibility.fire(expanded);
		}
		if (this.twistiesContainer) {
			this.twistiesContainer.classList.remove(...ThemeIcon.asClassNameArray(this.getTwistyIcon(!expanded)));
			this.twistiesContainer.classList.add(...ThemeIcon.asClassNameArray(this.getTwistyIcon(expanded)));
		}
		return changed;
	}

	override render(): void {
		super.render();

		const focusTracker = trackFocus(this.element);
		this._register(focusTracker);
		this._register(focusTracker.onDidFocus(() => this._onDidFocus.fire()));
		this._register(focusTracker.onDidBlur(() => this._onDidBlur.fire()));
	}

	protected renderHeader(container: HTMLElement): void {
		this.headerContainer = container;

		this.twistiesContainer = append(container, $(ThemeIcon.asCSSSelector(this.getTwistyIcon(this.isExpanded()))));

		this.renderHeaderTitle(container, this.title);

		const actions = append(container, $('.actions'));
		actions.classList.toggle('show-always', this.showActions === ViewPaneShowActions.Always);
		actions.classList.toggle('show-expanded', this.showActions === ViewPaneShowActions.WhenExpanded);
		this.toolbar = this.instantiationService.createInstance(WorkbenchToolBar, actions, {
			orientation: ActionsOrientation.HORIZONTAL,
			actionViewItemProvider: action => this.getActionViewItem(action),
			ariaLabel: nls.localize('viewToolbarAriaLabel', "{0} actions", this.title),
			getKeyBinding: action => this.keybindingService.lookupKeybinding(action.id),
			renderDropdownAsChildElement: true,
			actionRunner: this.getActionRunner(),
			resetMenu: this.menuActions.menuId
		});

		this._register(this.toolbar);
		this.setActions();

		this._register(addDisposableListener(actions, EventType.CLICK, e => e.preventDefault()));

		const viewContainerModel = this.viewDescriptorService.getViewContainerByViewId(this.id);
		if (viewContainerModel) {
			this._register(this.viewDescriptorService.getViewContainerModel(viewContainerModel).onDidChangeContainerInfo(({ title }) => this.updateTitle(this.title)));
		} else {
			console.error(`View container model not found for view ${this.id}`);
		}

		const onDidRelevantConfigurationChange = Event.filter(this.configurationService.onDidChangeConfiguration, e => e.affectsConfiguration(ViewPane.AlwaysShowActionsConfig));
		this._register(onDidRelevantConfigurationChange(this.updateActionsVisibility, this));
		this.updateActionsVisibility();
	}

	protected getTwistyIcon(expanded: boolean): ThemeIcon {
		return expanded ? viewPaneContainerExpandedIcon : viewPaneContainerCollapsedIcon;
	}

	override style(styles: IPaneStyles): void {
		super.style(styles);

		const icon = this.getIcon();
		if (this.iconContainer) {
			const fgColor = asCssValueWithDefault(styles.headerForeground, asCssVariable(foreground));
			if (URI.isUri(icon)) {
				// Apply background color to activity bar item provided with iconUrls
				this.iconContainer.style.backgroundColor = fgColor;
				this.iconContainer.style.color = '';
			} else {
				// Apply foreground color to activity bar items provided with codicons
				this.iconContainer.style.color = fgColor;
				this.iconContainer.style.backgroundColor = '';
			}
		}
	}

	private getIcon(): ThemeIcon | URI {
		return this.viewDescriptorService.getViewDescriptorById(this.id)?.containerIcon || defaultViewIcon;
	}

	protected renderHeaderTitle(container: HTMLElement, title: string): void {
		this.iconContainer = append(container, $('.icon', undefined));
		const icon = this.getIcon();

		let cssClass: string | undefined = undefined;
		if (URI.isUri(icon)) {
			cssClass = `view-${this.id.replace(/[\.\:]/g, '-')}`;
			const iconClass = `.pane-header .icon.${cssClass}`;

			createCSSRule(iconClass, `
				mask: ${asCSSUrl(icon)} no-repeat 50% 50%;
				mask-size: 24px;
				-webkit-mask: ${asCSSUrl(icon)} no-repeat 50% 50%;
				-webkit-mask-size: 16px;
			`);
		} else if (ThemeIcon.isThemeIcon(icon)) {
			cssClass = ThemeIcon.asClassName(icon);
		}

		if (cssClass) {
			this.iconContainer.classList.add(...cssClass.split(' '));
		}

		const calculatedTitle = this.calculateTitle(title);
		this.titleContainer = append(container, $('h3.title', { title: calculatedTitle }, calculatedTitle));

		if (this._titleDescription) {
			this.setTitleDescription(this._titleDescription);
		}

		this.iconContainer.title = calculatedTitle;
		this.iconContainer.setAttribute('aria-label', calculatedTitle);
	}

	protected updateTitle(title: string): void {
		const calculatedTitle = this.calculateTitle(title);
		if (this.titleContainer) {
			this.titleContainer.textContent = calculatedTitle;
			this.titleContainer.setAttribute('title', calculatedTitle);
		}

		if (this.iconContainer) {
			this.iconContainer.title = calculatedTitle;
			this.iconContainer.setAttribute('aria-label', calculatedTitle);
		}

		this._title = title;
		this._onDidChangeTitleArea.fire();
	}

	private setTitleDescription(description: string | undefined) {
		if (this.titleDescriptionContainer) {
			this.titleDescriptionContainer.textContent = description ?? '';
			this.titleDescriptionContainer.setAttribute('title', description ?? '');
		}
		else if (description && this.titleContainer) {
			this.titleDescriptionContainer = after(this.titleContainer, $('span.description', { title: description }, description));
		}
	}

	protected updateTitleDescription(description?: string | undefined): void {
		this.setTitleDescription(description);

		this._titleDescription = description;
		this._onDidChangeTitleArea.fire();
	}

	private calculateTitle(title: string): string {
		const viewContainer = this.viewDescriptorService.getViewContainerByViewId(this.id)!;
		const model = this.viewDescriptorService.getViewContainerModel(viewContainer);
		const viewDescriptor = this.viewDescriptorService.getViewDescriptorById(this.id);
		const isDefault = this.viewDescriptorService.getDefaultContainerById(this.id) === viewContainer;

		if (!isDefault && viewDescriptor?.containerTitle && model.title !== viewDescriptor.containerTitle) {
			return `${viewDescriptor.containerTitle}: ${title}`;
		}

		return title;
	}

	private scrollableElement!: DomScrollableElement;

	protected renderBody(container: HTMLElement): void {
		this.bodyContainer = container;

		const viewWelcomeContainer = append(container, $('.welcome-view'));
		this.viewWelcomeContainer = $('.welcome-view-content', { tabIndex: 0 });
		this.scrollableElement = this._register(new DomScrollableElement(this.viewWelcomeContainer, {
			alwaysConsumeMouseWheel: true,
			horizontal: ScrollbarVisibility.Hidden,
			vertical: ScrollbarVisibility.Visible,
		}));

		append(viewWelcomeContainer, this.scrollableElement.getDomNode());

		const onViewWelcomeChange = Event.any(this.viewWelcomeController.onDidChange, this.onDidChangeViewWelcomeState);
		this._register(onViewWelcomeChange(this.updateViewWelcome, this));
		this.updateViewWelcome();
	}

	protected layoutBody(height: number, width: number): void {
		this.viewWelcomeContainer.style.height = `${height}px`;
		this.viewWelcomeContainer.style.width = `${width}px`;
		this.viewWelcomeContainer.classList.toggle('wide', width > 640);
		this.scrollableElement.scanDomNode();
	}

	onDidScrollRoot() {
		// noop
	}

	getProgressIndicator() {
		if (this.progressBar === undefined) {
			// Progress bar
			this.progressBar = this._register(new ProgressBar(this.element, defaultProgressBarStyles));
			this.progressBar.hide();
		}

		if (this.progressIndicator === undefined) {
			const that = this;
			this.progressIndicator = new ScopedProgressIndicator(assertIsDefined(this.progressBar), new class extends AbstractProgressScope {
				constructor() {
					super(that.id, that.isBodyVisible());
					this._register(that.onDidChangeBodyVisibility(isVisible => isVisible ? this.onScopeOpened(that.id) : this.onScopeClosed(that.id)));
				}
			}());
		}
		return this.progressIndicator;
	}

	protected getProgressLocation(): string {
		return this.viewDescriptorService.getViewContainerByViewId(this.id)!.id;
	}

	protected getBackgroundColor(): string {
		switch (this.viewDescriptorService.getViewLocationById(this.id)) {
			case ViewContainerLocation.Panel:
				return PANEL_BACKGROUND;
			case ViewContainerLocation.Sidebar:
			case ViewContainerLocation.AuxiliaryBar:
				return SIDE_BAR_BACKGROUND;
		}

		return SIDE_BAR_BACKGROUND;
	}

	focus(): void {
		if (this.shouldShowWelcome()) {
			this.viewWelcomeContainer.focus();
		} else if (this.element) {
			this.element.focus();
			this._onDidFocus.fire();
		}
	}

	private setActions(): void {
		if (this.toolbar) {
			const primaryActions = [...this.menuActions.getPrimaryActions()];
			if (this.shouldShowFilterInHeader()) {
				primaryActions.unshift(VIEWPANE_FILTER_ACTION);
			}
			this.toolbar.setActions(prepareActions(primaryActions), prepareActions(this.menuActions.getSecondaryActions()));
			this.toolbar.context = this.getActionsContext();
		}
	}

	private updateActionsVisibility(): void {
		if (!this.headerContainer) {
			return;
		}
		const shouldAlwaysShowActions = this.configurationService.getValue<boolean>('workbench.view.alwaysShowHeaderActions');
		this.headerContainer.classList.toggle('actions-always-visible', shouldAlwaysShowActions);
	}

	protected updateActions(): void {
		this.setActions();
		this._onDidChangeTitleArea.fire();
	}

	getActionViewItem(action: IAction, options?: IDropdownMenuActionViewItemOptions): IActionViewItem | undefined {
		if (action.id === VIEWPANE_FILTER_ACTION.id) {
			const that = this;
			return new class extends BaseActionViewItem {
				constructor() { super(null, action); }
				override setFocusable(): void { /* noop input elements are focusable by default */ }
				override get trapsArrowNavigation(): boolean { return true; }
				override render(container: HTMLElement): void {
					container.classList.add('viewpane-filter-container');
					append(container, that.getFilterWidget()!.element);
				}
			};
		}
		return createActionViewItem(this.instantiationService, action, { ...options, ...{ menuAsChild: action instanceof SubmenuItemAction } });
	}

	getActionsContext(): unknown {
		return undefined;
	}

	getActionRunner(): IActionRunner | undefined {
		return undefined;
	}

	getOptimalWidth(): number {
		return 0;
	}

	saveState(): void {
		// Subclasses to implement for saving state
	}

	private updateViewWelcome(): void {
		this.viewWelcomeDisposable.dispose();

		if (!this.shouldShowWelcome()) {
			this.bodyContainer.classList.remove('welcome');
			this.viewWelcomeContainer.innerText = '';
			this.scrollableElement.scanDomNode();
			return;
		}

		const contents = this.viewWelcomeController.contents;

		if (contents.length === 0) {
			this.bodyContainer.classList.remove('welcome');
			this.viewWelcomeContainer.innerText = '';
			this.scrollableElement.scanDomNode();
			return;
		}

		const disposables = new DisposableStore();
		this.bodyContainer.classList.add('welcome');
		this.viewWelcomeContainer.innerText = '';

		for (const { content, precondition } of contents) {
			const lines = content.split('\n');

			for (let line of lines) {
				line = line.trim();

				if (!line) {
					continue;
				}

				const linkedText = parseLinkedText(line);

				if (linkedText.nodes.length === 1 && typeof linkedText.nodes[0] !== 'string') {
					const node = linkedText.nodes[0];
					const buttonContainer = append(this.viewWelcomeContainer, $('.button-container'));
					const button = new Button(buttonContainer, { title: node.title, supportIcons: true, ...defaultButtonStyles });
					button.label = node.label;
					button.onDidClick(_ => {
						this.telemetryService.publicLog2<{ viewId: string; uri: string }, WelcomeActionClassification>('views.welcomeAction', { viewId: this.id, uri: node.href });
						this.openerService.open(node.href, { allowCommands: true });
					}, null, disposables);
					disposables.add(button);

					if (precondition) {
						const updateEnablement = () => button.enabled = this.contextKeyService.contextMatchesRules(precondition);
						updateEnablement();

						const keys = new Set();
						precondition.keys().forEach(key => keys.add(key));
						const onDidChangeContext = Event.filter(this.contextKeyService.onDidChangeContext, e => e.affectsSome(keys));
						onDidChangeContext(updateEnablement, null, disposables);
					}
				} else {
					const p = append(this.viewWelcomeContainer, $('p'));

					for (const node of linkedText.nodes) {
						if (typeof node === 'string') {
							append(p, document.createTextNode(node));
						} else {
							const link = disposables.add(this.instantiationService.createInstance(Link, p, node, {}));

							if (precondition && node.href.startsWith('command:')) {
								const updateEnablement = () => link.enabled = this.contextKeyService.contextMatchesRules(precondition);
								updateEnablement();

								const keys = new Set();
								precondition.keys().forEach(key => keys.add(key));
								const onDidChangeContext = Event.filter(this.contextKeyService.onDidChangeContext, e => e.affectsSome(keys));
								onDidChangeContext(updateEnablement, null, disposables);
							}
						}
					}
				}
			}
		}

		this.scrollableElement.scanDomNode();
		this.viewWelcomeDisposable = disposables;
	}

	shouldShowWelcome(): boolean {
		return false;
	}

	getFilterWidget(): FilterWidget | undefined {
		return undefined;
	}

	shouldShowFilterInHeader(): boolean {
		return false;
	}
}

export abstract class FilterViewPane extends ViewPane {

	readonly filterWidget: FilterWidget;
	private dimension: Dimension | undefined;
	private filterContainer: HTMLElement | undefined;

	constructor(
		options: IFilterViewPaneOptions,
		@IKeybindingService keybindingService: IKeybindingService,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IConfigurationService configurationService: IConfigurationService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IViewDescriptorService viewDescriptorService: IViewDescriptorService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IOpenerService openerService: IOpenerService,
		@IThemeService themeService: IThemeService,
		@ITelemetryService telemetryService: ITelemetryService,
	) {
		super(options, keybindingService, contextMenuService, configurationService, contextKeyService, viewDescriptorService, instantiationService, openerService, themeService, telemetryService);
		this.filterWidget = this._register(instantiationService.createChild(new ServiceCollection([IContextKeyService, this.scopedContextKeyService])).createInstance(FilterWidget, options.filterOptions));
	}

	override getFilterWidget(): FilterWidget {
		return this.filterWidget;
	}

	protected override renderBody(container: HTMLElement): void {
		super.renderBody(container);
		this.filterContainer = append(container, $('.viewpane-filter-container'));
	}

	protected override layoutBody(height: number, width: number): void {
		super.layoutBody(height, width);

		this.dimension = new Dimension(width, height);
		const wasFilterShownInHeader = !this.filterContainer?.hasChildNodes();
		const shouldShowFilterInHeader = this.shouldShowFilterInHeader();
		if (wasFilterShownInHeader !== shouldShowFilterInHeader) {
			if (shouldShowFilterInHeader) {
				reset(this.filterContainer!);
			}
			this.updateActions();
			if (!shouldShowFilterInHeader) {
				append(this.filterContainer!, this.filterWidget.element);
			}
		}
		if (!shouldShowFilterInHeader) {
			height = height - 44;
		}
		this.filterWidget.layout(width);
		this.layoutBodyContent(height, width);
	}

	override shouldShowFilterInHeader(): boolean {
		return !(this.dimension && this.dimension.width < 600 && this.dimension.height > 100);
	}

	protected abstract layoutBodyContent(height: number, width: number): void;

}

export abstract class ViewAction<T extends IView> extends Action2 {
	override readonly desc: Readonly<IAction2Options> & { viewId: string };
	constructor(desc: Readonly<IAction2Options> & { viewId: string }) {
		super(desc);
		this.desc = desc;
	}

	run(accessor: ServicesAccessor, ...args: any[]) {
		const view = accessor.get(IViewsService).getActiveViewWithId(this.desc.viewId);
		if (view) {
			return this.runInView(accessor, <T>view, ...args);
		}
	}

	abstract runInView(accessor: ServicesAccessor, view: T, ...args: any[]): any;
}
