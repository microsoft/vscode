/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NullLogService } from '../../../log/common/log.js';
import { AgentSession } from '../../common/agentService.js';
import { CustomizationEnablementKind, CustomizationType, McpServerStatus, SessionStatus, type Customization, type McpServerCustomization } from '../../common/state/protocol/channels-session/state.js';
import { ActionType } from '../../common/state/sessionActions.js';
import { AgentConfigurationService } from '../../node/agentConfigurationService.js';
import { AgentHostCustomizationEnablementService, CustomizationEnablementStorageKey } from '../../node/agentHostCustomizationEnablementService.js';
import { AgentHostStateManager } from '../../node/agentHostStateManager.js';
import { AgentHostStorageService } from '../../node/agentHostStorageService.js';
import { customizationPolicyKey } from '../../node/shared/mcpServerEnablement.js';

suite('AgentHostCustomizationEnablementService', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('announces settled enablement changes for propagated sessions', () => {
		const logService = new NullLogService();
		const stateManager = disposables.add(new AgentHostStateManager(logService));
		const configurationService = disposables.add(new AgentConfigurationService(stateManager, logService));
		const storageService = disposables.add(new AgentHostStorageService(logService));
		const service = disposables.add(new AgentHostCustomizationEnablementService(storageService, configurationService, stateManager));
		const source = AgentSession.uri('copilotcli', 'source').toString();
		const propagated = AgentSession.uri('copilotcli', 'propagated').toString();
		const unrelated = AgentSession.uri('copilotcli', 'unrelated').toString();
		const sourceCustomization = createMcpCustomization('source');
		const propagatedCustomization = createMcpCustomization('propagated');

		createSession(stateManager, source);
		createSession(stateManager, propagated);
		createSession(stateManager, unrelated);
		stateManager.dispatchServerAction(source, { type: ActionType.SessionCustomizationsChanged, customizations: [sourceCustomization] });
		stateManager.dispatchServerAction(propagated, { type: ActionType.SessionCustomizationsChanged, customizations: [propagatedCustomization] });
		stateManager.dispatchServerAction(source, {
			type: ActionType.SessionCustomizationToggled,
			id: sourceCustomization.id,
			enablement: [{ kind: CustomizationEnablementKind.Global, enabled: false }],
		});

		const events: Array<{
			source: boolean;
			propagated: boolean;
			unrelated: boolean;
			policyKey: boolean;
			unrelatedPolicyKey: boolean;
			propagatedEnabled: boolean | undefined;
		}> = [];
		disposables.add(service.onDidChangeEnablement(event => {
			events.push({
				source: event.affectsSession(source),
				propagated: event.affectsSession(propagated),
				unrelated: event.affectsSession(unrelated),
				policyKey: event.affectsSome(new Set([customizationPolicyKey(sourceCustomization)])),
				unrelatedPolicyKey: event.affectsSome(new Set(['mcpServers#unrelated'])),
				propagatedEnabled: findMcpCustomization(stateManager.getSessionState(propagated)?.customizations, propagatedCustomization.id)?.enabled,
			});
		}));

		service.handleToggle(source, sourceCustomization.id, [{ kind: CustomizationEnablementKind.Global, enabled: false }]);

		assert.deepStrictEqual(events, [{
			source: true,
			propagated: true,
			unrelated: false,
			policyKey: true,
			unrelatedPolicyKey: false,
			propagatedEnabled: false,
		}]);
	});

	test('persists workspace enablement only for the session primary working directory', () => {
		const logService = new NullLogService();
		const stateManager = disposables.add(new AgentHostStateManager(logService));
		const configurationService = disposables.add(new AgentConfigurationService(stateManager, logService));
		const storageService = disposables.add(new AgentHostStorageService(logService));
		const service = disposables.add(new AgentHostCustomizationEnablementService(storageService, configurationService, stateManager));
		const session = AgentSession.uri('copilotcli', 'primary-working-directory').toString();
		const customization = createMcpCustomization('primary-working-directory');

		createSession(stateManager, session, ['file:///primary', 'file:///secondary']);
		stateManager.dispatchServerAction(session, { type: ActionType.SessionCustomizationsChanged, customizations: [customization] });
		service.handleToggle(session, customization.id, [{ kind: CustomizationEnablementKind.Workspace, uri: 'file:///secondary', enabled: false }]);

		assert.deepStrictEqual(storageService.get(CustomizationEnablementStorageKey), {
			workingDirectories: { 'file:///primary': { 'mcpServers#search': false } },
		});
	});
});

function createSession(stateManager: AgentHostStateManager, resource: string, workingDirectories?: string[]): void {
	stateManager.createSession({
		resource,
		provider: 'copilotcli',
		title: 'Test',
		status: SessionStatus.Idle,
		createdAt: new Date().toISOString(),
		modifiedAt: new Date().toISOString(),
		...(workingDirectories ? { workingDirectories } : {}),
	});
}

function createMcpCustomization(sessionId: string): McpServerCustomization {
	return {
		type: CustomizationType.McpServer,
		id: `mcp-top-level:copilotcli:${sessionId}:search`,
		uri: `mcp-top-level:copilotcli:${sessionId}:search`,
		name: 'search',
		enabled: true,
		state: { kind: McpServerStatus.Ready },
	};
}

function findMcpCustomization(customizations: readonly Customization[] | undefined, id: string): McpServerCustomization | undefined {
	return customizations?.find((customization): customization is McpServerCustomization => customization.type === CustomizationType.McpServer && customization.id === id);
}
