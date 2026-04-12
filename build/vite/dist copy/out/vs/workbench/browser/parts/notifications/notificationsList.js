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
import './media/notificationsList.css';
import { localize } from '../../../../nls.js';
import { $, getWindow, isAncestorOfActiveElement, trackFocus } from '../../../../base/browser/dom.js';
import { WorkbenchList } from '../../../../platform/list/browser/listService.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { NOTIFICATIONS_BACKGROUND } from '../../../common/theme.js';
import { NotificationsListDelegate, NotificationRenderer } from './notificationsViewer.js';
import { CopyNotificationMessageAction } from './notificationsActions.js';
import { IContextMenuService } from '../../../../platform/contextview/browser/contextView.js';
import { assertReturnsAllDefined } from '../../../../base/common/types.js';
import { NotificationFocusedContext } from '../../../common/contextkeys.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { NotificationActionRunner } from './notificationsCommands.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { withSeverityPrefix } from '../../../../platform/notification/common/notification.js';
let NotificationsList = class NotificationsList extends Disposable {
    constructor(container, options, instantiationService, contextMenuService) {
        super();
        this.container = container;
        this.options = options;
        this.instantiationService = instantiationService;
        this.contextMenuService = contextMenuService;
        this.viewModel = [];
    }
    show() {
        if (this.isVisible) {
            return; // already visible
        }
        // Lazily create if showing for the first time
        if (!this.list) {
            this.createNotificationsList();
        }
        // Make visible
        this.isVisible = true;
    }
    createNotificationsList() {
        // List Container
        this.listContainer = $('.notifications-list-container');
        const actionRunner = this._register(this.instantiationService.createInstance(NotificationActionRunner));
        // Notification Renderer
        const renderer = this.instantiationService.createInstance(NotificationRenderer, actionRunner);
        // List
        const listDelegate = this.listDelegate = new NotificationsListDelegate(this.listContainer);
        const options = this.options;
        const list = this.list = this._register(this.instantiationService.createInstance((WorkbenchList), 'NotificationsList', this.listContainer, listDelegate, [renderer], {
            ...options,
            setRowLineHeight: false,
            horizontalScrolling: false,
            overrideStyles: {
                listBackground: NOTIFICATIONS_BACKGROUND
            },
            accessibilityProvider: this.instantiationService.createInstance(NotificationAccessibilityProvider, options)
        }));
        // Context menu to copy message
        const copyAction = this._register(this.instantiationService.createInstance(CopyNotificationMessageAction, CopyNotificationMessageAction.ID, CopyNotificationMessageAction.LABEL));
        this._register((list.onContextMenu(e => {
            if (!e.element) {
                return;
            }
            this.contextMenuService.showContextMenu({
                getAnchor: () => e.anchor,
                getActions: () => [copyAction],
                getActionsContext: () => e.element,
                actionRunner
            });
        })));
        // Toggle on double click
        this._register((list.onMouseDblClick(event => event.element.toggle())));
        // Clear focus when DOM focus moves out
        // Use document.hasFocus() to not clear the focus when the entire window lost focus
        // This ensures that when the focus comes back, the notification is still focused
        const listFocusTracker = this._register(trackFocus(list.getHTMLElement()));
        this._register(listFocusTracker.onDidBlur(() => {
            if (getWindow(this.listContainer).document.hasFocus()) {
                list.setFocus([]);
            }
        }));
        // Context key
        NotificationFocusedContext.bindTo(list.contextKeyService);
        // Only allow for focus in notifications, as the
        // selection is too strong over the contents of
        // the notification
        this._register(list.onDidChangeSelection(e => {
            if (e.indexes.length > 0) {
                list.setSelection([]);
            }
        }));
        this.container.appendChild(this.listContainer);
    }
    updateNotificationsList(start, deleteCount, items = []) {
        const [list, listContainer] = assertReturnsAllDefined(this.list, this.listContainer);
        const listHasDOMFocus = isAncestorOfActiveElement(listContainer);
        // Remember focus and relative top of that item
        const focusedIndex = list.getFocus()[0];
        const focusedItem = this.viewModel[focusedIndex];
        let focusRelativeTop = null;
        if (typeof focusedIndex === 'number') {
            focusRelativeTop = list.getRelativeTop(focusedIndex);
        }
        // Update view model
        this.viewModel.splice(start, deleteCount, ...items);
        // Update list
        list.splice(start, deleteCount, items);
        list.layout();
        // Hide if no more notifications to show
        if (this.viewModel.length === 0) {
            this.hide();
        }
        // Otherwise restore focus if we had
        else if (typeof focusedIndex === 'number') {
            let indexToFocus = 0;
            if (focusedItem) {
                let indexToFocusCandidate = this.viewModel.indexOf(focusedItem);
                if (indexToFocusCandidate === -1) {
                    indexToFocusCandidate = focusedIndex - 1; // item could have been removed
                }
                if (indexToFocusCandidate < this.viewModel.length && indexToFocusCandidate >= 0) {
                    indexToFocus = indexToFocusCandidate;
                }
            }
            if (typeof focusRelativeTop === 'number') {
                list.reveal(indexToFocus, focusRelativeTop);
            }
            list.setFocus([indexToFocus]);
        }
        // Restore DOM focus if we had focus before
        if (this.isVisible && listHasDOMFocus) {
            list.domFocus();
        }
    }
    updateNotificationHeight(item) {
        const index = this.viewModel.indexOf(item);
        if (index === -1) {
            return;
        }
        const [list, listDelegate] = assertReturnsAllDefined(this.list, this.listDelegate);
        list.updateElementHeight(index, listDelegate.getHeight(item));
        list.layout();
    }
    hide() {
        if (!this.isVisible || !this.list) {
            return; // already hidden
        }
        // Hide
        this.isVisible = false;
        // Clear list
        this.list.splice(0, this.viewModel.length);
        // Clear view model
        this.viewModel = [];
    }
    focusFirst() {
        if (!this.list) {
            return; // not created yet
        }
        this.list.focusFirst();
        this.list.domFocus();
    }
    hasFocus() {
        if (!this.listContainer) {
            return false; // not created yet
        }
        return isAncestorOfActiveElement(this.listContainer);
    }
    layout(width, maxHeight) {
        if (this.listContainer && this.list) {
            this.listContainer.style.width = `${width}px`;
            if (typeof maxHeight === 'number') {
                this.list.getHTMLElement().style.maxHeight = `${maxHeight}px`;
            }
            this.list.layout();
        }
    }
    dispose() {
        this.hide();
        super.dispose();
    }
};
NotificationsList = __decorate([
    __param(2, IInstantiationService),
    __param(3, IContextMenuService)
], NotificationsList);
export { NotificationsList };
let NotificationAccessibilityProvider = class NotificationAccessibilityProvider {
    constructor(_options, _keybindingService, _configurationService) {
        this._options = _options;
        this._keybindingService = _keybindingService;
        this._configurationService = _configurationService;
    }
    getAriaLabel(element) {
        let accessibleViewHint;
        const keybinding = this._keybindingService.lookupKeybinding('editor.action.accessibleView')?.getAriaLabel();
        if (this._configurationService.getValue('accessibility.verbosity.notification')) {
            accessibleViewHint = keybinding ? localize('notificationAccessibleViewHint', "Inspect the response in the accessible view with {0}", keybinding) : localize('notificationAccessibleViewHintNoKb', "Inspect the response in the accessible view via the command Open Accessible View which is currently not triggerable via keybinding");
        }
        if (!element.source) {
            return withSeverityPrefix(accessibleViewHint ? localize('notificationAriaLabelHint', "{0}, notification, {1}", element.message.raw, accessibleViewHint) : localize('notificationAriaLabel', "{0}, notification", element.message.raw), element.severity);
        }
        return withSeverityPrefix(accessibleViewHint ? localize('notificationWithSourceAriaLabelHint', "{0}, source: {1}, notification, {2}", element.message.raw, element.source, accessibleViewHint) : localize('notificationWithSourceAriaLabel', "{0}, source: {1}, notification", element.message.raw, element.source), element.severity);
    }
    getWidgetAriaLabel() {
        return this._options.widgetAriaLabel ?? localize('notificationsList', "Notifications List");
    }
    getRole() {
        return 'dialog'; // https://github.com/microsoft/vscode/issues/82728
    }
};
NotificationAccessibilityProvider = __decorate([
    __param(1, IKeybindingService),
    __param(2, IConfigurationService)
], NotificationAccessibilityProvider);
export { NotificationAccessibilityProvider };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibm90aWZpY2F0aW9uc0xpc3QuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvYnJvd3Nlci9wYXJ0cy9ub3RpZmljYXRpb25zL25vdGlmaWNhdGlvbnNMaXN0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7O0FBRWhHLE9BQU8sK0JBQStCLENBQUM7QUFDdkMsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLG9CQUFvQixDQUFDO0FBQzlDLE9BQU8sRUFBRSxDQUFDLEVBQUUsU0FBUyxFQUFFLHlCQUF5QixFQUFFLFVBQVUsRUFBRSxNQUFNLGlDQUFpQyxDQUFDO0FBQ3RHLE9BQU8sRUFBRSxhQUFhLEVBQUUsTUFBTSxrREFBa0QsQ0FBQztBQUNqRixPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSw0REFBNEQsQ0FBQztBQUVuRyxPQUFPLEVBQUUsd0JBQXdCLEVBQUUsTUFBTSwwQkFBMEIsQ0FBQztBQUVwRSxPQUFPLEVBQUUseUJBQXlCLEVBQUUsb0JBQW9CLEVBQUUsTUFBTSwwQkFBMEIsQ0FBQztBQUMzRixPQUFPLEVBQUUsNkJBQTZCLEVBQUUsTUFBTSwyQkFBMkIsQ0FBQztBQUMxRSxPQUFPLEVBQUUsbUJBQW1CLEVBQUUsTUFBTSx5REFBeUQsQ0FBQztBQUM5RixPQUFPLEVBQUUsdUJBQXVCLEVBQUUsTUFBTSxrQ0FBa0MsQ0FBQztBQUMzRSxPQUFPLEVBQUUsMEJBQTBCLEVBQUUsTUFBTSxnQ0FBZ0MsQ0FBQztBQUM1RSxPQUFPLEVBQUUsVUFBVSxFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFFbEUsT0FBTyxFQUFFLHdCQUF3QixFQUFFLE1BQU0sNEJBQTRCLENBQUM7QUFDdEUsT0FBTyxFQUFFLGtCQUFrQixFQUFFLE1BQU0sc0RBQXNELENBQUM7QUFDMUYsT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0sNERB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