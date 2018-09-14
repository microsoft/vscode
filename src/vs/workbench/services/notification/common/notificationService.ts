/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { INotificationService, INotification, INotificationHandle, Severity, NotificationMessage, INotificationActions, IPromptChoice } from 'vs/platform/notification/common/notification';
import { INotificationsModel, NotificationsModel, ChoiceAction } from 'vs/workbench/common/notifications';
import { dispose, Disposable } from 'vs/base/common/lifecycle';
import { once } from 'vs/base/common/event';

export class NotificationService extends Disposable implements INotificationService {

	_serviceBrand: any;

	private _model: INotificationsModel = this._register(new NotificationsModel());

	get model(): INotificationsModel {
		return this._model;
	}

	info(message: NotificationMessage | NotificationMessage[]): void {
		if (Array.isArray(message)) {
			message.forEach(m => this.info(m));

			return;
		}

		this.model.notify({ severity: Severity.Info, message });
	}

	warn(message: NotificationMessage | NotificationMessage[]): void {
		if (Array.isArray(message)) {
			message.forEach(m => this.warn(m));

			return;
		}

		this.model.notify({ severity: Severity.Warning, message });
	}

	error(message: NotificationMessage | NotificationMessage[]): void {
		if (Array.isArray(message)) {
			message.forEach(m => this.error(m));

			return;
		}

		this.model.notify({ severity: Severity.Error, message });
	}

	notify(notification: INotification): INotificationHandle {
		return this.model.notify(notification);
	}

	prompt(severity: Severity, message: string, choices: IPromptChoice[], onCancel?: () => void): INotificationHandle {
		let handle: INotificationHandle;

		// Convert choices into primary/secondary actions
		const actions: INotificationActions = { primary: [], secondary: [] };
		choices.forEach((choice, index) => {
			const action = new ChoiceAction(`workbench.dialog.choice.${index}`, choice);
			if (!choice.isSecondary) {
				actions.primary.push(action);
			} else {
				actions.secondary.push(action);
			}
		});

		// Show notification with actions
		handle = this.notify({ severity, message, actions });

		once(handle.onDidClose)(() => {

			// Cleanup when notification gets disposed
			dispose(...actions.primary, ...actions.secondary);

			// Indicate cancellation to the outside if no action was executed
			if (typeof onCancel === 'function' && ![...actions.primary, ...actions.secondary].some((action: ChoiceAction) => action.clicked)) {
				onCancel();
			}
		});

		return handle;
	}
}