/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../../base/test/common/utils.js';
import { ExtensionIdentifier } from '../../../../../../../../platform/extensions/common/extensions.js';
import { ChatEntitlement, IChatEntitlementService, IChatSentiment } from '../../../../../../../services/chat/common/chatEntitlementService.js';
import { shouldShowManageModelsAction } from '../../../../../browser/widget/input/modelPicker/modelPickerItems.js';
import { getAutoModeTierLabel, getFusionAutoModeTierLabel } from '../../../../../../../../platform/agentHost/common/autoModeTiers.js';
import { getFusionTierLabel, getModelPickerEntitlement, getModelPickerUnavailableReason, isAutoModel, isModelPickerUsageBased, isHydraFusionModel, ModelPickerUnavailableReason, modelPickerRequiresSetup, shouldShowCacheBreakHint } from '../../../../../browser/widget/input/modelPicker/modelPickerPresentation.js';
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

	test('recognizes HydraFusion models only from Copilot CLI', () => {
		const inGroup = (metadataId: string, group: string | undefined) => {
			const base = model(`provider/${metadataId}`, metadataId);
			return isHydraFusionModel({ ...base, metadata: { ...base.metadata, ...(group && { modelGroup: { id: group } }) } });
		};
		assert.deepStrictEqual({
			hydraFusion: inGroup('hydrafusion', 'copilotcli'),
			max: inGroup('hydrafusion-max', 'copilotcli'),
			otherProvider: inGroup('hydrafusion-max', 'claude'),
			ungrouped: inGroup('hydrafusion', undefined),
			ordinary: inGroup('gpt-5', 'copilotcli'),
		}, { hydraFusion: true, max: true, otherProvider: false, ungrouped: false, ordinary: false });
	});

	test('Fusion names HydraFusion by the provider tier it offers, without renaming Auto or changing runtime values', () => {
		const fusion: ILanguageModelChatMetadataAndIdentifier['metadata'] = { ...model('copilot/auto', 'auto').metadata, autoModelFusion: true, configurationSchema: { properties: { tier: { type: 'string', enum: ['balance', 'hydrafusion', 'hydrafusion-max'], enumItemLabels: ['Standard', 'High', 'Max'] } } } };
		const withoutHydraFusionTier: ILanguageModelChatMetadataAndIdentifier['metadata'] = { ...fusion, configurationSchema: { properties: { tier: { type: 'string', enum: ['balance'] } } } };
		assert.deepStrictEqual({
			fusion: ['balance', 'hydrafusion', 'hydrafusion-max'].map(getFusionAutoModeTierLabel),
			auto: ['efficiency', 'balance', 'intelligence'].map(getAutoModeTierLabel),
			providerTiers: ['hydrafusion', 'hydrafusion-max'].map(id => getFusionTierLabel(fusion, id)),
			notOffered: getFusionTierLabel(withoutHydraFusionTier, 'hydrafusion'),
			notFusion: getFusionTierLabel(model('copilot/auto', 'auto').metadata, 'hydrafusion-max'),
		}, {
			fusion: ['Standard', 'High', 'Max'],
			auto: ['Efficiency', 'Balance', 'Intelligence'],
			providerTiers: ['High', 'Max'],
			notOffered: undefined,
			notFusion: undefined,
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

	test('ignores the GitHub entitlement only while Microsoft 365 is the active service', () => {
		const entitlementFor = (entitlement: ChatEntitlement, copilotService: 'github' | 'm365' | undefined) =>
			getModelPickerEntitlement({ entitlement, sentiment: { copilotService } as IChatSentiment });

		assert.deepStrictEqual({
			m365: entitlementFor(ChatEntitlement.Free, 'm365'),
			github: entitlementFor(ChatEntitlement.Free, 'github'),
			unselected: entitlementFor(ChatEntitlement.Pro, undefined),
		}, {
			m365: ChatEntitlement.Unknown,
			github: ChatEntitlement.Free,
			unselected: ChatEntitlement.Pro,
		});
	});

	test('derives Manage Models visibility and usage billing from the active service', () => {
		const service = (entitlement: ChatEntitlement, copilotService: 'github' | 'm365' | undefined, byok = false, usageBasedBilling = true): IChatEntitlementService => ({
			entitlement,
			sentiment: { copilotService } as IChatSentiment,
			clientByokEnabled: byok,
			hasByokModels: false,
			isInternal: false,
			quotas: { usageBasedBilling },
		} as IChatEntitlementService);

		assert.deepStrictEqual({
			m365GitHubPlan: shouldShowManageModelsAction(service(ChatEntitlement.Pro, 'm365')),
			m365Byok: shouldShowManageModelsAction(service(ChatEntitlement.Pro, 'm365', true)),
			github: shouldShowManageModelsAction(service(ChatEntitlement.Pro, 'github')),
			gateOff: shouldShowManageModelsAction(service(ChatEntitlement.Pro, undefined)),
			gateOffUnknown: shouldShowManageModelsAction(service(ChatEntitlement.Unknown, undefined)),
			m365Usage: isModelPickerUsageBased(service(ChatEntitlement.Pro, 'm365')),
			githubUsage: isModelPickerUsageBased(service(ChatEntitlement.Pro, 'github')),
			gateOffUsage: isModelPickerUsageBased(service(ChatEntitlement.Pro, undefined)),
		}, {
			m365GitHubPlan: false,
			m365Byok: true,
			github: true,
			gateOff: true,
			gateOffUnknown: false,
			m365Usage: false,
			githubUsage: true,
			gateOffUsage: true,
		});
	});

	test('restores GitHub presentation when the Microsoft 365 context is lost', () => {
		const state = { entitlement: ChatEntitlement.Pro, sentiment: { copilotService: 'm365' } as IChatSentiment };
		const before = getModelPickerEntitlement(state);
		state.sentiment = { copilotService: undefined } as IChatSentiment;
		assert.deepStrictEqual({ before, after: getModelPickerEntitlement(state) }, { before: ChatEntitlement.Unknown, after: ChatEntitlement.Pro });
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
