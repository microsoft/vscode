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
import './media/notificationsActions.css';
import { localize } from '../../../../nls.js';
import { Action } from '../../../../base/common/actions.js';
import { CLEAR_NOTIFICATION, EXPAND_NOTIFICATION, COLLAPSE_NOTIFICATION, CLEAR_ALL_NOTIFICATIONS, HIDE_NOTIFICATIONS_CENTER, TOGGLE_DO_NOT_DISTURB_MODE, TOGGLE_DO_NOT_DISTURB_MODE_BY_SOURCE } from './notificationsCommands.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { IClipboardService } from '../../../../platform/clipboard/common/clipboardService.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { registerIcon } from '../../../../platform/theme/common/iconRegistry.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
const clearIcon = registerIcon('notifications-clear', Codicon.close, localize('clearIcon', 'Icon for the clear action in notifications.'));
const clearAllIcon = registerIcon('notifications-clear-all', Codicon.clearAll, localize('clearAllIcon', 'Icon for the clear all action in notifications.'));
export const hideIcon = registerIcon('notifications-hide', Codicon.chevronDown, localize('hideIcon', 'Icon for the hide action in notifications.'));
export const hideUpIcon = registerIcon('notifications-hide-up', Codicon.chevronUp, localize('hideUpIcon', 'Icon for the hide action in notifications when positioned at the top.'));
const expandIcon = registerIcon('notifications-expand', Codicon.chevronUp, localize('expandIcon', 'Icon for the expand action in notifications.'));
const expandDownIcon = registerIcon('notifications-expand-down', Codicon.chevronDown, localize('expandDownIcon', 'Icon for the expand action in notifications when the notification center is at the top.'));
const collapseIcon = registerIcon('notifications-collapse', Codicon.chevronDown, localize('collapseIcon', 'Icon for the collapse action in notifications.'));
const collapseUpIcon = registerIcon('notifications-collapse-up', Codicon.chevronUp, localize('collapseUpIcon', 'Icon for the collapse action in notifications when the notification center is at the top.'));
const configureIcon = registerIcon('notifications-configure', Codicon.gear, localize('configureIcon', 'Icon for the configure action in notifications.'));
const doNotDisturbIcon = registerIcon('notifications-do-not-disturb', Codicon.bellSlash, localize('doNotDisturbIcon', 'Icon for the mute all action in notifications.'));
export const positionIcon = registerIcon('notifications-position', Codicon.arrowSwap, localize('positionIcon', 'Icon for the position action in notifications.'));
export function getNotificationExpandIcon(position) {
    return position === "top-right" /* NotificationsPosition.TOP_RIGHT */ ? expandDownIcon : expandIcon;
}
export function getNotificationCollapseIcon(position) {
    return position === "top-right" /* NotificationsPosition.TOP_RIGHT */ ? collapseUpIcon : collapseIcon;
}
let ClearNotificationAction = class ClearNotificationAction extends Action {
    static { this.ID = CLEAR_NOTIFICATION; }
    static { this.LABEL = localize('clearNotification', "Clear Notification"); }
    constructor(id, label, commandService) {
        super(id, label, ThemeIcon.asClassName(clearIcon));
        this.commandService = commandService;
    }
    async run(notification) {
        this.commandService.executeCommand(CLEAR_NOTIFICATION, notification);
    }
};
ClearNotificationAction = __decorate([
    __param(2, ICommandService)
], ClearNotificationAction);
export { ClearNotificationAction };
let ClearAllNotificationsAction = class ClearAllNotificationsAction extends Action {
    static { this.ID = CLEAR_ALL_NOTIFICATIONS; }
    static { this.LABEL = localize('clearNotifications', "Clear All Notifications"); }
    constructor(id, label, commandService) {
        super(id, label, ThemeIcon.asClassName(clearAllIcon));
        this.commandService = commandService;
    }
    async run() {
        this.commandService.executeCommand(CLEAR_ALL_NOTIFICATIONS);
    }
};
ClearAllNotificationsAction = __decorate([
    __param(2, ICommandService)
], ClearAllNotificationsAction);
export { ClearAllNotificationsAction };
let ToggleDoNotDisturbAction = class ToggleDoNotDisturbAction extends Action {
    static { this.ID = TOGGLE_DO_NOT_DISTURB_MODE; }
    static { this.LABEL = localize('toggleDoNotDisturbMode', "Toggle Do Not Disturb Mode"); }
    constructor(id, label, commandService) {
        super(id, label, ThemeIcon.asClassName(doNotDisturbIcon));
        this.commandService = commandService;
    }
    async run() {
        this.commandService.executeCommand(TOGGLE_DO_NOT_DISTURB_MODE);
    }
};
ToggleDoNotDisturbAction = __decorate([
    __param(2, ICommandService)
], ToggleDoNotDisturbAction);
export { ToggleDoNotDisturbAction };
let ToggleDoNotDisturbBySourceAction = class ToggleDoNotDisturbBySourceAction extends Action {
    static { this.ID = TOGGLE_DO_NOT_DISTURB_MODE_BY_SOURCE; }
    static { this.LABEL = localize('toggleDoNotDisturbModeBySource', "Toggle Do Not Disturb Mode By Source..."); }
    constructor(id, label, commandService) {
        super(id, label);
        this.commandService = commandService;
    }
    async run() {
        this.commandService.executeCommand(TOGGLE_DO_NOT_DISTURB_MODE_BY_SOURCE);
    }
};
ToggleDoNotDisturbBySourceAction = __decorate([
    __param(2, ICommandService)
], ToggleDoNotDisturbBySourceAction);
export { ToggleDoNotDisturbBySourceAction };
export class ConfigureDoNotDisturbAction extends Action {
    static { this.ID = 'workbench.action.configureDoNotDisturbMode'; }
    static { this.LABEL = localize('configureDoNotDisturbMode', "Configure Do Not Disturb..."); }
    constructor(id, label) {
        super(id, label, ThemeIcon.asClassName(doNotDisturbIcon));
    }
}
export class ConfigureNotificationsPositionAction extends Action {
    static { this.ID = 'workbench.action.configureNotificationsPosition'; }
    static { this.LABEL = localize('configureNotificationsPosition', "Configure Notifications Position..."); }
    constructor(id, label) {
        super(id, label, ThemeIcon.asClassName(positionIcon));
    }
}
let HideNotificationsCenterAction = class HideNotificationsCenterAction extends Action {
    static { this.ID = HIDE_NOTIFICATIONS_CENTER; }
    static { this.LABEL = localize('hideNotificationsCenter', "Hide Notifications"); }
    constructor(id, label, commandService) {
        super(id, label, ThemeIcon.asClassName(hideIcon));
        this.commandService = commandService;
    }
    async run() {
        this.commandService.executeCommand(HIDE_NOTIFICATIONS_CENTER);
    }
};
HideNotificationsCenterAction = __decorate([
    __param(2, ICommandService)
], HideNotificationsCenterAction);
export { HideNotificationsCenterAction };
let ExpandNotificationAction = class ExpandNotificationAction extends Action {
    static { this.ID = EXPAND_NOTIFICATION; }
    static { this.LABEL = localize('expandNotification', "Expand Notification"); }
    constructor(id, label, commandService) {
        super(id, label, ThemeIcon.asClassName(expandIcon));
        this.commandService = commandService;
    }
    async run(notification) {
        this.commandService.executeCommand(EXPAND_NOTIFICATION, notification);
    }
};
ExpandNotificationAction = __decorate([
    __param(2, ICommandService)
], ExpandNotificationAction);
export { ExpandNotificationAction };
let CollapseNotificationAction = class CollapseNotificationAction extends Action {
    static { this.ID = COLLAPSE_NOTIFICATION; }
    static { this.LABEL = localize('collapseNotification', "Collapse Notification"); }
    constructor(id, label, commandService) {
        super(id, label, ThemeIcon.asClassName(collapseIcon));
        this.commandService = commandService;
    }
    async run(notification) {
        this.commandService.executeCommand(COLLAPSE_NOTIFICATION, notification);
    }
};
CollapseNotificationAction = __decorate([
    __param(2, ICommandService)
], CollapseNotificationAction);
export { CollapseNotificationAction };
export class ConfigureNotificationAction extends Action {
    static { this.ID = 'workbench.action.configureNotification'; }
    static { this.LABEL = localize('configureNotification', "More Actions..."); }
    constructor(id, label, notification) {
        super(id, label, ThemeIcon.asClassName(configureIcon));
        this.notification = notification;
    }
}
let CopyNotificationMessageAction = class CopyNotificationMessageAction extends Action {
    static { this.ID = 'workbench.action.copyNotificationMessage'; }
    static { this.LABEL = localize('copyNotification', "Copy Text"); }
    constructor(id, label, clipboardService) {
        super(id, label);
        this.clipboardService = clipboardService;
    }
    run(notification) {
        return this.clipboardService.writeText(notification.message.raw);
    }
};
CopyNotificationMessageAction = __decorate([
    __param(2, IClipboardService)
], CopyNotificationMessageAction);
export { CopyNotificationMessageAction };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibm90aWZpY2F0aW9uc0FjdGlvbnMuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvYnJvd3Nlci9wYXJ0cy9ub3RpZmljYXRpb25zL25vdGlmaWNhdGlvbnNBY3Rpb25zLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7O0FBRWhHLE9BQU8sa0NBQWtDLENBQUM7QUFFMUMsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLG9CQUFvQixDQUFDO0FBQzlDLE9BQU8sRUFBRSxNQUFNLEVBQUUsTUFBTSxvQ0FBb0MsQ0FBQztBQUM1RCxPQUFPLEVBQUUsa0JBQWtCLEVBQUUsbUJBQW1CLEVBQUUscUJBQXFCLEVBQUUsdUJBQXVCLEVBQUUseUJBQXlCLEVBQUUsMEJBQTBCLEVBQUUsb0NBQW9DLEVBQUUsTUFBTSw0QkFBNEIsQ0FBQztBQUNsTyxPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sa0RBQWtELENBQUM7QUFDbkYsT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0sMkRBQTJELENBQUM7QUFDOUYsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLHFDQUFxQyxDQUFDO0FBQzlELE9BQU8sRUFBRSxZQUFZLEVBQUUsTUFBTSxtREFBbUQsQ0FBQztBQUNqRixPQUFPLEVBQUUsU0FBUyxFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFFakUsTUFBTSxTQUFTLEdBQUcsWUFBWSxDQUFDLHFCQUFxQixFQUFFLE9BQU8sQ0FBQyxLQUFLLEVBQUUsUUFBUSxDQUFDLFdBQVcsRUFBRSw2Q0FBNkMsQ0FBQyxDQUFDLENBQUM7QUFDM0ksTUFBTSxZQUFZLEdBQUcsWUFBWSxDQUFDLHlCQUF5QixFQUFFLE9BQU8sQ0FBQyxRQUFRLEVBQUUsUUFBUSxDQUFDLGNBQWMsRUFBRSxpREFBaUQsQ0FBQyxDQUFDLENBQUM7QUFDNUosTUFBTSxDQUFDLE1BQU0s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