/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { VSBuffer } from '../../../../base/common/buffer.js';
import { basename, dirname, joinPath } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { FileService } from '../../../files/common/fileService.js';
import { IFileService } from '../../../files/common/files.js';
import { InMemoryFileSystemProvider } from '../../../files/common/inMemoryFilesystemProvider.js';
import { NullLogService } from '../../../log/common/log.js';
import { CLAUDE_DEBUG_LOG_LABEL, CLAUDE_TRANSCRIPT_LABEL } from '../../common/agentHostLogNaming.js';
import { ClaudeDebugArtifacts } from '../../node/claude/claudeDebugArtifacts.js';

suite('ClaudeDebugArtifacts', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();

	const LOGS_HOME = URI.file('/logs');
	const USER_HOME = URI.file('/home');
	const CWD = URI.file('/work/my-proj');
	const SESSION_ID = 'sess-abc';

	const logDir = joinPath(LOGS_HOME, 'claude');
	// The CLI transcript slug for `/work/my-proj` — every non-alphanumeric char → `-`.
	const transcriptDir = joinPath(USER_HOME, '.claude', 'projects', '-work-my-proj');

	function setup(): { fileService: IFileService; artifacts: ClaudeDebugArtifacts } {
		const fileService = store.add(new FileService(new NullLogService()));
		store.add(fileService.registerProvider('file', store.add(new InMemoryFileSystemProvider())));
		const artifacts = new ClaudeDebugArtifacts(SESSION_ID, LOGS_HOME, USER_HOME, fileService, new NullLogService());
		return { fileService, artifacts };
	}

	async function write(fileService: IFileService, resource: URI): Promise<void> {
		await fileService.writeFile(resource, VSBuffer.fromString('x'));
	}

	test('refresh returns nothing when neither location exists on disk', async () => {
		const { artifacts } = setup();
		assert.deepStrictEqual(await artifacts.refresh(CWD), []);
	});

	test('refresh discovers this session\'s log, ignoring other sessions and non-log files', async () => {
		const { fileService, artifacts } = setup();
		const mine = joinPath(logDir, `claude-2026-01-01T00-00-00-000Z-${SESSION_ID}.log`);
		await write(fileService, mine);
		await write(fileService, joinPath(logDir, 'claude-2026-01-01T00-00-00-000Z-other.log'));
		// A sibling session whose id merely contains ours as a prefix must NOT match
		// (exact suffix, not substring) — debug logs can hold sensitive content.
		await write(fileService, joinPath(logDir, `claude-2026-01-01T00-00-00-000Z-${SESSION_ID}-extra.log`));
		await write(fileService, joinPath(logDir, `${SESSION_ID}.txt`));
		assert.deepStrictEqual(await artifacts.refresh(CWD), [{ label: CLAUDE_DEBUG_LOG_LABEL, path: mine.fsPath }]);
	});

	test('refresh numbers multiple runs in chronological (lexical) order', async () => {
		const { fileService, artifacts } = setup();
		const older = joinPath(logDir, `claude-2026-01-01T00-00-00-000Z-${SESSION_ID}.log`);
		const newer = joinPath(logDir, `claude-2026-01-02T00-00-00-000Z-${SESSION_ID}.log`);
		await write(fileService, newer);
		await write(fileService, older);
		assert.deepStrictEqual(await artifacts.refresh(CWD), [
			{ label: `${CLAUDE_DEBUG_LOG_LABEL} 1`, path: older.fsPath },
			{ label: `${CLAUDE_DEBUG_LOG_LABEL} 2`, path: newer.fsPath },
		]);
	});

	test('refresh appends the transcript addressed by the cwd slug, after the log', async () => {
		const { fileService, artifacts } = setup();
		const log = joinPath(logDir, `claude-2026-01-01T00-00-00-000Z-${SESSION_ID}.log`);
		const transcript = joinPath(transcriptDir, `${SESSION_ID}.jsonl`);
		await write(fileService, log);
		await write(fileService, transcript);
		assert.deepStrictEqual(await artifacts.refresh(CWD), [
			{ label: CLAUDE_DEBUG_LOG_LABEL, path: log.fsPath },
			{ label: CLAUDE_TRANSCRIPT_LABEL, path: transcript.fsPath },
		]);
	});

	test('refresh falls back to scanning when the transcript is filed under a different slug', async () => {
		const { fileService, artifacts } = setup();
		// A symlinked/renamed cwd (or an encoder mismatch) can land the transcript
		// under a project dir that isn't this cwd's slug: the direct path misses, so
		// the scan fallback still finds it by session id.
		const transcript = joinPath(USER_HOME, '.claude', 'projects', '-some-other-proj', `${SESSION_ID}.jsonl`);
		await write(fileService, transcript);
		assert.deepStrictEqual(await artifacts.refresh(CWD), [{ label: CLAUDE_TRANSCRIPT_LABEL, path: transcript.fsPath }]);
	});

	test('refresh surfaces the transcript alone when no debug log has been written yet', async () => {
		const { fileService, artifacts } = setup();
		const transcript = joinPath(transcriptDir, `${SESSION_ID}.jsonl`);
		await write(fileService, transcript);
		assert.deepStrictEqual(await artifacts.refresh(CWD), [{ label: CLAUDE_TRANSCRIPT_LABEL, path: transcript.fsPath }]);
	});

	test('prepareDebugFile creates the log directory and returns this session\'s per-run path', async () => {
		const { fileService, artifacts } = setup();
		const path = await artifacts.prepareDebugFile();
		assert.ok(path, 'expected a debug-file path');
		const file = URI.file(path);
		assert.deepStrictEqual(
			{ dir: dirname(file).fsPath, dirExists: await fileService.exists(logDir) },
			{ dir: logDir.fsPath, dirExists: true },
		);
		assert.match(basename(file), /^claude-.+-sess-abc\.log$/);
	});
});
