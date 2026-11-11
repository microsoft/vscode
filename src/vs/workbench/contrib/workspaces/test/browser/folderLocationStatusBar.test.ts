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
import { INotificationService, IPromptChoice, IPromptOptions } from '../../../../../platform/notification/common/notification.js';
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
		const prompts: { choices: IPromptChoice[]; options?: IPromptOptions }[] = [];
		const executed: string[] = [];
		const onDidChangeCurrentLocation = ds.add(new Emitter<void>());
		const onDidChangeWorkspaceFolders = ds.add(new Emitter<void>());

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
			{ prompt(_severity: unknown, _message: string, choices: IPromptChoice[], options?: IPromptOptions) { prompts.push({ choices, options }); } } as unknown as INotificationService,
			{ executeCommand: async (id: string) => { executed.push(id); } } as unknown as ICommandService
		));

		return {
			contribution, entries, prompts, executed,
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

	test('entry is shown only at an alternate location and the notification appears once', async () => {
		const fixture = createFixture();
		assert.strictEqual(fixture.isVisible(), false);

		fixture.switchTo();
		assert.strictEqual(fixture.isVisible(), true);
		assert.deepStrictEqual(
			{ text: fixture.entries[0].text, ariaLabel: fixture.entries[0].ariaLabel, command: fixture.entries[0].command, prompts: fixture.prompts.length, neverShowAgain: fixture.prompts[0].options?.neverShowAgain?.id },
			{ text: '$(location) Alternate', ariaLabel: 'Folder Location, Alternate', command: RETURN_TO_PRIMARY_FOLDER_LOCATION_COMMAND_ID, prompts: 1, neverShowAgain: 'workbench.folderLocation.switched' });

		// The notification's button returns to the primary location
		await fixture.prompts[0].choices[0].run();
		assert.deepStrictEqual(fixture.executed, [RETURN_TO_PRIMARY_FOLDER_LOCATION_COMMAND_ID]);

		fixture.switchTo();
		assert.strictEqual(fixture.prompts.length, 1);

		fixture.returnToPrimary();
		assert.strictEqual(fixture.isVisible(), false);
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
