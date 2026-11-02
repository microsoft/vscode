/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { mainWindow } from '../../../../../base/browser/window.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { MockScopableContextKeyService } from '../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { Registry } from '../../../../../platform/registry/common/platform.js';
import { IStorageService } from '../../../../../platform/storage/common/storage.js';
import { IThemeService } from '../../../../../platform/theme/common/themeService.js';
import { IEditorPartsView } from '../../../../browser/parts/editor/editor.js';
import { EditorPart } from '../../../../browser/parts/editor/editorPart.js';
import { EditorExtensions, IEditorFactoryRegistry } from '../../../../common/editor.js';
import { createEditorParts, TestEditorParts, workbenchInstantiationService } from '../../../../test/browser/workbenchTestServices.js';
import { IAuxiliaryWindowService } from '../../../auxiliaryWindow/browser/auxiliaryWindowService.js';
import { IHostService } from '../../../host/browser/host.js';
import { IWorkbenchLayoutService } from '../../../layout/browser/layoutService.js';
import { IEditorGroupsService, IEditorPart } from '../../common/editorGroupsService.js';

/**
 * An editor part that is created by someone else than the editor parts
 * service and rendered into a container of its owner.
 */
class TestOwnedEditorPart extends EditorPart {

	private static COUNTER = 1;

	constructor(
		editorPartsView: IEditorPartsView,
		@IInstantiationService instantiationService: IInstantiationService,
		@IThemeService themeService: IThemeService,
		@IConfigurationService configurationService: IConfigurationService,
		@IStorageService storageService: IStorageService,
		@IWorkbenchLayoutService layoutService: IWorkbenchLayoutService,
		@IHostService hostService: IHostService,
		@IContextKeyService contextKeyService: IContextKeyService
	) {
		super(editorPartsView, `workbench.parts.testOwnedEditor.${TestOwnedEditorPart.COUNTER++}`, 'Owned', mainWindow.vscodeWindowId, instantiationService, themeService, configurationService, storageService, layoutService, hostService, contextKeyService);
	}

	override get isTransient(): boolean {
		return true;
	}

	protected override saveState(): void {
		// owned by the test
	}
}

suite('Editor Parts', () => {

	const disposables = new DisposableStore();

	teardown(() => {
		disposables.clear();
	});

	ensureNoDisposablesAreLeakedInTestSuite();

	async function createServices() {
		const instantiationService = workbenchInstantiationService({ contextKeyService: instantiationService => instantiationService.createInstance(MockScopableContextKeyService) }, disposables);
		instantiationService.invokeFunction(accessor => Registry.as<IEditorFactoryRegistry>(EditorExtensions.EditorFactory).start(accessor));
		instantiationService.stub(IAuxiliaryWindowService, new class extends mock<IAuxiliaryWindowService>() { override getWindow() { return undefined; } }());
		const parts = await createEditorParts(instantiationService, disposables);
		instantiationService.stub(IEditorGroupsService, parts);

		// The main part renders into the main window, like the other parts of the test
		const mainContainer = parts.testMainPart.getContainer()!;
		mainWindow.document.body.appendChild(mainContainer);
		disposables.add({ dispose: () => mainContainer.remove() });

		return { instantiationService, parts };
	}

	function createOwnedPart(instantiationService: IInstantiationService, parts: TestEditorParts): TestOwnedEditorPart {
		const container = mainWindow.document.createElement('div');
		mainWindow.document.body.appendChild(container);
		disposables.add({ dispose: () => container.remove() });

		const part = disposables.add(instantiationService.createInstance(TestOwnedEditorPart, parts));
		disposables.add(parts.registerPart(part));
		part.create(container);
		part.layout(400, 300, 0, 0);

		return part;
	}

	function focusIn(element: HTMLElement): HTMLElement {
		const focusable = element.appendChild(mainWindow.document.createElement('div'));
		focusable.tabIndex = 0;
		focusable.focus();

		return focusable;
	}

	test('several parts in one window: an element resolves to the closest part containing it', async () => {
		const { instantiationService, parts } = await createServices();
		const partA = createOwnedPart(instantiationService, parts);
		const partB = createOwnedPart(instantiationService, parts);

		const inMain = parts.testMainPart.getContainer()!.appendChild(mainWindow.document.createElement('div'));
		const inA = partA.getContainer()!.appendChild(mainWindow.document.createElement('div'));
		const inB = partB.getContainer()!.appendChild(mainWindow.document.createElement('div'));

		assert.deepStrictEqual({
			main: parts.getPart(inMain) === parts.mainPart,
			a: parts.getPart(inA) === partA,
			b: parts.getPart(inB) === partB,
			rootOfA: parts.getPart(partA.getContainer()!) === partA,
			groupOfB: parts.getPart(partB.activeGroup.id) === partB
		}, { main: true, a: true, b: true, rootOfA: true, groupOfB: true });
	});

	test('the active part of a window is the part with focus, else the main part of the window', async () => {
		const { instantiationService, parts } = await createServices();
		const partA = createOwnedPart(instantiationService, parts);
		const partB = createOwnedPart(instantiationService, parts);

		const outside = mainWindow.document.body.appendChild(mainWindow.document.createElement('div'));
		disposables.add({ dispose: () => outside.remove() });

		const nameOf = (part: EditorPart) => part === parts.mainPart ? 'main' : part === partA ? 'a' : part === partB ? 'b' : 'other';
		const activePartWithFocusIn = (element: HTMLElement) => {
			focusIn(element);
			return nameOf(parts.activePart);
		};

		const focusInA = activePartWithFocusIn(partA.getContainer()!);
		const focusInB = activePartWithFocusIn(partB.getContainer()!);
		const focusInNoPart = activePartWithFocusIn(outside); // even after B was the active part last
		const focusInMain = activePartWithFocusIn(parts.testMainPart.getContainer()!);

		assert.deepStrictEqual({ focusInA, focusInB, focusInNoPart, focusInMain }, { focusInA: 'a', focusInB: 'b', focusInNoPart: 'main', focusInMain: 'main' });
	});

	test('a modal part stays the active part while it was the last active part, also with focus in no part', async () => {
		const { instantiationService, parts } = await createServices();
		createOwnedPart(instantiationService, parts);

		const outside = mainWindow.document.body.appendChild(mainWindow.document.createElement('div'));
		disposables.add({ dispose: () => outside.remove() });

		const modalPart = await parts.createModalEditorPart();
		modalPart.activeGroup.focus();
		focusIn(outside);

		const modalIsActive = (parts.activePart as IEditorPart) === modalPart;

		await modalPart.close();

		assert.deepStrictEqual({ modalIsActive, mainIsActiveAfterClose: parts.activePart === parts.mainPart }, { modalIsActive: true, mainIsActiveAfterClose: true });
	});

	test('owned parts are not part of the persisted state, labels or working sets', async () => {
		const { instantiationService, parts } = await createServices();
		const owned = createOwnedPart(instantiationService, parts);
		owned.activeGroup.focus();

		const workingSet = parts.saveWorkingSet('test');
		const applied = await parts.applyWorkingSet(workingSet);

		assert.deepStrictEqual({
			applied,
			ownedStaysRegistered: parts.parts.includes(owned),
			ownedGroupStays: owned.groups.length === 1,
			hasRestorableState: parts.hasRestorableState === parts.testMainPart.hasRestorableState
		}, { applied: true, ownedStaysRegistered: true, ownedGroupStays: true, hasRestorableState: true });

		parts.deleteWorkingSet(workingSet);
	});
});
