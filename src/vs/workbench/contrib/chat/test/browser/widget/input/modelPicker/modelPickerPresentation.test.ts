/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../../base/test/common/utils.js';
import { ExtensionIdentifier } from '../../../../../../../../platform/extensions/common/extensions.js';
import { getModelPickerUnavailableReason, isAutoModel, ModelPickerUnavailableReason, shouldShowCacheBreakHint } from '../../../../../browser/widget/input/modelPicker/modelPickerPresentation.js';
import { ILanguageModelChatMetadataAndIdentifier } from '../../../../../common/languageModels.js';

function model(identifier: string, metadataId: string): ILanguageModelChatMetadataAndIdentifier {
	return {
		identifier,
		metadata: {
			extension: new ExtensionIdentifier('test.extension'),
			id: metadataId,
			name: identifier,
			vendor: 'copilot',
			version: '1.0',
			family: 'test',
			maxInputTokens: 1,
			maxOutputTokens: 1,
			isDefaultForLocation: {},
		},
	};
}

suite('ModelPickerPresentation', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('uses canonical Auto model detection', () => {
		assert.deepStrictEqual({
			metadataAuto: isAutoModel(model('provider/other', 'auto')),
			canonicalIdentifier: isAutoModel(model('copilot/auto', 'missing-auto-id')),
			ordinary: isAutoModel(model('copilot/gpt', 'gpt')),
		}, {
			metadataAuto: true,
			canonicalIdentifier: true,
			ordinary: false,
		});
	});

	test('computes unavailable picker state from trust, setup, and live models', () => {
		const gpt = model('copilot/gpt', 'gpt');
		const reason = (trusted: boolean, requiresSetup: boolean, pickerModels: ILanguageModelChatMetadataAndIdentifier[] = [], liveModelIds: Iterable<string> = []) => getModelPickerUnavailableReason({
			trustInitialized: true,
			trusted,
			pickerModels,
			liveModelIds,
			requiresSetup,
		});

		assert.deepStrictEqual({
			restricted: reason(false, true, [gpt], [gpt.identifier]),
			setup: reason(true, true),
			live: reason(true, true, [gpt], [gpt.identifier]),
			staleCache: reason(true, true, [gpt]),
			uninitialized: getModelPickerUnavailableReason({ trustInitialized: false, trusted: false, pickerModels: [], liveModelIds: [], requiresSetup: true }),
		}, {
			restricted: ModelPickerUnavailableReason.Restricted,
			setup: ModelPickerUnavailableReason.SetupRequired,
			live: undefined,
			staleCache: ModelPickerUnavailableReason.SetupRequired,
			uninitialized: undefined,
		});
	});

	test('shows cache-break hint only for a warm usable cache', () => {
		const show = (overrides: Partial<Parameters<typeof shouldShowCacheBreakHint>[0]> = {}) => shouldShowCacheBreakHint({
			dismissed: false,
			cacheWarm: true,
			noModelsAvailable: false,
			excludeAutoModel: true,
			selectedModelIsAuto: false,
			...overrides,
		});

		assert.deepStrictEqual({
			default: show(),
			dismissed: show({ dismissed: true }),
			cold: show({ cacheWarm: false }),
			empty: show({ noModelsAvailable: true }),
			auto: show({ selectedModelIsAuto: true }),
			autoOptions: show({ selectedModelIsAuto: true, excludeAutoModel: false }),
		}, {
			default: true,
			dismissed: false,
			cold: false,
			empty: false,
			auto: false,
			autoOptions: true,
		});
	});
});
