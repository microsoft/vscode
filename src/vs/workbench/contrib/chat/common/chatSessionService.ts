/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, IDisposable } from '../../../../base/common/lifecycle.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { IconPath } from '../../../../editor/common/languages.js';

export interface IChatSessionInformation {
	iconPath?: IconPath;
}

export interface IChatSessionInformationProvider {
	provideChatSessionInformation(token: CancellationToken): AsyncIterable<IChatSessionInformation>;
	onDidSelectItem: (chatSessionId: string) => void;
}

export interface IChatSessionService {
	onDidChangeChatSessionInformation: Event<void>;
	registerChatSessionInformationProvider(handle: number, provider: IChatSessionInformationProvider): IDisposable;
	hasChatSessionInformationProviders: boolean;
}

export const IChatSessionService = createDecorator<IChatSessionService>('chatSessionService');
export class ChatSessionService extends Disposable implements IChatSessionService {
	private _providers: Map<number, IChatSessionInformationProvider> = new Map();
	// event to signal updates
	private readonly _onDidChangeChatSessionInformation = new Emitter<void>();
	readonly onDidChangeChatSessionInformation: Event<void> = this._onDidChangeChatSessionInformation.event;

	constructor(
		@ILogService private readonly _logService: ILogService,
	) {
		super();
	}

	public updateChatSessionInformation(handle: number, information: IChatSessionInformation): void {
		this._onDidChangeChatSessionInformation.fire();
	}

	public async provideChatSessionInformation(token: CancellationToken): Promise<IChatSessionInformation[]> {
		const results: IChatSessionInformation[] = [];

		// Iterate through all registered providers and collect their results
		for (const [handle, provider] of this._providers) {
			try {
				if (provider.provideChatSessionInformation) {
					for await (const result of provider.provideChatSessionInformation(token)) {
						results.push(result);
					}
				}
			} catch (error) {
				this._logService.error(`Error getting chat session information from provider ${handle}:`, error);
			}

			if (token.isCancellationRequested) {
				break;
			}
		}

		return results;
	}

	public registerChatSessionInformationProvider(handle: number, provider: IChatSessionInformationProvider): IDisposable {
		this._providers.set(handle, provider);
		return {
			dispose: () => {
				this._providers.delete(handle);
			}
		};
	}

	public get hasChatSessionInformationProviders(): boolean {
		return this._providers.size > 0;
	}
}

registerSingleton(IChatSessionService, ChatSessionService, InstantiationType.Delayed);

