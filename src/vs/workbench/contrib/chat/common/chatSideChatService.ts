/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, IDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';

/**
 * Source text a side chat is anchored to, so the side chat can be given the
 * excerpt the question is about.
 */
export interface IChatSideChatSelection {
	readonly text: string;
}

/**
 * Supplies the ability to branch a conversation into a side chat — a question
 * answered alongside the conversation without being added to it.
 *
 * Implemented today by the Agents window (`vs/sessions`), which owns side chat
 * creation. The workbench declares the capability so chat UI can offer it
 * without depending on that layer; when the workbench gains native side chats it
 * registers a provider of its own.
 */
export interface IChatSideChatProvider {
	/**
	 * Whether a side chat can be branched from `sessionResource` right now, e.g.
	 * the conversation supports side chats and has a turn to branch from.
	 */
	canAskInSideChat(sessionResource: URI): boolean;

	/**
	 * Branches a side chat from the conversation's latest turn, reveals it, and
	 * sends `query` on it. Rejects if the side chat could not be created.
	 */
	askInSideChat(sessionResource: URI, query: string, selection?: IChatSideChatSelection): Promise<void>;
}

export const IChatSideChatService = createDecorator<IChatSideChatService>('chatSideChatService');

export interface IChatSideChatService {
	readonly _serviceBrand: undefined;

	registerProvider(provider: IChatSideChatProvider): IDisposable;

	/** @see IChatSideChatProvider.canAskInSideChat */
	canAskInSideChat(sessionResource: URI): boolean;

	/** @see IChatSideChatProvider.askInSideChat */
	askInSideChat(sessionResource: URI, query: string, selection?: IChatSideChatSelection): Promise<void>;
}

export class ChatSideChatService extends Disposable implements IChatSideChatService {

	declare readonly _serviceBrand: undefined;

	private readonly _providers = new Set<IChatSideChatProvider>();

	registerProvider(provider: IChatSideChatProvider): IDisposable {
		this._providers.add(provider);
		return toDisposable(() => this._providers.delete(provider));
	}

	canAskInSideChat(sessionResource: URI): boolean {
		return !!this._findProvider(sessionResource);
	}

	async askInSideChat(sessionResource: URI, query: string, selection?: IChatSideChatSelection): Promise<void> {
		const provider = this._findProvider(sessionResource);
		if (!provider) {
			throw new Error(`No side chat provider for ${sessionResource.toString()}`);
		}
		await provider.askInSideChat(sessionResource, query, selection);
	}

	private _findProvider(sessionResource: URI): IChatSideChatProvider | undefined {
		for (const provider of this._providers) {
			if (provider.canAskInSideChat(sessionResource)) {
				return provider;
			}
		}
		return undefined;
	}
}
