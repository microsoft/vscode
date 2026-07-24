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
	const SESSION_ID = 'sess-abc';

	const logDir = joinPath(LOGS_HOME, 'claude');
	const projectsDir = joinPath(USER_HOME, '.claude', 'projects');

	function setup(): { fileService: IFileService; artifacts: ClaudeDebugArtifacts } {
		const fileService = store.add(new FileService(new NullLogService()));
		store.add(fileService.registerProvider('file', store.add(new InMemoryFileSystemProvider())));
		const artifacts = new ClaudeDebugArtifacts(SESSION_ID, LOGS_HOME, USER_HOME, fileService, new NullLogService());
		return { fileService, artifacts };
	}

	async function write(fileService: IFileService, resource: URI): Promise<void> {
		await fileService.writeFile(resource, VSBuffer.fromString('x'));
	}

	test('refresh publishes nothing when neither location exists on disk', async () => {
		const { artifacts } = setup();
		await artifacts.refresh();
		assert.deepStrictEqual(artifacts.artifacts.get(), []);
	});

	test('refresh discovers this session\'s log, ignoring other sessions and non-log files', async () => {
		const { fileService, artifacts } = setup();
		const mine = joinPath(logDir, `claude-2026-01-01T00-00-00-000Z-${SESSION_ID}.log`);
		await write(fileService, mine);
		await write(fileService, joinPath(logDir, 'claude-2026-01-01T00-00-00-000Z-other.log'));
		await write(fileService, joinPath(logDir, `${SESSION_ID}.txt`));
		await artifacts.refresh();
		assert.deepStrictEqual(artifacts.artifacts.get(), [{ label: CLAUDE_DEBUG_LOG_LABEL, path: mine.fsPath }]);
	});

	test('refresh numbers multiple runs in chronological (lexical) order', async () => {
		const { fileService, artifacts } = setup();
		const older = joinPath(logDir, `claude-2026-01-01T00-00-00-000Z-${SESSION_ID}.log`);
		const newer = joinPath(logDir, `claude-2026-01-02T00-00-00-000Z-${SESSION_ID}.log`);
		await write(fileService, newer);
		await write(fileService, older);
		await artifacts.refresh();
		assert.deepStrictEqual(artifacts.artifacts.get(), [
			{ label: `${CLAUDE_DEBUG_LOG_LABEL} 1`, path: older.fsPath },
			{ label: `${CLAUDE_DEBUG_LOG_LABEL} 2`, path: newer.fsPath },
		]);
	});

	test('refresh appends the transcript after the log, matching by session id under projects/*', async () => {
		const { fileService, artifacts } = setup();
		const log = joinPath(logDir, `claude-2026-01-01T00-00-00-000Z-${SESSION_ID}.log`);
		const transcript = joinPath(projectsDir, 'encoded-cwd', `${SESSION_ID}.jsonl`);
		await write(fileService, log);
		await write(fileService, transcript);
		await write(fileService, joinPath(projectsDir, 'encoded-cwd', 'other-session.jsonl'));
		await artifacts.refresh();
		assert.deepStrictEqual(artifacts.artifacts.get(), [
			{ label: CLAUDE_DEBUG_LOG_LABEL, path: log.fsPath },
			{ label: CLAUDE_TRANSCRIPT_LABEL, path: transcript.fsPath },
		]);
	});

	test('refresh surfaces the transcript alone when no debug log has been written yet', async () => {
		const { fileService, artifacts } = setup();
		const transcript = joinPath(projectsDir, 'encoded-cwd', `${SESSION_ID}.jsonl`);
		await write(fileService, transcript);
		await artifacts.refresh();
		assert.deepStrictEqual(artifacts.artifacts.get(), [{ label: CLAUDE_TRANSCRIPT_LABEL, path: transcript.fsPath }]);
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
