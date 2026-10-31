/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from '../../../nls.js';
import { isObject } from '../../../base/common/types.js';
import { ConfigurationScope, IConfigurationPropertySchema } from '../../configuration/common/configurationRegistry.js';
import { CopilotCliConfigKey, CopilotImageGenerationEnabledSettingId, CopilotImageGenerationModelSettingId, CopilotImageGenerationWatermarkSettingId, copilotCliConfigSchema } from './copilotCliConfig.js';
import type { RootState } from './state/protocol/state.js';

/** The {@link CopilotImageGenerationModelSettingId} value that turns image generation off. */
export const CopilotImageGenerationOff = 'off';

/**
 * Fallback image models for runtimes that do not advertise an image catalog.
 * Account-specific choices come from the runtime's `models.list.imageModels`.
 */
export const CopilotImageGenerationModels = ['gpt-image-2.5-flare'] as const;

export type CopilotImageGenerationModel = string;
export type CopilotImageGenerationModelSetting = typeof CopilotImageGenerationOff | CopilotImageGenerationModel;

/** Whether a setting selects a model ID. The runtime verifies access to the selected model at execution. */
export function isImageGenerationModelSelected(value: unknown): value is CopilotImageGenerationModel {
	return typeof value === 'string' && value.length > 0 && value.trim() === value && value !== CopilotImageGenerationOff;
}

/** Maps the legacy boolean setting onto a model selection, or `undefined` when it holds no boolean. */
export function migrateLegacyImageGenerationSetting(enabled: unknown): CopilotImageGenerationModelSetting | undefined {
	return typeof enabled === 'boolean' ? (enabled ? CopilotImageGenerationModels[0] : CopilotImageGenerationOff) : undefined;
}

/** A Settings dropdown entry; the markdown description carries the model's rates. */
export interface IImageGenerationModelChoice {
	readonly id: string;
	readonly label: string;
	readonly description: string;
}

const imageGenerationModelChoices: Record<string, IImageGenerationModelChoice> = {
	[CopilotImageGenerationOff]: {
		id: CopilotImageGenerationOff,
		label: nls.localize('chat.copilot.imageGeneration.model.off.label', "Off"),
		description: nls.localize('chat.copilot.imageGeneration.model.off', "Agents cannot generate or edit images."),
	},
	'gpt-image-2.5-flare': {
		id: 'gpt-image-2.5-flare',
		label: 'GPT Image 2.5 Flare',
		description: nls.localize('chat.copilot.imageGeneration.model.gptImage25Flare', "Generate and edit images with **GPT Image 2.5 Flare** when it is available to your account. Prompts and selected images are sent to Flare.\n\n**Preview rates (AI credits per 1 million tokens):**\n- **Text tokens:** 500 input / 0 output\n- **Image tokens:** 800 input / 3,000 output\n\nThese charges are in addition to the conversation model. Rates may change; these are token rates, not per-image prices."),
	},
};

/** Transient, account-scoped image choices advertised by the Copilot provider. */
export const CopilotImageGenerationModelChoicesKey = 'vscode.copilot.imageGeneration.models';

/** Formats catalog metadata without hard-coding model IDs, providers, or token rates. */
export function createImageGenerationModelChoices(models: readonly {
	readonly id: string;
	readonly name: string;
	readonly availability: 'available' | 'unavailable';
	readonly supportedOperations: readonly ('generate' | 'edit')[];
	readonly pricing?: {
		readonly batchSize: number;
		readonly textInputPrice?: number;
		readonly textOutputPrice?: number;
		readonly imageInputPrice?: number;
		readonly imageOutputPrice?: number;
	};
}[]): IImageGenerationModelChoice[] {
	return models.map(model => {
		const generate = model.supportedOperations.includes('generate');
		const edit = model.supportedOperations.includes('edit');
		const description = model.availability === 'available'
			? generate && edit
				? nls.localize('chat.copilot.imageGeneration.model.generateAndEdit', "Generate and edit images with **{0}**. Prompts and selected images are sent to this image model. Account access and tool permissions still apply.", model.name)
				: generate
					? nls.localize('chat.copilot.imageGeneration.model.generateOnly', "Generate images with **{0}**. Image editing and reference-image inputs are not supported. Account access and tool permissions still apply.", model.name)
					: nls.localize('chat.copilot.imageGeneration.model.editOnly', "Edit images with **{0}**. Text-only image generation is not supported. Prompts and selected images are sent to this image model. Account access and tool permissions still apply.", model.name)
			: nls.localize('chat.copilot.imageGeneration.model.unavailable', "**{0}** is not available to your account.", model.name);
		const rates: string[] = [];
		const pricing = model.pricing;
		if (pricing) {
			for (const [label, price] of [
				[nls.localize('chat.copilot.imageGeneration.textInput', "Text input"), pricing.textInputPrice],
				[nls.localize('chat.copilot.imageGeneration.textOutput', "Text output"), pricing.textOutputPrice],
				[nls.localize('chat.copilot.imageGeneration.imageInput', "Image input"), pricing.imageInputPrice],
				[nls.localize('chat.copilot.imageGeneration.imageOutput', "Image output"), pricing.imageOutputPrice],
			] as const) {
				if (price !== undefined) {
					rates.push(`- **${label}:** ${price.toLocaleString(undefined, { maximumSignificantDigits: 21 })}`);
				}
			}
		}
		return {
			id: model.id,
			label: model.name,
			description: rates.length && pricing
				? `${description}\n\n${nls.localize('chat.copilot.imageGeneration.rates', "**Rates (AI credits per {0} tokens):**", pricing.batchSize.toLocaleString())}\n${rates.join('\n')}\n\n${nls.localize('chat.copilot.imageGeneration.ratesDisclaimer', "These charges are in addition to the conversation model. Rates may change; these are token rates, not per-image prices.")}`
				: `${description}\n\n${nls.localize('chat.copilot.imageGeneration.noRates', "Token rates are not published for this model. Image generation may consume additional AI credits.")}`,
		};
	});
}

/** Reads optional provider-advertised choices, including from an older host with no image catalog. */
export function readImageGenerationModelChoices(rootState: RootState | Error | undefined): readonly IImageGenerationModelChoice[] | undefined {
	const value = rootState && !(rootState instanceof Error) ? rootState.config?.values[CopilotImageGenerationModelChoicesKey] : undefined;
	if (!Array.isArray(value) || !value.every((choice): choice is IImageGenerationModelChoice =>
		isObject(choice) && isImageGenerationModelSelected(choice.id) && typeof choice.label === 'string' && typeof choice.description === 'string')) {
		return undefined;
	}
	return value;
}

/** Supplies the Settings enum from the account catalog, retaining the off switch and older-host fallback. */
export function getImageGenerationModelConfiguration(choices?: readonly IImageGenerationModelChoice[]) {
	const entries = [
		imageGenerationModelChoices[CopilotImageGenerationOff],
		...(choices ?? CopilotImageGenerationModels.map(id => imageGenerationModelChoices[id])),
	];
	return {
		enum: entries.map(entry => entry.id),
		enumItemLabels: entries.map(entry => entry.label),
		markdownEnumDescriptions: entries.map(entry => entry.description),
	};
}

export const imageGenerationConfigurationProperties = {
	[CopilotImageGenerationModelSettingId]: {
		type: 'string',
		...getImageGenerationModelConfiguration(),
		markdownDescription: nls.localize('chat.copilot.imageGeneration.model', "Selects the model Copilot uses to generate and edit images, or turns image generation off. Rates are shown when published. Account access and tool permissions still apply, and choosing **Off** prevents future image tool calls."),
		default: CopilotImageGenerationModels[0],
		scope: ConfigurationScope.APPLICATION,
		tags: ['preview', 'experimental'],
		experiment: { mode: 'auto' },
		agentHost: {
			key: CopilotCliConfigKey.ImageGenerationModel,
			transform: value => isImageGenerationModelSelected(value) ? value : '',
			derivedKeys: { [CopilotCliConfigKey.ImageGeneration]: isImageGenerationModelSelected },
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
