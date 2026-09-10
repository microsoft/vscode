/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { GITHUB_COPILOT_PROTECTED_RESOURCE } from '../../../../../../platform/agentHost/common/agentService.js';
import type { AgentInfo } from '../../../../../../platform/agentHost/common/state/sessionState.js';
import type { ProtectedResourceMetadata } from '../../../../../../platform/agentHost/common/state/protocol/state.js';
import { resolveAgentAuthRequirement } from '../../browser/baseAgentHostSessionsProvider.js';
import { areLocalModelsLoaded, getSignedOutModelsNotificationState, SignedOutModelsNotificationState } from '../../../../../../workbench/contrib/chat/browser/agentSessions/agentHost/agentHostSignedOutModelsNotification.js';
import { SessionTypeAuthRequirement } from '../../../../../services/sessions/common/session.js';

function agent(protectedResources: ProtectedResourceMetadata[] | undefined, modelCount: number): AgentInfo {
	return {
		provider: 'claude',
		displayName: 'Claude',
		description: '',
		models: Array.from({ length: modelCount }, (_, i) => ({ id: `m${i}` })),
		protectedResources,
	} as AgentInfo;
}

const copilotRequired = GITHUB_COPILOT_PROTECTED_RESOURCE;
const copilotOptional: ProtectedResourceMetadata = { ...GITHUB_COPILOT_PROTECTED_RESOURCE, required: false };

suite('Agent Host - session type auth requirement', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('an agent is only usable without GitHub when it drops the requirement AND has models', () => {
		// Independent source of truth. The `unusable` row is the one that matters:
		// Claude always advertises the Copilot resource as `required: false`
		// (per-session routing means no host-global mode can make it strictly
		// required), so the requirement alone would wrongly read as "usable without
		// GitHub" even when neither half of the merged catalog could be enumerated.
		// Its empty model catalog is what distinguishes it.
		const cases = [
			{ name: 'unresolved (no resources yet)', agent: agent(undefined, 4) },
			{ name: 'proxy: Copilot required', agent: agent([copilotRequired], 4) },
			{ name: 'proxy: required, no models', agent: agent([copilotRequired], 0) },
			{ name: 'native with credentials', agent: agent([copilotOptional], 4) },
			{ name: 'native WITHOUT credentials', agent: agent([copilotOptional], 0) },
		];

		assert.deepStrictEqual(
			cases.map(c => `${c.name}: ${resolveAgentAuthRequirement(c.agent)}`),
			[
				'unresolved (no resources yet): github',
				'proxy: Copilot required: github',
				'proxy: required, no models: github',
				'native with credentials: none',
				'native WITHOUT credentials: unusable',
			],
		);
	});

	test('only `none` counts as usable without GitHub', () => {
		// The window gate counts `none` only, so `unusable` never holds the
		// window open and never triggers the discovered-config nudge.
		const usable = [
			SessionTypeAuthRequirement.None,
			SessionTypeAuthRequirement.GitHub,
			SessionTypeAuthRequirement.Unusable,
		].map(r => r === SessionTypeAuthRequirement.None);

		assert.deepStrictEqual(usable, [true, false, false]);
	});

	test('no-model notification follows sign-in and model availability', () => {
		const ready = {
			allowSignedOutWhenUsable: true,
			accountResolved: true,
			entitlementResolved: true,
			signedIn: false,
			hasCopilotHarness: true,
			hasModels: false,
			localModelsLoaded: true,
			gracePeriodElapsed: false,
			setupDialogVisible: false,
		};
		assert.deepStrictEqual({
			featureDisabled: getSignedOutModelsNotificationState({ ...ready, allowSignedOutWhenUsable: false }),
			loading: getSignedOutModelsNotificationState({ ...ready, localModelsLoaded: false }),
			loadingPastGracePeriod: getSignedOutModelsNotificationState({ ...ready, localModelsLoaded: false, gracePeriodElapsed: true }),
			accountUnresolved: getSignedOutModelsNotificationState({ ...ready, accountResolved: false }),
			entitlementUnresolved: getSignedOutModelsNotificationState({ ...ready, entitlementResolved: false }),
			harnessUnavailable: getSignedOutModelsNotificationState({ ...ready, hasCopilotHarness: false }),
			visible: getSignedOutModelsNotificationState(ready),
			modelsAvailable: getSignedOutModelsNotificationState({ ...ready, hasModels: true }),
			signedIn: getSignedOutModelsNotificationState({ ...ready, signedIn: true }),
			setupDialogVisible: getSignedOutModelsNotificationState({ ...ready, setupDialogVisible: true }),
		}, {
			featureDisabled: SignedOutModelsNotificationState.Hidden,
			loading: SignedOutModelsNotificationState.Waiting,
			loadingPastGracePeriod: SignedOutModelsNotificationState.Visible,
			accountUnresolved: SignedOutModelsNotificationState.Hidden,
			entitlementUnresolved: SignedOutModelsNotificationState.Hidden,
			harnessUnavailable: SignedOutModelsNotificationState.Hidden,
			visible: SignedOutModelsNotificationState.Visible,
			modelsAvailable: SignedOutModelsNotificationState.Hidden,
			signedIn: SignedOutModelsNotificationState.Hidden,
			setupDialogVisible: SignedOutModelsNotificationState.Hidden,
		});
	});

	test('No-model notification waits for extension, configuration, and provider discovery', () => {
		const resolvedVendors = new Set(['anthropic']);
		const hasResolvedVendor = (vendor: string) => resolvedVendors.has(vendor);

		assert.deepStrictEqual({
			extensionsLoading: areLocalModelsLoaded(false, true, [], hasResolvedVendor),
			configurationLoading: areLocalModelsLoaded(true, false, [], hasResolvedVendor),
			providerLoading: areLocalModelsLoaded(true, true, ['anthropic', 'openai'], hasResolvedVendor),
			settledEmpty: areLocalModelsLoaded(true, true, [], hasResolvedVendor),
			settledConfigured: areLocalModelsLoaded(true, true, ['anthropic'], hasResolvedVendor),
		}, {
			extensionsLoading: false,
			configurationLoading: false,
			providerLoading: false,
			settledEmpty: true,
			settledConfigured: true,
		});
	});

});
