/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { SequencerByKey } from '../../../../base/common/async.js';
import { VSBuffer } from '../../../../base/common/buffer.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { IStringDictionary } from '../../../../base/common/collections.js';
import { CancellationError, getErrorMessage, isCancellationError } from '../../../../base/common/errors.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { hash } from '../../../../base/common/hash.js';
import { Iterable } from '../../../../base/common/iterator.js';
import { IJSONSchema, TypeFromJsonSchema } from '../../../../base/common/jsonSchema.js';
import { DisposableStore, IDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { equals } from '../../../../base/common/objects.js';
import Severity from '../../../../base/common/severity.js';
import { format, isFalsyOrWhitespace } from '../../../../base/common/strings.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { isString } from '../../../../base/common/types.js';
import { URI } from '../../../../base/common/uri.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { localize } from '../../../../nls.js';
import { ContextKeyExpr, IContextKey, IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { ExtensionIdentifier } from '../../../../platform/extensions/common/extensions.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IQuickInputService, QuickInputHideReason } from '../../../../platform/quickinput/common/quickInput.js';
import { ISecretStorageService } from '../../../../platform/secrets/common/secrets.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { IExtensionService } from '../../../services/extensions/common/extensions.js';
import { ExtensionsRegistry } from '../../../services/extensions/common/extensionsRegistry.js';
import { ChatContextKeys } from './actions/chatContextKeys.js';
import { ChatAgentLocation } from './constants.js';
import { ILanguageModelsProviderGroup, ILanguageModelsConfigurationService } from './languageModelsConfiguration.js';

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
	readonly multiplier?: string;
	readonly family: string;
	readonly maxInputTokens: number;
	readonly maxOutputTokens: number;

	readonly isDefaultForLocation: { [K in ChatAgentLocation]?: boolean };
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
	provideLanguageModelChatInfo(options: ILanguageModelChatInfoOptions, token: CancellationToken): Promise<ILanguageModelChatMetadataAndIdentifier[]>;
	sendChatRequest(modelId: string, messages: IChatMessage[], from: ExtensionIdentifier, options: { [name: string]: unknown }, token: CancellationToken): Promise<ILanguageModelChatResponse>;
	provideTokenCount(modelId: string, message: string | IChatMessage, token: CancellationToken): Promise<number>;
}

export interface ILanguageModelChat {
	metadata: ILanguageModelChatMetadata;
	sendChatRequest(messages: IChatMessage[], from: ExtensionIdentifier, options: { [name: string]: unknown }, token: CancellationToken): Promise<ILanguageModelChatResponse>;
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

export interface ILanguageModelChatInfoOptions {
	readonly group?: string;
	readonly silent: boolean;
	readonly configuration?: IStringDictionary<unknown>;
}

export interface ILanguageModelsGroup {
	readonly group?: ILanguageModelsProviderGroup;
	readonly modelIdentifiers: string[];
	readonly status?: {
		readonly message: string;
		readonly severity: Severity;
	};
}

export interface ILanguageModelsService {

	readonly _serviceBrand: undefined;

	readonly onDidChangeLanguageModelVendors: Event<readonly string[]>;
	readonly onDidChangeLanguageModels: Event<string>;

	updateModelPickerPreference(modelIdentifier: string, showInModelPicker: boolean): void;

	getLanguageModelIds(): string[];

	getVendors(): ILanguageModelProviderDescriptor[];

	lookupLanguageModel(modelId: string): ILanguageModelChatMetadata | undefined;

	/**
	 * Find a model by its qualified name. The qualified name is what is used in prompt and agent files and is in the format "Model Name (Vendor)".
	 */
	lookupLanguageModelByQualifiedName(qualifiedName: string): ILanguageModelChatMetadataAndIdentifier | undefined;

	getLanguageModelGroups(vendor: string): ILanguageModelsGroup[];

	/**
	 * Given a selector, returns a list of model identifiers
	 * @param selector The selector to lookup for language models. If the selector is empty, all language models are returned.
	 */
	selectLanguageModels(selector: ILanguageModelChatSelector): Promise<string[]>;

	registerLanguageModelProvider(vendor: string, provider: ILanguageModelChatProvider): IDisposable;

	deltaLanguageModelChatProviderDescriptors(added: IUserFriendlyLanguageModel[], removed: IUserFriendlyLanguageModel[]): void;

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	sendChatRequest(modelId: string, from: ExtensionIdentifier, messages: IChatMessage[], options: { [name: string]: any }, token: CancellationToken): Promise<ILanguageModelChatResponse>;

	computeTokenLength(modelId: string, message: string | IChatMessage, token: CancellationToken): Promise<number>;

	addLanguageModelsProviderGroup(name: string, vendorId: string, configuration: IStringDictionary<unknown> | undefined): Promise<void>;

	removeLanguageModelsProviderGroup(vendorId: string, providerGroupName: string): Promise<void>;

	configureLanguageModelsProviderGroup(vendorId: string, name?: string): Promise<void>;

	migrateLanguageModelsProviderGroup(languageModelsProviderGroup: ILanguageModelsProviderGroup): Promise<void>;
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
		configuration: {
			type: 'object',
			description: localize('vscode.extension.contributes.languageModels.configuration', "Configuration options for the language model chat provider."),
			anyOf: [
				{
					$ref: 'http://json-schema.org/draft-07/schema#'
				},
				{
					properties: {
						properties: {
							type: 'object',
							additionalProperties: {
								$ref: 'http://json-schema.org/draft-07/schema#',
								properties: {
									secret: {
										type: 'boolean',
										description: localize('vscode.extension.contributes.languageModels.configuration.secret', "Whether the property is a secret.")
									}
								}
							}
						},
						additionalProperties: {
							$ref: 'http://json-schema.org/draft-07/schema#',
							properties: {
								secret: {
									type: 'boolean',
									description: localize('vscode.extension.contributes.languageModels.configuration.secret', "Whether the property is a secret.")
								}
							}
						}
					}
				}
			]

		},
		managementCommand: {
			type: 'string',
			description: localize('vscode.extension.contributes.languageModels.managementCommand', "A command to manage the language model chat provider, e.g. 'Manage Copilot models'. This is used in the chat model picker. If not provided, a gear icon is not rendered during vendor selection."),
			deprecated: true,
			deprecationMessage: localize('vscode.extension.contributes.languageModels.managementCommand.deprecated', "The managementCommand property is deprecated and will be removed in a future release. Use the new configuration property instead.")
		},
		when: {
			type: 'string',
			description: localize('vscode.extension.contributes.languageModels.when', "Condition which must be true to show this language model chat provider in the Manage Models list.")
		}
	}
} as const satisfies IJSONSchema;

export type IUserFriendlyLanguageModel = TypeFromJsonSchema<typeof languageModelChatProviderType>;

export interface ILanguageModelProviderDescriptor extends IUserFriendlyLanguageModel {
	readonly isDefault: boolean;
}

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

const CHAT_MODEL_PICKER_PREFERENCES_STORAGE_KEY = 'chatModelPickerPreferences';

export class LanguageModelsService implements ILanguageModelsService {

	private static SECRET_KEY_PREFIX = 'chat.lm.secret.';
	private static SECRET_INPUT = '${input:{0}}';

	readonly _serviceBrand: undefined;

	private readonly _store = new DisposableStore();

	private readonly _providers = new Map<string, ILanguageModelChatProvider>();
	private readonly _vendors = new Map<string, ILanguageModelProviderDescriptor>();

	private readonly _onDidChangeLanguageModelVendors = this._store.add(new Emitter<string[]>());
	readonly onDidChangeLanguageModelVendors = this._onDidChangeLanguageModelVendors.event;

	private readonly _modelsGroups = new Map<string, ILanguageModelsGroup[]>();
	private readonly _modelCache = new Map<string, ILanguageModelChatMetadata>();
	private readonly _resolveLMSequencer = new SequencerByKey<string>();
	private _modelPickerUserPreferences: IStringDictionary<boolean> = {};
	private readonly _hasUserSelectableModels: IContextKey<boolean>;

	private readonly _onLanguageModelChange = this._store.add(new Emitter<string>());
	readonly onDidChangeLanguageModels: Event<string> = this._onLanguageModelChange.event;

	constructor(
		@IExtensionService private readonly _extensionService: IExtensionService,
		@ILogService private readonly _logService: ILogService,
		@IStorageService private readonly _storageService: IStorageService,
		@IContextKeyService private readonly _contextKeyService: IContextKeyService,
		@ILanguageModelsConfigurationService private readonly _languageModelsConfigurationService: ILanguageModelsConfigurationService,
		@IQuickInputService private readonly _quickInputService: IQuickInputService,
		@ISecretStorageService private readonly _secretStorageService: ISecretStorageService,
	) {
		this._hasUserSelectableModels = ChatContextKeys.languageModelsAreUserSelectable.bindTo(_contextKeyService);
		this._modelPickerUserPreferences = this._readModelPickerPreferences();
		this._store.add(this._storageService.onDidChangeValue(StorageScope.PROFILE, CHAT_MODEL_PICKER_PREFERENCES_STORAGE_KEY, this._store)(() => this._onDidChangeModelPickerPreferences()));

		this._store.add(this.onDidChangeLanguageModels(() => this._hasUserSelectableModels.set(this._modelCache.size > 0 && Array.from(this._modelCache.values()).some(model => model.isUserSelectable))));
		this._store.add(this._languageModelsConfigurationService.onDidChangeLanguageModelGroups(changedGroups => this._onDidChangeLanguageModelGroups(changedGroups)));

		this._store.add(languageModelChatProviderExtensionPoint.setHandler((extensions, { added, removed }) => {
			const addedVendors: IUserFriendlyLanguageModel[] = [];
			const removedVendors: IUserFriendlyLanguageModel[] = [];

			for (const extension of added) {
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
					addedVendors.push(item);
				}
			}

			for (const extension of removed) {
				for (const item of Iterable.wrap(extension.value)) {
					removedVendors.push(item);
				}
			}

			this.deltaLanguageModelChatProviderDescriptors(addedVendors, removedVendors);
		}));
	}

	deltaLanguageModelChatProviderDescriptors(added: IUserFriendlyLanguageModel[], removed: IUserFriendlyLanguageModel[]): void {
		const addedVendorIds: string[] = [];
		const removedVendorIds: string[] = [];

		for (const item of added) {
			if (this._vendors.has(item.vendor)) {
				this._logService.error(`The vendor '${item.vendor}' is already registered and cannot be registered twice`);
				continue;
			}
			if (isFalsyOrWhitespace(item.vendor)) {
				this._logService.error('The vendor field cannot be empty.');
				continue;
			}
			if (item.vendor.trim() !== item.vendor) {
				this._logService.error('The vendor field cannot start or end with whitespace.');
				continue;
			}
			const vendor: ILanguageModelProviderDescriptor = {
				vendor: item.vendor,
				displayName: item.displayName,
				configuration: item.configuration,
				managementCommand: item.managementCommand,
				when: item.when,
				isDefault: item.vendor === 'copilot'
			};
			this._vendors.set(item.vendor, vendor);
			addedVendorIds.push(item.vendor);
			// Have some models we want from this vendor, so activate the extension
			if (this._hasStoredModelForVendor(item.vendor)) {
				this._extensionService.activateByEvent(`onLanguageModelChatProvider:${item.vendor}`);
			}
		}

		for (const item of removed) {
			this._vendors.delete(item.vendor);
			this._providers.delete(item.vendor);
			this._clearModelCache(item.vendor);
			removedVendorIds.push(item.vendor);
		}

		for (const [vendor, _] of this._providers) {
			if (!this._vendors.has(vendor)) {
				this._providers.delete(vendor);
			}
		}

		if (addedVendorIds.length > 0 || removedVendorIds.length > 0) {
			this._onDidChangeLanguageModelVendors.fire([...addedVendorIds, ...removedVendorIds]);
			if (removedVendorIds.length > 0) {
				for (const vendor of removedVendorIds) {
					this._onLanguageModelChange.fire(vendor);
				}
			}
		}
	}

	private async _onDidChangeLanguageModelGroups(changedGroups: readonly ILanguageModelsProviderGroup[]): Promise<void> {
		const changedVendors = new Set(changedGroups.map(g => g.vendor));
		await Promise.all(Array.from(changedVendors).map(vendor => this._resolveAllLanguageModels(vendor, true)));
	}

	private _readModelPickerPreferences(): IStringDictionary<boolean> {
		return this._storageService.getObject<IStringDictionary<boolean>>(CHAT_MODEL_PICKER_PREFERENCES_STORAGE_KEY, StorageScope.PROFILE, {});
	}

	private _onDidChangeModelPickerPreferences(): void {
		const newPreferences = this._readModelPickerPreferences();
		const oldPreferences = this._modelPickerUserPreferences;

		// Check if there are any changes by computing diff
		const affectedVendors = new Set<string>();
		let hasChanges = false;

		// Check for added or updated keys
		for (const modelId in newPreferences) {
			if (oldPreferences[modelId] !== newPreferences[modelId]) {
				hasChanges = true;
				const model = this._modelCache.get(modelId);
				if (model) {
					affectedVendors.add(model.vendor);
				}
			}
		}

		// Check for removed keys
		for (const modelId in oldPreferences) {
			if (!newPreferences.hasOwnProperty(modelId)) {
				hasChanges = true;
				const model = this._modelCache.get(modelId);
				if (model) {
					affectedVendors.add(model.vendor);
				}
			}
		}

		if (hasChanges) {
			this._logService.trace('[LM] Updated model picker preferences from storage');
			this._modelPickerUserPreferences = newPreferences;
			for (const vendor of affectedVendors) {
				this._onLanguageModelChange.fire(vendor);
			}
		}
	}

	private _hasStoredModelForVendor(vendor: string): boolean {
		return Object.keys(this._modelPickerUserPreferences).some(modelId => {
			return modelId.startsWith(vendor);
		});
	}

	private _saveModelPickerPreferences(): void {
		this._storageService.store(CHAT_MODEL_PICKER_PREFERENCES_STORAGE_KEY, this._modelPickerUserPreferences, StorageScope.PROFILE, StorageTarget.USER);
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
			this._saveModelPickerPreferences();
		} else if (model.isUserSelectable !== showInModelPicker) {
			this._saveModelPickerPreferences();
		}
		this._onLanguageModelChange.fire(model.vendor);
		this._logService.trace(`[LM] Updated model picker preference for ${modelIdentifier} to ${showInModelPicker}`);
	}

	getVendors(): ILanguageModelProviderDescriptor[] {
		return Array.from(this._vendors.values())
			.filter(vendor => {
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
		if (model && this._modelPickerUserPreferences[modelIdentifier] !== undefined) {
			return { ...model, isUserSelectable: this._modelPickerUserPreferences[modelIdentifier] };
		}
		return model;
	}

	lookupLanguageModelByQualifiedName(referenceName: string): ILanguageModelChatMetadataAndIdentifier | undefined {
		for (const [identifier, model] of this._modelCache.entries()) {
			if (ILanguageModelChatMetadata.matchesQualifiedName(referenceName, model)) {
				return { metadata: model, identifier };
			}
		}
		return undefined;
	}

	private async _resolveAllLanguageModels(vendorId: string, silent: boolean): Promise<void> {

		const vendor = this._vendors.get(vendorId);

		if (!vendor) {
			return;
		}

		// Activate extensions before requesting to resolve the models
		await this._extensionService.activateByEvent(`onLanguageModelChatProvider:${vendorId}`);

		const provider = this._providers.get(vendorId);
		if (!provider) {
			this._logService.warn(`[LM] No provider registered for vendor ${vendorId}`);
			return;
		}

		return this._resolveLMSequencer.queue(vendorId, async () => {

			const allModels: ILanguageModelChatMetadataAndIdentifier[] = [];
			const languageModelsGroups: ILanguageModelsGroup[] = [];

			try {
				const models = await provider.provideLanguageModelChatInfo({ silent }, CancellationToken.None);
				if (models.length) {
					allModels.push(...models);
					const modelIdentifiers = [];
					for (const m of models) {
						if (vendor.isDefault) {
							// Special case for copilot models - they are all user selectable unless marked otherwise
							if (m.metadata.isUserSelectable || this._modelPickerUserPreferences[m.identifier] === true) {
								modelIdentifiers.push(m.identifier);
							} else {
								this._logService.trace(`[LM] Skipping model ${m.identifier} from model picker as it is not user selectable.`);
							}
						} else {
							modelIdentifiers.push(m.identifier);
						}
					}
					languageModelsGroups.push({ modelIdentifiers });
				}
			} catch (error) {
				languageModelsGroups.push({
					modelIdentifiers: [],
					status: {
						message: getErrorMessage(error),
						severity: Severity.Error
					}
				});
			}

			const groups = this._languageModelsConfigurationService.getLanguageModelsProviderGroups();
			for (const group of groups) {
				if (group.vendor !== vendorId) {
					continue;
				}

				const configuration = await this._resolveConfiguration(group, vendor.configuration);

				try {
					const models = await provider.provideLanguageModelChatInfo({ group: group.name, silent, configuration }, CancellationToken.None);
					if (models.length) {
						allModels.push(...models);
						languageModelsGroups.push({ group, modelIdentifiers: models.map(m => m.identifier) });
					}
				} catch (error) {
					languageModelsGroups.push({
						group,
						modelIdentifiers: [],
						status: {
							message: getErrorMessage(error),
							severity: Severity.Error
						}
					});
				}
			}

			this._modelsGroups.set(vendorId, languageModelsGroups);
			const oldModels = this._clearModelCache(vendorId);
			let hasChanges = false;
			for (const model of allModels) {
				if (this._modelCache.has(model.identifier)) {
					this._logService.warn(`[LM] Model ${model.identifier} is already registered. Skipping.`);
					continue;
				}
				this._modelCache.set(model.identifier, model.metadata);
				hasChanges = hasChanges || !equals(oldModels.get(model.identifier), model.metadata);
				oldModels.delete(model.identifier);
			}
			this._logService.trace(`[LM] Resolved language models for vendor ${vendorId}`, allModels);
			hasChanges = hasChanges || oldModels.size > 0;

			if (hasChanges) {
				this._onLanguageModelChange.fire(vendorId);
			} else {
				this._logService.trace(`[LM] No changes in language models for vendor ${vendorId}`);
			}
		});
	}

	getLanguageModelGroups(vendor: string): ILanguageModelsGroup[] {
		return this._modelsGroups.get(vendor) ?? [];
	}

	async selectLanguageModels(selector: ILanguageModelChatSelector): Promise<string[]> {

		if (selector.vendor) {
			await this._resolveAllLanguageModels(selector.vendor, true);
		} else {
			const allVendors = Array.from(this._vendors.keys());
			await Promise.all(allVendors.map(vendor => this._resolveAllLanguageModels(vendor, true)));
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
			this._resolveAllLanguageModels(vendor, true);
		}

		const modelChangeListener = provider.onDidChange(() => {
			this._resolveAllLanguageModels(vendor, true);
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

	async configureLanguageModelsProviderGroup(vendorId: string, providerGroupName?: string): Promise<void> {

		const vendor = this.getVendors().find(({ vendor }) => vendor === vendorId);
		if (!vendor) {
			throw new Error(`Vendor ${vendorId} not found.`);
		}

		if (vendor.managementCommand) {
			await this._resolveAllLanguageModels(vendor.vendor, false);
			return;
		}

		const languageModelProviderGroups = this._languageModelsConfigurationService.getLanguageModelsProviderGroups();
		const existing = languageModelProviderGroups.find(g => g.vendor === vendorId && g.name === providerGroupName);

		const name = await this.promptForName(languageModelProviderGroups, vendor, existing);
		if (!name) {
			return;
		}

		const existingConfiguration = existing ? await this._resolveConfiguration(existing, vendor.configuration) : undefined;

		try {
			const configuration = vendor.configuration ? await this.promptForConfiguration(name, vendor.configuration, existingConfiguration) : undefined;
			if (vendor.configuration && !configuration) {
				return;
			}

			const languageModelProviderGroup = await this._resolveLanguageModelProviderGroup(name, vendorId, configuration, vendor.configuration);
			const saved = existing
				? await this._languageModelsConfigurationService.updateLanguageModelsProviderGroup(existing, languageModelProviderGroup)
				: await this._languageModelsConfigurationService.addLanguageModelsProviderGroup(languageModelProviderGroup);

			if (vendor.configuration && this.requireConfiguring(vendor.configuration)) {
				const snippet = this.getSnippetForFirstUnconfiguredProperty(configuration ?? {}, vendor.configuration);
				await this._languageModelsConfigurationService.configureLanguageModels({ group: saved, snippet });
			}
		} catch (error) {
			if (isCancellationError(error)) {
				return;
			}
			throw error;
		}
	}

	async addLanguageModelsProviderGroup(name: string, vendorId: string, configuration: IStringDictionary<unknown> | undefined): Promise<void> {
		const vendor = this.getVendors().find(({ vendor }) => vendor === vendorId);
		if (!vendor) {
			throw new Error(`Vendor ${vendorId} not found.`);
		}

		const languageModelProviderGroup = await this._resolveLanguageModelProviderGroup(name, vendorId, configuration, vendor.configuration);
		await this._languageModelsConfigurationService.addLanguageModelsProviderGroup(languageModelProviderGroup);
	}

	async removeLanguageModelsProviderGroup(vendorId: string, providerGroupName: string): Promise<void> {
		const vendor = this.getVendors().find(({ vendor }) => vendor === vendorId);
		if (!vendor) {
			throw new Error(`Vendor ${vendorId} not found.`);
		}

		const languageModelProviderGroups = this._languageModelsConfigurationService.getLanguageModelsProviderGroups();
		const existing = languageModelProviderGroups.find(g => g.vendor === vendorId && g.name === providerGroupName);

		if (!existing) {
			throw new Error(`Language model provider group ${providerGroupName} for vendor ${vendorId} not found.`);
		}

		await this._deleteSecretsInConfiguration(existing, vendor.configuration);
		await this._languageModelsConfigurationService.removeLanguageModelsProviderGroup(existing);
	}

	private requireConfiguring(schema: IJSONSchema): boolean {
		if (schema.additionalProperties) {
			return true;
		}
		if (!schema.properties) {
			return false;
		}
		for (const property of Object.keys(schema.properties)) {
			if (!this.canPromptForProperty(schema.properties[property])) {
				return true;
			}
		}
		return false;
	}

	private getSnippetForFirstUnconfiguredProperty(configuration: IStringDictionary<unknown>, schema: IJSONSchema): string | undefined {
		if (!schema.properties) {
			return undefined;
		}
		for (const property of Object.keys(schema.properties)) {
			if (configuration[property] === undefined) {
				const propertySchema = schema.properties[property];
				if (propertySchema && typeof propertySchema !== 'boolean' && propertySchema.defaultSnippets?.[0]) {
					const snippet = propertySchema.defaultSnippets[0];
					let bodyText = snippet.bodyText ?? JSON.stringify(snippet.body, null, '\t');
					// Handle ^ prefix for raw values (numbers/booleans) - remove quotes around ^-prefixed values
					bodyText = bodyText.replace(/"(\^[^"]*)"/g, (_, value) => value.substring(1));
					return `"${property}": ${bodyText}`;
				}
			}
		}
		return undefined;
	}

	private async promptForName(languageModelProviderGroups: readonly ILanguageModelsProviderGroup[], vendor: IUserFriendlyLanguageModel, existing: ILanguageModelsProviderGroup | undefined): Promise<string | undefined> {
		let providerGroupName = existing?.name;
		if (!providerGroupName) {
			providerGroupName = vendor.displayName;
			let count = 1;
			while (languageModelProviderGroups.some(g => g.vendor === vendor.vendor && g.name === providerGroupName)) {
				count++;
				providerGroupName = `${vendor.displayName} ${count}`;
			}
		}

		let result: string | undefined;
		const disposables = new DisposableStore();
		try {
			await new Promise<void>(resolve => {
				const inputBox = disposables.add(this._quickInputService.createInputBox());
				inputBox.title = localize('configureLanguageModelGroup', "Group Name");
				inputBox.placeholder = localize('languageModelGroupName', "Enter a name for the group");
				inputBox.value = providerGroupName;
				inputBox.ignoreFocusOut = true;

				disposables.add(inputBox.onDidChangeValue(value => {
					if (!value) {
						inputBox.validationMessage = localize('enterName', "Please enter a name");
						inputBox.severity = Severity.Error;
						return;
					}
					if (!existing && languageModelProviderGroups.some(g => g.name === value)) {
						inputBox.validationMessage = localize('nameExists', "A language models group with this name already exists");
						inputBox.severity = Severity.Error;
						return;
					}
					inputBox.validationMessage = undefined;
					inputBox.severity = Severity.Ignore;
				}));
				disposables.add(inputBox.onDidAccept(async () => {
					result = inputBox.value;
					inputBox.hide();
				}));
				disposables.add(inputBox.onDidHide(() => resolve()));
				inputBox.show();
			});
		} finally {
			disposables.dispose();
		}
		return result;
	}

	private async promptForConfiguration(groupName: string, configuration: IJSONSchema, existing: IStringDictionary<unknown> | undefined): Promise<IStringDictionary<unknown> | undefined> {
		if (!configuration.properties) {
			return;
		}

		const result: IStringDictionary<unknown> = existing ? { ...existing } : {};

		for (const property of Object.keys(configuration.properties)) {
			const propertySchema = configuration.properties[property];
			const required = !!configuration.required?.includes(property);
			const value = await this.promptForValue(groupName, property, propertySchema, required, existing);
			if (value !== undefined) {
				result[property] = value;
			}
		}

		return result;
	}

	private async promptForValue(groupName: string, property: string, propertySchema: IJSONSchema | undefined, required: boolean, existing: IStringDictionary<unknown> | undefined): Promise<unknown | undefined> {
		if (!propertySchema) {
			return undefined;
		}

		if (!this.canPromptForProperty(propertySchema)) {
			return undefined;
		}

		if (propertySchema.type === 'array' && propertySchema.items && !Array.isArray(propertySchema.items) && propertySchema.items.enum) {
			const selectedItems = await this.promptForArray(groupName, property, propertySchema);
			if (selectedItems === undefined) {
				return undefined;
			}
			return selectedItems;
		}

		const value = await this.promptForInput(groupName, property, propertySchema, required, existing);
		if (value === undefined) {
			return undefined;
		}

		return value;
	}

	private canPromptForProperty(propertySchema: IJSONSchema | undefined): boolean {
		if (!propertySchema || typeof propertySchema === 'boolean') {
			return false;
		}

		if (propertySchema.type === 'array' && propertySchema.items && !Array.isArray(propertySchema.items) && propertySchema.items.enum) {
			return true;
		}

		if (propertySchema.type === 'string' || propertySchema.type === 'number' || propertySchema.type === 'integer' || propertySchema.type === 'boolean') {
			return true;
		}

		return false;
	}

	private async promptForArray(groupName: string, property: string, propertySchema: IJSONSchema): Promise<string[] | undefined> {
		if (!propertySchema.items || Array.isArray(propertySchema.items) || !propertySchema.items.enum) {
			return undefined;
		}
		const items = propertySchema.items.enum;
		const disposables = new DisposableStore();
		try {
			return await new Promise<string[] | undefined>(resolve => {
				const quickPick = disposables.add(this._quickInputService.createQuickPick());
				quickPick.title = `${groupName}: ${propertySchema.title ?? property}`;
				quickPick.items = items.map(item => ({ label: item }));
				quickPick.placeholder = propertySchema.description ?? localize('selectValue', "Select value for {0}", property);
				quickPick.canSelectMany = true;
				quickPick.ignoreFocusOut = true;

				disposables.add(quickPick.onDidAccept(() => {
					resolve(quickPick.selectedItems.map(item => item.label));
					quickPick.hide();
				}));
				disposables.add(quickPick.onDidHide(() => {
					resolve(undefined);
				}));
				quickPick.show();
			});
		} finally {
			disposables.dispose();
		}
	}

	private async promptForInput(groupName: string, property: string, propertySchema: IJSONSchema, required: boolean, existing: IStringDictionary<unknown> | undefined): Promise<string | number | boolean | undefined> {
		const disposables = new DisposableStore();
		try {
			const value = await new Promise<string | undefined>((resolve, reject) => {
				const inputBox = disposables.add(this._quickInputService.createInputBox());
				inputBox.title = `${groupName}: ${propertySchema.title ?? property}`;
				inputBox.placeholder = localize('enterValue', "Enter value for {0}", property);
				inputBox.password = !!propertySchema.secret;
				inputBox.ignoreFocusOut = true;
				if (existing?.[property]) {
					inputBox.value = String(existing?.[property]);
				} else if (propertySchema.default) {
					inputBox.value = String(propertySchema.default);
				}
				if (propertySchema.description) {
					inputBox.prompt = propertySchema.description;
				}

				disposables.add(inputBox.onDidChangeValue(value => {
					if (!value && required) {
						inputBox.validationMessage = localize('valueRequired', "Value is required");
						inputBox.severity = Severity.Error;
						return;
					}
					if (propertySchema.type === 'number' || propertySchema.type === 'integer') {
						if (isNaN(Number(value))) {
							inputBox.validationMessage = localize('numberRequired', "Please enter a number");
							inputBox.severity = Severity.Error;
							return;
						}
					}
					if (propertySchema.type === 'boolean') {
						if (value !== 'true' && value !== 'false') {
							inputBox.validationMessage = localize('booleanRequired', "Please enter true or false");
							inputBox.severity = Severity.Error;
							return;
						}
					}
					inputBox.validationMessage = undefined;
					inputBox.severity = Severity.Ignore;
				}));

				disposables.add(inputBox.onDidAccept(() => {
					if (!inputBox.value && required) {
						inputBox.validationMessage = localize('valueRequired', "Value is required");
						inputBox.severity = Severity.Error;
						return;
					}
					resolve(inputBox.value);
					inputBox.hide();
				}));

				disposables.add(inputBox.onDidHide((e) => {
					if (e.reason === QuickInputHideReason.Gesture) {
						reject(new CancellationError());
					} else {
						resolve(undefined);
					}
				}));

				inputBox.show();
			});

			if (!value) {
				return undefined; // User cancelled
			}

			if (propertySchema.type === 'number' || propertySchema.type === 'integer') {
				return Number(value);
			} else if (propertySchema.type === 'boolean') {
				return value === 'true';
			} else {
				return value;
			}

		} finally {
			disposables.dispose();
		}
	}

	private encodeSecretKey(property: string): string {
		return format(LanguageModelsService.SECRET_INPUT, property);
	}

	private decodeSecretKey(secretInput: unknown): string | undefined {
		if (!isString(secretInput)) {
			return undefined;
		}
		return secretInput.substring(secretInput.indexOf(':') + 1, secretInput.length - 1);
	}

	private _clearModelCache(vendor: string): Map<string, ILanguageModelChatMetadata> {
		const removed = new Map<string, ILanguageModelChatMetadata>();
		for (const [id, model] of this._modelCache.entries()) {
			if (model.vendor === vendor) {
				removed.set(id, model);
				this._modelCache.delete(id);
			}
		}
		return removed;
	}

	private async _resolveConfiguration(group: ILanguageModelsProviderGroup, schema: IJSONSchema | undefined): Promise<IStringDictionary<unknown>> {
		if (!schema) {
			return {};
		}

		const result: IStringDictionary<unknown> = {};
		for (const key in group) {
			if (key === 'vendor' || key === 'name' || key === 'range') {
				continue;
			}
			let value = group[key];
			if (schema.properties?.[key]?.secret) {
				const secretKey = this.decodeSecretKey(value);
				value = secretKey ? await this._secretStorageService.get(secretKey) : undefined;
			}
			result[key] = value;
		}

		return result;
	}

	private async _resolveLanguageModelProviderGroup(name: string, vendor: string, configuration: IStringDictionary<unknown> | undefined, schema: IJSONSchema | undefined): Promise<ILanguageModelsProviderGroup> {
		if (!schema) {
			return { name, vendor };
		}

		const result: IStringDictionary<unknown> = {};
		for (const key in configuration) {
			let value = configuration[key];
			if (schema.properties?.[key]?.secret && isString(value)) {
				const secretKey = `${LanguageModelsService.SECRET_KEY_PREFIX}${hash(generateUuid()).toString(16)}`;
				await this._secretStorageService.set(secretKey, value);
				value = this.encodeSecretKey(secretKey);
			}
			result[key] = value;
		}

		return { name, vendor, ...result };
	}

	private async _deleteSecretsInConfiguration(group: ILanguageModelsProviderGroup, schema: IJSONSchema | undefined): Promise<void> {
		if (!schema) {
			return;
		}

		const { vendor, name, range, ...configuration } = group;
		for (const key in configuration) {
			const value = group[key];
			if (schema.properties?.[key]?.secret) {
				const secretKey = this.decodeSecretKey(value);
				if (secretKey) {
					await this._secretStorageService.delete(secretKey);
				}
			}
		}
	}

	async migrateLanguageModelsProviderGroup(languageModelsProviderGroup: ILanguageModelsProviderGroup): Promise<void> {
		const { vendor, name, ...configuration } = languageModelsProviderGroup;
		if (!this._vendors.get(vendor)) {
			throw new Error(`Vendor ${vendor} not found.`);
		}

		await this._extensionService.activateByEvent(`onLanguageModelChatProvider:${vendor}`);
		const provider = this._providers.get(vendor);
		if (!provider) {
			throw new Error(`Chat model provider for vendor ${vendor} is not registered.`);
		}

		const models = await provider.provideLanguageModelChatInfo({ group: name, silent: false, configuration }, CancellationToken.None);
		for (const model of models) {
			const oldIdentifier = `${vendor}/${model.metadata.id}`;
			if (this._modelPickerUserPreferences[oldIdentifier] === true) {
				this._modelPickerUserPreferences[model.identifier] = true;
			}
			delete this._modelPickerUserPreferences[oldIdentifier];
		}
		this._saveModelPickerPreferences();

		await this.addLanguageModelsProviderGroup(name, vendor, configuration);
	}

	dispose() {
		this._store.dispose();
		this._providers.clear();
	}

}
