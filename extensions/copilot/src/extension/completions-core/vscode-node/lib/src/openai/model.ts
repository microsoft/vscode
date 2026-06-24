/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IAuthenticationService } from '../../../../../../platform/authentication/common/authentication';
import { ICompletionModelInformation, IEndpointProvider } from '../../../../../../platform/endpoint/common/endpointProvider';
import { createServiceIdentifier } from '../../../../../../util/common/services';
import { Disposable } from '../../../../../../util/vs/base/common/lifecycle';
import { IInstantiationService } from '../../../../../../util/vs/platform/instantiation/common/instantiation';
import { getUserSelectedModelConfiguration } from '../../../extension/src/modelPickerUserSelection';
import { TokenizerName } from '../../../prompt/src/tokenization';
import { Emitter, Event } from '../util/event';
import { onCopilotToken } from '../auth/copilotTokenNotifier';
import { ConfigKey, getConfig } from '../config';
import { ICompletionsFeaturesService } from '../experiments/featuresService';
import { ICompletionsLogTargetService, LogLevel } from '../logger';
import { TelemetryWithExp } from '../telemetry';
import { CompletionHeaders } from './fetch';

export const ICompletionsModelManagerService = createServiceIdentifier<ICompletionsModelManagerService>('ICompletionsModelManagerService');
export interface ICompletionsModelManagerService {
	readonly _serviceBrand: undefined;
	readonly onDidChangeModels: Event<void>;
	getGenericCompletionModels(): ModelItem[];
	getDefaultModelId(): string;
	getTokenizerForModel(modelId: string): TokenizerName;
	getCurrentModelRequestInfo(featureSettings?: TelemetryWithExp): ModelRequestInfo;
}

const FallbackModelId = 'gpt-41-copilot';
export class AvailableModelsManager extends Disposable implements ICompletionsModelManagerService {
	declare _serviceBrand: undefined;
	fetchedModelData: ICompletionModelInformation[] = [];
	customModels: string[] = [];
	editorPreviewFeaturesDisabled: boolean = false;
	private readonly _onDidChangeModels = this._register(new Emitter<void>());
	readonly onDidChangeModels = this._onDidChangeModels.event;

	constructor(
		shouldFetch: boolean = true,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@ICompletionsFeaturesService private readonly _featuresService: ICompletionsFeaturesService,
		@IEndpointProvider private readonly _endpointProvider: IEndpointProvider,
		@IAuthenticationService authenticationService: IAuthenticationService,
		@ICompletionsLogTargetService private readonly _logService: ICompletionsLogTargetService,
	) {
		super();

		if (shouldFetch) {
			this._register(onCopilotToken(authenticationService, () => this.refreshAvailableModels()));
		}
	}

	// This will get its initial call after the initial token got fetched
	private async refreshAvailableModels(): Promise<void> {
		await this.refreshModels();
	}

	/**
	 * Returns the default model, determined by the order returned from the API
	 * Note: this does NOT fetch models to avoid side effects
	 */
	getDefaultModelId(): string {
		if (this.fetchedModelData) {
			const fetchedDefaultModel = AvailableModelsManager.filterCompletionModels(
				this.fetchedModelData,
				this.editorPreviewFeaturesDisabled
			)[0];

			if (fetchedDefaultModel) {
				return fetchedDefaultModel.id;
			}
		}

		return FallbackModelId;
	}

	async refreshModels(): Promise<void> {
		const fetchedData = await this._endpointProvider.getAllCompletionModels(true);
		if (fetchedData) {
			this.fetchedModelData = fetchedData;
			this._onDidChangeModels.fire();
		}
	}

	/**
	 * Returns a list of models that are available for generic completions.
	 * Calls to CAPI to retrieve the list.
	 */
	getGenericCompletionModels(): ModelItem[] {
		const filteredResult = AvailableModelsManager.filterCompletionModels(
			this.fetchedModelData,
			this.editorPreviewFeaturesDisabled
		);

		return AvailableModelsManager.mapCompletionModels(filteredResult);
	}

	getTokenizerForModel(modelId: string): TokenizerName {
		const modelItems = this.getGenericCompletionModels();
		const modelItem = modelItems.find(item => item.modelId === modelId);
		if (modelItem) {
			return modelItem.tokenizer as TokenizerName;
		}
		// The tokenizer the default model uses
		return TokenizerName.o200k;
	}

	static filterCompletionModels(data: ICompletionModelInformation[], editorPreviewFeaturesDisabled: boolean): ICompletionModelInformation[] {
		return data
			.filter(item => item.capabilities.type === 'completion')
			.filter(item => !editorPreviewFeaturesDisabled || item.preview === false || item.preview === undefined);
	}

	static filterModelsWithEditorPreviewFeatures(
		data: ICompletionModelInformation[],
		editorPreviewFeaturesDisabled: boolean
	): ICompletionModelInformation[] {
		return data.filter(
			item => !editorPreviewFeaturesDisabled || item.preview === false || item.preview === undefined
		);
	}

	static mapCompletionModels(data: ICompletionModelInformation[]): ModelItem[] {
		return data.map(item => ({
			modelId: item.id,
			label: item.name,
			preview: !!item.preview,
			tokenizer: item.capabilities.tokenizer,
		}));
	}

	getCurrentModelRequestInfo(featureSettings: TelemetryWithExp | undefined = undefined): ModelRequestInfo {
		const defaultModelId = this.getDefaultModelId();
		let userSelectedCompletionModel = this._instantiationService.invokeFunction(getUserSelectedModelConfiguration);
		if (userSelectedCompletionModel) {
			const genericModels = this.getGenericCompletionModels().map(model => model.modelId);
			if (!genericModels.includes(userSelectedCompletionModel)) {
				if (genericModels.length > 0) {
					this._logService.logIt(
						LogLevel.INFO,
						`User selected model ${userSelectedCompletionModel} is not in the list of generic models: ${genericModels.join(', ')}, falling back to default model.`
					);
				}
				userSelectedCompletionModel = null;
			}
			if (defaultModelId === userSelectedCompletionModel) {
				userSelectedCompletionModel = null;
			}
		}

		const debugOverride =
			this._instantiationService.invokeFunction(getConfig<string>, ConfigKey.DebugOverrideEngine) ||
			this._instantiationService.invokeFunction(getConfig<string>, ConfigKey.DebugOverrideEngineLegacy);

		if (debugOverride) {
			return new ModelRequestInfo(debugOverride, 'override');
		}

		const customEngine = featureSettings ? this._featuresService.customEngine(featureSettings) : undefined;
		const targetEngine = featureSettings ? this._featuresService.customEngineTargetEngine(featureSettings) : undefined;

		if (userSelectedCompletionModel) {
			// If the user selected completion model matches the targetEngine, use the custom engine
			if (customEngine && targetEngine && userSelectedCompletionModel === targetEngine) {
				return new ModelRequestInfo(customEngine, 'exp');
			}

			return new ModelRequestInfo(userSelectedCompletionModel, 'modelpicker');
		}

		if (customEngine) {
			return new ModelRequestInfo(customEngine, 'exp');
		}

		if (this.customModels.length > 0) {
			return new ModelRequestInfo(this.customModels[0], 'custommodel');
		}

		return new ModelRequestInfo(defaultModelId, 'default');
	}
}

export interface ModelItem {
	modelId: string;
	label: string;
	preview: boolean;
	tokenizer: string;
}

export type ModelChoiceSourceTelemetryValue =
	| 'override'
	| 'modelpicker'
	| 'exp'
	| 'default'
	| 'custommodel'
	| 'prerelease';

class ModelRequestInfo {
	constructor(
		readonly modelId: string,
		readonly modelChoiceSource: ModelChoiceSourceTelemetryValue
	) { }

	get headers(): CompletionHeaders {
		return {};
	}
}
