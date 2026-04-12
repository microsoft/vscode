/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var ViewPane_1;
import './media/paneviewlet.css';
import * as nls from '../../../../nls.js';
import { Event, Emitter } from '../../../../base/common/event.js';
import { asCssVariable, foreground } from '../../../../platform/theme/common/colorRegistry.js';
import { after, append, $, trackFocus, EventType, addDisposableListener, Dimension, reset, isAncestorOfActiveElement, isActiveElement } from '../../../../base/browser/dom.js';
import { createCSSRule } from '../../../../base/browser/domStylesheets.js';
import { asCssValueWithDefault, asCSSUrl } from '../../../../base/browser/cssValue.js';
import { DisposableMap, DisposableStore, toDisposable } from '../../../../base/common/lifecycle.js';
import { Action } from '../../../../base/common/actions.js';
import { prepareActions } from '../../../../base/browser/ui/actionbar/actionbar.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { IContextMenuService } from '../../../../platform/contextview/browser/contextView.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { Pane } from '../../../../base/browser/ui/splitview/paneview.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { Extensions as ViewContainerExtensions, IViewDescriptorService, defaultViewIcon, ViewContainerLocationToString } from '../../../common/views.js';
import { IViewsService } from '../../../services/views/common/viewsService.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { assertReturnsDefined } from '../../../../base/common/types.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { MenuId, Action2, SubmenuItemAction } from '../../../../platform/actions/common/actions.js';
import { createActionViewItem } from '../../../../platform/actions/browser/menuEntryActionViewItem.js';
import { parseLinkedText } from '../../../../base/common/linkedText.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { Button } from '../../../../base/browser/ui/button/button.js';
import { Link } from '../../../../platform/opener/browser/link.js';
import { ProgressBar } from '../../../../base/browser/ui/progressbar/progressbar.js';
import { AbstractProgressScope, ScopedProgressIndicator } from '../../../services/progress/browser/progressIndicator.js';
import { DomScrollableElement } from '../../../../base/browser/ui/scrollbar/scrollableElement.js';
import { URI } from '../../../../base/common/uri.js';
import { registerIcon } from '../../../../platform/theme/common/iconRegistry.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { WorkbenchToolBar } from '../../../../platform/actions/browser/toolbar.js';
import { FilterWidget } from './viewFilter.js';
import { BaseActionViewItem } from '../../../../base/browser/ui/actionbar/actionViewItems.js';
import { ServiceCollection } from '../../../../platform/instantiation/common/serviceCollection.js';
import { defaultButtonStyles, defaultProgressBarStyles } from '../../../../platform/theme/browser/defaultStyles.js';
import { getDefaultHoverDelegate } from '../../../../base/browser/ui/hover/hoverDelegateFactory.js';
import { ILifecycleService } from '../../../services/lifecycle/common/lifecycle.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { PANEL_BACKGROUND, PANEL_SECTION_DRAG_AND_DROP_BACKGROUND, PANEL_STICKY_SCROLL_BACKGROUND, PANEL_STICKY_SCROLL_BORDER, PANEL_STICKY_SCROLL_SHADOW, SIDE_BAR_BACKGROUND, SIDE_BAR_DRAG_AND_DROP_BACKGROUND, SIDE_BAR_STICKY_SCROLL_BACKGROUND, SIDE_BAR_STICKY_SCROLL_BORDER, SIDE_BAR_STICKY_SCROLL_SHADOW } from '../../../common/theme.js';
import { renderLabelWithIcons } from '../../../../base/browser/ui/iconLabel/iconLabels.js';
import { ViewMenuActions } from './viewMenuActions.js';
export var ViewPaneShowActions;
(function (ViewPaneShowActions) {
    /** Show the actions when the view is hovered. This is the default behavior. */
    ViewPaneShowActions[ViewPaneShowActions["Default"] = 0] = "Default";
    /** Always shows the actions when the view is expanded */
    ViewPaneShowActions[ViewPaneShowActions["WhenExpanded"] = 1] = "WhenExpanded";
    /** Always shows the actions */
    ViewPaneShowActions[ViewPaneShowActions["Always"] = 2] = "Always";
})(ViewPaneShowActions || (ViewPaneShowActions = {}));
export const VIEWPANE_FILTER_ACTION = new Action('viewpane.action.filter');
const viewPaneContainerExpandedIcon = registerIcon('view-pane-container-expanded', Codicon.chevronDown, nls.localize('viewPaneContainerExpandedIcon', 'Icon for an expanded view pane container.'));
const viewPaneContainerCollapsedIcon = registerIcon('view-pane-container-collapsed', Codicon.chevronRight, nls.localize('viewPaneContainerCollapsedIcon', 'Icon for a collapsed view pane container.'));
const viewsRegistry = Registry.as(ViewContainerExtensions.ViewsRegistry);
let ViewWelcomeController = class ViewWelcomeController {
    get enabled() { return this._enabled; }
    constructor(container, delegate, instantiationService, openerService, contextKeyService, lifecycleService) {
        this.container = container;
        this.delegate = delegate;
        this.instantiationService = instantiationService;
        this.openerService = openerService;
        this.contextKeyService = contextKeyService;
        this.items = [];
        this._enabled = false;
        this._wide = false;
        this.disposables = new DisposableStore();
        this.enabledDisposables = this.disposables.add(new DisposableStore());
        this.renderDisposables = this.disposables.add(new DisposableStore());
        this.disposables.add(Event.runAndSubscribe(this.delegate.onDidChangeViewWelcomeState, () => this.onDidChangeViewWelcomeState()));
        this.disposables.add(lifecycleService.onWillShutdown(() => this.dispose())); // Fixes https://github.com/microsoft/vscode/issues/208878
    }
    layout(height, width) {
        if (!this._enabled) {
            return;
        }
        this.element.style.height = `${height}px`;
        this.element.style.width = `${width}px`;
        this._wide = width > 640;
        this.element.classList.toggle('wide', this._wide);
        this.scrollableElement.scanDomNode();
    }
    focus() {
        if (!this._enabled) {
            return;
        }
        this.element.focus();
    }
    onDidChangeViewWelcomeState() {
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
        this.element = $('.welcome-view-content', { tabIndex: 0, role: 'region', 'aria-label': nls.localize('welcomeViewAriaLabel', "Welcome") });
        if (this._wide) {
            this.element.classList.add('wide');
        }
        this.scrollableElement = new DomScrollableElement(this.element, { alwaysConsumeMouseWheel: true, horizontal: 2 /* ScrollbarVisibility.Hidden */, vertical: 3 /* ScrollbarVisibility.Visible */, });
        append(viewWelcomeContainer, this.scrollableElement.getDomNode());
        this.enabledDisposables.add(toDisposable(() => {
            this.container.classList.remove('welcome');
            this.scrollableElement.dispose();
            viewWelcomeContainer.remove();
            this.scrollableElement = undefined;
            this.element = undefined;
        }));
        this.contextKeyService.onDidChangeContext(this.onDidChangeContext, this, this.enabledDisposables);
        Event.chain(viewsRegistry.onDidChangeViewWelcomeContent, $ => $.filter(id => id === this.delegate.id))(this.onDidChangeViewWelcomeContent, this, this.enabledDisposables);
        this.onDidChangeViewWelcomeContent();
    }
    onDidChangeViewWelcomeContent() {
        const descriptors = viewsRegistry.getViewWelcomeContent(this.delegate.id);
        this.items = [];
        for (const descriptor of descriptors) {
            if (descriptor.when === 'default') {
                this.defaultItem = { descriptor, visible: true };
            }
            else {
                const visible = descriptor.when ? this.contextKeyService.contextMatchesRules(descriptor.when) : true;
                this.items.push({ descriptor, visible });
            }
        }
        this.render();
    }
    onDidChangeContext() {
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
    render() {
        this.renderDisposables.clear();
        this.element.textContent = '';
        const contents = this.getContentDescriptors();
        if (contents.length === 0) {
            this.container.classList.remove('welcome');
            this.scrollableElement.scanDomNode();
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
                    const buttonContainer = append(this.element, $('.button-container'));
                    const button = new Button(buttonContainer, { title: node.title, supportIcons: true, secondary: !!(renderSecondaryButtons && buttonsCount > 0), ...defaultButtonStyles, });
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
                }
                else {
                    const p = append(this.element, $('p'));
                    for (const node of linkedText.nodes) {
                        if (typeof node === 'string') {
                            append(p, ...renderLabelWithIcons(node));
                        }
                        else {
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
        this.scrollableElement.scanDomNode();
    }
    getContentDescriptors() {
        const visibleItems = this.items.filter(v => v.visible);
        if (visibleItems.length === 0 && this.defaultItem) {
            return [this.defaultItem.descriptor];
        }
        return visibleItems.map(v => v.descriptor);
    }
    dispose() {
        this.disposables.dispose();
    }
};
ViewWelcomeController = __decorate([
    __param(2, IInstantiationService),
    __param(3, IOpenerService),
    __param(4, IContextKeyService),
    __param(5, ILifecycleService)
], ViewWelcomeController);
let ViewPane = class ViewPane extends Pane {
    static { ViewPane_1 = this; }
    static { this.AlwaysShowActionsConfig = 'workbench.view.alwaysShowHeaderActions'; }
    get title() {
        return this._title;
    }
    get titleDescription() {
        return this._titleDescription;
    }
    get singleViewPaneContainerTitle() {
        return this._singleViewPaneContainerTitle;
    }
    constructor(options, keybindingService, contextMenuService, configurationService, contextKeyService, viewDescriptorService, instantiationService, openerService, themeService, hoverService, accessibleViewInformationService) {
        super({ ...options, ...{ orientation: viewDescriptorService.getViewLocationById(options.id) === 1 /* ViewContainerLocation.Panel */ ? 1 /* Orientation.HORIZONTAL */ : 0 /* Orientation.VERTICAL */ } });
        this.keybindingService = keybindingService;
        this.contextMenuService = contextMenuService;
        this.configurationService = configurationService;
        this.contextKeyService = contextKeyService;
        this.viewDescriptorService = viewDescriptorService;
        this.instantiationService = instantiationService;
        this.openerService = openerService;
        this.themeService = themeService;
        this.hoverService = hoverService;
        this.accessibleViewInformationService = accessibleViewInformationService;
        this._onDidFocus = this._register(new Emitter());
        this.onDidFocus = this._onDidFocus.event;
        this._onDidBlur = this._register(new Emitter());
        this.onDidBlur = this._onDidBlur.event;
        this._onDidChangeBodyVisibility = this._register(new Emitter());
        this.onDidChangeBodyVisibility = this._onDidChangeBodyVisibility.event;
        this._onDidChangeTitleArea = this._register(new Emitter());
        this.onDidChangeTitleArea = this._onDidChangeTitleArea.event;
        this._onDidChangeViewWelcomeState = this._register(new Emitter());
        this.onDidChangeViewWelcomeState = this._onDidChangeViewWelcomeState.event;
        this._isVisible = false;
        this.headerActionViewItems = this._register(new DisposableMap());
        this.id = options.id;
        this._title = options.title;
        this._titleDescription = options.titleDescription;
        this._singleViewPaneContainerTitle = options.singleViewPaneContainerTitle;
        this.showActions = options.showActions ?? ViewPaneShowActions.Default;
        this.scopedContextKeyService = this._register(contextKeyService.createScoped(this.element));
        this.scopedContextKeyService.createKey('view', this.id);
        const viewLocationKey = this.scopedContextKeyService.createKey('viewLocation', ViewContainerLocationToString(viewDescriptorService.getViewLocationById(this.id)));
        this._register(Event.filter(viewDescriptorService.onDidChangeLocation, e => e.views.some(view => view.id === this.id))(() => viewLocationKey.set(ViewContainerLocationToString(viewDescriptorService.getViewLocationById(this.id)))));
        const childInstantiationService = this._register(this.instantiationService.createChild(new ServiceCollection([IContextKeyService, this.scopedContextKeyService])));
        this.menuActions = this._register(childInstantiationService.createInstance(ViewMenuActions, options.titleMenuId ?? MenuId.ViewTitle, MenuId.ViewTitleContext, { shouldForwardArgs: !options.donotForwardArgs, renderShortTitle: true }));
        this._register(this.menuActions.onDidChange(() => this.updateActions()));
    }
    get headerVisible() {
        return super.headerVisible;
    }
    set headerVisible(visible) {
        super.headerVisible = visible;
        this.element.classList.toggle('merged-header', !visible);
    }
    setVisible(visible) {
        if (this._isVisible !== visible) {
            this._isVisible = visible;
            if (this.isExpanded()) {
                this._onDidChangeBodyVisibility.fire(visible);
            }
        }
    }
    isVisible() {
        return this._isVisible;
    }
    isBodyVisible() {
        return this._isVisible && this.isExpanded();
    }
    setExpanded(expanded) {
        const changed = super.setExpanded(expanded);
        if (changed) {
            this._onDidChangeBodyVisibility.fire(expanded);
        }
        this.updateTwistyIcon();
        return changed;
    }
    render() {
        super.render();
        const focusTracker = trackFocus(this.element);
        this._register(focusTracker);
        this._register(focusTracker.onDidFocus(() => this._onDidFocus.fire()));
        this._register(focusTracker.onDidBlur(() => this._onDidBlur.fire()));
    }
    renderHeader(container) {
        this.headerContainer = container;
        this.twistiesContainer = append(container, $(`.twisty-container${ThemeIcon.asCSSSelector(this.getTwistyIcon(this.isExpanded()))}`));
        this.renderHeaderTitle(container, this.title);
        const actions = append(container, $('.actions'));
        actions.classList.toggle('show-always', this.showActions === ViewPaneShowActions.Always);
        actions.classList.toggle('show-expanded', this.showActions === ViewPaneShowActions.WhenExpanded);
        this.toolbar = this.instantiationService.createInstance(WorkbenchToolBar, actions, {
            orientation: 0 /* ActionsOrientation.HORIZONTAL */,
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
        }
        else {
            console.error(`View container model not found for view ${this.id}`);
        }
        const onDidRelevantConfigurationChange = Event.filter(this.configurationService.onDidChangeConfiguration, e => e.affectsConfiguration(ViewPane_1.AlwaysShowActionsConfig));
        this._register(onDidRelevantConfigurationChange(this.updateActionsVisibility, this));
        this.updateActionsVisibility();
    }
    updateHeader() {
        super.updateHeader();
        this.updateTwistyIcon();
    }
    updateTwistyIcon() {
        if (this.twistiesContainer) {
            this.twistiesContainer.classList.remove(...ThemeIcon.asClassNameArray(this.getTwistyIcon(!this._expanded)));
            this.twistiesContainer.classList.add(...ThemeIcon.asClassNameArray(this.getTwistyIcon(this._expanded)));
        }
    }
    getTwistyIcon(expanded) {
        return expanded ? viewPaneContainerExpandedIcon : viewPaneContainerCollapsedIcon;
    }
    style(styles) {
        super.style(styles);
        const icon = this.getIcon();
        if (this.iconContainer) {
            const fgColor = asCssValueWithDefault(styles.headerForeground, asCssVariable(foreground));
            if (URI.isUri(icon)) {
                // Apply background color to activity bar item provided with iconUrls
                this.iconContainer.style.backgroundColor = fgColor;
                this.iconContainer.style.color = '';
            }
            else {
                // Apply foreground color to activity bar items provided with codicons
                this.iconContainer.style.color = fgColor;
                this.iconContainer.style.backgroundColor = '';
            }
        }
    }
    getIcon() {
        return this.viewDescriptorService.getViewDescriptorById(this.id)?.containerIcon || defaultViewIcon;
    }
    renderHeaderTitle(container, title) {
        this.iconContainer = append(container, $('.icon', undefined));
        const icon = this.getIcon();
        let cssClass = undefined;
        if (URI.isUri(icon)) {
            cssClass = `view-${this.id.replace(/[\.\:]/g, '-')}`;
            const iconClass = `.pane-header .icon.${cssClass}`;
            createCSSRule(iconClass, `
				mask: ${asCSSUrl(icon)} no-repeat 50% 50%;
				mask-size: 24px;
				-webkit-mask: ${asCSSUrl(icon)} no-repeat 50% 50%;
				-webkit-mask-size: 16px;
			`);
        }
        else if (ThemeIcon.isThemeIcon(icon)) {
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
        this.iconContainer.setAttribute('aria-label', this._getAriaLabel(calculatedTitle, this._titleDescription));
    }
    _getAriaLabel(title, description) {
        const viewHasAccessibilityHelpContent = this.viewDescriptorService.getViewDescriptorById(this.id)?.accessibilityHelpContent;
        const accessibleViewHasShownForView = this.accessibleViewInformationService?.hasShownAccessibleView(this.id);
        if (!viewHasAccessibilityHelpContent || accessibleViewHasShownForView) {
            if (description) {
                return `${title} - ${description}`;
            }
            else {
                return title;
            }
        }
        return nls.localize('viewAccessibilityHelp', 'Use Alt+F1 for accessibility help {0}', title);
    }
    updateTitle(title) {
        const calculatedTitle = this.calculateTitle(title);
        if (this.titleContainer) {
            this.titleContainer.textContent = calculatedTitle;
            this.titleContainerHover?.update(calculatedTitle);
        }
        this.updateAriaHeaderLabel(calculatedTitle, this._titleDescription);
        this._title = title;
        this._onDidChangeTitleArea.fire();
    }
    updateAriaHeaderLabel(title, description) {
        const ariaLabel = this._getAriaLabel(title, description);
        if (this.iconContainer) {
            this.iconContainerHover?.update(title);
            this.iconContainer.setAttribute('aria-label', ariaLabel);
        }
        this.ariaHeaderLabel = this.getAriaHeaderLabel(ariaLabel);
    }
    setTitleDescription(description) {
        if (this.titleDescriptionContainer) {
            this.titleDescriptionContainer.textContent = description ?? '';
            this.titleDescriptionContainerHover?.update(description ?? '');
        }
        else if (description && this.titleContainer) {
            this.titleDescriptionContainer = after(this.titleContainer, $('span.description', {}, description));
            this.titleDescriptionContainerHover = this._register(this.hoverService.setupManagedHover(getDefaultHoverDelegate('mouse'), this.titleDescriptionContainer, description));
        }
    }
    updateTitleDescription(description) {
        this.setTitleDescription(description);
        this.updateAriaHeaderLabel(this._title, description);
        this._titleDescription = description;
        this._onDidChangeTitleArea.fire();
    }
    calculateTitle(title) {
        const viewContainer = this.viewDescriptorService.getViewContainerByViewId(this.id);
        const model = this.viewDescriptorService.getViewContainerModel(viewContainer);
        const viewDescriptor = this.viewDescriptorService.getViewDescriptorById(this.id);
        const isDefault = this.viewDescriptorService.getDefaultContainerById(this.id) === viewContainer;
        if (!isDefault && viewDescriptor?.containerTitle && model.title !== viewDescriptor.containerTitle && title !== viewDescriptor.containerTitle) {
            return `${viewDescriptor.containerTitle}: ${title}`;
        }
        return title;
    }
    renderBody(container) {
        this.viewWelcomeController = this._register(this.instantiationService.createInstance(ViewWelcomeController, container, this));
    }
    layoutBody(height, width) {
        this.viewWelcomeController?.layout(height, width);
    }
    onDidScrollRoot() {
        // noop
    }
    getProgressIndicator() {
        if (this.progressBar === undefined) {
            this.progressBar = this._register(new ProgressBar(this.element, defaultProgressBarStyles));
            this.progressBar.hide();
        }
        if (this.progressIndicator === undefined) {
            const that = this;
            this.progressIndicator = this._register(new ScopedProgressIndicator(assertReturnsDefined(this.progressBar), this._register(new class extends AbstractProgressScope {
                constructor() {
                    super(that.id, that.isBodyVisible());
                    this._register(that.onDidChangeBodyVisibility(isVisible => isVisible ? this.onScopeOpened(that.id) : this.onScopeClosed(that.id)));
                }
            }())));
        }
        return this.progressIndicator;
    }
    getProgressLocation() {
        return this.viewDescriptorService.getViewContainerByViewId(this.id).id;
    }
    getLocationBasedColors() {
        return getLocationBasedViewColors(this.viewDescriptorService.getViewLocationById(this.id));
    }
    focus() {
        if (this.viewWelcomeController?.enabled) {
            this.viewWelcomeController.focus();
        }
        else if (this.element) {
            this.element.focus();
        }
        if (isActiveElement(this.element) || isAncestorOfActiveElement(this.element)) {
            this._onDidFocus.fire();
        }
    }
    setActions() {
        if (this.toolbar) {
            const primaryActions = [...this.menuActions.getPrimaryActions()];
            if (this.shouldShowFilterInHeader()) {
                primaryActions.unshift(VIEWPANE_FILTER_ACTION);
            }
            this.toolbar.setActions(prepareActions(primaryActions), prepareActions(this.menuActions.getSecondaryActions()));
            this.toolbar.context = this.getActionsContext();
        }
    }
    updateActionsVisibility() {
        if (!this.headerContainer) {
            return;
        }
        const shouldAlwaysShowActions = this.configurationService.getValue('workbench.view.alwaysShowHeaderActions');
        this.headerContainer.classList.toggle('actions-always-visible', shouldAlwaysShowActions);
    }
    updateActions() {
        this.setActions();
        this._onDidChangeTitleArea.fire();
    }
    createActionViewItem(action, options) {
        if (action.id === VIEWPANE_FILTER_ACTION.id) {
            const that = this;
            return new class extends BaseActionViewItem {
                constructor() { super(null, action); }
                setFocusable() { }
                get trapsArrowNavigation() { return true; }
                render(container) {
                    container.classList.add('viewpane-filter-container');
                    const filter = that.getFilterWidget();
                    append(container, filter.element);
                    filter.relayout();
                }
            };
        }
        return createActionViewItem(this.instantiationService, action, { ...options, ...{ menuAsChild: action instanceof SubmenuItemAction } });
    }
    getActionsContext() {
        return undefined;
    }
    getActionRunner() {
        return undefined;
    }
    getOptimalWidth() {
        return 0;
    }
    saveState() {
        // Subclasses to implement for saving state
    }
    shouldShowWelcome() {
        return false;
    }
    getFilterWidget() {
        return undefined;
    }
    shouldShowFilterInHeader() {
        return false;
    }
};
ViewPane = ViewPane_1 = __decorate([
    __param(1, IKeybindingService),
    __param(2, IContextMenuService),
    __param(3, IConfigurationService),
    __param(4, IContextKeyService),
    __param(5, IViewDescriptorService),
    __param(6, IInstantiationService),
    __param(7, IOpenerService),
    __param(8, IThemeService),
    __param(9, IHoverService)
], ViewPane);
export { ViewPane };
let FilterViewPane = class FilterViewPane extends ViewPane {
    constructor(options, keybindingService, contextMenuService, configurationService, contextKeyService, viewDescriptorService, instantiationService, openerService, themeService, hoverService, accessibleViewService) {
        super(options, keybindingService, contextMenuService, configurationService, contextKeyService, viewDescriptorService, instantiationService, openerService, themeService, hoverService, accessibleViewService);
        const childInstantiationService = this._register(instantiationService.createChild(new ServiceCollection([IContextKeyService, this.scopedContextKeyService])));
        this.filterWidget = this._register(childInstantiationService.createInstance(FilterWidget, options.filterOptions));
        this._register(this.filterWidget.onDidAcceptFilterText(() => this.focusBodyContent()));
    }
    getFilterWidget() {
        return this.filterWidget;
    }
    renderBody(container) {
        super.renderBody(container);
        this.filterContainer = append(container, $('.viewpane-filter-container'));
    }
    layoutBody(height, width) {
        super.layoutBody(height, width);
        this.dimension = new Dimension(width, height);
        const wasFilterShownInHeader = !this.filterContainer?.hasChildNodes();
        const shouldShowFilterInHeader = this.shouldShowFilterInHeader();
        if (wasFilterShownInHeader !== shouldShowFilterInHeader) {
            if (shouldShowFilterInHeader) {
                reset(this.filterContainer);
            }
            this.updateActions();
            if (!shouldShowFilterInHeader) {
                append(this.filterContainer, this.filterWidget.element);
            }
        }
        if (!shouldShowFilterInHeader) {
            height = height - 44;
        }
        this.filterWidget.layout(width);
        this.layoutBodyContent(height, width);
    }
    shouldShowFilterInHeader() {
        return !(this.dimension && this.dimension.width < 600 && this.dimension.height > 100);
    }
    focusBodyContent() {
        this.focus();
    }
};
FilterViewPane = __decorate([
    __param(1, IKeybindingService),
    __param(2, IContextMenuService),
    __param(3, IConfigurationService),
    __param(4, IContextKeyService),
    __param(5, IViewDescriptorService),
    __param(6, IInstantiationService),
    __param(7, IOpenerService),
    __param(8, IThemeService),
    __param(9, IHoverService)
], FilterViewPane);
export { FilterViewPane };
export function getLocationBasedViewColors(location) {
    let background, overlayBackground, stickyScrollBackground, stickyScrollBorder, stickyScrollShadow;
    switch (location) {
        case 1 /* ViewContainerLocation.Panel */:
            background = PANEL_BACKGROUND;
            overlayBackground = PANEL_SECTION_DRAG_AND_DROP_BACKGROUND;
            stickyScrollBackground = PANEL_STICKY_SCROLL_BACKGROUND;
            stickyScrollBorder = PANEL_STICKY_SCROLL_BORDER;
            stickyScrollShadow = PANEL_STICKY_SCROLL_SHADOW;
            break;
        case 0 /* ViewContainerLocation.Sidebar */:
        case 2 /* ViewContainerLocation.AuxiliaryBar */:
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
export class ViewAction extends Action2 {
    constructor(desc) {
        super(desc);
        this.desc = desc;
    }
    run(accessor, ...args) {
        const view = accessor.get(IViewsService).getActiveViewWithId(this.desc.viewId);
        if (view) {
            return this.runInView(accessor, view, ...args);
        }
        return undefined;
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidmlld1BhbmUuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvYnJvd3Nlci9wYXJ0cy92aWV3cy92aWV3UGFuZS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyx5QkFBeUIsQ0FBQztBQUNqQyxPQUFPLEtBQUssR0FBRyxNQUFNLG9CQUFvQixDQUFDO0FBQzFDLE9BQU8sRUFBRSxLQUFLLEVBQUUsT0FBTyxFQUFFLE1BQU0sa0NBQWtDLENBQUM7QUFDbEUsT0FBTyxFQUFFLGFBQWEsRUFBRSxVQUFVLEVBQUUsTUFBTSxvREFBb0QsQ0FBQztBQUMvRixPQUFPLEVBQUUsS0FBSyxFQUFFLE1BQU0sRUFBRSxDQUFDLEVBQUUsVUFBVSxFQUFFLFNBQVMsRUFBRSxxQkFBcUIsRUFBRSxTQUFTLEVBQUUsS0FBSyxFQUFFLHlCQUF5QixFQUFFLGVBQWUsRUFBRSxNQUFNLGlDQUFpQyxDQUFDO0FBQy9LLE9BQU8sRUFBRSxhQUFhLEVBQUUsTUFBTSw0Q0FBNEMsQ0FBQztBQUMzRSxPQUFPLEVBQUUscUJBQXFCLEVBQUUsUUFBUSxFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFDdkYsT0FBTyxFQUFFLGFBQWEsRUFBRSxlQUFlLEVBQUUsWUFBWSxFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFDcEcsT0FBTyxFQUFFLE1BQU0sRUFBMEIsTUFBTSxvQ0FBb0MsQ0FBQztBQUNwRixPQUFPLEVBQXVDLGNBQWMsRUFBRSxNQUFNLG9EQUFvRCxDQUFDO0FBQ3pILE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxrREFBa0QsQ0FBQztBQUM1RSxPQUFPLEVBQUUsa0JBQWtCLEVBQUUsTUFBTSxzREFBc0QsQ0FBQztBQUMxRixPQUFPLEVBQUUsbUJBQW1CLEVBQUUsTUFBTSx5REFBeUQsQ0FBQztBQUM5RixPQUFPLEVBQUUsYUFB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