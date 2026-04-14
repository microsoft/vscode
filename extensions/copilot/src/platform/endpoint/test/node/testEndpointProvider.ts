/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/* eslint-disable import/no-restricted-paths */

import type { ChatRequest, LanguageModelChat } from 'vscode';
import { CacheableRequest, SQLiteCache } from '../../../../../test/base/cache';
import { TestingCacheSalts } from '../../../../../test/base/salts';
import { CurrentTestRunInfo } from '../../../../../test/base/simulationContext';
import { TokenizerType } from '../../../../util/common/tokenizer';
import { SequencerByKey } from '../../../../util/vs/base/common/async';
import { Event } from '../../../../util/vs/base/common/event';
import { IInstantiationService } from '../../../../util/vs/platform/instantiation/common/instantiation';
import { IAuthenticationService } from '../../../authentication/common/authentication';
import { CHAT_MODEL, IConfigurationService } from '../../../configuration/common/configurationService';
import { LEGACY_EMBEDDING_MODEL_ID } from '../../../embeddings/common/embeddingsComputer';
import { IEnvService } from '../../../env/common/envService';
import { IOctoKitService } from '../../../github/common/githubService';
import { ILogService } from '../../../log/common/logService';
import { IChatEndpoint, IEmbeddingsEndpoint } from '../../../networking/common/networking';
import { IRequestLogger } from '../../../requestLogger/common/requestLogger';
import { IExperimentationService } from '../../../telemetry/common/nullExperimentationService';
import { ChatEndpointFamily, EmbeddingsEndpointFamily, IChatModelInformation, ICompletionModelInformation, IEmbeddingModelInformation, IEndpointProvider } from '../../common/endpointProvider';
import { EmbeddingEndpoint } from '../../node/embeddingsEndpoint';
import { ModelMetadataFetcher } from '../../node/modelMetadataFetcher';
import { AzureTestEndpoint } from './azureEndpoint';
import { CAPITestEndpoint } from './capiEndpoint';
import { CustomNesEndpoint } from './customNesEndpoint';
import { IModelConfig, OpenAICompatibleTestEndpoint } from './openaiCompatibleEndpoint';


async function getModelMetadataMap(modelMetadataFetcher: TestModelMetadataFetcher): Promise<Map<string, IChatModelInformation>> {
	let metadataArray: IChatModelInformation[] = [];
	try {
		metadataArray = await modelMetadataFetcher.getAllChatModels();
	} catch (e) {
		metadataArray = [];
		// We only want to catch errors for the model lab models, otherwise we have no models to test and should just throw the error
		if (!modelMetadataFetcher.isModelLab) {
			throw e;
		}
	}
	const metadataMap = new Map<string, IChatModelInformation>();
	metadataArray.forEach(metadata => {
		metadataMap.set(metadata.id, metadata);
	});
	return metadataMap;
}

type ModelMetadataType = 'prod' | 'modelLab';

class ModelMetadataRequest implements CacheableRequest {
	constructor(readonly hash: string) { }
}

export class TestModelMetadataFetcher extends ModelMetadataFetcher {

	private static Queues = new SequencerByKey<ModelMetadataType>();

	get isModelLab(): boolean { return this._isModelLab; }

	private readonly cache: SQLiteCache<ModelMetadataRequest, IChatModelInformation[]>;

	constructor(
		_isModelLab: boolean,
		info: CurrentTestRunInfo | undefined,
		private readonly _skipModelMetadataCache: boolean = false,
		@IOctoKitService _octoKitService: IOctoKitService,
		@IConfigurationService _configService: IConfigurationService,
		@IExperimentationService _expService: IExperimentationService,
		@IEnvService _envService: IEnvService,
		@IAuthenticationService _authService: IAuthenticationService,
		@ILogService _logService: ILogService,
		@IRequestLogger _requestLogger: IRequestLogger,
		@IInstantiationService _instantiationService: IInstantiationService,
	) {
		super(
			_isModelLab,
			_octoKitService,
			_requestLogger,
			_configService,
			_expService,
			_envService,
			_authService,
			_logService,
			_instantiationService,
		);

		this.cache = new SQLiteCache<ModelMetadataRequest, IChatModelInformation[]>('modelMetadata', TestingCacheSalts.modelMetadata, info);
	}

	override async getAllChatModels(): Promise<IChatModelInformation[]> {
		const type = this._isModelLab ? 'modelLab' : 'prod';
		const req = new ModelMetadataRequest(type);

		return await TestModelMetadataFetcher.Queues.queue(type, async () => {
			if (this._skipModelMetadataCache) {
				return super.getAllChatModels();
			}
			const result = await this.cache.get(req);
			if (result) {
				return result;
			}

			// If the cache doesn't have the result, we need to fetch it
			const modelInfo = await super.getAllChatModels();
			await this.cache.set(req, modelInfo);
			return modelInfo;
		});
	}
}

export class TestEndpointProvider implements IEndpointProvider {

	declare readonly _serviceBrand: undefined;

	readonly onDidModelsRefresh = Event.None;

	private _testEmbeddingEndpoint: IEmbeddingsEndpoint | undefined;
	private _chatEndpoints: Map<string, IChatEndpoint> = new Map();
	private _prodChatModelMetadata: Promise<Map<string, IChatModelInformation>>;
	private _modelLabChatModelMetadata: Promise<Map<string, IChatModelInformation>>;

	constructor(
		private readonly gpt4ModelToRunAgainst: string | undefined,
		private readonly gpt4oMiniModelToRunAgainst: string | undefined,
		_fastRewriteModelToRunAgainst: string | undefined,
		info: CurrentTestRunInfo | undefined,
		skipModelMetadataCache: boolean,
		private readonly customModelConfigs: Map<string, IModelConfig> = new Map(),
		@IInstantiationService private readonly _instantiationService: IInstantiationService
	) {
		const prodModelMetadata = this._instantiationService.createInstance(TestModelMetadataFetcher, false, info, skipModelMetadataCache);
		const modelLabModelMetadata = this._instantiationService.createInstance(TestModelMetadataFetcher, true, info, skipModelMetadataCache);
		this._prodChatModelMetadata = getModelMetadataMap(prodModelMetadata);
		this._modelLabChatModelMetadata = getModelMetadataMap(modelLabModelMetadata);
	}

	private async getChatEndpointInfo(model: string, modelLabMetadata: Map<string, IChatModelInformation>, prodMetadata: Map<string, IChatModelInformation>): Promise<IChatEndpoint> {
		let chatEndpoint = this._chatEndpoints.get(model);
		if (!chatEndpoint) {
			const customModel = this.customModelConfigs.get(model);
			if (customModel !== undefined) {
				chatEndpoint = this._instantiationService.createInstance(OpenAICompatibleTestEndpoint, customModel);
			} else if (model === CHAT_MODEL.CUSTOM_NES) {
				chatEndpoint = this._instantiationService.createInstance(CustomNesEndpoint);
			} else if (model === CHAT_MODEL.EXPERIMENTAL) {
				chatEndpoint = this._instantiationService.createInstance(AzureTestEndpoint, model);
			} else {
				const isProdModel = prodMetadata.has(model);
				const modelMetadata: IChatModelInformation | undefined = isProdModel ? prodMetadata.get(model) : modelLabMetadata.get(model);
				if (!modelMetadata) {
					throw new Error(`Model ${model} not found`);
				}
				chatEndpoint = this._instantiationService.createInstance(CAPITestEndpoint, modelMetadata, !isProdModel);
			}
			this._chatEndpoints.set(model, chatEndpoint);
		}
		return chatEndpoint;
	}

	async getAllCompletionModels(forceRefresh?: boolean): Promise<ICompletionModelInformation[]> {
		throw new Error('getAllCompletionModels is not implemented in TestEndpointProvider');
	}

	async getAllChatEndpoints(): Promise<IChatEndpoint[]> {
		const modelIDs: Set<string> = new Set([
			CHAT_MODEL.CUSTOM_NES
		]);

		if (this.customModelConfigs.size > 0) {
			this.customModelConfigs.forEach(config => {
				modelIDs.add(config.name);
			});
		}

		const modelLabMetadata: Map<string, IChatModelInformation> = await this._modelLabChatModelMetadata;
		const prodMetadata: Map<string, IChatModelInformation> = await this._prodChatModelMetadata;
		modelLabMetadata.forEach((modelMetadata) => {
			modelIDs.add(modelMetadata.id);
		});
		prodMetadata.forEach((modelMetadata) => {
			modelIDs.add(modelMetadata.id);
		});
		for (const model of modelIDs) {
			this._chatEndpoints.set(model, await this.getChatEndpointInfo(model, modelLabMetadata, prodMetadata));
		}
		return Array.from(this._chatEndpoints.values());
	}
	async getChatEndpoint(requestOrFamilyOrModel: LanguageModelChat | ChatRequest | ChatEndpointFamily): Promise<IChatEndpoint> {
		if (typeof requestOrFamilyOrModel !== 'string') {
			requestOrFamilyOrModel = 'copilot-base';
		}
		if (requestOrFamilyOrModel === 'copilot-base') {
			return await this.getChatEndpointInfo(this.gpt4ModelToRunAgainst ?? CHAT_MODEL.GPT41, await this._modelLabChatModelMetadata, await this._prodChatModelMetadata);
		} else {
			return await this.getChatEndpointInfo(this.gpt4oMiniModelToRunAgainst ?? CHAT_MODEL.GPT4OMINI, await this._modelLabChatModelMetadata, await this._prodChatModelMetadata);
		}
	}
	async getEmbeddingsEndpoint(family?: EmbeddingsEndpointFamily): Promise<IEmbeddingsEndpoint> {
		const id = LEGACY_EMBEDDING_MODEL_ID.TEXT3SMALL;
		const modelInformation: IEmbeddingModelInformation = {
			id: id,
			vendor: 'Test Provider',
			name: id,
			version: '1.0',
			model_picker_enabled: false,
			is_chat_default: false,
			billing: { is_premium: false, multiplier: 0 },
			is_chat_fallback: false,
			capabilities: {
				type: 'embeddings',
				tokenizer: TokenizerType.O200K,
				family: 'test'
			}
		};
		this._testEmbeddingEndpoint ??= this._instantiationService.createInstance(EmbeddingEndpoint, modelInformation);
		return this._testEmbeddingEndpoint;
	}
}
