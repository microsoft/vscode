/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { timeout } from '../../../../../../base/common/async.js';
import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { Emitter } from '../../../../../../base/common/event.js';
import { createCommandUri, MarkdownString } from '../../../../../../base/common/htmlContent.js';
import { observableValue } from '../../../../../../base/common/observable.js';
import { URI } from '../../../../../../base/common/uri.js';
import { upcastPartial } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { RemoteAgentHostsEnabledSettingId } from '../../../../../../platform/agentHost/common/remoteAgentHostService.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IWorkspaceTrustManagementService } from '../../../../../../platform/workspace/common/workspaceTrust.js';
import { IToolInvocation } from '../../../../../../workbench/contrib/chat/common/tools/languageModelToolsService.js';
import { ISessionsProvidersService } from '../../../../../../workbench/contrib/sessions/browser/sessionsProvidersService.js';
import { IAgentHostSessionsProvider, LOCAL_AGENT_HOST_PROVIDER_ID } from '../../../../../../workbench/contrib/sessions/common/agentHostSessionsProvider.js';
import { ISessionsProvider } from '../../../../../../workbench/contrib/sessions/common/sessionsProvider.js';
import { ISessionsManagementService } from '../../../../../../workbench/contrib/sessions/common/sessionsManagement.js';
import { DevContainerAgentHostEnabledSettingId, DevContainerEnvironmentsEnabledSettingId, DevContainerHandoffEnabledSettingId, ICreatedDevContainerEnvironment, IDevContainerAgentHostService, IDevContainerEnvironment, LocalDevContainerEnvironmentHost } from '../../../../../../workbench/contrib/sessions/common/devContainerAgentHostService.js';
import { IChat, ISession, ISessionType } from '../../../../../../workbench/services/sessions/common/session.js';
import { CreateDevContainerTool, ShowDevContainerEnvironmentLogCommandId } from '../../browser/createDevContainerTool.js';

suite('CreateDevContainerTool', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	const workspaceUri = URI.parse('vscode-agent-host://container/file/-/workspaces/dev-container');
	/** The chat that invokes the tool, in a session of the provider named by its path. */
	const chatOn = (providerId: string) => URI.from({ scheme: 'agent-host-copilot', path: `/${providerId}`, fragment: 'chat' });

	function setup(options: { readonly hosts?: readonly string[]; readonly handoff?: boolean } = {}) {
		const configuration = new TestConfigurationService({
			[RemoteAgentHostsEnabledSettingId]: true,
			[DevContainerAgentHostEnabledSettingId]: true,
			[DevContainerEnvironmentsEnabledSettingId]: true,
			[DevContainerHandoffEnabledSettingId]: options.handoff ?? true,
		});
		const sessionTypesChanged = store.add(new Emitter<void>());
		const container = upcastPartial<IAgentHostSessionsProvider>({
			id: 'agenthost-container',
			label: 'Dev Container',
			remoteAddress: 'devcontainer:1',
			sessionTypes: [] as ISessionType[],
			onDidChangeSessionTypes: sessionTypesChanged.event,
		});
		const providers = [
			upcastPartial<IAgentHostSessionsProvider>({ id: 'agenthost-build', label: 'Build', remoteAddress: 'ssh:build' }),
			upcastPartial<IAgentHostSessionsProvider>({ id: 'agenthost-other', label: 'Other', remoteAddress: 'ssh:other' }),
			container,
		];
		const created: string[] = [];
		const trusted: string[] = [];
		const devContainerService = upcastPartial<IDevContainerAgentHostService>({
			environmentHosts: observableValue('hosts', new Set(options.hosts ?? [LocalDevContainerEnvironmentHost, 'ssh:build'])),
			environments: observableValue<readonly IDevContainerEnvironment[]>('environments', [{ address: 'devcontainer:1', sourceAddress: 'ssh:build', providerId: container.id }]),
			createEnvironment: async (sourceAddress: string, createOptions?: { readonly onWillConnect?: (environment: IDevContainerEnvironment) => void }): Promise<ICreatedDevContainerEnvironment> => {
				created.push(sourceAddress);
				const environment = { address: 'devcontainer:1', sourceAddress, providerId: container.id };
				createOptions?.onWillConnect?.(environment);
				return { ...environment, workspaceUri };
			},
		});
		const tool = new CreateDevContainerTool(
			devContainerService,
			upcastPartial<ISessionsProvidersService>({
				getProviders: () => providers,
				getProvider: <T extends ISessionsProvider>(id: string) => providers.find(provider => provider.id === id) as ISessionsProvider | undefined as T | undefined,
			}),
			upcastPartial<IWorkspaceTrustManagementService>({ setUrisTrust: async uris => { trusted.push(...uris.map(uri => uri.toString())); } }),
			configuration,
			upcastPartial<ISessionsManagementService>({
				getSessionForChatResource: resource => ({ session: upcastPartial<ISession>({ providerId: resource.path.slice(1) }), chat: upcastPartial<IChat>({ resource }) }),
				getSession: () => undefined,
			}),
		);
		const announceSessionTypes = () => {
			Object.assign(container, { sessionTypes: [upcastPartial<ISessionType>({ id: 'copilotcli' })] });
			sessionTypesChanged.fire();
		};
		return { tool, created, trusted, announceSessionTypes };
	}

	async function prepare(tool: CreateDevContainerTool, parameters: unknown, originatingChatResource?: URI) {
		try {
			const prepared = await tool.prepareToolInvocation({ toolCallId: 'prepare', parameters, chatSessionResource: undefined, originatingChatResource }, CancellationToken.None);
			return prepared.invocationMessage;
		} catch (error) {
			return { error: (error as Error).message };
		}
	}

	test('resolves this computer by default, remote hosts by their list_agent_hosts ID, and explains unavailable hosts', async () => {
		const { tool } = setup();
		const onlyRemotes = setup({ hosts: ['ssh:build', 'ssh:other'] });
		assert.deepStrictEqual({
			default: await prepare(tool, {}),
			local: await prepare(tool, { host: 'local' }),
			remote: await prepare(tool, { host: 'agenthost-build' }),
			unavailable: await prepare(tool, { host: 'agenthost-other' }),
			ambiguous: await prepare(onlyRemotes.tool, {}),
			noHosts: await prepare(setup({ hosts: [] }).tool, {}),
			disabled: await prepare(setup({ handoff: false }).tool, {}),
			invalid: await prepare(tool, { host: 'local', image: 'alpine' }),
		}, {
			default: 'Creating Dev Container on This Computer',
			local: 'Creating Dev Container on This Computer',
			remote: 'Creating Dev Container on Build',
			unavailable: { error: 'Dev Containers cannot be created on agenthost-other now. Available hosts: [{"id":"local","label":"This Computer"},{"id":"agenthost-build","label":"Build"}]' },
			ambiguous: { error: 'Docker is not available on this computer. Choose a host: [{"id":"agenthost-build","label":"Build"},{"id":"agenthost-other","label":"Other"}]' },
			noHosts: { error: 'No Docker host is available. Start Docker on this computer, or connect to an SSH, Tunnel, or WSL host that has Docker.' },
			disabled: { error: 'Creating Dev Containers is disabled.' },
			invalid: { error: 'The input must be an object with an optional host string.' },
		});
	});

	test('defaults to the host that the invoking session runs on, when that host can run Dev Containers', async () => {
		const { tool } = setup();
		assert.deepStrictEqual({
			remoteSession: await prepare(tool, {}, chatOn('agenthost-build')),
			containerSession: await prepare(tool, {}, chatOn('agenthost-container')),
			localSession: await prepare(tool, {}, chatOn(LOCAL_AGENT_HOST_PROVIDER_ID)),
			hostWithoutDocker: await prepare(tool, {}, chatOn('agenthost-other')),
			requestedHost: await prepare(tool, { host: 'local' }, chatOn('agenthost-build')),
		}, {
			remoteSession: 'Creating Dev Container on Build',
			containerSession: 'Creating Dev Container on Build',
			localSession: 'Creating Dev Container on This Computer',
			hostWithoutDocker: 'Creating Dev Container on This Computer',
			requestedHost: 'Creating Dev Container on This Computer',
		});
	});

	test('creates the environment, trusts its new workspace, and returns what create_remote_session needs once its agents are known', async () => {
		const { tool, created, trusted, announceSessionTypes } = setup();
		const invocation: IToolInvocation = { callId: 'call', toolId: tool.getToolData().id, parameters: {}, originatingChatResource: chatOn('agenthost-build'), context: undefined };
		const reported: unknown[] = [];
		const result = tool.invoke(invocation, async () => 0, { report: step => reported.push(step.message) }, CancellationToken.None);
		await timeout(0);
		const beforeAgents = { created: [...created], trusted: [...trusted] };
		announceSessionTypes();
		const response = await result;
		// Both messages open the environment's log.
		const logLink = (label: string) => ({
			value: `[${label}](${createCommandUri(ShowDevContainerEnvironmentLogCommandId, 'agenthost-container').toString()} "Show Dev Container Log")`,
			isTrusted: { enabledCommands: [ShowDevContainerEnvironmentLogCommandId] },
		});
		const asLink = (message: unknown) => message instanceof MarkdownString ? { value: message.value, isTrusted: message.isTrusted } : message;
		assert.deepStrictEqual({ beforeAgents, reported: reported.map(asLink), content: response.content, message: asLink(response.toolResultMessage) }, {
			beforeAgents: { created: ['ssh:build'], trusted: [workspaceUri.toString()] },
			reported: [logLink('Creating Dev Container on Build')],
			content: [{
				kind: 'text', value: JSON.stringify({
					status: 'created',
					hostId: 'agenthost-container',
					label: 'Dev Container',
					workspace: workspaceUri.toString(),
					createdOn: { id: 'agenthost-build', label: 'Build' },
				}),
			}],
			message: logLink('Created Dev Container on Build'),
		});
	});

	test('guides the agent to continue with create_remote_session and not to retry blindly', () => {
		const { tool } = setup();
		const description = tool.getToolData().modelDescription;
		assert.deepStrictEqual({
			continuesWithRemoteSession: description.includes('call create_remote_session with that `hostId` and `workspace: { uri: workspace, isolation: "folder" }`'),
			persists: description.includes('listed in Remote Environments, where the user can delete it'),
			noBlindRetry: description.includes('do not retry a failed creation without addressing its error'),
		}, { continuesWithRemoteSession: true, persists: true, noBlindRetry: true });
	});
});
