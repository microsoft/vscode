/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/sessionView.css';
import { $, isAncestor, size } from '../../../base/browser/dom.js';
import { ISerializableView, IViewSize } from '../../../base/browser/ui/grid/grid.js';
import { disposableTimeout } from '../../../base/common/async.js';
import { Emitter, Event } from '../../../base/common/event.js';
import { Disposable, DisposableStore, IDisposable, MutableDisposable } from '../../../base/common/lifecycle.js';
import { URI } from '../../../base/common/uri.js';
import { IInstantiationService } from '../../../platform/instantiation/common/instantiation.js';
import { ServiceCollection } from '../../../platform/instantiation/common/serviceCollection.js';
import { IContextKey, IContextKeyService } from '../../../platform/contextkey/common/contextkey.js';
import { asCssVariable } from '../../../platform/theme/common/colorUtils.js';
import { IActiveSession } from '../../services/sessions/common/sessionsManagement.js';
import { IChatViewFactory } from '../../services/chatView/browser/chatViewFactory.js';
import { AbstractChatView, ChatViewKind } from './chatView.js';
import { ChatCompositeBar, SessionViewFloatingToolbar } from './chatCompositeBar.js';
import { autorun } from '../../../base/common/observable.js';
import { SessionIsCreatedContext, SessionIsMaximizedContext, SessionIsStickyContext, SessionSupportsMultipleChatsContext } from '../../common/contextkeys.js';
import { activeSessionViewBackground, activeSessionViewForeground, inactiveSessionViewBackground, inactiveSessionViewForeground } from '../../common/theme.js';
import { SessionStatus } from '../../services/sessions/common/session.js';

/**
 * A stable single-slot grid leaf that handles switching between concrete
 * chat views internally. `SessionsPart` delegates `openSession(...)` to
 * this host so it no longer needs to remove/add grid views when the active
 * chat view kind changes.
 *
 * Also hosts the {@link ChatCompositeBar} so that the bar lives alongside
 * the chat view it relates to.
 */
export class SessionView extends Disposable implements ISerializableView {

	static readonly TYPE = 'sessions.sessionView';
	private static readonly ACTIVE_BACKGROUND = asCssVariable(activeSessionViewBackground);
	private static readonly ACTIVE_FOREGROUND = asCssVariable(activeSessionViewForeground);
	private static readonly INACTIVE_BACKGROUND = asCssVariable(inactiveSessionViewBackground);
	private static readonly INACTIVE_FOREGROUND = asCssVariable(inactiveSessionViewForeground);

	/** Height of the chat composite bar when visible. */
	private static readonly BAR_HEIGHT = 35;

	/**
	 * Delay (ms) before revealing the focus border / focusing the chat input of a
	 * newly active session. Slightly longer than the input fade-in (the `opacity`
	 * transitions in `sessionView.css` run at 0.15s) so the focus border is only
	 * revealed once the fade has reliably finished, avoiding a flash.
	 */
	private static readonly SESSION_VIEW_FADE_IN_MS = 200;

	/**
	 * Extra delay (ms) added to the `activating` suppression beyond the deferred
	 * focus so the suppression class is still present at the moment `focus()` runs
	 * and the focus border lands. Without this buffer both timers would fire on the
	 * same tick and — because the suppression is armed first — its removal would
	 * run before the focus, briefly re-introducing the border flash.
	 */
	private static readonly ACTIVATING_FOCUS_BUFFER_MS = 16;

	readonly element: HTMLElement = $('.session-view');

	readonly minimumWidth = 200;
	readonly maximumWidth = Number.POSITIVE_INFINITY;
	readonly minimumHeight = 200;
	readonly maximumHeight = Number.POSITIVE_INFINITY;

	private readonly _onDidChange = this._register(new Emitter<IViewSize | undefined>());
	readonly onDidChange: Event<IViewSize | undefined> = this._onDidChange.event;

	private readonly _compositeBar: ChatCompositeBar;
	private readonly _floatingToolbar: SessionViewFloatingToolbar;
	private readonly _contentContainer: HTMLElement;

	private readonly _currentView = this._register(new MutableDisposable<AbstractChatView>());
	private _lastLayout: { readonly width: number; readonly height: number; readonly top: number; readonly left: number } | undefined;

	private _openSessionDisposables = this._register(new DisposableStore());
	private _currentSession: IActiveSession | undefined;
	private _hasOpenedSession = false;

	private readonly _sessionIsCreatedKey: IContextKey<boolean>;
	private readonly _sessionIsStickyKey: IContextKey<boolean>;
	private readonly _sessionIsMaximizedKey: IContextKey<boolean>;
	private readonly _sessionSupportsMultipleChatsKey: IContextKey<boolean>;

	/** Whether this view currently hosts the active session in the grid. */
	private _isActive = true;

	/** Holds the pending work that drives the inactive→active fade-in animation. */
	private readonly _pendingActivation = this._register(new MutableDisposable<DisposableStore>());

	constructor(
		@IChatViewFactory private readonly chatViewFactory: IChatViewFactory,
		@IInstantiationService instantiationService: IInstantiationService,
		@IContextKeyService contextKeyService: IContextKeyService,
	) {
		super();

		// Scoped context key service so toolbars hosted within can react to
		// session-specific context keys (e.g. sessionIsCreated, sessionIsSticky).
		const scopedContextKeyService = this._register(contextKeyService.createScoped(this.element));
		this._sessionIsCreatedKey = SessionIsCreatedContext.bindTo(scopedContextKeyService);
		this._sessionIsStickyKey = SessionIsStickyContext.bindTo(scopedContextKeyService);
		this._sessionIsMaximizedKey = SessionIsMaximizedContext.bindTo(scopedContextKeyService);
		this._sessionSupportsMultipleChatsKey = SessionSupportsMultipleChatsContext.bindTo(scopedContextKeyService);

		const scopedInstantiationService = this._register(instantiationService.createChild(new ServiceCollection([IContextKeyService, scopedContextKeyService])));

		this._compositeBar = this._register(scopedInstantiationService.createInstance(ChatCompositeBar));
		this.element.appendChild(this._compositeBar.element);

		this._contentContainer = $('.session-view-content');
		this.element.appendChild(this._contentContainer);

		this._floatingToolbar = this._register(scopedInstantiationService.createInstance(SessionViewFloatingToolbar));
		this.element.appendChild(this._floatingToolbar.element);

		this._applyActiveSessionStyles();

		// Re-layout children when the composite bar becomes visible/hidden
		this._register(this._compositeBar.onDidChangeVisibility(() => this._layoutChildren()));
	}

	openSession(session: IActiveSession | undefined): void {
		if (this._hasOpenedSession && this._currentSession === session) {
			return;
		}
		this._hasOpenedSession = true;
		this._currentSession = session;
		this._openSessionDisposables.clear();

		this._openSessionDisposables.add(this._handleContextKeys(session));

		this._openSessionDisposables.add(autorun(reader => {
			let desiredKind: ChatViewKind;
			if (session === undefined || session.isCreated.read(reader) === false) {
				desiredKind = 'newSession';
			} else if (session.activeChat.read(reader).status.read(reader) === SessionStatus.Untitled) {
				desiredKind = 'newChatInSession';
			} else {
				desiredKind = 'chat';
			}

			let view = this._currentView.value;

			if (!view || view.kind !== desiredKind) {
				view = desiredKind === 'chat'
					? this.chatViewFactory.createChatView()
					: this.chatViewFactory.createNewChatView(desiredKind === 'newChatInSession');
				this._contentContainer.replaceChildren(view.element);
				this._currentView.value = view;
				view.setActive(this._isActive);
			}

			if (session) {
				view.setChat(session.activeChat.read(reader));
			}

			this._compositeBar.setSession(session);
			this._floatingToolbar.setSession(session);
			this._layoutChildren();
		}));
	}

	private _handleContextKeys(session: IActiveSession | undefined): IDisposable {
		if (!session) {
			this._sessionIsCreatedKey.set(false);
			this._sessionIsStickyKey.set(false);
			this._sessionSupportsMultipleChatsKey.set(false);
			return Disposable.None;
		}

		const disposables = new DisposableStore();
		disposables.add(autorun(reader => {
			this._sessionIsCreatedKey.set(session.isCreated.read(reader));
		}));

		disposables.add(autorun(reader => {
			this._sessionIsStickyKey.set(session.sticky.read(reader));
		}));

		this._sessionSupportsMultipleChatsKey.set(session.capabilities.supportsMultipleChats);

		return disposables;
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
		const barHeight = this._compositeBar.visible ? SessionView.BAR_HEIGHT : 0;
		this._currentView.value?.layout(width, height - barHeight, top + barHeight, left);
	}

	toJSON(): object {
		return { type: SessionView.TYPE };
	}

	focus(): void {
		this._currentView.value?.focus();
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
	 * Updates the view's maximized context key so toolbars hosted within can react.
	 * Called by the owning {@link SessionsPart} when the grid's maximized view changes.
	 */
	setMaximized(maximized: boolean): void {
		this._sessionIsMaximizedKey.set(maximized);
	}

	/** Whether this view currently hosts the active session in the grid. */
	get isActive(): boolean { return this._isActive; }

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

	/**
	 * Marks this view as `activating` for the duration of the chat input fade-in
	 * that runs when a session is promoted to active (see the `is-active` opacity
	 * transitions in `sessionView.css`). While the class is present the CSS
	 * suppresses the chat input's focus border so it does not flash around the
	 * still-fading placeholder/editor.
	 *
	 * When {@link focusAfterFade} is `true`, the chat input is also focused once
	 * the fade has settled — skipped if focus has moved elsewhere in the
	 * workbench before the timer fires, so we never steal focus from outside the
	 * sessions area.
	 *
	 * Replaces any previously armed activation on this view.
	 */
	beginActivation(focusAfterFade: boolean): void {
		this.element.classList.add('activating');
		const store = new DisposableStore();
		if (focusAfterFade) {
			store.add(disposableTimeout(() => {
				const activeElement = this.element.ownerDocument.activeElement;
				if (activeElement && !isAncestor(activeElement, this.element)) {
					return;
				}
				this.focus();
			}, SessionView.SESSION_VIEW_FADE_IN_MS));
		}
		store.add(disposableTimeout(
			() => this.element.classList.remove('activating'),
			SessionView.SESSION_VIEW_FADE_IN_MS + SessionView.ACTIVATING_FOCUS_BUFFER_MS
		));
		this._pendingActivation.value = store;
	}

	private _applyActiveSessionStyles(): void {
		this.element.classList.toggle('is-active', this._isActive);
		const background = this._isActive ? SessionView.ACTIVE_BACKGROUND : SessionView.INACTIVE_BACKGROUND;
		const foreground = this._isActive ? SessionView.ACTIVE_FOREGROUND : SessionView.INACTIVE_FOREGROUND;
		this.element.style.setProperty('--session-view-background', background);
		this.element.style.setProperty('--session-view-foreground', foreground);
		this.element.style.setProperty('--part-background', background);
		this.element.style.setProperty('--part-foreground', foreground);
	}
}
