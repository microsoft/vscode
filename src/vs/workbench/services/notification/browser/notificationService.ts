/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { INotificationService, INotification, INotificationHandle } from 'vs/platform/notification/common/notification';
import { NotificationList } from 'vs/workbench/services/notification/browser/notificationList';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';

export class NotificationService implements INotificationService {

	public _serviceBrand: any;

	private handler: NotificationList;

	constructor(
		container: HTMLElement,
		@IInstantiationService private instantiationService: IInstantiationService
	) {
	}

	private createHandler(): void {
		// TODO should this be a setter to pass in from outside?
		this.handler = this.instantiationService.createInstance(NotificationList, document.getElementById('workbench.main.container'));
	}

	public notify(notification: INotification): INotificationHandle {
		if (!this.handler) {
			this.createHandler();
		}

		return this.handler.show(notification);
	}
}