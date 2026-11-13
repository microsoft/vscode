/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../../../base/common/event.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { IObservable } from '../../../../../base/common/observable.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { IChat, ISession } from '../../../../services/sessions/common/session.js';
import { SessionHeaderBar } from './sessionHeaderBar.js';

export interface IChatHeaderContext {
	readonly session: ISession;
	readonly chat: IObservable<IChat | undefined>;
	/** Whether the header is of a pane that shows one chat of its session apart from its slot, such as a detached pane. */
	readonly isDetached: boolean;
	readonly activate: () => void;
	readonly close: () => void;
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
		this._bar = this._register(instantiationService.createInstance(SessionHeaderBar, undefined));
	}

	setChat(context: IChatHeaderContext | undefined): void {
		this._bar.setContext(context ? {
			session: context.session,
			chat: context.chat,
			isDetached: context.isDetached,
			actionsTargetChat: true,
			showParentContext: true,
			activateChatGroup: context.activate,
			closeSession: context.close,
		} : undefined);
	}

	setVisible(visible: boolean): void {
		this._bar.setVisible(visible);
	}
}
