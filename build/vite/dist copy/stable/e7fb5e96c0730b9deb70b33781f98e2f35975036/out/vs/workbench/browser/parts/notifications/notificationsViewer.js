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
var NotificationRenderer_1, NotificationTemplateRenderer_1;
import { clearNode, addDisposableListener, EventType, EventHelper, $, isEventLike } from '../../../../base/browser/dom.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { URI } from '../../../../base/common/uri.js';
import { localize } from '../../../../nls.js';
import { ButtonBar } from '../../../../base/browser/ui/button/button.js';
import { ActionBar } from '../../../../base/browser/ui/actionbar/actionbar.js';
import { ActionRunner, Separator, toAction } from '../../../../base/common/actions.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { dispose, DisposableStore, Disposable } from '../../../../base/common/lifecycle.js';
import { IContextMenuService } from '../../../../platform/contextview/browser/contextView.js';
import { NotificationViewItem, ChoiceAction, getNotificationsPosition } from '../../../common/notifications.js';
import { ClearNotificationAction, ExpandNotificationAction, CollapseNotificationAction, ConfigureNotificationAction, getNotificationExpandIcon, getNotificationCollapseIcon } from './notificationsActions.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { ProgressBar } from '../../../../base/browser/ui/progressbar/progressbar.js';
import { INotificationService, NotificationsFilter, Severity, isNotificationSource } from '../../../../platform/notification/common/notification.js';
import { isNonEmptyArray } from '../../../../base/common/arrays.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { DropdownMenuActionViewItem } from '../../../../base/browser/ui/dropdown/dropdownActionViewItem.js';
import { DomEmitter } from '../../../../base/browser/event.js';
import { Gesture, EventType as GestureEventType } from '../../../../base/browser/touch.js';
import { Event } from '../../../../base/common/event.js';
import { defaultButtonStyles, defaultProgressBarStyles } from '../../../../platform/theme/browser/defaultStyles.js';
import { StandardKeyboardEvent } from '../../../../base/browser/keyboardEvent.js';
import { getDefaultHoverDelegate } from '../../../../base/browser/ui/hover/hoverDelegateFactory.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
export class NotificationsListDelegate {
    static { this.ROW_HEIGHT = 42; }
    static { this.LINE_HEIGHT = 22; }
    constructor(container) {
        this.offsetHelper = this.createOffsetHelper(container);
    }
    createOffsetHelper(container) {
        return container.appendChild($('.notification-offset-helper'));
    }
    getHeight(notification) {
        if (!notification.expanded) {
            return NotificationsListDelegate.ROW_HEIGHT; // return early if there are no more rows to show
        }
        // First row: message and actions
        let expandedHeight = NotificationsListDelegate.ROW_HEIGHT;
        // Dynamic height: if message overflows
        const preferredMessageHeight = this.computePreferredHeight(notification);
        const messageOverflows = NotificationsListDelegate.LINE_HEIGHT < preferredMessageHeight;
        if (messageOverflows) {
            const overflow = preferredMessageHeight - NotificationsListDelegate.LINE_HEIGHT;
            expandedHeight += overflow;
        }
        // Last row: source and buttons if we have any
        if (notification.source || isNonEmptyArray(notification.actions?.primary)) {
            expandedHeight += NotificationsListDelegate.ROW_HEIGHT;
        }
        // If the expanded height is same as collapsed, unset the expanded state
        // but skip events because there is no change that has visual impact
        if (expandedHeight === NotificationsListDelegate.ROW_HEIGHT) {
            notification.collapse(true /* skip events, no change in height */);
        }
        return expandedHeight;
    }
    computePreferredHeight(notification) {
        // Prepare offset helper depending on toolbar actions count
        let actions = 0;
        if (!notification.hasProgress) {
            actions++; // close
        }
        if (notification.canCollapse) {
            actions++; // expand/collapse
        }
        if (isNonEmptyArray(notification.actions?.secondary)) {
            actions++; // secondary actions
        }
        this.offsetHelper.style.width = `${450 /* notifications container width */ - (10 /* padding */ + 30 /* severity icon */ + (actions * 30) /* actions */ - (Math.max(actions - 1, 0) * 4) /* less padding for actions > 1 */)}px`;
        // Render message into offset helper
        const renderedMessage = NotificationMessageRenderer.render(notification.message);
        this.offsetHelper.appendChild(renderedMessage);
        // Compute height
        const preferredHeight = Math.max(this.offsetHelper.offsetHeight, this.offsetHelper.scrollHeight);
        // Always clear offset helper after use
        clearNode(this.offsetHelper);
        return preferredHeight;
    }
    getTemplateId(element) {
        if (element instanceof NotificationViewItem) {
            return NotificationRenderer.TEMPLATE_ID;
        }
        throw new Error('unknown element type: ' + element);
    }
}
class NotificationMessageRenderer {
    static render(message, actionHandler) {
        const messageContainer = $('span');
        for (const node of message.linkedText.nodes) {
            if (typeof node === 'string') {
                messageContainer.appendChild(document.createTextNode(node));
            }
            else {
                let title = node.title;
                if (!title && node.href.startsWith('command:')) {
                    title = localize('executeCommand', "Click to execute command '{0}'", node.href.substr('command:'.length));
                }
                else if (!title) {
                    title = node.href;
                }
                const anchor = $('a', { href: node.href, title, tabIndex: 0 }, node.label);
                if (actionHandler) {
                    const handleOpen = (e) => {
                        if (isEventLike(e)) {
                            EventHelper.stop(e, true);
                        }
                        actionHandler.callback(node.href);
                    };
                    const onClick = actionHandler.toDispose.add(new DomEmitter(anchor, EventType.CLICK)).event;
                    const onKeydown = actionHandler.toDispose.add(new DomEmitter(anchor, EventType.KEY_DOWN)).event;
                    const onSpaceOrEnter = Event.chain(onKeydown, $ => $.filter(e => {
                        const event = new StandardKeyboardEvent(e);
                        return event.equals(10 /* KeyCode.Space */) || event.equals(3 /* KeyCode.Enter */);
                    }));
                    actionHandler.toDispose.add(Gesture.addTarget(anchor));
                    const onTap = actionHandler.toDispose.add(new DomEmitter(anchor, GestureEventType.Tap)).event;
                    Event.any(onClick, onTap, onSpaceOrEnter)(handleOpen, null, actionHandler.toDispose);
                }
                messageContainer.appendChild(anchor);
            }
        }
        return messageContainer;
    }
}
let NotificationRenderer = class NotificationRenderer {
    static { NotificationRenderer_1 = this; }
    static { this.TEMPLATE_ID = 'notification'; }
    constructor(actionRunner, contextMenuService, instantiationService, notificationService) {
        this.actionRunner = actionRunner;
        this.contextMenuService = contextMenuService;
        this.instantiationService = instantiationService;
        this.notificationService = notificationService;
    }
    get templateId() {
        return NotificationRenderer_1.TEMPLATE_ID;
    }
    renderTemplate(container) {
        const data = Object.create(null);
        data.toDispose = new DisposableStore();
        // Container
        data.container = $('.notification-list-item');
        // Main Row
        data.mainRow = $('.notification-list-item-main-row');
        // Icon
        data.icon = $('.notification-list-item-icon.codicon');
        // Message
        data.message = $('.notification-list-item-message');
        // Toolbar
        const that = this;
        const toolbarContainer = $('.notification-list-item-toolbar-container');
        data.toolbar = new ActionBar(toolbarContainer, {
            ariaLabel: localize('notificationActions', "Notification Actions"),
            actionViewItemProvider: (action, options) => {
                if (action instanceof ConfigureNotificationAction) {
                    return data.toDispose.add(new DropdownMenuActionViewItem(action, {
                        getActions() {
                            const actions = [];
                            const source = { id: action.notification.sourceId, label: action.notification.source };
                            if (isNotificationSource(source)) {
                                const isSourceFiltered = that.notificationService.getFilter(source) === NotificationsFilter.ERROR;
                                actions.push(toAction({
                                    id: source.id,
                                    label: isSourceFiltered ? localize('turnOnNotifications', "Turn On All Notifications from '{0}'", source.label) : localize('turnOffNotifications', "Turn Off Info and Warning Notifications from '{0}'", source.label),
                                    run: () => that.notificationService.setFilter({ ...source, filter: isSourceFiltered ? NotificationsFilter.OFF : NotificationsFilter.ERROR })
                                }));
                                if (action.notification.actions?.secondary?.length) {
                                    actions.push(new Separator());
                                }
                            }
                            if (Array.isArray(action.notification.actions?.secondary)) {
                                actions.push(...action.notification.actions.secondary);
                            }
                            return actions;
                        },
                    }, this.contextMenuService, {
                        ...options,
                        actionRunner: this.actionRunner,
                        classNames: action.class
                    }));
                }
                return undefined;
            },
            actionRunner: this.actionRunner
        });
        data.toDispose.add(data.toolbar);
        // Details Row
        data.detailsRow = $('.notification-list-item-details-row');
        // Source
        data.source = $('.notification-list-item-source');
        // Buttons Container
        data.buttonsContainer = $('.notification-list-item-buttons-container');
        container.appendChild(data.container);
        // the details row appears first in order for better keyboard access to notification buttons
        data.container.appendChild(data.detailsRow);
        data.detailsRow.appendChild(data.source);
        data.detailsRow.appendChild(data.buttonsContainer);
        // main row
        data.container.appendChild(data.mainRow);
        data.mainRow.appendChild(data.icon);
        data.mainRow.appendChild(data.message);
        data.mainRow.appendChild(toolbarContainer);
        // Progress: below the rows to span the entire width of the item
        data.progress = new ProgressBar(container, defaultProgressBarStyles);
        data.toDispose.add(data.progress);
        // Renderer
        data.renderer = this.instantiationService.createInstance(NotificationTemplateRenderer, data, this.actionRunner);
        data.toDispose.add(data.renderer);
        return data;
    }
    renderElement(notification, index, data) {
        data.renderer.setInput(notification);
    }
    disposeTemplate(templateData) {
        dispose(templateData.toDispose);
    }
};
NotificationRenderer = NotificationRenderer_1 = __decorate([
    __param(1, IContextMenuService),
    __param(2, IInstantiationService),
    __param(3, INotificationService)
], NotificationRenderer);
export { NotificationRenderer };
let NotificationTemplateRenderer = class NotificationTemplateRenderer extends Disposable {
    static { NotificationTemplateRenderer_1 = this; }
    static updateExpandCollapseIcons(configurationService) {
        if (!NotificationTemplateRenderer_1.expandNotificationAction) {
            return;
        }
        const position = getNotificationsPosition(configurationService);
        NotificationTemplateRenderer_1.expandNotificationAction.class = ThemeIcon.asClassName(getNotificationExpandIcon(position));
        NotificationTemplateRenderer_1.collapseNotificationAction.class = ThemeIcon.asClassName(getNotificationCollapseIcon(position));
    }
    static { this.SEVERITIES = [Severity.Info, Severity.Warning, Severity.Error]; }
    constructor(template, actionRunner, openerService, instantiationService, keybindingService, contextMenuService, hoverService, configurationService) {
        super();
        this.template = template;
        this.actionRunner = actionRunner;
        this.openerService = openerService;
        this.instantiationService = instantiationService;
        this.keybindingService = keybindingService;
        this.contextMenuService = contextMenuService;
        this.hoverService = hoverService;
        this.inputDisposables = this._register(new DisposableStore());
        if (!NotificationTemplateRenderer_1.closeNotificationAction) {
            NotificationTemplateRenderer_1.closeNotificationAction = instantiationService.createInstance(ClearNotificationAction, ClearNotificationAction.ID, ClearNotificationAction.LABEL);
            NotificationTemplateRenderer_1.expandNotificationAction = instantiationService.createInstance(ExpandNotificationAction, ExpandNotificationAction.ID, ExpandNotificationAction.LABEL);
            NotificationTemplateRenderer_1.collapseNotificationAction = instantiationService.createInstance(CollapseNotificationAction, CollapseNotificationAction.ID, CollapseNotificationAction.LABEL);
            NotificationTemplateRenderer_1.updateExpandCollapseIcons(configurationService);
        }
        this._register(configurationService.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration("workbench.notifications.position" /* NotificationsSettings.NOTIFICATIONS_POSITION */)) {
                NotificationTemplateRenderer_1.updateExpandCollapseIcons(configurationService);
            }
        }));
    }
    setInput(notification) {
        this.inputDisposables.clear();
        this.render(notification);
    }
    render(notification) {
        // Container
        this.template.container.classList.toggle('expanded', notification.expanded);
        this.inputDisposables.add(addDisposableListener(this.template.container, EventType.MOUSE_UP, e => {
            if (e.button === 1 /* Middle Button */) {
                // Prevent firing the 'paste' event in the editor textarea - #109322
                EventHelper.stop(e, true);
            }
        }));
        this.inputDisposables.add(addDisposableListener(this.template.container, EventType.AUXCLICK, e => {
            if (!notification.hasProgress && e.button === 1 /* Middle Button */) {
                EventHelper.stop(e, true);
                notification.close();
            }
        }));
        // Severity Icon
        this.renderSeverity(notification);
        // Message
        const messageCustomHover = this.inputDisposables.add(this.hoverService.setupManagedHover(getDefaultHoverDelegate('mouse'), this.template.message, ''));
        const messageOverflows = this.renderMessage(notification, messageCustomHover);
        // Secondary Actions
        this.renderSecondaryActions(notification, messageOverflows);
        // Source
        const sourceCustomHover = this.inputDisposables.add(this.hoverService.setupManagedHover(getDefaultHoverDelegate('mouse'), this.template.source, ''));
        this.renderSource(notification, sourceCustomHover);
        // Buttons
        this.renderButtons(notification);
        // Progress
        this.renderProgress(notification);
        // Label Change Events that we can handle directly
        // (changes to actions require an entire redraw of
        // the notification because it has an impact on
        // epxansion state)
        this.inputDisposables.add(notification.onDidChangeContent(event => {
            switch (event.kind) {
                case 0 /* NotificationViewItemContentChangeKind.SEVERITY */:
                    this.renderSeverity(notification);
                    break;
                case 3 /* NotificationViewItemContentChangeKind.PROGRESS */:
                    this.renderProgress(notification);
                    break;
                case 1 /* NotificationViewItemContentChangeKind.MESSAGE */:
                    this.renderMessage(notification, messageCustomHover);
                    break;
            }
        }));
    }
    renderSeverity(notification) {
        // first remove, then set as the codicon class names overlap
        NotificationTemplateRenderer_1.SEVERITIES.forEach(severity => {
            if (notification.severity !== severity) {
                this.template.icon.classList.remove(...ThemeIcon.asClassNameArray(this.toSeverityIcon(severity)));
            }
        });
        this.template.icon.classList.add(...ThemeIcon.asClassNameArray(this.toSeverityIcon(notification.severity)));
    }
    renderMessage(notification, customHover) {
        clearNode(this.template.message);
        this.template.message.appendChild(NotificationMessageRenderer.render(notification.message, {
            callback: link => this.openerService.open(URI.parse(link), { allowCommands: true }),
            toDispose: this.inputDisposables
        }));
        const messageOverflows = notification.canCollapse && !notification.expanded && this.template.message.scrollWidth > this.template.message.clientWidth;
        customHover.update(messageOverflows ? this.template.message.textContent + '' : '');
        return messageOverflows;
    }
    renderSecondaryActions(notification, messageOverflows) {
        const actions = [];
        // Secondary Actions
        if (isNonEmptyArray(notification.actions?.secondary)) {
            const configureNotificationAction = this.instantiationService.createInstance(ConfigureNotificationAction, ConfigureNotificationAction.ID, ConfigureNotificationAction.LABEL, notification);
            actions.push(configureNotificationAction);
            this.inputDisposables.add(configureNotificationAction);
        }
        // Expand / Collapse
        let showExpandCollapseAction = false;
        if (notification.canCollapse) {
            if (notification.expanded) {
                showExpandCollapseAction = true; // allow to collapse an expanded message
            }
            else if (notification.source) {
                showExpandCollapseAction = true; // allow to expand to details row
            }
            else if (messageOverflows) {
                showExpandCollapseAction = true; // allow to expand if message overflows
            }
        }
        if (showExpandCollapseAction) {
            actions.push(notification.expanded ? NotificationTemplateRenderer_1.collapseNotificationAction : NotificationTemplateRenderer_1.expandNotificationAction);
        }
        // Close (unless progress is showing)
        if (!notification.hasProgress) {
            actions.push(NotificationTemplateRenderer_1.closeNotificationAction);
        }
        this.template.toolbar.clear();
        this.template.toolbar.context = notification;
        actions.forEach(action => this.template.toolbar.push(action, { icon: true, label: false, keybinding: this.getKeybindingLabel(action) }));
    }
    renderSource(notification, sourceCustomHover) {
        if (notification.expanded && notification.source) {
            this.template.source.textContent = localize('notificationSource', "Source: {0}", notification.source);
            sourceCustomHover.update(notification.source);
        }
        else {
            this.template.source.textContent = '';
            sourceCustomHover.update('');
        }
    }
    renderButtons(notification) {
        clearNode(this.template.buttonsContainer);
        const primaryActions = notification.actions ? notification.actions.primary : undefined;
        if (notification.expanded && isNonEmptyArray(primaryActions)) {
            const that = this;
            const actionRunner = this.inputDisposables.add(new class extends ActionRunner {
                async runAction(action) {
                    // Run action
                    that.actionRunner.run(action, notification);
                    // Hide notification (unless explicitly prevented)
                    if (!(action instanceof ChoiceAction) || !action.keepOpen) {
                        notification.close();
                    }
                }
            }());
            const buttonToolbar = this.inputDisposables.add(new ButtonBar(this.template.buttonsContainer));
            for (let i = 0; i < primaryActions.length; i++) {
                const action = primaryActions[i];
                const options = {
                    title: true, // assign titles to buttons in case they overflow
                    secondary: i > 0,
                    ...defaultButtonStyles
                };
                const dropdownActions = action instanceof ChoiceAction ? action.menu : undefined;
                const button = this.inputDisposables.add(dropdownActions ?
                    buttonToolbar.addButtonWithDropdown({
                        ...options,
                        contextMenuProvider: this.contextMenuService,
                        actions: dropdownActions,
                        actionRunner
                    }) :
                    buttonToolbar.addButton(options));
                button.label = action.label;
                this.inputDisposables.add(button.onDidClick(e => {
                    if (e) {
                        EventHelper.stop(e, true);
                    }
                    actionRunner.run(action);
                }));
            }
        }
    }
    renderProgress(notification) {
        // Return early if the item has no progress
        if (!notification.hasProgress) {
            this.template.progress.stop().hide();
            return;
        }
        // Infinite
        const state = notification.progress.state;
        if (state.infinite) {
            this.template.progress.infinite().show();
        }
        // Total / Worked
        else if (typeof state.total === 'number' || typeof state.worked === 'number') {
            if (typeof state.total === 'number' && !this.template.progress.hasTotal()) {
                this.template.progress.total(state.total);
            }
            if (typeof state.worked === 'number') {
                this.template.progress.setWorked(state.worked).show();
            }
        }
        // Done
        else {
            this.template.progress.done().hide();
        }
    }
    toSeverityIcon(severity) {
        switch (severity) {
            case Severity.Warning:
                return Codicon.warning;
            case Severity.Error:
                return Codicon.error;
        }
        return Codicon.info;
    }
    getKeybindingLabel(action) {
        const keybinding = this.keybindingService.lookupKeybinding(action.id);
        return keybinding ? keybinding.getLabel() : null;
    }
};
NotificationTemplateRenderer = NotificationTemplateRenderer_1 = __decorate([
    __param(2, IOpenerService),
    __param(3, IInstantiationService),
    __param(4, IKeybindingService),
    __param(5, IContextMenuService),
    __param(6, IHoverService),
    __param(7, IConfigurationService)
], NotificationTemplateRenderer);
export { NotificationTemplateRenderer };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibm90aWZpY2F0aW9uc1ZpZXdlci5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9icm93c2VyL3BhcnRzL25vdGlmaWNhdGlvbnMvbm90aWZpY2F0aW9uc1ZpZXdlci50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7Ozs7QUFHaEcsT0FBTyxFQUFFLFNBQVMsRUFBRSxxQkFBcUIsRUFBRSxTQUFTLEVBQUUsV0FBVyxFQUFFLENBQUMsRUFBRSxXQUFXLEVBQUUsTUFBTSxpQ0FBaUMsQ0FBQztBQUMzSCxPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0sOENBQThDLENBQUM7QUFDOUUsT0FBTyxFQUFFLEdBQUcsRUFBRSxNQUFNLGdDQUFnQyxDQUFDO0FBQ3JELE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxvQkFBb0IsQ0FBQztBQUM5QyxPQUFPLEVBQUUsU0FBUyxFQUFrQixNQUFNLDhDQUE4QyxDQUFDO0FBQ3pGLE9BQU8sRUFBRSxTQUFTLEVBQUUsTUFBTSxvREFBb0QsQ0FBQztBQUMvRSxPQUFPLEVBQUUsWUFBWSxFQUEwQixTQUFTLEVBQUUsUUFBUSxFQUFFLE1BQU0sb0NBQW9DLENBQUM7QUFDL0csT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0sNERBQTRELENBQUM7QUFDbkcsT0FBTyxFQUFFLE9BQU8sRUFBRSxlQUFlLEVBQUUsVUFBVSxFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFDNUYsT0FBTyxFQUFFLG1CQUFtQixFQUFFLE1BQU0seURBQXlELENBQUM7QUFDOUYsT0FBTyxFQUF5QixvQkFBb0IsRUFBK0QsWUFBWSxFQUF5Qix3QkFBd0IsRUFBRSxNQUFNLGtDQUFrQyxDQUFDO0FBQzNOLE9BQU8sRUFBRSx1QkFBdUIsRUFBRSx3QkFBd0IsRUFBRSwwQkFBMEIsRUFBRSwyQkFBMkIsRUFBRSx5QkFBeUIsRUFBRSwyQkFBMkIsRUFBRSxNQUFNLDJCQUEyQixDQUFDO0FBQy9NLE9BQU8sRUFBRSxrQkFBa0IsRUFBRSxNQUFNLHNEQUFzRCxDQUFDO0FBQzFGLE9BQU8sRUFBRSxXQUFXLEVBQUUsTUFBTSx3REFBd0QsQ0FBQztBQUNyRixPQUFPLEVBQUUsb0JBQW9CLEVBQUUsbUJBQW1CLEVBQUUsUUFBUSxFQUFFLG9CQUFvQixFQUFFLE1BQU0sMERBQTBELENBQUM7QUFDckosT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBQ3BFLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSxxQ0FBcUMsQ0FBQztBQUM5RCxPQUFPLEVBQUUsU0FBUyxFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFDakUsT0FBTyxFQUFFLDBCQUEwQixFQUFFLE1BQU0sZ0VBQWdFLENBQUM7QUFDNUcsT0FBTyxFQUFFLFVBQVUsRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBQy9ELE9BQU8sRUFBRSxPQUFPLEVBQUUsU0FBUyxJQUFJLGdCQUFnQixFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFDM0YsT0FBTyxFQUFFLEtBQUssRUFBRSxNQUFNLGtDQUFrQyxDQUFDO0FBQ3pELE9BQU8sRUFBRSxtQkFBbUIsRUFBRSx3QkFBd0IsRUFBRSxNQUFNLHFEQUFxRCxDQUFDO0FBRXBILE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLDJDQUEyQyxDQUFDO0FBQ2xGLE9BQU8sRUFBRSx1QkFBdUIsRUFBRSxNQUFNLDJEQUEyRCxDQUFDO0FBRXBHLE9BQU8sRUFBRSxhQUFhLEVBQUUsTUFBTSw2Q0FBNkMsQ0FBQztBQUM1RSxPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSw0REFBNEQsQ0FBQztBQUVuRyxNQUFNLE9BQU8seUJBQXlCO2FBRWIsZUFBVSxHQUFHLEVBQUUsQ0FBQzthQUNoQixnQkFBVyxHQUFHLEVBQUUsQ0FBQztJQUl6QyxZQUFZLFNBQXNCO1FBQ2pDLElBQUksQ0FBQyxZQUFZLEdBQUcsSUFBSSxDQUFDLGtCQUFrQixDQUFDLFNBQVMsQ0FBQyxDQUFDO0lBQ3hELENBQUM7SUFFTyxrQkFBa0IsQ0FBQyxTQUFzQjtRQUNoRCxPQUFPLFNBQVMsQ0FBQyxXQUFXLENBQUMsQ0FBQyxDQUFDLDZCQUE2QixDQUFDLENBQUMsQ0FBQztJQUNoRSxDQUFDO0lBRUQsU0FBUyxDQUFDLFlBQW1DO1FBQzVDLElBQUksQ0FBQyxZQUFZLENBQUMsUUFBUSxFQUFFLENBQUM7WUFDNUIsT0FBTyx5QkFBeUIsQ0FBQyxVQUFVLENBQUMsQ0FBQyxpREFBaUQ7UUFDL0YsQ0FBQztRQUVELGlDQUFpQztRQUNqQyxJQUFJLGNBQWMsR0FBRyx5QkFBeUIsQ0FBQyxVQUFVLENBQUM7UUFFMUQsdUNBQXVDO1FBQ3ZDLE1BQU0sc0JBQXNCLEdBQUcsSUFBSSxDQUFDLHNCQUFzQixDQUFDLFlBQVksQ0FBQyxDQUFDO1FBQ3pFLE1BQU0sZ0JBQWdCLEdBQUcseUJBQXlCLENBQUMsV0FBVyxHQUFHLHNCQUFzQixDQUFDO1FBQ3hGLElBQUksZ0JBQWdCLEVBQUUsQ0FBQztZQUN0QixNQUFNLFFBQVEsR0FBRyxzQkFBc0IsR0FBRyx5QkFBeUIsQ0FBQyxXQUFXLENBQUM7WUFDaEYsY0FBYyxJQUFJLFFBQVEsQ0FBQztRQUM1QixDQUFDO1FBRUQsOENBQThDO1FBQzlDLElBQUksWUFBWSxDQUFDLE1BQU0sSUFBSSxlQUFlLENBQUMsWUFBWSxDQUFDLE9BQU8sRUFBRSxPQUFPLENBQUMsRUFBRSxDQUFDO1lBQzNFLGNBQWMsSUFBSSx5QkFBeUIsQ0FBQyxVQUFVLENBQUM7UUFDeEQsQ0FBQztRQUVELHdFQUF3RTtRQUN4RSxvRUFBb0U7UUFDcEUsSUFBSSxjQUFjLEtBQUsseUJBQXlCLENBQUMsVUFBVSxFQUFFLENBQUM7WUFDN0QsWUFBWSxDQUFDLFFBQVEsQ0FBQyxJQUFJLENBQUMsc0NBQXNDLENBQUMsQ0FBQztRQUNwRSxDQUFDO1FBRUQsT0FBTyxjQUFjLENBQUM7SUFDdkIsQ0FBQztJQUVPLHNCQUFzQixDQUFDLFlBQW1DO1FBRWpFLDJEQUEyRDtRQUMzRCxJQUFJLE9BQU8sR0FBRyxDQUFDLENBQUM7UUFDaEIsSUFBSSxDQUFDLFlBQVksQ0FBQyxXQUFXLEVBQUUsQ0FBQztZQUMvQixPQUFPLEVBQUUsQ0FBQyxDQUFDLFFBQVE7UUFDcEIsQ0FBQztRQUNELElBQUksWUFBWSxDQUFDLFdBQVcsRUFBRSxDQUFDO1lBQzlCLE9BQU8sRUFBRSxDQUFDLENBQUMsa0JBQWtCO1FBQzlCLENBQUM7UUFDRCxJQUFJLGVBQWUsQ0FBQyxZQUFZLENBQUMsT0FBTyxFQUFFLFNBQVMsQ0FBQyxFQUFFLENBQUM7WUFDdEQsT0FBTyxFQUFFLENBQUMsQ0FBQyxvQkFBb0I7UUFDaEMsQ0FBQztRQUNELElBQUksQ0FBQyxZQUFZLENBQUMsS0FBSyxDQUFDLEtBQUssR0FBRyxHQUFHLEdBQUcsQ0FBQyxtQ0FBbUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxhQUFhLEdBQUcsRUFBRSxDQUFDLG1CQUFtQixHQUFHLENBQUMsT0FBTyxHQUFHLEVBQUUsQ0FBQyxDQUFDLGFBQWEsR0FBRyxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsT0FBTyxHQUFHLENBQUMsRUFBRSxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxrQ0FBa0MsQ0FBQyxJQUFJLENBQUM7UUFFaE8sb0NBQW9DO1FBQ3BDLE1BQU0sZUFBZSxHQUFHLDJCQUEyQixDQUFDLE1BQU0sQ0FBQyxZQUFZLENBQUMsT0FBTyxDQUFDLENBQUM7UUFDakYsSUFBSSxDQUFDLFlBQVksQ0FBQyxXQUFXLENBQUMsZUFBZSxDQUFDLENBQUM7UUFFL0MsaUJBQWlCO1FBQ2pCLE1BQU0sZUFBZSxHQUFHLElBQUksQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLFlBQVksQ0FBQyxZQUFZLEVBQUUsSUFBSSxDQUFDLFlBQVksQ0FBQyxZQUFZLENBQUMsQ0FBQztRQUVqRyx1Q0FBdUM7UUFDdkMsU0FBUyxDQUFDLElBQUksQ0FBQyxZQUFZLENBQUMsQ0FBQztRQUU3QixPQUFPLGVBQWUsQ0FBQztJQUN4QixDQUFDO0lBRUQsYUFBYSxDQUFDLE9BQThCO1FBQzNDLElBQUksT0FBTyxZQUFZLG9CQUFvQixFQUFFLENBQUM7WUFDN0MsT0FBTyxvQkFBb0IsQ0FBQyxXQUFXLENBQUM7UUFDekMsQ0FBQztRQUVELE1BQU0sSUFBSSxLQUFLLENBQUMsd0JBQXdCLEdBQUcsT0FBTyxDQUFDLENBQUM7SUFDckQsQ0FBQzs7QUEwQkYsTUFBTSwyQkFBMkI7SUFFaEMsTUFBTSxDQUFDLE1BQU0sQ0FBQyxPQUE2QixFQUFFLGFBQXFDO1FBQ2pGLE1BQU0sZ0JBQWdCLEdBQUcsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxDQUFDO1FBRW5DLEtBQUssTUFBTSxJQUFJLElBQUksT0FBTyxDQUFDLFVBQVUsQ0FBQyxLQUFLLEVBQUUsQ0FBQztZQUM3QyxJQUFJLE9BQU8sSUFBSSxLQUFLLFFBQVEsRUFBRSxDQUFDO2dCQUM5QixnQkFBZ0IsQ0FBQyxXQUFXLENBQUMsUUFBUSxDQUFDLGNBQWMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDO1lBQzdELENBQUM7aUJBQU0sQ0FBQztnQkFDUCxJQUFJLEtBQUssR0FBRyxJQUFJLENBQUMsS0FBSyxDQUFDO2dCQUV2QixJQUFJLENBQUMsS0FBSyxJQUFJLElBQUksQ0FBQyxJQUFJLENBQUMsVUFBVSxDQUFDLFVBQVUsQ0FBQyxFQUFFLENBQUM7b0JBQ2hELEtBQUssR0FBRyxRQUFRLENBQUMsZ0JBQWdCLEVBQUUsZ0NBQWdDLEVBQUUsSUFBSSxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsVUFBVSxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUM7Z0JBQzNHLENBQUM7cUJBQU0sSUFBSSxDQUFDLEtBQUssRUFBRSxDQUFDO29CQUNuQixLQUFLLEdBQUcsSUFBSSxDQUFDLElBQUksQ0FBQztnQkFDbkIsQ0FBQztnQkFFRCxNQUFNLE1BQU0sR0FBRyxDQUFDLENBQUMsR0FBRyxFQUFFLEVBQUUsSUFBSSxFQUFFLElBQUksQ0FBQyxJQUFJLEVBQUUsS0FBSyxFQUFFLFFBQVEsRUFBRSxDQUFDLEVBQUUsRUFBRSxJQUFJLENBQUMsS0FBSyxDQUFDLENBQUM7Z0JBRTNFLElBQUksYUFBYSxFQUFFLENBQUM7b0JBQ25CLE1BQU0sVUFBVSxHQUFHLENBQUMsQ0FBVSxFQUFFLEVBQUU7d0JBQ2pDLElBQUksV0FBVyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUM7NEJBQ3BCLFdBQVcsQ0FBQyxJQUFJLENBQUMsQ0FBQyxFQUFFLElBQUksQ0FBQyxDQUFDO3dCQUMzQixDQUFDO3dCQUVELGFBQWEsQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDO29CQUNuQyxDQUFDLENBQUM7b0JBRUYsTUFBTSxPQUFPLEdBQUcsYUFBYSxDQUFDLFNBQVMsQ0FBQyxHQUFHLENBQUMsSUFBSSxVQUFVLENBQUMsTUFBTSxFQUFFLFNBQVMsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQztvQkFFM0YsTUFBTSxTQUFTLEdBQUcsYUFBYSxDQUFDLFNBQVMsQ0FBQyxHQUFHLENBQUMsSUFBSSxVQUFVLENBQUMsTUFBTSxFQUFFLFNBQVMsQ0FBQyxRQUFRLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQztvQkFDaEcsTUFBTSxjQUFjLEdBQUcsS0FBSyxDQUFDLEtBQUssQ0FBQyxTQUFTLEVBQUUsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxFQUFFO3dCQUMvRCxNQUFNLEtBQUssR0FBRyxJQUFJLHFCQUFxQixDQUFDLENBQUMsQ0FBQyxDQUFDO3dCQUUzQyxPQUFPLEtBQUssQ0FBQyxNQUFNLHdCQUFlLElBQUksS0FBSyxDQUFDLE1BQU0sdUJBQWUsQ0FBQztvQkFDbkUsQ0FBQyxDQUFDLENBQUMsQ0FBQztvQkFFSixhQUFhLENBQUMsU0FBUyxDQUFDLEdBQUcsQ0FBQyxPQUFPLENBQUMsU0FBUyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUM7b0JBQ3ZELE1BQU0sS0FBSyxHQUFHLGFBQWEsQ0FBQyxTQUFTLENBQUMsR0FBRyxDQUFDLElBQUksVUFBVSxDQUFDLE1BQU0sRUFBRSxnQkFBZ0IsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQztvQkFFOUYsS0FBSyxDQUFDLEdBQUcsQ0FBQyxPQUFPLEVBQUUsS0FBSyxFQUFFLGNBQWMsQ0FBQyxDQUFDLFVBQVUsRUFBRSxJQUFJLEVBQUUsYUFBYSxDQUFDLFNBQVMsQ0FBQyxDQUFDO2dCQUN0RixDQUFDO2dCQUVELGdCQUFnQixDQUFDLFdBQVcsQ0FBQyxNQUFNLENBQUMsQ0FBQztZQUN0QyxDQUFDO1FBQ0YsQ0FBQztRQUVELE9BQU8sZ0JBQWdCLENBQUM7SUFDekIsQ0FBQztDQUNEO0FBRU0sSUFBTSxvQkFBb0IsR0FBMUIsTUFBTSxvQkFBb0I7O2FBRWhCLGdCQUFXLEdBQUcsY0FBYyxBQUFqQixDQUFrQjtJQUU3QyxZQUNTLFlBQTJCLEVBQ0csa0JBQXVDLEVBQ3JDLG9CQUEyQyxFQUM1QyxtQkFBeUM7UUFIeEUsaUJBQVksR0FBWixZQUFZLENBQWU7UUFDRyx1QkFBa0IsR0FBbEIsa0JBQWtCLENBQXFCO1FBQ3JDLHlCQUFvQixHQUFwQixvQkFBb0IsQ0FBdUI7UUFDNUMsd0JBQW1CLEdBQW5CLG1CQUFtQixDQUFzQjtJQUVqRixDQUFDO0lBRUQsSUFBSSxVQUFVO1FBQ2IsT0FBTyxzQkFBb0IsQ0FBQyxXQUFXLENBQUM7SUFDekMsQ0FBQztJQUVELGNBQWMsQ0FBQyxTQUFzQjtRQUNwQyxNQUFNLElBQUksR0FBOEIsTUFBTSxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUM1RCxJQUFJLENBQUMsU0FBUyxHQUFHLElBQUksZUFBZSxFQUFFLENBQUM7UUFFdkMsWUFBWTtRQUNaLElBQUksQ0FBQyxTQUFTLEdBQUcsQ0FBQyxDQUFDLHlCQUF5QixDQUFDLENBQUM7UUFFOUMsV0FBVztRQUNYLElBQUksQ0FBQyxPQUFPLEdBQUcsQ0FBQyxDQUFDLGtDQUFrQyxDQUFDLENBQUM7UUFFckQsT0FBTztRQUNQLElBQUksQ0FBQyxJQUFJLEdBQUcsQ0FBQyxDQUFDLHNDQUFzQyxDQUFDLENBQUM7UUFFdEQsVUFBVTtRQUNWLElBQUksQ0FBQyxPQUFPLEdBQUcsQ0FBQyxDQUFDLGlDQUFpQyxDQUFDLENBQUM7UUFFcEQsVUFBVTtRQUNWLE1BQU0sSUFBSSxHQUFHLElBQUksQ0FBQztRQUNsQixNQUFNLGdCQUFnQixHQUFHLENBQUMsQ0FBQywyQ0FBMkMsQ0FBQyxDQUFDO1FBQ3hFLElBQUksQ0FBQyxPQUFPLEdBQUcsSUFBSSxTQUFTLENBQzNCLGdCQUFnQixFQUNoQjtZQUNDLFNBQVMsRUFBRSxRQUFRLENBQUMscUJBQXFCLEVBQUUsc0JBQXNCLENBQUM7WUFDbEUsc0JBQXNCLEVBQUUsQ0FBQyxNQUFNLEVBQUUsT0FBTyxFQUFFLEVBQUU7Z0JBQzNDLElBQUksTUFBTSxZQUFZLDJCQUEyQixFQUFFLENBQUM7b0JBQ25ELE9BQU8sSUFBSSxDQUFDLFNBQVMsQ0FBQyxHQUFHLENBQUMsSUFBSSwwQkFBMEIsQ0FBQyxNQUFNLEVBQUU7d0JBQ2hFLFVBQVU7NEJBQ1QsTUFBTSxPQUFPLEdBQWMsRUFBRSxDQUFDOzRCQUU5QixNQUFNLE1BQU0sR0FBRyxFQUFFLEVBQUUsRUFBRSxNQUFNLENBQUMsWUFBWSxDQUFDLFFBQVEsRUFBRSxLQUFLLEVBQUUsTUFBTSxDQUFDLFlBQVksQ0FBQyxNQUFNLEVBQUUsQ0FBQzs0QkFDdkYsSUFBSSxvQkFBb0IsQ0FBQyxNQUFNLENBQUMsRUFBRSxDQUFDO2dDQUNsQyxNQUFNLGdCQUFnQixHQUFHLElBQUksQ0FBQyxtQkFBbUIsQ0FBQyxTQUFTLENBQUMsTUFBTSxDQUFDLEtBQUssbUJBQW1CLENBQUMsS0FBSyxDQUFDO2dDQUNsRyxPQUFPLENBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQztvQ0FDckIsRUFBRSxFQUFFLE1BQU0sQ0FBQyxFQUFFO29DQUNiLEtBQUssRUFBRSxnQkFBZ0IsQ0FBQyxDQUFDLENBQUMsUUFBUSxDQUFDLHFCQUFxQixFQUFFLHNDQUFzQyxFQUFFLE1BQU0sQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsUUFBUSxDQUFDLHNCQUFzQixFQUFFLG9EQUFvRCxFQUFFLE1BQU0sQ0FBQyxLQUFLLENBQUM7b0NBQ3ROLEdBQUcsRUFBRSxHQUFHLEVBQUUsQ0FBQyxJQUFJLENBQUMsbUJBQW1CLENBQUMsU0FBUyxDQUFDLEVBQUUsR0FBRyxNQUFNLEVBQUUsTUFBTSxFQUFFLGdCQUFnQixDQUFDLENBQUMsQ0FBQyxtQkFBbUIsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLG1CQUFtQixDQUFDLEtBQUssRUFBRSxDQUFDO2lDQUM1SSxDQUFDLENBQUMsQ0FBQztnQ0FFSixJQUFJLE1BQU0sQ0FBQyxZQUFZLENBQUMsT0FBTyxFQUFFLFNBQVMsRUFBRSxNQUFNLEVBQUUsQ0FBQztvQ0FDcEQsT0FBTyxDQUFDLElBQUksQ0FBQyxJQUFJLFNBQVMsRUFBRSxDQUFDLENBQUM7Z0NBQy9CLENBQUM7NEJBQ0YsQ0FBQzs0QkFFRCxJQUFJLEtBQUssQ0FBQyxPQUFPLENBQUMsTUFBTSxDQUFDLFlBQVksQ0FBQyxPQUFPLEVBQUUsU0FBUyxDQUFDLEVBQUUsQ0FBQztnQ0FDM0QsT0FBTyxDQUFDLElBQUksQ0FBQyxHQUFHLE1BQU0sQ0FBQyxZQUFZLENBQUMsT0FBTyxDQUFDLFNBQVMsQ0FBQyxDQUFDOzRCQUN4RCxDQUFDOzRCQUVELE9BQU8sT0FBTyxDQUFDO3dCQUNoQixDQUFDO3FCQUNELEVBQUUsSUFBSSxDQUFDLGtCQUFrQixFQUFFO3dCQUMzQixHQUFHLE9BQU87d0JBQ1YsWUFBWSxFQUFFLElBQUksQ0FBQyxZQUFZO3dCQUMvQixVQUFVLEVBQUUsTUFBTSxDQUFDLEtBQUs7cUJBQ3hCLENBQUMsQ0FBQyxDQUFDO2dCQUNMLENBQUM7Z0JBRUQsT0FBTyxTQUFTLENBQUM7WUFDbEIsQ0FBQztZQUNELFlBQVksRUFBRSxJQUFJLENBQUMsWUFBWTtTQUMvQixDQUNELENBQUM7UUFDRixJQUFJLENBQUMsU0FBUyxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLENBQUM7UUFFakMsY0FBYztRQUNkLElBQUksQ0FBQyxVQUFVLEdBQUcsQ0FBQyxDQUFDLHFDQUFxQyxDQUFDLENBQUM7UUFFM0QsU0FBUztRQUNULElBQUksQ0FBQyxNQUFNLEdBQUcsQ0FBQyxDQUFDLGdDQUFnQyxDQUFDLENBQUM7UUFFbEQsb0JBQW9CO1FBQ3BCLElBQUksQ0FBQyxnQkFBZ0IsR0FBRyxDQUFDLENBQUMsMkNBQTJDLENBQUMsQ0FBQztRQUV2RSxTQUFTLENBQUMsV0FBVyxDQUFDLElBQUksQ0FBQyxTQUFTLENBQUMsQ0FBQztRQUV0Qyw0RkFBNEY7UUFDNUYsSUFBSSxDQUFDLFNBQVMsQ0FBQyxXQUFXLENBQUMsSUFBSSxDQUFDLFVBQVUsQ0FBQyxDQUFDO1FBQzVDLElBQUksQ0FBQyxVQUFVLENBQUMsV0FBVyxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsQ0FBQztRQUN6QyxJQUFJLENBQUMsVUFBVSxDQUFDLFdBQVcsQ0FBQyxJQUFJLENBQUMsZ0JBQWdCLENBQUMsQ0FBQztRQUVuRCxXQUFXO1FBQ1gsSUFBSSxDQUFDLFNBQVMsQ0FBQyxXQUFXLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxDQUFDO1FBQ3pDLElBQUksQ0FBQyxPQUFPLENBQUMsV0FBVyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUNwQyxJQUFJLENBQUMsT0FBTyxDQUFDLFdBQVcsQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLENBQUM7UUFDdkMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxXQUFXLENBQUMsZ0JBQWdCLENBQUMsQ0FBQztRQUUzQyxnRUFBZ0U7UUFDaEUsSUFBSSxDQUFDLFFBQVEsR0FBRyxJQUFJLFdBQVcsQ0FBQyxTQUFTLEVBQUUsd0JBQXdCLENBQUMsQ0FBQztRQUNyRSxJQUFJLENBQUMsU0FBUyxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsUUFBUSxDQUFDLENBQUM7UUFFbEMsV0FBVztRQUNYLElBQUksQ0FBQyxRQUFRLEdBQUcsSUFBSSxDQUFDLG9CQUFvQixDQUFDLGNBQWMsQ0FBQyw0QkFBNEIsRUFBRSxJQUFJLEVBQUUsSUFBSSxDQUFDLFlBQVksQ0FBQyxDQUFDO1FBQ2hILElBQUksQ0FBQyxTQUFTLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxRQUFRLENBQUMsQ0FBQztRQUVsQyxPQUFPLElBQUksQ0FBQztJQUNiLENBQUM7SUFFRCxhQUFhLENBQUMsWUFBbUMsRUFBRSxLQUFhLEVBQUUsSUFBK0I7UUFDaEcsSUFBSSxDQUFDLFFBQVEsQ0FBQyxRQUFRLENBQUMsWUFBWSxDQUFDLENBQUM7SUFDdEMsQ0FBQztJQUVELGVBQWUsQ0FBQyxZQUF1QztRQUN0RCxPQUFPLENBQUMsWUFBWSxDQUFDLFNBQVMsQ0FBQyxDQUFDO0lBQ2pDLENBQUM7O0FBdEhXLG9CQUFvQjtJQU05QixXQUFBLG1CQUFtQixDQUFBO0lBQ25CLFdBQUEscUJBQXFCLENBQUE7SUFDckIsV0FBQSxvQkFBb0IsQ0FBQTtHQVJWLG9CQUFvQixDQXVIaEM7O0FBRU0sSUFBTSw0QkFBNEIsR0FBbEMsTUFBTSw0QkFBNkIsU0FBUSxVQUFVOztJQU1uRCxNQUFNLENBQUMseUJBQXlCLENBQUMsb0JBQTJDO1FBQ25GLElBQUksQ0FBQyw4QkFBNEIsQ0FBQyx3QkFBd0IsRUFBRSxDQUFDO1lBQzVELE9BQU87UUFDUixDQUFDO1FBRUQsTUFBTSxRQUFRLEdBQUcsd0JBQXdCLENBQUMsb0JBQW9CLENBQUMsQ0FBQztRQUNoRSw4QkFBNEIsQ0FBQyx3QkFBd0IsQ0FBQyxLQUFLLEdBQUcsU0FBUyxDQUFDLFdBQVcsQ0FBQyx5QkFBeUIsQ0FBQyxRQUFRLENBQUMsQ0FBQyxDQUFDO1FBQ3pILDhCQUE0QixDQUFDLDBCQUEwQixDQUFDLEtBQUssR0FBRyxTQUFTLENBQUMsV0FBVyxDQUFDLDJCQUEyQixDQUFDLFFBQVEsQ0FBQyxDQUFDLENBQUM7SUFDOUgsQ0FBQzthQUV1QixlQUFVLEdBQUcsQ0FBQyxRQUFRLENBQUMsSUFBSSxFQUFFLFFBQVEsQ0FBQyxPQUFPLEVBQUUsUUFBUSxDQUFDLEtBQUssQ0FBQyxBQUFwRCxDQUFxRDtJQUl2RixZQUNTLFFBQW1DLEVBQ25DLFlBQTJCLEVBQ25CLGFBQThDLEVBQ3ZDLG9CQUE0RCxFQUMvRCxpQkFBc0QsRUFDckQsa0JBQXdELEVBQzlELFlBQTRDLEVBQ3BDLG9CQUEyQztRQUVsRSxLQUFLLEVBQUUsQ0FBQztRQVRBLGFBQVEsR0FBUixRQUFRLENBQTJCO1FBQ25DLGlCQUFZLEdBQVosWUFBWSxDQUFlO1FBQ0Ysa0JBQWEsR0FBYixhQUFhLENBQWdCO1FBQ3RCLHlCQUFvQixHQUFwQixvQkFBb0IsQ0FBdUI7UUFDOUMsc0JBQWlCLEdBQWpCLGlCQUFpQixDQUFvQjtRQUNwQyx1QkFBa0IsR0FBbEIsa0JBQWtCLENBQXFCO1FBQzdDLGlCQUFZLEdBQVosWUFBWSxDQUFlO1FBVDNDLHFCQUFnQixHQUFHLElBQUksQ0FBQyxTQUFTLENBQUMsSUFBSSxlQUFlLEVBQUUsQ0FBQyxDQUFDO1FBY3pFLElBQUksQ0FBQyw4QkFBNEIsQ0FBQyx1QkFBdUIsRUFBRSxDQUFDO1lBQzNELDhCQUE0QixDQUFDLHVCQUF1QixHQUFHLG9CQUFvQixDQUFDLGNBQWMsQ0FBQyx1QkFBdUIsRUFBRSx1QkFBdUIsQ0FBQyxFQUFFLEVBQUUsdUJBQXVCLENBQUMsS0FBSyxDQUFDLENBQUM7WUFDL0ssOEJBQTRCLENBQUMsd0JBQXdCLEdBQUcsb0JBQW9CLENBQUMsY0FBYyxDQUFDLHdCQUF3QixFQUFFLHdCQUF3QixDQUFDLEVBQUUsRUFBRSx3QkFBd0IsQ0FBQyxLQUFLLENBQUMsQ0FBQztZQUNuTCw4QkFBNEIsQ0FBQywwQkFBMEIsR0FBRyxvQkFBb0IsQ0FBQyxjQUFjLENBQUMsMEJBQTBCLEVBQUUsMEJBQTBCLENBQUMsRUFBRSxFQUFFLDBCQUEwQixDQUFDLEtBQUssQ0FBQyxDQUFDO1lBQzNMLDhCQUE0QixDQUFDLHlCQUF5QixDQUFDLG9CQUFvQixDQUFDLENBQUM7UUFDOUUsQ0FBQztRQUVELElBQUksQ0FBQyxTQUFTLENBQUMsb0JBQW9CLENBQUMsd0JBQXdCLENBQUMsQ0FBQyxDQUFDLEVBQUU7WUFDaEUsSUFBSSxDQUFDLENBQUMsb0JBQW9CLHVGQUE4QyxFQUFFLENBQUM7Z0JBQzFFLDhCQUE0QixDQUFDLHlCQUF5QixDQUFDLG9CQUFvQixDQUFDLENBQUM7WUFDOUUsQ0FBQztRQUNGLENBQUMsQ0FBQyxDQUFDLENBQUM7SUFDTCxDQUFDO0lBRUQsUUFBUSxDQUFDLFlBQW1DO1FBQzNDLElBQUksQ0FBQyxnQkFBZ0IsQ0FBQyxLQUFLLEVBQUUsQ0FBQztRQUU5QixJQUFJLENBQUMsTUFBTSxDQUFDLFlBQVksQ0FBQyxDQUFDO0lBQzNCLENBQUM7SUFFTyxNQUFNLENBQUMsWUFBbUM7UUFFakQsWUFBWTtRQUNaLElBQUksQ0FBQyxRQUFRLENBQUMsU0FBUyxDQUFDLFNBQVMsQ0FBQyxNQUFNLENBQUMsVUFBVSxFQUFFLFlBQVksQ0FBQyxRQUFRLENBQUMsQ0FBQztRQUM1RSxJQUFJLENBQUMsZ0JBQWdCLENBQUMsR0FBRyxDQUFDLHFCQUFxQixDQUFDLElBQUksQ0FBQyxRQUFRLENBQUMsU0FBUyxFQUFFLFNBQVMsQ0FBQyxRQUFRLEVBQUUsQ0FBQyxDQUFDLEVBQUU7WUFDaEcsSUFBSSxDQUFDLENBQUMsTUFBTSxLQUFLLENBQUMsQ0FBQyxtQkFBbUIsRUFBRSxDQUFDO2dCQUN4QyxvRUFBb0U7Z0JBQ3BFLFdBQVcsQ0FBQyxJQUFJLENBQUMsQ0FBQyxFQUFFLElBQUksQ0FBQyxDQUFDO1lBQzNCLENBQUM7UUFDRixDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQ0osSUFBSSxDQUFDLGdCQUFnQixDQUFDLEdBQUcsQ0FBQyxxQkFBcUIsQ0FBQyxJQUFJLENBQUMsUUFBUSxDQUFDLFNBQVMsRUFBRSxTQUFTLENBQUMsUUFBUSxFQUFFLENBQUMsQ0FBQyxFQUFFO1lBQ2hHLElBQUksQ0FBQyxZQUFZLENBQUMsV0FBVyxJQUFJLENBQUMsQ0FBQyxNQUFNLEtBQUssQ0FBQyxDQUFDLG1CQUFtQixFQUFFLENBQUM7Z0JBQ3JFLFdBQVcsQ0FBQyxJQUFJLENBQUMsQ0FBQyxFQUFFLElBQUksQ0FBQyxDQUFDO2dCQUUxQixZQUFZLENBQUMsS0FBSyxFQUFFLENBQUM7WUFDdEIsQ0FBQztRQUNGLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFFSixnQkFBZ0I7UUFDaEIsSUFBSSxDQUFDLGNBQWMsQ0FBQyxZQUFZLENBQUMsQ0FBQztRQUVsQyxVQUFVO1FBQ1YsTUFBTSxrQkFBa0IsR0FBRyxJQUFJLENBQUMsZ0JBQWdCLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxZQUFZLENBQUMsaUJBQWlCLENBQUMsdUJBQXVCLENBQUMsT0FBTyxDQUFDLEVBQUUsSUFBSSxDQUFDLFFBQVEsQ0FBQyxPQUFPLEVBQUUsRUFBRSxDQUFDLENBQUMsQ0FBQztRQUN2SixNQUFNLGdCQUFnQixHQUFHLElBQUksQ0FBQyxhQUFhLENBQUMsWUFBWSxFQUFFLGtCQUFrQixDQUFDLENBQUM7UUFFOUUsb0JBQW9CO1FBQ3BCLElBQUksQ0FBQyxzQkFBc0IsQ0FBQyxZQUFZLEVBQUUsZ0JBQWdCLENBQUMsQ0FBQztRQUU1RCxTQUFTO1FBQ1QsTUFBTSxpQkFBaUIsR0FBRyxJQUFJLENBQUMsZ0JBQWdCLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxZQUFZLENBQUMsaUJBQWlCLENBQUMsdUJBQXVCLENBQUMsT0FBTyxDQUFDLEVBQUUsSUFBSSxDQUFDLFFBQVEsQ0FBQyxNQUFNLEVBQUUsRUFBRSxDQUFDLENBQUMsQ0FBQztRQUNySixJQUFJLENBQUMsWUFBWSxDQUFDLFlBQVksRUFBRSxpQkFBaUIsQ0FBQyxDQUFDO1FBRW5ELFVBQVU7UUFDVixJQUFJLENBQUMsYUFBYSxDQUFDLFlBQVksQ0FBQyxDQUFDO1FBRWpDLFdBQVc7UUFDWCxJQUFJLENBQUMsY0FBYyxDQUFDLFlBQVksQ0FBQyxDQUFDO1FBRWxDLGtEQUFrRDtRQUNsRCxrREFBa0Q7UUFDbEQsK0NBQStDO1FBQy9DLG1CQUFtQjtRQUNuQixJQUFJLENBQUMsZ0JBQWdCLENBQUMsR0FBRyxDQUFDLFlBQVksQ0FBQyxrQkFBa0IsQ0FBQyxLQUFLLENBQUMsRUFBRTtZQUNqRSxRQUFRLEtBQUssQ0FBQyxJQUFJLEVBQUUsQ0FBQztnQkFDcEI7b0JBQ0MsSUFBSSxDQUFDLGNBQWMsQ0FBQyxZQUFZLENBQUMsQ0FBQztvQkFDbEMsTUFBTTtnQkFDUDtvQkFDQyxJQUFJLENBQUMsY0FBYyxDQUFDLFlBQVksQ0FBQyxDQUFDO29CQUNsQyxNQUFNO2dCQUNQO29CQUNDLElBQUksQ0FBQyxhQUFhLENBQUMsWUFBWSxFQUFFLGtCQUFrQixDQUFDLENBQUM7b0JBQ3JELE1BQU07WUFDUixDQUFDO1FBQ0YsQ0FBQyxDQUFDLENBQUMsQ0FBQztJQUNMLENBQUM7SUFFTyxjQUFjLENBQUMsWUFBbUM7UUFDekQsNERBQTREO1FBQzVELDhCQUE0QixDQUFDLFVBQVUsQ0FBQyxPQUFPLENBQUMsUUFBUSxDQUFDLEVBQUU7WUFDMUQsSUFBSSxZQUFZLENBQUMsUUFBUSxLQUFLLFFBQVEsRUFBRSxDQUFDO2dCQUN4QyxJQUFJLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxTQUFTLENBQUMsTUFBTSxDQUFDLEdBQUcsU0FBUyxDQUFDLGdCQUFnQixDQUFDLElBQUksQ0FBQyxjQUFjLENBQUMsUUFBUSxDQUFDLENBQUMsQ0FBQyxDQUFDO1lBQ25HLENBQUM7UUFDRixDQUFDLENBQUMsQ0FBQztRQUNILElBQUksQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLFNBQVMsQ0FBQyxHQUFHLENBQUMsR0FBRyxTQUFTLENBQUMsZ0JBQWdCLENBQUMsSUFBSSxDQUFDLGNBQWMsQ0FBQyxZQUFZLENBQUMsUUFBUSxDQUFDLENBQUMsQ0FBQyxDQUFDO0lBQzdHLENBQUM7SUFFTyxhQUFhLENBQUMsWUFBbUMsRUFBRSxXQUEwQjtRQUNwRixTQUFTLENBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxPQUFPLENBQUMsQ0FBQztRQUNqQyxJQUFJLENBQUMsUUFBUSxDQUFDLE9BQU8sQ0FBQyxXQUFXLENBQUMsMkJBQTJCLENBQUMsTUFBTSxDQUFDLFlBQVksQ0FBQyxPQUFPLEVBQUU7WUFDMUYsUUFBUSxFQUFFLElBQUksQ0FBQyxFQUFFLENBQUMsSUFBSSxDQUFDLGFBQWEsQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsRUFBRSxFQUFFLGFBQWEsRUFBRSxJQUFJLEVBQUUsQ0FBQztZQUNuRixTQUFTLEVBQUUsSUFBSSxDQUFDLGdCQUFnQjtTQUNoQyxDQUFDLENBQUMsQ0FBQztRQUVKLE1BQU0sZ0JBQWdCLEdBQUcsWUFBWSxDQUFDLFdBQVcsSUFBSSxDQUFDLFlBQVksQ0FBQyxRQUFRLElBQUksSUFBSSxDQUFDLFFBQVEsQ0FBQyxPQUFPLENBQUMsV0FBVyxHQUFHLElBQUksQ0FBQyxRQUFRLENBQUMsT0FBTyxDQUFDLFdBQVcsQ0FBQztRQUVySixXQUFXLENBQUMsTUFBTSxDQUFDLGdCQUFnQixDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsUUFBUSxDQUFDLE9BQU8sQ0FBQyxXQUFXLEdBQUcsRUFBRSxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQztRQUVuRixPQUFPLGdCQUFnQixDQUFDO0lBQ3pCLENBQUM7SUFFTyxzQkFBc0IsQ0FBQyxZQUFtQyxFQUFFLGdCQUF5QjtRQUM1RixNQUFNLE9BQU8sR0FBYyxFQUFFLENBQUM7UUFFOUIsb0JBQW9CO1FBQ3BCLElBQUksZUFBZSxDQUFDLFlBQVksQ0FBQyxPQUFPLEVBQUUsU0FBUyxDQUFDLEVBQUUsQ0FBQztZQUN0RCxNQUFNLDJCQUEyQixHQUFHLElBQUksQ0FBQyxvQkFBb0IsQ0FBQyxjQUFjLENBQUMsMkJBQTJCLEVBQUUsMkJBQTJCLENBQUMsRUFBRSxFQUFFLDJCQUEyQixDQUFDLEtBQUssRUFBRSxZQUFZLENBQUMsQ0FBQztZQUMzTCxPQUFPLENBQUMsSUFBSSxDQUFDLDJCQUEyQixDQUFDLENBQUM7WUFDMUMsSUFBSSxDQUFDLGdCQUFnQixDQUFDLEdBQUcsQ0FBQywyQkFBMkIsQ0FBQyxDQUFDO1FBQ3hELENBQUM7UUFFRCxvQkFBb0I7UUFDcEIsSUFBSSx3QkFBd0IsR0FBRyxLQUFLLENBQUM7UUFDckMsSUFBSSxZQUFZLENBQUMsV0FBVyxFQUFFLENBQUM7WUFDOUIsSUFBSSxZQUFZLENBQUMsUUFBUSxFQUFFLENBQUM7Z0JBQzNCLHdCQUF3QixHQUFHLElBQUksQ0FBQyxDQUFDLHdDQUF3QztZQUMxRSxDQUFDO2lCQUFNLElBQUksWUFBWSxDQUFDLE1BQU0sRUFBRSxDQUFDO2dCQUNoQyx3QkFBd0IsR0FBRyxJQUFJLENBQUMsQ0FBQyxpQ0FBaUM7WUFDbkUsQ0FBQztpQkFBTSxJQUFJLGdCQUFnQixFQUFFLENBQUM7Z0JBQzdCLHdCQUF3QixHQUFHLElBQUksQ0FBQyxDQUFDLHVDQUF1QztZQUN6RSxDQUFDO1FBQ0YsQ0FBQztRQUVELElBQUksd0JBQXdCLEVBQUUsQ0FBQztZQUM5QixPQUFPLENBQUMsSUFBSSxDQUFDLFlBQVksQ0FBQyxRQUFRLENBQUMsQ0FBQyxDQUFDLDhCQUE0QixDQUFDLDBCQUEwQixDQUFDLENBQUMsQ0FBQyw4QkFBNEIsQ0FBQyx3QkFBd0IsQ0FBQyxDQUFDO1FBQ3ZKLENBQUM7UUFFRCxxQ0FBcUM7UUFDckMsSUFBSSxDQUFDLFlBQVksQ0FBQyxXQUFXLEVBQUUsQ0FBQztZQUMvQixPQUFPLENBQUMsSUFBSSxDQUFDLDhCQUE0QixDQUFDLHVCQUF1QixDQUFDLENBQUM7UUFDcEUsQ0FBQztRQUVELElBQUksQ0FBQyxRQUFRLENBQUMsT0FBTyxDQUFDLEtBQUssRUFBRSxDQUFDO1FBQzlCLElBQUksQ0FBQyxRQUFRLENBQUMsT0FBTyxDQUFDLE9BQU8sR0FBRyxZQUFZLENBQUM7UUFDN0MsT0FBTyxDQUFDLE9BQU8sQ0FBQyxNQUFNLENBQUMsRUFBRSxDQUFDLElBQUksQ0FBQyxRQUFRLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxNQUFNLEVBQUUsRUFBRSxJQUFJLEVBQUUsSUFBSSxFQUFFLEtBQUssRUFBRSxLQUFLLEVBQUUsVUFBVSxFQUFFLElBQUksQ0FBQyxrQkFBa0IsQ0FBQyxNQUFNLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQztJQUMxSSxDQUFDO0lBRU8sWUFBWSxDQUFDLFlBQW1DLEVBQUUsaUJBQWdDO1FBQ3pGLElBQUksWUFBWSxDQUFDLFFBQVEsSUFBSSxZQUFZLENBQUMsTUFBTSxFQUFFLENBQUM7WUFDbEQsSUFBSSxDQUFDLFFBQVEsQ0FBQyxNQUFNLENBQUMsV0FBVyxHQUFHLFFBQVEsQ0FBQyxvQkFBb0IsRUFBRSxhQUFhLEVBQUUsWUFBWSxDQUFDLE1BQU0sQ0FBQyxDQUFDO1lBQ3RHLGlCQUFpQixDQUFDLE1BQU0sQ0FBQyxZQUFZLENBQUMsTUFBTSxDQUFDLENBQUM7UUFDL0MsQ0FBQzthQUFNLENBQUM7WUFDUCxJQUFJLENBQUMsUUFBUSxDQUFDLE1BQU0sQ0FBQyxXQUFXLEdBQUcsRUFBRSxDQUFDO1lBQ3RDLGlCQUFpQixDQUFDLE1BQU0sQ0FBQyxFQUFFLENBQUMsQ0FBQztRQUM5QixDQUFDO0lBQ0YsQ0FBQztJQUVPLGFBQWEsQ0FBQyxZQUFtQztRQUN4RCxTQUFTLENBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxnQkFBZ0IsQ0FBQyxDQUFDO1FBRTFDLE1BQU0sY0FBYyxHQUFHLFlBQVksQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDLFlBQVksQ0FBQyxPQUFPLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQyxTQUFTLENBQUM7UUFDdkYsSUFBSSxZQUFZLENBQUMsUUFBUSxJQUFJLGVBQWUsQ0FBQyxjQUFjLENBQUMsRUFBRSxDQUFDO1lBQzlELE1BQU0sSUFBSSxHQUFHLElBQUksQ0FBQztZQUVsQixNQUFNLFlBQVksR0FBa0IsSUFBSSxDQUFDLGdCQUFnQixDQUFDLEdBQUcsQ0FBQyxJQUFJLEtBQU0sU0FBUSxZQUFZO2dCQUN4RSxLQUFLLENBQUMsU0FBUyxDQUFDLE1BQWU7b0JBRWpELGFBQWE7b0JBQ2IsSUFBSSxDQUFDLFlBQVksQ0FBQyxHQUFHLENBQUMsTUFBTSxFQUFFLFlBQVksQ0FBQyxDQUFDO29CQUU1QyxrREFBa0Q7b0JBQ2xELElBQUksQ0FBQyxDQUFDLE1BQU0sWUFBWSxZQUFZLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxRQUFRLEVBQUUsQ0FBQzt3QkFDM0QsWUFBWSxDQUFDLEtBQUssRUFBRSxDQUFDO29CQUN0QixDQUFDO2dCQUNGLENBQUM7YUFDRCxFQUFFLENBQUMsQ0FBQztZQUVMLE1BQU0sYUFBYSxHQUFHLElBQUksQ0FBQyxnQkFBZ0IsQ0FBQyxHQUFHLENBQUMsSUFBSSxTQUFTLENBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxnQkFBZ0IsQ0FBQyxDQUFDLENBQUM7WUFDL0YsS0FBSyxJQUFJLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxHQUFHLGNBQWMsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxFQUFFLEVBQUUsQ0FBQztnQkFDaEQsTUFBTSxNQUFNLEdBQUcsY0FBYyxDQUFDLENBQUMsQ0FBQyxDQUFDO2dCQUVqQyxNQUFNLE9BQU8sR0FBbUI7b0JBQy9CLEtBQUssRUFBRSxJQUFJLEVBQUcsaURBQWlEO29CQUMvRCxTQUFTLEVBQUUsQ0FBQyxHQUFHLENBQUM7b0JBQ2hCLEdBQUcsbUJBQW1CO2lCQUN0QixDQUFDO2dCQUVGLE1BQU0sZUFBZSxHQUFHLE1BQU0sWUFBWSxZQUFZLENBQUMsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLFNBQVMsQ0FBQztnQkFDakYsTUFBTSxNQUFNLEdBQUcsSUFBSSxDQUFDLGdCQUFnQixDQUFDLEdBQUcsQ0FBQyxlQUFlLENBQUMsQ0FBQztvQkFDekQsYUFBYSxDQUFDLHFCQUFxQixDQUFDO3dCQUNuQyxHQUFHLE9BQU87d0JBQ1YsbUJBQW1CLEVBQUUsSUFBSSxDQUFDLGtCQUFrQjt3QkFDNUMsT0FBTyxFQUFFLGVBQWU7d0JBQ3hCLFlBQVk7cUJBQ1osQ0FBQyxDQUFDLENBQUM7b0JBQ0osYUFBYSxDQUFDLFNBQVMsQ0FBQyxPQUFPLENBQUMsQ0FDaEMsQ0FBQztnQkFFRixNQUFNLENBQUMsS0FBSyxHQUFHLE1BQU0sQ0FBQyxLQUFLLENBQUM7Z0JBRTVCLElBQUksQ0FBQyxnQkFBZ0IsQ0FBQyxHQUFHLENBQUMsTUFBTSxDQUFDLFVBQVUsQ0FBQyxDQUFDLENBQUMsRUFBRTtvQkFDL0MsSUFBSSxDQUFDLEVBQUUsQ0FBQzt3QkFDUCxXQUFXLENBQUMsSUFBSSxDQUFDLENBQUMsRUFBRSxJQUFJLENBQUMsQ0FBQztvQkFDM0IsQ0FBQztvQkFFRCxZQUFZLENBQUMsR0FBRyxDQUFDLE1BQU0sQ0FBQyxDQUFDO2dCQUMxQixDQUFDLENBQUMsQ0FBQyxDQUFDO1lBQ0wsQ0FBQztRQUNGLENBQUM7SUFDRixDQUFDO0lBRU8sY0FBYyxDQUFDLFlBQW1DO1FBRXpELDJDQUEyQztRQUMzQyxJQUFJLENBQUMsWUFBWSxDQUFDLFdBQVcsRUFBRSxDQUFDO1lBQy9CLElBQUksQ0FBQyxRQUFRLENBQUMsUUFBUSxDQUFDLElBQUksRUFBRSxDQUFDLElBQUksRUFBRSxDQUFDO1lBRXJDLE9BQU87UUFDUixDQUFDO1FBRUQsV0FBVztRQUNYLE1BQU0sS0FBSyxHQUFHLFlBQVksQ0FBQyxRQUFRLENBQUMsS0FBSyxDQUFDO1FBQzFDLElBQUksS0FBSyxDQUFDLFFBQVEsRUFBRSxDQUFDO1lBQ3BCLElBQUksQ0FBQyxRQUFRLENBQUMsUUFBUSxDQUFDLFFBQVEsRUFBRSxDQUFDLElBQUksRUFBRSxDQUFDO1FBQzFDLENBQUM7UUFFRCxpQkFBaUI7YUFDWixJQUFJLE9BQU8sS0FBSyxDQUFDLEtBQUssS0FBSyxRQUFRLElBQUksT0FBTyxLQUFLLENBQUMsTUFBTSxLQUFLLFFBQVEsRUFBRSxDQUFDO1lBQzlFLElBQUksT0FBTyxLQUFLLENBQUMsS0FBSyxLQUFLLFFBQVEsSUFBSSxDQUFDLElBQUksQ0FBQyxRQUFRLENBQUMsUUFBUSxDQUFDLFFBQVEsRUFBRSxFQUFFLENBQUM7Z0JBQzNFLElBQUksQ0FBQyxRQUFRLENBQUMsUUFBUSxDQUFDLEtBQUssQ0FBQyxLQUFLLENBQUMsS0FBSyxDQUFDLENBQUM7WUFDM0MsQ0FBQztZQUVELElBQUksT0FBTyxLQUFLLENBQUMsTUFBTSxLQUFLLFFBQVEsRUFBRSxDQUFDO2dCQUN0QyxJQUFJLENBQUMsUUFBUSxDQUFDLFFBQVEsQ0FBQyxTQUFTLENBQUMsS0FBSyxDQUFDLE1BQU0sQ0FBQyxDQUFDLElBQUksRUFBRSxDQUFDO1lBQ3ZELENBQUM7UUFDRixDQUFDO1FBRUQsT0FBTzthQUNGLENBQUM7WUFDTCxJQUFJLENBQUMsUUFBUSxDQUFDLFFBQVEsQ0FBQyxJQUFJLEVBQUUsQ0FBQyxJQUFJLEVBQUUsQ0FBQztRQUN0QyxDQUFDO0lBQ0YsQ0FBQztJQUVPLGNBQWMsQ0FBQyxRQUFrQjtRQUN4QyxRQUFRLFFBQVEsRUFBRSxDQUFDO1lBQ2xCLEtBQUssUUFBUSxDQUFDLE9BQU87Z0JBQ3BCLE9BQU8sT0FBTyxDQUFDLE9BQU8sQ0FBQztZQUN4QixLQUFLLFFBQVEsQ0FBQyxLQUFLO2dCQUNsQixPQUFPLE9BQU8sQ0FBQyxLQUFLLENBQUM7UUFDdkIsQ0FBQztRQUNELE9BQU8sT0FBTyxDQUFDLElBQUksQ0FBQztJQUNyQixDQUFDO0lBRU8sa0JBQWtCLENBQUMsTUFBZTtRQUN6QyxNQUFNLFVBQVUsR0FBRyxJQUFJLENBQUMsaUJBQWlCLENBQUMsZ0JBQWdCLENBQUMsTUFBTSxDQUFDLEVBQUUsQ0FBQyxDQUFDO1FBRXRFLE9BQU8sVUFBVSxDQUFDLENBQUMsQ0FBQyxVQUFVLENBQUMsUUFBUSxFQUFFLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQztJQUNsRCxDQUFDOztBQXZSVyw0QkFBNEI7SUF1QnRDLFdBQUEsY0FBYyxDQUFBO0lBQ2QsV0FBQSxxQkFBcUIsQ0FBQTtJQUNyQixXQUFBLGtCQUFrQixDQUFBO0lBQ2xCLFdBQUEsbUJBQW1CLENBQUE7SUFDbkIsV0FBQSxhQUFhLENBQUE7SUFDYixXQUFBLHFCQUFxQixDQUFBO0dBNUJYLDRCQUE0QixDQXdSeEMifQ==