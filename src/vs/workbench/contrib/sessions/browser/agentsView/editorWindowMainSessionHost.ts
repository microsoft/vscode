/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { mainWindow } from '../../../../../base/browser/window.js';
import { IDisposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { constObservable, derived, IObservable, ISettableObservable, observableValue } from '../../../../../base/common/observable.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { SessionHost, SessionHostKind } from '../../../../services/sessions/browser/sessionHost.js';
import { IChat, ISession } from '../../../../services/sessions/common/session.js';

/** A chat with its session, such as the one the active tab of the chat part shows. */
export interface IEditorWindowShownChat {
	readonly session: ISession;
	readonly chat: IChat;
}

/**
 * The session host of an editor window, as the service `ISessionHost` of the window: it shows the chat that a feature binds
 * (see {@link bindShownChat}), such as that of the active tab of the chat part. What the editors of the editor area show of
 * a session, such as the Changes editor that the pills of a chat open, is of that chat. Until a feature binds one, it shows
 * nothing and does nothing: it only derives what it shows from what is bound.
 */
export class EditorWindowMainSessionHost extends SessionHost {

	private readonly _shown: ISettableObservable<IObservable<IEditorWindowShownChat | undefined> | undefined>;
	private readonly _draft: ISettableObservable<IObservable<ISession | undefined> | undefined>;

	constructor(@IContextKeyService contextKeyService: IContextKeyService) {
		const source = observableValue<IObservable<IEditorWindowShownChat | undefined> | undefined>('editorWindowShownChat', undefined);
		const draftSource = observableValue<IObservable<ISession | undefined> | undefined>('editorWindowDraft', undefined);
		const shown = derived(reader => source.read(reader)?.read(reader));
		super({
			kind: SessionHostKind.MainWindow,
			parent: undefined,
			// The session of the chat it shows, else the draft of the new-session composer it shows
			session: derived(reader => shown.read(reader)?.session ?? draftSource.read(reader)?.read(reader)),
			chat: derived(reader => shown.read(reader)?.chat),
			contextKeyService,
			windowId: constObservable(mainWindow.vscodeWindowId),
		});
		this._shown = source;
		this._draft = draftSource;
	}

	/**
	 * Shows the chat `shown` names, and while it names none, the session `draft` names, such as the draft of a new-session
	 * composer, until the returned disposable is disposed.
	 */
	bindShownChat(shown: IObservable<IEditorWindowShownChat | undefined>, draft?: IObservable<ISession | undefined>): IDisposable {
		this._shown.set(shown, undefined);
		this._draft.set(draft, undefined);
		return toDisposable(() => {
			if (this._shown.get() === shown) {
				this._shown.set(undefined, undefined);
				this._draft.set(undefined, undefined);
			}
		});
	}
}
