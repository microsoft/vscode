/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { INotificationService, INotification, INotificationHandle, Severity, NotificationMessage } from 'vs/platform/notification/common/notification';
import { INotificationsModel, NotificationsModel } from 'vs/workbench/common/notifications';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';

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

	public dispose(): void {
		this.toDispose = dispose(this.toDispose);
	}
}