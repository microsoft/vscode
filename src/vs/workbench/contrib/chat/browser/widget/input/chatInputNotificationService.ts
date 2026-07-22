/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { status } from '../../../../../../base/browser/ui/aria/aria.js';
import { renderAsPlaintext } from '../../../../../../base/browser/markdownRenderer.js';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { IMarkdownString } from '../../../../../../base/common/htmlContent.js';
import { Disposable } from '../../../../../../base/common/lifecycle.js';
import { InstantiationType, registerSingleton } from '../../../../../../platform/instantiation/common/extensions.js';
import { createDecorator } from '../../../../../../platform/instantiation/common/instantiation.js';

export const enum ChatInputNotificationSeverity {
	Info = 0,
	Warning = 1,
	Error = 2,
}

export const enum ChatInputNotificationActionKind {
	Command = 'command',
	OpenModelPicker = 'openModelPicker',
	SwitchToModel = 'switchToModel',
}

interface IChatInputNotificationActionBase {
	readonly label: string;
}

export interface IChatInputNotificationCommandAction extends IChatInputNotificationActionBase {
	readonly kind: ChatInputNotificationActionKind.Command;
	readonly commandId: string;
	readonly commandArgs?: unknown[];
}

export interface IChatInputNotificationOpenModelPickerAction extends IChatInputNotificationActionBase {
	readonly kind: ChatInputNotificationActionKind.OpenModelPicker;
}

export interface IChatInputNotificationSwitchToModelAction extends IChatInputNotificationActionBase {
	readonly kind: ChatInputNotificationActionKind.SwitchToModel;
	readonly modelIdentifier: string;
}

export type IChatInputNotificationAction =
	| IChatInputNotificationCommandAction
	| IChatInputNotificationOpenModelPickerAction
	| IChatInputNotificationSwitchToModelAction;

export interface IChatInputNotificationMuteAction {
	/** Command executed when the user clicks the mute (bell-slash) button. */
	readonly commandId: string;
	readonly commandArgs?: unknown[];
	/** Tooltip and accessible label for the mute button. */
	readonly tooltip: string;
}

export interface IChatInputNotification {
	readonly id: string;
	readonly telemetryId?: string;
	readonly severity: ChatInputNotificationSeverity;
	readonly message: string | IMarkdownString;
	readonly description: string | undefined;
	readonly actions: readonly IChatInputNotificationAction[];
	readonly dismissible: boolean;
	readonly autoDismissOnMessage: boolean;
	/**
	 * Optional allow-list of chat session types that should display this
	 * notification. When undefined, the notification renders in every chat
	 * input. When set, only chat inputs whose current session type is in the
	 * list will render it.
	 */
	readonly sessionTypes?: readonly string[];
	/**
	 * Optional "mute" affordance rendered as a bell-slash icon button next to
	 * the dismiss (X) button. Use for a "stop showing this entirely" action
	 * that is distinct from a one-off dismissal. Omit to hide the button.
	 */
	readonly mute?: IChatInputNotificationMuteAction;
}

/** Returns whether a notification applies to the concrete model-target session type. */
export function isChatInputNotificationApplicableToSessionType(notification: IChatInputNotification, sessionType: string | undefined): boolean {
	return !notification.sessionTypes?.length || (!!sessionType && notification.sessionTypes.includes(sessionType));
}

export const IChatInputNotificationService = createDecorator<IChatInputNotificationService>('chatInputNotificationService');

export interface IChatInputNotificationService {
	readonly _serviceBrand: undefined;

	readonly onDidChange: Event<void>;

	/** Fires when a notification is dismissed by the user (via the X button). */
	readonly onDidDismiss: Event<string>;

	/**
	 * Set or update a notification. If a notification with the same ID already
	 * exists, its content is replaced and any previous user dismissal is cleared.
	 */
	setNotification(notification: IChatInputNotification): void;

	/**
	 * Remove a notification entirely (e.g., when the extension disposes it).
	 */
	deleteNotification(id: string): void;

	/**
	 * Mark a notification as dismissed by the user. It will no longer be returned
	 * by {@link getActiveNotification} until it is re-pushed with new content.
	 */
	dismissNotification(id: string): void;

	/**
	 * Get the single active notification to display. Returns the highest-severity
	 * notification that has not been dismissed. Ties are broken by most-recent insertion.
	 * An optional `filter` can be provided to restrict the set of notifications considered,
	 * so a non-matching higher-priority notification doesn't mask other eligible ones.
	 */
	getActiveNotification(filter?: (notification: IChatInputNotification) => boolean): IChatInputNotification | undefined;

	/**
	 * Called when the user sends a chat message. Auto-dismisses all notifications
	 * that have {@link IChatInputNotification.autoDismissOnMessage} set.
	 */
	handleMessageSent(): void;

	/**
	 * Announce a notification that a chat input is about to render to screen
	 * readers. De-duplicated per notification id across all mounted chat inputs,
	 * so content shown in several widgets (panel, side bar, …) is only spoken
	 * once and session-scoped notifications are only announced when a chat input
	 * in a matching session actually renders them. Passing `undefined` is a no-op.
	 */
	announceRendered(notification: IChatInputNotification | undefined): void;
}

class ChatInputNotificationService extends Disposable implements IChatInputNotificationService {
	readonly _serviceBrand: undefined;

	private readonly _notifications = new Map<string, IChatInputNotification>();
	private readonly _dismissed = new Set<string>();

	/** Insertion order tracking — higher index = more recently set. */
	private readonly _insertionOrder = new Map<string, number>();
	private _insertionCounter = 0;

	private readonly _onDidChange = this._register(new Emitter<void>());
	readonly onDidChange = this._onDidChange.event;

	private readonly _onDidDismiss = this._register(new Emitter<string>());
	readonly onDidDismiss = this._onDidDismiss.event;

	/**
	 * Last ARIA-announced signature per notification id. Lets us skip
	 * re-announcing unchanged content (e.g. a notification re-pushed on every
	 * quota tick, or the same notification rendered by several mounted chat
	 * inputs) while still announcing when a notification's content changes.
	 */
	private readonly _announcedById = new Map<string, string>();

	setNotification(notification: IChatInputNotification): void {
		this._notifications.set(notification.id, notification);
		this._dismissed.delete(notification.id);
		this._insertionOrder.set(notification.id, this._insertionCounter++);
		this._fireDidChange();
	}

	deleteNotification(id: string): void {
		if (this._notifications.delete(id)) {
			this._dismissed.delete(id);
			this._insertionOrder.delete(id);
			this._announcedById.delete(id);
			this._fireDidChange();
		}
	}

	dismissNotification(id: string): void {
		if (this._notifications.has(id) && !this._dismissed.has(id)) {
			this._dismissed.add(id);
			// Forget the announced signature so a later re-show is announced again.
			this._announcedById.delete(id);
			this._onDidDismiss.fire(id);
			this._fireDidChange();
		}
	}

	getActiveNotification(filter?: (notification: IChatInputNotification) => boolean): IChatInputNotification | undefined {
		let best: IChatInputNotification | undefined;
		let bestOrder = -1;

		for (const notification of this._notifications.values()) {
			if (this._dismissed.has(notification.id)) {
				continue;
			}
			if (filter && !filter(notification)) {
				continue;
			}

			const order = this._insertionOrder.get(notification.id) ?? 0;

			if (!best
				|| notification.severity > best.severity
				|| (notification.severity === best.severity && order > bestOrder)
			) {
				best = notification;
				bestOrder = order;
			}
		}

		return best;
	}

	handleMessageSent(): void {
		let changed = false;
		for (const notification of this._notifications.values()) {
			if (notification.autoDismissOnMessage && !this._dismissed.has(notification.id)) {
				this._dismissed.add(notification.id);
				changed = true;
			}
		}
		if (changed) {
			this._fireDidChange();
		}
	}

	private _fireDidChange(): void {
		this._onDidChange.fire();
	}

	announceRendered(notification: IChatInputNotification | undefined): void {
		// Announcements are driven from the chat input's render path (rather than
		// eagerly on every change) so that session-scoped notifications are only
		// spoken when a chat input in a matching session actually shows them. The
		// service still owns the de-dupe state so the same content isn't announced
		// once per mounted chat input (panel, side bar, …).
		if (!notification) {
			return;
		}
		const rawMessage = typeof notification.message === 'string' ? notification.message : notification.message.value;
		const signature = `${notification.id}\u0000${rawMessage}\u0000${notification.description ?? ''}`;
		if (this._announcedById.get(notification.id) === signature) {
			return;
		}
		this._announcedById.set(notification.id, signature);
		// Strip Markdown syntax so screen readers don't read backticks, link
		// targets, etc. verbatim. Done after the de-dupe check so we don't pay
		// the parse cost on unrelated re-renders.
		const message = renderAsPlaintext(notification.message);
		const text = notification.description ? `${message}. ${notification.description}` : message;
		status(text);
	}
}

registerSingleton(IChatInputNotificationService, ChatInputNotificationService, InstantiationType.Delayed);
