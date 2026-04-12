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
var NotificationsCenter_1;
import './media/notificationsCenter.css';
import './media/notificationsActions.css';
import { NOTIFICATIONS_CENTER_HEADER_FOREGROUND, NOTIFICATIONS_CENTER_HEADER_BACKGROUND, NOTIFICATIONS_CENTER_BORDER } from '../../../common/theme.js';
import { IThemeService, Themable } from '../../../../platform/theme/common/themeService.js';
import { getNotificationsPosition } from '../../../common/notifications.js';
import { IWorkbenchLayoutService } from '../../../services/layout/browser/layoutService.js';
import { Emitter } from '../../../../base/common/event.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { NotificationActionRunner } from './notificationsCommands.js';
import { NotificationsList } from './notificationsList.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { $, Dimension, isAncestorOfActiveElement } from '../../../../base/browser/dom.js';
import { IEditorGroupsService } from '../../../services/editor/common/editorGroupsService.js';
import { localize } from '../../../../nls.js';
import { ActionBar } from '../../../../base/browser/ui/actionbar/actionbar.js';
import { ClearAllNotificationsAction, ConfigureDoNotDisturbAction, ConfigureNotificationsPositionAction, ToggleDoNotDisturbBySourceAction, HideNotificationsCenterAction, ToggleDoNotDisturbAction, hideIcon, hideUpIcon } from './notificationsActions.js';
import { Separator, toAction } from '../../../../base/common/actions.js';
import { IMenuService, MenuId } from '../../../../platform/actions/common/actions.js';
import { createActionViewItem } from '../../../../platform/actions/browser/menuEntryActionViewItem.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { assertReturnsAllDefined, assertReturnsDefined } from '../../../../base/common/types.js';
import { NotificationsCenterVisibleContext } from '../../../common/contextkeys.js';
import { INotificationService, NotificationsFilter } from '../../../../platform/notification/common/notification.js';
import { mainWindow } from '../../../../base/browser/window.js';
import { IContextMenuService } from '../../../../platform/contextview/browser/contextView.js';
import { DropdownMenuActionViewItem } from '../../../../base/browser/ui/dropdown/dropdownActionViewItem.js';
import { AccessibilitySignal, IAccessibilitySignalService } from '../../../../platform/accessibilitySignal/browser/accessibilitySignalService.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { DEFAULT_CUSTOM_TITLEBAR_HEIGHT } from '../../../../platform/window/common/window.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
let NotificationsCenter = class NotificationsCenter extends Themable {
    static { NotificationsCenter_1 = this; }
    static { this.MAX_DIMENSIONS = new Dimension(450, 400); }
    static { this.MAX_NOTIFICATION_SOURCES = 10; } // maximum number of notification sources to show in configure dropdown
    constructor(container, model, themeService, instantiationService, layoutService, contextKeyService, editorGroupService, keybindingService, notificationService, accessibilitySignalService, contextMenuService, configurationService, menuService) {
        super(themeService);
        this.container = container;
        this.model = model;
        this.instantiationService = instantiationService;
        this.layoutService = layoutService;
        this.contextKeyService = contextKeyService;
        this.editorGroupService = editorGroupService;
        this.keybindingService = keybindingService;
        this.notificationService = notificationService;
        this.accessibilitySignalService = accessibilitySignalService;
        this.contextMenuService = contextMenuService;
        this.configurationService = configurationService;
        this.menuService = menuService;
        this._onDidChangeVisibility = this._register(new Emitter());
        this.onDidChangeVisibility = this._onDidChangeVisibility.event;
        this.notificationsCenterVisibleContextKey = NotificationsCenterVisibleContext.bindTo(contextKeyService);
        this.registerListeners();
    }
    registerListeners() {
        this._register(this.model.onDidChangeNotification(e => this.onDidChangeNotification(e)));
        this._register(this.layoutService.onDidLayoutMainContainer(dimension => this.layout(Dimension.lift(dimension))));
        this._register(this.notificationService.onDidChangeFilter(() => this.onDidChangeFilter()));
        this._register(this.configurationService.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration("workbench.notifications.position" /* NotificationsSettings.NOTIFICATIONS_POSITION */)) {
                this.updatePositionClass();
            }
        }));
    }
    updatePositionClass() {
        if (!this.notificationsCenterContainer) {
            return;
        }
        const position = getNotificationsPosition(this.configurationService);
        this.notificationsCenterContainer.classList.remove('bottom-right', 'bottom-left', 'top-right');
        this.notificationsCenterContainer.classList.add(position);
        this.updateHideActionIcon();
        this.updateTopOffset();
    }
    updateHideActionIcon() {
        if (!this.hideAction) {
            return;
        }
        const position = getNotificationsPosition(this.configurationService);
        this.hideAction.class = ThemeIcon.asClassName(position === "top-right" /* NotificationsPosition.TOP_RIGHT */ ? hideUpIcon : hideIcon);
    }
    updateTopOffset() {
        if (!this.notificationsCenterContainer) {
            return;
        }
        const position = getNotificationsPosition(this.configurationService);
        if (position === "top-right" /* NotificationsPosition.TOP_RIGHT */) {
            let topOffset = 7;
            if (this.layoutService.isVisible("workbench.parts.titlebar" /* Parts.TITLEBAR_PART */, mainWindow)) {
                topOffset += DEFAULT_CUSTOM_TITLEBAR_HEIGHT;
            }
            this.notificationsCenterContainer.style.top = `${topOffset}px`;
        }
        else {
            this.notificationsCenterContainer.style.top = '';
        }
    }
    onDidChangeFilter() {
        if (this.notificationService.getFilter() === NotificationsFilter.ERROR) {
            this.hide(); // hide the notification center when we have a error filter enabled
        }
    }
    get isVisible() {
        return !!this._isVisible;
    }
    show() {
        if (this._isVisible) {
            const notificationsList = assertReturnsDefined(this.notificationsList);
            // Make visible
            notificationsList.show();
            // Focus first
            notificationsList.focusFirst();
            return; // already visible
        }
        // Lazily create if showing for the first time
        if (!this.notificationsCenterContainer) {
            this.create();
        }
        // Title
        this.updateTitle();
        // Make visible
        const [notificationsList, notificationsCenterContainer] = assertReturnsAllDefined(this.notificationsList, this.notificationsCenterContainer);
        this._isVisible = true;
        notificationsCenterContainer.classList.add('visible');
        notificationsList.show();
        // Layout
        this.layout(this.workbenchDimensions);
        // Show all notifications that are present now
        notificationsList.updateNotificationsList(0, 0, this.model.notifications);
        // Focus first
        notificationsList.focusFirst();
        // Theming
        this.updateStyles();
        // Mark as visible
        this.model.notifications.forEach(notification => notification.updateVisibility(true));
        // Context Key
        this.notificationsCenterVisibleContextKey.set(true);
        // Event
        this._onDidChangeVisibility.fire();
    }
    updateTitle() {
        const [notificationsCenterTitle, clearAllAction] = assertReturnsAllDefined(this.notificationsCenterTitle, this.clearAllAction);
        if (this.model.notifications.length === 0) {
            notificationsCenterTitle.textContent = localize('notificationsEmpty', "No new notifications");
            clearAllAction.enabled = false;
        }
        else {
            notificationsCenterTitle.textContent = localize('notifications', "Notifications");
            clearAllAction.enabled = this.model.notifications.some(notification => !notification.hasProgress);
        }
    }
    create() {
        // Container
        this.notificationsCenterContainer = $('.notifications-center');
        // Apply position class
        this.updatePositionClass();
        // Header
        this.notificationsCenterHeader = $('.notifications-center-header');
        this.notificationsCenterContainer.appendChild(this.notificationsCenterHeader);
        // Header Title
        this.notificationsCenterTitle = $('span.notifications-center-header-title');
        this.notificationsCenterHeader.appendChild(this.notificationsCenterTitle);
        // Header Toolbar
        const toolbarContainer = $('.notifications-center-header-toolbar');
        this.notificationsCenterHeader.appendChild(toolbarContainer);
        const actionRunner = this._register(this.instantiationService.createInstance(NotificationActionRunner));
        const that = this;
        const notificationsToolBar = this._register(new ActionBar(toolbarContainer, {
            ariaLabel: localize('notificationsToolbar', "Notification Center Actions"),
            actionRunner,
            actionViewItemProvider: (action, options) => {
                if (action.id === ConfigureNotificationsPositionAction.ID) {
                    return this._register(this.instantiationService.createInstance(DropdownMenuActionViewItem, action, {
                        getActions: () => Separator.join(...this.menuService.getMenuActions(MenuId.NotificationsCenterPositionMenu, this.contextKeyService).map(([, actions]) => actions)),
                    }, this.contextMenuService, {
                        ...options,
                        actionRunner,
                        classNames: action.class,
                        keybindingProvider: action => this.keybindingService.lookupKeybinding(action.id)
                    }));
                }
                if (action.id === ConfigureDoNotDisturbAction.ID) {
                    return this._register(this.instantiationService.createInstance(DropdownMenuActionViewItem, action, {
                        getActions() {
                            const actions = [toAction({
                                    id: ToggleDoNotDisturbAction.ID,
                                    label: that.notificationService.getFilter() === NotificationsFilter.OFF ? localize('turnOnNotifications', "Enable Do Not Disturb Mode") : localize('turnOffNotifications', "Disable Do Not Disturb Mode"),
                                    run: () => that.notificationService.setFilter(that.notificationService.getFilter() === NotificationsFilter.OFF ? NotificationsFilter.ERROR : NotificationsFilter.OFF)
                                })];
                            const sortedFilters = that.notificationService.getFilters().sort((a, b) => a.label.localeCompare(b.label));
                            for (const source of sortedFilters.slice(0, NotificationsCenter_1.MAX_NOTIFICATION_SOURCES)) {
                                if (actions.length === 1) {
                                    actions.push(new Separator());
                                }
                                actions.push(toAction({
                                    id: `${ToggleDoNotDisturbAction.ID}.${source.id}`,
                                    label: source.label,
                                    checked: source.filter !== NotificationsFilter.ERROR,
                                    run: () => that.notificationService.setFilter({
                                        ...source,
                                        filter: source.filter === NotificationsFilter.ERROR ? NotificationsFilter.OFF : NotificationsFilter.ERROR
                                    })
                                }));
                            }
                            if (sortedFilters.length > NotificationsCenter_1.MAX_NOTIFICATION_SOURCES) {
                                actions.push(new Separator());
                                actions.push(that._register(that.instantiationService.createInstance(ToggleDoNotDisturbBySourceAction, ToggleDoNotDisturbBySourceAction.ID, localize('moreSources', "More…"))));
                            }
                            return actions;
                        },
                    }, this.contextMenuService, {
                        ...options,
                        actionRunner,
                        classNames: action.class,
                        keybindingProvider: action => this.keybindingService.lookupKeybinding(action.id)
                    }));
                }
                return createActionViewItem(this.instantiationService, action, options);
            }
        }));
        this.clearAllAction = this._register(this.instantiationService.createInstance(ClearAllNotificationsAction, ClearAllNotificationsAction.ID, ClearAllNotificationsAction.LABEL));
        notificationsToolBar.push(this.clearAllAction, { icon: true, label: false, keybinding: this.getKeybindingLabel(this.clearAllAction) });
        this.configureDoNotDisturbAction = this._register(this.instantiationService.createInstance(ConfigureDoNotDisturbAction, ConfigureDoNotDisturbAction.ID, ConfigureDoNotDisturbAction.LABEL));
        notificationsToolBar.push(this.configureDoNotDisturbAction, { icon: true, label: false });
        const configureNotificationsPositionAction = this._register(this.instantiationService.createInstance(ConfigureNotificationsPositionAction, ConfigureNotificationsPositionAction.ID, ConfigureNotificationsPositionAction.LABEL));
        notificationsToolBar.push(configureNotificationsPositionAction, { icon: true, label: false });
        this.hideAction = this._register(this.instantiationService.createInstance(HideNotificationsCenterAction, HideNotificationsCenterAction.ID, HideNotificationsCenterAction.LABEL));
        this.updateHideActionIcon();
        notificationsToolBar.push(this.hideAction, { icon: true, label: false, keybinding: this.getKeybindingLabel(this.hideAction) });
        // Notifications List
        this.notificationsList = this.instantiationService.createInstance(NotificationsList, this.notificationsCenterContainer, {
            widgetAriaLabel: localize('notificationsCenterWidgetAriaLabel', "Notifications Center")
        });
        this.container.appendChild(this.notificationsCenterContainer);
    }
    getKeybindingLabel(action) {
        const keybinding = this.keybindingService.lookupKeybinding(action.id);
        return keybinding ? keybinding.getLabel() : null;
    }
    onDidChangeNotification(e) {
        if (!this._isVisible) {
            return; // only if visible
        }
        let focusEditor = false;
        // Update notifications list based on event kind
        const [notificationsList, notificationsCenterContainer] = assertReturnsAllDefined(this.notificationsList, this.notificationsCenterContainer);
        switch (e.kind) {
            case 0 /* NotificationChangeType.ADD */:
                notificationsList.updateNotificationsList(e.index, 0, [e.item]);
                e.item.updateVisibility(true);
                break;
            case 1 /* NotificationChangeType.CHANGE */:
                // Handle content changes
                // - actions: re-draw to properly show them
                // - message: update notification height unless collapsed
                switch (e.detail) {
                    case 2 /* NotificationViewItemContentChangeKind.ACTIONS */:
                        notificationsList.updateNotificationsList(e.index, 1, [e.item]);
                        break;
                    case 1 /* NotificationViewItemContentChangeKind.MESSAGE */:
                        if (e.item.expanded) {
                            notificationsList.updateNotificationHeight(e.item);
                        }
                        break;
                }
                break;
            case 2 /* NotificationChangeType.EXPAND_COLLAPSE */:
                // Re-draw entire item when expansion changes to reveal or hide details
                notificationsList.updateNotificationsList(e.index, 1, [e.item]);
                break;
            case 3 /* NotificationChangeType.REMOVE */:
                focusEditor = isAncestorOfActiveElement(notificationsCenterContainer);
                notificationsList.updateNotificationsList(e.index, 1);
                e.item.updateVisibility(false);
                break;
        }
        // Update title
        this.updateTitle();
        // Hide if no more notifications to show
        if (this.model.notifications.length === 0) {
            this.hide();
            // Restore focus to editor group if we had focus
            if (focusEditor) {
                this.editorGroupService.activeGroup.focus();
            }
        }
    }
    hide() {
        if (!this._isVisible || !this.notificationsCenterContainer || !this.notificationsList) {
            return; // already hidden
        }
        const focusEditor = isAncestorOfActiveElement(this.notificationsCenterContainer);
        // Hide
        this._isVisible = false;
        this.notificationsCenterContainer.classList.remove('visible');
        this.notificationsList.hide();
        // Mark as hidden
        this.model.notifications.forEach(notification => notification.updateVisibility(false));
        // Context Key
        this.notificationsCenterVisibleContextKey.set(false);
        // Event
        this._onDidChangeVisibility.fire();
        // Restore focus to editor group if we had focus
        if (focusEditor) {
            this.editorGroupService.activeGroup.focus();
        }
    }
    updateStyles() {
        if (this.notificationsCenterContainer && this.notificationsCenterHeader) {
            const borderColor = this.getColor(NOTIFICATIONS_CENTER_BORDER);
            this.notificationsCenterContainer.style.border = borderColor ? `1px solid ${borderColor}` : '';
            const headerForeground = this.getColor(NOTIFICATIONS_CENTER_HEADER_FOREGROUND);
            this.notificationsCenterHeader.style.color = headerForeground ?? '';
            const headerBackground = this.getColor(NOTIFICATIONS_CENTER_HEADER_BACKGROUND);
            this.notificationsCenterHeader.style.background = headerBackground ?? '';
        }
    }
    layout(dimension) {
        this.workbenchDimensions = dimension;
        if (this._isVisible && this.notificationsCenterContainer) {
            const maxWidth = NotificationsCenter_1.MAX_DIMENSIONS.width;
            const maxHeight = NotificationsCenter_1.MAX_DIMENSIONS.height;
            let availableWidth = maxWidth;
            let availableHeight = maxHeight;
            if (this.workbenchDimensions) {
                // Make sure notifications are not exceding available width
                availableWidth = this.workbenchDimensions.width;
                availableWidth -= (2 * 8); // adjust for paddings left and right
                // Make sure notifications are not exceeding available height
                availableHeight = this.workbenchDimensions.height - 35 /* header */;
                if (this.layoutService.isVisible("workbench.parts.statusbar" /* Parts.STATUSBAR_PART */, mainWindow)) {
                    availableHeight -= 22; // adjust for status bar
                }
                if (this.layoutService.isVisible("workbench.parts.titlebar" /* Parts.TITLEBAR_PART */, mainWindow)) {
                    availableHeight -= 22; // adjust for title bar
                }
                availableHeight -= (2 * 12); // adjust for paddings top and bottom
            }
            // Update position offset
            this.updateTopOffset();
            // Apply to list
            const notificationsList = assertReturnsDefined(this.notificationsList);
            notificationsList.layout(Math.min(maxWidth, availableWidth), Math.min(maxHeight, availableHeight));
        }
    }
    clearAll() {
        // Hide notifications center first
        this.hide();
        // Close all
        for (const notification of [...this.model.notifications] /* copy array since we modify it from closing */) {
            if (!notification.hasProgress) {
                notification.close();
            }
            this.accessibilitySignalService.playSignal(AccessibilitySignal.clear);
        }
    }
};
NotificationsCenter = NotificationsCenter_1 = __decorate([
    __param(2, IThemeService),
    __param(3, IInstantiationService),
    __param(4, IWorkbenchLayoutService),
    __param(5, IContextKeyService),
    __param(6, IEditorGroupsService),
    __param(7, IKeybindingService),
    __param(8, INotificationService),
    __param(9, IAccessibilitySignalService),
    __param(10, IContextMenuService),
    __param(11, IConfigurationService),
    __param(12, IMenuService)
], NotificationsCenter);
export { NotificationsCenter };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibm90aWZpY2F0aW9uc0NlbnRlci5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9icm93c2VyL3BhcnRzL25vdGlmaWNhdGlvbnMvbm90aWZpY2F0aW9uc0NlbnRlci50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxpQ0FBaUMsQ0FBQztBQUN6QyxPQUFPLGtDQUFrQyxDQUFDO0FBQzFDLE9BQU8sRUFBRSxzQ0FBc0MsRUFBRSxzQ0FBc0MsRUFBRSwyQkFBMkIsRUFBRSxNQUFNLDBCQUEwQixDQUFDO0FBQ3ZKLE9BQU8sRUFBRSxhQUFhLEVBQUUsUUFBUSxFQUFFLE1BQU0sbURBQW1ELENBQUM7QUFDNUYsT0FBTyxFQUE4Six3QkFBd0IsRUFBRSxNQUFNLGtDQUFrQyxDQUFDO0FBQ3hPLE9BQU8sRUFBRSx1QkFBdUIsRUFBUyxNQUFNLG1EQUFtRCxDQUFDO0FBQ25HLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSxrQ0FBa0MsQ0FBQztBQUMzRCxPQUFPLEVBQUUsa0JBQWtCLEVBQUUsTUFBTSxzREFBc0QsQ0FBQztBQUMxRixPQUFPLEVBQWtDLHdCQUF3QixFQUFFLE1BQU0sNEJBQTRCLENBQUM7QUFDdEcsT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0sd0JBQXdCLENBQUM7QUFDM0QsT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0sNERBQTRELENBQUM7QUFDbkcsT0FBTyxFQUFFLENBQUMsRUFBRSxTQUFTLEVBQUUseUJBQXlCLEVBQUUsTUFBTSxpQ0FBaUMsQ0FBQztBQUMxRixPQUFPLEVBQUUsb0JBQW9CLEVBQUUsTUFBTSx3REFBd0QsQ0FBQztBQUM5RixPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sb0JBQW9CLENBQUM7QUFDOUMsT0FBTyxFQUFFLFNBQVMsRUFBRSxNQUFNLG9EQUFvRCxD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