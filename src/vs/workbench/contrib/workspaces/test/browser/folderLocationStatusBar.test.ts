/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { AnchorPosition } from '../../../../../base/common/layout.js';
import { mainWindow } from '../../../../../base/browser/window.js';
import { runWhenWindowIdle } from '../../../../../base/browser/dom.js';
import { timeout } from '../../../../../base/common/async.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { errorHandler } from '../../../../../base/common/errors.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IActionWidgetService } from '../../../../../platform/actionWidget/browser/actionWidget.js';
import { CommandsRegistry } from '../../../../../platform/commands/common/commands.js';
import { IQuickInputService, IQuickPickItem } from '../../../../../platform/quickinput/common/quickInput.js';
import { IUriIdentityService } from '../../../../../platform/uriIdentity/common/uriIdentity.js';
import { extUri, extUriIgnorePathCase, IExtUri } from '../../../../../base/common/resources.js';
import { ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { IFolderLocation, IResolvedFolderLocation, IWorkspaceFolderLocationProvider, IWorkspaceFolderLocationService } from '../../../../../platform/workspace/common/folderLocations.js';
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
import { toDisposable } from '../../../../../base/common/lifecycle.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { FileService } from '../../../../../platform/files/common/fileService.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { UriIdentityService } from '../../../../../platform/uriIdentity/common/uriIdentityService.js';
import { TestContextService } from '../../../../test/common/workbenchTestServices.js';
import { WorkspaceFolderLocationService } from '../../../../services/workspaces/common/workspaceFolderLocationService.js';

function identityFake(getWorkspace: () => Workspace) {
	return {
		isAtAlternateLocation: () => { const workspace = getWorkspace(); return workspace.uri!.toString() !== workspace.folders[0].uri.toString(); },
	};
}

suite('FolderLocationStatusBarContribution', () => {

	const ds = ensureNoDisposablesAreLeakedInTestSuite();

	const primary = URI.file('/work/project');
	const defaultPrimary = primary;
	const alternate = URI.file('/work/project-alt');
	const location: IResolvedFolderLocation = { uri: alternate, label: 'Alternate', description: 'feature/x', icon: Codicon.gitBranch, providerId: 'test', builtIn: true };

	function createFixture(shown = { value: false }, options: { alternates?: IFolderLocation[]; primary?: URI; extUri?: IExtUri } = {}) {
		const primary = options.primary ?? defaultPrimary;
		const entries: IStatusbarEntry[] = [];
		const added: { alignment: unknown; priority: unknown }[] = [];
		let visible = false;
		const onDidChangeCurrentLocation = ds.add(new Emitter<void>());
		const onDidChangeWorkspaceFolders = ds.add(new Emitter<void>());
		const onDidChangeEntryVisibility = ds.add(new Emitter<{ id: string; visible: boolean }>());
		const onDidChangePartVisibility = ds.add(new Emitter<{ partId: string; visible: boolean }>());
		const statusbarContainer = mainWindow.document.body.appendChild(mainWindow.document.createElement('div'));
		ds.add({ dispose: () => statusbarContainer.remove() });

		let currentLocation: IResolvedFolderLocation | undefined;
		let workspace = new Workspace('id', [new WorkspaceFolder({ uri: primary, name: 'project', index: 0 })], false, null, () => false, undefined, primary);
		const onDidChangeLocations = ds.add(new Emitter<void>());
		const alternates: IFolderLocation[] = [...options.alternates ?? []];

		const contribution = ds.add(new FolderLocationStatusBarContribution(
			{
				...identityFake(() => workspace), getLocation: () => identityFake(() => workspace).isAtAlternateLocation() ? currentLocation : undefined, onDidChangeLocation: onDidChangeCurrentLocation.event,
				canSetLocation: () => true, getLocations: async () => [...alternates], onDidChangeLocations: onDidChangeLocations.event, onDidChangeProviders: Event.None, onDidChangeCanSetLocation: Event.None
			} as unknown as IWorkspaceFolderLocationService,
			{ getWorkspace: () => workspace, onDidChangeWorkspaceFolders: onDidChangeWorkspaceFolders.event } as unknown as IWorkspaceContextService,
			{ getFolderLocationLabel: () => currentLocation?.label } as unknown as ILabelService,
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
			{ hasBeenShown: () => shown.value } as unknown as IOnboardingScenarioService,
			{ extUri: options.extUri ?? extUri } as unknown as IUriIdentityService
		));

		return {
			contribution, entries, added, statusbarContainer,
			entryVisibilityChanged: () => onDidChangeEntryVisibility.fire({ id: 'status.workspace.folderLocation', visible: true }),
			partVisibilityChanged: () => onDidChangePartVisibility.fire({ partId: Parts.STATUSBAR_PART, visible: true }),
			isVisible: () => visible,
			setAlternates(value: IFolderLocation[]) {
				alternates.splice(0, alternates.length, ...value);
				onDidChangeLocations.fire();
			},
			switchTo() {
				currentLocation = location;
				workspace = new Workspace('id', [new WorkspaceFolder({ uri: alternate, name: 'project', index: 0 })], false, null, () => false, undefined, primary);
				onDidChangeCurrentLocation.fire();
			},
			/** Back at the folder's own location, which the workspace may name with other casing, such as on Windows. */
			returnToPrimary(identity = primary) {
				currentLocation = undefined;
				workspace = new Workspace('id', [new WorkspaceFolder({ uri: identity, name: 'project', index: 0 })], false, null, () => false, undefined, identity);
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
			{ visible: true, text: '$(git-branch) Alternate', ariaLabel: 'Folder Location, Alternate', command: { id: SWITCH_FOLDER_LOCATION_COMMAND_ID, title: 'Folder Location', arguments: ['status.workspace.folderLocation'] }, kind: 'prominent', tooltip: `Alternate (alternate location of 'project')` });

		fixture.returnToPrimary();
		assert.strictEqual(fixture.isVisible(), false);
	});

	test('at its own location, the folder shows while it has worktrees, looked up once the window is idle and again as they change; it does not introduce itself there', async () => {
		const fixture = createFixture(undefined, { alternates: [location] });
		const trigger = onboardingScenarioRegistry.getScenario('workbench.folderLocation.introduction')!.trigger;
		const introduces = () => trigger.kind === 'observable' && trigger.signal.get();
		const element = mainWindow.document.body.appendChild(mainWindow.document.createElement('div'));
		element.id = 'status.workspace.folderLocation';
		element.style.cssText = 'width: 10px; height: 10px; display: block';
		ds.add({ dispose: () => element.remove() });
		const settle = async () => {
			await new Promise<void>(resolve => runWhenWindowIdle(mainWindow, () => resolve()));
			await timeout(0);
		};
		const state = () => fixture.isVisible() ? { text: fixture.entries.at(-1)!.text, kind: fixture.entries.at(-1)!.kind, ariaLabel: fixture.entries.at(-1)!.ariaLabel, tooltip: fixture.entries.at(-1)!.tooltip } : 'none';

		const steps: unknown[] = [state()];
		await settle();
		await new Promise<void>(resolve => mainWindow.requestAnimationFrame(() => resolve()));
		steps.push(state(), { introduces: introduces() });
		fixture.setAlternates([]);
		await timeout(0);
		steps.push(state());
		fixture.setAlternates([location]);
		await timeout(0);
		steps.push(state());
		fixture.switchTo();
		steps.push(state());

		const atPrimary = { text: '$(folder) project', kind: undefined, ariaLabel: 'Folder Location, project', tooltip: 'project (Switch Folder Location)' };
		assert.deepStrictEqual(steps, [
			'none',
			atPrimary,
			{ introduces: false },
			'none',
			atPrimary,
			{ text: '$(git-branch) Alternate', kind: 'prominent', ariaLabel: 'Folder Location, Alternate', tooltip: `Alternate (alternate location of 'project')` },
		]);
	});

	test('on Windows, the folder at its own location is named by its last segment, also at a drive or UNC share root, and is still at its own location with its path in other case', async () => {
		const settle = async () => {
			await new Promise<void>(resolve => runWhenWindowIdle(mainWindow, () => resolve()));
			await timeout(0);
		};
		const windowsFixture = (folder: URI) => createFixture(undefined, { alternates: [location], primary: folder, extUri: extUriIgnorePathCase });
		// One at a time: each registers the entry's onboarding target
		const shownText = async (folder: URI, recasedIdentity?: URI) => {
			const fixture = windowsFixture(folder);
			await settle();
			if (recasedIdentity) {
				fixture.switchTo();
				fixture.returnToPrimary(recasedIdentity);
			}
			const text = fixture.isVisible() ? fixture.entries.at(-1)!.text : 'none';
			fixture.contribution.dispose();
			return text;
		};
		const drive = URI.from({ scheme: 'file', path: '/c:/Users/me/Repo' });

		assert.deepStrictEqual({
			drive: await shownText(drive),
			driveRoot: await shownText(URI.from({ scheme: 'file', path: '/c:/' })),
			uncShareRoot: await shownText(URI.from({ scheme: 'file', authority: 'server', path: '/share/' })),
			recased: await shownText(drive, URI.from({ scheme: 'file', path: '/C:/users/ME/repo' })),
		}, { drive: '$(folder) Repo', driveRoot: '$(folder) c:', uncShareRoot: '$(folder) share', recased: '$(folder) repo' });
	});

	test('the introduction is a spotlight on the entry with only Got It', async () => {
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
			{ whileHidden, signal: signal(), target: resolveOnboardingTarget(mainWindow, step.targetId)?.element === element, primaryAction: step.primaryAction, endTour: step.endTourLabel, focusEndTour: step.focusEndTour, hideNext: step.hideNext },
			{ whileHidden: false, signal: true, target: true, primaryAction: undefined, endTour: 'Got It', focusEndTour: true, hideNext: true });

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
					: id === IWorkspaceFolderLocationService ? { ...identityFake(() => workspace), getLocation: () => atPrimary ? undefined : { uri: alternate, label: 'Alternate', description: 'feature/x', icon: Codicon.gitBranch, group: 'Worktrees', providerId: 'worktrees' }, getLocationGroups: async () => { await lookup; return [{ providerId: 'worktrees', label: 'Worktrees', locations: [{ uri: alternate, label: 'Alternate', description: 'feature/x', icon: Codicon.gitBranch }, { uri: URI.file('/work/other'), label: 'Other', icon: Codicon.folder }] }]; } }
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
					{ uri: primary.toString(), label: 'project', iconClass: 'codicon codicon-folder', description: undefined },
					{ uri: alternate.toString(), label: 'Alternate', iconClass: 'codicon codicon-git-branch', description: 'feature/x (Current)' },
					{ uri: URI.file('/work/other').toString(), label: 'Other', iconClass: 'codicon codicon-folder', description: undefined }
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

		test('invoked from the status entry the list is anchored there with a row of the worktrees above the folder, opens with no submenu open, marks only the current worktree in the submenu, which says it is the current one, and selecting it works', async () => {
			const anchor = mainWindow.document.body.appendChild(mainWindow.document.createElement('div'));
			anchor.id = 'status.workspace.folderLocation';
			const label = anchor.appendChild(mainWindow.document.createElement('a'));
			label.className = 'statusbar-item-label';
			label.tabIndex = -1;
			try {
				type Entry = { id: string; label: string; description?: string; checked: boolean };
				type ListItem = { item: Entry; labelIcon: { id: string }; group: { icon: { id: string } }; submenuActions?: { label: string; tooltip: string; checked?: boolean }[]; openSubmenuOnClick?: boolean };
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
						// Like the real widget: the checked row, else the first
						initiallyFocused = (items.find(item => item.item.checked) ?? items[0])?.item.id;
						// like the real widget, selecting an item is followed by a hide that reports it synchronously
						queueMicrotask(() => delegate.onSelect(items.find(item => item.item.id === initiallyFocused)!.item));
					},
					// Focusing a row with a submenu opens it
					focusItemById: (id: string) => { focusedById.push(id); },
					updateItems: () => { },
					hide: () => delegate.onHide()
				};
				const focusedById: string[] = [];
				const accessor = {
					get: (id: unknown) => id === IWorkspaceContextService ? { getWorkspace: () => workspace }
						: id === IWorkspaceFolderLocationService ? { ...identityFake(() => workspace), getLocation: () => ({ uri: alternate, label: 'Alternate', description: 'feature/x', icon: Codicon.gitBranchCheckout, group: 'Worktrees', providerId: 'worktrees' }), getLocationGroups: async () => { await lookup; return []; } }
							: id === IUriIdentityService ? { extUri }
								: id === IActionWidgetService ? widget
									: id === IWorkspaceEditingService ? { setFolderLocation: async (l: URI) => { calls.push(l.toString()); } } : undefined
				} as unknown as ServicesAccessor;
				await CommandsRegistry.getCommand(SWITCH_FOLDER_LOCATION_COMMAND_ID)!.handler(accessor, 'status.workspace.folderLocation');
				release();
				assert.deepStrictEqual({
					anchored: shownAnchor === anchor,
					options: shownOptions,
					items: shownItems.map(item => ({ id: item.item.id, aria: aria!(item), icon: item.labelIcon.id, check: item.group.icon.id, submenu: item.submenuActions?.map(action => ({ label: action.label, tooltip: action.tooltip, checked: action.checked })), opensOnClick: item.openSubmenuOnClick })),
					initiallyFocused,
					focusedById,
					calls,
					focusReturnedToLabel: mainWindow.document.activeElement === label
				}, {
					anchored: true,
					options: { preferredAnchorPosition: AnchorPosition.ABOVE, inlineDescription: true },
					items: [
						{ id: 'group:worktrees', aria: 'Worktrees', icon: 'git-branch-checkout', check: 'blank', submenu: [{ label: 'Alternate', tooltip: 'feature/x (Current)', checked: true }], opensOnClick: true },
						{ id: extUri.getComparisonKey(primary), aria: 'project', icon: 'folder', check: 'blank', submenu: undefined, opensOnClick: undefined }
					],
					initiallyFocused: 'group:worktrees',
					focusedById: [],
					calls: [alternate.toString()],
					focusReturnedToLabel: true
				});
			} finally {
				anchor.remove();
			}
		});

		test('choosing a worktree in the submenu of the status entry switches to it as a user choice; at the primary, the Worktrees row comes as they resolve, and with none there is only the folder', async () => {
			const anchor = mainWindow.document.body.appendChild(mainWindow.document.createElement('div'));
			anchor.id = 'status.workspace.folderLocation';
			try {
				type Entry = { id: string };
				type ListItem = { item: Entry; submenuActions?: { label: string; run(): void }[] };
				const other = URI.file('/work/other');
				const pick = async (folder: URI, locations: { uri: URI; label: string }[], choose: (items: ListItem[]) => Entry) => {
					const calls: string[] = [];
					const workspace = new Workspace('id', [new WorkspaceFolder({ uri: folder, name: 'project', index: 0 })], false, null, () => false, undefined, primary);
					let shownItems: ListItem[] = [];
					let seededRows = 0;
					const focused: string[] = [];
					let updateOptions: unknown;
					let delegate!: { onSelect(item: Entry): void; onHide(): void };
					const widget = {
						show: (_user: string, _preview: boolean, items: ListItem[], shownDelegate: typeof delegate) => { shownItems = items; seededRows = items.length; delegate = shownDelegate; },
						focusItemById: (id: string) => { focused.push(id === extUri.getComparisonKey(primary) ? 'folder' : id); },
						// Once the locations resolve, the user chooses
						updateItems: (items: ListItem[], _focusItemId: string | undefined, options: unknown) => { shownItems = items; updateOptions = options; queueMicrotask(() => delegate.onSelect(choose(shownItems))); },
						hide: () => delegate.onHide()
					};
					const accessor = {
						get: (id: unknown) => id === IWorkspaceContextService ? { getWorkspace: () => workspace }
							: id === IWorkspaceFolderLocationService ? { ...identityFake(() => workspace), getLocation: () => extUri.isEqual(folder, primary) ? undefined : ({ uri: alternate, label: 'Alternate', icon: Codicon.folder, group: 'Worktrees', providerId: 'worktrees' }), getLocationGroups: async () => locations.length ? [{ providerId: 'worktrees', label: 'Worktrees', locations }] : [] }
								: id === IUriIdentityService ? { extUri }
									: id === IActionWidgetService ? widget
										: id === IWorkspaceEditingService ? { setFolderLocation: async (l: URI) => { calls.push(l.toString()); } } : undefined
					} as unknown as ServicesAccessor;
					await CommandsRegistry.getCommand(SWITCH_FOLDER_LOCATION_COMMAND_ID)!.handler(accessor, 'status.workspace.folderLocation');
					return { calls, seededRows, rows: shownItems.length, focused, updateOptions };
				};
				const worktrees = [{ uri: alternate, label: 'Alternate', icon: Codicon.folder }, { uri: other, label: 'Other', icon: Codicon.folder }];
				const chooseWorktree = (label: string) => (items: ListItem[]) => {
					// As the submenu runs its action, then selects its row
					const row = items.find(item => item.submenuActions)!;
					row.submenuActions!.find(action => action.label === label)!.run();
					return row.item;
				};

				const chooseOther = await pick(alternate, worktrees, chooseWorktree('Other'));
				const atPrimaryWithWorktrees = await pick(primary, worktrees, chooseWorktree('Alternate'));
				const atPrimaryWithNone = await pick(primary, [], items => items[0].item);

				assert.deepStrictEqual({ chooseOther, atPrimaryWithWorktrees, atPrimaryWithNone }, {
					chooseOther: { calls: [other.toString()], seededRows: 2, rows: 2, focused: [], updateOptions: { preserveHover: true } },
					atPrimaryWithWorktrees: { calls: [alternate.toString()], seededRows: 1, rows: 2, focused: [], updateOptions: { preserveHover: true } },
					atPrimaryWithNone: { calls: [primary.toString()], seededRows: 1, rows: 1, focused: [], updateOptions: { preserveHover: true } },
				});
			} finally {
				anchor.remove();
			}
		});

		test('the locations of a provider with a label are a row with a submenu, those of a provider without one rows of their own, above the folder, which alone is checked at its own location', async () => {
			const anchor = mainWindow.document.body.appendChild(mainWindow.document.createElement('div'));
			anchor.id = 'status.workspace.folderLocation';
			try {
				type ListItem = { item: { id: string; checked: boolean }; label: string; group: { icon: { id: string } }; submenuActions?: { label: string }[] };
				const workspace = new Workspace('id', [new WorkspaceFolder({ uri: primary, name: 'project', index: 0 })], false, null, () => false, undefined, primary);
				let rows: ListItem[] = [];
				let delegate!: { onSelect(item: unknown): void; onHide(): void };
				const widget = {
					show: (_user: string, _preview: boolean, _items: ListItem[], shownDelegate: typeof delegate) => { delegate = shownDelegate; },
					focusItemById: () => { },
					updateItems: (items: ListItem[]) => { rows = items; queueMicrotask(() => delegate.onHide()); },
					hide: () => delegate.onHide()
				};
				const accessor = {
					get: (id: unknown) => id === IWorkspaceContextService ? { getWorkspace: () => workspace }
						: id === IWorkspaceFolderLocationService ? { ...identityFake(() => workspace), getLocation: () => undefined, getLocationGroups: async () => [{ providerId: 'worktrees', label: 'Worktrees', locations: [{ uri: alternate, label: 'Alternate', icon: Codicon.folder }] }, { providerId: 'cloud', label: undefined, locations: [{ uri: URI.file('/work/cloud'), label: 'Cloud', icon: Codicon.cloud }] }] }
							: id === IUriIdentityService ? { extUri }
								: id === IActionWidgetService ? widget
									: id === IWorkspaceEditingService ? { setFolderLocation: async () => { } } : undefined
				} as unknown as ServicesAccessor;
				await CommandsRegistry.getCommand(SWITCH_FOLDER_LOCATION_COMMAND_ID)!.handler(accessor, 'status.workspace.folderLocation');

				assert.deepStrictEqual(rows.map(row => ({ label: row.label, check: row.group.icon.id, submenu: row.submenuActions?.map(action => action.label) })), [
					{ label: 'Worktrees', check: 'blank', submenu: ['Alternate'] },
					{ label: 'Cloud', check: 'blank', submenu: undefined },
					{ label: 'project', check: 'check', submenu: undefined },
				]);
			} finally {
				anchor.remove();
			}
		});

		test('names the row of each provider\'s locations as the provider names them, with no name of its own for any kind of location', async () => {
			const anchor = mainWindow.document.body.appendChild(mainWindow.document.createElement('div'));
			anchor.id = 'status.workspace.folderLocation';
			try {
				type ListItem = { label: string; submenuActions?: { label: string }[] };
				const workspace = new Workspace('id', [new WorkspaceFolder({ uri: primary, name: 'project', index: 0 })], false, null, () => false, undefined, primary);
				const contextService = new TestContextService(workspace);
				const labelService = new class extends mock<ILabelService>() {
					override registerWorkspaceLabelDecorator() { return toDisposable(() => { }); }
				}();
				const uriIdentityService = ds.add(new UriIdentityService(ds.add(new FileService(new NullLogService()))));
				const folderLocationService = ds.add(new WorkspaceFolderLocationService(uriIdentityService, contextService, labelService));
				const provider = (id: string, label: string, locations: IFolderLocation[]): IWorkspaceFolderLocationProvider => ({
					id,
					label,
					provideLocations: async () => locations,
					resolveLocation: async (_primary, uri) => locations.find(candidate => extUri.isEqual(candidate.uri, uri)),
				});
				ds.add(folderLocationService.registerProvider(provider('worktrees', 'Worktrees', [{ uri: alternate, label: 'Alternate', icon: Codicon.folder }])));
				ds.add(folderLocationService.registerProvider(provider('copies', 'Cloud Copies', [{ uri: URI.file('/work/copy'), label: 'Copy', icon: Codicon.folder }])));
				let rows: ListItem[] = [];
				let delegate!: { onSelect(item: unknown): void; onHide(): void };
				const widget = {
					show: (_user: string, _preview: boolean, _items: ListItem[], shownDelegate: typeof delegate) => { delegate = shownDelegate; },
					focusItemById: () => { },
					updateItems: (items: ListItem[]) => { rows = items; queueMicrotask(() => delegate.onHide()); },
					hide: () => delegate.onHide()
				};
				const accessor = {
					get: (id: unknown) => id === IWorkspaceContextService ? contextService
						: id === IWorkspaceFolderLocationService ? folderLocationService
							: id === IUriIdentityService ? uriIdentityService
								: id === IActionWidgetService ? widget
									: id === IWorkspaceEditingService ? { setFolderLocation: async () => { } } : undefined
				} as unknown as ServicesAccessor;
				await CommandsRegistry.getCommand(SWITCH_FOLDER_LOCATION_COMMAND_ID)!.handler(accessor, 'status.workspace.folderLocation');

				assert.deepStrictEqual(rows.map(row => ({ label: row.label, submenu: row.submenuActions?.map(action => action.label) })), [
					{ label: 'Worktrees', submenu: ['Alternate'] },
					{ label: 'Cloud Copies', submenu: ['Copy'] },
					{ label: 'project', submenu: undefined },
				]);
			} finally {
				anchor.remove();
			}
		});

		test('the row of each provider is its own, also where providers share a label: a submenu open on the current location\'s provider stays on it as the locations resolve, and choosing there switches within it', async () => {
			const anchor = mainWindow.document.body.appendChild(mainWindow.document.createElement('div'));
			anchor.id = 'status.workspace.folderLocation';
			try {
				type Entry = { id: string };
				type ListItem = { item: Entry; submenuActions?: { label: string; run(): void }[] };
				const [first, second] = [URI.file('/work/first'), URI.file('/work/second')];
				const workspace = new Workspace('id', [new WorkspaceFolder({ uri: alternate, name: 'project', index: 0 })], false, null, () => false, undefined, primary);
				const calls: string[] = [];
				let openRow: string | undefined;
				let refreshed: { rows: string[]; openSubmenu: string[] | undefined } | undefined;
				let delegate!: { onSelect(item: Entry): void; onHide(): void };
				const widget = {
					// The user opens the submenu of the seeded row, of the current location's provider, before the locations resolve
					show: (_user: string, _preview: boolean, items: ListItem[], shownDelegate: typeof delegate) => { delegate = shownDelegate; openRow = items.find(item => item.submenuActions)?.item.id; },
					// As the real widget, an update keeps the open submenu on the first row with its id, which now shows that row's actions
					updateItems: (items: ListItem[]) => {
						const reopened = items.find(item => item.item.id === openRow);
						refreshed = { rows: items.map(item => item.item.id), openSubmenu: reopened?.submenuActions?.map(action => action.label) };
						queueMicrotask(() => {
							reopened?.submenuActions?.find(action => action.label === 'Second')?.run();
							delegate.onSelect(reopened!.item);
						});
					},
					hide: () => delegate.onHide()
				};
				const accessor = {
					get: (id: unknown) => id === IWorkspaceContextService ? { getWorkspace: () => workspace }
						: id === IWorkspaceFolderLocationService ? {
							...identityFake(() => workspace),
							getLocation: () => ({ uri: alternate, label: 'Alternate', icon: Codicon.folder, group: 'Worktrees', providerId: 'two' }),
							getLocationGroups: async () => [{ providerId: 'one', label: 'Worktrees', locations: [{ uri: first, label: 'First', icon: Codicon.folder }] }, { providerId: 'two', label: 'Worktrees', locations: [{ uri: alternate, label: 'Alternate', icon: Codicon.folder }, { uri: second, label: 'Second', icon: Codicon.folder }] }]
						}
							: id === IUriIdentityService ? { extUri }
								: id === IActionWidgetService ? widget
									: id === IWorkspaceEditingService ? { setFolderLocation: async (l: URI) => { calls.push(l.toString()); } } : undefined
				} as unknown as ServicesAccessor;
				await CommandsRegistry.getCommand(SWITCH_FOLDER_LOCATION_COMMAND_ID)!.handler(accessor, 'status.workspace.folderLocation');

				assert.deepStrictEqual({ openRow, refreshed, calls }, {
					openRow: 'group:two',
					refreshed: { rows: ['group:one', 'group:two', extUri.getComparisonKey(primary)], openSubmenu: ['Alternate', 'Second'] },
					calls: [second.toString()],
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
			const atPrimaryPick = await pickLocation(items => { assert.deepStrictEqual(items.map(item => item.description), ['Current', 'feature/x', undefined]); return 1; }, undefined, undefined, true);
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
