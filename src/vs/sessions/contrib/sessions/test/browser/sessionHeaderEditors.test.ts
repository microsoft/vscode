/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { mainWindow } from '../../../../../base/browser/window.js';
import { timeout } from '../../../../../base/common/async.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IContextViewDelegate, IContextViewService, IOpenContextView } from '../../../../../platform/contextview/browser/contextView.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ISessionCollection, ISessionCollectionsService } from '../../../../services/sessions/browser/sessionCollectionsService.js';
import { SessionPaletteColor } from '../../../../services/sessions/common/sessionColors.js';
import { SessionHeaderEditors } from '../../browser/views/sessionHeaderEditors.js';

suite('SessionHeaderEditors', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('closes on a click outside the popover, but not on the click that opened it', async () => {
		let delegate: IContextViewDelegate | undefined;
		let closeCount = 0;
		const instantiationService = store.add(new TestInstantiationService());
		instantiationService.stub(IContextViewService, new class extends mock<IContextViewService>() {
			override showContextView(contextViewDelegate: IContextViewDelegate): IOpenContextView {
				delegate = contextViewDelegate;
				return {
					close: () => {
						closeCount++;
						contextViewDelegate.onHide?.();
					}
				};
			}
		});
		instantiationService.stub(ISessionCollectionsService, new class extends mock<ISessionCollectionsService>() { });
		const editors = store.add(instantiationService.createInstance(SessionHeaderEditors));
		const anchor = mainWindow.document.createElement('div');

		editors.showHeaderEditor({ anchor, target: { sectionId: 'pinned', kind: 'section', label: 'Pinned' } });
		delegate?.onDOMEvent?.(new MouseEvent('click'), anchor);
		const afterOpeningClick = editors.isOpen;
		await timeout(0);
		delegate?.onDOMEvent?.(new KeyboardEvent('keydown'), anchor);
		const afterKeydown = editors.isOpen;
		delegate?.onDOMEvent?.(new MouseEvent('click'), anchor);

		assert.deepStrictEqual({ afterOpeningClick, afterKeydown, afterOutsideClick: editors.isOpen, closeCount }, {
			afterOpeningClick: true,
			afterKeydown: true,
			afterOutsideClick: false,
			closeCount: 1,
		});
	});

	test('a new collection popover stays at the anchor that was detached by creating the collection', () => {
		let delegate: IContextViewDelegate | undefined;
		const anchor = mainWindow.document.createElement('button');
		anchor.style.cssText = 'position: fixed; left: 120px; top: 40px; width: 20px; height: 20px;';
		mainWindow.document.body.appendChild(anchor);
		const instantiationService = store.add(new TestInstantiationService());
		instantiationService.stub(IContextViewService, new class extends mock<IContextViewService>() {
			override showContextView(contextViewDelegate: IContextViewDelegate): IOpenContextView {
				delegate = contextViewDelegate;
				return { close: () => contextViewDelegate.onHide?.() };
			}
		});
		instantiationService.stub(ISessionCollectionsService, new class extends mock<ISessionCollectionsService>() {
			override createCollection(): ISessionCollection {
				// The switcher re-renders when a collection is added.
				anchor.remove();
				return { id: 'new', name: 'Collection 2', icon: 'graph', color: SessionPaletteColor.Red };
			}
		});
		const editors = store.add(instantiationService.createInstance(SessionHeaderEditors));

		editors.showCollectionEditor({ anchor });
		const resolved = delegate?.getAnchor();
		editors.close();

		assert.deepStrictEqual(resolved, { x: 120, y: 40, width: 20, height: 20 });
	});
});
