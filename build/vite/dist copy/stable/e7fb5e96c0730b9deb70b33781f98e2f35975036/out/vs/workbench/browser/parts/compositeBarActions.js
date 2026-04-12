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
import { localize } from '../../../nls.js';
import { Action, Separator } from '../../../base/common/actions.js';
import { $, addDisposableListener, append, clearNode, EventHelper, EventType, getDomNodePagePosition, hide, show } from '../../../base/browser/dom.js';
import { ICommandService } from '../../../platform/commands/common/commands.js';
import { toDisposable, DisposableStore, MutableDisposable } from '../../../base/common/lifecycle.js';
import { IContextMenuService } from '../../../platform/contextview/browser/contextView.js';
import { IThemeService } from '../../../platform/theme/common/themeService.js';
import { NumberBadge, ProgressBadge, IconBadge } from '../../services/activity/common/activity.js';
import { IInstantiationService } from '../../../platform/instantiation/common/instantiation.js';
import { DelayedDragHandler } from '../../../base/browser/dnd.js';
import { IKeybindingService } from '../../../platform/keybinding/common/keybinding.js';
import { Emitter, Event } from '../../../base/common/event.js';
import { CompositeDragAndDropObserver, toggleDropEffect } from '../dnd.js';
import { BaseActionViewItem } from '../../../base/browser/ui/actionbar/actionViewItems.js';
import { Codicon } from '../../../base/common/codicons.js';
import { ThemeIcon } from '../../../base/common/themables.js';
import { IHoverService } from '../../../platform/hover/browser/hover.js';
import { IConfigurationService } from '../../../platform/configuration/common/configuration.js';
import { badgeBackground, badgeForeground, contrastBorder } from '../../../platform/theme/common/colorRegistry.js';
import { Action2 } from '../../../platform/actions/common/actions.js';
import { IPaneCompositePartService } from '../../services/panecomposite/browser/panecomposite.js';
import { createConfigureKeybindingAction } from '../../../platform/actions/common/menuService.js';
export class CompositeBarAction extends Action {
    constructor(item) {
        super(item.id, item.name, item.classNames?.join(' '), true);
        this.item = item;
        this._onDidChangeCompositeBarActionItem = this._register(new Emitter());
        this.onDidChangeCompositeBarActionItem = this._onDidChangeCompositeBarActionItem.event;
        this._onDidChangeActivity = this._register(new Emitter());
        this.onDidChangeActivity = this._onDidChangeActivity.event;
        this._activities = [];
    }
    get compositeBarActionItem() {
        return this.item;
    }
    set compositeBarActionItem(item) {
        this._label = item.name;
        this.item = item;
        this._onDidChangeCompositeBarActionItem.fire(this);
    }
    get activities() {
        return this._activities;
    }
    set activities(activities) {
        this._activities = activities;
        this._onDidChangeActivity.fire(activities);
    }
    activate() {
        if (!this.checked) {
            this._setChecked(true);
        }
    }
    deactivate() {
        if (this.checked) {
            this._setChecked(false);
        }
    }
}
let CompositeBarActionViewItem = class CompositeBarActionViewItem extends BaseActionViewItem {
    constructor(action, options, badgesEnabled, themeService, hoverService, configurationService, keybindingService) {
        super(null, action, options);
        this.badgesEnabled = badgesEnabled;
        this.themeService = themeService;
        this.hoverService = hoverService;
        this.configurationService = configurationService;
        this.keybindingService = keybindingService;
        this.badgeDisposable = this._register(new MutableDisposable());
        this.options = options;
        this._register(this.themeService.onDidColorThemeChange(this.onThemeChange, this));
        this._register(action.onDidChangeCompositeBarActionItem(() => this.update()));
        this._register(Event.filter(keybindingService.onDidUpdateKeybindings, () => this.keybindingLabel !== this.computeKeybindingLabel())(() => this.updateTitle()));
        this._register(action.onDidChangeActivity(() => this.updateActivity()));
    }
    get compositeBarActionItem() {
        return this._action.compositeBarActionItem;
    }
    updateStyles() {
        const theme = this.themeService.getColorTheme();
        const colors = this.options.colors(theme);
        if (this.label) {
            if (this.options.icon) {
                const foreground = this._action.checked ? colors.activeForegroundColor : colors.inactiveForegroundColor;
                if (this.compositeBarActionItem.iconUrl) {
                    // Apply background color to activity bar item provided with iconUrls
                    this.label.style.backgroundColor = foreground ? foreground.toString() : '';
                    this.label.style.color = '';
                }
                else {
                    // Apply foreground color to activity bar items provided with codicons
                    this.label.style.color = foreground ? foreground.toString() : '';
                    this.label.style.backgroundColor = '';
                }
            }
            else {
                const foreground = this._action.checked ? colors.activeForegroundColor : colors.inactiveForegroundColor;
                const borderBottomColor = this._action.checked ? colors.activeBorderBottomColor : null;
                this.label.style.color = foreground ? foreground.toString() : '';
                this.label.style.borderBottomColor = borderBottomColor ? borderBottomColor.toString() : '';
            }
            this.container.style.setProperty('--insert-border-color', colors.dragAndDropBorder ? colors.dragAndDropBorder.toString() : '');
        }
        // Badge
        if (this.badgeContent) {
            const badgeStyles = this.getActivities()[0]?.badge.getColors(theme);
            const badgeFg = badgeStyles?.badgeForeground ?? colors.badgeForeground ?? theme.getColor(badgeForeground);
            const badgeBg = badgeStyles?.badgeBackground ?? colors.badgeBackground ?? theme.getColor(badgeBackground);
            const contrastBorderColor = badgeStyles?.badgeBorder ?? theme.getColor(contrastBorder);
            this.badgeContent.style.color = badgeFg ? badgeFg.toString() : '';
            this.badgeContent.style.backgroundColor = badgeBg ? badgeBg.toString() : '';
            this.badgeContent.style.borderStyle = contrastBorderColor && !this.options.compact ? 'solid' : '';
            this.badgeContent.style.borderWidth = contrastBorderColor ? '1px' : '';
            this.badgeContent.style.borderColor = contrastBorderColor ? contrastBorderColor.toString() : '';
        }
    }
    render(container) {
        super.render(container);
        this.container = container;
        if (this.options.icon) {
            this.container.classList.add('icon');
        }
        // Use 'tab' inside tablist, 'button' for popup items outside tablist
        const role = this.options.isTabList || !this.options.hasPopup ? 'tab' : 'button';
        this.container.setAttribute('role', role);
        if (this.options.hasPopup) {
            this.container.setAttribute('aria-haspopup', 'true');
        }
        // Try hard to prevent keyboard only focus feedback when using mouse
        this._register(addDisposableListener(this.container, EventType.MOUSE_DOWN, () => {
            this.container.classList.add('clicked');
        }));
        this._register(addDisposableListener(this.container, EventType.MOUSE_UP, () => {
            if (this.mouseUpTimeout) {
                clearTimeout(this.mouseUpTimeout);
            }
            this.mouseUpTimeout = setTimeout(() => {
                this.container.classList.remove('clicked');
            }, 800); // delayed to prevent focus feedback from showing on mouse up
        }));
        this._register(this.hoverService.setupDelayedHover(this.container, () => ({
            content: this.computeTitle(),
            style: 1 /* HoverStyle.Pointer */,
            position: {
                hoverPosition: this.options.hoverOptions.position(),
            },
            persistence: {
                hideOnKeyDown: true,
            },
        }), { groupId: 'composite-bar-actions' }));
        // Label
        this.label = append(container, $('a'));
        // Badge
        this.badge = append(container, $('.badge'));
        this.badgeContent = append(this.badge, $('.badge-content'));
        // pane composite bar active border + background
        append(container, $('.active-item-indicator'));
        hide(this.badge);
        this.update();
        this.updateStyles();
        this.updateTitle();
    }
    onThemeChange(theme) {
        this.updateStyles();
    }
    update() {
        this.updateLabel();
        this.updateActivity();
        this.updateTitle();
        this.updateStyles();
    }
    getActivities() {
        if (this._action instanceof CompositeBarAction) {
            return this._action.activities;
        }
        return [];
    }
    updateActivity() {
        if (!this.badge || !this.badgeContent || !(this._action instanceof CompositeBarAction)) {
            return;
        }
        const { badges, type } = this.getVisibleBadges(this.getActivities());
        this.badgeDisposable.value = new DisposableStore();
        clearNode(this.badgeContent);
        hide(this.badge);
        const shouldRenderBadges = this.badgesEnabled(this.compositeBarActionItem.id);
        if (badges.length > 0 && shouldRenderBadges) {
            const classes = [];
            if (this.options.compact) {
                classes.push('compact');
            }
            // Progress
            if (type === 'progress') {
                show(this.badge);
                classes.push('progress-badge');
            }
            // Number
            else if (type === 'number') {
                const total = badges.reduce((r, b) => r + (b instanceof NumberBadge ? b.number : 0), 0);
                if (total > 0) {
                    let badgeNumber = total.toString();
                    if (total > 999) {
                        const noOfThousands = total / 1000;
                        const floor = Math.floor(noOfThousands);
                        badgeNumber = noOfThousands > floor ? `${floor}K+` : `${noOfThousands}K`;
                    }
                    if (this.options.compact && badgeNumber.length >= 3) {
                        classes.push('compact-content');
                    }
                    this.badgeContent.textContent = badgeNumber;
                    show(this.badge);
                }
            }
            // Icon
            else if (type === 'icon') {
                classes.push('icon-badge');
                const badgeContentClassess = ['icon-overlay', ...ThemeIcon.asClassNameArray(badges[0].icon)];
                this.badgeContent.classList.add(...badgeContentClassess);
                this.badgeDisposable.value.add(toDisposable(() => this.badgeContent?.classList.remove(...badgeContentClassess)));
                show(this.badge);
            }
            if (classes.length) {
                this.badge.classList.add(...classes);
                this.badgeDisposable.value.add(toDisposable(() => this.badge.classList.remove(...classes)));
            }
        }
        this.updateTitle();
        this.updateStyles();
    }
    getVisibleBadges(activities) {
        const progressBadges = activities.filter(activity => activity.badge instanceof ProgressBadge).map(activity => activity.badge);
        if (progressBadges.length > 0) {
            return { badges: progressBadges, type: 'progress' };
        }
        const iconBadges = activities.filter(activity => activity.badge instanceof IconBadge).map(activity => activity.badge);
        if (iconBadges.length > 0) {
            return { badges: iconBadges, type: 'icon' };
        }
        const numberBadges = activities.filter(activity => activity.badge instanceof NumberBadge).map(activity => activity.badge);
        if (numberBadges.length > 0) {
            return { badges: numberBadges, type: 'number' };
        }
        return { badges: [], type: undefined };
    }
    updateLabel() {
        this.label.className = 'action-label';
        if (this.compositeBarActionItem.classNames) {
            this.label.classList.add(...this.compositeBarActionItem.classNames);
        }
        if (!this.options.icon) {
            this.label.textContent = this.action.label;
        }
    }
    updateTitle() {
        const title = this.computeTitle();
        [this.label, this.badge, this.container].forEach(element => {
            if (element) {
                element.setAttribute('aria-label', title);
                element.setAttribute('title', '');
                element.removeAttribute('title');
            }
        });
    }
    computeTitle() {
        this.keybindingLabel = this.computeKeybindingLabel();
        let title = this.keybindingLabel ? localize('titleKeybinding', "{0} ({1})", this.compositeBarActionItem.name, this.keybindingLabel) : this.compositeBarActionItem.name;
        const badges = this.getVisibleBadges(this.action.activities).badges;
        for (const badge of badges) {
            const description = badge.getDescription();
            if (!description) {
                continue;
            }
            title = `${title} - ${badge.getDescription()}`;
        }
        return title;
    }
    computeKeybindingLabel() {
        const keybinding = this.compositeBarActionItem.keybindingId ? this.keybindingService.lookupKeybinding(this.compositeBarActionItem.keybindingId) : null;
        return keybinding?.getLabel();
    }
    dispose() {
        super.dispose();
        if (this.mouseUpTimeout) {
            clearTimeout(this.mouseUpTimeout);
        }
        this.badge.remove();
    }
};
CompositeBarActionViewItem = __decorate([
    __param(3, IThemeService),
    __param(4, IHoverService),
    __param(5, IConfigurationService),
    __param(6, IKeybindingService)
], CompositeBarActionViewItem);
export { CompositeBarActionViewItem };
export class CompositeOverflowActivityAction extends CompositeBarAction {
    constructor(showMenu) {
        super({
            id: 'additionalComposites.action',
            name: localize('additionalViews', "Additional Views"),
            classNames: ThemeIcon.asClassNameArray(Codicon.more)
        });
        this.showMenu = showMenu;
    }
    async run() {
        this.showMenu();
    }
}
let CompositeOverflowActivityActionViewItem = class CompositeOverflowActivityActionViewItem extends CompositeBarActionViewItem {
    constructor(action, getOverflowingComposites, getActiveCompositeId, getBadge, getCompositeOpenAction, colors, hoverOptions, contextMenuService, themeService, hoverService, configurationService, keybindingService) {
        super(action, { icon: true, colors, hasPopup: true, hoverOptions, isTabList: true }, () => true, themeService, hoverService, configurationService, keybindingService);
        this.getOverflowingComposites = getOverflowingComposites;
        this.getActiveCompositeId = getActiveCompositeId;
        this.getBadge = getBadge;
        this.getCompositeOpenAction = getCompositeOpenAction;
        this.contextMenuService = contextMenuService;
    }
    showMenu() {
        this.contextMenuService.showContextMenu({
            getAnchor: () => this.container,
            getActions: () => this.getActions(),
            getCheckedActionsRepresentation: () => 'radio',
        });
    }
    getActions() {
        return this.getOverflowingComposites().map(composite => {
            const action = this.getCompositeOpenAction(composite.id);
            action.checked = this.getActiveCompositeId() === action.id;
            const badge = this.getBadge(composite.id);
            let suffix;
            if (badge instanceof NumberBadge) {
                suffix = badge.number;
            }
            if (suffix) {
                action.label = localize('numberBadge', "{0} ({1})", composite.name, suffix);
            }
            else {
                action.label = composite.name || '';
            }
            return action;
        });
    }
};
CompositeOverflowActivityActionViewItem = __decorate([
    __param(7, IContextMenuService),
    __param(8, IThemeService),
    __param(9, IHoverService),
    __param(10, IConfigurationService),
    __param(11, IKeybindingService)
], CompositeOverflowActivityActionViewItem);
export { CompositeOverflowActivityActionViewItem };
let CompositeActionViewItem = class CompositeActionViewItem extends CompositeBarActionViewItem {
    constructor(options, compositeActivityAction, toggleCompositePinnedAction, toggleCompositeBadgeAction, compositeContextMenuActionsProvider, contextMenuActionsProvider, dndHandler, compositeBar, contextMenuService, keybindingService, instantiationService, themeService, hoverService, configurationService, commandService) {
        super(compositeActivityAction, options, compositeBar.areBadgesEnabled.bind(compositeBar), themeService, hoverService, configurationService, keybindingService);
        this.toggleCompositePinnedAction = toggleCompositePinnedAction;
        this.toggleCompositeBadgeAction = toggleCompositeBadgeAction;
        this.compositeContextMenuActionsProvider = compositeContextMenuActionsProvider;
        this.contextMenuActionsProvider = contextMenuActionsProvider;
        this.dndHandler = dndHandler;
        this.compositeBar = compositeBar;
        this.contextMenuService = contextMenuService;
        this.commandService = commandService;
    }
    render(container) {
        super.render(container);
        this.updateChecked();
        this.updateEnabled();
        this._register(addDisposableListener(this.container, EventType.CONTEXT_MENU, e => {
            EventHelper.stop(e, true);
            this.showContextMenu(container);
        }));
        // Allow to drag
        let insertDropBefore = undefined;
        this._register(CompositeDragAndDropObserver.INSTANCE.registerDraggable(this.container, () => { return { type: 'composite', id: this.compositeBarActionItem.id }; }, {
            onDragOver: e => {
                const isValidMove = e.dragAndDropData.getData().id !== this.compositeBarActionItem.id && this.dndHandler.onDragOver(e.dragAndDropData, this.compositeBarActionItem.id, e.eventData);
                toggleDropEffect(e.eventData.dataTransfer, 'move', isValidMove);
                insertDropBefore = this.updateFromDragging(container, isValidMove, e.eventData);
            },
            onDragLeave: e => {
                insertDropBefore = this.updateFromDragging(container, false, e.eventData);
            },
            onDragEnd: e => {
                insertDropBefore = this.updateFromDragging(container, false, e.eventData);
            },
            onDrop: e => {
                EventHelper.stop(e.eventData, true);
                this.dndHandler.drop(e.dragAndDropData, this.compositeBarActionItem.id, e.eventData, insertDropBefore);
                insertDropBefore = this.updateFromDragging(container, false, e.eventData);
            },
            onDragStart: e => {
                if (e.dragAndDropData.getData().id !== this.compositeBarActionItem.id) {
                    return;
                }
                if (e.eventData.dataTransfer) {
                    e.eventData.dataTransfer.effectAllowed = 'move';
                }
                this.blur(); // Remove focus indicator when dragging
            }
        }));
        // Activate on drag over to reveal targets
        [this.badge, this.label].forEach(element => this._register(new DelayedDragHandler(element, () => {
            if (!this.action.checked) {
                this.action.run();
            }
        })));
        this.updateStyles();
    }
    updateFromDragging(element, showFeedback, event) {
        const rect = element.getBoundingClientRect();
        const posX = event.clientX;
        const posY = event.clientY;
        const height = rect.bottom - rect.top;
        const width = rect.right - rect.left;
        const forceTop = posY <= rect.top + height * 0.4;
        const forceBottom = posY > rect.bottom - height * 0.4;
        const preferTop = posY <= rect.top + height * 0.5;
        const forceLeft = posX <= rect.left + width * 0.4;
        const forceRight = posX > rect.right - width * 0.4;
        const preferLeft = posX <= rect.left + width * 0.5;
        const classes = element.classList;
        const lastClasses = {
            vertical: classes.contains('top') ? 'top' : (classes.contains('bottom') ? 'bottom' : undefined),
            horizontal: classes.contains('left') ? 'left' : (classes.contains('right') ? 'right' : undefined)
        };
        const top = forceTop || (preferTop && !lastClasses.vertical) || (!forceBottom && lastClasses.vertical === 'top');
        const bottom = forceBottom || (!preferTop && !lastClasses.vertical) || (!forceTop && lastClasses.vertical === 'bottom');
        const left = forceLeft || (preferLeft && !lastClasses.horizontal) || (!forceRight && lastClasses.horizontal === 'left');
        const right = forceRight || (!preferLeft && !lastClasses.horizontal) || (!forceLeft && lastClasses.horizontal === 'right');
        element.classList.toggle('top', showFeedback && top);
        element.classList.toggle('bottom', showFeedback && bottom);
        element.classList.toggle('left', showFeedback && left);
        element.classList.toggle('right', showFeedback && right);
        if (!showFeedback) {
            return undefined;
        }
        return { verticallyBefore: top, horizontallyBefore: left };
    }
    showContextMenu(container) {
        const actions = [];
        if (this.compositeBarActionItem.keybindingId) {
            actions.push(createConfigureKeybindingAction(this.commandService, this.keybindingService, this.compositeBarActionItem.keybindingId));
        }
        actions.push(this.toggleCompositePinnedAction, this.toggleCompositeBadgeAction);
        const compositeContextMenuActions = this.compositeContextMenuActionsProvider(this.compositeBarActionItem.id);
        if (compositeContextMenuActions.length) {
            actions.push(...compositeContextMenuActions);
        }
        const isPinned = this.compositeBar.isPinned(this.compositeBarActionItem.id);
        if (isPinned) {
            this.toggleCompositePinnedAction.label = localize('hide', "Hide '{0}'", this.compositeBarActionItem.name);
            this.toggleCompositePinnedAction.checked = false;
            this.toggleCompositePinnedAction.enabled = this.compositeBar.getPinnedCompositeIds().length > 1;
        }
        else {
            this.toggleCompositePinnedAction.label = localize('keep', "Keep '{0}'", this.compositeBarActionItem.name);
            this.toggleCompositePinnedAction.enabled = true;
        }
        const isBadgeEnabled = this.compositeBar.areBadgesEnabled(this.compositeBarActionItem.id);
        if (isBadgeEnabled) {
            this.toggleCompositeBadgeAction.label = localize('hideBadge', "Hide Badge");
        }
        else {
            this.toggleCompositeBadgeAction.label = localize('showBadge', "Show Badge");
        }
        const otherActions = this.contextMenuActionsProvider();
        if (otherActions.length) {
            actions.push(new Separator());
            actions.push(...otherActions);
        }
        const elementPosition = getDomNodePagePosition(container);
        const anchor = {
            x: Math.floor(elementPosition.left + (elementPosition.width / 2)),
            y: elementPosition.top + elementPosition.height
        };
        this.contextMenuService.showContextMenu({
            getAnchor: () => anchor,
            getActions: () => actions,
            getActionsContext: () => this.compositeBarActionItem.id
        });
    }
    updateChecked() {
        if (this.action.checked) {
            this.container.classList.add('checked');
            this.container.setAttribute('aria-label', this.getTooltip() ?? this.container.title);
            this.container.setAttribute('aria-expanded', 'true');
            this.container.setAttribute('aria-selected', 'true');
        }
        else {
            this.container.classList.remove('checked');
            this.container.setAttribute('aria-label', this.getTooltip() ?? this.container.title);
            this.container.setAttribute('aria-expanded', 'false');
            this.container.setAttribute('aria-selected', 'false');
        }
        this.updateStyles();
    }
    updateEnabled() {
        if (!this.element) {
            return;
        }
        if (this.action.enabled) {
            this.element.classList.remove('disabled');
        }
        else {
            this.element.classList.add('disabled');
        }
    }
    dispose() {
        super.dispose();
        this.label.remove();
    }
};
CompositeActionViewItem = __decorate([
    __param(8, IContextMenuService),
    __param(9, IKeybindingService),
    __param(10, IInstantiationService),
    __param(11, IThemeService),
    __param(12, IHoverService),
    __param(13, IConfigurationService),
    __param(14, ICommandService)
], CompositeActionViewItem);
export { CompositeActionViewItem };
export class ToggleCompositePinnedAction extends Action {
    constructor(activity, compositeBar) {
        super('show.toggleCompositePinned', activity ? activity.name : localize('toggle', "Toggle View Pinned"));
        this.activity = activity;
        this.compositeBar = compositeBar;
        this.checked = !!this.activity && this.compositeBar.isPinned(this.activity.id);
    }
    async run(context) {
        const id = this.activity ? this.activity.id : context;
        if (this.compositeBar.isPinned(id)) {
            this.compositeBar.unpin(id);
        }
        else {
            this.compositeBar.pin(id);
        }
    }
}
export class ToggleCompositeBadgeAction extends Action {
    constructor(compositeBarActionItem, compositeBar) {
        super('show.toggleCompositeBadge', compositeBarActionItem ? compositeBarActionItem.name : localize('toggleBadge', "Toggle View Badge"));
        this.compositeBarActionItem = compositeBarActionItem;
        this.compositeBar = compositeBar;
        this.checked = false;
    }
    async run(context) {
        const id = this.compositeBarActionItem ? this.compositeBarActionItem.id : context;
        this.compositeBar.toggleBadgeEnablement(id);
    }
}
export class SwitchCompositeViewAction extends Action2 {
    constructor(desc, location, offset) {
        super(desc);
        this.location = location;
        this.offset = offset;
    }
    async run(accessor) {
        const paneCompositeService = accessor.get(IPaneCompositePartService);
        const activeComposite = paneCompositeService.getActivePaneComposite(this.location);
        if (!activeComposite) {
            return;
        }
        let targetCompositeId;
        const visibleCompositeIds = paneCompositeService.getVisiblePaneCompositeIds(this.location);
        for (let i = 0; i < visibleCompositeIds.length; i++) {
            if (visibleCompositeIds[i] === activeComposite.getId()) {
                targetCompositeId = visibleCompositeIds[(i + visibleCompositeIds.length + this.offset) % visibleCompositeIds.length];
                break;
            }
        }
        if (typeof targetCompositeId !== 'undefined') {
            await paneCompositeService.openPaneComposite(targetCompositeId, this.location, true);
        }
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29tcG9zaXRlQmFyQWN0aW9ucy5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9icm93c2VyL3BhcnRzL2NvbXBvc2l0ZUJhckFjdGlvbnMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLGlCQUFpQixDQUFDO0FBQzNDLE9BQU8sRUFBRSxNQUFNLEVBQVcsU0FBUyxFQUFFLE1BQU0saUNBQWlDLENBQUM7QUFDN0UsT0FBTyxFQUFFLENBQUMsRUFBRSxxQkFBcUIsRUFBRSxNQUFNLEVBQUUsU0FBUyxFQUFFLFdBQVcsRUFBRSxTQUFTLEVBQUUsc0JBQXNCLEVBQUUsSUFBSSxFQUFFLElBQUksRUFBRSxNQUFNLDhCQUE4QixDQUFDO0FBQ3ZKLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSwrQ0FBK0MsQ0FBQztBQUNoRixPQUFPLEVBQUUsWUFBWSxFQUFFLGVBQWUsRUFBRSxpQkFBaUIsRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBQ3JHLE9BQU8sRUFBRSxtQkFBbUIsRUFBRSxNQUFNLHNEQUFzRCxDQUFDO0FBQzNGLE9BQU8sRUFBRSxhQUFhLEVBQWUsTUFBTSxnREFBZ0QsQ0FBQztBQUM1RixPQUFPLEVBQUUsV0FBVyxFQUFxQixhQUFhLEVBQUUsU0FBUyxFQUFFLE1BQU0sNENBQTRDLENBQUM7QUFDdEgsT0FBTyxFQUFFLHFCQUFxQixFQUFvQixNQUFNLHlEQUF5RCxDQUFDO0FBQ2xILE9BQU8sRUFBRSxrQkFBa0IsRUFBRSxNQUFNLDhCQUE4QixDQUFDO0FBQ2xFLE9BQU8sRUFBRSxrQkFBa0IsRUFBRSxNQUFNLG1EQUFtRCxDQUFDO0FBQ3ZGLE9BQU8sRUFBRSxPQUFPLEVBQUUsS0FBSyxFQUFFLE1BQU0sK0JBQStCLENBQUM7QUFDL0QsT0FBTyxFQUFFLDRC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