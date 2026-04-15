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
import { eventToPromise } from '../../../completions-core/vscode-node/lib/src/prompt/asyncUtils';
import { ChatSessionWorktreeData, ChatSessionWorktreeProperties } from '../../common/chatSessionWorktreeService';
import { IWorkspaceInfo } from '../../common/workspaceInfo';
import { getCopilotCLISessionDir } from '../../copilotcli/node/cliHelpers';
import { NullCopilotCLIAgents } from '../../copilotcli/node/test/testHelpers';
import { ChatSessionMetadataStore } from '../chatSessionMetadataStoreImpl';

vi.mock('../../copilotcli/node/cliHelpers', async (importOriginal) => {
	const actual = await importOriginal<typeof import('../../copilotcli/node/cliHelpers')>();
	return {
		...actual,
		getCopilotCLISessionDir: (sessionId: string) => `/mock/session-state/${sessionId}`,
	};
});

const WORKSPACE_FOLDER_MEMENTO_KEY = 'github.copilot.cli.sessionWorkspaceFolders';
const WORKTREE_MEMENTO_KEY = 'github.copilot.cli.sessionWorktrees';

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
const GLOBAL_STORAGE_DIR = Uri.joinPath(Uri.file('/mock/global/storage'), 'copilotcli');
const BULK_METADATA_FILE = Uri.joinPath(GLOBAL_STORAGE_DIR, 'copilotcli.session.metadata.json');

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

function makeWorktreeData(props: ChatSessionWorktreeProperties): ChatSessionWorktreeData {
	return { data: JSON.stringify(props), version: props.version };
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

	beforeEach(() => {
		vi.useFakeTimers();
		mockFs = new MockFileSystemServiceWithMotification();
		logService = new MockLogService();
		extensionContext = new MockExtensionContext();
	});

	afterEach(() => {
		mockFs.dispose();
		vi.useRealTimers();
		vi.restoreAllMocks();
	});

	/**
	 * Creates the store and waits for initialization to complete.
	 * Constructor eagerly triggers lazy init; we flush microtasks so it settles.
	 */
	async function createStore(): Promise<ChatSessionMetadataStore> {
		const store = new ChatSessionMetadataStore(
			mockFs,
			logService,
			extensionContext,
			new NullCopilotCLIAgents(),
		);
		// Flush microtasks to let initialization settle
		await vi.advanceTimersByTimeAsync(0);
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

		it('should also read global state memento keys to pick up missing entries when bulk file exists', async () => {
			// Global state has data not yet in the bulk file — it should be merged in
			extensionContext.globalState.seed(WORKSPACE_FOLDER_MEMENTO_KEY, {
				'session-x': { folderPath: Uri.file('/from/global/state').fsPath, timestamp: 999 },
			});
			mockFs.mockFile(BULK_METADATA_FILE, JSON.stringify({}));

			const getSpy = vi.spyOn(extensionContext.globalState, 'get');
			const store = await createStore();

			// globalState.get SHOULD now be called for the memento keys
			const mementoCalls = getSpy.mock.calls.filter(
				c => c[0] === WORKSPACE_FOLDER_MEMENTO_KEY || c[0] === WORKTREE_MEMENTO_KEY,
			);
			expect(mementoCalls.length).toBeGreaterThan(0);

			// session-x should now be accessible since it was merged from global state
			const folder = await store.getSessionWorkspaceFolder('session-x');
			expect(folder?.fsPath).toBe(Uri.file('/from/global/state').fsPath);
			store.dispose();
		});

		it('should not overwrite entries already in bulk file from global state', async () => {
			// Bulk file already has session-x with one path; global state has a different path
			const existingData = {
				'session-x': { workspaceFolder: { folderPath: Uri.file('/from/bulk').fsPath, timestamp: 100 } },
			};
			extensionContext.globalState.seed(WORKSPACE_FOLDER_MEMENTO_KEY, {
				'session-x': { folderPath: Uri.file('/from/global/state').fsPath, timestamp: 999 },
			});
			mockFs.mockFile(BULK_METADATA_FILE, JSON.stringify(existingData));

			const store = await createStore();

			// Should keep the bulk file version, not the global state version
			const folder = await store.getSessionWorkspaceFolder('session-x');
			expect(folder?.fsPath).toBe(Uri.file('/from/bulk').fsPath);
			store.dispose();
		});

		it('should attempt to write per-session files for entries not yet writtenToDisc', async () => {
			const existingData = {
				'session-1': { workspaceFolder: { folderPath: Uri.file('/workspace/a').fsPath, timestamp: 100 } },
			};
			const fileUri = sessionMetadataFileUri('session-1');
			mockFs.mockFile(BULK_METADATA_FILE, JSON.stringify(existingData));
			mockFs.mockDirectory(fileUri, []);

			// Pre-create the session directory so the write succeeds
			await mockFs.createDirectory(sessionDirectoryUri('session-1'));
			const fileCreated = eventToPromise(mockFs.onDidCreateFile.event);

			const store = await createStore();

			// wait for file to get created.
			await fileCreated;
			const rawContent = await mockFs.readFile(fileUri);
			const written = JSON.parse(new TextDecoder().decode(rawContent));
			expect(written.workspaceFolder?.folderPath).toBe(Uri.file('/workspace/a').fsPath);
			store.dispose();
		});

		it('should not attempt to write per-session files for entries already marked writtenToDisc', async () => {
			const existingData = {
				'session-1': { workspaceFolder: { folderPath: Uri.file('/workspace/a').fsPath, timestamp: 100 }, writtenToDisc: true },
			};
			mockFs.mockFile(BULK_METADATA_FILE, JSON.stringify(existingData));

			const writeSpy = vi.spyOn(mockFs, 'writeFile');
			const store = await createStore();
			await vi.advanceTimersByTimeAsync(0);

			// No writes to per-session files should have occurred
			const perSessionWrites = writeSpy.mock.calls.filter(
				c => c[0].toString().includes('vscode.metadata.json'),
			);
			expect(perSessionWrites).toHaveLength(0);
			store.dispose();
		});

		it('should skip per-session file write gracefully when directory does not exist during retry', async () => {
			const existingData = {
				'session-1': { workspaceFolder: { folderPath: Uri.file('/workspace/a').fsPath, timestamp: 100 } },
			};
			mockFs.mockFile(BULK_METADATA_FILE, JSON.stringify(existingData));
			// Do NOT create the session directory

			const createDirSpy = vi.spyOn(mockFs, 'createDirectory');
			const store = await createStore();
			await vi.advanceTimersByTimeAsync(0);

			// createDirectory should NOT have been called for the per-session dir
			// because createDirectoryIfNotFound=false during retry
			const perSessionDirCalls = createDirSpy.mock.calls.filter(
				c => c[0].toString().includes('session-1'),
			);
			expect(perSessionDirCalls).toHaveLength(0);

			// Entry should still be accessible from cache
			const folder = await store.getSessionWorkspaceFolder('session-1');
			expect(folder?.fsPath).toBe(Uri.file('/workspace/a').fsPath);
			store.dispose();
		});

		it('should keep worktree cache entry unchanged when global state has same number of changes', async () => {
			const cachedProps = makeWorktreeV1Props({
				changes: [{ filePath: '/a.ts', originalFilePath: '/a.ts', modifiedFilePath: '/a.ts', statistics: { additions: 1, deletions: 0 } }],
			});
			const globalStateProps = makeWorktreeV1Props({
				branchName: 'from-global-state',
				changes: [{ filePath: '/b.ts', originalFilePath: '/b.ts', modifiedFilePath: '/b.ts', statistics: { additions: 2, deletions: 1 } }],
			});
			mockFs.mockFile(BULK_METADATA_FILE, JSON.stringify({
				'session-wt': { worktreeProperties: cachedProps },
			}));
			extensionContext.globalState.seed(WORKTREE_MEMENTO_KEY, {
				'session-wt': makeWorktreeData(globalStateProps),
			});

			const store = await createStore();

			// Cache entry should keep its original data (not replaced by global state)
			const wt = await store.getWorktreeProperties('session-wt');
			expect(wt?.branchName).toBe(cachedProps.branchName);
			store.dispose();
		});

		it('should update worktree cache entry when global state has more changes', async () => {
			const cachedProps = makeWorktreeV1Props({ changes: undefined });
			const globalStateProps = makeWorktreeV1Props({
				branchName: 'from-global-state',
				changes: [
					{ filePath: '/a.ts', originalFilePath: '/a.ts', modifiedFilePath: '/a.ts', statistics: { additions: 1, deletions: 0 } },
					{ filePath: '/b.ts', originalFilePath: '/b.ts', modifiedFilePath: '/b.ts', statistics: { additions: 2, deletions: 1 } },
				],
			});
			mockFs.mockFile(BULK_METADATA_FILE, JSON.stringify({
				'session-wt': { worktreeProperties: cachedProps },
			}));
			extensionContext.globalState.seed(WORKTREE_MEMENTO_KEY, {
				'session-wt': makeWorktreeData(globalStateProps),
			});

			const store = await createStore();

			// Even when global state has more changes, cache entry is preserved (both paths continue)
			const wt = await store.getWorktreeProperties('session-wt');
			expect(wt?.branchName).toBe(globalStateProps.branchName);
			expect(wt?.changes).toEqual(globalStateProps.changes);
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

		it('should retry entries that only have additionalWorkspaces (not delete as invalid data)', async () => {
			// A session with only additionalWorkspaces and writtenToDisc: false
			// must be retried, not deleted from cache — otherwise data is lost after a crash.
			const existingData = {
				'session-only-additional': {
					additionalWorkspaces: [
						{ workspaceFolder: { folderPath: Uri.file('/extra/workspace').fsPath, timestamp: 100 } },
					],
				},
			};
			mockFs.mockFile(BULK_METADATA_FILE, JSON.stringify(existingData));

			// Pre-create the session directory so the recovery write can succeed
			await mockFs.createDirectory(sessionDirectoryUri('session-only-additional'));
			const fileCreated = eventToPromise(mockFs.onDidCreateFile.event);

			const store = await createStore();
			await fileCreated;

			const fileUri = sessionMetadataFileUri('session-only-additional');
			const rawContent = await mockFs.readFile(fileUri);
			const written = JSON.parse(new TextDecoder().decode(rawContent));
			expect(written.additionalWorkspaces).toHaveLength(1);
			store.dispose();
		});
	});

	// ──────────────────────────────────────────────────────────────────────────
	// initializeStorage — migration path: bulk file missing, read from global state
	// ──────────────────────────────────────────────────────────────────────────
	describe('initializeStorage - migration from global state', () => {
		it('should migrate workspace folder entries to bulk file', async () => {
			extensionContext.globalState.seed(WORKSPACE_FOLDER_MEMENTO_KEY, {
				'session-1': { folderPath: Uri.file('/workspace/a').fsPath, timestamp: 100 },
				'session-2': { folderPath: Uri.file('/workspace/b').fsPath, timestamp: 200 },
			});

			const store = await createStore();

			const folder1 = await store.getSessionWorkspaceFolder('session-1');
			expect(folder1?.fsPath).toBe(Uri.file('/workspace/a').fsPath);
			const folder2 = await store.getSessionWorkspaceFolder('session-2');
			expect(folder2?.fsPath).toBe(Uri.file('/workspace/b').fsPath);
			store.dispose();
		});

		it('should migrate worktree entries to bulk file', async () => {
			const v1Props = makeWorktreeV1Props();
			extensionContext.globalState.seed(WORKTREE_MEMENTO_KEY, {
				'session-wt': makeWorktreeData(v1Props),
			});

			const store = await createStore();

			const wt = await store.getWorktreeProperties('session-wt');
			expect(wt).toBeDefined();
			expect(wt!.version).toBe(1);
			expect(wt!.branchName).toBe(v1Props.branchName);
			store.dispose();
		});

		it('should parse version 1 worktree data with explicit version override', async () => {
			// For version 1, the code spreads JSON.parse(data) and sets version: 1
			const rawProps = { baseCommit: 'c1', branchName: 'b1', repositoryPath: '/r', worktreePath: '/w', autoCommit: false };
			extensionContext.globalState.seed(WORKTREE_MEMENTO_KEY, {
				'session-v1': { data: JSON.stringify(rawProps), version: 1 } satisfies ChatSessionWorktreeData,
			});

			const store = await createStore();
			const wt = await store.getWorktreeProperties('session-v1');
			expect(wt?.version).toBe(1);
			expect(wt?.baseCommit).toBe('c1');
			store.dispose();
		});

		it('should parse version 2 worktree data directly from data string', async () => {
			const v2Props = makeWorktreeV2Props();
			extensionContext.globalState.seed(WORKTREE_MEMENTO_KEY, {
				'session-v2': { data: JSON.stringify(v2Props), version: 2 } satisfies ChatSessionWorktreeData,
			});

			const store = await createStore();
			const wt = await store.getWorktreeProperties('session-v2');
			expect(wt?.version).toBe(2);
			expect(wt?.version === 2 ? wt.baseBranchName : '').toBe('main');
			store.dispose();
		});

		it('should give worktree precedence over workspace folder for same session', async () => {
			const v1Props = makeWorktreeV1Props();
			extensionContext.globalState.seed(WORKSPACE_FOLDER_MEMENTO_KEY, {
				'session-both': { folderPath: Uri.file('/workspace/shared').fsPath, timestamp: 100 },
			});
			extensionContext.globalState.seed(WORKTREE_MEMENTO_KEY, {
				'session-both': makeWorktreeData(v1Props),
			});

			const store = await createStore();

			// worktree takes precedence: getSessionWorkspaceFolder returns undefined when worktree exists
			const folder = await store.getSessionWorkspaceFolder('session-both');
			expect(folder).toBeUndefined();

			const wt = await store.getWorktreeProperties('session-both');
			expect(wt).toBeDefined();
			store.dispose();
		});

		it.skip('should clear global state keys after successful migration', async () => {
			extensionContext.globalState.seed(WORKSPACE_FOLDER_MEMENTO_KEY, {
				'session-1': { folderPath: Uri.file('/workspace/a').fsPath, timestamp: 100 },
			});
			extensionContext.globalState.seed(WORKTREE_MEMENTO_KEY, {
				'session-2': makeWorktreeData(makeWorktreeV1Props()),
			});

			const store = await createStore();

			expect(extensionContext.globalState.has(WORKSPACE_FOLDER_MEMENTO_KEY)).toBe(false);
			expect(extensionContext.globalState.has(WORKTREE_MEMENTO_KEY)).toBe(false);
			store.dispose();
		});

		it('should write migrated data to bulk metadata file', async () => {
			extensionContext.globalState.seed(WORKSPACE_FOLDER_MEMENTO_KEY, {
				'session-1': { folderPath: Uri.file('/workspace/a').fsPath, timestamp: 100 },
			});

			const store = await createStore();

			// Read the bulk file directly to verify it was written
			const rawContent = await mockFs.readFile(BULK_METADATA_FILE);
			const written = JSON.parse(new TextDecoder().decode(rawContent));
			expect(written['session-1']).toBeDefined();
			expect(written['session-1'].workspaceFolder.folderPath).toBe(Uri.file('/workspace/a').fsPath);
			store.dispose();
		});

		it('should write per-session metadata files during migration when directory exists', async () => {
			extensionContext.globalState.seed(WORKSPACE_FOLDER_MEMENTO_KEY, {
				'session-1': { folderPath: Uri.file('/workspace/a').fsPath, timestamp: 100 },
			});

			// Pre-create the session directory so the write succeeds
			// (migration uses createDirectoryIfNotFound=false)
			await mockFs.createDirectory(sessionDirectoryUri('session-1'));

			const store = await createStore();
			// Wait for the fire-and-forget per-session writes
			await vi.advanceTimersByTimeAsync(0);

			const fileUri = sessionMetadataFileUri('session-1');
			const rawContent = await mockFs.readFile(fileUri);
			const written = JSON.parse(new TextDecoder().decode(rawContent));
			expect(written.workspaceFolder?.folderPath).toBe(Uri.file('/workspace/a').fsPath);
			store.dispose();
		});

		it('should skip per-session file write when directory does not exist during migration', async () => {
			extensionContext.globalState.seed(WORKSPACE_FOLDER_MEMENTO_KEY, {
				'session-1': { folderPath: Uri.file('/workspace/a').fsPath, timestamp: 100 },
			});
			// Do NOT create the session directory

			const writeSpy = vi.spyOn(mockFs, 'writeFile');
			const store = await createStore();
			await vi.advanceTimersByTimeAsync(0);

			// No per-session file write should occur since dir is missing and createDirectoryIfNotFound=false
			const perSessionWrites = writeSpy.mock.calls.filter(
				c => c[0].toString().includes('session-1') && c[0].toString().includes('vscode.metadata.json'),
			);
			expect(perSessionWrites).toHaveLength(0);

			// Data should still be accessible from cache
			const folder = await store.getSessionWorkspaceFolder('session-1');
			expect(folder?.fsPath).toBe(Uri.file('/workspace/a').fsPath);
			store.dispose();
		});

		it('should mark migrated worktree entries with writtenToDisc false and attempt per-session write', async () => {
			const v1Props = makeWorktreeV1Props();
			extensionContext.globalState.seed(WORKTREE_MEMENTO_KEY, {
				'session-wt-migrate': makeWorktreeData(v1Props),
			});

			// Pre-create the session directory so the retry write succeeds
			await mockFs.createDirectory(sessionDirectoryUri('session-wt-migrate'));
			const fileCreated = eventToPromise(mockFs.onDidCreateFile.event);

			const store = await createStore();

			// Wait for the per-session file write triggered by writtenToDisc: false
			await fileCreated;
			const fileUri = sessionMetadataFileUri('session-wt-migrate');
			const rawContent = await mockFs.readFile(fileUri);
			const written = JSON.parse(new TextDecoder().decode(rawContent));
			expect(written.worktreeProperties?.branchName).toBe(v1Props.branchName);
			store.dispose();
		});
	});

	// ──────────────────────────────────────────────────────────────────────────
	// initializeStorage — filtering edge cases
	// ──────────────────────────────────────────────────────────────────────────
	describe('initializeStorage - filtering', () => {
		it('should skip workspace folder entries with untitled- prefix', async () => {
			extensionContext.globalState.seed(WORKSPACE_FOLDER_MEMENTO_KEY, {
				'untitled-session': { folderPath: Uri.file('/workspace/skip').fsPath, timestamp: 100 },
				'session-keep': { folderPath: Uri.file('/workspace/keep').fsPath, timestamp: 200 },
			});

			const store = await createStore();

			const skipFolder = await store.getSessionWorkspaceFolder('untitled-session');
			expect(skipFolder).toBeUndefined();
			const keepFolder = await store.getSessionWorkspaceFolder('session-keep');
			expect(keepFolder?.fsPath).toBe(Uri.file('/workspace/keep').fsPath);
			store.dispose();
		});

		it('should skip worktree entries with untitled- prefix', async () => {
			extensionContext.globalState.seed(WORKTREE_MEMENTO_KEY, {
				'untitled-wt': makeWorktreeData(makeWorktreeV1Props()),
				'session-wt': makeWorktreeData(makeWorktreeV1Props()),
			});

			const store = await createStore();

			const skipWt = await store.getWorktreeProperties('untitled-wt');
			expect(skipWt).toBeUndefined();
			const keepWt = await store.getWorktreeProperties('session-wt');
			expect(keepWt).toBeDefined();
			store.dispose();
		});

		it('should skip workspace folder entries that are raw strings (legacy format)', async () => {
			extensionContext.globalState.seed(WORKSPACE_FOLDER_MEMENTO_KEY, {
				'session-legacy': Uri.file('/old/string/path').fsPath,
				'session-good': { folderPath: Uri.file('/workspace/good').fsPath, timestamp: 100 },
			});

			const store = await createStore();

			const legacy = await store.getSessionWorkspaceFolder('session-legacy');
			expect(legacy).toBeUndefined();
			const good = await store.getSessionWorkspaceFolder('session-good');
			expect(good?.fsPath).toBe(Uri.file('/workspace/good').fsPath);
			store.dispose();
		});

		it('should skip workspace folder entries missing folderPath', async () => {
			extensionContext.globalState.seed(WORKSPACE_FOLDER_MEMENTO_KEY, {
				'session-no-path': { timestamp: 100 },
			});

			const store = await createStore();

			const folder = await store.getSessionWorkspaceFolder('session-no-path');
			expect(folder).toBeUndefined();
			store.dispose();
		});

		it('should skip workspace folder entries missing timestamp', async () => {
			extensionContext.globalState.seed(WORKSPACE_FOLDER_MEMENTO_KEY, {
				'session-no-ts': { folderPath: Uri.file('/workspace/no-ts').fsPath },
			});

			const store = await createStore();

			const folder = await store.getSessionWorkspaceFolder('session-no-ts');
			expect(folder).toBeUndefined();
			store.dispose();
		});

		it('should skip worktree entries that are raw strings (legacy format)', async () => {
			extensionContext.globalState.seed(WORKTREE_MEMENTO_KEY, {
				'session-old': 'some-old-string',
				'session-new': makeWorktreeData(makeWorktreeV1Props()),
			});

			const store = await createStore();

			const oldWt = await store.getWorktreeProperties('session-old');
			expect(oldWt).toBeUndefined();
			const newWt = await store.getWorktreeProperties('session-new');
			expect(newWt).toBeDefined();
			store.dispose();
		});
	});

	// ──────────────────────────────────────────────────────────────────────────
	// initializeStorage — migration failure safety (CRITICAL)
	// ──────────────────────────────────────────────────────────────────────────
	describe('initializeStorage - failure safety', () => {
		it('should NOT clear global state when writeToGlobalStorage fails', async () => {
			extensionContext.globalState.seed(WORKSPACE_FOLDER_MEMENTO_KEY, {
				'session-1': { folderPath: Uri.file('/workspace/a').fsPath, timestamp: 100 },
			});
			extensionContext.globalState.seed(WORKTREE_MEMENTO_KEY, {
				'session-2': makeWorktreeData(makeWorktreeV1Props()),
			});

			// Make writeFile throw so writeToGlobalStorage fails
			vi.spyOn(mockFs, 'writeFile').mockRejectedValue(new Error('disk full'));

			const store = await createStore();

			// Global state should be preserved since writing to file failed
			expect(extensionContext.globalState.has(WORKSPACE_FOLDER_MEMENTO_KEY)).toBe(true);
			expect(extensionContext.globalState.has(WORKTREE_MEMENTO_KEY)).toBe(true);

			// Initialization failure should be logged
			expect(logService.error).toHaveBeenCalled();
			store.dispose();
		});

		it('should NOT clear global state when createDirectory fails during writeToGlobalStorage', async () => {
			extensionContext.globalState.seed(WORKSPACE_FOLDER_MEMENTO_KEY, {
				'session-1': { folderPath: Uri.file('/workspace/a').fsPath, timestamp: 100 },
			});

			// stat throws (dir missing) and createDirectory also throws
			vi.spyOn(mockFs, 'stat').mockRejectedValue(new Error('ENOENT'));
			vi.spyOn(mockFs, 'createDirectory').mockRejectedValue(new Error('permission denied'));

			const store = await createStore();

			expect(extensionContext.globalState.has(WORKSPACE_FOLDER_MEMENTO_KEY)).toBe(true);
			store.dispose();
		});

		it.skip('should still clear global state even when per-session file writes fail', async () => {
			extensionContext.globalState.seed(WORKSPACE_FOLDER_MEMENTO_KEY, {
				'session-1': { folderPath: Uri.file('/workspace/a').fsPath, timestamp: 100 },
			});

			// Allow bulk file write to succeed but track per-session writes
			let writeCallCount = 0;
			const origWriteFile = mockFs.writeFile.bind(mockFs);
			vi.spyOn(mockFs, 'writeFile').mockImplementation(async (uri, content) => {
				writeCallCount++;
				// Let the bulk metadata file write succeed (first or second write)
				if (uri.toString().includes('copilotcli.session.metadata.json')) {
					return origWriteFile(uri, content);
				}
				// Fail per-session writes
				throw new Error('per-session write failed');
			});

			const store = await createStore();

			// Global state should be cleared because bulk file write succeeded
			// (per-session writes are fire-and-forget via Promise.allSettled)
			expect(extensionContext.globalState.has(WORKSPACE_FOLDER_MEMENTO_KEY)).toBe(false);
			store.dispose();
		});

		it('should log error when initialization fails', async () => {
			extensionContext.globalState.seed(WORKSPACE_FOLDER_MEMENTO_KEY, {
				'session-1': { folderPath: Uri.file('/workspace/a').fsPath, timestamp: 100 },
			});
			vi.spyOn(mockFs, 'writeFile').mockRejectedValue(new Error('disk full'));

			const store = await createStore();

			expect(logService.error).toHaveBeenCalledWith(
				'[ChatSessionMetadataStore] Initialization failed: ',
				expect.any(Error),
			);
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

		it('should return worktree properties when looked up by folder Uri', async () => {
			const props = makeWorktreeV1Props({ worktreePath: Uri.file('/repo/.worktrees/my-wt').fsPath });
			mockFs.mockFile(BULK_METADATA_FILE, JSON.stringify({
				'session-wt': { worktreeProperties: props },
			}));

			const store = await createStore();
			const wt = await store.getWorktreeProperties(Uri.file('/repo/.worktrees/my-wt'));
			expect(wt).toBeDefined();
			expect(wt!.branchName).toBe(props.branchName);
			store.dispose();
		});

		it('should return undefined when folder Uri does not match any worktree', async () => {
			const props = makeWorktreeV1Props({ worktreePath: Uri.file('/repo/.worktrees/wt-a').fsPath });
			mockFs.mockFile(BULK_METADATA_FILE, JSON.stringify({
				'session-wt': { worktreeProperties: props },
			}));

			const store = await createStore();
			const wt = await store.getWorktreeProperties(Uri.file('/repo/.worktrees/wt-b'));
			expect(wt).toBeUndefined();
			store.dispose();
		});

		it('should skip entries without worktreePath when looking up by folder Uri', async () => {
			mockFs.mockFile(BULK_METADATA_FILE, JSON.stringify({
				'session-folder': { workspaceFolder: { folderPath: Uri.file('/workspace/a').fsPath, timestamp: 100 } },
				'session-wt': { worktreeProperties: makeWorktreeV1Props({ worktreePath: Uri.file('/repo/.worktrees/wt').fsPath }) },
			}));

			const store = await createStore();
			const wt = await store.getWorktreeProperties(Uri.file('/repo/.worktrees/wt'));
			expect(wt).toBeDefined();
			store.dispose();
		});
	});

	// ──────────────────────────────────────────────────────────────────────────
	// getSessionIdForWorktree
	// ──────────────────────────────────────────────────────────────────────────
	describe('getSessionIdForWorktree', () => {
		it('should return session id when worktree folder matches', async () => {
			const props = makeWorktreeV1Props({ worktreePath: Uri.file('/repo/.worktrees/my-wt').fsPath });
			mockFs.mockFile(BULK_METADATA_FILE, JSON.stringify({
				'session-abc': { worktreeProperties: props },
			}));

			const store = await createStore();
			const sessionId = await store.getSessionIdForWorktree(Uri.file('/repo/.worktrees/my-wt'));
			expect(sessionId).toBe('session-abc');
			store.dispose();
		});

		it('should return undefined when no worktree matches the folder', async () => {
			const props = makeWorktreeV1Props({ worktreePath: Uri.file('/repo/.worktrees/wt-a').fsPath });
			mockFs.mockFile(BULK_METADATA_FILE, JSON.stringify({
				'session-abc': { worktreeProperties: props },
			}));

			const store = await createStore();
			const sessionId = await store.getSessionIdForWorktree(Uri.file('/some/other/path'));
			expect(sessionId).toBeUndefined();
			store.dispose();
		});

		it('should return undefined when cache has no worktree entries', async () => {
			mockFs.mockFile(BULK_METADATA_FILE, JSON.stringify({
				'session-folder': { workspaceFolder: { folderPath: Uri.file('/a').fsPath, timestamp: 1 } },
			}));

			const store = await createStore();
			const sessionId = await store.getSessionIdForWorktree(Uri.file('/a'));
			expect(sessionId).toBeUndefined();
			store.dispose();
		});

		it('should find correct session among multiple worktree entries', async () => {
			mockFs.mockFile(BULK_METADATA_FILE, JSON.stringify({
				'session-1': { worktreeProperties: makeWorktreeV1Props({ worktreePath: Uri.file('/repo/.worktrees/wt1').fsPath }) },
				'session-2': { worktreeProperties: makeWorktreeV2Props({ worktreePath: Uri.file('/repo/.worktrees/wt2').fsPath }) },
			}));

			const store = await createStore();
			const sessionId = await store.getSessionIdForWorktree(Uri.file('/repo/.worktrees/wt2'));
			expect(sessionId).toBe('session-2');
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
			expect(written).toEqual({ origin: 'other' });
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
				c => c[0].toString().includes('copilotcli.session.metadata.json'),
			).length;

			// Advance past debounce
			await vi.advanceTimersByTimeAsync(1_100);

			const bulkWritesAfter = writeSpy.mock.calls.filter(
				c => c[0].toString().includes('copilotcli.session.metadata.json'),
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

		it('should survive crash recovery: entry with only additionalWorkspaces is re-persisted not deleted', async () => {
			// Simulate VS Code crash: bulk file has the entry but writtenToDisc is falsy
			// (updateSessionMetadata never completed before the crash).
			mockFs.mockFile(BULK_METADATA_FILE, JSON.stringify({
				'session-crash': {
					additionalWorkspaces: [
						{ workspaceFolder: { folderPath: Uri.file('/extra/workspace').fsPath, timestamp: 100 } },
					],
					// writtenToDisc intentionally absent (falsy) — simulates crash before write completed
				},
			}));

			// Pre-create session directory so recovery write can succeed
			await mockFs.createDirectory(sessionDirectoryUri('session-crash'));
			const fileCreated = eventToPromise(mockFs.onDidCreateFile.event);

			const store = await createStore();
			await fileCreated;

			// Entry should have been re-persisted to per-session file
			const fileUri = sessionMetadataFileUri('session-crash');
			const rawContent = await mockFs.readFile(fileUri);
			const written = JSON.parse(new TextDecoder().decode(rawContent));
			expect(written.additionalWorkspaces).toHaveLength(1);
			expect(written.additionalWorkspaces[0].workspaceFolder?.folderPath).toBe(Uri.file('/extra/workspace').fsPath);

			// And still readable via the API
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
		it('should handle initialization failure gracefully when writeFile fails and cache was updated', async () => {
			// Bulk file read fails, falls through to global state
			// Global state has data, so cacheUpdated = true, writeToGlobalStorage is called but writeFile fails
			extensionContext.globalState.seed(WORKSPACE_FOLDER_MEMENTO_KEY, {
				'session-1': { folderPath: Uri.file('/workspace/a').fsPath, timestamp: 100 },
			});
			vi.spyOn(mockFs, 'readFile').mockRejectedValue(new Error('ENOENT'));
			vi.spyOn(mockFs, 'writeFile').mockRejectedValue(new Error('disk error'));

			const store = await createStore();

			expect(logService.error).toHaveBeenCalledWith(
				'[ChatSessionMetadataStore] Initialization failed: ',
				expect.any(Error),
			);
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

});
