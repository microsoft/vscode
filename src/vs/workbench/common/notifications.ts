/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { Severity } from 'vs/platform/message/common/message';
import { IMarkdownString } from 'vs/base/common/htmlContent';
import { IAction } from 'vs/base/common/actions';
import { INotification, INotificationHandle } from 'vs/platform/notification/common/notification';
import { toErrorMessage } from 'vs/base/common/errorMessage';
import { localize } from 'vs/nls';
import Event, { Emitter, once } from 'vs/base/common/event';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';

export interface INotificationsModel {

	readonly notifications: INotificationViewItem[];
	readonly onDidNotificationChange: Event<INotificationChangeEvent>;

	notify(notification: INotification): INotificationHandle;
}

export enum NotificationChangeType {
	ADD,
	CHANGE,
	REMOVE
}

export interface INotificationChangeEvent {
	index: number;
	item: INotificationViewItem;
	kind: NotificationChangeType;
}

class NoOpNotification implements INotificationHandle {
	dispose() { }
}

export class NotificationsModel implements INotificationsModel {

	private static NO_OP_NOTIFICATION = new NoOpNotification();

	private _notifications: INotificationViewItem[];

	private _onDidNotificationChange: Emitter<INotificationChangeEvent>;
	private toDispose: IDisposable[];

	constructor() {
		this._notifications = [];
		this.toDispose = [];

		this._onDidNotificationChange = new Emitter<INotificationChangeEvent>();
		this.toDispose.push(this._onDidNotificationChange);
	}

	public get notifications(): INotificationViewItem[] {
		return this._notifications;
	}

	public get onDidNotificationChange(): Event<INotificationChangeEvent> {
		return this._onDidNotificationChange.event;
	}

	public notify(notification: INotification): INotificationHandle {
		const item = this.createViewItem(notification);
		if (item instanceof NoOpNotification) {
			return item; // return early if this is a no-op
		}

		// Add to list as first entry (TODO@notification dedupe!)
		this._notifications.splice(0, 0, item);

		// Events
		this._onDidNotificationChange.fire({ item, index: 0, kind: NotificationChangeType.ADD });

		return item;
	}

	private createViewItem(notification: INotification): INotificationViewItem | NoOpNotification {
		const item = NotificationViewItem.create(notification);
		if (!item) {
			return NotificationsModel.NO_OP_NOTIFICATION;
		}

		// Item Events
		const itemChangeListener = item.onDidChange(() => {
			const index = this._notifications.indexOf(item);
			if (index >= 0) {
				this._onDidNotificationChange.fire({ item, index, kind: NotificationChangeType.CHANGE });
			}
		});

		once(item.onDidDispose)(() => {
			itemChangeListener.dispose();

			const index = this._notifications.indexOf(item);
			if (index >= 0) {
				this._notifications.splice(index, 1);
				this._onDidNotificationChange.fire({ item, index, kind: NotificationChangeType.REMOVE });
			}
		});

		return item;
	}

	public dispose(): void {
		this.toDispose = dispose(this.toDispose);
	}
}

export interface INotificationViewItem {
	readonly severity: Severity;
	readonly message: IMarkdownString;
	readonly source: string;
	readonly actions: IAction[];

	readonly expanded: boolean;
	readonly canCollapse: boolean;

	readonly onDidChange: Event<void>;
	readonly onDidDispose: Event<void>;

	expand(): void;
	collapse(): void;

	dispose(): void;
}

export class NotificationViewItem implements INotificationViewItem {

	private static DEFAULT_SOURCE = localize('product', "Product");

	private _expanded: boolean;
	private toDispose: IDisposable[];

	private _onDidChange: Emitter<void>;
	private _onDidDispose: Emitter<void>;

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

	private constructor(private _severity: Severity, private _message: IMarkdownString, private _source: string, private _actions: IAction[]) {
		this.toDispose = [];
		this._expanded = _actions.length > 0;

		this._onDidChange = new Emitter<void>();
		this.toDispose.push(this._onDidChange);

		this._onDidDispose = new Emitter<void>();
		this.toDispose.push(this._onDidDispose);

		this.toDispose.push(..._actions);
	}

	public get onDidChange(): Event<void> {
		return this._onDidChange.event;
	}

	public get onDidDispose(): Event<void> {
		return this._onDidDispose.event;
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
		this._onDidChange.fire();
	}

	public collapse(): void {
		this._expanded = false;
		this._onDidChange.fire();
	}

	public dispose(): void {
		this._onDidDispose.fire();

		this.toDispose = dispose(this.toDispose);
	}
}