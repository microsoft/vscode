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

export interface IChatInputNotificationAction {
	readonly label: string;
	readonly commandId: string;
	readonly commandArgs?: unknown[];
}

export interface IChatInputNotification {
	readonly id: string;
	readonly severity: ChatInputNotificationSeverity;
	readonly message: string | IMarkdownString;
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

	/**
	 * Signature of the last active notification we announced via ARIA, so we
	 * don't re-announce the same content when the model fires `onDidChange`
	 * for unrelated reasons or when the same notification is re-pushed.
	 */
	private _lastAnnouncedSignature: string | undefined;

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
			this._fireDidChange();
		}
	}

	dismissNotification(id: string): void {
		if (this._notifications.has(id) && !this._dismissed.has(id)) {
			this._dismissed.add(id);
			this._fireDidChange();
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
			this._fireDidChange();
		}
	}

	private _fireDidChange(): void {
		this._announceActiveIfChanged();
		this._onDidChange.fire();
	}

	/**
	 * Announce the currently active notification to screen readers, but only
	 * when its content differs from the last announced one. This prevents
	 * the same notification from being announced repeatedly when:
	 *  - the same notification is re-pushed by an extension (e.g. on every
	 *    quota change tick),
	 *  - multiple chat widgets are mounted (panel, side bar, etc.) — the
	 *    announcement happens once at the singleton level instead of once
	 *    per widget.
	 */
	private _announceActiveIfChanged(): void {
		const active = this.getActiveNotification();
		if (!active) {
			this._lastAnnouncedSignature = undefined;
			return;
		}
		const rawMessage = typeof active.message === 'string' ? active.message : active.message.value;
		const signature = `${active.id}\u0000${rawMessage}\u0000${active.description ?? ''}`;
		if (signature === this._lastAnnouncedSignature) {
			return;
		}
		this._lastAnnouncedSignature = signature;
		// Strip Markdown syntax so screen readers don't read backticks, link
		// targets, etc. verbatim. Done after the signature check so we don't
		// pay the parse cost on unrelated `onDidChange` fires.
		const message = renderAsPlaintext(active.message);
		const text = active.description ? `${message}. ${active.description}` : message;
		status(text);
	}
}

registerSingleton(IChatInputNotificationService, ChatInputNotificationService, InstantiationType.Delayed);
