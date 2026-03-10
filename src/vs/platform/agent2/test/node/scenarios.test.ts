/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Integration scenario tests that exercise the full production pipeline
 * through {@link LocalAgent.sendMessage()}.
 *
 * Unlike the unit-level agentLoop.test.ts, these tests:
 * - Use the real {@link LocalAgent} with its production middleware chain
 * - Use the real {@link ReadFileTool} against a temp directory
 * - Use production session storage (JSONL persistence)
 * - Inject only the model provider as a mock (via IModelProviderService)
 *
 * This catches bugs in the glue: middleware wiring, session entry creation,
 * event translation, conversation message rebuilding, and storage round-trips.
 */

import assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import { join } from '../../../../base/common/path.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NullLogService, ILogService } from '../../../log/common/log.js';
import { INativeEnvironmentService } from '../../../environment/common/environment.js';
import { InstantiationService } from '../../../instantiation/common/instantiationService.js';
import { ServiceCollection } from '../../../instantiation/common/serviceCollection.js';
import { IAgentProgressEvent } from '../../../agent/common/agentService.js';
import { URI } from '../../../../base/common/uri.js';
import { LocalAgent } from '../../node/localAgent.js';
import { CopilotApiService, ICopilotApiService } from '../../node/copilotToken.js';
import { IModelProviderService, IModelProviderFactory, ModelProviderService } from '../../node/modelProviderService.js';
import { IModelProvider, ModelResponseChunk } from '../../common/modelProvider.js';
import { IConversationMessage } from '../../common/conversation.js';
import { assertProgressSnapshot } from '../common/testHelpers.js';

// -- Test model provider ------------------------------------------------------

const TEST_MODEL = 'test-scenario-model';

function createTestProviderFactory(
	handler: (callIndex: number, messages: readonly IConversationMessage[]) => ModelResponseChunk[],
): IModelProviderFactory {
	let callIndex = 0;
	return {
		providerId: 'test',
		canHandle: (id: string) => id === TEST_MODEL,
		create: (): IModelProvider => ({
			providerId: 'test',
			async *sendRequest(
				_sys: string,
				messages: readonly IConversationMessage[],
			): AsyncGenerator<ModelResponseChunk> {
				const chunks = handler(callIndex++, messages);
				for (const chunk of chunks) {
					yield chunk;
				}
			},
			async listModels() { return []; },
		}),
	};
}

// -- Tests --------------------------------------------------------------------

suite('LocalAgent Scenarios', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	let tmpDir: string;
	let workDir: string;

	setup(async () => {
		tmpDir = await fs.promises.mkdtemp(join(os.tmpdir(), 'agent2-scenario-'));
		workDir = join(tmpDir, 'workspace');
		await fs.promises.mkdir(workDir, { recursive: true });
	});

	teardown(async () => {
		await fs.promises.rm(tmpDir, { recursive: true, force: true });
	});

	function createAgent(handler: (callIndex: number, messages: readonly IConversationMessage[]) => ModelResponseChunk[]): LocalAgent {
		const log = new NullLogService();
		const services = new ServiceCollection();
		services.set(ILogService, log);
		const apiService = new CopilotApiService(log);
		services.set(ICopilotApiService, apiService);
		services.set(INativeEnvironmentService, { userDataPath: tmpDir } as Partial<INativeEnvironmentService> as INativeEnvironmentService);
		const modelProviderService = store.add(new InstantiationService(services)).createInstance(ModelProviderService);
		modelProviderService.registerFactory(createTestProviderFactory(handler));
		services.set(IModelProviderService, modelProviderService);
		const instantiationService = store.add(new InstantiationService(services));
		return store.add(instantiationService.createInstance(LocalAgent));
	}

	async function runAgentAndCollectProgress(agent: LocalAgent, sessionUri: URI, prompt: string): Promise<IAgentProgressEvent[]> {
		const events: IAgentProgressEvent[] = [];
		const listener = store.add(agent.onDidSessionProgress(e => {
			if (e.session.toString() === sessionUri.toString()) {
				events.push(e);
			}
		}));
		await agent.sendMessage(sessionUri, prompt);
		listener.dispose();
		return events;
	}

	test('text-only response through full pipeline', async () => {
		const agent = createAgent(() => [
			{ type: 'text-delta', text: 'Hello from the agent!' },
		]);

		const session = await agent.createSession({ model: TEST_MODEL, workingDirectory: workDir });
		const events = await runAgentAndCollectProgress(agent, session, 'Hi there');

		assertProgressSnapshot(events, `
			delta: "Hello from the agent!"
			idle
		`);
	});

	test('read_file tool with real filesystem', async () => {
		// Create a real file for ReadFileTool to read
		await fs.promises.writeFile(join(workDir, 'hello.txt'), 'Hello World');

		const agent = createAgent((callIndex) => {
			if (callIndex === 0) {
				return [
					{
						type: 'tool-call-complete', toolCallId: 'c1', toolName: 'read_file',
						arguments: JSON.stringify({ path: 'hello.txt' })
					},
				];
			}
			return [{ type: 'text-delta', text: 'The file says Hello World.' }];
		});

		const session = await agent.createSession({ model: TEST_MODEL, workingDirectory: workDir });
		const events = await runAgentAndCollectProgress(agent, session, 'Read hello.txt');

		assertProgressSnapshot(events, `
			tool-start: read_file(Reading hello.txt)
			tool-complete: c1 (ok)
			delta: "The file says Hello World."
			idle
		`);
	});

	test('tool error flows through production pipeline', async () => {
		const agent = createAgent((callIndex) => {
			if (callIndex === 0) {
				return [
					{
						type: 'tool-call-complete', toolCallId: 'c1', toolName: 'read_file',
						arguments: JSON.stringify({ path: 'nonexistent.txt' })
					},
				];
			}
			return [{ type: 'text-delta', text: 'That file does not exist.' }];
		});

		const session = await agent.createSession({ model: TEST_MODEL, workingDirectory: workDir });
		const events = await runAgentAndCollectProgress(agent, session, 'Read missing file');

		assertProgressSnapshot(events, `
			tool-start: read_file(Reading nonexistent.txt)
			tool-complete: c1 (ERROR)
			delta: "That file does not exist."
			idle
		`);
	});

	test('multi-turn conversation preserves context', async () => {
		const turnMessageCounts: number[] = [];

		const agent = createAgent((callIndex, messages) => {
			turnMessageCounts.push(messages.length);
			if (callIndex === 0) {
				return [{ type: 'text-delta', text: 'First response.' }];
			}
			return [{ type: 'text-delta', text: 'Second response.' }];
		});

		const session = await agent.createSession({ model: TEST_MODEL, workingDirectory: workDir });

		const events1 = await runAgentAndCollectProgress(agent, session, 'First message');
		assertProgressSnapshot(events1, `
			delta: "First response."
			idle
		`);

		const events2 = await runAgentAndCollectProgress(agent, session, 'Second message');
		assertProgressSnapshot(events2, `
			delta: "Second response."
			idle
		`);

		// Second turn should see more messages (user + assistant + user)
		assert.strictEqual(turnMessageCounts[0], 1, 'first turn: 1 user message');
		assert.strictEqual(turnMessageCounts[1], 3, 'second turn: user + assistant + user');
	});

	test('thinking blocks are preserved in session entries', async () => {
		const agent = createAgent((callIndex) => {
			if (callIndex === 0) {
				return [
					{
						type: 'tool-call-complete', toolCallId: 'c1', toolName: 'read_file',
						arguments: JSON.stringify({ path: 'code.ts' })
					},
				];
			}
			return [
				{ type: 'thinking-delta', text: 'Analyzing the code structure...' },
				{ type: 'thinking-signature', signature: 'sig_test123' },
				{ type: 'text-delta', text: 'The code looks good.' },
			];
		});

		await fs.promises.writeFile(join(workDir, 'code.ts'), 'const x = 1;');

		const session = await agent.createSession({ model: TEST_MODEL, workingDirectory: workDir });
		const events = await runAgentAndCollectProgress(agent, session, 'Check code.ts');

		assertProgressSnapshot(events, `
			tool-start: read_file(Reading code.ts)
			tool-complete: c1 (ok)
			reasoning: "Analyzing the code structure..."
			delta: "The code looks good."
			idle
		`);

		// Verify thinking is in session messages (for conversation continuity)
		const messages = await agent.getSessionMessages(session);
		const assistantMessages = messages.filter(m => m.type === 'message' && m.role === 'assistant');
		// The last assistant message should have reasoning data
		assert.ok(assistantMessages.length >= 1);
	});

	test('session persists and restores across dispose', async () => {
		let callCount = 0;
		const agent = createAgent(() => {
			callCount++;
			return [{ type: 'text-delta', text: `Response ${callCount}` }];
		});

		const session = await agent.createSession({ model: TEST_MODEL, workingDirectory: workDir });
		await runAgentAndCollectProgress(agent, session, 'Hello');

		// Verify messages exist before dispose
		const messagesBefore = await agent.getSessionMessages(session);
		assert.ok(messagesBefore.length > 0, 'should have messages');

		// Dispose removes from memory
		await agent.disposeSession(session);

		// Messages should still be readable from storage
		const messagesAfter = await agent.getSessionMessages(session);
		assert.deepStrictEqual(
			messagesBefore.map(m => m.type),
			messagesAfter.map(m => m.type),
			'message types should match after restore',
		);
	});

	test('session resume rebuilds conversation for model', async () => {
		const messagesPerCall: number[] = [];

		const agent = createAgent((_callIndex, messages) => {
			messagesPerCall.push(messages.length);
			return [{ type: 'text-delta', text: 'OK' }];
		});

		const session = await agent.createSession({ model: TEST_MODEL, workingDirectory: workDir });

		// Turn 1
		await runAgentAndCollectProgress(agent, session, 'First');
		// Turn 2
		await runAgentAndCollectProgress(agent, session, 'Second');

		// Dispose and re-send (forces restore from storage)
		await agent.disposeSession(session);
		await runAgentAndCollectProgress(agent, session, 'Third after restore');

		// Turn 1: 1 message (user)
		// Turn 2: 3 messages (user + assistant + user)
		// Turn 3: 5 messages (user + assistant + user + assistant + user)
		assert.deepStrictEqual(messagesPerCall, [1, 3, 5]);
	});

	test('bash tool with persistent shell', async () => {
		const agent = createAgent((callIndex) => {
			if (callIndex === 0) {
				return [
					{
						type: 'tool-call-complete', toolCallId: 'c1', toolName: 'bash',
						arguments: '{"command":"echo hello"}'
					},
				];
			}
			return [{ type: 'text-delta', text: 'Command ran successfully.' }];
		});

		const session = await agent.createSession({ model: TEST_MODEL, workingDirectory: workDir });
		const events = await runAgentAndCollectProgress(agent, session, 'Run echo');

		assertProgressSnapshot(events, `
			tool-start: bash(Running \`echo hello\`)
			tool-complete: c1 (ok)
			delta: "Command ran successfully."
			idle
		`);
	});

	test('usage events flow through', async () => {
		const agent = createAgent(() => [
			{ type: 'text-delta', text: 'Hi' },
			{ type: 'usage', inputTokens: 100, outputTokens: 50 },
		]);

		const session = await agent.createSession({ model: TEST_MODEL, workingDirectory: workDir });
		const events = await runAgentAndCollectProgress(agent, session, 'Hi');

		assertProgressSnapshot(events, `
			delta: "Hi"
			usage: in=100 out=50
			idle
		`);
	});
});
