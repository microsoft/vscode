/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Shared drivers and lifecycle helpers for bundled-provider Agent Host E2E tests.
 */

import assert from 'assert';
import { execSync } from 'child_process';
import { mkdtempSync, rmSync } from 'fs';
import { homedir, tmpdir, userInfo } from 'os';
import { fileURLToPath } from 'url';
import { raceTimeout, timeout } from '../../../../../../base/common/async.js';
import { join } from '../../../../../../base/common/path.js';
import { removeAnsiEscapeCodes } from '../../../../../../base/common/strings.js';
import { URI } from '../../../../../../base/common/uri.js';
import {
	ResponsePartKind, ChatInputAnswerState, ChatInputAnswerValueKind, ChatInputQuestionKind,
	ChatInputResponseKind, ToolResultContentType, ToolCallConfirmationReason, ToolCallCancellationReason, buildDefaultChatUri,
	type MessageAttachment, type ChatInputAnswer, type ChatInputRequest, type TerminalState,
	type ToolResultContent,
} from '../../../../common/state/sessionState.js';
import {
	ActionType,
	type ChatInputRequestedAction, type ChatToolCallReadyAction,
	type ChatToolCallStartAction,
} from '../../../../common/state/sessionActions.js';
import { CopilotCliConfigKey } from '../../../../common/copilotCliConfig.js';
import { CapiReplayMode } from './capiReplayProxy.js';
import {
	getActionEnvelope, isActionNotification, IServerHandle, startRealServer, TestProtocolClient,
} from '../../serverIntegrationTestHelpers.js';
import { createProviderSession, dispatchTurn, dispatchTurnWithAttachments } from '../../providerIntegrationTestHelpers.js';
import { AgentHostUpdateSnapshotsEnvVar, AhpSnapshotScenario } from './ahpSnapshot.js';

// #region Record/replay

/**
 * `AGENT_HOST_REPLAY_RECORD=1` records only LLM fixtures, while
 * `AGENT_HOST_UPDATE_SNAPSHOTS=1` records LLM fixtures and updates AHP
 * snapshots in the same run.
 */
const UPDATE_SNAPSHOTS = process.env[AgentHostUpdateSnapshotsEnvVar] === '1';
const RECORD = process.env['AGENT_HOST_REPLAY_RECORD'] === '1' || UPDATE_SNAPSHOTS;
const REPLAY_MODE: CapiReplayMode = RECORD ? 'record' : 'replay';
const SERVER_SHUTDOWN_TIMEOUT_MS = 30_000;

/**
 * Upper bound on tests served by a single shared replay server before it is
 * proactively recycled. Amortizes startup across many tests while keeping each
 * cached provider subprocess well within the range where it stays healthy.
 */
const MAX_TESTS_PER_SHARED_SERVER = 25;
const TEMP_DIR_CLEANUP_TIMEOUT_MS = 30_000;
/** A synthetic token used on replay (no real credential needed). */
export const REPLAY_PLACEHOLDER_TOKEN = 'replay-no-token';
export type AgentHostE2EModelTraffic = 'recorded' | 'none';

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

export async function removeTempDirs(tempDirs: string[]): Promise<void> {
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
const CAPTURES_DIR = fileURLToPath(new URL('../../../../../../../../src/vs/platform/agentHost/test/node/e2e/captures/', import.meta.url));
const EMPTY_CAPTURE_PATH = join(CAPTURES_DIR, 'empty.yaml');

/** Per-test fixture path derived from the provider + test title. */
function fixturePathFor(provider: string, testTitle: string): string {
	const slug = testTitle.replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '').toLowerCase();
	return join(CAPTURES_DIR, `${provider}-${slug}.yaml`);
}

/**
 * Build the `capiReplay` option for a test: replays the committed per-test
 * fixture by default (tokenless), or records it against real CAPI when
 * `AGENT_HOST_REPLAY_RECORD=1` or `AGENT_HOST_UPDATE_SNAPSHOTS=1`. Tests that
 * declare no model traffic always use the strict shared empty replay fixture.
 */
export function capiReplayFor(provider: string, testTitle: string, modelTraffic: AgentHostE2EModelTraffic = 'recorded'): { fixturePath: string; real: true; mode: CapiReplayMode } {
	if (modelTraffic === 'none') {
		return { fixturePath: EMPTY_CAPTURE_PATH, real: true, mode: 'replay' };
	}
	return { fixturePath: fixturePathFor(provider, testTitle), real: true, mode: REPLAY_MODE };
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
	 * When set, shell-dependent replay tests are skipped on Linux because this
	 * provider completes recorded shell-tool turns without emitting tool-call
	 * notifications there. Recording and other platforms keep full coverage.
	 */
	readonly shellToolReplayUnstableOnLinux?: boolean;
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
	/** Whether the provider supports additional peer chats and chat forks. */
	readonly supportsMultipleChats: boolean;
	readonly supportsChatFork: boolean;
	/** Whether provider-backed fork context can be tested end-to-end. */
	readonly supportsChatForkE2E: boolean;

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
	const sessionUri = await createProviderSession(c, {
		provider: config.provider,
		scheme: config.scheme,
		githubToken: config.githubToken ?? resolveGitHubToken(),
	}, clientId, trackingList, workingDirectory);
	c.setAhpSnapshotNormalization({
		workingDirectory: workingDirectory.fsPath,
		homeDirectory: homedir(),
		userName: userInfo().username,
	});
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

export { dispatchTurn, dispatchTurnWithAttachments };

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
	private _dataDir: string | undefined;
	/**
	 * Number of tests served by the current shared server. A single long-lived
	 * host caches one provider SDK/CLI subprocess and reuses it across every
	 * test; after enough sessions that subprocess can accumulate state and
	 * eventually wedge a turn (turn starts, but no model response arrives even
	 * though replay is instant). Recycling the server well before that keeps each
	 * host instance within its reliable range while still amortizing startup.
	 */
	private _testsOnCurrentServer = 0;
	private readonly _startOptions: { readonly claudeSdkRoot?: string; readonly codexSdkRoot?: string; readonly homeDir: string; readonly userDataDir: string };

	constructor(
		private readonly _config: IAgentHostE2EProviderConfig,
		startOptions: { readonly claudeSdkRoot?: string; readonly codexSdkRoot?: string } = {},
	) {
		const dataDir = mkdtempSync(join(tmpdir(), 'vscode-agent-host-e2e-'));
		this._dataDir = dataDir;
		this._startOptions = {
			...startOptions,
			homeDir: dataDir,
			userDataDir: join(dataDir, 'user-data'),
		};
		// Server reuse is a replay-only optimization: recording writes one fixture
		// per proxy and so needs a fresh proxy (hence a fresh server) per test.
		// In replay it is always safe because every test drains its turns, so the
		// reused server carries no in-flight work across tests.
		this._shared = !RECORD;
	}

	/** Acquire a server + connected client for a test, returning both. */
	async acquire(testTitle: string, modelTraffic: AgentHostE2EModelTraffic = 'recorded'): Promise<{ server: IServerHandle; client: TestProtocolClient }> {
		const capiReplay = capiReplayFor(this._config.provider, testTitle, modelTraffic);
		// Proactively recycle a shared server that has served enough tests, before
		// its cached provider subprocess can degrade and wedge a turn.
		if (this._shared && this._server && this._testsOnCurrentServer >= MAX_TESTS_PER_SHARED_SERVER) {
			await this._recycleSharedServer();
		}
		if (this._shared && this._server) {
			const proxy = this._server.capiReplay;
			if (!proxy) {
				throw new Error('[agent-host-e2e] shared replay server has no capiReplay proxy to reset');
			}
			proxy.resetForReplay(capiReplay.fixturePath);
		} else {
			this._server = await startRealServer({ ...this._startOptions, capiReplay });
			this._testsOnCurrentServer = 0;
		}
		this._testsOnCurrentServer++;
		this._client = new TestProtocolClient(
			this._server.port,
			() => this._server?.capiReplay?.takeCacheMissError(),
			workingDirectory => this._server?.capiReplay?.setWorkingDirectory(workingDirectory),
		);
		await this._client.connect();
		return { server: this._server, client: this._client };
	}

	/** Stop the current shared server so the next {@link acquire} starts a fresh one. */
	private async _recycleSharedServer(): Promise<void> {
		try {
			await this._server?.capiReplay?.close();
		} finally {
			await stopServer(this._server);
			this._server = undefined;
			this._testsOnCurrentServer = 0;
		}
	}

	get observedModelRequestBodies(): readonly string[] {
		return this._server?.capiReplay?.observedModelRequestBodies ?? [];
	}

	/**
	 * Release a test: dispose its sessions, disconnect the client, and verify the
	 * replay traffic. A shared server is normally kept alive (with its cached SDK
	 * client) for the next test; a per-test server is stopped.
	 *
	 * Pass `forceRestart` when the just-run test failed. A failed test can leave
	 * a mid-turn session that wedges (or has already killed) the shared host, so
	 * reusing it would cascade `ECONNREFUSED` / `createSession` timeouts into the
	 * next, unrelated test. Restarting isolates the failure to the one test that
	 * caused it. The strict cache-miss assertion is also skipped on restart: the
	 * test already failed for its own reason, and a secondary cache-miss throw
	 * would only obscure it.
	 */
	async release(createdSessions: string[], forceRestart = false): Promise<void> {
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
					await client.call('disposeSession', { channel: session }, 30_000);
				} catch { /* best-effort */ }
			}
			client.close();
		}
		createdSessions.length = 0;
		this._client = undefined;

		if (this._shared && !forceRestart) {
			// Surface this test's strict cache-misses but keep the server (and its
			// cached SDK client) alive for the next test.
			this._server?.capiReplay?.assertNoCacheMisses();
		} else {
			// Per-test server, or a shared server being restarted after a failure.
			// Flush the recording / surface strict replay cache-misses (unless the
			// test already failed) before the process goes away. Kill even if the
			// strict check throws.
			try {
				if (!forceRestart) {
					await this._server?.capiReplay?.stop();
				}
			} finally {
				await stopServer(this._server);
				this._server = undefined;
			}
		}
	}

	/** Tear down a shared server at the end of the suite (no-op for per-test). */
	async dispose(): Promise<void> {
		const dataDir = this._dataDir;
		this._dataDir = undefined;
		try {
			if (this._server) {
				try {
					await this._server.capiReplay?.close();
				} finally {
					await stopServer(this._server);
					this._server = undefined;
				}
			}
		} finally {
			if (dataDir) {
				await removeTempDirs([dataDir]);
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
