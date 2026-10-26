/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { constObservable } from '../../../../../base/common/observable.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { MockContextKeyService } from '../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { resolveEditorHeaderSessionScope } from '../../browser/changesView.js';
import { ChatWindowEditorGroupContext, IChatWindow, IChatWindowService } from '../../../../services/chatWindow/browser/chatWindowService.js';
import { ISessionScope } from '../../../../services/sessions/browser/sessionScope.js';
import { IActiveSession } from '../../../../services/sessions/common/sessionsManagement.js';

suite('Editor header session scope', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function resolve(groupId: number | undefined) {
		const mainSession = constObservable(upcastPartial<IActiveSession>({ sessionId: 'main' }));
		const windowSession = constObservable(upcastPartial<IActiveSession>({ sessionId: 'window' }));
		const instantiationService = store.add(new TestInstantiationService());
		instantiationService.stub(ISessionScope, { session: mainSession });
		instantiationService.stub(IContextKeyService, new class extends MockContextKeyService {
			override getContextKeyValue<T>(key: string): T | undefined {
				return (key === ChatWindowEditorGroupContext.key ? groupId : undefined) as T | undefined;
			}
		}());
		instantiationService.stub(IChatWindowService, {
			windows: constObservable([upcastPartial<IChatWindow>({ session: windowSession, editorGroup: { id: 7 } as IChatWindow['editorGroup'] })])
		});
		const scope = instantiationService.invokeFunction(accessor => resolveEditorHeaderSessionScope(accessor));
		return scope.session.get()?.sessionId;
	}

	test('a chat window header shows the session of its window, other headers the host scope', () => {
		assert.deepStrictEqual({ chatWindow: resolve(7), main: resolve(undefined), unknownGroup: resolve(3) }, { chatWindow: 'window', main: 'main', unknownGroup: 'main' });
	});
});
