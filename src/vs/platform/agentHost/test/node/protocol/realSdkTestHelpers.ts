/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Shared helpers and a parameterized suite factory for real-SDK integration
 * tests. Both the Copilot (`copilotcli`) and Claude (`claude`) providers expose
 * the same agent-host protocol, so most tests are identical apart from a
 * handful of provider-specific tool names.
 *
 * Each provider invokes {@link defineSharedRealSdkTests} from its own
 * `*RealSdk.integrationTest.ts` file and then layers on any provider-specific
 * tests as a separate `suite` block.
 */

import assert from 'assert';
import { execSync } from 'child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
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
import { AgentHostConfigKey } from '../../../common/agentHostCustomizationConfig.js';
import {
	getActionEnvelope, isActionNotification, fetchSessionWithChat, IServerHandle, startRealServer, TestProtocolClient,
} from './testHelpers.js';

// #region Token

/** Resolve GitHub token from env or `gh auth token`. */
export function resolveGitHubToken(): string {
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
 * Per-provider knobs for the shared real-SDK suite. Lets us share the bulk of
 * the test bodies while parameterizing things that genuinely differ between
 * Copilot and Claude (tool names, URI scheme, server startup options).
 */
export interface IRealSdkProviderConfig {
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
	 * working directory to a `.worktrees/...` path on materialization.
	 * Claude has not landed worktree isolation yet (Phase 12 in roadmap).
	 */
	readonly supportsWorktreeIsolation: boolean;
	/**
	 * Provider exposes a subagent tool (`task` / `Task`) that produces
	 * `ToolResultSubagentContent` and routes inner tool calls to a child
	 * session. Claude has not landed subagents yet (Phase 12 in roadmap).
	 */
	readonly supportsSubagents: boolean;
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
	config: IRealSdkProviderConfig,
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

	return sessionUri;
}

/** Dispatch a turn with the given user message text. */
export function dispatchTurn(c: TestProtocolClient, session: string, turnId: string, text: string, clientSeq: number): void {
	c.dispatch({
		channel: buildDefaultChatUri(session),
		clientSeq,
		action: {
			type: ActionType.ChatTurnStarted,
			turnId,
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

// #region Shared suite

/**
 * Registers the cross-provider real-SDK suite. The body is identical for
 * every provider that speaks the agent host protocol — the only knobs are
 * tool names and URI scheme.
 */
export function defineSharedRealSdkTests(config: IRealSdkProviderConfig): void {
	(config.enabled ? suite : suite.skip)(config.suiteTitle, function () {

		let server: IServerHandle;
		let client: TestProtocolClient;
		const createdSessions: string[] = [];
		const tempDirs: string[] = [];

		suiteSetup(async function () {
			this.timeout(60_000);
		});

		suiteTeardown(function () {
			// no-op: the server is started/killed per-test in setup/teardown
			// because some real-SDK paths (notably Claude's mid-turn dispose)
			// leave the agent host in a bad state. Per-test isolation costs
			// ~5s/test at startup but keeps a single broken test from
			// poisoning every subsequent one.
		});

		setup(async function () {
			this.timeout(60_000);
			server = await startRealServer({ claudeSdkRoot: config.claudeSdkRoot, codexSdkRoot: config.codexSdkRoot });
			client = new TestProtocolClient(server.port);
			await client.connect();
		});

		teardown(async function () {
			// Generous timeout: a session left mid-turn (e.g. the permission
			// test for Claude, where the model hasn't yielded `turnComplete`)
			// has to abort an in-flight SDK query before disposeSession
			// resolves, which can take longer than the default 5s.
			this.timeout(60_000);
			for (const session of createdSessions) {
				try {
					// Abort first so the SDK query unwinds cleanly before we
					// drop the session — disposing a mid-turn Claude session
					// directly tends to leave the agent host wedged.
					// `session/abortTurn` is not part of the StateAction union,
					// so it bypasses the typed `dispatch` helper.
					client.notify('dispatchAction', {
						clientSeq: 9999,
						action: { type: 'session/abortTurn', session },
					});
					await client.call('disposeSession', { session }, 30_000);
				} catch { /* best-effort */ }
			}
			createdSessions.length = 0;
			client.close();
			server?.process.kill();

			for (const dir of tempDirs) {
				try {
					rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
				} catch { /* best-effort */ }
			}
			tempDirs.length = 0;
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

		test('can abort a running turn', async function () {
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

			await client.call('initialize', { channel: ROOT_STATE_URI, protocolVersions: [PROTOCOL_VERSION], clientId: `real-sdk-workdir-${config.provider}` });
			await client.call('authenticate', { channel: ROOT_STATE_URI, resource: 'https://api.github.com', token: resolveGitHubToken() });

			const sessionUri = URI.from({ scheme: config.scheme, path: `/${generateUuid()}` }).toString();
			await client.call('createSession', { channel: sessionUri, provider: config.provider, workingDirectory: workingDirUri });
			createdSessions.push(sessionUri);

			const subscribeResult = await client.call<SubscribeResult>('subscribe', { channel: sessionUri });
			const sessionState = subscribeResult.snapshot!.state as SessionState;
			assert.strictEqual(sessionState.workingDirectory, workingDirUri,
				`subscribe snapshot summary should carry the requested working directory`);
		});

		(config.supportsWorktreeIsolation ? test : test.skip)('worktree session uses the resolved worktree as working directory', async function () {
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

			// The host's custom terminal tool is opt-in (default off). This test
			// asserts on the host-managed terminal's cwd / `pwd` output, so the
			// shell tool must route through the host terminal manager. Enable it
			// before the session materializes on the first turn dispatch.
			client.dispatch({
				channel: ROOT_STATE_URI,
				clientSeq: 0,
				action: { type: ActionType.RootConfigChanged, config: { [AgentHostConfigKey.EnableCustomTerminalTool]: true } },
			});

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

		(config.supportsSubagents ? test : test.skip)('reopening a session keeps sub-agent messages out of the parent transcript (replay path)', async function () {
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
			// parent agent's final summary behavior.
			const sentinel = `subagent replay note ${generateUuid().replace(/-/g, '').slice(0, 10)}`;

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
