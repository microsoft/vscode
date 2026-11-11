/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isCancellationError } from '../../../../base/common/errors.js';
import { toErrorMessage } from '../../../../base/common/errorMessage.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable, DisposableStore, IDisposable, MutableDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { derived, IObservable, observableValue } from '../../../../base/common/observable.js';
import { parse, stringify } from '../../../../base/common/marshalling.js';
import { URI } from '../../../../base/common/uri.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { localize } from '../../../../nls.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { INotificationService, Severity } from '../../../../platform/notification/common/notification.js';
import { IAccessibilityService } from '../../../../platform/accessibility/common/accessibility.js';
import { IClipboardService } from '../../../../platform/clipboard/common/clipboardService.js';
import { IAction, toAction } from '../../../../base/common/actions.js';
import { IChatDraft } from '../../../../workbench/contrib/chat/common/attachments/chatDraft.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { getInheritedNewSessionTarget } from '../../../../workbench/contrib/sessions/browser/chat/newSessionAction.js';
import { INewSessionBackgroundSend, INewSessionDraftHost, INewSessionTarget } from '../../../../workbench/contrib/sessions/browser/parts/chatView.js';
import { ISessionGroupsService } from '../../../../workbench/contrib/sessions/browser/sessionGroupsService.js';
import { ISessionsProvidersService } from '../../../../workbench/contrib/sessions/browser/sessionsProvidersService.js';
import { ComposerInputSnapshot, fromStoredChatDraft, IComposerInputState, toStoredChatDraft } from '../../../../workbench/contrib/sessions/common/newChatDraftState.js';
import { IChat, ISession, isSessionCreated } from '../../../../workbench/services/sessions/common/session.js';
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
		...(inherited.requireDevContainer ? { requireDevContainer: true } : {}),
		...ofChat(),
	};
}

/** How a failed background send gives its prompt back to its composer ({@link ChatWindowComposerBackgroundSends.track}). */
export interface IBackgroundSendRecovery {
	/** The prompt as the user wrote it, with its attachments and inline references. */
	readonly input: IChatDraft;
	/**
	 * Whether the composer takes the prompt back without asking: it is still there, the send is its latest, and what it
	 * aims for did not change since the send. {@link restore} then gives it back only while its input is empty and idle.
	 */
	canRestoreSilently(): boolean;
	/** Whether the composer is still there. */
	isAlive(): boolean;
	/**
	 * Gives the prompt back to the composer, only while its input is empty and idle and shows it: never over what the user
	 * wrote since, nor while it sends, `busy` then; `gone` once the composer is gone.
	 */
	restore(): 'restored' | 'busy' | 'gone';
}

/**
 * Follows the background sends of the composers of chat windows until each ends, also after its composer is gone, and
 * reports a failure: the management service does not notify the failures of a composer's own draft slot. The prompt of
 * a failed send goes back into its composer when nothing changed there since; otherwise the notification offers to
 * restore it, without changing what the composer aims for now, or to copy it, also once the composer is gone.
 */
export class ChatWindowComposerBackgroundSends extends Disposable {

	private readonly _sends = this._register(new DisposableStore());

	constructor(
		@ISessionsManagementService private readonly _sessionsManagementService: ISessionsManagementService,
		@INotificationService private readonly _notificationService: INotificationService,
		@IAccessibilityService private readonly _accessibilityService: IAccessibilityService,
		@IClipboardService private readonly _clipboardService: IClipboardService,
		@ISessionsProvidersService private readonly _sessionsProvidersService: ISessionsProvidersService,
	) {
		super();
	}

	/** Follows `send` of `owner` until it ends; disposing the result stops following it, such as when it was not dispatched. */
	track(owner: INewSessionDraftSlot, send: INewSessionBackgroundSend, recovery: IBackgroundSendRecovery): IDisposable {
		const entry = this._sends.add(new DisposableStore());
		entry.add(toDisposable(() => this._sends.deleteAndLeak(entry)));
		// Where it was sent, as it is when it ends, for its notification
		let session = send.session;
		entry.add(this._sessionsManagementService.onDidReplaceNewDraftSession(({ from, to }) => {
			if (from.sessionId === session.sessionId) {
				session = to;
			}
		}));
		entry.add(trackNewSessionRequestEnd(this._sessionsManagementService, owner, send.session, ({ started, error }) => {
			entry.dispose();
			if (!started && error !== undefined && !isCancellationError(error) && !(error instanceof WorkspaceNotTrustedError)) {
				this._reportFailure(session, error, recovery);
			}
		}));
		return entry;
	}

	private _reportFailure(session: ISession, error: unknown, recovery: IBackgroundSendRecovery): void {
		if (recovery.canRestoreSilently() && recovery.restore() === 'restored') {
			this._notificationService.error(localize('chatWindowComposer.backgroundSendFailed', "Couldn't start the session: {0}", toErrorMessage(error)));
			this._accessibilityService.status(localize('chatWindowComposer.promptRestored', "The prompt of the session that couldn't start is back in the composer."));
			return;
		}
		const actions: IAction[] = [];
		if (recovery.isAlive()) {
			actions.push(toAction({
				id: 'chatWindowComposer.restorePrompt', label: localize('chatWindowComposer.restorePrompt', "Restore Prompt"), run: async () => {
					// Never over what the user wrote since, nor while it sends, nor once it is gone: the prompt goes to the clipboard instead.
					if (recovery.restore() !== 'restored') {
						await this._clipboardService.writeText(recovery.input.inputText);
						this._notificationService.info(localize('chatWindowComposer.promptCopiedInstead', "The composer can't take the prompt back now, so it was copied to the clipboard instead."));
					}
				},
			}));
		}
		actions.push(toAction({ id: 'chatWindowComposer.copyPrompt', label: localize('chatWindowComposer.copyPrompt', "Copy Prompt"), run: () => this._clipboardService.writeText(recovery.input.inputText) }));
		const workspace = session.isQuickChat?.get() ? localize('chatWindowComposer.noWorkspace', "No Workspace") : session.workspace.get()?.label ?? localize('chatWindowComposer.noWorkspace', "No Workspace");
		const agent = this._sessionsProvidersService.getProvider(session.providerId, session.sessionId)?.sessionTypes.find(type => type.id === session.sessionType)?.label ?? session.sessionType;
		this._notificationService.notify({
			severity: Severity.Error,
			message: localize('chatWindowComposer.backgroundSendFailedIn', "Couldn't start the session in {0} with {1}: {2}", workspace, agent, toErrorMessage(error)),
			actions: { primary: actions },
		});
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

	/** Counts the user's changes of what it aims for, so that a failed background send knows whether it changed since. */
	private _targetGeneration = 0;
	private _disposed = false;

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

	private readonly _onWillDispose = this._register(new Emitter<void>());
	readonly onWillDispose = this._onWillDispose.event;

	/** The custom group of the sessions list that the sessions it sends join. */
	readonly groupId: string | undefined;

	constructor(
		readonly resource: URI,
		init: IChatWindowComposerInit,
		private readonly _backgroundSends: ChatWindowComposerBackgroundSends,
		private readonly _openStartedSession: (session: ISession) => Promise<void>,
		@ISessionsManagementService private readonly _sessionsManagementService: ISessionsManagementService,
		@ISessionGroupsService sessionGroupsService: ISessionGroupsService,
	) {
		super();
		this.groupId = init.groupId;
		this._requestedTarget.set(init.target, undefined);
		this.input = new ComposerInputSnapshot(init.input);
		this.slot = this._register(_sessionsManagementService.createNewSessionSlot({ readoptOnFailure: session => this._isRequested(session) }));
		this._register(sessionGroupsService.setDraftSlotGroup(this.slot.id, init.groupId));
		this.session = derived(this, reader => this._sending.read(reader) ?? this.slot.newSession.read(reader));
		this._register(_sessionsManagementService.onDidAcceptNewSessionRequest(({ session, owner, background }) => {
			if (owner === this.slot && background) {
				// Its send went out, so a reload restores neither it nor what was sent, also while its next draft is created.
				const attempt = this.input.get().attempt;
				if (attempt) {
					this.input.endSendAttempt(attempt.id);
				}
				return;
			}
			if (owner === this.slot && !background) {
				this._targetOfSend = { target: this._requestedTarget.get() };
				// A reload before the request ends restores the session it started, or else what was sent.
				this.input.setSendAttemptSession(session.resource);
				this._followSend(session);
			}
		}));
	}

	override dispose(): void {
		this._disposed = true;
		this._onWillDispose.fire();
		super.dispose();
	}

	/** What it stores to be restored, such as after a reload: what it aims for, its group and its input. */
	toStored(): IStoredChatWindowComposer {
		const target = this._requestedTarget.get();
		return { resource: this.resource, ...(target ? { target } : {}), ...(this.groupId ? { groupId: this.groupId } : {}), ...this.input.get() };
	}

	setRequestedTarget(target: INewSessionTarget, reason: 'user' | 'background' = 'user'): void {
		this._requestedTarget.set(target, undefined);
		if (reason === 'user') {
			this._targetGeneration++;
		}
	}

	openStartedSession(session: ISession): Promise<void> {
		return this._openStartedSession(session);
	}

	trackBackgroundSend(send: INewSessionBackgroundSend): IDisposable {
		// What the user wrote, as the send's attempt has it before the composer cleared it, with its inline references.
		const input = this.input.get().attempt?.input ?? { inputText: send.query, attachments: [...(send.attachedContext ?? [])] };
		const generation = this._targetGeneration;
		// Held weakly: these recovery callbacks do not keep the composer alive for a send that outlives it.
		const composer = new WeakRef(this);
		const alive = () => {
			const target = composer.deref();
			return target && !target._disposed ? target : undefined;
		};
		return this._backgroundSends.track(this.slot, send, {
			input,
			isAlive: () => !!alive(),
			canRestoreSilently: () => {
				const target = alive();
				return !!target && send.isLatest() && target._targetGeneration === generation;
			},
			restore: () => {
				const target = alive();
				if (!target) {
					return 'gone';
				}
				// Only once its input shows it: not while it sends, such as while it reseeds after another background send.
				return target._isIdle() && target.input.restore(input) ? 'restored' : 'busy';
			},
		});
	}

	/** Whether its input is empty and no send of it is under way. */
	private _isIdle(): boolean {
		const state = this.input.get();
		return !state.attempt && !state.input.inputText && !state.input.attachments.length;
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
				this.input.setSendAttemptSession(to.resource);
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

/** A composer of a chat window as it is stored ({@link ChatWindowComposerModel.toStored}). */
export interface IStoredChatWindowComposer extends IComposerInputState {
	readonly resource: URI;
	readonly target?: INewSessionTarget;
	readonly groupId?: string;
}

/** What a stored composer restores as: the session that a send it had not seen end started, or a composer. */
export type RestoredChatWindowComposer = { readonly kind: 'session'; readonly session: ISession } | { readonly kind: 'composer'; readonly composer: ChatWindowComposerModel };

/** The key of the composers of chat windows that were open when the window last closed. */
export const CHAT_WINDOW_COMPOSERS_STORAGE_KEY = 'sessions.chatWindow.composers';

function isOptionalString(value: unknown): value is string | undefined {
	return value === undefined || typeof value === 'string';
}

/** The stored composer that `value` is, unmarshalled; throws when it is none. */
function fromStoredComposer(value: unknown): IStoredChatWindowComposer {
	const entry = value as { resource?: unknown; target?: Partial<Record<keyof INewSessionTarget, unknown>>; groupId?: unknown; input?: unknown; attempt?: { id?: unknown; input?: unknown; session?: unknown } } | undefined;
	const target = entry?.target;
	const attempt = entry?.attempt;
	if (!entry || !URI.isUri(entry.resource) || !isChatWindowComposerResource(entry.resource) || !isOptionalString(entry.groupId)
		|| (target !== undefined && (typeof target !== 'object' || target === null || (target.folderUri !== undefined && !URI.isUri(target.folderUri))
			|| !isOptionalString(target.providerId) || !isOptionalString(target.sessionTypeId) || !isOptionalString(target.modelId) || !isOptionalString(target.modeId)
			|| (target.requireDevContainer !== undefined && typeof target.requireDevContainer !== 'boolean')))
		|| (attempt !== undefined && (typeof attempt !== 'object' || attempt === null || typeof attempt.id !== 'string' || (attempt.session !== undefined && !URI.isUri(attempt.session))))) {
		throw new Error('Invalid chat window composer.');
	}
	return {
		resource: entry.resource,
		...(target ? { target: target as INewSessionTarget } : {}),
		...(entry.groupId ? { groupId: entry.groupId } : {}),
		input: fromStoredChatDraft(entry.input),
		...(attempt ? { attempt: { id: attempt.id as string, input: fromStoredChatDraft(attempt.input), ...(attempt.session ? { session: attempt.session as URI } : {}) } } : {}),
	};
}

function toStoredComposer(composer: IStoredChatWindowComposer): unknown {
	return {
		resource: composer.resource,
		target: composer.target,
		groupId: composer.groupId,
		input: toStoredChatDraft(composer.input),
		attempt: composer.attempt && { id: composer.attempt.id, session: composer.attempt.session, input: toStoredChatDraft(composer.attempt.input) },
	};
}

/**
 * The composers of the chat windows: those open, and those stored when the window last closed until they restore. It
 * stores them all as the state of the window is saved, never as their input changes, and forgets the stored ones that
 * the restoration of the chat windows did not restore ({@link didFinishRestore}).
 */
export class ChatWindowComposers extends Disposable {

	/** The background sends of the composers, followed also after their composer and window are gone. */
	readonly backgroundSends: ChatWindowComposerBackgroundSends;

	private readonly _stored = new Map<string, IStoredChatWindowComposer>();
	private readonly _live = new Map<string, ChatWindowComposerModel>();
	/** The stored composers restoring, until they are restored. */
	private readonly _restoring = new Set<string>();
	/** The stored composers restored, by the chat each restored as, until that chat opens in a window ({@link didOpen}). */
	private readonly _restoredAs = new Map<string, string>();

	/**
	 * @param _waitForSession Waits a while for the session of a resource to be known, such as once its provider loaded
	 * it; undefined when it does not become known.
	 */
	constructor(
		private readonly _waitForSession: (resource: URI) => Promise<ISession | undefined>,
		@IStorageService private readonly _storageService: IStorageService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@ILogService private readonly _logService: ILogService,
	) {
		super();
		this.backgroundSends = this._register(_instantiationService.createInstance(ChatWindowComposerBackgroundSends));
		this._read();
		this._register(_storageService.onWillSaveState(() => this._save()));
	}

	/** Creates a composer of `resource`, which it stores while it is open. */
	create(resource: URI, init: IChatWindowComposerInit, openStartedSession: (session: ISession) => Promise<void>): ChatWindowComposerModel {
		const key = resource.toString();
		const composer = this._instantiationService.createInstance(ChatWindowComposerModel, resource, init, this.backgroundSends, openStartedSession);
		this._live.set(key, composer);
		Event.once(composer.onWillDispose)(() => {
			if (this._live.get(key) === composer) {
				this._live.delete(key);
			}
			// A restored composer that goes before its window opened, such as as opening the window failed, stays stored.
			if (this._restoredAs.get(key) === key) {
				this._restoredAs.delete(key);
			}
		});
		return composer;
	}

	/** Whether the composer of `resource` was stored and was not restored in an open window yet. */
	hasStored(resource: URI): boolean {
		return this._stored.has(resource.toString());
	}

	/**
	 * Restores the stored composer of `resource`: as the session that a foreground send it had sent started, once that
	 * session is known, or else as a composer with its input, or with the input of a send that did not end, which it no
	 * longer follows. It stays stored until the chat it restores as opens in a window ({@link didOpen}), so that a window
	 * that fails to open loses nothing.
	 */
	async restore(resource: URI, openStartedSession: (session: ISession) => Promise<void>): Promise<RestoredChatWindowComposer | undefined> {
		const key = resource.toString();
		const stored = this._stored.get(key);
		if (!stored || this._live.has(key) || this._restoring.has(key)) {
			return undefined;
		}
		this._restoring.add(key);
		let sent: ISession | undefined;
		try {
			sent = stored.attempt?.session && await this._waitForSession(stored.attempt.session);
		} finally {
			this._restoring.delete(key);
		}
		if (this._stored.get(key) !== stored) {
			return undefined;
		}
		if (sent && isSessionCreated(sent)) {
			this._restoredAs.set(sent.mainChat.get().resource.toString(), key);
			return { kind: 'session', session: sent };
		}
		const input = stored.attempt?.input ?? stored.input;
		this._restoredAs.set(key, key);
		return { kind: 'composer', composer: this.create(resource, { target: stored.target, groupId: stored.groupId, input: { input } }, openStartedSession) };
	}

	/** The session that a foreground send of the stored composer of `resource` went out with, if any. */
	storedAttemptSessionOf(resource: URI): URI | undefined {
		return this._stored.get(resource.toString())?.attempt?.session;
	}

	/** Forgets the stored composers that restored as one of `chats`, which are open in a window now. */
	didOpen(chats: readonly URI[]): void {
		for (const chat of chats) {
			const key = this._restoredAs.get(chat.toString());
			if (key !== undefined) {
				this._restoredAs.delete(chat.toString());
				this._stored.delete(key);
			}
		}
	}

	/**
	 * Forgets the stored composers that the restoration of the chat windows did not claim (`claimed`): the windows it
	 * restored, and those whose opening failed, which it keeps to restore next time.
	 */
	didFinishRestore(claimed: readonly URI[]): void {
		const keep = new Set(claimed.map(resource => resource.toString()));
		for (const key of [...this._stored.keys()]) {
			if (!keep.has(key)) {
				this._stored.delete(key);
			}
		}
	}

	private _read(): void {
		const raw = this._storageService.get(CHAT_WINDOW_COMPOSERS_STORAGE_KEY, StorageScope.WORKSPACE);
		if (!raw) {
			return;
		}
		let entries: unknown;
		try {
			entries = parse(raw);
		} catch (error) {
			this._logService.error('[ChatWindow] Could not read the stored composers of chat windows', error);
			return;
		}
		for (const entry of Array.isArray(entries) ? entries : []) {
			try {
				const stored = fromStoredComposer(entry);
				this._stored.set(stored.resource.toString(), stored);
			} catch (error) {
				this._logService.warn('[ChatWindow] Not restoring a stored composer of a chat window', error);
			}
		}
	}

	private _save(): void {
		// A composer that restored and is open stores what it has now rather than what it restored from.
		const composers = [...[...this._live.values()].map(composer => composer.toStored()), ...[...this._stored.entries()].filter(([key]) => !this._live.has(key)).map(([, stored]) => stored)];
		if (composers.length) {
			this._storageService.store(CHAT_WINDOW_COMPOSERS_STORAGE_KEY, stringify(composers.map(toStoredComposer)), StorageScope.WORKSPACE, StorageTarget.MACHINE);
		} else {
			this._storageService.remove(CHAT_WINDOW_COMPOSERS_STORAGE_KEY, StorageScope.WORKSPACE);
		}
	}
}
