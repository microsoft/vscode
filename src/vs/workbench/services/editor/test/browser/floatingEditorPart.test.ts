/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Emitter } from '../../../../../base/common/event.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IDimension } from '../../../../../base/browser/dom.js';
import { mainWindow } from '../../../../../base/browser/window.js';
import { SyncDescriptor } from '../../../../../platform/instantiation/common/descriptors.js';
import { MockScopableContextKeyService } from '../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { Registry } from '../../../../../platform/registry/common/platform.js';
import { EditorExtensions, IEditorFactoryRegistry } from '../../../../common/editor.js';
import { SideBySideEditorInput } from '../../../../common/editor/sideBySideEditorInput.js';
import { createEditorParts, registerTestEditor, TestEditorParts, TestFileEditorInput, TestLayoutService, workbenchInstantiationService } from '../../../../test/browser/workbenchTestServices.js';
import { IWorkbenchLayoutService } from '../../../layout/browser/layoutService.js';
import { IAuxiliaryWindowService } from '../../../auxiliaryWindow/browser/auxiliaryWindowService.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { IEditorGroupsService, IEditorPart, IFloatingEditorPart } from '../../common/editorGroupsService.js';

class TestFloatingEditorPartLayoutService extends TestLayoutService {

	private readonly _onDidLayoutMainContainer = new Emitter<IDimension>();
	override onDidLayoutMainContainer = this._onDidLayoutMainContainer.event;

	override mainContainer = mainWindow.document.createElement('div');

	resizeMainContainer(dimension: IDimension): void {
		this.mainContainerDimension = dimension;
		this._onDidLayoutMainContainer.fire(dimension);
	}

	dispose(): void {
		this._onDidLayoutMainContainer.dispose();
	}
}

suite('Floating Editor Part', () => {

	const TEST_EDITOR_ID = 'MyFileEditorForFloatingEditorPart';
	const TEST_EDITOR_INPUT_ID = 'testEditorInputForFloatingEditorPart';

	const disposables = new DisposableStore();

	setup(() => {
		disposables.add(registerTestEditor(TEST_EDITOR_ID, [new SyncDescriptor(TestFileEditorInput), new SyncDescriptor(SideBySideEditorInput)], TEST_EDITOR_INPUT_ID));
	});

	teardown(() => {
		disposables.clear();
	});

	ensureNoDisposablesAreLeakedInTestSuite();

	async function createParts(): Promise<{ parts: TestEditorParts; layoutService: TestFloatingEditorPartLayoutService }> {
		const instantiationService = workbenchInstantiationService({ contextKeyService: instantiationService => instantiationService.createInstance(MockScopableContextKeyService) }, disposables);
		const layoutService = disposables.add(new TestFloatingEditorPartLayoutService());
		instantiationService.stub(IWorkbenchLayoutService, layoutService);
		instantiationService.stub(IAuxiliaryWindowService, upcastPartial<IAuxiliaryWindowService>({ getWindow: () => undefined }));
		instantiationService.invokeFunction(accessor => Registry.as<IEditorFactoryRegistry>(EditorExtensions.EditorFactory).start(accessor));
		const parts = await createEditorParts(instantiationService, disposables);
		instantiationService.stub(IEditorGroupsService, parts);

		return { parts, layoutService };
	}

	function isRegistered(parts: TestEditorParts, part: IEditorPart): boolean {
		const registered: readonly IEditorPart[] = parts.parts;
		return registered.includes(part);
	}

	function createTestFileEditorInput(resource: URI): TestFileEditorInput {
		return disposables.add(new TestFileEditorInput(resource, TEST_EDITOR_INPUT_ID));
	}

	function getElements(layoutService: TestFloatingEditorPartLayoutService): HTMLElement[] {
		return [...layoutService.mainContainer.querySelectorAll<HTMLElement>('.monaco-floating-editor-part')];
	}

	function getElementSize(element: HTMLElement): IDimension {
		return { width: parseInt(element.style.width), height: parseInt(element.style.height) };
	}

	test('creates parts in the main window, each with its own id, accessible name and instantiation service', async () => {
		const { parts, layoutService } = await createParts();

		const part1 = await parts.createFloatingEditorPart({ title: 'First' });
		const part2 = await parts.createFloatingEditorPart({ title: 'Second' });
		const elements = getElements(layoutService);
		const describe = (part: IFloatingEditorPart, other: IFloatingEditorPart, element: HTMLElement) => {
			const region = element.querySelector('[role="region"]')!;
			return {
				registered: isRegistered(parts, part),
				windowId: part.windowId === parts.mainPart.windowId,
				ownInstantiationService: parts.getScopedInstantiationService(part) !== parts.getScopedInstantiationService(other),
				accessibleName: element.querySelector(`#${region.getAttribute('aria-labelledby')}`)?.textContent,
			};
		};

		assert.deepStrictEqual({
			parts: [describe(part1, part2, elements[0]), describe(part2, part1, elements[1])],
			distinctIds: elements[0].querySelector('[role="region"]')!.getAttribute('aria-labelledby') !== elements[1].querySelector('[role="region"]')!.getAttribute('aria-labelledby'),
		}, {
			parts: [
				{ registered: true, windowId: true, ownInstantiationService: true, accessibleName: 'First' },
				{ registered: true, windowId: true, ownInstantiationService: true, accessibleName: 'Second' },
			],
			distinctIds: true,
		});

		part1.close();
		part2.close();
		assert.deepStrictEqual({ registered: parts.parts.length, elements: getElements(layoutService).length }, { registered: 1, elements: 0 });
	});

	test('takes its default size, or the given size kept within the main window', async () => {
		const { parts, layoutService } = await createParts();

		const defaultPart = await parts.createFloatingEditorPart({ title: 'Default' });
		const defaultSize = { stored: defaultPart.size, shown: getElementSize(getElements(layoutService)[0]) };
		defaultPart.close();

		const largePart = await parts.createFloatingEditorPart({ title: 'Large', size: { width: 2000, height: 2000 } });
		const largeElement = getElements(layoutService)[0];
		const large = { stored: largePart.size, shown: getElementSize(largeElement) };
		layoutService.resizeMainContainer({ width: 3000, height: 3000 });
		const largeInLargerWindow = getElementSize(largeElement);
		largePart.close();

		assert.deepStrictEqual({ defaultSize, large, largeInLargerWindow }, {
			// The main window of the test layout service is 800x600
			defaultSize: { stored: { width: 400, height: 450 }, shown: { width: 400, height: 450 } },
			large: { stored: { width: 2000, height: 2000 }, shown: { width: 768, height: 568 } },
			largeInLargerWindow: { width: 2000, height: 2000 },
		});
	});

	test('resetSize takes the default size, without reporting a size the user resized to', async () => {
		const { parts, layoutService } = await createParts();
		const part = await parts.createFloatingEditorPart({ title: 'Floating', size: { width: 300, height: 300 } });
		const sizeChanges: IDimension[] = [];
		disposables.add(part.onDidChangeSize(size => sizeChanges.push(size)));

		part.resetSize();
		layoutService.resizeMainContainer({ width: 1000, height: 800 });

		assert.deepStrictEqual({ stored: part.size, shown: getElementSize(getElements(layoutService)[0]), sizeChanges }, {
			stored: { width: 400, height: 450 },
			shown: { width: 400, height: 450 },
			sizeChanges: [],
		});

		part.close();
	});

	test('close moves editors that need confirmation to the main part and closes the others', async () => {
		const { parts } = await createParts();
		const part = await parts.createFloatingEditorPart({ title: 'Floating' });
		const dirty = createTestFileEditorInput(URI.file('dirty'));
		dirty.dirty = true;
		const clean = createTestFileEditorInput(URI.file('clean'));
		await part.activeGroup.openEditors([{ editor: dirty, options: { pinned: true } }, { editor: clean, options: { pinned: true } }]);
		let willClose = 0;
		let willDispose = 0;
		disposables.add(part.onWillClose(() => willClose++));
		disposables.add(part.onWillDispose(() => willDispose++));

		const closed = part.close();

		assert.deepStrictEqual({
			closed,
			willClose,
			willDispose,
			registered: isRegistered(parts, part),
			mainEditors: parts.mainPart.activeGroup.editors.map(editor => editor.resource?.path),
		}, {
			closed: true,
			willClose: 1,
			willDispose: 1,
			registered: false,
			mainEditors: ['/dirty'],
		});

		dirty.dirty = false;
		await parts.mainPart.activeGroup.closeAllEditors();
	});

	test('working sets leave the part and its editors alone', async () => {
		const { parts } = await createParts();
		const part = await parts.createFloatingEditorPart({ title: 'Floating' });
		await parts.mainPart.activeGroup.openEditor(createTestFileEditorInput(URI.file('main')), { pinned: true });
		await part.activeGroup.openEditor(createTestFileEditorInput(URI.file('floating')), { pinned: true });
		const describe = () => ({
			registered: isRegistered(parts, part),
			mainEditors: parts.mainPart.activeGroup.editors.map(editor => editor.resource?.path),
			floatingEditors: part.activeGroup.editors.map(editor => editor.resource?.path),
		});

		const workingSet = parts.saveWorkingSet('test');
		await parts.applyWorkingSet('empty');
		const afterEmpty = describe();
		await parts.applyWorkingSet(workingSet);
		const afterRestore = describe();

		assert.deepStrictEqual({ afterEmpty, afterRestore }, {
			afterEmpty: { registered: true, mainEditors: [], floatingEditors: ['/floating'] },
			afterRestore: { registered: true, mainEditors: ['/main'], floatingEditors: ['/floating'] },
		});

		parts.deleteWorkingSet(workingSet);
		part.close();
		await parts.mainPart.activeGroup.closeAllEditors();
	});
	test('the editor part follows the height of the header, which it does not measure on every layout', async () => {
		const { parts, layoutService } = await createParts();
		mainWindow.document.body.appendChild(layoutService.mainContainer); // laid out, so the header has a height
		disposables.add({ dispose: () => layoutService.mainContainer.remove() });
		const part = await parts.createFloatingEditorPart({ title: 'Floating', size: { width: 300, height: 300 } });
		const editorPart = parts.parts.find(candidate => candidate === part)!;
		const header = getElements(layoutService)[0].querySelector<HTMLElement>('.floating-editor-header')!;
		const nextFrames = () => new Promise<void>(resolve => mainWindow.requestAnimationFrame(() => mainWindow.requestAnimationFrame(() => resolve())));
		const describe = () => ({ header: header.offsetHeight, editorHeight: editorPart.contentDimension.height });

		const initial = describe();
		header.style.height = `${initial.header + 20}px`;
		await nextFrames(); // the resize observer of the header
		const taller = describe();
		layoutService.resizeMainContainer({ width: 1000, height: 900 });
		const afterMainLayout = describe();

		assert.deepStrictEqual({ initial, taller, afterMainLayout }, {
			initial: { header: initial.header, editorHeight: 300 - 2 - initial.header },
			taller: { header: initial.header + 20, editorHeight: 300 - 2 - initial.header - 20 },
			afterMainLayout: { header: initial.header + 20, editorHeight: 300 - 2 - initial.header - 20 },
		});

		part.close();
	});
});
