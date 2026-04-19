/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { afterEach, describe, expect, it } from 'vitest';
import { ConfigKey, IConfigurationService } from '../../../../platform/configuration/common/configurationService';
import { TestWorkspaceService } from '../../../../platform/test/node/testWorkspaceService';
import { IWorkspaceService } from '../../../../platform/workspace/common/workspaceService';
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
	const store = new DisposableStore();

	afterEach(() => {
		store.clear();
	});

	function createBuilder(workspaceFolders: URI[], configOverrides?: { bypassPermissions?: boolean }): ClaudeSessionOptionBuilder {
		const workspaceService = new TestWorkspaceService(workspaceFolders);
		const mockFolderMruService = new MockChatFolderMruService();
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
});
