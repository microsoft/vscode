/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../base/common/event.js';
import { Disposable, DisposableStore } from '../../../base/common/lifecycle.js';
import { autorun } from '../../../base/common/observable.js';
import { isEqual } from '../../../base/common/resources.js';
import { IContextKey, IContextKeyService } from '../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService } from '../../../platform/instantiation/common/instantiation.js';
import { SessionHeaderTargetsChatContext, SessionToolbarShowsSessionContext } from '../../common/contextkeys.js';
import { IActiveSession } from '../../services/sessions/common/sessionsManagement.js';
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
	get visible(): boolean { return this._bar.visible; }
	get height(): number { return this._bar.height; }
	get onDidChangeVisibility(): Event<boolean> { return this._bar.onDidChangeVisibility; }
	get onDidChangeHeight(): Event<void> { return this._bar.onDidChangeHeight; }

	constructor(
		@IInstantiationService instantiationService: IInstantiationService,
		@IContextKeyService contextKeyService: IContextKeyService,
	) {
		super();
		this._headerTargetsChatKey = SessionHeaderTargetsChatContext.bindTo(contextKeyService);
		this._toolbarShowsSessionKey = SessionToolbarShowsSessionContext.bindTo(contextKeyService);
		this._bar = this._register(instantiationService.createInstance(SessionHeaderBar));
	}

	setSession(session: IActiveSession | undefined): void {
		this._sessionDisposables.clear();
		if (!session) {
			this._headerTargetsChatKey.reset();
			this._toolbarShowsSessionKey.reset();
			this._bar.setContext(undefined);
			return;
		}
		this._sessionDisposables.add(autorun(reader => {
			const activeChat = session.activeChat.read(reader);
			const targetsChat = !!activeChat && !isEqual(activeChat.resource, session.mainChat.read(reader).resource);
			this._headerTargetsChatKey.set(targetsChat);
			this._toolbarShowsSessionKey.set(true);
			this._bar.setContext({
				session,
				chat: session.activeChat,
				actionsTargetChat: targetsChat,
			});
		}));
	}

	setVisible(visible: boolean): void {
		this._bar.setVisible(visible);
	}

	startTitleEditing(): boolean {
		return this._bar.startTitleEditing();
	}
}

export { SessionViewFloatingToolbar } from './sessionHeaderBar.js';
