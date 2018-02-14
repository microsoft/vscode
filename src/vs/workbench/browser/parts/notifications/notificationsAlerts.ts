/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { alert } from 'vs/base/browser/ui/aria/aria';
import { localize } from 'vs/nls';
import { Severity } from 'vs/platform/message/common/message';
import { INotificationViewItem, INotificationsModel, NotificationChangeType, INotificationChangeEvent } from 'vs/workbench/common/notifications';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';

export class NotificationsAlerts {

	private toDispose: IDisposable[];

	constructor(private model: INotificationsModel) {
		this.toDispose = [];

		// Alert initial notifications if any
		model.notifications.forEach(n => this.ariaAlert(n));

		this.registerListeners();
	}

	private registerListeners(): void {
		this.toDispose.push(this.model.onDidNotificationsChange(e => this.onDidNotificationsChange(e)));
	}

	private onDidNotificationsChange(e: INotificationChangeEvent): void {
		if (e.kind === NotificationChangeType.ADD) {
			this.ariaAlert(e.item);
		}
	}

	private ariaAlert(notifiation: INotificationViewItem): void {
		let alertText: string;
		if (notifiation.severity === Severity.Error) {
			alertText = localize('alertErrorMessage', "Error: {0}", notifiation.message.value);
		} else if (notifiation.severity === Severity.Warning) {
			alertText = localize('alertWarningMessage', "Warning: {0}", notifiation.message.value);
		} else {
			alertText = localize('alertInfoMessage', "Info: {0}", notifiation.message.value);
		}

		alert(alertText);
	}

	public dispose(): void {
		this.toDispose = dispose(this.toDispose);
	}
}