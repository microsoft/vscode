/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from '../../../nls.js';
import { ConfigurationScope, IConfigurationPropertySchema } from '../../configuration/common/configurationRegistry.js';
import { CopilotCliConfigKey, CopilotImageGenerationEnabledSettingId, CopilotImageGenerationModelSettingId, CopilotImageGenerationWatermarkSettingId, copilotCliConfigSchema } from './copilotCliConfig.js';

/** The {@link CopilotImageGenerationModelSettingId} value that turns image generation off. */
export const CopilotImageGenerationOff = 'off';

/**
 * Image models selectable in {@link CopilotImageGenerationModelSettingId}. The runtime serves one image model
 * and takes no model option, so list only the model the bundled runtime serves; selecting it turns generation on.
 */
export const CopilotImageGenerationModels = ['gpt-image-2.5-flare'] as const;

export type CopilotImageGenerationModel = typeof CopilotImageGenerationModels[number];
export type CopilotImageGenerationModelSetting = typeof CopilotImageGenerationOff | CopilotImageGenerationModel;

/** Whether a setting value selects a listed image model. `off`, retired models, and other values leave generation off. */
export function isImageGenerationModelSelected(value: unknown): value is CopilotImageGenerationModel {
	return CopilotImageGenerationModels.some(model => model === value);
}

/** Maps the legacy boolean setting onto a model selection, or `undefined` when it holds no boolean. */
export function migrateLegacyImageGenerationSetting(enabled: unknown): CopilotImageGenerationModelSetting | undefined {
	return typeof enabled === 'boolean' ? (enabled ? CopilotImageGenerationModels[0] : CopilotImageGenerationOff) : undefined;
}

/** A Settings dropdown entry; the markdown description carries the model's rates. */
interface IImageGenerationModelChoice {
	readonly label: string;
	readonly description: string;
}

const imageGenerationModelChoices: Record<CopilotImageGenerationModelSetting, IImageGenerationModelChoice> = {
	[CopilotImageGenerationOff]: {
		label: nls.localize('chat.copilot.imageGeneration.model.off.label', "Off"),
		description: nls.localize('chat.copilot.imageGeneration.model.off', "Agents cannot generate or edit images."),
	},
	'gpt-image-2.5-flare': {
		label: 'GPT Image 2.5 Flare',
		description: nls.localize('chat.copilot.imageGeneration.model.gptImage25Flare', "Generate and edit images with **GPT Image 2.5 Flare** when it is available to your account. Prompts and selected images are sent to Flare.\n\n**Preview rates (AI credits per 1 million tokens):**\n- **Text tokens:** 500 input / 0 output\n- **Image tokens:** 800 input / 3,000 output\n\nThese charges are in addition to the conversation model. Rates may change; these are token rates, not per-image prices."),
	},
};

const imageGenerationModelSettingValues: readonly CopilotImageGenerationModelSetting[] = [CopilotImageGenerationOff, ...CopilotImageGenerationModels];

export const imageGenerationConfigurationProperties = {
	[CopilotImageGenerationModelSettingId]: {
		type: 'string',
		enum: [...imageGenerationModelSettingValues],
		enumItemLabels: imageGenerationModelSettingValues.map(value => imageGenerationModelChoices[value].label),
		markdownEnumDescriptions: imageGenerationModelSettingValues.map(value => imageGenerationModelChoices[value].description),
		markdownDescription: nls.localize('chat.copilot.imageGeneration.model', "Selects the model Copilot uses to generate and edit images, or turns image generation off. Each model lists its rates. Account access and tool permissions still apply, and choosing **Off** prevents future image tool calls."),
		default: CopilotImageGenerationModels[0],
		scope: ConfigurationScope.APPLICATION,
		tags: ['preview', 'experimental'],
		experiment: { mode: 'auto' },
		agentHost: {
			key: CopilotCliConfigKey.ImageGeneration,
			// Hosts keep receiving an on/off flag because the runtime serves one image model and takes no model option.
			transform: isImageGenerationModelSelected,
		},
	},
	[CopilotImageGenerationWatermarkSettingId]: {
		type: 'boolean',
		markdownDescription: copilotCliConfigSchema.definition[CopilotCliConfigKey.ImageGenerationWatermark].protocol.description,
		default: false,
		scope: ConfigurationScope.APPLICATION,
		tags: ['preview', 'experimental'],
		agentHost: { key: CopilotCliConfigKey.ImageGenerationWatermark },
	},
	// Stays registered as an application setting so its migration can read and remove it from the default profile while another profile is active.
	[CopilotImageGenerationEnabledSettingId]: {
		type: 'boolean',
		default: false,
		scope: ConfigurationScope.APPLICATION,
		markdownDeprecationMessage: nls.localize('chat.copilot.imageGeneration.enabled.deprecated', "Use {0} instead.", `\`#${CopilotImageGenerationModelSettingId}#\``),
	},
} satisfies Record<string, IConfigurationPropertySchema>;
