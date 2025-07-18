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
import { ChatSession, IChatSessionContent, IChatSessionsProvider, IChatSessionsService } from '../../contrib/chat/common/chatSessionsService.js';
import { extHostNamedCustomer, IExtHostContext } from '../../services/extensions/common/extHostCustomers.js';
import { ExtHostContext, MainContext, MainThreadChatSessionsShape } from '../common/extHost.protocol.js';

@extHostNamedCustomer(MainContext.MainThreadChatSessions)
export class MainThreadChatSessions extends Disposable implements MainThreadChatSessionsShape {
	private readonly _registrations = this._register(new DisposableMap<number>());

	constructor(
		private readonly _extHostContext: IExtHostContext,
		@IChatSessionsService private readonly _chatSessionsService: IChatSessionsService,
		@ILogService private readonly _logService: ILogService,
	) {
		super();
	}

	$registerChatSessionsProvider(handle: number, chatSessionType: string): void {
		// Register the provider handle - this tracks that a provider exists
		const provider: IChatSessionsProvider = {
			chatSessionType,
			provideChatSessions: (token) => this._provideChatSessionsInformation(handle, token),
			provideChatSessionContent: (uri, token) => this._provideChatSessionContent(handle, uri, token)
		};
		this._registrations.set(handle, this._chatSessionsService.registerChatSessionsProvider(handle, provider));
	}

	private async _provideChatSessionsInformation(handle: number, token: CancellationToken): Promise<IChatSessionContent[]> {
		const proxy = this._extHostContext.getProxy(ExtHostContext.ExtHostChatSessions);

		try {
			// Get all results as an array from the RPC call
			const sessions = await proxy.$provideChatSessions(handle, token);
			return sessions.map(session => ({
				...session,
				uri: URI.revive(session.uri),
				iconPath: session.iconPath ? this._reviveIconPath(session.iconPath) : undefined
			}));
		} catch (error) {
			this._logService.error('Error providing chat sessions:', error);
		}
		return [];
	}

	private async _provideChatSessionContent(handle: number, uri: URI, token: CancellationToken): Promise<ChatSession> {
		const proxy = this._extHostContext.getProxy(ExtHostContext.ExtHostChatSessions);

		try {
			const sessionContent = await proxy.$provideChatSessionContent(handle, uri, token);
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
			this._logService.error(`Error providing chat session content for handle ${handle} and uri ${uri}:`, error);
			throw error; // Re-throw to propagate the error
		}
	}

	$unregisterChatSessionsProvider(handle: number): void {
		this._registrations.deleteAndDispose(handle);
	}


	private _reviveIconPath(
		iconPath: UriComponents | { light: UriComponents; dark: UriComponents } | { id: string; color?: { id: string } | undefined })
		: IChatSessionContent['iconPath'] {
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
