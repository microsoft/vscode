/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, IDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { ResourceMap } from '../../../../base/common/map.js';
import { derived, IObservable, observableValue } from '../../../../base/common/observable.js';
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
 * Describes the conversation and turn a side chat branched from, so chat UI can
 * show where the side chat came from and navigate back to it.
 */
export interface IChatSideChatOrigin {
	/** Resource of the chat this side chat branched from. */
	readonly sourceSessionResource: URI;
	/** Id of the turn in the source chat the side chat branched from. */
	readonly sourceTurnId: string;
	/** Display title of the source chat, when known. */
	readonly sourceTitle: string | undefined;
	/** Immutable text snapshot the side chat was anchored to, when the user branched from a selection. */
	readonly selection?: IChatSideChatSelection;
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

	/**
	 * Observes how `sessionResource` came to exist as a side chat, or `undefined`
	 * when it is not a side chat. Observable because the source chat's title and
	 * the origin itself settle asynchronously as session state loads.
	 */
	observeSideChatOrigin(sessionResource: URI): IObservable<IChatSideChatOrigin | undefined>;

	/**
	 * Reveals the turn `sessionResource` branched from, activating the source
	 * chat. No-ops when `sessionResource` is not a side chat.
	 */
	revealSideChatSource(sessionResource: URI): Promise<void>;
}

export const IChatSideChatService = createDecorator<IChatSideChatService>('chatSideChatService');

export interface IChatSideChatService {
	readonly _serviceBrand: undefined;

	registerProvider(provider: IChatSideChatProvider): IDisposable;

	/** @see IChatSideChatProvider.canAskInSideChat */
	canAskInSideChat(sessionResource: URI): boolean;

	/** @see IChatSideChatProvider.askInSideChat */
	askInSideChat(sessionResource: URI, query: string, selection?: IChatSideChatSelection): Promise<void>;

	/** @see IChatSideChatProvider.observeSideChatOrigin */
	observeSideChatOrigin(sessionResource: URI): IObservable<IChatSideChatOrigin | undefined>;

	/** @see IChatSideChatProvider.revealSideChatSource */
	revealSideChatSource(sessionResource: URI): Promise<void>;
}

export class ChatSideChatService extends Disposable implements IChatSideChatService {

	declare readonly _serviceBrand: undefined;

	private readonly _providers = observableValue<readonly IChatSideChatProvider[]>(this, []);
	// Cheap deriveds keyed by session resource keep observable identities stable across renders.
	private readonly _sideChatOrigins = new ResourceMap<IObservable<IChatSideChatOrigin | undefined>>();

	registerProvider(provider: IChatSideChatProvider): IDisposable {
		if (!this._providers.get().includes(provider)) {
			this._providers.set([...this._providers.get(), provider], undefined);
		}

		return toDisposable(() => {
			const providers = this._providers.get();
			const index = providers.indexOf(provider);
			if (index !== -1) {
				this._providers.set([...providers.slice(0, index), ...providers.slice(index + 1)], undefined);
			}
		});
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

	observeSideChatOrigin(sessionResource: URI): IObservable<IChatSideChatOrigin | undefined> {
		let origin = this._sideChatOrigins.get(sessionResource);
		if (!origin) {
			origin = derived(this, reader => {
				for (const provider of this._providers.read(reader)) {
					const providerOrigin = provider.observeSideChatOrigin(sessionResource).read(reader);
					if (providerOrigin !== undefined) {
						return providerOrigin;
					}
				}
				return undefined;
			});
			this._sideChatOrigins.set(sessionResource, origin);
		}
		return origin;
	}

	async revealSideChatSource(sessionResource: URI): Promise<void> {
		for (const provider of this._providers.get()) {
			if (provider.observeSideChatOrigin(sessionResource).get() !== undefined) {
				await provider.revealSideChatSource(sessionResource);
				return;
			}
		}
	}

	private _findProvider(sessionResource: URI): IChatSideChatProvider | undefined {
		for (const provider of this._providers.get()) {
			if (provider.canAskInSideChat(sessionResource)) {
				return provider;
			}
		}
		return undefined;
	}
}
