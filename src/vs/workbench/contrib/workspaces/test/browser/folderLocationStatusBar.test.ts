/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Emitter } from '../../../../../base/common/event.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { CommandsRegistry, ICommandService } from '../../../../../platform/commands/common/commands.js';
import { ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { IStorageService } from '../../../../../platform/storage/common/storage.js';
import { IHoverOptions, IHoverService } from '../../../../../platform/hover/browser/hover.js';
import { ILayoutService } from '../../../../../platform/layout/browser/layoutService.js';
import { IResolvedFolderLocation, IWorkspaceFolderLocationService } from '../../../../../platform/workspace/common/folderLocations.js';
import { IWorkspaceContextService, Workspace, WorkspaceFolder } from '../../../../../platform/workspace/common/workspace.js';
import { IStatusbarEntry, IStatusbarService } from '../../../../services/statusbar/browser/statusbar.js';
import { IWorkspaceEditingService } from '../../../../services/workspaces/common/workspaceEditing.js';
import { FolderLocationStatusBarContribution, RETURN_TO_PRIMARY_FOLDER_LOCATION_COMMAND_ID } from '../../browser/folderLocationStatusBar.js';

suite('FolderLocationStatusBarContribution', () => {

	const ds = ensureNoDisposablesAreLeakedInTestSuite();

	const primary = URI.file('/work/project');
	const alternate = URI.file('/work/project-alt');
	const location: IResolvedFolderLocation = { uri: alternate, label: 'Alternate', providerId: 'test', builtIn: true };

	function createFixture() {
		const entries: IStatusbarEntry[] = [];
		let visible = false;
		const hovers: IHoverOptions[] = [];
		const highlighted = new Set<string>();
		const element = { classList: { add: (c: string) => highlighted.add(c), remove: (c: string) => highlighted.delete(c) } };
		const executed: string[] = [];
		const onDidChangeCurrentLocation = ds.add(new Emitter<void>());
		const onDidChangeWorkspaceFolders = ds.add(new Emitter<void>());

		let stored = false;
		let currentLocation: IResolvedFolderLocation | undefined;
		let workspace = new Workspace('id', [new WorkspaceFolder({ uri: primary, name: 'project', index: 0 })], false, null, () => false);

		const contribution = ds.add(new FolderLocationStatusBarContribution(
			{ get currentLocation() { return currentLocation; }, onDidChangeCurrentLocation: onDidChangeCurrentLocation.event } as unknown as IWorkspaceFolderLocationService,
			{ getWorkspace: () => workspace, onDidChangeWorkspaceFolders: onDidChangeWorkspaceFolders.event } as unknown as IWorkspaceContextService,
			{
				addEntry(entry: IStatusbarEntry) {
					entries.push(entry);
					visible = true;
					return { update: (e: IStatusbarEntry) => { entries.push(e); }, dispose: () => { visible = false; } };
				}
			} as unknown as IStatusbarService,
			{ showInstantHover(options: IHoverOptions) { hovers.push(options); } } as unknown as IHoverService,
			{ mainContainer: { ownerDocument: { getElementById: () => element } } } as unknown as ILayoutService,
			{ executeCommand: async (id: string) => { executed.push(id); } } as unknown as ICommandService,
			{ getBoolean: () => stored, store: () => { stored = true; } } as unknown as IStorageService
		));

		return {
			contribution, entries, hovers, highlighted, executed,
			isVisible: () => visible,
			switchTo() {
				currentLocation = location;
				workspace = new Workspace('id', [new WorkspaceFolder({ uri: alternate, primaryUri: primary, name: 'project', index: 0 })], false, null, () => false);
				onDidChangeCurrentLocation.fire();
			},
			returnToPrimary() {
				currentLocation = undefined;
				workspace = new Workspace('id', [new WorkspaceFolder({ uri: primary, name: 'project', index: 0 })], false, null, () => false);
				onDidChangeCurrentLocation.fire();
			}
		};
	}

	test('entry is prominent and shown only at an alternate location', () => {
		const fixture = createFixture();
		assert.strictEqual(fixture.isVisible(), false);

		fixture.switchTo();
		assert.deepStrictEqual(
			{ visible: fixture.isVisible(), text: fixture.entries[0].text, ariaLabel: fixture.entries[0].ariaLabel, command: fixture.entries[0].command, kind: fixture.entries[0].kind },
			{ visible: true, text: '$(location) Alternate', ariaLabel: 'Folder Location, Alternate', command: RETURN_TO_PRIMARY_FOLDER_LOCATION_COMMAND_ID, kind: 'prominent' });

		fixture.returnToPrimary();
		assert.strictEqual(fixture.isVisible(), false);
	});

	test('the introduction hover is shown once, highlights the entry and can return to the primary', async () => {
		const fixture = createFixture();

		fixture.switchTo();
		assert.deepStrictEqual(
			{ hovers: fixture.hovers.length, sticky: fixture.hovers[0].persistence?.sticky, actions: fixture.hovers[0].actions?.map(a => a.label), highlighted: [...fixture.highlighted] },
			{ hovers: 1, sticky: true, actions: ['Return to project', 'Got It'], highlighted: ['folder-location-highlight'] });

		fixture.hovers[0].onDidHide?.();
		assert.deepStrictEqual([...fixture.highlighted], []);

		await fixture.hovers[0].actions![0].run(undefined as never);
		assert.deepStrictEqual(fixture.executed, [RETURN_TO_PRIMARY_FOLDER_LOCATION_COMMAND_ID]);

		fixture.returnToPrimary();
		fixture.switchTo();
		assert.strictEqual(fixture.hovers.length, 1);
	});

	test('return command switches back to the primary location', async () => {
		const calls: [URI, URI | undefined][] = [];
		const workspace = new Workspace('id', [new WorkspaceFolder({ uri: alternate, primaryUri: primary, name: 'project', index: 0 })], false, null, () => false);
		const accessor = {
			get: (id: unknown) => id === IWorkspaceContextService ? { getWorkspace: () => workspace } : id === IWorkspaceEditingService ? { setFolderLocation: async (p: URI, l: URI | undefined) => { calls.push([p, l]); } } : undefined
		} as unknown as ServicesAccessor;

		await CommandsRegistry.getCommand(RETURN_TO_PRIMARY_FOLDER_LOCATION_COMMAND_ID)!.handler(accessor);

		assert.deepStrictEqual(calls, [[primary, undefined]]);
	});
});
