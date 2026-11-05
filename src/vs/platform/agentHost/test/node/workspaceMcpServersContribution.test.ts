/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { InstantiationService } from '../../../instantiation/common/instantiationService.js';
import { ServiceCollection } from '../../../instantiation/common/serviceCollection.js';
import { ILogService, NullLogService } from '../../../log/common/log.js';
import type { IAgentHostChatContributions } from '../../common/agentHostChatContributionsService.js';
import { AgentHostWorkspaceMcpServersEnabledConfigKey } from '../../common/agentHostSchema.js';
import { readSessionWorkspaceMcpServers } from '../../common/meta/agentHostWorkspaceMcpServersMeta.js';
import { withMcpServerSourceMeta } from '../../common/meta/mcpCustomizationMeta.js';
import { ActionType } from '../../common/state/sessionActions.js';
import { CustomizationEnablementKind, CustomizationType, McpServerStatus, type McpServerCustomization } from '../../common/state/protocol/channels-session/state.js';
import { buildDefaultChatUri, isAhpChatChannel, ROOT_STATE_URI, SessionStatus } from '../../common/state/sessionState.js';
import { AgentHostChatContributions } from '../../node/agentHostChatContributionsService.js';
import { AgentHostCustomizationEnablementService, IAgentHostCustomizationEnablementService, targetForWorkspaceMcpServers } from '../../node/agentHostCustomizationEnablementService.js';
import { AgentHostDatabase } from '../../node/agentHostDatabase.js';
import { AgentHostStateManager, IAgentHostStateManager } from '../../node/agentHostStateManager.js';
import { AgentHostStorageService } from '../../node/agentHostStorageService.js';
import { NullAgentHostWorktreeIsolation } from '../../node/shared/worktreeIsolation.js';
import { WorkspaceMcpServersContribution } from '../../node/chatContributions/workspaceMcpServers/workspaceMcpServersContribution.js';
import { createSessionDataService } from '../common/sessionTestHelpers.js';
import { createTestSessionStateStore } from './chatMetadataTestHelpers.js';
import { createTestChatOwnershipService } from './chatOwnershipTestUtils.js';

suite('WorkspaceMcpServersContribution', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();
	const session = 'ahp-session:/workspace-mcp-servers';
	const workspace = URI.file('/repo').toString();
	const workspaceServer: McpServerCustomization = {
		type: CustomizationType.McpServer, id: 'mcp:repo-tools', uri: `${workspace}/.mcp.json`, name: 'repo-tools',
		state: { kind: McpServerStatus.Stopped }, _meta: withMcpServerSourceMeta(undefined, 'workspace'),
	};
	const userServer: McpServerCustomization = {
		type: CustomizationType.McpServer, id: 'mcp:my-user-server', uri: 'file:///home/.copilot/mcp-config.json', name: 'my-user-server',
		state: { kind: McpServerStatus.Stopped }, _meta: withMcpServerSourceMeta(undefined, 'user'),
	};

	function createContext() {
		const logService = new NullLogService();
		const stateManager = disposables.add(new AgentHostStateManager(logService));
		const chatOwnership = createTestChatOwnershipService(stateManager);
		const storage = disposables.add(new AgentHostStorageService(undefined, logService));
		const enablementService = disposables.add(new AgentHostCustomizationEnablementService(
			storage, stateManager, logService, new NullAgentHostWorktreeIsolation(), chatOwnership,
			createTestSessionStateStore(new AgentHostDatabase(':memory:'), createSessionDataService()),
		));
		const instantiationService = disposables.add(new InstantiationService(new ServiceCollection(
			[ILogService, logService],
			[IAgentHostStateManager, stateManager],
			[IAgentHostCustomizationEnablementService, enablementService],
		), true));
		const contributions: IAgentHostChatContributions = disposables.add(new AgentHostChatContributions(logService, instantiationService));
		disposables.add(contributions.registerContribution(WorkspaceMcpServersContribution));
		disposables.add(stateManager.onDidEmitEnvelope(envelope => contributions.didDispatchAction({
			channel: envelope.channel,
			session: isAhpChatChannel(envelope.channel) ? chatOwnership.requireChatOwner(envelope.channel) : envelope.channel,
			action: envelope.action,
			rejectionReason: envelope.rejectionReason,
		})));
		const setSetting = (enabled: boolean) => stateManager.dispatchServerAction(ROOT_STATE_URI, { type: ActionType.RootConfigChanged, config: { [AgentHostWorkspaceMcpServersEnabledConfigKey]: enabled } });
		const createSession = () => stateManager.createSession({
			resource: session, defaultChat: buildDefaultChatUri(session), provider: 'copilot', title: 'Repo', status: SessionStatus.Idle,
			createdAt: '2026-11-05T00:00:00.000Z', modifiedAt: '2026-11-05T00:00:00.000Z',
			workingDirectories: [workspace],
			_meta: { unrelated: 'preserved' },
		});
		const publishCustomizations = (servers: readonly McpServerCustomization[]) => stateManager.dispatchServerAction(session, { type: ActionType.SessionCustomizationsChanged, customizations: [...servers] });
		const published = () => readSessionWorkspaceMcpServers(stateManager.getSessionState(session)?._meta);
		return { stateManager, enablementService, setSetting, createSession, publishCustomizations, published };
	}

	test('publishes the setting-backed decision once the session state and its enablement cache exist', async () => {
		const context = createContext();
		context.setSetting(false);
		// The provider initializes enablement while resolving the initial customizations, before the state exists.
		await context.enablementService.initializeSession(session);
		context.createSession();
		context.publishCustomizations([userServer]);
		const withoutWorkspaceServers = context.published();
		context.publishCustomizations([userServer, workspaceServer]);
		const withWorkspaceServer = context.published();
		context.publishCustomizations([userServer]);

		assert.deepStrictEqual({ withoutWorkspaceServers, withWorkspaceServer, afterRemoval: context.published(), unrelated: context.stateManager.getSessionState(session)?._meta?.unrelated }, {
			// Sessions without a workspace-configured server have nothing to decide and get no `_meta` write.
			withoutWorkspaceServers: undefined,
			withWorkspaceServer: { enablement: [{ kind: CustomizationEnablementKind.Global, enabled: false }], enabled: false },
			afterRemoval: undefined,
			unrelated: 'preserved',
		});
	});

	test('follows the mirrored setting and host decisions, and publishes nothing while unresolved', async () => {
		const context = createContext();
		context.createSession();
		context.publishCustomizations([workspaceServer]);
		const whilePending = context.published();
		await context.enablementService.initializeSession(session);
		const settled = context.published();
		context.setSetting(false);
		const disabledBySetting = context.published();
		context.enablementService.replaceWorkspaceMcpServersEnablement(session, [
			{ kind: CustomizationEnablementKind.Global, enabled: true },
			{ kind: CustomizationEnablementKind.Workspace, uri: workspace, enabled: true },
		]);
		const reopenedForWorkspace = context.published();
		context.enablementService.setEnablement(session, targetForWorkspaceMcpServers(false), CustomizationEnablementKind.Session, false);

		assert.deepStrictEqual({ whilePending, settled, disabledBySetting, reopenedForWorkspace, sessionOff: context.published() }, {
			whilePending: undefined,
			settled: { enablement: [{ kind: CustomizationEnablementKind.Global, enabled: true }], enabled: true },
			disabledBySetting: { enablement: [{ kind: CustomizationEnablementKind.Global, enabled: false }], enabled: false },
			reopenedForWorkspace: { enablement: [{ kind: CustomizationEnablementKind.Workspace, uri: workspace, enabled: true }, { kind: CustomizationEnablementKind.Global, enabled: false }], enabled: true },
			sessionOff: { enablement: [{ kind: CustomizationEnablementKind.Session, enabled: false }, { kind: CustomizationEnablementKind.Workspace, uri: workspace, enabled: true }, { kind: CustomizationEnablementKind.Global, enabled: false }], enabled: false },
		});
	});
});
