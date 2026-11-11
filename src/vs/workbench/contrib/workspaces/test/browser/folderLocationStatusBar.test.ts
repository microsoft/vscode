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
import { IQuickInputService, IQuickPickItem } from '../../../../../platform/quickinput/common/quickInput.js';
import { IUriIdentityService } from '../../../../../platform/uriIdentity/common/uriIdentity.js';
import { extUri } from '../../../../../base/common/resources.js';
import { ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { IResolvedFolderLocation, IWorkspaceFolderLocationService } from '../../../../../platform/workspace/common/folderLocations.js';
import { IWorkspaceContextService, Workspace, WorkspaceFolder } from '../../../../../platform/workspace/common/workspace.js';
import { resolveOnboardingTarget } from '../../../onboarding/browser/spotlight/onboardingTarget.js';
import { ISpotlightPayload } from '../../../onboarding/browser/spotlight/spotlightTypes.js';
import { onboardingScenarioRegistry } from '../../../onboarding/common/onboardingRegistry.js';
import { IOnboardingScenarioService } from '../../../onboarding/common/onboardingScenarioService.js';
import { IWorkbenchLayoutService, Parts } from '../../../../services/layout/browser/layoutService.js';
import { IStatusbarEntry, IStatusbarService, StatusbarAlignment } from '../../../../services/statusbar/browser/statusbar.js';
import { IWorkspaceEditingService } from '../../../../services/workspaces/common/workspaceEditing.js';
import { FolderLocationStatusBarContribution, RETURN_TO_PRIMARY_FOLDER_LOCATION_COMMAND_ID, SWITCH_FOLDER_LOCATION_COMMAND_ID } from '../../browser/folderLocationStatusBar.js';

suite('FolderLocationStatusBarContribution', () => {

	const ds = ensureNoDisposablesAreLeakedInTestSuite();

	const primary = URI.file('/work/project');
	const alternate = URI.file('/work/project-alt');
	const location: IResolvedFolderLocation = { uri: alternate, label: 'Alternate', description: 'feature/x', icon: Codicon.gitBranch, providerId: 'test', builtIn: true };

	function createFixture(shown = { value: false }) {
		const entries: IStatusbarEntry[] = [];
		const added: { alignment: unknown; priority: unknown }[] = [];
		let visible = false;
		const executed: string[] = [];
		const onDidChangeCurrentLocation = ds.add(new Emitter<void>());
		const onDidChangeWorkspaceFolders = ds.add(new Emitter<void>());
		const onDidChangeEntryVisibility = ds.add(new Emitter<{ id: string; visible: boolean }>());
		const onDidChangePartVisibility = ds.add(new Emitter<{ partId: string; visible: boolean }>());
		const statusbarContainer = mainWindow.document.body.appendChild(mainWindow.document.createElement('div'));
		ds.add({ dispose: () => statusbarContainer.remove() });

		let currentLocation: IResolvedFolderLocation | undefined;
		let workspace = new Workspace('id', [new WorkspaceFolder({ uri: primary, name: 'project', index: 0 })], false, null, () => false);

		const contribution = ds.add(new FolderLocationStatusBarContribution(
			{ get currentLocation() { return currentLocation; }, onDidChangeCurrentLocation: onDidChangeCurrentLocation.event } as unknown as IWorkspaceFolderLocationService,
			{ getWorkspace: () => workspace, onDidChangeWorkspaceFolders: onDidChangeWorkspaceFolders.event } as unknown as IWorkspaceContextService,
			{
				onDidChangeEntryVisibility: onDidChangeEntryVisibility.event,
				addEntry(entry: IStatusbarEntry, _id: string, alignment: unknown, priority: unknown) {
					added.push({ alignment, priority });
					entries.push(entry);
					visible = true;
					return { update: (e: IStatusbarEntry) => { entries.push(e); }, dispose: () => { visible = false; } };
				}
			} as unknown as IStatusbarService,
			{ getContainer: () => statusbarContainer, onDidChangePartVisibility: onDidChangePartVisibility.event } as unknown as IWorkbenchLayoutService,
			{ executeCommand: async (id: string) => { executed.push(id); } } as unknown as ICommandService,
			{ hasBeenShown: () => shown.value } as unknown as IOnboardingScenarioService
		));

		return {
			contribution, entries, executed, added, statusbarContainer,
			entryVisibilityChanged: () => onDidChangeEntryVisibility.fire({ id: 'status.workspace.folderLocation', visible: true }),
			partVisibilityChanged: () => onDidChangePartVisibility.fire({ partId: Parts.STATUSBAR_PART, visible: true }),
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

	test('entry sits after the remote indicator and before the SCM entries', () => {
		const fixture = createFixture();
		fixture.switchTo();
		assert.deepStrictEqual(fixture.added, [{ alignment: StatusbarAlignment.LEFT, priority: 10000.1 }]);
	});

	test('entry is prominent and shown only at an alternate location', () => {
		const fixture = createFixture();
		assert.strictEqual(fixture.isVisible(), false);

		fixture.switchTo();
		assert.deepStrictEqual(
			{ visible: fixture.isVisible(), text: fixture.entries[0].text, ariaLabel: fixture.entries[0].ariaLabel, command: fixture.entries[0].command, kind: fixture.entries[0].kind, tooltip: fixture.entries[0].tooltip },
			{ visible: true, text: '$(git-branch) Alternate', ariaLabel: 'Folder Location, Alternate · feature/x', command: SWITCH_FOLDER_LOCATION_COMMAND_ID, kind: 'prominent', tooltip: `Alternate · feature/x (alternate location of 'project')` });

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
		fixture.entryVisibilityChanged();
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

	suite('introduction observation', () => {

		function setup(shown: { value: boolean }) {
			const fixture = createFixture(shown);
			const trigger = onboardingScenarioRegistry.getScenario('workbench.folderLocation.introduction')!.trigger;
			const signal = () => trigger.kind === 'observable' && trigger.signal.get();
			const element = mainWindow.document.body.appendChild(mainWindow.document.createElement('div'));
			element.id = 'status.workspace.folderLocation';
			element.style.cssText = 'width: 10px; height: 10px; display: block';
			ds.add({ dispose: () => element.remove() });
			const frames = async (count: number) => {
				for (let i = 0; i < count; i++) {
					await new Promise<void>(resolve => mainWindow.requestAnimationFrame(() => resolve()));
				}
			};
			return { fixture, signal, element, frames };
		}

		test('no observer when the introduction was already shown', async () => {
			const { fixture, signal, frames } = setup({ value: true });
			fixture.switchTo();
			await frames(5);
			assert.strictEqual(signal(), false);
		});

		test('readiness follows visibility changes at an unchanged size, and observation ends once it was shown', async () => {
			const shown = { value: false };
			const { fixture, signal, element, frames } = setup(shown);
			fixture.switchTo();
			await frames(3);
			assert.strictEqual(signal(), true);

			element.style.visibility = 'hidden';
			fixture.entryVisibilityChanged();
			await frames(3);
			assert.strictEqual(signal(), false);

			element.style.visibility = 'visible';
			fixture.partVisibilityChanged();
			await frames(3);
			assert.strictEqual(signal(), true);

			// marked as shown while hidden, at an unchanged size: the next event ends the observation
			element.style.visibility = 'hidden';
			shown.value = true;
			fixture.entryVisibilityChanged();
			await frames(3);
			element.style.visibility = 'visible';
			fixture.entryVisibilityChanged();
			await frames(3);
			assert.strictEqual(signal(), true);
		});

		test('a re-created entry is found when the status bar resizes', async () => {
			const { fixture, signal, element, frames } = setup({ value: false });
			element.remove();
			fixture.switchTo();
			await frames(3);
			assert.strictEqual(signal(), false);

			mainWindow.document.body.appendChild(element);
			fixture.statusbarContainer.style.width = '40px';
			fixture.statusbarContainer.style.height = '10px';
			await frames(5);
			assert.strictEqual(signal(), true);
		});

		test('no frame is requested while idle', async () => {
			const { fixture, frames } = setup({ value: false });
			fixture.switchTo();
			await frames(5);

			const original = mainWindow.requestAnimationFrame;
			let requested = 0;
			mainWindow.requestAnimationFrame = callback => { requested++; return original.call(mainWindow, callback); };
			try {
				await new Promise<void>(resolve => setTimeout(resolve, 300));
			} finally {
				mainWindow.requestAnimationFrame = original;
			}
			assert.strictEqual(requested, 0);
		});

		test('no observer when switching again after it was shown', async () => {
			const shown = { value: false };
			const { fixture, signal, frames } = setup(shown);
			fixture.switchTo();
			await frames(5);
			shown.value = true;
			fixture.returnToPrimary();
			fixture.switchTo();
			await frames(5);
			assert.strictEqual(signal(), false);
		});
	});

	test('return command switches back to the primary location', async () => {
		const calls: [URI, URI | undefined, string | undefined][] = [];
		const workspace = new Workspace('id', [new WorkspaceFolder({ uri: alternate, primaryUri: primary, name: 'project', index: 0 })], false, null, () => false);
		const accessor = {
			get: (id: unknown) => id === IWorkspaceContextService ? { getWorkspace: () => workspace } : id === IWorkspaceEditingService ? { setFolderLocation: async (p: URI, l: URI | undefined, o?: { reason?: string }) => { calls.push([p, l, o?.reason]); } } : undefined
		} as unknown as ServicesAccessor;

		await CommandsRegistry.getCommand(RETURN_TO_PRIMARY_FOLDER_LOCATION_COMMAND_ID)!.handler(accessor);

		assert.deepStrictEqual(calls, [[primary, undefined, 'user']]);
	});

	suite('switch command', () => {

		async function pickLocation(choose: (items: { label: string; description?: string; picked?: boolean }[]) => number | undefined, switchedWhileOpen?: URI, primaryChangedTo?: URI) {
			const calls: [string, string | undefined, string | undefined][] = [];
			let shown: { label: string; description?: string; picked?: boolean }[] = [];
			let workspace = new Workspace('id', [new WorkspaceFolder({ uri: alternate, primaryUri: primary, name: 'project', index: 0 })], false, null, () => false);
			const accessor = {
				get: (id: unknown) => id === IWorkspaceContextService ? { getWorkspace: () => workspace }
					: id === IWorkspaceFolderLocationService ? { getLocations: async () => [{ uri: alternate, label: 'Alternate', description: 'feature/x', icon: Codicon.gitBranch }, { uri: URI.file('/work/other'), label: 'Other' }] }
						: id === IUriIdentityService ? { extUri }
							: id === IQuickInputService ? { pick: async (items: (IQuickPickItem & { uri: URI })[]) => { shown = items; const index = choose(items); if (switchedWhileOpen) { workspace = new Workspace('id', [new WorkspaceFolder({ uri: switchedWhileOpen, primaryUri: primaryChangedTo ?? primary, name: 'project', index: 0 })], false, null, () => false); } return index === undefined ? undefined : items[index]; } }
								: id === IWorkspaceEditingService ? { setFolderLocation: async (p: URI, l: URI | undefined, o?: { reason?: string }) => { calls.push([p.toString(), l?.toString(), o?.reason]); } } : undefined
			} as unknown as ServicesAccessor;

			await CommandsRegistry.getCommand(SWITCH_FOLDER_LOCATION_COMMAND_ID)!.handler(accessor);
			return { shown, calls };
		}

		test('lists the primary and the locations, marking the current one', async () => {
			const { shown, calls } = await pickLocation(() => undefined);
			assert.deepStrictEqual({ shown: shown.map(item => ({ ...item, uri: (item as unknown as { uri: URI }).uri.toString() })), calls }, {
				shown: [
					{ uri: primary.toString(), label: '$(folder) project', description: 'Primary Location', picked: false },
					{ uri: alternate.toString(), label: '$(git-branch) Alternate', description: 'feature/x', picked: true },
					{ uri: URI.file('/work/other').toString(), label: '$(location) Other', description: undefined, picked: false }
				],
				calls: []
			});
		});

		test('picking a location switches to it as a user choice, the primary returns, the current one does nothing', async () => {
			assert.deepStrictEqual((await pickLocation(() => 2)).calls, [[primary.toString(), URI.file('/work/other').toString(), 'user']]);
			assert.deepStrictEqual((await pickLocation(() => 0)).calls, [[primary.toString(), undefined, 'user']]);
			assert.deepStrictEqual((await pickLocation(() => 1)).calls, []);
		});

		test('a switch while the picker is open does not drop the user choice', async () => {
			const other = URI.file('/work/other');
			// current location (alternate) is picked after another switch moved the folder to `other`
			assert.deepStrictEqual((await pickLocation(() => 1, other)).calls, [[primary.toString(), alternate.toString(), 'user']]);
			// picking the location the folder moved to is a no-op
			assert.deepStrictEqual((await pickLocation(() => 2, other)).calls, []);
			// a picker opened for a primary that has since changed is stale
			assert.deepStrictEqual((await pickLocation(() => 1, other, URI.file('/work/changed'))).calls, []);
		});
	});
});
