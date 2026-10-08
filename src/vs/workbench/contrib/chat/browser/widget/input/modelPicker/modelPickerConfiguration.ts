/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../../../base/browser/dom.js';
import { localize } from '../../../../../../../nls.js';
import { ILanguageModelChatMetadataAndIdentifier } from '../../../../common/languageModels.js';
import { getModelConfigDescription, getModelConfigProperty, getModelConfigSummary, IModelConfigurationAccess, MODEL_CONFIG_GROUP_CONTEXT, MODEL_CONFIG_GROUP_EFFORT } from './modelPickerModelConfig.js';
import { isAutoModel, isHydraFusionModel } from './modelPickerPresentation.js';

/**
 * Renders the thinking effort and context readout shown beside the model name in the
 * chat input. It opens the model's details, or the routing choices for Auto and
 * HydraFusion, and is hidden when there is nothing to show.
 */
export function renderModelConfigurationButton(
	button: HTMLElement,
	model: ILanguageModelChatMetadataAndIdentifier | undefined,
	configurationAccess: IModelConfigurationAccess,
	hidden: boolean,
): void {
	const summary = getModelConfigSummary(model, configurationAccess);
	const configurable = !!getModelConfigProperty(model, configurationAccess, MODEL_CONFIG_GROUP_EFFORT) || !!getModelConfigProperty(model, configurationAccess, MODEL_CONFIG_GROUP_CONTEXT);
	if (hidden || !model || (!configurable && !summary)) {
		button.style.display = 'none';
		return;
	}

	const label = summary ?? localize('chat.modelPicker.configureLabel', "Configure");
	dom.reset(button, dom.$('span.chat-input-picker-label', undefined, label));
	button.style.display = '';
	const description = getModelConfigDescription(model, configurationAccess) ?? label;
	button.ariaLabel = isAutoModel(model) || isHydraFusionModel(model)
		? localize('chat.modelPicker.autoOptionsAriaLabel', "{0} options, {1}", model.metadata.name, description)
		: localize('chat.modelPicker.detailsAriaLabel', "{0} details, {1}", model.metadata.name, description);
}
