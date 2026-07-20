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
import { createRealSession, driveTurnToCompletion } from '../harness/agentHostE2ETestHarness.js';
import { assertRecordedAhpSnapshot } from '../harness/ahpSnapshot.js';
import type { IAgentHostE2ETestContext } from './e2eTestContext.js';

export function defineFileOperationsTests(context: IAgentHostE2ETestContext): void {
	const { config, createdSessions, tempDirs, shellToolReplayEnabled, stableNewScenarioResponse } = context;
	const BEHAVIOR_SNAPSHOT = { profile: 'behavior' } as const;
	// Expected to pass, but Copilot never completed this turn during recording and Codex duplicates its response.
	(stableNewScenarioResponse && config.provider === 'claude' ? test : test.skip)('reads an existing text file', async function () {
		this.timeout(180_000);
		const workspace = mkdtempSync(join(tmpdir(), 'ahp-coverage-read-'));
		tempDirs.push(workspace);
		writeFileSync(join(workspace, 'note.txt'), 'ALPHA BETA GAMMA');
		const sessionUri = await createRealSession(context.client, config, `coverage-read-${config.provider}`, createdSessions, URI.file(workspace));

		context.client.beginAhpSnapshotRound();
		const result = await driveTurnToCompletion(context.client, sessionUri, 'turn-read', 'Read note.txt and reply with its exact contents only.', 1);
		assert.match(result.responseText, /ALPHA BETA GAMMA/);
		await assertRecordedAhpSnapshot(this.test!, context.client, BEHAVIOR_SNAPSHOT);
	});

	(stableNewScenarioResponse && (config.provider !== 'copilotcli' || shellToolReplayEnabled) ? test : test.skip)('reads a file from a nested directory', async function () {
		this.timeout(180_000);
		const workspace = mkdtempSync(join(tmpdir(), 'ahp-coverage-nested-read-'));
		tempDirs.push(workspace);
		mkdirSync(join(workspace, 'nested'));
		writeFileSync(join(workspace, 'nested', 'value.txt'), 'NESTED_VALUE_42');
		const sessionUri = await createRealSession(context.client, config, `coverage-nested-read-${config.provider}`, createdSessions, URI.file(workspace));

		context.client.beginAhpSnapshotRound();
		const result = await driveTurnToCompletion(context.client, sessionUri, 'turn-nested-read', 'Read nested/value.txt and reply with its exact contents only.', 1);
		assert.match(result.responseText, /NESTED_VALUE_42/);
		await assertRecordedAhpSnapshot(this.test!, context.client, BEHAVIOR_SNAPSHOT);
	});

	(stableNewScenarioResponse && shellToolReplayEnabled ? test : test.skip)('lists workspace entries', async function () {
		this.timeout(180_000);
		const workspace = mkdtempSync(join(tmpdir(), 'ahp-coverage-list-'));
		tempDirs.push(workspace);
		writeFileSync(join(workspace, 'first.txt'), 'first');
		writeFileSync(join(workspace, 'second.md'), 'second');
		const sessionUri = await createRealSession(context.client, config, `coverage-list-${config.provider}`, createdSessions, URI.file(workspace));

		context.client.beginAhpSnapshotRound();
		const result = await driveTurnToCompletion(context.client, sessionUri, 'turn-list', 'List the files in the current working directory. Reply with the filenames only.', 1);
		assert.match(result.responseText, /first\.txt/);
		assert.match(result.responseText, /second\.md/);
		await assertRecordedAhpSnapshot(this.test!, context.client, BEHAVIOR_SNAPSHOT);
	});

	// Codex does not honor the exact-response contract on replay; Copilot never completes the replayed turn.
	(stableNewScenarioResponse && config.provider === 'claude' ? test : test.skip)('reads a value from JSON', async function () {
		this.timeout(180_000);
		const workspace = mkdtempSync(join(tmpdir(), 'ahp-coverage-json-'));
		tempDirs.push(workspace);
		writeFileSync(join(workspace, 'config.json'), JSON.stringify({ answer: 42 }));
		const sessionUri = await createRealSession(context.client, config, `coverage-json-${config.provider}`, createdSessions, URI.file(workspace));

		context.client.beginAhpSnapshotRound();
		const result = await driveTurnToCompletion(context.client, sessionUri, 'turn-json', 'Read config.json and reply with the numeric value of "answer" only.', 1);
		assert.match(result.responseText, /\b42\b/);
		await assertRecordedAhpSnapshot(this.test!, context.client, BEHAVIOR_SNAPSHOT);
	});

	// Codex duplicates its response.
	(stableNewScenarioResponse && shellToolReplayEnabled ? test : test.skip)('counts lines in a file', async function () {
		this.timeout(180_000);
		const workspace = mkdtempSync(join(tmpdir(), 'ahp-coverage-lines-'));
		tempDirs.push(workspace);
		writeFileSync(join(workspace, 'lines.txt'), 'one\ntwo\nthree\nfour\n');
		const sessionUri = await createRealSession(context.client, config, `coverage-lines-${config.provider}`, createdSessions, URI.file(workspace));

		context.client.beginAhpSnapshotRound();
		const result = await driveTurnToCompletion(context.client, sessionUri, 'turn-lines', 'Count the lines in lines.txt and reply with the number only.', 1);
		assert.match(result.responseText, /\b4\b/);
		await assertRecordedAhpSnapshot(this.test!, context.client, BEHAVIOR_SNAPSHOT);
	});

	(stableNewScenarioResponse && (config.provider !== 'copilotcli' || shellToolReplayEnabled) ? test : test.skip)('handles a missing file without a session error', async function () {
		this.timeout(180_000);
		const workspace = mkdtempSync(join(tmpdir(), 'ahp-coverage-missing-'));
		tempDirs.push(workspace);
		const sessionUri = await createRealSession(context.client, config, `coverage-missing-${config.provider}`, createdSessions, URI.file(workspace));

		context.client.beginAhpSnapshotRound();
		const result = await driveTurnToCompletion(context.client, sessionUri, 'turn-missing', 'Try to read missing.txt. If it does not exist, reply exactly "missing".', 1);
		assert.match(result.responseText, /missing/i);
		await assertRecordedAhpSnapshot(this.test!, context.client, BEHAVIOR_SNAPSHOT);
	});

	// Copilot does not consistently emit tool completion for this scenario.
	(stableNewScenarioResponse && config.provider !== 'copilotcli' ? test : test.skip)('creates a new text file', async function () {
		this.timeout(180_000);
		const workspace = mkdtempSync(join(tmpdir(), 'ahp-coverage-create-'));
		tempDirs.push(workspace);
		const sessionUri = await createRealSession(context.client, config, `coverage-create-${config.provider}`, createdSessions, URI.file(workspace));

		context.client.beginAhpSnapshotRound();
		await driveTurnToCompletion(context.client, sessionUri, 'turn-create', 'Create result.txt containing exactly CREATED_VALUE.', 1);
		assert.strictEqual(readFileSync(join(workspace, 'result.txt'), 'utf8'), 'CREATED_VALUE');
		await assertRecordedAhpSnapshot(this.test!, context.client, BEHAVIOR_SNAPSHOT);
	});

	// Copilot never completes this turn.
	(stableNewScenarioResponse && config.provider === 'claude' && shellToolReplayEnabled ? test : test.skip)('edits an existing text file', async function () {
		this.timeout(180_000);
		const workspace = mkdtempSync(join(tmpdir(), 'ahp-coverage-edit-'));
		tempDirs.push(workspace);
		writeFileSync(join(workspace, 'edit.txt'), 'BEFORE_VALUE');
		const sessionUri = await createRealSession(context.client, config, `coverage-edit-${config.provider}`, createdSessions, URI.file(workspace));

		context.client.beginAhpSnapshotRound();
		await driveTurnToCompletion(context.client, sessionUri, 'turn-edit', 'Replace the complete contents of edit.txt with AFTER_VALUE.', 1);
		assert.strictEqual(readFileSync(join(workspace, 'edit.txt'), 'utf8'), 'AFTER_VALUE');
		await assertRecordedAhpSnapshot(this.test!, context.client, BEHAVIOR_SNAPSHOT);
	});

	// Copilot's fixture uses a POSIX shell.
	(stableNewScenarioResponse && (config.provider !== 'copilotcli' || shellToolReplayEnabled) ? test : test.skip)('creates a file in a new nested directory', async function () {
		this.timeout(180_000);
		const workspace = mkdtempSync(join(tmpdir(), 'ahp-coverage-nested-create-'));
		tempDirs.push(workspace);
		const sessionUri = await createRealSession(context.client, config, `coverage-nested-create-${config.provider}`, createdSessions, URI.file(workspace));

		context.client.beginAhpSnapshotRound();
		await driveTurnToCompletion(context.client, sessionUri, 'turn-nested-create', 'Create output/report.txt containing exactly NESTED_CREATED.', 1);
		assert.strictEqual(readFileSync(join(workspace, 'output', 'report.txt'), 'utf8'), 'NESTED_CREATED');
		await assertRecordedAhpSnapshot(this.test!, context.client, BEHAVIOR_SNAPSHOT);
	});

	(stableNewScenarioResponse && shellToolReplayEnabled ? test : test.skip)('renames a workspace file', async function () {
		this.timeout(180_000);
		const workspace = mkdtempSync(join(tmpdir(), 'ahp-coverage-rename-'));
		tempDirs.push(workspace);
		writeFileSync(join(workspace, 'before.txt'), 'RENAME_VALUE');
		const sessionUri = await createRealSession(context.client, config, `coverage-rename-${config.provider}`, createdSessions, URI.file(workspace));

		context.client.beginAhpSnapshotRound();
		await driveTurnToCompletion(context.client, sessionUri, 'turn-rename', 'Rename before.txt to after.txt without changing its contents.', 1);
		assert.strictEqual(existsSync(join(workspace, 'before.txt')), false);
		assert.strictEqual(readFileSync(join(workspace, 'after.txt'), 'utf8'), 'RENAME_VALUE');
		await assertRecordedAhpSnapshot(this.test!, context.client, BEHAVIOR_SNAPSHOT);
	});

	// Copilot never completed this turn.
	(stableNewScenarioResponse && config.provider === 'claude' && shellToolReplayEnabled ? test : test.skip)('deletes a workspace file', async function () {
		this.timeout(180_000);
		const workspace = mkdtempSync(join(tmpdir(), 'ahp-coverage-delete-'));
		tempDirs.push(workspace);
		writeFileSync(join(workspace, 'delete-me.txt'), 'DELETE_VALUE');
		const sessionUri = await createRealSession(context.client, config, `coverage-delete-${config.provider}`, createdSessions, URI.file(workspace));

		context.client.beginAhpSnapshotRound();
		await driveTurnToCompletion(context.client, sessionUri, 'turn-delete', 'Delete delete-me.txt.', 1);
		assert.strictEqual(existsSync(join(workspace, 'delete-me.txt')), false);
		await assertRecordedAhpSnapshot(this.test!, context.client, BEHAVIOR_SNAPSHOT);
	});

	(shellToolReplayEnabled && stableNewScenarioResponse ? test : test.skip)('runs a deterministic shell command', async function () {
		this.timeout(180_000);
		const workspace = mkdtempSync(join(tmpdir(), 'ahp-coverage-shell-'));
		tempDirs.push(workspace);
		const sessionUri = await createRealSession(context.client, config, `coverage-shell-${config.provider}`, createdSessions, URI.file(workspace));

		context.client.beginAhpSnapshotRound();
		const result = await driveTurnToCompletion(context.client, sessionUri, 'turn-shell', 'Run a shell command that prints SHELL_VALUE_73, then reply with that exact value only.', 1);
		assert.match(result.responseText, /SHELL_VALUE_73/);
		await assertRecordedAhpSnapshot(this.test!, context.client, BEHAVIOR_SNAPSHOT);
	});

	// Claude and Codex emit customization/changeset updates at nondeterministic points in this snapshot.
	(shellToolReplayEnabled && stableNewScenarioResponse && config.provider === 'copilotcli' ? test : test.skip)('inspects git status', async function () {
		this.timeout(180_000);
		const workspace = mkdtempSync(join(tmpdir(), 'ahp-coverage-git-'));
		tempDirs.push(workspace);
		execSync('git init', { cwd: workspace });
		execSync('git config user.name "Agent Host Test"', { cwd: workspace });
		execSync('git config user.email "agent-host-test@example.com"', { cwd: workspace });
		writeFileSync(join(workspace, 'tracked.txt'), 'initial');
		execSync('git add tracked.txt && git commit -m "initial"', { cwd: workspace });
		writeFileSync(join(workspace, 'tracked.txt'), 'modified');
		writeFileSync(join(workspace, 'untracked.txt'), 'new');
		const sessionUri = await createRealSession(context.client, config, `coverage-git-${config.provider}`, createdSessions, URI.file(workspace));

		context.client.beginAhpSnapshotRound();
		const result = await driveTurnToCompletion(context.client, sessionUri, 'turn-git', 'Inspect git status. Reply with the names of the modified and untracked files only.', 1);
		assert.match(result.responseText, /tracked\.txt/);
		assert.match(result.responseText, /untracked\.txt/);
		await assertRecordedAhpSnapshot(this.test!, context.client, BEHAVIOR_SNAPSHOT);
	});

	(stableNewScenarioResponse ? test : test.skip)('reads a filename containing spaces', async function () {
		this.timeout(180_000);
		const workspace = mkdtempSync(join(tmpdir(), 'ahp-coverage-spaces-'));
		tempDirs.push(workspace);
		writeFileSync(join(workspace, 'file with spaces.txt'), 'SPACED_VALUE');
		const sessionUri = await createRealSession(context.client, config, `coverage-spaces-${config.provider}`, createdSessions, URI.file(workspace));

		context.client.beginAhpSnapshotRound();
		const result = await driveTurnToCompletion(context.client, sessionUri, 'turn-spaces', 'Read "file with spaces.txt" and reply with its exact contents only.', 1);
		assert.match(result.responseText, /SPACED_VALUE/);
		await assertRecordedAhpSnapshot(this.test!, context.client, BEHAVIOR_SNAPSHOT);
	});
}
