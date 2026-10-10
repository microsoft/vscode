/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import { DeferredPromise, timeout } from '../../../../../base/common/async.js';
import { join } from '../../../../../base/common/path.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { NullLogService } from '../../../../log/common/log.js';
import type { AgentSignal } from '../../../common/agent.js';
import { ActionType } from '../../../common/state/sessionActions.js';
import { AcpAgent, choosePermissionOption, describeAuthRequired, modelsFromConfigOptions } from '../../../node/acp/acpAgent.js';
import { FakeAcpAgentProcess } from './acpTestUtils.js';

const chat = URI.parse('ahp-chat://chat-1/session');
const session = URI.parse('acp-test:/session-1');

const modelOption = {
	id: 'model',
	name: 'Model',
	category: 'model',
	type: 'select',
	currentValue: 'qwen3-coder',
	options: [{ value: 'qwen3-coder', name: 'Qwen3 Coder' }, { value: 'qwen3-max', name: 'Qwen3 Max' }],
};

suite('AcpAgent', () => {

	let agentProcess: FakeAcpAgentProcess;
	let agent: AcpAgent;
	let signals: AgentSignal[];
	let launches: number;
	let workspace: string;

	setup(async () => {
		workspace = await fs.promises.realpath(await fs.promises.mkdtemp(join(os.tmpdir(), 'acp-agent-test-')));
		agentProcess = new FakeAcpAgentProcess();
		agentProcess.handlers.set('session/new', () => ({ sessionId: 'native-1', configOptions: [modelOption] }));
		launches = 0;
		agent = new AcpAgent({ id: 'qwen', displayName: 'Qwen Code', command: 'qwen', args: ['--acp'] }, () => {
			launches++;
			return agentProcess.transport;
		}, new NullLogService());
		signals = [];
		agent.onDidChatProgress(s => signals.push(s));
	});

	teardown(async () => {
		agent.dispose();
		agentProcess.dispose();
		await fs.promises.rm(workspace, { recursive: true, force: true });
	});

	ensureNoDisposablesAreLeakedInTestSuite();

	async function createChat() {
		return agent.chats.createChat(chat, session, { workingDirectories: [URI.file(workspace)] });
	}

	function actionTypes(): string[] {
		return signals.map(s => s.kind === 'action' ? s.action.type : s.kind);
	}

	test('describes itself with an acp-prefixed provider id', () => {
		assert.strictEqual(agent.id, 'acp-qwen');
		assert.deepStrictEqual(agent.getDescriptor(), { provider: 'acp-qwen', displayName: 'Qwen Code', description: 'Qwen Code (Agent Client Protocol)' });
	});

	test('offers the agent default model before any session exists', () => {
		assert.deepStrictEqual(agent.models.get().map(m => [m.provider, m.id]), [['acp-qwen', 'default']]);
		assert.strictEqual(launches, 0);
	});

	test('creates a native session in the working directory and publishes models', async () => {
		const result = await createChat();
		assert.deepStrictEqual(agentProcess.received.map(m => m.method), ['initialize', 'session/new']);
		assert.deepStrictEqual(agentProcess.received[1].params, { cwd: workspace, mcpServers: [] });
		assert.deepStrictEqual(JSON.parse(result!.providerData!), { sessionId: 'native-1', cwd: workspace });
		assert.deepStrictEqual(agent.models.get().map(m => m.id), ['default', 'qwen3-coder', 'qwen3-max']);
		assert.strictEqual(launches, 1);
	});

	test('streams a prompt turn and completes it with the host turn id', async () => {
		agentProcess.handlers.set('session/prompt', async (params, process) => {
			process.notify('session/update', { sessionId: params.sessionId, update: { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'Hi' } } });
			await timeout(0);
			return { stopReason: 'end_turn' };
		});
		await createChat();
		await agent.chats.sendMessage(chat, 'hello', undefined, undefined, 'turn-1');
		const prompt = await agentProcess.nextMessage('session/prompt');
		assert.deepStrictEqual(prompt, { sessionId: 'native-1', prompt: [{ type: 'text', text: 'hello' }] });
		await waitFor(() => actionTypes().includes(ActionType.ChatTurnComplete));
		assert.deepStrictEqual(actionTypes(), [ActionType.ChatResponsePart, ActionType.ChatTurnComplete]);
		for (const signal of signals) {
			assert.ok(signal.kind === 'action' && signal.resource.toString() === chat.toString());
			assert.strictEqual((signal.action as { turnId: string }).turnId, 'turn-1');
		}
	});

	test('routes permission requests through the host and answers with the matching option', async () => {
		const answered = new DeferredPromise<unknown>();
		agentProcess.handlers.set('session/prompt', async (params, process) => {
			answered.complete(await process.request('session/request_permission', {
				sessionId: params.sessionId,
				toolCall: { toolCallId: 'call-1', title: 'Write a.ts', kind: 'edit' },
				options: [{ optionId: 'yes', name: 'Allow', kind: 'allow_once' }, { optionId: 'no', name: 'Reject', kind: 'reject_once' }],
			}));
			return { stopReason: 'end_turn' };
		});
		await createChat();
		await agent.chats.sendMessage(chat, 'edit', undefined, undefined, 'turn-1');
		await waitFor(() => signals.some(s => s.kind === 'pending_confirmation'));
		const pending = signals.find(s => s.kind === 'pending_confirmation')!;
		assert.ok(pending.kind === 'pending_confirmation');
		assert.strictEqual(pending.state.toolCallId, 'call-1');
		assert.strictEqual(pending.permissionKind, 'write');
		agent.respondToPermissionRequest('call-1', true);
		assert.deepStrictEqual(await answered.p, { outcome: { outcome: 'selected', optionId: 'yes' } });
	});

	test('abort cancels the turn and outstanding permission prompts', async () => {
		const answered = new DeferredPromise<unknown>();
		agentProcess.handlers.set('session/prompt', async (params, process) => {
			answered.complete(await process.request('session/request_permission', {
				sessionId: params.sessionId,
				toolCall: { toolCallId: 'call-1', title: 'Run tests', kind: 'execute' },
				options: [{ optionId: 'yes', name: 'Allow', kind: 'allow_once' }],
			}));
			await process.nextMessage('session/cancel');
			return { stopReason: 'cancelled' };
		});
		await createChat();
		await agent.chats.sendMessage(chat, 'run', undefined, undefined, 'turn-1');
		await waitFor(() => signals.some(s => s.kind === 'pending_confirmation'));
		await agent.chats.abort(chat, session);
		assert.deepStrictEqual(await answered.p, { outcome: { outcome: 'cancelled' } });
		await waitFor(() => actionTypes().includes(ActionType.ChatTurnCancelled));
	});

	test('does not offer client file system or terminal access', async () => {
		await createChat();
		assert.deepStrictEqual((agentProcess.received[0].params as { clientCapabilities: unknown }).clientCapabilities, { fs: { readTextFile: false, writeTextFile: false }, terminal: false });
		const read = await agentProcess.request('fs/read_text_file', { sessionId: 'native-1', path: join(workspace, 'a.txt') });
		assert.strictEqual((read as { error: { code: number } }).error.code, -32601);
	});

	test('restores a chat by resuming its native session', async () => {
		agentProcess.handlers.set('session/resume', () => ({ configOptions: [modelOption] }));
		await agent.materializeChat(chat, session, JSON.stringify({ sessionId: 'native-7', cwd: workspace }));
		assert.deepStrictEqual(agentProcess.received.map(m => m.method), ['initialize', 'session/resume']);
		assert.deepStrictEqual(agentProcess.received[1].params, { sessionId: 'native-7', cwd: workspace, mcpServers: [] });
	});

	test('switches models through the model config option', async () => {
		agentProcess.handlers.set('session/set_config_option', params => ({ configOptions: [{ ...modelOption, currentValue: params.value }] }));
		await createChat();
		await agent.chats.changeModel(chat, { id: 'qwen3-max' }, session);
		assert.deepStrictEqual(agentProcess.received.at(-1), { method: 'session/set_config_option', params: { sessionId: 'native-1', configId: 'model', value: 'qwen3-max' } });
		const sent = agentProcess.received.length;
		await agent.chats.changeModel(chat, { id: 'default' }, session);
		await agent.chats.changeModel(chat, { id: 'unknown-model' }, session);
		assert.strictEqual(agentProcess.received.length, sent);
	});

	test('explains authentication errors with the agent auth methods', async () => {
		agentProcess.handlers.set('initialize', () => ({ protocolVersion: 1, authMethods: [{ id: 'login', name: 'Login', description: 'Run `opencode auth login`' }] }));
		agentProcess.handlers.set('session/new', () => { throw Object.assign(new Error('Authentication required'), { code: -32000 }); });
		await assert.rejects(createChat(), /Qwen Code needs you to sign in: Run `opencode auth login`/);
	});

	test('reports agents that fail to start', async () => {
		agentProcess.handlers.delete('initialize');
		const exited = agentProcess.nextMessage('initialize').then(() => agentProcess.exit(null));
		await assert.rejects(createChat(), /Failed to start Qwen Code \(`qwen`\)/);
		await exited;
	});

	test('fails the running turn when the agent process exits', async () => {
		agentProcess.handlers.set('session/prompt', () => new Promise(() => { /* never answers */ }));
		await createChat();
		await agent.chats.sendMessage(chat, 'hello', undefined, undefined, 'turn-1');
		await agentProcess.nextMessage('session/prompt');
		agentProcess.exit(1);
		await waitFor(() => actionTypes().includes(ActionType.ChatError));
	});
});

suite('AcpAgent helpers', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('choosePermissionOption prefers the host choice, then once over always', () => {
		const options = [
			{ optionId: 'always', name: 'Always', kind: 'allow_always' as const },
			{ optionId: 'once', name: 'Once', kind: 'allow_once' as const },
			{ optionId: 'no', name: 'No', kind: 'reject_once' as const },
		];
		assert.strictEqual(choosePermissionOption(options, true, 'always'), 'always');
		assert.strictEqual(choosePermissionOption(options, true, undefined), 'once');
		assert.strictEqual(choosePermissionOption(options, false, undefined), 'no');
		assert.strictEqual(choosePermissionOption([], false, undefined), undefined);
	});

	test('modelsFromConfigOptions flattens grouped selects', () => {
		const models = modelsFromConfigOptions('acp-x', [{ id: 'm', name: 'Model', category: 'model', type: 'select', options: [{ group: 'g', name: 'G', options: [{ value: 'a', name: 'A' }] }, { value: 'b', name: 'B' }] }]);
		assert.deepStrictEqual(models.map(m => [m.provider, m.id, m.name]), [['acp-x', 'a', 'A'], ['acp-x', 'b', 'B']]);
	});

	test('describeAuthRequired falls back to a generic hint', () => {
		assert.strictEqual(describeAuthRequired('X', []), 'X needs you to sign in. Run the agent in a terminal to complete authentication.');
	});
});

async function waitFor(predicate: () => boolean, timeoutMs = 2_000): Promise<void> {
	const start = Date.now();
	while (!predicate()) {
		if (Date.now() - start > timeoutMs) {
			throw new Error('condition not met in time');
		}
		await timeout(5);
	}
}
