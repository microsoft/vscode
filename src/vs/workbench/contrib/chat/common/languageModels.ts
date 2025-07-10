/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { VSBuffer } from '../../../../base/common/buffer.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { Iterable } from '../../../../base/common/iterator.js';
import { IJSONSchema } from '../../../../base/common/jsonSchema.js';
import { DisposableStore, IDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { isFalsyOrWhitespace } from '../../../../base/common/strings.js';
import { localize } from '../../../../nls.js';
import { ExtensionIdentifier } from '../../../../platform/extensions/common/extensions.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IExtensionService, isProposedApiEnabled } from '../../../services/extensions/common/extensions.js';
import { ExtensionsRegistry } from '../../../services/extensions/common/extensionsRegistry.js';

export const enum ChatMessageRole {
	System,
	User,
	Assistant,
}

export interface IChatMessageTextPart {
	type: 'text';
	value: string;
}

export interface IChatMessageImagePart {
	type: 'image_url';
	value: IChatImageURLPart;
}

export interface IChatMessageDataPart {
	type: 'data';
	mimeType: string;
	data: VSBuffer;
}

export interface IChatImageURLPart {
	/**
	 * The image's MIME type (e.g., "image/png", "image/jpeg").
	 */
	mimeType: ChatImageMimeType;

	/**
	 * The raw binary data of the image, encoded as a Uint8Array. Note: do not use base64 encoding. Maximum image size is 5MB.
	 */
	data: VSBuffer;
}

/**
 * Enum for supported image MIME types.
 */
export enum ChatImageMimeType {
	PNG = 'image/png',
	JPEG = 'image/jpeg',
	GIF = 'image/gif',
	WEBP = 'image/webp',
	BMP = 'image/bmp',
}

/**
 * Specifies the detail level of the image.
 */
export enum ImageDetailLevel {
	Low = 'low',
	High = 'high'
}


export interface IChatMessageToolResultPart {
	type: 'tool_result';
	toolCallId: string;
	value: (IChatResponseTextPart | IChatResponsePromptTsxPart | IChatResponseDataPart)[];
	isError?: boolean;
}

export type IChatMessagePart = IChatMessageTextPart | IChatMessageToolResultPart | IChatResponseToolUsePart | IChatMessageImagePart | IChatMessageDataPart;

export interface IChatMessage {
	readonly name?: string | undefined;
	readonly role: ChatMessageRole;
	readonly content: IChatMessagePart[];
}

export interface IChatResponseTextPart {
	type: 'text';
	value: string;
}

export interface IChatResponsePromptTsxPart {
	type: 'prompt_tsx';
	value: unknown;
}

export interface IChatResponseDataPart {
	type: 'data';
	value: IChatImageURLPart;
}

export interface IChatResponseToolUsePart {
	type: 'tool_use';
	name: string;
	toolCallId: string;
	parameters: any;
}

export type IChatResponsePart = IChatResponseTextPart | IChatResponseToolUsePart | IChatResponseDataPart;

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
	readonly description?: string;
	readonly cost?: string;
	readonly family: string;
	readonly maxInputTokens: number;
	readonly maxOutputTokens: number;

	readonly isDefault?: boolean;
	readonly isUserSelectable?: boolean;
	readonly modelPickerCategory: { label: string; order: number } | undefined;
	readonly auth?: {
		readonly providerLabel: string;
		readonly accountLabel?: string;
	};
	readonly capabilities?: {
		readonly vision?: boolean;
		readonly toolCalling?: boolean;
		readonly agentMode?: boolean;
	};
}

export namespace ILanguageModelChatMetadata {
	export function suitableForAgentMode(metadata: ILanguageModelChatMetadata): boolean {
		const supportsToolsAgent = typeof metadata.capabilities?.agentMode === 'undefined' || metadata.capabilities.agentMode;
		return supportsToolsAgent && !!metadata.capabilities?.toolCalling;
	}

	export function asQualifiedName(metadata: ILanguageModelChatMetadata): string {
		if (metadata.modelPickerCategory === undefined) {
			// in the others category
			return `${metadata.name} (${metadata.family})`;
		}
		return metadata.name;
	}
}

export interface ILanguageModelChatResponse {
	stream: AsyncIterable<IChatResponseFragment | IChatResponseFragment[]>;
	result: Promise<any>;
}

export interface ILanguageModelChatProvider {
	prepareLanguageModelChat(options: { silent: boolean }, token: CancellationToken): Promise<ILanguageModelChatMetadata[]>;
	sendChatRequest(identifier: ILanguageModelIdentifier, messages: IChatMessage[], from: ExtensionIdentifier, options: { [name: string]: any }, token: CancellationToken): Promise<ILanguageModelChatResponse>;
	provideTokenCount(identifier: ILanguageModelIdentifier, message: string | IChatMessage, token: CancellationToken): Promise<number>;
}

export interface ILanguageModelChat {
	metadata: ILanguageModelChatMetadata;
	sendChatRequest(messages: IChatMessage[], from: ExtensionIdentifier, options: { [name: string]: any }, token: CancellationToken): Promise<ILanguageModelChatResponse>;
	provideTokenCount(message: string | IChatMessage, token: CancellationToken): Promise<number>;
}

export interface ILanguageModelChatSelector {
	readonly name?: string;
	readonly id?: string;
	readonly vendor?: string;
	readonly version?: string;
	readonly family?: string;
	readonly tokens?: number;
	readonly extension?: ExtensionIdentifier;
}

/**
 * The vendor identifies the provider of the language model.
 * The id identifies the specific model within that provider.
 */
export interface ILanguageModelIdentifier {
	readonly id: string;
	readonly vendor: string;
}

export const ILanguageModelsService = createDecorator<ILanguageModelsService>('ILanguageModelsService');

export interface ILanguageModelChatMetadataAndIdentifier {
	metadata: ILanguageModelChatMetadata;
	identifier: ILanguageModelIdentifier;
}

export interface ILanguageModelsChangeEvent {
	added?: ILanguageModelChatMetadataAndIdentifier[];
	removed?: string[];
}

export interface ILanguageModelsService {

	readonly _serviceBrand: undefined;

	onDidChangeLanguageModels: Event<ILanguageModelsChangeEvent>;

	getLanguageModelIds(): string[];

	lookupLanguageModel(identifier: ILanguageModelIdentifier): ILanguageModelChatMetadata | undefined;

	selectLanguageModels(selector: ILanguageModelChatSelector): Promise<ILanguageModelIdentifier[]>;

	registerLanguageModelProvider(vendor: string, provider: ILanguageModelChatProvider): IDisposable;

	sendChatRequest(identifier: ILanguageModelIdentifier, from: ExtensionIdentifier, messages: IChatMessage[], options: { [name: string]: any }, token: CancellationToken): Promise<ILanguageModelChatResponse>;

	computeTokenLength(identifier: ILanguageModelIdentifier, message: string | IChatMessage, token: CancellationToken): Promise<number>;
}

const languageModelType: IJSONSchema = {
	type: 'object',
	properties: {
		vendor: {
			type: 'string',
			description: localize('vscode.extension.contributes.languageModels.vendor', "A globally unique vendor of language models.")
		},
		displayName: {
			type: 'string',
			description: localize('vscode.extension.contributes.languageModels.displayName', "The display name of the language model vendor.")
		},
		managementCommand: {
			type: 'string',
			description: localize('vscode.extension.contributes.languageModels.managementCommand', "A command to manage the language model vendor, e.g. 'Manage Copilot models'. This is used in the chat model picker. If not provided, a gear icon is not rendered during vendor selection.")
		}
	}
};

interface IUserFriendlyLanguageModel {
	vendor: string;
	displayName: string;
	managementCommand?: string;
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

	private readonly _providers = new Map<string, { provider: ILanguageModelChatProvider; knownModels: ILanguageModelChatMetadata[] }>();
	private readonly _vendors = new Map<string, IUserFriendlyLanguageModel>();

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
					this._vendors.set(item.vendor, item);
				}
			}

			const removed: string[] = [];
			for (const [vendor, _] of this._providers) {
				if (!this._vendors.has(vendor)) {
					this._providers.delete(vendor);
					removed.push(vendor);
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

	lookupLanguageModel(identifier: ILanguageModelIdentifier): ILanguageModelChatMetadata | undefined {
		return this._providers.get(identifier.vendor)?.knownModels.find(model => model.id === identifier.id);
	}

	async selectLanguageModels(selector: ILanguageModelChatSelector): Promise<ILanguageModelIdentifier[]> {

		if (selector.vendor) {
			// selective activation
			await this._extensionService.activateByEvent(`onLanguageModelChat:${selector.vendor}}`);
		} else {
			// activate all extensions that do language models
			const all = Array.from(this._vendors).map(vendor => this._extensionService.activateByEvent(`onLanguageModelChat:${vendor}`));
			await Promise.all(all);
		}

		const result: ILanguageModelIdentifier[] = [];

		for (const [_, { knownModels }] of this._providers) {
			for (const model of knownModels) {
				if ((selector.vendor === undefined || model.vendor === selector.vendor)
					&& (selector.family === undefined || model.family === selector.family)
					&& (selector.version === undefined || model.version === selector.version)
					&& (selector.id === undefined || model.id === selector.id)) {
					result.push({ id: model.id, vendor: model.vendor });
				}
			}
		}

		this._logService.trace('[LM] selected language models', selector, result);

		return result;
	}

	registerLanguageModelProvider(vendor: string, provider: ILanguageModelChatProvider): IDisposable {
		this._logService.trace('[LM] registering language model provider', vendor, provider);

		if (!this._vendors.has(vendor)) {
			throw new Error(`Chat model provider uses UNKNOWN vendor ${vendor}.`);
		}
		if (this._providers.has(vendor)) {
			throw new Error(`Chat model provider for vendor ${vendor} is already registered.`);
		}

		this._providers.set(vendor, { provider: provider, knownModels: [] });

		return toDisposable(() => {
			this._logService.trace('[LM] UNregistered language model provider', vendor);
			this._providers.delete(vendor);
		});
	}

	async sendChatRequest(identifier: ILanguageModelIdentifier, from: ExtensionIdentifier, messages: IChatMessage[], options: { [name: string]: any }, token: CancellationToken): Promise<ILanguageModelChatResponse> {
		const provider = this._providers.get(identifier.vendor)?.provider;
		if (!provider) {
			throw new Error(`Chat provider for vendor ${identifier.vendor} is not registered.`);
		}
		return provider.sendChatRequest(identifier, messages, from, options, token);
	}

	computeTokenLength(identifier: ILanguageModelIdentifier, message: string | IChatMessage, token: CancellationToken): Promise<number> {
		const provider = this._providers.get(identifier.vendor)?.provider;
		if (!provider) {
			throw new Error(`Chat provider for vendor ${identifier.vendor} is not registered.`);
		}
		return provider.provideTokenCount(identifier, message, token);
	}
}
