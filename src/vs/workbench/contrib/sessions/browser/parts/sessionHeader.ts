/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../../../base/common/event.js';
import { Disposable, DisposableStore } from '../../../../../base/common/lifecycle.js';
import { autorun } from '../../../../../base/common/observable.js';
import { isEqual } from '../../../../../base/common/resources.js';
import { IContextKey, IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { SessionHeaderTargetsChatContext, SessionToolbarShowsSessionContext } from '../../common/contextkeys.js';
import { IActiveSession, ISessionPaneContent } from '../../common/sessionsManagement.js';
import { isSessionPaneContent, paneContentOf } from '../visibleSessions.js';
import { ISessionsService } from '../sessionsService.js';
import { SessionHeaderBar } from './sessionHeaderBar.js';

/**
 * Session-scoped header whose title follows the session's active chat.
 */
export class SessionHeader extends Disposable {

	private readonly _bar: SessionHeaderBar;
	private readonly _sessionDisposables = this._register(new DisposableStore());
	private readonly _headerTargetsChatKey: IContextKey<boolean>;
	private readonly _toolbarShowsSessionKey: IContextKey<boolean>;

	get element(): HTMLElement { return this._bar.element; }
	get titleElement(): HTMLElement { return this._bar.titleElement; }
	get visible(): boolean { return this._bar.visible; }
	get height(): number { return this._bar.height; }
	get onDidChangeVisibility(): Event<boolean> { return this._bar.onDidChangeVisibility; }
	get onDidChangeHeight(): Event<void> { return this._bar.onDidChangeHeight; }

	constructor(
		@IInstantiationService instantiationService: IInstantiationService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@ISessionsService private readonly _sessionsService: ISessionsService,
	) {
		super();
		this._headerTargetsChatKey = SessionHeaderTargetsChatContext.bindTo(contextKeyService);
		this._toolbarShowsSessionKey = SessionToolbarShowsSessionContext.bindTo(contextKeyService);
		this._bar = this._register(instantiationService.createInstance(SessionHeaderBar, undefined));
	}

	/**
	 * Shows the session of a pane, its chat and its state. A view of a session in a pane is taken as its content, closed
	 * through {@link ISessionsService.closeSession} (transitional).
	 */
	setSession(input: ISessionPaneContent | IActiveSession | undefined): void {
		this._sessionDisposables.clear();
		if (!input) {
			this._headerTargetsChatKey.reset();
			this._toolbarShowsSessionKey.reset();
			this._bar.setContext(undefined);
			return;
		}
		const content = isSessionPaneContent(input) ? input : paneContentOf(input, () => this._sessionsService.closeSession(input));
		const { session, chat } = content;
		const closeSession = () => content.close();
		this._sessionDisposables.add(autorun(reader => {
			const activeChat = chat.read(reader);
			const targetsChat = !!activeChat && !isEqual(activeChat.resource, session.mainChat.read(reader).resource);
			this._headerTargetsChatKey.set(targetsChat);
			this._toolbarShowsSessionKey.set(true);
			this._bar.setContext({
				session,
				chat,
				isDetached: content.state.isDetached,
				actionsTargetChat: targetsChat,
				closeSession,
			});
		}));
	}

	/** See {@link SessionHeaderBar.setDragsEditor}. */
	setDragsEditor(dragsEditor: boolean): void {
		this._bar.setDragsEditor(dragsEditor);
	}

	setVisible(visible: boolean): void {
		this._bar.setVisible(visible);
	}

	startTitleEditing(): boolean {
		return this._bar.startTitleEditing();
	}
}

export { SessionViewFloatingToolbar } from './sessionHeaderBar.js';
