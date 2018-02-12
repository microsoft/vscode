/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { INotificationService, INotification } from 'vs/platform/notification/common/notification';
import { Severity } from 'vs/platform/message/common/message';
import { NotificationList } from 'vs/workbench/services/notification/browser/notificationList';

export class NotificationService implements INotificationService {

	public _serviceBrand: any;

	private handler: NotificationList;

	constructor(
		container: HTMLElement
	) {
		this.handler = new NotificationList(container);
	}

	public notify(sev: Severity, message: string): INotification {
		this.handler.show(sev, message);

		return { dispose: () => void 0 };
	}
}