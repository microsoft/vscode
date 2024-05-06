/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from 'vs/base/common/cancellation';
import { Emitter, Event } from 'vs/base/common/event';
import { IDisposable, toDisposable } from 'vs/base/common/lifecycle';
import { ExtensionIdentifier } from 'vs/platform/extensions/common/extensions';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { IProgress } from 'vs/platform/progress/common/progress';

export const enum ChatMessageRole {
	System,
	User,
	Assistant,
}

export interface IChatMessage {
	readonly role: ChatMessageRole;
	readonly content: string;
}

export interface IChatResponseFragment {
	index: number;
	part: string;
}

export interface ILanguageModelChatMetadata {
	readonly extension: ExtensionIdentifier;
	readonly identifier: string;
	readonly name: string;
	readonly version: string;
	readonly tokens: number;

	readonly auth?: {
		readonly providerLabel: string;
		readonly accountLabel?: string;
	};
}

export interface ILanguageModelChat {
	metadata: ILanguageModelChatMetadata;
	provideChatResponse(messages: IChatMessage[], from: ExtensionIdentifier, options: { [name: string]: any }, progress: IProgress<IChatResponseFragment>, token: CancellationToken): Promise<any>;
	provideTokenCount(message: string | IChatMessage, token: CancellationToken): Promise<number>;
}

export const ILanguageModelsService = createDecorator<ILanguageModelsService>('ILanguageModelsService');

export interface ILanguageModelsService {

	readonly _serviceBrand: undefined;

	onDidChangeLanguageModels: Event<{ added?: ILanguageModelChatMetadata[]; removed?: string[] }>;

	getLanguageModelIds(): string[];

	lookupLanguageModel(identifier: string): ILanguageModelChatMetadata | undefined;

	registerLanguageModelChat(identifier: string, provider: ILanguageModelChat): IDisposable;

	makeLanguageModelChatRequest(identifier: string, from: ExtensionIdentifier, messages: IChatMessage[], options: { [name: string]: any }, progress: IProgress<IChatResponseFragment>, token: CancellationToken): Promise<any>;

	computeTokenLength(identifier: string, message: string | IChatMessage, token: CancellationToken): Promise<number>;
}

export class LanguageModelsService implements ILanguageModelsService {
	readonly _serviceBrand: undefined;

	private readonly _providers: Map<string, ILanguageModelChat> = new Map();

	private readonly _onDidChangeProviders = new Emitter<{ added?: ILanguageModelChatMetadata[]; removed?: string[] }>();
	readonly onDidChangeLanguageModels: Event<{ added?: ILanguageModelChatMetadata[]; removed?: string[] }> = this._onDidChangeProviders.event;

	dispose() {
		this._onDidChangeProviders.dispose();
		this._providers.clear();
	}

	getLanguageModelIds(): string[] {
		return Array.from(this._providers.keys());
	}

	lookupLanguageModel(identifier: string): ILanguageModelChatMetadata | undefined {
		return this._providers.get(identifier)?.metadata;
	}

	registerLanguageModelChat(identifier: string, provider: ILanguageModelChat): IDisposable {
		if (this._providers.has(identifier)) {
			throw new Error(`Chat response provider with identifier ${identifier} is already registered.`);
		}
		this._providers.set(identifier, provider);
		this._onDidChangeProviders.fire({ added: [provider.metadata] });
		return toDisposable(() => {
			if (this._providers.delete(identifier)) {
				this._onDidChangeProviders.fire({ removed: [identifier] });
			}
		});
	}

	makeLanguageModelChatRequest(identifier: string, from: ExtensionIdentifier, messages: IChatMessage[], options: { [name: string]: any }, progress: IProgress<IChatResponseFragment>, token: CancellationToken): Promise<any> {
		const provider = this._providers.get(identifier);
		if (!provider) {
			throw new Error(`Chat response provider with identifier ${identifier} is not registered.`);
		}
		return provider.provideChatResponse(messages, from, options, progress, token);
	}

	computeTokenLength(identifier: string, message: string | IChatMessage, token: CancellationToken): Promise<number> {
		const provider = this._providers.get(identifier);
		if (!provider) {
			throw new Error(`Chat response provider with identifier ${identifier} is not registered.`);
		}
		return provider.provideTokenCount(message, token);
	}
}
