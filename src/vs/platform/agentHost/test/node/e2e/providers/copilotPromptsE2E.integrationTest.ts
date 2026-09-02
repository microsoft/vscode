/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Pins every field of the model request body the bundled Copilot CLI sends per
 * model.
 *
 * The prompt is compiled into the `@github/copilot` binary and only becomes
 * observable when the CLI serializes it onto the wire, so it is read off a
 * *replayed* turn — deterministic and tokenless. Recording is the
 * nondeterministic direction: it reaches live CAPI for the model catalog and
 * experiment assignment, either of which moves the prompt for reasons this
 * repository does not own, so a recording run never produces a baseline.
 *
 * A diff means the CLI changed (an SDK bump) or the host changed what it hands
 * the CLI. See the README's "Prompt snapshots" section for what is elided and
 * how to add a model.
 *
 * Run, then accept a new baseline and review the diff:
 *   ./scripts/test-integration.sh --run <this file>
 *   AGENT_HOST_UPDATE_AHP_SNAPSHOTS=1 ./scripts/test-integration.sh --run <this file>
 */

import assert from 'assert';
import { existsSync, writeFileSync } from 'fs';
import { mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { URI } from '../../../../../../base/common/uri.js';
import { assertSnapshot } from '../../../../../../base/test/common/snapshot.js';
import { ActionType } from '../../../../common/state/sessionActions.js';
import { MessageKind, ToolCallConfirmationReason, buildDefaultChatUri } from '../../../../common/state/sessionState.js';
import { AgentHostE2EServerLease, createRealSession } from '../harness/agentHostE2ETestHarness.js';
import {
	AgentHostUpdateAhpSnapshotsEnvVar, AgentHostUpdateSnapshotsEnvVar, snapshotPathForTest,
} from '../harness/ahpSnapshot.js';
import { TestProtocolClient } from '../../serverIntegrationTestHelpers.js';
import { COPILOT_CONFIG } from './copilotTestConfiguration.js';

/** Only the replay-scoped flag accepts a baseline; the other one implies recording. */
const UPDATE_SNAPSHOTS = process.env[AgentHostUpdateAhpSnapshotsEnvVar] === '1';
const RECORDING = process.env[AgentHostUpdateSnapshotsEnvVar] === '1'
	|| process.env['AGENT_HOST_REPLAY_RECORD'] === '1';

/**
 * Includes the model families covered by the extension's `agentPrompt.spec.tsx`
 * plus newer families supported by the Agent Host. Several families share a
 * baseline, but they are kept per family so a future divergence names the family
 * that introduced it.
 *
 * Adding one takes an entry here, an entry in `capiStubs.ts` (a model missing
 * from `/models` is rejected before the CLI builds a request), a fixture in
 * `captures/`, and a committed baseline.
 *
 * `gpt-4.1` and `grok-code-fast-1` are absent because the CLI issues no model
 * request for either under replay. No unselected entry is pinned: the CLI would
 * rank the stub catalog itself, making the baseline a property of the fixture.
 */
const SNAPSHOT_MODELS = [
	'gpt-5',
	'gpt-5-mini',
	'gpt-5-codex',
	'gpt-5.1',
	'gpt-5.1-codex',
	'gpt-5.1-codex-mini',
	'gpt-5.6-sol',
	'gpt-5.6-luna',
	'gpt-5.6-terra',
	'claude-haiku-4.5',
	'claude-sonnet-4.5',
	'claude-opus-4.5',
	'claude-sonnet-4.6',
	'claude-opus-4.6',
	'claude-opus-4.7',
	'claude-opus-4.8',
	'claude-sonnet-5',
	'claude-opus-5',
	'gemini-2.0-flash',
] as const;

suite('Agent Host E2E — Copilot prompts', function () {

	let client: TestProtocolClient;
	let lease: AgentHostE2EServerLease | undefined;
	const createdSessions: string[] = [];
	const tempDirs: string[] = [];

	suiteSetup(function () {
		lease = new AgentHostE2EServerLease(COPILOT_CONFIG);
	});

	setup(async function () {
		this.timeout(60_000);
		if (!lease) {
			throw new Error('Lease not initialized');
		}
		({ client } = await lease.acquire(this.currentTest?.title ?? 'unknown'));
	});

	teardown(async function () {
		this.timeout(90_000);
		if (!lease) {
			throw new Error('Lease not initialized');
		}
		// A failed test can leave a mid-turn session that wedges the shared host,
		// cascading into the next model; restart it rather than reusing it.
		const failed = this.currentTest?.state === 'failed';
		if (failed) {
			lease.dumpRuntimeLogsOnFailure(this.currentTest?.title ?? 'unknown');
		}
		try {
			await lease.release(createdSessions, failed);
		} finally {
			for (const dir of tempDirs) {
				try { await rm(dir, { recursive: true, force: true }); } catch { /* best effort */ }
			}
			tempDirs.length = 0;
		}
	});

	suiteTeardown(async function () {
		this.timeout(30_000);
		try {
			await lease?.dispose();
		} finally {
			for (const dir of tempDirs) {
				try { await rm(dir, { recursive: true, force: true }); } catch { /* best effort */ }
			}
			tempDirs.length = 0;
		}
	});

	for (const model of SNAPSHOT_MODELS) {
		// POSIX-only: the Windows prompt carries PowerShell-only sections rather
		// than being a renaming of this one, and one is gated on a machine probe.
		// SDK drift is provider-wide, so POSIX runners already catch it. See
		// KNOWN_ISSUES.md.
		(process.platform === 'win32' ? test.skip : test)(model, async function () {
			this.timeout(120_000);

			const workspaceDir = await mkdtemp(`${tmpdir()}/ahp-prompt-snap-`);
			tempDirs.push(workspaceDir);

			const sessionUri = await createRealSession(client, COPILOT_CONFIG, `prompt-snap-${model}`, createdSessions, URI.file(workspaceDir));
			await driveTurnWithModel(client, sessionUri, model);

			// Taking the last keeps this meaningful if the CLI inserts a preflight request.
			const body = lease!.observedModelRequestBodies.at(-1);
			assert.ok(body, 'no model request body was captured — the turn never reached the model');

			await assertPromptSnapshot(this.test!, formatPromptSnapshot(body));
		});
	}
});

/** Dispatches a turn with an explicit model selection and waits for completion. */
async function driveTurnWithModel(c: TestProtocolClient, sessionUri: string, model: string): Promise<void> {
	const chatUri = buildDefaultChatUri(sessionUri);
	c.clearReceived();
	c.dispatch({
		channel: chatUri,
		clientSeq: 1,
		action: {
			type: ActionType.ChatTurnStarted,
			turnId: `turn-${model}`,
			startedAt: new Date().toISOString(),
			message: {
				text: 'Say exactly "ok"',
				origin: { kind: MessageKind.User },
				model: { id: model },
			},
		},
	});

	// Drive until turnComplete, auto-confirming any tool calls.
	const seenNotifications = new Set<object>();
	let nextClientSeq = 2;
	while (true) {
		const n = await c.waitForNotification(notification => {
			if (seenNotifications.has(notification as object)) { return false; }
			const envelope = notification as { params?: { action?: { type?: string } } };
			const type = envelope?.params?.action?.type;
			return type === ActionType.ChatTurnComplete || type === ActionType.ChatToolCallReady || type === ActionType.ChatError;
		}, 60_000);
		seenNotifications.add(n as object);

		const envelope = n as { params?: { action?: { type?: string; turnId?: string; toolCallId?: string; message?: unknown } } };
		const type = envelope?.params?.action?.type;
		if (type === ActionType.ChatError) {
			// The request may still have reached the proxy, so failing here is what
			// keeps a broken turn from being snapshotted as a good prompt.
			throw new Error(`turn for model '${model}' failed: ${JSON.stringify(envelope.params?.action?.message ?? envelope.params?.action)}`);
		}
		if (type === ActionType.ChatTurnComplete) {
			break;
		}
		if (type === ActionType.ChatToolCallReady) {
			c.dispatch({
				channel: chatUri,
				clientSeq: nextClientSeq++,
				action: {
					type: ActionType.ChatToolCallConfirmed,
					turnId: envelope.params!.action!.turnId!,
					toolCallId: envelope.params!.action!.toolCallId!,
					approved: true,
					confirmed: ToolCallConfirmationReason.Setting,
				},
			});
		}
	}
}

async function assertPromptSnapshot(test: Mocha.Runnable, content: string): Promise<void> {
	if (RECORDING) {
		return;
	}
	const snapshotPath = snapshotPathForTest(test, 'prompt', 'md');
	if (UPDATE_SNAPSHOTS) {
		writeFileSync(snapshotPath, content);
		return;
	}
	// `assertSnapshot` would create the missing file and pass, greening a model
	// against a baseline nobody wrote.
	if (!existsSync(snapshotPath)) {
		throw new Error(`no committed prompt baseline at ${snapshotPath}. Generate it with ${AgentHostUpdateAhpSnapshotsEnvVar}=1 and commit the result.`);
	}
	await assertSnapshot(content, { name: 'prompt', extension: 'md' });
}

/** A partial view for the shape guard; the cast strips nothing from the serialized body. */
interface IWireRequest {
	/** Anthropic Messages spells the system prompt `system`; Responses uses `instructions`. */
	readonly system?: unknown;
	readonly instructions?: unknown;
	/** Anthropic Messages carries the turn in `messages`; Responses uses `input`. */
	readonly messages?: ReadonlyArray<{ readonly role?: string; readonly content?: unknown }>;
	readonly input?: unknown;
	readonly tools?: readonly unknown[];
}

function formatPromptSnapshot(rawBody: string): string {
	const request = JSON.parse(rawBody) as IWireRequest;
	const system = extractText(request.instructions ?? request.system);
	const tools = request.tools;
	const messages = readMessages(request);
	const emptyMessage = messages.find(message => message.text.length === 0);

	// A hollow capture would otherwise become a small, plausible-looking baseline.
	assert.ok(system.length > 0, 'the model request carried no system prompt — the wire shape likely changed');
	assert.ok(Array.isArray(tools) && tools.length > 0, 'the model request carried no tool definitions — the wire shape likely changed');
	assert.ok(messages.length > 0, 'the model request carried no turn messages — the wire shape likely changed');
	assert.ok(!emptyMessage, `the '${emptyMessage?.role ?? 'unknown'}' turn message was empty — the wire shape likely changed`);

	const lines: string[] = ['```json'];
	lines.push(JSON.stringify(normalizeVolatileValues(request), null, 2));
	lines.push('```');
	lines.push('');

	return lines.join('\n');
}

/** Runs before serialization: the normalizers expect real newlines, not `\n` escapes. */
function normalizeVolatileValues(value: unknown): unknown {
	if (typeof value === 'string') {
		return normalizeVolatile(value);
	}
	if (Array.isArray(value)) {
		return value.map(normalizeVolatileValues);
	}
	if (value && typeof value === 'object') {
		return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, normalizeVolatileValues(item)]));
	}
	return value;
}

/** Reads the turn's messages per dialect, for the shape guard only — never rendered. */
function readMessages(request: IWireRequest): { role: string; text: string }[] {
	if (request.messages !== undefined) {
		if (!Array.isArray(request.messages)) {
			return [];
		}
		return request.messages.map(message => ({ role: message.role ?? 'unknown', text: extractMessageContent(message.content) }));
	}
	if (typeof request.input === 'string') {
		return [{ role: 'user', text: request.input }];
	}
	if (!Array.isArray(request.input)) {
		return [];
	}
	const messages: { role: string; text: string }[] = [];
	for (const raw of request.input) {
		const item = raw as { type?: string; role?: string; content?: unknown; name?: string; arguments?: string; output?: unknown };
		switch (item.type) {
			case undefined:
			case 'message':
				messages.push({ role: item.role ?? 'user', text: extractMessageContent(item.content) });
				break;
			case 'function_call':
				messages.push({ role: 'assistant', text: `[tool_use ${item.name ?? '(unnamed)'}] ${item.arguments ?? ''}` });
				break;
			case 'function_call_output':
				messages.push({ role: 'user', text: `[tool_result] ${extractMessageContent(item.output)}` });
				break;
		}
	}
	return messages;
}

/** Reduces a content block to text for the shape guard's emptiness check. */
function extractMessageContent(content: unknown): string {
	if (typeof content === 'string') {
		return content;
	}
	if (Array.isArray(content)) {
		return content.map(extractMessageContent).filter(Boolean).join('\n');
	}
	if (!content || typeof content !== 'object') {
		return '';
	}
	const block = content as { type?: string; text?: unknown; name?: unknown; input?: unknown; content?: unknown };
	if (typeof block.text === 'string') {
		return block.text;
	}
	if (block.type === 'tool_use') {
		return `[tool_use ${typeof block.name === 'string' ? block.name : '(unnamed)'}] ${JSON.stringify(block.input ?? {})}`;
	}
	if (block.type === 'tool_result') {
		return `[tool_result] ${extractMessageContent(block.content)}`;
	}
	return Object.keys(block).length > 0 ? JSON.stringify(block) : '';
}

/** Flattens a string, a content-block list, or a single block down to its text. */
function extractText(content: unknown): string {
	if (typeof content === 'string') {
		return content;
	}
	if (Array.isArray(content)) {
		return content.map(extractText).filter(Boolean).join('\n');
	}
	if (content && typeof content === 'object') {
		const text = (content as { text?: unknown }).text;
		return typeof text === 'string' ? text : '';
	}
	return '';
}

/**
 * Elides what `CapiReplayProxy._normalize` does not: values that differ between
 * two correct runs, plus two that are stable but belong to another file's change
 * budget — the injected repository instructions, and the model catalog the CLI
 * inlines into the `Task` schema, either of which would otherwise rewrite every
 * baseline here on an unrelated edit. Each keeps its label or wrapper, so a
 * change to the shape of these lines, or their disappearance, still fails.
 */
function normalizeVolatile(text: string): string {
	return text
		.replaceAll('\r\n', '\n')
		.replace(/(session-state\/)[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '$1${session_id}')
		.replace(/<current_datetime>[^<]*<\/current_datetime>/g, '<current_datetime>${datetime}</current_datetime>')
		.replace(/^\* Operating System: .*$/gm, '* Operating System: ${os}')
		.replace(/^\* Available tools: .*$/gm, '* Available tools: ${available_tools}')
		.replace(/^\* You can install (?:Linux, )?Python, JavaScript and Go packages with the (?:`apt`, )?`pip`, `npm` and `go` commands\.$/gm, '* You can install ${platform_packages}.')
		.replace(/<custom_instruction>[\s\S]*?<\/custom_instruction>/g, '<custom_instruction>${repository_instructions}</custom_instruction>')
		.replace(/\(\d+ models available\)/g, '(${model_count} models available)')
		.replace(/(Available models:)(?:\n {2}- '[^']*' \([^)]*\)[^\n]*)+/g, '$1${model_catalog}')
		// Last, so the labelled ids above keep their own placeholders.
		.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '${uuid}');
}

suite('Copilot prompt snapshot formatting', () => {
	test('rejects incomplete request body shapes', () => {
		const validBody = {
			system: 'System prompt',
			tools: [{ name: 'example', input_schema: { type: 'object' } }],
			messages: [{ role: 'user', content: 'Hello' }],
		};
		const cases: readonly [body: object, expected: RegExp][] = [
			[{ ...validBody, system: '' }, /carried no system prompt/],
			[{ ...validBody, tools: [] }, /carried no tool definitions/],
			[{ ...validBody, tools: 'not-an-array' }, /carried no tool definitions/],
			[{ ...validBody, messages: [] }, /carried no turn messages/],
			[{ ...validBody, messages: 'not-an-array' }, /carried no turn messages/],
			[{ ...validBody, messages: [{ role: 'user', content: '' }] }, /turn message was empty/],
		];

		for (const [body, expected] of cases) {
			assert.throws(() => formatPromptSnapshot(JSON.stringify(body)), expected);
		}
	});

	test('renders the request body whole, normalizing volatile values in place', () => {
		const body = {
			model: 'claude-opus-5',
			system: 'System prompt\n* Operating System: Frobnitz 9\n<current_datetime>2026-01-01</current_datetime>',
			tools: [{ name: 'example', input_schema: { type: 'object' } }, { type: 'web_search' }],
			messages: [{
				role: 'assistant',
				content: [{ type: 'tool_use', id: 'call-1', name: 'example', input: { value: 1 } }],
			}],
			parallel_tool_calls: true,
			thinking: { type: 'enabled', budget_tokens: 4096 },
			metadata: { session_id: '12345678-1234-1234-1234-123456789abc' },
		};
		const snapshot = formatPromptSnapshot(JSON.stringify(body));

		const lines = snapshot.split('\n');
		assert.deepStrictEqual(JSON.parse(lines.slice(1, lines.indexOf('```', 1)).join('\n')), {
			...body,
			system: 'System prompt\n* Operating System: ${os}\n<current_datetime>${datetime}</current_datetime>',
			metadata: { session_id: '${uuid}' },
		});
	});
});
