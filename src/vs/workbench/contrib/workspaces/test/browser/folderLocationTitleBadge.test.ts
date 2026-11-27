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
import { IAgenticModeService } from '../../../../services/agenticMode/common/agenticMode.js';
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
		let agenticMode = false;
		/** In Agentic Mode: the location each mounted folder was mounted from, and the locations the providers resolve. */
		const primaries = new Map<string, URI>();
		const resolvable = new Map<string, IResolvedFolderLocation>();
		const onDidChangeLocation = ds.add(new Emitter<IFolderLocationChangeEvent>());
		const onDidChangeCanSetLocation = ds.add(new Emitter<void>());
		const onDidChangeLocations = ds.add(new Emitter<void>());
		const onDidChangeWorkspaceFolders = ds.add(new Emitter<IWorkspaceFoldersChangeEvent>());
		const onDidChangeAgenticMode = ds.add(new Emitter<boolean>());
		const visible = new Map<string, IViewTitleBadge>();

		ds.add(new FolderLocationTitleBadgeContribution(
			new class extends mock<IWorkspaceFolderLocationService>() {
				override readonly onDidChangeLocation = onDidChangeLocation.event;
				override readonly onDidChangeCanSetLocation = onDidChangeCanSetLocation.event;
				override readonly onDidChangeLocations = onDidChangeLocations.event;
				override getLocation() { return location; }
				override isAtAlternateLocation(folder: IWorkspaceFolder) { const primary = primaries.get(folder.uri.toString()); return !!primary && primary.toString() !== folder.uri.toString(); }
				override async resolveLocation(primary: URI, uri: URI) { return resolvable.get(uri.toString()); }
			}(),
			new class extends mock<IWorkspaceContextService>() {
				override readonly onDidChangeWorkspaceFolders = onDidChangeWorkspaceFolders.event;
				override readonly onDidChangeWorkbenchState = Event.None;
				// The Agents workspace of Agentic Mode is a workspace, also with one folder
				override getWorkbenchState() { return folders.length === 1 && !agenticMode ? WorkbenchState.FOLDER : WorkbenchState.WORKSPACE; }
				override getWorkspace() { return { id: 'id', folders, uri: folders.length === 1 && !agenticMode ? URI.file(`/work/${folders[0].name}`) : undefined } as ReturnType<IWorkspaceContextService['getWorkspace']>; }
				getFolderPrimaryLocation(uri: URI) { return primaries.get(uri.toString()); }
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
			}(),
			{ get isActive() { return agenticMode; }, onDidChange: onDidChangeAgenticMode.event } as unknown as IAgenticModeService
		));

		return {
			setAgenticMode(value: boolean) { agenticMode = value; onDidChangeAgenticMode.fire(value); },
			/** Moves the one mounted folder of Agentic Mode from `primary` to `to`, which the providers resolve as `resolved`. */
			moveMountedFolder(to: IWorkspaceFolder, primary: URI, resolved: IResolvedFolderLocation | undefined) {
				primaries.clear();
				primaries.set(to.uri.toString(), primary);
				resolvable.clear();
				if (resolved) {
					resolvable.set(to.uri.toString(), resolved);
				}
				this.setFolders([to]);
			},
			resolveLater(uri: URI, resolved: IResolvedFolderLocation) { resolvable.set(uri.toString(), resolved); onDidChangeLocations.fire(); },
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

	test('in Agentic Mode shows the location of the one mounted folder while it was moved to an alternate location', async () => {
		const mounted = folder('project');
		const fixture = createFixture([]);
		const settle = () => new Promise<void>(resolve => setTimeout(resolve, 0));
		const repository = URI.file('/work/project');
		const states: Record<string, Record<string, IViewTitleBadge>> = {};
		// The label service knows no location in the mode, so the badge names the resolved location
		const modeBadge: IViewTitleBadge = { ...badge, tooltip: `fix (alternate location of 'project')`, ariaLabel: 'Folder Location, fix' };

		fixture.setAgenticMode(true);
		fixture.moveMountedFolder({ ...mounted, uri: repository }, repository, undefined);
		await settle();
		states['at its own location'] = fixture.badges();

		fixture.moveMountedFolder(mounted, repository, worktree);
		await settle();
		states['moved to a worktree'] = fixture.badges();

		fixture.setAgenticMode(false);
		await settle();
		states['left the mode'] = fixture.badges();

		fixture.setAgenticMode(true);
		fixture.moveMountedFolder(mounted, repository, undefined);
		await settle();
		states['not resolved yet'] = fixture.badges();
		fixture.resolveLater(mounted.uri, worktree);
		await settle();
		states['resolved once providers know it'] = fixture.badges();

		assert.deepStrictEqual(states, {
			'at its own location': {},
			'moved to a worktree': { [VIEW_ID]: modeBadge, [SESSIONS_FILES_VIEW_ID]: modeBadge },
			'left the mode': {},
			'not resolved yet': {},
			'resolved once providers know it': { [VIEW_ID]: modeBadge, [SESSIONS_FILES_VIEW_ID]: modeBadge },
		});
	});
});
