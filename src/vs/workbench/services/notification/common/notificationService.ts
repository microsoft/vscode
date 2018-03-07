/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { INotificationService, INotification, INotificationHandle, Severity, NotificationMessage, PromptOption, INotificationActions } from 'vs/platform/notification/common/notification';
import { INotificationsModel, NotificationsModel } from 'vs/workbench/common/notifications';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import { TPromise } from 'vs/base/common/winjs.base';
import { Action } from 'vs/base/common/actions';
import { once } from 'vs/base/common/event';

export class NotificationService implements INotificationService {

	public _serviceBrand: any;

	private _model: INotificationsModel;
	private toDispose: IDisposable[];

	constructor() {
		this.toDispose = [];

		const model = new NotificationsModel();
		this.toDispose.push(model);
		this._model = model;
	}

	public get model(): INotificationsModel {
		return this._model;
	}

	public info(message: NotificationMessage | NotificationMessage[]): void {
		if (Array.isArray(message)) {
			message.forEach(m => this.info(m));

			return;
		}

		this.model.notify({ severity: Severity.Info, message });
	}

	public warn(message: NotificationMessage | NotificationMessage[]): void {
		if (Array.isArray(message)) {
			message.forEach(m => this.warn(m));

			return;
		}

		this.model.notify({ severity: Severity.Warning, message });
	}

	public error(message: NotificationMessage | NotificationMessage[]): void {
		if (Array.isArray(message)) {
			message.forEach(m => this.error(m));

			return;
		}

		this.model.notify({ severity: Severity.Error, message });
	}

	public notify(notification: INotification): INotificationHandle {
		return this.model.notify(notification);
	}

	public prompt(severity: Severity, message: string, choices: PromptOption[]): TPromise<number> {
		let handle: INotificationHandle;

		const promise = new TPromise<number>(c => {

			// Complete promise with index of action that was picked
			const callback = (index: number, closeNotification: boolean) => () => {
				c(index);

				if (closeNotification) {
					handle.dispose();
				}

				return TPromise.as(void 0);
			};

			// Convert choices into primary/secondary actions
			const actions: INotificationActions = {
				primary: [],
				secondary: []
			};

			choices.forEach((choice, index) => {
				let isPrimary = true;
				let label: string;
				let closeNotification = false;

				if (typeof choice === 'string') {
					label = choice;
				} else {
					isPrimary = false;
					label = choice.label;
					closeNotification = !choice.keepOpen;
				}

				const action = new Action(`workbench.dialog.choice.${index}`, label, null, true, callback(index, closeNotification));
				if (isPrimary) {
					actions.primary.push(action);
				} else {
					actions.secondary.push(action);
				}
			});

			// Show notification with actions
			handle = this.notify({ severity, message, actions });

			// Cancel promise when notification gets disposed
			once(handle.onDidDispose)(() => promise.cancel());

		}, () => handle.dispose());

		return promise;
	}

	public dispose(): void {
		this.toDispose = dispose(this.toDispose);
	}
}