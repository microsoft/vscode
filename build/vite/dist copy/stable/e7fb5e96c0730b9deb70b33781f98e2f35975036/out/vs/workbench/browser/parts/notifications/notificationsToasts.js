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
var NotificationsToasts_1;
import './media/notificationsToasts.css';
import { localize } from '../../../../nls.js';
import { getNotificationsPosition } from '../../../common/notifications.js';
import { dispose, toDisposable, DisposableStore } from '../../../../base/common/lifecycle.js';
import { addDisposableListener, EventType, Dimension, scheduleAtNextAnimationFrame, isAncestorOfActiveElement, getWindow, $, isHTMLElement, isEditableElement, getActiveElement, getDomNodePagePosition, getClientArea } from '../../../../base/browser/dom.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { NotificationsList } from './notificationsList.js';
import { Event, Emitter } from '../../../../base/common/event.js';
import { IWorkbenchLayoutService } from '../../../services/layout/browser/layoutService.js';
import { NOTIFICATIONS_TOAST_BORDER, NOTIFICATIONS_BACKGROUND } from '../../../common/theme.js';
import { IThemeService, Themable } from '../../../../platform/theme/common/themeService.js';
import { IEditorGroupsService } from '../../../services/editor/common/editorGroupsService.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { Severity, NotificationsFilter, NotificationPriority, withSeverityPrefix } from '../../../../platform/notification/common/notification.js';
import { ILifecycleService } from '../../../services/lifecycle/common/lifecycle.js';
import { IHostService } from '../../../services/host/browser/host.js';
import { IntervalCounter } from '../../../../base/common/async.js';
import { assertReturnsDefined } from '../../../../base/common/types.js';
import { NotificationsToastsVisibleContext } from '../../../common/contextkeys.js';
import { mainWindow } from '../../../../base/browser/window.js';
import { IWorkbenchEnvironmentService } from '../../../services/environment/common/environmentService.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { DEFAULT_CUSTOM_TITLEBAR_HEIGHT } from '../../../../platform/window/common/window.js';
var ToastVisibility;
(function (ToastVisibility) {
    ToastVisibility[ToastVisibility["HIDDEN_OR_VISIBLE"] = 0] = "HIDDEN_OR_VISIBLE";
    ToastVisibility[ToastVisibility["HIDDEN"] = 1] = "HIDDEN";
    ToastVisibility[ToastVisibility["VISIBLE"] = 2] = "VISIBLE";
})(ToastVisibility || (ToastVisibility = {}));
let NotificationsToasts = class NotificationsToasts extends Themable {
    static { NotificationsToasts_1 = this; }
    static { this.MAX_WIDTH = 450; }
    static { this.MAX_NOTIFICATIONS = 3; }
    static { this.PURGE_TIMEOUT = {
        [Severity.Info]: 10000,
        [Severity.Warning]: 12000,
        [Severity.Error]: 15000
    }; }
    static { this.SPAM_PROTECTION = {
        // Count for the number of notifications over 800ms...
        interval: 800,
        // ...and ensure we are not showing more than MAX_NOTIFICATIONS
        limit: this.MAX_NOTIFICATIONS
    }; }
    get isVisible() { return !!this._isVisible; }
    constructor(container, model, instantiationService, layoutService, themeService, editorGroupService, contextKeyService, lifecycleService, hostService, environmentService, configurationService) {
        super(themeService);
        this.container = container;
        this.model = model;
        this.instantiationService = instantiationService;
        this.layoutService = layoutService;
        this.editorGroupService = editorGroupService;
        this.lifecycleService = lifecycleService;
        this.hostService = hostService;
        this.environmentService = environmentService;
        this.configurationService = configurationService;
        this._onDidChangeVisibility = this._register(new Emitter());
        this.onDidChangeVisibility = this._onDidChangeVisibility.event;
        this._isVisible = false;
        this.mapNotificationToToast = new Map();
        this.mapNotificationToDisposable = new Map();
        this.addedToastsIntervalCounter = new IntervalCounter(NotificationsToasts_1.SPAM_PROTECTION.interval);
        this.notificationsToastsVisibleContextKey = NotificationsToastsVisibleContext.bindTo(contextKeyService);
        this.registerListeners();
    }
    registerListeners() {
        // Layout
        this._register(this.layoutService.onDidLayoutMainContainer(dimension => this.layout(Dimension.lift(dimension))));
        // Position changes
        this._register(this.configurationService.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration("workbench.notifications.position" /* NotificationsSettings.NOTIFICATIONS_POSITION */)) {
                this.updateNotificationPosition();
            }
        }));
        // Delay some tasks until after we have restored
        // to reduce UI pressure from the startup phase
        this.lifecycleService.when(3 /* LifecyclePhase.Restored */).then(() => {
            // Show toast for initial notifications if any
            this.model.notifications.forEach(notification => this.addToast(notification));
            // Update toasts on notification changes
            this._register(this.model.onDidChangeNotification(e => this.onDidChangeNotification(e)));
        });
        // Filter
        this._register(this.model.onDidChangeFilter(({ global, sources }) => {
            if (global === NotificationsFilter.ERROR) {
                this.hide();
            }
            else if (sources) {
                for (const [notification] of this.mapNotificationToToast) {
                    if (typeof notification.sourceId === 'string' && sources.get(notification.sourceId) === NotificationsFilter.ERROR && notification.severity !== Severity.Error && notification.priority !== NotificationPriority.URGENT) {
                        this.removeToast(notification);
                    }
                }
            }
        }));
    }
    updateNotificationPosition() {
        if (!this.notificationsToastsContainer) {
            return;
        }
        const position = getNotificationsPosition(this.configurationService);
        this.notificationsToastsContainer.classList.remove('bottom-right', 'bottom-left', 'top-right');
        this.notificationsToastsContainer.classList.add(position);
        this.updateTopOffset();
    }
    updateTopOffset() {
        if (!this.notificationsToastsContainer) {
            return;
        }
        const position = getNotificationsPosition(this.configurationService);
        if (position === "top-right" /* NotificationsPosition.TOP_RIGHT */) {
            let topOffset = 3;
            if (this.layoutService.isVisible("workbench.parts.titlebar" /* Parts.TITLEBAR_PART */, mainWindow)) {
                topOffset += DEFAULT_CUSTOM_TITLEBAR_HEIGHT;
            }
            this.notificationsToastsContainer.style.top = `${topOffset}px`;
        }
        else {
            this.notificationsToastsContainer.style.top = '';
        }
    }
    onDidChangeNotification(e) {
        switch (e.kind) {
            case 0 /* NotificationChangeType.ADD */:
                return this.addToast(e.item);
            case 3 /* NotificationChangeType.REMOVE */:
                return this.removeToast(e.item);
        }
    }
    addToast(item) {
        if (this.isNotificationsCenterVisible) {
            return; // do not show toasts while notification center is visible
        }
        if (this.environmentService.enableSmokeTestDriver) {
            return; // disable in smoke tests to prevent covering elements
        }
        if (item.priority === NotificationPriority.SILENT) {
            return; // do not show toasts for silenced notifications
        }
        if (item.priority === NotificationPriority.OPTIONAL) {
            const activeElement = getActiveElement();
            if (isHTMLElement(activeElement) && isEditableElement(activeElement) && this.isElementInNotificationQuarter(activeElement)) {
                return; // skip showing optional toast that potentially covers input fields
            }
        }
        // Optimization: it is possible that a lot of notifications are being
        // added in a very short time. To prevent this kind of spam, we protect
        // against showing too many notifications at once. Since they can always
        // be accessed from the notification center, a user can always get to
        // them later on.
        // (see also https://github.com/microsoft/vscode/issues/107935)
        if (this.addedToastsIntervalCounter.increment() > NotificationsToasts_1.SPAM_PROTECTION.limit) {
            return;
        }
        // Optimization: showing a notification toast can be expensive
        // because of the associated animation. If the renderer is busy
        // doing actual work, the animation can cause a lot of slowdown
        // As such we use `scheduleAtNextAnimationFrame` to push out
        // the toast until the renderer has time to process it.
        // (see also https://github.com/microsoft/vscode/issues/107935)
        const itemDisposables = new DisposableStore();
        this.mapNotificationToDisposable.set(item, itemDisposables);
        itemDisposables.add(scheduleAtNextAnimationFrame(getWindow(this.container), () => this.doAddToast(item, itemDisposables)));
    }
    isElementInNotificationQuarter(element) {
        const position = getNotificationsPosition(this.configurationService);
        const domPosition = getDomNodePagePosition(element);
        const clientArea = getClientArea(this.layoutService.mainContainer);
        switch (position) {
            case "bottom-left" /* NotificationsPosition.BOTTOM_LEFT */:
                return domPosition.left < clientArea.width / 2 && domPosition.top > clientArea.height / 2;
            case "top-right" /* NotificationsPosition.TOP_RIGHT */:
                return domPosition.left > clientArea.width / 2 && domPosition.top < clientArea.height / 2;
            case "bottom-right" /* NotificationsPosition.BOTTOM_RIGHT */:
            default:
                return domPosition.left > clientArea.width / 2 && domPosition.top > clientArea.height / 2;
        }
    }
    doAddToast(item, itemDisposables) {
        // Lazily create toasts containers
        let notificationsToastsContainer = this.notificationsToastsContainer;
        if (!notificationsToastsContainer) {
            notificationsToastsContainer = this.notificationsToastsContainer = $('.notifications-toasts');
            this.container.appendChild(notificationsToastsContainer);
        }
        // Apply position class
        this.updateNotificationPosition();
        // Make Visible
        notificationsToastsContainer.classList.add('visible');
        // Container
        const notificationToastContainer = $('.notification-toast-container');
        const firstToast = notificationsToastsContainer.firstChild;
        if (firstToast) {
            notificationsToastsContainer.insertBefore(notificationToastContainer, firstToast); // always first
        }
        else {
            notificationsToastsContainer.appendChild(notificationToastContainer);
        }
        // Toast
        const notificationToast = $('.notification-toast');
        notificationToastContainer.appendChild(notificationToast);
        // Create toast with item and show
        const notificationList = this.instantiationService.createInstance(NotificationsList, notificationToast, {
            verticalScrollMode: 2 /* ScrollbarVisibility.Hidden */,
            widgetAriaLabel: (() => {
                if (!item.source) {
                    return withSeverityPrefix(localize('notificationAriaLabel', "{0}, notification", item.message.raw), item.severity);
                }
                return withSeverityPrefix(localize('notificationWithSourceAriaLabel', "{0}, source: {1}, notification", item.message.raw, item.source), item.severity);
            })()
        });
        itemDisposables.add(notificationList);
        const toast = { item, list: notificationList, container: notificationToastContainer, toast: notificationToast };
        this.mapNotificationToToast.set(item, toast);
        // When disposed, remove as visible
        itemDisposables.add(toDisposable(() => this.updateToastVisibility(toast, false)));
        // Make visible
        notificationList.show();
        // Layout lists
        const maxDimensions = this.computeMaxDimensions();
        this.layoutLists(maxDimensions.width);
        // Show notification
        notificationList.updateNotificationsList(0, 0, [item]);
        // Layout container: only after we show the notification to ensure that
        // the height computation takes the content of it into account!
        this.layoutContainer(maxDimensions.height);
        // Re-draw entire item when expansion changes to reveal or hide details
        itemDisposables.add(item.onDidChangeExpansion(() => {
            notificationList.updateNotificationsList(0, 1, [item]);
        }));
        // Handle content changes
        // - actions: re-draw to properly show them
        // - message: update notification height unless collapsed
        itemDisposables.add(item.onDidChangeContent(e => {
            switch (e.kind) {
                case 2 /* NotificationViewItemContentChangeKind.ACTIONS */:
                    notificationList.updateNotificationsList(0, 1, [item]);
                    break;
                case 1 /* NotificationViewItemContentChangeKind.MESSAGE */:
                    if (item.expanded) {
                        notificationList.updateNotificationHeight(item);
                    }
                    break;
            }
        }));
        // Remove when item gets closed
        Event.once(item.onDidClose)(() => {
            this.removeToast(item);
        });
        // Automatically purge non-sticky notifications
        this.purgeNotification(item, notificationToastContainer, notificationList, itemDisposables);
        // Theming
        this.updateStyles();
        // Context Key
        this.notificationsToastsVisibleContextKey.set(true);
        // Animate in
        notificationToast.classList.add('notification-fade-in');
        itemDisposables.add(addDisposableListener(notificationToast, 'transitionend', () => {
            notificationToast.classList.remove('notification-fade-in');
            notificationToast.classList.add('notification-fade-in-done');
        }));
        // Mark as visible
        item.updateVisibility(true);
        // Events
        if (!this._isVisible) {
            this._isVisible = true;
            this._onDidChangeVisibility.fire();
        }
    }
    purgeNotification(item, notificationToastContainer, notificationList, disposables) {
        // Track mouse over item
        let isMouseOverToast = false;
        disposables.add(addDisposableListener(notificationToastContainer, EventType.MOUSE_OVER, () => isMouseOverToast = true));
        disposables.add(addDisposableListener(notificationToastContainer, EventType.MOUSE_OUT, () => isMouseOverToast = false));
        // Install Timers to Purge Notification
        let purgeTimeoutHandle;
        let listener;
        const hideAfterTimeout = () => {
            purgeTimeoutHandle = setTimeout(() => {
                // If the window does not have focus, we wait for the window to gain focus
                // again before triggering the timeout again. This prevents an issue where
                // focussing the window could immediately hide the notification because the
                // timeout was triggered again.
                if (!this.hostService.hasFocus) {
                    if (!listener) {
                        listener = this.hostService.onDidChangeFocus(focus => {
                            if (focus) {
                                hideAfterTimeout();
                            }
                        });
                        disposables.add(listener);
                    }
                }
                // Otherwise...
                else if (item.sticky || // never hide sticky notifications
                    notificationList.hasFocus() || // never hide notifications with focus
                    isMouseOverToast // never hide notifications under mouse
                ) {
                    hideAfterTimeout();
                }
                else {
                    this.removeToast(item);
                }
            }, NotificationsToasts_1.PURGE_TIMEOUT[item.severity]);
        };
        hideAfterTimeout();
        disposables.add(toDisposable(() => clearTimeout(purgeTimeoutHandle)));
    }
    removeToast(item) {
        let focusEditor = false;
        // UI
        const notificationToast = this.mapNotificationToToast.get(item);
        if (notificationToast) {
            const toastHasDOMFocus = isAncestorOfActiveElement(notificationToast.container);
            if (toastHasDOMFocus) {
                focusEditor = !(this.focusNext() || this.focusPrevious()); // focus next if any, otherwise focus editor
            }
            this.mapNotificationToToast.delete(item);
        }
        // Disposables
        const notificationDisposables = this.mapNotificationToDisposable.get(item);
        if (notificationDisposables) {
            dispose(notificationDisposables);
            this.mapNotificationToDisposable.delete(item);
        }
        // Layout if we still have toasts
        if (this.mapNotificationToToast.size > 0) {
            this.layout(this.workbenchDimensions);
        }
        // Otherwise hide if no more toasts to show
        else {
            this.doHide();
            // Move focus back to editor group as needed
            if (focusEditor) {
                this.editorGroupService.activeGroup.focus();
            }
        }
    }
    removeToasts() {
        // Toast
        this.mapNotificationToToast.clear();
        // Disposables
        this.mapNotificationToDisposable.forEach(disposable => dispose(disposable));
        this.mapNotificationToDisposable.clear();
        this.doHide();
    }
    doHide() {
        this.notificationsToastsContainer?.classList.remove('visible');
        // Context Key
        this.notificationsToastsVisibleContextKey.set(false);
        // Events
        if (this._isVisible) {
            this._isVisible = false;
            this._onDidChangeVisibility.fire();
        }
    }
    hide() {
        const focusEditor = this.notificationsToastsContainer ? isAncestorOfActiveElement(this.notificationsToastsContainer) : false;
        this.removeToasts();
        if (focusEditor) {
            this.editorGroupService.activeGroup.focus();
        }
    }
    focus() {
        const toasts = this.getToasts(ToastVisibility.VISIBLE);
        if (toasts.length > 0) {
            toasts[0].list.focusFirst();
            return true;
        }
        return false;
    }
    focusNext() {
        const toasts = this.getToasts(ToastVisibility.VISIBLE);
        for (let i = 0; i < toasts.length; i++) {
            const toast = toasts[i];
            if (toast.list.hasFocus()) {
                const nextToast = toasts[i + 1];
                if (nextToast) {
                    nextToast.list.focusFirst();
                    return true;
                }
                break;
            }
        }
        return false;
    }
    focusPrevious() {
        const toasts = this.getToasts(ToastVisibility.VISIBLE);
        for (let i = 0; i < toasts.length; i++) {
            const toast = toasts[i];
            if (toast.list.hasFocus()) {
                const previousToast = toasts[i - 1];
                if (previousToast) {
                    previousToast.list.focusFirst();
                    return true;
                }
                break;
            }
        }
        return false;
    }
    focusFirst() {
        const toast = this.getToasts(ToastVisibility.VISIBLE)[0];
        if (toast) {
            toast.list.focusFirst();
            return true;
        }
        return false;
    }
    focusLast() {
        const toasts = this.getToasts(ToastVisibility.VISIBLE);
        if (toasts.length > 0) {
            toasts[toasts.length - 1].list.focusFirst();
            return true;
        }
        return false;
    }
    update(isCenterVisible) {
        if (this.isNotificationsCenterVisible !== isCenterVisible) {
            this.isNotificationsCenterVisible = isCenterVisible;
            // Hide all toasts when the notificationcenter gets visible
            if (this.isNotificationsCenterVisible) {
                this.removeToasts();
            }
        }
    }
    updateStyles() {
        this.mapNotificationToToast.forEach(({ toast }) => {
            const backgroundColor = this.getColor(NOTIFICATIONS_BACKGROUND);
            toast.style.background = backgroundColor ? backgroundColor : '';
            const borderColor = this.getColor(NOTIFICATIONS_TOAST_BORDER);
            toast.style.border = borderColor ? `1px solid ${borderColor}` : '';
        });
    }
    getToasts(state) {
        const notificationToasts = [];
        this.mapNotificationToToast.forEach(toast => {
            switch (state) {
                case ToastVisibility.HIDDEN_OR_VISIBLE:
                    notificationToasts.push(toast);
                    break;
                case ToastVisibility.HIDDEN:
                    if (!this.isToastInDOM(toast)) {
                        notificationToasts.push(toast);
                    }
                    break;
                case ToastVisibility.VISIBLE:
                    if (this.isToastInDOM(toast)) {
                        notificationToasts.push(toast);
                    }
                    break;
            }
        });
        return notificationToasts.reverse(); // from newest to oldest
    }
    layout(dimension) {
        this.workbenchDimensions = dimension;
        const maxDimensions = this.computeMaxDimensions();
        // Update position offset
        this.updateTopOffset();
        // Hide toasts that exceed height
        if (maxDimensions.height) {
            this.layoutContainer(maxDimensions.height);
        }
        // Layout all lists of toasts
        this.layoutLists(maxDimensions.width);
    }
    computeMaxDimensions() {
        const maxWidth = NotificationsToasts_1.MAX_WIDTH;
        let availableWidth = maxWidth;
        let availableHeight;
        if (this.workbenchDimensions) {
            // Make sure notifications are not exceding available width
            availableWidth = this.workbenchDimensions.width;
            availableWidth -= (2 * 8); // adjust for paddings left and right
            // Make sure notifications are not exceeding available height
            availableHeight = this.workbenchDimensions.height;
            if (this.layoutService.isVisible("workbench.parts.statusbar" /* Parts.STATUSBAR_PART */, mainWindow)) {
                availableHeight -= 22; // adjust for status bar
            }
            if (this.layoutService.isVisible("workbench.parts.titlebar" /* Parts.TITLEBAR_PART */, mainWindow)) {
                availableHeight -= 22; // adjust for title bar
            }
            availableHeight -= (2 * 12); // adjust for paddings top and bottom
        }
        return new Dimension(Math.min(maxWidth, availableWidth), availableHeight ?? 0);
    }
    layoutLists(width) {
        this.mapNotificationToToast.forEach(({ list }) => list.layout(width));
    }
    layoutContainer(heightToGive) {
        // Allow the full height for 1 toast but adjust for multiple toasts
        // so that a stack of notifications does not exceed all the way up
        let singleToastHeightToGive = heightToGive;
        let multipleToastsHeightToGive = Math.round(heightToGive * 0.618);
        let visibleToasts = 0;
        for (const toast of this.getToasts(ToastVisibility.HIDDEN_OR_VISIBLE)) {
            // In order to measure the client height, the element cannot have display: none
            toast.container.style.opacity = '0';
            this.updateToastVisibility(toast, true);
            singleToastHeightToGive -= toast.container.offsetHeight;
            multipleToastsHeightToGive -= toast.container.offsetHeight;
            let makeVisible = false;
            if (visibleToasts === NotificationsToasts_1.MAX_NOTIFICATIONS) {
                makeVisible = false; // never show more than MAX_NOTIFICATIONS
            }
            else if ((visibleToasts === 0 && singleToastHeightToGive >= 0) || (visibleToasts > 0 && multipleToastsHeightToGive >= 0)) {
                makeVisible = true; // hide toast if available height is too little
            }
            // Hide or show toast based on context
            this.updateToastVisibility(toast, makeVisible);
            toast.container.style.opacity = '';
            if (makeVisible) {
                visibleToasts++;
            }
        }
    }
    updateToastVisibility(toast, visible) {
        if (this.isToastInDOM(toast) === visible) {
            return;
        }
        // Update visibility in DOM
        const notificationsToastsContainer = assertReturnsDefined(this.notificationsToastsContainer);
        if (visible) {
            notificationsToastsContainer.appendChild(toast.container);
        }
        else {
            toast.container.remove();
        }
        // Update visibility in model
        toast.item.updateVisibility(visible);
    }
    isToastInDOM(toast) {
        return !!toast.container.parentElement;
    }
};
NotificationsToasts = NotificationsToasts_1 = __decorate([
    __param(2, IInstantiationService),
    __param(3, IWorkbenchLayoutService),
    __param(4, IThemeService),
    __param(5, IEditorGroupsService),
    __param(6, IContextKeyService),
    __param(7, ILifecycleService),
    __param(8, IHostService),
    __param(9, IWorkbenchEnvironmentService),
    __param(10, IConfigurationService)
], NotificationsToasts);
export { NotificationsToasts };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibm90aWZpY2F0aW9uc1RvYXN0cy5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9icm93c2VyL3BhcnRzL25vdGlmaWNhdGlvbnMvbm90aWZpY2F0aW9uc1RvYXN0cy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxpQ0FBaUMsQ0FBQztBQUN6QyxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sb0JBQW9CLENBQUM7QUFDOUMsT0FBTyxFQUFxTCx3QkFBd0IsRUFBRSxNQUFNLGtDQUFrQyxDQUFDO0FBQy9QLE9BQU8sRUFBZSxPQUFPLEVBQUUsWUFBWSxFQUFFLGVBQWUsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBQzNHLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxTQUFTLEVBQUUsU0FBUyxFQUFFLDRCQUE0QixFQUFFLHlCQUF5QixFQUFFLFNBQVMsRUFBRSxDQUFDLEVBQUUsYUFBYSxFQUFFLGlCQUFpQixFQUFFLGdCQUFnQixFQUFFLHNCQUFzQixFQUFFLGFBQWEsRUFBRSxNQUFNLGlDQUFpQyxDQUFDO0FBQ2hRLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLDREQUE0RCxDQUFDO0FBQ25HLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLHdCQUF3QixDQUFDO0FBQzNELE9BQU8sRUFBRSxLQUFLLEVBQUUsT0FBTyxFQUFFLE1BQU0sa0NBQWtDLENBQUM7QUFDbEUsT0FBTyxFQUFFLHVCQUF1QixFQUFTLE1BQU0sbURBQW1ELENBQUM7QUFDbkcsT0FBTyxFQUFFLDBCQUEwQixFQUFFLHdCQUF3QixFQUFFLE1BQU0sMEJBQTBCLENBQUM7QUFDaEcsT0FBTyxFQUFFLGFBQWEsRUFBRSxRQUFRLEVBQUUsTUFBTSxtREFBbUQsQ0FBQztBQUM1RixPQUFPLEVBQUUsb0JBQW9CLEVBQUUsTUFBTSx3REFB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