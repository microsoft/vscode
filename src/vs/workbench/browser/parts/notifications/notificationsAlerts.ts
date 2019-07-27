/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { alert } from 'vs/base/browser/ui/aria/aria';
import { localize } from 'vs/nls';
import { INotificationViewItem, INotificationsModel, NotificationChangeType, INotificationChangeEvent, NotificationViewItemLabelKind } from 'vs/workbench/common/notifications';
import { Disposable } from 'vs/base/common/lifecycle';
import { toErrorMessage } from 'vs/base/common/errorMessage';
import { Severity } from 'vs/platform/notification/common/notification';
import { Event } from 'vs/base/common/event';

export class NotificationsAlerts extends Disposable {

	constructor(private model: INotificationsModel) {
		super();

		// Alert initial notifications if any
		model.notifications.forEach(n => this.triggerAriaAlert(n));

		this.registerListeners();
	}

	private registerListeners(): void {
		this._register(this.model.onDidNotificationChange(e => this.onDidNotificationChange(e)));
	}

	private onDidNotificationChange(e: INotificationChangeEvent): void {
		if (e.kind === NotificationChangeType.ADD) {

			// ARIA alert for screen readers
			this.triggerAriaAlert(e.item);

			// Always log errors to console with full details
			if (e.item.severity === Severity.Error) {
				if (e.item.message.original instanceof Error) {
					console.error(e.item.message.original);
				} else {
					console.error(toErrorMessage(e.item.message.value, true));
				}
			}
		}
	}

	private triggerAriaAlert(notification: INotificationViewItem): void {

		// Trigger the alert again whenever the label changes
		const listener = notification.onDidLabelChange(e => {
			if (e.kind === NotificationViewItemLabelKind.MESSAGE) {
				this.doTriggerAriaAlert(notification);
			}
		});

		Event.once(notification.onDidClose)(() => listener.dispose());

		this.doTriggerAriaAlert(notification);
	}

	private doTriggerAriaAlert(notification: INotificationViewItem): void {
		let alertText: string;
		if (notification.severity === Severity.Error) {
			alertText = localize('alertErrorMessage', "Error: {0}", notification.message.value);
		} else if (notification.severity === Severity.Warning) {
			alertText = localize('alertWarningMessage', "Warning: {0}", notification.message.value);
		} else {
			alertText = localize('alertInfoMessage', "Info: {0}", notification.message.value);
		}

		alert(alertText);
	}
}
