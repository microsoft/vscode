/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { observableValue } from '../../../../../../base/common/observable.js';
import { URI } from '../../../../../../base/common/uri.js';
import { upcastPartial } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { IFileService } from '../../../../../../platform/files/common/files.js';
import { NullLogService } from '../../../../../../platform/log/common/log.js';
import { CustomizationType, type AgentCustomization } from '../../../../../../platform/agentHost/common/state/sessionState.js';
import { AgentCustomizationItemProvider } from '../../../browser/agentSessions/agentHost/agentCustomizationItemProvider.js';
import { NullAgentHostCustomizationService } from '../../../browser/agentSessions/agentHost/agentHostCustomizationService.js';
import { AICustomizationSources } from '../../../common/aiCustomizationWorkspaceService.js';
import { PromptsType } from '../../../common/promptSyntax/promptTypes.js';

suite('AgentCustomizationItemProvider', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('surfaces draft agents in management customizations before session state exists', async () => {
		class TestCustomizationService extends NullAgentHostCustomizationService {
			override getWorkingDirectories(): readonly string[] {
				return ['file:///workspace'];
			}
		}

		const provider = disposables.add(new AgentCustomizationItemProvider(
			'local',
			undefined,
			undefined,
			upcastPartial<IFileService>({}),
			new NullLogService(),
			new TestCustomizationService(),
		));
		const agent: AgentCustomization = {
			type: CustomizationType.Agent,
			id: 'file:///workspace/.github/agents/reviewer.agent.md',
			uri: 'file:///workspace/.github/agents/reviewer.agent.md',
			name: 'Reviewer',
			description: 'Reviews changes',
			disableUserInvocation: true,
		};
		provider.setDraftCustomAgents(observableValue<readonly AgentCustomization[]>('draftAgents', [agent]));

		const items = await provider.provideChatSessionCustomizations(URI.parse('agent-host-codex:///draft'), CancellationToken.None);

		assert.deepStrictEqual(items, [{
			itemKey: agent.id,
			uri: URI.parse(agent.uri),
			type: PromptsType.agent,
			name: agent.name,
			description: agent.description,
			source: AICustomizationSources.local,
			extensionId: undefined,
			pluginUri: undefined,
			enabled: true,
			userInvocable: false,
		}]);
	});
});
