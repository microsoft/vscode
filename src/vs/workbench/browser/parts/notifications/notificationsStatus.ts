/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { INotificationsModel, INotificationChangeEvent, NotificationChangeType } from 'vs/workbench/common/notifications';
import { IStatusbarService, StatusbarAlignment } from 'vs/platform/statusbar/common/statusbar';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import { HIDE_NOTIFICATIONS_CENTER, SHOW_NOTIFICATIONS_CENTER } from 'vs/workbench/browser/parts/notifications/notificationsCommands';
import { localize } from 'vs/nls';

export class NotificationsStatus {
	private counter: number;
	private statusItem: IDisposable;
	private toDispose: IDisposable[];
	private isNotificationsCenterVisible: boolean;

	constructor(
		private model: INotificationsModel,
		@IStatusbarService private statusbarService: IStatusbarService
	) {
		this.toDispose = [];
		this.counter = 0;

		this.updateNotificationsStatusItem();

		this.registerListeners();
	}

	public update(isCenterVisible: boolean): void {
		if (this.isNotificationsCenterVisible !== isCenterVisible) {
			this.isNotificationsCenterVisible = isCenterVisible;

			// Showing the notification center resets the counter to 0
			this.counter = 0;
			this.updateNotificationsStatusItem();
		}
	}

	private registerListeners(): void {
		this.toDispose.push(this.model.onDidNotificationChange(e => this.onDidNotificationChange(e)));
	}

	private onDidNotificationChange(e: INotificationChangeEvent): void {
		if (e.kind === NotificationChangeType.CHANGE) {
			return; // only interested in add or remove
		}

		if (this.isNotificationsCenterVisible) {
			return; // no change if notification center is visible
		}

		if (e.kind === NotificationChangeType.ADD) {
			this.counter++;
		} else {
			this.counter = Math.max(this.counter - 1, 0);
		}

		this.updateNotificationsStatusItem();
	}

	private updateNotificationsStatusItem(): void {

		// Dispose old first
		if (this.statusItem) {
			this.statusItem.dispose();
		}

		// Create new
		this.statusItem = this.statusbarService.addEntry({
			text: this.counter === 0 ? '$(bell)' : `$(bell) ${this.counter}`,
			command: this.isNotificationsCenterVisible ? HIDE_NOTIFICATIONS_CENTER : this.model.notifications.length > 0 ? SHOW_NOTIFICATIONS_CENTER : void 0,
			tooltip: this.getTooltip(),
			showBeak: this.isNotificationsCenterVisible
		}, StatusbarAlignment.RIGHT, -1000 /* towards the far end of the right hand side */);
	}

	private getTooltip(): string {
		if (this.isNotificationsCenterVisible) {
			return localize('hideNotifications', "Hide Notifications");
		}

		if (this.model.notifications.length === 0) {
			return localize('zeroNotifications', "No Notifications");
		}

		if (this.counter === 0) {
			return localize('noNotifications', "No New Notifications");
		}

		if (this.counter === 1) {
			return localize('oneNotification', "1 new notification");
		}

		return localize('notifications', "{0} new notifications", this.counter);
	}

	public dispose() {
		this.toDispose = dispose(this.toDispose);

		if (this.statusItem) {
			this.statusItem.dispose();
		}
	}
}