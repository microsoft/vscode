/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { INotificationsModel, INotificationChangeEvent, NotificationChangeType } from 'vs/workbench/common/notifications';
import { IStatusbarService, StatusbarAlignment } from 'vs/platform/statusbar/common/statusbar';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import { TOGGLE_NOTFICATIONS_CENTER_COMMAND_ID } from 'vs/workbench/browser/parts/notifications/notificationCommands';
import { localize } from 'vs/nls';

export class NotificationsStatus {
	private statusItem: IDisposable;
	private toDispose: IDisposable[];

	constructor(
		private model: INotificationsModel,
		@IStatusbarService private statusbarService: IStatusbarService
	) {
		this.toDispose = [];

		this.registerListeners();
	}

	private registerListeners(): void {
		this.toDispose.push(this.model.onDidNotificationChange(e => this.onDidNotificationChange(e)));
	}

	private onDidNotificationChange(e: INotificationChangeEvent): void {
		if (e.kind === NotificationChangeType.CHANGE) {
			return; // only interested in add or remove
		}

		this.updateNotificationsStatusItem();
	}

	private updateNotificationsStatusItem(): void {

		// Dispose old first
		if (this.statusItem) {
			this.statusItem.dispose();
		}

		// Create new
		const notificationsCount = this.model.notifications.length;
		if (notificationsCount > 0) {
			this.statusItem = this.statusbarService.addEntry({
				text: `$(megaphone) ${notificationsCount}`,
				command: TOGGLE_NOTFICATIONS_CENTER_COMMAND_ID,
				tooltip: localize('notifications', "{0} notifications", notificationsCount)
			}, StatusbarAlignment.RIGHT, Number.MIN_VALUE);
		}
	}

	public dispose() {
		this.toDispose = dispose(this.toDispose);
	}
}