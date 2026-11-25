/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Codicon } from '../../../../../base/common/codicons.js';
import { Emitter } from '../../../../../base/common/event.js';
import { toDisposable } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IResolvedFolderLocation, IWorkspaceFolderLocationService } from '../../../../../platform/workspace/common/folderLocations.js';
import { IWorkspaceContextService, IWorkspaceFolder } from '../../../../../platform/workspace/common/workspace.js';
import { IActivity, IActivityService, IconBadge } from '../../../../services/activity/common/activity.js';
import { VIEWLET_ID } from '../../../files/common/files.js';
import { FolderLocationExplorerBadgeContribution } from '../../browser/folderLocationExplorerBadge.js';

suite('FolderLocationExplorerBadgeContribution', () => {

	const ds = ensureNoDisposablesAreLeakedInTestSuite();

	function folder(name: string): IWorkspaceFolder {
		return { uri: URI.file(`/work/${name}`), name, index: 0, toResource: () => URI.file(`/work/${name}`) };
	}

	function createFixture(initialFolders: IWorkspaceFolder[]) {
		const locations = new Map<string, IResolvedFolderLocation>();
		let folders = initialFolders;
		const onDidChangeLocation = ds.add(new Emitter<void>());
		const onDidChangeCanSetLocation = ds.add(new Emitter<void>());
		const shown: { viewContainerId: string; activity: IActivity }[] = [];
		const visible = new Set<IActivity>();

		const contribution = ds.add(new FolderLocationExplorerBadgeContribution(
			{ getLocation: (f: IWorkspaceFolder) => locations.get(f.name), onDidChangeLocation: onDidChangeLocation.event, onDidChangeCanSetLocation: onDidChangeCanSetLocation.event } as unknown as IWorkspaceFolderLocationService,
			{ getWorkspace: () => ({ folders }) } as unknown as IWorkspaceContextService,
			{
				showViewContainerActivity: (viewContainerId: string, activity: IActivity) => {
					shown.push({ viewContainerId, activity });
					visible.add(activity);
					return toDisposable(() => visible.delete(activity));
				}
			} as unknown as IActivityService
		));

		return {
			contribution,
			setLocation: (name: string, location: IResolvedFolderLocation | undefined) => {
				if (location) {
					locations.set(name, location);
				} else {
					locations.delete(name);
				}
				onDidChangeLocation.fire();
			},
			describe: () => Array.from(visible).map(activity => {
				const badge = activity.badge as IconBadge;
				return { container: shown.find(s => s.activity === activity)!.viewContainerId, icon: badge.icon.id, description: badge.getDescription() };
			}),
			setFolders: (value: IWorkspaceFolder[]) => { folders = value; onDidChangeCanSetLocation.fire(); },
			/** The service stops reporting a location (such as when entering a saved workspace) without any folder change. */
			dropLocationsWithoutFolderChange: () => { locations.clear(); onDidChangeCanSetLocation.fire(); }
		};
	}

	const location = (label: string): IResolvedFolderLocation => ({ uri: URI.file('/work/alt'), label, icon: Codicon.gitBranch, providerId: 'test', builtIn: true });

	test('badges the Explorer only while a folder is at an alternate location', () => {
		const fixture = createFixture([folder('project')]);
		const initial = fixture.describe();

		fixture.setLocation('project', location('feature-x'));
		const atAlternate = fixture.describe();

		fixture.setLocation('project', undefined);
		const atPrimary = fixture.describe();

		assert.deepStrictEqual({ initial, atAlternate, atPrimary }, {
			initial: [],
			atAlternate: [{ container: VIEWLET_ID, icon: Codicon.gitBranch.id, description: `'project' is open at feature-x` }],
			atPrimary: []
		});
	});

	test('summarizes several folders at another location', () => {
		const fixture = createFixture([folder('a'), folder('b')]);
		fixture.setLocation('a', location('x'));
		fixture.setLocation('b', location('y'));

		assert.deepStrictEqual(fixture.describe().map(b => b.description), ['2 folders are at another location']);
	});

	test('clears the badge when the service stops reporting a location without a folder change', () => {
		const fixture = createFixture([folder('project')]);
		fixture.setLocation('project', location('feature-x'));
		const before = fixture.describe().length;

		fixture.dropLocationsWithoutFolderChange();

		assert.deepStrictEqual({ before, after: fixture.describe() }, { before: 1, after: [] });
	});
});
