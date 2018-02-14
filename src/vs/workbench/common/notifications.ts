/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { Severity } from 'vs/platform/message/common/message';
import { IMarkdownString } from 'vs/base/common/htmlContent';
import { IAction } from 'vs/base/common/actions';
import { INotification } from 'vs/platform/notification/common/notification';
import { toErrorMessage } from 'vs/base/common/errorMessage';
import { localize } from 'vs/nls';
import Event, { Emitter } from 'vs/base/common/event';

export class INotificationsModel {

}

export class NotificationsModel implements INotificationsModel {

}

export interface INotificationViewItem {
	readonly severity: Severity;
	readonly message: IMarkdownString;
	readonly expanded: boolean;
	readonly canCollapse: boolean;
	readonly source: string;
	readonly actions: IAction[];

	readonly onDidExpansionChange: Event<void>;

	expand(): void;
	collapse(): void;

	dispose(): void;
}

export class NotificationViewItem implements INotificationViewItem {

	private static DEFAULT_SOURCE = localize('product', "Product");

	private _expanded: boolean;

	private _onDidExpansionChange = new Emitter<void>();

	constructor(private _severity: Severity, private _message: IMarkdownString, private _source: string, private _actions: IAction[]) {
		this._expanded = _actions.length > 0;
	}

	public get onDidExpansionChange(): Event<void> {
		return this._onDidExpansionChange.event;
	}

	public static create(notification: INotification): INotificationViewItem {
		if (!notification || !notification.message) {
			return null; // we need a message to show
		}

		let message: IMarkdownString;
		if (notification.message instanceof Error) {
			message = { value: toErrorMessage(notification.message, false), isTrusted: true };
		} else if (typeof notification.message === 'string') {
			message = { value: notification.message, isTrusted: true };
		} else if (notification.message.value) {
			message = notification.message;
		}

		if (!message) {
			return null; // we need a message to show
		}

		return new NotificationViewItem(notification.severity, message, notification.source || NotificationViewItem.DEFAULT_SOURCE, notification.actions || []);
	}

	public get canCollapse(): boolean {
		return this._actions.length === 0;
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

	public get source(): string {
		return this._source;
	}

	public get actions(): IAction[] {
		return this._actions;
	}

	public expand(): void {
		this._expanded = true;
		this._onDidExpansionChange.fire();
	}

	public collapse(): void {
		this._expanded = false;
		this._onDidExpansionChange.fire();
	}

	public dispose(): void {
		this._onDidExpansionChange.dispose();
	}
}