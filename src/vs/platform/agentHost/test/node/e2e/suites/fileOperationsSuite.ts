/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { execSync } from 'child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from '../../../../../../base/common/path.js';
import { URI } from '../../../../../../base/common/uri.js';
import { CopilotCliConfigKey } from '../../../../common/copilotCliConfig.js';
import { SessionConfigKey } from '../../../../common/sessionConfigKeys.js';
import { buildDefaultChatUri, getInlineToolInput, ROOT_STATE_URI, ToolCallCancellationReason, ToolResultContentType, type ToolResultFileEditContent } from '../../../../common/state/sessionState.js';
import type { StringOrMarkdown } from '../../../../common/state/protocol/state.js';
import { ContentEncoding } from '../../../../common/state/protocol/common/commands.js';
import type { ResourceReadResult } from '../../../../common/state/protocol/commands.js';
import { ActionType, type ChatToolCallCompleteAction, type ChatToolCallDeltaAction, type ChatToolCallReadyAction, type ChatToolCallStartAction } from '../../../../common/state/sessionActions.js';
import { assertToolCallCompleteText, createRealSession, dispatchTurn, driveTurnToCompletion, getMarkdownResponseText, initTestGitRepo } from '../harness/agentHostE2ETestHarness.js';
import { assertRecordedAhpSnapshot } from '../harness/ahpSnapshot.js';
import { getActionEnvelope, isActionNotification } from '../../serverIntegrationTestHelpers.js';
import type { IAgentHostE2ETestContext } from './e2eTestContext.js';

function stringOrMarkdownText(value: StringOrMarkdown | undefined): string | undefined {
	return typeof value === 'string' ? value : value?.markdown;
}

const PREFER_FILE_TOOLS = ' Use your file tools; do not run a shell command.';

function fileReadToolNames(provider: string): readonly string[] {
	switch (provider) {
		case 'claude':
			return ['Read'];
		case 'copilotcli':
			return ['view'];
		default:
			return ['Read', 'view', 'shell'];
	}
}

function fileOperationPrompt(
	context: IAgentHostE2ETestContext,
	fileToolsPrompt: string,
	shellCommand: string,
	shellFollowup: string,
	strategy = context.config.fileOperationStrategy,
): string {
	if (strategy === 'fileTools') {
		return fileToolsPrompt;
	}
	return `Run exactly this shell command, with no modifications: \`${shellCommand}\`. ${shellFollowup}`;
}

function fileOperationTest(context: IAgentHostE2ETestContext, title: string, run: Mocha.AsyncFunc, providerEnabled = true): void {
	const enabled = providerEnabled && (context.config.fileOperationStrategy === 'fileTools' || context.portableShellToolReplayEnabled);
	(enabled ? test : test.skip)(title, run);
}

export function defineFileOperationsTests(context: IAgentHostE2ETestContext): void {
	const { config, createdSessions, tempDirs, portableShellToolReplayEnabled, isWindows } = context;
	const shellResultTextAvailable = !config.shellToolResultTextUnreliable;
	const shellOutputOracleAvailable = shellResultTextAvailable && !(isWindows && config.provider === 'copilotcli');
	const BEHAVIOR_SNAPSHOT = {
		profile: 'behavior',
		// Codex occasionally omits command completion; direct filesystem and response assertions are the success oracle.
		omitToolCallSuccessForToolNames: config.provider === 'codex' ? ['shell'] : [],
	} as const;

	if (config.streamingFileCreateToolName && config.provider !== 'codex') {
		test('declining a file creation tool prevents the mutation and completes the turn', async function () {
			this.timeout(180_000);
			const workspace = mkdtempSync(join(tmpdir(), 'ahp-decline-create-'));
			tempDirs.push(workspace);
			const sessionUri = await createRealSession(context.client, config, `decline-create-${config.provider}`, createdSessions, URI.file(workspace));
			const chatUri = buildDefaultChatUri(sessionUri);
			const turnId = 'turn-decline-create';
			dispatchTurn(
				context.client,
				sessionUri,
				turnId,
				'Create denied.lock containing exactly DENIED_CONTENT using your file creation tool. If permission is denied, reply exactly "denied".',
				1,
			);
			const started = await context.client.waitForNotification(n =>
				isActionNotification(n, 'chat/toolCallStart')
				&& getActionEnvelope(n).channel === chatUri
				&& (getActionEnvelope(n).action as ChatToolCallStartAction).turnId === turnId
				&& (getActionEnvelope(n).action as ChatToolCallStartAction).toolName === config.streamingFileCreateToolName,
				90_000,
			);
			const toolCallId = (getActionEnvelope(started).action as ChatToolCallStartAction).toolCallId;
			const readyNotification = await context.client.waitForNotification(n =>
				isActionNotification(n, 'chat/toolCallReady')
				&& getActionEnvelope(n).channel === chatUri
				&& (getActionEnvelope(n).action as ChatToolCallReadyAction).turnId === turnId
				&& (getActionEnvelope(n).action as ChatToolCallReadyAction).toolCallId === toolCallId,
				90_000,
			);
			const ready = getActionEnvelope(readyNotification).action as ChatToolCallReadyAction;
			const fileCreatedBeforeDenial = existsSync(join(workspace, 'denied.lock'));
			context.client.dispatch({
				channel: chatUri,
				clientSeq: 2,
				action: {
					type: ActionType.ChatToolCallConfirmed,
					turnId,
					toolCallId: ready.toolCallId,
					approved: false,
					reason: ToolCallCancellationReason.Denied,
				},
			});
			let lastReadyServerSeq = getActionEnvelope(readyNotification).serverSeq;
			let clientSeq = 3;
			while (true) {
				const notification = await context.client.waitForNotification(n => {
					if (getActionEnvelope(n).channel !== chatUri) {
						return false;
					}
					if (isActionNotification(n, 'chat/turnComplete')) {
						return (getActionEnvelope(n).action as { readonly turnId: string }).turnId === turnId;
					}
					if (!isActionNotification(n, 'chat/toolCallReady')) {
						return false;
					}
					const action = getActionEnvelope(n).action as ChatToolCallReadyAction;
					return action.turnId === turnId && getActionEnvelope(n).serverSeq > lastReadyServerSeq;
				}, 90_000);
				if (isActionNotification(notification, 'chat/turnComplete')) {
					break;
				}
				const repeatedReady = getActionEnvelope(notification).action as ChatToolCallReadyAction;
				lastReadyServerSeq = getActionEnvelope(notification).serverSeq;
				context.client.dispatch({
					channel: chatUri,
					clientSeq: clientSeq++,
					action: {
						type: ActionType.ChatToolCallConfirmed,
						turnId,
						toolCallId: repeatedReady.toolCallId,
						approved: false,
						reason: ToolCallCancellationReason.Denied,
					},
				});
			}
			const malformedPermissionErrors = context.client.receivedNotifications(n =>
				isActionNotification(n, 'chat/toolCallComplete')
				&& getActionEnvelope(n).channel === chatUri
				&& (getActionEnvelope(n).action as ChatToolCallCompleteAction).toolCallId === toolCallId
			).map(n => (getActionEnvelope(n).action as ChatToolCallCompleteAction).result.error?.message)
				.filter((message): message is string => typeof message === 'string' && message.includes('permission host returned malformed payload'));
			assert.deepStrictEqual({
				fileCreatedBeforeDenial,
				fileCreated: existsSync(join(workspace, 'denied.lock')),
				responseEndsWithDenied: getMarkdownResponseText(context.client).trim().endsWith('denied'),
				malformedPermissionErrors,
			}, {
				fileCreatedBeforeDenial: false,
				fileCreated: false,
				responseEndsWithDenied: true,
				malformedPermissionErrors: [],
			});
		});

		(config.supportsPausedTurnCancellationE2E ? test : test.skip)('cancelling a turn paused for file-tool approval allows a replacement turn', async function () {
			this.timeout(180_000);
			const workspace = mkdtempSync(join(tmpdir(), 'ahp-cancel-file-approval-'));
			tempDirs.push(workspace);
			const sessionUri = await createRealSession(context.client, config, `cancel-file-approval-${config.provider}`, createdSessions, URI.file(workspace));
			const chatUri = buildDefaultChatUri(sessionUri);
			const turnId = 'turn-cancel-file-approval';
			dispatchTurn(
				context.client,
				sessionUri,
				turnId,
				'Create cancelled.txt containing exactly CANCELLED_CONTENT using your file creation tool, then reply exactly "created".',
				1,
			);
			const started = await context.client.waitForNotification(n =>
				isActionNotification(n, 'chat/toolCallStart')
				&& getActionEnvelope(n).channel === chatUri
				&& (getActionEnvelope(n).action as ChatToolCallStartAction).turnId === turnId
				&& (getActionEnvelope(n).action as ChatToolCallStartAction).toolName === config.streamingFileCreateToolName,
				90_000,
			);
			const toolCallId = (getActionEnvelope(started).action as ChatToolCallStartAction).toolCallId;
			await context.client.waitForNotification(n =>
				isActionNotification(n, 'chat/toolCallReady')
				&& getActionEnvelope(n).channel === chatUri
				&& (getActionEnvelope(n).action as ChatToolCallReadyAction).turnId === turnId
				&& (getActionEnvelope(n).action as ChatToolCallReadyAction).toolCallId === toolCallId,
				90_000,
			);
			context.client.dispatch({
				channel: chatUri,
				clientSeq: 2,
				action: { type: ActionType.ChatTurnCancelled, turnId, duration: 0 },
			});
			await context.client.waitForNotification(n =>
				isActionNotification(n, 'chat/turnCancelled')
				&& getActionEnvelope(n).channel === chatUri
				&& (getActionEnvelope(n).action as { readonly turnId: string }).turnId === turnId,
				30_000,
			);
			const replacement = await driveTurnToCompletion(
				context.client,
				sessionUri,
				'turn-after-file-approval-cancel',
				'Reply exactly "replacement".',
				3,
			);

			assert.deepStrictEqual({
				fileExists: existsSync(join(workspace, 'cancelled.txt')),
				replacement: replacement.responseText.trim(),
			}, {
				fileExists: false,
				replacement: 'replacement',
			});
		});
	}

	if (config.provider === 'copilotcli') {
		test('auto-approve mode executes a file creation without prompting', async function () {
			this.timeout(180_000);
			const workspace = mkdtempSync(join(tmpdir(), 'ahp-auto-approve-create-'));
			tempDirs.push(workspace);
			const sessionUri = await createRealSession(context.client, config, 'auto-approve-create', createdSessions, URI.file(workspace));
			context.client.dispatch({
				channel: sessionUri,
				clientSeq: 1,
				action: {
					type: ActionType.SessionConfigChanged,
					config: { [SessionConfigKey.AutoApprove]: 'autoApprove' },
				},
			});
			await context.client.waitForNotification(n =>
				isActionNotification(n, 'session/configChanged') && getActionEnvelope(n).channel === sessionUri,
				30_000,
			);

			const result = await driveTurnToCompletion(
				context.client,
				sessionUri,
				'turn-auto-approve-create',
				'Create approved.txt containing exactly APPROVED_CONTENT using your file creation tool, then reply exactly "created".',
				2,
			);

			assert.deepStrictEqual({
				file: readFileSync(join(workspace, 'approved.txt'), 'utf8'),
				sawPendingConfirmation: result.sawPendingConfirmation,
				responseEndsWithCreated: result.responseText.trim().endsWith('created'),
			}, {
				file: 'APPROVED_CONTENT',
				sawPendingConfirmation: false,
				responseEndsWithCreated: true,
			});
		});

		(portableShellToolReplayEnabled && shellOutputOracleAvailable ? test : test.skip)('shell init script runs before the shell command', async function () {
			this.timeout(180_000);
			const workspace = mkdtempSync(join(tmpdir(), 'ahp-shell-init-'));
			tempDirs.push(workspace);
			const sessionUri = await createRealSession(context.client, config, 'shell-init-script', createdSessions, URI.file(workspace));
			// The host applies a published script only while the client's setting
			// is forwarded as root config. Set it before the recorded round so the
			// snapshot stays limited to the session config and the turn.
			await context.client.call('subscribe', { channel: ROOT_STATE_URI });
			context.client.dispatch({
				channel: ROOT_STATE_URI,
				clientSeq: 1,
				action: { type: ActionType.RootConfigChanged, config: { [CopilotCliConfigKey.EnableShellInitScript]: true } },
			});
			await context.client.waitForNotification(n =>
				isActionNotification(n, ActionType.RootConfigChanged)
				&& getActionEnvelope(n).channel === ROOT_STATE_URI
				&& (getActionEnvelope(n).action as { readonly config?: Record<string, unknown> }).config?.[CopilotCliConfigKey.EnableShellInitScript] === true,
				30_000,
			);
			// Leave the root channel so its later notifications stay out of the
			// recorded round, then drop the root exchange from the recorder.
			context.client.notify('unsubscribe', { channel: ROOT_STATE_URI });
			context.client.clearAhpSnapshot();
			// Session config carries script text; the host materializes the file
			// and registers it through the SDK's `shell.initScripts`. The first
			// turn is dispatched immediately afterward: dispatch is ordered per
			// connection and the host applies config before starting the turn,
			// so no server echo is awaited.
			context.client.beginAhpSnapshotRound();
			context.client.dispatch({
				channel: sessionUri,
				clientSeq: 1,
				action: {
					type: ActionType.SessionConfigChanged,
					config: { [SessionConfigKey.ShellInitScripts]: [{ shell: 'bash', script: 'export AHP_E2E_INIT_MARKER=init_marker_91\nbuiltin true\n' }] },
				},
			});

			// `node -e` keeps the recorded command platform-neutral; the marker can
			// only be present if the registered init script ran first.
			const markerCommand = `node -e "console.log('marker=' + process.env.AHP_E2E_INIT_MARKER)"`;
			const result = await driveTurnToCompletion(context.client, sessionUri, 'turn-shell-init', `Run exactly this shell command, with no modifications: \`${markerCommand}\`. Then reply with its exact output only.`, 2);
			assert.match(result.responseText, /marker=init_marker_91/);
			assertToolCallCompleteText(context.client, {
				channel: buildDefaultChatUri(sessionUri),
				turnId: 'turn-shell-init',
				toolNames: [config.shellToolName],
				workspace,
				expected: [/marker=init_marker_91/],
				success: true,
			});
			await assertRecordedAhpSnapshot(this.test!, context.client, BEHAVIOR_SNAPSHOT);
		});
	}

	fileOperationTest(context, 'reads an existing text file', async function () {
		this.timeout(180_000);
		const workspace = mkdtempSync(join(tmpdir(), 'ahp-coverage-read-'));
		tempDirs.push(workspace);
		writeFileSync(join(workspace, 'note.txt'), 'ALPHA BETA GAMMA');
		const sessionUri = await createRealSession(context.client, config, `coverage-read-${config.provider}`, createdSessions, URI.file(workspace));

		context.client.beginAhpSnapshotRound();
		const prompt = fileOperationPrompt(
			context,
			`Read note.txt and reply with its exact contents only.${config.provider === 'copilotcli' ? PREFER_FILE_TOOLS : ''}`,
			`node -e "process.stdout.write(require('fs').readFileSync('note.txt','utf8'))"`,
			'Then reply with its exact output only.',
		);
		const result = await driveTurnToCompletion(context.client, sessionUri, 'turn-read', prompt, 1);
		assert.match(result.responseText, /ALPHA BETA GAMMA/);
		assertToolCallCompleteText(context.client, {
			channel: buildDefaultChatUri(sessionUri),
			turnId: 'turn-read',
			toolNames: fileReadToolNames(config.provider),
			workspace,
			expected: [/ALPHA BETA GAMMA/],
			success: true,
		});
		await assertRecordedAhpSnapshot(this.test!, context.client, BEHAVIOR_SNAPSHOT);
	}, shellResultTextAvailable);

	fileOperationTest(context, 'reads a file from a nested directory', async function () {
		this.timeout(180_000);
		const workspace = mkdtempSync(join(tmpdir(), 'ahp-coverage-nested-read-'));
		tempDirs.push(workspace);
		mkdirSync(join(workspace, 'nested'));
		writeFileSync(join(workspace, 'nested', 'value.txt'), 'NESTED_VALUE_42');
		const sessionUri = await createRealSession(context.client, config, `coverage-nested-read-${config.provider}`, createdSessions, URI.file(workspace));

		context.client.beginAhpSnapshotRound();
		const prompt = fileOperationPrompt(
			context,
			`Read nested/value.txt and reply with its exact contents only.${PREFER_FILE_TOOLS}`,
			`node -e "process.stdout.write(require('fs').readFileSync('nested/value.txt','utf8'))"`,
			'Then reply with its exact output only.',
		);
		const result = await driveTurnToCompletion(context.client, sessionUri, 'turn-nested-read', prompt, 1);
		assert.match(result.responseText, /NESTED_VALUE_42/);
		assertToolCallCompleteText(context.client, {
			channel: buildDefaultChatUri(sessionUri),
			turnId: 'turn-nested-read',
			toolNames: fileReadToolNames(config.provider),
			workspace,
			expected: [/NESTED_VALUE_42/],
			success: true,
		});
		await assertRecordedAhpSnapshot(this.test!, context.client, BEHAVIOR_SNAPSHOT);
	}, shellResultTextAvailable);

	(portableShellToolReplayEnabled && shellOutputOracleAvailable ? test : test.skip)('lists workspace entries', async function () {
		this.timeout(180_000);
		const workspace = mkdtempSync(join(tmpdir(), 'ahp-coverage-list-'));
		tempDirs.push(workspace);
		writeFileSync(join(workspace, 'first.txt'), 'first');
		writeFileSync(join(workspace, 'second.md'), 'second');
		const sessionUri = await createRealSession(context.client, config, `coverage-list-${config.provider}`, createdSessions, URI.file(workspace));

		context.client.beginAhpSnapshotRound();
		// Pinned rather than steered: Copilot honors the file-tool hint here but
		// Claude still runs `ls`, and its flags differ under cmd. Pinning keeps
		// the two providers on one portable capture.
		const listCommand = `node -e "console.log(require('fs').readdirSync('.').join(' '))"`;
		const result = await driveTurnToCompletion(context.client, sessionUri, 'turn-list', `Run exactly this shell command, with no modifications: \`${listCommand}\`. Then reply with the filenames it printed and nothing else.`, 1);
		assert.match(result.responseText, /first\.txt/);
		assert.match(result.responseText, /second\.md/);
		assertToolCallCompleteText(context.client, {
			channel: buildDefaultChatUri(sessionUri),
			turnId: 'turn-list',
			toolNames: [config.shellToolName],
			workspace,
			expected: [/first\.txt second\.md/],
			success: true,
		});
		await assertRecordedAhpSnapshot(this.test!, context.client, BEHAVIOR_SNAPSHOT);
	});

	(config.streamingFileCreateToolName ? test : test.skip)('streams rich file creation progress without exposing partial input', async function () {
		this.timeout(180_000);
		const workspace = mkdtempSync(join(tmpdir(), 'ahp-streaming-create-'));
		tempDirs.push(workspace);
		const sessionUri = await createRealSession(context.client, config, `streaming-create-${config.provider}`, createdSessions, URI.file(workspace));
		const turnId = 'turn-streaming-create';
		const expectedContent = 'STREAM_ALPHA\nSTREAM_BETA\nSTREAM_GAMMA';

		await driveTurnToCompletion(context.client, sessionUri, turnId, `Create streaming.txt containing exactly these three lines, with no other content:
STREAM_ALPHA
STREAM_BETA
STREAM_GAMMA
Use your file creation tool; do not run a shell command. Then reply exactly "done".`, 1);

		const start = context.client.receivedNotifications(n => isActionNotification(n, 'chat/toolCallStart'))
			.map(n => ({ envelope: getActionEnvelope(n), action: getActionEnvelope(n).action as ChatToolCallStartAction }))
			.find(({ envelope, action }) => envelope.channel === buildDefaultChatUri(sessionUri) && action.turnId === turnId && action.toolName === config.streamingFileCreateToolName)?.action;
		const chatUri = buildDefaultChatUri(sessionUri);
		const deltas = start ? context.client.receivedNotifications(n => isActionNotification(n, 'chat/toolCallDelta'))
			.map(n => ({ envelope: getActionEnvelope(n), action: getActionEnvelope(n).action as ChatToolCallDeltaAction }))
			.filter(({ envelope, action }) => envelope.channel === chatUri && action.turnId === turnId && action.toolCallId === start.toolCallId)
			.map(({ action }) => action) : [];
		const ready = start ? context.client.receivedNotifications(n => isActionNotification(n, 'chat/toolCallReady'))
			.map(n => ({ envelope: getActionEnvelope(n), action: getActionEnvelope(n).action as ChatToolCallReadyAction }))
			.filter(({ envelope, action }) => envelope.channel === chatUri && action.turnId === turnId && action.toolCallId === start.toolCallId)
			.map(({ action }) => action) : [];
		const progressMessages = deltas.map(delta => stringOrMarkdownText(delta.invocationMessage));
		const fileContent = readFileSync(join(workspace, 'streaming.txt'), 'utf8');
		const normalizedFileContent = fileContent.replaceAll('\r\n', '\n').replaceAll('\r', '\n');
		const lineCount = fileContent.split(/\r\n|\r|\n/).length;
		const readyInputs = ready.map(action => getInlineToolInput(action.toolInput)).filter(input => input !== undefined);

		assert.deepStrictEqual({
			fileContent: normalizedFileContent.trimEnd(),
			hasProgress: deltas.length > 0,
			hidesPartialInput: deltas.every(delta => delta.content === ''),
			showsFile: progressMessages.some(message => message?.includes('streaming.txt')),
			showsLineCount: progressMessages.some(message => message?.includes(`(${lineCount} lines)`)),
			readyHasFinalInput: readyInputs.some(input => ['STREAM_ALPHA', 'STREAM_BETA', 'STREAM_GAMMA'].every(value => input.includes(value))),
		}, {
			fileContent: expectedContent,
			hasProgress: true,
			hidesPartialInput: true,
			showsFile: true,
			showsLineCount: true,
			readyHasFinalInput: true,
		});
	});

	fileOperationTest(context, 'reads a value from JSON', async function () {
		this.timeout(180_000);
		const workspace = mkdtempSync(join(tmpdir(), 'ahp-coverage-json-'));
		tempDirs.push(workspace);
		writeFileSync(join(workspace, 'config.json'), JSON.stringify({ answer: 42 }));
		const sessionUri = await createRealSession(context.client, config, `coverage-json-${config.provider}`, createdSessions, URI.file(workspace));

		context.client.beginAhpSnapshotRound();
		const prompt = fileOperationPrompt(
			context,
			`Read config.json and reply with the numeric value of "answer" only.${config.provider === 'copilotcli' ? PREFER_FILE_TOOLS : ''}`,
			`node -e "console.log(JSON.parse(require('fs').readFileSync('config.json','utf8')).answer)"`,
			'Then reply with its exact output only.',
		);
		const result = await driveTurnToCompletion(context.client, sessionUri, 'turn-json', prompt, 1);
		assert.match(result.responseText, /\b42\b/);
		assertToolCallCompleteText(context.client, {
			channel: buildDefaultChatUri(sessionUri),
			turnId: 'turn-json',
			toolNames: fileReadToolNames(config.provider),
			workspace,
			expected: config.fileOperationStrategy === 'shell' ? [/\b42\b/] : [/"answer":\s*42|answer[^\n]*42/],
			success: true,
		});
		await assertRecordedAhpSnapshot(this.test!, context.client, BEHAVIOR_SNAPSHOT);
	}, shellResultTextAvailable);

	fileOperationTest(context, 'counts lines in a file', async function () {
		this.timeout(180_000);
		const workspace = mkdtempSync(join(tmpdir(), 'ahp-coverage-lines-'));
		tempDirs.push(workspace);
		// No trailing newline: with one, "how many lines" is genuinely ambiguous
		// (four content lines, or five fields when splitting on the separator).
		// `wc -l` resolved that by counting separators; an agent reading the file
		// reasonably answers either way, so remove the ambiguity from the input.
		writeFileSync(join(workspace, 'lines.txt'), 'one\ntwo\nthree\nfour');
		const sessionUri = await createRealSession(context.client, config, `coverage-lines-${config.provider}`, createdSessions, URI.file(workspace));

		context.client.beginAhpSnapshotRound();
		const prompt = fileOperationPrompt(
			context,
			`Count the lines in lines.txt and reply with the number only.${PREFER_FILE_TOOLS}`,
			`node -e "console.log(require('fs').readFileSync('lines.txt','utf8').split(/\\r?\\n/).length)"`,
			'Then reply with its exact output only.',
		);
		const result = await driveTurnToCompletion(context.client, sessionUri, 'turn-lines', prompt, 1);
		assert.match(result.responseText, /\b4\b/);
		assertToolCallCompleteText(context.client, {
			channel: buildDefaultChatUri(sessionUri),
			turnId: 'turn-lines',
			toolNames: fileReadToolNames(config.provider),
			workspace,
			expected: config.fileOperationStrategy === 'shell' ? [/\b4\b/] : [/one/, /two/, /three/, /four/],
			success: true,
		});
		await assertRecordedAhpSnapshot(this.test!, context.client, BEHAVIOR_SNAPSHOT);
	}, shellResultTextAvailable);

	fileOperationTest(context, 'handles a missing file without a session error', async function () {
		this.timeout(180_000);
		const workspace = mkdtempSync(join(tmpdir(), 'ahp-coverage-missing-'));
		tempDirs.push(workspace);
		const sessionUri = await createRealSession(context.client, config, `coverage-missing-${config.provider}`, createdSessions, URI.file(workspace));

		context.client.beginAhpSnapshotRound();
		const prompt = fileOperationPrompt(
			context,
			`Try to read missing.txt. If it does not exist, reply exactly "missing".${PREFER_FILE_TOOLS}`,
			`node -e "console.log(require('fs').existsSync('missing.txt')?'present':'missing')"`,
			'Then reply with its exact output only.',
		);
		const result = await driveTurnToCompletion(context.client, sessionUri, 'turn-missing', prompt, 1);
		assert.match(result.responseText, /missing/i);
		assertToolCallCompleteText(context.client, {
			channel: buildDefaultChatUri(sessionUri),
			turnId: 'turn-missing',
			toolNames: fileReadToolNames(config.provider),
			workspace,
			expected: config.fileOperationStrategy === 'shell' ? [/missing/] : [/does not exist/],
			success: config.fileOperationStrategy === 'shell',
		});
		await assertRecordedAhpSnapshot(this.test!, context.client, BEHAVIOR_SNAPSHOT);
	}, shellResultTextAvailable);

	fileOperationTest(context, 'creates a new text file', async function () {
		this.timeout(180_000);
		const workspace = mkdtempSync(join(tmpdir(), 'ahp-coverage-create-'));
		tempDirs.push(workspace);
		const sessionUri = await createRealSession(context.client, config, `coverage-create-${config.provider}`, createdSessions, URI.file(workspace));

		context.client.beginAhpSnapshotRound();
		const prompt = fileOperationPrompt(
			context,
			'Create result.txt containing exactly CREATED_VALUE.',
			`node -e "require('fs').writeFileSync('result.txt','CREATED_VALUE')"`,
			'Then reply exactly "done".',
			// Copilot does not consistently emit completion for its native create tool.
			config.provider === 'copilotcli' ? 'shell' : config.fileOperationStrategy,
		);
		await driveTurnToCompletion(context.client, sessionUri, 'turn-create', prompt, 1);
		assert.strictEqual(readFileSync(join(workspace, 'result.txt'), 'utf8'), 'CREATED_VALUE');
		await assertRecordedAhpSnapshot(this.test!, context.client, BEHAVIOR_SNAPSHOT);
	});

	fileOperationTest(context, 'edits an existing text file', async function () {
		this.timeout(180_000);
		const workspace = mkdtempSync(join(tmpdir(), 'ahp-coverage-edit-'));
		tempDirs.push(workspace);
		writeFileSync(join(workspace, 'edit.txt'), 'BEFORE_VALUE');
		const sessionUri = await createRealSession(context.client, config, `coverage-edit-${config.provider}`, createdSessions, URI.file(workspace));

		context.client.beginAhpSnapshotRound();
		const prompt = fileOperationPrompt(
			context,
			`Replace the complete contents of edit.txt with exactly AFTER_VALUE and no trailing newline.${PREFER_FILE_TOOLS}`,
			`node -e "require('fs').writeFileSync('edit.txt','AFTER_VALUE')"`,
			'Then reply exactly "done".',
			// Copilot searches with a POSIX-only shell command despite the file-tool instruction.
			config.provider === 'copilotcli' ? 'shell' : config.fileOperationStrategy,
		);
		await driveTurnToCompletion(context.client, sessionUri, 'turn-edit', prompt, 1);
		assert.strictEqual(readFileSync(join(workspace, 'edit.txt'), 'utf8'), 'AFTER_VALUE');
		await assertRecordedAhpSnapshot(this.test!, context.client, BEHAVIOR_SNAPSHOT);
	});

	if (config.provider === 'claude' || config.provider === 'copilotcli') {
		test('file edit before and after content can be read from session storage', async function () {
			this.timeout(180_000);
			const workspace = mkdtempSync(join(tmpdir(), 'ahp-session-db-file-edit-'));
			tempDirs.push(workspace);
			writeFileSync(join(workspace, 'stored-edit.txt'), 'BEFORE_STORED_VALUE');
			const sessionUri = await createRealSession(context.client, config, 'session-db-file-edit', createdSessions, URI.file(workspace));
			const turnId = 'turn-session-db-file-edit';

			await driveTurnToCompletion(
				context.client,
				sessionUri,
				turnId,
				config.provider === 'copilotcli'
					? `Use edit exactly once to replace BEFORE_STORED_VALUE with AFTER_STORED_VALUE in ${join(workspace, 'stored-edit.txt')}. Do not inspect or search for the file and do not run a shell command. Then reply exactly "done".`
					: 'Replace the complete contents of stored-edit.txt with AFTER_STORED_VALUE using your file edit tool; do not run a shell command. Then reply exactly "done".',
				1,
			);
			const edit = context.client.receivedNotifications(n =>
				isActionNotification(n, 'chat/toolCallComplete')
				&& getActionEnvelope(n).channel === buildDefaultChatUri(sessionUri)
				&& (getActionEnvelope(n).action as ChatToolCallCompleteAction).turnId === turnId,
			).flatMap(n => (getActionEnvelope(n).action as ChatToolCallCompleteAction).result.content ?? [])
				.find((content): content is ToolResultFileEditContent => content.type === ToolResultContentType.FileEdit);
			assert.ok(edit?.before?.content.uri);
			assert.ok(edit.after?.content.uri);

			const [before, after] = await Promise.all([
				context.client.call<ResourceReadResult>('resourceRead', {
					channel: ROOT_STATE_URI,
					uri: edit.before.content.uri,
					encoding: ContentEncoding.Utf8,
				}),
				context.client.call<ResourceReadResult>('resourceRead', {
					channel: ROOT_STATE_URI,
					uri: edit.after.content.uri,
					encoding: ContentEncoding.Utf8,
				}),
			]);

			assert.deepStrictEqual({
				before: before.data,
				after: after.data,
			}, {
				before: 'BEFORE_STORED_VALUE',
				after: 'AFTER_STORED_VALUE',
			});
		});
	}

	(portableShellToolReplayEnabled ? test : test.skip)('creates a file in a new nested directory', async function () {
		this.timeout(180_000);
		const workspace = mkdtempSync(join(tmpdir(), 'ahp-coverage-nested-create-'));
		tempDirs.push(workspace);
		const sessionUri = await createRealSession(context.client, config, `coverage-nested-create-${config.provider}`, createdSessions, URI.file(workspace));

		context.client.beginAhpSnapshotRound();
		// Pinned rather than steered: creating the parent directory has no file
		// tool, so the provider always reaches for the shell and picks `mkdir -p`,
		// whose `-p` is a directory name rather than a flag under cmd. Steering
		// harder made it skip the creation entirely.
		const nestedCreateCommand = `node -e "const fs=require('fs');fs.mkdirSync('output',{recursive:true});fs.writeFileSync('output/report.txt','NESTED_CREATED')"`;
		await driveTurnToCompletion(context.client, sessionUri, 'turn-nested-create', `Run exactly this shell command, with no modifications: \`${nestedCreateCommand}\`. Then reply with exactly "created".`, 1);
		assert.strictEqual(readFileSync(join(workspace, 'output', 'report.txt'), 'utf8'), 'NESTED_CREATED');
		await assertRecordedAhpSnapshot(this.test!, context.client, BEHAVIOR_SNAPSHOT);
	});

	(portableShellToolReplayEnabled ? test : test.skip)('renames a workspace file', async function () {
		this.timeout(180_000);
		const workspace = mkdtempSync(join(tmpdir(), 'ahp-coverage-rename-'));
		tempDirs.push(workspace);
		writeFileSync(join(workspace, 'before.txt'), 'RENAME_VALUE');
		const sessionUri = await createRealSession(context.client, config, `coverage-rename-${config.provider}`, createdSessions, URI.file(workspace));

		context.client.beginAhpSnapshotRound();
		// Pinned rather than steered: there is no file tool for a rename, so the
		// provider always reaches for the shell here and picks a POSIX command
		// (`mv`, and once `xxd`/`rm`). `node` is guaranteed present since the
		// suite runs under it, and this quoting works in both cmd and POSIX shells.
		const renameCommand = `node -e "require('fs').renameSync('before.txt','after.txt')"`;
		await driveTurnToCompletion(context.client, sessionUri, 'turn-rename', `Run exactly this shell command, with no modifications: \`${renameCommand}\`. Do not run any other command or tool. Then reply with exactly "renamed".`, 1);
		assert.strictEqual(existsSync(join(workspace, 'before.txt')), false);
		assert.strictEqual(readFileSync(join(workspace, 'after.txt'), 'utf8'), 'RENAME_VALUE');
		await assertRecordedAhpSnapshot(this.test!, context.client, BEHAVIOR_SNAPSHOT);
	});

	(portableShellToolReplayEnabled ? test : test.skip)('deletes a workspace file', async function () {
		this.timeout(180_000);
		const workspace = mkdtempSync(join(tmpdir(), 'ahp-coverage-delete-'));
		tempDirs.push(workspace);
		writeFileSync(join(workspace, 'delete-me.txt'), 'DELETE_VALUE');
		const sessionUri = await createRealSession(context.client, config, `coverage-delete-${config.provider}`, createdSessions, URI.file(workspace));

		context.client.beginAhpSnapshotRound();
		// Pinned rather than steered: there is no file tool for a delete, so the
		// provider reaches for `rm`, which cmd does not have.
		const deleteCommand = `node -e "require('fs').unlinkSync('delete-me.txt')"`;
		await driveTurnToCompletion(context.client, sessionUri, 'turn-delete', `Run exactly this shell command, with no modifications: \`${deleteCommand}\`. Do not run any other command or tool. Then reply with exactly "deleted".`, 1);
		assert.strictEqual(existsSync(join(workspace, 'delete-me.txt')), false);
		await assertRecordedAhpSnapshot(this.test!, context.client, BEHAVIOR_SNAPSHOT);
	});

	(portableShellToolReplayEnabled && shellOutputOracleAvailable ? test : test.skip)('runs a deterministic shell command', async function () {
		this.timeout(180_000);
		const workspace = mkdtempSync(join(tmpdir(), 'ahp-coverage-shell-'));
		tempDirs.push(workspace);
		const sessionUri = await createRealSession(context.client, config, `coverage-shell-${config.provider}`, createdSessions, URI.file(workspace));

		context.client.beginAhpSnapshotRound();
		// The command is pinned rather than described so the recorded capture is
		// platform-neutral: `echo` behaves the same under cmd/PowerShell and
		// POSIX shells. Left to its own devices the model picks a different
		// command per provider (Copilot chose `echo`, Claude chose `printf`),
		// and whichever it picks is frozen into the fixture.
		const result = await driveTurnToCompletion(context.client, sessionUri, 'turn-shell', 'Run exactly this shell command, with no modifications: `echo SHELL_VALUE_73`. Then reply with that exact value only.', 1);
		assert.match(result.responseText, /SHELL_VALUE_73/);
		assertToolCallCompleteText(context.client, {
			channel: buildDefaultChatUri(sessionUri),
			turnId: 'turn-shell',
			toolNames: [config.shellToolName],
			workspace,
			expected: [/SHELL_VALUE_73/],
			success: true,
		});
		await assertRecordedAhpSnapshot(this.test!, context.client, BEHAVIOR_SNAPSHOT);
	});

	(portableShellToolReplayEnabled && shellOutputOracleAvailable ? test : test.skip)('inspects git status', async function () {
		this.timeout(180_000);
		const workspace = mkdtempSync(join(tmpdir(), 'ahp-coverage-git-'));
		tempDirs.push(workspace);
		initTestGitRepo(workspace);
		writeFileSync(join(workspace, 'tracked.txt'), 'initial');
		execSync('git add tracked.txt && git commit -m "initial"', { cwd: workspace });
		writeFileSync(join(workspace, 'tracked.txt'), 'modified');
		writeFileSync(join(workspace, 'untracked.txt'), 'new');
		const sessionUri = await createRealSession(context.client, config, `coverage-git-${config.provider}`, createdSessions, URI.file(workspace));

		context.client.beginAhpSnapshotRound();
		const result = await driveTurnToCompletion(context.client, sessionUri, 'turn-git', 'Inspect git status. Reply with the names of the modified and untracked files only.', 1);
		assert.match(result.responseText, /tracked\.txt/);
		assert.match(result.responseText, /untracked\.txt/);
		assertToolCallCompleteText(context.client, {
			channel: buildDefaultChatUri(sessionUri),
			turnId: 'turn-git',
			toolNames: [config.shellToolName],
			workspace,
			expected: [/M tracked\.txt/, /\?\? untracked\.txt/],
			success: true,
		});
		await assertRecordedAhpSnapshot(this.test!, context.client, BEHAVIOR_SNAPSHOT);
	});

	fileOperationTest(context, 'reads a filename containing spaces', async function () {
		this.timeout(180_000);
		const workspace = mkdtempSync(join(tmpdir(), 'ahp-coverage-spaces-'));
		tempDirs.push(workspace);
		writeFileSync(join(workspace, 'file with spaces.txt'), 'SPACED_VALUE');
		const sessionUri = await createRealSession(context.client, config, `coverage-spaces-${config.provider}`, createdSessions, URI.file(workspace));

		context.client.beginAhpSnapshotRound();
		const shellCommand = `node -e "process.stdout.write(require('fs').readFileSync('file with spaces.txt','utf8'))"`;
		const prompt = fileOperationPrompt(
			context,
			'Read "file with spaces.txt" and reply with its exact contents only.',
			shellCommand,
			'Then reply with its exact output only.',
		);
		const result = await driveTurnToCompletion(context.client, sessionUri, 'turn-spaces', prompt, 1);
		assert.match(result.responseText, /SPACED_VALUE/);
		if (config.fileOperationStrategy === 'shell') {
			const chatUri = buildDefaultChatUri(sessionUri);
			const start = context.client.receivedNotifications(n => isActionNotification(n, 'chat/toolCallStart'))
				.map(n => ({ envelope: getActionEnvelope(n), action: getActionEnvelope(n).action as ChatToolCallStartAction }))
				.find(({ envelope, action }) => envelope.channel === chatUri && action.turnId === 'turn-spaces' && action.toolName === config.shellToolName)?.action;
			const ready = start && context.client.receivedNotifications(n => isActionNotification(n, 'chat/toolCallReady'))
				.map(n => ({ envelope: getActionEnvelope(n), action: getActionEnvelope(n).action as ChatToolCallReadyAction }))
				.find(({ envelope, action }) => envelope.channel === chatUri && action.turnId === 'turn-spaces' && action.toolCallId === start.toolCallId)?.action;
			const completed = ready && context.client.receivedNotifications(n => isActionNotification(n, 'chat/toolCallComplete'))
				.map(n => ({ envelope: getActionEnvelope(n), action: getActionEnvelope(n).action as ChatToolCallCompleteAction }))
				.some(({ envelope, action }) => envelope.channel === chatUri && action.turnId === 'turn-spaces' && action.toolCallId === ready.toolCallId);
			const toolInput = getInlineToolInput(ready?.toolInput);
			assert.deepStrictEqual({
				readsFile: toolInput?.includes('readFileSync') && toolInput.includes('file with spaces.txt'),
				completed,
			}, {
				readsFile: true,
				completed: true,
			});
		} else {
			assertToolCallCompleteText(context.client, {
				channel: buildDefaultChatUri(sessionUri),
				turnId: 'turn-spaces',
				toolNames: fileReadToolNames(config.provider),
				workspace,
				expected: [/SPACED_VALUE/],
				success: true,
			});
		}
		await assertRecordedAhpSnapshot(this.test!, context.client, BEHAVIOR_SNAPSHOT);
	});
}
