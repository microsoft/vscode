/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { GITHUB_COPILOT_PROTECTED_RESOURCE, IAgentHostService } from '../../../../../../platform/agentHost/common/agentService.js';
import { type ProtectedResourceMetadata } from '../../../../../../platform/agentHost/common/state/protocol/state.js';
import { type IAgentSubscription } from '../../../../../../platform/agentHost/common/state/agentSubscription.js';
import { createRootState, type AgentInfo, type RootState } from '../../../../../../platform/agentHost/common/state/sessionState.js';
import { AgentHostProtectedResourcesService } from '../../../browser/agentSessions/agentHost/agentHostProtectedResourcesService.js';

suite('AgentHostProtectedResourcesService', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function agent(provider: string, protectedResources: ProtectedResourceMetadata[]): AgentInfo {
		return { provider, displayName: provider, description: '', models: [], protectedResources };
	}

	function createService() {
		const onDidChange = store.add(new Emitter<RootState>());
		let value: RootState | undefined;
		const rootState: IAgentSubscription<RootState> = {
			get value() { return value; },
			get verifiedValue() { return value; },
			onDidChange: onDidChange.event,
			onWillApplyAction: Event.None,
			onDidApplyAction: Event.None,
		};
		const agentHostService = new class extends mock<IAgentHostService>() {
			override readonly rootState = rootState;
		};
		const service = store.add(new AgentHostProtectedResourcesService(agentHostService));
		const setAgents = (agents: AgentInfo[]) => {
			value = { ...createRootState(), agents };
			onDidChange.fire(value);
		};
		return { service, setAgents };
	}

	test('onDidChange emits the changed provider, and only on a real change', () => {
		const { service, setAgents } = createService();
		const changed: string[] = [];
		store.add(service.onDidChange(provider => changed.push(provider)));

		// Both providers first advertise a resource set → each is emitted once.
		setAgents([agent('a', [GITHUB_COPILOT_PROTECTED_RESOURCE]), agent('b', [GITHUB_COPILOT_PROTECTED_RESOURCE])]);

		// Only provider 'a' flips (Copilot required → not-required) → only 'a' is emitted.
		setAgents([agent('a', [{ ...GITHUB_COPILOT_PROTECTED_RESOURCE, required: false }]), agent('b', [GITHUB_COPILOT_PROTECTED_RESOURCE])]);

		// Re-emit an identical root state → the signature is unchanged, so nothing is emitted.
		setAgents([agent('a', [{ ...GITHUB_COPILOT_PROTECTED_RESOURCE, required: false }]), agent('b', [GITHUB_COPILOT_PROTECTED_RESOURCE])]);

		assert.deepStrictEqual(changed, ['a', 'b', 'a']);
	});
});
