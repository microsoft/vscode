/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as dom from '../../../../../../base/browser/dom.js';
import { DisposableStore } from '../../../../../../base/common/lifecycle.js';
import { observableValue } from '../../../../../../base/common/observable.js';
import { URI } from '../../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { getSingletonServiceDescriptors } from '../../../../../../platform/instantiation/common/extensions.js';
import { createServices } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IChatPhoneInputPresenter, IChatPhoneInputSessionContext } from '../../../browser/widget/input/chatPhoneInputPresenter.js';

suite('Chat phone input presentation isolation', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function createPresenter() {
		const descriptor = getSingletonServiceDescriptors().find(([id]) => id === IChatPhoneInputPresenter)![1];
		return createServices(store.add(new DisposableStore()), [[IChatPhoneInputPresenter, descriptor.ctor]]).get(IChatPhoneInputPresenter);
	}

	test('defaults do not intercept configuration', async () => {
		const presenter = createPresenter();
		await presenter.showCombinedModeAndModelSheet(dom.$('div'), { kind: 'session', getSessionContext: () => undefined });
		assert.deepStrictEqual({
			enabled: presenter.enabled.get(),
			unified: presenter.supportsUnifiedConfiguration,
		}, { enabled: false, unified: false });
	});

	test('optional behavior follows the registered implementation lifetime and enablement', () => {
		const presenter = createPresenter();
		const enabled = observableValue('enabled', false);
		const registration = store.add(presenter.setImpl({
			enabled,
			supportsUnifiedConfiguration: true,
			showCombinedModeAndModelSheet: async () => { },
		}));
		const snapshot = () => [presenter.enabled.get(), presenter.supportsUnifiedConfiguration];
		const disabled = snapshot();
		enabled.set(true, undefined);
		const active = snapshot();
		registration.dispose();
		assert.deepStrictEqual([disabled, active, snapshot()], [
			[false, false],
			[true, true],
			[false, false],
		]);
	});

	test('model pickers retain provider and advertised chat identity', () => {
		const presenter = createPresenter();
		const context: IChatPhoneInputSessionContext = {
			providerId: 'other-host', sessionId: 'conversation', sessionType: 'custom',
			chatResource: URI.parse('conversation://host/chats/opaque-id'), modelId: 'model',
		};
		let currentContext = context;
		const picker = { getSessionContext: () => currentContext, selectModel: () => true };
		const registration = store.add(presenter.registerSessionModelPicker(picker));
		const matched = presenter.getSessionModelPicker(context) === picker;
		const wrongProvider = presenter.getSessionModelPicker({ ...context, providerId: 'another-host' });
		currentContext = { ...context, chatResource: URI.parse('conversation://host/chats/second') };
		const stale = presenter.getSessionModelPicker(context);
		const switched = presenter.getSessionModelPicker(currentContext) === picker;
		registration.dispose();
		assert.deepStrictEqual({ matched, wrongProvider, stale, switched, removed: presenter.getSessionModelPicker(currentContext) }, {
			matched: true, wrongProvider: undefined, stale: undefined, switched: true, removed: undefined,
		});
	});
});
