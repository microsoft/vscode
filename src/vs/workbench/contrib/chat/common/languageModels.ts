/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from 'vs/base/common/cancellation';
import { Emitter, Event } from 'vs/base/common/event';
import { Iterable } from 'vs/base/common/iterator';
import { IJSONSchema } from 'vs/base/common/jsonSchema';
import { DisposableStore, IDisposable, toDisposable } from 'vs/base/common/lifecycle';
import { isFalsyOrWhitespace } from 'vs/base/common/strings';
import { localize } from 'vs/nls';
import { ExtensionIdentifier } from 'vs/platform/extensions/common/extensions';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { ILogService } from 'vs/platform/log/common/log';
import { IExtensionService, isProposedApiEnabled } from 'vs/workbench/services/extensions/common/extensions';
import { ExtensionsRegistry } from 'vs/workbench/services/extensions/common/extensionsRegistry';

export const enum ChatMessageRole {
	System,
	User,
	Assistant,
}

export interface IChatMessageTextPart {
	type: 'text';
	value: string;
}

export interface IChatMessageFunctionResultPart {
	type: 'function_result';
	name: string;
	value: any;
	isError?: boolean;
}

export type IChatMessagePart = IChatMessageTextPart | IChatMessageFunctionResultPart;

export interface IChatMessage {
	readonly name?: string | undefined;
	readonly role: ChatMessageRole;
	readonly content: IChatMessagePart;
}

export interface IChatResponseTextPart {
	type: 'text';
	value: string;
}

export interface IChatResponceFunctionUsePart {
	type: 'function_use';
	name: string;
	parameters: any;
}

export type IChatResponsePart = IChatResponseTextPart | IChatResponceFunctionUsePart;

export interface IChatResponseFragment {
	index: number;
	part: IChatResponsePart;
}

export interface ILanguageModelChatMetadata {
	readonly extension: ExtensionIdentifier;

	readonly name: string;
	readonly id: string;
	readonly vendor: string;
	readonly version: string;
	readonly family: string;
	readonly maxInputTokens: number;
	readonly maxOutputTokens: number;
	readonly targetExtensions?: string[];

	readonly auth?: {
		readonly providerLabel: string;
		readonly accountLabel?: string;
	};
}

export interface ILanguageModelChatResponse {
	stream: AsyncIterable<IChatResponseFragment>;
	result: Promise<any>;
}

export interface ILanguageModelChat {
	metadata: ILanguageModelChatMetadata;
	sendChatRequest(messages: IChatMessage[], from: ExtensionIdentifier, options: { [name: string]: any }, token: CancellationToken): Promise<ILanguageModelChatResponse>;
	provideTokenCount(message: string | IChatMessage, token: CancellationToken): Promise<number>;
}

export interface ILanguageModelChatSelector {
	readonly name?: string;
	readonly identifier?: string;
	readonly vendor?: string;
	readonly version?: string;
	readonly family?: string;
	readonly tokens?: number;
	readonly extension?: ExtensionIdentifier;
}

export const ILanguageModelsService = createDecorator<ILanguageModelsService>('ILanguageModelsService');

export interface ILanguageModelsChangeEvent {
	added?: {
		identifier: string;
		metadata: ILanguageModelChatMetadata;
	}[];
	removed?: string[];
}

export interface ILanguageModelsService {

	readonly _serviceBrand: undefined;

	onDidChangeLanguageModels: Event<ILanguageModelsChangeEvent>;

	getLanguageModelIds(): string[];

	lookupLanguageModel(identifier: string): ILanguageModelChatMetadata | undefined;

	selectLanguageModels(selector: ILanguageModelChatSelector): Promise<string[]>;

	registerLanguageModelChat(identifier: string, provider: ILanguageModelChat): IDisposable;

	sendChatRequest(identifier: string, from: ExtensionIdentifier, messages: IChatMessage[], options: { [name: string]: any }, token: CancellationToken): Promise<ILanguageModelChatResponse>;

	computeTokenLength(identifier: string, message: string | IChatMessage, token: CancellationToken): Promise<number>;
}

const languageModelType: IJSONSchema = {
	type: 'object',
	properties: {
		vendor: {
			type: 'string',
			description: localize('vscode.extension.contributes.languageModels.vendor', "A globally unique vendor of language models.")
		}
	}
};

interface IUserFriendlyLanguageModel {
	vendor: string;
}

export const languageModelExtensionPoint = ExtensionsRegistry.registerExtensionPoint<IUserFriendlyLanguageModel | IUserFriendlyLanguageModel[]>({
	extensionPoint: 'languageModels',
	jsonSchema: {
		description: localize('vscode.extension.contributes.languageModels', "Contribute language models of a specific vendor."),
		oneOf: [
			languageModelType,
			{
				type: 'array',
				items: languageModelType
			}
		]
	},
	activationEventsGenerator: (contribs: IUserFriendlyLanguageModel[], result: { push(item: string): void }) => {
		for (const contrib of contribs) {
			result.push(`onLanguageModelChat:${contrib.vendor}`);
		}
	}
});

export class LanguageModelsService implements ILanguageModelsService {

	readonly _serviceBrand: undefined;

	private readonly _store = new DisposableStore();

	private readonly _providers = new Map<string, ILanguageModelChat>();
	private readonly _vendors = new Set<string>();

	private readonly _onDidChangeProviders = this._store.add(new Emitter<ILanguageModelsChangeEvent>());
	readonly onDidChangeLanguageModels: Event<ILanguageModelsChangeEvent> = this._onDidChangeProviders.event;

	constructor(
		@IExtensionService private readonly _extensionService: IExtensionService,
		@ILogService private readonly _logService: ILogService,
	) {

		this._store.add(languageModelExtensionPoint.setHandler((extensions) => {

			this._vendors.clear();

			for (const extension of extensions) {

				if (!isProposedApiEnabled(extension.description, 'chatProvider')) {
					extension.collector.error(localize('vscode.extension.contributes.languageModels.chatProviderRequired', "This contribution point requires the 'chatProvider' proposal."));
					continue;
				}

				for (const item of Iterable.wrap(extension.value)) {
					if (this._vendors.has(item.vendor)) {
						extension.collector.error(localize('vscode.extension.contributes.languageModels.vendorAlreadyRegistered', "The vendor '{0}' is already registered and cannot be registered twice", item.vendor));
						continue;
					}
					if (isFalsyOrWhitespace(item.vendor)) {
						extension.collector.error(localize('vscode.extension.contributes.languageModels.emptyVendor', "The vendor field cannot be empty."));
						continue;
					}
					if (item.vendor.trim() !== item.vendor) {
						extension.collector.error(localize('vscode.extension.contributes.languageModels.whitespaceVendor', "The vendor field cannot start or end with whitespace."));
						continue;
					}
					this._vendors.add(item.vendor);
				}
			}

			const removed: string[] = [];
			for (const [identifier, value] of this._providers) {
				if (!this._vendors.has(value.metadata.vendor)) {
					this._providers.delete(identifier);
					removed.push(identifier);
				}
			}
			if (removed.length > 0) {
				this._onDidChangeProviders.fire({ removed });
			}
		}));
	}

	dispose() {
		this._store.dispose();
		this._providers.clear();
	}

	getLanguageModelIds(): string[] {
		return Array.from(this._providers.keys());
	}

	lookupLanguageModel(identifier: string): ILanguageModelChatMetadata | undefined {
		return this._providers.get(identifier)?.metadata;
	}

	async selectLanguageModels(selector: ILanguageModelChatSelector): Promise<string[]> {

		if (selector.vendor) {
			// selective activation
			await this._extensionService.activateByEvent(`onLanguageModelChat:${selector.vendor}}`);
		} else {
			// activate all extensions that do language models
			const all = Array.from(this._vendors).map(vendor => this._extensionService.activateByEvent(`onLanguageModelChat:${vendor}`));
			await Promise.all(all);
		}

		const result: string[] = [];

		for (const [identifier, model] of this._providers) {

			if ((selector.vendor === undefined || model.metadata.vendor === selector.vendor)
				&& (selector.family === undefined || model.metadata.family === selector.family)
				&& (selector.version === undefined || model.metadata.version === selector.version)
				&& (selector.identifier === undefined || model.metadata.id === selector.identifier)
				&& (!model.metadata.targetExtensions || model.metadata.targetExtensions.some(candidate => ExtensionIdentifier.equals(candidate, selector.extension)))
			) {
				result.push(identifier);
			}
		}

		this._logService.trace('[LM] selected language models', selector, result);

		return result;
	}

	registerLanguageModelChat(identifier: string, provider: ILanguageModelChat): IDisposable {

		this._logService.trace('[LM] registering language model chat', identifier, provider.metadata);

		if (!this._vendors.has(provider.metadata.vendor)) {
			throw new Error(`Chat response provider uses UNKNOWN vendor ${provider.metadata.vendor}.`);
		}
		if (this._providers.has(identifier)) {
			throw new Error(`Chat response provider with identifier ${identifier} is already registered.`);
		}
		this._providers.set(identifier, provider);
		this._onDidChangeProviders.fire({ added: [{ identifier, metadata: provider.metadata }] });
		return toDisposable(() => {
			if (this._providers.delete(identifier)) {
				this._onDidChangeProviders.fire({ removed: [identifier] });
				this._logService.trace('[LM] UNregistered language model chat', identifier, provider.metadata);
			}
		});
	}

	async sendChatRequest(identifier: string, from: ExtensionIdentifier, messages: IChatMessage[], options: { [name: string]: any }, token: CancellationToken): Promise<ILanguageModelChatResponse> {
		const provider = this._providers.get(identifier);
		if (!provider) {
			throw new Error(`Chat response provider with identifier ${identifier} is not registered.`);
		}
		return provider.sendChatRequest(messages, from, options, token);
	}

	computeTokenLength(identifier: string, message: string | IChatMessage, token: CancellationToken): Promise<number> {
		const provider = this._providers.get(identifier);
		if (!provider) {
			throw new Error(`Chat response provider with identifier ${identifier} is not registered.`);
		}
		return provider.provideTokenCount(message, token);
	}
}
