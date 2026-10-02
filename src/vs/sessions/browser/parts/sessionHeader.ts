/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../base/common/event.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import { IContextKey, IContextKeyService } from '../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService } from '../../../platform/instantiation/common/instantiation.js';
import { SessionToolbarShowsSessionContext } from '../../common/contextkeys.js';
import { IActiveSession } from '../../services/sessions/common/sessionsManagement.js';
import { SessionHeaderBar } from './sessionHeaderBar.js';

/**
 * Session-scoped header whose title follows the session's active chat.
 */
export class SessionHeader extends Disposable {

	private readonly _bar: SessionHeaderBar;
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
		this._toolbarShowsSessionKey = SessionToolbarShowsSessionContext.bindTo(contextKeyService);
		this._bar = this._register(instantiationService.createInstance(SessionHeaderBar));
	}

	setSession(session: IActiveSession | undefined): void {
		this._toolbarShowsSessionKey.set(!!session);
		this._bar.setContext(session ? { session, chat: session.activeChat } : undefined);
	}

	setVisible(visible: boolean): void {
		this._bar.setVisible(visible);
	}

	startTitleEditing(): boolean {
		return this._bar.startTitleEditing();
	}
}

export { SessionViewFloatingToolbar } from './sessionHeaderBar.js';
