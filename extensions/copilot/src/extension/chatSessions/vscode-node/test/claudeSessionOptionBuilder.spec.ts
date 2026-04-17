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
import {
	ClaudeFolderOptionBuilder,
	ClaudePermissionModeBuilder,
	ClaudeSessionOptionBuilder,
	createFolderBuilderProxy,
	extractFolderGroups,
	extractNonFolderGroups,
} from '../claudeSessionOptionBuilder';

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

	describe('folderBuilder.provideFolderOptionGroups', () => {
		it('returns empty array for single-root workspace', async () => {
			builder = createBuilder([URI.file('/project')]);

			const groups = await builder.folderBuilder.provideFolderOptionGroups(undefined);

			expect(groups).toHaveLength(0);
		});

		it('returns folder group for multi-root workspace', async () => {
			const folderA = URI.file('/a');
			const folderB = URI.file('/b');
			builder = createBuilder([folderA, folderB]);

			const groups = await builder.folderBuilder.provideFolderOptionGroups(undefined);

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

			const groups = await builder.folderBuilder.provideFolderOptionGroups(undefined);

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

			const groups = await builder.folderBuilder.provideFolderOptionGroups(previousInputState);

			expect(groups[0].selected?.id).toBe(folderB.fsPath);
		});
	});

	describe('folderBuilder.buildExistingFolderGroups', () => {
		it('builds locked folder group', () => {
			builder = createBuilder([URI.file('/a'), URI.file('/b')]);
			const folderUri = URI.file('/a');

			const groups = builder.folderBuilder.buildExistingFolderGroups(folderUri);

			expect(groups).toHaveLength(1);
			expect(groups[0].id).toBe('folder');
			expect(groups[0].selected?.locked).toBe(true);
			expect(groups[0].items.every(i => i.locked)).toBe(true);
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

	describe('sub-builder access', () => {
		it('exposes permissionBuilder', () => {
			builder = createBuilder([URI.file('/project')]);
			expect(builder.permissionBuilder).toBeInstanceOf(ClaudePermissionModeBuilder);
		});

		it('exposes folderBuilder', () => {
			builder = createBuilder([URI.file('/project')]);
			expect(builder.folderBuilder).toBeInstanceOf(ClaudeFolderOptionBuilder);
		});
	});
});

describe('ClaudePermissionModeBuilder', () => {
	const store = new DisposableStore();

	afterEach(() => {
		store.clear();
	});

	function createPermissionBuilder(configOverrides?: { bypassPermissions?: boolean }): ClaudePermissionModeBuilder {
		const serviceCollection = store.add(createExtensionUnitTestingServices(store));
		const accessor = serviceCollection.createTestingAccessor();
		const configService = accessor.get(IConfigurationService);
		if (configOverrides?.bypassPermissions) {
			configService.setConfig(ConfigKey.ClaudeAgentAllowDangerouslySkipPermissions, true);
		}
		return new ClaudePermissionModeBuilder(configService);
	}

	it('builds new session group with default selection', () => {
		const builder = createPermissionBuilder();
		const group = builder.buildNewSessionGroup(undefined);
		expect(group.selected?.id).toBe('acceptEdits');
	});

	it('builds existing session group with specified permission', () => {
		const builder = createPermissionBuilder();
		const group = builder.buildExistingSessionGroup('plan');
		expect(group.selected?.id).toBe('plan');
		expect(group.selected?.locked).toBeUndefined();
	});

	it('normalizes dontAsk to acceptEdits for existing sessions', () => {
		const builder = createPermissionBuilder();
		const group = builder.buildExistingSessionGroup('dontAsk');
		expect(group.selected?.id).toBe('acceptEdits');
	});

	it('tracks last used permission mode', () => {
		const builder = createPermissionBuilder();
		expect(builder.lastUsedPermissionMode).toBe('acceptEdits');

		builder.getSelectedPermissionMode([{
			id: 'permissionMode',
			name: 'Permission Mode',
			description: '',
			items: [{ id: 'plan', name: 'Plan mode' }],
			selected: { id: 'plan', name: 'Plan mode' },
		}]);

		expect(builder.lastUsedPermissionMode).toBe('plan');
	});
});

describe('ClaudeFolderOptionBuilder', () => {
	let mockFolderMruService: MockChatFolderMruService;
	const store = new DisposableStore();

	afterEach(() => {
		store.clear();
	});

	function createFolderBuilder(workspaceFolders: URI[]): ClaudeFolderOptionBuilder {
		const workspaceService = new TestWorkspaceService(workspaceFolders);
		mockFolderMruService = new MockChatFolderMruService();
		return new ClaudeFolderOptionBuilder(mockFolderMruService, workspaceService);
	}

	it('handleInputStateChange is a no-op', async () => {
		const folderBuilder = createFolderBuilder([URI.file('/a'), URI.file('/b')]);
		const state = {
			groups: [{ id: 'folder', name: 'Folder', description: '', items: [], selected: undefined }],
			sessionResource: undefined,
			onDidChange: Event.None,
		} as vscode.ChatSessionInputState;

		await folderBuilder.handleInputStateChange(state);

		expect(state.groups).toHaveLength(1);
	});

	it('rebuildInputState replaces groups', async () => {
		const folderA = URI.file('/a');
		const folderB = URI.file('/b');
		const folderBuilder = createFolderBuilder([folderA, folderB]);
		const state = {
			groups: [] as vscode.ChatSessionProviderOptionGroup[],
			sessionResource: undefined,
			onDidChange: Event.None,
		} as vscode.ChatSessionInputState;

		await folderBuilder.rebuildInputState(state);

		expect(state.groups).toHaveLength(1);
		expect(state.groups[0].id).toBe('folder');
	});

	it('getSelectedFolder extracts folder URI', () => {
		const folderBuilder = createFolderBuilder([]);
		const folderUri = folderBuilder.getSelectedFolder([{
			id: 'folder',
			name: 'Folder',
			description: '',
			items: [{ id: '/some/path', name: 'path' }],
			selected: { id: '/some/path', name: 'path' },
		}]);

		expect(folderUri?.fsPath).toBe(URI.file('/some/path').fsPath);
	});
});

describe('createFolderBuilderProxy', () => {
	const store = new DisposableStore();

	afterEach(() => {
		store.clear();
	});

	it('isolates folder groups from real state', () => {
		const folderGroup: vscode.ChatSessionProviderOptionGroup = {
			id: 'folder', name: 'Folder', description: '', items: [{ id: '/a', name: 'a' }], selected: { id: '/a', name: 'a' },
		};
		const permGroup: vscode.ChatSessionProviderOptionGroup = {
			id: 'permissionMode', name: 'Permission', description: '', items: [{ id: 'plan', name: 'Plan' }], selected: { id: 'plan', name: 'Plan' },
		};

		const realState = {
			groups: [folderGroup, permGroup] as vscode.ChatSessionProviderOptionGroup[],
			sessionResource: undefined,
			onDidChange: Event.None,
		} as vscode.ChatSessionInputState;

		const { proxyState } = createFolderBuilderProxy(realState, [folderGroup]);

		expect(proxyState.groups).toHaveLength(1);
		expect(proxyState.groups[0].id).toBe('folder');
	});

	it('fires change event when proxy groups are written', () => {
		const folderGroup: vscode.ChatSessionProviderOptionGroup = {
			id: 'folder', name: 'Folder', description: '', items: [{ id: '/a', name: 'a' }], selected: { id: '/a', name: 'a' },
		};

		const realState = {
			groups: [folderGroup] as vscode.ChatSessionProviderOptionGroup[],
			sessionResource: undefined,
			onDidChange: Event.None,
		} as vscode.ChatSessionInputState;

		const { proxyState, onDidProxyGroupsChange } = createFolderBuilderProxy(realState, [folderGroup]);

		let fired = false;
		store.add(onDidProxyGroupsChange(() => { fired = true; }));

		proxyState.groups = [];
		expect(fired).toBe(true);
	});
});

describe('extractFolderGroups / extractNonFolderGroups', () => {
	it('separates folder and non-folder groups', () => {
		const folderGroup: vscode.ChatSessionProviderOptionGroup = {
			id: 'folder', name: 'Folder', description: '', items: [],
		};
		const permGroup: vscode.ChatSessionProviderOptionGroup = {
			id: 'permissionMode', name: 'Permission', description: '', items: [],
		};
		const groups = [folderGroup, permGroup];

		expect(extractFolderGroups(groups)).toEqual([folderGroup]);
		expect(extractNonFolderGroups(groups)).toEqual([permGroup]);
	});
});

describe('ClaudeSessionOptionBuilder.createFolderProxy', () => {
	let builder: ClaudeSessionOptionBuilder;
	const store = new DisposableStore();

	afterEach(() => {
		store.clear();
	});

	function createBuilder(workspaceFolders: URI[]): ClaudeSessionOptionBuilder {
		const workspaceService = new TestWorkspaceService(workspaceFolders);
		const mockFolderMruService = new MockChatFolderMruService();
		const serviceCollection = store.add(createExtensionUnitTestingServices(store));
		serviceCollection.set(IWorkspaceService, workspaceService);
		const accessor = serviceCollection.createTestingAccessor();
		const configService = accessor.get(IConfigurationService);
		return new ClaudeSessionOptionBuilder(configService, mockFolderMruService, workspaceService);
	}

	it('reassembles real state groups after proxy folder updates', () => {
		builder = createBuilder([URI.file('/a'), URI.file('/b')]);
		const initialFolderGroup: vscode.ChatSessionProviderOptionGroup = {
			id: 'folder', name: 'Folder', description: '', items: [{ id: '/a', name: 'a' }], selected: { id: '/a', name: 'a' },
		};
		const updatedFolderGroup: vscode.ChatSessionProviderOptionGroup = {
			id: 'folder', name: 'Folder', description: '', items: [{ id: '/b', name: 'b' }], selected: { id: '/b', name: 'b' },
		};
		const permGroup: vscode.ChatSessionProviderOptionGroup = {
			id: 'permissionMode', name: 'Permission', description: '', items: [{ id: 'plan', name: 'Plan' }], selected: { id: 'plan', name: 'Plan' },
		};

		const realState = {
			groups: [initialFolderGroup, permGroup] as vscode.ChatSessionProviderOptionGroup[],
			sessionResource: undefined,
			onDidChange: Event.None,
		} as vscode.ChatSessionInputState;

		const { proxyState, dispose } = builder.createFolderProxy(realState);
		store.add(dispose);

		proxyState.groups = [updatedFolderGroup];

		expect(realState.groups).toHaveLength(2);
		expect(realState.groups[0]).toEqual(updatedFolderGroup);
		expect(realState.groups[1]).toEqual(permGroup);
	});

	it('dispose cleans up proxy resources', () => {
		builder = createBuilder([URI.file('/a')]);
		const realState = {
			groups: [] as vscode.ChatSessionProviderOptionGroup[],
			sessionResource: undefined,
			onDidChange: Event.None,
		} as vscode.ChatSessionInputState;

		const { proxyState, dispose } = builder.createFolderProxy(realState);
		dispose.dispose();

		// After dispose, writing to proxy should not throw but also not update real state
		proxyState.groups = [{ id: 'folder', name: 'Folder', description: '', items: [] }];
		expect(realState.groups).toHaveLength(0);
	});
});
