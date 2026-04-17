/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type * as vscode from 'vscode';
import { ConfigKey, IConfigurationService } from '../../../../platform/configuration/common/configurationService';
import { TestWorkspaceService } from '../../../../platform/test/node/testWorkspaceService';
import { IWorkspaceService } from '../../../../platform/workspace/common/workspaceService';
import { Event } from '../../../../util/vs/base/common/event';
import { DisposableStore } from '../../../../util/vs/base/common/lifecycle';
import { URI } from '../../../../util/vs/base/common/uri';
import { createExtensionUnitTestingServices } from '../../../test/node/services';
import { FolderRepositoryMRUEntry, IChatFolderMruService } from '../../common/folderRepositoryManager';
import { ClaudeSessionOptionBuilder } from '../claudeSessionOptionBuilder';

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

describe('ClaudeSessionOptionBuilder', () => {
	let builder: ClaudeSessionOptionBuilder;
	let mockFolderMruService: MockChatFolderMruService;
	const store = new DisposableStore();

	afterEach(() => {
		store.clear();
	});

	function createBuilder(workspaceFolders: URI[], configOverrides?: { bypassPermissions?: boolean }): ClaudeSessionOptionBuilder {
		const workspaceService = new TestWorkspaceService(workspaceFolders);
		mockFolderMruService = new MockChatFolderMruService();
		const serviceCollection = store.add(createExtensionUnitTestingServices(store));
		serviceCollection.set(IWorkspaceService, workspaceService);
		const accessor = serviceCollection.createTestingAccessor();
		const configService = accessor.get(IConfigurationService);
		if (configOverrides?.bypassPermissions) {
			configService.setConfig(ConfigKey.ClaudeAgentAllowDangerouslySkipPermissions, true);
		}
		return new ClaudeSessionOptionBuilder(configService, mockFolderMruService, workspaceService);
	}

	describe('buildPermissionModeGroup', () => {
		it('includes default permission modes', () => {
			builder = createBuilder([URI.file('/project')]);

			const group = builder.buildPermissionModeGroup();

			expect(group.id).toBe('permissionMode');
			expect(group.items.map(i => i.id)).toEqual(['default', 'acceptEdits', 'plan']);
		});

		it('includes bypass when config enabled', () => {
			builder = createBuilder([URI.file('/project')], { bypassPermissions: true });

			const group = builder.buildPermissionModeGroup();

			expect(group.items.map(i => i.id)).toContain('bypassPermissions');
		});
	});

	describe('buildNewFolderGroup', () => {
		it('returns undefined for single-root workspace', async () => {
			builder = createBuilder([URI.file('/project')]);

			const group = await builder.buildNewFolderGroup(undefined);

			expect(group).toBeUndefined();
		});

		it('returns folder group for multi-root workspace', async () => {
			const folderA = URI.file('/a');
			const folderB = URI.file('/b');
			builder = createBuilder([folderA, folderB]);

			const group = await builder.buildNewFolderGroup(undefined);

			expect(group).toBeDefined();
			expect(group!.id).toBe('folder');
			expect(group!.items.map(i => i.id)).toEqual([folderA.fsPath, folderB.fsPath]);
			expect(group!.selected?.id).toBe(folderA.fsPath);
		});

		it('uses MRU entries for empty workspace', async () => {
			builder = createBuilder([]);
			const mruFolder = URI.file('/recent');
			mockFolderMruService.setMRUEntries([
				{ folder: mruFolder, repository: undefined, lastAccessed: Date.now() },
			]);

			const group = await builder.buildNewFolderGroup(undefined);

			expect(group).toBeDefined();
			expect(group!.items[0].id).toBe(mruFolder.fsPath);
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

			const group = await builder.buildNewFolderGroup(previousInputState);

			expect(group!.selected?.id).toBe(folderB.fsPath);
		});
	});

	describe('buildExistingFolderGroup', () => {
		it('builds locked folder group', () => {
			builder = createBuilder([URI.file('/a'), URI.file('/b')]);
			const folderUri = URI.file('/a');

			const group = builder.buildExistingFolderGroup(folderUri);

			expect(group.id).toBe('folder');
			expect(group.selected?.locked).toBe(true);
			expect(group.items.every(i => i.locked)).toBe(true);
		});
	});

	describe('buildNewSessionGroups', () => {
		it('includes permission mode group with default selection', async () => {
			builder = createBuilder([URI.file('/project')]);

			const groups = await builder.buildNewSessionGroups(undefined);

			const permGroup = groups.find(g => g.id === 'permissionMode');
			expect(permGroup).toBeDefined();
			expect(permGroup!.selected?.id).toBe('acceptEdits');
		});

		it('excludes folder group for single-root workspace', async () => {
			builder = createBuilder([URI.file('/project')]);

			const groups = await builder.buildNewSessionGroups(undefined);

			expect(groups.find(g => g.id === 'folder')).toBeUndefined();
		});

		it('includes folder group for multi-root workspace', async () => {
			builder = createBuilder([URI.file('/a'), URI.file('/b')]);

			const groups = await builder.buildNewSessionGroups(undefined);

			expect(groups.find(g => g.id === 'folder')).toBeDefined();
		});
	});

	describe('buildExistingSessionGroups', () => {
		it('does not lock permission mode items', async () => {
			builder = createBuilder([URI.file('/project')]);

			const groups = await builder.buildExistingSessionGroups('plan', undefined);

			const permGroup = groups.find(g => g.id === 'permissionMode');
			expect(permGroup!.selected?.id).toBe('plan');
			expect(permGroup!.selected?.locked).toBeUndefined();
			expect(permGroup!.items.every(i => !i.locked)).toBe(true);
		});

		it('includes locked folder group when folder URI provided', async () => {
			builder = createBuilder([URI.file('/a'), URI.file('/b')]);
			const folderUri = URI.file('/a');

			const groups = await builder.buildExistingSessionGroups('acceptEdits', folderUri);

			const folderGroup = groups.find(g => g.id === 'folder');
			expect(folderGroup).toBeDefined();
			expect(folderGroup!.selected?.locked).toBe(true);
		});

		it('excludes folder group when folder URI is undefined', async () => {
			builder = createBuilder([URI.file('/project')]);

			const groups = await builder.buildExistingSessionGroups('acceptEdits', undefined);

			expect(groups.find(g => g.id === 'folder')).toBeUndefined();
		});
	});

	describe('getSelections', () => {
		beforeEach(() => {
			builder = createBuilder([URI.file('/a'), URI.file('/b')]);
		});

		it('extracts permission mode from groups', () => {
			const groups: vscode.ChatSessionProviderOptionGroup[] = [{
				id: 'permissionMode',
				name: 'Permission Mode',
				description: '',
				items: [{ id: 'plan', name: 'Plan mode' }],
				selected: { id: 'plan', name: 'Plan mode' },
			}];

			const { permissionMode } = builder.getSelections(groups);

			expect(permissionMode).toBe('plan');
		});

		it('extracts folder URI from groups', () => {
			const groups: vscode.ChatSessionProviderOptionGroup[] = [{
				id: 'folder',
				name: 'Folder',
				description: '',
				items: [{ id: '/some/path', name: 'path' }],
				selected: { id: '/some/path', name: 'path' },
			}];

			const { folderUri } = builder.getSelections(groups);

			expect(folderUri?.fsPath).toBe(URI.file('/some/path').fsPath);
		});

		it('updates lastUsedPermissionMode as side effect', () => {
			expect(builder.lastUsedPermissionMode).toBe('acceptEdits');

			builder.getSelections([{
				id: 'permissionMode',
				name: 'Permission Mode',
				description: '',
				items: [{ id: 'plan', name: 'Plan mode' }],
				selected: { id: 'plan', name: 'Plan mode' },
			}]);

			expect(builder.lastUsedPermissionMode).toBe('plan');
		});

		it('ignores invalid permission mode', () => {
			const { permissionMode } = builder.getSelections([{
				id: 'permissionMode',
				name: 'Permission Mode',
				description: '',
				items: [{ id: 'garbage', name: 'Garbage' }],
				selected: { id: 'garbage', name: 'Garbage' },
			}]);

			expect(permissionMode).toBeUndefined();
			expect(builder.lastUsedPermissionMode).toBe('acceptEdits');
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
