/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { ISessionGridPanes, ISessionHost, SessionHostKind } from './sessionHost.js';

/**
 * Opens chats where a surface outside of the main window's grid shows them, such as a chat window that shows chats as
 * editors: it reveals and closes a chat it shows, and opens a chat beside one it shows.
 */
export interface IChatHostOpener {
	/** Whether it shows `chat`. */
	showsChat(chat: URI): boolean;
	/** Reveals `chat`, which it shows, focused unless `preserveFocus`. */
	reveal(chat: URI, options?: { readonly preserveFocus?: boolean }): Promise<void>;
	/** Opens `chat` beside `reference`, which it shows, focused unless `preserveFocus`. */
	openBeside(chat: URI, reference: URI, options?: { readonly preserveFocus?: boolean }): Promise<void>;
	/**
	 * Closes `chat`, which it shows, such as its editor: the main window's grid does not show it. Resolves what shows it
	 * there again, for as long as what closed it needs it, such as while it moves elsewhere; nothing when its close is
	 * vetoed.
	 */
	close(chat: URI): Promise<IChatHostClosedChat | undefined>;
}

/** A chat an opener closed, such as for it to move elsewhere. */
export interface IChatHostClosedChat {
	/**
	 * Shows the chat again, such as when what it moved to went away meanwhile: where it showed, unless that went away too,
	 * such as a window whose last chat it was, then where such a chat opens.
	 */
	restore(): Promise<void>;
}

/**
 * Where opening a chat goes when a surface outside of the main window's grid shows it, or shows the chat it opens beside.
 * The sessions service asks it before it shows a chat in the grid.
 */
export interface IChatHostOpenerService {
	readonly _serviceBrand: undefined;

	/** Registers `opener` while the returned disposable is not disposed. */
	register(opener: IChatHostOpener): IDisposable;

	/** The opener of the surface that shows `chat`, if one does. */
	getOpenerOf(chat: URI): IChatHostOpener | undefined;
}

export const IChatHostOpenerService = createDecorator<IChatHostOpenerService>('chatHostOpenerService');

/**
 * The opener of the surface that `host` is, when it is not a pane of the main window's grid: a host of a chat window, or of
 * one of its editors, which shows its chat. What acts on such a host goes through its opener rather than the grid.
 */
export function getChatHostOpenerOfHost(chatHostOpenerService: IChatHostOpenerService, gridPanes: ISessionGridPanes, host: ISessionHost | undefined): IChatHostOpener | undefined {
	const chat = host?.chatResource.get();
	const ofGrid = host?.kind === SessionHostKind.MainWindow || (host && gridPanes.getPaneOfHost(host));
	return host && chat && !ofGrid ? chatHostOpenerService.getOpenerOf(chat) : undefined;
}

export class ChatHostOpenerService implements IChatHostOpenerService {
	declare readonly _serviceBrand: undefined;

	private readonly _openers: IChatHostOpener[] = [];

	register(opener: IChatHostOpener): IDisposable {
		this._openers.push(opener);
		return toDisposable(() => {
			const index = this._openers.indexOf(opener);
			if (index >= 0) {
				this._openers.splice(index, 1);
			}
		});
	}

	getOpenerOf(chat: URI): IChatHostOpener | undefined {
		return this._openers.find(opener => opener.showsChat(chat));
	}
}
