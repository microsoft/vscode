/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { mainWindow } from '../../../../../base/browser/window.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { Emitter } from '../../../../../base/common/event.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { CommandsRegistry, ICommandService } from '../../../../../platform/commands/common/commands.js';
import { ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { ILayoutService } from '../../../../../platform/layout/browser/layoutService.js';
import { IResolvedFolderLocation, IWorkspaceFolderLocationService } from '../../../../../platform/workspace/common/folderLocations.js';
import { IWorkspaceContextService, Workspace, WorkspaceFolder } from '../../../../../platform/workspace/common/workspace.js';
import { resolveOnboardingTarget } from '../../../onboarding/browser/spotlight/onboardingTarget.js';
import { ISpotlightPayload } from '../../../onboarding/browser/spotlight/spotlightTypes.js';
import { onboardingScenarioRegistry } from '../../../onboarding/common/onboardingRegistry.js';
import { IStatusbarEntry, IStatusbarService } from '../../../../services/statusbar/browser/statusbar.js';
import { IWorkspaceEditingService } from '../../../../services/workspaces/common/workspaceEditing.js';
import { FolderLocationStatusBarContribution, RETURN_TO_PRIMARY_FOLDER_LOCATION_COMMAND_ID } from '../../browser/folderLocationStatusBar.js';

suite('FolderLocationStatusBarContribution', () => {

	const ds = ensureNoDisposablesAreLeakedInTestSuite();

	const primary = URI.file('/work/project');
	const alternate = URI.file('/work/project-alt');
	const location: IResolvedFolderLocation = { uri: alternate, label: 'Alternate', description: 'feature/x', icon: Codicon.gitBranch, providerId: 'test', builtIn: true };

	function createFixture() {
		const entries: IStatusbarEntry[] = [];
		let visible = false;
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
			{ mainContainer: { ownerDocument: mainWindow.document } } as unknown as ILayoutService,
			{ executeCommand: async (id: string) => { executed.push(id); } } as unknown as ICommandService
		));

		return {
			contribution, entries, executed,
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
			{ visible: fixture.isVisible(), text: fixture.entries[0].text, ariaLabel: fixture.entries[0].ariaLabel, command: fixture.entries[0].command, kind: fixture.entries[0].kind, tooltip: fixture.entries[0].tooltip },
			{ visible: true, text: '$(git-branch) Alternate', ariaLabel: 'Folder Location, Alternate · feature/x', command: undefined, kind: 'prominent', tooltip: `The folder 'project' is at the location 'Alternate · feature/x', an alternate location of 'project'. Files, search, terminals and extensions use this location, but open editors stay where they are. Opening work in the primary location returns the folder to it.` });

		fixture.returnToPrimary();
		assert.strictEqual(fixture.isVisible(), false);
	});

	test('the introduction is a spotlight on the entry that can return to the primary', async () => {
		const fixture = createFixture();
		const scenario = () => onboardingScenarioRegistry.getScenario('workbench.folderLocation.introduction')!;
		const signal = () => {
			const trigger = scenario().trigger;
			return trigger.kind === 'observable' && trigger.signal.get();
		};
		assert.strictEqual(signal(), false);

		const element = mainWindow.document.body.appendChild(mainWindow.document.createElement('div'));
		element.id = 'status.workspace.folderLocation';
		element.style.cssText = 'width: 10px; height: 10px; display: none';
		ds.add({ dispose: () => element.remove() });
		const nextFrame = () => new Promise<void>(resolve => mainWindow.requestAnimationFrame(() => resolve()));

		fixture.switchTo();
		await nextFrame();
		const whileHidden = signal();

		element.style.display = 'block';
		for (let i = 0; i < 20 && !signal(); i++) {
			await nextFrame();
		}
		const [step] = await (scenario().presentation.payload as ISpotlightPayload).resolveSteps!();
		assert.deepStrictEqual(
			{ whileHidden, signal: signal(), target: resolveOnboardingTarget(mainWindow, step.targetId)?.element === element, primaryAction: step.primaryAction?.label, endTour: step.endTourLabel },
			{ whileHidden: false, signal: true, target: true, primaryAction: 'Return to project', endTour: 'Got It' });

		await step.primaryAction!.run(undefined as never);
		assert.deepStrictEqual(fixture.executed, [RETURN_TO_PRIMARY_FOLDER_LOCATION_COMMAND_ID]);

		fixture.returnToPrimary();
		assert.strictEqual(signal(), false);
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
