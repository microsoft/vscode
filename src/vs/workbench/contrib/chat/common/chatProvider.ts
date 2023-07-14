/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from 'vs/base/common/cancellation';
import { IDisposable } from 'vs/base/common/lifecycle';
import { ExtensionIdentifier } from 'vs/platform/extensions/common/extensions';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { IProgress } from 'vs/platform/progress/common/progress';

export const enum ChatMessageRole {
	System,
	User,
	Assistant,
	Function,
}

export interface IChatMessage {
	readonly role: ChatMessageRole;
	readonly content: string;
	readonly name?: string;
}

export interface IChatResponseFragment {
	index: number;
	part: string;
}

export interface IChatResponseProviderMetadata {
	readonly extension: ExtensionIdentifier;
	readonly displayName: string;
	readonly description?: string;
}

export interface IChatResponseProvider {
	metadata: IChatResponseProviderMetadata;
	provideChatResponse(messages: IChatMessage[], options: { [name: string]: any }, progress: IProgress<IChatResponseFragment>, token: CancellationToken): Thenable<any>;
}

export const IChatProviderService = createDecorator<IChatProviderService>('chatProviderService');

export interface IChatProviderService {

	readonly _serviceBrand: undefined;

	registerChatResponseProvider(provider: IChatResponseProvider): IDisposable;
	getAllProviders(): Iterable<IChatResponseProvider>;
}

export class ChatProviderService implements IChatProviderService {
	readonly _serviceBrand: undefined;

	private readonly _providers: Set<IChatResponseProvider> = new Set();

	registerChatResponseProvider(provider: IChatResponseProvider): IDisposable {
		this._providers.add(provider);
		return {
			dispose: () => {
				this._providers.delete(provider);
			}
		};
	}

	getAllProviders(): Iterable<IChatResponseProvider> {
		return this._providers;
	}
}
