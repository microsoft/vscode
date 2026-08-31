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
import { ServiceCollection } from '../../../platform/instantiation/common/serviceCollection.js';
import { IContextKey, IContextKeyService } from '../../../platform/contextkey/common/contextkey.js';
import { IThemeService } from '../../../platform/theme/common/themeService.js';
import { IActiveSession } from '../../services/sessions/common/sessionsManagement.js';
import { AbstractChatView, IChatViewOptions } from './chatView.js';
import { ChatGroupsView } from './chatGroupsView.js';
import { SessionHeader, SessionViewFloatingToolbar } from './sessionHeader.js';
import { ISessionContext, SessionContext } from '../../services/sessions/browser/sessionContext.js';
import { autorun, observableValue } from '../../../base/common/observable.js';
import { SessionIsMaximizedContext } from '../../common/contextkeys.js';
import { AGENTS_CENTERED_CONTENT_MAX_WIDTH } from '../../common/layoutConstants.js';
import { setActiveSessionContextKeys } from '../../services/sessions/common/sessionContextKeys.js';
import { ISessionChangesStatsCache } from '../../services/sessions/common/sessionChangesStatsCache.js';
import { applySessionViewThemeColors } from './sessionBarStyles.js';
import { IChatViewFactory } from '../../services/chatView/browser/chatViewFactory.js';

/**
 * Options passed to {@link SessionView.openSession}. Extends the chat view
 * options so they can be forwarded to the new-chat views the host creates.
 */
export interface ISessionViewOptions extends IChatViewOptions { }

/**
 * A stable single-slot grid leaf for the Sessions Part. `SessionsPart`
 * delegates `openSession(...)` to this host so it no longer needs to remove/add
 * grid views as the bound session changes.
 *
 * Hosts the {@link SessionHeader} (centered, width-capped) above a
 * {@link ChatGroupsView} that renders the session's chats as a grid of groups.
 */
export class SessionView extends Disposable implements ISerializableView {

	static readonly TYPE = 'sessions.sessionView';
	private static readonly CENTERED_CONTENT_MAX_WIDTH = AGENTS_CENTERED_CONTENT_MAX_WIDTH;

	readonly element: HTMLElement = $('.session-view.modern-ui-editor-tab-group');

	readonly minimumWidth = 200;
	readonly maximumWidth = Number.POSITIVE_INFINITY;
	readonly minimumHeight = 200;
	readonly maximumHeight = Number.POSITIVE_INFINITY;

	private readonly _onDidChange = this._register(new Emitter<IViewSize | undefined>());
	readonly onDidChange: Event<IViewSize | undefined> = this._onDidChange.event;

	private readonly _header: SessionHeader;
	private readonly _groupsView: ChatGroupsView;
	private readonly _standaloneView = this._register(new MutableDisposable<AbstractChatView>());
	private readonly _floatingToolbar: SessionViewFloatingToolbar;
	private readonly _centeredContentContainer: HTMLElement;
	private readonly _contentContainer: HTMLElement;

	private _lastLayout: { readonly width: number; readonly height: number; readonly top: number; readonly left: number } | undefined;

	private _openSessionDisposables = this._register(new DisposableStore());
	private _currentSession: IActiveSession | undefined;
	private _hasOpenedSession = false;

	private readonly _sessionIsMaximizedKey: IContextKey<boolean>;
	private readonly _scopedContextKeyService: IContextKeyService;

	/** Whether the hosted groups view currently shows a grid (more than one group). */
	private _isGridLayout = false;

	/** Whether this view currently hosts the active session in the grid. */
	private _isActive = true;

	/** Whether the owning {@link SessionsPart} is visible in the workbench grid. */
	private _isPartVisible = true;

	/** Whether this leaf is visible within the part's internal grid. */
	private _isLeafVisible = true;

	private readonly _sessionObs = observableValue<IActiveSession | undefined>(this, undefined);

	constructor(
		@IChatViewFactory private readonly _chatViewFactory: IChatViewFactory,
		@IInstantiationService instantiationService: IInstantiationService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IThemeService private readonly themeService: IThemeService,
		@ISessionChangesStatsCache private readonly _changesStatsCache: ISessionChangesStatsCache,
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

		// The header is hosted in a centered, width-capped container so it aligns
		// with the centered chat content. The chat groups grid lives in a
		// full-width container below it so its transcript list spans the whole
		// session view and its scrollbar stays pinned to the right edge; the chat
		// rows and input self-center at the same max-width via CSS.
		this._centeredContentContainer = $('.session-view-centered-content');
		this.element.appendChild(this._centeredContentContainer);

		this._header = this._register(scopedInstantiationService.createInstance(SessionHeader));
		this._centeredContentContainer.appendChild(this._header.element);

		this._contentContainer = $('.session-view-content');
		this.element.appendChild(this._contentContainer);

		this._groupsView = this._register(scopedInstantiationService.createInstance(ChatGroupsView));
		this._contentContainer.appendChild(this._groupsView.element);

		this._floatingToolbar = this._register(scopedInstantiationService.createInstance(SessionViewFloatingToolbar));
		this.element.appendChild(this._floatingToolbar.element);

		this._applyActiveSessionStyles();
		this._register(this.themeService.onDidColorThemeChange(() => this._applyActiveSessionStyles()));

		// Re-layout children when the header changes visibility/height
		this._register(this._header.onDidChangeVisibility(() => this._layoutChildren()));
		this._register(this._header.onDidChangeHeight(() => this._layoutChildren()));

		// When the session shows a grid of chats (more than one group), let the
		// header span the full width too; with a lone group it stays centered.
		this._register(autorun(reader => {
			const isGridLayout = this._groupsView.groupCount.read(reader) > 1;
			if (this._isGridLayout === isGridLayout) {
				return;
			}
			this._isGridLayout = isGridLayout;
			this.element.classList.toggle('grid-layout', isGridLayout);
			this._layoutChildren();
		}));

		this._register(autorun(reader => {
			const session = this._sessionObs.read(reader);
			const tabsReplaceHeader = this._groupsView.groupCount.read(reader) === 1
				&& (session?.isCreated.read(reader) ?? false)
				&& (session?.shouldShowChatTabs.read(reader) ?? false);
			this._header.setVisible(!tabsReplaceHeader);
			this._groupsView.setSingleGroupTabsReplaceHeader(tabsReplaceHeader);
			this.element.classList.toggle('tabs-replace-header', tabsReplaceHeader);
		}));
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

		this._header.setSession(session);
		if (session && !session.isCreated.get()) {
			this._groupsView.setSession(undefined, options);
			let view = this._standaloneView.value;
			if (!view || view.kind !== 'newSession') {
				view = this._chatViewFactory.createNewChatView(false, options);
				this._standaloneView.value = view;
			}
			if (view.element.parentElement !== this._contentContainer) {
				this._contentContainer.replaceChildren(view.element);
			}
			view.setActive(this._isActive);
			view.setVisible(this._isVisible);
			this._openSessionDisposables.add(autorun(reader => {
				if (session.isCreated.read(reader) && this._currentSession === session) {
					this._showSessionGroups(session, options);
				}
			}));
		} else if (session) {
			this._showSessionGroups(session, options);
		} else {
			this._groupsView.setSession(undefined, options);
			const view = this._chatViewFactory.createNewChatView(false, options);
			this._standaloneView.value = view;
			this._contentContainer.replaceChildren(view.element);
			view.setActive(this._isActive);
			view.setVisible(this._isVisible);
		}
		this._floatingToolbar.setSession(session);
		this._layoutChildren();
	}

	private _showSessionGroups(session: IActiveSession, options: ISessionViewOptions): void {
		this._standaloneView.clear();
		this._contentContainer.replaceChildren(this._groupsView.element);
		this._groupsView.setSession(session, options);
		this._layoutChildren();
	}

	private _handleContextKeys(session: IActiveSession | undefined): IDisposable {
		// A single autorun re-applies every session-derived context key on the
		// scoped service whenever the session's observable properties change.
		// Passing `undefined` resets the keys to their defaults.
		return autorun(reader => {
			setActiveSessionContextKeys(session, this._scopedContextKeyService, reader, this._changesStatsCache);
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

		// A hidden or zero-sized leaf would report invalid geometry to the chat widget.
		const { width, height, top, left } = this._lastLayout;
		if (!this._isVisible || width === 0 || height === 0) {
			return;
		}

		// Apply the centered band's width first so the header wraps to its final
		// layout before we measure its height. Measuring before the width is
		// applied could read a stale (pre-cap) height and cause a transient
		// overlap until a later layout pass corrects it.
		// In a grid layout the header spans the full width (matching the
		// full-width chat groups); with a lone group it is centered and capped.
		const centeredWidth = this._isGridLayout ? width : Math.min(width, SessionView.CENTERED_CONTENT_MAX_WIDTH);
		this._centeredContentContainer.style.width = `${centeredWidth}px`;

		const barHeight = this._header.visible ? this._header.height : 0;

		// Cap the band's height to the header (it is horizontally centered via CSS
		// `margin: 0 auto`) so the full-width chat groups grid sits below it.
		size(this._centeredContentContainer, centeredWidth, barHeight);

		// Lay out the chat groups grid at full width so its scrollbar reaches the
		// right edge; the chat rows and input center themselves via CSS.
		const contentHeight = height - barHeight;
		const contentTop = top + barHeight;
		const standaloneView = this._standaloneView.value;
		if (standaloneView) {
			standaloneView.layout(width, contentHeight, contentTop, left);
		} else {
			this._groupsView.layout(width, contentHeight, contentTop, left);
		}
	}

	toJSON(): object {
		return { type: SessionView.TYPE };
	}

	focus(): void {
		const standaloneView = this._standaloneView.value;
		standaloneView ? standaloneView.focus() : this._groupsView.focus();
	}

	/**
	 * Starts an inline rename of the session title in the header. Returns
	 * `false` when the header cannot host it (e.g. this view is hidden or the
	 * chat tabs row replaces the header) so callers can fall back to another
	 * rename affordance.
	 */
	startTitleEditing(): boolean {
		return this._isVisible && this._header.startTitleEditing();
	}

	selectWorkspace(folderUri: URI, providerId?: string): void {
		const standaloneView = this._standaloneView.value;
		standaloneView ? standaloneView.selectWorkspace(folderUri, providerId) : this._groupsView.selectWorkspace(folderUri, providerId);
	}

	/** Opens the given chat in a group beside the active one ("open to the side"). */
	openChatToSide(resource: URI): Promise<void> {
		return this._groupsView.openChatInNewGroup(resource);
	}

	/** Places a freshly created chat (e.g. a side chat) into its own group beside the current one. */
	splitChatToSide(resource: URI): void {
		this._groupsView.splitChatToSide(resource);
	}

	focusAdjacentChatGroup(direction: 'previous' | 'next'): void {
		this._groupsView.focusAdjacentGroup(direction);
	}

	splitActiveChat(direction: 'right' | 'bottom'): void {
		this._groupsView.splitActiveChat(direction);
	}

	moveActiveChatToAdjacentGroup(direction: 'previous' | 'next'): void {
		this._groupsView.moveActiveChatToAdjacentGroup(direction);
	}

	prefillInput(text: string): void {
		const standaloneView = this._standaloneView.value;
		standaloneView ? standaloneView.prefillInput(text) : this._groupsView.prefillInput(text);
	}

	sendQuery(text: string): void {
		const standaloneView = this._standaloneView.value;
		standaloneView ? standaloneView.sendQuery(text) : this._groupsView.sendQuery(text);
	}

	submitInput(): Promise<boolean> {
		return this._standaloneView.value?.submitInput() ?? this._groupsView.submitInput();
	}

	/**
	 * Attaches the given resources as context to the active chat group's input.
	 */
	attach(uris: URI[]): void {
		const standaloneView = this._standaloneView.value;
		standaloneView ? standaloneView.attach(uris) : this._groupsView.attach(uris);
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
		this._groupsView.setSessionActive(active);
		this._standaloneView.value?.setActive(active);
	}

	/**
	 * Grid hook invoked by the part's internal split view when this leaf is
	 * hidden or shown (e.g. when a sibling session is maximized).
	 */
	setVisible(visible: boolean): void {
		if (this._isLeafVisible === visible) {
			return;
		}
		const wasVisible = this._isVisible;
		this._isLeafVisible = visible;
		this._updateVisibility(wasVisible);
	}

	/**
	 * Called by the owning {@link SessionsPart} when the part itself is hidden or
	 * shown in the workbench grid. Combined with this leaf's own visibility to
	 * form the view's effective visibility.
	 */
	setPartVisible(visible: boolean): void {
		if (this._isPartVisible === visible) {
			return;
		}
		const wasVisible = this._isVisible;
		this._isPartVisible = visible;
		this._updateVisibility(wasVisible);
	}

	/**
	 * Whether this view is actually shown. Unrelated to {@link setActive}:
	 * inactive sessions shown side by side are still visible.
	 */
	private get _isVisible(): boolean {
		return this._isPartVisible && this._isLeafVisible;
	}

	private _updateVisibility(wasVisible: boolean): void {
		const visible = this._isVisible;
		if (visible === wasVisible) {
			return;
		}
		this._groupsView.setSessionVisible(visible);
		this._standaloneView.value?.setVisible(visible);
		if (visible) {
			// Catch up on the layout passes that were skipped while hidden.
			this._layoutChildren();
		}
	}

	private _applyActiveSessionStyles(): void {
		this.element.classList.toggle('modern-ui-editor-tab-group-active', this._isActive);
		applySessionViewThemeColors(this.element, this.themeService.getColorTheme(), this._isActive);
	}
}
