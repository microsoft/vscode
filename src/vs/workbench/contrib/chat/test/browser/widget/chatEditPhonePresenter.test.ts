/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as dom from '../../../../../../base/browser/dom.js';
import { DisposableStore, toDisposable } from '../../../../../../base/common/lifecycle.js';
import { observableValue } from '../../../../../../base/common/observable.js';
import { URI } from '../../../../../../base/common/uri.js';
import { upcastPartial } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { getSingletonServiceDescriptors } from '../../../../../../platform/instantiation/common/extensions.js';
import { createServices } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IChatEditPhonePresenter } from '../../../browser/widget/chatContentParts/chatEditPhonePresenter.js';
import { IChatTextEditGroup } from '../../../common/model/chatModel.js';
import { IChatResponseViewModel } from '../../../common/model/chatViewModel.js';

suite('ChatEditPhonePresenter isolation', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const uri = URI.parse('test:/edit.ts');
	const edit = upcastPartial<IChatTextEditGroup>({ uri });
	const response = upcastPartial<IChatResponseViewModel>({});
	const diff = { uri, originalURI: undefined, modifiedURI: uri, added: 1, removed: 0 };

	function createPresenter() {
		const descriptor = getSingletonServiceDescriptors().find(([id]) => id === IChatEditPhonePresenter)![1];
		return createServices(store.add(new DisposableStore()), [[IChatEditPhonePresenter, descriptor.ctor]]).get(IChatEditPhonePresenter);
	}

	test('the default does not create edit rows or compare models and declines diff opening', async () => {
		const presenter = createPresenter();
		const row = presenter.renderTextEdit(edit, response, async () => assert.fail('Default presentation must not resolve a compare model'));
		assert.deepStrictEqual({ enabled: presenter.enabled.get(), row, handled: await presenter.openDiff(diff) }, {
			enabled: false, row: undefined, handled: false,
		});
	});

	test('an installed implementation is gated, removable and leaves row lifetime to the caller', async () => {
		const presenter = createPresenter();
		const enabled = observableValue('enabled', false);
		let calls = 0;
		let disposed = false;
		const row = Object.assign(store.add(toDisposable(() => disposed = true)), { domNode: dom.$('div') });
		const registration = store.add(presenter.setImpl({
			enabled,
			renderTextEdit: () => { calls++; return row; },
			openDiff: async () => true,
		}));
		const createModel = async () => assert.fail('The fake row does not need a compare model');
		const disabled = presenter.renderTextEdit(edit, response, createModel);
		enabled.set(true, undefined);
		const active = presenter.renderTextEdit(edit, response, createModel);
		const handled = await presenter.openDiff(diff);
		registration.dispose();
		const removed = presenter.renderTextEdit(edit, response, createModel);
		assert.deepStrictEqual({ disabled, active: active === row, handled, removed, calls, disposed }, {
			disabled: undefined, active: true, handled: true, removed: undefined, calls: 1, disposed: false,
		});
	});
});
