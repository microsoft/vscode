/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { IMenubarMenu, IMenubarMenuRecentItemAction, isMenubarMenuItemSubmenu, pruneRecentMenuItems } from '../../common/menubar.js';

suite('Menubar', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	suite('pruneRecentMenuItems', () => {

		const folderUri = URI.file('/tmp/folder');
		const workspaceUri = URI.file('/tmp/workspace.code-workspace');
		const fileUri = URI.file('/tmp/file.txt');

		const recentFolder: IMenubarMenuRecentItemAction = { id: 'openRecentFolder', label: 'folder', uri: folderUri };
		const recentWorkspace: IMenubarMenuRecentItemAction = { id: 'openRecentWorkspace', label: 'workspace', uri: workspaceUri };
		const recentFile: IMenubarMenuRecentItemAction = { id: 'openRecentFile', label: 'file', uri: fileUri };
		const staleFolder: IMenubarMenuRecentItemAction = { id: 'openRecentFolder', label: 'stale', uri: URI.file('/tmp/missing') };

		test('prunes recent items absent from the predicate', () => {
			const menus: { [id: string]: IMenubarMenu } = {
				'File': {
					items: [
						recentFolder,
						staleFolder,
						{ id: 'vscode.menubar.separator' },
						{ id: 'workbench.action.clearRecentFiles', label: 'Clear Recently Opened' }
					]
				}
			};

			const pruned = pruneRecentMenuItems(menus, item => item.uri.toString() === folderUri.toString());

			assert.strictEqual(pruned, true);
			assert.deepStrictEqual(menus['File'].items, [
				recentFolder,
				{ id: 'vscode.menubar.separator' },
				{ id: 'workbench.action.clearRecentFiles', label: 'Clear Recently Opened' }
			]);
		});

		test('prunes nested recent items in submenus', () => {
			const menus: { [id: string]: IMenubarMenu } = {
				'File': {
					items: [
						{
							id: 'submenu',
							label: 'Open Recent',
							submenu: {
								items: [recentWorkspace, recentFile, staleFolder]
							}
						}
					]
				}
			};

			const keep = new Set([workspaceUri.toString(), fileUri.toString()]);
			const pruned = pruneRecentMenuItems(menus, item => keep.has(item.uri.toString()));

			assert.strictEqual(pruned, true);
			const submenu = menus['File'].items[0];
			assert.ok(isMenubarMenuItemSubmenu(submenu));
			assert.deepStrictEqual(submenu.submenu.items, [recentWorkspace, recentFile]);
		});

		test('returns false when nothing was pruned', () => {
			const menus: { [id: string]: IMenubarMenu } = {
				'File': {
					items: [recentFolder, recentWorkspace, recentFile]
				}
			};

			const pruned = pruneRecentMenuItems(menus, () => true);

			assert.strictEqual(pruned, false);
			assert.strictEqual(menus['File'].items.length, 3);
		});
	});
});
