/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { execSync } from 'child_process';
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { URI } from '../../../../../../base/common/uri.js';
import { generateUuid } from '../../../../../../base/common/uuid.js';
import { SubscribeResult } from '../../../../common/state/protocol/commands.js';
import { PROTOCOL_VERSION } from '../../../../common/state/protocol/version/registry.js';
import { ActionType, NotificationType, type IToolCallContentChangedAction, type IToolCallStartAction } from '../../../../common/state/sessionActions.js';
import type { SessionAddedParams } from '../../../../common/state/protocol/notifications.js';
import { buildDefaultChatUri, ROOT_STATE_URI, type SessionState, type TerminalState, type ToolResultContent } from '../../../../common/state/sessionState.js';
import { CopilotCliConfigKey } from '../../../../common/copilotCliConfig.js';
import {
	dispatchTurn,
	driveTurnToCompletion,
	resolveGitHubToken,
	startBackgroundApprovalLoop,
	terminalResourceFromContent,
	terminalText,
	textFromContent,
	initTestGitRepo,
} from '../harness/agentHostE2ETestHarness.js';
import { getActionEnvelope, isActionNotification } from '../../serverIntegrationTestHelpers.js';
import type { IAgentHostE2ETestContext } from './e2eTestContext.js';

export function defineWorkspaceTests(context: IAgentHostE2ETestContext): void {
	/**
	 * Prints the shell's working directory.
	 *
	 * Pinned like every other shell command in the suite. `node` is guaranteed
	 * present since the suite runs under it, and `console.log` writes the raw
	 * path — PowerShell's `pwd` returns a `PathInfo` the console renders as a
	 * formatted table, which can wrap a long temp path.
	 */
	const PRINT_CWD_COMMAND = `node -e "console.log(process.cwd())"`;
	const { config, createdSessions, tempDirs, portableShellToolReplayEnabled, isWindows } = context;
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

	(context.runKnownIssueTests && config.supportsWorktreeIncludeFilesE2E ? test : test.skip)('worktree materialization copies configured ignored files', async function () {
		this.timeout(180_000);
		const repository = mkdtempSync(`${tmpdir()}/ahp-wt-include-`);
		tempDirs.push(repository, `${repository}.worktrees`);
		initTestGitRepo(repository);
		writeFileSync(`${repository}/tracked.txt`, 'tracked');
		writeFileSync(`${repository}/.gitignore`, '.env\nignored-dir/\n');
		writeFileSync(`${repository}/.env`, 'SECRET=worktree-value\n');
		mkdirSync(`${repository}/ignored-dir`);
		writeFileSync(`${repository}/ignored-dir/config.json`, '{"included":true}\n');
		execSync('git add tracked.txt .gitignore', { cwd: repository });
		execSync('git commit -m "init"', { cwd: repository });
		const branch = execSync('git branch --show-current', { cwd: repository, encoding: 'utf8' }).trim();
		context.client.setWorkingDirectory(repository);
		await context.client.call('initialize', {
			channel: ROOT_STATE_URI,
			protocolVersions: [PROTOCOL_VERSION],
			clientId: `worktree-include-${config.provider}`,
		});
		await context.client.call('authenticate', {
			channel: ROOT_STATE_URI,
			resource: 'https://api.github.com',
			token: resolveGitHubToken(),
		});
		const sessionUri = URI.from({ scheme: config.scheme, path: `/${generateUuid()}` }).toString();
		await context.client.call('createSession', {
			channel: sessionUri,
			provider: config.provider,
			workingDirectories: [URI.file(repository).toString()],
			config: {
				isolation: 'worktree',
				branch,
				worktreeIncludeFiles: ['.env', 'ignored-dir/**'],
			},
		});
		createdSessions.push(sessionUri);
		await context.client.call<SubscribeResult>('subscribe', { channel: sessionUri });
		await context.client.call<SubscribeResult>('subscribe', { channel: buildDefaultChatUri(sessionUri) });
		await driveTurnToCompletion(context.client, sessionUri, 'turn-worktree-include', 'Reply exactly "materialized".', 1);
		const state = (await context.client.call<SubscribeResult>('subscribe', { channel: sessionUri })).snapshot!.state as SessionState;
		const worktree = URI.parse(state.workingDirectories![0]).fsPath;

		assert.deepStrictEqual({
			env: readFileSync(`${worktree}/.env`, 'utf8'),
			config: readFileSync(`${worktree}/ignored-dir/config.json`, 'utf8'),
		}, {
			env: 'SECRET=worktree-value\n',
			config: '{"included":true}\n',
		});
	});

	// Skipped on Windows. The command and the tool name are portable now, but the
	// host terminal assertion is not, for a reason CI surfaced that is specific
	// to this test rather than to command portability:
	//
	//  - The host terminal tool surfaces no `chat/toolCallContentChanged` on
	//    Windows, so the terminal resource this test subscribes to never appears,
	//    even though the tool call itself completes.
	//
	// Re-enabling on Windows needs the missing terminal resource understood.
	(config.supportsWorktreeIsolation && !isWindows && portableShellToolReplayEnabled && !config.shellToolResultTextUnreliable ? test : test.skip)('worktree session uses the resolved worktree as working directory', async function () {
		this.timeout(120_000);

		const tempDir = mkdtempSync(`${tmpdir()}/ahp-wt-test-`);
		tempDirs.push(tempDir, `${tempDir}.worktrees`);
		initTestGitRepo(tempDir);
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

		const addedNotification = context.client.waitForNotification(n =>
			n.method === NotificationType.SessionAdded,
			60_000,
		);
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

		const addedNotif = await addedNotification;
		const addedSummary = (addedNotif.params as SessionAddedParams).summary;

		const addedWorkingDirectory = addedSummary.workingDirectories?.[0];
		assert.ok(addedWorkingDirectory, 'sessionAdded notification should have a workingDirectory');
		assert.ok(addedWorkingDirectory.includes('.worktrees'),
			`workingDirectory should be under the .worktrees folder, got: ${addedWorkingDirectory}`);
		const resolvedWorkingDirectoryPath = URI.parse(addedWorkingDirectory).fsPath;
		const canonicalWorkingDirectoryPath = realpathSync(resolvedWorkingDirectoryPath);
		const includesWorkingDirectoryPath = (text: string): boolean =>
			text.includes(resolvedWorkingDirectoryPath) || text.includes(canonicalWorkingDirectoryPath);

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
				dispatchTurn(context.client, addedSummary.resource, 'turn-wt-terminal', `Run exactly this shell command, with no modifications, in the session current working directory: \`${PRINT_CWD_COMMAND}\`. Do not specify a working-directory override.`, 3);

				// The `pwd` output can arrive as streaming partial content
				// (`toolCallContentChanged`) or in the final tool result
				// (`toolCallComplete`), depending on the provider. Accept
				// either as long as the text carries the worktree path.
				const pwdNotif = await context.client.waitForNotification(n => {
					if (isActionNotification(n, 'chat/toolCallContentChanged')) {
						const action = getActionEnvelope(n).action as { content: readonly ToolResultContent[] };
						return includesWorkingDirectoryPath(textFromContent(action.content));
					}
					if (isActionNotification(n, 'chat/toolCallComplete')) {
						const action = getActionEnvelope(n).action as { result: { content?: readonly ToolResultContent[] } };
						return includesWorkingDirectoryPath(textFromContent(action.result.content ?? []));
					}
					return false;
				}, 90_000);
				const pwdText = isActionNotification(pwdNotif, 'chat/toolCallComplete')
					? textFromContent((getActionEnvelope(pwdNotif).action as { result: { content?: readonly ToolResultContent[] } }).result.content ?? [])
					: textFromContent((getActionEnvelope(pwdNotif).action as { content: readonly ToolResultContent[] }).content);
				assert.ok(includesWorkingDirectoryPath(pwdText),
					`pwd output should include the resolved worktree path ${resolvedWorkingDirectoryPath} (${canonicalWorkingDirectoryPath})`);
			} finally {
				await approvalLoop.stop();
			}
			assert.deepStrictEqual(approvalLoop.errors, [], 'no unexpected tool calls should have been denied');
			await context.client.waitForNotification(n => isActionNotification(n, 'chat/turnComplete'), 90_000);
			return;
		}

		context.client.clearReceived();
		const approvalLoop = startBackgroundApprovalLoop(context.client, {
			approvalSeqStart: 100,
			allow: [{ toolName: config.shellToolName }],
		});
		try {
			dispatchTurn(context.client, addedSummary.resource, 'turn-wt-terminal', `Run exactly this shell command, with no modifications: \`${PRINT_CWD_COMMAND}\``, 3);

			const toolStartNotif = await context.client.waitForNotification(n => {
				if (!isActionNotification(n, 'chat/toolCallStart')) {
					return false;
				}
				const action = getActionEnvelope(n).action as IToolCallStartAction;
				return action.turnId === 'turn-wt-terminal' && action.toolName === config.shellToolName;
			}, 60_000);
			const toolCallId = (getActionEnvelope(toolStartNotif).action as IToolCallStartAction).toolCallId;

			const terminalContentNotif = await context.client.waitForNotification(n => {
				if (!isActionNotification(n, 'chat/toolCallContentChanged')) {
					return false;
				}
				const action = getActionEnvelope(n).action as IToolCallContentChangedAction;
				return action.turnId === 'turn-wt-terminal'
					&& action.toolCallId === toolCallId
					&& terminalResourceFromContent(action.content) !== undefined;
			}, 60_000);
			const terminalContentAction = getActionEnvelope(terminalContentNotif).action as IToolCallContentChangedAction;
			const terminalUri = terminalResourceFromContent(terminalContentAction.content);
			assert.ok(terminalUri, 'shell tool should expose its terminal resource');

			const terminalSubscribeResult = await context.client.call<SubscribeResult>('subscribe', { channel: terminalUri });
			const initialTerminalState = terminalSubscribeResult.snapshot!.state as TerminalState;
			assert.ok(initialTerminalState.cwd, 'terminal should report its working directory');
			assert.strictEqual(realpathSync(initialTerminalState.cwd), canonicalWorkingDirectoryPath, 'terminal should be created in the resolved worktree directory');

			await context.client.waitForNotification(n => isActionNotification(n, 'chat/turnComplete'), 90_000);
			const terminalSnapshot = await context.client.call<SubscribeResult>('subscribe', { channel: terminalUri });
			const terminalState = terminalSnapshot.snapshot!.state as TerminalState;
			assert.ok(includesWorkingDirectoryPath(terminalText(terminalState)),
				`working directory output should include the resolved worktree path ${resolvedWorkingDirectoryPath} (${canonicalWorkingDirectoryPath})`);
		} finally {
			await approvalLoop.stop();
		}
		assert.deepStrictEqual(approvalLoop.errors, [], 'no unexpected tool calls should have been denied');
	});
}
