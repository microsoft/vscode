/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IObservable, IReader } from '../../../../base/common/observable.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { IChatLayoutOwner } from '../../../common/chatLayout.js';
import { SessionLayoutMode, SessionSplitLayout } from '../../../common/sessionLayoutMode.js';

export const ISessionLayoutModeService = createDecorator<ISessionLayoutModeService>('sessionLayoutModeService');

/** How a chat was last shown with its editor, remembered to show it so again. */
export interface IRememberedLayoutMode {
	readonly mode: SessionLayoutMode;
	/** How the chat and the editor show together, or last showed together. */
	readonly splitLayout: SessionSplitLayout;
	/** Stacked: whether the chat shows only its input. */
	readonly inputOnly: boolean;
}

/** The lifecycle of a chat's session, which the shared layout scopes keep apart. */
export const enum LayoutModeOwnerKind {
	Existing = 'existing',
	Draft = 'draft',
	QuickChat = 'quickChat',
}

/** The lifecycle of `session`, which the shared layout scopes keep apart. */
export function getLayoutModeOwnerKind(session: { readonly isCreated: IObservable<boolean>; readonly isQuickChat?: IObservable<boolean> }, reader?: IReader): LayoutModeOwnerKind {
	if (session.isQuickChat?.read(reader)) {
		return LayoutModeOwnerKind.QuickChat;
	}
	return session.isCreated.read(reader) ? LayoutModeOwnerKind.Existing : LayoutModeOwnerKind.Draft;
}

/**
 * Remembers how chats show with their editor: their {@link SessionLayoutMode}, how the chat and the editor are
 * arranged together, and whether a stacked chat shows only its input.
 *
 * The main window remembers it as `sessions.experimental.layoutScope` scopes its other layout state: per chat in
 * `chat`, otherwise one value for the existing chats of the window, kept apart from drafts and quick chats. Chat windows
 * always remember it per chat. A chat opening in a chat window starts as it last showed in a chat window, or else as the
 * main window shows it.
 */
export interface ISessionLayoutModeService {
	readonly _serviceBrand: undefined;

	/** The mode the main window remembers for `owner`, under its layout scope. */
	getMainWindowMode(owner: IChatLayoutOwner, kind: LayoutModeOwnerKind): IRememberedLayoutMode | undefined;
	setMainWindowMode(owner: IChatLayoutOwner, kind: LayoutModeOwnerKind, mode: IRememberedLayoutMode): void;

	/** The mode `owner` last showed in a chat window. */
	getChatWindowMode(owner: IChatLayoutOwner): IRememberedLayoutMode | undefined;
	setChatWindowMode(owner: IChatLayoutOwner, mode: IRememberedLayoutMode): void;

	/** The mode `owner` opens with in a chat window: as it last showed in one, or else as the main window shows it. */
	getChatWindowInitialMode(owner: IChatLayoutOwner, kind: LayoutModeOwnerKind): IRememberedLayoutMode | undefined;

	/**
	 * `owner` returns from a chat window to the main window. The main window adopts its chat window mode only where it
	 * remembers modes per chat; otherwise its shared mode stays. Returns the mode the main window then shows `owner` in.
	 */
	returnToMainWindow(owner: IChatLayoutOwner, kind: LayoutModeOwnerKind): IRememberedLayoutMode | undefined;
}
