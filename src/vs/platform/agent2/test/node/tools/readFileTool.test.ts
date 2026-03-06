/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { join } from '../../../../../base/common/path.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IToolContext } from '../../../common/tools.js';
import { ReadFileTool } from '../../../node/tools/readFileTool.js';

function createContext(workingDirectory: string): IToolContext {
	return {
		token: CancellationToken.None,
		workingDirectory,
		scratchpad: new Map(),
	};
}

suite('ReadFileTool', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	let tmpDir: string;
	const tool = new ReadFileTool();

	setup(async () => {
		tmpDir = await fs.promises.mkdtemp(join(os.tmpdir(), 'agent2-test-'));
	});

	teardown(async () => {
		await fs.promises.rm(tmpDir, { recursive: true, force: true });
	});

	test('reads a file', async () => {
		const filePath = join(tmpDir, 'test.txt');
		await fs.promises.writeFile(filePath, 'hello world');

		const result = await tool.execute({ path: filePath }, createContext(tmpDir));
		assert.strictEqual(result.content, 'hello world');
		assert.strictEqual(result.isError, undefined);
	});

	test('reads a file with relative path', async () => {
		await fs.promises.writeFile(join(tmpDir, 'relative.txt'), 'relative content');

		const result = await tool.execute({ path: 'relative.txt' }, createContext(tmpDir));
		assert.strictEqual(result.content, 'relative content');
	});

	test('reads a file with line range', async () => {
		const content = 'line 1\nline 2\nline 3\nline 4\nline 5';
		await fs.promises.writeFile(join(tmpDir, 'lines.txt'), content);

		const result = await tool.execute(
			{ path: join(tmpDir, 'lines.txt'), startLine: 2, endLine: 4 },
			createContext(tmpDir),
		);
		assert.ok(result.content.includes('line 2'));
		assert.ok(result.content.includes('line 3'));
		assert.ok(result.content.includes('line 4'));
		assert.ok(!result.content.includes('line 1\n'));
		assert.ok(!result.content.includes('line 5'));
		assert.ok(result.content.startsWith('Lines 2-4'));
	});

	test('returns error for nonexistent file', async () => {
		const result = await tool.execute({ path: '/nonexistent/file.txt' }, createContext(tmpDir));
		assert.strictEqual(result.isError, true);
		assert.ok(result.content.includes('File not found'));
	});

	test('returns error for directory', async () => {
		const dir = join(tmpDir, 'subdir');
		await fs.promises.mkdir(dir);

		const result = await tool.execute({ path: dir }, createContext(tmpDir));
		assert.strictEqual(result.isError, true);
		assert.ok(result.content.includes('directory'));
	});

	test('returns error for missing path argument', async () => {
		const result = await tool.execute({}, createContext(tmpDir));
		assert.strictEqual(result.isError, true);
		assert.ok(result.content.includes('"path" argument'));
	});

	test('prevents path traversal for relative paths', async () => {
		const result = await tool.execute(
			{ path: '../../../etc/passwd' },
			createContext(tmpDir),
		);
		assert.strictEqual(result.isError, true);
		assert.ok(result.content.includes('traversal'));
	});

	test('allows absolute paths outside working directory', async () => {
		// Absolute paths are allowed -- the security check only applies to relative paths
		const otherDir = await fs.promises.mkdtemp(join(os.tmpdir(), 'agent2-other-'));
		const filePath = join(otherDir, 'other.txt');
		await fs.promises.writeFile(filePath, 'other content');

		try {
			const result = await tool.execute({ path: filePath }, createContext(tmpDir));
			assert.strictEqual(result.content, 'other content');
		} finally {
			await fs.promises.rm(otherDir, { recursive: true, force: true });
		}
	});

	test('handles UTF-8 content', async () => {
		const content = 'Hello 世界! 🌍 Ñoño';
		await fs.promises.writeFile(join(tmpDir, 'utf8.txt'), content, 'utf-8');

		const result = await tool.execute({ path: join(tmpDir, 'utf8.txt') }, createContext(tmpDir));
		assert.strictEqual(result.content, content);
	});
});
