/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { RemoteAgentHostsEnabledSettingId } from '../../../../../platform/agentHost/common/remoteAgentHostService.js';
import { ChatContextKeys } from '../../../../../workbench/contrib/chat/common/actions/chatContextKeys.js';
import { IToolInvocation } from '../../../../../workbench/contrib/chat/common/tools/languageModelToolsService.js';
import { CreateRemoteSessionTool, ListAgentHostsTool } from '../../browser/remoteSessionTools.js';
import { ICreatedRemoteSession, ICreateRemoteSessionOptions, IRemoteSessionHost, IRemoteSessionService, RemoteSessionToolsEnabledSettingId } from '../../common/remoteSessions.js';

suite('RemoteSessionTools', () => {
	ensureNoDisposablesAreLeakedInTestSuite();
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
		const service = new class extends mock<IRemoteSessionService>() {
			override listHosts(): readonly IRemoteSessionHost[] { return []; }
			override async createSession(options: ICreateRemoteSessionOptions, source: URI, requestId: string, token: CancellationToken) {
				calls.push({ options, source, requestId, token });
				return result;
			}
		}();
		return { calls, create: new CreateRemoteSessionTool(service), list: new ListAgentHostsTool(service) };
	}

	test('registers non-workspace tools gated by AI, remote host and remote tool enablement', () => {
		const { list, create } = setup();
		assert.deepStrictEqual([list, create].map(tool => {
			const data = tool.getToolData();
			return {
				name: data.toolReferenceName,
				runsInWorkspace: data.runsInWorkspace,
				keys: data.when?.keys().sort(),
			};
		}), [
			{ name: 'list_agent_hosts', runsInWorkspace: false, keys: [ChatContextKeys.enabled.key, `config.${RemoteAgentHostsEnabledSettingId}`, `config.${RemoteSessionToolsEnabledSettingId}`].sort() },
			{ name: 'create_remote_session', runsInWorkspace: false, keys: [ChatContextKeys.enabled.key, `config.${RemoteAgentHostsEnabledSettingId}`, `config.${RemoteSessionToolsEnabledSettingId}`].sort() },
		]);
	});

	test('host listing guidance distinguishes unavailable state from unsupported hosts', () => {
		const { list } = setup();
		const description = list.getToolData().modelDescription;
		assert.deepStrictEqual({
			requiresConnected: description.includes('Only connected hosts'),
			unknownCapabilities: description.includes('Null delegation support'),
			notUnsupported: description.includes('unknown, not unsupported or zero'),
		}, { requiresConnected: true, unknownCapabilities: true, notUnsupported: true });
	});

	test('creation guidance preserves workspace independence, reply routing, and retry safety', () => {
		const { create } = setup();
		const description = create.getToolData().modelDescription;
		assert.deepStrictEqual({
			noWorkspace: description.includes('Omitted workspace creates a workspace-less session'),
			noInheritance: description.includes('no branch or worktree is inherited'),
			noClone: description.includes('No repository is cloned'),
			replies: description.includes('send_remote_message with session "origin"'),
			noBlindRetry: description.includes('Do not retry an uncertain creation'),
			connectedWindow: description.includes('Agents window remains connected'),
			agentHostSource: description.includes('Requires an Agent Host originating chat'),
		}, { noWorkspace: true, noInheritance: true, noClone: true, replies: true, noBlindRetry: true, connectedWindow: true, agentHostSource: true });
	});

	test('creation waits for exact chat context when invoked in the background', () => {
		const { create } = setup();
		assert.strictEqual(create.getToolData().canRequestPreApproval, true);
	});

	test('creation guidance requests a report and yields instead of waiting in a polling loop', () => {
		const { create } = setup();
		const description = create.getToolData().modelDescription;
		assert.deepStrictEqual({
			explicitReport: description.includes('Include an explicit request to send results or blockers back'),
			noImplicitForwarding: description.includes('normal final answer is not forwarded'),
			asynchronousReply: description.includes('Replies arrive as new turns'),
			yield: description.includes('continue independent work or end your turn'),
			noSleep: description.includes('Do not sleep or poll'),
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
			response: [{ kind: 'text', value: JSON.stringify(result, undefined, 2) }],
		});
	});

	test('missing invocation context cannot create an unlinked child', async () => {
		const { create, calls } = setup();
		await assert.rejects(create.invoke({
			callId: 'call-id', toolId: create.getToolData().id, parameters: { prompt: 'Test' }, context: undefined,
		}, async () => 0, progress, CancellationToken.None), /originating session/);
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
			content: [{ kind: 'text', value: JSON.stringify({ hosts: [] }, undefined, 2) }], creations: 0,
		});
	});
});
