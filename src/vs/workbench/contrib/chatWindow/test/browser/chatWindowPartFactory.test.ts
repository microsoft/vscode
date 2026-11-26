/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { mainWindow } from '../../../../../base/browser/window.js';
import { Emitter } from '../../../../../base/common/event.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { constObservable } from '../../../../../base/common/observable.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ServiceCollection } from '../../../../../platform/instantiation/common/serviceCollection.js';
import { Registry } from '../../../../../platform/registry/common/platform.js';
import { getPartName } from '../../../../browser/parts/editor/editorPartActions.js';
import { EditorExtensions, IEditorFactoryRegistry } from '../../../../common/editor.js';
import { BeforeAuxiliaryWindowUnloadEvent, IAuxiliaryWindow } from '../../../../services/auxiliaryWindow/browser/auxiliaryWindowService.js';
import { IEditorGroupsService, IEditorPart } from '../../../../services/editor/common/editorGroupsService.js';
import { createEditorParts, registerTestEditor, TestFileEditorInput, workbenchInstantiationService } from '../../../../test/browser/workbenchTestServices.js';
import { SyncDescriptor } from '../../../../../platform/instantiation/common/descriptors.js';
import { URI } from '../../../../../base/common/uri.js';
import { ChatWindowPartFactory } from '../../browser/chatWindowPartFactory.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { InstantiationService } from '../../../../../platform/instantiation/common/instantiationService.js';
import { IChatWindowLook } from '../../browser/chatWindow.js';

suite('Chat window: part factory', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('creates parts like the main part of the window, each with its own id and name, which close with the window', async () => {
		const disposables = store.add(new DisposableStore());
		const instantiationService = workbenchInstantiationService(undefined, disposables);
		instantiationService.invokeFunction(accessor => Registry.as<IEditorFactoryRegistry>(EditorExtensions.EditorFactory).start(accessor));
		const parts = await createEditorParts(instantiationService, disposables);
		instantiationService.stub(IEditorGroupsService, parts);

		const onUnload = disposables.add(new Emitter<void>());
		const onBeforeUnload = disposables.add(new Emitter<BeforeAuxiliaryWindowUnloadEvent>());
		const windowContainer = mainWindow.document.body.appendChild(mainWindow.document.createElement('div'));
		disposables.add({ dispose: () => windowContainer.remove() });
		const window = new class extends mock<IAuxiliaryWindow>() {
			override readonly window = mainWindow as IAuxiliaryWindow['window'];
			override readonly container = windowContainer;
			override readonly onUnload = onUnload.event;
			override readonly onBeforeUnload = onBeforeUnload.event;
		}();
		const look: IChatWindowLook = { gap: constObservable(0), mainPartOptions: constObservable({ showTabs: 'single' }) };
		const factory = disposables.add(instantiationService.createInstance(ChatWindowPartFactory, window, new ServiceCollection(), look, () => false));

		const isRegistered = (part: IEditorPart) => parts.parts.some(candidate => (candidate as IEditorPart) === part) ? 1 : 0;
		const first = factory.createPart();
		const second = factory.createPart();
		const created = { ids: [first.id, second.id], names: [getPartName(first.part), getPartName(second.part)], showTabs: first.part.partOptions.showTabs, registered: isRegistered(first.part) + isRegistered(second.part) };

		let closed = 0;
		disposables.add(first.part.onWillClose(() => closed++));
		disposables.add(second.part.onWillClose(() => closed++));
		second.part.close();
		onUnload.fire();

		assert.deepStrictEqual({ created, closed, registeredAfter: isRegistered(first.part) + isRegistered(second.part) }, {
			created: { ids: ['chatWindow.part.1', 'chatWindow.part.2'], names: ['Editor 2', 'Editor 3'], showTabs: 'single', registered: 2 },
			closed: 2,
			registeredAfter: 0
		});
	});

	test('a part that closes leaves the services of the window, created from the same services, working', async () => {
		const disposables = store.add(new DisposableStore());
		const testInstantiationService = workbenchInstantiationService(undefined, disposables);
		testInstantiationService.invokeFunction(accessor => Registry.as<IEditorFactoryRegistry>(EditorExtensions.EditorFactory).start(accessor));
		// Instantiation services that dispose as the workbench's do, which those of the test services do not
		const instantiationService = disposables.add(new InstantiationService(new ServiceCollection(), false, testInstantiationService));
		const parts = await createEditorParts(instantiationService, disposables);
		testInstantiationService.stub(IEditorGroupsService, parts);

		const windowContainer = mainWindow.document.body.appendChild(mainWindow.document.createElement('div'));
		disposables.add({ dispose: () => windowContainer.remove() });
		const window = new class extends mock<IAuxiliaryWindow>() {
			override readonly window = mainWindow as IAuxiliaryWindow['window'];
			override readonly container = windowContainer;
			override readonly onUnload = disposables.add(new Emitter<void>()).event;
			override readonly onBeforeUnload = disposables.add(new Emitter<BeforeAuxiliaryWindowUnloadEvent>()).event;
		}();
		// The services of the window, which its own and every part of it are created with
		const services = new ServiceCollection();
		const windowInstantiationService = disposables.add(instantiationService.createChild(services));
		const look: IChatWindowLook = { gap: constObservable(0), mainPartOptions: constObservable({ showTabs: 'single' }) };
		const factory = disposables.add(instantiationService.createInstance(ChatWindowPartFactory, window, services, look, () => false));

		const created = factory.createPart();
		created.part.close();

		// What the window creates next, such as its title bar's actions as its layout changes, gets the window's
		const injected = windowInstantiationService.invokeFunction(accessor => accessor.get(IInstantiationService));

		assert.strictEqual(injected, windowInstantiationService);
	});

	test('a chat that cannot leave the window does not keep it from closing from a part it created, which the window releases as it unloads', async () => {
		const disposables = store.add(new DisposableStore());
		const instantiationService = workbenchInstantiationService(undefined, disposables);
		instantiationService.invokeFunction(accessor => Registry.as<IEditorFactoryRegistry>(EditorExtensions.EditorFactory).start(accessor));
		disposables.add(registerTestEditor('chatWindowPartFactoryTestEditor', [new SyncDescriptor(TestFileEditorInput)], 'chatWindowPartFactoryTestInput'));
		const parts = await createEditorParts(instantiationService, disposables);
		instantiationService.stub(IEditorGroupsService, parts);

		const onUnload = disposables.add(new Emitter<void>());
		const onBeforeUnload = disposables.add(new Emitter<BeforeAuxiliaryWindowUnloadEvent>());
		const windowContainer = mainWindow.document.body.appendChild(mainWindow.document.createElement('div'));
		disposables.add({ dispose: () => windowContainer.remove() });
		const window = new class extends mock<IAuxiliaryWindow>() {
			override readonly window = mainWindow as IAuxiliaryWindow['window'];
			override readonly container = windowContainer;
			override readonly onUnload = onUnload.event;
			override readonly onBeforeUnload = onBeforeUnload.event;
		}();
		const chat = disposables.add(new TestFileEditorInput(URI.file('/chat'), 'chatWindowPartFactoryTestInput'));
		chat.canMove = () => 'cannot leave';
		const look: IChatWindowLook = { gap: constObservable(0) };
		const factory = instantiationService.createInstance(ChatWindowPartFactory, window, new ServiceCollection(), look, editor => editor === chat);
		// As the window does, it lets go of the factory as it unloads, from a listener added before the factory created any part
		disposables.add(onUnload.event(() => factory.dispose()));
		disposables.add(factory);

		const { part } = factory.createPart();
		await part.activeGroup.openEditor(chat, { pinned: true });
		const vetoes: string[] = [];
		onBeforeUnload.fire({ veto: (reason: string | true) => { if (typeof reason === 'string') { vetoes.push(reason); } } } as never);
		onUnload.fire();

		assert.deepStrictEqual({ vetoes, registered: parts.parts.some(candidate => (candidate as IEditorPart) === part) }, { vetoes: [], registered: false });
	});
});
