/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { Severity } from 'vs/platform/message/common/message';
import { IMarkdownString } from 'vs/base/common/htmlContent';
import { INotification, INotificationHandle, INotificationActions, INotificationProgress } from 'vs/platform/notification/common/notification';
import { toErrorMessage } from 'vs/base/common/errorMessage';
import Event, { Emitter, once } from 'vs/base/common/event';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import { isPromiseCanceledError } from 'vs/base/common/errors';

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
	public readonly progress = new NoOpProgress();

	public dispose(): void { }
}

class NoOpProgress implements INotificationProgress {
	public infinite(): void { }

	public done(): void { }

	public total(value: number): void { }

	public worked(value: number): void { }
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
		if (!item) {
			return NotificationsModel.NO_OP_NOTIFICATION; // return early if this is a no-op
		}

		// Deduplicate
		const duplicate = this.findNotification(item);
		if (duplicate) {
			duplicate.dispose();
		}

		// Add to list as first entry
		this._notifications.splice(0, 0, item);

		// Events
		this._onDidNotificationChange.fire({ item, index: 0, kind: NotificationChangeType.ADD });

		// Wrap into handle
		return {
			dispose: () => this.disposeItem(item),
			progress: {
				infinite: () => item.progress.infinite(),
				total: value => item.progress.total(value),
				worked: value => item.progress.worked(value),
				done: () => item.progress.done()
			}
		};
	}

	private disposeItem(item: INotificationViewItem): void {
		const liveItem = this.findNotification(item);
		if (liveItem && liveItem !== item) {
			liveItem.dispose(); // item could have been replaced with another one, make sure to dispose the live item
		} else {
			item.dispose(); // otherwise just dispose the item that was passed in
		}
	}

	private findNotification(item: INotificationViewItem): INotificationViewItem {
		for (let i = 0; i < this._notifications.length; i++) {
			const notification = this._notifications[i];
			if (notification.equals(item)) {
				return notification;
			}
		}

		return void 0;
	}

	private createViewItem(notification: INotification): INotificationViewItem {
		const item = NotificationViewItem.create(notification);
		if (!item) {
			return null;
		}

		// Item Events
		const itemChangeListener = item.onDidExpansionChange(() => {
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
	readonly actions: INotificationActions;
	readonly progress: INotificationViewItemProgress;

	readonly expanded: boolean;
	readonly canCollapse: boolean;

	readonly onDidExpansionChange: Event<void>;
	readonly onDidDispose: Event<void>;
	readonly onDidLabelChange: Event<INotificationViewItemLabelChangeEvent>;

	expand(): void;
	collapse(): void;
	toggle(): void;

	hasProgress(): boolean;

	dispose(): void;

	equals(item: INotificationViewItem);
}

export function isNotificationViewItem(obj: any): obj is INotificationViewItem {
	return obj instanceof NotificationViewItem;
}

export enum NotificationViewItemLabelKind {
	PROGRESS
}

export interface INotificationViewItemLabelChangeEvent {
	kind: NotificationViewItemLabelKind;
}

export interface INotificationViewItemProgressState {
	infinite?: boolean;
	total?: number;
	worked?: number;
	done?: boolean;
}

export interface INotificationViewItemProgress extends INotificationProgress {
	readonly state: INotificationViewItemProgressState;

	dispose(): void;
}

export class NotificationViewItemProgress implements INotificationViewItemProgress {
	private _state: INotificationViewItemProgressState;

	private _onDidChange: Emitter<void>;
	private toDispose: IDisposable[];

	constructor() {
		this.toDispose = [];
		this._state = Object.create(null);

		this._onDidChange = new Emitter<void>();
		this.toDispose.push(this._onDidChange);
	}

	public get state(): INotificationViewItemProgressState {
		return this._state;
	}

	public get onDidChange(): Event<void> {
		return this._onDidChange.event;
	}

	public infinite(): void {
		if (this._state.infinite) {
			return;
		}

		this._state.infinite = true;

		this._state.total = void 0;
		this._state.worked = void 0;
		this._state.done = void 0;

		this._onDidChange.fire();
	}

	public done(): void {
		if (this._state.done) {
			return;
		}

		this._state.done = true;

		this._state.infinite = void 0;
		this._state.total = void 0;
		this._state.worked = void 0;

		this._onDidChange.fire();
	}

	public total(value: number): void {
		if (this._state.total === value) {
			return;
		}

		this._state.total = value;

		this._state.infinite = void 0;
		this._state.done = void 0;

		this._onDidChange.fire();
	}

	public worked(value: number): void {
		if (this._state.worked === value) {
			return;
		}

		this._state.worked = value;

		this._state.infinite = void 0;
		this._state.done = void 0;

		this._onDidChange.fire();
	}

	public dispose(): void {
		this.toDispose = dispose(this.toDispose);
	}
}

export class NotificationViewItem implements INotificationViewItem {

	private static MAX_MESSAGE_LENGTH = 1000;

	private _expanded: boolean;
	private toDispose: IDisposable[];

	private _onDidExpansionChange: Emitter<void>;
	private _onDidDispose: Emitter<void>;
	private _onDidLabelChange: Emitter<INotificationViewItemLabelChangeEvent>;

	private _progress: NotificationViewItemProgress;

	public static create(notification: INotification): INotificationViewItem {
		if (!notification || !notification.message || isPromiseCanceledError(notification.message)) {
			return null; // we need a message to show
		}

		let severity: Severity;
		if (typeof notification.severity === 'number') {
			severity = notification.severity;
		} else {
			severity = Severity.Info;
		}

		let message: IMarkdownString;
		if (notification.message instanceof Error) {
			message = { value: toErrorMessage(notification.message, false), isTrusted: false };
		} else if (typeof notification.message === 'string') {
			message = { value: notification.message, isTrusted: false };
		} else if (notification.message.value) {
			message = notification.message;
		}

		if (!message || typeof message.value !== 'string') {
			return null; // we need a message to show
		}

		if (message.value.length > NotificationViewItem.MAX_MESSAGE_LENGTH) {
			message.value = `${message.value.substr(0, NotificationViewItem.MAX_MESSAGE_LENGTH)}...`;
		}

		return new NotificationViewItem(severity, message, notification.source, notification.actions);
	}

	private constructor(private _severity: Severity, private _message: IMarkdownString, private _source: string, private _actions: INotificationActions = { primary: [], secondary: [] }) {
		if (!Array.isArray(_actions.primary)) {
			_actions.primary = [];
		}

		if (!Array.isArray(_actions.secondary)) {
			_actions.secondary = [];
		}

		this.toDispose = [];
		this._expanded = _actions.primary.length > 0;

		this._onDidExpansionChange = new Emitter<void>();
		this.toDispose.push(this._onDidExpansionChange);

		this._onDidLabelChange = new Emitter<INotificationViewItemLabelChangeEvent>();
		this.toDispose.push(this._onDidLabelChange);

		this._onDidDispose = new Emitter<void>();
		this.toDispose.push(this._onDidDispose);

		this.toDispose.push(..._actions.primary);
		this.toDispose.push(..._actions.secondary);
	}

	public get onDidExpansionChange(): Event<void> {
		return this._onDidExpansionChange.event;
	}

	public get onDidLabelChange(): Event<INotificationViewItemLabelChangeEvent> {
		return this._onDidLabelChange.event;
	}

	public get onDidDispose(): Event<void> {
		return this._onDidDispose.event;
	}

	public get canCollapse(): boolean {
		return this._actions.primary.length === 0;
	}

	public get expanded(): boolean {
		return this._expanded;
	}

	public get severity(): Severity {
		return this._severity;
	}

	public hasProgress(): boolean {
		return !!this._progress;
	}

	public get progress(): INotificationViewItemProgress {
		if (!this._progress) {
			this._progress = new NotificationViewItemProgress();
			this.toDispose.push(this._progress);
			this.toDispose.push(this._progress.onDidChange(() => this._onDidLabelChange.fire({ kind: NotificationViewItemLabelKind.PROGRESS })));
		}

		return this._progress;
	}

	public get message(): IMarkdownString {
		return this._message;
	}

	public get source(): string {
		return this._source;
	}

	public get actions(): INotificationActions {
		return this._actions;
	}

	public expand(): void {
		if (this._expanded || !this.canCollapse) {
			return;
		}

		this._expanded = true;
		this._onDidExpansionChange.fire();
	}

	public collapse(): void {
		if (!this._expanded || !this.canCollapse) {
			return;
		}

		this._expanded = false;
		this._onDidExpansionChange.fire();
	}

	public toggle(): void {
		if (this._expanded) {
			this.collapse();
		} else {
			this.expand();
		}
	}

	public dispose(): void {
		this._onDidDispose.fire();

		this.toDispose = dispose(this.toDispose);
	}

	public equals(other: INotificationViewItem): boolean {
		if (this._source !== other.source) {
			return false;
		}

		const primaryActions = this._actions.primary;
		const otherPrimaryActions = other.actions.primary;
		if (primaryActions.length !== otherPrimaryActions.length) {
			return false;
		}

		if (this._message.value !== other.message.value) {
			return false;
		}

		for (let i = 0; i < primaryActions.length; i++) {
			if (primaryActions[i].id !== otherPrimaryActions[i].id) {
				return false;
			}
		}

		return true;
	}
}