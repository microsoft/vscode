/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { Severity } from 'vs/platform/message/common/message';
import { IMarkdownString } from 'vs/base/common/htmlContent';

export class INotificationsModel {

}

export class NotificationsModel implements INotificationsModel {

}

export interface INotificationViewItem {
	readonly severity: Severity;
	readonly message: IMarkdownString;
	readonly expanded: boolean;

	expand(): void;
	collapse(): void;
}

export class NotificationViewItem implements INotificationViewItem {
	private _expanded: boolean;

	constructor(private _severity: Severity, private _message: IMarkdownString) {
	}

	public get expanded(): boolean {
		return this._expanded;
	}

	public get severity(): Severity {
		return this._severity;
	}

	public get message(): IMarkdownString {
		return this._message;
	}

	public expand(): void {
		this._expanded = true;
	}

	public collapse(): void {
		this._expanded = false;
	}
}