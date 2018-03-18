/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { INotificationsModel, INotificationChangeEvent, NotificationChangeType, INotificationViewItem } from 'vs/workbench/common/notifications';
import { IStatusbarService, StatusbarAlignment } from 'vs/platform/statusbar/common/statusbar';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import { HIDE_NOTIFICATIONS_CENTER, SHOW_NOTIFICATIONS_CENTER } from 'vs/workbench/browser/parts/notifications/notificationsCommands';
import { localize } from 'vs/nls';

export class NotificationsStatus {
	private statusItem: IDisposable;
	private toDispose: IDisposable[];
	private isNotificationsCenterVisible: boolean;
	private _counter: Set<INotificationViewItem>;

	constructor(
		private model: INotificationsModel,
		@IStatusbarService private statusbarService: IStatusbarService
	) {
		this.toDispose = [];
		this._counter = new Set<INotificationViewItem>();

		this.updateNotificationsStatusItem();

		this.registerListeners();
	}

	private get count(): number {
		return this._counter.size;
	}

	public update(isCenterVisible: boolean): void {
		if (this.isNotificationsCenterVisible !== isCenterVisible) {
			this.isNotificationsCenterVisible = isCenterVisible;

			// Showing the notification center resets the counter to 0
			this._counter.clear();
			this.updateNotificationsStatusItem();
		}
	}

	private registerListeners(): void {
		this.toDispose.push(this.model.onDidNotificationChange(e => this.onDidNotificationChange(e)));
	}

	private onDidNotificationChange(e: INotificationChangeEvent): void {
		if (this.isNotificationsCenterVisible) {
			return; // no change if notification center is visible
		}

		// Notification got Added
		if (e.kind === NotificationChangeType.ADD) {
			this._counter.add(e.item);
		}

		// Notification got Removed
		else if (e.kind === NotificationChangeType.REMOVE) {
			this._counter.delete(e.item);
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
			text: this.count === 0 ? '$(bell)' : `$(bell) ${this.count}`,
			command: this.isNotificationsCenterVisible ? HIDE_NOTIFICATIONS_CENTER : SHOW_NOTIFICATIONS_CENTER,
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

		if (this.count === 0) {
			return localize('noNotifications', "No New Notifications");
		}

		if (this.count === 1) {
			return localize('oneNotification', "1 New Notification");
		}

		return localize('notifications', "{0} New Notifications", this.count);
	}

	public dispose() {
		this.toDispose = dispose(this.toDispose);

		if (this.statusItem) {
			this.statusItem.dispose();
		}
	}
}