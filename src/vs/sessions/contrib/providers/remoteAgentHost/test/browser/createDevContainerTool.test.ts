/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { timeout } from '../../../../../../base/common/async.js';
import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { createCommandUri, MarkdownString } from '../../../../../../base/common/htmlContent.js';
import { observableValue } from '../../../../../../base/common/observable.js';
import { URI } from '../../../../../../base/common/uri.js';
import { upcastPartial } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { runWithFakedTimers } from '../../../../../../base/test/common/timeTravelScheduler.js';
import { agentHostAuthority } from '../../../../../../platform/agentHost/common/agentHostUri.js';
import { IRemoteAgentHostService, RemoteAgentHostEntryType, RemoteAgentHostsEnabledSettingId } from '../../../../../../platform/agentHost/common/remoteAgentHostService.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IWorkspaceTrustManagementService } from '../../../../../../platform/workspace/common/workspaceTrust.js';
import { ISessionsProvidersService } from '../../../../../../workbench/contrib/sessions/browser/sessionsProvidersService.js';
import { IAgentHostSessionsProvider, LOCAL_AGENT_HOST_PROVIDER_ID } from '../../../../../../workbench/contrib/sessions/common/agentHostSessionsProvider.js';
import { ISessionsProvider } from '../../../../../../workbench/contrib/sessions/common/sessionsProvider.js';
import { ISessionsManagementService } from '../../../../../../workbench/contrib/sessions/common/sessionsManagement.js';
import { DevContainerAgentHostEnabledSettingId, DevContainerEnvironmentsEnabledSettingId, DevContainerHandoffEnabledSettingId, ICreatedDevContainerEnvironment, IDevContainerAgentHostService, IDevContainerEnvironment, LocalDevContainerEnvironmentHost } from '../../../../../../workbench/contrib/sessions/common/devContainerAgentHostService.js';
import { IChat, ISession } from '../../../../../../workbench/services/sessions/common/session.js';
import { IRemoteSessionService } from '../../../../remoteSessions/common/remoteSessions.js';
import { CreateDevContainerTool, ShowDevContainerEnvironmentLogCommandId } from '../../browser/createDevContainerTool.js';

suite('CreateDevContainerTool', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	const workspaceUri = URI.parse('vscode-agent-host://container/file/-/workspaces/dev-container');
	/** The chat that invokes the tool, in a session of the provider named by its path. */
	const chatOn = (providerId: string) => URI.from({ scheme: 'agent-host-copilot', path: `/${providerId}`, fragment: 'chat' });
	/** The tool's progress and result messages open the environment's log. */
	const logLink = (label: string) => ({
		value: `[${label}](${createCommandUri(ShowDevContainerEnvironmentLogCommandId, 'agenthost-container').toString()} "Show Dev Container Log")`,
		isTrusted: { enabledCommands: [ShowDevContainerEnvironmentLogCommandId] },
	});
	const asLink = (message: unknown) => message instanceof MarkdownString ? { value: message.value, isTrusted: message.isTrusted } : message;

	function setup(options: { readonly hosts?: readonly string[]; readonly handoff?: boolean } = {}) {
		const configuration = new TestConfigurationService({
			[RemoteAgentHostsEnabledSettingId]: true,
			[DevContainerAgentHostEnabledSettingId]: true,
			[DevContainerEnvironmentsEnabledSettingId]: true,
			[DevContainerHandoffEnabledSettingId]: options.handoff ?? true,
		});
		const container = upcastPartial<IAgentHostSessionsProvider>({
			id: 'agenthost-container',
			label: 'Dev Container',
			remoteAddress: 'devcontainer:1',
			devContainerEnvironmentHost: 'ssh:build',
		});
		const providers = [
			upcastPartial<IAgentHostSessionsProvider>({ id: 'agenthost-build', label: 'Build', remoteAddress: 'ssh:build' }),
			upcastPartial<IAgentHostSessionsProvider>({ id: 'agenthost-other', label: 'Other', remoteAddress: 'ssh:other' }),
			container,
			// Dev Containers of folders on Build and on this computer.
			upcastPartial<IAgentHostSessionsProvider>({ id: 'agenthost-build-folder', label: 'app Dev Container (Build)', remoteAddress: 'devcontainer:2', devContainerSourceWorkspace: URI.parse(`vscode-agent-host://${agentHostAuthority('ssh:build')}/file/-/src/app`) }),
			upcastPartial<IAgentHostSessionsProvider>({ id: 'agenthost-local-folder', label: 'app Dev Container', remoteAddress: 'devcontainer:3', devContainerSourceWorkspace: URI.file('/src/app') }),
		];
		const created: string[] = [];
		const trusted: string[] = [];
		const readinessChecks: string[] = [];
		let rejections: readonly string[] = ['No usable agents have been advertised.'];
		const environmentHosts = observableValue<ReadonlySet<string>>('hosts', new Set(options.hosts ?? [LocalDevContainerEnvironmentHost, 'ssh:build']));
		const devContainerService = upcastPartial<IDevContainerAgentHostService>({
			environmentHosts,
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
			upcastPartial<IRemoteSessionService>({
				getHostRejections: (hostId, workspace) => {
					readinessChecks.push(`${hostId} ${workspace.uri.toString()} ${workspace.isolation}`);
					return rejections;
				},
			}),
			upcastPartial<IRemoteAgentHostService>({
				configuredEntries: [{ name: 'Build', connection: { type: RemoteAgentHostEntryType.SSH, address: 'ssh:build', hostName: 'build' } }],
			}),
		);
		const becomeReady = () => { rejections = []; };
		const disconnect = (address: string) => environmentHosts.set(new Set([...environmentHosts.get()].filter(host => host !== address)), undefined);
		return { tool, created, trusted, readinessChecks, becomeReady, disconnect };
	}

	async function prepare(tool: CreateDevContainerTool, parameters: unknown, originatingChatResource?: URI) {
		try {
			const prepared = await tool.prepareToolInvocation({ toolCallId: 'prepare', parameters, chatSessionResource: undefined, originatingChatResource }, CancellationToken.None);
			return prepared.invocationMessage;
		} catch (error) {
			return { error: (error as Error).message };
		}
	}

	/** Invokes the tool like the tools service does, after preparing the call to confirm it. */
	async function confirmAndInvoke(tool: CreateDevContainerTool, parameters: Record<string, unknown>, originatingChatResource: URI | undefined, report: (message: unknown) => void = () => { }) {
		await tool.prepareToolInvocation({ toolCallId: 'call', parameters, chatSessionResource: undefined, originatingChatResource }, CancellationToken.None);
		return tool.invoke({ callId: 'call', toolId: tool.getToolData().id, parameters, originatingChatResource, context: undefined }, async () => 0, { report: step => report(step.message) }, CancellationToken.None);
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
			onlyRemote: await prepare(setup({ hosts: ['ssh:build'] }).tool, {}),
			noHosts: await prepare(setup({ hosts: [] }).tool, {}),
			disabled: await prepare(setup({ handoff: false }).tool, {}),
			invalid: await prepare(tool, { host: 'local', image: 'alpine' }),
		}, {
			default: 'Creating Dev Container on This Computer',
			local: 'Creating Dev Container on This Computer',
			remote: 'Creating Dev Container on Build',
			unavailable: { error: 'Dev Containers cannot be created on agenthost-other now. Available hosts: [{"id":"local","label":"This Computer"},{"id":"agenthost-build","label":"Build"}]' },
			ambiguous: { error: 'Docker is not available on this computer. Choose a host: [{"id":"agenthost-build","label":"Build"},{"id":"agenthost-other","label":"Other"}]' },
			// A remote host is only used when requested or when the session runs there.
			onlyRemote: { error: 'Docker is not available on this computer. Choose a host: [{"id":"agenthost-build","label":"Build"}]' },
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
			remoteFolderContainerSession: await prepare(tool, {}, chatOn('agenthost-build-folder')),
			localFolderContainerSession: await prepare(tool, {}, chatOn('agenthost-local-folder')),
			localSession: await prepare(tool, {}, chatOn(LOCAL_AGENT_HOST_PROVIDER_ID)),
			hostWithoutDocker: await prepare(tool, {}, chatOn('agenthost-other')),
			requestedHost: await prepare(tool, { host: 'local' }, chatOn('agenthost-build')),
		}, {
			remoteSession: 'Creating Dev Container on Build',
			containerSession: 'Creating Dev Container on Build',
			remoteFolderContainerSession: 'Creating Dev Container on Build',
			localFolderContainerSession: 'Creating Dev Container on This Computer',
			localSession: 'Creating Dev Container on This Computer',
			hostWithoutDocker: 'Creating Dev Container on This Computer',
			requestedHost: 'Creating Dev Container on This Computer',
		});
	});

	test('creates nothing when the approved host can no longer run Dev Containers, instead of using another host', async () => {
		const { tool, created, disconnect } = setup();
		const originatingChatResource = chatOn('agenthost-build');
		await tool.prepareToolInvocation({ toolCallId: 'call', parameters: {}, chatSessionResource: undefined, originatingChatResource }, CancellationToken.None);
		disconnect('ssh:build');
		const error = await tool.invoke({ callId: 'call', toolId: tool.getToolData().id, parameters: {}, originatingChatResource, context: undefined }, async () => 0, { report: () => { } }, CancellationToken.None).then(() => undefined, (error: Error) => error.message);
		assert.deepStrictEqual({ error, created }, {
			error: 'The Dev Container was not created: the approved host agenthost-build can no longer run Dev Containers. Available hosts: [{"id":"local","label":"This Computer"}]',
			created: [],
		});
	});

	test('keeps the approved host of each chat when chats use the same call ID, and creates nothing for a call it did not confirm', async () => {
		const { tool, created, becomeReady } = setup();
		becomeReady();
		const invoke = (callId: string, originatingChatResource: URI) => tool.invoke({ callId, toolId: tool.getToolData().id, parameters: {}, originatingChatResource, context: undefined }, async () => 0, { report: () => { } }, CancellationToken.None).then(() => 'created', (error: Error) => error.message);
		await tool.prepareToolInvocation({ toolCallId: 'call', parameters: {}, chatSessionResource: undefined, originatingChatResource: chatOn('agenthost-build') }, CancellationToken.None);
		await tool.prepareToolInvocation({ toolCallId: 'call', parameters: {}, chatSessionResource: undefined, originatingChatResource: chatOn(LOCAL_AGENT_HOST_PROVIDER_ID) }, CancellationToken.None);
		assert.deepStrictEqual({
			build: await invoke('call', chatOn('agenthost-build')),
			local: await invoke('call', chatOn(LOCAL_AGENT_HOST_PROVIDER_ID)),
			again: await invoke('call', chatOn('agenthost-build')),
			created,
		}, {
			build: 'created',
			local: 'created',
			again: 'The Dev Container was not created because the host of its confirmation is no longer known. Call the tool again.',
			created: ['ssh:build', LocalDevContainerEnvironmentHost],
		});
	});

	test('creates the environment, trusts its new workspace, and returns what create_remote_session needs once it can start sessions there', () => runWithFakedTimers({}, async () => {
		const { tool, created, trusted, readinessChecks, becomeReady } = setup();
		const reported: unknown[] = [];
		const result = confirmAndInvoke(tool, {}, chatOn('agenthost-build'), message => reported.push(message));
		await timeout(0);
		const beforeReady = { created: [...created], trusted: [...trusted], readinessChecks: [...readinessChecks] };
		becomeReady();
		const response = await result;
		const check = `agenthost-container ${workspaceUri.toString()} folder`;
		assert.deepStrictEqual({ beforeReady, readinessChecks, reported: reported.map(asLink), content: response.content, message: asLink(response.toolResultMessage) }, {
			beforeReady: { created: ['ssh:build'], trusted: [workspaceUri.toString()], readinessChecks: [check] },
			readinessChecks: [check, check],
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
	}));

	test('reports a container that cannot start sessions in time as not ready, with its IDs and recovery guidance', () => runWithFakedTimers({ maxTaskCount: 200 }, async () => {
		const { tool } = setup();
		const response = await confirmAndInvoke(tool, { host: 'local' }, undefined);
		const content = response.content[0];
		assert.deepStrictEqual({ result: content.kind === 'text' ? JSON.parse(content.value) : content, message: asLink(response.toolResultMessage) }, {
			result: {
				status: 'notReady',
				hostId: 'agenthost-container',
				label: 'Dev Container',
				workspace: workspaceUri.toString(),
				createdOn: { id: 'local', label: 'This Computer' },
				reasons: ['No usable agents have been advertised.'],
				guidance: 'The container exists and is listed in Remote Environments, but cannot start sessions yet. Do not create another container. Wait briefly, then call create_remote_session with this hostId and workspace; if it still fails, report the reasons to the user.',
			},
			message: logLink('Created Dev Container on This Computer, not yet ready for sessions'),
		});
	}));

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
