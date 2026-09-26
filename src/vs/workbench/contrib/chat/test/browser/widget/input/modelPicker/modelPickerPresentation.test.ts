/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../../base/test/common/utils.js';
import { ExtensionIdentifier } from '../../../../../../../../platform/extensions/common/extensions.js';
import { ChatEntitlement } from '../../../../../../../services/chat/common/chatEntitlementService.js';
import { getModelPickerUnavailableReason, isAutoModel, ModelPickerUnavailableReason, modelPickerRequiresSetup, shouldShowCacheBreakHint } from '../../../../../browser/widget/input/modelPicker/modelPickerPresentation.js';
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

	test('requires setup only when setup opens a sign-in or sign-up dialog', () => {
		const cases = [
			{ name: 'Unknown', entitlement: ChatEntitlement.Unknown, anonymous: false, hasByokModels: false },
			{ name: 'Unknown + anonymous', entitlement: ChatEntitlement.Unknown, anonymous: true, hasByokModels: false },
			{ name: 'Unknown + BYOK', entitlement: ChatEntitlement.Unknown, anonymous: false, hasByokModels: true },
			{ name: 'Available', entitlement: ChatEntitlement.Available, anonymous: false, hasByokModels: false },
			{ name: 'Available + BYOK', entitlement: ChatEntitlement.Available, anonymous: false, hasByokModels: true },
			{ name: 'Unavailable', entitlement: ChatEntitlement.Unavailable, anonymous: false, hasByokModels: false },
			{ name: 'Unresolved', entitlement: ChatEntitlement.Unresolved, anonymous: false, hasByokModels: false },
			{ name: 'Free', entitlement: ChatEntitlement.Free, anonymous: false, hasByokModels: false },
			{ name: 'Pro', entitlement: ChatEntitlement.Pro, anonymous: false, hasByokModels: false },
			{ name: 'EDU', entitlement: ChatEntitlement.EDU, anonymous: false, hasByokModels: false },
			{ name: 'Enterprise', entitlement: ChatEntitlement.Enterprise, anonymous: false, hasByokModels: false },
		];

		assert.deepStrictEqual(Object.fromEntries(cases.map(c => [c.name, modelPickerRequiresSetup(c)])), {
			'Unknown': true,
			'Unknown + anonymous': false,
			'Unknown + BYOK': false,
			'Available': true,
			'Available + BYOK': true,
			'Unavailable': false,
			'Unresolved': false,
			'Free': false,
			'Pro': false,
			'EDU': false,
			'Enterprise': false,
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
