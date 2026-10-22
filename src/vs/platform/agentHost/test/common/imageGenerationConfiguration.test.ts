/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { ConfigurationScope, IConfigurationPropertySchema } from '../../../configuration/common/configurationRegistry.js';
import { CopilotCliConfigKey, CopilotImageGenerationEnabledSettingId, CopilotImageGenerationModelSettingId, CopilotImageGenerationWatermarkSettingId, copilotCliConfigSchema } from '../../common/copilotCliConfig.js';
import { getDefaultImageGenerationModel, imageGenerationConfigurationProperties, migrateLegacyImageGenerationSetting } from '../../common/imageGenerationConfiguration.js';

suite('ImageGenerationConfiguration', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	const property = imageGenerationConfigurationProperties[CopilotImageGenerationModelSettingId];

	test('image generation is a model dropdown mirrored to the boolean host key', () => {
		assert.deepStrictEqual({
			settingIds: Object.keys(imageGenerationConfigurationProperties),
			type: property.type,
			enum: property.enum,
			enumItemLabels: property.enumItemLabels,
			markdownEnumDescriptions: property.markdownEnumDescriptions.length,
			scope: property.scope,
			agentHostKey: property.agentHost.key,
		}, {
			settingIds: ['chat.copilot.imageGeneration.model', 'chat.copilot.imageGeneration.watermark', 'chat.copilot.imageGeneration.enabled'],
			type: 'string',
			enum: ['off', 'gpt-image-2.5-flare'],
			enumItemLabels: ['Off', 'GPT Image 2.5 Flare'],
			markdownEnumDescriptions: 2,
			scope: ConfigurationScope.APPLICATION,
			agentHostKey: CopilotCliConfigKey.ImageGeneration,
		});
	});

	test('watermark is an independent default-off application setting', () => {
		const properties: Record<string, IConfigurationPropertySchema> = imageGenerationConfigurationProperties;
		assert.deepStrictEqual(properties[CopilotImageGenerationWatermarkSettingId], {
			type: 'boolean',
			markdownDescription: copilotCliConfigSchema.definition[CopilotCliConfigKey.ImageGenerationWatermark].protocol.description,
			default: false,
			scope: ConfigurationScope.APPLICATION,
			tags: ['preview', 'experimental'],
			agentHost: { key: CopilotCliConfigKey.ImageGenerationWatermark },
		});
	});

	test('the legacy boolean stays registered as a deprecated application setting for its migration', () => {
		const legacy: IConfigurationPropertySchema = imageGenerationConfigurationProperties[CopilotImageGenerationEnabledSettingId];
		assert.deepStrictEqual({
			type: legacy.type,
			scope: legacy.scope,
			deprecationMessage: legacy.markdownDeprecationMessage,
			agentHost: legacy.agentHost,
		}, {
			type: 'boolean',
			scope: ConfigurationScope.APPLICATION,
			deprecationMessage: 'Use `#chat.copilot.imageGeneration.model#` instead.',
			agentHost: undefined,
		});
	});

	test('the Flare option describes its input/output rates and account availability', () => {
		const description = property.markdownEnumDescriptions[property.enum.indexOf('gpt-image-2.5-flare')];
		assert.deepStrictEqual({
			availability: description.includes('when it is available to your account'),
			unit: description.includes('AI credits per 1 million tokens'),
			textRates: description.includes('**Text tokens:** 500 input / 0 output'),
			imageRates: description.includes('**Image tokens:** 800 input / 3,000 output'),
			additional: description.includes('in addition to the conversation model'),
			variableRates: description.includes('Rates may change'),
			notPerImage: description.includes('not per-image prices'),
		}, {
			availability: true, unit: true, textRates: true, imageRates: true,
			additional: true, variableRates: true, notPerImage: true,
		});
	});

	test('only a listed model turns the host key on', () => {
		assert.deepStrictEqual(
			['off', 'gpt-image-2.5-flare', 'gpt-image-2.5-sunburst', true, undefined].map(value => property.agentHost.transform(value)),
			[false, true, false, false, false],
		);
	});

	test('image generation defaults to the current model in Insiders and off in Stable and development', () => {
		assert.deepStrictEqual(['stable', 'insider', undefined].map(quality => getDefaultImageGenerationModel(quality)), ['off', 'gpt-image-2.5-flare', 'off']);
	});

	test('the legacy boolean setting maps onto a model selection only when it holds a boolean', () => {
		assert.deepStrictEqual(
			[true, false, 'gpt-image-2.5-flare', undefined].map(value => migrateLegacyImageGenerationSetting(value)),
			['gpt-image-2.5-flare', 'off', undefined, undefined],
		);
	});
});
