/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, IDisposable } from '../../../../base/common/lifecycle.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { URI } from '../../../../base/common/uri.js';
import { ThemeIcon } from '../../../../base/common/themables.js';

export interface IChatSessionContent {
	uri: URI;
	label: string;
	iconPath?: URI | {
		light: URI;
		dark: URI;
	} | ThemeIcon;
}

export interface IChatSessionsProvider {
	readonly chatSessionType: string;
	provideChatSessions(token: CancellationToken): Promise<IChatSessionContent[]>;
}

export interface IChatSessionsService {
	readonly _serviceBrand: undefined;
	registerChatSessionsProvider(handle: number, provider: IChatSessionsProvider): IDisposable;
	hasChatSessionsProviders: boolean;
	provideChatSessions(token: CancellationToken): Promise<{ provider: IChatSessionsProvider; session: IChatSessionContent }[]>;
}

export const IChatSessionsService = createDecorator<IChatSessionsService>('chatSessionsService');

export class ChatSessionsService extends Disposable implements IChatSessionsService {
	readonly _serviceBrand: undefined;
	private _providers: Map<number, IChatSessionsProvider> = new Map();

	constructor(
		@ILogService private readonly _logService: ILogService,
	) {
		super();
	}

	public async provideChatSessions(token: CancellationToken): Promise<{ provider: IChatSessionsProvider; session: IChatSessionContent }[]> {
		const results: { provider: IChatSessionsProvider; session: IChatSessionContent }[] = [];

		// Iterate through all registered providers and collect their results
		for (const [handle, provider] of this._providers) {
			try {
				if (provider.provideChatSessions) {
					const sessions = await provider.provideChatSessions(token);
					results.push(...sessions.map(session => ({ provider, session })));
				}
			} catch (error) {
				this._logService.error(`Error getting chat sessions from provider ${handle}:`, error);
			}
			if (token.isCancellationRequested) {
				break;
			}
		}

		return results;
	}

	public registerChatSessionsProvider(handle: number, provider: IChatSessionsProvider): IDisposable {
		this._providers.set(handle, provider);
		return {
			dispose: () => {
				this._providers.delete(handle);
			}
		};
	}

	public get hasChatSessionsProviders(): boolean {
		return this._providers.size > 0;
	}
}

registerSingleton(IChatSessionsService, ChatSessionsService, InstantiationType.Delayed);

