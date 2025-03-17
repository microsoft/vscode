/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/paneviewlet.css';
import * as nls from '../../../../nls.js';
import { Event, Emitter } from '../../../../base/common/event.js';
import { asCssVariable, foreground } from '../../../../platform/theme/common/colorRegistry.js';
import { after, append, $, trackFocus, EventType, addDisposableListener, Dimension, reset, isAncestorOfActiveElement, isActiveElement } from '../../../../base/browser/dom.js';
import { createCSSRule } from '../../../../base/browser/domStylesheets.js';
import { asCssValueWithDefault, asCSSUrl } from '../../../../base/browser/cssValue.js';
import { DisposableMap, DisposableStore, toDisposable } from '../../../../base/common/lifecycle.js';
import { Action, IAction, IActionRunner } from '../../../../base/common/actions.js';
import { ActionsOrientation, IActionViewItem, prepareActions } from '../../../../base/browser/ui/actionbar/actionbar.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { IContextMenuService } from '../../../../platform/contextview/browser/contextView.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { IPaneOptions, Pane, IPaneStyles } from '../../../../base/browser/ui/splitview/paneview.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { Extensions as ViewContainerExtensions, IView, IViewDescriptorService, ViewContainerLocation, IViewsRegistry, IViewContentDescriptor, defaultViewIcon, ViewContainerLocationToString } from '../../../common/views.js';
import { IViewsService } from '../../../services/views/common/viewsService.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { assertIsDefined, PartialExcept } from '../../../../base/common/types.js';
import { IInstantiationService, ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { MenuId, Action2, IAction2Options, SubmenuItemAction } from '../../../../platform/actions/common/actions.js';
import { createActionViewItem } from '../../../../platform/actions/browser/menuEntryActionViewItem.js';
import { parseLinkedText } from '../../../../base/common/linkedText.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { Button } from '../../../../base/browser/ui/button/button.js';
import { Link } from '../../../../platform/opener/browser/link.js';
import { Orientation } from '../../../../base/browser/ui/sash/sash.js';
import { ProgressBar } from '../../../../base/browser/ui/progressbar/progressbar.js';
import { AbstractProgressScope, ScopedProgressIndicator } from '../../../services/progress/browser/progressIndicator.js';
import { IProgressIndicator } from '../../../../platform/progress/common/progress.js';
import { DomScrollableElement } from '../../../../base/browser/ui/scrollbar/scrollableElement.js';
import { ScrollbarVisibility } from '../../../../base/common/scrollable.js';
import { URI } from '../../../../base/common/uri.js';
import { registerIcon } from '../../../../platform/theme/common/iconRegistry.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { CompositeMenuActions } from '../../actions.js';
import { IDropdownMenuActionViewItemOptions } from '../../../../base/browser/ui/dropdown/dropdownActionViewItem.js';
import { WorkbenchToolBar } from '../../../../platform/actions/browser/toolbar.js';
import { FilterWidget, IFilterWidgetOptions } from './viewFilter.js';
import { BaseActionViewItem } from '../../../../base/browser/ui/actionbar/actionViewItems.js';
import { ServiceCollection } from '../../../../platform/instantiation/common/serviceCollection.js';
import { defaultButtonStyles, defaultProgressBarStyles } from '../../../../platform/theme/browser/defaultStyles.js';
import { getDefaultHoverDelegate } from '../../../../base/browser/ui/hover/hoverDelegateFactory.js';
import { ILifecycleService } from '../../../services/lifecycle/common/lifecycle.js';
import type { IManagedHover } from '../../../../base/browser/ui/hover/hover.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { IListStyles } from '../../../../base/browser/ui/list/listWidget.js';
import { PANEL_BACKGROUND, PANEL_SECTION_DRAG_AND_DROP_BACKGROUND, PANEL_STICKY_SCROLL_BACKGROUND, PANEL_STICKY_SCROLL_BORDER, PANEL_STICKY_SCROLL_SHADOW, SIDE_BAR_BACKGROUND, SIDE_BAR_DRAG_AND_DROP_BACKGROUND, SIDE_BAR_STICKY_SCROLL_BACKGROUND, SIDE_BAR_STICKY_SCROLL_BORDER, SIDE_BAR_STICKY_SCROLL_SHADOW } from '../../../common/theme.js';
import { IAccessibleViewInformationService } from '../../../services/accessibility/common/accessibleViewInformationService.js';
import { renderLabelWithIcons } from '../../../../base/browser/ui/iconLabel/iconLabels.js';

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
	// The title of the container pane when it is merged with the view container
	readonly singleViewPaneContainerTitle?: string;
}

export interface IFilterViewPaneOptions extends IViewPaneOptions {
	filterOptions: IFilterWidgetOptions;
}

export const VIEWPANE_FILTER_ACTION = new Action('viewpane.action.filter');

const viewPaneContainerExpandedIcon = registerIcon('view-pane-container-expanded', Codicon.chevronDown, nls.localize('viewPaneContainerExpandedIcon', 'Icon for an expanded view pane container.'));
const viewPaneContainerCollapsedIcon = registerIcon('view-pane-container-collapsed', Codicon.chevronRight, nls.localize('viewPaneContainerCollapsedIcon', 'Icon for a collapsed view pane container.'));

const viewsRegistry = Registry.as<IViewsRegistry>(ViewContainerExtensions.ViewsRegistry);

interface IItem {
	readonly descriptor: IViewContentDescriptor;
	visible: boolean;
}

interface IViewWelcomeDelegate {
	readonly id: string;
	readonly onDidChangeViewWelcomeState: Event<void>;
	shouldShowWelcome(): boolean;
}

class ViewWelcomeController {

	private defaultItem: IItem | undefined;
	private items: IItem[] = [];

	get enabled(): boolean { return this._enabled; }
	private _enabled: boolean = false;
	private element: HTMLElement | undefined;
	private scrollableElement: DomScrollableElement | undefined;

	private readonly disposables = new DisposableStore();
	private readonly enabledDisposables = this.disposables.add(new DisposableStore());
	private readonly renderDisposables = this.disposables.add(new DisposableStore());

	constructor(
		private readonly container: HTMLElement,
		private readonly delegate: IViewWelcomeDelegate,
		@IInstantiationService private instantiationService: IInstantiationService,
		@IOpenerService protected openerService: IOpenerService,
		@IContextKeyService private contextKeyService: IContextKeyService,
		@ILifecycleService lifecycleService: ILifecycleService
	) {
		this.disposables.add(Event.runAndSubscribe(this.delegate.onDidChangeViewWelcomeState, () => this.onDidChangeViewWelcomeState()));
		this.disposables.add(lifecycleService.onWillShutdown(() => this.dispose())); // Fixes https://github.com/microsoft/vscode/issues/208878
	}

	layout(height: number, width: number) {
		if (!this._enabled) {
			return;
		}

		this.element!.style.height = `${height}px`;
		this.element!.style.width = `${width}px`;
		this.element!.classList.toggle('wide', width > 640);
		this.scrollableElement!.scanDomNode();
	}

	focus() {
		if (!this._enabled) {
			return;
		}

		this.element!.focus();
	}

	private onDidChangeViewWelcomeState(): void {
		const enabled = this.delegate.shouldShowWelcome();

		if (this._enabled === enabled) {
			return;
		}

		this._enabled = enabled;

		if (!enabled) {
			this.enabledDisposables.clear();
			return;
		}

		this.container.classList.add('welcome');
		const viewWelcomeContainer = append(this.container, $('.welcome-view'));
		this.element = $('.welcome-view-content', { tabIndex: 0 });
		this.scrollableElement = new DomScrollableElement(this.element, { alwaysConsumeMouseWheel: true, horizontal: ScrollbarVisibility.Hidden, vertical: ScrollbarVisibility.Visible, });
		append(viewWelcomeContainer, this.scrollableElement.getDomNode());

		this.enabledDisposables.add(toDisposable(() => {
			this.container.classList.remove('welcome');
			this.scrollableElement!.dispose();
			viewWelcomeContainer.remove();
			this.scrollableElement = undefined;
			this.element = undefined;
		}));

		this.contextKeyService.onDidChangeContext(this.onDidChangeContext, this, this.enabledDisposables);
		Event.chain(viewsRegistry.onDidChangeViewWelcomeContent, $ => $.filter(id => id === this.delegate.id))
			(this.onDidChangeViewWelcomeContent, this, this.enabledDisposables);
		this.onDidChangeViewWelcomeContent();
	}

	private onDidChangeViewWelcomeContent(): void {
		const descriptors = viewsRegistry.getViewWelcomeContent(this.delegate.id);

		this.items = [];

		for (const descriptor of descriptors) {
			if (descriptor.when === 'default') {
				this.defaultItem = { descriptor, visible: true };
			} else {
				const visible = descriptor.when ? this.contextKeyService.contextMatchesRules(descriptor.when) : true;
				this.items.push({ descriptor, visible });
			}
		}

		this.render();
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
			this.render();
		}
	}

	private render(): void {
		this.renderDisposables.clear();
		this.element!.innerText = '';

		const contents = this.getContentDescriptors();

		if (contents.length === 0) {
			this.container.classList.remove('welcome');
			this.scrollableElement!.scanDomNode();
			return;
		}

		let buttonsCount = 0;
		for (const { content, precondition, renderSecondaryButtons } of contents) {
			const lines = content.split('\n');

			for (let line of lines) {
				line = line.trim();

				if (!line) {
					continue;
				}

				const linkedText = parseLinkedText(line);

				if (linkedText.nodes.length === 1 && typeof linkedText.nodes[0] !== 'string') {
					const node = linkedText.nodes[0];
					const buttonContainer = append(this.element!, $('.button-container'));
					const button = new Button(buttonContainer, { title: node.title, supportIcons: true, secondary: renderSecondaryButtons && buttonsCount > 0 ? true : false, ...defaultButtonStyles, });
					button.label = node.label;
					button.onDidClick(_ => {
						this.openerService.open(node.href, { allowCommands: true });
					}, null, this.renderDisposables);
					this.renderDisposables.add(button);
					buttonsCount++;

					if (precondition) {
						const updateEnablement = () => button.enabled = this.contextKeyService.contextMatchesRules(precondition);
						updateEnablement();

						const keys = new Set(precondition.keys());
						const onDidChangeContext = Event.filter(this.contextKeyService.onDidChangeContext, e => e.affectsSome(keys));
						onDidChangeContext(updateEnablement, null, this.renderDisposables);
					}
				} else {
					const p = append(this.element!, $('p'));

					for (const node of linkedText.nodes) {
						if (typeof node === 'string') {
							append(p, ...renderLabelWithIcons(node));
						} else {
							const link = this.renderDisposables.add(this.instantiationService.createInstance(Link, p, node, {}));

							if (precondition && node.href.startsWith('command:')) {
								const updateEnablement = () => link.enabled = this.contextKeyService.contextMatchesRules(precondition);
								updateEnablement();

								const keys = new Set(precondition.keys());
								const onDidChangeContext = Event.filter(this.contextKeyService.onDidChangeContext, e => e.affectsSome(keys));
								onDidChangeContext(updateEnablement, null, this.renderDisposables);
							}
						}
					}
				}
			}
		}

		this.container.classList.add('welcome');
		this.scrollableElement!.scanDomNode();
	}

	private getContentDescriptors(): IViewContentDescriptor[] {
		const visibleItems = this.items.filter(v => v.visible);

		if (visibleItems.length === 0 && this.defaultItem) {
			return [this.defaultItem.descriptor];
		}

		return visibleItems.map(v => v.descriptor);
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

	private _singleViewPaneContainerTitle: string | undefined;
	public get singleViewPaneContainerTitle(): string | undefined {
		return this._singleViewPaneContainerTitle;
	}

	readonly menuActions: CompositeMenuActions;

	private progressBar!: ProgressBar;
	private progressIndicator!: IProgressIndicator;

	private toolbar?: WorkbenchToolBar;
	private readonly showActions: ViewPaneShowActions;
	private headerContainer?: HTMLElement;
	private titleContainer?: HTMLElement;
	private titleContainerHover?: IManagedHover;
	private titleDescriptionContainer?: HTMLElement;
	private titleDescriptionContainerHover?: IManagedHover;
	private iconContainer?: HTMLElement;
	private iconContainerHover?: IManagedHover;
	protected twistiesContainer?: HTMLElement;
	private viewWelcomeController!: ViewWelcomeController;

	private readonly headerActionViewItems: DisposableMap<string, IActionViewItem> = this._register(new DisposableMap());

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
		@IHoverService protected readonly hoverService: IHoverService,
		protected readonly accessibleViewInformationService?: IAccessibleViewInformationService
	) {
		super({ ...options, ...{ orientation: viewDescriptorService.getViewLocationById(options.id) === ViewContainerLocation.Panel ? Orientation.HORIZONTAL : Orientation.VERTICAL } });

		this.id = options.id;
		this._title = options.title;
		this._titleDescription = options.titleDescription;
		this._singleViewPaneContainerTitle = options.singleViewPaneContainerTitle;
		this.showActions = options.showActions ?? ViewPaneShowActions.Default;

		this.scopedContextKeyService = this._register(contextKeyService.createScoped(this.element));
		this.scopedContextKeyService.createKey('view', this.id);
		const viewLocationKey = this.scopedContextKeyService.createKey('viewLocation', ViewContainerLocationToString(viewDescriptorService.getViewLocationById(this.id)!));
		this._register(Event.filter(viewDescriptorService.onDidChangeLocation, e => e.views.some(view => view.id === this.id))(() => viewLocationKey.set(ViewContainerLocationToString(viewDescriptorService.getViewLocationById(this.id)!))));

		const childInstantiationService = this._register(this.instantiationService.createChild(new ServiceCollection([IContextKeyService, this.scopedContextKeyService])));
		this.menuActions = this._register(childInstantiationService.createInstance(CompositeMenuActions, options.titleMenuId ?? MenuId.ViewTitle, MenuId.ViewTitleContext, { shouldForwardArgs: !options.donotForwardArgs, renderShortTitle: true }));
		this._register(this.menuActions.onDidChange(() => this.updateActions()));
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
		this.updateTwistyIcon();
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

		this.twistiesContainer = append(container, $(`.twisty-container${ThemeIcon.asCSSSelector(this.getTwistyIcon(this.isExpanded()))}`));

		this.renderHeaderTitle(container, this.title);

		const actions = append(container, $('.actions'));
		actions.classList.toggle('show-always', this.showActions === ViewPaneShowActions.Always);
		actions.classList.toggle('show-expanded', this.showActions === ViewPaneShowActions.WhenExpanded);
		this.toolbar = this.instantiationService.createInstance(WorkbenchToolBar, actions, {
			orientation: ActionsOrientation.HORIZONTAL,
			actionViewItemProvider: (action, options) => {
				const item = this.createActionViewItem(action, options);
				if (item) {
					this.headerActionViewItems.set(item.action.id, item);
				}
				return item;
			},
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

	protected override updateHeader(): void {
		super.updateHeader();
		this.updateTwistyIcon();
	}

	private updateTwistyIcon(): void {
		if (this.twistiesContainer) {
			this.twistiesContainer.classList.remove(...ThemeIcon.asClassNameArray(this.getTwistyIcon(!this._expanded)));
			this.twistiesContainer.classList.add(...ThemeIcon.asClassNameArray(this.getTwistyIcon(this._expanded)));
		}
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
		this.titleContainer = append(container, $('h3.title', {}, calculatedTitle));
		this.titleContainerHover = this._register(this.hoverService.setupManagedHover(getDefaultHoverDelegate('mouse'), this.titleContainer, calculatedTitle));

		if (this._titleDescription) {
			this.setTitleDescription(this._titleDescription);
		}

		this.iconContainerHover = this._register(this.hoverService.setupManagedHover(getDefaultHoverDelegate('mouse'), this.iconContainer, calculatedTitle));
		this.iconContainer.setAttribute('aria-label', this._getAriaLabel(calculatedTitle));
	}

	private _getAriaLabel(title: string): string {
		const viewHasAccessibilityHelpContent = this.viewDescriptorService.getViewDescriptorById(this.id)?.accessibilityHelpContent;
		const accessibleViewHasShownForView = this.accessibleViewInformationService?.hasShownAccessibleView(this.id);
		if (!viewHasAccessibilityHelpContent || accessibleViewHasShownForView) {
			return title;
		}

		return nls.localize('viewAccessibilityHelp', 'Use Alt+F1 for accessibility help {0}', title);
	}

	protected updateTitle(title: string): void {
		const calculatedTitle = this.calculateTitle(title);
		if (this.titleContainer) {
			this.titleContainer.textContent = calculatedTitle;
			this.titleContainerHover?.update(calculatedTitle);
		}

		const ariaLabel = this._getAriaLabel(calculatedTitle);
		if (this.iconContainer) {
			this.iconContainerHover?.update(calculatedTitle);
			this.iconContainer.setAttribute('aria-label', ariaLabel);
		}
		this.ariaHeaderLabel = this.getAriaHeaderLabel(ariaLabel);

		this._title = title;
		this._onDidChangeTitleArea.fire();
	}

	private setTitleDescription(description: string | undefined) {
		if (this.titleDescriptionContainer) {
			this.titleDescriptionContainer.textContent = description ?? '';
			this.titleDescriptionContainerHover?.update(description ?? '');
		}
		else if (description && this.titleContainer) {
			this.titleDescriptionContainer = after(this.titleContainer, $('span.description', {}, description));
			this.titleDescriptionContainerHover = this._register(this.hoverService.setupManagedHover(getDefaultHoverDelegate('mouse'), this.titleDescriptionContainer, description));
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

	protected renderBody(container: HTMLElement): void {
		this.viewWelcomeController = this._register(this.instantiationService.createInstance(ViewWelcomeController, container, this));
	}

	protected layoutBody(height: number, width: number): void {
		this.viewWelcomeController.layout(height, width);
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
			this.progressIndicator = this._register(new ScopedProgressIndicator(assertIsDefined(this.progressBar), new class extends AbstractProgressScope {
				constructor() {
					super(that.id, that.isBodyVisible());
					this._register(that.onDidChangeBodyVisibility(isVisible => isVisible ? this.onScopeOpened(that.id) : this.onScopeClosed(that.id)));
				}
			}()));
		}
		return this.progressIndicator;
	}

	protected getProgressLocation(): string {
		return this.viewDescriptorService.getViewContainerByViewId(this.id)!.id;
	}

	protected getLocationBasedColors(): IViewPaneLocationColors {
		return getLocationBasedViewColors(this.viewDescriptorService.getViewLocationById(this.id));
	}

	focus(): void {
		if (this.viewWelcomeController.enabled) {
			this.viewWelcomeController.focus();
		} else if (this.element) {
			this.element.focus();
		}
		if (isActiveElement(this.element) || isAncestorOfActiveElement(this.element)) {
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

	createActionViewItem(action: IAction, options?: IDropdownMenuActionViewItemOptions): IActionViewItem | undefined {
		if (action.id === VIEWPANE_FILTER_ACTION.id) {
			const that = this;
			return new class extends BaseActionViewItem {
				constructor() { super(null, action); }
				override setFocusable(): void { /* noop input elements are focusable by default */ }
				override get trapsArrowNavigation(): boolean { return true; }
				override render(container: HTMLElement): void {
					container.classList.add('viewpane-filter-container');
					const filter = that.getFilterWidget()!;
					append(container, filter.element);
					filter.relayout();
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
		@IHoverService hoverService: IHoverService,
		accessibleViewService?: IAccessibleViewInformationService
	) {
		super(options, keybindingService, contextMenuService, configurationService, contextKeyService, viewDescriptorService, instantiationService, openerService, themeService, hoverService, accessibleViewService);
		const childInstantiationService = this._register(instantiationService.createChild(new ServiceCollection([IContextKeyService, this.scopedContextKeyService])));
		this.filterWidget = this._register(childInstantiationService.createInstance(FilterWidget, options.filterOptions));
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

export interface IViewPaneLocationColors {
	background: string;
	overlayBackground: string;
	listOverrideStyles: PartialExcept<IListStyles, 'listBackground' | 'treeStickyScrollBackground'>;
}

export function getLocationBasedViewColors(location: ViewContainerLocation | null): IViewPaneLocationColors {
	let background, overlayBackground, stickyScrollBackground, stickyScrollBorder, stickyScrollShadow;

	switch (location) {
		case ViewContainerLocation.Panel:
			background = PANEL_BACKGROUND;
			overlayBackground = PANEL_SECTION_DRAG_AND_DROP_BACKGROUND;
			stickyScrollBackground = PANEL_STICKY_SCROLL_BACKGROUND;
			stickyScrollBorder = PANEL_STICKY_SCROLL_BORDER;
			stickyScrollShadow = PANEL_STICKY_SCROLL_SHADOW;
			break;

		case ViewContainerLocation.Sidebar:
		case ViewContainerLocation.AuxiliaryBar:
		default:
			background = SIDE_BAR_BACKGROUND;
			overlayBackground = SIDE_BAR_DRAG_AND_DROP_BACKGROUND;
			stickyScrollBackground = SIDE_BAR_STICKY_SCROLL_BACKGROUND;
			stickyScrollBorder = SIDE_BAR_STICKY_SCROLL_BORDER;
			stickyScrollShadow = SIDE_BAR_STICKY_SCROLL_SHADOW;
	}

	return {
		background,
		overlayBackground,
		listOverrideStyles: {
			listBackground: background,
			treeStickyScrollBackground: stickyScrollBackground,
			treeStickyScrollBorder: stickyScrollBorder,
			treeStickyScrollShadow: stickyScrollShadow
		}
	};
}

export abstract class ViewAction<T extends IView> extends Action2 {
	override readonly desc: Readonly<IAction2Options> & { viewId: string };
	constructor(desc: Readonly<IAction2Options> & { viewId: string }) {
		super(desc);
		this.desc = desc;
	}

	run(accessor: ServicesAccessor, ...args: any[]): unknown {
		const view = accessor.get(IViewsService).getActiveViewWithId(this.desc.viewId);
		if (view) {
			return this.runInView(accessor, <T>view, ...args);
		}
		return undefined;
	}

	abstract runInView(accessor: ServicesAccessor, view: T, ...args: any[]): unknown;
}
