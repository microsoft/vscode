/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise, timeout } from '../../../../../base/common/async.js';
import { Emitter } from '../../../../../base/common/event.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IStorageService, StorageScope, StorageTarget, WillSaveStateReason } from '../../../../../platform/storage/common/storage.js';
import { IUserDataProfile } from '../../../../../platform/userDataProfile/common/userDataProfile.js';
import { EditorGroupLayout, GroupOrientation, IEditorGroupsService, IEditorPart } from '../../../../services/editor/common/editorGroupsService.js';
import { IExtensionService } from '../../../../services/extensions/common/extensions.js';
import { IPartsLayoutState, IWorkbenchLayoutService, Position } from '../../../../services/layout/browser/layoutService.js';
import { DidChangeUserDataProfileEvent, IUserDataProfileService } from '../../../../services/userDataProfile/common/userDataProfile.js';
import { TestStorageService } from '../../../../test/common/workbenchTestServices.js';
import { NAMED_LAYOUTS_ENABLED_SETTING } from '../../browser/namedLayouts.js';
import { NamedLayoutsService } from '../../browser/namedLayoutsService.js';

suite('NamedLayoutsService', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();

	const LAYOUT_STORAGE_KEY_PREFIX = 'workbench.namedLayouts.layout.';

	function partsState(sideBarVisible: boolean, panelPosition: Position, viewContainerId = 'workbench.view.explorer'): IPartsLayoutState {
		return {
			sideBar: { visible: sideBarVisible, size: 300, viewContainerId },
			panel: { visible: true, size: 250, position: panelPosition, maximized: false },
			auxiliaryBar: { visible: false, size: 300, maximized: false }
		};
	}

	const singleGroup: EditorGroupLayout = { orientation: GroupOrientation.HORIZONTAL, groups: [{ size: 1 }] };
	const twoGroups: EditorGroupLayout = { orientation: GroupOrientation.HORIZONTAL, groups: [{ size: 0.5 }, { size: 0.5 }] };
	const threeGroups: EditorGroupLayout = { orientation: GroupOrientation.HORIZONTAL, groups: [{ size: 0.3333 }, { size: 0.3333 }, { size: 0.3333 }] };

	function defaultLayoutState(storageService: TestStorageService): { editorGroups?: EditorGroupLayout } | null {
		return JSON.parse(storageService.get('workbench.namedLayouts.defaultLayout', StorageScope.WORKSPACE) ?? 'null');
	}

	/**
	 * A window whose parts and editor groups show what was applied last, and whose Zen mode hides the parts until it ends.
	 * Applying editor groups restores a maximized panel, as it activates an editor group. A maximized editor group reports
	 * the size of all groups together, as the grid does. With `restore`, the window starts with that layout active, as
	 * stored, and with the arrangement that it restores itself. With `layoutProfile`, the active layout is stored as one
	 * of that profile, which the window does not start in. With `defaultLayout`, the stored state of the default layout.
	 * The layout service reports the window restored, including its editors, once `whenRestored` resolves.
	 */
	function createWindow(restore?: { layout: Record<string, unknown>; layoutProfile?: string; defaultLayout?: Record<string, unknown>; zenMode?: boolean; groupMaximized?: boolean; parts?: IPartsLayoutState; editorGroups?: EditorGroupLayout; whenRestored?: Promise<void> }) {
		const storageService = store.add(new TestStorageService());
		const configurationService = new TestConfigurationService({ [NAMED_LAYOUTS_ENABLED_SETTING]: true });
		const onDidChangeZenMode = store.add(new Emitter<boolean>());
		const onDidChangeGroupMaximized = store.add(new Emitter<boolean>());
		const window = {
			parts: restore?.parts ?? partsState(true, Position.BOTTOM),
			editorGroups: restore?.editorGroups ?? singleGroup,
			editorGroupsApplied: 0,
			/** Whether an editor refuses to move, so that a layout with fewer editor groups does not apply. */
			editorMoveVetoed: false,
			zenMode: false,
			partsBeforeZenMode: undefined as IPartsLayoutState | undefined,
			groupMaximized: false,
		};

		const instantiationService = store.add(new TestInstantiationService());
		instantiationService.stub(IStorageService, storageService);
		instantiationService.stub(IConfigurationService, configurationService);
		instantiationService.stub(IExtensionService, { whenInstalledExtensionsRegistered: () => Promise.resolve(true) });
		const onDidChangeCurrentProfile = store.add(new Emitter<DidChangeUserDataProfileEvent>());
		const userDataProfileService = { currentProfile: upcastPartial<IUserDataProfile>({ id: 'default', isDefault: true }), onDidChangeCurrentProfile: onDidChangeCurrentProfile.event };
		instantiationService.stub(IUserDataProfileService, userDataProfileService);
		const toggleZenMode = () => {
			if (window.zenMode) {
				window.parts = window.partsBeforeZenMode!;
			} else {
				window.partsBeforeZenMode = window.parts;
				window.parts = { ...window.parts, sideBar: { ...window.parts.sideBar, visible: false }, panel: { ...window.parts.panel, visible: false } };
			}
			window.zenMode = !window.zenMode;
			onDidChangeZenMode.fire(window.zenMode);
		};
		instantiationService.stub(IWorkbenchLayoutService, {
			whenRestored: restore?.whenRestored ?? Promise.resolve(),
			getPartsLayoutState: () => window.parts,
			applyPartsLayoutState: (state: IPartsLayoutState) => { window.parts = state; },
			toggleZenMode,
			isZenModeActive: () => window.zenMode,
			onDidChangeZenMode: onDidChangeZenMode.event,
		});
		const toggleMaximizeGroup = () => {
			window.groupMaximized = !window.groupMaximized;
			onDidChangeGroupMaximized.fire(window.groupMaximized);
		};
		instantiationService.stub(IEditorGroupsService, {
			mainPart: upcastPartial<IEditorPart>({
				getLayout: () => {
					if (!window.groupMaximized) {
						return window.editorGroups;
					}
					const allGroups = window.editorGroups.groups.reduce((sum, group) => sum + (group.size ?? 0), 0);
					return { ...window.editorGroups, groups: window.editorGroups.groups.map((group, index) => index === 0 ? { ...group, size: allGroups } : group) };
				},
				applyLayout: (layout: EditorGroupLayout) => {
					if (window.editorMoveVetoed && layout.groups.length < window.editorGroups.groups.length) {
						return false;
					}
					window.editorGroups = layout;
					window.editorGroupsApplied++;
					window.groupMaximized = false;
					window.parts = { ...window.parts, panel: { ...window.parts.panel, maximized: false } };
					return true;
				},
				hasMaximizedGroup: () => window.groupMaximized,
				toggleMaximizeGroup,
				onDidChangeGroupMaximized: onDidChangeGroupMaximized.event,
			})
		});

		/** The stored layouts, each with its name and the parts that are stored for it. */
		const storedLayouts = () => {
			const layouts = new Map<string, Record<string, unknown>>();
			for (const key of storageService.keys(StorageScope.PROFILE).filter(key => key.startsWith(LAYOUT_STORAGE_KEY_PREFIX)).sort()) {
				const { id, part } = /^(?<id>.+)\.(?<part>\w+)$/.exec(key.slice(LAYOUT_STORAGE_KEY_PREFIX.length))!.groups!;
				const value = storageService.get(key, StorageScope.PROFILE)!;
				layouts.set(id, { ...layouts.get(id), [part]: part === 'name' ? value : JSON.parse(value) });
			}
			return [...layouts.values()];
		};
		/** Stores a part as another window does. A string is stored as it is, so that it can be JSON that does not parse into what it says. */
		const storeFromOtherWindow = (id: string, part: string, value: unknown) => storageService.store(`${LAYOUT_STORAGE_KEY_PREFIX}${id}.${part}`, typeof value === 'string' ? value : JSON.stringify(value), StorageScope.PROFILE, StorageTarget.MACHINE, true);
		/** Removes what is stored under keys that start with the prefix, as other windows and profile switches do, which remove the names first. */
		const removeExternally = (prefix: string) => {
			const keys = storageService.keys(StorageScope.PROFILE).filter(key => key.startsWith(prefix));
			for (const key of keys.sort((a, b) => Number(b.endsWith('.name')) - Number(a.endsWith('.name')))) {
				storageService.remove(key, StorageScope.PROFILE, true);
			}
		};
		const removeFromOtherWindow = (id: string) => removeExternally(`${LAYOUT_STORAGE_KEY_PREFIX}${id}.`);
		/**
		 * Switches the profile of the window. A profile with its own storage has none of the layouts. The window learns of the switch
		 * before the storage switches, and then of the keys that the switch removes, the names first.
		 */
		const switchProfile = (profile: Partial<IUserDataProfile>) => {
			const previous = userDataProfileService.currentProfile;
			userDataProfileService.currentProfile = upcastPartial<IUserDataProfile>(profile);
			onDidChangeCurrentProfile.fire({ previous, profile: userDataProfileService.currentProfile, join: () => { } });
			if (!profile.useDefaultFlags?.globalState) {
				removeExternally(LAYOUT_STORAGE_KEY_PREFIX);
			}
		};

		if (restore) {
			storageService.store('workbench.namedLayouts.activeLayout', 'restored', StorageScope.WORKSPACE, StorageTarget.MACHINE);
			storageService.store('workbench.namedLayouts.activeLayoutProfile', restore.layoutProfile, StorageScope.WORKSPACE, StorageTarget.MACHINE);
			if (restore.defaultLayout) {
				storageService.store('workbench.namedLayouts.defaultLayout', JSON.stringify(restore.defaultLayout), StorageScope.WORKSPACE, StorageTarget.MACHINE);
			}
			for (const [part, value] of Object.entries(restore.layout)) {
				storeFromOtherWindow('restored', part, value);
			}
			if (restore.zenMode) {
				toggleZenMode();
			}
			if (restore.groupMaximized) {
				toggleMaximizeGroup();
			}
		}

		const service = store.add(instantiationService.createInstance(NamedLayoutsService));

		return { service, window, storageService, configurationService, toggleZenMode, toggleMaximizeGroup, storedLayouts, storeFromOtherWindow, removeFromOtherWindow, switchProfile };
	}

	/** Collects the keys of the layouts that this window writes. */
	function trackWrites(storageService: TestStorageService): string[] {
		const written: string[] = [];
		const listenerStore = store.add(new DisposableStore());
		listenerStore.add(storageService.onDidChangeValue(StorageScope.PROFILE, undefined, listenerStore)(e => {
			if (!e.external) {
				written.push(e.key.slice(LAYOUT_STORAGE_KEY_PREFIX.length));
			}
		}));
		return written;
	}

	test('creating a layout makes it the active layout, and switching saves the layout that was active and applies the other one, also the default layout', async () => {
		const { service, window, storageService, storedLayouts } = createWindow();

		const debug = (await service.createLayout('  Debug  '))!;
		window.parts = partsState(false, Position.RIGHT, 'workbench.view.debug');
		window.editorGroups = { orientation: GroupOrientation.HORIZONTAL, groups: [{ size: 330 }, { size: 330 }, { size: 1340 }] };

		await service.switchLayout(service.layouts[0]);
		const onDefault = { active: service.activeLayout.name, parts: window.parts, editorGroups: window.editorGroups, activeLayoutStored: storageService.get('workbench.namedLayouts.activeLayout', StorageScope.WORKSPACE) };

		await service.switchLayout(debug);
		const onDebug = { active: service.activeLayout.name, parts: window.parts, editorGroups: window.editorGroups, defaultLayout: JSON.parse(storageService.get('workbench.namedLayouts.defaultLayout', StorageScope.WORKSPACE)!) };

		const debugParts = partsState(false, Position.RIGHT, 'workbench.view.debug');
		const debugEditorGroups = { orientation: GroupOrientation.HORIZONTAL, groups: [{ size: 0.165 }, { size: 0.165 }, { size: 0.67 }] };
		assert.deepStrictEqual({ layouts: service.layouts.map(layout => layout.name), onDefault, onDebug, stored: storedLayouts() }, {
			layouts: ['Default', 'Debug'],
			onDefault: { active: 'Default', parts: partsState(true, Position.BOTTOM), editorGroups: singleGroup, activeLayoutStored: undefined },
			onDebug: { active: 'Debug', parts: debugParts, editorGroups: debugEditorGroups, defaultLayout: { ...partsState(true, Position.BOTTOM), editorGroups: singleGroup } },
			stored: [{ name: 'Debug', ...debugParts, editorGroups: debugEditorGroups }],
		});
	});

	test('saving writes only the parts that this window changed, each under its own key, so that what another window saves into the same layout is kept', async () => {
		const { service, window, storageService, storedLayouts, storeFromOtherWindow } = createWindow();
		const debug = (await service.createLayout('Debug'))!;
		const otherPanel = partsState(true, Position.RIGHT).panel;
		const otherEditorGroups = { orientation: GroupOrientation.VERTICAL, groups: [{ size: 0.5 }, { size: 0.5 }] };
		storeFromOtherWindow(debug.id, 'panel', otherPanel);
		storeFromOtherWindow(debug.id, 'editorGroups', otherEditorGroups);

		const written = trackWrites(storageService);
		window.parts = partsState(false, Position.BOTTOM);
		await service.saveLayout();

		assert.deepStrictEqual({ written, stored: storedLayouts() }, {
			written: [`${debug.id}.sideBar`],
			stored: [{ name: 'Debug', ...partsState(false, Position.BOTTOM), panel: otherPanel, editorGroups: otherEditorGroups }],
		});
	});

	test('the window saves the active layout as it closes, but not while named layouts are disabled, and not the parts that Zen mode hides', async () => {
		const { service, window, configurationService, storageService, toggleZenMode, storedLayouts } = createWindow();
		await service.createLayout('Debug');
		window.parts = partsState(false, Position.LEFT);
		const storedParts = () => {
			const { sideBar, panel, auxiliaryBar } = storedLayouts()[0];
			return { sideBar, panel, auxiliaryBar };
		};

		await configurationService.setUserConfiguration(NAMED_LAYOUTS_ENABLED_SETTING, false);
		storageService.testEmitWillSaveState(WillSaveStateReason.SHUTDOWN);
		const disabled = storedParts();

		await configurationService.setUserConfiguration(NAMED_LAYOUTS_ENABLED_SETTING, true);
		storageService.testEmitWillSaveState(WillSaveStateReason.NONE);
		const notClosing = storedParts();

		toggleZenMode();
		storageService.testEmitWillSaveState(WillSaveStateReason.SHUTDOWN);
		const closingInZenMode = storedParts();

		toggleZenMode();
		storageService.testEmitWillSaveState(WillSaveStateReason.SHUTDOWN);
		const closing = storedParts();

		assert.deepStrictEqual({ disabled, notClosing, closingInZenMode, closing }, {
			disabled: partsState(true, Position.BOTTOM),
			notClosing: partsState(true, Position.BOTTOM),
			closingInZenMode: partsState(true, Position.BOTTOM),
			closing: partsState(false, Position.LEFT),
		});
	});

	test('Zen mode ends before the window switches, so that the layout that was active saves its parts as they show outside of Zen mode', async () => {
		const { service, window, toggleZenMode, storedLayouts } = createWindow();
		const debug = (await service.createLayout('Debug'))!;
		window.parts = partsState(false, Position.RIGHT);

		toggleZenMode();
		await service.switchLayout(service.layouts[0]);
		await service.switchLayout(debug);

		assert.deepStrictEqual({ zenMode: window.zenMode, parts: window.parts, stored: storedLayouts()[0] }, {
			zenMode: false,
			parts: partsState(false, Position.RIGHT),
			stored: { name: 'Debug', ...partsState(false, Position.RIGHT), editorGroups: singleGroup },
		});
	});

	test('a switch applies the parts even when an editor refuses to move into fewer editor groups, and keeps the stored editor groups of the layout', async () => {
		const { service, window, storedLayouts } = createWindow();
		const debug = (await service.createLayout('Debug'))!;
		await service.switchLayout(service.layouts[0]);

		window.editorGroups = twoGroups;
		window.parts = partsState(false, Position.RIGHT);
		window.editorMoveVetoed = true;
		const switched = await service.switchLayout(debug);
		await service.saveLayout();

		assert.deepStrictEqual({ switched, active: service.activeLayout.name, parts: window.parts, editorGroups: window.editorGroups, stored: storedLayouts() }, {
			switched: true,
			active: 'Debug',
			parts: partsState(true, Position.BOTTOM),
			editorGroups: twoGroups,
			stored: [{ name: 'Debug', ...partsState(true, Position.BOTTOM), editorGroups: singleGroup }],
		});
	});

	test('the default layout keeps editor groups that do not apply, as an editor refuses to move, while its editor groups do not change, also as the window closes, and applies them when it next becomes active', async () => {
		const { service, window, storageService } = createWindow();
		const debug = (await service.createLayout('Debug'))!;
		window.editorGroups = twoGroups;
		window.editorMoveVetoed = true;
		await service.switchLayout(service.layouts[0]);
		const onDefault = window.editorGroups;

		storageService.testEmitWillSaveState(WillSaveStateReason.SHUTDOWN);
		await service.switchLayout(debug);
		const stored = defaultLayoutState(storageService)?.editorGroups;

		window.editorMoveVetoed = false;
		await service.switchLayout(service.layouts[0]);

		assert.deepStrictEqual({ onDefault, stored, editorGroups: window.editorGroups }, { onDefault: twoGroups, stored: singleGroup, editorGroups: singleGroup });
	});

	test('the default layout drops editor groups that did not apply once its editor groups change', async () => {
		const { service, window, storageService } = createWindow();
		const debug = (await service.createLayout('Debug'))!;
		window.editorGroups = twoGroups;
		window.editorMoveVetoed = true;
		await service.switchLayout(service.layouts[0]);
		window.editorGroups = threeGroups;
		await service.switchLayout(debug);

		assert.deepStrictEqual(defaultLayoutState(storageService)?.editorGroups, threeGroups);
	});

	test('deleting the active layout keeps the editor groups of the default layout that do not apply, until the window closes after its editor groups changed', async () => {
		const { service, window, storageService } = createWindow();
		const debug = (await service.createLayout('Debug'))!;
		window.editorGroups = twoGroups;
		window.editorMoveVetoed = true;
		await service.deleteLayout(debug);
		const kept = defaultLayoutState(storageService);

		window.editorGroups = threeGroups;
		storageService.testEmitWillSaveState(WillSaveStateReason.SHUTDOWN);

		assert.deepStrictEqual({ kept, afterClose: defaultLayoutState(storageService) }, { kept: { editorGroups: singleGroup }, afterClose: null });
	});

	test('a window that starts with a named layout active applies what differs from it as it is stored, as part sizes are stored per profile and other windows can change the layout, but not editor groups that only differ by rounding', async () => {
		const restoredParts = partsState(false, Position.RIGHT, 'workbench.view.debug');
		const restoredEditorGroups = { orientation: GroupOrientation.HORIZONTAL, groups: [{ size: 0.5 }, { size: 0.5 }] };
		const { service, window } = createWindow({
			layout: { name: 'Debug', ...restoredParts, editorGroups: { orientation: GroupOrientation.HORIZONTAL, groups: [{ size: 0.503 }, { size: 0.497 }] } },
			editorGroups: restoredEditorGroups,
		});
		await service.saveLayout();

		assert.deepStrictEqual({ active: service.activeLayout.name, parts: window.parts, editorGroups: window.editorGroups, editorGroupsApplied: window.editorGroupsApplied }, {
			active: 'Debug',
			parts: restoredParts,
			editorGroups: restoredEditorGroups,
			editorGroupsApplied: 0,
		});
	});

	test('a window that starts with a named layout active applies it only once its editors restored, as editors still open into the editor groups that applying it can merge', async () => {
		const whenRestored = new DeferredPromise<void>();
		const restoredParts = partsState(false, Position.RIGHT, 'workbench.view.debug');
		const { service, window } = createWindow({ layout: { name: 'Debug', ...restoredParts, editorGroups: singleGroup }, editorGroups: twoGroups, whenRestored: whenRestored.p });
		await timeout(0);
		const beforeRestored = { parts: window.parts, editorGroups: window.editorGroups };

		whenRestored.complete();
		await service.saveLayout();

		assert.deepStrictEqual({ beforeRestored, parts: window.parts, editorGroups: window.editorGroups }, {
			beforeRestored: { parts: partsState(true, Position.BOTTOM), editorGroups: twoGroups },
			parts: restoredParts,
			editorGroups: singleGroup,
		});
	});

	test('a window that starts with a named layout active applies its editor groups before it compares the parts, as applying editor groups can restore a maximized part', async () => {
		const maximizedPanel = { ...partsState(true, Position.BOTTOM), panel: { ...partsState(true, Position.BOTTOM).panel, maximized: true } };
		const { service, window } = createWindow({ layout: { name: 'Debug', ...maximizedPanel, editorGroups: twoGroups }, parts: maximizedPanel });
		await service.saveLayout();

		assert.deepStrictEqual({ parts: window.parts, editorGroups: window.editorGroups }, { parts: maximizedPanel, editorGroups: twoGroups });
	});

	test('a window that starts in Zen mode applies the parts of its active layout when Zen mode ends, so that it saves only the parts that change after that', async () => {
		const restoredParts = partsState(false, Position.RIGHT, 'workbench.view.debug');
		const { service, window, toggleZenMode, storedLayouts, storeFromOtherWindow } = createWindow({ layout: { name: 'Debug', ...restoredParts, editorGroups: singleGroup }, zenMode: true });
		await service.saveLayout();
		const inZenMode = window.parts;

		const otherPanel = partsState(true, Position.LEFT).panel;
		storeFromOtherWindow('restored', 'panel', otherPanel);
		toggleZenMode();
		const afterZenMode = window.parts;

		const laterPanel = partsState(true, Position.TOP).panel;
		storeFromOtherWindow('restored', 'panel', laterPanel);
		await service.saveLayout();

		assert.deepStrictEqual({ inZenMode, afterZenMode, stored: storedLayouts() }, {
			inZenMode: { ...partsState(false, Position.BOTTOM), panel: { ...partsState(true, Position.BOTTOM).panel, visible: false } },
			afterZenMode: { ...restoredParts, panel: otherPanel },
			stored: [{ name: 'Debug', ...restoredParts, panel: laterPanel, editorGroups: singleGroup }],
		});
	});

	test('while an editor group is maximized, the window does not save the editor groups, whose sizes the maximized group distorts, and restores the group before it creates a layout', async () => {
		const { service, window, storageService, toggleMaximizeGroup, storedLayouts } = createWindow();
		window.editorGroups = twoGroups;
		await service.createLayout('Debug');
		toggleMaximizeGroup();
		storageService.testEmitWillSaveState(WillSaveStateReason.SHUTDOWN);
		await service.createLayout('Other');

		const editorGroups = Object.fromEntries(storedLayouts().map(layout => [layout.name, layout.editorGroups]));
		assert.deepStrictEqual({ editorGroups, groupMaximized: window.groupMaximized }, { editorGroups: { Debug: twoGroups, Other: twoGroups }, groupMaximized: false });
	});

	test('a window that starts with a maximized editor group keeps its editor groups, and once the group is restored, saves them only when they change', async () => {
		const { service, window, toggleMaximizeGroup, storedLayouts, storeFromOtherWindow } = createWindow({ layout: { name: 'Debug', editorGroups: threeGroups }, editorGroups: twoGroups, groupMaximized: true });
		await service.saveLayout();
		const editorGroupsApplied = window.editorGroupsApplied;

		toggleMaximizeGroup();
		storeFromOtherWindow('restored', 'editorGroups', singleGroup);
		await service.saveLayout();

		assert.deepStrictEqual({ editorGroupsApplied, stored: storedLayouts() }, { editorGroupsApplied: 0, stored: [{ name: 'Debug', editorGroups: singleGroup }] });
	});

	test('while named layouts are disabled, the window does not create, save, switch, rename or delete layouts, also when a command runs that the setting hides', async () => {
		const { service, window, configurationService, storedLayouts } = createWindow();
		const debug = (await service.createLayout('Debug'))!;
		window.parts = partsState(false, Position.LEFT);

		await configurationService.setUserConfiguration(NAMED_LAYOUTS_ENABLED_SETTING, false);
		const results = {
			created: await service.createLayout('Other'),
			saved: await service.saveLayout(),
			switched: await service.switchLayout(service.layouts[0]),
			renamed: await service.renameLayout(debug, 'Renamed'),
			deleted: await service.deleteLayout(debug),
		};

		assert.deepStrictEqual({ results, active: service.activeLayout.name, parts: window.parts, stored: storedLayouts() }, {
			results: { created: undefined, saved: false, switched: false, renamed: false, deleted: false },
			active: 'Debug',
			parts: partsState(false, Position.LEFT),
			stored: [{ name: 'Debug', ...partsState(true, Position.BOTTOM), editorGroups: singleGroup }],
		});
	});

	test('a deletion that waits for the window to restore does not delete the layout when named layouts are disabled meanwhile', async () => {
		const whenRestored = new DeferredPromise<void>();
		const { service, configurationService, storedLayouts } = createWindow({ layout: { name: 'Debug', ...partsState(false, Position.RIGHT) }, whenRestored: whenRestored.p });

		const deleted = service.deleteLayout(service.activeLayout);
		await timeout(0);
		await configurationService.setUserConfiguration(NAMED_LAYOUTS_ENABLED_SETTING, false);
		whenRestored.complete();

		assert.deepStrictEqual({ deleted: await deleted, stored: storedLayouts() }, {
			deleted: false,
			stored: [{ name: 'Debug', ...partsState(false, Position.RIGHT) }],
		});
	});

	test('deleting the active layout applies the default layout without saving the deleted one, and a layout that another window deletes leaves this window with its arrangement as its default layout', async () => {
		const { service, window, removeFromOtherWindow, storageService, storedLayouts } = createWindow();
		const scratch = (await service.createLayout('Scratch'))!;
		window.parts = partsState(false, Position.RIGHT);
		await service.deleteLayout(scratch);
		const deleted = { active: service.activeLayout.name, layouts: service.layouts.map(layout => layout.name), parts: window.parts, stored: storedLayouts() };

		const debug = (await service.createLayout('Debug'))!;
		window.parts = partsState(false, Position.LEFT);
		const activeLayouts: string[] = [];
		store.add(service.onDidChangeActiveLayout(layout => activeLayouts.push(layout.name)));
		removeFromOtherWindow(debug.id);
		const deletedElsewhere = {
			active: service.activeLayout.name,
			layouts: service.layouts.map(layout => layout.name),
			parts: window.parts,
			activeLayouts,
			defaultLayout: storageService.get('workbench.namedLayouts.defaultLayout', StorageScope.WORKSPACE),
			switched: await service.switchLayout(debug),
			renamed: await service.renameLayout(debug, 'Renamed'),
			stored: storedLayouts(),
		};

		assert.deepStrictEqual({ deleted, deletedElsewhere }, {
			deleted: { active: 'Default', layouts: ['Default'], parts: partsState(true, Position.BOTTOM), stored: [] },
			deletedElsewhere: { active: 'Default', layouts: ['Default'], parts: partsState(false, Position.LEFT), activeLayouts: ['Default'], defaultLayout: undefined, switched: false, renamed: false, stored: [] },
		});
	});

	test('switching to a profile with its own storage applies the default layout, also while named layouts are disabled, and switching to a profile that shares the storage keeps the active layout', async () => {
		const { service, window, storageService, configurationService, toggleZenMode, switchProfile, storedLayouts } = createWindow();
		await service.createLayout('Debug');
		switchProfile({ id: 'shared', useDefaultFlags: { globalState: true } });
		const sharedStorage = { active: service.activeLayout.name, layouts: service.layouts.map(layout => layout.name) };

		window.parts = partsState(false, Position.RIGHT);
		window.editorGroups = twoGroups;
		toggleZenMode();
		const activeLayouts: string[] = [];
		store.add(service.onDidChangeActiveLayout(layout => activeLayouts.push(layout.name)));
		await configurationService.setUserConfiguration(NAMED_LAYOUTS_ENABLED_SETTING, false);
		switchProfile({ id: 'work' });

		const ownStorage = {
			active: service.activeLayout.name,
			layouts: service.layouts.map(layout => layout.name),
			activeLayouts,
			zenMode: window.zenMode,
			parts: window.parts,
			editorGroups: window.editorGroups,
			activeLayoutStored: storageService.get('workbench.namedLayouts.activeLayout', StorageScope.WORKSPACE),
			defaultLayout: defaultLayoutState(storageService),
			stored: storedLayouts(),
		};
		assert.deepStrictEqual({ sharedStorage, ownStorage }, {
			sharedStorage: { active: 'Debug', layouts: ['Default', 'Debug'] },
			ownStorage: { active: 'Default', layouts: ['Default'], activeLayouts: ['Default'], zenMode: false, parts: partsState(true, Position.BOTTOM), editorGroups: singleGroup, activeLayoutStored: undefined, defaultLayout: null, stored: [] },
		});
	});

	test('after a switch between profiles without layouts, a layout that another window deletes still leaves the window with its arrangement as its default layout', async () => {
		const { service, window, switchProfile, removeFromOtherWindow } = createWindow();
		switchProfile({ id: 'work' });
		const debug = (await service.createLayout('Debug'))!;
		window.parts = partsState(false, Position.LEFT);
		removeFromOtherWindow(debug.id);

		assert.deepStrictEqual({ active: service.activeLayout.name, parts: window.parts }, { active: 'Default', parts: partsState(false, Position.LEFT) });
	});

	test('a window that switches to a profile with its own storage before its editors restored applies the default layout only once they restored, as editors still open into the editor groups that applying it can merge, and ends Zen mode then, and keeps what is stored as it closes before then', async () => {
		const whenRestored = new DeferredPromise<void>();
		const debugParts = partsState(false, Position.RIGHT);
		const defaultLayout = { ...partsState(true, Position.BOTTOM), editorGroups: singleGroup };
		const { service, window, storageService, switchProfile } = createWindow({ layout: { name: 'Debug', ...debugParts, editorGroups: twoGroups }, defaultLayout, parts: debugParts, editorGroups: twoGroups, zenMode: true, whenRestored: whenRestored.p });
		switchProfile({ id: 'work' });
		await timeout(0);
		storageService.testEmitWillSaveState(WillSaveStateReason.SHUTDOWN);
		const beforeRestored = { active: service.activeLayout.name, zenMode: window.zenMode, editorGroupsApplied: window.editorGroupsApplied, activeLayoutStored: storageService.get('workbench.namedLayouts.activeLayout', StorageScope.WORKSPACE), defaultLayout: defaultLayoutState(storageService) };

		whenRestored.complete();
		await service.saveLayout();

		assert.deepStrictEqual({ beforeRestored, active: service.activeLayout.name, zenMode: window.zenMode, parts: window.parts, editorGroups: window.editorGroups, defaultLayout: defaultLayoutState(storageService) }, {
			beforeRestored: { active: 'Default', zenMode: true, editorGroupsApplied: 0, activeLayoutStored: 'restored', defaultLayout },
			active: 'Default',
			zenMode: false,
			parts: partsState(true, Position.BOTTOM),
			editorGroups: singleGroup,
			defaultLayout: null,
		});
	});

	test('a window that starts in another profile than the one with its active layout, as after a profile switch before it restored, keeps the stored state of the default layout and applies it once its editors restored, and the window stores the profile of a layout only when the profile has its own storage', async () => {
		const whenRestored = new DeferredPromise<void>();
		const debugParts = partsState(false, Position.RIGHT);
		const { service, window, storageService, switchProfile } = createWindow({ layout: {}, layoutProfile: 'work', defaultLayout: { ...partsState(true, Position.BOTTOM), editorGroups: singleGroup }, parts: debugParts, editorGroups: twoGroups, whenRestored: whenRestored.p });
		const activeLayoutProfile = () => storageService.get('workbench.namedLayouts.activeLayoutProfile', StorageScope.WORKSPACE);
		await timeout(0);
		const beforeRestored = { active: service.activeLayout.name, editorGroupsApplied: window.editorGroupsApplied, defaultLayout: defaultLayoutState(storageService) };

		whenRestored.complete();
		await service.saveLayout();
		const restored = {
			parts: window.parts,
			editorGroups: window.editorGroups,
			activeLayoutStored: storageService.get('workbench.namedLayouts.activeLayout', StorageScope.WORKSPACE),
			activeLayoutProfile: activeLayoutProfile(),
			defaultLayout: defaultLayoutState(storageService),
		};

		await service.createLayout('Shared');
		const inDefaultStorage = activeLayoutProfile();
		switchProfile({ id: 'work' });
		await service.createLayout('Work');

		assert.deepStrictEqual({ beforeRestored, restored, inDefaultStorage, inOwnStorage: activeLayoutProfile() }, {
			beforeRestored: { active: 'Default', editorGroupsApplied: 0, defaultLayout: { ...partsState(true, Position.BOTTOM), editorGroups: singleGroup } },
			restored: { parts: partsState(true, Position.BOTTOM), editorGroups: singleGroup, activeLayoutStored: undefined, activeLayoutProfile: undefined, defaultLayout: null },
			inDefaultStorage: undefined,
			inOwnStorage: 'work',
		});
	});

	test('lists the default layout first and the others by name, also those that another window creates, and ignores what is stored that is not valid', async () => {
		const { service, window, storeFromOtherWindow } = createWindow();
		const zeta = (await service.createLayout('Zeta'))!;
		const renamed = await service.renameLayout(zeta, 'Beta');

		const otherPanel = partsState(true, Position.RIGHT).panel;
		storeFromOtherWindow('alpha', 'name', 'Alpha');
		storeFromOtherWindow('alpha', 'sideBar', { visible: true, size: -300 });
		storeFromOtherWindow('alpha', 'panel', otherPanel);
		storeFromOtherWindow('alpha', 'editorGroups', { orientation: GroupOrientation.HORIZONTAL, groups: [{ groups: [{ groups: [{}, {}] }] }] });
		storeFromOtherWindow('gamma', 'name', 'Gamma');
		storeFromOtherWindow('gamma', 'editorGroups', '{"orientation":0,"groups":[{"size":1e999},{"size":1}]}');
		storeFromOtherWindow('orphan', 'sideBar', partsState(false, Position.BOTTOM).sideBar);
		storeFromOtherWindow('blank', 'name', '  ');
		storeFromOtherWindow('default', 'name', 'Other Default');
		const layouts = service.layouts.map(layout => layout.name);
		await service.switchLayout(service.layouts[1]);
		await service.switchLayout(service.layouts[3]);

		assert.deepStrictEqual({ renamed, layouts, parts: window.parts, editorGroups: window.editorGroups }, {
			renamed: true,
			layouts: ['Default', 'Alpha', 'Beta', 'Gamma'],
			parts: { ...partsState(true, Position.BOTTOM), panel: otherPanel },
			editorGroups: singleGroup,
		});
	});
});
