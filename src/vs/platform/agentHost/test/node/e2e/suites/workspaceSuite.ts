/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { execSync } from 'child_process';
import { mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { URI } from '../../../../../../base/common/uri.js';
import { generateUuid } from '../../../../../../base/common/uuid.js';
import { SubscribeResult } from '../../../../common/state/protocol/commands.js';
import { PROTOCOL_VERSION } from '../../../../common/state/protocol/version/registry.js';
import { ActionType, NotificationType } from '../../../../common/state/sessionActions.js';
import type { SessionAddedParams } from '../../../../common/state/protocol/notifications.js';
import { buildDefaultChatUri, ROOT_STATE_URI, ToolCallConfirmationReason, type SessionState, type TerminalState, type ToolResultContent } from '../../../../common/state/sessionState.js';
import { CopilotCliConfigKey } from '../../../../common/copilotCliConfig.js';
import {
	dispatchTurn,
	resolveGitHubToken,
	startBackgroundApprovalLoop,
	terminalResourceFromContent,
	terminalText,
	textFromContent,
} from '../harness/agentHostE2ETestHarness.js';
import { getActionEnvelope, isActionNotification } from '../../serverIntegrationTestHelpers.js';
import type { IAgentHostE2ETestContext } from './e2eTestContext.js';

export function defineWorkspaceTests(context: IAgentHostE2ETestContext): void {
	const { config, createdSessions, tempDirs, shellToolReplayEnabled, isWindows } = context;
	test('session is created with the correct working directory', async function () {
		this.timeout(120_000);

		const tempDir = mkdtempSync(`${tmpdir()}/ahp-test-`);
		tempDirs.push(tempDir);
		const workingDirUri = URI.file(tempDir).toString();

		context.client.setWorkingDirectory(tempDir);
		await context.client.call('initialize', { channel: ROOT_STATE_URI, protocolVersions: [PROTOCOL_VERSION], clientId: `real-sdk-workdir-${config.provider}` }, 30_000);
		await context.client.call('authenticate', { channel: ROOT_STATE_URI, resource: 'https://api.github.com', token: resolveGitHubToken() }, 30_000);

		const sessionUri = URI.from({ scheme: config.scheme, path: `/${generateUuid()}` }).toString();
		await context.client.call('createSession', { channel: sessionUri, provider: config.provider, workingDirectories: [workingDirUri] }, 30_000);
		createdSessions.push(sessionUri);

		const subscribeResult = await context.client.call<SubscribeResult>('subscribe', { channel: sessionUri }, 30_000);
		const sessionState = subscribeResult.snapshot!.state as SessionState;
		assert.strictEqual(sessionState.workingDirectories?.[0], workingDirUri,
			`subscribe snapshot summary should carry the requested working directory`);
	});

	// Worktree isolation asserts on resolved `.worktrees/...` paths and a
	// host-terminal `pwd`, which are POSIX-shaped (the fixtures were recorded on
	// macOS); skip on Windows where the worktree paths and shell differ.
	(config.supportsWorktreeIsolation && !isWindows && shellToolReplayEnabled ? test : test.skip)('worktree session uses the resolved worktree as working directory', async function () {
		this.timeout(120_000);

		const tempDir = mkdtempSync(`${tmpdir()}/ahp-wt-test-`);
		tempDirs.push(tempDir, `${tempDir}.worktrees`);
		execSync('git init', { cwd: tempDir });
		execSync('git config user.name "Agent Host Test"', { cwd: tempDir });
		execSync('git config user.email "agent-host-test@example.com"', { cwd: tempDir });
		execSync('git commit --allow-empty -m "init"', { cwd: tempDir });
		const defaultBranch = execSync('git branch --show-current', { cwd: tempDir, encoding: 'utf-8' }).trim();
		const workingDirUri = URI.file(tempDir).toString();

		context.client.setWorkingDirectory(tempDir);
		await context.client.call('initialize', { channel: ROOT_STATE_URI, protocolVersions: [PROTOCOL_VERSION], clientId: `real-sdk-worktree-${config.provider}` });
		await context.client.call('authenticate', { channel: ROOT_STATE_URI, resource: 'https://api.github.com', token: resolveGitHubToken() });

		// The host's custom terminal tool is opt-in (default off) and only
		// Copilot routes shell commands through it. When the provider
		// supports it, this test additionally asserts on the host-managed
		// terminal's cwd / `pwd` output, so enable it before the session
		// materializes on the first turn dispatch. Codex / Claude run shell
		// commands inside their own SDK subprocess and never surface a host
		// terminal resource, so they verify isolation via the resolved
		// working directory alone.
		if (config.supportsHostTerminalTool) {
			context.client.dispatch({
				channel: ROOT_STATE_URI,
				clientSeq: 0,
				action: { type: ActionType.RootConfigChanged, config: { [CopilotCliConfigKey.EnableCustomTerminalTool]: true } },
			});
		}

		const sessionUri = URI.from({ scheme: config.scheme, path: `/${generateUuid()}` }).toString();
		await context.client.call('createSession', {
			channel: sessionUri, provider: config.provider, workingDirectories: [workingDirUri],
			config: { isolation: 'worktree', branch: defaultBranch },
		});
		createdSessions.push(sessionUri);

		await context.client.call<SubscribeResult>('subscribe', { channel: sessionUri });
		// Conversation contents (turns, tool calls, …) live on the
		// session's default chat channel in the multi-chat protocol;
		// subscribe to it so `chat/*` action notifications are delivered.
		await context.client.call<SubscribeResult>('subscribe', { channel: buildDefaultChatUri(sessionUri) });

		context.client.dispatch({
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

		context.client.clearReceived();
		dispatchTurn(context.client, sessionUri, 'turn-wt',
			'What is your current working directory? Reply with just the absolute path and nothing else.', 2);

		const addedNotif = await context.client.waitForNotification(n =>
			n.method === NotificationType.SessionAdded,
			60_000,
		);
		const addedSummary = (addedNotif.params as SessionAddedParams).summary;

		const addedWorkingDirectory = addedSummary.workingDirectories?.[0];
		assert.ok(addedWorkingDirectory, 'sessionAdded notification should have a workingDirectory');
		assert.ok(addedWorkingDirectory.includes('.worktrees'),
			`workingDirectory should be under the .worktrees folder, got: ${addedWorkingDirectory}`);
		const resolvedWorkingDirectoryPath = URI.parse(addedWorkingDirectory).fsPath;

		await context.client.waitForNotification(
			n => isActionNotification(n, 'chat/turnComplete') || isActionNotification(n, 'chat/error'),
			90_000,
		);

		const errors = context.client.receivedNotifications(n => isActionNotification(n, 'chat/error'));
		assert.strictEqual(errors.length, 0,
			errors.length > 0
				? `Session error during turn (worktree path lost on resume): ${(getActionEnvelope(errors[0]).action as { error?: { message?: string } }).error?.message}`
				: '');

		const responseParts = context.client.receivedNotifications(n => isActionNotification(n, 'chat/responsePart'));
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
			const approvalLoop = startBackgroundApprovalLoop(context.client, {
				approvalSeqStart: 100,
				allow: [{ toolName: config.shellToolName }],
			});
			try {
				context.client.clearReceived();
				dispatchTurn(context.client, addedSummary.resource, 'turn-wt-terminal', 'Run the shell command `pwd` in the session current working directory. Do not specify a working-directory override.', 3);

				// The `pwd` output can arrive as streaming partial content
				// (`toolCallContentChanged`) or in the final tool result
				// (`toolCallComplete`), depending on the provider. Accept
				// either as long as the text carries the worktree path.
				const pwdNotif = await context.client.waitForNotification(n => {
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
			await context.client.waitForNotification(n => isActionNotification(n, 'chat/turnComplete'), 90_000);
			return;
		}

		context.client.clearReceived();
		dispatchTurn(context.client, addedSummary.resource, 'turn-wt-terminal', 'Run the shell command: pwd', 3);

		const toolStartNotif = await context.client.waitForNotification(n => isActionNotification(n, 'chat/toolCallStart'), 60_000);
		const toolStartAction = getActionEnvelope(toolStartNotif).action as { toolCallId: string };

		const toolReadyNotif = await context.client.waitForNotification(n => isActionNotification(n, 'chat/toolCallReady'), 30_000);
		const toolReadyAction = getActionEnvelope(toolReadyNotif).action as { confirmed?: string };
		if (!toolReadyAction.confirmed) {
			context.client.dispatch({
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

		const terminalContentNotif = await context.client.waitForNotification(n => {
			if (!isActionNotification(n, 'chat/toolCallContentChanged')) {
				return false;
			}
			const action = getActionEnvelope(n).action as { toolCallId: string; content: readonly ToolResultContent[] };
			return action.toolCallId === toolStartAction.toolCallId && terminalResourceFromContent(action.content) !== undefined;
		}, 30_000);
		const terminalContentAction = getActionEnvelope(terminalContentNotif).action as { content: readonly ToolResultContent[] };
		const terminalUri = terminalResourceFromContent(terminalContentAction.content);
		assert.ok(terminalUri, 'shell tool should expose its terminal resource');

		const terminalSubscribeResult = await context.client.call<SubscribeResult>('subscribe', { channel: terminalUri });
		const initialTerminalState = terminalSubscribeResult.snapshot!.state as TerminalState;
		assert.strictEqual(initialTerminalState.cwd, resolvedWorkingDirectoryPath, 'terminal should be created in the resolved worktree directory');

		await context.client.waitForNotification(n => isActionNotification(n, 'chat/turnComplete'), 90_000);
		const terminalSnapshot = await context.client.call<SubscribeResult>('subscribe', { channel: terminalUri });
		const terminalState = terminalSnapshot.snapshot!.state as TerminalState;
		assert.ok(terminalText(terminalState).includes(resolvedWorkingDirectoryPath),
			`pwd output should include the resolved worktree path ${resolvedWorkingDirectoryPath}`);
	});
}
