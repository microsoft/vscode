/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $, isAncestorOfActiveElement, size } from '../../../../../base/browser/dom.js';
import { Disposable, DisposableStore, MutableDisposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { autorun, constObservable, derived, IObservable, observableValue, transaction } from '../../../../../base/common/observable.js';
import { localize } from '../../../../../nls.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { createSessionHostServices, ISessionHost, ISessionHostService, SessionHost, SessionHostKind } from '../../../../services/sessions/browser/sessionHost.js';
import { IChat, ISession, isSessionCreated } from '../../../../services/sessions/common/session.js';
import { ISessionChangesStatsCache } from '../../../../services/sessions/common/sessionChangesStatsCache.js';
import { setHostSessionContextKeys } from '../../common/sessionContextKeys.js';
import { SessionInChatEditorContext } from '../../common/contextkeys.js';
import { ChatGroupView, IChatGroupContext } from '../parts/chatGroupView.js';
import { AbstractChatView, INewSessionDraftHost, ISessionViewHostOptions } from '../parts/chatView.js';
import { IChatViewFactory } from '../chatViewFactory.js';
import { SessionHeader } from '../parts/sessionHeader.js';
import { Menus } from '../menus.js';
import { IEditorPaneTitleMenu } from '../../../../browser/parts/editor/editor.js';
import { ISessionPaneContent } from '../../../../services/sessions/common/sessionPane.js';
import { IChatService } from '../../../chat/common/chatService/chatService.js';
import { ChatModelHold } from './sessionChatOpening.js';

/** A new-session composer that a chat editor shows while its session is not created ({@link ChatEditorContent.setComposer}). */
export interface IChatEditorComposer {
	/** The host of the composer's drafts. */
	readonly draftHost: INewSessionDraftHost;
	/** What the composer shows: its draft, or the session of the request it sent until that ends. */
	readonly session: IObservable<ISession | undefined>;
}

/**
 * What a chat editor shows of one chat: the header of its session above the chat, with its Session Activity Bar, as a
 * slot of the main window's grid shows a session's chat. It shows a session scoped to that chat: none of the session's
 * other chats show beside it, as each shows in an editor of its own.
 */
export class ChatEditorContent extends Disposable {

	readonly element: HTMLElement = $('.session-view.chat-editor-content.modern-ui-editor-tab-group');

	private readonly _header: SessionHeader;
	private readonly _group: ChatGroupView;
	private readonly _headerContainer: HTMLElement;
	/** The services of its own scope, which what it shows is created with: disposed after it, see {@link dispose}. */
	private readonly _scopedServices = new DisposableStore();
	private readonly _content = observableValue<ISessionPaneContent | undefined>(this, undefined);
	private readonly _composer = observableValue<IChatEditorComposer | undefined>(this, undefined);
	private readonly _session = derived(this, reader => this._content.read(reader)?.session ?? this._composer.read(reader)?.session.read(reader));
	private readonly _chat = derived(this, reader => this._content.read(reader)?.chat.read(reader));
	private readonly _showHeader: boolean;
	private _headerHidden = false;
	private _lastLayout: { readonly width: number; readonly height: number; readonly top: number; readonly left: number } | undefined;
	private readonly _visible = observableValue(this, true);
	private _active = true;
	private readonly _contentContainer: HTMLElement;
	/** The view of its composer, or of the request the composer sent, while it shows instead of the chat. */
	private readonly _composerView = observableValue<AbstractChatView | undefined>(this, undefined);
	/**
	 * The chat model of a composer's session whose chat it shows, kept loaded from the composer until the chat's view has
	 * bound to it: only that handoff, as a model held longer cannot be released for its view to load it again, such as
	 * once its provider is replaced.
	 */
	private readonly _shownChatModel = this._register(new ChatModelHold(resource => this._chatService.acquireExistingSession(resource, 'ChatEditorContent')));
	/** Tracks whether the chat's view has bound to the model {@link _shownChatModel} holds. */
	private readonly _shownChatBinding = this._register(new MutableDisposable());
	private _moveFocusToGroup = false;
	/** Whether it shows the chat: not while another editor of its group, as a tab, shows, nor while its window shows only its main part. */
	readonly visible: IObservable<boolean> = this._visible;

	/** The host of what it shows: its chat, nested in the host of its window. */
	readonly host: ISessionHost;
	/** The chat view of its chat, once it shows the chat. */
	readonly primaryChatView: IObservable<AbstractChatView | undefined>;
	/** The top of {@link primaryChatView} while it shows only its input: below the bar of its group, as the session header hides then. */
	readonly inputOnlyChatViewTop: IObservable<number>;
	/** The session header. */
	get headerElement(): HTMLElement { return this._header.element; }
	/** The menu of the actions of the session header, with the context and the arguments they show and run with there. */
	readonly titleMenu: IEditorPaneTitleMenu;

	override dispose(): void {
		super.dispose();
		this._scopedServices.dispose();
	}

	constructor(
		private readonly _hostOptions: ISessionViewHostOptions | undefined,
		@IInstantiationService instantiationService: IInstantiationService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@ISessionHost parentHost: ISessionHost,
		@ISessionHostService sessionHostService: ISessionHostService,
		@ISessionChangesStatsCache changesStatsCache: ISessionChangesStatsCache,
		@IChatViewFactory private readonly _chatViewFactory: IChatViewFactory,
		@IChatService private readonly _chatService: IChatService,
	) {
		super();
		this.element.setAttribute('role', 'region');
		this._register(autorun(reader => {
			const chat = this._chat.read(reader);
			this.element.setAttribute('aria-label', chat
				? localize('chatEditorContent', "Chat: {0}", chat.title.read(reader))
				: this._composer.read(reader) ? localize('chatEditorContentNewSession', "Chat: New Session") : localize('chatEditorContentEmpty', "Chat"));
		}));

		const scopedContextKeyService = this._scopedServices.add(contextKeyService.createScoped(this.element));
		// What acts on the main window's grid, such as pinning the session there, does not show in it.
		SessionInChatEditorContext.bindTo(scopedContextKeyService).set(true);
		this.host = new SessionHost({ kind: SessionHostKind.Pane, parent: parentHost, session: this._session, chat: this._chat, contextKeyService: scopedContextKeyService });
		this._register(sessionHostService.registerHost(this.host));
		const scopedInstantiationService = this._scopedServices.add(instantiationService.createChild(createSessionHostServices(scopedContextKeyService, this.host)));
		this._register(autorun(reader => {
			const content = this._content.read(reader);
			setHostSessionContextKeys(content?.session ?? this._session.read(reader), content?.chat.read(reader), content?.state, scopedContextKeyService, reader, changesStatsCache);
		}));

		this._headerContainer = $('.session-view-centered-content');
		this.element.appendChild(this._headerContainer);
		this._header = this._register(scopedInstantiationService.createInstance(SessionHeader));
		this._showHeader = _hostOptions?.showHeader ?? true;
		this._header.setVisible(this._showHeader);
		// It drags the editor that shows the chat (see `ChatEditorView.dragHandle`), which carries the session.
		this._header.setDragsEditor(true);
		this._headerContainer.appendChild(this._header.element);
		this.titleMenu = { menuId: Menus.SessionBarToolbar, contextKeyService: scopedContextKeyService, options: this._header.menuActionOptions };
		this._register(this._header.onDidChangeVisibility(() => this._layoutChildren()));
		this._register(this._header.onDidChangeHeight(() => this._layoutChildren()));

		const content = this._contentContainer = $('.session-view-content.standalone-chat');
		this.element.appendChild(content);
		// Before the group: the group lets go of the chat before it goes.
		this._register(toDisposable(() => this._group.setContext(undefined)));
		this._group = this._register(scopedInstantiationService.createInstance(ChatGroupView, _hostOptions));
		content.appendChild(this._group.element);
		this._group.setGroupPosition(0, 1);
		this._group.setGroupActive(true);
		this._register(this._group.onDidChange(() => this._layoutChildren()));
		this.primaryChatView = this._group.chatView;
		this.inputOnlyChatViewTop = this._group.chatViewTop;

		const showsComposer = derived(this, reader => !this._content.read(reader) && this._composer.read(reader));
		this._register(autorun(reader => {
			const composer = showsComposer.read(reader);
			if (composer) {
				this._showComposer(composer, reader.store, scopedInstantiationService);
			} else {
				this._showGroup();
			}
		}));
	}

	/**
	 * Shows `composer` until the chat shows, as the main window's grid shows its composer: its view, kept while a request it
	 * sent prepares its session, so that a failure or cancellation gives the composer back its prompt, with the request's
	 * chat shown meanwhile. Focus moves between the two only where it was in the other.
	 */
	private _showComposer(composer: IChatEditorComposer, store: DisposableStore, instantiationService: IInstantiationService): void {
		// Before its views go, as its session's chat shows: the chat model its input was bound to stays loaded while the chat
		// shows, so the chat's view takes that model instead of loading the chat again from its provider, which can still have
		// the composer's input as the chat's draft, such as an agent host that syncs drafts after a delay.
		store.add(toDisposable(() => {
			const chat = this._content.get() ? composer.session.get()?.mainChat.get() : undefined;
			this._holdShownChatModel(chat?.resource);
		}));
		// Before its views go: where focus is then, such as once its session is created, moves to the chat.
		store.add(toDisposable(() => this._moveFocusToGroup = isAncestorOfActiveElement(this._contentContainer)));
		const view = store.add(this._chatViewFactory.createNewChatView(false, { hostVisible: this._visible, input: this._hostOptions?.input, session: composer.session, newSessionDraft: composer.draftHost }, instantiationService));
		store.add(toDisposable(() => this._composerView.set(undefined, undefined)));
		const moveFocus = isAncestorOfActiveElement(this._group.element);
		let restoreComposerFocus = false;
		// The session a send prepares, whichever progress it reports: its chat shows from its first progress message until
		// the send ends, and stays the same view as more messages come.
		const preparing = derived(reader => {
			const session = composer.session.read(reader);
			return session && !isSessionCreated(session, reader) && session.isNewSessionRequestInProgress?.read(reader) && !!session.preparationProgress?.read(reader) ? session : undefined;
		});
		store.add(autorun(reader => {
			const session = preparing.read(reader);
			if (session) {
				const moveToPreparation = isAncestorOfActiveElement(view.element);
				view.setVisible(false);
				const preparationView = this._chatViewFactory.createChatView(instantiationService, { input: this._hostOptions?.input });
				// Before it goes: where focus is then moves back to the composer.
				reader.store.add(toDisposable(() => restoreComposerFocus = isAncestorOfActiveElement(preparationView.element)));
				reader.store.add(preparationView);
				preparationView.setChat(session.mainChat.read(undefined), session.sessionId, session);
				this._showComposerView(preparationView);
				if (moveToPreparation) {
					preparationView.focus();
				}
				return;
			}
			this._showComposerView(view);
			if (restoreComposerFocus) {
				restoreComposerFocus = false;
				view.focus();
			}
		}));
		if (moveFocus) {
			view.focus();
		}
	}

	/**
	 * Holds the model of `resource` until the chat's view has bound to it: it showed that it was loading it and is done,
	 * which is observed, so a load quicker than the hold polls is not missed.
	 */
	private _holdShownChatModel(resource: URI | undefined): void {
		let loading = false;
		let bound = false;
		this._shownChatBinding.value = resource ? autorun(reader => {
			if (this._group.chatView.read(reader)?.isLoadingTranscript.read(reader)) {
				loading = true;
			} else if (loading) {
				bound = true;
			}
		}) : undefined;
		this._shownChatModel.hold(resource, () => bound);
	}

	private _showComposerView(view: AbstractChatView): void {
		if (view.element.parentElement !== this._contentContainer) {
			this._contentContainer.replaceChildren(view.element);
		}
		this._composerView.set(view, undefined);
		view.setActive(this._active);
		view.setVisible(this._visible.get());
		this._layoutChildren();
	}

	private _showGroup(): void {
		if (this._group.element.parentElement === this._contentContainer) {
			return;
		}
		const moveFocus = this._moveFocusToGroup;
		this._moveFocusToGroup = false;
		this._contentContainer.replaceChildren(this._group.element);
		this._layoutChildren();
		if (moveFocus) {
			this._group.focus();
		}
	}

	/**
	 * Shows `composer` while no chat shows ({@link setContent}), such as for a session the composer did not send yet. Its
	 * session header hides meanwhile, as the composer shows what it creates the session for.
	 */
	setComposer(composer: IChatEditorComposer | undefined): void {
		if (this._composer.get() !== composer) {
			this._composer.set(composer, undefined);
			this._updateHeaderVisibility();
			this._layoutChildren();
		}
	}

	/** Shows `content`, the one chat of the provider's session its pane shows; nothing while undefined. */
	setContent(content: ISessionPaneContent | undefined): void {
		if (this._content.get() === content) {
			return;
		}
		this._shownChatModel.release();
		this._shownChatBinding.clear();
		const chat = content?.chat.get();
		// The group has the chat before it replaces a composer, which hands focus to it.
		transaction(tx => {
			this._content.set(content, tx);
			this._header.setSession(content);
			this._updateHeaderVisibility();
			this._group.setContext(content && chat ? this._createContext(content, chat) : undefined);
		});
		this._layoutChildren();
	}

	private _createContext(content: ISessionPaneContent, chat: IChat): IChatGroupContext {
		const session = content.session;
		return {
			session,
			isDetached: content.state.isDetached,
			closePane: () => content.close(),
			options: { session: this._session, chat: this._chat },
			chats: constObservable([chat]),
			activeChatResource: constObservable(chat.resource.toString()),
			mainChatResource: session.mainChat.map(main => main.resource.toString()),
			tabsVisible: constObservable(false),
			chatHeaderVisible: constObservable(false),
			activeChatIsPinned: constObservable(false),
			showSessionActions: constObservable(false),
			showParentContext: constObservable(false),
			activate: () => { },
			openChat: () => { },
			onTabDragStart: () => { },
			onTabDragEnd: () => { },
		};
	}

	/** Hides the session header, such as while the chat shows only its input, and shows it again. */
	setHeaderHidden(hidden: boolean): void {
		this._headerHidden = hidden;
		this._updateHeaderVisibility();
	}

	private _updateHeaderVisibility(): void {
		const showsComposer = !this._content.get() && !!this._composer.get();
		this._header.setVisible(this._showHeader && !this._headerHidden && !showsComposer);
	}

	/**
	 * Shows or hides the chat, such as while another editor of its group, as a tab, shows; `partVisible` is false while
	 * what hosts it is hidden, so that its Session Activity Bar can still show outside of it.
	 */
	setVisible(visible: boolean, partVisible = true): void {
		this._visible.set(visible, undefined);
		this._group.setSessionVisible(visible, partVisible);
		this._composerView.get()?.setVisible(visible);
		this._layoutChildren();
	}

	/** Whether it shows the active chat, of those beside it: only that one shows the Session Activity Bar. */
	setActive(active: boolean): void {
		this._active = active;
		this._group.setGroupActive(active);
		this._composerView.get()?.setActive(active);
	}

	layout(width: number, height: number, top: number, left: number): void {
		this._lastLayout = { width, height, top, left };
		this._layoutChildren();
	}

	private _layoutChildren(): void {
		if (!this._lastLayout || !this._visible.get()) {
			return;
		}
		const { width, height, top, left } = this._lastLayout;
		const headerHeight = this._header.visible ? this._header.height : 0;
		size(this._headerContainer, width, headerHeight);
		const composerView = this._composerView.get();
		if (composerView) {
			composerView.layout(width, Math.max(0, height - headerHeight), top + headerHeight, left);
		} else {
			this._group.layout(width, Math.max(0, height - headerHeight), top + headerHeight, left);
		}
	}

	focus(): void {
		const composerView = this._composerView.get();
		if (composerView) {
			composerView.focus();
		} else {
			this._group.focus();
		}
	}
}
