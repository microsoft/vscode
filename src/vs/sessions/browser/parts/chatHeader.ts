/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../base/common/event.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import { IObservable } from '../../../base/common/observable.js';
import { IInstantiationService } from '../../../platform/instantiation/common/instantiation.js';
import { IActiveSession } from '../../services/sessions/common/sessionsManagement.js';
import { IChat } from '../../services/sessions/common/session.js';
import { SessionHeaderBar } from './sessionHeaderBar.js';

export interface IChatHeaderContext {
	readonly session: IActiveSession;
	readonly chat: IObservable<IChat | undefined>;
	readonly activate: () => void;
}

/**
 * Header for one chat group. Its title and actions target that group's chat.
 */
export class ChatHeader extends Disposable {

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
		this._bar.element.draggable = false;
	}

	setChat(context: IChatHeaderContext | undefined): void {
		this._bar.setContext(context ? {
			session: context.session,
			chat: context.chat,
			actionsTargetChat: true,
			activateChatGroup: context.activate,
		} : undefined);
	}

	setVisible(visible: boolean): void {
		this._bar.setVisible(visible);
	}
}
