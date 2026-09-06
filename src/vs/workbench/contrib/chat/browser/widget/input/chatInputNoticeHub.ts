/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, DisposableStore, IDisposable, toDisposable } from '../../../../../../base/common/lifecycle.js';
import { InstantiationType, registerSingleton } from '../../../../../../platform/instantiation/common/extensions.js';
import { createDecorator } from '../../../../../../platform/instantiation/common/instantiation.js';
import { ChatInputNoticeHost, IChatInputSurface, pickActiveChatInput, trackChatInputRecency } from './chatInputNoticeHost.js';

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

interface ITrackedHost extends IChatInputSurface {
	readonly host: ChatInputNoticeHost;
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
		store.add(trackChatInputRecency(tracked));
		store.add(toDisposable(() => this._hosts.delete(tracked)));
		return store;
	}

	toggleNoticeFocus(): boolean {
		// Inputs with nothing to focus are skipped rather than selected and then
		// declined, so a notice showing elsewhere is still reachable.
		const active = pickActiveChatInput(this._hosts, tracked => tracked.host.hasFocusableNotice());
		return active?.host.toggleFocus() ?? false;
	}
}

registerSingleton(IChatInputNoticeHubService, ChatInputNoticeHubService, InstantiationType.Delayed);
