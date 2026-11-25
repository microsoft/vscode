/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { MarkdownString } from '../../../../../base/common/htmlContent.js';
import { URI } from '../../../../../base/common/uri.js';
import { isEqual } from '../../../../../base/common/resources.js';
import { IAgentHostConnectionsService, IAgentHostSessionResolution } from '../../../../../platform/agentHost/common/agentHostConnectionsService.js';
import { buildOpenSessionLinkUri } from '../../../../../platform/agentHost/common/openSessionLink.js';
import { toAgentHostUri } from '../../../../../platform/agentHost/common/agentHostUri.js';
import { IAgentConnection, IAgentSessionMetadata } from '../../../../../platform/agentHost/common/agentService.js';
import { mock, upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { RemoteAgentHostsEnabledSettingId } from '../../../../../platform/agentHost/common/remoteAgentHostService.js';
import { ChatContextKeys } from '../../../../../workbench/contrib/chat/common/actions/chatContextKeys.js';
import { IToolInvocation } from '../../../../../workbench/contrib/chat/common/tools/languageModelToolsService.js';
import { CreateRemoteSessionTool, ListAgentHostsTool } from '../../browser/remoteSessionTools.js';
import { resolveRemoteSessionReference } from '../../browser/remoteSessionSource.js';
import { ICreatedRemoteSession, ICreateRemoteSessionOptions, IRemoteSessionHost, IRemoteSessionHostName, IRemoteSessionService, RemoteSessionToolsEnabledSettingId } from '../../common/remoteSessions.js';
import { DevContainerHandoffEnabledSettingId } from '../../../../../workbench/contrib/sessions/common/devContainerAgentHostService.js';

suite('RemoteSessionTools', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('opaque scoped references require exact advertised identity instead of a reconstructed neighbor', async () => {
		const backend = URI.parse('session-store://tenant/root?revision=2');
		const frontend = backend.with({ scheme: 'remote-other-host-claude' });
		const connections = new class extends mock<IAgentHostConnectionsService>() {
			override findSessionResource(resource: URI, authority?: string): URI | undefined {
				return authority === 'other-host' && isEqual(resource, backend) ? frontend : undefined;
			}
			override resolveSessionResource() { return undefined; }
			override resolveSessionResourceIdentity(resource: URI) {
				return isEqual(resource, frontend) ? { backendSession: backend, backendSessionIsAdvertised: true as const, connectionAuthority: 'other-host' }
					: { backendSession: resource.with({ scheme: 'claude' }), connectionAuthority: 'other-host' };
			}
		}();
		const resolved = await resolveRemoteSessionReference(buildOpenSessionLinkUri(backend, 'peer', undefined, 'other-host'), connections);
		assert.deepStrictEqual([resolved.resource.toString(), resolved.identity.backendSession.toString()], [frontend.with({ fragment: 'peer' }).toString(), backend.toString()]);
		await assert.rejects(resolveRemoteSessionReference(frontend.with({ query: 'revision=3' }).toString(), connections), /host-qualified/);
	});

	for (const [name, defaultChat, peerChat, defaultId] of [
		['shaped', 'ahp-chat://default/c2Vzc2lvbi0x', 'ahp-chat://peer-1/c2Vzc2lvbi0x', 'ahp-chat://default/c2Vzc2lvbi0x'],
		['opaque', 'ahp-chat:/11111111-1111-4111-8111-111111111111', 'ahp-chat:/22222222-2222-4222-8222-222222222222', '11111111-1111-4111-8111-111111111111'],
	]) {
		test(`a reference to the ${name} default chat of an unsubscribed listed session resolves to the session`, async () => {
			const backend = URI.parse('copilotcli:/s1');
			const frontend = URI.parse('remote-h-copilotcli:/s1');
			const connections = new class extends mock<IAgentHostConnectionsService>() {
				override findSessionResource() { return frontend; }
				override resolveSessionResourceIdentity() { return { backendSession: backend, backendSessionIsAdvertised: true as const, connectionAuthority: 'h' }; }
				override resolveSessionResource() {
					return upcastPartial<IAgentHostSessionResolution>({
						backendSession: backend,
						connection: upcastPartial<IAgentConnection>({
							getSubscriptionUnmanaged: () => undefined,
							listSessions: async () => [upcastPartial<IAgentSessionMetadata>({ session: backend, chats: [{ chat: URI.parse(defaultChat), kind: 'default' }, { chat: URI.parse(peerChat), kind: 'peer' }] })],
						}),
					});
				}
			}();
			const resolved = await Promise.all([defaultId, defaultChat, peerChat].map(chat => resolveRemoteSessionReference(buildOpenSessionLinkUri(backend, chat, undefined, 'h'), connections)));
			assert.deepStrictEqual(resolved.map(r => r.resource.toString()), [frontend.toString(), frontend.toString(), frontend.with({ fragment: peerChat }).toString()]);
		});
	}

	const source = URI.parse('agent-host-copilot:/source#peer');
	const progress = { report: () => { } };
	const result: ICreatedRemoteSession = {
		status: 'started',
		session: 'remote-host-copilot:/child',
		chat: 'remote-host-copilot:/child',
		openLink: 'agent-host-session://remote-host-copilot/child',
		host: { id: 'host', label: 'Linux' },
		model: { provider: 'copilot', id: null },
		workspace: null,
		placement: { runningSessions: 0, pendingCreations: 0 },
	};

	function setup() {
		const calls: { options: ICreateRemoteSessionOptions; source: URI; requestId: string; token: CancellationToken }[] = [];
		// The result's host `host` is a Dev Container environment; `agenthost-build` a plain remote host.
		const hostNames = new Map<string, IRemoteSessionHostName>([
			['host', { label: 'Dev Container 3', containerHost: 'This Computer' }],
			['agenthost-build', { label: 'Build' }],
		]);
		const service = new class extends mock<IRemoteSessionService>() {
			override listHosts(): readonly IRemoteSessionHost[] { return []; }
			override getRequestedDestination(options: ICreateRemoteSessionOptions) {
				return { host: options.hostId !== undefined ? hostNames.get(options.hostId) : undefined, pinnedBy: options.hostId, workspace: options.workspace?.uri.path };
			}
			override async createSession(options: ICreateRemoteSessionOptions, source: URI, requestId: string, token: CancellationToken) {
				calls.push({ options, source, requestId, token });
				return result;
			}
		}();
		return { calls, create: new CreateRemoteSessionTool(service), list: new ListAgentHostsTool(service) };
	}

	test('registers non-workspace tools gated by AI, remote host and remote tool or Dev Container handoff enablement', () => {
		const { list, create } = setup();
		const keys = [ChatContextKeys.enabled.key, `config.${RemoteAgentHostsEnabledSettingId}`, `config.${RemoteSessionToolsEnabledSettingId}`, `config.${DevContainerHandoffEnabledSettingId}`].sort();
		assert.deepStrictEqual([list, create].map(tool => {
			const data = tool.getToolData();
			return {
				name: data.toolReferenceName,
				runsInWorkspace: data.runsInWorkspace,
				keys: [...new Set(data.when?.keys())].sort(),
			};
		}), [
			{ name: 'list_agent_hosts', runsInWorkspace: false, keys },
			{ name: 'create_remote_session', runsInWorkspace: false, keys },
		]);
	});

	test('host listing guidance distinguishes unavailable state from unsupported hosts', () => {
		const { list } = setup();
		const description = list.getToolData().modelDescription;
		assert.deepStrictEqual({
			requiresConnected: description.includes('Only connected hosts'),
			unknownCapabilities: description.includes('null support'),
			notUnsupported: description.includes('unknown, not unsupported or zero'),
		}, { requiresConnected: true, unknownCapabilities: true, notUnsupported: true });
	});

	test('creation guidance preserves workspace independence, reply routing, and retry safety', () => {
		const { create } = setup();
		const description = create.getToolData().modelDescription;
		assert.deepStrictEqual({
			noWorkspace: description.includes('Omitted workspace creates a workspace-less session'),
			noInheritance: description.includes('nothing is cloned, copied, or inherited from the origin'),
			trustedWorkspace: description.includes('already exist and be trusted on the target'),
			replies: description.includes('send_remote_message with session "origin"'),
			noBlindRetry: description.includes('Do not retry an uncertain creation'),
			connectedWindow: description.includes('Keep the coordinating Agents window connected'),
			agentHostSource: description.includes('Requires an Agent Host originating chat'),
		}, { noWorkspace: true, noInheritance: true, trustedWorkspace: true, replies: true, noBlindRetry: true, connectedWindow: true, agentHostSource: true });
	});

	test('creation waits for exact chat context when invoked in the background', () => {
		const { create } = setup();
		assert.strictEqual(create.getToolData().canRequestPreApproval, true);
	});

	test('creation guidance requests a report and yields instead of waiting in a polling loop', () => {
		const { create } = setup();
		const description = create.getToolData().modelDescription;
		assert.deepStrictEqual({
			explicitReport: description.includes('Ask for results or blockers via send_remote_message'),
			noImplicitForwarding: description.includes('final answers are not forwarded'),
			asynchronousReply: description.includes('replies arrive as new turns'),
			yield: description.includes('Continue independent work or end your turn'),
			noSleep: description.includes('do not sleep or poll'),
		}, { explicitReport: true, noImplicitForwarding: true, asynchronousReply: true, yield: true, noSleep: true });
	});

	test('confirmation describes the remote operation without creating anything', async () => {
		const { create, calls } = setup();
		const prepared = await create.prepareToolInvocation({
			toolCallId: 'prepare-id',
			parameters: { prompt: 'Inspect [untrusted](https://example.com)', requirements: { platform: 'linux' } },
			chatSessionResource: source,
		}, CancellationToken.None);
		const message = prepared.confirmationMessages?.message;
		assert.ok(typeof message === 'object');
		assert.deepStrictEqual({
			hasConfirmation: !!prepared.confirmationMessages,
			hasSourceIndependence: message.value.replace(/&nbsp;/g, ' ').includes('No workspace or files are inherited'),
			hasRequirements: message.value.includes('linux'),
			isTrusted: message.isTrusted,
			creations: calls.length,
		}, { hasConfirmation: true, hasSourceIndependence: true, hasRequirements: true, isTrusted: false, creations: 0 });
	});

	test('confirmation and result name the requested host and the workspace folder instead of internal IDs', async () => {
		const { create } = setup();
		const text = (message: unknown) => message instanceof MarkdownString ? message.value.replace(/&nbsp;/g, ' ').replace(/\\(.)/g, '$1') : message;
		const confirm = async (parameters: object) => {
			const prepared = await create.prepareToolInvocation({ toolCallId: 'prepare', parameters: { prompt: 'Continue', ...parameters }, chatSessionResource: source }, CancellationToken.None);
			const [destination, , workspace] = String(text(prepared.confirmationMessages?.message)).split(/\n+/);
			return { destination, workspace };
		};
		const workspace = toAgentHostUri(URI.file('/workspaces/ubuntu-2'), 'devcontainer__1').toString();
		const created = await create.invoke({
			callId: 'call', toolId: create.getToolData().id, parameters: { prompt: 'Continue', hostId: 'host', workspace: { uri: workspace, isolation: 'folder' } }, context: { sessionResource: source },
		}, async () => 0, progress, CancellationToken.None);
		const messageSuffix = 'The new session can send messages back to this chat.';
		assert.deepStrictEqual({
			container: await confirm({ hostId: 'host', workspace: { uri: workspace, isolation: 'folder' } }),
			host: (await confirm({ hostId: 'agenthost-build' })).destination,
			unknownHost: (await confirm({ hostId: 'agenthost-missing' })).destination,
			automatic: await confirm({ workspace: { uri: 'file:///home/user/project' } }),
			result: text(created.toolResultMessage),
		}, {
			container: { destination: `Start this task in Dev Container 3 on This Computer? ${messageSuffix}`, workspace: 'Workspace: /workspaces/ubuntu-2 (folder)' },
			host: `Start this task on Build? ${messageSuffix}`,
			unknownHost: `Start this task on agenthost-missing? ${messageSuffix}`,
			automatic: {
				destination: `Start this task on a matching remote host? The host is selected from your connected remote agent hosts using the requested resources and current workload. ${messageSuffix}`,
				workspace: 'Workspace: /home/user/project (worktree)',
			},
			result: `[Created remote session in Dev Container 3 on This Computer](${result.openLink})`,
		});
	});

	test('invocation uses the calling chat, stable request ID and cancellation token', async () => {
		const { create, calls } = setup();
		const invocation: IToolInvocation = {
			callId: 'call-id',
			toolId: create.getToolData().id,
			parameters: { prompt: 'Run the Linux tests' },
			context: { sessionResource: source },
		};
		const response = await create.invoke(invocation, async () => 0, progress, CancellationToken.None);
		assert.deepStrictEqual({
			source: calls[0].source,
			id: calls[0].requestId,
			token: calls[0].token,
			prompt: calls[0].options.prompt,
			response: response.content,
		}, {
			source,
			id: 'call-id',
			token: CancellationToken.None,
			prompt: 'Run the Linux tests',
			response: [{ kind: 'text', value: JSON.stringify(result) }],
		});
	});

	test('missing preparation or invocation context reports the same error without creating an unlinked child', async () => {
		const { create, calls } = setup();
		const error = { message: 'Remote session creation requires an originating session.' };
		await assert.rejects(create.prepareToolInvocation({
			toolCallId: 'prepare-id', parameters: { prompt: 'Test' }, chatSessionResource: undefined,
		}, CancellationToken.None), error);
		await assert.rejects(create.invoke({
			callId: 'call-id', toolId: create.getToolData().id, parameters: { prompt: 'Test' }, context: undefined,
		}, async () => 0, progress, CancellationToken.None), error);
		assert.deepStrictEqual(calls, []);
	});

	test('unsupported source chats fail before confirmation or creation without widget-scoped gating', async () => {
		const { create, calls } = setup();
		const context = URI.parse('vscode-chat-session:/extension-chat');
		const parameters = { prompt: 'Run tests' };
		await assert.rejects(create.prepareToolInvocation({
			toolCallId: 'prepare', chatSessionResource: context, parameters,
		}, CancellationToken.None), /originating chat on an Agent Host/);
		await assert.rejects(create.invoke({
			callId: 'create', toolId: create.getToolData().id, parameters, context: { sessionResource: context },
		}, async () => 0, progress, CancellationToken.None), /originating chat on an Agent Host/);
		assert.deepStrictEqual({
			calls, needsVisibleWidget: create.getToolData().when?.keys().includes(ChatContextKeys.chatIsAgentHostSession.key),
		}, { calls: [], needsVisibleWidget: false });
	});
	test('host listing is structured and has no creation side effects', async () => {
		const { list, calls } = setup();
		const response = await list.invoke({
			callId: 'list-id', toolId: list.getToolData().id, parameters: {}, context: undefined,
		}, async () => 0, progress, CancellationToken.None);
		assert.deepStrictEqual({ content: response.content, creations: calls.length }, {
			content: [{ kind: 'text', value: JSON.stringify({ hosts: [] }) }], creations: 0,
		});
	});
});
