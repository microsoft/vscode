/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isCancellationError } from '../../../../base/common/errors.js';
import { toErrorMessage } from '../../../../base/common/errorMessage.js';
import { Emitter } from '../../../../base/common/event.js';
import { Disposable, DisposableStore, IDisposable, MutableDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { derived, IObservable, observableValue } from '../../../../base/common/observable.js';
import { URI } from '../../../../base/common/uri.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { localize } from '../../../../nls.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { getInheritedNewSessionTarget } from '../../../../workbench/contrib/sessions/browser/chat/newSessionAction.js';
import { INewSessionBackgroundSend, INewSessionDraftHost, INewSessionTarget } from '../../../../workbench/contrib/sessions/browser/parts/chatView.js';
import { ISessionGroupsService } from '../../../../workbench/contrib/sessions/browser/sessionGroupsService.js';
import { ISessionsProvidersService } from '../../../../workbench/contrib/sessions/browser/sessionsProvidersService.js';
import { ComposerInputSnapshot, IComposerInputState } from '../../../../workbench/contrib/sessions/common/newChatDraftState.js';
import { IChat, ISession } from '../../../../workbench/services/sessions/common/session.js';
import { INewSessionDraftSlot, ISessionsManagementService, trackNewSessionRequestEnd, WorkspaceNotTrustedError } from '../../../../workbench/contrib/sessions/common/sessionsManagement.js';

/** The scheme of the resource of a new-session composer in a chat window: its chat until it sends its session. */
export const CHAT_WINDOW_COMPOSER_SCHEME = 'vscode-agents-composer';

/** A new resource for a composer of a chat window. */
export function createChatWindowComposerResource(): URI {
	return URI.from({ scheme: CHAT_WINDOW_COMPOSER_SCHEME, path: `/${generateUuid()}` });
}

/** Whether `resource` names a new-session composer of a chat window. */
export function isChatWindowComposerResource(resource: URI): boolean {
	return resource.scheme === CHAT_WINDOW_COMPOSER_SCHEME;
}

/**
 * What a composer opened from `session` and its `chat` starts its new session with: the session's folder (the source
 * folder of its Dev Container), or no workspace as a quick chat has, the session's provider and agent where they serve
 * it, and the chat's model and mode. Nothing without a session, or for a session without a workspace that is not a
 * quick chat: the composer then starts as the main window's composer does.
 */
export function getChatWindowComposerTarget(sessionsManagementService: ISessionsManagementService, sessionsProvidersService: ISessionsProvidersService, session: ISession | undefined, chat: IChat | undefined): INewSessionTarget | undefined {
	if (!session) {
		return undefined;
	}
	const ofChat = (): Pick<INewSessionTarget, 'modelId' | 'modeId'> => {
		const modelId = chat?.modelId?.get();
		const modeId = chat?.mode?.get()?.id;
		return { ...(modelId ? { modelId } : {}), ...(modeId ? { modeId } : {}) };
	};
	if (session.isQuickChat?.get()) {
		return { providerId: session.providerId, sessionTypeId: session.sessionType, ...ofChat() };
	}
	const inherited = getInheritedNewSessionTarget(sessionsManagementService, sessionsProvidersService, session);
	if (!inherited.folderUri) {
		return undefined;
	}
	return {
		folderUri: inherited.folderUri,
		...(inherited.providerId ? { providerId: inherited.providerId } : {}),
		...(inherited.sessionTypeId ? { sessionTypeId: inherited.sessionTypeId } : {}),
		...ofChat(),
	};
}

/**
 * Follows the background sends of the composers of chat windows until each ends, also after its composer is gone, and
 * reports a failure: the management service does not notify the failures of a composer's own draft slot.
 */
export class ChatWindowComposerBackgroundSends extends Disposable {

	private readonly _sends = this._register(new DisposableStore());

	constructor(
		@ISessionsManagementService private readonly _sessionsManagementService: ISessionsManagementService,
		@INotificationService private readonly _notificationService: INotificationService,
	) {
		super();
	}

	/** Follows `send` of `owner` until it ends; disposing the result stops following it, such as when it was not dispatched. */
	track(owner: INewSessionDraftSlot, send: INewSessionBackgroundSend): IDisposable {
		const entry = this._sends.add(new DisposableStore());
		entry.add(toDisposable(() => this._sends.deleteAndLeak(entry)));
		entry.add(trackNewSessionRequestEnd(this._sessionsManagementService, owner, send.session, ({ started, error }) => {
			entry.dispose();
			if (!started && error !== undefined && !isCancellationError(error) && !(error instanceof WorkspaceNotTrustedError)) {
				this._notificationService.error(localize('chatWindowComposer.backgroundSendFailed', "Couldn't start the session: {0}", toErrorMessage(error)));
			}
		}));
		return entry;
	}
}

/** What a composer of a chat window starts with. */
export interface IChatWindowComposerInit {
	/** What it creates its drafts for; as the main window's composer does while undefined. */
	readonly target?: INewSessionTarget;
	/** The custom group of the sessions list that the sessions it sends join. */
	readonly groupId?: string;
	readonly input?: IComposerInputState;
}

/**
 * A new-session composer of a chat window, as the host of its drafts ({@link INewSessionDraftHost}): it holds them in a
 * draft slot of its own, so that it never takes or replaces the main window composer's draft, and aims them at what it
 * was opened with, until the user picks otherwise. The sessions it sends join its custom group of the sessions list.
 *
 * A foreground send keeps showing its session, as the composer's, until the request ends: once it started its session,
 * {@link onDidStart} fires, and the composer's chat becomes the session's main chat; otherwise the composer shows its
 * draft again. A background send leaves the composer with a new draft.
 */
export class ChatWindowComposerModel extends Disposable implements INewSessionDraftHost {

	readonly slot: INewSessionDraftSlot & IDisposable;
	readonly input: ComposerInputSnapshot;

	private readonly _requestedTarget = observableValue<INewSessionTarget | undefined>(this, undefined);
	readonly requestedTarget: IObservable<INewSessionTarget | undefined> = this._requestedTarget;

	/** What it aimed for as it sent its last foreground request. */
	private _targetOfSend: { readonly target: INewSessionTarget | undefined } | undefined;

	/** The session of the foreground request it sent, until the request ends. */
	private readonly _sending = observableValue<ISession | undefined>(this, undefined);
	private readonly _sendingTracking = this._register(new MutableDisposable());

	/** What it shows: its draft, or the session of the foreground request it sent, until the request ends. */
	readonly session: IObservable<ISession | undefined>;

	private readonly _onDidStart = this._register(new Emitter<ISession>());
	/** Fires with its session once a foreground request it sent started it. */
	readonly onDidStart = this._onDidStart.event;

	constructor(
		readonly resource: URI,
		init: IChatWindowComposerInit,
		private readonly _backgroundSends: ChatWindowComposerBackgroundSends,
		private readonly _openStartedSession: (session: ISession) => Promise<void>,
		@ISessionsManagementService private readonly _sessionsManagementService: ISessionsManagementService,
		@ISessionGroupsService sessionGroupsService: ISessionGroupsService,
	) {
		super();
		this._requestedTarget.set(init.target, undefined);
		this.input = new ComposerInputSnapshot(init.input);
		this.slot = this._register(_sessionsManagementService.createNewSessionSlot({ readoptOnFailure: session => this._isRequested(session) }));
		this._register(sessionGroupsService.setDraftSlotGroup(this.slot.id, init.groupId));
		this.session = derived(this, reader => this._sending.read(reader) ?? this.slot.newSession.read(reader));
		this._register(_sessionsManagementService.onDidAcceptNewSessionRequest(({ session, owner, background }) => {
			if (owner === this.slot && !background) {
				this._targetOfSend = { target: this._requestedTarget.get() };
				this._followSend(session);
			}
		}));
	}

	setRequestedTarget(target: INewSessionTarget): void {
		this._requestedTarget.set(target, undefined);
	}

	openStartedSession(session: ISession): Promise<void> {
		return this._openStartedSession(session);
	}

	trackBackgroundSend(send: INewSessionBackgroundSend): IDisposable {
		return this._backgroundSends.track(this.slot, send);
	}

	/**
	 * Whether the draft of a foreground request that failed is still what the composer aims for, to retry it: what it
	 * aims for did not change since it sent it. The draft's workspace is not compared with the requested folder, which
	 * it can be of without having its URI, such as a cloud agent's draft of the folder's GitHub repository.
	 */
	private _isRequested(_session: ISession): boolean {
		return !!this._targetOfSend && this._targetOfSend.target === this._requestedTarget.get();
	}

	private _followSend(session: ISession): void {
		const store = new DisposableStore();
		this._sendingTracking.value = store;
		this._sending.set(session, undefined);
		const follow = ({ from, to }: { readonly from: ISession; readonly to: ISession }) => {
			if (from.sessionId === this._sending.get()?.sessionId) {
				this._sending.set(to, undefined);
			}
		};
		store.add(this._sessionsManagementService.onDidReplaceNewDraftSession(follow));
		store.add(this._sessionsManagementService.onDidReplaceSession(follow));
		store.add(trackNewSessionRequestEnd(this._sessionsManagementService, this.slot, session, ({ session: ended, started }) => {
			if (started) {
				this._sending.set(ended, undefined);
				this._onDidStart.fire(ended);
				return;
			}
			if (this._sendingTracking.value === store) {
				this._sendingTracking.clear();
				this._sending.set(undefined, undefined);
			}
		}));
	}
}
