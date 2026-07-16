/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Shared helpers and a parameterized suite factory for agent host e2e integration
 * tests. Both the Copilot (`copilotcli`) and Claude (`claude`) providers expose
 * the same agent-host protocol, so most tests are identical apart from a
 * handful of provider-specific tool names.
 *
 * Each provider invokes {@link defineAgentHostE2ETests} from its own
 * `*AgentHostE2E.integrationTest.ts` file and then layers on any provider-specific
 * tests as a separate `suite` block.
 */

import assert from 'assert';
import { execSync } from 'child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { fileURLToPath } from 'url';
import { raceTimeout, timeout } from '../../../../../base/common/async.js';
import { join } from '../../../../../base/common/path.js';
import { removeAnsiEscapeCodes } from '../../../../../base/common/strings.js';
import { URI } from '../../../../../base/common/uri.js';
import { generateUuid } from '../../../../../base/common/uuid.js';
import { SubscribeResult } from '../../../common/state/protocol/commands.js';
import { PROTOCOL_VERSION } from '../../../common/state/protocol/version/registry.js';
import {
	MessageKind,
	ResponsePartKind, ROOT_STATE_URI, ChatInputAnswerState, ChatInputAnswerValueKind, ChatInputQuestionKind,
	ChatInputResponseKind, ToolResultContentType, ToolCallConfirmationReason, ToolCallCancellationReason, buildDefaultChatUri, buildSubagentSessionUri, parseChatUri,
	type MessageAttachment, type ChatInputAnswer, type ChatInputRequest, type ISessionWithDefaultChat, type SessionState, type TerminalState,
	type ToolResultContent, type ToolResultSubagentContent,
} from '../../../common/state/sessionState.js';
import type { RootState } from '../../../common/state/protocol/state.js';
import {
	NotificationType,
	ActionType,
	type RootAgentsChangedAction,
	type ChatInputRequestedAction, type ChatToolCallReadyAction,
	type ChatToolCallStartAction,
} from '../../../common/state/sessionActions.js';
import type { SessionAddedParams } from '../../../common/state/protocol/notifications.js';
import { CopilotCliConfigKey } from '../../../common/copilotCliConfig.js';
import { CapiReplayMode } from './capiReplayProxy.js';
import {
	getActionEnvelope, isActionNotification, fetchSessionWithChat, IServerHandle, startRealServer, TestProtocolClient,
} from './testHelpers.js';
import { AgentHostUpdateSnapshotsEnvVar, AhpSnapshotScenario } from './ahpSnapshot.js';

// #region Record/replay

/**
 * `AGENT_HOST_REPLAY_RECORD=1` records only LLM fixtures, while
 * `AGENT_HOST_UPDATE_SNAPSHOTS=1` records LLM fixtures and updates AHP
 * snapshots in the same run.
 */
const UPDATE_SNAPSHOTS = process.env[AgentHostUpdateSnapshotsEnvVar] === '1';
const RECORD = process.env['AGENT_HOST_REPLAY_RECORD'] === '1' || UPDATE_SNAPSHOTS;
const RUN_RECORD_ONLY_TESTS = RECORD && !UPDATE_SNAPSHOTS;
const REPLAY_MODE: CapiReplayMode = RECORD ? 'record' : 'replay';
const SERVER_SHUTDOWN_TIMEOUT_MS = 30_000;
const TEMP_DIR_CLEANUP_TIMEOUT_MS = 30_000;
/** Gate for agent host e2e tests whose local execution is POSIX-specific (shell tool
 * calls, git worktrees, `pwd`) and does not reproduce on Windows. */
const isWindows = process.platform === 'win32';
/** A synthetic token used on replay (no real credential needed). */
export const REPLAY_PLACEHOLDER_TOKEN = 'replay-no-token';

async function stopServer(server: IServerHandle | undefined): Promise<void> {
	const serverProcess = server?.process;
	if (!serverProcess || serverProcess.exitCode !== null || serverProcess.signalCode !== null) {
		return;
	}

	const serverExit = new Promise<void>(resolve => serverProcess.once('exit', () => resolve()));
	serverProcess.stdin?.end();
	if (!await raceTimeout(serverExit.then(() => true), SERVER_SHUTDOWN_TIMEOUT_MS)) {
		serverProcess.kill();
		await serverExit;
	}
}

async function removeTempDirs(tempDirs: string[]): Promise<void> {
	const pendingDirs = tempDirs.splice(0);
	const errors = new Map<string, Error>();
	const deadline = Date.now() + TEMP_DIR_CLEANUP_TIMEOUT_MS;
	while (pendingDirs.length > 0) {
		for (let index = pendingDirs.length - 1; index >= 0; index--) {
			const dir = pendingDirs[index];
			try {
				rmSync(dir, { recursive: true, force: true });
				pendingDirs.splice(index, 1);
				errors.delete(dir);
			} catch (error) {
				errors.set(dir, error instanceof Error ? error : new Error(String(error)));
			}
		}
		if (pendingDirs.length === 0) {
			return;
		}
		if (Date.now() >= deadline) {
			throw new AggregateError(
				Array.from(errors.values()),
				`Failed to remove Agent Host E2E temporary directories: ${pendingDirs.join(', ')}`,
			);
		}
		await timeout(500);
	}
}

/**
 * Fixtures live in the source tree (committed) though the compiled test runs
 * from `out/`/`out-build/` — resolve up to the repo root and into `src/...`.
 */
const CAPTURES_DIR = fileURLToPath(new URL('../../../../../../../src/vs/platform/agentHost/test/node/protocol/captures/agentHostE2E/', import.meta.url));

/** Per-test fixture path derived from the provider + test title. */
function fixturePathFor(provider: string, testTitle: string): string {
	const slug = testTitle.replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '').toLowerCase();
	return join(CAPTURES_DIR, `${provider}-${slug}.yaml`);
}

/**
 * Build the `capiReplay` option for a test: replays the committed per-test
 * fixture by default (tokenless), or records it against real CAPI when
 * `AGENT_HOST_REPLAY_RECORD=1` or `AGENT_HOST_UPDATE_SNAPSHOTS=1`. Shared by
 * {@link defineAgentHostE2ETests} and provider-specific suites.
 */
export function capiReplayFor(provider: string, testTitle: string): { fixturePath: string; real: true; mode: CapiReplayMode; workDir: string } {
	return { fixturePath: fixturePathFor(provider, testTitle), real: true, mode: REPLAY_MODE, workDir: tmpdir() };
}

// #endregion

// #region Token

/** Resolve GitHub token from env or `gh auth token`. */
export function resolveGitHubToken(): string {
	// Replaying committed fixtures needs no real credential: the capture proxy
	// serves recorded responses and ignores auth. Only recording talks to real
	// CAPI and thus needs a real token.
	if (!RECORD) {
		return REPLAY_PLACEHOLDER_TOKEN;
	}
	const envToken = process.env['GITHUB_TOKEN'];
	if (envToken) {
		return envToken;
	}
	try {
		return execSync('gh auth token', { encoding: 'utf-8' }).trim();
	} catch {
		throw new Error('No GITHUB_TOKEN set and `gh auth token` failed. Run `gh auth login` first.');
	}
}

// #endregion

// #region Provider configuration

/**
 * Per-provider knobs for the shared agent host e2e suite. Lets us share the bulk of
 * the test bodies while parameterizing things that genuinely differ between
 * Copilot and Claude (tool names, URI scheme, server startup options).
 */
export interface IAgentHostE2EProviderConfig {
	/** Suite title shown in the test runner. */
	readonly suiteTitle: string;
	/** Provider id passed to `createSession`. */
	readonly provider: string;
	/** URI scheme used when minting session URIs. */
	readonly scheme: string;
	/**
	 * Tool name used by the provider for an interactive shell command. Used
	 * by the shell-permission and cd-prefix tests. (`bash` for Copilot,
	 * `Bash` for Claude.)
	 */
	readonly shellToolName: string;
	/**
	 * Tool names the provider uses to dispatch a subagent. The first entry
	 * is used in the subagent-routing prompt; all entries are exempted from
	 * the "parent must not contain inner tool calls" assertion. (`['task']`
	 * for Copilot; Claude exposes both `Task` and `Agent` as subagent-kind
	 * tools and the model may pick either.)
	 */
	readonly subagentToolNames: readonly string[];
	/**
	 * Tool name used by the provider to confirm the user is ready to leave
	 * plan mode. (`exit_plan_mode` for Copilot, `ExitPlanMode` for Claude.)
	 */
	readonly exitPlanModeToolName: string;
	/**
	 * Whether the suite should be enabled. Returning false skips the suite
	 * entirely (mirrors `suite.skip(...)`).
	 */
	readonly enabled: boolean;
	/**
	 * Optional path to a locally installed `@anthropic-ai/claude-agent-sdk`
	 * package. Forwarded to `startRealServer` so the agent host registers
	 * the Claude provider.
	 */
	readonly claudeSdkRoot?: string;
	/** Optional path to a locally installed `codex` binary. Forwarded to `startRealServer`. */
	readonly codexSdkRoot?: string;
	/**
	 * Provider implements `config.isolation: 'worktree'` and resolves the
	 * working directory to a `.worktrees/...` path on materialization. Now
	 * shared across all agents (Copilot, Codex, Claude) via the host-owned
	 * worktree isolation controller.
	 */
	readonly supportsWorktreeIsolation: boolean;
	/**
	 * Provider routes shell commands through the host-managed custom terminal
	 * tool (gated by {@link CopilotCliConfigKey.EnableCustomTerminalTool}),
	 * which exposes a terminal resource whose `cwd` / `pwd` output can be
	 * asserted. Currently true only for Copilot — Codex and Claude run shell
	 * commands inside their own SDK subprocess and never surface a host
	 * terminal resource, so the worktree suite verifies isolation via the
	 * resolved working directory alone for them.
	 */
	readonly supportsHostTerminalTool: boolean;
	/**
	 * Provider exposes a subagent tool (`task` / `Task`) that produces
	 * `ToolResultSubagentContent` and routes inner tool calls to a child
	 * session. Claude has not landed subagents yet (Phase 12 in roadmap).
	 */
	readonly supportsSubagents: boolean;
	/**
	 * When set, the subagent-reopen ("replay path") test is skipped on Windows for
	 * this provider, which rebuilds the reopened transcript from the bundled SDK's
	 * on-disk `subagents/agent-*.jsonl` files — not reliably visible on Windows
	 * right after the turn, so the transcript can come back empty. macOS/Linux keep
	 * full coverage; providers that rebuild from the in-process event log (Copilot)
	 * are unaffected and stay enabled on Windows.
	 */
	readonly subagentReplayUnstableOnWindows?: boolean;
	/**
	 * Whether the provider's plan-mode flow matches the shared test's
	 * expectations (auto-approve session-state writes; reach the
	 * exit-plan-mode tool as an `inputRequested`). Currently true only for
	 * Copilot — Claude's plan-mode prompt conventions differ enough that the
	 * shared test prompt doesn't reliably drive it to `ExitPlanMode`.
	 */
	readonly supportsPlanMode: boolean;

	/**
	 * The github token to use. If not provided, the test will attempt to resolve it from the environment or `gh auth token`.
	 */
	readonly githubToken?: string;
}

// #endregion

// #region Session creation / dispatch

/** Create a session for the configured provider, authenticate, subscribe, and return the session URI. */
export async function createRealSession(
	c: TestProtocolClient,
	config: IAgentHostE2EProviderConfig,
	clientId: string,
	trackingList: string[],
	workingDirectory: URI,
): Promise<string> {
	await c.call('initialize', { channel: ROOT_STATE_URI, protocolVersions: [PROTOCOL_VERSION], clientId }, 30_000);
	await c.call('authenticate', { channel: ROOT_STATE_URI, resource: 'https://api.github.com', token: config.githubToken ?? resolveGitHubToken() }, 30_000);

	const sessionUri = URI.from({ scheme: config.scheme, path: `/${generateUuid()}` }).toString();
	// Default to `folder` isolation so the agent runs in the directory the
	// test passed in. The default for Copilot is `worktree`, which would
	// silently relocate the agent into `<workingDirectory>.worktrees/...`
	// and break tests that assert on filesystem state in the original dir.
	await c.call('createSession', {
		channel: sessionUri,
		provider: config.provider,
		workingDirectory: workingDirectory.toString(),
		config: workingDirectory ? { isolation: 'folder' } : undefined,
	}, 30_000);

	// Sessions are created provisionally — `notify/sessionAdded` is deferred
	// until the agent materializes on first message dispatch. Subscribe
	// directly without waiting for the notification.
	trackingList.push(sessionUri);

	const subscribeResult = await c.call<SubscribeResult>('subscribe', { channel: sessionUri });
	void (subscribeResult.snapshot!.state as SessionState);
	// Conversation contents (turns, etc.) live on the session's default chat
	// channel in the multi-chat protocol; subscribe to it as well so `chat/*`
	// action notifications are delivered to this client.
	await c.call<SubscribeResult>('subscribe', { channel: buildDefaultChatUri(sessionUri) });
	c.clearReceived();
	c.clearAhpSnapshot();

	return sessionUri;
}

export async function runAhpSnapshotTest(
	c: TestProtocolClient,
	config: IAgentHostE2EProviderConfig,
	test: Mocha.Runnable,
	trackingList: string[],
	tempDirs: string[],
): Promise<void> {
	const scenario = AhpSnapshotScenario.load(test);
	const workingDirectory = mkdtempSync(join(tmpdir(), 'ahp-snapshot-'));
	tempDirs.push(workingDirectory);
	const sessionUri = await createRealSession(c, config, scenario.clientId, trackingList, URI.file(workingDirectory));
	await scenario.run(c, sessionUri);
}

/** Dispatch a turn with the given user message text. */
export function dispatchTurn(c: TestProtocolClient, session: string, turnId: string, text: string, clientSeq: number): void {
	c.dispatch({
		channel: buildDefaultChatUri(session),
		clientSeq,
		action: {
			type: ActionType.ChatTurnStarted,
			turnId,
			startedAt: '2025-01-01T00:00:00.000Z',
			message: { text, origin: { kind: MessageKind.User } },
		},
	});
}

/** Dispatch a turn with the given user message text and attachments. */
export function dispatchTurnWithAttachments(c: TestProtocolClient, session: string, turnId: string, text: string, attachments: readonly MessageAttachment[], clientSeq: number): void {
	c.dispatch({
		channel: buildDefaultChatUri(session),
		clientSeq,
		action: {
			type: ActionType.ChatTurnStarted,
			turnId,
			startedAt: '2025-01-01T00:00:00.000Z',
			message: { text, origin: { kind: MessageKind.User }, attachments: [...attachments] },
		},
	});
}

// #endregion

// #region Input answer helpers

export function getAcceptedAnswers(request: ChatInputRequest): Record<string, ChatInputAnswer> | undefined {
	if (!request.questions?.length) {
		return undefined;
	}

	return Object.fromEntries(request.questions.map(question => {
		switch (question.kind) {
			case ChatInputQuestionKind.Text:
				return [question.id, {
					state: ChatInputAnswerState.Submitted,
					value: { kind: ChatInputAnswerValueKind.Text, value: question.defaultValue ?? 'interactive' },
				} satisfies ChatInputAnswer];
			case ChatInputQuestionKind.Number:
			case ChatInputQuestionKind.Integer:
				return [question.id, {
					state: ChatInputAnswerState.Submitted,
					value: { kind: ChatInputAnswerValueKind.Number, value: question.defaultValue ?? question.min ?? 1 },
				} satisfies ChatInputAnswer];
			case ChatInputQuestionKind.Boolean:
				return [question.id, {
					state: ChatInputAnswerState.Submitted,
					value: { kind: ChatInputAnswerValueKind.Boolean, value: question.defaultValue ?? true },
				} satisfies ChatInputAnswer];
			case ChatInputQuestionKind.SingleSelect: {
				// For plan-mode reviews, prefer approving the plan WITHOUT
				// auto-executing it (`exit_only`) so the turn ends instead of
				// continuing to implement in-turn — which would surface
				// tool-call confirmations the planning test asserts against.
				// Fall back to an `interactive` option, then the recommended
				// option, then the first.
				const preferredOption = question.options.find(option => /exit_only/i.test(option.id))
					?? question.options.find(option => /interactive/i.test(option.id) || /interactive/i.test(option.label))
					?? question.options.find(option => option.recommended)
					?? question.options[0];
				return [question.id, {
					state: ChatInputAnswerState.Submitted,
					value: { kind: ChatInputAnswerValueKind.Selected, value: preferredOption.id },
				} satisfies ChatInputAnswer];
			}
			case ChatInputQuestionKind.MultiSelect: {
				const preferredOptions = question.options.filter(option => option.recommended);
				const selectedOptions = preferredOptions.length > 0 ? preferredOptions : question.options.slice(0, 1);
				return [question.id, {
					state: ChatInputAnswerState.Submitted,
					value: { kind: ChatInputAnswerValueKind.SelectedMany, value: selectedOptions.map(option => option.id) },
				} satisfies ChatInputAnswer];
			}
		}
	}));
}

// #endregion

// #region Response / turn drivers

export function getMarkdownResponseText(c: TestProtocolClient): string {
	const markdownPartIds = new Set<string>();
	const pieces: string[] = [];
	for (const notification of c.receivedNotifications(n =>
		isActionNotification(n, 'chat/responsePart') || isActionNotification(n, 'chat/delta')
	)) {
		const action = getActionEnvelope(notification).action;
		if (action.type === 'chat/responsePart' && action.part.kind === ResponsePartKind.Markdown) {
			markdownPartIds.add(action.part.id);
			pieces.push(action.part.content);
		} else if (action.type === 'chat/delta' && markdownPartIds.has(action.partId)) {
			pieces.push(action.content);
		}
	}
	return pieces.join('');
}

export interface IDrivenTurnResult {
	sawInputRequest: boolean;
	sawPendingConfirmation: boolean;
	responseText: string;
}

export async function driveTurnToCompletion(c: TestProtocolClient, session: string, turnId: string, text: string, clientSeq: number): Promise<IDrivenTurnResult> {
	return driveTurn(c, session, turnId, clientSeq, () => dispatchTurn(c, session, turnId, text, clientSeq));
}

export async function driveTurnWithAttachmentsToCompletion(c: TestProtocolClient, session: string, turnId: string, text: string, attachments: readonly MessageAttachment[], clientSeq: number): Promise<IDrivenTurnResult> {
	return driveTurn(c, session, turnId, clientSeq, () => dispatchTurnWithAttachments(c, session, turnId, text, attachments, clientSeq));
}

async function driveTurn(c: TestProtocolClient, session: string, turnId: string, clientSeq: number, dispatch: () => void): Promise<IDrivenTurnResult> {
	c.clearReceived();
	dispatch();

	const seenNotifications = new Set<object>();
	let nextClientSeq = clientSeq + 1;
	let sawInputRequest = false;
	let sawPendingConfirmation = false;

	while (true) {
		const notification = await c.waitForNotification(n => !seenNotifications.has(n as object) && (
			isActionNotification(n, 'chat/toolCallReady')
			|| isActionNotification(n, 'chat/inputRequested')
			|| isActionNotification(n, 'chat/turnComplete')
			|| isActionNotification(n, 'chat/error')
		), 90_000);
		seenNotifications.add(notification as object);

		if (isActionNotification(notification, 'chat/error')) {
			throw new Error(`Session error while driving ${turnId}`);
		}

		if (isActionNotification(notification, 'chat/toolCallReady')) {
			const action = getActionEnvelope(notification).action as ChatToolCallReadyAction;
			if (!action.confirmed) {
				sawPendingConfirmation = true;
				c.dispatch({
					channel: buildDefaultChatUri(session),
					clientSeq: nextClientSeq++,
					action: {
						type: ActionType.ChatToolCallConfirmed,
						turnId,
						toolCallId: action.toolCallId,
						approved: true,
						confirmed: ToolCallConfirmationReason.UserAction,
					},
				});
			}
			continue;
		}

		if (isActionNotification(notification, 'chat/inputRequested')) {
			sawInputRequest = true;
			const action = getActionEnvelope(notification).action as ChatInputRequestedAction;
			c.dispatch({
				channel: buildDefaultChatUri(session),
				clientSeq: nextClientSeq++,
				action: {
					type: ActionType.ChatInputCompleted,
					requestId: action.request.id,
					response: ChatInputResponseKind.Accept,
					answers: getAcceptedAnswers(action.request),
				},
			});
			continue;
		}


		const action = getActionEnvelope(notification).action as { turnId: string };
		assert.strictEqual(action.turnId, turnId);
		break;
	}

	return { sawInputRequest, sawPendingConfirmation, responseText: getMarkdownResponseText(c) };
}

// #endregion

// #region Approval-loop helpers

export function terminalResourceFromContent(content: readonly ToolResultContent[]): string | undefined {
	const terminalContent = content.find(c => c.type === ToolResultContentType.Terminal);
	return terminalContent?.resource;
}

/** Concatenates the text of any {@link ToolResultContentType.Text} parts in a tool result. */
export function textFromContent(content: readonly ToolResultContent[]): string {
	return content
		.filter((c): c is Extract<ToolResultContent, { type: ToolResultContentType.Text }> => c.type === ToolResultContentType.Text)
		.map(c => c.text)
		.join('');
}

export function terminalText(state: TerminalState): string {
	return removeAnsiEscapeCodes(state.content.map(part => part.type === 'command' ? `${part.commandLine}\n${part.output}` : part.value).join(''));
}

/** Looks up the toolName for a toolCallReady by joining against the matching toolCallStart. */
export function findToolNameForCall(c: TestProtocolClient, toolCallId: string): string | undefined {
	return c.receivedNotifications(n => isActionNotification(n, 'chat/toolCallStart'))
		.map(n => getActionEnvelope(n).action as ChatToolCallStartAction)
		.find(a => a.toolCallId === toolCallId)?.toolName;
}

export interface IApprovalRule {
	readonly toolName: string;
	readonly matchInput?: (toolInput: string | undefined) => boolean;
	readonly inspect?: (info: { action: ChatToolCallReadyAction; errors: string[] }) => void;
}

export interface IBackgroundApprovalLoopOptions {
	readonly approvalSeqStart: number;
	readonly allow: readonly IApprovalRule[];
}

export interface IBackgroundApprovalLoop {
	readonly errors: readonly string[];
	readonly approvedToolNames: ReadonlySet<string>;
	readonly observedToolNames: ReadonlySet<string>;
	stop(): Promise<void>;
}

/**
 * Auto-approves pending tool-call confirmations that match the supplied
 * allow-list. Anything outside the allow-list is denied and recorded as an
 * error so the test fails loudly instead of silently approving model-chosen
 * tool calls.
 */
export function startBackgroundApprovalLoop(c: TestProtocolClient, options: IBackgroundApprovalLoopOptions): IBackgroundApprovalLoop {
	const errors: string[] = [];
	const approvedToolNames = new Set<string>();
	const observedToolNames = new Set<string>();
	const processedSeqs = new Set<number>();
	let active = true;
	let approvalSeq = options.approvalSeqStart;

	const loop = (async () => {
		while (active) {
			try {
				const ready = await c.waitForNotification(n => {
					if (!isActionNotification(n, 'chat/toolCallReady')) {
						return false;
					}
					return !processedSeqs.has(getActionEnvelope(n).serverSeq);
				}, 2_000);
				const envelope = getActionEnvelope(ready);
				processedSeqs.add(envelope.serverSeq);
				const action = envelope.action as ChatToolCallReadyAction;
				if (action.confirmed) {
					continue;
				}

				const toolName = findToolNameForCall(c, action.toolCallId);
				if (toolName) {
					observedToolNames.add(toolName);
				}
				const matchingRule = options.allow.find(rule =>
					rule.toolName === toolName
					&& (rule.matchInput?.(action.toolInput) ?? true));

				if (!matchingRule) {
					errors.push(`unexpected tool call: toolName=${toolName ?? '<unknown>'} input=${JSON.stringify(action.toolInput)}`);
					c.dispatch({
						channel: envelope.channel,
						clientSeq: ++approvalSeq,
						action: {
							type: ActionType.ChatToolCallConfirmed,
							turnId: action.turnId,
							toolCallId: action.toolCallId, approved: false,
							reason: ToolCallCancellationReason.Denied,
						},
					});
					continue;
				}

				matchingRule.inspect?.({ action, errors });
				approvedToolNames.add(matchingRule.toolName);

				c.dispatch({
					channel: envelope.channel,
					clientSeq: ++approvalSeq,
					action: {
						type: ActionType.ChatToolCallConfirmed,
						turnId: action.turnId,
						toolCallId: action.toolCallId, approved: true,
						confirmed: ToolCallConfirmationReason.UserAction,
					},
				});
			} catch (e) {
				const msg = e instanceof Error ? e.message : String(e);
				// Expected: the 2-second poll's `Timeout waiting for notification`.
				// Anything else (e.g. 'Client closed', exception from
				// `matchingRule.inspect`) is a real failure — record it so the
				// test fails deterministically.
				if (!/timeout/i.test(msg)) {
					errors.push(`approval loop error: ${msg}`);
					active = false;
				}
			}
		}
	})();

	return {
		errors, approvedToolNames, observedToolNames,
		async stop(): Promise<void> {
			active = false;
			await loop;
		},
	};
}

// #endregion

// #region Server lease

/**
 * Manages the agent host server + connected client lifecycle for one e2e test,
 * hiding the difference between two strategies:
 *
 * - **Per-test** (always while recording): start a fresh server + proxy for
 *   each test and kill it in teardown. Full isolation; every test pays server
 *   fork + provider SDK client startup.
 * - **Shared** (the default in replay): start the server + proxy once, then swap
 *   the per-test fixture via {@link CapiReplayProxy.resetForReplay} and reconnect
 *   a fresh client each test. The agent host's cached SDK client / CLI subprocess
 *   is reused, so only the first test pays that startup. Safe as long as no test
 *   returns mid-turn (see the drain note on the permission test): one server
 *   serves every test, so a turn left in flight would leak its continuation into
 *   the next test's fixture window as a strict cache miss.
 *
 * Both strategies dispose each test's sessions (abort-first, then
 * `disposeSession`) and verify the replay traffic; the shared strategy verifies
 * without stopping the server so the next test can reuse it.
 */
export class AgentHostE2EServerLease {
	private _server: IServerHandle | undefined;
	private _client: TestProtocolClient | undefined;
	private readonly _shared: boolean;

	constructor(
		private readonly _config: IAgentHostE2EProviderConfig,
		private readonly _startOptions: { readonly claudeSdkRoot?: string; readonly codexSdkRoot?: string; readonly homeDir?: string; readonly userDataDir?: string },
	) {
		// Server reuse is a replay-only optimization: recording writes one fixture
		// per proxy and so needs a fresh proxy (hence a fresh server) per test.
		// In replay it is always safe because every test drains its turns, so the
		// reused server carries no in-flight work across tests.
		this._shared = !RECORD;
	}

	/** Acquire a server + connected client for a test, returning both. */
	async acquire(testTitle: string): Promise<{ server: IServerHandle; client: TestProtocolClient }> {
		const capiReplay = capiReplayFor(this._config.provider, testTitle);
		if (this._shared && this._server) {
			const proxy = this._server.capiReplay;
			if (!proxy) {
				throw new Error('[agent-host-e2e] shared replay server has no capiReplay proxy to reset');
			}
			proxy.resetForReplay(capiReplay.fixturePath);
		} else {
			this._server = await startRealServer({ ...this._startOptions, capiReplay });
		}
		this._client = new TestProtocolClient(this._server.port, () => this._server?.capiReplay?.takeCacheMissError());
		await this._client.connect();
		return { server: this._server, client: this._client };
	}

	/**
	 * Release a test: dispose its sessions, disconnect the client, and verify the
	 * replay traffic. A shared server is kept alive (with its cached SDK client)
	 * for the next test; a per-test server is stopped.
	 */
	async release(createdSessions: string[]): Promise<void> {
		const client = this._client;
		if (client) {
			for (const session of createdSessions) {
				try {
					// Abort first so the SDK query unwinds cleanly before we drop
					// the session — disposing a mid-turn session directly tends to
					// leave the agent host wedged. `session/abortTurn` is not part
					// of the StateAction union, so it bypasses the typed dispatch.
					client.notify('dispatchAction', {
						clientSeq: 9999,
						action: { type: 'session/abortTurn', session },
					});
					await client.call('disposeSession', { session }, 30_000);
				} catch { /* best-effort */ }
			}
			client.close();
		}
		createdSessions.length = 0;
		this._client = undefined;

		if (this._shared) {
			// Surface this test's strict cache-misses but keep the server (and its
			// cached SDK client) alive for the next test.
			this._server?.capiReplay?.assertNoCacheMisses();
		} else {
			// Flush the recording / surface strict replay cache-misses before the
			// process goes away. Kill even if the strict check throws.
			try {
				await this._server?.capiReplay?.stop();
			} finally {
				await stopServer(this._server);
				this._server = undefined;
			}
		}
	}

	/** Tear down a shared server at the end of the suite (no-op for per-test). */
	async dispose(): Promise<void> {
		if (this._server) {
			try {
				await this._server.capiReplay?.close();
			} finally {
				await stopServer(this._server);
				this._server = undefined;
			}
		}
	}
}

// #endregion

// #region Shared suite

/**
 * Registers the cross-provider agent host e2e suite. The body is identical for
 * every provider that speaks the agent host protocol — the only knobs are
 * tool names and URI scheme.
 */
export function defineAgentHostE2ETests(config: IAgentHostE2EProviderConfig): void {
	(config.enabled ? suite : suite.skip)(config.suiteTitle, function () {

		let client: TestProtocolClient;
		let lease: AgentHostE2EServerLease | undefined;
		let suiteDataDir: string | undefined;
		const createdSessions: string[] = [];
		const tempDirs: string[] = [];

		suiteSetup(async function () {
			this.timeout(60_000);
			suiteDataDir = mkdtempSync(join(tmpdir(), 'vscode-agent-host-e2e-'));
			lease = new AgentHostE2EServerLease(config, {
				claudeSdkRoot: config.claudeSdkRoot,
				codexSdkRoot: config.codexSdkRoot,
				homeDir: suiteDataDir,
				userDataDir: join(suiteDataDir, 'user-data'),
			});
		});

		suiteTeardown(async function () {
			// In replay the lease reuses one server across the suite (swapping the
			// replay fixture per test); tear it down here. While recording the
			// lease already stopped the per-test server in each teardown and this is
			// a no-op.
			this.timeout(90_000);
			try {
				await lease?.dispose();
			} finally {
				if (suiteDataDir) {
					tempDirs.push(suiteDataDir);
					suiteDataDir = undefined;
				}
				await removeTempDirs(tempDirs);
			}
		});

		setup(async function () {
			this.timeout(60_000);
			if (!lease) {
				throw new Error('Agent Host E2E server lease was not initialized.');
			}
			({ client } = await lease.acquire(this.currentTest?.title ?? 'unknown'));
		});

		teardown(async function () {
			// Generous timeout: a session left mid-turn (e.g. the permission
			// test for Claude, where the model hasn't yielded `turnComplete`)
			// has to abort an in-flight SDK query before disposeSession
			// resolves, which can take longer than the default 5s.
			this.timeout(90_000);
			if (!lease) {
				throw new Error('Agent Host E2E server lease was not initialized.');
			}
			await lease.release(createdSessions);
		});

		test('sends a simple message and receives a response', async function () {
			this.timeout(120_000);

			const workspaceDir = mkdtempSync(`${tmpdir()}/read-sdk-simple`);
			tempDirs.push(workspaceDir);

			const sessionUri = await createRealSession(client, config, `real-sdk-simple-${config.provider}`, createdSessions, URI.file(workspaceDir));
			dispatchTurn(client, sessionUri, 'turn-1', 'Say exactly "hello" and nothing else', 1);

			const complete = await client.waitForNotification(n => isActionNotification(n, 'chat/turnComplete'), 90_000);
			const completeAction = getActionEnvelope(complete).action as { turnId: string };
			assert.strictEqual(completeAction.turnId, 'turn-1');

			const responseParts = client.receivedNotifications(n => isActionNotification(n, 'chat/responsePart'));
			assert.ok(responseParts.length > 0, 'should have received at least one response part');
		});

		test('listModels returns well-shaped model entries after authenticate', async function () {
			this.timeout(60_000);

			await client.call('initialize', { channel: ROOT_STATE_URI, protocolVersions: [PROTOCOL_VERSION], clientId: `real-sdk-list-models-${config.provider}` }, 30_000);

			// Subscribe to root state *before* authenticating so we can observe
			// the agentsChanged action that carries the populated model list.
			const rootResult = await client.call<SubscribeResult>('subscribe', { channel: ROOT_STATE_URI }, 30_000);
			const initial = rootResult.snapshot!.state as RootState;
			const providerAgent = initial.agents.find(a => a.provider === config.provider);
			assert.ok(providerAgent, `Expected ${config.provider} agent in root state, got: ${initial.agents.map(a => a.provider).join(', ')}`);

			await client.call('authenticate', { channel: ROOT_STATE_URI, resource: 'https://api.github.com', token: resolveGitHubToken() }, 30_000);

			// Models load asynchronously after the *first* authenticate against
			// the shared server. If a sibling test already authenticated, the
			// list is in the subscribe snapshot already; otherwise wait for the
			// `agentsChanged` action that populates them.
			let agent = providerAgent;
			if (agent.models.length === 0) {
				try {
					const notif = await client.waitForNotification(n => {
						if (!isActionNotification(n, 'root/agentsChanged')) {
							return false;
						}
						const action = getActionEnvelope(n).action as RootAgentsChangedAction;
						const a = action.agents.find(a => a.provider === config.provider);
						return !!a && a.models.length > 0;
					}, 30_000);
					const action = getActionEnvelope(notif).action as RootAgentsChangedAction;
					agent = action.agents.find(a => a.provider === config.provider)!;
				} catch (err) {
					// Surface every agentsChanged we did see so failures point
					// at the actual data instead of a bare timeout.
					const seen = client.receivedNotifications(n => isActionNotification(n, 'root/agentsChanged'))
						.map(n => {
							const a = getActionEnvelope(n).action as RootAgentsChangedAction;
							const entry = a.agents.find(x => x.provider === config.provider);
							return entry ? { modelCount: entry.models.length, modelIds: entry.models.map(m => m.id) } : { missing: true };
						});
					throw new Error(`${config.provider}: timed out waiting for agentsChanged with non-empty models. Observed agentsChanged: ${JSON.stringify(seen)}. Original error: ${err instanceof Error ? err.message : String(err)}`);
				}
			}

			assert.ok(agent.models.length > 0, 'Expected at least one model from listModels');

			for (const model of agent.models) {
				assert.strictEqual(typeof model.id, 'string', `model.id should be a string: ${JSON.stringify(model)}`);
				assert.ok(model.id.length > 0, `model.id should be non-empty: ${JSON.stringify(model)}`);
				assert.strictEqual(typeof model.name, 'string', `model.name should be a string: ${JSON.stringify(model)}`);
				assert.strictEqual(model.provider, config.provider, `model.provider should be ${config.provider}: ${JSON.stringify(model)}`);
				assert.ok(model.maxContextWindow === undefined || (typeof model.maxContextWindow === 'number' && model.maxContextWindow >= 0),
					`model.maxContextWindow should be undefined or a non-negative number: ${JSON.stringify(model)}`);
				assert.ok(model.supportsVision === undefined || typeof model.supportsVision === 'boolean',
					`model.supportsVision should be boolean or undefined: ${JSON.stringify(model)}`);
			}
		});

		test('tool call triggers permission request and can be approved', async function () {
			this.timeout(120_000);

			const tempDir = mkdtempSync(`${tmpdir()}/ahp-perm-test-`);
			tempDirs.push(tempDir);
			const sessionUri = await createRealSession(client, config, `real-sdk-permission-${config.provider}`, createdSessions, URI.file(tempDir));
			dispatchTurn(client, sessionUri, 'turn-perm', 'Run the shell command: echo "hello from test"', 1);

			// Validate the permission flow by driving toward the first signal
			// that the tool call actually ran:
			//   - Copilot routes shell calls through `canUseTool`, emitting
			//     `toolCallReady` with `confirmed=undefined`. The test
			//     dispatches `toolCallConfirmed` and expects `toolCallComplete`.
			//   - Claude's `default` permission mode auto-approves safe Bash
			//     commands at the SDK layer and never reaches the host's
			//     `canUseTool`, so the next observable signal is
			//     `toolCallComplete` directly.
			// Either way, `toolCallComplete` is the success indicator. We do
			// not wait for `turnComplete` because Claude's post-tool
			// continuation can outlive any reasonable test timeout for trivial
			// prompts like this one.
			let nextSeq = 2;
			while (true) {
				const next = await client.waitForNotification(n =>
					(isActionNotification(n, 'chat/toolCallReady')
						&& (getActionEnvelope(n).action as { confirmed?: string }).confirmed === undefined)
					|| isActionNotification(n, 'chat/toolCallComplete')
					|| isActionNotification(n, 'chat/error'),
					90_000);
				if (isActionNotification(next, 'chat/error')) {
					throw new Error('Session error during permission test');
				}
				if (isActionNotification(next, 'chat/toolCallComplete')) {
					break;
				}
				const action = getActionEnvelope(next).action as { toolCallId: string };
				client.dispatch({
					channel: buildDefaultChatUri(sessionUri),
					clientSeq: nextSeq++,
					action: {
						type: ActionType.ChatToolCallConfirmed,
						turnId: 'turn-perm',
						toolCallId: action.toolCallId, approved: true,
						confirmed: ToolCallConfirmationReason.UserAction,
					},
				});
			}

			const toolStarts = client.receivedNotifications(n => isActionNotification(n, 'chat/toolCallStart'));
			assert.ok(toolStarts.length > 0, 'expected at least one shell tool call');

			// Drain the post-tool continuation to `turnComplete` so the turn ends
			// within this test's window. This is required for the shared replay
			// server (all providers now reuse one server across the suite):
			// returning mid-turn leaves the SDK query in flight, and its
			// continuation HTTP call fires *after* the fixture is swapped for the
			// next test — landing in that test's fixture window as an unrecorded
			// call and failing the strict cache-miss check. Draining keeps every
			// request/response inside the test that owns it. Replay serves the
			// continuation from the fixture instantly; while recording it also
			// lands that model call in the fixture. Bounded + best-effort: some
			// providers' continuations for a trivial prompt can run long while
			// recording.
			try {
				await client.waitForNotification(n =>
					isActionNotification(n, 'chat/turnComplete') || isActionNotification(n, 'chat/error'),
					30_000);
			} catch { /* bounded drain */ }
		});

		(config.supportsPlanMode ? test : test.skip)('planning-mode session-state writes are auto-approved in default mode', async function () {
			this.timeout(180_000);

			const tempDir = mkdtempSync(`${tmpdir()}/ahp-plan-test-`);
			tempDirs.push(tempDir);
			const sessionUri = await createRealSession(client, config, `real-sdk-plan-mode-${config.provider}`, createdSessions, URI.file(tempDir));

			client.dispatch({
				channel: sessionUri,
				clientSeq: 1,
				action: { type: ActionType.SessionConfigChanged, config: { mode: 'plan' } },
			});
			await client.waitForNotification(n => isActionNotification(n, 'session/configChanged'));

			const planTurn = await driveTurnToCompletion(client, sessionUri, 'turn-plan',
				`Help me implement a Python script that prints "hello world" to stdout. Write the shortest possible plan to your session plan.md and use the \`${config.exitPlanModeToolName}\` tool to ask me to approve it before writing any code.`, 2);
			assert.strictEqual(planTurn.sawPendingConfirmation, false, 'should not have received pending-confirmation toolCallReady while writing session-state plan.md');
			assert.ok(planTurn.sawInputRequest, `should reach the ${config.exitPlanModeToolName} question so the test can continue the same session`);

			const extraSessionNotificationsAfterPlan = client.receivedNotifications(n =>
				n.method === NotificationType.SessionAdded &&
				(n.params as SessionAddedParams).summary.resource !== sessionUri,
			);
			assert.strictEqual(extraSessionNotificationsAfterPlan.length, 0, 'should not create a second session while answering the plan-mode question');

			client.dispatch({
				channel: sessionUri,
				clientSeq: 50,
				action: { type: ActionType.SessionConfigChanged, config: { mode: 'interactive' } },
			});
			await client.waitForNotification(n => isActionNotification(n, 'session/configChanged'));

			const followupTurn = await driveTurnToCompletion(client, sessionUri, 'turn-followup',
				'What did the plan I just approved say to print? Reply with exactly "hello world".', 100);
			assert.strictEqual(followupTurn.sawPendingConfirmation, false, 'follow-up turn should not surface new pending confirmations');
			assert.match(followupTurn.responseText, /hello world/i, 'follow-up turn should retain the original plan context');

			const extraSessionNotificationsAfterFollowup = client.receivedNotifications(n =>
				n.method === NotificationType.SessionAdded &&
				(n.params as SessionAddedParams).summary.resource !== sessionUri,
			);
			assert.strictEqual(extraSessionNotificationsAfterFollowup.length, 0, 'sending another message should stay on the same session instead of forking');

			const resubscribeResult = await client.call<SubscribeResult>('subscribe', { channel: sessionUri });
			assert.strictEqual(resubscribeResult.snapshot!.resource, sessionUri, 'follow-up turn should keep the original session resource');
		});

		// Aborting a turn is inherently a real-streaming test: on replay the
		// recorded (intentionally truncated) response is served instantly, so
		// there is no mid-stream window to abort. Run it only while recording
		// against real CAPI; it is skipped in deterministic replay.
		(RUN_RECORD_ONLY_TESTS ? test : test.skip)('can abort a running turn', async function () {
			this.timeout(120_000);

			const tempDir = mkdtempSync(`${tmpdir()}/ahp-abort-`);
			tempDirs.push(tempDir);

			const sessionUri = await createRealSession(client, config, `real-sdk-abort-${config.provider}`, createdSessions, URI.file(tempDir));
			dispatchTurn(client, sessionUri, 'turn-abort', 'Write a very long essay about the history of computing', 1);

			await client.waitForNotification(
				n => isActionNotification(n, 'chat/responsePart') || isActionNotification(n, 'chat/toolCallStart'),
				60_000,
			);

			// `session/abortTurn` is not part of the StateAction union, so it
			// bypasses the typed `dispatch` helper and is sent raw.
			client.notify('dispatchAction', {
				channel: sessionUri,
				clientSeq: 2,
				action: { type: 'session/abortTurn' },
			});

			await client.waitForNotification(n => isActionNotification(n, 'session/abortTurn'), 10_000);
		});

		test('session is created with the correct working directory', async function () {
			this.timeout(120_000);

			const tempDir = mkdtempSync(`${tmpdir()}/ahp-test-`);
			tempDirs.push(tempDir);
			const workingDirUri = URI.file(tempDir).toString();

			await client.call('initialize', { channel: ROOT_STATE_URI, protocolVersions: [PROTOCOL_VERSION], clientId: `real-sdk-workdir-${config.provider}` }, 30_000);
			await client.call('authenticate', { channel: ROOT_STATE_URI, resource: 'https://api.github.com', token: resolveGitHubToken() }, 30_000);

			const sessionUri = URI.from({ scheme: config.scheme, path: `/${generateUuid()}` }).toString();
			await client.call('createSession', { channel: sessionUri, provider: config.provider, workingDirectory: workingDirUri }, 30_000);
			createdSessions.push(sessionUri);

			const subscribeResult = await client.call<SubscribeResult>('subscribe', { channel: sessionUri }, 30_000);
			const sessionState = subscribeResult.snapshot!.state as SessionState;
			assert.strictEqual(sessionState.workingDirectory, workingDirUri,
				`subscribe snapshot summary should carry the requested working directory`);
		});

		// Worktree isolation asserts on resolved `.worktrees/...` paths and a
		// host-terminal `pwd`, which are POSIX-shaped (the fixtures were recorded on
		// macOS); skip on Windows where the worktree paths and shell differ.
		(config.supportsWorktreeIsolation && !isWindows ? test : test.skip)('worktree session uses the resolved worktree as working directory', async function () {
			this.timeout(120_000);

			const tempDir = mkdtempSync(`${tmpdir()}/ahp-wt-test-`);
			tempDirs.push(tempDir, `${tempDir}.worktrees`);
			execSync('git init', { cwd: tempDir });
			execSync('git config user.name "Agent Host Test"', { cwd: tempDir });
			execSync('git config user.email "agent-host-test@example.com"', { cwd: tempDir });
			execSync('git commit --allow-empty -m "init"', { cwd: tempDir });
			const defaultBranch = execSync('git branch --show-current', { cwd: tempDir, encoding: 'utf-8' }).trim();
			const workingDirUri = URI.file(tempDir).toString();

			await client.call('initialize', { channel: ROOT_STATE_URI, protocolVersions: [PROTOCOL_VERSION], clientId: `real-sdk-worktree-${config.provider}` });
			await client.call('authenticate', { channel: ROOT_STATE_URI, resource: 'https://api.github.com', token: resolveGitHubToken() });

			// The host's custom terminal tool is opt-in (default off) and only
			// Copilot routes shell commands through it. When the provider
			// supports it, this test additionally asserts on the host-managed
			// terminal's cwd / `pwd` output, so enable it before the session
			// materializes on the first turn dispatch. Codex / Claude run shell
			// commands inside their own SDK subprocess and never surface a host
			// terminal resource, so they verify isolation via the resolved
			// working directory alone.
			if (config.supportsHostTerminalTool) {
				client.dispatch({
					channel: ROOT_STATE_URI,
					clientSeq: 0,
					action: { type: ActionType.RootConfigChanged, config: { [CopilotCliConfigKey.EnableCustomTerminalTool]: true } },
				});
			}

			const sessionUri = URI.from({ scheme: config.scheme, path: `/${generateUuid()}` }).toString();
			await client.call('createSession', {
				channel: sessionUri, provider: config.provider, workingDirectory: workingDirUri,
				config: { isolation: 'worktree', branch: defaultBranch },
			});
			createdSessions.push(sessionUri);

			await client.call<SubscribeResult>('subscribe', { channel: sessionUri });
			// Conversation contents (turns, tool calls, …) live on the
			// session's default chat channel in the multi-chat protocol;
			// subscribe to it so `chat/*` action notifications are delivered.
			await client.call<SubscribeResult>('subscribe', { channel: buildDefaultChatUri(sessionUri) });

			client.dispatch({
				channel: sessionUri,
				clientSeq: 1,
				action: {
					type: ActionType.SessionActiveClientSet,
					activeClient: {
						clientId: `real-sdk-worktree-${config.provider}`,
						displayName: 'Test Client',
						tools: [{
							name: 'test_echo',
							description: 'A harmless echo tool for testing',
							inputSchema: { type: 'object', properties: { message: { type: 'string' } } },
						}],
					},
				},
			});

			client.clearReceived();
			dispatchTurn(client, sessionUri, 'turn-wt',
				'What is your current working directory? Reply with just the absolute path and nothing else.', 2);

			const addedNotif = await client.waitForNotification(n =>
				n.method === NotificationType.SessionAdded,
				60_000,
			);
			const addedSummary = (addedNotif.params as SessionAddedParams).summary;

			assert.ok(addedSummary.workingDirectory, 'sessionAdded notification should have a workingDirectory');
			assert.ok(addedSummary.workingDirectory!.includes('.worktrees'),
				`workingDirectory should be under the .worktrees folder, got: ${addedSummary.workingDirectory}`);
			const resolvedWorkingDirectoryPath = URI.parse(addedSummary.workingDirectory!).fsPath;

			await client.waitForNotification(
				n => isActionNotification(n, 'chat/turnComplete') || isActionNotification(n, 'chat/error'),
				90_000,
			);

			const errors = client.receivedNotifications(n => isActionNotification(n, 'chat/error'));
			assert.strictEqual(errors.length, 0,
				errors.length > 0
					? `Session error during turn (worktree path lost on resume): ${(getActionEnvelope(errors[0]).action as { error?: { message?: string } }).error?.message}`
					: '');

			const responseParts = client.receivedNotifications(n => isActionNotification(n, 'chat/responsePart'));
			assert.ok(responseParts.length > 0, 'should have received at least one response part after session refresh');

			// Verify the agent's shell subprocess actually runs in the resolved
			// worktree by asking it to run `pwd`. Copilot routes shell commands
			// through the host-managed terminal tool, which exposes a
			// subscribable terminal resource we can assert `cwd` / output on.
			// Codex / Claude run shell commands inside their own SDK subprocess
			// and surface the output as plain text in the tool result instead,
			// so we assert the worktree path appears in that text.
			if (!config.supportsHostTerminalTool) {
				// The shell command may either require a host confirmation
				// (`toolCallReady` with `confirmed=undefined`) or be
				// auto-approved at the SDK layer (Claude's default permission
				// mode). A background approval loop handles the former without
				// blocking on it, so the wait below only has to observe the
				// tool's text output — which carries the `pwd` result.
				const approvalLoop = startBackgroundApprovalLoop(client, {
					approvalSeqStart: 100,
					allow: [{ toolName: config.shellToolName }],
				});
				try {
					client.clearReceived();
					dispatchTurn(client, addedSummary.resource, 'turn-wt-terminal', 'Run the shell command `pwd` in the session current working directory. Do not specify a working-directory override.', 3);

					// The `pwd` output can arrive as streaming partial content
					// (`toolCallContentChanged`) or in the final tool result
					// (`toolCallComplete`), depending on the provider. Accept
					// either as long as the text carries the worktree path.
					const pwdNotif = await client.waitForNotification(n => {
						if (isActionNotification(n, 'chat/toolCallContentChanged')) {
							const action = getActionEnvelope(n).action as { content: readonly ToolResultContent[] };
							return textFromContent(action.content).includes(resolvedWorkingDirectoryPath);
						}
						if (isActionNotification(n, 'chat/toolCallComplete')) {
							const action = getActionEnvelope(n).action as { result: { content?: readonly ToolResultContent[] } };
							return textFromContent(action.result.content ?? []).includes(resolvedWorkingDirectoryPath);
						}
						return false;
					}, 90_000);
					const pwdText = isActionNotification(pwdNotif, 'chat/toolCallComplete')
						? textFromContent((getActionEnvelope(pwdNotif).action as { result: { content?: readonly ToolResultContent[] } }).result.content ?? [])
						: textFromContent((getActionEnvelope(pwdNotif).action as { content: readonly ToolResultContent[] }).content);
					assert.ok(pwdText.includes(resolvedWorkingDirectoryPath),
						`pwd output should include the resolved worktree path ${resolvedWorkingDirectoryPath}`);
				} finally {
					await approvalLoop.stop();
				}
				assert.deepStrictEqual(approvalLoop.errors, [], 'no unexpected tool calls should have been denied');
				await client.waitForNotification(n => isActionNotification(n, 'chat/turnComplete'), 90_000);
				return;
			}

			client.clearReceived();
			dispatchTurn(client, addedSummary.resource, 'turn-wt-terminal', 'Run the shell command: pwd', 3);

			const toolStartNotif = await client.waitForNotification(n => isActionNotification(n, 'chat/toolCallStart'), 60_000);
			const toolStartAction = getActionEnvelope(toolStartNotif).action as { toolCallId: string };

			const toolReadyNotif = await client.waitForNotification(n => isActionNotification(n, 'chat/toolCallReady'), 30_000);
			const toolReadyAction = getActionEnvelope(toolReadyNotif).action as { confirmed?: string };
			if (!toolReadyAction.confirmed) {
				client.dispatch({
					channel: buildDefaultChatUri(addedSummary.resource),
					clientSeq: 4,
					action: {
						type: ActionType.ChatToolCallConfirmed,
						turnId: 'turn-wt-terminal',
						toolCallId: toolStartAction.toolCallId, approved: true,
						confirmed: ToolCallConfirmationReason.UserAction,
					},
				});
			}

			const terminalContentNotif = await client.waitForNotification(n => {
				if (!isActionNotification(n, 'chat/toolCallContentChanged')) {
					return false;
				}
				const action = getActionEnvelope(n).action as { toolCallId: string; content: readonly ToolResultContent[] };
				return action.toolCallId === toolStartAction.toolCallId && terminalResourceFromContent(action.content) !== undefined;
			}, 30_000);
			const terminalContentAction = getActionEnvelope(terminalContentNotif).action as { content: readonly ToolResultContent[] };
			const terminalUri = terminalResourceFromContent(terminalContentAction.content);
			assert.ok(terminalUri, 'shell tool should expose its terminal resource');

			const terminalSubscribeResult = await client.call<SubscribeResult>('subscribe', { channel: terminalUri });
			const initialTerminalState = terminalSubscribeResult.snapshot!.state as TerminalState;
			assert.strictEqual(initialTerminalState.cwd, resolvedWorkingDirectoryPath, 'terminal should be created in the resolved worktree directory');

			await client.waitForNotification(n => isActionNotification(n, 'chat/turnComplete'), 90_000);
			const terminalSnapshot = await client.call<SubscribeResult>('subscribe', { channel: terminalUri });
			const terminalState = terminalSnapshot.snapshot!.state as TerminalState;
			assert.ok(terminalText(terminalState).includes(resolvedWorkingDirectoryPath),
				`pwd output should include the resolved worktree path ${resolvedWorkingDirectoryPath}`);
		});

		(config.supportsSubagents ? test : test.skip)('subagent tool calls are routed to the subagent session, not flat in the parent', async function () {
			this.timeout(180_000);

			const tempDir = mkdtempSync(`${tmpdir()}/ahp-subagent-test-`);
			tempDirs.push(tempDir);
			writeFileSync(`${tempDir}/file-a.txt`, 'alpha');
			writeFileSync(`${tempDir}/file-b.txt`, 'beta');

			const sessionUri = await createRealSession(client, config, `real-sdk-subagent-${config.provider}`, createdSessions, URI.file(tempDir));
			const sessionChatUri = buildDefaultChatUri(sessionUri);

			let approvalsActive = true;
			let approvalSeq = 1000;
			const processedSeqs = new Set<number>();
			const approvalLoop = (async () => {
				while (approvalsActive) {
					try {
						const ready = await client.waitForNotification(n => {
							if (!isActionNotification(n, 'chat/toolCallReady')) {
								return false;
							}
							const envelope = getActionEnvelope(n);
							const a = envelope.action as { confirmed?: string };
							return !a.confirmed && !processedSeqs.has(envelope.serverSeq);
						}, 2_000);
						const envelope = getActionEnvelope(ready);
						if (!processedSeqs.has(envelope.serverSeq)) {
							processedSeqs.add(envelope.serverSeq);
							const action = envelope.action as { turnId: string; toolCallId: string; confirmed?: string };
							if (!action.confirmed) {
								client.dispatch({
									channel: envelope.channel,
									clientSeq: ++approvalSeq,
									action: {
										type: ActionType.ChatToolCallConfirmed,
										turnId: action.turnId,
										toolCallId: action.toolCallId, approved: true,
										confirmed: ToolCallConfirmationReason.UserAction,
									},
								});
							}
						}
					} catch { /* timeout — re-poll */ }
				}
			})();

			dispatchTurn(client, sessionUri, 'turn-sa',
				`Use the \`${config.subagentToolNames[0]}\` tool to spawn a subagent to list the files in the current working directory. ` +
				'The subagent should call a single read-only tool (e.g. `view` or shell with `ls`) to enumerate the directory. ' +
				'Do not enumerate the directory yourself — delegate to the subagent.',
				1);

			const subagentContentNotif = await client.waitForNotification(n => {
				if (!isActionNotification(n, 'chat/toolCallContentChanged')) {
					return false;
				}
				const envelope = getActionEnvelope(n);
				const action = envelope.action as { content: readonly ToolResultContent[] };
				return envelope.channel === sessionChatUri && action.content.some(c => c.type === ToolResultContentType.Subagent);
			}, 120_000);

			const parentContent = (getActionEnvelope(subagentContentNotif).action as { content: readonly ToolResultContent[] }).content;
			const subagentRef = parentContent.find((c): c is ToolResultSubagentContent => c.type === ToolResultContentType.Subagent)!;
			const subagentChatUri = subagentRef.resource as unknown as string;
			const parsedSubagentChat = parseChatUri(subagentChatUri);
			assert.ok(
				parsedSubagentChat?.session === sessionUri && parsedSubagentChat.chatId.startsWith('subagent/'),
				`subagent resource should be a subagent chat of the parent session, got: ${JSON.stringify(subagentChatUri)}`,
			);

			// The subagent's conversation contents (its inner tool calls) are
			// emitted on the chat channel carried by the tool result.
			await client.call<SubscribeResult>('subscribe', { channel: subagentChatUri });

			await client.waitForNotification(n => {
				if (!isActionNotification(n, 'chat/turnComplete')) {
					return false;
				}
				return getActionEnvelope(n).channel === sessionChatUri;
			}, 150_000);

			approvalsActive = false;
			await approvalLoop;

			const toolStarts = client.receivedNotifications(n => isActionNotification(n, 'chat/toolCallStart'))
				.map(n => ({ channel: getActionEnvelope(n).channel, action: getActionEnvelope(n).action as ChatToolCallStartAction }));

			const parentStarts = toolStarts.filter(t => t.channel === sessionChatUri).map(t => t.action);
			const subagentStarts = toolStarts.filter(t => t.channel === subagentChatUri).map(t => t.action);

			const subagentToolNames = new Set<string>(config.subagentToolNames);
			const parentNonTaskStarts = parentStarts.filter(a => !subagentToolNames.has(a.toolName));
			assert.deepStrictEqual(parentNonTaskStarts.map(a => a.toolName), [],
				`parent session should not contain inner tool calls; found: ${JSON.stringify(parentNonTaskStarts.map(a => a.toolName))}`);

			assert.ok(subagentStarts.length >= 1,
				`subagent session should contain at least one inner tool call, got ${subagentStarts.length}. ` +
				`Parent tool calls: ${JSON.stringify(parentStarts.map(a => a.toolName))}`);
		});

		// Windows-skipped for providers with on-disk subagent replay (see `subagentReplayUnstableOnWindows`).
		((isWindows && config.subagentReplayUnstableOnWindows) ? test.skip : (config.supportsSubagents ? test : test.skip))('reopening a session keeps sub-agent messages out of the parent transcript (replay path)', async function () {
			this.timeout(180_000);

			const tempDir = mkdtempSync(`${tmpdir()}/ahp-subagent-replay-`);
			tempDirs.push(tempDir);
			writeFileSync(`${tempDir}/file-a.txt`, 'alpha');
			writeFileSync(`${tempDir}/file-b.txt`, 'beta');

			const sessionUri = await createRealSession(client, config, `real-sdk-subagent-replay-${config.provider}`, createdSessions, URI.file(tempDir));
			const sessionChatUri = buildDefaultChatUri(sessionUri);

			// A unique phrase that only the subagent is asked to emit in an
			// intermediate assistant message, so replay can detect whether
			// subagent assistant text leaks upward without depending on the
			// parent agent's final summary behavior. It is a fixed string (not a
			// per-run uuid) so the recorded subagent reply still contains the
			// phrase the freshly-issued prompt asks for on replay.
			const sentinel = 'subagent replay note sentinel-7f3a';

			let approvalsActive = true;
			let approvalSeq = 2000;
			const processedSeqs = new Set<number>();
			const approvalLoop = (async () => {
				while (approvalsActive) {
					try {
						const ready = await client.waitForNotification(n => {
							if (!isActionNotification(n, 'chat/toolCallReady')) {
								return false;
							}
							const envelope = getActionEnvelope(n);
							const a = envelope.action as { confirmed?: string };
							return !a.confirmed && !processedSeqs.has(envelope.serverSeq);
						}, 2_000);
						const envelope = getActionEnvelope(ready);
						if (!processedSeqs.has(envelope.serverSeq)) {
							processedSeqs.add(envelope.serverSeq);
							const action = envelope.action as { turnId: string; toolCallId: string; confirmed?: string };
							if (!action.confirmed) {
								client.dispatch({
									channel: envelope.channel,
									clientSeq: ++approvalSeq,
									action: {
										type: ActionType.ChatToolCallConfirmed,
										turnId: action.turnId,
										toolCallId: action.toolCallId, approved: true,
										confirmed: ToolCallConfirmationReason.UserAction,
									},
								});
							}
						}
					} catch { /* timeout — re-poll */ }
				}
			})();

			dispatchTurn(client, sessionUri, 'turn-sa-replay',
				`Use the \`${config.subagentToolNames[0]}\` tool to spawn a subagent to list the files in the current working directory. ` +
				`Instruct the subagent to begin its response with this sentence on its own line: ${sentinel}. ` +
				'Then the subagent should list the files. ' +
				'After the subagent completes, you, the main agent, must reply exactly "SUBAGENT_DONE" and must not repeat that sentence.',
				1);

			const subagentContentNotif = await client.waitForNotification(n => {
				if (!isActionNotification(n, 'chat/toolCallContentChanged')) {
					return false;
				}
				const envelope = getActionEnvelope(n);
				const action = envelope.action as { content: readonly ToolResultContent[] };
				return envelope.channel === sessionChatUri && action.content.some(c => c.type === ToolResultContentType.Subagent);
			}, 120_000);

			const parentContent = (getActionEnvelope(subagentContentNotif).action as { content: readonly ToolResultContent[] }).content;
			const subagentRef = parentContent.find((c): c is ToolResultSubagentContent => c.type === ToolResultContentType.Subagent)!;
			const subagentChatUri = subagentRef.resource as unknown as string;
			const parsedSubagentChat = parseChatUri(subagentChatUri);
			assert.ok(
				parsedSubagentChat?.session === sessionUri && parsedSubagentChat.chatId.startsWith('subagent/'),
				`subagent resource should be a subagent chat of the parent session, got: ${JSON.stringify(subagentChatUri)}`,
			);
			const subagentToolCallId = parsedSubagentChat.chatId.slice('subagent/'.length);
			const replaySubagentSessionUri = buildSubagentSessionUri(sessionUri, subagentToolCallId);

			await client.call<SubscribeResult>('subscribe', { channel: subagentChatUri });

			await client.waitForNotification(n =>
				isActionNotification(n, 'chat/turnComplete') && getActionEnvelope(n).channel === sessionChatUri, 150_000);

			approvalsActive = false;
			await approvalLoop;

			// Force a reopen: drop the subagent chat and parent-session
			// subscriptions so the agent host evicts the cached, live-built state,
			// then re-fetch — which rebuilds the turns from the persisted SDK event
			// log through `mapSessionEvents` (the path the regression lived in).
			// The parent-session unsubscribe is sent last so it triggers eviction.
			for (const channel of [subagentChatUri, buildDefaultChatUri(sessionUri), sessionUri]) {
				client.notify('unsubscribe', { channel });
			}

			const reopenedParent = await fetchSessionWithChat(client, sessionUri);
			// Persisted SDK replay still restores subagents through their derived
			// session resource, while the live path exposes the dedicated chat
			// resource above.
			const reopenedSubagent = await fetchSessionWithChat(client, replaySubagentSessionUri);

			const assistantText = (turns: ISessionWithDefaultChat['turns']): string =>
				turns.map(t => t.responseParts.map(p => p.kind === ResponsePartKind.Markdown ? p.content : '').join('')).join('\n');

			const subagentText = assistantText(reopenedSubagent.turns);
			const parentText = assistantText(reopenedParent.turns);

			// Precondition: the sub-agent emitted the phrase and it is routed to the
			// sub-agent transcript on the replay path.
			assert.ok(subagentText.includes(sentinel),
				`sub-agent transcript should contain the phrase after reopen; got: ${JSON.stringify(subagentText).slice(0, 500)}`);

			// The regression: the sub-agent's assistant.message must NOT leak into
			// the parent transcript when the session is reopened.
			assert.ok(!parentText.includes(sentinel),
				`parent transcript must NOT contain the sub-agent's phrase after reopen ` +
				`(replay path leaked sub-agent assistant.message into parent turns); ` +
				`parent text: ${JSON.stringify(parentText).slice(0, 800)}`);
		});
	});
}

// #endregion
