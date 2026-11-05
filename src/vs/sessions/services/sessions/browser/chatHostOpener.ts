/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';

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
	/** Closes `chat`, which it shows, such as its editor: the main window's grid does not show it. */
	close(chat: URI): Promise<void>;
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

registerSingleton(IChatHostOpenerService, ChatHostOpenerService, InstantiationType.Delayed);
