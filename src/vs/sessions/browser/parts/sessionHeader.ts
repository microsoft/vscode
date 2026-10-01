/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../base/common/event.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import { IInstantiationService } from '../../../platform/instantiation/common/instantiation.js';
import { IActiveSession } from '../../services/sessions/common/sessionsManagement.js';
import { SessionHeaderBar } from './sessionHeaderBar.js';

/**
 * Session-scoped header whose title follows the session's active chat.
 */
export class SessionHeader extends Disposable {

	private readonly _bar: SessionHeaderBar;

	get element(): HTMLElement { return this._bar.element; }
	get visible(): boolean { return this._bar.visible; }
	get height(): number { return this._bar.height; }
	get onDidChangeVisibility(): Event<boolean> { return this._bar.onDidChangeVisibility; }
	get onDidChangeHeight(): Event<void> { return this._bar.onDidChangeHeight; }

	constructor(
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		super();
		this._bar = this._register(instantiationService.createInstance(SessionHeaderBar));
	}

	setSession(session: IActiveSession | undefined): void {
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
