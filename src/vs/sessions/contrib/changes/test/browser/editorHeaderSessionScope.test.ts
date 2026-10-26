/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { constObservable, observableValue } from '../../../../../base/common/observable.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ContextKeyService } from '../../../../../platform/contextkey/browser/contextKeyService.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { resolveEditorHeaderSessionScope } from '../../browser/changesView.js';
import { ChatWindowEditorGroupContext, IChatWindow, IChatWindowService } from '../../../../services/chatWindow/browser/chatWindowService.js';
import { ISessionScope } from '../../../../services/sessions/browser/sessionScope.js';
import { IActiveSession } from '../../../../services/sessions/common/sessionsManagement.js';

suite('Editor header session scope', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('a chat window header follows the session of its window, other headers the host scope', () => {
		const mainSession = constObservable(upcastPartial<IActiveSession>({ sessionId: 'main' }));
		const windowSession = observableValue<IActiveSession | undefined>('windowSession', upcastPartial<IActiveSession>({ sessionId: 'window' }));
		const root = store.add(new ContextKeyService(new TestConfigurationService()));
		const windowKeys = store.add(root.createScoped(document.createElement('div')));
		ChatWindowEditorGroupContext.bindTo(windowKeys).set(7);
		const mainKeys = store.add(root.createScoped(document.createElement('div')));

		const resolve = (keys: IContextKeyService) => {
			const instantiationService = store.add(new TestInstantiationService());
			instantiationService.stub(IConfigurationService, new TestConfigurationService());
			instantiationService.stub(ISessionScope, { session: mainSession });
			instantiationService.stub(IContextKeyService, keys);
			instantiationService.stub(IChatWindowService, {
				windows: constObservable([upcastPartial<IChatWindow>({ session: windowSession, editorGroup: { id: 7 } as IChatWindow['editorGroup'] })])
			});
			return instantiationService.invokeFunction(accessor => resolveEditorHeaderSessionScope(accessor));
		};

		const chatWindowScope = resolve(windowKeys);
		const before = chatWindowScope.session.get()?.sessionId;
		windowSession.set(upcastPartial<IActiveSession>({ sessionId: 'window2' }), undefined);
		assert.deepStrictEqual({ before, after: chatWindowScope.session.get()?.sessionId, main: resolve(mainKeys).session.get()?.sessionId }, { before: 'window', after: 'window2', main: 'main' });
	});
});
