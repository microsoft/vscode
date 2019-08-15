/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { INotificationsModel, INotificationChangeEvent, NotificationChangeType, INotificationViewItem, IStatusMessageChangeEvent, StatusMessageChangeType, IStatusMessageViewItem } from 'vs/workbench/common/notifications';
import { IStatusbarService, StatusbarAlignment, IStatusbarEntryAccessor, IStatusbarEntry } from 'vs/platform/statusbar/common/statusbar';
import { Disposable, IDisposable, dispose } from 'vs/base/common/lifecycle';
import { HIDE_NOTIFICATIONS_CENTER, SHOW_NOTIFICATIONS_CENTER } from 'vs/workbench/browser/parts/notifications/notificationsCommands';
import { localize } from 'vs/nls';

export class NotificationsStatus extends Disposable {

	private notificationsCenterStatusItem: IStatusbarEntryAccessor | undefined;
	private currentNotifications = new Set<INotificationViewItem>();

	private currentStatusMessage: [IStatusMessageViewItem, IDisposable] | undefined;

	private isNotificationsCenterVisible: boolean | undefined;

	constructor(
		private model: INotificationsModel,
		@IStatusbarService private readonly statusbarService: IStatusbarService
	) {
		super();

		this.updateNotificationsCenterStatusItem();

		if (model.statusMessage) {
			this.doSetStatusMessage(model.statusMessage);
		}

		this.registerListeners();
	}

	private registerListeners(): void {
		this._register(this.model.onDidNotificationChange(e => this.onDidNotificationChange(e)));
		this._register(this.model.onDidStatusMessageChange(e => this.onDidStatusMessageChange(e)));
	}

	private onDidNotificationChange(e: INotificationChangeEvent): void {
		if (this.isNotificationsCenterVisible) {
			return; // no change if notification center is visible
		}

		// Notification got Added
		if (e.kind === NotificationChangeType.ADD) {
			this.currentNotifications.add(e.item);
		}

		// Notification got Removed
		else if (e.kind === NotificationChangeType.REMOVE) {
			this.currentNotifications.delete(e.item);
		}

		this.updateNotificationsCenterStatusItem();
	}

	private updateNotificationsCenterStatusItem(): void {
		const statusProperties: IStatusbarEntry = {
			text: this.currentNotifications.size === 0 ? '$(bell)' : `$(bell) ${this.currentNotifications.size}`,
			command: this.isNotificationsCenterVisible ? HIDE_NOTIFICATIONS_CENTER : SHOW_NOTIFICATIONS_CENTER,
			tooltip: this.getTooltip(),
			showBeak: this.isNotificationsCenterVisible
		};

		if (!this.notificationsCenterStatusItem) {
			this.notificationsCenterStatusItem = this.statusbarService.addEntry(statusProperties, 'status.notifications', localize('status.notifications', "Notifications"), StatusbarAlignment.RIGHT, -Number.MAX_VALUE /* towards the far end of the right hand side */);
		} else {
			this.notificationsCenterStatusItem.update(statusProperties);
		}
	}

	private getTooltip(): string {
		if (this.isNotificationsCenterVisible) {
			return localize('hideNotifications', "Hide Notifications");
		}

		if (this.model.notifications.length === 0) {
			return localize('zeroNotifications', "No Notifications");
		}

		if (this.currentNotifications.size === 0) {
			return localize('noNotifications', "No New Notifications");
		}

		if (this.currentNotifications.size === 1) {
			return localize('oneNotification', "1 New Notification");
		}

		return localize('notifications', "{0} New Notifications", this.currentNotifications.size);
	}

	update(isCenterVisible: boolean): void {
		if (this.isNotificationsCenterVisible !== isCenterVisible) {
			this.isNotificationsCenterVisible = isCenterVisible;

			// Showing the notification center resets the counter to 0
			this.currentNotifications.clear();
			this.updateNotificationsCenterStatusItem();
		}
	}

	private onDidStatusMessageChange(e: IStatusMessageChangeEvent): void {
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
		let showHandle: any = setTimeout(() => {
			statusMessageEntry = this.statusbarService.addEntry(
				{ text: message },
				'status.message',
				localize('status.message', "Status Message"),
				StatusbarAlignment.LEFT,
				-Number.MAX_VALUE /* far right on left hand side */
			);
			showHandle = null;
		}, showAfter);

		// Dispose function takes care of timeouts and actual entry
		let hideHandle: any;
		const statusMessageDispose = {
			dispose: () => {
				if (showHandle) {
					clearTimeout(showHandle);
				}

				if (hideHandle) {
					clearTimeout(hideHandle);
				}

				if (statusMessageEntry) {
					statusMessageEntry.dispose();
				}
			}
		};

		if (hideAfter > 0) {
			hideHandle = setTimeout(() => statusMessageDispose.dispose(), hideAfter);
		}

		// Remember as current status message
		this.currentStatusMessage = [item, statusMessageDispose];
	}
}
