/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { constObservable } from '../../../../../base/common/observable.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { MockContextKeyService } from '../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { Menus } from '../../../../browser/menus.js';
import { ICustomViewDescriptor } from '../../../../services/customView/browser/customView.js';
import { ICustomViewService } from '../../../../services/customView/browser/customViewService.js';
import { IPinnedCanvas, IPinnedCanvasService, PINNED_CANVAS_PAGE_ID } from '../../browser/pinnedCanvases.js';
import { PinnedCanvasPageContribution } from '../../electron-browser/pinnedCanvasPage.js';

suite('PinnedCanvasPageContribution', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('registers the canvas page with icon-only header actions, without restoring it, accepting only existing pins', () => {
		const registrations: { readonly descriptor: ICustomViewDescriptor; readonly restore: boolean | undefined }[] = [];
		const instantiationService = store.add(new TestInstantiationService());
		instantiationService.stub(ICustomViewService, upcastPartial<ICustomViewService>({
			registerCustomView: (descriptor, options) => {
				registrations.push({ descriptor, restore: options?.restore });
				return Disposable.None;
			},
		}));
		instantiationService.stub(IPinnedCanvasService, upcastPartial<IPinnedCanvasService>({
			entries: constObservable([upcastPartial<IPinnedCanvas>({ id: 'plan' })]),
			selected: constObservable(undefined),
		}));
		instantiationService.stub(IContextKeyService, store.add(new MockContextKeyService()));

		store.add(instantiationService.createInstance(PinnedCanvasPageContribution));

		assert.deepStrictEqual(registrations.map(({ descriptor, restore }) => ({
			id: descriptor.id,
			actions: descriptor.actions,
			restore,
			acceptsState: ['plan', 'removed'].map(pinId => descriptor.acceptsState?.(pinId)),
		})), [{
			id: PINNED_CANVAS_PAGE_ID,
			actions: { style: 'toolbar', menuId: Menus.CustomViewCanvas },
			restore: false,
			acceptsState: [true, false],
		}]);
	});
});
