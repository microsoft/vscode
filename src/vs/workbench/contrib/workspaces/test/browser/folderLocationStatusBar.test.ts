/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { AnchorPosition } from '../../../../../base/common/layout.js';
import { mainWindow } from '../../../../../base/browser/window.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { errorHandler } from '../../../../../base/common/errors.js';
import { Emitter } from '../../../../../base/common/event.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IActionWidgetService } from '../../../../../platform/actionWidget/browser/actionWidget.js';
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
import { ILabelService } from '../../../../../platform/label/common/label.js';
import { IWorkspaceEditingService } from '../../../../services/workspaces/common/workspaceEditing.js';
import { FolderLocationStatusBarContribution, RETURN_TO_PRIMARY_FOLDER_LOCATION_COMMAND_ID, SWITCH_FOLDER_LOCATION_COMMAND_ID } from '../../browser/folderLocationStatusBar.js';

function identityFake(getWorkspace: () => Workspace) {
	return {
		isAtAlternateLocation: () => { const workspace = getWorkspace(); return workspace.uri!.toString() !== workspace.folders[0].uri.toString(); },
	};
}

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
		let workspace = new Workspace('id', [new WorkspaceFolder({ uri: primary, name: 'project', index: 0 })], false, null, () => false, undefined, primary);

		const contribution = ds.add(new FolderLocationStatusBarContribution(
			{ ...identityFake(() => workspace), getLocation: () => identityFake(() => workspace).isAtAlternateLocation() ? currentLocation : undefined, onDidChangeLocation: onDidChangeCurrentLocation.event } as unknown as IWorkspaceFolderLocationService,
			{ getWorkspace: () => workspace, onDidChangeWorkspaceFolders: onDidChangeWorkspaceFolders.event } as unknown as IWorkspaceContextService,
			{ getFolderLocationLabel: () => currentLocation ? `${currentLocation.label} · ${currentLocation.description}` : undefined } as unknown as ILabelService,
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
				workspace = new Workspace('id', [new WorkspaceFolder({ uri: alternate, name: 'project', index: 0 })], false, null, () => false, undefined, primary);
				onDidChangeCurrentLocation.fire();
			},
			returnToPrimary() {
				currentLocation = undefined;
				workspace = new Workspace('id', [new WorkspaceFolder({ uri: primary, name: 'project', index: 0 })], false, null, () => false, undefined, primary);
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
			{ visible: true, text: '$(git-branch) Alternate', ariaLabel: 'Folder Location, Alternate · feature/x', command: { id: SWITCH_FOLDER_LOCATION_COMMAND_ID, title: 'Folder Location', arguments: ['status.workspace.folderLocation'] }, kind: 'prominent', tooltip: `Alternate · feature/x (alternate location of 'project')` });

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
			{ whileHidden, signal: signal(), target: resolveOnboardingTarget(mainWindow, step.targetId)?.element === element, primaryAction: step.primaryAction?.label, endTour: step.endTourLabel, focusEndTour: step.focusEndTour },
			{ whileHidden: false, signal: true, target: true, primaryAction: 'Return to project', endTour: 'Got It', focusEndTour: true });

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
		const calls: [URI, string | undefined][] = [];
		const workspace = new Workspace('id', [new WorkspaceFolder({ uri: alternate, name: 'project', index: 0 })], false, null, () => false, undefined, primary);
		const accessor = {
			get: (id: unknown) => id === IWorkspaceContextService ? { getWorkspace: () => workspace } : id === IWorkspaceEditingService ? { setFolderLocation: async (l: URI, o?: { reason?: string }) => { calls.push([l, o?.reason]); } } : id === IWorkspaceFolderLocationService ? identityFake(() => workspace) : id === IUriIdentityService ? { extUri } : undefined
		} as unknown as ServicesAccessor;

		await CommandsRegistry.getCommand(RETURN_TO_PRIMARY_FOLDER_LOCATION_COMMAND_ID)!.handler(accessor);

		assert.deepStrictEqual(calls, [[primary, 'user']]);
	});

	suite('switch command', () => {

		async function pickLocation(choose: (items: { label: string; description?: string; iconClass?: string }[]) => number | undefined, switchedWhileOpen?: URI, primaryChangedTo?: URI, atPrimary?: boolean, lookup?: Promise<void>) {
			const calls: [string, string | undefined][] = [];
			let shown: { label: string; description?: string; iconClass?: string }[] = [];
			let activeItem: IQuickPickItem | undefined;
			let shownAtAccept: string[] = [];
			let firstShown: { items: readonly { label: string }[]; busy: boolean } | undefined;
			let workspace = new Workspace('id', [new WorkspaceFolder({ uri: atPrimary ? primary : alternate, name: 'project', index: 0 })], false, null, () => false, undefined, primary);
			const accessor = {
				get: (id: unknown) => id === IWorkspaceContextService ? { getWorkspace: () => workspace }
					: id === IWorkspaceFolderLocationService ? { ...identityFake(() => workspace), getLocation: () => atPrimary ? undefined : { uri: alternate, label: 'Alternate', description: 'feature/x', icon: Codicon.gitBranch }, getLocations: async () => { await lookup; return [{ uri: alternate, label: 'Alternate', description: 'feature/x', icon: Codicon.gitBranch }, { uri: URI.file('/work/other'), label: 'Other' }]; } }
						: id === IUriIdentityService ? { extUri }
							: id === IQuickInputService ? {
								createQuickPick: () => {
									const accept = new Emitter<void>();
									const hide = new Emitter<void>();
									const pick = {
										items: [] as (IQuickPickItem & { uri: URI })[], activeItems: [] as IQuickPickItem[], selectedItems: [] as IQuickPickItem[], busy: false, placeholder: '', matchOnDescription: false,
										onDidAccept: accept.event, onDidHide: hide.event, dispose: () => { },
										show: () => {
											firstShown = { items: pick.items, busy: pick.busy };
											const settle = async () => {
												await Promise.resolve();
												await new Promise(r => setTimeout(r, 0));
												shownAtAccept = pick.items.map(item => item.label); shown = pick.items; activeItem = pick.activeItems[0];
												const index = choose(pick.items);
												if (switchedWhileOpen) { workspace = new Workspace('id', [new WorkspaceFolder({ uri: switchedWhileOpen, name: 'project', index: 0 })], false, null, () => false, undefined, primaryChangedTo ?? primary); }
												if (index === undefined) { hide.fire(); } else { pick.selectedItems = [pick.items[index]]; accept.fire(); }
											};
											void settle();
										}
									};
									return pick;
								}
							}
								: id === IWorkspaceEditingService ? { setFolderLocation: async (l: URI, o?: { reason?: string }) => { calls.push([l.toString(), o?.reason]); } } : undefined
			} as unknown as ServicesAccessor;

			await CommandsRegistry.getCommand(SWITCH_FOLDER_LOCATION_COMMAND_ID)!.handler(accessor);
			return { shown, calls, activeItem, firstShown, shownAtAccept };
		}

		test('shows the picker at once in a busy state, then lists the primary and the locations with icons next to their labels, marking the current one', async () => {
			const { shown, calls, activeItem, firstShown } = await pickLocation(() => undefined);
			assert.deepStrictEqual({ labels: firstShown!.items.map(item => item.label), busy: firstShown!.busy }, { labels: ['project', 'Alternate'], busy: true });
			assert.deepStrictEqual({ shown: shown.map(item => ({ ...item, uri: (item as unknown as { uri: URI }).uri.toString() })), active: (activeItem as unknown as { uri: URI }).uri.toString(), calls }, {
				shown: [
					{ uri: primary.toString(), label: 'project', iconClass: 'codicon codicon-folder', description: 'Primary Location' },
					{ uri: alternate.toString(), label: 'Alternate', iconClass: 'codicon codicon-git-branch', description: 'feature/x (Current)' },
					{ uri: URI.file('/work/other').toString(), label: 'Other', iconClass: 'codicon codicon-git-branch-checkout', description: undefined }
				],
				active: alternate.toString(),
				calls: []
			});
		});

		test('accepting before the locations resolve keeps the current location', async () => {
			let release!: () => void;
			const lookup = new Promise<void>(resolve => release = resolve);
			const early = await pickLocation(items => items.findIndex(item => item.description?.endsWith('(Current)')), undefined, undefined, false, lookup);
			release();
			assert.deepStrictEqual({ shownAtAccept: early.shownAtAccept, active: (early.activeItem as unknown as { label: string }).label, calls: early.calls }, { shownAtAccept: ['project', 'Alternate'], active: 'Alternate', calls: [[alternate.toString(), 'user']] });
		});

		test('hiding before the locations resolve does nothing, a rejected lookup is reported', async () => {
			let release!: () => void;
			assert.deepStrictEqual((await pickLocation(() => undefined, undefined, undefined, false, new Promise<void>(resolve => release = resolve))).calls, []);
			release();

			const errors: unknown[] = [];
			const previous = errorHandler.getUnexpectedErrorHandler();
			errorHandler.setUnexpectedErrorHandler(error => errors.push(error));
			try {
				const failure = new Error('lookup failed');
				const rejected = await pickLocation(() => 0, undefined, undefined, false, Promise.reject(failure));
				await new Promise(resolve => setTimeout(resolve, 0));
				assert.deepStrictEqual({ calls: rejected.calls, errors }, { calls: [[primary.toString(), 'user']], errors: [failure] });
			} finally {
				errorHandler.setUnexpectedErrorHandler(previous);
			}
		});

		test('invoked from the status entry the list is anchored there, starts on the current location and selecting it works', async () => {
			const anchor = mainWindow.document.body.appendChild(mainWindow.document.createElement('div'));
			anchor.id = 'status.workspace.folderLocation';
			const label = anchor.appendChild(mainWindow.document.createElement('a'));
			label.className = 'statusbar-item-label';
			label.tabIndex = -1;
			try {
				type Entry = { id: string; label: string; description?: string; checked: boolean };
				type ListItem = { item: Entry; labelIcon: { id: string }; group: { icon: { id: string } } };
				const calls: string[] = [];
				const workspace = new Workspace('id', [new WorkspaceFolder({ uri: alternate, name: 'project', index: 0 })], false, null, () => false, undefined, primary);
				let shownAnchor: unknown;
				let shownOptions: unknown;
				let shownItems: ListItem[] = [];
				let initiallyFocused: string | undefined;
				let aria: ((item: ListItem) => string) | undefined;
				let delegate!: { onSelect(item: Entry): void; onHide(): void };
				let release!: () => void;
				const lookup = new Promise<void>(resolve => release = resolve);
				const widget = {
					show: (_user: string, _preview: boolean, items: ListItem[], shownDelegate: typeof delegate, anchorElement: unknown, _container: unknown, _actions: unknown, accessibility: { getAriaLabel(item: ListItem): string }, options: unknown) => {
						shownOptions = options; shownAnchor = anchorElement; shownItems = items; delegate = shownDelegate; aria = accessibility.getAriaLabel;
						initiallyFocused = items.find(item => item.item.checked)?.item.id;
						// like the real widget, selecting an item is followed by a hide that reports it synchronously
						queueMicrotask(() => delegate.onSelect(items.find(item => item.item.id === initiallyFocused)!.item));
					},
					focusItemById: () => { },
					updateItems: () => { },
					hide: () => delegate.onHide()
				};
				const accessor = {
					get: (id: unknown) => id === IWorkspaceContextService ? { getWorkspace: () => workspace }
						: id === IWorkspaceFolderLocationService ? { ...identityFake(() => workspace), getLocation: () => ({ uri: alternate, label: 'Alternate', description: 'feature/x', icon: Codicon.gitBranchCheckout }), getLocations: async () => { await lookup; return []; } }
							: id === IUriIdentityService ? { extUri }
								: id === IActionWidgetService ? widget
									: id === IWorkspaceEditingService ? { setFolderLocation: async (l: URI) => { calls.push(l.toString()); } } : undefined
				} as unknown as ServicesAccessor;
				await CommandsRegistry.getCommand(SWITCH_FOLDER_LOCATION_COMMAND_ID)!.handler(accessor, 'status.workspace.folderLocation');
				release();
				assert.deepStrictEqual({
					anchored: shownAnchor === anchor,
					options: shownOptions,
					items: shownItems.map(item => ({ id: item.item.id, aria: aria!(item), icon: item.labelIcon.id, check: item.group.icon.id })),
					initiallyFocused,
					calls,
					focusReturnedToLabel: mainWindow.document.activeElement === label
				}, {
					anchored: true,
					options: { preferredAnchorPosition: AnchorPosition.ABOVE, inlineDescription: true },
					items: [
						{ id: extUri.getComparisonKey(primary), aria: 'project, Primary Location', icon: 'folder', check: 'blank' },
						{ id: extUri.getComparisonKey(alternate), aria: 'Alternate, feature/x, Current', icon: 'git-branch-checkout', check: 'check' }
					],
					initiallyFocused: extUri.getComparisonKey(alternate),
					calls: [alternate.toString()],
					focusReturnedToLabel: true
				});
			} finally {
				anchor.remove();
			}
		});

		test('picking a location switches to it as a user choice, the primary returns, the current one is submitted', async () => {
			assert.deepStrictEqual((await pickLocation(() => 2)).calls, [[URI.file('/work/other').toString(), 'user']]);
			assert.deepStrictEqual((await pickLocation(() => 0)).calls, [[primary.toString(), 'user']]);
			// the current location is submitted too, so that it supersedes a different switch that is still pending
			assert.deepStrictEqual((await pickLocation(() => 1)).calls, [[alternate.toString(), 'user']]);
		});

		test('at the primary location the picker lists the locations, marks the primary and switches as a user choice', async () => {
			const atPrimaryPick = await pickLocation(items => { assert.deepStrictEqual(items.map(item => item.description), ['Primary Location (Current)', 'feature/x', undefined]); return 1; }, undefined, undefined, true);
			assert.deepStrictEqual(atPrimaryPick.calls, [[alternate.toString(), 'user']]);
		});

		test('a switch while the picker is open does not drop the user choice', async () => {
			const other = URI.file('/work/other');
			// current location (alternate) is picked after another switch moved the folder to `other`
			assert.deepStrictEqual((await pickLocation(() => 1, other)).calls, [[alternate.toString(), 'user']]);
			// picking the location the folder moved to is submitted as well
			assert.deepStrictEqual((await pickLocation(() => 2, other)).calls, [[other.toString(), 'user']]);
			// a picker opened for a primary that has since changed is stale
			assert.deepStrictEqual((await pickLocation(() => 1, other, URI.file('/work/changed'))).calls, []);
		});
	});
});
