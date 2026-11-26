/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { MockContextKeyService } from '../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { IStorageService, StorageScope, StorageTarget, WillSaveStateReason } from '../../../../../platform/storage/common/storage.js';
import { InEditorZenModeContext } from '../../../../common/contextkeys.js';
import { EditorGroupLayout, GroupOrientation, IEditorGroupsService, IEditorPart } from '../../../../services/editor/common/editorGroupsService.js';
import { IExtensionService } from '../../../../services/extensions/common/extensions.js';
import { IPartsLayoutState, IWorkbenchLayoutService, Position } from '../../../../services/layout/browser/layoutService.js';
import { ILifecycleService } from '../../../../services/lifecycle/common/lifecycle.js';
import { TestStorageService } from '../../../../test/common/workbenchTestServices.js';
import { NAMED_LAYOUTS_ENABLED_SETTING } from '../../browser/namedLayouts.js';
import { NamedLayoutsService } from '../../browser/namedLayoutsService.js';

suite('NamedLayoutsService', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();

	const LAYOUTS_STORAGE_KEY = 'workbench.namedLayouts.layouts';

	function partsState(sideBarVisible: boolean, panelPosition: Position, viewContainerId = 'workbench.view.explorer'): IPartsLayoutState {
		return {
			sideBar: { visible: sideBarVisible, size: 300, viewContainerId },
			panel: { visible: true, size: 250, position: panelPosition, maximized: false },
			auxiliaryBar: { visible: false, size: 300, maximized: false }
		};
	}

	const singleGroup: EditorGroupLayout = { orientation: GroupOrientation.HORIZONTAL, groups: [{ size: 1 }] };

	/**
	 * A window whose parts and editor groups show what was applied last, and whose Zen mode hides the parts until it ends.
	 */
	function createWindow() {
		const storageService = store.add(new TestStorageService());
		const configurationService = new TestConfigurationService({ [NAMED_LAYOUTS_ENABLED_SETTING]: true });
		const contextKeyService = store.add(new MockContextKeyService());
		const zenMode = InEditorZenModeContext.bindTo(contextKeyService);
		const window = {
			parts: partsState(true, Position.BOTTOM),
			editorGroups: singleGroup,
			partsBeforeZenMode: undefined as IPartsLayoutState | undefined,
		};

		const instantiationService = store.add(new TestInstantiationService());
		instantiationService.stub(IStorageService, storageService);
		instantiationService.stub(IConfigurationService, configurationService);
		instantiationService.stub(IContextKeyService, contextKeyService);
		instantiationService.stub(ILifecycleService, { when: () => Promise.resolve() });
		instantiationService.stub(IExtensionService, { whenInstalledExtensionsRegistered: () => Promise.resolve(true) });
		const toggleZenMode = () => {
			if (zenMode.get()) {
				window.parts = window.partsBeforeZenMode!;
			} else {
				window.partsBeforeZenMode = window.parts;
				window.parts = { ...window.parts, sideBar: { ...window.parts.sideBar, visible: false }, panel: { ...window.parts.panel, visible: false } };
			}
			zenMode.set(!zenMode.get());
		};
		instantiationService.stub(IWorkbenchLayoutService, {
			getPartsLayoutState: () => window.parts,
			applyPartsLayoutState: (state: IPartsLayoutState) => { window.parts = state; },
			toggleZenMode,
		});
		instantiationService.stub(IEditorGroupsService, {
			mainPart: upcastPartial<IEditorPart>({
				getLayout: () => window.editorGroups,
				applyLayout: (layout: EditorGroupLayout) => { window.editorGroups = layout; },
			})
		});

		const service = store.add(instantiationService.createInstance(NamedLayoutsService));

		const storedLayouts = (): { name: string; state: unknown }[] => JSON.parse(storageService.get(LAYOUTS_STORAGE_KEY, StorageScope.PROFILE) ?? '[]').map(({ name, state }: { name: string; state: unknown }) => ({ name, state }));
		const storeFromOtherWindow = (value: unknown) => storageService.store(LAYOUTS_STORAGE_KEY, JSON.stringify(value), StorageScope.PROFILE, StorageTarget.MACHINE, true);

		return { service, window, storageService, configurationService, zenMode, toggleZenMode, storedLayouts, storeFromOtherWindow };
	}

	test('creating a layout makes it the active layout, and switching saves the layout that was active and applies the other one, also the default layout', async () => {
		const { service, window, storageService, storedLayouts } = createWindow();

		const debug = await service.createLayout('  Debug  ');
		window.parts = partsState(false, Position.RIGHT, 'workbench.view.debug');
		window.editorGroups = { orientation: GroupOrientation.HORIZONTAL, groups: [{ size: 600 }, { size: 400 }] };

		await service.switchLayout(service.layouts[0]);
		const onDefault = { active: service.activeLayout.name, parts: window.parts, editorGroups: window.editorGroups, activeLayoutStored: storageService.get('workbench.namedLayouts.activeLayout', StorageScope.WORKSPACE) };

		await service.switchLayout(debug);
		const onDebug = { active: service.activeLayout.name, parts: window.parts, editorGroups: window.editorGroups, defaultLayout: JSON.parse(storageService.get('workbench.namedLayouts.defaultLayout', StorageScope.WORKSPACE)!) };

		const debugState = { parts: partsState(false, Position.RIGHT, 'workbench.view.debug'), editorGroups: { orientation: GroupOrientation.HORIZONTAL, groups: [{ size: 0.6 }, { size: 0.4 }] } };
		assert.deepStrictEqual({ layouts: service.layouts.map(layout => layout.name), onDefault, onDebug, stored: storedLayouts() }, {
			layouts: ['Default', 'Debug'],
			onDefault: { active: 'Default', parts: partsState(true, Position.BOTTOM), editorGroups: singleGroup, activeLayoutStored: undefined },
			onDebug: { active: 'Debug', ...debugState, defaultLayout: { parts: partsState(true, Position.BOTTOM), editorGroups: singleGroup } },
			stored: [{ name: 'Debug', state: debugState }],
		});
	});

	test('saving writes only what this window changed of the active layout, so that what another window saved into it meanwhile is kept', async () => {
		const { service, window, storedLayouts, storeFromOtherWindow, storageService } = createWindow();
		await service.createLayout('Debug');

		const fromOtherWindow = JSON.parse(storageService.get(LAYOUTS_STORAGE_KEY, StorageScope.PROFILE)!);
		const otherEditorGroups = { orientation: GroupOrientation.VERTICAL, groups: [{ size: 0.5 }, { size: 0.5 }] };
		fromOtherWindow[0].state.editorGroups = otherEditorGroups;
		storeFromOtherWindow(fromOtherWindow);
		window.parts = partsState(false, Position.BOTTOM);
		await service.saveLayout();

		assert.deepStrictEqual(storedLayouts(), [{ name: 'Debug', state: { parts: partsState(false, Position.BOTTOM), editorGroups: otherEditorGroups } }]);
	});

	test('the window saves the active layout as it closes, but not while named layouts are disabled, and not the parts that Zen mode hides', async () => {
		const { service, window, configurationService, storageService, toggleZenMode, storedLayouts } = createWindow();
		await service.createLayout('Debug');
		window.parts = partsState(false, Position.LEFT);
		const storedParts = () => (storedLayouts()[0].state as { parts: IPartsLayoutState }).parts;

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
		const { service, window, zenMode, toggleZenMode, storedLayouts } = createWindow();
		const debug = await service.createLayout('Debug');
		window.parts = partsState(false, Position.RIGHT);

		toggleZenMode();
		await service.switchLayout(service.layouts[0]);
		await service.switchLayout(debug);

		assert.deepStrictEqual({ zenMode: zenMode.get(), parts: window.parts, stored: storedLayouts()[0].state }, {
			zenMode: false,
			parts: partsState(false, Position.RIGHT),
			stored: { parts: partsState(false, Position.RIGHT), editorGroups: singleGroup },
		});
	});

	test('deleting the active layout applies the default layout without saving the deleted one, and a layout that another window deletes leaves this window with its arrangement as its default layout', async () => {
		const { service, window, storeFromOtherWindow, storageService } = createWindow();
		const scratch = await service.createLayout('Scratch');
		window.parts = partsState(false, Position.RIGHT);
		await service.deleteLayout(scratch);
		const deleted = { active: service.activeLayout.name, layouts: service.layouts.map(layout => layout.name), parts: window.parts };

		await service.createLayout('Debug');
		window.parts = partsState(false, Position.LEFT);
		const activeLayouts: string[] = [];
		store.add(service.onDidChangeActiveLayout(layout => activeLayouts.push(layout.name)));
		storeFromOtherWindow([]);
		const deletedElsewhere = { active: service.activeLayout.name, layouts: service.layouts.map(layout => layout.name), parts: window.parts, activeLayouts, defaultLayout: storageService.get('workbench.namedLayouts.defaultLayout', StorageScope.WORKSPACE) };

		assert.deepStrictEqual({ deleted, deletedElsewhere }, {
			deleted: { active: 'Default', layouts: ['Default'], parts: partsState(true, Position.BOTTOM) },
			deletedElsewhere: { active: 'Default', layouts: ['Default'], parts: partsState(false, Position.LEFT), activeLayouts: ['Default'], defaultLayout: undefined },
		});
	});

	test('lists the default layout first and the others by name, also those that another window creates, and leaves out stored layouts that are not valid', async () => {
		const { service, storageService, storeFromOtherWindow } = createWindow();
		const zeta = await service.createLayout('Zeta');
		await service.renameLayout(zeta, 'Beta');

		const stored = JSON.parse(storageService.get(LAYOUTS_STORAGE_KEY, StorageScope.PROFILE)!);
		storeFromOtherWindow([...stored, { id: 'alpha', name: 'Alpha', state: { editorGroups: singleGroup } }, { id: 'broken', name: 'Broken', state: { parts: { sideBar: true } } }, { id: 'default', name: 'Other Default', state: {} }]);

		assert.deepStrictEqual(service.layouts.map(layout => layout.name), ['Default', 'Alpha', 'Beta']);
	});
});
