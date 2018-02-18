/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { INotificationService, INotification, INotificationHandle } from 'vs/platform/notification/common/notification';
import { Severity } from 'vs/platform/message/common/message';
import { INotificationsModel, NotificationsModel } from 'vs/workbench/common/notifications';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';

export class NotificationService implements INotificationService {

	public _serviceBrand: any;

	private _model: INotificationsModel;
	private toDispose: IDisposable[];

	constructor(
		container: HTMLElement
	) {
		this.toDispose = [];

		const model = new NotificationsModel();
		this.toDispose.push(model);
		this._model = model;
	}

	public get model(): INotificationsModel {
		return this._model;
	}

	public info(message: string): INotificationHandle {
		return this.model.notify({ severity: Severity.Info, message });
	}

	public warn(message: string): INotificationHandle {
		return this.model.notify({ severity: Severity.Warning, message });
	}

	public error(error: string | Error): INotificationHandle {
		return this.model.notify({ severity: Severity.Error, message: error });
	}

	public notify(notification: INotification): INotificationHandle {
		return this.model.notify(notification);
	}

	public dispose(): void {
		this.toDispose = dispose(this.toDispose);
	}
}