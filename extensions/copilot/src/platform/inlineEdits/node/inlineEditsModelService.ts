/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type * as vscode from 'vscode';
import { filterMap } from '../../../util/common/arrays';
import { TaskQueue } from '../../../util/common/async';
import { ErrorUtils } from '../../../util/common/errors';
import { pushMany } from '../../../util/vs/base/common/arrays';
import { assertNever, softAssert } from '../../../util/vs/base/common/assert';
import { Emitter, Event } from '../../../util/vs/base/common/event';
import { Disposable } from '../../../util/vs/base/common/lifecycle';
import { derived, IObservable, observableFromEvent } from '../../../util/vs/base/common/observable';
import { CopilotToken } from '../../authentication/common/copilotToken';
import { ICopilotTokenStore } from '../../authentication/common/copilotTokenStore';
import { ConfigKey, ExperimentBasedConfig, IConfigurationService } from '../../configuration/common/configurationService';
import { IVSCodeExtensionContext } from '../../extContext/common/extensionContext';
import { ILogger, ILogService } from '../../log/common/logService';
import { IProxyModelsService } from '../../proxyModels/common/proxyModelsService';
import { IExperimentationService } from '../../telemetry/common/nullExperimentationService';
import { ITelemetryService } from '../../telemetry/common/telemetry';
import { WireTypes } from '../common/dataTypes/inlineEditsModelsTypes';
import { isPromptingStrategy, MODEL_CONFIGURATION_VALIDATOR, ModelConfiguration, PromptingStrategy } from '../common/dataTypes/xtabPromptOptions';
import { IInlineEditsModelService, IUndesiredModelsManager } from '../common/inlineEditsModelService';

const enum ModelSource {
	LocalConfig = 'localConfig',
	ExpConfig = 'expConfig',
	ExpDefaultConfig = 'expDefaultConfig',
	Fetched = 'fetched',
	HardCodedDefault = 'hardCodedDefault',
}

interface ModelConfigurationWithSource extends ModelConfiguration {
	source: ModelSource;
}

type ModelInfo = {
	models: ModelConfigurationWithSource[];
	currentModelId: string;
}

export class InlineEditsModelService extends Disposable implements IInlineEditsModelService {

	_serviceBrand: undefined;

	private static readonly COPILOT_NES_XTAB_MODEL: ModelConfigurationWithSource = {
		modelName: 'copilot-nes-xtab',
		promptingStrategy: PromptingStrategy.CopilotNesXtab,
		includeTagsInCurrentFile: true,
		source: ModelSource.HardCodedDefault,
		lintOptions: undefined,
	};

	private static readonly COPILOT_NES_OCT: ModelConfigurationWithSource = {
		modelName: 'copilot-nes-oct',
		promptingStrategy: PromptingStrategy.Xtab275,
		includeTagsInCurrentFile: false,
		source: ModelSource.HardCodedDefault,
		lintOptions: undefined,
	};

	private static readonly COPILOT_NES_CALLISTO: ModelConfigurationWithSource = {
		modelName: 'nes-callisto',
		promptingStrategy: PromptingStrategy.Xtab275,
		includeTagsInCurrentFile: false,
		source: ModelSource.HardCodedDefault,
		lintOptions: undefined,
	};

	private _copilotTokenObs = observableFromEvent(this, this._tokenStore.onDidStoreUpdate, () => this._tokenStore.copilotToken);

	// TODO@ulugbekna: use a derived observable such that it fires only when nesModels change
	private _fetchedModelsObs = observableFromEvent(this, this._proxyModelsService.onModelListUpdated, () => this._proxyModelsService.nesModels);

	private _preferredModelNameObs = this._configService.getExperimentBasedConfigObservable(ConfigKey.Advanced.InlineEditsPreferredModel, this._expService);
	private _localModelConfigObs = this._configService.getConfigObservable(ConfigKey.TeamInternal.InlineEditsXtabProviderModelConfiguration);
	private _expBasedModelConfigObs = this._configService.getExperimentBasedConfigObservable(ConfigKey.TeamInternal.InlineEditsXtabProviderModelConfigurationString, this._expService);
	private _defaultModelConfigObs = this._configService.getExperimentBasedConfigObservable(ConfigKey.TeamInternal.InlineEditsXtabProviderDefaultModelConfigurationString, this._expService);
	private _useSlashModelsObs = this._configService.getExperimentBasedConfigObservable(ConfigKey.TeamInternal.InlineEditsUseSlashModels, this._expService);
	private _undesiredModelsObs = observableFromEvent(this, this._undesiredModelsManager.onDidChange, () => this._undesiredModelsManager);

	private _modelsObs: IObservable<ModelConfigurationWithSource[]>;
	private _currentModelObs: IObservable<ModelConfigurationWithSource>;
	private _modelInfoObs: IObservable<ModelInfo>;

	public readonly onModelListUpdated: Event<void>;

	private readonly _setModelQueue = new TaskQueue();
	private _logger: ILogger;

	constructor(
		@ICopilotTokenStore private readonly _tokenStore: ICopilotTokenStore,
		@IProxyModelsService private readonly _proxyModelsService: IProxyModelsService,
		@IUndesiredModelsManager private readonly _undesiredModelsManager: IUndesiredModelsManager,
		@IConfigurationService private readonly _configService: IConfigurationService,
		@IExperimentationService private readonly _expService: IExperimentationService,
		@ITelemetryService private readonly _telemetryService: ITelemetryService,
		@ILogService private readonly _logService: ILogService,
	) {
		super();

		this._logger = _logService.createSubLogger(['NES', 'ModelsService']);

		const logger = this._logger.createSubLogger('constructor');

		this._modelsObs = derived((reader) => {
			logger.trace('computing models');
			return this.aggregateModels({
				copilotToken: this._copilotTokenObs.read(reader),
				fetchedNesModels: this._fetchedModelsObs.read(reader),
				localModelConfig: this._localModelConfigObs.read(reader),
				modelConfigString: this._expBasedModelConfigObs.read(reader),
				defaultModelConfigString: this._defaultModelConfigObs.read(reader),
				useSlashModels: this._useSlashModelsObs.read(reader),
			});
		}).recomputeInitiallyAndOnChange(this._store);

		this._currentModelObs = derived<ModelConfigurationWithSource, void>((reader) => {
			logger.trace('computing current model');
			const undesiredModelsManager = this._undesiredModelsObs.read(reader);
			return this._pickModel({
				preferredModelName: this._preferredModelNameObs.read(reader),
				models: this._modelsObs.read(reader),
				undesiredModelsManager,
			});
		}).recomputeInitiallyAndOnChange(this._store);

		this._modelInfoObs = derived((reader) => {
			logger.trace('computing model info');
			return {
				models: this._modelsObs.read(reader),
				currentModelId: this._currentModelObs.read(reader).modelName,
			};
		}).recomputeInitiallyAndOnChange(this._store);

		this.onModelListUpdated = Event.fromObservableLight(this._modelInfoObs);
	}

	get modelInfo(): vscode.InlineCompletionModelInfo | undefined {
		const models: vscode.InlineCompletionModel[] = this._modelsObs.get().map(m => ({
			id: m.modelName,
			name: m.modelName,
		}));

		const currentModel = this._currentModelObs.get();

		return {
			models,
			currentModelId: currentModel.modelName,
		};
	}


	setCurrentModelId(newPreferredModelId: string): Promise<void> {
		return this._setModelQueue.schedule(() => this._setCurrentModelIdCore(newPreferredModelId));
	}

	private async _setCurrentModelIdCore(newPreferredModelId: string): Promise<void> {
		const currentPreferredModelId = this._configService.getExperimentBasedConfig(ConfigKey.Advanced.InlineEditsPreferredModel, this._expService);

		const isSameModel = currentPreferredModelId === newPreferredModelId;
		if (isSameModel) {
			return;
		}

		// snapshot before async calls
		const currentPreferredModel = this._currentModelObs.get();

		const models = this._modelsObs.get();
		const newPreferredModel = models.find(m => m.modelName === newPreferredModelId);

		if (newPreferredModel === undefined) {
			this._logService.error(`New preferred model id ${newPreferredModelId} not found in model list.`);
			return;
		}

		// if currently selected model is from exp config, then mark that model as undesired
		if (currentPreferredModel.source === ModelSource.ExpConfig) {
			await this._undesiredModelsManager.addUndesiredModelId(currentPreferredModel.modelName);
		}

		if (this._undesiredModelsManager.isUndesiredModelId(newPreferredModelId)) {
			await this._undesiredModelsManager.removeUndesiredModelId(newPreferredModelId);
		}

		// if user picks same as the default model, we should reset the user setting
		// otherwise, update the model
		const expectedDefaultModel = this._pickModel({ preferredModelName: 'none', models, undesiredModelsManager: this._undesiredModelsManager });
		if (newPreferredModel.source === ModelSource.ExpConfig || // because exp-configured model already takes highest priority
			(newPreferredModelId === expectedDefaultModel.modelName && !models.some(m => m.source === ModelSource.ExpConfig))
		) {
			this._logger.trace(`New preferred model id ${newPreferredModelId} is the same as the default model, resetting user setting.`);
			await this._configService.setConfig(ConfigKey.Advanced.InlineEditsPreferredModel, 'none');
		} else {
			this._logger.trace(`New preferred model id ${newPreferredModelId} is different from the default model, updating user setting to ${newPreferredModelId}.`);
			await this._configService.setConfig(ConfigKey.Advanced.InlineEditsPreferredModel, newPreferredModelId);
		}
	}

	private aggregateModels(
		{
			copilotToken,
			fetchedNesModels,
			localModelConfig,
			modelConfigString,
			defaultModelConfigString,
			useSlashModels,
		}: {
			copilotToken: CopilotToken | undefined;
			fetchedNesModels: WireTypes.Model.t[] | undefined;
			localModelConfig: ModelConfiguration | undefined;
			modelConfigString: string | undefined;
			defaultModelConfigString: string | undefined;
			useSlashModels: boolean;
		},
	): ModelConfigurationWithSource[] {
		const logger = this._logger.createSubLogger('aggregateModels');

		const models: ModelConfigurationWithSource[] = [];

		// priority of adding models to the list:
		// 0. model from user local setting
		// 1. model from modelConfigurationString setting (set through ExP)
		// 2. fetched models from /models endpoint (if useSlashModels is true)

		if (localModelConfig) {
			if (models.some(m => m.modelName === localModelConfig.modelName)) {
				logger.trace('Local model configuration already exists in the model list, skipping.');
			} else {
				logger.trace(`Adding local model configuration: ${localModelConfig.modelName}`);
				models.push({ ...localModelConfig, source: ModelSource.LocalConfig });
			}
		}

		if (modelConfigString) {
			logger.trace('Parsing modelConfigurationString...');
			const parsedConfig = this.parseModelConfigString(modelConfigString, ConfigKey.TeamInternal.InlineEditsXtabProviderModelConfigurationString);
			if (parsedConfig && !models.some(m => m.modelName === parsedConfig.modelName)) {
				logger.trace(`Adding model from modelConfigurationString: ${parsedConfig.modelName}`);
				models.push({ ...parsedConfig, source: ModelSource.ExpConfig });
			} else {
				logger.trace('No valid model found in modelConfigurationString.');
			}
		}

		if (useSlashModels && fetchedNesModels && fetchedNesModels.length > 0) {
			logger.trace(`Processing ${fetchedNesModels.length} fetched models...`);
			const filteredFetchedModels = filterMap(fetchedNesModels, (m) => {
				if (!isPromptingStrategy(m.capabilities.promptStrategy)) {
					return undefined;
				}
				if (models.some(knownModel => knownModel.modelName === m.name)) {
					logger.trace(`Fetched model ${m.name} already exists in the model list, skipping.`);
					return undefined;
				}
				return {
					modelName: m.name,
					promptingStrategy: m.capabilities.promptStrategy,
					includeTagsInCurrentFile: false, // FIXME@ulugbekna: determine this based on model capabilities and config
					source: ModelSource.Fetched,
					lintOptions: undefined,
				} satisfies ModelConfigurationWithSource;
			});
			logger.trace(`Adding ${filteredFetchedModels.length} fetched models after filtering.`);
			pushMany(models, filteredFetchedModels);
		} else {
			// push default model if /models doesn't give us any models
			logger.trace(`adding built-in default model: useSlashModels ${useSlashModels}, fetchedNesModels ${fetchedNesModels?.length ?? 'undefined'}`);

			const defaultModel = this.determineDefaultModel(copilotToken, defaultModelConfigString);
			if (defaultModel) {
				if (models.some(m => m.modelName === defaultModel.modelName)) {
					logger.trace('Default model configuration already exists in the model list, skipping.');
				} else {
					logger.trace(`Adding default model configuration: ${defaultModel.modelName}`);
					models.push(defaultModel);
				}
			}
		}

		return models;
	}

	public selectedModelConfiguration(): ModelConfiguration {
		return toModelConfiguration(this._currentModelObs.get());
	}

	public defaultModelConfiguration(): ModelConfiguration {
		const models = this._modelsObs.get();
		if (models && models.length > 0) {
			const defaultModels = models.filter(m => !this.isConfiguredModel(m));
			if (defaultModels.length > 0) {
				return toModelConfiguration(defaultModels[0]);
			}
		}
		return toModelConfiguration(this.determineDefaultModel(this._copilotTokenObs.get(), this._defaultModelConfigObs.get()));
	}

	private isConfiguredModel(model: ModelConfigurationWithSource): boolean {
		switch (model.source) {
			case ModelSource.LocalConfig:
			case ModelSource.ExpConfig:
			case ModelSource.ExpDefaultConfig:
				return true;
			case ModelSource.Fetched:
			case ModelSource.HardCodedDefault:
				return false;
			default:
				assertNever(model.source);
		}
	}

	private determineDefaultModel(copilotToken: CopilotToken | undefined, defaultModelConfigString: string | undefined): ModelConfigurationWithSource {
		// if a default model config string is specified, use that
		if (defaultModelConfigString) {
			const parsedConfig = this.parseModelConfigString(defaultModelConfigString, ConfigKey.TeamInternal.InlineEditsXtabProviderDefaultModelConfigurationString);
			if (parsedConfig) {
				return { ...parsedConfig, source: ModelSource.ExpDefaultConfig };
			}
		}

		// otherwise, use built-in defaults
		if (copilotToken?.isFcv1()) {
			return InlineEditsModelService.COPILOT_NES_XTAB_MODEL;
		} else if (copilotToken?.isFreeUser || copilotToken?.isNoAuthUser) {
			return InlineEditsModelService.COPILOT_NES_CALLISTO;
		} else {
			return InlineEditsModelService.COPILOT_NES_OCT;
		}
	}

	private _pickModel({
		preferredModelName,
		models,
		undesiredModelsManager,
	}: {
		preferredModelName: string;
		models: ModelConfigurationWithSource[];
		undesiredModelsManager: IUndesiredModelsManager;
	}): ModelConfigurationWithSource {
		// priority of picking a model:
		// 0. model from modelConfigurationString setting from ExP, unless marked as undesired
		// 1. user preferred model
		// 2. first model in the list

		const expConfiguredModel = models.find(m => m.source === ModelSource.ExpConfig);
		if (expConfiguredModel) {
			const isUndesiredModelId = undesiredModelsManager.isUndesiredModelId(expConfiguredModel.modelName);
			if (isUndesiredModelId) {
				this._logger.trace(`Exp-configured model ${expConfiguredModel.modelName} is marked as undesired by the user. Skipping.`);
			} else {
				return expConfiguredModel;
			}
		}

		const userHasPreferredModel = preferredModelName !== 'none';

		if (userHasPreferredModel) {
			const preferredModel = models.find(m => m.modelName === preferredModelName);
			if (preferredModel) {
				return preferredModel;
			}
		}

		softAssert(models.length > 0, 'InlineEdits model list should have at least one model');

		const model = models.at(0);
		if (model) {
			return model;
		}

		return this.determineDefaultModel(this._copilotTokenObs.get(), this._defaultModelConfigObs.get());
	}

	private parseModelConfigString(configString: string, configKey: ExperimentBasedConfig<string | undefined>): ModelConfiguration | undefined {
		let errorMessage: string;
		try {
			const parsed: unknown = JSON.parse(configString);
			const result = MODEL_CONFIGURATION_VALIDATOR.validate(parsed);
			if (!result.error) {
				return result.content;
			}
			errorMessage = result.error.message;
		} catch (e: unknown) {
			errorMessage = ErrorUtils.toString(ErrorUtils.fromUnknown(e));
		}

		/* __GDPR__
			"incorrectNesModelConfig" : {
				"owner": "ulugbekna",
				"comment": "Capture if model configuration string is invalid or malformed.",
				"configName": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Name of the configuration that failed to parse." },
				"errorMessage": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Error message from parsing or validation." },
				"configValue": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "The invalid config string." }
			}
		*/
		this._telemetryService.sendMSFTTelemetryEvent('incorrectNesModelConfig', { configName: configKey.id, errorMessage, configValue: configString });
		return undefined;
	}
}

function toModelConfiguration(model: ModelConfigurationWithSource): ModelConfiguration {
	const { source: _, ...config } = model;
	return config;
}

export namespace UndesiredModels {

	const UNDESIRED_MODELS_KEY = 'copilot.chat.nextEdits.undesiredModelIds';
	type UndesiredModelsValue = string[];

	export class Manager extends Disposable implements IUndesiredModelsManager {
		declare _serviceBrand: undefined;

		private readonly _onDidChange = this._register(new Emitter<void>());
		readonly onDidChange = this._onDidChange.event;

		private readonly _queue = new TaskQueue();

		constructor(
			@IVSCodeExtensionContext private readonly _vscodeExtensionContext: IVSCodeExtensionContext,
		) {
			super();
		}

		isUndesiredModelId(modelId: string) {
			const models = this._getModels();
			return models.includes(modelId);
		}

		addUndesiredModelId(modelId: string): Promise<void> {
			return this._queue.schedule(async () => {
				const models = this._getModels();
				if (!models.includes(modelId)) {
					models.push(modelId);
					await this._setModels(models);
					this._onDidChange.fire();
				}
			});
		}

		removeUndesiredModelId(modelId: string): Promise<void> {
			return this._queue.schedule(async () => {
				const models = this._getModels();
				const index = models.indexOf(modelId);
				if (index !== -1) {
					models.splice(index, 1);
					await this._setModels(models);
					this._onDidChange.fire();
				}
			});
		}

		private _getModels(): string[] {
			return this._vscodeExtensionContext.globalState.get<UndesiredModelsValue>(UNDESIRED_MODELS_KEY) ?? [];
		}

		private _setModels(models: string[]): Promise<void> {
			return new Promise((resolve, reject) => {
				this._vscodeExtensionContext.globalState.update(UNDESIRED_MODELS_KEY, models).then(resolve, reject);
			});
		}
	}
}

