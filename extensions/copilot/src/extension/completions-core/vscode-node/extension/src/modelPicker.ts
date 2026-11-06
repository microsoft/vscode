/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { commands, env, QuickPick, QuickPickItem, QuickPickItemKind, Uri, window, workspace } from 'vscode';
import { IInstantiationService } from '../../../../../util/vs/platform/instantiation/common/instantiation';
import { ConfigKey } from '../../lib/src/config';
import { CopilotConfigPrefix } from '../../lib/src/constants';
import { AsyncCompletionManager, ICompletionsAsyncManagerService } from '../../lib/src/ghostText/asyncCompletions';
import { CompletionsCache, ICompletionsCacheService } from '../../lib/src/ghostText/completionsCache';
import { ICompletionsLogTargetService, Logger } from '../../lib/src/logger';
import { AvailableModelsManager, ICompletionsModelManagerService, ModelItem } from '../../lib/src/openai/model';
import { telemetry, TelemetryData } from '../../lib/src/telemetry';
import { HasMultipleCompletionModels } from './constants';
import { getUserSelectedModelConfiguration } from './modelPickerUserSelection';
const logger = new Logger('modelPicker');

interface ModelPickerItem extends Omit<ModelItem, 'preview' | 'tokenizer'>, QuickPickItem {
	// Distinguish between items in the quick pick
	type: 'model' | 'separator' | 'learn-more';
}

// Separator and learn-more links are always shown in the quick pick
const defaultModelPickerItems: ModelPickerItem[] = [
	// Add separator after the models
	{
		label: '',
		kind: QuickPickItemKind.Separator,
		modelId: 'separator',
		type: 'separator' as const,
		alwaysShow: true,
	},
	// Add "Learn more" item at the end
	{
		modelId: 'learn-more',
		label: 'Learn more $(link-external)',
		description: '',
		alwaysShow: true,
		type: 'learn-more' as const,
	},
];

export class ModelPickerManager {
	// URL for information about Copilot models
	private readonly MODELS_INFO_URL = 'https://aka.ms/CopilotCompletionsModelPickerLearnMore';

	get models(): ModelItem[] {
		return this._modelManager.getGenericCompletionModels();
	}

	hasMultipleModels(): boolean {
		return this.models.length > 1;
	}

	private getDefaultModelId(): string {
		return this._modelManager.getDefaultModelId();
	}

	constructor(
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@ICompletionsAsyncManagerService private readonly _asyncCompletionManager: AsyncCompletionManager,
		@ICompletionsModelManagerService private readonly _modelManager: AvailableModelsManager,
		@ICompletionsLogTargetService private readonly _logTarget: ICompletionsLogTargetService,
		@ICompletionsCacheService private readonly _completionsCache: CompletionsCache
	) {
		this._updateModelPickerContext();
		this._modelManager.onDidChangeModels(() => this._updateModelPickerContext());
	}

	private _updateModelPickerContext(): void {
		void commands.executeCommand('setContext', HasMultipleCompletionModels, this.hasMultipleModels());
	}

	async setUserSelectedCompletionModel(modelId: string | null) {
		return workspace
			.getConfiguration(CopilotConfigPrefix)
			.update(ConfigKey.UserSelectedCompletionModel, modelId ?? '', true);
	}

	async handleModelSelection(quickpickList: QuickPick<ModelPickerItem>) {
		const model = quickpickList.activeItems[0];
		if (model === undefined) {
			return;
		}
		quickpickList.hide();

		// Open up the link
		if (model.type === 'learn-more') {
			await env.openExternal(Uri.parse(this.MODELS_INFO_URL));
			this._instantiationService.invokeFunction(telemetry, 'modelPicker.learnMoreClicked');
			return;
		}

		await this.selectModel(model);
	}

	async selectModel(model: ModelPickerItem) {
		const currentModel = this._instantiationService.invokeFunction(getUserSelectedModelConfiguration);

		if (currentModel !== model.modelId) {
			this._completionsCache.clear();
			this._asyncCompletionManager.clear();
		}

		const modelSelection = model.modelId === this.getDefaultModelId() ? null : model.modelId;
		await this.setUserSelectedCompletionModel(modelSelection);
		if (modelSelection === null) {
			logger.info(this._logTarget, `User selected default model; setting null`);
		} else {
			logger.info(this._logTarget, `Selected model: ${model.modelId}`);
		}

		this._instantiationService.invokeFunction(
			telemetry,
			'modelPicker.modelSelected',
			TelemetryData.createAndMarkAsIssued({
				engineName: modelSelection ?? 'default',
			})
		);
	}

	private modelsForModelPicker(): [string | null, ModelPickerItem[]] {
		const currentModelSelection = this._instantiationService.invokeFunction(getUserSelectedModelConfiguration);
		const items: ModelPickerItem[] = this.models.map(model => {
			return {
				modelId: model.modelId,
				label: `${model.label}${model.preview ? ' (Preview)' : ''}`,
				description: `(${model.modelId})`,
				alwaysShow: model.modelId === this.getDefaultModelId(),
				type: 'model' as const,
			};
		});

		return [currentModelSelection, items];
	}

	showModelPicker(): QuickPick<ModelPickerItem> {
		const [currentModelSelection, items] = this.modelsForModelPicker();

		const quickPick = window.createQuickPick<ModelPickerItem>();
		quickPick.title = 'Change Completions Model';
		quickPick.items = [...items, ...defaultModelPickerItems];
		quickPick.onDidAccept(() => this.handleModelSelection(quickPick));

		const currentModelOrDefault = currentModelSelection ?? this.getDefaultModelId();

		// set the currently selected model as active
		const selectedItem = quickPick.items.find(item => item.modelId === currentModelOrDefault);
		if (selectedItem) {
			quickPick.activeItems = [selectedItem];
		}

		quickPick.show();
		return quickPick;
	}
}


