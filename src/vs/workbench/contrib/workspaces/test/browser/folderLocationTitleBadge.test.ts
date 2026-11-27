/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Codicon } from '../../../../../base/common/codicons.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { toDisposable } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ILabelService } from '../../../../../platform/label/common/label.js';
import { IFolderLocationChangeEvent, IResolvedFolderLocation, IWorkspaceFolderLocationService } from '../../../../../platform/workspace/common/folderLocations.js';
import { IWorkspaceContextService, IWorkspaceFolder, IWorkspaceFoldersChangeEvent, WorkbenchState } from '../../../../../platform/workspace/common/workspace.js';
import { IActivityService, IViewTitleBadge } from '../../../../services/activity/common/activity.js';
import { SESSIONS_FILES_VIEW_ID, VIEW_ID } from '../../../files/common/files.js';
import { FolderLocationTitleBadgeContribution } from '../../browser/folderLocationTitleBadge.js';

suite('FolderLocationTitleBadgeContribution', () => {

	const ds = ensureNoDisposablesAreLeakedInTestSuite();

	function folder(name: string): IWorkspaceFolder {
		return { uri: URI.file(`/work/${name}.worktrees/fix`), name, index: 0, toResource: () => URI.file(`/work/${name}`) };
	}

	function createFixture(initialFolders: IWorkspaceFolder[]) {
		let location: IResolvedFolderLocation | undefined;
		let folders = initialFolders;
		const onDidChangeLocation = ds.add(new Emitter<IFolderLocationChangeEvent>());
		const onDidChangeCanSetLocation = ds.add(new Emitter<void>());
		const onDidChangeWorkspaceFolders = ds.add(new Emitter<IWorkspaceFoldersChangeEvent>());
		const visible = new Map<string, IViewTitleBadge>();

		ds.add(new FolderLocationTitleBadgeContribution(
			new class extends mock<IWorkspaceFolderLocationService>() {
				override readonly onDidChangeLocation = onDidChangeLocation.event;
				override readonly onDidChangeCanSetLocation = onDidChangeCanSetLocation.event;
				override getLocation() { return location; }
			}(),
			new class extends mock<IWorkspaceContextService>() {
				override readonly onDidChangeWorkspaceFolders = onDidChangeWorkspaceFolders.event;
				override readonly onDidChangeWorkbenchState = Event.None;
				override getWorkbenchState() { return folders.length === 1 ? WorkbenchState.FOLDER : WorkbenchState.WORKSPACE; }
				override getWorkspace() { return { id: 'id', folders, uri: folders.length === 1 ? URI.file(`/work/${folders[0].name}`) : undefined } as ReturnType<IWorkspaceContextService['getWorkspace']>; }
			}(),
			new class extends mock<ILabelService>() {
				override readonly onDidChangeFormatters = Event.None;
				override getFolderLocationLabel() { return location ? `Worktree · ${location.label}` : undefined; }
			}(),
			new class extends mock<IActivityService>() {
				override showViewTitleBadge(viewId: string, badge: IViewTitleBadge) {
					visible.set(viewId, badge);
					return toDisposable(() => {
						if (visible.get(viewId) === badge) {
							visible.delete(viewId);
						}
					});
				}
			}()
		));

		return {
			setLocation(value: IResolvedFolderLocation | undefined) { location = value; onDidChangeLocation.fire({ folder: folders[0], reason: 'user' }); },
			setFolders(value: IWorkspaceFolder[]) { folders = value; onDidChangeWorkspaceFolders.fire({ added: [], removed: [], changed: [] }); },
			dropLocationWithoutFolderChange() { location = undefined; onDidChangeCanSetLocation.fire(); },
			badges: () => Object.fromEntries(visible),
		};
	}

	const worktree: IResolvedFolderLocation = { uri: URI.file('/work/project.worktrees/fix'), label: 'fix', icon: Codicon.worktree, providerId: 'test', builtIn: true };
	const badge: IViewTitleBadge = { icon: Codicon.worktree, label: 'fix', tooltip: `Worktree · fix (alternate location of 'project')`, ariaLabel: 'Folder Location, Worktree · fix' };

	test('shows the location after the title of the views of the folder only while a single folder is at an alternate location', () => {
		const fixture = createFixture([folder('project')]);
		const states = [fixture.badges()];
		fixture.setLocation(worktree);
		states.push(fixture.badges());
		fixture.setLocation(undefined);
		states.push(fixture.badges());
		fixture.setLocation(worktree);
		fixture.dropLocationWithoutFolderChange();
		states.push(fixture.badges());
		fixture.setLocation(worktree);
		fixture.setFolders([folder('project'), folder('other')]);
		states.push(fixture.badges());

		assert.deepStrictEqual(states, [{}, { [VIEW_ID]: badge, [SESSIONS_FILES_VIEW_ID]: badge }, {}, {}, {}]);
	});
});
