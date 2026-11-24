/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { mainWindow } from '../../../../../base/browser/window.js';
import { IDisposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { constObservable, derived, IObservable, observableValue } from '../../../../../base/common/observable.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { createDecorator } from '../../../../../platform/instantiation/common/instantiation.js';
import { SessionHost, SessionHostKind } from '../../../../services/sessions/browser/sessionHost.js';
import { IChat, ISession } from '../../../../services/sessions/common/session.js';

/** A chat with its session, such as the one the active tab of the chat part shows. */
export interface IEditorWindowShownChat {
	readonly session: ISession;
	readonly chat: IChat;
}

export const IEditorWindowShownChatService = createDecorator<IEditorWindowShownChatService>('editorWindowShownChatService');

/** Options of a binding of {@link IEditorWindowShownChatService.bind}. */
export interface IEditorWindowShownChatBindOptions {
	/** Whether it shows its chat in place of those bound without it, such as the chat of the Chat view while chats open there. */
	readonly override?: boolean;
	/** Among bindings of the same kind, the higher one wins over those bound later; 0 by default. */
	readonly priority?: number;
}

/**
 * The chat that an editor window shows as its session host's, which features bind: such as the active tab of the chat part,
 * or, in its place, the chat of the Chat view. The bindings stack: one bound to override wins over the others, and among
 * equals the one bound last; disposing one shows the one it was bound over again.
 */
export interface IEditorWindowShownChatService {
	readonly _serviceBrand: undefined;
	/** The chat that the winning binding names, if any. */
	readonly shown: IObservable<IEditorWindowShownChat | undefined>;
	/** Shows the chat `shown` names while this binding wins, until the returned disposable is disposed. */
	bind(shown: IObservable<IEditorWindowShownChat | undefined>, options?: IEditorWindowShownChatBindOptions): IDisposable;
}

export class EditorWindowShownChatService implements IEditorWindowShownChatService {

	declare readonly _serviceBrand: undefined;

	/** One per call of {@link bind}, in the order bound. */
	private readonly _bindings = observableValue<readonly { readonly shown: IObservable<IEditorWindowShownChat | undefined>; readonly override: boolean; readonly priority: number }[]>(this, []);

	readonly shown: IObservable<IEditorWindowShownChat | undefined> = derived(this, reader => {
		const bindings = this._bindings.read(reader);
		const winner = bindings.reduce<typeof bindings[number] | undefined>((best, binding) => !best || Number(binding.override) > Number(best.override) || (binding.override === best.override && binding.priority >= best.priority) ? binding : best, undefined);
		return winner?.shown.read(reader);
	});

	bind(shown: IObservable<IEditorWindowShownChat | undefined>, options?: IEditorWindowShownChatBindOptions): IDisposable {
		const binding = { shown, override: !!options?.override, priority: options?.priority ?? 0 };
		this._bindings.set([...this._bindings.get(), binding], undefined);
		return toDisposable(() => this._bindings.set(this._bindings.get().filter(candidate => candidate !== binding), undefined));
	}
}

/**
 * The session host of an editor window, as the service `ISessionHost` of the window: it shows the chat that features bind
 * (see {@link IEditorWindowShownChatService}), such as that of the active tab of the chat part. What the editors of the
 * editor area show of a session, such as the Changes editor that the pills of a chat open, is of that chat. Until a feature
 * binds one, it shows nothing and does nothing: it only derives what it shows from what is bound.
 */
export class EditorWindowMainSessionHost extends SessionHost {

	constructor(
		@IContextKeyService contextKeyService: IContextKeyService,
		@IEditorWindowShownChatService shownChatService: IEditorWindowShownChatService,
	) {
		super({
			kind: SessionHostKind.MainWindow,
			parent: undefined,
			session: derived(reader => shownChatService.shown.read(reader)?.session),
			chat: derived(reader => shownChatService.shown.read(reader)?.chat),
			contextKeyService,
			windowId: constObservable(mainWindow.vscodeWindowId),
		});
	}
}
