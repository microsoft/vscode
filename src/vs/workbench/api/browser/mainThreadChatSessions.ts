/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../base/common/cancellation.js';
import { Disposable, DisposableMap } from '../../../base/common/lifecycle.js';
import { revive } from '../../../base/common/marshalling.js';
import { URI, UriComponents } from '../../../base/common/uri.js';
import { ILogService } from '../../../platform/log/common/log.js';
import { IChatProgress } from '../../contrib/chat/common/chatService.js';
import { ChatSession, IChatSessionContentProvider, IChatSessionItem, IChatSessionItemProvider, IChatSessionsService } from '../../contrib/chat/common/chatSessionsService.js';
import { extHostNamedCustomer, IExtHostContext } from '../../services/extensions/common/extHostCustomers.js';
import { ExtHostContext, MainContext, MainThreadChatSessionsShape } from '../common/extHost.protocol.js';

@extHostNamedCustomer(MainContext.MainThreadChatSessions)
export class MainThreadChatSessions extends Disposable implements MainThreadChatSessionsShape {
	private readonly _itemProvidersRegistrations = this._register(new DisposableMap<number>());
	private readonly _contentProvidersRegisterations = this._register(new DisposableMap<number>());

	constructor(
		private readonly _extHostContext: IExtHostContext,
		@IChatSessionsService private readonly _chatSessionsService: IChatSessionsService,
		@ILogService private readonly _logService: ILogService,
	) {
		super();
	}

	$registerChatSessionItemProvider(handle: number, chatSessionType: string): void {
		// Register the provider handle - this tracks that a provider exists
		const provider: IChatSessionItemProvider = {
			chatSessionType,
			provideChatSessionItems: (token) => this._provideChatSessionItems(handle, token)
		};

		this._itemProvidersRegistrations.set(handle, this._chatSessionsService.registerChatSessionItemProvider(provider));
	}

	private async _provideChatSessionItems(handle: number, token: CancellationToken): Promise<IChatSessionItem[]> {
		const proxy = this._extHostContext.getProxy(ExtHostContext.ExtHostChatSessions);

		try {
			// Get all results as an array from the RPC call
			const sessions = await proxy.$provideChatSessionItems(handle, token);
			return sessions.map(session => ({
				...session,
				id: session.id,
				iconPath: session.iconPath ? this._reviveIconPath(session.iconPath) : undefined
			}));
		} catch (error) {
			this._logService.error('Error providing chat sessions:', error);
		}
		return [];
	}

	private async _provideChatSessionContent(handle: number, id: string, token: CancellationToken): Promise<ChatSession> {
		const proxy = this._extHostContext.getProxy(ExtHostContext.ExtHostChatSessions);

		try {
			const sessionContent = await proxy.$provideChatSessionContent(handle, id, token);
			return {
				id: sessionContent.id,
				history: sessionContent.history.map(turn => {
					if (turn.type === 'request') {
						return { type: 'request', prompt: turn.prompt };
					}

					return {
						type: 'response',
						parts: turn.parts.map(part => revive(part) as IChatProgress)
					};
				})
			};
		} catch (error) {
			this._logService.error(`Error providing chat session content for handle ${handle} and id ${id}:`, error);
			throw error; // Re-throw to propagate the error
		}
	}

	$unregisterChatSessionItemProvider(handle: number): void {
		this._itemProvidersRegistrations.deleteAndDispose(handle);
	}

	$registerChatSessionContentProvider(handle: number, chatSessionType: string): void {
		const provider: IChatSessionContentProvider = {
			chatSessionType,
			provideChatSessionContent: (id, token) => this._provideChatSessionContent(handle, id, token)
		};

		this._contentProvidersRegisterations.set(handle, this._chatSessionsService.registerChatSessionContentProvider(provider));
	}

	$unregisterChatSessionContentProvider(handle: number): void {
		this._contentProvidersRegisterations.deleteAndDispose(handle);
	}

	private _reviveIconPath(
		iconPath: UriComponents | { light: UriComponents; dark: UriComponents } | { id: string; color?: { id: string } | undefined })
		: IChatSessionItem['iconPath'] {
		if (!iconPath) {
			return undefined;
		}

		// Handle ThemeIcon (has id property)
		if (typeof iconPath === 'object' && 'id' in iconPath) {
			return iconPath; // ThemeIcon doesn't need conversion
		}

		// Handle light/dark theme icons
		if (typeof iconPath === 'object' && ('light' in iconPath && 'dark' in iconPath)) {
			return {
				light: URI.revive(iconPath.light),
				dark: URI.revive(iconPath.dark)
			};
		}
		return undefined;
	}
}
