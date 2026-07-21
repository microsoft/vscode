/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { execSync } from 'child_process';
import { mkdirSync, mkdtempSync, unlinkSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from '../../../../../../base/common/path.js';
import { URI } from '../../../../../../base/common/uri.js';
import { CompletionItemKind, type CompletionsResult, type InitializeResult, type ResolveSessionConfigResult, type SessionConfigCompletionsResult, type SubscribeResult } from '../../../../common/state/protocol/commands.js';
import { PROTOCOL_VERSION } from '../../../../common/state/protocol/version/registry.js';
import { buildDefaultChatUri, ROOT_STATE_URI, ToolCallConfirmationReason, type TerminalState, type ToolResultContent } from '../../../../common/state/sessionState.js';
import {
	createRealSession,
	dispatchTurn,
	getMarkdownResponseText,
	terminalResourceFromContent,
	textFromContent,
} from '../harness/agentHostE2ETestHarness.js';
import { assertRecordedAhpSnapshot } from '../harness/ahpSnapshot.js';
import { fetchSessionWithChat, getActionEnvelope, isActionNotification } from '../../serverIntegrationTestHelpers.js';
import { hostOnlyTest, type IAgentHostE2ETestContext } from './e2eTestContext.js';

export function defineHostFeaturesTests(context: IAgentHostE2ETestContext): void {
	const { config, createdSessions, tempDirs, isWindows } = context;
	const behaviorSnapshot = { profile: 'behavior' } as const;

	function createWorkspace(prefix: string): string {
		const workspace = mkdtempSync(join(tmpdir(), prefix));
		tempDirs.push(workspace);
		return workspace;
	}

	async function createSession(prefix: string, workspace = createWorkspace(`ahp-${prefix}-`)): Promise<string> {
		return createRealSession(context.client, config, `${prefix}-${config.provider}`, createdSessions, URI.file(workspace));
	}

	async function getCompletions(sessionUri: string, text: string): Promise<CompletionsResult> {
		return context.client.call<CompletionsResult>('completions', {
			channel: buildDefaultChatUri(sessionUri),
			kind: CompletionItemKind.UserMessage,
			text,
			offset: text.length,
		});
	}

	hostOnlyTest(context, 'initialize advertises host-owned input capabilities', async function () {

		const result = await context.client.call<InitializeResult>('initialize', {
			channel: ROOT_STATE_URI,
			protocolVersions: [PROTOCOL_VERSION],
			clientId: `host-capabilities-${config.provider}`,
		});

		assert.deepStrictEqual({
			completionTriggerCharacters: result.completionTriggerCharacters,
			terminalCommandPrefix: result.terminalCommandPrefix,
		}, {
			completionTriggerCharacters: ['@', '#', '/'],
			terminalCommandPrefix: '!',
		});
	});

	hostOnlyTest(context, 'workspace file completions are filtered, attached, and cached', async function () {

		const workspace = createWorkspace('ahp-file-completions-');
		const sourceDirectory = join(workspace, 'src');
		mkdirSync(sourceDirectory);
		const targetPath = join(sourceDirectory, 'alpha-target.ts');
		writeFileSync(targetPath, 'export const target = true;\n');
		writeFileSync(join(workspace, 'ignored-target.ts'), 'ignored\n');
		writeFileSync(join(workspace, '.gitignore'), 'ignored-target.ts\n');
		const sessionUri = await createSession('file-completions', workspace);

		const first = await getCompletions(sessionUri, 'review @alpha-t');
		unlinkSync(targetPath);
		const second = await getCompletions(sessionUri, 'review #alpha-t');

		assert.deepStrictEqual({
			first: first.items.map(item => ({ insertText: item.insertText, attachment: item.attachment })),
			second: second.items.map(item => ({ insertText: item.insertText, attachment: item.attachment })),
		}, {
			first: [{
				insertText: '@alpha-target.ts',
				attachment: {
					type: 'resource',
					uri: URI.file(targetPath).toString(),
					label: 'alpha-target.ts',
					displayKind: 'document',
				},
			}],
			second: [{
				insertText: '#alpha-target.ts',
				attachment: {
					type: 'resource',
					uri: URI.file(targetPath).toString(),
					label: 'alpha-target.ts',
					displayKind: 'document',
				},
			}],
		});
	});

	hostOnlyTest(context, 'workspace file completions ignore plain text', async function () {

		const workspace = createWorkspace('ahp-empty-completions-');
		writeFileSync(join(workspace, 'visible.txt'), 'visible\n');
		const sessionUri = await createSession('empty-completions', workspace);

		const result = await getCompletions(sessionUri, 'plain text');

		assert.deepStrictEqual(result, { items: [] });
	});

	hostOnlyTest(context, 'rename completion appears after a locally renamed turn', async function () {

		const sessionUri = await createSession('rename-completion');
		const before = await getCompletions(sessionUri, '/r');

		context.client.clearReceived();
		context.client.clearAhpSnapshot();
		context.client.beginAhpSnapshotRound();
		dispatchTurn(context.client, sessionUri, 'turn-rename', '/rename Coverage Session', 1);
		await context.client.waitForNotification(n =>
			isActionNotification(n, 'chat/turnComplete')
			&& (getActionEnvelope(n).action as { turnId: string }).turnId === 'turn-rename',
		);
		await assertRecordedAhpSnapshot(this.test!, context.client);

		const after = await getCompletions(sessionUri, '/r');
		const session = await fetchSessionWithChat(context.client, sessionUri);

		assert.deepStrictEqual({
			before: before.items.some(item => item.insertText === '/rename '),
			after: after.items.some(item => item.insertText === '/rename '),
			title: session.title,
		}, {
			before: false,
			after: true,
			title: 'Coverage Session',
		});
		assert.match(getMarkdownResponseText(context.client), /Renamed: Coverage Session/);
	});

	hostOnlyTest(context, 'an empty rename command completes without changing the title', async function () {

		const sessionUri = await createSession('empty-rename');
		const before = await fetchSessionWithChat(context.client, sessionUri);

		context.client.clearReceived();
		context.client.clearAhpSnapshot();
		context.client.beginAhpSnapshotRound();
		dispatchTurn(context.client, sessionUri, 'turn-empty-rename', '/rename', 1);
		await context.client.waitForNotification(n =>
			isActionNotification(n, 'chat/turnComplete')
			&& (getActionEnvelope(n).action as { turnId: string }).turnId === 'turn-empty-rename',
		);
		await assertRecordedAhpSnapshot(this.test!, context.client);

		const after = await fetchSessionWithChat(context.client, sessionUri);
		assert.deepStrictEqual({
			titleBefore: before.title,
			titleAfter: after.title,
			responseText: getMarkdownResponseText(context.client),
		}, {
			titleBefore: before.title,
			titleAfter: before.title,
			responseText: '',
		});
	});

	// Successful bang-command completion depends on POSIX shell command
	// detection; Windows emits output but never reaches tool completion.
	hostOnlyTest(context, 'a bang command runs locally and exposes terminal output', async function () {

		const sessionUri = await createSession('bang-success');
		const chatUri = buildDefaultChatUri(sessionUri);

		context.client.clearReceived();
		context.client.beginAhpSnapshotRound();
		dispatchTurn(context.client, sessionUri, 'turn-bang-success', '!echo BANG_OUTPUT_42', 1);
		const toolComplete = await context.client.waitForNotification(n =>
			isActionNotification(n, 'chat/toolCallComplete')
			&& getActionEnvelope(n).channel === chatUri
			&& (getActionEnvelope(n).action as { turnId: string }).turnId === 'turn-bang-success',
			30_000,
		);
		await context.client.waitForNotification(n =>
			isActionNotification(n, 'chat/turnComplete')
			&& (getActionEnvelope(n).action as { turnId: string }).turnId === 'turn-bang-success',
			30_000,
		);
		await assertRecordedAhpSnapshot(this.test!, context.client, behaviorSnapshot);

		const result = (getActionEnvelope(toolComplete).action as { result: { success: boolean; content?: readonly ToolResultContent[] } }).result;
		const content = result.content ?? [];
		const terminalUri = terminalResourceFromContent(content);
		assert.ok(terminalUri, 'bang command should expose a terminal resource');
		const terminal = await context.client.call<SubscribeResult>('subscribe', { channel: terminalUri });
		const terminalState = terminal.snapshot!.state as TerminalState;
		const terminalContainsOutput = terminalState.content.some(part =>
			(part.type === 'command' ? part.output : part.value).includes('BANG_OUTPUT_42'));
		const ready = context.client.receivedNotifications(n => isActionNotification(n, 'chat/toolCallReady'))
			.map(n => getActionEnvelope(n).action as { turnId: string; confirmed?: string })
			.find(action => action.turnId === 'turn-bang-success');

		assert.deepStrictEqual({
			success: result.success,
			confirmation: ready?.confirmed,
			resultContainsOutput: textFromContent(content).includes('BANG_OUTPUT_42'),
			terminalContainsOutput,
		}, {
			success: true,
			confirmation: ToolCallConfirmationReason.NotNeeded,
			resultContainsOutput: true,
			terminalContainsOutput: true,
		});
	}, !isWindows);

	hostOnlyTest(context, 'a failing bang command reports its exit code', async function () {

		const sessionUri = await createSession('bang-failure');

		context.client.clearReceived();
		context.client.beginAhpSnapshotRound();
		dispatchTurn(context.client, sessionUri, 'turn-bang-failure', '!node -e "process.exit(7)"', 1);
		const toolComplete = await context.client.waitForNotification(n =>
			isActionNotification(n, 'chat/toolCallComplete')
			&& (getActionEnvelope(n).action as { turnId: string }).turnId === 'turn-bang-failure',
			30_000,
		);
		await context.client.waitForNotification(n =>
			isActionNotification(n, 'chat/turnComplete')
			&& (getActionEnvelope(n).action as { turnId: string }).turnId === 'turn-bang-failure',
			30_000,
		);
		await assertRecordedAhpSnapshot(this.test!, context.client, behaviorSnapshot);

		const result = (getActionEnvelope(toolComplete).action as { result: { success: boolean; pastTenseMessage?: string } }).result;
		const ready = context.client.receivedNotifications(n => isActionNotification(n, 'chat/toolCallReady'))
			.map(n => getActionEnvelope(n).action as { turnId: string; confirmed?: string })
			.find(action => action.turnId === 'turn-bang-failure');
		assert.deepStrictEqual({
			success: result.success,
			confirmation: ready?.confirmed,
			reportsExitCode: /(?:^|\D)7(?:\D|$)/.test(result.pastTenseMessage ?? ''),
		}, {
			success: false,
			confirmation: ToolCallConfirmationReason.NotNeeded,
			reportsExitCode: true,
		});
	});

	// Git-backed config discovery leaves this temporary repository locked on
	// Windows CI after the provider session is disposed.
	hostOnlyTest(context, 'session configuration resolves and completes git branches', async function () {

		const workspace = createWorkspace('ahp-config-completions-');
		execSync('git init', { cwd: workspace });
		execSync('git config user.name "Agent Host Test"', { cwd: workspace });
		execSync('git config user.email "agent-host-test@example.com"', { cwd: workspace });
		execSync('git commit --allow-empty -m "initial"', { cwd: workspace });
		execSync('git branch feature/coverage-target', { cwd: workspace });
		await createSession('config-completions', workspace);
		const workingDirectory = URI.file(workspace).toString();

		const resolved = await context.client.call<ResolveSessionConfigResult>('resolveSessionConfig', {
			channel: ROOT_STATE_URI,
			provider: config.provider,
			workingDirectory,
			config: { isolation: 'worktree' },
		});
		const completions = await context.client.call<SessionConfigCompletionsResult>('sessionConfigCompletions', {
			channel: ROOT_STATE_URI,
			provider: config.provider,
			workingDirectory,
			config: { isolation: 'worktree' },
			property: 'branch',
			query: 'coverage-target',
		});

		assert.deepStrictEqual({
			isolation: resolved.values.isolation,
			branchIsDynamic: resolved.schema.properties.branch.enumDynamic,
			completions: completions.items,
		}, {
			isolation: 'worktree',
			branchIsDynamic: true,
			completions: [{
				value: 'feature/coverage-target',
				label: 'feature/coverage-target',
			}],
		});
	}, !isWindows);
}
