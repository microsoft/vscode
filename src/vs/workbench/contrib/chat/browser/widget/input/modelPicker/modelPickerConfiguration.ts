/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../../../base/browser/dom.js';
import { localize } from '../../../../../../../nls.js';
import { ILanguageModelChatMetadataAndIdentifier } from '../../../../common/languageModels.js';
import type { ILocalModelConfigSummary } from './modelPickerLocalModelItems.js';
import { getModelConfigDescription, getModelConfigProperty, getModelConfigSummary, IModelConfigurationAccess, MODEL_CONFIG_GROUP_CONTEXT, MODEL_CONFIG_GROUP_EFFORT } from './modelPickerModelConfig.js';

/**
 * Renders the thinking effort and context readout shown beside the model name in the
 * chat input. It opens the model's details, which for Auto hold its routing tiers, and
 * is hidden when there is nothing to show. An on-device model shows
 * `localModelReadout` instead: its short state while it isn't ready, otherwise its
 * thinking level and context size, with all of them in its accessible label and
 * hover, and opens its family's detail page.
 */
export function renderModelConfigurationButton(
	button: HTMLElement,
	model: ILanguageModelChatMetadataAndIdentifier | undefined,
	configurationAccess: IModelConfigurationAccess,
	hidden: boolean,
	tierLabel?: string,
	localModelReadout?: ILocalModelConfigSummary,
): void {
	if (!hidden && model && localModelReadout) {
		dom.reset(button, dom.$('span.chat-input-picker-label', undefined, localModelReadout.label));
		button.style.display = '';
		button.ariaLabel = localize('chat.modelPicker.detailsAriaLabel', "{0} details, {1}", model.metadata.name, localModelReadout.description);
		return;
	}
	const summary = tierLabel ?? getModelConfigSummary(model, configurationAccess);
	const configurable = !!getModelConfigProperty(model, configurationAccess, MODEL_CONFIG_GROUP_EFFORT) || !!getModelConfigProperty(model, configurationAccess, MODEL_CONFIG_GROUP_CONTEXT);
	if (hidden || !model || (!configurable && !summary)) {
		button.style.display = 'none';
		return;
	}

	const label = summary ?? localize('chat.modelPicker.configureLabel', "Configure");
	dom.reset(button, dom.$('span.chat-input-picker-label', undefined, label));
	button.style.display = '';
	const description = (tierLabel ? undefined : getModelConfigDescription(model, configurationAccess)) ?? label;
	button.ariaLabel = localize('chat.modelPicker.detailsAriaLabel', "{0} details, {1}", model.metadata.name, description);
}
