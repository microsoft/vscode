/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * System-prompt snapshot tests for the Copilot provider.
 *
 * The assembled prompt is the Copilot CLI's product rather than the host's: it
 * is compiled into the `@github/copilot` native binary and only becomes
 * observable when the CLI serializes it onto the wire. The replay proxy sees
 * every model request whether or not it forwards upstream, so the prompt is read
 * off a *replayed* turn — deterministic, tokenless, and safe to assert in CI.
 *
 * Recording is the nondeterministic direction, which is why these tests do not
 * snapshot there: a recording run reaches live CAPI for the model catalog and
 * experiment assignment, and both can move the prompt underneath the host. A
 * baseline taken while recording would churn for reasons that have nothing to do
 * with this repository.
 *
 * What this pins is the prompt and tool schemas the *bundled* CLI produces for a
 * given model. A diff means either the CLI changed (an SDK bump) or the host
 * changed what it hands the CLI. The host's own contribution — the
 * `SystemMessageConfig` it composes — is a pure function unit-tested in
 * `agentHostPromptRegistry.test.ts`; this is its end-to-end counterpart, and the
 * only place the SDK-authored foundation prompt is visible at all.
 *
 * Run (no token needed):
 *   ./scripts/test-integration.sh --run \
 *     src/vs/platform/agentHost/test/node/e2e/providers/copilotPromptsE2E.integrationTest.ts
 *
 * Accept new baselines after an SDK bump, then review the diff:
 *   AGENT_HOST_UPDATE_AHP_SNAPSHOTS=1 ./scripts/test-integration.sh --run \
 *     src/vs/platform/agentHost/test/node/e2e/providers/copilotPromptsE2E.integrationTest.ts
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

/**
 * Only the replay-scoped flag accepts a baseline. `AgentHostUpdateSnapshotsEnvVar`
 * also puts the harness in live-record mode, and a prompt captured while recording
 * reflects the live model catalog and experiment assignment rather than this repo.
 */
const UPDATE_SNAPSHOTS = process.env[AgentHostUpdateAhpSnapshotsEnvVar] === '1';
const RECORDING = process.env[AgentHostUpdateSnapshotsEnvVar] === '1'
	|| process.env['AGENT_HOST_REPLAY_RECORD'] === '1';

/**
 * Model families whose assembled prompt is pinned, mirroring the `testFamilies`
 * list in the Copilot extension's `agentPrompt.spec.tsx` so the two prompt
 * surfaces are compared over the same set.
 *
 * `gpt-4.1` and `grok-code-fast-1` are intentionally absent: the CLI issues no
 * model request for either under replay, so there is no prompt to capture and
 * the test fails with an empty body rather than a diff.
 *
 * Families sharing a dialect largely produce the same prompt — the CLI does not
 * branch it per model within a dialect, and the host contributes the same
 * sections to every model without a contributor of its own — so several of these
 * baselines are near-identical by construction. They are kept per family anyway
 * so a future per-model divergence shows up against the family that introduced
 * it rather than silently against whichever one happened to be pinned.
 *
 * Each entry needs a committed fixture in `captures/` named after its test title
 * (`copilotcli-<slug>.yaml`), because a replayed turn still has to be answered,
 * and an entry in `capiStubs.ts`'s catalog, because a model missing from
 * `/models` is rejected before the CLI ever builds a request.
 *
 * `default` sends no selection at all. Under replay it resolves against the stub
 * catalog rather than the provider's real default, so treat its baseline as
 * "whatever the catalog's default is", and expect it to move when that changes.
 */
const SNAPSHOT_MODELS = [
	'default',
	'gpt-5',
	'gpt-5-mini',
	'gpt-5-codex',
	'gpt-5.1',
	'gpt-5.1-codex',
	'gpt-5.1-codex-mini',
	'claude-haiku-4.5',
	'claude-sonnet-4.5',
	'claude-opus-4.5',
	'claude-sonnet-4.6',
	'claude-opus-4.6',
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
		this.timeout(60_000);
		if (!lease) {
			throw new Error('Lease not initialized');
		}
		await lease.release(createdSessions);
		for (const dir of tempDirs) {
			try { await rm(dir, { recursive: true, force: true }); } catch { /* best effort */ }
		}
		tempDirs.length = 0;
	});

	suiteTeardown(async function () {
		this.timeout(30_000);
		await lease?.dispose();
	});

	for (const model of SNAPSHOT_MODELS) {
		// POSIX-only. The Windows prompt is not a renaming of this one: the CLI
		// runtime carries whole PowerShell-only sections (no-heredoc guidance,
		// `if ($?)` chaining, the `.bat` PATH caveat) that POSIX never emits, and
		// one of them is gated on whether the host has PowerShell 7 — resolved by
		// probing the machine, so two Windows runners can legitimately disagree.
		// A fixture sidesteps all of this by storing `${shell}` and expanding it
		// per platform, but here the prose *is* the asserted artifact: projecting
		// it away would delete the tool instructions this snapshot exists to pin.
		// Prompt drift from an SDK bump is provider-wide, so the Linux and macOS
		// runners already deliver that signal; see KNOWN_ISSUES.md.
		(process.platform === 'win32' ? test.skip : test)(model, async function () {
			this.timeout(120_000);

			const workspaceDir = await mkdtemp(`${tmpdir()}/ahp-prompt-snap-`);
			tempDirs.push(workspaceDir);

			const sessionUri = await createRealSession(client, COPILOT_CONFIG, `prompt-snap-${model}`, createdSessions, URI.file(workspaceDir));
			await driveTurnWithModel(client, sessionUri, model);

			// The last request is the one the turn ended on; for a single-turn
			// prompt there is exactly one, and taking the last keeps the snapshot
			// meaningful if the CLI ever inserts a preflight request.
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
			startedAt: '2025-01-01T00:00:00.000Z',
			message: {
				text: 'Say exactly "ok"',
				origin: { kind: MessageKind.User },
				...(model !== 'default' && { model: { id: model } }),
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

/**
 * Writes the baseline during an update run and asserts it otherwise.
 *
 * Mirrors `assertRecordedAhpSnapshot`: `assertSnapshot` creates a missing
 * baseline but never overwrites one, so accepting a changed prompt needs the
 * same explicit env var the AHP snapshots use.
 */
async function assertPromptSnapshot(test: Mocha.Runnable, content: string): Promise<void> {
	if (RECORDING) {
		return; // a recording run's prompt comes from the live catalog, not this repo
	}
	const snapshotPath = snapshotPathForTest(test, 'prompt', 'md');
	if (UPDATE_SNAPSHOTS) {
		writeFileSync(snapshotPath, content);
		return;
	}
	// `assertSnapshot` creates a missing baseline and passes, which would let a
	// newly added model go green against a file nobody wrote or reviewed.
	if (!existsSync(snapshotPath)) {
		throw new Error(`no committed prompt baseline at ${snapshotPath}. Generate it with ${AgentHostUpdateAhpSnapshotsEnvVar}=1 and commit the result.`);
	}
	await assertSnapshot(content, { name: 'prompt', extension: 'md' });
}

interface IWireTool {
	readonly name?: string;
	readonly description?: string;
	/** Anthropic Messages spells the schema `input_schema`; Responses uses `parameters`. */
	readonly input_schema?: unknown;
	readonly parameters?: unknown;
}

interface IWireRequest {
	readonly model?: string;
	/** Anthropic Messages spells the system prompt `system`; Responses uses `instructions`. */
	readonly system?: unknown;
	readonly instructions?: unknown;
	/** Anthropic Messages carries the turn in `messages`; Responses uses `input`. */
	readonly messages?: ReadonlyArray<{ readonly role?: string; readonly content?: unknown }>;
	readonly input?: unknown;
	readonly tools?: readonly IWireTool[];
}

/**
 * Renders everything the model is given, as reviewable markdown: the system
 * prompt, the tool definitions, and the turn messages.
 *
 * The messages are included because the CLI wraps the user's text in injected
 * context — `<current_datetime>`, `<system_reminder>`, the available-table
 * listing — that reaches the model exactly like the system prompt does. The
 * scaffolding text this test sends (`Say exactly "ok"`) rides along, but it is a
 * constant, so it costs three stable lines and keeps the injection visible.
 *
 * Both CAPI dialects are handled from one formatter: the Anthropic Messages
 * shape (`system` / `messages` / `input_schema`) and the Responses shape
 * (`instructions` / `input` / `parameters`). Reading only the Anthropic spelling
 * silently produced an empty prompt for every OpenAI-family model, which is
 * exactly the content these tests exist to pin.
 */
function formatPromptSnapshot(rawBody: string): string {
	const request = JSON.parse(rawBody) as IWireRequest;
	const lines: string[] = [];

	lines.push('### Model');
	lines.push(request.model ?? '(unknown)');
	lines.push('');

	lines.push('### System');
	lines.push('~~~md');
	lines.push(extractText(request.instructions ?? request.system));
	lines.push('~~~');
	lines.push('');

	const tools = request.tools ?? [];
	if (tools.length > 0) {
		lines.push(`### Tools (${tools.length})`);
		lines.push('');
		for (const tool of tools) {
			lines.push(`#### ${tool.name ?? '(unnamed)'}`);
			if (tool.description) {
				lines.push(tool.description);
			}
			const schema = tool.input_schema ?? tool.parameters;
			if (schema) {
				lines.push('```json');
				lines.push(JSON.stringify(schema, null, 2));
				lines.push('```');
			}
			lines.push('');
		}
	}

	const messages = readMessages(request);
	if (messages.length > 0) {
		lines.push(`### Messages (${messages.length})`);
		lines.push('');
		for (const message of messages) {
			lines.push(`#### [${message.role}]`);
			lines.push(message.text);
			lines.push('');
		}
	}

	return normalizeVolatile(lines.join('\n'));
}

/** Reads the turn's messages from whichever dialect the request uses. */
function readMessages(request: IWireRequest): { role: string; text: string }[] {
	if (request.messages) {
		return request.messages.map(message => ({ role: message.role ?? 'unknown', text: extractText(message.content) }));
	}
	if (typeof request.input === 'string') {
		return [{ role: 'user', text: request.input }];
	}
	if (!Array.isArray(request.input)) {
		return [];
	}
	// Responses items are a flat list: `message` items carry the conversation,
	// while `function_call` / `function_call_output` carry tool wiring. Unlike
	// the fixture projection, `developer` / `system` roles are kept — they are
	// part of the prompt this snapshot exists to show.
	const messages: { role: string; text: string }[] = [];
	for (const raw of request.input) {
		const item = raw as { type?: string; role?: string; content?: unknown; name?: string; arguments?: string; output?: unknown };
		switch (item.type) {
			case undefined:
			case 'message':
				messages.push({ role: item.role ?? 'user', text: extractText(item.content) });
				break;
			case 'function_call':
				messages.push({ role: 'assistant', text: `[tool_use ${item.name ?? '(unnamed)'}] ${item.arguments ?? ''}` });
				break;
			case 'function_call_output':
				messages.push({ role: 'user', text: `[tool_result] ${extractText(item.output)}` });
				break;
			default:
				break;
		}
	}
	return messages;
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
 * Normalizes what the replay proxy does not.
 *
 * The goal is to keep as much real prompt text in the baseline as possible, so
 * nothing is dropped merely for being long or awkward to review. The exceptions
 * are values that differ between two correct runs, plus one that is stable but
 * belongs to a different file's change budget.
 *
 * `CapiReplayProxy._normalize` has already collapsed the workspace and home
 * directories, the temp-dir suffix, the user name, and file-listing timestamps
 * before the body reaches `observedModelRequestBodies`, so none of that is
 * repeated here. What remains:
 *
 *  - **Line endings.** The CLI emits the host's, so a macOS baseline would
 *    otherwise fail on Windows.
 *  - **Session id.** Minted per run, and scoped to the session-state path it
 *    actually appears in rather than matched document-wide — a UUID surfacing
 *    anywhere else is new information and should fail the baseline.
 *  - **Clock.** The datetime the CLI stamps into the turn message.
 *  - **Environment probe.** The OS name and the tools found on `PATH` describe
 *    the machine running the test, not the prompt the host assembled. Both keep
 *    their label, so a change to the *shape* of these lines still fails.
 *  - **Repository instructions.** The CLI injects `copilot-instructions.md` and
 *    `AGENTS.md`, read from the server's working directory — this checkout, not
 *    the session's temp workspace. Their content is stable across machines, so
 *    it *could* be pinned, and briefly was. It is elided because the cost is
 *    paid by the wrong file: appending one line to `AGENTS.md` rewrites every
 *    baseline here, turning a docs edit into a large unrelated diff. The
 *    surviving `<custom_instruction>` wrappers still assert that instructions
 *    are injected, how many, and where they sit in the prompt.
 *  - **Model catalog.** The CLI inlines the whole `/models` list into the
 *    `Task` tool's schema, as a count and a per-model listing. Left verbatim,
 *    adding ONE entry to `capiStubs.ts` rewrites every baseline here — including
 *    models nobody snapshots — so a new model release would land as a 13-file
 *    diff. The labels survive, so a change to the shape of those lines, or the
 *    catalog disappearing from the prompt entirely, still fails.
 */
function normalizeVolatile(text: string): string {
	return text
		.replaceAll('\r\n', '\n')
		.replace(/(session-state\/)[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '$1${session_id}')
		.replace(/<current_datetime>[^<]*<\/current_datetime>/g, '<current_datetime>${datetime}</current_datetime>')
		.replace(/^\* Operating System: .*$/gm, '* Operating System: ${os}')
		.replace(/^\* Available tools: .*$/gm, '* Available tools: ${available_tools}')
		.replace(/<custom_instruction>[\s\S]*?<\/custom_instruction>/g, '<custom_instruction>${repository_instructions}</custom_instruction>')
		.replace(/\(\d+ models available\)/g, '(${model_count} models available)')
		.replace(/(Available models:)(?:\\n {2}- '[^']*' \([^)]*\)[^\\"]*)+/g, '$1${model_catalog}');
}
