/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { INotificationService, INotification, INotificationHandle, Severity, NotificationMessage, INotificationActions, IPromptChoice, IPromptOptions, IStatusMessageOptions } from 'vs/platform/notification/common/notification';
import { INotificationsModel, NotificationsModel, ChoiceAction } from 'vs/workbench/common/notifications';
import { Disposable, DisposableStore, IDisposable } from 'vs/base/common/lifecycle';
import { Event } from 'vs/base/common/event';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { ServiceIdentifier } from 'vs/platform/instantiation/common/instantiation';
import { IAction } from 'vs/base/common/actions';

export class NotificationService extends Disposable implements INotificationService {

	_serviceBrand: ServiceIdentifier<INotificationService>;

	private _model: INotificationsModel = this._register(new NotificationsModel());

	get model(): INotificationsModel {
		return this._model;
	}

	info(message: NotificationMessage | NotificationMessage[]): void {
		if (Array.isArray(message)) {
			message.forEach(m => this.info(m));

			return;
		}

		this.model.addNotification({ severity: Severity.Info, message });
	}

	warn(message: NotificationMessage | NotificationMessage[]): void {
		if (Array.isArray(message)) {
			message.forEach(m => this.warn(m));

			return;
		}

		this.model.addNotification({ severity: Severity.Warning, message });
	}

	error(message: NotificationMessage | NotificationMessage[]): void {
		if (Array.isArray(message)) {
			message.forEach(m => this.error(m));

			return;
		}

		this.model.addNotification({ severity: Severity.Error, message });
	}

	notify(notification: INotification): INotificationHandle {
		return this.model.addNotification(notification);
	}

	prompt(severity: Severity, message: string, choices: IPromptChoice[], options?: IPromptOptions): INotificationHandle {
		const toDispose = new DisposableStore();

		let choiceClicked = false;
		let handle: INotificationHandle;

		// Convert choices into primary/secondary actions
		const primaryActions: IAction[] = [];
		const secondaryActions: IAction[] = [];
		choices.forEach((choice, index) => {
			const action = new ChoiceAction(`workbench.dialog.choice.${index}`, choice);
			if (!choice.isSecondary) {
				primaryActions.push(action);
			} else {
				secondaryActions.push(action);
			}

			// React to action being clicked
			toDispose.add(action.onDidRun(() => {
				choiceClicked = true;

				// Close notification unless we are told to keep open
				if (!choice.keepOpen) {
					handle.close();
				}
			}));

			toDispose.add(action);
		});

		// Show notification with actions
		const actions: INotificationActions = { primary: primaryActions, secondary: secondaryActions };
		handle = this.notify({ severity, message, actions, sticky: options && options.sticky, silent: options && options.silent });

		Event.once(handle.onDidClose)(() => {

			// Cleanup when notification gets disposed
			toDispose.dispose();

			// Indicate cancellation to the outside if no action was executed
			if (options && typeof options.onCancel === 'function' && !choiceClicked) {
				options.onCancel();
			}
		});

		return handle;
	}

	status(message: NotificationMessage, options?: IStatusMessageOptions): IDisposable {
		return this.model.showStatusMessage(message, options);
	}
}

registerSingleton(INotificationService, NotificationService, true);