/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { INotification, INotificationHandle, INotificationActions, INotificationProgress, NoOpNotification, Severity, NotificationMessage, IPromptChoice } from 'vs/platform/notification/common/notification';
import { toErrorMessage } from 'vs/base/common/errorMessage';
import { Event, Emitter } from 'vs/base/common/event';
import { Disposable } from 'vs/base/common/lifecycle';
import { isPromiseCanceledError } from 'vs/base/common/errors';
import { Action } from 'vs/base/common/actions';
import { isErrorWithActions } from 'vs/base/common/errorsWithActions';

export interface INotificationsModel {

	readonly notifications: INotificationViewItem[];
	readonly onDidNotificationChange: Event<INotificationChangeEvent>;

	notify(notification: INotification): INotificationHandle;
}

export const enum NotificationChangeType {
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

	private readonly _onDidClose: Emitter<void> = new Emitter();
	get onDidClose(): Event<void> { return this._onDidClose.event; }

	constructor(private item: INotificationViewItem, private closeItem: (item: INotificationViewItem) => void) {
		this.registerListeners();
	}

	private registerListeners(): void {
		Event.once(this.item.onDidClose)(() => {
			this._onDidClose.fire();
			this._onDidClose.dispose();
		});
	}

	get progress(): INotificationProgress {
		return this.item.progress;
	}

	updateSeverity(severity: Severity): void {
		this.item.updateSeverity(severity);
	}

	updateMessage(message: NotificationMessage): void {
		this.item.updateMessage(message);
	}

	updateActions(actions?: INotificationActions): void {
		this.item.updateActions(actions);
	}

	close(): void {
		this.closeItem(this.item);
		this._onDidClose.dispose();
	}
}

export class NotificationsModel extends Disposable implements INotificationsModel {

	private static NO_OP_NOTIFICATION = new NoOpNotification();

	private readonly _onDidNotificationChange: Emitter<INotificationChangeEvent> = this._register(new Emitter<INotificationChangeEvent>());
	get onDidNotificationChange(): Event<INotificationChangeEvent> { return this._onDidNotificationChange.event; }

	private _notifications: INotificationViewItem[] = [];

	get notifications(): INotificationViewItem[] {
		return this._notifications;
	}

	notify(notification: INotification): INotificationHandle {
		const item = this.createViewItem(notification);
		if (!item) {
			return NotificationsModel.NO_OP_NOTIFICATION; // return early if this is a no-op
		}

		// Deduplicate
		const duplicate = this.findNotification(item);
		if (duplicate) {
			duplicate.close();
		}

		// Add to list as first entry
		this._notifications.splice(0, 0, item);

		// Events
		this._onDidNotificationChange.fire({ item, index: 0, kind: NotificationChangeType.ADD });

		// Wrap into handle
		return new NotificationHandle(item, item => this.closeItem(item));
	}

	private closeItem(item: INotificationViewItem): void {
		const liveItem = this.findNotification(item);
		if (liveItem && liveItem !== item) {
			liveItem.close(); // item could have been replaced with another one, make sure to close the live item
		} else {
			item.close(); // otherwise just close the item that was passed in
		}
	}

	private findNotification(item: INotificationViewItem): INotificationViewItem | undefined {
		for (const notification of this._notifications) {
			if (notification.equals(item)) {
				return notification;
			}
		}

		return undefined;
	}

	private createViewItem(notification: INotification): INotificationViewItem | null {
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

		Event.once(item.onDidClose)(() => {
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
}

export interface INotificationViewItem {
	readonly severity: Severity;
	readonly sticky: boolean;
	readonly silent: boolean;
	readonly message: INotificationMessage;
	readonly source: string | undefined;
	readonly actions: INotificationActions;
	readonly progress: INotificationViewItemProgress;

	readonly expanded: boolean;
	readonly canCollapse: boolean;

	readonly onDidExpansionChange: Event<void>;
	readonly onDidClose: Event<void>;
	readonly onDidLabelChange: Event<INotificationViewItemLabelChangeEvent>;

	expand(): void;
	collapse(skipEvents?: boolean): void;
	toggle(): void;

	hasProgress(): boolean;
	hasPrompt(): boolean;

	updateSeverity(severity: Severity): void;
	updateMessage(message: NotificationMessage): void;
	updateActions(actions?: INotificationActions): void;

	close(): void;

	equals(item: INotificationViewItem): boolean;
}

export function isNotificationViewItem(obj: any): obj is INotificationViewItem {
	return obj instanceof NotificationViewItem;
}

export const enum NotificationViewItemLabelKind {
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

export class NotificationViewItemProgress extends Disposable implements INotificationViewItemProgress {
	private _state: INotificationViewItemProgressState;

	private readonly _onDidChange: Emitter<void> = this._register(new Emitter<void>());
	get onDidChange(): Event<void> { return this._onDidChange.event; }

	constructor() {
		super();

		this._state = Object.create(null);
	}

	get state(): INotificationViewItemProgressState {
		return this._state;
	}

	infinite(): void {
		if (this._state.infinite) {
			return;
		}

		this._state.infinite = true;

		this._state.total = undefined;
		this._state.worked = undefined;
		this._state.done = undefined;

		this._onDidChange.fire();
	}

	done(): void {
		if (this._state.done) {
			return;
		}

		this._state.done = true;

		this._state.infinite = undefined;
		this._state.total = undefined;
		this._state.worked = undefined;

		this._onDidChange.fire();
	}

	total(value: number): void {
		if (this._state.total === value) {
			return;
		}

		this._state.total = value;

		this._state.infinite = undefined;
		this._state.done = undefined;

		this._onDidChange.fire();
	}

	worked(value: number): void {
		if (typeof this._state.worked === 'number') {
			this._state.worked += value;
		} else {
			this._state.worked = value;
		}

		this._state.infinite = undefined;
		this._state.done = undefined;

		this._onDidChange.fire();
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
	original: NotificationMessage;
	value: string;
	links: IMessageLink[];
}

export class NotificationViewItem extends Disposable implements INotificationViewItem {

	private static MAX_MESSAGE_LENGTH = 1000;

	// Example link: "Some message with [link text](http://link.href)."
	// RegEx: [, anything not ], ], (, http:|https:, //, no whitespace)
	private static LINK_REGEX = /\[([^\]]+)\]\((https?:\/\/[^\)\s]+)\)/gi;

	private _expanded: boolean;

	private _actions: INotificationActions;
	private _progress: NotificationViewItemProgress;

	private readonly _onDidExpansionChange: Emitter<void> = this._register(new Emitter<void>());
	get onDidExpansionChange(): Event<void> { return this._onDidExpansionChange.event; }

	private readonly _onDidClose: Emitter<void> = this._register(new Emitter<void>());
	get onDidClose(): Event<void> { return this._onDidClose.event; }

	private readonly _onDidLabelChange: Emitter<INotificationViewItemLabelChangeEvent> = this._register(new Emitter<INotificationViewItemLabelChangeEvent>());
	get onDidLabelChange(): Event<INotificationViewItemLabelChangeEvent> { return this._onDidLabelChange.event; }

	static create(notification: INotification): INotificationViewItem | null {
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

		let actions: INotificationActions | undefined;
		if (notification.actions) {
			actions = notification.actions;
		} else if (isErrorWithActions(notification.message)) {
			actions = { primary: notification.message.actions };
		}

		return new NotificationViewItem(severity, notification.sticky, notification.silent, message, notification.source, actions);
	}

	private static parseNotificationMessage(input: NotificationMessage): INotificationMessage | undefined {
		let message: string | undefined;
		if (input instanceof Error) {
			message = toErrorMessage(input, false);
		} else if (typeof input === 'string') {
			message = input;
		}

		if (!message) {
			return undefined; // we need a message to show
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

		return { raw, value: message, links, original: input };
	}

	private constructor(
		private _severity: Severity,
		private _sticky: boolean | undefined,
		private _silent: boolean | undefined,
		private _message: INotificationMessage,
		private _source: string | undefined,
		actions?: INotificationActions
	) {
		super();

		this.setActions(actions);
	}

	private setActions(actions: INotificationActions = { primary: [], secondary: [] }): void {
		if (!Array.isArray(actions.primary)) {
			actions.primary = [];
		}

		if (!Array.isArray(actions.secondary)) {
			actions.secondary = [];
		}

		this._actions = actions;
		this._expanded = actions.primary.length > 0;
	}

	get canCollapse(): boolean {
		return !this.hasPrompt();
	}

	get expanded(): boolean {
		return this._expanded;
	}

	get severity(): Severity {
		return this._severity;
	}

	get sticky(): boolean {
		if (this._sticky) {
			return true; // explicitly sticky
		}

		const hasPrompt = this.hasPrompt();
		if (
			(hasPrompt && this._severity === Severity.Error) || // notification errors with actions are sticky
			(!hasPrompt && this._expanded) ||					// notifications that got expanded are sticky
			(this._progress && !this._progress.state.done)		// notifications with running progress are sticky
		) {
			return true;
		}

		return false; // not sticky
	}

	get silent(): boolean {
		return !!this._silent;
	}

	hasPrompt(): boolean {
		if (!this._actions.primary) {
			return false;
		}

		return this._actions.primary.length > 0;
	}

	hasProgress(): boolean {
		return !!this._progress;
	}

	get progress(): INotificationViewItemProgress {
		if (!this._progress) {
			this._progress = this._register(new NotificationViewItemProgress());
			this._register(this._progress.onDidChange(() => this._onDidLabelChange.fire({ kind: NotificationViewItemLabelKind.PROGRESS })));
		}

		return this._progress;
	}

	get message(): INotificationMessage {
		return this._message;
	}

	get source(): string | undefined {
		return this._source;
	}

	get actions(): INotificationActions {
		return this._actions;
	}

	updateSeverity(severity: Severity): void {
		this._severity = severity;
		this._onDidLabelChange.fire({ kind: NotificationViewItemLabelKind.SEVERITY });
	}

	updateMessage(input: NotificationMessage): void {
		const message = NotificationViewItem.parseNotificationMessage(input);
		if (!message) {
			return;
		}

		this._message = message;
		this._onDidLabelChange.fire({ kind: NotificationViewItemLabelKind.MESSAGE });
	}

	updateActions(actions?: INotificationActions): void {
		this.setActions(actions);

		this._onDidLabelChange.fire({ kind: NotificationViewItemLabelKind.ACTIONS });
	}

	expand(): void {
		if (this._expanded || !this.canCollapse) {
			return;
		}

		this._expanded = true;
		this._onDidExpansionChange.fire();
	}

	collapse(skipEvents?: boolean): void {
		if (!this._expanded || !this.canCollapse) {
			return;
		}

		this._expanded = false;

		if (!skipEvents) {
			this._onDidExpansionChange.fire();
		}
	}

	toggle(): void {
		if (this._expanded) {
			this.collapse();
		} else {
			this.expand();
		}
	}

	close(): void {
		this._onDidClose.fire();

		this.dispose();
	}

	equals(other: INotificationViewItem): boolean {
		if (this.hasProgress() || other.hasProgress()) {
			return false;
		}

		if (this._source !== other.source) {
			return false;
		}

		if (this._message.value !== other.message.value) {
			return false;
		}

		const primaryActions = this._actions.primary || [];
		const otherPrimaryActions = other.actions.primary || [];
		if (primaryActions.length !== otherPrimaryActions.length) {
			return false;
		}

		for (let i = 0; i < primaryActions.length; i++) {
			if ((primaryActions[i].id + primaryActions[i].label) !== (otherPrimaryActions[i].id + otherPrimaryActions[i].label)) {
				return false;
			}
		}

		return true;
	}
}

export class ChoiceAction extends Action {

	private _onDidRun = new Emitter<void>();
	get onDidRun(): Event<void> { return this._onDidRun.event; }

	private _keepOpen: boolean;

	constructor(id: string, choice: IPromptChoice) {
		super(id, choice.label, undefined, true, () => {

			// Pass to runner
			choice.run();

			// Emit Event
			this._onDidRun.fire();

			return Promise.resolve();
		});

		this._keepOpen = !!choice.keepOpen;
	}

	get keepOpen(): boolean {
		return this._keepOpen;
	}

	dispose(): void {
		super.dispose();

		this._onDidRun.dispose();
	}
}