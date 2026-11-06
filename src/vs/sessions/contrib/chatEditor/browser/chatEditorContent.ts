/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $, size } from '../../../../base/browser/dom.js';
import { Disposable, DisposableStore, toDisposable } from '../../../../base/common/lifecycle.js';
import { autorun, constObservable, IObservable, observableValue } from '../../../../base/common/observable.js';
import { localize } from '../../../../nls.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ActiveSessionHost, createSessionHostServices, ISessionHost, ISessionHostService, SessionHostKind } from '../../../../workbench/contrib/sessions/browser/sessionHost.js';
import { IChat } from '../../../../workbench/contrib/sessions/common/session.js';
import { ISessionChangesStatsCache } from '../../../../workbench/contrib/sessions/common/sessionChangesStatsCache.js';
import { setActiveSessionContextKeys } from '../../../../workbench/contrib/sessions/common/sessionContextKeys.js';
import { SessionInChatEditorContext } from '../../../../workbench/contrib/sessions/common/contextkeys.js';
import { IActiveSession } from '../../../../workbench/contrib/sessions/common/sessionsManagement.js';
import { ChatGroupView, IChatGroupContext } from '../../../../workbench/contrib/sessions/browser/parts/chatGroupView.js';
import { AbstractChatView, ISessionViewHostOptions } from '../../../../workbench/contrib/sessions/browser/parts/chatView.js';
import { SessionHeader } from '../../../../workbench/contrib/sessions/browser/parts/sessionHeader.js';

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
	private readonly _session = observableValue<IActiveSession | undefined>(this, undefined);
	private readonly _showHeader: boolean;
	private _lastLayout: { readonly width: number; readonly height: number; readonly top: number; readonly left: number } | undefined;
	private _visible = true;

	/** The host of what it shows: its chat, nested in the host of its window. */
	readonly host: ISessionHost;
	/** The chat view of its chat, once it shows the chat. */
	readonly primaryChatView: IObservable<AbstractChatView | undefined>;
	/** The top of {@link primaryChatView} while it shows only its input: below the bar of its group, as the session header hides then. */
	readonly inputOnlyChatViewTop: IObservable<number>;
	/** The title of the session header. */
	get headerTitleElement(): HTMLElement { return this._header.titleElement; }

	override dispose(): void {
		super.dispose();
		this._scopedServices.dispose();
	}

	constructor(
		hostOptions: ISessionViewHostOptions | undefined,
		@IInstantiationService instantiationService: IInstantiationService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@ISessionHost parentHost: ISessionHost,
		@ISessionHostService sessionHostService: ISessionHostService,
		@ISessionChangesStatsCache changesStatsCache: ISessionChangesStatsCache,
	) {
		super();
		this.element.setAttribute('role', 'region');
		this._register(autorun(reader => {
			const session = this._session.read(reader);
			this.element.setAttribute('aria-label', session ? localize('chatEditorContent', "Chat: {0}", session.activeChat.read(reader).title.read(reader)) : localize('chatEditorContentEmpty', "Chat"));
		}));

		const scopedContextKeyService = this._scopedServices.add(contextKeyService.createScoped(this.element));
		// What acts on the main window's grid, such as pinning the session there, does not show in it.
		SessionInChatEditorContext.bindTo(scopedContextKeyService).set(true);
		this.host = new ActiveSessionHost({ kind: SessionHostKind.Pane, parent: parentHost, session: this._session, contextKeyService: scopedContextKeyService });
		this._register(sessionHostService.registerHost(this.host));
		const scopedInstantiationService = this._scopedServices.add(instantiationService.createChild(createSessionHostServices(scopedContextKeyService, this.host)));
		this._register(autorun(reader => setActiveSessionContextKeys(this._session.read(reader), scopedContextKeyService, reader, changesStatsCache)));

		this._headerContainer = $('.session-view-centered-content');
		this.element.appendChild(this._headerContainer);
		this._header = this._register(scopedInstantiationService.createInstance(SessionHeader));
		this._showHeader = hostOptions?.showHeader ?? true;
		this._header.setVisible(this._showHeader);
		// Its title drags the editor that shows the chat (see `ChatEditorView.dragHandle`), which carries the session.
		this._header.setDragsEditor(true);
		this._headerContainer.appendChild(this._header.element);
		this._register(this._header.onDidChangeVisibility(() => this._layoutChildren()));
		this._register(this._header.onDidChangeHeight(() => this._layoutChildren()));

		const content = $('.session-view-content.standalone-chat');
		this.element.appendChild(content);
		// Before the group: the group lets go of the chat before it goes.
		this._register(toDisposable(() => this._group.setContext(undefined)));
		this._group = this._register(scopedInstantiationService.createInstance(ChatGroupView, hostOptions));
		content.appendChild(this._group.element);
		this._group.setGroupPosition(0, 1);
		this._group.setGroupActive(true);
		this._register(this._group.onDidChange(() => this._layoutChildren()));
		this.primaryChatView = this._group.chatView;
		this.inputOnlyChatViewTop = this._group.chatViewTop;
	}

	/** Shows `session`, a session scoped to the one chat it shows, its active chat; nothing while undefined. */
	setSession(session: IActiveSession | undefined): void {
		if (this._session.get() === session) {
			return;
		}
		const chat = session?.activeChat.get();
		this._session.set(session, undefined);
		this._header.setSession(session);
		this._group.setContext(session && chat ? this._createContext(session, chat) : undefined);
		this._layoutChildren();
	}

	private _createContext(session: IActiveSession, chat: IChat): IChatGroupContext {
		return {
			session,
			options: { session: this._session },
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
		this._header.setVisible(this._showHeader && !hidden);
	}

	/**
	 * Shows or hides the chat, such as while another editor of its group, as a tab, shows; `partVisible` is false while
	 * what hosts it is hidden, so that its Session Activity Bar can still show outside of it.
	 */
	setVisible(visible: boolean, partVisible = true): void {
		this._visible = visible;
		this._group.setSessionVisible(visible, partVisible);
		this._layoutChildren();
	}

	/** Whether it shows the active chat, of those beside it: only that one shows the Session Activity Bar. */
	setActive(active: boolean): void {
		this._group.setGroupActive(active);
	}

	layout(width: number, height: number, top: number, left: number): void {
		this._lastLayout = { width, height, top, left };
		this._layoutChildren();
	}

	private _layoutChildren(): void {
		if (!this._lastLayout || !this._visible) {
			return;
		}
		const { width, height, top, left } = this._lastLayout;
		const headerHeight = this._header.visible ? this._header.height : 0;
		size(this._headerContainer, width, headerHeight);
		this._group.layout(width, Math.max(0, height - headerHeight), top + headerHeight, left);
	}

	focus(): void {
		this._group.focus();
	}
}
