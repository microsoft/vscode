/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { INotificationService } from 'vs/platform/notification/common/notification';
import { EditorModel } from 'vs/workbench/common/editor';
import { INotificationItem } from 'vs/workbench/services/preferences/common/preferences';

export class NotificationsEditorModel extends EditorModel {
	constructor(
		@INotificationService private readonly notificationService: INotificationService
	) {
		super();
	}
	get notificationItems(): INotificationItem[] {
		return this.notificationService.getNotifications();
	}
	resolve(): Promise<EditorModel> {
		return Promise.resolve(this);
	}
}
