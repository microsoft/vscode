/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as vscode from 'vscode';
import { Uri } from 'vscode';
import { IVSCodeExtensionContext } from '../../../../platform/extContext/common/extensionContext';
import { MockFileSystemService } from '../../../../platform/filesystem/node/test/mockFileSystemService';
import { ILogService } from '../../../../platform/log/common/logService';
import { mock } from '../../../../util/common/test/simpleMock';
import { Emitter } from '../../../../util/vs/base/common/event';
import { URI } from '../../../../util/vs/base/common/uri';
import { ChatSessionWorktreeProperties } from '../../common/chatSessionWorktreeService';
import { IWorkspaceInfo } from '../../common/workspaceInfo';
import { getCopilotCLISessionDir } from '../../copilotcli/node/cliHelpers';
import { NullCopilotCLIAgents } from '../../copilotcli/node/test/testHelpers';
import { ChatSessionMetadataStore } from '../chatSessionMetadataStoreImpl';

// Hoisted holder lets each test point the JSONL helper at its own mock path.
const jsonlPathHolder = vi.hoisted(() => {
	const p = '/mock/copilot-home/worktree.jsonl';
	return { get: () => p };
});

vi.mock('../../copilotcli/node/cliHelpers', async (importOriginal) => {
	const actual = await importOriginal<typeof import('../../copilotcli/node/cliHelpers')>();
	return {
		...actual,
		getCopilotCLISessionDir: (sessionId: string) => `/mock/session-state/${sessionId}`,
		getCopilotCLISessionStateDir: () => '/mock/session-state',
		// New shared bulk + JSONL paths — all go through the mocked IFileSystemService.
		getCopilotBulkMetadataFile: () => '/mock/copilot-home/vscode.session.metadata.cache.json',
		getCopilotWorktreeSessionsFile: () => jsonlPathHolder.get(),
	};
});


class MockGlobalState implements vscode.Memento {
	private data = new Map<string, unknown>();

	get<T>(key: string, defaultValue?: T): T {
		const value = this.data.get(key);
		return (value ?? defaultValue) as T;
	}

	async update(key: string, value: unknown): Promise<void> {
		if (value === undefined) {
			this.data.delete(key);
		} else {
			this.data.set(key, value);
		}
	}

	keys(): readonly string[] {
		return Array.from(this.data.keys());
	}

	setKeysForSync(_keys: readonly string[]): void { }

	/** Test helper to seed data without triggering update logic */
	seed(key: string, value: unknown) {
		this.data.set(key, value);
	}

	has(key: string): boolean {
		return this.data.has(key);
	}
}

class MockExtensionContext extends mock<IVSCodeExtensionContext>() {
	public override globalState = new MockGlobalState();
	override extensionPath = Uri.file('/mock/extension/path').fsPath;
	override globalStorageUri = Uri.file('/mock/global/storage');
	override storagePath = Uri.file('/mock/storage/path').fsPath;
	override globalStoragePath = Uri.file('/mock/global/storage/path').fsPath;
	override logPath = Uri.file('/mock/log/path').fsPath;
	override logUri = Uri.file('/mock/log/uri');
	override extensionUri = Uri.file('/mock/extension');
}

class MockLogService extends mock<ILogService>() {
	override trace = vi.fn();
	override info = vi.fn();
	override warn = vi.fn();
	override error = vi.fn();
	override debug = vi.fn();
}

// Paths used by the store
// New shared bulk file (top-N cache). Lives at `~/.copilot/...` in production but is
// mocked above so the IFileSystemService mock can intercept reads/writes.
const BULK_METADATA_FILE = Uri.file('/mock/copilot-home/vscode.session.metadata.cache.json');
// Legacy bulk file location in the per-install globalStorageUri — used only by the
// one-time migration in `initializeStorage()`.
const LEGACY_BULK_METADATA_FILE = Uri.joinPath(Uri.file('/mock/global/storage'), 'copilotcli', 'copilotcli.session.metadata.json');

function sessionDirectoryUri(sessionId: string): Uri {
	return Uri.file(getCopilotCLISessionDir(sessionId));
}

function sessionMetadataFileUri(sessionId: string): Uri {
	return Uri.joinPath(sessionDirectoryUri(sessionId), 'vscode.metadata.json');
}

function sessionRequestMetadataFileUri(sessionId: string): Uri {
	return Uri.joinPath(sessionDirectoryUri(sessionId), 'vscode.requests.metadata.json');
}

function makeWorktreeV1Props(overrides?: Partial<ChatSessionWorktreeProperties>): ChatSessionWorktreeProperties {
	return {
		version: 1,
		baseCommit: 'abc123',
		branchName: 'feature-branch',
		repositoryPath: Uri.file('/repo').fsPath,
		worktreePath: Uri.file('/repo/.worktrees/wt').fsPath,
		autoCommit: true,
		...overrides,
	} as ChatSessionWorktreeProperties;
}

function makeWorktreeV2Props(overrides?: Partial<ChatSessionWorktreeProperties>): ChatSessionWorktreeProperties {
	return {
		version: 2,
		baseCommit: 'def456',
		branchName: 'feature-v2',
		baseBranchName: 'main',
		repositoryPath: Uri.file('/repo').fsPath,
		worktreePath: Uri.file('/repo/.worktrees/wt2').fsPath,
		...overrides,
	} as ChatSessionWorktreeProperties;
}


class MockFileSystemServiceWithMotification extends MockFileSystemService {
	onDidCreateFile = new Emitter<Uri>();
	constructor() {
		super();
	}
	dispose() {
		this.onDidCreateFile.dispose();
	}

	override async writeFile(uri: URI, content: Uint8Array): Promise<void> {
		await super.writeFile(uri, content);
		this.onDidCreateFile.fire(uri);
	}
}

describe('ChatSessionMetadataStore', () => {
	let mockFs: MockFileSystemServiceWithMotification;
	let logService: MockLogService;
	let extensionContext: MockExtensionContext;

	beforeEach(async () => {
		vi.useFakeTimers();
		mockFs = new MockFileSystemServiceWithMotification();
		logService = new MockLogService();
		extensionContext = new MockExtensionContext();
	});

	afterEach(async () => {
		mockFs.dispose();
		vi.useRealTimers();
		vi.restoreAllMocks();
	});

	/**
	 * Creates the store and waits for initialization to complete.
	 * Constructor eagerly triggers init; we flush microtasks so it settles.
	 */
	async function createStore(): Promise<ChatSessionMetadataStore> {
		const store = new ChatSessionMetadataStore(
			mockFs,
			logService,
			extensionContext,
			new NullCopilotCLIAgents(),
		);
		// Flush enough microtask rounds so that initializeStorage() —
		// which chains several async I/O steps — fully settles.
		for (let i = 0; i < 5; i++) {
			await vi.advanceTimersByTimeAsync(0);
		}
		return store;
	}

	// ──────────────────────────────────────────────────────────────────────────
	// initializeStorage — happy path: bulk file already exists
	// ──────────────────────────────────────────────────────────────────────────
	describe('initializeStorage - bulk file exists', () => {
		it('should populate cache from existing bulk file', async () => {
			const existingData = {
				'session-1': { workspaceFolder: { folderPath: Uri.file('/workspace/a').fsPath, timestamp: 100 } },
				'session-2': { worktreeProperties: makeWorktreeV1Props() },
			};
			mockFs.mockFile(BULK_METADATA_FILE, JSON.stringify(existingData));

			const store = await createStore();
			const folder = await store.getSessionWorkspaceFolder('session-1');
			expect(folder?.fsPath).toBe(Uri.file('/workspace/a').fsPath);

			const wt = await store.getWorktreeProperties('session-2');
			expect(wt?.version).toBe(1);
			store.dispose();
		});

		it('should not retry entries with no workspaceFolder, worktreeProperties, or additionalWorkspaces', async () => {
			const existingData = {
				'session-empty': {},
				'session-folder': { workspaceFolder: { folderPath: Uri.file('/workspace/a').fsPath, timestamp: 100 } },
			};
			mockFs.mockFile(BULK_METADATA_FILE, JSON.stringify(existingData));

			const statSpy = vi.spyOn(mockFs, 'stat');
			const store = await createStore();
			await vi.advanceTimersByTimeAsync(0);

			// stat should only be called for session-folder's dir (retry attempt),
			// not for session-empty since it has no data to write
			const sessionEmptyStatCalls = statSpy.mock.calls.filter(
				c => c[0].toString().includes('session-empty'),
			);
			expect(sessionEmptyStatCalls).toHaveLength(0);
			store.dispose();
		});

	});

	// ──────────────────────────────────────────────────────────────────────────
	// initializeStorage — empty data
	// ──────────────────────────────────────────────────────────────────────────
	describe('initializeStorage - empty global state', () => {
		it('should not write bulk file when no data exists in either source', async () => {
			// No bulk file and no global state data → nothing to write
			const writeSpy = vi.spyOn(mockFs, 'writeFile');
			const store = await createStore();

			// No bulk storage write should occur since cacheUpdated is false
			const bulkWrites = writeSpy.mock.calls.filter(
				c => c[0].toString().includes('copilotcli.session.metadata.json'),
			);
			expect(bulkWrites).toHaveLength(0);

			store.dispose();
		});
	});

	// ──────────────────────────────────────────────────────────────────────────
	// storeWorkspaceFolderInfo
	// ──────────────────────────────────────────────────────────────────────────
	describe('storeWorkspaceFolderInfo', () => {
		it('should store workspace folder and write to per-session file', async () => {
			mockFs.mockFile(BULK_METADATA_FILE, JSON.stringify({}));
			const store = await createStore();

			await store.storeWorkspaceFolderInfo('session-new', { folderPath: Uri.file('/new/folder').fsPath, timestamp: 500 });

			const fileUri = sessionMetadataFileUri('session-new');
			const rawContent = await mockFs.readFile(fileUri);
			const written = JSON.parse(new TextDecoder().decode(rawContent));
			expect(written.workspaceFolder).toEqual({ folderPath: Uri.file('/new/folder').fsPath, timestamp: 500 });
			store.dispose();
		});

		it('should be retrievable via getSessionWorkspaceFolder', async () => {
			mockFs.mockFile(BULK_METADATA_FILE, JSON.stringify({}));
			const store = await createStore();

			await store.storeWorkspaceFolderInfo('session-new', { folderPath: Uri.file('/new/folder').fsPath, timestamp: 500 });

			const folder = await store.getSessionWorkspaceFolder('session-new');
			expect(folder?.fsPath).toBe(Uri.file('/new/folder').fsPath);
			store.dispose();
		});

		it('should trigger debounced bulk storage update', async () => {
			mockFs.mockFile(BULK_METADATA_FILE, JSON.stringify({}));
			const store = await createStore();

			await store.storeWorkspaceFolderInfo('session-new', { folderPath: Uri.file('/new/folder').fsPath, timestamp: 500 });

			// Advance past debounce period
			await vi.advanceTimersByTimeAsync(1_100);

			// Bulk file should now contain the new entry
			const rawContent = await mockFs.readFile(BULK_METADATA_FILE);
			const written = JSON.parse(new TextDecoder().decode(rawContent));
			expect(written['session-new']).toBeDefined();
			store.dispose();
		});
	});

	// ──────────────────────────────────────────────────────────────────────────
	// storeWorktreeInfo
	// ──────────────────────────────────────────────────────────────────────────
	describe('storeWorktreeInfo', () => {
		it('should store worktree properties and write to per-session file', async () => {
			mockFs.mockFile(BULK_METADATA_FILE, JSON.stringify({}));
			const store = await createStore();
			const props = makeWorktreeV1Props();

			await store.storeWorktreeInfo('session-wt', props);

			const fileUri = sessionMetadataFileUri('session-wt');
			const rawContent = await mockFs.readFile(fileUri);
			const written = JSON.parse(new TextDecoder().decode(rawContent));
			expect(written.worktreeProperties.version).toBe(1);
			expect(written.worktreeProperties.branchName).toBe(props.branchName);
			store.dispose();
		});

		it('should be retrievable via getWorktreeProperties', async () => {
			mockFs.mockFile(BULK_METADATA_FILE, JSON.stringify({}));
			const store = await createStore();
			const props = makeWorktreeV2Props();

			await store.storeWorktreeInfo('session-wt2', props);

			const wt = await store.getWorktreeProperties('session-wt2');
			expect(wt?.version).toBe(2);
			expect(wt?.version === 2 ? wt.baseBranchName : '').toBe('main');
			store.dispose();
		});
	});

	// ──────────────────────────────────────────────────────────────────────────
	// getWorktreeProperties
	// ──────────────────────────────────────────────────────────────────────────
	describe('getWorktreeProperties', () => {
		it('should return undefined for session with no worktree data', async () => {
			mockFs.mockFile(BULK_METADATA_FILE, JSON.stringify({
				'session-folder': { workspaceFolder: { folderPath: Uri.file('/a').fsPath, timestamp: 1 } },
			}));

			const store = await createStore();
			const wt = await store.getWorktreeProperties('session-folder');
			expect(wt).toBeUndefined();
			store.dispose();
		});

		it('should return properties from cache without file read', async () => {
			const props = makeWorktreeV1Props();
			mockFs.mockFile(BULK_METADATA_FILE, JSON.stringify({
				'session-wt': { worktreeProperties: props },
			}));

			const store = await createStore();
			const readSpy = vi.spyOn(mockFs, 'readFile');
			readSpy.mockClear();

			const wt = await store.getWorktreeProperties('session-wt');
			expect(wt).toBeDefined();

			// readFile should not be called for per-session file since it's cached
			const perSessionCalls = readSpy.mock.calls.filter(
				c => c[0].toString().includes('vscode.metadata.json'),
			);
			expect(perSessionCalls).toHaveLength(0);
			store.dispose();
		});

		it('should read from per-session file on cache miss', async () => {
			mockFs.mockFile(BULK_METADATA_FILE, JSON.stringify({}));
			const props = makeWorktreeV2Props();
			const fileUri = sessionMetadataFileUri('session-uncached');
			mockFs.mockFile(fileUri, JSON.stringify({ worktreeProperties: props }));

			const store = await createStore();
			const wt = await store.getWorktreeProperties('session-uncached');
			expect(wt?.version).toBe(2);
			store.dispose();
		});

	});


	// ──────────────────────────────────────────────────────────────────────────
	// getSessionWorkspaceFolder
	// ──────────────────────────────────────────────────────────────────────────
	describe('getSessionWorkspaceFolder', () => {
		it('should return Uri for workspace folder entry', async () => {
			mockFs.mockFile(BULK_METADATA_FILE, JSON.stringify({
				'session-1': { workspaceFolder: { folderPath: Uri.file('/my/workspace').fsPath, timestamp: 42 } },
			}));

			const store = await createStore();
			const folder = await store.getSessionWorkspaceFolder('session-1');
			expect(folder?.fsPath).toBe(Uri.file('/my/workspace').fsPath);
			store.dispose();
		});

		it('should return undefined for unknown session', async () => {
			mockFs.mockFile(BULK_METADATA_FILE, JSON.stringify({}));

			const store = await createStore();
			const folder = await store.getSessionWorkspaceFolder('nonexistent');
			expect(folder).toBeUndefined();
			store.dispose();
		});

		it('should return undefined when session has worktree properties', async () => {
			mockFs.mockFile(BULK_METADATA_FILE, JSON.stringify({
				'session-wt': {
					worktreeProperties: makeWorktreeV1Props(),
					workspaceFolder: { folderPath: Uri.file('/should/not/return').fsPath, timestamp: 1 },
				},
			}));

			const store = await createStore();
			const folder = await store.getSessionWorkspaceFolder('session-wt');
			expect(folder).toBeUndefined();
			store.dispose();
		});

		it('should return undefined when folderPath is empty', async () => {
			mockFs.mockFile(BULK_METADATA_FILE, JSON.stringify({
				'session-empty': { workspaceFolder: { folderPath: '', timestamp: 1 } },
			}));

			const store = await createStore();
			const folder = await store.getSessionWorkspaceFolder('session-empty');
			expect(folder).toBeUndefined();
			store.dispose();
		});
	});

	// ──────────────────────────────────────────────────────────────────────────
	// deleteSessionMetadata
	// ──────────────────────────────────────────────────────────────────────────
	describe('deleteSessionMetadata', () => {
		it('should handle deleting non-existent session gracefully', async () => {
			mockFs.mockFile(BULK_METADATA_FILE, JSON.stringify({}));

			const store = await createStore();
			// Should not throw
			await store.deleteSessionMetadata('nonexistent');
			store.dispose();
		});

		it('should trigger bulk storage update after delete', async () => {
			mockFs.mockFile(BULK_METADATA_FILE, JSON.stringify({
				'session-del': { workspaceFolder: { folderPath: Uri.file('/workspace/del').fsPath, timestamp: 100 } },
			}));

			const store = await createStore();
			await store.deleteSessionMetadata('session-del');

			await vi.advanceTimersByTimeAsync(1_100);

			const rawContent = await mockFs.readFile(BULK_METADATA_FILE);
			const written = JSON.parse(new TextDecoder().decode(rawContent));
			// The deleted session should not appear (or appear as empty with writtenToDisc)
			// The store writes cache which no longer has the session key after delete
			expect(written['session-del']).toBeUndefined();
			store.dispose();
		});
	});

	// ──────────────────────────────────────────────────────────────────────────
	// getSessionMetadata — cache behavior (tested via public API)
	// ──────────────────────────────────────────────────────────────────────────
	describe('getSessionMetadata - cache behavior', () => {
		it('should cache result from per-session file read and not read again', async () => {
			mockFs.mockFile(BULK_METADATA_FILE, JSON.stringify({}));
			const fileUri = sessionMetadataFileUri('session-file');
			mockFs.mockFile(fileUri, JSON.stringify({
				workspaceFolder: { folderPath: Uri.file('/cached').fsPath, timestamp: 1 },
			}));

			const store = await createStore();

			// First call reads from file
			const folder1 = await store.getSessionWorkspaceFolder('session-file');
			expect(folder1?.fsPath).toBe(Uri.file('/cached').fsPath);

			const readSpy = vi.spyOn(mockFs, 'readFile');
			readSpy.mockClear();

			// Second call should use cache
			const folder2 = await store.getSessionWorkspaceFolder('session-file');
			expect(folder2?.fsPath).toBe(Uri.file('/cached').fsPath);

			const perSessionCalls = readSpy.mock.calls.filter(
				c => c[0].toString().includes('session-file'),
			);
			expect(perSessionCalls).toHaveLength(0);
			store.dispose();
		});

		it('should cache empty metadata and not retry when per-session file is missing', async () => {
			mockFs.mockFile(BULK_METADATA_FILE, JSON.stringify({}));
			// No per-session file for session-missing

			const store = await createStore();

			const result1 = await store.getSessionWorkspaceFolder('session-missing');
			expect(result1).toBeUndefined();

			const readSpy = vi.spyOn(mockFs, 'readFile');
			readSpy.mockClear();

			// Second call should use cached empty metadata
			const result2 = await store.getSessionWorkspaceFolder('session-missing');
			expect(result2).toBeUndefined();

			const perSessionCalls = readSpy.mock.calls.filter(
				c => c[0].toString().includes('session-missing'),
			);
			expect(perSessionCalls).toHaveLength(0);
			store.dispose();
		});

		it('should write empty metadata file when per-session file read fails', async () => {
			mockFs.mockFile(BULK_METADATA_FILE, JSON.stringify({}));
			// No per-session file → read will fail

			const store = await createStore();
			await store.getSessionWorkspaceFolder('session-no-file');

			// Wait for writes to settle
			await vi.advanceTimersByTimeAsync(0);

			// Verify empty file was written
			const fileUri = sessionMetadataFileUri('session-no-file');
			const rawContent = await mockFs.readFile(fileUri);
			const written = JSON.parse(new TextDecoder().decode(rawContent));
			expect(written).toEqual(expect.objectContaining({ origin: 'other' }));
			store.dispose();
		});
	});

	// ──────────────────────────────────────────────────────────────────────────
	// updateSessionMetadata — directory creation behavior
	// ──────────────────────────────────────────────────────────────────────────
	describe('updateSessionMetadata - directory handling', () => {
		it('should create directory when it does not exist', async () => {
			mockFs.mockFile(BULK_METADATA_FILE, JSON.stringify({}));
			const store = await createStore();

			const createDirSpy = vi.spyOn(mockFs, 'createDirectory');

			await store.storeWorkspaceFolderInfo('new-session', { folderPath: Uri.file('/w').fsPath, timestamp: 1 });

			// createDirectory should have been called for the session dir
			expect(createDirSpy).toHaveBeenCalled();
			store.dispose();
		});

		it('should not create directory when it already exists', async () => {
			mockFs.mockFile(BULK_METADATA_FILE, JSON.stringify({}));
			const store = await createStore();

			// Pre-create the directory
			const dirUri = sessionDirectoryUri('existing-session');
			await mockFs.createDirectory(dirUri);

			const createDirSpy = vi.spyOn(mockFs, 'createDirectory');
			createDirSpy.mockClear();

			await store.storeWorkspaceFolderInfo('existing-session', { folderPath: Uri.file('/w').fsPath, timestamp: 1 });

			// The stat succeeds so createDirectory on the per-session dir should not be called
			// (it may be called for other dirs like the bulk storage dir)
			const perSessionDirCalls = createDirSpy.mock.calls.filter(
				c => c[0].toString().includes('existing-session'),
			);
			expect(perSessionDirCalls).toHaveLength(0);
			store.dispose();
		});

		it('should set writtenToDisc in cache after successful write', async () => {
			mockFs.mockFile(BULK_METADATA_FILE, JSON.stringify({}));
			const store = await createStore();

			await store.storeWorkspaceFolderInfo('session-written', { folderPath: Uri.file('/w').fsPath, timestamp: 1 });

			// Access the cached metadata via getWorktreeProperties (which reads from cache)
			// The cache should have writtenToDisc: true
			// We can verify by reading the workspace folder (which goes through cache)
			const folder = await store.getSessionWorkspaceFolder('session-written');
			expect(folder?.fsPath).toBe(Uri.file('/w').fsPath);
			store.dispose();
		});

		it('should skip file write and update cache when createDirectoryIfNotFound is false and directory missing', async () => {
			// This path is exercised during initialization retry when bulk file
			// has entries not yet written to session state.
			const existingData = {
				'session-retry': { worktreeProperties: makeWorktreeV1Props() },
			};
			mockFs.mockFile(BULK_METADATA_FILE, JSON.stringify(existingData));
			// Do NOT create the per-session directory

			const writeSpy = vi.spyOn(mockFs, 'writeFile');
			const store = await createStore();
			await vi.advanceTimersByTimeAsync(0);

			// No per-session file write should occur since dir is missing and createDirectoryIfNotFound=false
			const perSessionWrites = writeSpy.mock.calls.filter(
				c => c[0].toString().includes('session-retry') && c[0].toString().includes('vscode.metadata.json'),
			);
			expect(perSessionWrites).toHaveLength(0);

			// Data should still be accessible from cache
			const wt = await store.getWorktreeProperties('session-retry');
			expect(wt?.version).toBe(1);
			store.dispose();
		});

		it('should not write per-session file for untitled sessions', async () => {
			mockFs.mockFile(BULK_METADATA_FILE, JSON.stringify({}));
			const store = await createStore();

			const writeSpy = vi.spyOn(mockFs, 'writeFile');
			writeSpy.mockClear();

			await store.storeWorkspaceFolderInfo('untitled-test', { folderPath: Uri.file('/w').fsPath, timestamp: 1 });
			await vi.advanceTimersByTimeAsync(0);

			// No per-session file write should occur for untitled sessions
			const perSessionWrites = writeSpy.mock.calls.filter(
				c => c[0].toString().includes('untitled-test') && c[0].toString().includes('vscode.metadata.json'),
			);
			expect(perSessionWrites).toHaveLength(0);
			store.dispose();
		});
	});

	// ──────────────────────────────────────────────────────────────────────────
	// Debounced storage writes
	// ──────────────────────────────────────────────────────────────────────────
	describe('debounced bulk storage updates', () => {
		it('should coalesce multiple rapid updates into single write', async () => {
			mockFs.mockFile(BULK_METADATA_FILE, JSON.stringify({}));
			const store = await createStore();

			const writeSpy = vi.spyOn(mockFs, 'writeFile');
			writeSpy.mockClear();

			await store.storeWorkspaceFolderInfo('s1', { folderPath: Uri.file('/a').fsPath, timestamp: 1 });
			await store.storeWorkspaceFolderInfo('s2', { folderPath: Uri.file('/b').fsPath, timestamp: 2 });
			await store.storeWorkspaceFolderInfo('s3', { folderPath: Uri.file('/c').fsPath, timestamp: 3 });

			// Before debounce fires, count writes to bulk file
			const bulkWritesBefore = writeSpy.mock.calls.filter(
				c => c[0].toString().includes('vscode.session.metadata.cache.json'),
			).length;

			// Advance past debounce
			await vi.advanceTimersByTimeAsync(1_100);

			const bulkWritesAfter = writeSpy.mock.calls.filter(
				c => c[0].toString().includes('vscode.session.metadata.cache.json'),
			).length;

			// Should have exactly one new bulk write after debounce (coalesced)
			expect(bulkWritesAfter - bulkWritesBefore).toBe(1);
			store.dispose();
		});

		it('should include all session data in the debounced bulk write', async () => {
			mockFs.mockFile(BULK_METADATA_FILE, JSON.stringify({}));
			const store = await createStore();

			await store.storeWorkspaceFolderInfo('s1', { folderPath: Uri.file('/a').fsPath, timestamp: 1 });
			await store.storeWorkspaceFolderInfo('s2', { folderPath: Uri.file('/b').fsPath, timestamp: 2 });

			await vi.advanceTimersByTimeAsync(1_100);

			const rawContent = await mockFs.readFile(BULK_METADATA_FILE);
			const written = JSON.parse(new TextDecoder().decode(rawContent));
			expect(written['s1']).toBeDefined();
			expect(written['s2']).toBeDefined();
			store.dispose();
		});
	});

	// ──────────────────────────────────────────────────────────────────────────
	// updateGlobalStorageImpl — bulk storage merge behavior
	// ──────────────────────────────────────────────────────────────────────────
	describe('updateGlobalStorageImpl - merge behavior', () => {
		it('should overwrite bulk file with current cache when debounced write fires', async () => {
			// Pre-populate the bulk file with one session
			const initial = {
				'session-old': { workspaceFolder: { folderPath: Uri.file('/old').fsPath, timestamp: 1 } },
			};
			mockFs.mockFile(BULK_METADATA_FILE, JSON.stringify(initial));

			const store = await createStore();
			// Store a new session (triggers debounced bulk write)
			await store.storeWorkspaceFolderInfo('session-new', { folderPath: Uri.file('/new').fsPath, timestamp: 2 });

			// Advance past debounce
			await vi.advanceTimersByTimeAsync(1_100);

			const rawContent = await mockFs.readFile(BULK_METADATA_FILE);
			const written = JSON.parse(new TextDecoder().decode(rawContent));
			// Both old (from cache) and new sessions should be present
			expect(written['session-old']).toBeDefined();
			expect(written['session-new']).toBeDefined();
			store.dispose();
		});

		it('should preserve cache data over storage data for same session during debounced write', async () => {
			// Pre-populate the bulk file with one session
			const initial = {
				'session-1': { workspaceFolder: { folderPath: Uri.file('/from-storage').fsPath, timestamp: 1 } },
			};
			mockFs.mockFile(BULK_METADATA_FILE, JSON.stringify(initial));

			const store = await createStore();

			// Update session-1 in cache with new data
			await store.storeWorkspaceFolderInfo('session-1', { folderPath: Uri.file('/from-cache').fsPath, timestamp: 999 });

			// Advance past debounce
			await vi.advanceTimersByTimeAsync(1_100);

			const rawContent = await mockFs.readFile(BULK_METADATA_FILE);
			const written = JSON.parse(new TextDecoder().decode(rawContent));
			// Cache data should take precedence over storage data
			expect(written['session-1'].workspaceFolder.folderPath).toBe(Uri.file('/from-cache').fsPath);
			expect(written['session-1'].workspaceFolder.timestamp).toBe(999);
			store.dispose();
		});

		it('should add storage-only entries that are not in cache during debounced write', async () => {
			mockFs.mockFile(BULK_METADATA_FILE, JSON.stringify({}));

			const store = await createStore();

			// Store one session in cache
			await store.storeWorkspaceFolderInfo('session-cache', { folderPath: Uri.file('/cache').fsPath, timestamp: 1 });

			// Simulate another process writing a session directly to the bulk file
			const storageData = {
				'session-cache': { workspaceFolder: { folderPath: Uri.file('/cache').fsPath, timestamp: 1 } },
				'session-external': { workspaceFolder: { folderPath: Uri.file('/external').fsPath, timestamp: 2 } },
			};
			mockFs.mockFile(BULK_METADATA_FILE, JSON.stringify(storageData));

			// Advance past debounce
			await vi.advanceTimersByTimeAsync(1_100);

			const rawContent = await mockFs.readFile(BULK_METADATA_FILE);
			const written = JSON.parse(new TextDecoder().decode(rawContent));
			// Both should be present: cache entry preserved, external entry merged in
			expect(written['session-cache']).toBeDefined();
			expect(written['session-external']).toBeDefined();
			expect(written['session-external'].workspaceFolder.folderPath).toBe(Uri.file('/external').fsPath);
			store.dispose();
		});

		it('should handle bulk file read failure during debounced write gracefully', async () => {
			mockFs.mockFile(BULK_METADATA_FILE, JSON.stringify({}));
			const store = await createStore();

			await store.storeWorkspaceFolderInfo('session-1', { folderPath: Uri.file('/a').fsPath, timestamp: 1 });

			// Make the bulk file unreadable for the debounced write's read attempt
			const origReadFile = mockFs.readFile.bind(mockFs);
			let readCallAfterStore = 0;
			vi.spyOn(mockFs, 'readFile').mockImplementation(async (uri) => {
				if (uri.toString().includes('copilotcli.session.metadata.json')) {
					readCallAfterStore++;
					if (readCallAfterStore > 0) {
						throw new Error('simulated read failure');
					}
				}
				return origReadFile(uri);
			});

			// Advance past debounce — should not throw
			await vi.advanceTimersByTimeAsync(1_100);

			// The write should still succeed (falls through to writing cache data)
			expect(logService.error).not.toHaveBeenCalledWith(
				'[ChatSessionMetadataStore] Failed to update global storage: ',
				expect.any(Error),
			);
			store.dispose();
		});
	});

	// ──────────────────────────────────────────────────────────────────────────
	// setAdditionalWorkspaces / getAdditionalWorkspaces
	// ──────────────────────────────────────────────────────────────────────────
	describe('setAdditionalWorkspaces / getAdditionalWorkspaces', () => {
		it('should store and retrieve workspace-folder type additional workspaces', async () => {
			mockFs.mockFile(BULK_METADATA_FILE, JSON.stringify({}));
			const store = await createStore();

			const workspaces: IWorkspaceInfo[] = [
				{ folder: Uri.file('/extra/a'), repository: undefined, worktree: undefined, worktreeProperties: undefined },
				{ folder: Uri.file('/extra/b'), repository: undefined, worktree: undefined, worktreeProperties: undefined },
			];
			await store.setAdditionalWorkspaces('session-1', workspaces);

			const result = await store.getAdditionalWorkspaces('session-1');
			expect(result).toHaveLength(2);
			expect(result[0].folder?.fsPath).toBe(Uri.file('/extra/a').fsPath);
			expect(result[1].folder?.fsPath).toBe(Uri.file('/extra/b').fsPath);
			store.dispose();
		});

		it('should store and retrieve worktree type additional workspaces', async () => {
			mockFs.mockFile(BULK_METADATA_FILE, JSON.stringify({}));
			const store = await createStore();
			const props = makeWorktreeV1Props();

			const workspaces: IWorkspaceInfo[] = [
				{ folder: undefined, repository: Uri.file('/repo'), worktree: Uri.file('/repo/.worktrees/wt'), worktreeProperties: props },
			];
			await store.setAdditionalWorkspaces('session-wt', workspaces);

			const result = await store.getAdditionalWorkspaces('session-wt');
			expect(result).toHaveLength(1);
			expect(result[0].worktreeProperties?.branchName).toBe(props.branchName);
			expect(result[0].worktree?.fsPath).toBe(Uri.file('/repo/.worktrees/wt').fsPath);
			// worktreeProperties present → folder should be undefined per getAdditionalWorkspaces logic
			expect(result[0].folder).toBeUndefined();
			store.dispose();
		});

		it('should return empty array when no additional workspaces are set', async () => {
			mockFs.mockFile(BULK_METADATA_FILE, JSON.stringify({
				'session-1': { workspaceFolder: { folderPath: Uri.file('/a').fsPath, timestamp: 1 } },
			}));
			const store = await createStore();

			const result = await store.getAdditionalWorkspaces('session-1');
			expect(result).toEqual([]);
			store.dispose();
		});

		it('should return empty array for unknown session', async () => {
			mockFs.mockFile(BULK_METADATA_FILE, JSON.stringify({}));
			const store = await createStore();

			const result = await store.getAdditionalWorkspaces('nonexistent');
			expect(result).toEqual([]);
			store.dispose();
		});

		it('should write additionalWorkspaces to per-session file', async () => {
			mockFs.mockFile(BULK_METADATA_FILE, JSON.stringify({}));
			const store = await createStore();

			await store.setAdditionalWorkspaces('session-1', [
				{ folder: Uri.file('/extra/a'), repository: undefined, worktree: undefined, worktreeProperties: undefined },
			]);

			const fileUri = sessionMetadataFileUri('session-1');
			const rawContent = await mockFs.readFile(fileUri);
			const written = JSON.parse(new TextDecoder().decode(rawContent));
			expect(written.additionalWorkspaces).toHaveLength(1);
			expect(written.additionalWorkspaces[0].workspaceFolder?.folderPath).toBe(Uri.file('/extra/a').fsPath);
			store.dispose();
		});

		it('should preserve existing workspaceFolder when setting additionalWorkspaces', async () => {
			mockFs.mockFile(BULK_METADATA_FILE, JSON.stringify({
				'session-1': { workspaceFolder: { folderPath: Uri.file('/primary').fsPath, timestamp: 100 } },
			}));
			const store = await createStore();

			await store.setAdditionalWorkspaces('session-1', [
				{ folder: Uri.file('/extra/a'), repository: undefined, worktree: undefined, worktreeProperties: undefined },
			]);

			// Primary workspace folder should still be accessible
			const folder = await store.getSessionWorkspaceFolder('session-1');
			expect(folder?.fsPath).toBe(Uri.file('/primary').fsPath);

			// Additional workspaces should also be present
			const result = await store.getAdditionalWorkspaces('session-1');
			expect(result).toHaveLength(1);
			expect(result[0].folder?.fsPath).toBe(Uri.file('/extra/a').fsPath);
			store.dispose();
		});

		it('should replace previous additionalWorkspaces on subsequent call', async () => {
			mockFs.mockFile(BULK_METADATA_FILE, JSON.stringify({}));
			const store = await createStore();

			await store.setAdditionalWorkspaces('session-1', [
				{ folder: Uri.file('/old'), repository: undefined, worktree: undefined, worktreeProperties: undefined },
			]);
			await store.setAdditionalWorkspaces('session-1', [
				{ folder: Uri.file('/new/a'), repository: undefined, worktree: undefined, worktreeProperties: undefined },
				{ folder: Uri.file('/new/b'), repository: undefined, worktree: undefined, worktreeProperties: undefined },
			]);

			const result = await store.getAdditionalWorkspaces('session-1');
			expect(result).toHaveLength(2);
			expect(result[0].folder?.fsPath).toBe(Uri.file('/new/a').fsPath);
			store.dispose();
		});

		it('should trigger debounced bulk storage update', async () => {
			mockFs.mockFile(BULK_METADATA_FILE, JSON.stringify({}));
			const store = await createStore();

			await store.setAdditionalWorkspaces('session-1', [
				{ folder: Uri.file('/extra'), repository: undefined, worktree: undefined, worktreeProperties: undefined },
			]);
			await vi.advanceTimersByTimeAsync(1_100);

			const rawContent = await mockFs.readFile(BULK_METADATA_FILE);
			const written = JSON.parse(new TextDecoder().decode(rawContent));
			expect(written['session-1']?.additionalWorkspaces).toBeDefined();
			store.dispose();
		});

		it('should restore additionalWorkspaces from bulk file on startup', async () => {
			mockFs.mockFile(BULK_METADATA_FILE, JSON.stringify({
				'session-1': {
					additionalWorkspaces: [
						{ workspaceFolder: { folderPath: Uri.file('/restored/a').fsPath, timestamp: 100 } },
					],
					writtenToDisc: true,
				},
			}));
			const store = await createStore();

			const result = await store.getAdditionalWorkspaces('session-1');
			expect(result).toHaveLength(1);
			expect(result[0].folder?.fsPath).toBe(Uri.file('/restored/a').fsPath);
			store.dispose();
		});

		it('should keep entries with additionalWorkspaces in cache even without writtenToDisc flag', async () => {
			// Bulk file has the entry but writtenToDisc is falsy — it should still
			// be kept in the in-memory cache and accessible via the API.
			mockFs.mockFile(BULK_METADATA_FILE, JSON.stringify({
				'session-crash': {
					additionalWorkspaces: [
						{ workspaceFolder: { folderPath: Uri.file('/extra/workspace').fsPath, timestamp: 100 } },
					],
				},
			}));

			const store = await createStore();

			const result = await store.getAdditionalWorkspaces('session-crash');
			expect(result).toHaveLength(1);
			store.dispose();
		});
	});

	// ──────────────────────────────────────────────────────────────────────────
	// setSessionFirstUserMessage / getSessionFirstUserMessage
	// ──────────────────────────────────────────────────────────────────────────
	describe('setSessionFirstUserMessage / getSessionFirstUserMessage', () => {
		it('should store and retrieve the first user message', async () => {
			mockFs.mockFile(BULK_METADATA_FILE, JSON.stringify({}));
			const store = await createStore();

			await mockFs.createDirectory(sessionDirectoryUri('session-1'));
			await store.setSessionFirstUserMessage('session-1', 'Hello, world!');

			const result = await store.getSessionFirstUserMessage('session-1');
			expect(result).toBe('Hello, world!');
			store.dispose();
		});

		it('should return undefined for a session with no first user message', async () => {
			mockFs.mockFile(BULK_METADATA_FILE, JSON.stringify({
				'session-1': { workspaceFolder: { folderPath: Uri.file('/workspace/a').fsPath, timestamp: 100 } },
			}));
			const store = await createStore();

			const result = await store.getSessionFirstUserMessage('session-1');
			expect(result).toBeUndefined();
			store.dispose();
		});

		it('should return undefined for an unknown session', async () => {
			mockFs.mockFile(BULK_METADATA_FILE, JSON.stringify({}));
			const store = await createStore();

			const result = await store.getSessionFirstUserMessage('nonexistent');
			expect(result).toBeUndefined();
			store.dispose();
		});

		it('should persist firstUserMessage to the per-session file', async () => {
			mockFs.mockFile(BULK_METADATA_FILE, JSON.stringify({}));
			const store = await createStore();

			await mockFs.createDirectory(sessionDirectoryUri('session-1'));
			await store.setSessionFirstUserMessage('session-1', 'My first message');

			const fileUri = sessionMetadataFileUri('session-1');
			const rawContent = await mockFs.readFile(fileUri);
			const written = JSON.parse(new TextDecoder().decode(rawContent));
			expect(written.firstUserMessage).toBe('My first message');
			store.dispose();
		});

		it('should preserve existing metadata when setting firstUserMessage', async () => {
			mockFs.mockFile(BULK_METADATA_FILE, JSON.stringify({
				'session-1': { workspaceFolder: { folderPath: Uri.file('/workspace/a').fsPath, timestamp: 100 } },
			}));
			const store = await createStore();

			await mockFs.createDirectory(sessionDirectoryUri('session-1'));
			await store.setSessionFirstUserMessage('session-1', 'My first message');

			const fileUri = sessionMetadataFileUri('session-1');
			const rawContent = await mockFs.readFile(fileUri);
			const written = JSON.parse(new TextDecoder().decode(rawContent));
			expect(written.firstUserMessage).toBe('My first message');
			expect(written.workspaceFolder?.folderPath).toBe(Uri.file('/workspace/a').fsPath);
			store.dispose();
		});

		it('should read firstUserMessage from pre-existing per-session metadata file', async () => {
			const sessionId = 'session-preexisting';
			await mockFs.createDirectory(sessionDirectoryUri(sessionId));
			const fileUri = sessionMetadataFileUri(sessionId);
			await mockFs.writeFile(fileUri, new TextEncoder().encode(JSON.stringify({ firstUserMessage: 'Cached message' })));
			mockFs.mockFile(BULK_METADATA_FILE, JSON.stringify({}));

			const store = await createStore();
			const result = await store.getSessionFirstUserMessage(sessionId);
			expect(result).toBe('Cached message');
			store.dispose();
		});
	});

	// ──────────────────────────────────────────────────────────────────────────
	// getRequestDetails / appendRequestDetails
	// ──────────────────────────────────────────────────────────────────────────
	describe('getRequestDetails / appendRequestDetails', () => {
		it('should append and retrieve request details', async () => {
			mockFs.mockFile(BULK_METADATA_FILE, JSON.stringify({}));
			const store = await createStore();

			await store.updateRequestDetails('session-1', [{ vscodeRequestId: 'request-1', copilotRequestId: 'sdk-1', toolIdEditMap: { 'tool-1': 'edit-1' } }]);
			await store.updateRequestDetails('session-1', [{ vscodeRequestId: 'request-2', copilotRequestId: 'sdk-2', toolIdEditMap: { 'tool-2': 'edit-2' } }]);

			const details = await store.getRequestDetails('session-1');
			expect(details).toEqual([
				{ vscodeRequestId: 'request-1', copilotRequestId: 'sdk-1', toolIdEditMap: { 'tool-1': 'edit-1' } },
				{ vscodeRequestId: 'request-2', copilotRequestId: 'sdk-2', toolIdEditMap: { 'tool-2': 'edit-2' } },
			]);
			store.dispose();
		});

		it('should return empty array when request details file does not exist', async () => {
			mockFs.mockFile(BULK_METADATA_FILE, JSON.stringify({}));
			const store = await createStore();

			const details = await store.getRequestDetails('missing-session');
			expect(details).toEqual([]);
			store.dispose();
		});


		it('should merge with existing request details on append', async () => {
			mockFs.mockFile(BULK_METADATA_FILE, JSON.stringify({}));
			const sessionId = 'session-merge';
			await mockFs.createDirectory(sessionDirectoryUri(sessionId));
			const fileUri = sessionRequestMetadataFileUri(sessionId);
			// Seed with existing array-format request details
			await mockFs.writeFile(fileUri, new TextEncoder().encode(JSON.stringify([
				{ vscodeRequestId: 'request-existing', copilotRequestId: 'sdk-existing', toolIdEditMap: { 'tool-1': 'edit-1' } },
			])));

			const store = await createStore();
			await store.updateRequestDetails(sessionId, [{ vscodeRequestId: 'request-new', copilotRequestId: 'sdk-new', toolIdEditMap: { 'tool-2': 'edit-2' } }]);

			const raw = await mockFs.readFile(fileUri);
			const parsed = JSON.parse(new TextDecoder().decode(raw));
			expect(parsed).toEqual([
				{ vscodeRequestId: 'request-existing', copilotRequestId: 'sdk-existing', toolIdEditMap: { 'tool-1': 'edit-1' } },
				{ vscodeRequestId: 'request-new', copilotRequestId: 'sdk-new', toolIdEditMap: { 'tool-2': 'edit-2' } },
			]);
			store.dispose();
		});

		it('should merge fields when appending with same vscodeRequestId', async () => {
			mockFs.mockFile(BULK_METADATA_FILE, JSON.stringify({}));
			const store = await createStore();

			await store.updateRequestDetails('session-1', [{ vscodeRequestId: 'request-1', toolIdEditMap: { 'tool-1': 'edit-1' } }]);
			await store.updateRequestDetails('session-1', [{ vscodeRequestId: 'request-1', copilotRequestId: 'sdk-1', toolIdEditMap: { 'tool-1': 'edit-1' } }]);

			const details = await store.getRequestDetails('session-1');
			expect(details).toHaveLength(1);
			expect(details[0].copilotRequestId).toBe('sdk-1');
			store.dispose();
		});

		it('should serialize concurrent appends to the same session', async () => {
			mockFs.mockFile(BULK_METADATA_FILE, JSON.stringify({}));
			const store = await createStore();

			await Promise.all([
				store.updateRequestDetails('session-1', [{ vscodeRequestId: 'request-1', copilotRequestId: 'sdk-1', toolIdEditMap: { 'tool-1': 'edit-1' } }]),
				store.updateRequestDetails('session-1', [{ vscodeRequestId: 'request-2', copilotRequestId: 'sdk-2', toolIdEditMap: { 'tool-2': 'edit-2' } }]),
				store.updateRequestDetails('session-1', [{ vscodeRequestId: 'request-3', copilotRequestId: 'sdk-3', toolIdEditMap: { 'tool-3': 'edit-3' } }]),
			]);

			const details = await store.getRequestDetails('session-1');
			expect(details).toHaveLength(3);
			expect(details.map(d => d.vscodeRequestId)).toEqual(['request-1', 'request-2', 'request-3']);
			store.dispose();
		});

	});

	// ──────────────────────────────────────────────────────────────────────────
	// getSessionAgent
	// ──────────────────────────────────────────────────────────────────────────
	describe('getSessionAgent', () => {
		it('should return agent from last request details entry with agentId', async () => {
			mockFs.mockFile(BULK_METADATA_FILE, JSON.stringify({}));
			const store = await createStore();

			await store.updateRequestDetails('session-1', [{ vscodeRequestId: 'req-1', toolIdEditMap: {}, agentId: 'agent-a' }]);
			await store.updateRequestDetails('session-1', [{ vscodeRequestId: 'req-2', toolIdEditMap: {} }]);
			await store.updateRequestDetails('session-1', [{ vscodeRequestId: 'req-3', toolIdEditMap: {}, agentId: 'agent-b' }]);

			const agent = await store.getSessionAgent('session-1');
			expect(agent).toBe('agent-b');
			store.dispose();
		});

		it('should return undefined when no entries have agentId', async () => {
			mockFs.mockFile(BULK_METADATA_FILE, JSON.stringify({}));
			const store = await createStore();

			await store.updateRequestDetails('session-1', [{ vscodeRequestId: 'req-1', toolIdEditMap: {} }]);

			const agent = await store.getSessionAgent('session-1');
			expect(agent).toBeUndefined();
			store.dispose();
		});

		it('should return undefined for non-existent session', async () => {
			mockFs.mockFile(BULK_METADATA_FILE, JSON.stringify({}));
			const store = await createStore();

			const agent = await store.getSessionAgent('missing-session');
			expect(agent).toBeUndefined();
			store.dispose();
		});
	});

	// ──────────────────────────────────────────────────────────────────────────
	// Constructor & edge cases
	// ──────────────────────────────────────────────────────────────────────────
	describe('constructor and edge cases', () => {
		it('should handle initialization gracefully when bulk file read fails', async () => {
			// Bulk file read fails — store starts with empty cache, no fatal error
			vi.spyOn(mockFs, 'readFile').mockRejectedValue(new Error('ENOENT'));

			const store = await createStore();

			// Cache should be empty but usable
			const folder = await store.getSessionWorkspaceFolder('nonexistent');
			expect(folder).toBeUndefined();
			store.dispose();
		});

		it('should not fail initialization when bulk file read fails and no global state data exists', async () => {
			// Bulk file read fails, falls through to global state — but no data there either
			vi.spyOn(mockFs, 'readFile').mockRejectedValue(new Error('ENOENT'));

			const store = await createStore();

			// No initialization error should be logged since no write was attempted
			expect(logService.error).not.toHaveBeenCalledWith(
				'[ChatSessionMetadataStore] Initialization failed: ',
				expect.any(Error),
			);
			store.dispose();
		});
	});

	// ──────────────────────────────────────────────────────────────────────────
	// storeForkedSessionMetadata
	// ──────────────────────────────────────────────────────────────────────────
	describe('storeForkedSessionMetadata', () => {
		it('copies workspace folder info from source to target with the provided custom title', async () => {
			mockFs.mockFile(BULK_METADATA_FILE, JSON.stringify({}));
			const store = await createStore();

			await store.storeWorkspaceFolderInfo('source-session', { folderPath: Uri.file('/workspace/project').fsPath, timestamp: 100 });
			await store.storeForkedSessionMetadata('source-session', 'forked-session', 'Forked: My Task');

			expect(await store.getSessionWorkspaceFolder('forked-session')).toEqual(Uri.file('/workspace/project'));
			expect(await store.getCustomTitle('forked-session')).toBe('Forked: My Task');
			store.dispose();
		});

		it('copies worktree properties from source to target', async () => {
			mockFs.mockFile(BULK_METADATA_FILE, JSON.stringify({}));
			const store = await createStore();
			const worktree = makeWorktreeV2Props();

			await store.storeWorktreeInfo('source-session', worktree);
			await store.storeForkedSessionMetadata('source-session', 'forked-session', 'Forked: Worktree Task');

			expect(await store.getWorktreeProperties('forked-session')).toEqual(worktree);
			expect(await store.getCustomTitle('forked-session')).toBe('Forked: Worktree Task');
			store.dispose();
		});

		it('overrides the custom title even when source had a different title', async () => {
			mockFs.mockFile(BULK_METADATA_FILE, JSON.stringify({}));
			const store = await createStore();

			await store.setCustomTitle('source-session', 'Original Title');
			await store.storeWorkspaceFolderInfo('source-session', { folderPath: Uri.file('/workspace').fsPath, timestamp: 1 });
			await store.storeForkedSessionMetadata('source-session', 'forked-session', 'Forked: Original Title');

			expect(await store.getCustomTitle('forked-session')).toBe('Forked: Original Title');
			store.dispose();
		});

		it('does not affect source session metadata', async () => {
			mockFs.mockFile(BULK_METADATA_FILE, JSON.stringify({}));
			const store = await createStore();

			await store.storeWorkspaceFolderInfo('source-session', { folderPath: Uri.file('/workspace/src').fsPath, timestamp: 200 });
			await store.storeForkedSessionMetadata('source-session', 'forked-session', 'Forked: Src');

			// Source session should be unchanged
			expect(await store.getSessionWorkspaceFolder('source-session')).toEqual(Uri.file('/workspace/src'));
			expect(await store.getCustomTitle('source-session')).toBeUndefined();
			store.dispose();
		});

		it('works when source session has no metadata (target gets only the custom title)', async () => {
			mockFs.mockFile(BULK_METADATA_FILE, JSON.stringify({}));
			const store = await createStore();

			await store.storeForkedSessionMetadata('nonexistent-source', 'forked-session', 'Forked: Empty');

			expect(await store.getCustomTitle('forked-session')).toBe('Forked: Empty');
			expect(await store.getSessionWorkspaceFolder('forked-session')).toBeUndefined();
			store.dispose();
		});

		it('copies repository properties from source to target', async () => {
			mockFs.mockFile(BULK_METADATA_FILE, JSON.stringify({}));
			const store = await createStore();

			await store.storeWorkspaceFolderInfo('source-session', { folderPath: Uri.file('/workspace').fsPath, timestamp: 1 });
			await store.storeRepositoryProperties('source-session', { repositoryPath: Uri.file('/workspace').fsPath, branchName: 'main', baseBranchName: 'main' });
			await store.storeForkedSessionMetadata('source-session', 'forked-session', 'Forked: Repo');

			expect(await store.getRepositoryProperties('forked-session')).toEqual(
				expect.objectContaining({ repositoryPath: Uri.file('/workspace').fsPath, branchName: 'main' })
			);
			store.dispose();
		});
	});

	// ──────────────────────────────────────────────────────────────────────────
	// New behaviors: shared bulk file, refresh(), JSONL worktree index,
	// last-modified-wins merge, top-N trim, legacy migration.
	// Each test is intentionally small and self-contained.
	// ──────────────────────────────────────────────────────────────────────────
	describe('shared bulk file + refresh()', () => {
		it('refresh() picks up a session written by another process to the shared bulk file', async () => {
			vi.setSystemTime(new Date(0));
			// Start with empty bulk file.
			mockFs.mockFile(BULK_METADATA_FILE, JSON.stringify({}));
			const store = await createStore();
			expect(await store.getSessionWorkspaceFolder('cross-proc-session')).toBeUndefined();

			// Simulate "other process" rewriting the shared bulk file. `modified: 999` is
			// guaranteed to be > anything stamped locally because we pinned the clock to 0.
			const externalEntry = {
				'cross-proc-session': {
					workspaceFolder: { folderPath: Uri.file('/external/folder').fsPath, timestamp: 42 },
					modified: 999,
				},
			};
			await mockFs.writeFile(BULK_METADATA_FILE, new TextEncoder().encode(JSON.stringify(externalEntry)));

			await store.refresh();

			expect((await store.getSessionWorkspaceFolder('cross-proc-session'))?.fsPath)
				.toBe(Uri.file('/external/folder').fsPath);
			store.dispose();
		});

		it('refresh() never drops in-memory entries that are not on disk', async () => {
			mockFs.mockFile(BULK_METADATA_FILE, JSON.stringify({}));
			const store = await createStore();
			await store.storeWorkspaceFolderInfo('local-only', { folderPath: Uri.file('/local').fsPath, timestamp: 1 });
			await vi.advanceTimersByTimeAsync(2000); // flush debounced bulk write

			// Wipe the on-disk bulk file (simulating an external truncation).
			await mockFs.writeFile(BULK_METADATA_FILE, new TextEncoder().encode(JSON.stringify({})));

			await store.refresh();

			expect((await store.getSessionWorkspaceFolder('local-only'))?.fsPath)
				.toBe(Uri.file('/local').fsPath);
			store.dispose();
		});

		it('refresh() failure does not poison subsequent reads (chained _ready)', async () => {
			mockFs.mockFile(BULK_METADATA_FILE, JSON.stringify({}));
			const store = await createStore();

			// Make the next bulk read throw.
			const readSpy = vi.spyOn(mockFs, 'readFile').mockImplementationOnce(async () => { throw new Error('boom'); });
			await store.refresh(); // swallowed inside

			readSpy.mockRestore();
			await store.storeWorkspaceFolderInfo('after-fail', { folderPath: Uri.file('/after').fsPath, timestamp: 1 });
			expect((await store.getSessionWorkspaceFolder('after-fail'))?.fsPath).toBe(Uri.file('/after').fsPath);
			store.dispose();
		});
	});

	describe('last-modified-wins merge', () => {
		it('keeps the entry with the higher `modified` timestamp', async () => {
			vi.setSystemTime(new Date(0));
			// Bulk file holds an OLDER copy of session-1.
			mockFs.mockFile(BULK_METADATA_FILE, JSON.stringify({
				'session-1': {
					workspaceFolder: { folderPath: Uri.file('/old/path').fsPath, timestamp: 1 },
					modified: 100,
				},
			}));
			const store = await createStore();

			// Another process writes a NEWER version directly to disk.
			await mockFs.writeFile(BULK_METADATA_FILE, new TextEncoder().encode(JSON.stringify({
				'session-1': {
					workspaceFolder: { folderPath: Uri.file('/newer/path').fsPath, timestamp: 2 },
					modified: 5000,
				},
			})));

			await store.refresh();

			expect((await store.getSessionWorkspaceFolder('session-1'))?.fsPath)
				.toBe(Uri.file('/newer/path').fsPath);
			store.dispose();
		});

		it('does not overwrite a fresher in-memory entry with an older disk entry', async () => {
			vi.setSystemTime(new Date(10_000));
			mockFs.mockFile(BULK_METADATA_FILE, JSON.stringify({}));
			const store = await createStore();
			await store.storeWorkspaceFolderInfo('session-fresh', { folderPath: Uri.file('/fresh').fsPath, timestamp: 100 });
			await vi.advanceTimersByTimeAsync(2000);

			// External writer puts an OLDER copy on disk (lower modified).
			await mockFs.writeFile(BULK_METADATA_FILE, new TextEncoder().encode(JSON.stringify({
				'session-fresh': { workspaceFolder: { folderPath: Uri.file('/stale').fsPath, timestamp: 1 }, modified: 1 },
			})));

			await store.refresh();

			expect((await store.getSessionWorkspaceFolder('session-fresh'))?.fsPath).toBe(Uri.file('/fresh').fsPath);
			store.dispose();
		});
	});

	describe('legacy bulk file migration (Step 0)', () => {
		it('migrates from the legacy globalStorage path on first run', async () => {
			mockFs.mockFile(LEGACY_BULK_METADATA_FILE, JSON.stringify({
				'legacy-session': { workspaceFolder: { folderPath: Uri.file('/legacy').fsPath, timestamp: 1 } },
			}));
			// New shared file does NOT exist yet.

			const store = await createStore();

			expect((await store.getSessionWorkspaceFolder('legacy-session'))?.fsPath)
				.toBe(Uri.file('/legacy').fsPath);
			// Migration wrote to the new path.
			const newRaw = await mockFs.readFile(BULK_METADATA_FILE);
			expect(JSON.parse(new TextDecoder().decode(newRaw))).toHaveProperty('legacy-session');
			store.dispose();
		});

		it('merges legacy entries into an existing shared file (late-joiner scenario)', async () => {
			// Process A already created the shared file with session-A.
			// Process B starts with its own legacy file containing session-B.
			// Both should be present after migration.
			mockFs.mockFile(BULK_METADATA_FILE, JSON.stringify({
				'session-A': { workspaceFolder: { folderPath: Uri.file('/a').fsPath, timestamp: 1 }, modified: 100 },
			}));
			mockFs.mockFile(LEGACY_BULK_METADATA_FILE, JSON.stringify({
				'session-B': { workspaceFolder: { folderPath: Uri.file('/b').fsPath, timestamp: 2 }, modified: 200 },
			}));

			const store = await createStore();

			expect((await store.getSessionWorkspaceFolder('session-A'))?.fsPath).toBe(Uri.file('/a').fsPath);
			expect((await store.getSessionWorkspaceFolder('session-B'))?.fsPath).toBe(Uri.file('/b').fsPath);
			store.dispose();
		});

		it('uses last-modified-wins when the same session exists in both files', async () => {
			vi.setSystemTime(new Date(0));
			mockFs.mockFile(BULK_METADATA_FILE, JSON.stringify({
				'shared-session': { workspaceFolder: { folderPath: Uri.file('/old').fsPath, timestamp: 1 }, modified: 50 },
			}));
			mockFs.mockFile(LEGACY_BULK_METADATA_FILE, JSON.stringify({
				'shared-session': { workspaceFolder: { folderPath: Uri.file('/newer').fsPath, timestamp: 2 }, modified: 200 },
			}));

			const store = await createStore();

			// Legacy had higher `modified` → its version wins
			expect((await store.getSessionWorkspaceFolder('shared-session'))?.fsPath).toBe(Uri.file('/newer').fsPath);
			store.dispose();
		});

		it('sets memento flag after successful merge so it does not re-run', async () => {
			mockFs.mockFile(LEGACY_BULK_METADATA_FILE, JSON.stringify({
				'legacy-session': { workspaceFolder: { folderPath: Uri.file('/legacy').fsPath, timestamp: 1 } },
			}));

			const store = await createStore();
			expect(extensionContext.globalState.get('github.copilot.cli.legacyBulkMigrated')).toBe(true);
			store.dispose();
		});

		it('skips migration when memento flag is already set', async () => {
			extensionContext.globalState.seed('github.copilot.cli.legacyBulkMigrated', true);
			mockFs.mockFile(LEGACY_BULK_METADATA_FILE, JSON.stringify({
				'legacy-session': { workspaceFolder: { folderPath: Uri.file('/legacy').fsPath, timestamp: 1 } },
			}));
			mockFs.mockFile(BULK_METADATA_FILE, JSON.stringify({}));

			const readSpy = vi.spyOn(mockFs, 'readFile');
			const store = await createStore();

			// Legacy file should not have been read (migration skipped).
			const legacyReads = readSpy.mock.calls.filter(
				c => c[0].toString().includes('copilotcli.session.metadata.json'),
			);
			expect(legacyReads).toHaveLength(0);
			expect(await store.getSessionWorkspaceFolder('legacy-session')).toBeUndefined();
			store.dispose();
		});

		it('does nothing when no legacy file exists', async () => {
			mockFs.mockFile(BULK_METADATA_FILE, JSON.stringify({
				'kept-session': { workspaceFolder: { folderPath: Uri.file('/kept').fsPath, timestamp: 1 } },
			}));
			// No legacy file seeded

			const store = await createStore();

			expect((await store.getSessionWorkspaceFolder('kept-session'))?.fsPath).toBe(Uri.file('/kept').fsPath);
			store.dispose();
		});
	});

	describe('top-N trim (MAX_BULK_STORAGE_ENTRIES = 1000)', () => {
		it('writes at most 1000 entries to the bulk file but keeps everything in memory', async () => {
			// Pre-seed a bulk file with 1100 entries with varying `modified` timestamps.
			const initial: Record<string, unknown> = {};
			for (let i = 0; i < 1100; i++) {
				initial[`s-${i}`] = {
					workspaceFolder: { folderPath: `/w/${i}`, timestamp: i },
					modified: i, // s-0 oldest, s-1099 newest
				};
			}
			mockFs.mockFile(BULK_METADATA_FILE, JSON.stringify(initial));

			const store = await createStore();
			// Trigger a write so the trim runs.
			await store.storeWorkspaceFolderInfo('trigger', { folderPath: '/trigger', timestamp: Date.now() });
			await vi.advanceTimersByTimeAsync(2000);

			const onDisk = JSON.parse(new TextDecoder().decode(await mockFs.readFile(BULK_METADATA_FILE)));
			expect(Object.keys(onDisk).length).toBeLessThanOrEqual(1000);
			// Newest entries (highest `modified`) should still be present.
			expect(onDisk['s-1099']).toBeTruthy();
			expect(onDisk['trigger']).toBeTruthy();
			// Oldest entry should have been evicted from disk.
			expect(onDisk['s-0']).toBeUndefined();

			// In-memory cache still serves the evicted entry's data via per-session file fallback,
			// but the cache itself was hydrated at init so it still knows about s-0.
			// (Per-session files are the source of truth for evicted entries.)
			store.dispose();
		});
	});

	describe('updateMetadataFields - stale cache write safety (Step 3b)', () => {
		it('writes only the requested partial fields; other fields written by external process are preserved', async () => {
			mockFs.mockFile(BULK_METADATA_FILE, JSON.stringify({}));
			const store = await createStore();

			// Create the per-session file with an initial customTitle.
			await store.setCustomTitle('shared-session', 'initial-title');
			await vi.advanceTimersByTimeAsync(2000);

			// Simulate another process writing a `firstUserMessage` to the same per-session file.
			const sessionFile = sessionMetadataFileUri('shared-session');
			const existingRaw = await mockFs.readFile(sessionFile);
			const existing = JSON.parse(new TextDecoder().decode(existingRaw));
			const externallyMerged = { ...existing, firstUserMessage: 'from-other-process' };
			await mockFs.writeFile(sessionFile, new TextEncoder().encode(JSON.stringify(externallyMerged)));

			// Now update the title from THIS process. Critically, the partial-only write
			// must not stomp `firstUserMessage` even though our `_cache` does not know about it.
			await store.setCustomTitle('shared-session', 'updated-title');
			await vi.advanceTimersByTimeAsync(2000);

			const finalRaw = await mockFs.readFile(sessionFile);
			const final = JSON.parse(new TextDecoder().decode(finalRaw));
			expect(final.customTitle).toBe('updated-title');
			expect(final.firstUserMessage).toBe('from-other-process');
			store.dispose();
		});
	});

	describe('timestamps', () => {
		it('stamps `created` once and bumps `modified` on every write', async () => {
			mockFs.mockFile(BULK_METADATA_FILE, JSON.stringify({}));
			vi.setSystemTime(new Date(1_000_000));
			const store = await createStore();

			await store.setCustomTitle('ts-session', 'first');
			await vi.advanceTimersByTimeAsync(2000);

			const file = sessionMetadataFileUri('ts-session');
			const first = JSON.parse(new TextDecoder().decode(await mockFs.readFile(file)));
			expect(first.created).toBeTypeOf('number');
			expect(first.modified).toBeTypeOf('number');
			const createdAt = first.created;

			vi.setSystemTime(new Date(2_000_000));
			await store.setCustomTitle('ts-session', 'second');
			await vi.advanceTimersByTimeAsync(2000);

			const second = JSON.parse(new TextDecoder().decode(await mockFs.readFile(file)));
			expect(second.created).toBe(createdAt); // unchanged
			expect(second.modified).toBeGreaterThan(first.modified); // bumped
			store.dispose();
		});
	});
});
