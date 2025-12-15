/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { SequencerByKey } from '../../../../base/common/async.js';
import { VSBuffer } from '../../../../base/common/buffer.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { Iterable } from '../../../../base/common/iterator.js';
import { IJSONSchema, TypeFromJsonSchema } from '../../../../base/common/jsonSchema.js';
import { DisposableStore, IDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { isFalsyOrWhitespace } from '../../../../base/common/strings.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { URI } from '../../../../base/common/uri.js';
import { localize } from '../../../../nls.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { ContextKeyExpr, IContextKey, IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { ExtensionIdentifier } from '../../../../platform/extensions/common/extensions.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { ChatEntitlement, IChatEntitlementService } from '../../../services/chat/common/chatEntitlementService.js';
import { IExtensionService } from '../../../services/extensions/common/extensions.js';
import { ExtensionsRegistry } from '../../../services/extensions/common/extensionsRegistry.js';
import { ChatContextKeys } from './chatContextKeys.js';

export const enum ChatMessageRole {
	System,
	User,
	Assistant,
}

export enum LanguageModelPartAudience {
	Assistant = 0,
	User = 1,
	Extension = 2,
}

export interface IChatMessageTextPart {
	type: 'text';
	value: string;
	audience?: LanguageModelPartAudience[];
}

export interface IChatMessageImagePart {
	type: 'image_url';
	value: IChatImageURLPart;
}

export interface IChatMessageThinkingPart {
	type: 'thinking';
	value: string | string[];
	id?: string;
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	metadata?: { readonly [key: string]: any };
}

export interface IChatMessageDataPart {
	type: 'data';
	mimeType: string;
	data: VSBuffer;
	audience?: LanguageModelPartAudience[];
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

export type IChatMessagePart = IChatMessageTextPart | IChatMessageToolResultPart | IChatResponseToolUsePart | IChatMessageImagePart | IChatMessageDataPart | IChatMessageThinkingPart;

export interface IChatMessage {
	readonly name?: string | undefined;
	readonly role: ChatMessageRole;
	readonly content: IChatMessagePart[];
}

export interface IChatResponseTextPart {
	type: 'text';
	value: string;
	audience?: LanguageModelPartAudience[];
}

export interface IChatResponsePromptTsxPart {
	type: 'prompt_tsx';
	value: unknown;
}

export interface IChatResponseDataPart {
	type: 'data';
	mimeType: string;
	data: VSBuffer;
	audience?: LanguageModelPartAudience[];
}

export interface IChatResponseToolUsePart {
	type: 'tool_use';
	name: string;
	toolCallId: string;
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	parameters: any;
}

export interface IChatResponseThinkingPart {
	type: 'thinking';
	value: string | string[];
	id?: string;
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	metadata?: { readonly [key: string]: any };
}

export interface IChatResponsePullRequestPart {
	type: 'pullRequest';
	uri: URI;
	title: string;
	description: string;
	author: string;
	linkTag: string;
}

export type IChatResponsePart = IChatResponseTextPart | IChatResponseToolUsePart | IChatResponseDataPart | IChatResponseThinkingPart;

export type IExtendedChatResponsePart = IChatResponsePullRequestPart;

export interface ILanguageModelChatMetadata {
	readonly extension: ExtensionIdentifier;

	readonly name: string;
	readonly id: string;
	readonly vendor: string;
	readonly version: string;
	readonly tooltip?: string;
	readonly detail?: string;
	readonly family: string;
	readonly maxInputTokens: number;
	readonly maxOutputTokens: number;

	readonly isDefault?: boolean;
	readonly isUserSelectable?: boolean;
	readonly statusIcon?: ThemeIcon;
	readonly modelPickerCategory: { label: string; order: number } | undefined;
	readonly auth?: {
		readonly providerLabel: string;
		readonly accountLabel?: string;
	};
	readonly capabilities?: {
		readonly vision?: boolean;
		readonly toolCalling?: boolean;
		readonly agentMode?: boolean;
		readonly editTools?: ReadonlyArray<string>;
	};
}

export namespace ILanguageModelChatMetadata {
	export function suitableForAgentMode(metadata: ILanguageModelChatMetadata): boolean {
		const supportsToolsAgent = typeof metadata.capabilities?.agentMode === 'undefined' || metadata.capabilities.agentMode;
		return supportsToolsAgent && !!metadata.capabilities?.toolCalling;
	}

	export function asQualifiedName(metadata: ILanguageModelChatMetadata): string {
		return `${metadata.name} (${metadata.vendor})`;
	}

	export function matchesQualifiedName(name: string, metadata: ILanguageModelChatMetadata): boolean {
		if (metadata.vendor === 'copilot' && name === metadata.name) {
			return true;
		}
		return name === asQualifiedName(metadata);
	}
}

export interface ILanguageModelChatResponse {
	stream: AsyncIterable<IChatResponsePart | IChatResponsePart[]>;
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	result: Promise<any>;
}

export interface ILanguageModelChatProvider {
	readonly onDidChange: Event<void>;
	provideLanguageModelChatInfo(options: { silent: boolean }, token: CancellationToken): Promise<ILanguageModelChatMetadataAndIdentifier[]>;
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	sendChatRequest(modelId: string, messages: IChatMessage[], from: ExtensionIdentifier, options: { [name: string]: any }, token: CancellationToken): Promise<ILanguageModelChatResponse>;
	provideTokenCount(modelId: string, message: string | IChatMessage, token: CancellationToken): Promise<number>;
}

export interface ILanguageModelChat {
	metadata: ILanguageModelChatMetadata;
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
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


export function isILanguageModelChatSelector(value: unknown): value is ILanguageModelChatSelector {
	if (typeof value !== 'object' || value === null) {
		return false;
	}
	const obj = value as Record<string, unknown>;
	return (
		(obj.name === undefined || typeof obj.name === 'string') &&
		(obj.id === undefined || typeof obj.id === 'string') &&
		(obj.vendor === undefined || typeof obj.vendor === 'string') &&
		(obj.version === undefined || typeof obj.version === 'string') &&
		(obj.family === undefined || typeof obj.family === 'string') &&
		(obj.tokens === undefined || typeof obj.tokens === 'number') &&
		(obj.extension === undefined || typeof obj.extension === 'object')
	);
}

export const ILanguageModelsService = createDecorator<ILanguageModelsService>('ILanguageModelsService');

export interface ILanguageModelChatMetadataAndIdentifier {
	metadata: ILanguageModelChatMetadata;
	identifier: string;
}

export interface ILanguageModelsService {

	readonly _serviceBrand: undefined;

	// TODO @lramos15 - Make this a richer event in the future. Right now it just indicates some change happened, but not what
	readonly onDidChangeLanguageModels: Event<string>;

	updateModelPickerPreference(modelIdentifier: string, showInModelPicker: boolean): void;

	getLanguageModelIds(): string[];

	getVendors(): IUserFriendlyLanguageModel[];

	lookupLanguageModel(modelId: string): ILanguageModelChatMetadata | undefined;

	/**
	 * Given a selector, returns a list of model identifiers
	 * @param selector The selector to lookup for language models. If the selector is empty, all language models are returned.
	 * @param allowPromptingUser If true the user may be prompted for things like API keys for us to select the model.
	 */
	selectLanguageModels(selector: ILanguageModelChatSelector, allowPromptingUser?: boolean): Promise<string[]>;

	registerLanguageModelProvider(vendor: string, provider: ILanguageModelChatProvider): IDisposable;

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	sendChatRequest(modelId: string, from: ExtensionIdentifier, messages: IChatMessage[], options: { [name: string]: any }, token: CancellationToken): Promise<ILanguageModelChatResponse>;

	computeTokenLength(modelId: string, message: string | IChatMessage, token: CancellationToken): Promise<number>;
}

const languageModelChatProviderType = {
	type: 'object',
	required: ['vendor', 'displayName'],
	properties: {
		vendor: {
			type: 'string',
			description: localize('vscode.extension.contributes.languageModels.vendor', "A globally unique vendor of language model chat provider.")
		},
		displayName: {
			type: 'string',
			description: localize('vscode.extension.contributes.languageModels.displayName', "The display name of the language model chat provider.")
		},
		managementCommand: {
			type: 'string',
			description: localize('vscode.extension.contributes.languageModels.managementCommand', "A command to manage the language model chat provider, e.g. 'Manage Copilot models'. This is used in the chat model picker. If not provided, a gear icon is not rendered during vendor selection.")
		},
		when: {
			type: 'string',
			description: localize('vscode.extension.contributes.languageModels.when', "Condition which must be true to show this language model chat provider in the Manage Models list.")
		}
	}
} as const satisfies IJSONSchema;

export type IUserFriendlyLanguageModel = TypeFromJsonSchema<typeof languageModelChatProviderType>;

export const languageModelChatProviderExtensionPoint = ExtensionsRegistry.registerExtensionPoint<IUserFriendlyLanguageModel | IUserFriendlyLanguageModel[]>({
	extensionPoint: 'languageModelChatProviders',
	jsonSchema: {
		description: localize('vscode.extension.contributes.languageModelChatProviders', "Contribute language model chat providers of a specific vendor."),
		oneOf: [
			languageModelChatProviderType,
			{
				type: 'array',
				items: languageModelChatProviderType
			}
		]
	},
	activationEventsGenerator: function* (contribs: readonly IUserFriendlyLanguageModel[]) {
		for (const contrib of contribs) {
			yield `onLanguageModelChatProvider:${contrib.vendor}`;
		}
	}
});

export class LanguageModelsService implements ILanguageModelsService {

	readonly _serviceBrand: undefined;

	private readonly _store = new DisposableStore();

	private readonly _providers = new Map<string, ILanguageModelChatProvider>();
	private readonly _modelCache = new Map<string, ILanguageModelChatMetadata>();
	private readonly _vendors = new Map<string, IUserFriendlyLanguageModel>();
	private readonly _resolveLMSequencer = new SequencerByKey<string>();
	private _modelPickerUserPreferences: Record<string, boolean> = {};
	private readonly _hasUserSelectableModels: IContextKey<boolean>;
	private readonly _contextKeyService: IContextKeyService;
	private readonly _onLanguageModelChange = this._store.add(new Emitter<string>());
	readonly onDidChangeLanguageModels: Event<string> = this._onLanguageModelChange.event;

	constructor(
		@IExtensionService private readonly _extensionService: IExtensionService,
		@ILogService private readonly _logService: ILogService,
		@IStorageService private readonly _storageService: IStorageService,
		@IContextKeyService _contextKeyService: IContextKeyService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IChatEntitlementService private readonly _chatEntitlementService: IChatEntitlementService,
	) {
		this._hasUserSelectableModels = ChatContextKeys.languageModelsAreUserSelectable.bindTo(_contextKeyService);
		this._contextKeyService = _contextKeyService;
		this._modelPickerUserPreferences = this._storageService.getObject<Record<string, boolean>>('chatModelPickerPreferences', StorageScope.PROFILE, this._modelPickerUserPreferences);
		// TODO @lramos15 - Remove after a few releases, as this is just cleaning a bad storage state
		const entitlementChangeHandler = () => {
			if ((this._chatEntitlementService.entitlement === ChatEntitlement.Business || this._chatEntitlementService.entitlement === ChatEntitlement.Enterprise) && !this._chatEntitlementService.isInternal) {
				this._modelPickerUserPreferences = {};
				this._storageService.store('chatModelPickerPreferences', this._modelPickerUserPreferences, StorageScope.PROFILE, StorageTarget.USER);
			}
		};

		entitlementChangeHandler();
		this._store.add(this._chatEntitlementService.onDidChangeEntitlement(entitlementChangeHandler));

		this._store.add(this.onDidChangeLanguageModels(() => {
			this._hasUserSelectableModels.set(this._modelCache.size > 0 && Array.from(this._modelCache.values()).some(model => model.isUserSelectable));
		}));

		this._store.add(languageModelChatProviderExtensionPoint.setHandler((extensions) => {

			this._vendors.clear();

			for (const extension of extensions) {
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
					// Have some models we want from this vendor, so activate the extension
					if (this._hasStoredModelForVendor(item.vendor)) {
						this._extensionService.activateByEvent(`onLanguageModelChatProvider:${item.vendor}`);
					}
				}
			}
			for (const [vendor, _] of this._providers) {
				if (!this._vendors.has(vendor)) {
					this._providers.delete(vendor);
				}
			}
		}));
	}

	private _hasStoredModelForVendor(vendor: string): boolean {
		return Object.keys(this._modelPickerUserPreferences).some(modelId => {
			return modelId.startsWith(vendor);
		});
	}

	dispose() {
		this._store.dispose();
		this._providers.clear();
	}

	updateModelPickerPreference(modelIdentifier: string, showInModelPicker: boolean): void {
		const model = this._modelCache.get(modelIdentifier);
		if (!model) {
			this._logService.warn(`[LM] Cannot update model picker preference for unknown model ${modelIdentifier}`);
			return;
		}

		this._modelPickerUserPreferences[modelIdentifier] = showInModelPicker;
		if (showInModelPicker === model.isUserSelectable) {
			delete this._modelPickerUserPreferences[modelIdentifier];
			this._storageService.store('chatModelPickerPreferences', this._modelPickerUserPreferences, StorageScope.PROFILE, StorageTarget.USER);
		} else if (model.isUserSelectable !== showInModelPicker) {
			this._storageService.store('chatModelPickerPreferences', this._modelPickerUserPreferences, StorageScope.PROFILE, StorageTarget.USER);
		}
		this._onLanguageModelChange.fire(model.vendor);
		this._logService.trace(`[LM] Updated model picker preference for ${modelIdentifier} to ${showInModelPicker}`);
	}

	getVendors(): IUserFriendlyLanguageModel[] {
		return Array.from(this._vendors.values()).filter(vendor => {
			if (!vendor.when) {
				return true; // No when clause means always visible
			}
			const whenClause = ContextKeyExpr.deserialize(vendor.when);
			return whenClause ? this._contextKeyService.contextMatchesRules(whenClause) : false;
		});
	}

	getLanguageModelIds(): string[] {
		return Array.from(this._modelCache.keys());
	}

	lookupLanguageModel(modelIdentifier: string): ILanguageModelChatMetadata | undefined {
		const model = this._modelCache.get(modelIdentifier);
		if (model && this._configurationService.getValue('chat.experimentalShowAllModels')) {
			return { ...model, isUserSelectable: true };
		}
		if (model && this._modelPickerUserPreferences[modelIdentifier] !== undefined) {
			return { ...model, isUserSelectable: this._modelPickerUserPreferences[modelIdentifier] };
		}
		return model;
	}

	private _clearModelCache(vendor: string): void {
		for (const [id, model] of this._modelCache.entries()) {
			if (model.vendor === vendor) {
				this._modelCache.delete(id);
			}
		}
	}

	private async _resolveLanguageModels(vendor: string, silent: boolean): Promise<void> {
		// Activate extensions before requesting to resolve the models
		await this._extensionService.activateByEvent(`onLanguageModelChatProvider:${vendor}`);
		const provider = this._providers.get(vendor);
		if (!provider) {
			this._logService.warn(`[LM] No provider registered for vendor ${vendor}`);
			return;
		}
		return this._resolveLMSequencer.queue(vendor, async () => {
			try {
				let modelsAndIdentifiers = await provider.provideLanguageModelChatInfo({ silent }, CancellationToken.None);
				// This is a bit of a hack, when prompting user if the provider returns any models that are user selectable then we only want to show those and not the entire model list
				if (!silent && modelsAndIdentifiers.some(m => m.metadata.isUserSelectable)) {
					modelsAndIdentifiers = modelsAndIdentifiers.filter(m => m.metadata.isUserSelectable || this._modelPickerUserPreferences[m.identifier] === true);
				}
				this._clearModelCache(vendor);
				for (const modelAndIdentifier of modelsAndIdentifiers) {
					if (this._modelCache.has(modelAndIdentifier.identifier)) {
						this._logService.warn(`[LM] Model ${modelAndIdentifier.identifier} is already registered. Skipping.`);
						continue;
					}
					this._modelCache.set(modelAndIdentifier.identifier, modelAndIdentifier.metadata);
				}
				this._logService.trace(`[LM] Resolved language models for vendor ${vendor}`, modelsAndIdentifiers);
			} catch (error) {
				this._logService.error(`[LM] Error resolving language models for vendor ${vendor}:`, error);
			}
			this._onLanguageModelChange.fire(vendor);
		});
	}

	async selectLanguageModels(selector: ILanguageModelChatSelector, allowPromptingUser?: boolean): Promise<string[]> {

		if (selector.vendor) {
			await this._resolveLanguageModels(selector.vendor, !allowPromptingUser);
		} else {
			const allVendors = Array.from(this._vendors.keys());
			await Promise.all(allVendors.map(vendor => this._resolveLanguageModels(vendor, !allowPromptingUser)));
		}

		const result: string[] = [];

		for (const [internalModelIdentifier, model] of this._modelCache) {
			if ((selector.vendor === undefined || model.vendor === selector.vendor)
				&& (selector.family === undefined || model.family === selector.family)
				&& (selector.version === undefined || model.version === selector.version)
				&& (selector.id === undefined || model.id === selector.id)) {
				result.push(internalModelIdentifier);
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

		this._providers.set(vendor, provider);

		if (this._hasStoredModelForVendor(vendor)) {
			this._resolveLanguageModels(vendor, true);
		}

		const modelChangeListener = provider.onDidChange(async () => {
			await this._resolveLanguageModels(vendor, true);
		});

		return toDisposable(() => {
			this._logService.trace('[LM] UNregistered language model provider', vendor);
			this._clearModelCache(vendor);
			this._providers.delete(vendor);
			modelChangeListener.dispose();
		});
	}

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	async sendChatRequest(modelId: string, from: ExtensionIdentifier, messages: IChatMessage[], options: { [name: string]: any }, token: CancellationToken): Promise<ILanguageModelChatResponse> {
		const provider = this._providers.get(this._modelCache.get(modelId)?.vendor || '');
		if (!provider) {
			throw new Error(`Chat provider for model ${modelId} is not registered.`);
		}
		return provider.sendChatRequest(modelId, messages, from, options, token);
	}

	computeTokenLength(modelId: string, message: string | IChatMessage, token: CancellationToken): Promise<number> {
		const model = this._modelCache.get(modelId);
		if (!model) {
			throw new Error(`Chat model ${modelId} could not be found.`);
		}
		const provider = this._providers.get(model.vendor);
		if (!provider) {
			throw new Error(`Chat provider for model ${modelId} is not registered.`);
		}
		return provider.provideTokenCount(modelId, message, token);
	}
}
