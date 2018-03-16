/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { INotification, INotificationHandle, INotificationActions, INotificationProgress, NoOpNotification, Severity, NotificationMessage } from 'vs/platform/notification/common/notification';
import { toErrorMessage } from 'vs/base/common/errorMessage';
import { Event, Emitter, once } from 'vs/base/common/event';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import { isPromiseCanceledError, isErrorWithActions } from 'vs/base/common/errors';

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

	/**
	 * The index this notification has in the list of notifications.
	 */
	index: number;

	/**
	 * The notification this change is about.
	 */
	item: INotificationViewItem;

	/**
	 * The kind of notification change.
	 */
	kind: NotificationChangeType;
}

export class NotificationHandle implements INotificationHandle {
	private readonly _onDidDispose: Emitter<void> = new Emitter();

	constructor(private item: INotificationViewItem, private disposeItem: (item: INotificationViewItem) => void) {
		this.registerListeners();
	}

	private registerListeners(): void {
		once(this.item.onDidDispose)(() => {
			this._onDidDispose.fire();
			this._onDidDispose.dispose();
		});
	}

	public get onDidDispose(): Event<void> {
		return this._onDidDispose.event;
	}

	public get progress(): INotificationProgress {
		return this.item.progress;
	}

	public updateSeverity(severity: Severity): void {
		this.item.updateSeverity(severity);
	}

	public updateMessage(message: NotificationMessage): void {
		this.item.updateMessage(message);
	}

	public updateActions(actions?: INotificationActions): void {
		this.item.updateActions(actions);
	}

	public dispose(): void {
		this.disposeItem(this.item);
		this._onDidDispose.dispose();
	}
}

export class NotificationsModel implements INotificationsModel {

	private static NO_OP_NOTIFICATION = new NoOpNotification();

	private _notifications: INotificationViewItem[];

	private readonly _onDidNotificationChange: Emitter<INotificationChangeEvent>;
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
		return new NotificationHandle(item, item => this.disposeItem(item));
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
		const onItemChangeEvent = () => {
			const index = this._notifications.indexOf(item);
			if (index >= 0) {
				this._onDidNotificationChange.fire({ item, index, kind: NotificationChangeType.CHANGE });
			}
		};

		const itemExpansionChangeListener = item.onDidExpansionChange(() => onItemChangeEvent());

		const itemLabelChangeListener = item.onDidLabelChange(e => {
			// a label change in the area of actions or the message is a change that potentially has an impact
			// on the size of the notification and as such we emit a change event so that viewers can redraw
			if (e.kind === NotificationViewItemLabelKind.ACTIONS || e.kind === NotificationViewItemLabelKind.MESSAGE) {
				onItemChangeEvent();
			}
		});

		once(item.onDidDispose)(() => {
			itemExpansionChangeListener.dispose();
			itemLabelChangeListener.dispose();

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
	readonly message: INotificationMessage;
	readonly source: string;
	readonly actions: INotificationActions;
	readonly progress: INotificationViewItemProgress;

	readonly expanded: boolean;
	readonly canCollapse: boolean;

	readonly onDidExpansionChange: Event<void>;
	readonly onDidDispose: Event<void>;
	readonly onDidLabelChange: Event<INotificationViewItemLabelChangeEvent>;

	expand(): void;
	collapse(skipEvents?: boolean): void;
	toggle(): void;

	hasProgress(): boolean;

	updateSeverity(severity: Severity): void;
	updateMessage(message: NotificationMessage): void;
	updateActions(actions?: INotificationActions): void;

	dispose(): void;

	equals(item: INotificationViewItem);
}

export function isNotificationViewItem(obj: any): obj is INotificationViewItem {
	return obj instanceof NotificationViewItem;
}

export enum NotificationViewItemLabelKind {
	SEVERITY,
	MESSAGE,
	ACTIONS,
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

	private readonly _onDidChange: Emitter<void>;
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

export interface IMessageLink {
	name: string;
	href: string;
	offset: number;
	length: number;
}

export interface INotificationMessage {
	raw: string;
	value: string;
	links: IMessageLink[];
}

export class NotificationViewItem implements INotificationViewItem {

	private static MAX_MESSAGE_LENGTH = 1000;

	// Example link: "Some message with [link text](http://link.href)."
	// RegEx: [, anything not ], ], (, http:|https:, //, no whitespace)
	private static LINK_REGEX = /\[([^\]]+)\]\((https?:\/\/[^\)\s]+)\)/gi;

	private _expanded: boolean;
	private toDispose: IDisposable[];

	private _actions: INotificationActions;
	private _progress: NotificationViewItemProgress;

	private readonly _onDidExpansionChange: Emitter<void>;
	private readonly _onDidDispose: Emitter<void>;
	private readonly _onDidLabelChange: Emitter<INotificationViewItemLabelChangeEvent>;

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

		const message = NotificationViewItem.parseNotificationMessage(notification.message);
		if (!message) {
			return null; // we need a message to show
		}

		let actions: INotificationActions;
		if (notification.actions) {
			actions = notification.actions;
		} else if (isErrorWithActions(notification.message)) {
			actions = { primary: notification.message.actions };
		}

		return new NotificationViewItem(severity, message, notification.source, actions);
	}

	private static parseNotificationMessage(input: NotificationMessage): INotificationMessage {
		let message: string;

		if (input instanceof Error) {
			message = toErrorMessage(input, false);
		} else if (typeof input === 'string') {
			message = input;
		}

		if (!message) {
			return null; // we need a message to show
		}

		const raw = message;

		// Make sure message is in the limits
		if (message.length > NotificationViewItem.MAX_MESSAGE_LENGTH) {
			message = `${message.substr(0, NotificationViewItem.MAX_MESSAGE_LENGTH)}...`;
		}

		// Remove newlines from messages as we do not support that and it makes link parsing hard
		message = message.replace(/(\r\n|\n|\r)/gm, ' ').trim();

		// Parse Links
		const links: IMessageLink[] = [];
		message.replace(NotificationViewItem.LINK_REGEX, (matchString: string, name: string, href: string, offset: number) => {
			links.push({ name, href, offset, length: matchString.length });

			return matchString;
		});


		return { raw, value: message, links };
	}

	private constructor(private _severity: Severity, private _message: INotificationMessage, private _source: string, actions?: INotificationActions) {
		this.toDispose = [];

		this.setActions(actions);

		this._onDidExpansionChange = new Emitter<void>();
		this.toDispose.push(this._onDidExpansionChange);

		this._onDidLabelChange = new Emitter<INotificationViewItemLabelChangeEvent>();
		this.toDispose.push(this._onDidLabelChange);

		this._onDidDispose = new Emitter<void>();
		this.toDispose.push(this._onDidDispose);
	}

	private setActions(actions: INotificationActions): void {
		if (!actions) {
			actions = { primary: [], secondary: [] };
		}

		if (!Array.isArray(actions.primary)) {
			actions.primary = [];
		}

		if (!Array.isArray(actions.secondary)) {
			actions.secondary = [];
		}

		this._actions = actions;
		this._expanded = actions.primary.length > 0;

		this.toDispose.push(...actions.primary);
		this.toDispose.push(...actions.secondary);
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

	public get message(): INotificationMessage {
		return this._message;
	}

	public get source(): string {
		return this._source;
	}

	public get actions(): INotificationActions {
		return this._actions;
	}

	public updateSeverity(severity: Severity): void {
		this._severity = severity;
		this._onDidLabelChange.fire({ kind: NotificationViewItemLabelKind.SEVERITY });
	}

	public updateMessage(input: NotificationMessage): void {
		const message = NotificationViewItem.parseNotificationMessage(input);
		if (!message) {
			return;
		}

		this._message = message;
		this._onDidLabelChange.fire({ kind: NotificationViewItemLabelKind.MESSAGE });
	}

	public updateActions(actions?: INotificationActions): void {
		this.setActions(actions);

		this._onDidLabelChange.fire({ kind: NotificationViewItemLabelKind.ACTIONS });
	}

	public expand(): void {
		if (this._expanded || !this.canCollapse) {
			return;
		}

		this._expanded = true;
		this._onDidExpansionChange.fire();
	}

	public collapse(skipEvents?: boolean): void {
		if (!this._expanded || !this.canCollapse) {
			return;
		}

		this._expanded = false;

		if (!skipEvents) {
			this._onDidExpansionChange.fire();
		}
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