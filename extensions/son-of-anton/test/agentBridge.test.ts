/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as assert from 'assert';
import * as vscode from 'vscode';
import { AgentBridge } from '../src/chat/AgentBridge';
import type { AgentStack } from '../src/agents/AgentStackFactory';
import type { BaseAgent } from '../src/agents/BaseAgent';
import type { OrchestratorAgent } from '../src/agents/OrchestratorAgent';
import type { AgentHandle } from '../src/agents/types';
import type { AgentEvent } from '../src/chat/agentEvents';

// ── Fakes ─────────────────────────────────────────────────────────────────────

function token(cancelled = false): vscode.CancellationToken {
	return {
		isCancellationRequested: cancelled,
		onCancellationRequested: () => ({ dispose: () => { /* no-op */ } }),
	} as unknown as vscode.CancellationToken;
}

interface FakeAgent {
	readonly handle: AgentHandle;
	lastPrompt?: string;
	tokensEmitted: boolean;
	runChatTurn(
		prompt: string,
		emit: (t: string) => void,
		cancellation: vscode.CancellationToken,
	): Promise<string>;
}

function makeFakeAgent(handle: AgentHandle, tokens: readonly string[], failWith?: string): FakeAgent {
	const agent: FakeAgent = {
		handle,
		tokensEmitted: false,
		async runChatTurn(prompt, emit) {
			if (failWith) {
				throw new Error(failWith);
			}
			agent.lastPrompt = prompt;
			let full = '';
			for (const t of tokens) { emit(t); full += t; }
			agent.tokensEmitted = true;
			return full;
		},
	};
	return agent;
}

interface FakeOrchestrator {
	lastPrompt?: string;
	receivedStructuredEmit: boolean;
	handleChatRequest(
		request: vscode.ChatRequest,
		ctx: vscode.ChatContext,
		stream: vscode.ChatResponseStream,
		t: vscode.CancellationToken,
		structuredEmit?: (event: AgentEvent) => void,
	): Promise<void>;
}

function makeOrchestrator(opts: { fail?: string } = {}): FakeOrchestrator {
	const orchestrator: FakeOrchestrator = {
		receivedStructuredEmit: false,
		async handleChatRequest(request, _ctx, stream, _t, structuredEmit) {
			if (opts.fail) {
				throw new Error(opts.fail);
			}
			orchestrator.lastPrompt = request.prompt;
			orchestrator.receivedStructuredEmit = typeof structuredEmit === 'function';
			stream.markdown('Planning...');
			structuredEmit?.({
				type: 'plan-proposed',
				plan: {
					subtasks: [{
						instruction: 'Do the thing',
						assignee: 'anton-code',
						scopeFiles: ['file.ts'],
						dependencies: [],
					}],
				},
			});
			structuredEmit?.({ type: 'subtask-started', subtaskId: 's1', assignee: 'anton-code', instruction: 'Do' });
			structuredEmit?.({ type: 'subtask-completed', subtaskId: 's1', assignee: 'anton-code', summary: 'Done' });
		},
	};
	return orchestrator;
}

function makeStack(specialists: ReadonlyMap<AgentHandle, FakeAgent>, orchestrator: FakeOrchestrator): AgentStack {
	return {
		orchestrator: orchestrator as unknown as OrchestratorAgent,
		specialists: specialists as unknown as ReadonlyMap<AgentHandle, BaseAgent>,
		registrations: [],
		metricsTracker: {} as never,
		projectMemory: {} as never,
		dispose: () => { /* no-op */ },
	} as AgentStack;
}

// ── AgentBridge unit tests ────────────────────────────────────────────────────

suite('AgentBridge', () => {
	test('hasAgent returns true for "anton" (orchestrator handle is special)', () => {
		const bridge = new AgentBridge(makeStack(new Map(), makeOrchestrator()));
		assert.strictEqual(bridge.hasAgent('anton'), true);
	});

	test('hasAgent reports membership for registered specialists and unknown ids', () => {
		const code = makeFakeAgent('anton-code', ['x']);
		const bridge = new AgentBridge(makeStack(new Map([['anton-code', code]]), makeOrchestrator()));
		assert.deepStrictEqual(
			{ code: bridge.hasAgent('anton-code'), unknown: bridge.hasAgent('unknown') },
			{ code: true, unknown: false },
		);
	});

	test('runOrchestrator forwards prompt and emits structured events', async () => {
		const orchestrator = makeOrchestrator();
		const bridge = new AgentBridge(makeStack(new Map(), orchestrator));

		const events: AgentEvent[] = [];
		await bridge.runOrchestrator('plan a feature', e => events.push(e), token());

		assert.deepStrictEqual(
			{
				prompt: orchestrator.lastPrompt,
				wasStructured: orchestrator.receivedStructuredEmit,
				eventTypes: events.map(e => e.type),
			},
			{
				prompt: 'plan a feature',
				wasStructured: true,
				eventTypes: ['token', 'plan-proposed', 'subtask-started', 'subtask-completed', 'final'],
			},
		);
	});

	test('runOrchestrator emits an error event when the orchestrator throws', async () => {
		const bridge = new AgentBridge(makeStack(new Map(), makeOrchestrator({ fail: 'boom' })));
		const events: AgentEvent[] = [];
		await bridge.runOrchestrator('hello', e => events.push(e), token());

		const last = events[events.length - 1];
		assert.deepStrictEqual(
			{ type: last.type, message: last.type === 'error' ? last.message : '' },
			{ type: 'error', message: 'boom' },
		);
	});

	test('runSpecialist routes to the specialist and emits token + final', async () => {
		const code = makeFakeAgent('anton-code', ['hello ', 'world']);
		const bridge = new AgentBridge(makeStack(new Map([['anton-code', code]]), makeOrchestrator()));
		const events: AgentEvent[] = [];
		await bridge.runSpecialist('anton-code', 'do thing', e => events.push(e), token());

		const finalEvent = events.find(e => e.type === 'final');
		assert.deepStrictEqual(
			{
				lastPrompt: code.lastPrompt,
				eventTypes: events.map(e => e.type),
				finalText: finalEvent?.type === 'final' ? finalEvent.text : '',
			},
			{
				lastPrompt: 'do thing',
				eventTypes: ['token', 'token', 'final'],
				finalText: 'hello world',
			},
		);
	});

	test('runSpecialist throws when the specialist handle is not registered', async () => {
		const bridge = new AgentBridge(makeStack(new Map(), makeOrchestrator()));
		await assert.rejects(
			() => bridge.runSpecialist('anton-code', 'whatever', () => { /* ignore */ }, token()),
			/No agent registered for specialist "anton-code"/,
		);
	});

	test('runSpecialist emits error event when the specialist throws', async () => {
		const failing = makeFakeAgent('anton-code', [], 'llm exploded');
		const bridge = new AgentBridge(makeStack(new Map([['anton-code', failing]]), makeOrchestrator()));
		const events: AgentEvent[] = [];
		await bridge.runSpecialist('anton-code', 'do thing', e => events.push(e), token());

		assert.deepStrictEqual(
			events.map(e => ({ type: e.type, message: e.type === 'error' ? e.message : undefined })),
			[{ type: 'error', message: 'llm exploded' }],
		);
	});

	test('runSpecialist with a pre-cancelled token completes without throwing', async () => {
		const code = makeFakeAgent('anton-code', ['t']);
		const bridge = new AgentBridge(makeStack(new Map([['anton-code', code]]), makeOrchestrator()));
		await bridge.runSpecialist('anton-code', 'go', () => { /* ignore */ }, token(true));
		assert.strictEqual(code.tokensEmitted, true);
	});
});
