/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IObservable } from '../../../../../../../base/common/observable.js';
import { CopilotImageGenerationModelSettingId } from '../../../../../../../platform/agentHost/common/copilotCliConfig.js';
import { IImageGenerationModelChoice, imageGenerationModelChoiceList } from '../../../../../../../platform/agentHost/common/imageGenerationConfiguration.js';
import { IConfigurationService } from '../../../../../../../platform/configuration/common/configuration.js';
import { observableConfigValue } from '../../../../../../../platform/observable/common/platformObservableUtils.js';

/** Shows an image toggle in the model picker's Copilot tab, which lists image models in place of chat models. */
export const ModelPickerImageModelsSettingId = 'chat.copilot.imageGeneration.showInModelPicker';

/** The image models a Copilot chat generates and edits images with, chosen from the model picker's Copilot tab. */
export interface IModelPickerImageModels {
	/** Every choice in display order, including the one that turns image generation off. */
	readonly models: readonly IImageGenerationModelChoice[];
	readonly selectedModelId: IObservable<string>;
	select(modelId: string): void;
}

/** Image models backed by the image model setting, so the picker and Settings always agree. */
export class ConfigurationModelPickerImageModels implements IModelPickerImageModels {
	readonly models = imageGenerationModelChoiceList;
	readonly selectedModelId: IObservable<string>;

	constructor(@IConfigurationService private readonly _configurationService: IConfigurationService) {
		this.selectedModelId = observableConfigValue(CopilotImageGenerationModelSettingId, '', _configurationService);
	}

	select(modelId: string): void {
		// The setting is application-scoped, so the write lands in the settings shared by every profile.
		void this._configurationService.updateValue(CopilotImageGenerationModelSettingId, modelId);
	}
}
