/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../../../../base/common/event.js';
import { Disposable } from '../../../../../../base/common/lifecycle.js';
import { InstantiationType, registerSingleton } from '../../../../../../platform/instantiation/common/extensions.js';
import { createDecorator } from '../../../../../../platform/instantiation/common/instantiation.js';

export const enum ChatInputNotificationSeverity {
	Info = 0,
	Warning = 1,
	Error = 2,
}

export interface IChatInputNotificationAction {
	readonly label: string;
	readonly commandId: string;
	readonly commandArgs?: unknown[];
}

export interface IChatInputNotification {
	readonly id: string;
	readonly severity: ChatInputNotificationSeverity;
	readonly message: string;
	readonly description: string | undefined;
	readonly actions: readonly IChatInputNotificationAction[];
	readonly dismissible: boolean;
	readonly autoDismissOnMessage: boolean;
}

export const IChatInputNotificationService = createDecorator<IChatInputNotificationService>('chatInputNotificationService');

export interface IChatInputNotificationService {
	readonly _serviceBrand: undefined;

	readonly onDidChange: Event<void>;

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
	 */
	getActiveNotification(): IChatInputNotification | undefined;

	/**
	 * Called when the user sends a chat message. Auto-dismisses all notifications
	 * that have {@link IChatInputNotification.autoDismissOnMessage} set.
	 */
	handleMessageSent(): void;
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

	setNotification(notification: IChatInputNotification): void {
		this._notifications.set(notification.id, notification);
		this._dismissed.delete(notification.id);
		this._insertionOrder.set(notification.id, this._insertionCounter++);
		this._onDidChange.fire();
	}

	deleteNotification(id: string): void {
		if (this._notifications.delete(id)) {
			this._dismissed.delete(id);
			this._insertionOrder.delete(id);
			this._onDidChange.fire();
		}
	}

	dismissNotification(id: string): void {
		if (this._notifications.has(id) && !this._dismissed.has(id)) {
			this._dismissed.add(id);
			this._onDidChange.fire();
		}
	}

	getActiveNotification(): IChatInputNotification | undefined {
		let best: IChatInputNotification | undefined;
		let bestOrder = -1;

		for (const notification of this._notifications.values()) {
			if (this._dismissed.has(notification.id)) {
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
			this._onDidChange.fire();
		}
	}
}

registerSingleton(IChatInputNotificationService, ChatInputNotificationService, InstantiationType.Delayed);
