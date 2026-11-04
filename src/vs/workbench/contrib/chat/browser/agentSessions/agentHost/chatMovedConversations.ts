/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../../../base/common/codicons.js';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { Disposable, toDisposable } from '../../../../../../base/common/lifecycle.js';
import { isEqual } from '../../../../../../base/common/resources.js';
import { URI } from '../../../../../../base/common/uri.js';
import { localize, localize2 } from '../../../../../../nls.js';
import { Action2 } from '../../../../../../platform/actions/common/actions.js';
import { createDecorator, IInstantiationService, ServicesAccessor } from '../../../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../../../platform/log/common/log.js';
import { INotificationService } from '../../../../../../platform/notification/common/notification.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../../../platform/storage/common/storage.js';
import { IWorkbenchContribution } from '../../../../../common/contributions.js';
import { ChatContextKeys } from '../../../common/actions/chatContextKeys.js';
import { getChatSessionType } from '../../../common/model/chatUri.js';
import { ChatInputNotificationActionKind, ChatInputNotificationSeverity, IChatInputNotification, IChatInputNotificationService } from '../../widget/input/chatInputNotificationService.js';
import { IAgentSessionsService } from '../agentSessionsService.js';
import { openSessionByResource } from '../agentSessionsOpener.js';

/** A Local chat that was moved or continued into another chat, which links back to it. */
export interface IChatMovedConversation {
	/** The original Local chat. */
	readonly source: URI;
	/** The chat the conversation continues in. */
	readonly destination: URI;
	/** Display name of the destination's harness, e.g. "Copilot". */
	readonly destinationName: string;
	/** Title of the original chat, if it had one. */
	readonly title: string | undefined;
	/** Whether the user dismissed the notice in the original chat. */
	readonly sourceNoticeDismissed: boolean;
	/** Whether the user dismissed the notice in the chat the conversation continues in. */
	readonly destinationNoticeDismissed: boolean;
}

export const IChatMovedConversationsService = createDecorator<IChatMovedConversationsService>('chatMovedConversationsService');

/**
 * Remembers which Local chats were moved or continued into another chat, so
 * each side can link to the other. Local chats only exist on this machine, so
 * the links are kept in this profile's storage.
 */
export interface IChatMovedConversationsService {
	readonly _serviceBrand: undefined;
	readonly onDidChange: Event<void>;
	readonly conversations: readonly IChatMovedConversation[];
	record(source: URI, destination: URI, destinationName: string, title: string | undefined): void;
	/** The chat a Local chat continues in, if it was moved. */
	getMovedTo(source: URI): IChatMovedConversation | undefined;
	/** The Local chat a chat continues, if it was moved from one. */
	getMovedFrom(destination: URI): IChatMovedConversation | undefined;
	/** Stops showing the notice in `resource`, either side of a move. */
	dismissNotice(resource: URI): void;
}

interface IStoredMovedConversation {
	readonly source: string;
	readonly destination: string;
	readonly destinationName: string;
	readonly title?: string;
	readonly sourceNoticeDismissed?: boolean;
	readonly destinationNoticeDismissed?: boolean;
}

const STORAGE_KEY = 'chat.movedConversations';
/** Bounds the stored links; the oldest moves are forgotten first. */
const MAX_MOVED_CONVERSATIONS = 200;

export class ChatMovedConversationsService extends Disposable implements IChatMovedConversationsService {
	declare readonly _serviceBrand: undefined;

	private readonly _onDidChange = this._register(new Emitter<void>());
	readonly onDidChange = this._onDidChange.event;

	private _conversations: IChatMovedConversation[];

	constructor(
		@IStorageService private readonly storageService: IStorageService,
		@ILogService private readonly logService: ILogService,
	) {
		super();
		this._conversations = this.load();
		this._register(this.storageService.onDidChangeValue(StorageScope.PROFILE, STORAGE_KEY, this._store)(() => {
			this._conversations = this.load();
			this._onDidChange.fire();
		}));
	}

	get conversations(): readonly IChatMovedConversation[] {
		return this._conversations;
	}

	record(source: URI, destination: URI, destinationName: string, title: string | undefined): void {
		const conversation: IChatMovedConversation = { source, destination, destinationName, title, sourceNoticeDismissed: false, destinationNoticeDismissed: false };
		// A chat is moved from at most once and into at most once, so a newer move replaces an older one.
		const others = this._conversations.filter(entry => !isEqual(entry.source, source) && !isEqual(entry.destination, destination));
		this.update([...others, conversation].slice(-MAX_MOVED_CONVERSATIONS));
	}

	getMovedTo(source: URI): IChatMovedConversation | undefined {
		return this._conversations.find(entry => isEqual(entry.source, source));
	}

	getMovedFrom(destination: URI): IChatMovedConversation | undefined {
		return this._conversations.find(entry => isEqual(entry.destination, destination));
	}

	dismissNotice(resource: URI): void {
		let changed = false;
		const conversations = this._conversations.map(entry => {
			if (isEqual(entry.source, resource) && !entry.sourceNoticeDismissed) {
				changed = true;
				return { ...entry, sourceNoticeDismissed: true };
			}
			if (isEqual(entry.destination, resource) && !entry.destinationNoticeDismissed) {
				changed = true;
				return { ...entry, destinationNoticeDismissed: true };
			}
			return entry;
		});
		if (changed) {
			this.update(conversations);
		}
	}

	private update(conversations: IChatMovedConversation[]): void {
		this._conversations = conversations;
		const stored = conversations.map((entry): IStoredMovedConversation => ({
			source: entry.source.toString(),
			destination: entry.destination.toString(),
			destinationName: entry.destinationName,
			...(entry.title ? { title: entry.title } : {}),
			...(entry.sourceNoticeDismissed ? { sourceNoticeDismissed: true } : {}),
			...(entry.destinationNoticeDismissed ? { destinationNoticeDismissed: true } : {}),
		}));
		this.storageService.store(STORAGE_KEY, JSON.stringify(stored), StorageScope.PROFILE, StorageTarget.MACHINE);
		this._onDidChange.fire();
	}

	private load(): IChatMovedConversation[] {
		const raw = this.storageService.get(STORAGE_KEY, StorageScope.PROFILE);
		if (!raw) {
			return [];
		}
		try {
			const stored: unknown = JSON.parse(raw);
			if (!Array.isArray(stored)) {
				return [];
			}
			return stored.flatMap((entry: Partial<IStoredMovedConversation>): IChatMovedConversation[] =>
				typeof entry?.source === 'string' && typeof entry.destination === 'string' && typeof entry.destinationName === 'string'
					? [{
						source: URI.parse(entry.source),
						destination: URI.parse(entry.destination),
						destinationName: entry.destinationName,
						title: typeof entry.title === 'string' ? entry.title : undefined,
						sourceNoticeDismissed: entry.sourceNoticeDismissed === true,
						destinationNoticeDismissed: entry.destinationNoticeDismissed === true,
					}]
					: []);
		} catch (error) {
			this.logService.warn('[ChatMovedConversations] Ignoring unreadable moved-chat links', error);
			return [];
		}
	}
}

export const OPEN_MOVED_CONVERSATION_ACTION_ID = 'workbench.action.chat.openMovedConversation';

/** Opens the other side of a moved chat: the original Local chat, or the chat it continues in. */
export class OpenMovedConversationAction extends Action2 {
	constructor() {
		super({
			id: OPEN_MOVED_CONVERSATION_ACTION_ID,
			title: localize2('chat.openMovedConversation', "Open Moved Chat"),
			precondition: ChatContextKeys.enabled,
			f1: false,
		});
	}

	async run(accessor: ServicesAccessor, resource: URI): Promise<void> {
		const sessionsService = accessor.get(IAgentSessionsService);
		const instantiationService = accessor.get(IInstantiationService);
		const notificationService = accessor.get(INotificationService);
		const logService = accessor.get(ILogService);
		resource = URI.revive(resource);
		try {
			// The chat may belong to a provider whose sessions have not been listed yet.
			if (!sessionsService.getSession(resource)) {
				await sessionsService.model.resolve(getChatSessionType(resource));
			}
			await instantiationService.invokeFunction(openSessionByResource, resource);
		} catch (error) {
			logService.error('[ChatMovedConversations] Failed to open moved chat', error);
			notificationService.info(localize('chat.openMovedConversation.unavailable', "Couldn't open the chat. It may have been deleted."));
		}
	}
}

/**
 * Shows a notice in each chat of a move, linking to the other side: the chat
 * a conversation continues in links back to its original Local chat, and the
 * original links forward. Dismissing a notice hides it for good.
 */
export class ChatMovedConversationNotices extends Disposable implements IWorkbenchContribution {
	static readonly ID = 'workbench.contrib.chatMovedConversationNotices';

	/** Notice ids shown now, keyed by the chat they appear in; ids carry no chat identity since they are reported in telemetry. */
	private readonly shown = new Map<string, string>();
	private nextNoticeId = 0;

	constructor(
		@IChatMovedConversationsService private readonly movedConversations: IChatMovedConversationsService,
		@IChatInputNotificationService private readonly notificationService: IChatInputNotificationService,
	) {
		super();
		this.sync();
		this._register(this.movedConversations.onDidChange(() => this.sync()));
		this._register(toDisposable(() => this.shown.forEach(id => this.notificationService.deleteNotification(id))));
	}

	private sync(): void {
		const wanted = new Map<string, IChatInputNotification>();
		for (const conversation of this.movedConversations.conversations) {
			if (!conversation.destinationNoticeDismissed) {
				wanted.set(`from:${conversation.destination.toString()}`, this.notice(conversation.destination, 'chat.movedConversationFrom', {
					message: localize('chat.movedConversation.from', "Continued from a Local chat"),
					label: localize('chat.movedConversation.openOriginal', "Open Original"),
					target: conversation.source,
				}, conversation.title));
			}
			if (!conversation.sourceNoticeDismissed) {
				wanted.set(`to:${conversation.source.toString()}`, this.notice(conversation.source, 'chat.movedConversationTo', {
					message: localize('chat.movedConversation.to', "Continued in {0}", conversation.destinationName),
					label: localize('chat.movedConversation.openContinuation', "Open in {0}", conversation.destinationName),
					target: conversation.destination,
				}, conversation.title));
			}
		}
		for (const [key, id] of this.shown) {
			if (!wanted.has(key)) {
				this.shown.delete(key);
				this.notificationService.deleteNotification(id);
			}
		}
		for (const [key, notice] of wanted) {
			if (!this.shown.has(key)) {
				this.shown.set(key, notice.id);
				this.notificationService.setNotification(notice);
			}
		}
	}

	private notice(resource: URI, telemetryId: string, content: { message: string; label: string; target: URI }, title: string | undefined): IChatInputNotification {
		return {
			id: `${telemetryId}.${this.nextNoticeId++}`,
			telemetryId,
			severity: ChatInputNotificationSeverity.Info,
			icon: Codicon.history,
			message: content.message,
			description: title,
			actions: [{
				kind: ChatInputNotificationActionKind.Command,
				label: content.label,
				commandId: OPEN_MOVED_CONVERSATION_ACTION_ID,
				commandArgs: [content.target],
				keepOpen: true,
				telemetryActionId: 'open',
			}],
			dismissible: true,
			onDismiss: () => this.movedConversations.dismissNotice(resource),
			autoDismissOnMessage: false,
			sessionResources: [resource],
		};
	}
}
