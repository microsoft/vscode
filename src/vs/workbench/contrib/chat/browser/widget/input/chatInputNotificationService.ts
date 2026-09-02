/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { status } from '../../../../../../base/browser/ui/aria/aria.js';
import { renderAsPlaintext } from '../../../../../../base/browser/markdownRenderer.js';
import { IStringDictionary } from '../../../../../../base/common/collections.js';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { IMarkdownString } from '../../../../../../base/common/htmlContent.js';
import { Disposable } from '../../../../../../base/common/lifecycle.js';
import { isEqual } from '../../../../../../base/common/resources.js';
import { URI } from '../../../../../../base/common/uri.js';
import { InstantiationType, registerSingleton } from '../../../../../../platform/instantiation/common/extensions.js';
import { createDecorator } from '../../../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../../../platform/log/common/log.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../../../platform/storage/common/storage.js';
import { ILanguageModelChatMetadataAndIdentifier } from '../../../common/languageModels.js';

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
	readonly keepOpen?: boolean;
	/** Stable id reported to telemetry, so two actions of the same kind can be told apart. */
	readonly telemetryActionId?: string;
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
	/** Matches the target against models available to the rendering input. */
	readonly matchesModel: (model: ILanguageModelChatMetadataAndIdentifier) => boolean;
	/** Applied to the target model once switched. Keys its schema does not declare are dropped. */
	readonly config?: IStringDictionary<unknown>;
	/** Requires the target to match exactly one model, rather than taking the first match. */
	readonly requireUniqueModel?: boolean;
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

/** Input state used to choose notification content. */
export interface IChatInputNotificationModelState {
	readonly currentModel: ILanguageModelChatMetadataAndIdentifier | undefined;
	readonly models: readonly ILanguageModelChatMetadataAndIdentifier[];
}

export interface IChatInputNotificationContext {
	readonly sessionType: string | undefined;
	readonly sessionResource: URI | undefined;
	readonly deferredNotificationsEnabled: boolean;
	readonly isTransientChat: boolean;
	readonly sessionStarted: boolean;
	readonly modelState: IChatInputNotificationModelState;
}

/** A complete notification body selected for one input. */
export interface IChatInputNotificationBody {
	readonly description: string | IMarkdownString | undefined;
	readonly actions: readonly IChatInputNotificationAction[];
}

export interface IChatInputNotification {
	readonly id: string;
	readonly telemetryId?: string;
	readonly severity: ChatInputNotificationSeverity;
	readonly message: string | IMarkdownString;
	readonly description: string | IMarkdownString | undefined;
	readonly actions: readonly IChatInputNotificationAction[];
	/** Controls whether this notification applies to an input. */
	readonly when?: (context: IChatInputNotificationContext) => boolean;
	/** Resolves the description and actions for an input. */
	readonly resolveBody?: (context: IChatInputNotificationContext) => IChatInputNotificationBody;
	readonly dismissible: boolean;
	readonly autoDismissOnMessage: boolean;
	/**
	 * Optional allow-list of chat session types that should display this
	 * notification. When undefined, the notification renders in every chat
	 * input. When set, only chat inputs whose current session type is in the
	 * list will render it.
	 */
	readonly sessionTypes?: readonly string[];
	/** Optional allow-list of concrete chat session resources that should display this notification. */
	readonly sessionResources?: readonly URI[];
	/**
	 * Optional "mute" affordance rendered as a bell-slash icon button next to
	 * the dismiss (X) button. Use for a "stop showing this entirely" action
	 * that is distinct from a one-off dismissal. Omit to hide the button.
	 */
	readonly mute?: IChatInputNotificationMuteAction;
}

/** Creates a matcher for a fixed model identifier. */
export function matchesModelIdentifier(identifier: string): (model: ILanguageModelChatMetadataAndIdentifier) => boolean {
	return model => model.identifier === identifier;
}

/** Evaluates notification code without letting it break rendering or sending. */
function evaluateChatInputNotificationPredicate(predicate: () => boolean, onError: (error: unknown) => void): boolean {
	try {
		return predicate();
	} catch (error) {
		onError(error);
		return false;
	}
}

/** Resolves one complete notification body for an input. */
export function resolveChatInputNotificationBody(
	notification: IChatInputNotification,
	context: IChatInputNotificationContext,
	onError: (error: unknown) => void,
): IChatInputNotificationBody | undefined {
	if (!evaluateChatInputNotificationPredicate(() => notification.when?.(context) ?? true, onError)) {
		return undefined;
	}

	if (!notification.resolveBody) {
		return notification;
	}

	try {
		return notification.resolveBody(context);
	} catch (error) {
		onError(error);
		return notification;
	}
}

/** Returns the text signature used to de-duplicate announcements. */
export function getChatInputNotificationAnnouncementSignature(notification: IChatInputNotification, body: IChatInputNotificationBody): string {
	const message = typeof notification.message === 'string' ? notification.message : notification.message.value;
	const description = typeof body.description === 'string' ? body.description : body.description?.value ?? '';
	return `${notification.id}\u0000${message}\u0000${description}`;
}

/** Returns whether a notification applies to the concrete model-target session type. */
export function isChatInputNotificationApplicableToSessionType(notification: IChatInputNotification, sessionType: string | undefined): boolean {
	return !notification.sessionTypes?.length || (!!sessionType && notification.sessionTypes.includes(sessionType));
}

export function isChatInputNotificationApplicableToSession(notification: IChatInputNotification, sessionType: string | undefined, sessionResource: URI | undefined): boolean {
	return isChatInputNotificationApplicableToSessionType(notification, sessionType)
		&& (!notification.sessionResources?.length || (!!sessionResource && notification.sessionResources.some(resource => isEqual(resource, sessionResource))));
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
	 * Ask mounted inputs to re-evaluate what they render, without touching notification or
	 * dismissal state. Use when something a `when` predicate reads has changed.
	 */
	refresh(): void;

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
	 * Called when the user sends a chat message. Auto-dismisses the notifications
	 * that have {@link IChatInputNotification.autoDismissOnMessage} set and that
	 * apply to the session the message was sent in, so a message in one session
	 * doesn't hide session-scoped notifications belonging to another. When no
	 * context is given, all such notifications are dismissed.
	 */
	handleMessageSent(context?: IChatInputNotificationContext): void;

	/**
	 * Announce a notification that a chat input is about to render to screen
	 * readers. De-duplicated per notification id across all mounted chat inputs,
	 * so content shown in several widgets (panel, side bar, …) is only spoken
	 * once and session-scoped notifications are only announced when a chat input
	 * in a matching session actually renders them. Passing `undefined` is a no-op.
	 */
	announceRendered(notification: IChatInputNotification | undefined, body?: IChatInputNotificationBody): void;
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

	private readonly _announcedById = new Map<string, string>();

	constructor(@ILogService private readonly _logService: ILogService) {
		super();
	}

	setNotification(notification: IChatInputNotification): void {
		this._notifications.set(notification.id, notification);
		this._dismissed.delete(notification.id);
		this._insertionOrder.set(notification.id, this._insertionCounter++);
		this._fireDidChange();
	}

	refresh(): void {
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

	handleMessageSent(context?: IChatInputNotificationContext): void {
		let changed = false;
		for (const notification of this._notifications.values()) {
			if (!notification.autoDismissOnMessage || this._dismissed.has(notification.id)) {
				continue;
			}
			if (context && !isChatInputNotificationApplicableToSession(notification, context.sessionType, context.sessionResource)) {
				continue;
			}
			if (context && !evaluateChatInputNotificationPredicate(
				() => notification.when?.(context) ?? true,
				error => this._logService.error('[ChatInputNotificationService] Failed to evaluate notification', error),
			)) {
				continue;
			}
			this._dismissed.add(notification.id);
			this._announcedById.delete(notification.id);
			changed = true;
		}
		if (changed) {
			this._fireDidChange();
		}
	}

	private _fireDidChange(): void {
		this._onDidChange.fire();
	}

	announceRendered(notification: IChatInputNotification | undefined, body?: IChatInputNotificationBody): void {
		// Announcements are driven from the chat input's render path (rather than
		// eagerly on every change) so that session-scoped notifications are only
		// spoken when a chat input in a matching session actually shows them. The
		// service still owns the de-dupe state so the same content isn't announced
		// once per mounted chat input (panel, side bar, …).
		if (!notification) {
			return;
		}
		const resolvedBody = body ?? notification;
		const signature = getChatInputNotificationAnnouncementSignature(notification, resolvedBody);
		if (this._announcedById.get(notification.id) === signature) {
			return;
		}
		this._announcedById.set(notification.id, signature);
		// Strip Markdown syntax so screen readers don't read backticks, link
		// targets, etc. verbatim. Done after the de-dupe check so we don't pay
		// the parse cost on unrelated re-renders.
		const message = renderAsPlaintext(notification.message);
		const description = resolvedBody.description ? renderAsPlaintext(resolvedBody.description) : '';
		const text = description ? `${message}. ${description}` : message;
		status(text);
	}
}

registerSingleton(IChatInputNotificationService, ChatInputNotificationService, InstantiationType.Delayed);

/**
 * Reads the ids a user has dismissed for good, kept in application storage so a dismissal in one
 * window applies to every other. Returns an empty set for absent or corrupt data.
 *
 * The set is stored under one key, so two windows dismissing different notices in the same
 * instant can leave the later write without the earlier id. Re-reading before each write keeps
 * that to a genuine race, and the cost is only that a notice may appear once more.
 */
export function readDismissedNotificationIds(storageService: IStorageService, key: string): Set<string> {
	const raw = storageService.get(key, StorageScope.APPLICATION);
	try {
		const parsed = raw ? JSON.parse(raw) : undefined;
		return new Set(Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === 'string') : []);
	} catch {
		return new Set();
	}
}

/** Records one id as dismissed for good. */
export function addDismissedNotificationId(storageService: IStorageService, key: string, id: string): void {
	const dismissed = readDismissedNotificationIds(storageService, key);
	if (dismissed.has(id)) {
		return;
	}
	dismissed.add(id);
	storageService.store(key, JSON.stringify([...dismissed]), StorageScope.APPLICATION, StorageTarget.USER);
}
