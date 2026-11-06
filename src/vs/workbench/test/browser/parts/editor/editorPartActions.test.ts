/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { mainWindow } from '../../../../../base/browser/window.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { SyncDescriptor } from '../../../../../platform/instantiation/common/descriptors.js';
import { MockScopableContextKeyService } from '../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { IQuickInputService, IQuickPickItem } from '../../../../../platform/quickinput/common/quickInput.js';
import { Registry } from '../../../../../platform/registry/common/platform.js';
import { MoveEditorToPartAction } from '../../../../browser/parts/editor/editorPartActions.js';
import { EditorExtensions, IEditorFactoryRegistry } from '../../../../common/editor.js';
import { SideBySideEditorInput } from '../../../../common/editor/sideBySideEditorInput.js';
import { IAuxiliaryWindowService } from '../../../../services/auxiliaryWindow/browser/auxiliaryWindowService.js';
import { IContentPart, IEditorGroupsService, IEditorPart } from '../../../../services/editor/common/editorGroupsService.js';
import { createEditorParts, registerTestEditor, TestEditorParts, TestFileEditorInput, workbenchInstantiationService } from '../../workbenchTestServices.js';

suite('Editor Part Actions', () => {

	const TEST_EDITOR_ID = 'MyFileEditorForEditorPartActions';
	const TEST_EDITOR_INPUT_ID = 'testEditorInputForEditorPartActions';

	const disposables = new DisposableStore();

	setup(() => {
		disposables.add(registerTestEditor(TEST_EDITOR_ID, [new SyncDescriptor(TestFileEditorInput), new SyncDescriptor(SideBySideEditorInput)], TEST_EDITOR_INPUT_ID));
	});

	teardown(() => {
		disposables.clear();
	});

	ensureNoDisposablesAreLeakedInTestSuite();

	function createPart(parts: TestEditorParts, label: string): IContentPart {
		const container = mainWindow.document.body.appendChild(mainWindow.document.createElement('div'));
		const part = parts.createEditorPart({ container, label });
		part.layout(800, 600, 0, 0);
		disposables.add({ dispose: () => { part.close(); container.remove(); } });

		return part;
	}

	test('Move Editor to Part offers the other parts of the window and moves the active editor into the picked one', async () => {
		const instantiationService = workbenchInstantiationService({ contextKeyService: instantiationService => instantiationService.createInstance(MockScopableContextKeyService) }, disposables);
		instantiationService.invokeFunction(accessor => Registry.as<IEditorFactoryRegistry>(EditorExtensions.EditorFactory).start(accessor));
		instantiationService.stub(IAuxiliaryWindowService, new class extends mock<IAuxiliaryWindowService>() { override getWindow() { return undefined; } }());
		const parts = await createEditorParts(instantiationService, disposables);
		instantiationService.stub(IEditorGroupsService, parts);

		const side = createPart(parts, 'Side');
		const bottom = createPart(parts, 'Bottom');

		let offered: string[] = [];
		instantiationService.stub(IQuickInputService, 'pick', async (picks: (IQuickPickItem & { part: IEditorPart })[]) => {
			offered = picks.map(item => item.label);
			return picks.find(item => item.part === bottom);
		});

		const file = disposables.add(new TestFileEditorInput(URI.file('/file.txt'), TEST_EDITOR_INPUT_ID));
		await side.activeGroup.openEditor(file);
		const focusable = (side.element as HTMLElement).appendChild(mainWindow.document.createElement('div'));
		focusable.tabIndex = 0;
		focusable.focus();

		await instantiationService.invokeFunction(accessor => new MoveEditorToPartAction().run(accessor));

		assert.deepStrictEqual({ offered, inSide: side.activeGroup.contains(file), inBottom: bottom.activeGroup.contains(file) }, {
			offered: ['Part', 'Bottom'], // the main part of the window has no name or editors here
			inSide: false,
			inBottom: true
		});
	});
});
