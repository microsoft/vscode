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
import { EditorExtensions, IEditorFactoryRegistry } from '../../../../common/editor.js';
import { BeforeAuxiliaryWindowUnloadEvent, IAuxiliaryWindow } from '../../../../services/auxiliaryWindow/browser/auxiliaryWindowService.js';
import { IEditorGroupsService, IEditorPart } from '../../../../services/editor/common/editorGroupsService.js';
import { createEditorParts, workbenchInstantiationService } from '../../../../test/browser/workbenchTestServices.js';
import { ChatWindowPartFactory } from '../../browser/chatWindowPartFactory.js';
import { IChatWindowLook } from '../../browser/chatWindow.js';

suite('Chat window: part factory', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('creates parts like the main part of the window, each with its own id, which close with the window', async () => {
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
		const factory = disposables.add(instantiationService.createInstance(ChatWindowPartFactory, window, new ServiceCollection(), look));

		const isRegistered = (part: IEditorPart) => parts.parts.some(candidate => (candidate as IEditorPart) === part) ? 1 : 0;
		const first = factory.createPart();
		const second = factory.createPart();
		const created = { ids: [first.id, second.id], showTabs: first.part.partOptions.showTabs, registered: isRegistered(first.part) + isRegistered(second.part) };

		let closed = 0;
		disposables.add(first.part.onWillClose(() => closed++));
		disposables.add(second.part.onWillClose(() => closed++));
		second.part.close();
		onUnload.fire();

		assert.deepStrictEqual({ created, closed, registeredAfter: isRegistered(first.part) + isRegistered(second.part) }, {
			created: { ids: ['chatWindow.part.1', 'chatWindow.part.2'], showTabs: 'single', registered: 2 },
			closed: 2,
			registeredAfter: 0
		});
	});
});
