/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { raceTimeout } from '../../../../../base/common/async.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { Disposable, DisposableStore, IDisposable, MutableDisposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { autorun, constObservable, derived, IObservable, IReader, ISettableObservable, observableSignal, observableValue, transaction } from '../../../../../base/common/observable.js';
import { extUri, isEqual } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { localize } from '../../../../../nls.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IChatService } from '../../../chat/common/chatService/chatService.js';
import { IChat, ISession, isSessionCreated } from '../../../../services/sessions/common/session.js';
import { ISessionPaneContent } from '../../../../services/sessions/common/sessionPane.js';
import { ISessionsManagementService } from '../../common/sessionsManagement.js';
import { getSessionAgentMergeConfigurationObservable } from '../sessionAgentMerge.js';
import { ISessionsListModelService } from '../sessionsListModelService.js';
import { ISessionsProvidersService } from '../sessionsProvidersService.js';
import { ShownChatReadMarker } from '../shownChatReadMarker.js';
import { ChatEditorInput, getChatEditorInputDetails, IChatEditorWindow, ISessionChatViewHost, registerSessionChatViewHost } from './chatEditor.js';
import { ChatEditorContent, IChatEditorComposer } from './chatEditorContent.js';
import { ChatModelHold, chatWindowTitle, isChatWindowChatGone } from './sessionChatOpening.js';
import { ChatWindowComposerModel } from './chatWindowComposer.js';

/** How long a host of session chat editors waits for a session to be known, such as while its provider loads it. */
export const SESSION_CHAT_WAIT_TIMEOUT = 30_000;

/** A session and the chat of it that its editor shows. */
export interface ISessionChatEditorShown {
	readonly session: ISession;
	readonly chat: IChat;
}

/** A session, and the chat that a resource names: a session names its own; a chat, also by a previous identity, its session. */
export interface IResolvedSessionChat {
	readonly session: ISession;
	/** The chat, by its current resource; undefined when the resource names the session. */
	readonly chat: URI | undefined;
}

/** The session and chat that `resource` names, among the sessions known to the window. */
export function resolveSessionChat(sessionsManagementService: ISessionsManagementService, resource: URI): IResolvedSessionChat | undefined {
	const session = sessionsManagementService.getSession(resource);
	if (session) {
		return { session, chat: undefined };
	}
	const owner = sessionsManagementService.getSessionForChatResource(resource);
	return owner && { session: owner.session, chat: owner.chat.resource };
}

/** What {@link resolveSessionChat} resolves `resource` as, once a session that names it is known, or undefined after `timeout`. */
export async function waitForSessionChat(sessionsManagementService: ISessionsManagementService, resource: URI, timeout = SESSION_CHAT_WAIT_TIMEOUT): Promise<IResolvedSessionChat | undefined> {
	const resolved = resolveSessionChat(sessionsManagementService, resource);
	if (resolved) {
		return resolved;
	}
	const store = new DisposableStore();
	try {
		return await raceTimeout(new Promise<IResolvedSessionChat | undefined>(resolve => {
			// Of every session, also one outside a listing scope, such as of another folder, which a host can show
			store.add(sessionsManagementService.onDidChangeSession(changes => {
				if (store.isDisposed || (changes.length > 0 && changes.every(({ kind }) => kind === 'removed'))) {
					return;
				}
				const loaded = resolveSessionChat(sessionsManagementService, resource);
				if (loaded) {
					// Stop following the sessions as soon as it resolves
					store.dispose();
					resolve(loaded);
				}
			}));
		}), timeout);
	} finally {
		store.dispose();
	}
}

/**
 * One chat that a host of session chat editors shows, such as a chat window or the chat part of an editor window: its editor,
 * and the provider's session of the chat, which its editor shows. It observes the session without owning it, and follows
 * the chat, such as when its session is replaced or the chat moves to another session; the chat ends ({@link onDidEnd}) once
 * it is deleted or archived, or its session is removed. While it is a new-session composer, it shows the composer until a
 * foreground request of it starts its session, whose main chat it then shows, in the same editor.
 *
 * A subclass calls {@link start} once it is constructed: what it starts calls the subclass's hooks.
 */
export abstract class SessionChatEditorEntry extends Disposable implements ISessionChatViewHost {

	readonly chat: ISettableObservable<URI>;
	readonly input: ChatEditorInput;
	readonly title: IObservable<string>;

	private readonly _onDidEnd = this._register(new Emitter<void>());
	/** Fires once the chat ends, such as once it is deleted: its host then closes its editor. */
	readonly onDidEnd: Event<void> = this._onDidEnd.event;
	private _ended = false;
	private _disposed = false;

	private readonly _onWillDispose = this._register(new Emitter<void>());
	readonly onWillDispose: Event<void> = this._onWillDispose.event;

	/** The provider's session of the chat, and the chat, once known. */
	private readonly _shown = observableValue<ISessionChatEditorShown | undefined>(this, undefined);
	/** Its new-session composer while the chat is that, until the composer's foreground request starts its session. */
	private readonly _composer = observableValue<ChatWindowComposerModel | undefined>(this, undefined);
	private readonly _composerStore = this._register(new MutableDisposable<DisposableStore>());
	/** The session the composer sent and the session's main chat, once the session is created, until the chat becomes it. */
	private readonly _composerShown = derived(this, reader => {
		const session = this._composer.read(reader)?.session.read(reader);
		return session && isSessionCreated(session, reader) ? { session, chat: session.mainChat.read(reader) } : undefined;
	});

	/** What its editor shows of a session: the chat once known, or the session its composer started, until the chat becomes it. */
	readonly shown: IObservable<ISessionChatEditorShown | undefined> = derived(this, reader => this._composer.read(reader) ? this._composerShown.read(reader) : this._shown.read(reader));
	/** The session of the chat, or of its composer, such as its draft. */
	readonly session: IObservable<ISession | undefined> = derived(this, reader => {
		const composer = this._composer.read(reader);
		return composer ? composer.session.read(reader) : this._shown.read(reader)?.session;
	});
	readonly shownChat: IObservable<IChat | undefined> = derived(this, reader => this.shown.read(reader)?.chat);
	readonly content: IObservable<ISessionPaneContent | undefined>;
	readonly composer: IObservable<IChatEditorComposer | undefined> = derived(this, reader => {
		const composer = this._composer.read(reader);
		return composer && { draftHost: composer, session: composer.session };
	});
	/** Whether it is a new-session composer that has not sent its session yet, which cannot leave its window. */
	readonly isUnsentComposer: IObservable<boolean> = derived(this, reader => !!this._composer.read(reader));
	/** Whether it is a new-session composer that has not sent its session yet. */
	get isComposer(): boolean { return !!this._composer.get(); }
	/** Whether it is a new-session composer whose closing loses nothing (see {@link ChatWindowComposerModel.isPristine}). */
	get isPristineComposer(): boolean { return !!this._composer.get()?.isPristine(); }
	/** The custom group of the sessions list that the sessions of its new-session composer join, while it is one. */
	get composerGroupId(): string | undefined { return this._composer.get()?.groupId; }

	/** The session the chat was last known in, so that its end is known while the session no longer lists it. */
	private _knownSession: ISession | undefined;
	/** Whether its known session was removed, such as deleted: not hidden as its provider goes away, which removes nothing. */
	private _knownSessionRemoved = false;

	/** The views of its editor, the last of which shows it; see {@link view}. */
	private readonly _attachedViews: ChatEditorContent[] = [];
	private readonly _view = observableValue<ChatEditorContent | undefined>(this, undefined);
	readonly view: IObservable<ChatEditorContent | undefined> = this._view;

	/** The window its editor shows in. */
	abstract readonly window: IObservable<IChatEditorWindow | undefined>;
	/** Whether its chat is the active one of its window. */
	abstract readonly active: IObservable<boolean>;

	constructor(
		chatResource: URI,
		@ISessionsManagementService protected readonly sessionsManagementService: ISessionsManagementService,
		@IChatService private readonly _chatService: IChatService,
		@ISessionsListModelService private readonly _sessionsListModelService: ISessionsListModelService,
		@ISessionsProvidersService private readonly _sessionsProvidersService: ISessionsProvidersService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
	) {
		super();
		this.chat = observableValue<URI>(this, chatResource);
		this.input = this._register(new ChatEditorInput(chatResource));
		this._register(registerSessionChatViewHost(this.input, this));
		this.title = derived(this, reader => {
			if (this._composer.read(reader)) {
				return localize('sessionChatEditor.newSession', "New Session");
			}
			const session = this.session.read(reader);
			return session ? chatWindowTitle(session, this.chat.read(reader), reader) : '';
		});
		this.content = derived(this, reader => {
			const shown = this.shown.read(reader);
			return shown && this._contentOf(shown, () => this.shown.read(undefined) === shown);
		});
	}

	/**
	 * Starts following the chat, or showing `composer`, which it then owns: its tab, read state and session. `holdReason`
	 * names what holds the chat's loaded model until its editor's view binds to it.
	 */
	protected start(composer: ChatWindowComposerModel | undefined, holdReason: string): void {
		this._register(autorun(reader => this.input.setName(this.title.read(reader))));
		// Its tab shows the status of the chat, as the sessions list does
		this._register(autorun(reader => {
			const shown = this._shown.read(reader);
			this.input.setDetails(shown && getChatEditorInputDetails(shown.session, shown.chat, this.title.read(reader), reader, this._sessionsListModelService,
				() => getSessionAgentMergeConfigurationObservable(shown.session, this._sessionsProvidersService, this._configurationService, shown.chat)));
		}));
		// It is read once it shows: while it is the active chat of its window, focused or not, and its editor shows it
		const readMarker = new ShownChatReadMarker(this.sessionsManagementService, extUri);
		this._register(autorun(reader => {
			const shown = this._shown.read(reader);
			if (!shown) {
				readMarker.reset();
				return;
			}
			const visible = this.active.read(reader) && !!this._view.read(reader)?.visible.read(reader);
			readMarker.update(shown.session, visible ? shown.chat : undefined, reader);
		}));

		// The loaded model of the chat bridges its opening, such as its move from another window, which lets go of it
		const heldChat = this._register(new ChatModelHold(resource => this._chatService.acquireExistingSession(resource, holdReason)));
		if (composer) {
			this._setComposer(composer);
		} else {
			heldChat.hold(this.chat.get(), this._boundCheck());
		}

		// Once it knows its session, only sessions added, removed or replaced can change where its chat is: what changes in its
		// session it reads from that session. So the many changes of other sessions, such as while they stream, pass it by.
		// A replacement, such as a pending session committed under the same ID, comes as a change of another object.
		const sessionsChanged = observableSignal(this);

		// A session replaced by one with another ID, such as one its host hands off to another connection, is removed right
		// after: the chat follows to the chat of the replacement that continues it, rather than ending with the session.
		this._register(this.sessionsManagementService.onDidReplaceSession(({ from, to, chats }) => {
			const known = this._knownSession;
			if (this._ended || this._composer.get() || !known || !isEqual(known.resource, from.resource)) {
				return;
			}
			const current = this.chat.get();
			const next = chats?.get(current) ?? (isEqual(current, from.mainChat.get().resource) ? to.mainChat.get().resource : undefined);
			if (!next) {
				return;
			}
			this._knownSession = to;
			this._knownSessionRemoved = false;
			if (isEqual(next, current)) {
				// Its chat stays, such as in a session replaced under the same ID, whose change that follows passes it by as
				// the change of the session it knows already
				sessionsChanged.trigger(undefined);
			} else {
				this.chat.set(next, undefined);
				heldChat.hold(next, this._boundCheck());
			}
		}));

		// Of every session, also one outside a listing scope, such as of another folder, which its host can show
		this._register(this.sessionsManagementService.onDidChangeSession(changes => {
			const known = this._knownSession;
			if (known && changes.some(({ session, kind }) => kind === 'removed' && isEqual(session.resource, known.resource))) {
				this._knownSessionRemoved = true;
			}
			if (!known || changes.some(({ session, kind }) => kind !== 'changed' || (session !== known && session.sessionId === known.sessionId))) {
				sessionsChanged.trigger(undefined);
			}
		}));
		this._register(autorun(reader => {
			sessionsChanged.read(reader);
			this._update(reader);
		}));
	}

	/** Closes the chat where it shows, from its editor's pane, such as by its close action. `resource` is the chat's own. */
	protected abstract closeShown(resource: URI): void;

	/** Called as the chat shows in another session than before, such as once it is first known. */
	protected onDidShowSession(_shown: ISessionChatEditorShown): void { }

	/** Called as it shows `composer`, with what it disposes once the composer goes. */
	protected onDidSetComposer(_composer: ChatWindowComposerModel, _store: DisposableStore): void { }

	private _setComposer(composer: ChatWindowComposerModel): void {
		const store = new DisposableStore();
		store.add(composer);
		// Its tab shows while it is a composer, also alone in its group, so it can be closed there: until its session's chat
		// shows, it has no title of its own, as its session header hides.
		this.input.setRendersTitle(false);
		store.add(toDisposable(() => this.input.setRendersTitle(true)));
		store.add(composer.onDidStart(session => {
			const main = session.mainChat.get().resource;
			transaction(tx => {
				this._composer.set(undefined, tx);
				this.chat.set(main, tx);
			});
			this._composerStore.clear();
		}));
		this.onDidSetComposer(composer, store);
		this._composerStore.value = store;
		this._composer.set(composer, undefined);
	}

	private _end(): void {
		if (!this._ended) {
			this._ended = true;
			this._onDidEnd.fire();
		}
	}

	private _update(reader: IReader): void {
		if (this._ended || this._composer.read(reader)) {
			return;
		}
		const chatResource = this.chat.read(reader);
		// The chats of the session it was in, as these change without the sessions changing, such as as one is deleted
		// or replaced; the lookup below is not observable.
		this._knownSession?.chats.read(reader);
		this._knownSession?.loading.read(reader);
		const owner = this.sessionsManagementService.getSessionForChatResource(chatResource);
		if (owner) {
			if (this._knownSession !== owner.session) {
				owner.session.chats.read(reader);
				owner.session.loading.read(reader);
			}
			this._knownSession = owner.session;
			this._knownSessionRemoved = false;
			if (isChatWindowChatGone(owner.session, chatResource, reader)) {
				this._end();
				return;
			}
			const shown = this._shown.get();
			if (shown?.session !== owner.session || shown.chat !== owner.chat) {
				const sessionChanged = shown?.session.sessionId !== owner.session.sessionId;
				const next = { session: owner.session, chat: owner.chat };
				this._shown.set(next, undefined);
				if (sessionChanged) {
					this.onDidShowSession(next);
				}
			}
			return;
		}
		if (this._knownSessionRemoved && !(this._knownSession && this.sessionsManagementService.getSession(this._knownSession.resource))) {
			// Its session is gone, such as deleted: its chats with it, also while the session's last state still lists them
			this._end();
			return;
		}
		if (this._knownSession) {
			// A provider registered again replaces the sessions it had: the chat shows once the session that replaces its
			// session lists it, such as a chat that its session's chats publish later
			const replacement = this.sessionsManagementService.getSession(this._knownSession.resource);
			if (replacement && replacement !== this._knownSession) {
				// Its chats can list the chat later than its loading says, so only the session being archived ends the chat
				// meanwhile
				if (replacement.isArchived.read(reader)) {
					this._end();
				} else {
					replacement.chats.read(reader);
				}
				return;
			}
		}
		// Gone once the session it was in has loaded and no longer lists it, such as once it was deleted
		if (this._knownSession && isChatWindowChatGone(this._knownSession, chatResource, reader)) {
			this._end();
		}
	}

	/**
	 * What its editor's pane shows of `shown`: its one chat, as a detached pane shows, apart from the session's slot. Closing
	 * the pane closes the chat ({@link closeShown}) while it still shows that chat of that session: a content kept past the
	 * chat moving or its session being replaced, its chat ending, or its host letting go of it closes nothing.
	 */
	private _contentOf(shown: ISessionChatEditorShown, isShown: () => boolean): ISessionPaneContent {
		const chats = constObservable([shown.chat]);
		return {
			session: shown.session,
			chat: constObservable(shown.chat),
			state: {
				sticky: constObservable(false),
				tabs: { openChats: chats, closedChats: constObservable([]), lastClosedChat: undefined, visibleChatTabs: chats, shouldShowChatTabs: constObservable(true) },
				isDetached: true,
			},
			close: () => {
				if (this._disposed || this._ended || !isShown()) {
					return;
				}
				// The chat's own resource while the composer shows its session, which its host knows the chat by
				this.closeShown(this._composer.get() ? this.chat.get() : shown.chat.resource);
			},
		};
	}

	attach(view: ChatEditorContent): IDisposable {
		this._attachedViews.push(view);
		this._view.set(view, undefined);
		return toDisposable(() => {
			const index = this._attachedViews.indexOf(view);
			if (index >= 0) {
				this._attachedViews.splice(index, 1);
			}
			this._view.set(this._attachedViews.at(-1), undefined);
		});
	}

	/** Whether the chat view of its editor has bound to its model: it loaded, or showed that it was loading and is done. */
	private _boundCheck(): () => boolean {
		let loading = false;
		return () => {
			const view = this._view.get()?.primaryChatView.get();
			if (!view) {
				return false;
			}
			if (view.isLoadingTranscript.get()) {
				loading = true;
				return false;
			}
			return loading;
		};
	}

	override dispose(): void {
		// What it showed acts on it no more, such as a content its editor kept, once its host let go of it
		this._disposed = true;
		this._onWillDispose.fire();
		super.dispose();
	}
}
