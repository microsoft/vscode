/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { alert } from '../../../../base/browser/ui/aria/aria.js';
import { localize } from '../../../../nls.js';
import { INotificationViewItem, INotificationsModel, NotificationChangeType, INotificationChangeEvent, NotificationViewItemContentChangeKind } from '../../../common/notifications.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { toErrorMessage } from '../../../../base/common/errorMessage.js';
import { NotificationPriority, Severity } from '../../../../platform/notification/common/notification.js';
import { Event } from '../../../../base/common/event.js';

export class NotificationsAlerts extends Disposable {

	constructor(private readonly model: INotificationsModel) {
		super();

		// Alert initial notifications if any
		for (const notification of model.notifications) {
			this.triggerAriaAlert(notification);
		}

		this.registerListeners();
	}

	private registerListeners(): void {
		this._register(this.model.onDidChangeNotification(e => this.onDidChangeNotification(e)));
	}

	private onDidChangeNotification(e: INotificationChangeEvent): void {
		if (e.kind === NotificationChangeType.ADD) {

			// ARIA alert for screen readers
			this.triggerAriaAlert(e.item);

			// Always log errors to console with full details
			if (e.item.severity === Severity.Error) {
				if (e.item.message.original instanceof Error) {
					console.error(e.item.message.original);
				} else {
					console.error(toErrorMessage(e.item.message.linkedText.toString(), true));
				}
			}
		}
	}

	private triggerAriaAlert(notification: INotificationViewItem): void {
		if (notification.priority === NotificationPriority.SILENT) {
			return;
		}

		// Trigger the alert again whenever the message changes
		const listener = notification.onDidChangeContent(e => {
			if (e.kind === NotificationViewItemContentChangeKind.MESSAGE) {
				this.doTriggerAriaAlert(notification);
			}
		});

		Event.once(notification.onDidClose)(() => listener.dispose());

		this.doTriggerAriaAlert(notification);
	}

	private doTriggerAriaAlert(notification: INotificationViewItem): void {
		let alertText: string;
		if (notification.severity === Severity.Error) {
			alertText = localize('alertErrorMessage', "Error: {0}", notification.message.linkedText.toString());
		} else if (notification.severity === Severity.Warning) {
			alertText = localize('alertWarningMessage', "Warning: {0}", notification.message.linkedText.toString());
		} else {
			alertText = localize('alertInfoMessage', "Info: {0}", notification.message.linkedText.toString());
		}

		alert(alertText);
	}
}
