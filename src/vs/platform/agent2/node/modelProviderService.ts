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
interface IModelProviderFactory {
	readonly providerId: string;
	/** Returns true if this factory can handle the given model ID. */
	canHandle(modelId: string): boolean;
	/** Creates a provider instance for the given model ID. */
	create(modelId: string): IModelProvider;
}

// -- Service ------------------------------------------------------------------

/**
 * Resolves model IDs to the appropriate {@link IModelProvider} implementation.
 *
 * Register provider factories with {@link registerFactory}, then call
 * {@link resolve} with a model ID to get back the provider and identity.
 */
export class ModelProviderService {
	private readonly _factories: IModelProviderFactory[] = [];

	/**
	 * Registers a provider factory. Factories are checked in registration
	 * order; the first one that can handle a model ID wins.
	 */
	registerFactory(factory: IModelProviderFactory): void {
		this._factories.push(factory);
	}

	/**
	 * Resolves a model ID to its provider and identity.
	 *
	 * @throws if no registered factory can handle the model ID.
	 */
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

// -- Built-in factory constructors --------------------------------------------

/** Known Anthropic model prefixes. */
const ANTHROPIC_MODEL_PREFIXES = ['claude-'];

/**
 * Creates a factory that handles Anthropic models (claude-*).
 */
export function createAnthropicFactory(apiService: ICopilotApiService, logService: ILogService): IModelProviderFactory {
	return {
		providerId: 'anthropic',
		canHandle(modelId: string): boolean {
			return ANTHROPIC_MODEL_PREFIXES.some(prefix => modelId.startsWith(prefix));
		},
		create(modelId: string): IModelProvider {
			return new AnthropicModelProvider(modelId, apiService, logService);
		},
	};
}

/** Known OpenAI model prefixes. */
const OPENAI_MODEL_PREFIXES = ['gpt-', 'o1', 'o3', 'o4'];

/**
 * Creates a factory that handles OpenAI models (gpt-*, o1*, o3*, o4*).
 */
export function createOpenAIFactory(apiService: ICopilotApiService, logService: ILogService): IModelProviderFactory {
	return {
		providerId: 'openai',
		canHandle(modelId: string): boolean {
			return OPENAI_MODEL_PREFIXES.some(prefix => modelId.startsWith(prefix));
		},
		create(modelId: string): IModelProvider {
			return new OpenAIResponsesProvider(modelId, apiService, logService);
		},
	};
}
