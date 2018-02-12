/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { Severity } from 'vs/platform/message/common/message';

export class INotificationsModel {

}

export class NotificationsModel implements INotificationsModel {

}

export class INotificationViewItem {
	readonly severity: Severity;
	readonly message: string;
}

export class NotificationViewItem implements INotificationViewItem {

	constructor(private _severity: Severity, private _message: string) {

	}

	public get severity(): Severity {
		return this._severity;
	}

	public get message(): string {
		return this._message;
	}
}