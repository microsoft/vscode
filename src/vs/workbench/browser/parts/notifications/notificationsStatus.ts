/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { INotificationsModel, INotificationChangeEvent, NotificationChangeType, IStatusMessageChangeEvent, StatusMessageChangeType, IStatusMessageViewItem } from '../../../common/notifications.js';
import { IStatusbarService, StatusbarAlignment, IStatusbarEntryAccessor, IStatusbarEntry } from '../../../services/statusbar/browser/statusbar.js';
import { Disposable, IDisposable, dispose } from '../../../../base/common/lifecycle.js';
import { HIDE_NOTIFICATIONS_CENTER, SHOW_NOTIFICATIONS_CENTER } from './notificationsCommands.js';
import { localize } from '../../../../nls.js';
import { INotificationService, NotificationsFilter } from '../../../../platform/notification/common/notification.js';

export class NotificationsStatus extends Disposable {

	private notificationsCenterStatusItem: IStatusbarEntryAccessor | undefined;
	private newNotificationsCount = 0;

	private currentStatusMessage: [IStatusMessageViewItem, IDisposable] | undefined;

	private isNotificationsCenterVisible: boolean = false;
	private isNotificationsToastsVisible: boolean = false;

	constructor(
		private readonly model: INotificationsModel,
		@IStatusbarService private readonly statusbarService: IStatusbarService,
		@INotificationService private readonly notificationService: INotificationService
	) {
		super();

		this.updateNotificationsCenterStatusItem();

		if (model.statusMessage) {
			this.doSetStatusMessage(model.statusMessage);
		}

		this.registerListeners();
	}

	private registerListeners(): void {
		this._register(this.model.onDidChangeNotification(e => this.onDidChangeNotification(e)));
		this._register(this.model.onDidChangeStatusMessage(e => this.onDidChangeStatusMessage(e)));
		this._register(this.notificationService.onDidChangeFilter(() => this.updateNotificationsCenterStatusItem()));
	}

	private onDidChangeNotification(e: INotificationChangeEvent): void {

		// Consider a notification as unread as long as it only
		// appeared as toast and not in the notification center
		if (!this.isNotificationsCenterVisible) {
			if (e.kind === NotificationChangeType.ADD) {
				this.newNotificationsCount++;
			} else if (e.kind === NotificationChangeType.REMOVE && this.newNotificationsCount > 0) {
				this.newNotificationsCount--;
			}
		}

		// Update in status bar
		this.updateNotificationsCenterStatusItem();
	}

	private updateNotificationsCenterStatusItem(): void {

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

		let statusProperties: IStatusbarEntry = {
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

		if (!this.notificationsCenterStatusItem) {
			this.notificationsCenterStatusItem = this.statusbarService.addEntry(
				statusProperties,
				'status.notifications',
				StatusbarAlignment.RIGHT,
				Number.NEGATIVE_INFINITY /* last entry */
			);
		} else {
			this.notificationsCenterStatusItem.update(statusProperties);
		}
	}

	private getTooltip(notificationsInProgress: number): string {
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

	update(isCenterVisible: boolean, isToastsVisible: boolean): void {
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

	private onDidChangeStatusMessage(e: IStatusMessageChangeEvent): void {
		const statusItem = e.item;

		switch (e.kind) {

			// Show status notification
			case StatusMessageChangeType.ADD:
				this.doSetStatusMessage(statusItem);

				break;

			// Hide status notification (if its still the current one)
			case StatusMessageChangeType.REMOVE:
				if (this.currentStatusMessage && this.currentStatusMessage[0] === statusItem) {
					dispose(this.currentStatusMessage[1]);
					this.currentStatusMessage = undefined;
				}

				break;
		}
	}

	private doSetStatusMessage(item: IStatusMessageViewItem): void {
		const message = item.message;

		const showAfter = item.options && typeof item.options.showAfter === 'number' ? item.options.showAfter : 0;
		const hideAfter = item.options && typeof item.options.hideAfter === 'number' ? item.options.hideAfter : -1;

		// Dismiss any previous
		if (this.currentStatusMessage) {
			dispose(this.currentStatusMessage[1]);
		}

		// Create new
		let statusMessageEntry: IStatusbarEntryAccessor;
		let showHandle: Timeout | undefined = setTimeout(() => {
			statusMessageEntry = this.statusbarService.addEntry(
				{
					name: localize('status.message', "Status Message"),
					text: message,
					ariaLabel: message
				},
				'status.message',
				StatusbarAlignment.LEFT,
				Number.NEGATIVE_INFINITY /* last entry */
			);
			showHandle = undefined;
		}, showAfter);

		// Dispose function takes care of timeouts and actual entry
		let hideHandle: Timeout | undefined;
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
}
