/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Codicon } from '../../../../../base/common/codicons.js';
import { Emitter } from '../../../../../base/common/event.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ContextKeyService } from '../../../../../platform/contextkey/browser/contextKeyService.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { AgentHostSessionTypesAvailableContext } from '../../../../common/contextkeys.js';
import { SessionTypeAuthRequirement } from '../../../../services/sessions/common/session.js';
import { IProviderSessionType, ISessionsManagementService } from '../../../../services/sessions/common/sessionsManagement.js';
import { AgentHostReadinessContextContribution } from '../../browser/agentHostReadinessContext.js';

suite('AgentHostReadinessContextContribution', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('tracks whether any agent-host provider advertises session types', () => {
		const onDidChangeSessionTypes = disposables.add(new Emitter<void>());
		let sessionTypes: IProviderSessionType[] = [];
		const sessionsManagementService = new class extends mock<ISessionsManagementService>() {
			override readonly onDidChangeSessionTypes = onDidChangeSessionTypes.event;
			override getAllProviderSessionTypes(): IProviderSessionType[] { return sessionTypes; }
		}();
		const contextKeyService = disposables.add(new ContextKeyService(new TestConfigurationService()));
		disposables.add(new AgentHostReadinessContextContribution(sessionsManagementService, contextKeyService));
		const states = [contextKeyService.getContextKeyValue(AgentHostSessionTypesAvailableContext.key)];

		sessionTypes = [providerSessionType('copilot-chat')];
		onDidChangeSessionTypes.fire();
		states.push(contextKeyService.getContextKeyValue(AgentHostSessionTypesAvailableContext.key));

		sessionTypes = [providerSessionType('agenthost-remote')];
		onDidChangeSessionTypes.fire();
		states.push(contextKeyService.getContextKeyValue(AgentHostSessionTypesAvailableContext.key));

		sessionTypes = [];
		onDidChangeSessionTypes.fire();
		states.push(contextKeyService.getContextKeyValue(AgentHostSessionTypesAvailableContext.key));

		assert.deepStrictEqual(states, [false, false, true, false]);
	});
});

function providerSessionType(providerId: string): IProviderSessionType {
	return {
		providerId,
		sessionType: {
			id: 'copilotcli',
			label: 'Copilot',
			icon: Codicon.vm,
			authRequirement: SessionTypeAuthRequirement.GitHub,
		},
	};
}
