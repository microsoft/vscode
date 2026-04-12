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
import { getNotificationsPosition } from '../../../common/notifications.js';
import { IStatusbarService } from '../../../services/statusbar/browser/statusbar.js';
import { Disposable, dispose } from '../../../../base/common/lifecycle.js';
import { HIDE_NOTIFICATIONS_CENTER, SHOW_NOTIFICATIONS_CENTER } from './notificationsCommands.js';
import { localize } from '../../../../nls.js';
import { INotificationService, NotificationsFilter } from '../../../../platform/notification/common/notification.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
let NotificationsStatus = class NotificationsStatus extends Disposable {
    constructor(model, statusbarService, notificationService, configurationService) {
        super();
        this.model = model;
        this.statusbarService = statusbarService;
        this.notificationService = notificationService;
        this.configurationService = configurationService;
        this.newNotificationsCount = 0;
        this.isNotificationsCenterVisible = false;
        this.isNotificationsToastsVisible = false;
        this.updateNotificationsCenterStatusItem();
        if (model.statusMessage) {
            this.doSetStatusMessage(model.statusMessage);
        }
        this.registerListeners();
    }
    registerListeners() {
        this._register(this.model.onDidChangeNotification(e => this.onDidChangeNotification(e)));
        this._register(this.model.onDidChangeStatusMessage(e => this.onDidChangeStatusMessage(e)));
        this._register(this.notificationService.onDidChangeFilter(() => this.updateNotificationsCenterStatusItem()));
        this._register(this.configurationService.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration("workbench.notifications.position" /* NotificationsSettings.NOTIFICATIONS_POSITION */)) {
                this.updateNotificationsCenterStatusItem();
            }
        }));
    }
    onDidChangeNotification(e) {
        // Consider a notification as unread as long as it only
        // appeared as toast and not in the notification center
        if (!this.isNotificationsCenterVisible) {
            if (e.kind === 0 /* NotificationChangeType.ADD */) {
                this.newNotificationsCount++;
            }
            else if (e.kind === 3 /* NotificationChangeType.REMOVE */ && this.newNotificationsCount > 0) {
                this.newNotificationsCount--;
            }
        }
        // Update in status bar
        this.updateNotificationsCenterStatusItem();
    }
    updateNotificationsCenterStatusItem() {
        // Figure out how many notifications have progress only if neither
        // toasts are visible nor center is visible. In that case we still
        // want to give a hint to the user that something is running.
        let notificationsInProgress = 0;
        if (!this.isNotificationsCenterVisible && !this.isNotificationsToastsVisible) {
            for (const notification of this.model.notifications) {
                if (notification.hasProgress) {
                    notificationsInProgress++;
                }
            }
        }
        // Show the status bar entry depending on do not disturb setting
        let statusProperties = {
            name: localize('status.notifications', "Notifications"),
            text: `${notificationsInProgress > 0 || this.newNotificationsCount > 0 ? '$(bell-dot)' : '$(bell)'}`,
            ariaLabel: localize('status.notifications', "Notifications"),
            command: this.isNotificationsCenterVisible ? HIDE_NOTIFICATIONS_CENTER : SHOW_NOTIFICATIONS_CENTER,
            tooltip: this.getTooltip(notificationsInProgress),
            showBeak: this.isNotificationsCenterVisible
        };
        if (this.notificationService.getFilter() === NotificationsFilter.ERROR) {
            statusProperties = {
                ...statusProperties,
                text: `${notificationsInProgress > 0 || this.newNotificationsCount > 0 ? '$(bell-slash-dot)' : '$(bell-slash)'}`,
                ariaLabel: localize('status.doNotDisturb', "Do Not Disturb"),
                tooltip: localize('status.doNotDisturbTooltip', "Do Not Disturb Mode is Enabled")
            };
        }
        // For top-right position, hide the status bar bell entirely
        // (it is shown in the title bar instead via menu registration)
        const position = getNotificationsPosition(this.configurationService);
        if (position === "top-right" /* NotificationsPosition.TOP_RIGHT */) {
            this.notificationsCenterStatusItem?.dispose();
            this.notificationsCenterStatusItem = undefined;
            this.currentAlignment = undefined;
        }
        // For other positions, figure out the desired alignment
        else {
            const desiredAlignment = this.getDesiredAlignment();
            // If alignment changed, dispose old entry and create a new one
            if (this.currentAlignment !== desiredAlignment) {
                this.notificationsCenterStatusItem?.dispose();
                this.notificationsCenterStatusItem = undefined;
                this.currentAlignment = desiredAlignment;
            }
            if (!this.notificationsCenterStatusItem) {
                this.notificationsCenterStatusItem = this.statusbarService.addEntry(statusProperties, 'status.notifications', this.currentAlignment, this.currentAlignment === 0 /* StatusbarAlignment.LEFT */
                    ? Number.MAX_SAFE_INTEGER // almost leftmost on the left side
                    : Number.NEGATIVE_INFINITY // rightmost on the right side
                );
            }
            else {
                this.notificationsCenterStatusItem.update(statusProperties);
            }
        }
    }
    getDesiredAlignment() {
        const position = getNotificationsPosition(this.configurationService);
        switch (position) {
            case "bottom-left" /* NotificationsPosition.BOTTOM_LEFT */:
                return 0 /* StatusbarAlignment.LEFT */;
            case "top-right" /* NotificationsPosition.TOP_RIGHT */:
            case "bottom-right" /* NotificationsPosition.BOTTOM_RIGHT */:
            default:
                return 1 /* StatusbarAlignment.RIGHT */;
        }
    }
    getTooltip(notificationsInProgress) {
        if (this.isNotificationsCenterVisible) {
            return localize('hideNotifications', "Hide Notifications");
        }
        if (this.model.notifications.length === 0) {
            return localize('zeroNotifications', "No Notifications");
        }
        if (notificationsInProgress === 0) {
            if (this.newNotificationsCount === 0) {
                return localize('noNotifications', "No New Notifications");
            }
            if (this.newNotificationsCount === 1) {
                return localize('oneNotification', "1 New Notification");
            }
            return localize({ key: 'notifications', comment: ['{0} will be replaced by a number'] }, "{0} New Notifications", this.newNotificationsCount);
        }
        if (this.newNotificationsCount === 0) {
            return localize({ key: 'noNotificationsWithProgress', comment: ['{0} will be replaced by a number'] }, "No New Notifications ({0} in progress)", notificationsInProgress);
        }
        if (this.newNotificationsCount === 1) {
            return localize({ key: 'oneNotificationWithProgress', comment: ['{0} will be replaced by a number'] }, "1 New Notification ({0} in progress)", notificationsInProgress);
        }
        return localize({ key: 'notificationsWithProgress', comment: ['{0} and {1} will be replaced by a number'] }, "{0} New Notifications ({1} in progress)", this.newNotificationsCount, notificationsInProgress);
    }
    update(isCenterVisible, isToastsVisible) {
        let updateNotificationsCenterStatusItem = false;
        if (this.isNotificationsCenterVisible !== isCenterVisible) {
            this.isNotificationsCenterVisible = isCenterVisible;
            this.newNotificationsCount = 0; // Showing the notification center resets the unread counter to 0
            updateNotificationsCenterStatusItem = true;
        }
        if (this.isNotificationsToastsVisible !== isToastsVisible) {
            this.isNotificationsToastsVisible = isToastsVisible;
            updateNotificationsCenterStatusItem = true;
        }
        // Update in status bar as needed
        if (updateNotificationsCenterStatusItem) {
            this.updateNotificationsCenterStatusItem();
        }
    }
    onDidChangeStatusMessage(e) {
        const statusItem = e.item;
        switch (e.kind) {
            // Show status notification
            case 0 /* StatusMessageChangeType.ADD */:
                this.doSetStatusMessage(statusItem);
                break;
            // Hide status notification (if its still the current one)
            case 1 /* StatusMessageChangeType.REMOVE */:
                if (this.currentStatusMessage && this.currentStatusMessage[0] === statusItem) {
                    dispose(this.currentStatusMessage[1]);
                    this.currentStatusMessage = undefined;
                }
                break;
        }
    }
    doSetStatusMessage(item) {
        const message = item.message;
        const showAfter = item.options && typeof item.options.showAfter === 'number' ? item.options.showAfter : 0;
        const hideAfter = item.options && typeof item.options.hideAfter === 'number' ? item.options.hideAfter : -1;
        // Dismiss any previous
        if (this.currentStatusMessage) {
            dispose(this.currentStatusMessage[1]);
        }
        // Create new
        let statusMessageEntry;
        let showHandle = setTimeout(() => {
            statusMessageEntry = this.statusbarService.addEntry({
                name: localize('status.message', "Status Message"),
                text: message,
                ariaLabel: message
            }, 'status.message', 0 /* StatusbarAlignment.LEFT */, Number.NEGATIVE_INFINITY /* last entry */);
            showHandle = undefined;
        }, showAfter);
        // Dispose function takes care of timeouts and actual entry
        let hideHandle;
        const statusMessageDispose = {
            dispose: () => {
                if (showHandle) {
                    clearTimeout(showHandle);
                }
                if (hideHandle) {
                    clearTimeout(hideHandle);
                }
                statusMessageEntry?.dispose();
            }
        };
        if (hideAfter > 0) {
            hideHandle = setTimeout(() => statusMessageDispose.dispose(), hideAfter);
        }
        // Remember as current status message
        this.currentStatusMessage = [item, statusMessageDispose];
    }
};
NotificationsStatus = __decorate([
    __param(1, IStatusbarService),
    __param(2, INotificationService),
    __param(3, IConfigurationService)
], NotificationsStatus);
export { NotificationsStatus };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibm90aWZpY2F0aW9uc1N0YXR1cy5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9icm93c2VyL3BhcnRzL25vdGlmaWNhdGlvbnMvbm90aWZpY2F0aW9uc1N0YXR1cy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7OztBQUVoRyxPQUFPLEVBQW1NLHdCQUF3QixFQUFFLE1BQU0sa0NBQWtDLENBQUM7QUFDN1EsT0FBTyxFQUFFLGlCQUFpQixFQUFnRSxNQUFNLGtEQUFrRCxDQUFDO0FBQ25KLE9BQU8sRUFBRSxVQUFVLEVBQWUsT0FBTyxFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFDeEYsT0FBTyxFQUFFLHlCQUF5QixFQUFFLHlCQUF5QixFQUFFLE1BQU0sNEJBQTRCLENBQUM7QUFDbEcsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLG9CQUFvQixDQUFDO0FBQzlDLE9BQU8sRUFBRSxvQkFBb0IsRUFBRSxtQkFBbUIsRUFBRSxNQUFNLDBEQUEwRCxDQUFDO0FBQ3JILE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLDREQUE0RCxDQUFDO0FBRTVGLElBQU0sbUJBQW1CLEdBQXpCLE1BQU0sbUJBQW9CLFNBQVEsVUFBVTtJQVlsRCxZQUNrQixLQUEwQixFQUN4QixnQkFBb0QsRUFDakQsbUJBQTBELEVBQ3pELG9CQUE0RDtRQUVuRixLQUFLLEVBQUUsQ0FBQztRQUxTLFVBQUssR0FBTCxLQUFLLENBQXFCO1FBQ1AscUJBQWdCLEdBQWhCLGdCQUFnQixDQUFtQjtRQUNoQyx3QkFBbUIsR0FBbkIsbUJBQW1CLENBQXNCO1FBQ3hDLHlCQUFvQixHQUFwQixvQkFBb0IsQ0FBdUI7UUFiNUUsMEJBQXFCLEdBQUcsQ0FBQyxDQUFDO1FBSTFCLGlDQUE0QixHQUFZLEtBQUssQ0FBQztRQUM5QyxpQ0FBNEIsR0FBWSxLQUFLLENBQUM7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