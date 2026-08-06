/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { trackFocus } from '../../../../../../base/browser/dom.js';
import { Disposable, DisposableStore, IDisposable, toDisposable } from '../../../../../../base/common/lifecycle.js';
import { InstantiationType, registerSingleton } from '../../../../../../platform/instantiation/common/extensions.js';
import { createDecorator } from '../../../../../../platform/instantiation/common/instantiation.js';
import { ChatInputNoticeHost } from './chatInputNoticeHost.js';

export const IChatInputNoticeHubService = createDecorator<IChatInputNoticeHubService>('chatInputNoticeHubService');

export interface IChatInputNoticeHubService {
	readonly _serviceBrand: undefined;

	/** Track a chat input's notice host so commands can reach whichever one is in use. */
	registerHost(host: ChatInputNoticeHost, focusRoot: HTMLElement): IDisposable;

	/**
	 * Move focus into the notice showing in the most recently used chat input,
	 * or back to its input when the notice already has focus. Returns false when
	 * no notice is showing anywhere.
	 */
	toggleNoticeFocus(): boolean;
}

interface ITrackedHost {
	readonly host: ChatInputNoticeHost;
	readonly focusRoot: HTMLElement;
	lastFocused: number;
}

/**
 * Window-level registry of chat input notice hosts. Chat inputs exist in several
 * surfaces (panel, editor, Agents window) that do not share a widget service, so
 * notice commands resolve their target through here rather than through any one
 * surface's widget registry.
 */
class ChatInputNoticeHubService extends Disposable implements IChatInputNoticeHubService {

	declare readonly _serviceBrand: undefined;

	private readonly _hosts = new Set<ITrackedHost>();

	registerHost(host: ChatInputNoticeHost, focusRoot: HTMLElement): IDisposable {
		const tracked: ITrackedHost = { host, focusRoot, lastFocused: 0 };
		this._hosts.add(tracked);

		const store = new DisposableStore();
		const focusTracker = store.add(trackFocus(focusRoot));
		store.add(focusTracker.onDidFocus(() => tracked.lastFocused = Date.now()));
		store.add(toDisposable(() => this._hosts.delete(tracked)));
		return store;
	}

	toggleNoticeFocus(): boolean {
		return this._activeHost()?.toggleFocus() ?? false;
	}

	private _activeHost(): ChatInputNoticeHost | undefined {
		let best: ITrackedHost | undefined;
		for (const tracked of this._hosts) {
			const focusRoot = tracked.focusRoot;
			if (!focusRoot.isConnected || focusRoot.getClientRects().length === 0) {
				continue;
			}
			if (!best || tracked.lastFocused > best.lastFocused) {
				best = tracked;
			}
		}
		return best?.host;
	}
}

registerSingleton(IChatInputNoticeHubService, ChatInputNoticeHubService, InstantiationType.Delayed);
