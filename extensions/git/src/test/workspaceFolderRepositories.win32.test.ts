/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'mocha';
import * as assert from 'assert';
import { Uri, WorkspaceFolder } from 'vscode';
import { WorkspaceFolderRepositories } from '../workspaceFolderRepositories';
import { isWindows } from '../util';

function folder(fsPath: string, locations?: string[]): WorkspaceFolder {
	return { uri: Uri.file(fsPath), name: fsPath, index: 0, locations: locations?.map(l => ({ uri: Uri.file(l), name: l })) };
}

(isWindows ? suite : suite.skip)('WorkspaceFolderRepositories (Windows paths)', () => {

	const locations = ['C:\\Repo\\Primary', 'C:\\Repo\\Primary\\.worktrees\\w1', '\\\\Server\\Share\\WT2'];

	test('a switch is recognised ignoring drive letter and path casing, separators and UNC share casing', () => {
		const model = new WorkspaceFolderRepositories<{ root: string }>();
		const from = folder('c:\\repo\\primary', locations);

		assert.deepStrictEqual([
			model.getFolderLocationSwitches({ added: [folder('c:\\REPO\\primary\\.WORKTREES\\w1')], removed: [from] })?.length,
			model.getFolderLocationSwitches({ added: [folder('\\\\server\\share\\wt2\\')], removed: [from] })?.length,
			model.getFolderLocationSwitches({ added: [folder('C:\\Repo\\Other')], removed: [from] })?.length,
		], [1, 1, undefined]);
	});

	test('switching back shows the warm repository of the location whatever its path casing', () => {
		const model = new WorkspaceFolderRepositories<{ root: string }>();
		const primary = { root: 'C:\\Repo\\Primary' };
		const nested = { root: 'C:\\Repo\\Primary\\.worktrees\\w1' };

		const toNested = folder('c:\\repo\\PRIMARY\\.worktrees\\W1');
		const away = model.switchFolderLocations(model.getFolderLocationSwitches({ added: [toNested], removed: [folder('c:\\repo\\primary', locations)] })!, [toNested], [primary]);
		model.setOpenedRepository(away.open[0], nested);
		const opened = model.completeOpening(away.open[0], [toNested], [primary, nested]);
		const back = folder('C:\\REPO\\PRIMARY');
		const backChanges = model.switchFolderLocations(model.getFolderLocationSwitches({ added: [back], removed: [folder('c:\\repo\\PRIMARY\\.worktrees\\W1', locations)] })!, [back], [primary, nested]);

		assert.deepStrictEqual({ away: { warm: away.warm, open: away.open.length }, opened: opened.show, back: { show: backChanges.show, warm: backChanges.warm } }, {
			away: { warm: [primary], open: 1 },
			opened: [nested],
			back: { show: [primary], warm: [nested] }
		});
	});
});
