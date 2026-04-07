/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { LanguageModelChat, type ChatRequest } from 'vscode';
import { IAuthenticationService } from '../../../platform/authentication/common/authentication';
import { IConfigurationService } from '../../../platform/configuration/common/configurationService';
import { ChatEndpointFamily, EmbeddingsEndpointFamily, IChatModelInformation, ICompletionModelInformation, IEmbeddingModelInformation, IEndpointProvider } from '../../../platform/endpoint/common/endpointProvider';
import { AutoChatEndpoint } from '../../../platform/endpoint/node/autoChatEndpoint';
import { IAutomodeService } from '../../../platform/endpoint/node/automodeService';
import { CopilotChatEndpoint } from '../../../platform/endpoint/node/copilotChatEndpoint';
import { EmbeddingEndpoint } from '../../../platform/endpoint/node/embeddingsEndpoint';
import { IModelMetadataFetcher, ModelMetadataFetcher } from '../../../platform/endpoint/node/modelMetadataFetcher';
import { ExtensionContributedChatEndpoint } from '../../../platform/endpoint/vscode-node/extChatEndpoint';
import { ILogService } from '../../../platform/log/common/logService';
import { IChatEndpoint, IEmbeddingsEndpoint } from '../../../platform/networking/common/networking';
import { Emitter, Event } from '../../../util/vs/base/common/event';
import { Disposable } from '../../../util/vs/base/common/lifecycle';
import { IInstantiationService } from '../../../util/vs/platform/instantiation/common/instantiation';


export class ProductionEndpointProvider extends Disposable implements IEndpointProvider {

	declare readonly _serviceBrand: undefined;

	private readonly _onDidModelsRefresh = this._register(new Emitter<void>());
	readonly onDidModelsRefresh: Event<void> = this._onDidModelsRefresh.event;

	private _chatEndpoints: Map<string, IChatEndpoint> = new Map();
	private _embeddingEndpoints: Map<string, IEmbeddingsEndpoint> = new Map();
	private readonly _modelFetcher: IModelMetadataFetcher;

	constructor(
		@IAutomodeService private readonly _autoModeService: IAutomodeService,
		@ILogService protected readonly _logService: ILogService,
		@IConfigurationService protected readonly _configService: IConfigurationService,
		@IInstantiationService protected readonly _instantiationService: IInstantiationService,
		@IAuthenticationService protected readonly _authService: IAuthenticationService,
	) {
		super();

		this._modelFetcher = this._instantiationService.createInstance(ModelMetadataFetcher,
			false,
		);

		// When new models come in from CAPI we want to clear our local caches and let the endpoints be recreated since there may be new info
		this._register(this._modelFetcher.onDidModelsRefresh(() => {
			this._chatEndpoints.clear();
			this._embeddingEndpoints.clear();
			this._onDidModelsRefresh.fire();
		}));
	}

	private getOrCreateChatEndpointInstance(modelMetadata: IChatModelInformation): IChatEndpoint {
		const modelId = modelMetadata.id;
		let chatEndpoint = this._chatEndpoints.get(modelId);
		if (!chatEndpoint) {
			chatEndpoint = this._instantiationService.createInstance(CopilotChatEndpoint, modelMetadata);
			this._chatEndpoints.set(modelId, chatEndpoint);
		}
		return chatEndpoint;
	}

	async getChatEndpoint(requestOrFamilyOrModel: LanguageModelChat | ChatRequest | ChatEndpointFamily): Promise<IChatEndpoint> {
		this._logService.trace(`Resolving chat model`);

		if (typeof requestOrFamilyOrModel === 'string') {
			const modelMetadata = await this._modelFetcher.getChatModelFromFamily(requestOrFamilyOrModel);
			return this.getOrCreateChatEndpointInstance(modelMetadata!);
		}

		const model = 'model' in requestOrFamilyOrModel ? requestOrFamilyOrModel.model : requestOrFamilyOrModel;

		if (!model) {
			return this.getChatEndpoint('copilot-base');
		}

		if (model.vendor !== 'copilot') {
			return this._instantiationService.createInstance(ExtensionContributedChatEndpoint, model);
		}

		if (model.id === AutoChatEndpoint.pseudoModelId) {
			try {
				const allEndpoints = await this.getAllChatEndpoints();
				return this._autoModeService.resolveAutoModeEndpoint(requestOrFamilyOrModel as ChatRequest, allEndpoints);
			} catch {
				return this.getChatEndpoint('copilot-base');
			}
		}

		const modelMetadata = await this._modelFetcher.getChatModelFromApiModel(model);
		// If we fail to resolve a model since this is panel we give copilot base. This really should never happen as the picker is powered by the same service.
		return modelMetadata ? this.getOrCreateChatEndpointInstance(modelMetadata) : this.getChatEndpoint('copilot-base');
	}

	async getEmbeddingsEndpoint(family?: EmbeddingsEndpointFamily): Promise<IEmbeddingsEndpoint> {
		this._logService.trace(`Resolving embedding model`);
		const modelMetadata = await this._modelFetcher.getEmbeddingsModel('text-embedding-3-small');
		const model = await this.getOrCreateEmbeddingEndpointInstance(modelMetadata);
		this._logService.trace(`Resolved embedding model`);
		return model;
	}

	private async getOrCreateEmbeddingEndpointInstance(modelMetadata: IEmbeddingModelInformation): Promise<IEmbeddingsEndpoint> {
		const modelId = 'text-embedding-3-small';
		let embeddingEndpoint = this._embeddingEndpoints.get(modelId);
		if (!embeddingEndpoint) {
			embeddingEndpoint = this._instantiationService.createInstance(EmbeddingEndpoint, modelMetadata);
			this._embeddingEndpoints.set(modelId, embeddingEndpoint);
		}
		return embeddingEndpoint;
	}

	async getAllCompletionModels(forceRefresh?: boolean): Promise<ICompletionModelInformation[]> {
		return this._modelFetcher.getAllCompletionModels(forceRefresh ?? false);
	}

	async getAllChatEndpoints(): Promise<IChatEndpoint[]> {
		const models: IChatModelInformation[] = await this._modelFetcher.getAllChatModels();
		return models.map(model => this.getOrCreateChatEndpointInstance(model));
	}
}
