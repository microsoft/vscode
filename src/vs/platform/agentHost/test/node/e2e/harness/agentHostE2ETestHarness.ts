/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Shared drivers and lifecycle helpers for bundled-provider Agent Host E2E tests.
 */

import assert from 'assert';
import { execSync } from 'child_process';
import { chmodSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, statSync } from 'fs';
import { homedir, tmpdir, userInfo } from 'os';
import { fileURLToPath } from 'url';
import { timeout } from '../../../../../../base/common/async.js';
import { join } from '../../../../../../base/common/path.js';
import { removeAnsiEscapeCodes } from '../../../../../../base/common/strings.js';
import { URI } from '../../../../../../base/common/uri.js';
import {
	ResponsePartKind, ChatInputAnswerState, ChatInputAnswerValueKind, ChatInputQuestionKind,
	ChatInputResponseKind, ToolResultContentType, ToolCallConfirmationReason, ToolCallCancellationReason, buildDefaultChatUri,
	getInlineToolInput, MessageKind, ROOT_STATE_URI, type MessageAttachment, type ChatInputAnswer, type ChatInputRequest, type RootState, type TerminalState,
	type ToolResultContent,
} from '../../../../common/state/sessionState.js';
import type { SubscribeResult } from '../../../../common/state/protocol/commands.js';
import { TerminalClaimKind } from '../../../../common/state/protocol/channels-terminal/state.js';
import {
	ActionType,
	type ChatInputRequestedAction, type ChatToolCallReadyAction,
	type ChatErrorAction, type ChatToolCallCompleteAction, type ChatToolCallStartAction,
} from '../../../../common/state/sessionActions.js';
import { CopilotCliConfigKey } from '../../../../common/copilotCliConfig.js';
import { AgentHostSessionResidencyLimitEnvVar } from '../../../../common/agentService.js';
import { CapiReplayMode, type ICapiReplayResponse } from './capiReplayProxy.js';
import {
	fetchSessionWithChat, getActionEnvelope, getAgentHostE2ETestTimeout, isActionNotification, IServerHandle, stopServer, TestProtocolClient,
} from '../../serverIntegrationTestHelpers.js';
import { defaultAgentHostTarget, type IAgentHostTarget } from './agentHostTarget.js';
import { createProviderSession, dispatchTurn, dispatchTurnWithAttachments } from '../../providerIntegrationTestHelpers.js';
import { AgentHostUpdateSnapshotsEnvVar, AhpSnapshotScenario, type IAhpSnapshotOptions } from './ahpSnapshot.js';
import { normalizeShellToolNameForCapture } from './shellToolNames.js';

// #region Record/replay

/**
 * `AGENT_HOST_REPLAY_RECORD=1` records only LLM fixtures, while
 * `AGENT_HOST_UPDATE_SNAPSHOTS=1` records LLM fixtures and updates AHP
 * snapshots in the same run.
 */
const UPDATE_SNAPSHOTS = process.env[AgentHostUpdateSnapshotsEnvVar] === '1';
const RECORD = process.env['AGENT_HOST_REPLAY_RECORD'] === '1' || UPDATE_SNAPSHOTS;
const REPLAY_MODE: CapiReplayMode = RECORD ? 'record' : 'replay';

/**
 * Upper bound on **model-backed** tests served by a single shared replay server
 * before it is proactively recycled. The cached provider SDK/CLI subprocess
 * degrades as a function of the model-driven turns it has run, not of how many
 * tests connected, so host-only tests do not count against this budget.
 * Amortizes startup across many tests while keeping each cached provider
 * subprocess well within the range where it stays healthy.
 */
const MAX_MODEL_BACKED_TESTS_PER_SHARED_SERVER = 25;
/** Bounds host-owned resource accumulation even when tests never contact a model. */
const MAX_TESTS_PER_SHARED_SERVER = 40;
const TEMP_DIR_CLEANUP_TIMEOUT_MS = 30_000;
/** A synthetic token used on replay (no real credential needed). */
export const REPLAY_PLACEHOLDER_TOKEN = 'replay-no-token';
export type AgentHostE2EModelTraffic = 'recorded' | 'none';

/**
 * Clears read-only attributes across a directory tree.
 *
 * Git marks the files under `.git/objects` read-only, and on Windows a
 * read-only file cannot be deleted — `rmSync`'s `force` option only suppresses
 * `ENOENT`, it does not override the attribute. Without this, any test that
 * creates a git repository in a temp directory fails teardown on Windows after
 * burning the full cleanup timeout, even though the test itself passed.
 *
 * Best-effort throughout: entries can disappear underneath us while the failed
 * removal is still unwinding, and a failure here just means the retry fails the
 * same way it already did.
 */
function clearReadOnlyAttributes(dir: string): void {
	let entries: string[];
	try {
		entries = readdirSync(dir);
	} catch {
		return;
	}
	for (const entry of entries) {
		const entryPath = join(dir, entry);
		try {
			// Directories need the execute bit to stay traversable.
			const isDirectory = statSync(entryPath).isDirectory();
			chmodSync(entryPath, isDirectory ? 0o700 : 0o600);
			if (isDirectory) {
				clearReadOnlyAttributes(entryPath);
			}
		} catch {
			// Entry vanished or cannot be changed; the retry will report it.
		}
	}
}

/**
 * Initializes a git repository for a test, with an identity and no background
 * maintenance.
 *
 * `gc.auto 0` matters on Windows: an auto-triggered `git gc` runs in the
 * background and can still hold handles under `.git` when the test finishes,
 * which makes the temp-directory cleanup fail for a reason unrelated to the
 * behavior under test. Tests here never create enough objects to need gc.
 */
export function initTestGitRepo(cwd: string): void {
	execSync('git init', { cwd });
	execSync('git config user.name "Agent Host Test"', { cwd });
	execSync('git config user.email "agent-host-test@example.com"', { cwd });
	execSync('git config gc.auto 0', { cwd });
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
				// A read-only file never becomes deletable by waiting, so clear the
				// attributes before the retry rather than spinning until the
				// deadline. Harmless when the real cause is a transient lock.
				clearReadOnlyAttributes(dir);
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
 * Tests whose recorded capture is allowed to contain POSIX-only commands.
 *
 * Keyed by provider and test title, since a capture exists per provider and an
 * exception must only ever silence the one it was written for. Each entry must
 * correspond to a test that is *also* scoped away from Windows at its call
 * site, with the reason stated there. This list exists so the exceptions are
 * countable in one place; adding to it should be rare and deliberate. See
 * `harness/posixCommandLint.ts`.
 */
const POSIX_COMMAND_EXCEPTIONS = new Set<string>([]);

/**
 * Captures that are allowed to disagree with the request the host now sends.
 *
 * Keyed by provider and test title for the same reason as
 * {@link POSIX_COMMAND_EXCEPTIONS}: the same test runs against every provider
 * that supports it, and each has its own capture. The capture stops being an
 * assertion for an entry here, so one is only justified when it *cannot* be
 * refreshed, and it must have a `KNOWN_ISSUES.md` entry recording why. See
 * `harness/modelRequestProjection.ts`.
 */
const STALE_RECORDED_REQUEST_EXCEPTIONS = new Set<string>([
	// Re-recording anchors a side chat on a source turn, which hits the same
	// anchor-resolution defect that gates `supportsChatForkE2E`: Claude cannot
	// resolve a client-assigned turn id, so the fork silently degrades to an
	// injected context preamble. The capture predates that preamble and cannot
	// be refreshed until the defect is fixed. Claude only: the other providers
	// fork fine and their captures are current.
	'claude:side chat receives bounded source context without copied history',
]);

/** Identifies one provider's capture of a test, matching `fixturePathFor`. */
function captureKey(provider: string, testTitle: string): string {
	return `${provider}:${testTitle}`;
}

/**
 * Build the `capiReplay` option for a test: replays the committed per-test
 * fixture by default (tokenless), or records it against real CAPI when
 * `AGENT_HOST_REPLAY_RECORD=1` or `AGENT_HOST_UPDATE_SNAPSHOTS=1`. Tests that
 * declare no model traffic always use the strict shared empty replay fixture.
 */
export function capiReplayFor(provider: string, testTitle: string, modelTraffic: AgentHostE2EModelTraffic = 'recorded'): { fixturePath: string; real: true; mode: CapiReplayMode; allowPosixCommands: boolean; allowStaleRecordedRequest: boolean } {
	const key = captureKey(provider, testTitle);
	const allowPosixCommands = POSIX_COMMAND_EXCEPTIONS.has(key);
	const allowStaleRecordedRequest = STALE_RECORDED_REQUEST_EXCEPTIONS.has(key);
	if (modelTraffic === 'none') {
		return { fixturePath: EMPTY_CAPTURE_PATH, real: true, mode: 'replay', allowPosixCommands, allowStaleRecordedRequest };
	}
	return { fixturePath: fixturePathFor(provider, testTitle), real: true, mode: REPLAY_MODE, allowPosixCommands, allowStaleRecordedRequest };
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
	/** Provider ids expected on models advertised by this harness. Defaults to {@link provider}. */
	readonly modelProviders?: readonly string[];
	/** URI scheme used when minting session URIs. */
	readonly scheme: string;
	/**
	 * Tool name used by the provider for an interactive shell command. Used
	 * by the shell-permission and cd-prefix tests. (`bash` for Copilot,
	 * `Bash` for Claude.)
	 */
	readonly shellToolName: string;
	/** How file-operation scenarios should drive this provider. */
	readonly fileOperationStrategy: 'fileTools' | 'shell';
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
	/** File-creation tool that exposes model-generated argument deltas, when supported. */
	readonly streamingFileCreateToolName?: string;
	/** Alternate model used to verify a client-selected model reaches the provider. */
	readonly modelSwitchTarget?: string;
	/** Model used to switch an already-running provider session a second time. */
	readonly modelSwitchReturnTarget?: string;
	/** Provider-specific prompt that reliably triggers one interactive input request. */
	readonly interactiveInputPrompt?: string;
	/** Provider-specific prompt that expects a cancelled interactive input request. */
	readonly cancelledInputPrompt?: string;
	/** Provider-specific prompt that triggers a freeform text input request. */
	readonly textInputPrompt?: string;
	/** Provider-specific prompt that triggers a multi-select input request. */
	readonly multiSelectInputPrompt?: string;
	/** Provider supports a session with no working directory through the full model path. */
	readonly supportsWorkspacelessE2E?: boolean;
	/** Provider exposes runtime slash commands through AHP completions after materialization. */
	readonly supportsRuntimeSlashCommandsE2E?: boolean;
	/** Provider supports shared default-chat attachment scenarios. */
	readonly supportsAttachmentsE2E?: boolean;
	/** Provider supports truncating a materialized conversation and continuing. */
	readonly supportsTruncateE2E?: boolean;
	/** Provider supports worktree include-file materialization in deterministic replay. */
	readonly supportsWorktreeIncludeFilesE2E?: boolean;
	/** Provider can deterministically replay cancellation while paused on input or approval. */
	readonly supportsPausedTurnCancellationE2E?: boolean;
	/** Provider's denied file-creation flow mutates the workspace during replay on Linux. */
	readonly fileToolDenialReplayUnstableOnLinux?: boolean;
	/**
	 * Whether the suite should be enabled. Returning false skips the suite
	 * entirely (mirrors `suite.skip(...)`).
	 */
	readonly enabled: boolean;
	/**
	 * Optional path to a locally installed `@anthropic-ai/claude-agent-sdk`
	 * package. Forwarded to the target's `launch` so the agent host registers
	 * the Claude provider.
	 */
	readonly claudeSdkRoot?: string;
	/** Optional path to a locally installed `codex` binary. Forwarded to the target's `launch`. */
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
	 * session.
	 */
	readonly supportsSubagents: boolean;
	/** Whether the provider supports creating side chats from a source turn. */
	readonly supportsSideChats?: boolean;
	/** Whether committed replay fixtures cover side-chat behavior for this provider. */
	readonly supportsSideChatsE2E?: boolean;
	/**
	 * When set, shell-dependent replay tests are skipped on Linux because this
	 * provider completes recorded shell-tool turns without emitting tool-call
	 * notifications there. Recording and other platforms keep full coverage.
	 */
	readonly shellToolReplayUnstableOnLinux?: boolean;
	/** Provider intermittently completes successful shell calls without exposing result text. */
	readonly shellToolResultTextUnreliable?: boolean;
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
	/** Whether model-backed multiple-chat parity scenarios have deterministic fixtures. */
	readonly supportsMultipleChatsE2E?: boolean;
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
	beforeCreateSession?: () => Promise<void>,
): Promise<string> {
	const sessionUri = await createProviderSession(c, {
		provider: config.provider,
		scheme: config.scheme,
		githubToken: config.githubToken ?? resolveGitHubToken(),
	}, clientId, trackingList, workingDirectory, beforeCreateSession);
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
	options?: IAhpSnapshotOptions,
): Promise<void> {
	const scenario = AhpSnapshotScenario.load(test);
	const workingDirectory = mkdtempSync(join(tmpdir(), 'ahp-snapshot-'));
	tempDirs.push(workingDirectory);
	const sessionUri = await createRealSession(c, config, scenario.clientId, trackingList, URI.file(workingDirectory));
	await scenario.run(c, sessionUri, options);
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
	return driveTurn(c, buildDefaultChatUri(session), turnId, clientSeq, () => dispatchTurn(c, session, turnId, text, clientSeq));
}

export async function driveChatTurnToCompletion(c: TestProtocolClient, chat: string, turnId: string, text: string, clientSeq: number): Promise<IDrivenTurnResult> {
	return driveTurn(c, chat, turnId, clientSeq, () => c.dispatch({
		channel: chat,
		clientSeq,
		action: {
			type: ActionType.ChatTurnStarted,
			turnId,
			startedAt: new Date().toISOString(),
			message: { text, origin: { kind: MessageKind.User } },
		},
	}));
}

export async function driveTurnWithAttachmentsToCompletion(c: TestProtocolClient, session: string, turnId: string, text: string, attachments: readonly MessageAttachment[], clientSeq: number): Promise<IDrivenTurnResult> {
	return driveTurn(c, buildDefaultChatUri(session), turnId, clientSeq, () => dispatchTurnWithAttachments(c, session, turnId, text, attachments, clientSeq));
}

export async function driveTurnWithModelToCompletion(c: TestProtocolClient, session: string, turnId: string, text: string, model: string, clientSeq: number): Promise<IDrivenTurnResult> {
	return driveTurn(c, buildDefaultChatUri(session), turnId, clientSeq, () => c.dispatch({
		channel: buildDefaultChatUri(session),
		clientSeq,
		action: {
			type: ActionType.ChatTurnStarted,
			turnId,
			startedAt: new Date().toISOString(),
			message: { text, origin: { kind: MessageKind.User }, model: { id: model } },
		},
	}));
}

export async function driveTurnWithCancelledInputToCompletion(c: TestProtocolClient, session: string, turnId: string, text: string, clientSeq: number): Promise<IDrivenTurnResult> {
	return driveTurn(c, buildDefaultChatUri(session), turnId, clientSeq, () => dispatchTurn(c, session, turnId, text, clientSeq), ChatInputResponseKind.Cancel);
}

export async function driveTurnWithAnswersToCompletion(c: TestProtocolClient, session: string, turnId: string, text: string, clientSeq: number, getAnswers: (request: ChatInputRequest) => Record<string, ChatInputAnswer>): Promise<IDrivenTurnResult> {
	return driveTurn(c, buildDefaultChatUri(session), turnId, clientSeq, () => dispatchTurn(c, session, turnId, text, clientSeq), ChatInputResponseKind.Accept, getAnswers);
}

async function driveTurn(c: TestProtocolClient, chat: string, turnId: string, clientSeq: number, dispatch: () => void, inputResponse = ChatInputResponseKind.Accept, answerProvider = getAcceptedAnswers): Promise<IDrivenTurnResult> {
	c.clearReceived();
	dispatch();

	const seenNotifications = new Set<object>();
	let nextClientSeq = clientSeq + 1;
	let sawInputRequest = false;
	let sawPendingConfirmation = false;

	while (true) {
		const notification = await c.waitForNotification(n => {
			if (seenNotifications.has(n as object)
				|| (!isActionNotification(n, 'chat/toolCallReady')
					&& !isActionNotification(n, 'chat/inputRequested')
					&& !isActionNotification(n, 'chat/turnComplete')
					&& !isActionNotification(n, 'chat/error'))) {
				return false;
			}
			if (getActionEnvelope(n).channel !== chat) {
				return false;
			}
			if (isActionNotification(n, 'chat/inputRequested')) {
				return true;
			}
			return (getActionEnvelope(n).action as { turnId: string }).turnId === turnId;
		}, 90_000);
		seenNotifications.add(notification as object);

		if (isActionNotification(notification, 'chat/error')) {
			const action = getActionEnvelope(notification).action as ChatErrorAction;
			throw new Error(`Session error while driving ${turnId}: ${action.part.error.errorType}: ${action.part.error.message}`);
		}

		if (isActionNotification(notification, 'chat/toolCallReady')) {
			const action = getActionEnvelope(notification).action as ChatToolCallReadyAction;
			if (!action.confirmed) {
				sawPendingConfirmation = true;
				c.dispatch({
					channel: chat,
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
				channel: chat,
				clientSeq: nextClientSeq++,
				action: {
					type: ActionType.ChatInputCompleted,
					requestId: action.request.id,
					response: inputResponse,
					answers: inputResponse === ChatInputResponseKind.Accept ? answerProvider(action.request) : undefined,
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

function toolResultText(content: readonly ToolResultContent[] | undefined): string {
	if (!content) {
		return '';
	}
	const terminalTexts: string[] = [];
	for (const part of content) {
		if (part.type !== ToolResultContentType.Terminal) {
			continue;
		}
		if (part.result?.preview) {
			terminalTexts.push(part.result.preview);
		}
	}
	return [textFromContent(content), ...terminalTexts].filter(text => text.length > 0).join('\n');
}

function normalizeToolResultText(value: string, workspace?: string): string {
	const withoutAnsi = removeAnsiEscapeCodes(value).replaceAll('\r\n', '\n').replaceAll('\r', '\n');
	let normalizedWorkspace = withoutAnsi;
	if (workspace) {
		normalizedWorkspace = normalizedWorkspace
			.replaceAll(realpathSync(workspace), '${workdir}')
			.replaceAll(workspace, '${workdir}');
	}
	return normalizedWorkspace.replaceAll('\\', '/').trim();
}

/** Asserts deterministic content from a completed tool call instead of trusting replayed assistant prose. */
export function assertToolCallCompleteText(
	client: TestProtocolClient,
	options: { readonly channel: string; readonly turnId: string; readonly toolNames: readonly string[]; readonly workspace?: string; readonly expected: readonly RegExp[]; readonly success?: boolean },
): void {
	const toolNames = new Set(options.toolNames.map(normalizeShellToolNameForCapture));
	const starts = client.receivedNotifications(n => isActionNotification(n, 'chat/toolCallStart'))
		.map(n => ({ envelope: getActionEnvelope(n), action: getActionEnvelope(n).action as ChatToolCallStartAction }))
		.filter(({ envelope, action }) => envelope.channel === options.channel && action.turnId === options.turnId && toolNames.has(normalizeShellToolNameForCapture(action.toolName)));
	const startedToolCallIds = new Set(starts.map(({ action }) => action.toolCallId));
	const completions = client.receivedNotifications(n => isActionNotification(n, 'chat/toolCallComplete'))
		.map(n => ({ envelope: getActionEnvelope(n), action: getActionEnvelope(n).action as ChatToolCallCompleteAction }))
		.filter(({ envelope, action }) => envelope.channel === options.channel && action.turnId === options.turnId && startedToolCallIds.has(action.toolCallId));
	const observed: { toolCallId: string; success: boolean; text: string }[] = [];
	let matchingCompletion: ChatToolCallCompleteAction | undefined;
	for (const { action } of completions) {
		if (options.success !== undefined && action.result.success !== options.success) {
			continue;
		}
		const text = normalizeToolResultText(toolResultText(action.result.content), options.workspace);
		observed.push({ toolCallId: action.toolCallId, success: action.result.success, text });
		if (options.expected.every(expected => expected.test(text))) {
			matchingCompletion = action;
			break;
		}
	}
	assert.ok(matchingCompletion, `expected ${options.turnId} to complete ${options.toolNames.join('/')} with result text matching ${options.expected.map(String).join(', ')}; observed ${observed.map(value => JSON.stringify(value)).join(', ')}`);
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
					&& (rule.matchInput?.(getInlineToolInput(action.toolInput)) ?? true));

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
 *   returns mid-turn: one server
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
	 * Number of **model-backed** tests served by the current shared server. A
	 * single long-lived host caches one provider SDK/CLI subprocess and reuses it
	 * across every test; after enough model-driven turns that subprocess can
	 * accumulate state and eventually wedge a turn (turn starts, but no model
	 * response arrives even though replay is instant). Recycling the server well
	 * before that keeps each host instance within its reliable range while still
	 * amortizing startup.
	 */
	private _modelBackedTestsOnCurrentServer = 0;
	private _testsOnCurrentServer = 0;
	private _cleanupClientSeq = 1_000_000;
	private _currentCapiReplay: ReturnType<typeof capiReplayFor> | undefined;
	private readonly _startOptions: { readonly claudeSdkRoot?: string; readonly codexSdkRoot?: string; readonly codexHomeDir: string; readonly homeDir: string; readonly userDataDir: string; readonly env: Readonly<Record<string, string>> };
	private readonly _target: IAgentHostTarget;

	constructor(
		private readonly _config: IAgentHostE2EProviderConfig,
		startOptions: { readonly claudeSdkRoot?: string; readonly codexSdkRoot?: string; readonly target?: IAgentHostTarget } = {},
	) {
		const dataDir = mkdtempSync(join(tmpdir(), 'vscode-agent-host-e2e-'));
		const codexHomeDir = join(dataDir, '.codex');
		mkdirSync(codexHomeDir);
		this._dataDir = dataDir;
		this._target = startOptions.target ?? defaultAgentHostTarget;
		this._startOptions = {
			claudeSdkRoot: startOptions.claudeSdkRoot,
			codexSdkRoot: startOptions.codexSdkRoot,
			codexHomeDir,
			homeDir: dataDir,
			userDataDir: join(dataDir, 'user-data'),
			env: { [AgentHostSessionResidencyLimitEnvVar]: '0' },
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
		this._currentCapiReplay = capiReplay;
		// Bound both provider-model load and host-owned resource accumulation.
		if (this._shared && this._server && (
			this._testsOnCurrentServer >= MAX_TESTS_PER_SHARED_SERVER
			|| this._modelBackedTestsOnCurrentServer >= MAX_MODEL_BACKED_TESTS_PER_SHARED_SERVER
		)) {
			await this._recycleSharedServer();
		}
		if (this._shared && this._server) {
			const proxy = this._server.capiReplay;
			if (!proxy) {
				throw new Error('[agent-host-e2e] shared replay server has no capiReplay proxy to reset');
			}
			proxy.resetForReplay(capiReplay.fixturePath, capiReplay.allowStaleRecordedRequest);
		} else {
			// Only the Copilot CLI provider writes the `@github/copilot` runtime logs we
			// capture, so only it is run verbosely; Claude/Codex use their own runtimes.
			this._server = await this._target.launch({ ...this._startOptions, capiReplay, logLevel: this._isCopilotProvider ? 'trace' : undefined });
			this._modelBackedTestsOnCurrentServer = 0;
			this._testsOnCurrentServer = 0;
		}
		this._testsOnCurrentServer++;
		if (modelTraffic === 'recorded') {
			this._modelBackedTestsOnCurrentServer++;
		}
		this._client = new TestProtocolClient(
			this._server.port,
			() => this._server?.capiReplay?.takeReplayError(),
			workingDirectory => this._server?.capiReplay?.setWorkingDirectory(workingDirectory),
		);
		await this._client.connect();
		return { server: this._server, client: this._client };
	}

	/**
	 * Restart the target while preserving its isolated home, user data, and the
	 * replay proxy's consumed exchange sequence. Returns a connected,
	 * uninitialized client for the caller to initialize with a new client id.
	 */
	async restart(): Promise<TestProtocolClient> {
		const server = this._server;
		const proxy = server?.capiReplay;
		const capiReplay = this._currentCapiReplay;
		if (!server || !proxy || !capiReplay) {
			throw new Error('[agent-host-e2e] no replay-backed server to restart');
		}

		this._client?.close();
		this._client = undefined;
		await stopServer(server);
		this._server = undefined;

		try {
			this._server = await this._target.launch({
				...this._startOptions,
				capiReplay,
				existingCapiReplay: proxy,
				logLevel: this._isCopilotProvider ? 'trace' : undefined,
			});
		} catch (error) {
			await proxy.close();
			throw error;
		}

		const client = new TestProtocolClient(
			this._server.port,
			() => this._server?.capiReplay?.takeReplayError(),
			workingDirectory => this._server?.capiReplay?.setWorkingDirectory(workingDirectory),
		);
		await client.connect();
		this._client = client;
		return client;
	}

	setRecordingModelResponse(response: ICapiReplayResponse): void {
		const proxy = this._server?.capiReplay;
		if (!proxy) {
			throw new Error('[agent-host-e2e] no replay-backed server');
		}
		proxy.setRecordingModelResponse(response);
	}

	/**
	 * Open an additional connection to the current server.
	 *
	 * `reconnect` is only answerable on a transport that has not completed the
	 * handshake, so a test that exercises connection recovery needs a second
	 * socket it can close and re-establish without disturbing the shared
	 * client. The caller owns the returned client and must close it.
	 */
	async connectClient(): Promise<TestProtocolClient> {
		if (!this._server) {
			throw new Error('[agent-host-e2e] no server acquired yet');
		}
		const client = new TestProtocolClient(this._server.port);
		await client.connect();
		return client;
	}

	/** Stop the current shared server so the next {@link acquire} starts a fresh one. */
	private async _recycleSharedServer(): Promise<void> {
		try {
			await this._server?.capiReplay?.close();
		} finally {
			await stopServer(this._server);
			this._server = undefined;
			this._modelBackedTestsOnCurrentServer = 0;
			this._testsOnCurrentServer = 0;
		}
	}

	get observedModelRequestBodies(): readonly string[] {
		return this._server?.capiReplay?.observedModelRequestBodies ?? [];
	}

	/** The bundled `@github/copilot` CLI is the only provider whose runtime logs we capture / run verbosely. */
	private get _isCopilotProvider(): boolean {
		return this._config.provider === 'copilotcli';
	}

	/**
	 * Tail the most recent Copilot runtime (`@github/copilot` CLI) `process-*.log`
	 * into the test output. This is the SDK/CLI's own diagnostics — the key signal
	 * when a turn hangs or times out, which the AHP assertions alone don't explain.
	 * The runtime writes these under `${COPILOT_HOME}/logs`, and the harness pins
	 * `COPILOT_HOME` to `${homeDir}/.copilot` (see `startRealServer`), running it
	 * at `trace`. Only the Copilot CLI provider is captured — Claude/Codex use their
	 * own runtimes and log elsewhere. Best-effort: never throws (it runs in a
	 * `teardown`, right before the failure is re-raised). Output goes to
	 * `process.stdout` directly (not `console.*`): the integration harness overrides
	 * `console.*` and fails the test on ANY unexpected console output during a test,
	 * and `currentTest` is still set during `teardown`.
	 */
	dumpRuntimeLogsOnFailure(label: string): void {
		if (!this._isCopilotProvider) {
			return;
		}
		try {
			const logsDir = join(this._startOptions.homeDir, '.copilot', 'logs');
			let entries: string[];
			try {
				entries = readdirSync(logsDir);
			} catch {
				// No log dir at all — the CLI never spawned. That itself is a signal.
				process.stdout.write(`[agent-host-e2e] no Copilot runtime logs for failed test "${label}" (CLI never spawned; ${logsDir} absent)\n`);
				return;
			}
			const newest = entries
				.filter(name => /^process-.*\.log$/.test(name))
				.map(name => {
					const full = join(logsDir, name);
					try {
						return { full, mtimeMs: statSync(full).mtimeMs };
					} catch {
						return undefined;
					}
				})
				.filter((v): v is { full: string; mtimeMs: number } => v !== undefined)
				.sort((a, b) => b.mtimeMs - a.mtimeMs)[0];
			if (!newest) {
				process.stdout.write(`[agent-host-e2e] no Copilot runtime process-*.log for failed test "${label}" under ${logsDir}\n`);
				return;
			}
			const lines = readFileSync(newest.full, 'utf8').split(/\r?\n/);
			const tail = lines.slice(-200);
			process.stdout.write(`[agent-host-e2e] --- Copilot runtime log for failed test "${label}" (${newest.full}; last ${tail.length} of ${lines.length} lines) ---\n`);
			for (const ln of tail) {
				process.stdout.write(`[agent-host-e2e] # ${ln}\n`);
			}
			process.stdout.write('[agent-host-e2e] --- end Copilot runtime log ---\n');
		} catch {
			// never let diagnostics break teardown
		}
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
		const cleanupErrors: Error[] = [];
		if (client) {
			for (const session of createdSessions) {
				try {
					const state = await fetchSessionWithChat(client, session);
					if (state.activeTurn) {
						const chat = buildDefaultChatUri(session);
						const turnId = state.activeTurn.id;
						client.dispatch({
							channel: chat,
							clientSeq: this._cleanupClientSeq++,
							action: { type: ActionType.ChatTurnCancelled, turnId, duration: 0 },
						});
						await client.waitForNotification(n =>
							isActionNotification(n, 'chat/turnCancelled')
							&& getActionEnvelope(n).channel === chat
							&& (getActionEnvelope(n).action as { turnId: string }).turnId === turnId,
							10_000,
						);
					}
					const root = await client.call<SubscribeResult>('subscribe', { channel: ROOT_STATE_URI });
					const terminals = (root.snapshot!.state as RootState).terminals ?? [];
					for (const terminal of terminals) {
						if (terminal.claim.kind === TerminalClaimKind.Session && terminal.claim.session === session) {
							await client.call('disposeTerminal', { channel: terminal.resource }, getAgentHostE2ETestTimeout(30_000, 90_000));
						}
					}
					await client.call('disposeSession', { channel: session }, getAgentHostE2ETestTimeout(30_000, 90_000));
				} catch (error) {
					cleanupErrors.push(error instanceof Error ? error : new Error(String(error)));
				}
			}
			client.close();
		}
		createdSessions.length = 0;
		this._client = undefined;

		const mustRestart = forceRestart || cleanupErrors.length > 0;
		if (this._shared && !mustRestart) {
			// Surface this test's strict replay failures but keep the server (and
			// its cached SDK client) alive for the next test.
			try {
				this._server?.capiReplay?.assertNoReplayMismatches();
			} catch (error) {
				cleanupErrors.push(error instanceof Error ? error : new Error(String(error)));
				try {
					await this._server?.capiReplay?.close();
				} catch (stopError) {
					cleanupErrors.push(stopError instanceof Error ? stopError : new Error(String(stopError)));
				}
				try {
					await stopServer(this._server);
				} catch (stopError) {
					cleanupErrors.push(stopError instanceof Error ? stopError : new Error(String(stopError)));
				}
				this._server = undefined;
				this._modelBackedTestsOnCurrentServer = 0;
				this._testsOnCurrentServer = 0;
			}
		} else {
			// Per-test server, or a shared server being restarted after a failure.
			// Flush the recording / surface strict replay cache-misses (unless the
			// test already failed) before the process goes away. Kill even if the
			// strict check throws.
			try {
				if (forceRestart) {
					await this._server?.capiReplay?.close();
				} else {
					await this._server?.capiReplay?.stop();
				}
			} catch (error) {
				cleanupErrors.push(error instanceof Error ? error : new Error(String(error)));
			} finally {
				try {
					await stopServer(this._server);
				} catch (error) {
					cleanupErrors.push(error instanceof Error ? error : new Error(String(error)));
				}
				this._server = undefined;
				this._modelBackedTestsOnCurrentServer = 0;
				this._testsOnCurrentServer = 0;
			}
		}
		if (cleanupErrors.length > 0) {
			if (forceRestart) {
				process.stdout.write(`[agent-host-e2e] cleanup reported ${cleanupErrors.length} secondary error(s) after the test failed:\n`);
				for (const error of cleanupErrors) {
					process.stdout.write(`[agent-host-e2e] # ${error.message}\n`);
				}
				return;
			}
			throw new AggregateError(cleanupErrors, `Failed to release Agent Host E2E test resources: ${cleanupErrors.map(error => error.message).join('; ')}`);
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
