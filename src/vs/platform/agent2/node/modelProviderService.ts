/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Model provider service.
 *
 * Maps model identifiers to the appropriate {@link IModelProvider} implementation.
 * This decouples the {@link LocalAgent} from specific provider implementations
 * (Anthropic, OpenAI, etc.) and allows model selection at runtime.
 */

import { createDecorator } from '../../instantiation/common/instantiation.js';
import { ILogService } from '../../log/common/log.js';
import { IModelIdentity } from '../common/conversation.js';
import { IModelProvider } from '../common/modelProvider.js';
import { AnthropicModelProvider } from './anthropicProvider.js';
import { ICopilotApiService } from './copilotToken.js';
import { OpenAIResponsesProvider } from './openaiResponsesProvider.js';

// -- Provider resolution result -----------------------------------------------

export interface IResolvedModelProvider {
	readonly provider: IModelProvider;
	readonly identity: IModelIdentity;
}

// -- Provider factory ---------------------------------------------------------

/** Creates a model provider for a given model ID. */
export interface IModelProviderFactory {
	readonly providerId: string;
	/** Returns true if this factory can handle the given model ID. */
	canHandle(modelId: string): boolean;
	/** Creates a provider instance for the given model ID. */
	create(modelId: string): IModelProvider;
}

// -- Service interface --------------------------------------------------------

export const IModelProviderService = createDecorator<IModelProviderService>('modelProviderService');

export interface IModelProviderService {
	readonly _serviceBrand: undefined;

	/**
	 * Registers a provider factory. Factories are checked in registration
	 * order; the first one that can handle a model ID wins.
	 */
	registerFactory(factory: IModelProviderFactory): void;

	/**
	 * Resolves a model ID to its provider and identity.
	 *
	 * @throws if no registered factory can handle the model ID.
	 */
	resolve(modelId: string): IResolvedModelProvider;
}

// -- Service implementation ---------------------------------------------------

/** Known Anthropic model prefixes. */
const ANTHROPIC_MODEL_PREFIXES = ['claude-'];

/** Known OpenAI model prefixes. */
const OPENAI_MODEL_PREFIXES = ['gpt-', 'o1', 'o3', 'o4'];

/**
 * Resolves model IDs to the appropriate {@link IModelProvider} implementation.
 *
 * Registers built-in provider factories for Anthropic and OpenAI models, then
 * delegates to the first matching factory when {@link resolve} is called.
 */
export class ModelProviderService implements IModelProviderService {
	declare readonly _serviceBrand: undefined;
	private readonly _factories: IModelProviderFactory[] = [];

	constructor(
		@ICopilotApiService private readonly _apiService: ICopilotApiService,
		@ILogService private readonly _logService: ILogService,
	) {
		this._factories.push({
			providerId: 'anthropic',
			canHandle: (modelId: string) => ANTHROPIC_MODEL_PREFIXES.some(prefix => modelId.startsWith(prefix)),
			create: (modelId: string) => new AnthropicModelProvider(modelId, this._apiService, this._logService),
		});

		this._factories.push({
			providerId: 'openai',
			canHandle: (modelId: string) => OPENAI_MODEL_PREFIXES.some(prefix => modelId.startsWith(prefix)),
			create: (modelId: string) => new OpenAIResponsesProvider(modelId, this._apiService, this._logService),
		});
	}

	registerFactory(factory: IModelProviderFactory): void {
		this._factories.push(factory);
	}

	resolve(modelId: string): IResolvedModelProvider {
		for (const factory of this._factories) {
			if (factory.canHandle(modelId)) {
				return {
					provider: factory.create(modelId),
					identity: { provider: factory.providerId, modelId },
				};
			}
		}

		throw new Error(`No model provider found for model "${modelId}". Registered providers: ${this._factories.map(f => f.providerId).join(', ')}`);
	}
}
