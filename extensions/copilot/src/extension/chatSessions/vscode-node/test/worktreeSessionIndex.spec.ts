/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { afterEach, describe, expect, it, vi } from 'vitest';
import { Uri } from 'vscode';
import { MockFileSystemService } from '../../../../platform/filesystem/node/test/mockFileSystemService';
import { ILogService } from '../../../../platform/log/common/logService';
import { mock } from '../../../../util/common/test/simpleMock';
import { WorktreeSessionIndex } from '../worktreeSessionIndex';

class MockLogService extends mock<ILogService>() {
	override trace = vi.fn();
	override info = vi.fn();
	override warn = vi.fn();
	override error = vi.fn();
	override debug = vi.fn();
}

const JSONL_PATH = '/mock/copilot-home/worktree.jsonl';
const JSONL_URI = Uri.file(JSONL_PATH);

describe('WorktreeSessionIndex', () => {
	let mockFs: MockFileSystemService;
	let logService: MockLogService;

	function createIndex(): WorktreeSessionIndex {
		return new WorktreeSessionIndex(mockFs, logService, JSONL_PATH);
	}

	afterEach(() => {
		vi.restoreAllMocks();
	});

	// In-memory tests don't need mockFs/logService, but the constructor requires them.
	describe('in-memory operations', () => {
		it('adds and retrieves an entry by session id', () => {
			mockFs = new MockFileSystemService();
			logService = new MockLogService();
			const index = createIndex();
			index.addEntry({ id: 's1', path: '/a', created: 1 });

			expect(index.getSessionEntry('s1')).toMatchObject({ id: 's1', path: '/a' });
			expect(index.has('s1')).toBe(true);
			expect(index.has('s2')).toBe(false);
		});

		it('looks up session id by folder Uri', () => {
			mockFs = new MockFileSystemService();
			logService = new MockLogService();
			const index = createIndex();
			index.addEntry({ id: 's1', path: '/a', created: 1 });

			expect(index.getSessionIdForFolder(Uri.file('/a'))).toBe('s1');
			expect(index.getSessionIdForFolder(Uri.file('/b'))).toBeUndefined();
		});

		it('deletes an entry and cleans up the folder mapping', () => {
			mockFs = new MockFileSystemService();
			logService = new MockLogService();
			const index = createIndex();
			index.addEntry({ id: 's1', path: '/a', created: 1 });
			index.deleteEntry('s1');

			expect(index.has('s1')).toBe(false);
			expect(index.getSessionIdForFolder(Uri.file('/a'))).toBeUndefined();
		});

		it('clear() removes everything', () => {
			mockFs = new MockFileSystemService();
			logService = new MockLogService();
			const index = createIndex();
			index.addEntry({ id: 's1', path: '/a', created: 1 });
			index.addEntry({ id: 's2', path: '/b', created: 2 });
			index.clear();

			expect(index.has('s1')).toBe(false);
			expect(index.getEntries()).toHaveLength(0);
		});

		it('getEntries() returns all entries', () => {
			mockFs = new MockFileSystemService();
			logService = new MockLogService();
			const index = createIndex();
			index.addEntry({ id: 's1', path: '/a', created: 1 });
			index.addEntry({ id: 's2', path: '/b', created: 2 });

			const entries = index.getEntries();
			expect(entries).toHaveLength(2);
			expect(entries.map(e => e.id).sort()).toEqual(['s1', 's2']);
		});

		it('updating an entry with a new path removes the old path mapping', () => {
			mockFs = new MockFileSystemService();
			logService = new MockLogService();
			const index = createIndex();
			index.addEntry({ id: 's1', path: '/old', created: 1 });
			expect(index.getSessionIdForFolder(Uri.file('/old'))).toBe('s1');

			index.addEntry({ id: 's1', path: '/new', created: 1 });
			expect(index.getSessionIdForFolder(Uri.file('/new'))).toBe('s1');
			expect(index.getSessionIdForFolder(Uri.file('/old'))).toBeUndefined();
		});
	});

	describe('JSONL persistence', () => {
		it('loadFromDisk populates the index from a JSONL file', async () => {
			mockFs = new MockFileSystemService();
			logService = new MockLogService();
			mockFs.mockFile(JSONL_URI,
				JSON.stringify({ id: 's1', path: '/a', created: 1 }) + '\n' +
				JSON.stringify({ id: 's2', path: '/b', created: 2 }) + '\n',
			);
			const index = createIndex();
			await index.loadFromDisk();

			expect(index.has('s1')).toBe(true);
			expect(index.has('s2')).toBe(true);
			expect(index.size).toBe(2);
		});

		it('loadFromDisk returns rewriteNeeded for duplicates', async () => {
			mockFs = new MockFileSystemService();
			logService = new MockLogService();
			mockFs.mockFile(JSONL_URI,
				JSON.stringify({ id: 's1', path: '/a', created: 1 }) + '\n' +
				JSON.stringify({ id: 's1', path: '/b', created: 2 }) + '\n',
			);
			const index = createIndex();
			const { rewriteNeeded } = await index.loadFromDisk();

			expect(rewriteNeeded).toBe(true);
			expect(index.size).toBe(1);
		});

		it('writeToDisk writes all entries to the JSONL file', async () => {
			mockFs = new MockFileSystemService();
			logService = new MockLogService();
			const index = createIndex();
			index.addEntry({ id: 's1', path: '/a', created: 1 });
			index.addEntry({ id: 's2', path: '/b', created: 2 });
			await index.writeToDisk();

			const raw = new TextDecoder().decode(await mockFs.readFile(JSONL_URI));
			const lines = raw.split('\n').filter(Boolean);
			expect(lines).toHaveLength(2);
		});

		it('appendBatchToDisk adds a single entry', async () => {
			mockFs = new MockFileSystemService();
			logService = new MockLogService();
			const index = createIndex();
			await index.appendBatchToDisk([{ id: 's1', path: '/a', created: 1 }]);

			expect(index.has('s1')).toBe(true);
			const raw = new TextDecoder().decode(await mockFs.readFile(JSONL_URI));
			expect(raw.split('\n').filter(Boolean)).toHaveLength(1);
		});

		it('appendBatchToDisk adds multiple entries in one write', async () => {
			mockFs = new MockFileSystemService();
			logService = new MockLogService();
			const index = createIndex();
			await index.appendBatchToDisk([
				{ id: 's1', path: '/a', created: 1 },
				{ id: 's2', path: '/b', created: 2 },
			]);

			expect(index.has('s1')).toBe(true);
			expect(index.has('s2')).toBe(true);
			const raw = new TextDecoder().decode(await mockFs.readFile(JSONL_URI));
			expect(raw.split('\n').filter(Boolean)).toHaveLength(2);
		});

		it('removeAndWriteToDisk removes the entry and rewrites', async () => {
			mockFs = new MockFileSystemService();
			logService = new MockLogService();
			const index = createIndex();
			index.addEntry({ id: 's1', path: '/a', created: 1 });
			index.addEntry({ id: 's2', path: '/b', created: 2 });
			await index.removeAndWriteToDisk('s1');

			expect(index.has('s1')).toBe(false);
			const raw = new TextDecoder().decode(await mockFs.readFile(JSONL_URI));
			expect(raw.split('\n').filter(Boolean)).toHaveLength(1);
			expect(raw).toContain('s2');
		});
	});
});
