/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../../base/test/common/utils.js';
import { ExtensionIdentifier } from '../../../../../../../../platform/extensions/common/extensions.js';
import { NullOpenerService } from '../../../../../../../../platform/opener/test/common/nullOpenerService.js';
import { ModelCard } from '../../../../../browser/widget/input/modelPicker/modelPickerCard.js';
import { IModelConfigurationAccess } from '../../../../../browser/widget/input/modelPicker/modelPickerModelConfig.js';
import { ILanguageModelChatMetadata, ILanguageModelChatMetadataAndIdentifier } from '../../../../../common/languageModels.js';

function createModel(): ILanguageModelChatMetadataAndIdentifier {
	return {
		identifier: 'copilot/test-model',
		metadata: {
			extension: new ExtensionIdentifier('test.extension'),
			id: 'test-model',
			name: 'Test Model',
			vendor: 'copilot',
			version: '1.0',
			family: 'test',
			maxInputTokens: 128000,
			maxOutputTokens: 4096,
			isDefaultForLocation: {},
			configurationSchema: {
				properties: {
					effort: {
						type: 'string',
						group: 'navigation',
						enum: ['low', 'medium'],
						enumItemLabels: ['Low', 'Medium'],
						default: 'low',
					},
					context: {
						type: 'number',
						group: 'tokens',
						enum: [32768, 65536],
						enumItemLabels: ['32K', '64K'],
						default: 32768,
					},
				},
			},
		} as ILanguageModelChatMetadata,
	};
}

function createCard(configuration: Record<string, unknown>) {
	const changes: string[] = [];
	const access: IModelConfigurationAccess = {
		getModelConfiguration: () => configuration,
		setModelConfiguration: async (_modelId, values) => { Object.assign(configuration, values); },
		getModelConfigurationActions: () => [],
	};
	const card = new ModelCard({
		model: createModel(),
		configurationAccess: access,
		isUBB: false,
		openerService: NullOpenerService,
		onDidChangeConfiguration: (_group, key) => changes.push(key),
	});
	const resetButton = () => card.element.querySelector<HTMLButtonElement>('.chat-model-card-reset');
	return { card, changes, configuration, resetButton };
}

suite('ModelCard', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('offers a reset only once a setting differs from the model default', () => {
		const untouched = createCard({});
		const tuned = createCard({ effort: 'medium' });

		assert.deepStrictEqual({
			untouched: !!untouched.resetButton(),
			tuned: tuned.resetButton()?.ariaLabel,
		}, {
			untouched: false,
			tuned: 'Reset to Default',
		});
		untouched.card.dispose();
		tuned.card.dispose();
	});

	test('reset restores every changed setting and reports each change', async () => {
		const { card, changes, configuration, resetButton } = createCard({ effort: 'medium', context: 65536 });

		resetButton()!.click();
		// The click writes asynchronously, so let the write and re-render settle.
		await new Promise<void>(resolve => setTimeout(resolve, 0));

		assert.deepStrictEqual({
			configuration,
			changes,
			stillOffersReset: !!resetButton(),
		}, {
			configuration: { effort: 'low', context: 32768 },
			changes: ['effort', 'context'],
			stillOffersReset: false,
		});
		card.dispose();
	});
});
