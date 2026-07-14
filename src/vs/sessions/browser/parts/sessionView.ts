/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/sessionView.css';
import { $, size } from '../../../base/browser/dom.js';
import { ISerializableView, IViewSize } from '../../../base/browser/ui/grid/grid.js';
import { Emitter, Event } from '../../../base/common/event.js';
import { Disposable, DisposableStore, IDisposable, MutableDisposable } from '../../../base/common/lifecycle.js';
import { URI } from '../../../base/common/uri.js';
import { IInstantiationService } from '../../../platform/instantiation/common/instantiation.js';
import { ICommandService } from '../../../platform/commands/common/commands.js';
import { localize } from '../../../nls.js';
import { ServiceCollection } from '../../../platform/instantiation/common/serviceCollection.js';
import { IContextKey, IContextKeyService } from '../../../platform/contextkey/common/contextkey.js';
import { asCssVariable } from '../../../platform/theme/common/colorUtils.js';
import { IActiveSession } from '../../services/sessions/common/sessionsManagement.js';
import { IChatViewFactory } from '../../services/chatView/browser/chatViewFactory.js';
import { AbstractChatView, ChatViewKind, IChatViewOptions } from './chatView.js';
import { ChatCompositeBar } from './chatCompositeBar.js';
import { SessionReadOnlyBanner } from './sessionReadOnlyBanner.js';
import { SessionHeader, SessionViewFloatingToolbar } from './sessionHeader.js';
import { ISessionContext, SessionContext } from '../../services/sessions/browser/sessionContext.js';
import { autorun, observableValue } from '../../../base/common/observable.js';
import { SessionIsMaximizedContext } from '../../common/contextkeys.js';
import { UNARCHIVE_SESSION_COMMAND_ID } from '../../common/sessionCommands.js';
import { setActiveSessionContextKeys } from '../../services/sessions/common/sessionContextKeys.js';
import { activeSessionViewBackground, activeSessionViewForeground, inactiveSessionViewBackground, inactiveSessionViewForeground } from '../../common/theme.js';
import { ChatInteractivity, SessionStatus } from '../../services/sessions/common/session.js';

/**
 * Options passed to {@link SessionView.openSession}. Extends the chat view
 * options so they can be forwarded to the new-chat views the host creates.
 */
export interface ISessionViewOptions extends IChatViewOptions { }

/**
 * A stable single-slot grid leaf that handles switching between concrete
 * chat views internally. `SessionsPart` delegates `openSession(...)` to
 * this host so it no longer needs to remove/add grid views when the active
 * chat view kind changes.
 *
 * Also hosts the {@link SessionHeader} and {@link ChatCompositeBar} so that they
 * live alongside the chat view they relate to.
 */
export class SessionView extends Disposable implements ISerializableView {

	static readonly TYPE = 'sessions.sessionView';
	private static readonly CENTERED_CONTENT_MAX_WIDTH = 950;
	private static readonly ACTIVE_BACKGROUND = asCssVariable(activeSessionViewBackground);
	private static readonly ACTIVE_FOREGROUND = asCssVariable(activeSessionViewForeground);
	private static readonly INACTIVE_BACKGROUND = asCssVariable(inactiveSessionViewBackground);
	private static readonly INACTIVE_FOREGROUND = asCssVariable(inactiveSessionViewForeground);

	readonly element: HTMLElement = $('.session-view');

	readonly minimumWidth = 200;
	readonly maximumWidth = Number.POSITIVE_INFINITY;
	readonly minimumHeight = 200;
	readonly maximumHeight = Number.POSITIVE_INFINITY;

	private readonly _onDidChange = this._register(new Emitter<IViewSize | undefined>());
	readonly onDidChange: Event<IViewSize | undefined> = this._onDidChange.event;

	private readonly _header: SessionHeader;
	private readonly _compositeBar: ChatCompositeBar;
	private readonly _readOnlyBanner: SessionReadOnlyBanner;
	private readonly _floatingToolbar: SessionViewFloatingToolbar;
	private readonly _centeredContentContainer: HTMLElement;
	private readonly _contentContainer: HTMLElement;

	private readonly _currentView = this._register(new MutableDisposable<AbstractChatView>());
	private _lastLayout: { readonly width: number; readonly height: number; readonly top: number; readonly left: number } | undefined;

	private _openSessionDisposables = this._register(new DisposableStore());
	private _currentSession: IActiveSession | undefined;
	private _hasOpenedSession = false;

	private readonly _sessionIsMaximizedKey: IContextKey<boolean>;
	private readonly _scopedContextKeyService: IContextKeyService;

	/** Whether this view currently hosts the active session in the grid. */
	private _isActive = true;

	private readonly _sessionObs = observableValue<IActiveSession | undefined>(this, undefined);

	constructor(
		@IChatViewFactory private readonly chatViewFactory: IChatViewFactory,
		@IInstantiationService instantiationService: IInstantiationService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@ICommandService private readonly commandService: ICommandService,
	) {
		super();

		// Scoped context key service so toolbars hosted within can react to
		// session-specific context keys (e.g. sessionIsCreated, sessionIsSticky).
		const scopedContextKeyService = this._scopedContextKeyService = this._register(contextKeyService.createScoped(this.element));
		this._sessionIsMaximizedKey = SessionIsMaximizedContext.bindTo(scopedContextKeyService);

		// Scoped service exposing this view's session so toolbars and contributed
		// action view items (e.g. the changes diff stats in the header) can read it.
		const scopedInstantiationService = this._register(instantiationService.createChild(new ServiceCollection(
			[IContextKeyService, scopedContextKeyService],
			[ISessionContext, new SessionContext(this._sessionObs)],
		)));


		// Expose the centered-content cap as a CSS variable so styles that need
		// to align with the centered band (e.g. the chat-view progress bar) can
		// reference it without duplicating the constant.
		this.element.style.setProperty('--session-view-centered-content-max-width', `${SessionView.CENTERED_CONTENT_MAX_WIDTH}px`);

		// The header and composite bar (tabs) are hosted in a centered, width-capped
		// container so they align with the centered chat content. The chat content
		// itself lives in a full-width container so its transcript list spans the
		// whole session view and its scrollbar stays pinned to the right edge; the
		// chat rows and input self-center at the same max-width via CSS.
		this._centeredContentContainer = $('.session-view-centered-content');
		this.element.appendChild(this._centeredContentContainer);

		this._header = this._register(scopedInstantiationService.createInstance(SessionHeader));
		this._centeredContentContainer.appendChild(this._header.element);

		this._compositeBar = this._register(scopedInstantiationService.createInstance(ChatCompositeBar));
		this._centeredContentContainer.appendChild(this._compositeBar.element);

		// Read-only status banner, shown flush below the tab bar (within the same
		// centered band) when the session's active chat is non-interactive, in
		// place of the composer which is hidden for read-only chats.
		this._readOnlyBanner = this._register(new SessionReadOnlyBanner());
		this._centeredContentContainer.appendChild(this._readOnlyBanner.domNode);
		this._register(autorun(reader => {
			const session = this._sessionObs.read(reader);
			const activeChat = session?.activeChat.read(reader);
			const readOnly = !!activeChat && activeChat.interactivity.read(reader) !== ChatInteractivity.Full;
			// Give an archived session an explanation specific to why it is
			// read-only, plus an inline "Restore" action; other read-only chats
			// (e.g. subagent transcripts) keep the generic message.
			if (readOnly) {
				const archived = !!session && session.isArchived.read(reader);
				if (archived && session) {
					this._readOnlyBanner.setContent({
						message: localize('sessionReadOnlyBanner.archived', "Archived sessions are read-only."),
						action: {
							label: localize('sessionReadOnlyBanner.restore', "Restore"),
							run: () => this.commandService.executeCommand(UNARCHIVE_SESSION_COMMAND_ID, session),
						},
					});
				} else {
					this._readOnlyBanner.setContent({ message: localize('sessionReadOnlyBanner.message', "This chat is read-only") });
				}
			}
			// Only re-layout when the banner's visibility (and thus its
			// contribution to `barHeight`) actually changes; toggling within the
			// same read-only state leaves the bar height unchanged. Re-layouts
			// needed for other reasons (e.g. the child chat view being swapped
			// when the active chat changes) are owned by the `openSession`
			// autorun, which calls `_layoutChildren` unconditionally.
			if (this._readOnlyBanner.visible !== readOnly) {
				this._readOnlyBanner.setVisible(readOnly);
				this._layoutChildren();
			}
		}));

		this._contentContainer = $('.session-view-content');
		this.element.appendChild(this._contentContainer);

		this._floatingToolbar = this._register(scopedInstantiationService.createInstance(SessionViewFloatingToolbar));
		this.element.appendChild(this._floatingToolbar.element);

		this._applyActiveSessionStyles();

		// Re-layout children when the header or composite bar changes visibility/height
		this._register(this._header.onDidChangeVisibility(() => this._layoutChildren()));
		this._register(this._header.onDidChangeHeight(() => this._layoutChildren()));
		this._register(this._compositeBar.onDidChangeVisibility(() => this._layoutChildren()));
		this._register(this._compositeBar.onDidChangeHeight(() => this._layoutChildren()));
	}

	openSession(session: IActiveSession | undefined, options: ISessionViewOptions): void {
		if (this._hasOpenedSession && this._currentSession === session) {
			return;
		}
		this._hasOpenedSession = true;
		this._currentSession = session;
		this._sessionObs.set(session, undefined);
		this._openSessionDisposables.clear();

		this._openSessionDisposables.add(this._handleContextKeys(session));

		this._openSessionDisposables.add(autorun(reader => {
			let desiredKind: ChatViewKind;
			if (session === undefined || session.isCreated.read(reader) === false) {
				desiredKind = 'newSession';
			} else if (session.activeChat.read(reader).status.read(reader) === SessionStatus.Untitled && session.activeChat.read(reader).interactivity.read(reader) === ChatInteractivity.Full) {
				desiredKind = 'newChatInSession';
			} else {
				desiredKind = 'chat';
			}

			let view = this._currentView.value;

			if (!view || view.kind !== desiredKind) {
				view = desiredKind === 'chat'
					? this.chatViewFactory.createChatView()
					: this.chatViewFactory.createNewChatView(desiredKind === 'newChatInSession', options);
				this._contentContainer.replaceChildren(view.element);
				this._currentView.value = view;
				view.setActive(this._isActive);
			}

			if (session) {
				view.setChat(session.activeChat.read(reader), session.sessionId);
			}

			this._header.setSession(session);
			this._compositeBar.setSession(session);
			this._floatingToolbar.setSession(session);
			this._layoutChildren();
		}));
	}

	private _handleContextKeys(session: IActiveSession | undefined): IDisposable {
		// A single autorun re-applies every session-derived context key on the
		// scoped service whenever the session's observable properties change.
		// Passing `undefined` resets the keys to their defaults.
		return autorun(reader => {
			setActiveSessionContextKeys(session, this._scopedContextKeyService, reader);
		});
	}

	layout(width: number, height: number, top: number, left: number): void {
		size(this.element, width, height);
		this._lastLayout = { width, height, top, left };
		this._layoutChildren();
	}

	private _layoutChildren(): void {
		if (!this._lastLayout) {
			return;
		}
		const { width, height, top, left } = this._lastLayout;

		// Apply the centered band's width first so the header and tabs wrap to
		// their final layout before we measure their combined height. Measuring
		// before the width is applied could read a stale (pre-cap) height and
		// cause a transient overlap until a later layout pass corrects it.
		const centeredWidth = Math.min(width, SessionView.CENTERED_CONTENT_MAX_WIDTH);
		this._centeredContentContainer.style.width = `${centeredWidth}px`;

		const headerHeight = this._header.visible ? this._header.height : 0;
		const tabsHeight = this._compositeBar.visible ? this._compositeBar.height : 0;
		const bannerHeight = this._readOnlyBanner.visible ? this._readOnlyBanner.domNode.offsetHeight : 0;
		const barHeight = headerHeight + tabsHeight + bannerHeight;

		// Cap the band's height to the header + tabs (it is horizontally centered
		// via CSS `margin: 0 auto`) so the full-width chat content sits below it.
		size(this._centeredContentContainer, centeredWidth, barHeight);

		// Lay out the chat content at full width so its scrollbar reaches the
		// right edge; the chat rows and input center themselves via CSS.
		this._currentView.value?.layout(width, height - barHeight, top + barHeight, left);
	}

	toJSON(): object {
		return { type: SessionView.TYPE };
	}

	focus(): void {
		this._currentView.value?.focus();
	}

	startTitleEditing(): void {
		this._header.startTitleEditing();
	}

	selectWorkspace(folderUri: URI, providerId?: string): void {
		this._currentView.value?.selectWorkspace(folderUri, providerId);
	}

	prefillInput(text: string): void {
		this._currentView.value?.prefillInput(text);
	}

	sendQuery(text: string): void {
		this._currentView.value?.sendQuery(text);
	}

	/**
	 * Attaches the given resources as context to the hosted chat view's input.
	 */
	attach(uris: URI[]): void {
		this._currentView.value?.attach(uris);
	}

	/**
	 * Updates the view's maximized context key so toolbars hosted within can react.
	 * Called by the owning {@link SessionsPart} when the grid's maximized view changes.
	 */
	setMaximized(maximized: boolean): void {
		this._sessionIsMaximizedKey.set(maximized);
	}

	/**
	 * Updates whether this view currently hosts the active session in the grid.
	 * Forwarded to the inner chat view so it can adjust its visual styling
	 * (e.g. dim the list background for inactive sessions).
	 */
	setActive(active: boolean): void {
		if (this._isActive === active) {
			return;
		}
		this._isActive = active;
		this._applyActiveSessionStyles();
		this._currentView.value?.setActive(active);
	}

	private _applyActiveSessionStyles(): void {
		const background = this._isActive ? SessionView.ACTIVE_BACKGROUND : SessionView.INACTIVE_BACKGROUND;
		const foreground = this._isActive ? SessionView.ACTIVE_FOREGROUND : SessionView.INACTIVE_FOREGROUND;
		this.element.style.setProperty('--session-view-background', background);
		this.element.style.setProperty('--session-view-foreground', foreground);
		this.element.style.setProperty('--part-background', background);
		this.element.style.setProperty('--part-foreground', foreground);
	}
}
