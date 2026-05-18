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
import { NotificationType } from '../../../common/state/protocol/notifications.js';
import { SubscribeResult } from '../../../common/state/protocol/commands.js';
import { PROTOCOL_VERSION } from '../../../common/state/protocol/version/registry.js';
import {
	ResponsePartKind, ROOT_STATE_URI, SessionInputAnswerState, SessionInputAnswerValueKind, SessionInputQuestionKind,
	SessionInputResponseKind, ToolResultContentType, isSubagentSession,
	type SessionInputAnswer, type SessionInputRequest, type SessionState, type TerminalState,
	type ToolResultContent, type ToolResultSubagentContent,
} from '../../../common/state/sessionState.js';
import type { RootState } from '../../../common/state/protocol/state.js';
import type {
	RootAgentsChangedAction,
	SessionAddedNotification, SessionInputRequestedAction, SessionToolCallReadyAction,
	SessionToolCallStartAction,
} from '../../../common/state/sessionActions.js';
import type { INotificationBroadcastParams } from '../../../common/state/sessionProtocol.js';
import {
	getActionEnvelope, isActionNotification, IServerHandle, startRealServer, TestProtocolClient,
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
	 * Tool name used by the provider for spawning a subagent. Used in the
	 * subagent-routing prompt. (`task` for Copilot, `Task` for Claude.)
	 */
	readonly subagentToolName: string;
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
	readonly claudeSdkPath?: string;
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
}

// #endregion

// #region Session creation / dispatch

/** Create a session for the configured provider, authenticate, subscribe, and return the session URI. */
export async function createRealSession(
	c: TestProtocolClient,
	config: IRealSdkProviderConfig,
	clientId: string,
	trackingList: string[],
	workingDirectory?: string,
): Promise<string> {
	await c.call('initialize', { protocolVersions: [PROTOCOL_VERSION], clientId }, 30_000);
	await c.call('authenticate', { resource: 'https://api.github.com', token: resolveGitHubToken() }, 30_000);

	const sessionUri = URI.from({ scheme: config.scheme, path: `/${generateUuid()}` }).toString();
	// Default to `folder` isolation so the agent runs in the directory the
	// test passed in. The default for Copilot is `worktree`, which would
	// silently relocate the agent into `<workingDirectory>.worktrees/...`
	// and break tests that assert on filesystem state in the original dir.
	await c.call('createSession', {
		session: sessionUri,
		provider: config.provider,
		workingDirectory,
		config: workingDirectory ? { isolation: 'folder' } : undefined,
	}, 30_000);

	// Sessions are created provisionally — `notify/sessionAdded` is deferred
	// until the agent materializes on first message dispatch. Subscribe
	// directly without waiting for the notification.
	trackingList.push(sessionUri);

	const subscribeResult = await c.call<SubscribeResult>('subscribe', { resource: sessionUri });
	void (subscribeResult.snapshot.state as SessionState);
	c.clearReceived();

	return sessionUri;
}

/** Dispatch a turn with the given user message text. */
export function dispatchTurn(c: TestProtocolClient, session: string, turnId: string, text: string, clientSeq: number): void {
	c.notify('dispatchAction', {
		clientSeq,
		action: {
			type: 'session/turnStarted',
			session,
			turnId,
			userMessage: { text },
		},
	});
}

// #endregion

// #region Input answer helpers

export function getAcceptedAnswers(request: SessionInputRequest): Record<string, SessionInputAnswer> | undefined {
	if (!request.questions?.length) {
		return undefined;
	}

	return Object.fromEntries(request.questions.map(question => {
		switch (question.kind) {
			case SessionInputQuestionKind.Text:
				return [question.id, {
					state: SessionInputAnswerState.Submitted,
					value: { kind: SessionInputAnswerValueKind.Text, value: question.defaultValue ?? 'interactive' },
				} satisfies SessionInputAnswer];
			case SessionInputQuestionKind.Number:
			case SessionInputQuestionKind.Integer:
				return [question.id, {
					state: SessionInputAnswerState.Submitted,
					value: { kind: SessionInputAnswerValueKind.Number, value: question.defaultValue ?? question.min ?? 1 },
				} satisfies SessionInputAnswer];
			case SessionInputQuestionKind.Boolean:
				return [question.id, {
					state: SessionInputAnswerState.Submitted,
					value: { kind: SessionInputAnswerValueKind.Boolean, value: question.defaultValue ?? true },
				} satisfies SessionInputAnswer];
			case SessionInputQuestionKind.SingleSelect: {
				const preferredOption = question.options.find(option => /interactive/i.test(option.id) || /interactive/i.test(option.label))
					?? question.options.find(option => option.recommended)
					?? question.options[0];
				return [question.id, {
					state: SessionInputAnswerState.Submitted,
					value: { kind: SessionInputAnswerValueKind.Selected, value: preferredOption.id },
				} satisfies SessionInputAnswer];
			}
			case SessionInputQuestionKind.MultiSelect: {
				const preferredOptions = question.options.filter(option => option.recommended);
				const selectedOptions = preferredOptions.length > 0 ? preferredOptions : question.options.slice(0, 1);
				return [question.id, {
					state: SessionInputAnswerState.Submitted,
					value: { kind: SessionInputAnswerValueKind.SelectedMany, value: selectedOptions.map(option => option.id) },
				} satisfies SessionInputAnswer];
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
		isActionNotification(n, 'session/responsePart') || isActionNotification(n, 'session/delta')
	)) {
		const action = getActionEnvelope(notification).action;
		if (action.type === 'session/responsePart' && action.part.kind === ResponsePartKind.Markdown) {
			markdownPartIds.add(action.part.id);
			pieces.push(action.part.content);
		} else if (action.type === 'session/delta' && markdownPartIds.has(action.partId)) {
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
	c.clearReceived();
	dispatchTurn(c, session, turnId, text, clientSeq);

	const seenNotifications = new Set<object>();
	let nextClientSeq = clientSeq + 1;
	let sawInputRequest = false;
	let sawPendingConfirmation = false;

	while (true) {
		const notification = await c.waitForNotification(n => !seenNotifications.has(n as object) && (
			isActionNotification(n, 'session/toolCallReady')
			|| isActionNotification(n, 'session/inputRequested')
			|| isActionNotification(n, 'session/turnComplete')
			|| isActionNotification(n, 'session/error')
		), 90_000);
		seenNotifications.add(notification as object);

		if (isActionNotification(notification, 'session/error')) {
			throw new Error(`Session error while driving ${turnId}`);
		}

		if (isActionNotification(notification, 'session/toolCallReady')) {
			const action = getActionEnvelope(notification).action as SessionToolCallReadyAction;
			if (!action.confirmed) {
				sawPendingConfirmation = true;
				c.notify('dispatchAction', {
					clientSeq: nextClientSeq++,
					action: {
						type: 'session/toolCallConfirmed',
						session, turnId,
						toolCallId: action.toolCallId,
						approved: true,
					},
				});
			}
			continue;
		}

		if (isActionNotification(notification, 'session/inputRequested')) {
			sawInputRequest = true;
			const action = getActionEnvelope(notification).action as SessionInputRequestedAction;
			c.notify('dispatchAction', {
				clientSeq: nextClientSeq++,
				action: {
					type: 'session/inputCompleted',
					session,
					requestId: action.request.id,
					response: SessionInputResponseKind.Accept,
					answers: getAcceptedAnswers(action.request),
				},
			});
			continue;
		}

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
	return c.receivedNotifications(n => isActionNotification(n, 'session/toolCallStart'))
		.map(n => getActionEnvelope(n).action as SessionToolCallStartAction)
		.find(a => a.toolCallId === toolCallId)?.toolName;
}

export interface IApprovalRule {
	readonly toolName: string;
	readonly matchInput?: (toolInput: string | undefined) => boolean;
	readonly inspect?: (info: { action: SessionToolCallReadyAction; errors: string[] }) => void;
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
					if (!isActionNotification(n, 'session/toolCallReady')) {
						return false;
					}
					return !processedSeqs.has(getActionEnvelope(n).serverSeq);
				}, 2_000);
				const envelope = getActionEnvelope(ready);
				processedSeqs.add(envelope.serverSeq);
				const action = envelope.action as SessionToolCallReadyAction & { session: string; turnId: string };
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
					c.notify('dispatchAction', {
						clientSeq: ++approvalSeq,
						action: {
							type: 'session/toolCallConfirmed',
							session: action.session, turnId: action.turnId,
							toolCallId: action.toolCallId, approved: false,
						},
					});
					continue;
				}

				matchingRule.inspect?.({ action, errors });
				approvedToolNames.add(matchingRule.toolName);

				c.notify('dispatchAction', {
					clientSeq: ++approvalSeq,
					action: {
						type: 'session/toolCallConfirmed',
						session: action.session, turnId: action.turnId,
						toolCallId: action.toolCallId, approved: true,
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
			server = await startRealServer({ claudeSdkPath: config.claudeSdkPath });
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

			const sessionUri = await createRealSession(client, config, `real-sdk-simple-${config.provider}`, createdSessions, URI.file(tmpdir()).toString());
			dispatchTurn(client, sessionUri, 'turn-1', 'Say exactly "hello" and nothing else', 1);

			await client.waitForNotification(n => isActionNotification(n, 'session/turnComplete'), 90_000);

			const responseParts = client.receivedNotifications(n => isActionNotification(n, 'session/responsePart'));
			assert.ok(responseParts.length > 0, 'should have received at least one response part');
		});

		test('listModels returns well-shaped model entries after authenticate', async function () {
			this.timeout(60_000);

			await client.call('initialize', { protocolVersions: [PROTOCOL_VERSION], clientId: `real-sdk-list-models-${config.provider}` }, 30_000);

			// Subscribe to root state *before* authenticating so we can observe
			// the agentsChanged action that carries the populated model list.
			const rootResult = await client.call<SubscribeResult>('subscribe', { resource: ROOT_STATE_URI }, 30_000);
			const initial = rootResult.snapshot.state as RootState;
			const providerAgent = initial.agents.find(a => a.provider === config.provider);
			assert.ok(providerAgent, `Expected ${config.provider} agent in root state, got: ${initial.agents.map(a => a.provider).join(', ')}`);

			await client.call('authenticate', { resource: 'https://api.github.com', token: resolveGitHubToken() }, 30_000);

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
			const sessionUri = await createRealSession(client, config, `real-sdk-permission-${config.provider}`, createdSessions, URI.file(tempDir).toString());
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
					(isActionNotification(n, 'session/toolCallReady')
						&& (getActionEnvelope(n).action as { confirmed?: string }).confirmed === undefined)
					|| isActionNotification(n, 'session/toolCallComplete')
					|| isActionNotification(n, 'session/error'),
					90_000);
				if (isActionNotification(next, 'session/error')) {
					throw new Error('Session error during permission test');
				}
				if (isActionNotification(next, 'session/toolCallComplete')) {
					break;
				}
				const action = getActionEnvelope(next).action as { toolCallId: string };
				client.notify('dispatchAction', {
					clientSeq: nextSeq++,
					action: {
						type: 'session/toolCallConfirmed',
						session: sessionUri, turnId: 'turn-perm',
						toolCallId: action.toolCallId, approved: true,
					},
				});
			}

			const toolStarts = client.receivedNotifications(n => isActionNotification(n, 'session/toolCallStart'));
			assert.ok(toolStarts.length > 0, 'expected at least one shell tool call');
		});

		(config.supportsPlanMode ? test : test.skip)('planning-mode session-state writes are auto-approved in default mode', async function () {
			this.timeout(180_000);

			const tempDir = mkdtempSync(`${tmpdir()}/ahp-plan-test-`);
			tempDirs.push(tempDir);
			const sessionUri = await createRealSession(client, config, `real-sdk-plan-mode-${config.provider}`, createdSessions, URI.file(tempDir).toString());

			client.notify('dispatchAction', {
				clientSeq: 1,
				action: { type: 'session/configChanged', session: sessionUri, config: { mode: 'plan' } },
			});
			await client.waitForNotification(n => isActionNotification(n, 'session/configChanged'));

			const planTurn = await driveTurnToCompletion(client, sessionUri, 'turn-plan',
				`Help me implement a Python script that prints "hello world" to stdout. Write the shortest possible plan to your session plan.md and use the \`${config.exitPlanModeToolName}\` tool to ask me to approve it before writing any code.`, 2);
			assert.strictEqual(planTurn.sawPendingConfirmation, false, 'should not have received pending-confirmation toolCallReady while writing session-state plan.md');
			assert.ok(planTurn.sawInputRequest, `should reach the ${config.exitPlanModeToolName} question so the test can continue the same session`);

			const extraSessionNotificationsAfterPlan = client.receivedNotifications(n =>
				n.method === 'notification' &&
				(n.params as INotificationBroadcastParams).notification.type === NotificationType.SessionAdded &&
				((n.params as INotificationBroadcastParams).notification as SessionAddedNotification).summary.resource !== sessionUri,
			);
			assert.strictEqual(extraSessionNotificationsAfterPlan.length, 0, 'should not create a second session while answering the plan-mode question');

			client.notify('dispatchAction', {
				clientSeq: 50,
				action: { type: 'session/configChanged', session: sessionUri, config: { mode: 'interactive' } },
			});
			await client.waitForNotification(n => isActionNotification(n, 'session/configChanged'));

			const followupTurn = await driveTurnToCompletion(client, sessionUri, 'turn-followup',
				'What did the plan I just approved say to print? Reply with exactly "hello world".', 100);
			assert.strictEqual(followupTurn.sawPendingConfirmation, false, 'follow-up turn should not surface new pending confirmations');
			assert.match(followupTurn.responseText, /hello world/i, 'follow-up turn should retain the original plan context');

			const extraSessionNotificationsAfterFollowup = client.receivedNotifications(n =>
				n.method === 'notification' &&
				(n.params as INotificationBroadcastParams).notification.type === NotificationType.SessionAdded &&
				((n.params as INotificationBroadcastParams).notification as SessionAddedNotification).summary.resource !== sessionUri,
			);
			assert.strictEqual(extraSessionNotificationsAfterFollowup.length, 0, 'sending another message should stay on the same session instead of forking');

			const resubscribeResult = await client.call<SubscribeResult>('subscribe', { resource: sessionUri });
			const finalSnapshot = resubscribeResult.snapshot.state as SessionState;
			assert.strictEqual(finalSnapshot.summary.resource, sessionUri, 'follow-up turn should keep the original session resource');
		});

		test('can abort a running turn', async function () {
			this.timeout(120_000);

			const sessionUri = await createRealSession(client, config, `real-sdk-abort-${config.provider}`, createdSessions, URI.file(tmpdir()).toString());
			dispatchTurn(client, sessionUri, 'turn-abort', 'Write a very long essay about the history of computing', 1);

			await client.waitForNotification(
				n => isActionNotification(n, 'session/responsePart') || isActionNotification(n, 'session/toolCallStart'),
				60_000,
			);

			client.notify('dispatchAction', {
				clientSeq: 2,
				action: { type: 'session/abortTurn', session: sessionUri },
			});

			await client.waitForNotification(n => isActionNotification(n, 'session/abortTurn'), 10_000);
		});

		test('session is created with the correct working directory', async function () {
			this.timeout(120_000);

			const tempDir = mkdtempSync(`${tmpdir()}/ahp-test-`);
			tempDirs.push(tempDir);
			const workingDirUri = URI.file(tempDir).toString();

			await client.call('initialize', { protocolVersions: [PROTOCOL_VERSION], clientId: `real-sdk-workdir-${config.provider}` });
			await client.call('authenticate', { resource: 'https://api.github.com', token: resolveGitHubToken() });

			const sessionUri = URI.from({ scheme: config.scheme, path: `/${generateUuid()}` }).toString();
			await client.call('createSession', { session: sessionUri, provider: config.provider, workingDirectory: workingDirUri });
			createdSessions.push(sessionUri);

			const subscribeResult = await client.call<SubscribeResult>('subscribe', { resource: sessionUri });
			const sessionState = subscribeResult.snapshot.state as SessionState;
			assert.strictEqual(sessionState.summary.workingDirectory, workingDirUri,
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

			await client.call('initialize', { protocolVersions: [PROTOCOL_VERSION], clientId: `real-sdk-worktree-${config.provider}` });
			await client.call('authenticate', { resource: 'https://api.github.com', token: resolveGitHubToken() });

			const sessionUri = URI.from({ scheme: config.scheme, path: `/${generateUuid()}` }).toString();
			await client.call('createSession', {
				session: sessionUri, provider: config.provider, workingDirectory: workingDirUri,
				config: { isolation: 'worktree', branch: defaultBranch },
			});
			createdSessions.push(sessionUri);

			await client.call<SubscribeResult>('subscribe', { resource: sessionUri });

			client.notify('dispatchAction', {
				clientSeq: 1,
				action: {
					type: 'session/activeClientChanged',
					session: sessionUri,
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
				n.method === 'notification' && (n.params as INotificationBroadcastParams).notification.type === NotificationType.SessionAdded,
				60_000,
			);
			const addedSummary = ((addedNotif.params as INotificationBroadcastParams).notification as SessionAddedNotification).summary;

			assert.ok(addedSummary.workingDirectory, 'sessionAdded notification should have a workingDirectory');
			assert.ok(addedSummary.workingDirectory!.includes('.worktrees'),
				`workingDirectory should be under the .worktrees folder, got: ${addedSummary.workingDirectory}`);
			const resolvedWorkingDirectoryPath = URI.parse(addedSummary.workingDirectory!).fsPath;

			await client.waitForNotification(
				n => isActionNotification(n, 'session/turnComplete') || isActionNotification(n, 'session/error'),
				90_000,
			);

			const errors = client.receivedNotifications(n => isActionNotification(n, 'session/error'));
			assert.strictEqual(errors.length, 0,
				errors.length > 0
					? `Session error during turn (worktree path lost on resume): ${(getActionEnvelope(errors[0]).action as { error?: { message?: string } }).error?.message}`
					: '');

			const responseParts = client.receivedNotifications(n => isActionNotification(n, 'session/responsePart'));
			assert.ok(responseParts.length > 0, 'should have received at least one response part after session refresh');

			client.clearReceived();
			dispatchTurn(client, addedSummary.resource, 'turn-wt-terminal', 'Run the shell command: pwd', 3);

			const toolStartNotif = await client.waitForNotification(n => isActionNotification(n, 'session/toolCallStart'), 60_000);
			const toolStartAction = getActionEnvelope(toolStartNotif).action as { toolCallId: string };

			const toolReadyNotif = await client.waitForNotification(n => isActionNotification(n, 'session/toolCallReady'), 30_000);
			const toolReadyAction = getActionEnvelope(toolReadyNotif).action as { confirmed?: string };
			if (!toolReadyAction.confirmed) {
				client.notify('dispatchAction', {
					clientSeq: 4,
					action: {
						type: 'session/toolCallConfirmed',
						session: addedSummary.resource, turnId: 'turn-wt-terminal',
						toolCallId: toolStartAction.toolCallId, approved: true,
					},
				});
			}

			const terminalContentNotif = await client.waitForNotification(n => {
				if (!isActionNotification(n, 'session/toolCallContentChanged')) {
					return false;
				}
				const action = getActionEnvelope(n).action as { toolCallId: string; content: readonly ToolResultContent[] };
				return action.toolCallId === toolStartAction.toolCallId && terminalResourceFromContent(action.content) !== undefined;
			}, 30_000);
			const terminalContentAction = getActionEnvelope(terminalContentNotif).action as { content: readonly ToolResultContent[] };
			const terminalUri = terminalResourceFromContent(terminalContentAction.content);
			assert.ok(terminalUri, 'shell tool should expose its terminal resource');

			const terminalSubscribeResult = await client.call<SubscribeResult>('subscribe', { resource: terminalUri });
			const initialTerminalState = terminalSubscribeResult.snapshot.state as TerminalState;
			assert.strictEqual(initialTerminalState.cwd, resolvedWorkingDirectoryPath, 'terminal should be created in the resolved worktree directory');

			await client.waitForNotification(n => isActionNotification(n, 'session/turnComplete'), 90_000);
			const terminalSnapshot = await client.call<SubscribeResult>('subscribe', { resource: terminalUri });
			const terminalState = terminalSnapshot.snapshot.state as TerminalState;
			assert.ok(terminalText(terminalState).includes(resolvedWorkingDirectoryPath),
				`pwd output should include the resolved worktree path ${resolvedWorkingDirectoryPath}`);
		});

		(config.supportsSubagents ? test : test.skip)('subagent tool calls are routed to the subagent session, not flat in the parent', async function () {
			this.timeout(180_000);

			const tempDir = mkdtempSync(`${tmpdir()}/ahp-subagent-test-`);
			tempDirs.push(tempDir);
			writeFileSync(`${tempDir}/file-a.txt`, 'alpha');
			writeFileSync(`${tempDir}/file-b.txt`, 'beta');

			const sessionUri = await createRealSession(client, config, `real-sdk-subagent-${config.provider}`, createdSessions, URI.file(tempDir).toString());

			let approvalsActive = true;
			let approvalSeq = 1000;
			const processedSeqs = new Set<number>();
			const approvalLoop = (async () => {
				while (approvalsActive) {
					try {
						const ready = await client.waitForNotification(n => {
							if (!isActionNotification(n, 'session/toolCallReady')) {
								return false;
							}
							const envelope = getActionEnvelope(n);
							const a = envelope.action as { confirmed?: string };
							return !a.confirmed && !processedSeqs.has(envelope.serverSeq);
						}, 2_000);
						const envelope = getActionEnvelope(ready);
						if (!processedSeqs.has(envelope.serverSeq)) {
							processedSeqs.add(envelope.serverSeq);
							const action = envelope.action as { session: string; turnId: string; toolCallId: string; confirmed?: string };
							if (!action.confirmed) {
								client.notify('dispatchAction', {
									clientSeq: ++approvalSeq,
									action: {
										type: 'session/toolCallConfirmed',
										session: action.session, turnId: action.turnId,
										toolCallId: action.toolCallId, approved: true,
									},
								});
							}
						}
					} catch { /* timeout — re-poll */ }
				}
			})();

			dispatchTurn(client, sessionUri, 'turn-sa',
				`Use the \`${config.subagentToolName}\` tool to spawn a subagent to list the files in the current working directory. ` +
				'The subagent should call a single read-only tool (e.g. `view` or shell with `ls`) to enumerate the directory. ' +
				'Do not enumerate the directory yourself — delegate to the subagent.',
				1);

			const subagentContentNotif = await client.waitForNotification(n => {
				if (!isActionNotification(n, 'session/toolCallContentChanged')) {
					return false;
				}
				const action = getActionEnvelope(n).action as { session: string; content: readonly ToolResultContent[] };
				return action.session === sessionUri && action.content.some(c => c.type === ToolResultContentType.Subagent);
			}, 120_000);

			const parentContent = (getActionEnvelope(subagentContentNotif).action as { content: readonly ToolResultContent[] }).content;
			const subagentRef = parentContent.find((c): c is ToolResultSubagentContent => c.type === ToolResultContentType.Subagent)!;
			const subagentSessionUri = subagentRef.resource as unknown as string;
			assert.ok(typeof subagentSessionUri === 'string' && isSubagentSession(subagentSessionUri),
				`subagent session URI should be subagent-shaped, got: ${JSON.stringify(subagentSessionUri)}`);

			await client.call<SubscribeResult>('subscribe', { resource: subagentSessionUri });

			await client.waitForNotification(n => {
				if (!isActionNotification(n, 'session/turnComplete')) {
					return false;
				}
				return (getActionEnvelope(n).action as { session: string }).session === sessionUri;
			}, 150_000);

			approvalsActive = false;
			await approvalLoop;

			const toolStarts = client.receivedNotifications(n => isActionNotification(n, 'session/toolCallStart'))
				.map(n => getActionEnvelope(n).action as SessionToolCallStartAction);

			const parentStarts = toolStarts.filter(a => (a.session as unknown as string) === sessionUri);
			const subagentStarts = toolStarts.filter(a => (a.session as unknown as string) === subagentSessionUri);

			const parentNonTaskStarts = parentStarts.filter(a => a.toolName !== config.subagentToolName);
			assert.deepStrictEqual(parentNonTaskStarts.map(a => a.toolName), [],
				`parent session should not contain inner tool calls; found: ${JSON.stringify(parentNonTaskStarts.map(a => a.toolName))}`);

			assert.ok(subagentStarts.length >= 1,
				`subagent session should contain at least one inner tool call, got ${subagentStarts.length}. ` +
				`Parent tool calls: ${JSON.stringify(parentStarts.map(a => a.toolName))}`);
		});
	});
}

// #endregion
