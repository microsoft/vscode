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
import { createRealSession, driveTurnToCompletion, initTestGitRepo } from '../harness/agentHostE2ETestHarness.js';
import { assertRecordedAhpSnapshot } from '../harness/ahpSnapshot.js';
import type { IAgentHostE2ETestContext } from './e2eTestContext.js';

export function defineFileOperationsTests(context: IAgentHostE2ETestContext): void {
	const { config, createdSessions, tempDirs, portableShellToolReplayEnabled, stableNewScenarioResponse } = context;
	const BEHAVIOR_SNAPSHOT = { profile: 'behavior' } as const;
	/**
	 * Steers the agent toward its own file tools instead of a shell command.
	 *
	 * These tests assert that a *file operation* happened, not that a shell ran.
	 * Left to choose, providers diverge: Claude and Codex already reach for their
	 * file tools here, while Copilot reaches for `bash` — and whichever POSIX
	 * command it happens to emit is then frozen into the fixture and cannot
	 * replay on Windows. Asking for the file tool removes the platform coupling
	 * and exercises the more meaningful path.
	 */
	const PREFER_FILE_TOOLS = ' Use your file tools; do not run a shell command.';
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

	(stableNewScenarioResponse ? test : test.skip)('reads a file from a nested directory', async function () {
		this.timeout(180_000);
		const workspace = mkdtempSync(join(tmpdir(), 'ahp-coverage-nested-read-'));
		tempDirs.push(workspace);
		mkdirSync(join(workspace, 'nested'));
		writeFileSync(join(workspace, 'nested', 'value.txt'), 'NESTED_VALUE_42');
		const sessionUri = await createRealSession(context.client, config, `coverage-nested-read-${config.provider}`, createdSessions, URI.file(workspace));

		context.client.beginAhpSnapshotRound();
		const result = await driveTurnToCompletion(context.client, sessionUri, 'turn-nested-read', `Read nested/value.txt and reply with its exact contents only.${PREFER_FILE_TOOLS}`, 1);
		assert.match(result.responseText, /NESTED_VALUE_42/);
		await assertRecordedAhpSnapshot(this.test!, context.client, BEHAVIOR_SNAPSHOT);
	});

	(stableNewScenarioResponse && portableShellToolReplayEnabled ? test : test.skip)('lists workspace entries', async function () {
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
	(stableNewScenarioResponse && portableShellToolReplayEnabled ? test : test.skip)('counts lines in a file', async function () {
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
		const result = await driveTurnToCompletion(context.client, sessionUri, 'turn-lines', `Count the lines in lines.txt and reply with the number only.${PREFER_FILE_TOOLS}`, 1);
		assert.match(result.responseText, /\b4\b/);
		await assertRecordedAhpSnapshot(this.test!, context.client, BEHAVIOR_SNAPSHOT);
	});

	(stableNewScenarioResponse ? test : test.skip)('handles a missing file without a session error', async function () {
		this.timeout(180_000);
		const workspace = mkdtempSync(join(tmpdir(), 'ahp-coverage-missing-'));
		tempDirs.push(workspace);
		const sessionUri = await createRealSession(context.client, config, `coverage-missing-${config.provider}`, createdSessions, URI.file(workspace));

		context.client.beginAhpSnapshotRound();
		const result = await driveTurnToCompletion(context.client, sessionUri, 'turn-missing', `Try to read missing.txt. If it does not exist, reply exactly "missing".${PREFER_FILE_TOOLS}`, 1);
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
	(stableNewScenarioResponse && config.provider === 'claude' ? test : test.skip)('edits an existing text file', async function () {
		this.timeout(180_000);
		const workspace = mkdtempSync(join(tmpdir(), 'ahp-coverage-edit-'));
		tempDirs.push(workspace);
		writeFileSync(join(workspace, 'edit.txt'), 'BEFORE_VALUE');
		const sessionUri = await createRealSession(context.client, config, `coverage-edit-${config.provider}`, createdSessions, URI.file(workspace));

		context.client.beginAhpSnapshotRound();
		await driveTurnToCompletion(context.client, sessionUri, 'turn-edit', `Replace the complete contents of edit.txt with AFTER_VALUE.${PREFER_FILE_TOOLS}`, 1);
		assert.strictEqual(readFileSync(join(workspace, 'edit.txt'), 'utf8'), 'AFTER_VALUE');
		await assertRecordedAhpSnapshot(this.test!, context.client, BEHAVIOR_SNAPSHOT);
	});

	// Copilot's fixture uses a POSIX shell.
	(stableNewScenarioResponse ? test : test.skip)('creates a file in a new nested directory', async function () {
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

	(stableNewScenarioResponse && portableShellToolReplayEnabled ? test : test.skip)('renames a workspace file', async function () {
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
		await driveTurnToCompletion(context.client, sessionUri, 'turn-rename', `Run exactly this shell command, with no modifications: \`${renameCommand}\`. Then reply with exactly "renamed".`, 1);
		assert.strictEqual(existsSync(join(workspace, 'before.txt')), false);
		assert.strictEqual(readFileSync(join(workspace, 'after.txt'), 'utf8'), 'RENAME_VALUE');
		await assertRecordedAhpSnapshot(this.test!, context.client, BEHAVIOR_SNAPSHOT);
	});

	// Copilot never completed this turn.
	(stableNewScenarioResponse && config.provider === 'claude' ? test : test.skip)('deletes a workspace file', async function () {
		this.timeout(180_000);
		const workspace = mkdtempSync(join(tmpdir(), 'ahp-coverage-delete-'));
		tempDirs.push(workspace);
		writeFileSync(join(workspace, 'delete-me.txt'), 'DELETE_VALUE');
		const sessionUri = await createRealSession(context.client, config, `coverage-delete-${config.provider}`, createdSessions, URI.file(workspace));

		context.client.beginAhpSnapshotRound();
		// Pinned rather than steered: there is no file tool for a delete, so the
		// provider reaches for `rm`, which cmd does not have.
		const deleteCommand = `node -e "require('fs').unlinkSync('delete-me.txt')"`;
		await driveTurnToCompletion(context.client, sessionUri, 'turn-delete', `Run exactly this shell command, with no modifications: \`${deleteCommand}\`. Then reply with exactly "deleted".`, 1);
		assert.strictEqual(existsSync(join(workspace, 'delete-me.txt')), false);
		await assertRecordedAhpSnapshot(this.test!, context.client, BEHAVIOR_SNAPSHOT);
	});

	(portableShellToolReplayEnabled && stableNewScenarioResponse ? test : test.skip)('runs a deterministic shell command', async function () {
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
		await assertRecordedAhpSnapshot(this.test!, context.client, BEHAVIOR_SNAPSHOT);
	});

	// Claude and Codex emit customization/changeset updates at nondeterministic points in this snapshot.
	(portableShellToolReplayEnabled && stableNewScenarioResponse && config.provider === 'copilotcli' ? test : test.skip)('inspects git status', async function () {
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
