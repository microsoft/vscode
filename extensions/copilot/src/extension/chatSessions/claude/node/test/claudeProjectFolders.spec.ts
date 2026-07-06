/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, it } from 'vitest';
import { TestWorkspaceService } from '../../../../../platform/test/node/testWorkspaceService';
import { URI } from '../../../../../util/vs/base/common/uri';
import { FolderRepositoryMRUEntry, IFolderRepositoryManager } from '../../../../chatSessions/common/folderRepositoryManager';
import { computeFolderSlug, getProjectFolders } from '../claudeProjectFolders';

// #region MockFolderRepositoryManager

class MockFolderRepositoryManager implements IFolderRepositoryManager {
	declare _serviceBrand: undefined;
	private _mruEntries: FolderRepositoryMRUEntry[] = [];

	setMRUEntries(entries: FolderRepositoryMRUEntry[]): void {
		this._mruEntries = entries;
	}

	setNewSessionFolder(): void { }
	deleteNewSessionFolder(): void { }
	async getFolderRepository(): Promise<{ folder: undefined; repository: undefined; worktree: undefined; worktreeProperties: undefined; trusted: undefined }> { return { folder: undefined, repository: undefined, worktree: undefined, worktreeProperties: undefined, trusted: undefined }; }
	async initializeFolderRepository(): Promise<{ folder: undefined; repository: undefined; worktree: undefined; worktreeProperties: undefined; trusted: undefined }> { return { folder: undefined, repository: undefined, worktree: undefined, worktreeProperties: undefined, trusted: undefined }; }
	async initializeMultiRootFolderRepositories(): Promise<{ primary: { folder: undefined; repository: undefined; worktree: undefined; worktreeProperties: undefined; trusted: undefined }; additional: never[] }> { return { primary: { folder: undefined, repository: undefined, worktree: undefined, worktreeProperties: undefined, trusted: undefined }, additional: [] }; }
	async getRepositoryInfo(): Promise<any> { return undefined; }
	async getFolderMRU(): Promise<FolderRepositoryMRUEntry[]> { return this._mruEntries; }
}

// #endregion

describe('computeFolderSlug', () => {
	it('converts a simple Unix path', () => {
		const uri = URI.file('/Users/test/project');
		expect(computeFolderSlug(uri)).toBe('-Users-test-project');
	});

	it('converts a path with spaces', () => {
		const uri = URI.file('/Users/test/my project');
		expect(computeFolderSlug(uri)).toBe('-Users-test-my-project');
	});

	it('converts a path with dots', () => {
		const uri = URI.file('/Users/test/my.project');
		expect(computeFolderSlug(uri)).toBe('-Users-test-my-project');
	});

	it('converts a Windows-style drive letter path', () => {
		// On Windows, URI.file('C:/Users/test/project') produces path '/c:/Users/test/project'
		const uri = URI.from({ scheme: 'file', path: '/c:/Users/test/project' });
		expect(computeFolderSlug(uri)).toBe('C--Users-test-project');
	});

	it('uppercases the Windows drive letter', () => {
		const uri = URI.from({ scheme: 'file', path: '/d:/projects/my-app' });
		expect(computeFolderSlug(uri)).toBe('D--projects-my-app');
	});
});

describe('getProjectFolders', () => {
	it('returns slugs for single-root workspace', async () => {
		const folderUri = URI.file('/Users/test/project');
		const workspace = new TestWorkspaceService([folderUri]);
		const folderManager = new MockFolderRepositoryManager();

		const result = await getProjectFolders(workspace, folderManager);

		expect(result).toHaveLength(1);
		expect(result[0].folderUri.toString()).toBe(folderUri.toString());
		expect(result[0].slug).toBe(computeFolderSlug(folderUri));
	});

	it('returns slugs for all folders in a multi-root workspace', async () => {
		const folderA = URI.file('/Users/test/project-a');
		const folderB = URI.file('/Users/test/project-b');
		const workspace = new TestWorkspaceService([folderA, folderB]);
		const folderManager = new MockFolderRepositoryManager();

		const result = await getProjectFolders(workspace, folderManager);

		expect(result).toHaveLength(2);
		expect(result[0].folderUri.toString()).toBe(folderA.toString());
		expect(result[0].slug).toBe(computeFolderSlug(folderA));
		expect(result[1].folderUri.toString()).toBe(folderB.toString());
		expect(result[1].slug).toBe(computeFolderSlug(folderB));
	});

	it('falls back to MRU entries for an empty workspace', async () => {
		const mruFolder = URI.file('/Users/test/recent-project');
		const workspace = new TestWorkspaceService([]);
		const folderManager = new MockFolderRepositoryManager();
		folderManager.setMRUEntries([{ folder: mruFolder, repository: undefined, lastAccessed: Date.now() }]);

		const result = await getProjectFolders(workspace, folderManager);

		expect(result).toHaveLength(1);
		expect(result[0].folderUri.toString()).toBe(mruFolder.toString());
		expect(result[0].slug).toBe(computeFolderSlug(mruFolder));
	});

	it('returns empty array for empty workspace with no MRU entries', async () => {
		const workspace = new TestWorkspaceService([]);
		const folderManager = new MockFolderRepositoryManager();

		const result = await getProjectFolders(workspace, folderManager);

		expect(result).toHaveLength(0);
	});

	it('workspace folders take priority over MRU entries', async () => {
		const workspaceFolder = URI.file('/Users/test/workspace');
		const mruFolder = URI.file('/Users/test/mru-folder');
		const workspace = new TestWorkspaceService([workspaceFolder]);
		const folderManager = new MockFolderRepositoryManager();
		folderManager.setMRUEntries([{ folder: mruFolder, repository: undefined, lastAccessed: Date.now() }]);

		const result = await getProjectFolders(workspace, folderManager);

		expect(result).toHaveLength(1);
		expect(result[0].folderUri.toString()).toBe(workspaceFolder.toString());
	});
});
