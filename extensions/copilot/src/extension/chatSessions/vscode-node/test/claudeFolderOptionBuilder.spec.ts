/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { afterEach, describe, expect, it } from 'vitest';
import type * as vscode from 'vscode';
import { IWorkspaceService } from '../../../../platform/workspace/common/workspaceService';
import { TestWorkspaceService } from '../../../../platform/test/node/testWorkspaceService';
import { Event } from '../../../../util/vs/base/common/event';
import { DisposableStore } from '../../../../util/vs/base/common/lifecycle';
import { URI } from '../../../../util/vs/base/common/uri';
import { createExtensionUnitTestingServices } from '../../../test/node/services';
import { FolderRepositoryMRUEntry, IChatFolderMruService } from '../../common/folderRepositoryManager';
import { ClaudeFolderOptionBuilder } from '../claudeFolderOptionBuilder';

class MockChatFolderMruService implements IChatFolderMruService {
	declare _serviceBrand: undefined;

	private _mruEntries: FolderRepositoryMRUEntry[] = [];

	setMRUEntries(entries: FolderRepositoryMRUEntry[]): void {
		this._mruEntries = entries;
	}

	async getRecentlyUsedFolders(): Promise<FolderRepositoryMRUEntry[]> {
		return this._mruEntries;
	}

	async deleteRecentlyUsedFolder(): Promise<void> { }
}

describe('ClaudeFolderOptionBuilder', () => {
	let builder: ClaudeFolderOptionBuilder;
	let mockFolderMruService: MockChatFolderMruService;
	const store = new DisposableStore();

	afterEach(() => {
		store.clear();
	});

	function createBuilder(workspaceFolders: URI[]): ClaudeFolderOptionBuilder {
		const workspaceService = new TestWorkspaceService(workspaceFolders);
		mockFolderMruService = new MockChatFolderMruService();
		const serviceCollection = store.add(createExtensionUnitTestingServices(store));
		serviceCollection.set(IWorkspaceService, workspaceService);
		return new ClaudeFolderOptionBuilder(mockFolderMruService, workspaceService);
	}

	describe('provideChatSessionProviderOptionGroups', () => {
		it('returns empty array for single-root workspace', async () => {
			builder = createBuilder([URI.file('/project')]);

			const groups = await builder.provideChatSessionProviderOptionGroups(undefined);

			expect(groups).toEqual([]);
		});

		it('returns folder group for multi-root workspace', async () => {
			const folderA = URI.file('/a');
			const folderB = URI.file('/b');
			builder = createBuilder([folderA, folderB]);

			const groups = await builder.provideChatSessionProviderOptionGroups(undefined);

			expect(groups).toHaveLength(1);
			expect(groups[0].id).toBe('folder');
			expect(groups[0].items.map(i => i.id)).toEqual([folderA.fsPath, folderB.fsPath]);
			expect(groups[0].selected?.id).toBe(folderA.fsPath);
		});

		it('uses MRU entries for empty workspace', async () => {
			builder = createBuilder([]);
			const mruFolder = URI.file('/recent');
			mockFolderMruService.setMRUEntries([
				{ folder: mruFolder, repository: undefined, lastAccessed: Date.now() },
			]);

			const groups = await builder.provideChatSessionProviderOptionGroups(undefined);

			expect(groups).toHaveLength(1);
			expect(groups[0].items[0].id).toBe(mruFolder.fsPath);
		});

		it('restores previous folder selection', async () => {
			const folderA = URI.file('/a');
			const folderB = URI.file('/b');
			builder = createBuilder([folderA, folderB]);

			const previousInputState = {
				groups: [{
					id: 'folder',
					name: 'Folder',
					description: 'Pick Folder',
					items: [{ id: folderB.fsPath, name: 'b' }],
					selected: { id: folderB.fsPath, name: 'b' },
				}],
				sessionResource: undefined,
				onDidChange: Event.None,
			} as vscode.ChatSessionInputState;

			const groups = await builder.provideChatSessionProviderOptionGroups(previousInputState);

			expect(groups[0].selected?.id).toBe(folderB.fsPath);
		});
	});

	describe('buildExistingSessionGroups', () => {
		it('builds locked folder group', () => {
			builder = createBuilder([URI.file('/a'), URI.file('/b')]);
			const folderUri = URI.file('/a');

			const groups = builder.buildExistingSessionGroups(folderUri);

			expect(groups).toHaveLength(1);
			expect(groups[0].id).toBe('folder');
			expect(groups[0].selected?.locked).toBe(true);
			expect(groups[0].items.every(i => i.locked)).toBe(true);
		});
	});

	describe('rebuildInputState', () => {
		it('replaces state.groups with folder groups', async () => {
			const folderA = URI.file('/a');
			const folderB = URI.file('/b');
			builder = createBuilder([folderA, folderB]);

			const state = {
				groups: [{ id: 'stale', name: 'Stale', description: '', items: [] }],
				sessionResource: undefined,
				onDidChange: Event.None,
			} as vscode.ChatSessionInputState;

			await builder.rebuildInputState(state);

			expect(state.groups).toHaveLength(1);
			expect(state.groups[0].id).toBe('folder');
		});
	});

	describe('lockInputStateGroups', () => {
		it('locks all groups and items', () => {
			builder = createBuilder([URI.file('/a'), URI.file('/b')]);

			const state = {
				groups: [{
					id: 'folder',
					name: 'Folder',
					description: 'Pick Folder',
					items: [
						{ id: '/a', name: 'a' },
						{ id: '/b', name: 'b' },
					],
					selected: { id: '/a', name: 'a' },
				}],
				sessionResource: undefined,
				onDidChange: Event.None,
			} as vscode.ChatSessionInputState;

			builder.lockInputStateGroups(state);

			expect(state.groups[0].items.every(i => i.locked)).toBe(true);
			expect(state.groups[0].selected?.locked).toBe(true);
		});
	});

	describe('getDefaultFolder', () => {
		it('returns first workspace folder', async () => {
			const folderA = URI.file('/a');
			builder = createBuilder([folderA, URI.file('/b')]);

			const result = await builder.getDefaultFolder();

			expect(result?.fsPath).toBe(folderA.fsPath);
		});

		it('returns first MRU entry for empty workspace', async () => {
			builder = createBuilder([]);
			const mruFolder = URI.file('/recent');
			mockFolderMruService.setMRUEntries([
				{ folder: mruFolder, repository: undefined, lastAccessed: Date.now() },
			]);

			const result = await builder.getDefaultFolder();

			expect(result?.fsPath).toBe(mruFolder.fsPath);
		});

		it('returns undefined when no folders available', async () => {
			builder = createBuilder([]);

			const result = await builder.getDefaultFolder();

			expect(result).toBeUndefined();
		});
	});
});
